import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { Text, Button, Card, ActivityIndicator } from 'react-native-paper';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { parseVoiceReport, checkServerStatus } from '../services/api';

const MAX_DURATION_SECONDS = 60;

// Voz en AAC mono 16 kHz / 32 kbps dentro de .m4a: ~240 KB por minuto y un formato
// que Gemini acepta como audio/mp4. (El preset LOW_QUALITY graba .3gp/AMR en Android
// y .caf en iOS, que no corresponden al MIME audio/mp4 que enviamos.)
const VOICE_RECORDING_OPTIONS = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 16000,
  },
};

const AudioRecorder = ({ onParsedData, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text: '' }

  // Referencias para grabación móvil y web
  const nativeRecordingRef = useRef(null);
  const webMediaRecorderRef = useRef(null);
  const webAudioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animación pulsante durante la grabación
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // Limpiar temporizadores y recursos al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (nativeRecordingRef.current) {
        try {
          nativeRecordingRef.current.stopAndUnloadAsync();
        } catch (_) {}
      }
    };
  }, []);

  const startTimer = () => {
    setRecordSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordSeconds((prev) => {
        if (prev + 1 >= MAX_DURATION_SECONDS) {
          stopRecording();
          return MAX_DURATION_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    setFeedback(null);
    // Despertar la Cloud Function mientras el usuario habla, para que el arranque
    // en frío (varios segundos) no se sume a la espera al enviar el audio.
    checkServerStatus().catch(() => {});
    try {
      if (Platform.OS === 'web') {
        if (!navigator?.mediaDevices?.getUserMedia) {
          const msg = 'Tu navegador no tiene soporte para micrófono.';
          setFeedback({ type: 'error', text: msg });
          onError && onError(msg);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        let chosenMime = 'audio/webm';
        if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('audio/webm')) {
            chosenMime = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            chosenMime = 'audio/mp4';
          }
        }

        const mediaRecorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime, audioBitsPerSecond: 16000 } : undefined);
        webAudioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            webAudioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const actualMime = mediaRecorder.mimeType ? mediaRecorder.mimeType.split(';')[0] : chosenMime;
          const audioBlob = new Blob(webAudioChunksRef.current, { type: actualMime });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Data = reader.result;
            processAudio(base64Data, actualMime);
          };
        };

        webMediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(1000); // Fragmentos cada 1s (menos overhead que 250ms)
      } else {
        // En Android / iOS
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
          const msg = 'Se requiere permiso de micrófono para grabar.';
          setFeedback({ type: 'error', text: msg });
          onError && onError(msg);
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(VOICE_RECORDING_OPTIONS);
        nativeRecordingRef.current = recording;
      }

      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error('Error al iniciar grabación:', err);
      const msg = 'No se pudo acceder al micrófono: ' + (err.message || err);
      setFeedback({ type: 'error', text: msg });
      onError && onError(msg);
      stopTimer();
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    stopTimer();
    setIsRecording(false);

    try {
      if (Platform.OS === 'web') {
        if (webMediaRecorderRef.current && webMediaRecorderRef.current.state !== 'inactive') {
          webMediaRecorderRef.current.stop();
        }
      } else {
        const recording = nativeRecordingRef.current;
        if (!recording) return;

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        nativeRecordingRef.current = null;

        if (uri) {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const fullDataUrl = `data:audio/mp4;base64,${base64}`;
          processAudio(fullDataUrl, 'audio/mp4');
        }
      }
    } catch (err) {
      console.error('Error al detener grabación:', err);
      const msg = 'Error al guardar audio: ' + (err.message || err);
      setFeedback({ type: 'error', text: msg });
      onError && onError(msg);
    }
  };

  const cancelRecording = async () => {
    stopTimer();
    setIsRecording(false);
    setRecordSeconds(0);

    try {
      if (Platform.OS === 'web') {
        if (webMediaRecorderRef.current && webMediaRecorderRef.current.state !== 'inactive') {
          webMediaRecorderRef.current.stop();
          webAudioChunksRef.current = [];
        }
      } else if (nativeRecordingRef.current) {
        await nativeRecordingRef.current.stopAndUnloadAsync();
        nativeRecordingRef.current = null;
      }
    } catch (_) {}
  };

  const processAudio = async (base64Audio, mimeType) => {
    setIsProcessing(true);
    setFeedback(null);
    try {
      console.log('📡 Enviando nota de voz al servidor (MIME:', mimeType, ')...');
      const response = await parseVoiceReport(base64Audio, mimeType);

      if (response.data && response.data.success && response.data.data) {
        setFeedback({
          type: 'success',
          text: '✨ ¡Ticket autocompletado con éxito por la IA!',
        });
        onParsedData && onParsedData(response.data.data, base64Audio);
      } else {
        const msg = 'La IA no pudo interpretar el audio. Por favor intenta hablar más cerca.';
        setFeedback({ type: 'error', text: msg });
        onError && onError(msg);
      }
    } catch (err) {
      console.error('Error al procesar audio en servidor:', err);
      const msg =
        err.response?.data?.details ||
        err.response?.data?.error ||
        err.message ||
        'Error de comunicación con el servidor.';
      setFeedback({ type: 'error', text: 'Error: ' + msg });
      onError && onError('Error al procesar con IA: ' + msg);
    } finally {
      setIsProcessing(false);
      setRecordSeconds(0);
    }
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>🎙️ Reporte por Voz con IA</Text>
            <Text style={styles.subtitle}>
              Graba lo ocurrido y la IA categorizará el ticket automáticamente.
            </Text>
          </View>
        </View>

        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator animating={true} size="large" color="#2e7d32" />
            <Text style={styles.processingText}>
              🧠 Escuchando audio y autocompletando ticket...
            </Text>
          </View>
        ) : isRecording ? (
          <View style={styles.recordingContainer}>
            <View style={styles.timerRow}>
              <Animated.View
                style={[
                  styles.recordingDot,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              />
              <Text style={styles.timerText}>{formatTime(recordSeconds)}</Text>
              <Text style={styles.maxText}>/ 01:00</Text>
            </View>
            <Text style={styles.hintText}>
              Menciona el predio, lugar y qué ocurrió...
            </Text>

            <View style={styles.recordingButtonsRow}>
              <Button
                mode="text"
                textColor="#d32f2f"
                icon="close"
                onPress={cancelRecording}
                style={styles.cancelButton}
              >
                Cancelar
              </Button>
              <Button
                mode="contained"
                buttonColor="#d32f2f"
                icon="stop"
                onPress={stopRecording}
                style={styles.stopButton}
              >
                Detener y Procesar
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.idleContainer}>
            <Button
              mode="contained-tonal"
              icon="microphone"
              buttonColor="#e8f5e9"
              textColor="#1b5e20"
              style={styles.recordButton}
              labelStyle={styles.recordButtonLabel}
              onPress={startRecording}
            >
              Presiona para Hablar
            </Button>
          </View>
        )}

        {feedback && (
          <View
            style={[
              styles.feedbackBanner,
              feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
            ]}
          >
            <Text
              style={[
                styles.feedbackText,
                feedback.type === 'success' ? styles.feedbackTextSuccess : styles.feedbackTextError,
              ]}
            >
              {feedback.text}
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#81c784',
    elevation: 3,
    shadowColor: '#2e7d32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  content: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  headerRow: {
    marginBottom: 10,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b5e20',
  },
  subtitle: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
  idleContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  recordButton: {
    width: '100%',
    paddingVertical: 4,
    borderRadius: 8,
  },
  recordButtonLabel: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  recordingContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#d32f2f',
    marginRight: 8,
  },
  timerText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#d32f2f',
  },
  maxText: {
    fontSize: 14,
    color: '#777',
    marginLeft: 4,
  },
  hintText: {
    fontSize: 13,
    color: '#333',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  recordingButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
  },
  stopButton: {
    flex: 2,
    borderRadius: 8,
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  processingText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#2e7d32',
    textAlign: 'center',
  },
  feedbackBanner: {
    marginTop: 10,
    padding: 8,
    borderRadius: 6,
  },
  feedbackSuccess: {
    backgroundColor: '#e8f5e9',
  },
  feedbackError: {
    backgroundColor: '#ffebee',
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  feedbackTextSuccess: {
    color: '#2e7d32',
  },
  feedbackTextError: {
    color: '#c62828',
  },
});

export default AudioRecorder;

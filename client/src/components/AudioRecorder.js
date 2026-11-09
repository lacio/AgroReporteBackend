import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { Text, Button, Card, ActivityIndicator, IconButton } from 'react-native-paper';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const MAX_DURATION_SECONDS = 60;

const AudioRecorder = ({ onParsedData, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

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
    try {
      if (Platform.OS === 'web') {
        if (!navigator?.mediaDevices?.getUserMedia) {
          onError && onError('Tu navegador no soporta grabación de audio.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        webAudioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            webAudioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const audioBlob = new Blob(webAudioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Data = reader.result;
            processAudio(base64Data, 'audio/webm');
          };
        };

        webMediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
      } else {
        // En Android / iOS
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
          onError && onError('Se necesita permiso de micrófono para grabar notas de voz.');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        nativeRecordingRef.current = recording;
      }

      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error('Error al iniciar grabación:', err);
      onError && onError('No se pudo acceder al micrófono: ' + (err.message || err));
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
      onError && onError('Error al guardar el audio: ' + (err.message || err));
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
    try {
      const { parseVoiceReport } = require('../services/api');
      const response = await parseVoiceReport(base64Audio, mimeType);

      if (response.data && response.data.success && response.data.data) {
        onParsedData && onParsedData(response.data.data, base64Audio);
      } else {
        onError && onError('La IA no pudo interpretar el audio. Por favor intenta de nuevo.');
      }
    } catch (err) {
      console.error('Error al procesar audio en servidor:', err);
      const msg = err.response?.data?.details || err.message || 'Error de conexión con el servidor.';
      onError && onError('Error al procesar audio con IA: ' + msg);
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
});

export default AudioRecorder;

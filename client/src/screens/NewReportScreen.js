
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import { TextInput, Button, Text, SegmentedButtons, Checkbox, Snackbar, List } from 'react-native-paper';
import CategorySelector from '../components/CategorySelector';
import ImageSelector from '../components/ImageSelector';
import AudioRecorder from '../components/AudioRecorder';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { submitReport } from '../services/api';
import { saveReportOffline } from '../services/offlineManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const allowAnonymous = false; // Feature removed as per feedback

const PREDIOS = [
  'Oficina Central',
  'Almacenera',
  'San Juliano',
  'Los Tamarindos',
  'Media Luna',
  'Los Troncos'
];

const NewReportScreen = ({ navigation }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [predio, setPredio] = useState('');
  const [expandedPredio, setExpandedPredio] = useState(false);
  const [priority, setPriority] = useState('normal');
  const [images, setImages] = useState([]);
  const [reporterName, setReporterName] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceAudio, setVoiceAudio] = useState(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: '' });
  const [clientReportId] = useState(uuidv4()); // ID único que persiste mientras la pantalla esté abierta

  const isConnected = useNetworkStatus();


  React.useEffect(() => {
    const loadSavedData = async () => {
      const savedName = await AsyncStorage.getItem('userReporterName');
      const savedEmail = await AsyncStorage.getItem('userReporterEmail');
      if (savedName) setReporterName(savedName);
      if (savedEmail) setReporterEmail(savedEmail);
    };
    loadSavedData();
  }, []);

  const handleVoiceDataParsed = (parsedData, audioBase64) => {
    if (parsedData.title) setTitle(parsedData.title);
    if (parsedData.predio) setPredio(parsedData.predio);
    if (parsedData.location) setLocation(parsedData.location);
    if (parsedData.category) setCategory(parsedData.category);
    if (parsedData.priority) setPriority(parsedData.priority);
    if (parsedData.description) setDescription(parsedData.description);
    if (audioBase64) setVoiceAudio(audioBase64);

    setSnackbar({
      visible: true,
      message: '✨ Reporte completado por IA. Revisa los datos y añade fotos si deseas.',
      type: 'success',
    });
  };

  const handleSubmit = async () => {
    if (!title || !location || !category || !predio || !reporterName.trim()) {
      setSnackbar({ visible: true, message: 'Por favor, complete todos los campos obligatorios (*).', type: 'error' });
      return;
    }

    setIsLoading(true);

    const reportData = {
      clientReportId,
      title,
      description,
      location,
      predio,
      category,
      priority,
      images: images.map(img => img.base64),
      voiceAudio: voiceAudio || null,
      reporterName,
      reporterEmail,
      isAnonymous: false,
    };


    try {
      if (isConnected) {
        await submitReport(reportData);
        if (reporterName) {
          await AsyncStorage.setItem('userReporterName', reporterName);
        }
        if (reporterEmail) {
          await AsyncStorage.setItem('userReporterEmail', reporterEmail);
        }
        setSnackbar({ visible: true, message: 'Reporte enviado exitosamente.', type: 'success' });
        setTimeout(() => navigation.goBack(), 2000);
      } else {
        await saveReportOffline(reportData);
        if (reporterName) {
          await AsyncStorage.setItem('userReporterName', reporterName);
        }
        if (reporterEmail) {
          await AsyncStorage.setItem('userReporterEmail', reporterEmail);
        }
        setSnackbar({ visible: true, message: 'No hay conexión. Su reporte se ha guardado y se enviará automáticamente cuando vuelva a tener internet.', type: 'info' });
        setTimeout(() => navigation.goBack(), 2000);
      }
    } catch (error) {
      console.error('Error detallado al procesar el reporte:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        config: error.config ? { url: error.config.url, method: error.config.method } : 'N/A'
      });

      // Guardar offline SIEMPRE que falle el envío online
      await saveReportOffline(reportData);
      if (reporterName) {
        await AsyncStorage.setItem('userReporterName', reporterName);
      }
      if (reporterEmail) {
        await AsyncStorage.setItem('userReporterEmail', reporterEmail);
      }

      let errorMessage = 'No se pudo conectar con el servidor. Su reporte se ha guardado localmente.';
      
      if (error.response) {
        if (error.response.status === 413) {
          errorMessage = 'Las fotos son demasiado pesadas para la señal actual. El reporte se guardó localmente.';
        } else if (error.response.status >= 500) {
          errorMessage = 'Hubo un problema interno en el servidor. El reporte se guardó localmente.';
        } else {
          errorMessage = `Error del servidor (${error.response.status}). El reporte se guardó localmente.`;
        }
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        errorMessage = 'La conexión de internet es muy lenta. El reporte se guardó localmente y se enviará luego.';
      } else if (error.message.includes('Network Error')) {
        errorMessage = 'Sin señal de internet. El reporte se guardó localmente.';
      }

      setSnackbar({ visible: true, message: errorMessage, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const onDismissSnackbar = () => setSnackbar({ ...snackbar, visible: false });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <AudioRecorder
        onParsedData={handleVoiceDataParsed}
        onError={(errMsg) => setSnackbar({ visible: true, message: errMsg, type: 'error' })}
      />

      <TextInput
        label="Título del Incidente*"
        mode="outlined"
        placeholder="Ej: Fuga de agua en baño de mujeres"
        value={title}
        onChangeText={setTitle}
        style={styles.input}
      />

      <CategorySelector onCategorySelected={setCategory} selectedCategoryId={category} />


      <View style={{ marginBottom: 16, borderWidth: 1, borderColor: '#757575', borderRadius: 4 }}>
        <List.Accordion
          title={predio || "Seleccionar Predio*"}
          expanded={expandedPredio}
          onPress={() => setExpandedPredio(!expandedPredio)}
          left={props => <List.Icon {...props} icon="office-building" />}
        >
          {PREDIOS.map((p) => (
            <List.Item
              key={p}
              title={p}
              onPress={() => {
                setPredio(p);
                setExpandedPredio(false);
              }}
            />
          ))}
        </List.Accordion>
      </View>

      <TextInput
        label="Lugar Específico*"
        mode="outlined"
        placeholder="Ej: Comedor"
        value={location}
        onChangeText={setLocation}
        style={styles.input}
      />

      <TextInput
        label="Descripción*"
        mode="outlined"
        placeholder="Describe el problema..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        style={styles.inputNoMargin}
      />
      <Text style={styles.helperText}>Describa detalladamente el incidente y su estado actual.</Text>

      <Text style={styles.label}>Nivel de Urgencia</Text>
      <SegmentedButtons
        value={priority}
        onValueChange={setPriority}
        style={styles.inputNoMargin}
        buttons={[
          { value: 'baja', label: 'Baja' },
          { value: 'normal', label: 'Normal' },
          { value: 'alta', label: 'Alta' },
        ]}
      />
      <View style={styles.urgencyLegend}>
        <Text style={styles.legendText}><Text style={{ fontWeight: 'bold' }}>Baja:</Text> No interrumpe operaciones</Text>
        <Text style={styles.legendText}><Text style={{ fontWeight: 'bold' }}>Normal:</Text> Requiere atención</Text>
        <Text style={styles.legendText}><Text style={{ fontWeight: 'bold' }}>Alta:</Text> Riesgo para personas u operaciones</Text>
      </View>

      <TextInput
        label="Tu Nombre*"
        mode="outlined"
        placeholder="Nombre completo"
        value={reporterName}
        onChangeText={setReporterName}
        style={styles.inputNoMargin}
      />
      <Text style={styles.helperText}>Usaremos tu nombre para el seguimiento interno.</Text>

      <TextInput
        label="Tu Correo Electrónico (Opcional)"
        mode="outlined"
        placeholder="ejemplo@agrocentro.com.bo"
        value={reporterEmail}
        onChangeText={setReporterEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.inputNoMargin}
      />
      <Text style={styles.helperText}>Para notificarte cuando el incidente sea resuelto.</Text>

      <ImageSelector onImagesChanged={setImages} />

      <Button
        mode="contained"
        icon="send"
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={isLoading}
        loading={isLoading}
      >
        {isLoading ? 'Enviando...' : 'ENVIAR REPORTE'}
      </Button>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={onDismissSnackbar}
        duration={3000}
        action={{
          label: 'OK',
          onPress: onDismissSnackbar,
        }}
        style={{ backgroundColor: snackbar.type === 'success' ? 'green' : snackbar.type === 'error' ? 'red' : '#333' }}
      >
        {snackbar.message}
      </Snackbar>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  input: {
    marginBottom: 16,
  },
  inputNoMargin: {
    marginBottom: 4,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
    marginLeft: 4,
  },
  urgencyLegend: {
    marginBottom: 20,
    marginTop: 8,
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#444',
    marginBottom: 2,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginLeft: -10,
  },
  checkboxLabel: {
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#2e7d32',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  footerAction: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  actionButton: {
    backgroundColor: '#2e7d32',
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 48,
  },
});

export default NewReportScreen;

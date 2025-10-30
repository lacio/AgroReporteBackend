
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, Text, SegmentedButtons, Checkbox, Snackbar } from 'react-native-paper';
import CategorySelector from '../components/CategorySelector';
import ImageSelector from '../components/ImageSelector';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { submitReport } from '../services/api';
import { saveReportOffline } from '../services/offlineManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NewReportScreen = ({ navigation }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState(null);
  const [images, setImages] = useState([]);
  const [priority, setPriority] = useState('normal');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [reporterName, setReporterName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: '' });

  const isConnected = useNetworkStatus();

  const handleSubmit = async () => {
    if (!title || !location || !category) {
      setSnackbar({ visible: true, message: 'Por favor, complete todos los campos obligatorios (*).', type: 'error' });
      return;
    }

    setIsLoading(true);

    const reportData = {
      title,
      description,
      location,
      category,
      priority,
      images: images.map(img => img.base64),
      reporterName: isAnonymous ? 'Anónimo' : reporterName,
      isAnonymous,
    };

    try {
      if (isConnected) {
        await submitReport(reportData);
        if (!isAnonymous && reporterName) {
          await AsyncStorage.setItem('userReporterName', reporterName);
        }
        setSnackbar({ visible: true, message: 'Reporte enviado exitosamente.', type: 'success' });
        setTimeout(() => navigation.goBack(), 2000);
      } else {
        await saveReportOffline(reportData);
        if (!isAnonymous && reporterName) {
          await AsyncStorage.setItem('userReporterName', reporterName);
        }
        setSnackbar({ visible: true, message: 'No hay conexión. Su reporte se ha guardado y se enviará automáticamente cuando vuelva a tener internet.', type: 'info' });
        setTimeout(() => navigation.goBack(), 2000);
      }
    } catch (error) {
      console.error('Error al procesar el reporte:', error);
      await saveReportOffline(reportData);
      if (!isAnonymous && reporterName) {
        await AsyncStorage.setItem('userReporterName', reporterName);
      }
      setSnackbar({ visible: true, message: 'No se pudo conectar con el servidor. Su reporte se ha guardado localmente.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const onDismissSnackbar = () => setSnackbar({ ...snackbar, visible: false });

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <TextInput
          label="Título del Incidente*"
          mode="outlined"
          placeholder="Ej: Grifo de baño dañado"
          value={title}
          onChangeText={setTitle}
          style={styles.input}
        />

        <CategorySelector onCategorySelected={setCategory} />

        <TextInput
          label="Lugar Específico*"
          mode="outlined"
          placeholder="Ej: Comedor"
          value={location}
          onChangeText={setLocation}
          style={styles.input}
        />

        <TextInput
          label="Descripción (opcional)"
          mode="outlined"
          placeholder="Detalles adicionales del problema"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={styles.input}
        />
        
        <ImageSelector onImagesChanged={setImages} />

        <Text style={styles.label}>Nivel de Urgencia</Text>
        <SegmentedButtons
          value={priority}
          onValueChange={setPriority}
          style={styles.input}
          buttons={[
            { value: 'baja', label: 'Baja' },
            { value: 'normal', label: 'Normal' },
            { value: 'alta', label: 'Alta' },
          ]}
        />

        <View style={styles.checkboxContainer}>
          <Checkbox.Item
            label="Reportar de forma anónima"
            status={isAnonymous ? 'checked' : 'unchecked'}
            onPress={() => setIsAnonymous(!isAnonymous)}
            position='leading'
            labelStyle={styles.checkboxLabel}
          />
        </View>

        {!isAnonymous && (
          <TextInput
            label="Su nombre (opcional)"
            mode="outlined"
            placeholder="Nombre del reportante"
            value={reporterName}
            onChangeText={setReporterName}
            style={styles.input}
          />
        )}

        <Button
          mode="contained"
          icon="send"
          style={styles.button}
          onPress={handleSubmit}
          disabled={isLoading}
          loading={isLoading}
        >
          {isLoading ? 'Enviando...' : 'Enviar Reporte'}
        </Button>
      </View>
      <Snackbar
        visible={snackbar.visible}
        onDismiss={onDismissSnackbar}
        duration={Snackbar.DURATION_LONG}
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
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  input: {
    marginBottom: 16,
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
  button: {
    marginTop: 10,
    paddingVertical: 8,
    marginBottom: 20,
  },
});

export default NewReportScreen;


import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Image } from 'react-native';
import { Button, Text, Card, ActivityIndicator, Badge } from 'react-native-paper';
import { useIsFocused } from '@react-navigation/native';
import { useSync } from '../context/SyncContext'; // Ajusta la ruta si es necesario
import { useSyncManager } from '../services/useSyncManager';
import { getOfflineReports } from '../services/offlineManager';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getReports } from '../services/api'; // Importar la función para obtener reportes
import AsyncStorage from '@react-native-async-storage/async-storage'; // Importar AsyncStorage

const HomeScreen = ({ navigation }) => {
  const [pendingReports, setPendingReports] = useState(0);
  const [reports, setReports] = useState([]); // Estado para almacenar los reportes del servidor
  const [loadingReports, setLoadingReports] = useState(true); // Estado para el indicador de carga
  const [currentUserName, setCurrentUserName] = useState(null); // Estado para el nombre de usuario actual
  const { setNotification } = useSync();
  const { isSyncing, syncReports } = useSyncManager(setNotification);
  const isFocused = useIsFocused();
  const isConnected = useNetworkStatus();

  const checkPendingReports = useCallback(async () => {
    const reports = await getOfflineReports();
    setPendingReports(reports.length);
  }, []);

  const loadUserName = useCallback(async () => {
    const storedName = await AsyncStorage.getItem('userReporterName');
    if (storedName) {
      setCurrentUserName(storedName);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const response = await getReports();
      let userReports = [];
      if (currentUserName) {
        userReports = response.data.filter(report => report.reporterName === currentUserName);
      }
      setReports(userReports);
    } catch (error) {
      console.error("Error al obtener reportes del servidor:", error);
      setNotification("Error al cargar tus reportes.");
    } finally {
      setLoadingReports(false);
    }
  }, [currentUserName, setNotification]);

  useEffect(() => {
    if (isFocused) {
      checkPendingReports();
      loadUserName(); // Cargar el nombre de usuario al enfocar la pantalla
    }
  }, [isFocused, checkPendingReports, loadUserName]);

  useEffect(() => {
    if (isFocused && currentUserName !== null) { // Solo cargar reportes si el nombre de usuario ya se cargó
      fetchReports();
    }
  }, [isFocused, currentUserName, fetchReports]);

  const handleManualSync = () => {
    if (isConnected) {
        syncReports().then(() => {
            checkPendingReports(); // Actualizar contador después de sincronizar
        });
    } else {
        setNotification('No hay conexión a internet para sincronizar.');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Bienvenido a AgroReporte</Text>
        <Text style={styles.subtitle}>
          Reporte cualquier incidente en las instalaciones de forma rápida y sencilla.
        </Text>
        <Button
          mode="contained"
          icon="plus-circle"
          style={styles.button}
          labelStyle={styles.buttonLabel}
          onPress={() => navigation.navigate('NewReport')}
        >
          Crear Nuevo Reporte
        </Button>
        <View style={styles.qrContainer}>
          <Text style={styles.qrText}>Escanea este QR para abrir la app web</Text>
          <Image
            style={styles.qrCode}
            source={{ uri: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://agroreporte-client-18nf4oe7z-fabiolacio-2367s-projects.vercel.app/' }}
          />
        </View>
      </View>

      {loadingReports ? (
        <ActivityIndicator animating={true} size="large" style={{ marginVertical: 10 }} />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Card style={styles.reportCard}>
              <Card.Title title={item.title || 'Sin título'} subtitle={`Estado: ${item.status}`} />
              <Card.Content>
                <Text>Fecha: {new Date(item.timestamp).toLocaleDateString()}</Text>
                {/* Puedes añadir más detalles del reporte aquí si lo deseas */}
              </Card.Content>
            </Card>
          )}
          ListEmptyComponent={<Text style={styles.emptyListText}>No tienes reportes enviados.</Text>}
        />
      )}

      {isSyncing && <ActivityIndicator animating={true} size="large" style={{ marginVertical: 10 }}/>}

      {pendingReports > 0 && (
        <Card style={styles.syncCard}>
          <Card.Title
            title="Sincronización Pendiente"
            left={(props) => <Badge {...props} size={24}>{pendingReports}</Badge>}
          />
          <Card.Content>
            <Text>Tienes {pendingReports} reporte(s) guardado(s) localmente.</Text>
          </Card.Content>
          <Card.Actions>
            <Button
              onPress={handleManualSync}
              disabled={isSyncing || !isConnected}
              icon="sync"
            >
              Sincronizar Ahora
            </Button>
          </Card.Actions>
        </Card>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  qrContainer: {
    alignItems: 'center',
    marginTop: 30,
  },
  qrText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  qrCode: {
    width: 200,
    height: 200,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 30,
  },
  buttonLabel: {
    fontSize: 18,
  },
  syncCard: {
    margin: 16,
    elevation: 4,
  },
  reportCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    elevation: 2,
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
});

export default HomeScreen;

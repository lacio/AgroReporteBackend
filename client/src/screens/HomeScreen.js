
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ImageBackground, ScrollView, useWindowDimensions } from 'react-native';
import { Button, Text, Card, ActivityIndicator, Badge } from 'react-native-paper';
import { useIsFocused } from '@react-navigation/native';
import { useSync } from '../context/SyncContext'; // Ajusta la ruta si es necesario
import { useSyncManager } from '../services/useSyncManager';
import { getOfflineReports } from '../services/offlineManager';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getReports } from '../services/api'; // Importar la función para obtener reportes
import AsyncStorage from '@react-native-async-storage/async-storage'; // Importar AsyncStorage

const banners = [
  require('../../assets/banner1.jpg'),
  require('../../assets/banner2.jpg'),
  require('../../assets/banner3.jpg'),
];

const HomeScreen = ({ navigation }) => {
  const [pendingReports, setPendingReports] = useState(0);
  const [reports, setReports] = useState([]); // Estado para almacenar los reportes del servidor
  const [loadingReports, setLoadingReports] = useState(true); // Estado para el indicador de carga
  const [currentUserName, setCurrentUserName] = useState(null); // Estado para el nombre de usuario actual
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // Estado para la imagen de portada actual
  const { setNotification } = useSync();
  const { isSyncing, syncReports } = useSyncManager(setNotification);
  const isFocused = useIsFocused();
  const isConnected = useNetworkStatus();

  const { height: windowHeight } = useWindowDimensions();

  // Rotación de imágenes de portada
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % banners.length);
    }, 5000); // 5 segundos por imagen
    return () => clearInterval(interval);
  }, []);

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.containerContent}
    >
      <ImageBackground
        source={banners[currentImageIndex]}
        style={styles.fullBackground}
        resizeMode="cover"
      >
        <View style={[styles.overlay, { minHeight: windowHeight }]}>
          <View style={styles.header}>
            <Text style={styles.brandTitle}>AgroReporte</Text>
            <View style={styles.divider} />
            <Text style={styles.brandSubtitle}>Control de Calidad e Incidencias</Text>
          </View>

          <View style={styles.centerContent}>
            <Text style={styles.welcomeText}>¿Deseas reportar algo?</Text>
            <Text style={styles.instructionText}>Agrocentro promueve la prevención, el bienestar y el cuidado del entorno laboral, brindando pautas claras para actuar de forma segura y responsable.</Text>

            <Button
              mode="contained"
              icon="plus"
              style={styles.actionButton}
              labelStyle={styles.actionButtonLabel}
              onPress={() => navigation.navigate('NewReport')}
            >
              EMPEZAR REPORTE
            </Button>
          </View>

        </View>
      </ImageBackground>

      {isSyncing && <ActivityIndicator animating={true} size="large" style={{ marginVertical: 10 }} />}

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
    </ScrollView>
  );
};

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'resuelto': return '#4caf50';
    case 'en proceso': return '#ff9800';
    default: return '#757575';
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fullBackground: {
    width: '100%',
  },
  containerContent: {
    flexGrow: 1,
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.3)', // Reducido un poco para que se aprecie mejor la imagen
    padding: 30,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'flex-start',
    marginTop: 60,
    paddingLeft: 50, // Movido 30px más a la derecha (total 50px)
  },
  brandTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  divider: {
    width: 40,
    height: 3,
    backgroundColor: '#8bc34a',
    marginVertical: 10,
    borderRadius: 2,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#eee',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
    textAlign: 'left',
  },
  centerContent: {
    alignItems: 'center',
    marginTop: 40, // Añadido un poco de margen superior
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  instructionText: {
    fontSize: 15,
    color: '#fff', // Blanco puro para mejor contraste
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
    paddingHorizontal: 10,
    opacity: 0.9,
  },
  actionButton: {
    backgroundColor: '#388e3c', // Un verde vibrante
    paddingVertical: 8,
    paddingHorizontal: 30,
    borderRadius: 12, // Bordes menos redondeados para look moderno
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  actionButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 1,
  },
});

export default HomeScreen;

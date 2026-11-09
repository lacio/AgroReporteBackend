
import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, DefaultTheme, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import HomeScreen from './src/screens/HomeScreen';
import NewReportScreen from './src/screens/NewReportScreen';
import { SyncContext } from './src/context/SyncContext';

const Stack = createStackNavigator();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#2c3e50',
    accent: '#1abc9c',
  },
};

// Componente proveedor del contexto
const SyncProvider = ({ children }) => {
  const [notification, setNotification] = useState('');
  const onDismissNotification = () => setNotification('');

  return (
    <SyncContext.Provider value={{ setNotification }}>
      {children}
      <Snackbar
        visible={!!notification}
        onDismiss={onDismissNotification}
        duration={Snackbar.DURATION_MEDIUM}
      >
        {notification}
      </Snackbar>
    </SyncContext.Provider>
  );
};

// ... (SyncProvider definition remains same)

export default function App() {
  console.log("🔥 API_URL:", process.env.EXPO_PUBLIC_API_URL);


  useFonts({
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Add viewport meta tag for mobile responsiveness
      const viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes';
        document.head.appendChild(meta);
      }

      const style = document.createElement('style');
      style.textContent = `
        * {
          box-sizing: border-box;
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
        }
        body {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        #root {
          min-height: 100%;
          height: auto;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <PaperProvider
      theme={theme}
      settings={{
        icon: props => <MaterialCommunityIcons {...props} />,
      }}
    >
      <SyncProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerStyle: {
                backgroundColor: theme.colors.primary,
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          >
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'Reporte de Incidentes' }}
            />
            <Stack.Screen
              name="NewReport"
              component={NewReportScreen}
              options={{ title: 'Nuevo Reporte' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SyncProvider>
    </PaperProvider>
  );
}
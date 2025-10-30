
import React, { useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, DefaultTheme, Snackbar } from 'react-native-paper';
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

export default function App() {
  console.log("🔥 API_URL:", process.env.EXPO_PUBLIC_API_URL); // Added for verification
  return (
    <PaperProvider theme={theme}>
      <SyncProvider>
        <View style={{ flex: 1 }}>
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
        </View>
      </SyncProvider>
    </PaperProvider>
  );
}
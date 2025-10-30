
import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export const useNetworkStatus = () => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // state.isConnected puede ser null en el primer tick en algunas plataformas
      setIsConnected(state.isConnected ?? true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return isConnected;
};

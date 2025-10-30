
import { createContext, useContext } from 'react';

// Crear un contexto para la sincronización
export const SyncContext = createContext(null);
export const useSync = () => useContext(SyncContext);

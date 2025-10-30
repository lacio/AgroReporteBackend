# Especificaciones: App de Reporte de Incidentes en el Lugar de Trabajo

## Descripción General
Aplicación móvil para registrar y reportar incidentes, anomalías o problemas detectados en instalaciones de la empresa (grifos dañados, paredes con humedad, equipos averiados, etc.).

## Objetivo
Facilitar a los empleados el reporte rápido y eficiente de problemas en las instalaciones, con capacidad offline y seguimiento de incidentes.

---

## Funcionalidades Principales

### 1. Registro de Incidentes
- **Formulario de reporte** que incluya:
  - Título o descripción breve del incidente (obligatorio)
  - Descripción detallada (opcional)
  - Categoría del incidente (obligatorio)
  - Ubicación/lugar específico (obligatorio)
  - Nivel de urgencia/prioridad (opcional)
  - Nombre del reportante (opcional/anónimo)
  - Fecha y hora automática del reporte
  - Fotos del incidente (hasta 5 fotos)

### 2. Sistema de Categorías
Implementar categorías predefinidas para clasificar incidentes:
- **Plomería/Sanitarios** (grifos, baños, tuberías)
- **Infraestructura** (paredes, techos, pisos, ventanas)
- **Electricidad** (luces, enchufes, instalaciones eléctricas)
- **Climatización** (aire acondicionado, calefacción)
- **Mobiliario** (sillas, escritorios, estanterías)
- **Equipos/Tecnología** (computadoras, impresoras, equipos)
- **Limpieza/Higiene**
- **Seguridad** (extintores, salidas de emergencia, riesgos)
- **Otros**

Cada categoría debe tener:
- Icono representativo
- Color distintivo
- Posibilidad de agregar subcategorías

### 3. Captura de Fotos
- Acceso directo a la cámara del dispositivo
- Opción de seleccionar fotos desde la galería
- Previsualización de fotos antes de enviar
- Compresión automática de imágenes para optimizar almacenamiento
- Máximo 5 fotos por reporte
- Indicador visual del número de fotos añadidas

### 4. Geolocalización (Opcional pero Recomendado)
- Captura automática de coordenadas GPS del lugar
- Opción manual de seleccionar ubicación en un mapa de la empresa
- Lista desplegable de ubicaciones predefinidas (edificios, pisos, áreas)

### 5. Funcionalidad Offline
- **Almacenamiento local** de reportes cuando no hay conexión
- Cola de sincronización que:
  - Detecta automáticamente cuando hay conexión disponible
  - Envía reportes pendientes en segundo plano
  - Muestra estado de sincronización (pendiente/enviado)
  - Reintenta envío en caso de fallo
- Indicador visual del estado de conexión
- Notificación cuando los reportes se sincronicen exitosamente

### 6. Identificación del Usuario
- Campo de nombre **opcional**
- Opción de "Reportar de forma anónima"
- Si la app tiene login:
  - Autocompletar datos del usuario autenticado
  - Permitir desactivar identificación incluso estando logueado

---

## Funcionalidades Adicionales (Recomendadas)

### 7. Dashboard/Vista de Reportes
- Lista de reportes enviados por el usuario
- Estados del reporte:
  - Pendiente de revisión
  - En proceso
  - Resuelto
  - Rechazado/No procede
- Filtros por categoría, fecha, estado
- Buscador de reportes

### 8. Notificaciones
- Notificación cuando un reporte cambia de estado
- Recordatorio de reportes pendientes de sincronización
- Opción de activar/desactivar notificaciones

### 9. Historial y Seguimiento
- Ver detalles completos de reportes anteriores
- Comentarios o respuestas del equipo de mantenimiento
- Fotos del problema resuelto (opcional)
- Tiempo de resolución

### 10. Panel Administrativo (Backend)
- Dashboard para el equipo de mantenimiento/administración
- Visualización de todos los reportes
- Asignación de reportes a técnicos
- Actualización de estados
- Estadísticas y métricas:
  - Reportes por categoría
  - Tiempos promedio de resolución
  - Áreas con más incidentes
  - Gráficos y reportes

---

## Requisitos Técnicos

### Plataforma
- **Opción 1:** Aplicación móvil nativa (iOS y Android)
- **Opción 2:** Progressive Web App (PWA) - accesible desde navegador móvil
- **Opción 3:** Aplicación híbrida (React Native, Flutter)

### Base de Datos
- Base de datos local para almacenamiento offline (SQLite, IndexedDB, etc.)
- Base de datos en servidor para almacenamiento centralizado (PostgreSQL, MongoDB, Firebase)

### Almacenamiento de Imágenes
- Servicio cloud para almacenamiento de fotos (AWS S3, Google Cloud Storage, Cloudinary)
- Compresión y optimización automática de imágenes

### Autenticación (Opcional)
- Sistema de login con email/contraseña
- Integración con SSO empresarial (Active Directory, Google Workspace)
- Recuperación de contraseña

### APIs y Servicios
- API REST o GraphQL para comunicación cliente-servidor
- Servicio de geolocalización
- Sistema de notificaciones push (Firebase Cloud Messaging, OneSignal)

---

## Flujo de Usuario

### Flujo Principal: Crear Reporte
1. Usuario abre la app
2. Presiona botón "Nuevo Reporte" o "Reportar Incidente"
3. Completa formulario:
   - Selecciona categoría
   - Escribe descripción
   - Toma/adjunta fotos
   - Selecciona ubicación
   - Define prioridad
   - Decide si incluir su nombre o reportar anónimamente
4. Presiona "Enviar Reporte"
5. Si hay internet:
   - Se envía inmediatamente
   - Muestra confirmación de envío exitoso
6. Si no hay internet:
   - Se guarda localmente
   - Muestra mensaje "Se enviará cuando haya conexión"
   - Se sincroniza automáticamente al recuperar conexión

### Flujo Secundario: Ver Mis Reportes
1. Usuario accede a "Mis Reportes"
2. Ve lista de reportes enviados
3. Puede filtrar por estado o categoría
4. Selecciona un reporte para ver detalles
5. Ve estado actual y comentarios del equipo

---

## Diseño de UI/UX

### Pantalla Principal
- Botón prominente "Nuevo Reporte"
- Acceso rápido a "Mis Reportes"
- Indicador de estado de conexión
- Contador de reportes pendientes de sincronización

### Pantalla de Nuevo Reporte
- Formulario limpio y simple
- Campos claramente etiquetados
- Indicadores de campos obligatorios
- Botón de cámara de fácil acceso
- Previsualización de fotos en miniatura
- Botón "Enviar" destacado

### Códigos de Color
- Verde: Reporte resuelto
- Amarillo/Naranja: En proceso
- Rojo: Urgente/Alta prioridad
- Gris: Pendiente de revisión

### Iconografía
- Iconos claros para cada categoría
- Iconos de estado de sincronización
- Iconos de prioridad

---

## Consideraciones de Seguridad

- Validación de datos en cliente y servidor
- Encriptación de datos sensibles
- Protección contra inyección SQL
- Límite de tamaño de archivos subidos
- Validación de tipos de archivo (solo imágenes)
- Autenticación segura (si se implementa login)
- HTTPS para todas las comunicaciones

---

## Métricas de Éxito

- Tiempo promedio para crear un reporte (objetivo: < 2 minutos)
- Tasa de reportes enviados vs. abandonados
- Tiempo promedio de resolución de incidentes
- Satisfacción del usuario con la app
- Número de reportes anónimos vs. identificados
- Tasa de éxito de sincronización offline

---

## Roadmap de Desarrollo

### Fase 1 - MVP (Producto Mínimo Viable)
- Formulario básico de reporte
- Sistema de categorías
- Captura de fotos
- Funcionalidad offline básica
- Envío de reportes al servidor

### Fase 2 - Mejoras
- Dashboard de usuario
- Sistema de notificaciones
- Geolocalización
- Mejoras en UI/UX

### Fase 3 - Avanzado
- Panel administrativo completo
- Estadísticas y reportes
- Asignación de técnicos
- Chat/comentarios en reportes
- Integración con sistemas existentes

---

## Notas Adicionales

### Idioma
- Interfaz en español
- Opción de agregar más idiomas en el futuro

### Accesibilidad
- Tamaños de texto ajustables
- Alto contraste para mejor legibilidad
- Compatibilidad con lectores de pantalla

### Performance
- Carga rápida de la app (< 3 segundos)
- Respuesta inmediata a interacciones del usuario
- Optimización de imágenes automática
- Caché inteligente para mejorar velocidad

### Mantenimiento
- Logs de errores y crashes
- Sistema de feedback del usuario
- Actualizaciones over-the-air (OTA)

---

## Entregables Esperados

1. **Aplicación móvil** (iOS/Android/PWA)
2. **Backend/API** para gestión de reportes
3. **Panel administrativo web** (opcional pero recomendado)
4. **Documentación técnica**
5. **Manual de usuario**
6. **Scripts de despliegue**

---

## Tecnologías Sugeridas

### Frontend Mobile
- React Native + Expo
- Flutter
- PWA (React + Workbox para offline)

### Backend
- Node.js + Express
- Python + Django/FastAPI
- Firebase (solución completa)

### Base de Datos
- PostgreSQL
- MongoDB
- Firebase Firestore

### Storage
- AWS S3
- Cloudinary
- Firebase Storage

---

## Contacto y Soporte
[Agregar información de contacto del equipo responsable o administrador del sistema]
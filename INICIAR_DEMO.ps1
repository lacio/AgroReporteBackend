$ErrorActionPreference = "Stop"

Write-Host "🚀 Iniciando AgroReporte Modo Demo..." -ForegroundColor Green

# 1. Iniciar Servidor Backend
Write-Host "Iniciando Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& {cd server; Write-Host 'Iniciando Servidor...' -ForegroundColor Yellow; npm start}"

# Esperar unos segundos para asegurar que el servidor arranque
Start-Sleep -Seconds 3

# 2. Iniciar Cliente Expo (Modo Web/LAN)
Write-Host "Iniciando Cliente Expo..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& {cd client; Write-Host 'Iniciando App Móvil/Web...' -ForegroundColor Yellow; npx expo start --clear}"

Write-Host "✅ ¡Todo listo!" -ForegroundColor Green
Write-Host "1. En la ventana del Cliente, escanea el código QR con tu celular."
Write-Host "2. Asegúrate que tu celular y esta laptop estén en el mismo WiFi."
Write-Host "3. Si Windows te pide permiso de Firewall, dile que SÍ (permitir redes privadas)."

Read-Host -Prompt "Presiona Enter para salir de este lanzador"

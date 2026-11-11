Write-Host "🚀 AgroReporte - Deploy optimización de velocidad" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$ROOT = "c:\Users\fabio.lacio\OneDrive - Agrocentro S.A\Documentos 1\AgroReporte"

# 1. Build del cliente web
Write-Host "`n📦 Paso 1: Build del cliente web..." -ForegroundColor Yellow
Set-Location "$ROOT\client"
npx expo export --platform web --output-dir dist --clear
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error en el build del cliente. Abortando." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build completado" -ForegroundColor Green

# 2. Deploy Firebase (functions + hosting juntos)
Write-Host "`n🔥 Paso 2: Deploy a Firebase (functions + hosting)..." -ForegroundColor Yellow
Set-Location $ROOT
firebase deploy --only "functions,hosting"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error en el deploy de Firebase." -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Deploy completado exitosamente!" -ForegroundColor Green
Write-Host "🌐 App en producción: https://agroreporteapp.web.app" -ForegroundColor Cyan
Write-Host "`n🏎️ Cambios de velocidad aplicados:" -ForegroundColor Cyan
Write-Host "  • Modelos Gemini flash-lite (2-4 s) con respaldo en paralelo" -ForegroundColor White
Write-Host "  • Sin gemini-3.8-flash (tardaba más de 60 s)" -ForegroundColor White
Write-Host "  • Servidor se despierta al empezar a grabar" -ForegroundColor White
Write-Host "  • Prompt ~80% más corto (menos tokens a procesar)" -ForegroundColor White
Write-Host "  • Audio bitrate: 16kbps (archivo 8x más pequeño)" -ForegroundColor White

# Demo del nuevo sistema de Workers
# Este script muestra cómo usar los comandos del CLI

Write-Host "`n🚀 DEMO: Sistema de Workers BullMQ`n" -ForegroundColor Cyan

Write-Host "REQUISITO: Ejecuta 'npm run dev:all' en otra terminal primero`n" -ForegroundColor Yellow

# Esperar confirmación
Read-Host "Presiona Enter cuando el daemon esté corriendo"

# 1. Listar estado inicial
Write-Host "`n📊 1. Estado inicial de workers:" -ForegroundColor Green
npm run workers list

# 2. Escalar a 5 workers
Write-Host "`n📈 2. Escalando order-sync a 5 workers:" -ForegroundColor Green
npm run workers scale order-sync 5

# 3. Ver nuevo estado
Write-Host "`n📊 3. Estado después de escalar:" -ForegroundColor Green
npm run workers list

# 4. Pausar la queue completa
Write-Host "`n⏸️ 4. Pausando toda la queue order-sync:" -ForegroundColor Green
npm run workers pause order-sync

# 5. Ver estado pausado
Write-Host "`n📊 5. Estado con workers pausados:" -ForegroundColor Green
npm run workers list

# 6. Reanudar la queue
Write-Host "`n▶️ 6. Reanudando queue order-sync:" -ForegroundColor Green
npm run workers resume order-sync

# 7. Reducir a 2 workers
Write-Host "`n📉 7. Reduciendo a 2 workers:" -ForegroundColor Green
npm run workers scale order-sync 2

# 8. Estado final
Write-Host "`n📊 8. Estado final:" -ForegroundColor Green
npm run workers list

Write-Host "`n✅ Demo completada!`n" -ForegroundColor Cyan
Write-Host "Comandos disponibles:" -ForegroundColor Yellow
Write-Host "  npm run workers list                 # Ver estado"
Write-Host "  npm run workers scale <queue> <n>    # Escalar workers"
Write-Host "  npm run workers pause <queue|id>     # Pausar"
Write-Host "  npm run workers resume <queue|id>    # Reanudar"
Write-Host "  npm run workers stop <id>            # Detener worker específico"
Write-Host ""

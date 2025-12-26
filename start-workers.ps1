#!/usr/bin/env pwsh
# Script para iniciar el Worker Daemon
# Ejecutar en una terminal separada de VS Code

Write-Host "🚀 Iniciando Worker Daemon..." -ForegroundColor Cyan
Write-Host "Este proceso debe mantenerse corriendo." -ForegroundColor Yellow
Write-Host "Usa otra terminal para ejecutar comandos CLI.`n" -ForegroundColor Yellow

npm run workers:daemon

Write-Host "Запуск приложения оценки проектов..." -ForegroundColor Cyan

function Stop-ListenerOnPort([int]$Port) {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Stop-ListenerOnPort 3001
Stop-ListenerOnPort 3000
Start-Sleep -Seconds 1

# Запуск сервера
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\server'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 2

# Запуск клиента
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\client'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

# Открыть браузер
Start-Process "http://localhost:3000"

Write-Host "Приложение запущено! http://localhost:3000" -ForegroundColor Green

Write-Host "Запуск приложения Оценка проектов..." -ForegroundColor Cyan

# Запуск сервера
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\server'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 2

# Запуск клиента
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\client'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

# Открыть браузер
Start-Process "http://localhost:5173"

Write-Host "Приложение запущено! http://localhost:5173" -ForegroundColor Green

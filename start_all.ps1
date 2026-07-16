# CityTwin AI — Start All Services

Write-Host "Starting MongoDB..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath ".\infra\mongodb_dist\bin\mongod.exe" -ArgumentList "--dbpath .\infra\mongodb_dist\data\db --bind_ip 127.0.0.1 --port 27017"

Write-Host "Starting FastAPI Backend on port 8000..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath ".\backend\.venv\Scripts\python.exe" -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload" -WorkingDirectory ".\backend"

Write-Host "Starting Next.js Frontend on port 3000..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory ".\frontend"

Write-Host "All services started in the background!" -ForegroundColor Cyan
Write-Host "- Frontend: http://127.0.0.1:3000" -ForegroundColor Cyan
Write-Host "- Backend Health: http://127.0.0.1:8000/health" -ForegroundColor Cyan

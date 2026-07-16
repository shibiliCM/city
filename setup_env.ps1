$ErrorActionPreference = "Stop"

$mongoDir = "d:\DS\projects\city\infra\mongodb_dist"
$zipPath = "$mongoDir\mongodb.zip"
$dataDir = "$mongoDir\data\db"

# 1. Download and Extract MongoDB if not exists
if (-not (Test-Path "$mongoDir\bin\mongod.exe" -PathType Leaf)) {
    Write-Host "Creating MongoDB directory at $mongoDir..."
    New-Item -ItemType Directory -Force -Path $mongoDir | Out-Null
    
    Write-Host "Downloading MongoDB ZIP (this may take a minute depending on your internet speed)..."
    # Using MongoDB 7.0.14 portable zip
    $url = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.14.zip"
    Invoke-WebRequest -Uri $url -OutFile $zipPath

    Write-Host "Extracting MongoDB..."
    Expand-Archive -Path $zipPath -DestinationPath $mongoDir -Force

    # Move extracted files from the inner folder to $mongoDir
    $innerFolder = Get-ChildItem -Path $mongoDir -Directory | Where-Object Name -Like "mongodb-*" | Select-Object -First 1
    if ($innerFolder) {
        Move-Item -Path "$($innerFolder.FullName)\*" -Destination $mongoDir -Force
        Remove-Item -Path $innerFolder.FullName -Recurse -Force
    }
    
    # Cleanup zip
    Remove-Item -Path $zipPath -Force
}

# 2. Create data dir and start MongoDB
Write-Host "Setting up database directory at $dataDir..."
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# Check if mongod is already running on port 27017
$portInUse = (Test-NetConnection -ComputerName localhost -Port 27017 -WarningAction SilentlyContinue).TcpTestSucceeded
if (-not $portInUse) {
    Write-Host "Starting MongoDB process in the background..."
    Start-Process -FilePath "$mongoDir\bin\mongod.exe" -ArgumentList "--dbpath `"$dataDir`"" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Write-Host "MongoDB started."
} else {
    Write-Host "MongoDB is already running."
}

# 3. Setup and start Backend
Write-Host "Setting up Python backend..."
Set-Location "d:\DS\projects\city\backend"

if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv .venv
}

Write-Host "Activating venv and installing requirements..."
& .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Start backend in a hidden window
$backendPortInUse = (Test-NetConnection -ComputerName localhost -Port 8000 -WarningAction SilentlyContinue).TcpTestSucceeded
if (-not $backendPortInUse) {
    Write-Host "Starting FastAPI backend in the background..."
    Start-Process -FilePath ".\.venv\Scripts\uvicorn.exe" -ArgumentList "app.main:app --reload --port 8000" -WindowStyle Hidden
    Write-Host "Backend started on port 8000."
} else {
    Write-Host "Backend is already running on port 8000."
}

Write-Host "Setup complete! You should be able to upload datasets now."

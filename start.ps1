# 一键启动开发环境（先开后端，再开前端）
# 用法：在仓库根目录执行  .\start.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "== 检查后端虚拟环境 ==" -ForegroundColor Cyan
$py = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "创建虚拟环境并安装依赖..."
    & (Join-Path $root "backend") python -m venv .venv
    & $py -m pip install -r (Join-Path $root "backend\requirements.txt")
}

Write-Host "== 检查前端依赖 ==" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $root "frontend\node_modules"))) {
    Push-Location (Join-Path $root "frontend")
    npm install
    Pop-Location
}

Write-Host "== 启动后端 (http://127.0.0.1:8000) ==" -ForegroundColor Cyan
Start-Process -FilePath $py -ArgumentList "-m","uvicorn","app.main:app","--reload","--port","8000" -WorkingDirectory (Join-Path $root "backend")

Write-Host "== 启动前端 (http://localhost:5173) ==" -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npm run dev
Pop-Location

# Divorce app dev launcher (PowerShell). Usage: .\start.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node is not installed — get it from https://nodejs.org"
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies…"
    npm install
}

Write-Host "Starting dev server…"
npm run dev

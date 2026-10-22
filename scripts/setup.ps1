# Preparação rápida no Windows 10/11 (PowerShell). Uso: .\scripts\setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Host 'Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo.' -ForegroundColor Red; exit 1 }
$major = [int]((node -v).TrimStart('v').Split('.')[0])
if ($major -lt 20) { Write-Host "Node $(node -v) é antigo. Use a versão 20 ou superior." -ForegroundColor Red; exit 1 }

if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host 'Arquivo .env criado a partir do .env.example (modo DEMO).' }
npm install
Write-Host "`nPronto! Rode: npm run dev   (painel em modo DEMO)" -ForegroundColor Green

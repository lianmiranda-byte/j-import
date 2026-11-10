$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
  npm run build:portable
  if ($LASTEXITCODE -ne 0) { throw "A criação do executável portátil falhou." }

  $outputDirectory = Join-Path $projectRoot "release\portable"
  $executable = Get-ChildItem -LiteralPath $outputDirectory -Filter "*.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $executable) { throw "O empacotamento terminou sem gerar um arquivo .exe." }

  $desktop = [Environment]::GetFolderPath("Desktop")
  $destination = Join-Path $desktop "J-Iports.exe"
  Copy-Item -LiteralPath $executable.FullName -Destination $destination -Force
  Write-Output "Executável criado: $($executable.FullName)"
  Write-Output "Cópia na Área de Trabalho: $destination"
} finally {
  Pop-Location
}

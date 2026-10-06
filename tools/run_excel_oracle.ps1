# Usa el Excel oficial como ORÁCULO: carga las respuestas de cada caso en una COPIA del libro (macros desactivadas),
# deja que Excel recalcule y guarda los resultados. No modifica el archivo original.
# Uso: powershell -File tools/run_excel_oracle.ps1 -Xlsm "<ruta .xlsm>" -Cases tmp_xl/cases.json -Out tmp_xl/oracle.json
param(
  [Parameter(Mandatory = $true)][string]$Xlsm,
  [Parameter(Mandatory = $true)][string]$Cases,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Limit = 0
)
$ErrorActionPreference = 'Stop'
$tmp = Join-Path $env:TEMP ("oracle_" + [guid]::NewGuid().ToString('N') + '.xlsm')
Copy-Item -LiteralPath $Xlsm -Destination $tmp
$data = Get-Content -LiteralPath $Cases -Raw -Encoding UTF8 | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
$xl.AutomationSecurity = 3   # msoAutomationSecurityForceDisable: no ejecuta macros
$xl.EnableEvents = $false
$xl.ScreenUpdating = $false
try {
  $wb = $xl.Workbooks.Open($tmp, 0, $false)
  $xl.Calculation = -4135    # manual: se recalcula una vez por caso
  $results = New-Object System.Collections.Generic.List[object]
  $n = 0
  foreach ($case in $data.cases) {
    if ($Limit -gt 0 -and $n -ge $Limit) { break }
    $n++
    $cfg = $data.sheets.($case.sheet)
    $ws = $wb.Worksheets.Item($case.sheet)
    # limpiar entradas
    foreach ($p in $cfg.cells.PSObject.Properties) { $ws.Range($p.Value).ClearContents() | Out-Null }
    foreach ($p in $cfg.gates.PSObject.Properties) { $ws.Range($p.Value).ClearContents() | Out-Null }
    # respuestas: índice 0-based -> opción 1..N; sin responder: «NR» en ítems pares, celda vacía en impares
    foreach ($p in $case.answers.PSObject.Properties) {
      $item = [int]$p.Name
      $cell = $cfg.cells.($p.Name)
      if ($null -ne $p.Value) { $ws.Range($cell).Value2 = [double]($p.Value + 1) }
      elseif ($item % 2 -eq 0) { $ws.Range($cell).Value2 = 'NR' }
    }
    foreach ($p in $cfg.gates.PSObject.Properties) {
      $on = $case.gates.($p.Name)
      $ws.Range($p.Value).Value2 = $(if ($on) { 1.0 } else { 2.0 })
    }
    $xl.Calculate()
    $res = [ordered]@{}
    foreach ($c in $cfg.read) {
      $v = $ws.Range($c).Value2
      $res[$c] = $(if ($null -eq $v) { $null } elseif ($v -is [string] -or $v -is [double]) { $v } else { "ERR:$v" })
    }
    $results.Add([ordered]@{ sheet = $case.sheet; idx = $case.idx; out = $res })
    if ($n % 100 -eq 0) { Write-Host "$n casos" }
  }
  $results | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $Out -Encoding UTF8
  Write-Host "Listo: $n casos -> $Out"
}
finally {
  if ($wb) { $wb.Close($false) }
  $xl.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($xl) | Out-Null
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

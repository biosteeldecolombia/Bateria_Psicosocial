# Calcula con Excel (libro nuevo en blanco) ROUND(bruto*100/divisor, 1) para todos los brutos posibles del total
# intra + extra (616 en Forma A, 512 en Forma B) y ROUND(x, 2) / ROUND(x, 1) sobre promedios ponderados del estrés.
# Salida: packages/scoring/tests/fixtures/round.json
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
$xl.AutomationSecurity = 3
try {
  $wb = $xl.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $res = [ordered]@{ A = @(); B = @(); stress = @() }
  foreach ($d in 616, 512) {
    $list = New-Object System.Collections.Generic.List[double]
    for ($x = 0; $x -le $d; $x++) { $list.Add([double]$xl.Evaluate("ROUND($x*100/$d,1)")) }
    $res[$(if ($d -eq 616) { 'A' } else { 'B' })] = $list
  }
  # Estrés: suma ponderada con promedios de 8, 4, 10 y 9 ítems; se prueba una malla amplia de combinaciones de sumas de puntajes
  $rows = New-Object System.Collections.Generic.List[object]
  $rand = New-Object System.Random 20261005
  for ($i = 0; $i -lt 3000; $i++) {
    $a = $rand.Next(0, 8 * 9 + 1) ; $b = $rand.Next(0, 4 * 9 + 1); $c = $rand.Next(0, 10 * 9 + 1); $e = $rand.Next(0, 9 * 9 + 1)
    # los puntajes por ítem son 9/6/3/0, 6/4/2/0, 3/2/1/0 -> sumas múltiplos de 1 hasta 9 por ítem; se usan sumas enteras arbitrarias
    $f = "ROUND(ROUND($a/8*4+$b/4*3+$c/10*2+$e/9,2)*100/61.16,1)"
    $g = "ROUND($a/8*4+$b/4*3+$c/10*2+$e/9,2)"
    $rows.Add([ordered]@{ a = $a; b = $b; c = $c; d = $e; raw = [double]$xl.Evaluate($g); tr = [double]$xl.Evaluate($f) })
  }
  $res['stress'] = $rows
  $res | ConvertTo-Json -Depth 5 -Compress | Set-Content -LiteralPath $Out -Encoding UTF8
  Write-Host "Listo -> $Out"
}
finally {
  if ($wb) { $wb.Close($false) }
  $xl.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($xl) | Out-Null
}

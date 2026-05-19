$ErrorActionPreference = 'Stop'

$root = 'd:\Project\matkaking'
$dest = Join-Path $root 'static-pages-source'

New-Item -ItemType Directory -Force -Path $dest | Out-Null

$files = @(
  'about.php',
  'privacy.php',
  'tos.php',
  'matka-jodi-count-chart.php',
  'jodi-chart-family-matka.php',
  'penal-count-chart.php',
  'penal-total-chart.php',
  'All-22-Card-Panna-Penal-Patti-Chart.php',
  'fix-open-to-close-by-date.php',
  'matkaking-result-api.php',
  'matkaking-result-api-documentation.html'
)

foreach ($f in $files) {
  $src = Join-Path $root $f
  $dst = Join-Path $dest $f
  if (Test-Path $src) {
    Move-Item -Force -Path $src -Destination $dst
    Write-Host ('Moved ' + $f)
  } else {
    Write-Host ('Skip (not found): ' + $f)
  }
}

$ErrorActionPreference = "Stop"

$hasLatexmk = (Get-Command latexmk -ErrorAction SilentlyContinue) -ne $null
$hasPerl = (Get-Command perl -ErrorAction SilentlyContinue) -ne $null
$hasXeLaTeX = (Get-Command xelatex -ErrorAction SilentlyContinue) -ne $null
$hasBiber = (Get-Command biber -ErrorAction SilentlyContinue) -ne $null

if ($hasLatexmk -and $hasPerl) {
  latexmk -xelatex -shell-escape -file-line-error -interaction=nonstopmode report.tex
  exit $LASTEXITCODE
}

if (-not $hasXeLaTeX) { Write-Error "Thiếu xelatex trong PATH. Cài TeX Live/MiKTeX và thêm vào PATH." }
if (-not $hasBiber) { Write-Error "Thiếu biber trong PATH. Cài biber (TeX Live/MiKTeX)." }

Write-Warning "latexmk hoặc perl không khả dụng. Chuyển sang build thủ công: xelatex → biber → xelatex ×2"

xelatex -shell-escape -file-line-error -interaction=nonstopmode report.tex
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

biber report
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

xelatex -shell-escape -file-line-error -interaction=nonstopmode report.tex
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

xelatex -shell-escape -file-line-error -interaction=nonstopmode report.tex
exit $LASTEXITCODE


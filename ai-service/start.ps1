$ErrorActionPreference = "Stop"

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$virtualEnvironment = Join-Path $serviceRoot ".venv"
$pythonExecutable = Join-Path $virtualEnvironment "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    $bootstrapPython = $env:MARKSCAN_PYTHON
    if (-not $bootstrapPython) {
        $launcher = Get-Command py -ErrorAction SilentlyContinue
        $python = Get-Command python -ErrorAction SilentlyContinue
        if ($launcher) {
            & $launcher.Source -3 -m venv $virtualEnvironment
        } elseif ($python) {
            & $python.Source -m venv $virtualEnvironment
        } else {
            throw "Python 3.10+ was not found. Install Python or set MARKSCAN_PYTHON to python.exe."
        }
    } else {
        & $bootstrapPython -m venv $virtualEnvironment
    }
}

& $pythonExecutable -m pip install --upgrade pip
& $pythonExecutable -m pip install -r (Join-Path $serviceRoot "requirements.txt")

Set-Location -LiteralPath $serviceRoot
& $pythonExecutable -m uvicorn server:app --host 127.0.0.1 --port 8384

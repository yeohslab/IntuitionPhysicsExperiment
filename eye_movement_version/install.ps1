[CmdletBinding()]
param(
    [ValidateSet('3.11')]
    [string]$PythonVersion = '3.11',

    [string]$PythonLauncher = 'py',

    [string]$Wheelhouse = ''
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    throw 'This installer targets 64-bit Windows.'
}

$projectDirectory = $PSScriptRoot
$environmentDirectory = Join-Path $projectDirectory '.venv'
$requirementsFile = Join-Path $projectDirectory 'requirements.txt'
$pythonSelector = "-$PythonVersion"

if (Test-Path -LiteralPath $environmentDirectory) {
    throw "Refusing to change existing environment '$environmentDirectory'. Back up or remove it yourself after confirming no install or experiment process is using it, then rerun this installer."
}

$launcher = Get-Command $PythonLauncher -ErrorAction Stop
& $launcher.Source $pythonSelector -c 'import struct, sys; assert sys.version_info[:2] == (3, 11), sys.version; assert struct.calcsize("P") == 8, "64-bit Python is required"'
if ($LASTEXITCODE -ne 0) {
    throw "Could not find a 64-bit CPython $PythonVersion interpreter through '$PythonLauncher'. Install CPython 3.11 x64 and ensure the Python launcher is available."
}

& $launcher.Source $pythonSelector -m venv $environmentDirectory
if ($LASTEXITCODE -ne 0) {
    throw 'Creating the experiment virtual environment failed.'
}

$environmentPython = Join-Path $environmentDirectory 'Scripts\python.exe'
& $environmentPython -c 'import struct, sys; assert sys.version_info[:2] == (3, 11), sys.version; assert struct.calcsize("P") == 8, "64-bit Python is required"'
if ($LASTEXITCODE -ne 0) {
    throw "The new environment is not using 64-bit CPython $PythonVersion."
}

$pipArgs = @('-m', 'pip', 'install', '--disable-pip-version-check')
if ($Wheelhouse -ne '') {
    if (-not (Test-Path -LiteralPath $Wheelhouse)) {
        throw "Wheelhouse not found: $Wheelhouse"
    }
    $wheelhousePath = (Resolve-Path -LiteralPath $Wheelhouse).Path
    $pipArgs += @('--no-index', '--find-links', $wheelhousePath)
}
$pipArgs += @('-r', $requirementsFile)
& $environmentPython @pipArgs
if ($LASTEXITCODE -ne 0) {
    throw "Dependency installation failed. The environment was left in place for diagnosis at '$environmentDirectory'."
}

& $environmentPython -c 'import pylink; from EyeLinkCoreGraphicsPsychoPy import EyeLinkCoreGraphicsPsychoPy; print("PyLink import:", pylink.__file__); print("CoreGraphics class:", EyeLinkCoreGraphicsPsychoPy.__module__ + "." + EyeLinkCoreGraphicsPsychoPy.__name__)'
if ($LASTEXITCODE -ne 0) {
    throw 'Dependencies installed, but the PyLink/CoreGraphics import check failed.'
}

Write-Host "Environment ready: $environmentDirectory"
Write-Host 'This check confirms package imports only; it does not connect to or calibrate an EyeLink tracker.'

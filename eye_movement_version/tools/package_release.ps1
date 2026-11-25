# Build a Windows collection folder and zip for the eye-tracking experiments.
# Output: release/IntuitionEye and release/IntuitionEye-collection-<date>.zip
# Does not read or copy sessions/, data/, or the development .venv.
[CmdletBinding()]
param(
    [switch]$SkipNpm,
    [switch]$SkipWheels
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$stageParent = Join-Path $repo 'release'
$stage = Join-Path $stageParent 'IntuitionEye'
$stamp = Get-Date -Format 'yyyyMMdd'
$zip = Join-Path $stageParent "IntuitionEye-collection-$stamp.zip"

function Copy-Tree([string]$Source, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Source)) {
        throw "Missing source path: $Source"
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    # robocopy uses 0–7 for success. Native-command error actions must not treat those as failures.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    if ($code -ge 8) {
        throw "robocopy failed ($code): $Source"
    }
}

if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Tree (Join-Path $repo 'src') (Join-Path $stage 'src')

$eyeSource = Join-Path $repo 'eye_movement_version'
$eyeDest = Join-Path $stage 'eye_movement_version'
New-Item -ItemType Directory -Force -Path $eyeDest | Out-Null
foreach ($name in @('run_experiment.py', 'install.ps1', 'requirements.txt', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $eyeSource $name) -Destination (Join-Path $eyeDest $name)
}
Copy-Tree (Join-Path $eyeSource 'config') (Join-Path $eyeDest 'config')
Copy-Tree (Join-Path $eyeSource 'assets') (Join-Path $eyeDest 'assets')
Copy-Tree (Join-Path $eyeSource 'docs') (Join-Path $eyeDest 'docs')
Copy-Tree (Join-Path $eyeSource 'intuition_eye') (Join-Path $eyeDest 'intuition_eye')
Get-ChildItem -LiteralPath (Join-Path $eyeDest 'intuition_eye') -Recurse -Directory -Filter '__pycache__' |
    Remove-Item -Recurse -Force
$toolsDest = Join-Path $eyeDest 'tools'
New-Item -ItemType Directory -Force -Path $toolsDest | Out-Null
foreach ($name in @('exportSession.ts', 'behaviorColumns.ts')) {
    Copy-Item -LiteralPath (Join-Path $eyeSource "tools\$name") -Destination (Join-Path $toolsDest $name)
}

foreach ($name in @('请先阅读.txt', '安装.bat', '启动实验.bat')) {
    Copy-Item -LiteralPath (Join-Path $eyeSource "packaging\$name") -Destination (Join-Path $stage $name)
}
Copy-Item -LiteralPath (Join-Path $eyeDest 'docs\使用说明.md') -Destination (Join-Path $stage '使用说明.md')

$packageJson = @{
    name = 'intuition-eye-collection'
    private = $true
    type = 'module'
    dependencies = [ordered]@{
        '@stdlib/math-base-special-ellipj' = '^0.4.1'
        '@stdlib/math-base-special-ellipk' = '^0.2.4'
        tsx = '^4.20.6'
    }
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $stage 'package.json'), $packageJson + "`n", [System.Text.UTF8Encoding]::new($false))

$revision = $null
$dirty = $null
try {
    $revision = (& git -C $repo rev-parse --short HEAD).Trim()
    $dirtyText = & git -C $repo status --porcelain
    $dirty = -not [string]::IsNullOrWhiteSpace(($dirtyText | Out-String))
} catch {
    $revision = 'unknown'
    $dirty = $null
}
$versionLines = @(
    "构建日期: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    "git: $revision"
    "工作区含未提交改动: $dirty"
    '内容: 训练一 1.0.0，实验二 2.0.0，实验四 v2 2.0.0，实验五 v3 3.0.0'
    '本包不含被试会话和采集数据。'
)
[System.IO.File]::WriteAllText((Join-Path $stage '版本.txt'), ($versionLines -join "`r`n") + "`r`n", [System.Text.UTF8Encoding]::new($true))

if (-not $SkipNpm) {
    Write-Host 'Installing the session generator into the collection folder...'
    & npm install --omit=dev --prefix $stage
    if ($LASTEXITCODE -ne 0) {
        throw 'npm install failed in the collection folder.'
    }
}

if (-not $SkipWheels) {
    $wheelhouse = Join-Path $stage 'wheelhouse'
    New-Item -ItemType Directory -Force -Path $wheelhouse | Out-Null
    $venvPython = Join-Path $eyeSource '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $venvPython) {
        $python = $venvPython
    } else {
        $python = 'py'
    }
    Write-Host 'Downloading Windows wheels for offline Python install...'
    # Official PyPI stalled on the large wheels from this network. The Tsinghua mirror
    # carries the same files and is what the collection package was built with.
    $pipDownload = @('-m', 'pip', 'download', '--disable-pip-version-check', '--timeout', '60', '--retries', '2',
        '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple', '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
        '-r', (Join-Path $eyeDest 'requirements.txt'), '-d', $wheelhouse)
    if ($python -eq 'py') {
        & py -3.11 @pipDownload
    } else {
        & $python @pipDownload
    }
    if ($LASTEXITCODE -ne 0) {
        throw 'pip download failed. Re-run with -SkipWheels to build an online-install package.'
    }
}

if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
}
Write-Host "Creating $zip"
# bsdtar -a crashes on the Chinese filenames in this package. Python's zipfile writes them as UTF-8.
$pythonZip = if (Test-Path -LiteralPath (Join-Path $eyeSource '.venv\Scripts\python.exe')) {
    Join-Path $eyeSource '.venv\Scripts\python.exe'
} else {
    'py'
}
$zipScript = @'
import os, sys, zipfile
from pathlib import Path
root = Path(sys.argv[1])
out = Path(sys.argv[2])
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            path = Path(dirpath) / name
            archive.write(path, path.relative_to(root.parent).as_posix())
print(out.stat().st_size)
'@
if ($pythonZip -eq 'py') {
    & py -3.11 -c $zipScript $stage $zip
} else {
    & $pythonZip -c $zipScript $stage $zip
}
if ($LASTEXITCODE -ne 0) {
    throw "Could not create $zip"
}

Write-Host "Folder: $stage"
Write-Host "Zip: $zip"

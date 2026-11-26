# Build a Windows 10/11 folder that runs by double-click, without installing Python or Node.
# Output: release/IntuitionEye-Win and release/IntuitionEye-Win-<date>.zip
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$eyeSource = Join-Path $repo 'eye_movement_version'
$stageParent = Join-Path $repo 'release'
$stage = Join-Path $stageParent 'IntuitionEye-Win'
$stamp = Get-Date -Format 'yyyyMMdd'
$zip = Join-Path $stageParent "IntuitionEye-Win-$stamp.zip"
$pythonSource = & py -3.11 -c "import sys; print(sys.base_prefix)"
$pythonSource = $pythonSource.Trim()
if (-not (Test-Path -LiteralPath (Join-Path $pythonSource 'python.exe'))) {
    throw "Python 3.11 was not found at $pythonSource"
}

function Copy-Tree([string]$Source, [string]$Destination) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NC /NS /NP /XD __pycache__ .venv sessions data tests | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    if ($code -ge 8) { throw "robocopy failed ($code): $Source" }
}

if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Write-Host 'Copying a private Python 3.11 runtime...'
$pyDest = Join-Path $stage 'runtime\python'
New-Item -ItemType Directory -Force -Path $pyDest | Out-Null
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& robocopy $pythonSource $pyDest /E /NFL /NDL /NJH /NJS /NC /NS /NP /XD Doc include libs Tools | Out-Null
$code = $LASTEXITCODE
$ErrorActionPreference = $previous
if ($code -ge 8) { throw "robocopy failed ($code): Python runtime" }

$py = Join-Path $pyDest 'python.exe'
Write-Host 'Installing PsychoPy and EyeLink into the private runtime...'
& $py -m pip install --disable-pip-version-check --timeout 120 --retries 3 `
    -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn `
    -r (Join-Path $eyeSource 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'pip install into the private runtime failed.' }

Write-Host 'Copying Node...'
$nodeDest = Join-Path $stage 'runtime\node'
New-Item -ItemType Directory -Force -Path $nodeDest | Out-Null
Copy-Item -LiteralPath 'D:\Nodejs\node.exe' -Destination (Join-Path $nodeDest 'node.exe')

Write-Host 'Copying the experiment...'
Copy-Tree (Join-Path $repo 'src') (Join-Path $stage 'src')
$eyeDest = Join-Path $stage 'eye_movement_version'
New-Item -ItemType Directory -Force -Path $eyeDest | Out-Null
foreach ($name in @('run_experiment.py', 'requirements.txt', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $eyeSource $name) -Destination (Join-Path $eyeDest $name)
}
Copy-Tree (Join-Path $eyeSource 'config') (Join-Path $eyeDest 'config')
Copy-Tree (Join-Path $eyeSource 'assets') (Join-Path $eyeDest 'assets')
Copy-Tree (Join-Path $eyeSource 'intuition_eye') (Join-Path $eyeDest 'intuition_eye')
$toolsDest = Join-Path $eyeDest 'tools'
New-Item -ItemType Directory -Force -Path $toolsDest | Out-Null
foreach ($name in @('exportSession.ts', 'behaviorColumns.ts')) {
    Copy-Item -LiteralPath (Join-Path $eyeSource "tools\$name") -Destination (Join-Path $toolsDest $name)
}

$packageJson = @{
    name = 'intuition-eye-win'
    private = $true
    type = 'module'
    dependencies = [ordered]@{
        '@stdlib/math-base-special-ellipj' = '^0.4.1'
        '@stdlib/math-base-special-ellipk' = '^0.2.4'
        tsx = '^4.20.6'
    }
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $stage 'package.json'), $packageJson + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Host 'Installing the session generator...'
& npm install --omit=dev --prefix $stage
if ($LASTEXITCODE -ne 0) { throw 'npm install failed in the standalone folder.' }

$launcher = @'
@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PYTHONDONTWRITEBYTECODE=1"
set "PATH=%~dp0runtime\node;%~dp0runtime\python;%~dp0runtime\python\Scripts;%PATH%"
echo Opening the experiment window...
"%~dp0runtime\python\python.exe" "%~dp0eye_movement_version\run_experiment.py"
set CODE=%ERRORLEVEL%
echo.
if "%CODE%"=="0" (
  echo The program has finished.
) else if "%CODE%"=="130" (
  echo The experiment was stopped. Partial data remains in eye_movement_version\data\.
) else (
  echo The program exited with code %CODE%. Send this window text and the data folder to the maintainer.
)
pause
exit /b %CODE%
'@
[System.IO.File]::WriteAllText((Join-Path $stage '启动实验.bat'), $launcher, [System.Text.UTF8Encoding]::new($false))

$readme = @'
# 直觉物理眼动实验 · Windows 10 / 11 直接运行版

这是一份不用安装 Python、不用安装 Node.js 的采集程序。适用于 64 位 Windows 10 和 Windows 11。

## 怎么打开

1. 把整个文件夹解压到较短的路径，例如 `D:\IntuitionEye`。不要只拷贝里面的某一个子文件夹。
2. 双击 **`启动实验.bat`**。
3. 在启动窗口里填写实验、被试序号、性别、年龄和眼动仪，然后点「开始实验」。

正式眼动数据在「眼动仪」一栏选 **eyelink**。采集电脑需要用网线连上 SR Research EyeLink 主机，程序默认连接 `100.1.1.1`。没有眼动仪时选 **dummy**，可以看流程，但不会生成 EDF。

## 作答和数据

- 空格翻过指导语，并在需要时确认回答。
- 实验二、实验四、训练一用鼠标报告角度或速度，再按空格或回车确认。
- 实验五：可以到达按 F，不可以到达按 J。
- Esc 中止实验。已经写入的记录会留下，但这不是一份完整数据，应整段重做。
- 不要最小化实验窗口，也不要 Alt+Tab 切走。窗口失焦后，当前试次会整段重做。

每次运行单独占一个文件夹：

```text
eye_movement_version\data\<被试编号>\<实验>\...
```

交回时拷走整个运行文件夹。`recording.edf` 只有成功从 EyeLink 主机传回时才会出现。

被试序号填 1–9999。同一人做不同实验时用同一个序号。性别：0 男，1 女。年龄：1–120。窗口大小默认 80%。
'@
[System.IO.File]::WriteAllText((Join-Path $stage '使用说明.txt'), $readme, [System.Text.UTF8Encoding]::new($true))

$revision = 'unknown'
try { $revision = (& git -C $repo rev-parse --short HEAD).Trim() } catch { }
$version = @(
    "构建日期: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    "git: $revision"
    '平台: Windows 10 / Windows 11，64 位'
    '内容: 训练一 1.0.0，实验二 2.0.0，实验四 v2 2.0.0，实验五 v3 3.0.0'
    '运行方式: 双击 启动实验.bat。本包自带 Python 3.11 与 Node，不需要再安装。'
    '本包不含被试会话和采集数据。'
)
[System.IO.File]::WriteAllText((Join-Path $stage '版本.txt'), ($version -join "`r`n") + "`r`n", [System.Text.UTF8Encoding]::new($true))

Write-Host 'Checking imports...'
& $py -c "import tkinter, psychopy, numpy, pylink; print('imports-ok')"
if ($LASTEXITCODE -ne 0) { throw 'The private runtime cannot import the experiment libraries.' }

if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Write-Host "Creating $zip"
$zipScript = Join-Path $PSScriptRoot 'zip_release.py'
& $py $zipScript $stage $zip
if ($LASTEXITCODE -ne 0) { throw "Could not create $zip" }
Write-Host "Folder: $stage"
Write-Host "Zip: $zip"

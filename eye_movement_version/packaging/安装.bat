@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo  直觉物理眼动实验 · 安装
echo ========================================
echo.

where py >nul 2>&1
if errorlevel 1 (
  echo 未找到 Python Launcher py.exe。
  echo 请安装 Python 3.11 64 位，并勾选 py launcher。
  goto fail
)
py -3.11 -c "import struct,sys; assert sys.version_info[:2]==(3,11); assert struct.calcsize('P')==8"
if errorlevel 1 (
  echo 未找到 64 位 Python 3.11。请安装 python.org 的 Windows x86-64 安装包。
  goto fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 20 或更高版本的 64 位安装包。
  goto fail
)
where npm >nul 2>&1
if errorlevel 1 (
  echo 未找到 npm。请重新安装 Node.js，安装时保留 npm。
  goto fail
)

if not exist "eye_movement_version\.venv\Scripts\python.exe" (
  echo 正在安装 Python 实验环境...
  if exist "wheelhouse\" (
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\eye_movement_version\install.ps1" -Wheelhouse "%~dp0wheelhouse"
  ) else (
    echo 未找到离线安装包 wheelhouse，将从网络安装 Python 依赖。
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\eye_movement_version\install.ps1"
  )
  if errorlevel 1 goto fail
) else (
  echo 已有 Python 环境，跳过这一步。
)

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo 正在安装会话生成器...
  call npm install --omit=dev
  if errorlevel 1 goto fail
) else (
  echo 会话生成器已就绪。
)

echo.
echo 安装完成。采集时请双击「启动实验.bat」。
echo 这一步只确认软件已装上，尚未连接或校准眼动仪。
pause
exit /b 0

:fail
echo.
echo 安装未完成。请把本窗口的文字发给程序维护者。
pause
exit /b 1

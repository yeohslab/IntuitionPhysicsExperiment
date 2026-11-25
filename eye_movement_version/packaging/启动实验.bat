@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist "eye_movement_version\.venv\Scripts\python.exe" (
  echo 尚未安装 Python 环境。请先双击「安装.bat」。
  pause
  exit /b 1
)
if not exist "node_modules\tsx\dist\cli.mjs" (
  echo 会话生成器尚未安装。请先双击「安装.bat」。
  pause
  exit /b 1
)

echo 正在打开实验启动窗口...
"eye_movement_version\.venv\Scripts\python.exe" "eye_movement_version\run_experiment.py"
set CODE=%ERRORLEVEL%
echo.
if "%CODE%"=="0" (
  echo 本次程序已结束。
) else if "%CODE%"=="130" (
  echo 实验已中止。已经写入的数据仍在 eye_movement_version\data\ 中，但这不是一份完整数据。
) else (
  echo 程序退出码 %CODE%。请把本窗口文字和对应的 data 文件夹一起发给程序维护者。
)
pause
exit /b %CODE%

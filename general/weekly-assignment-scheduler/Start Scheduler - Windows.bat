@echo off
setlocal
title Weekly Assignment Scheduler
cd /d "%~dp0"

rem ---- Find Python 3.9 or newer --------------------------------------
set "PY="
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto have_python
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=python"
if defined PY goto have_python

echo.
echo  Python is not installed yet.
echo  1. Install it from https://www.python.org/downloads/
echo     On the first screen of the installer, tick "Add python.exe to PATH".
echo  2. Then double-click this file again.
echo.
start "" "https://www.python.org/downloads/"
pause
exit /b 1

:have_python
rem ---- First time only: a private copy of Flask in the .venv folder --
if exist ".venv\Scripts\python.exe" goto have_venv
echo First-time setup, this takes a minute...
%PY% -m venv .venv
if errorlevel 1 goto setup_failed

:have_venv
".venv\Scripts\python.exe" -c "import flask" >nul 2>nul
if not errorlevel 1 goto run
echo Installing Flask, needs the internet this one time...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 goto setup_failed

:run
rem To let tablets on your Wi-Fi open it too, change the next line to:  app.py --share
".venv\Scripts\python.exe" app.py
pause
exit /b 0

:setup_failed
echo.
echo  Setup didn't finish. Check the internet connection and double-click this file again.
echo  If it keeps failing, delete the .venv folder next to this file and try once more.
pause
exit /b 1

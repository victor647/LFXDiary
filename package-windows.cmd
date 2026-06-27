@echo off
setlocal

cd /d "%~dp0"

echo.
echo Diary Book Windows packaging
echo ============================
echo.

if not exist node_modules (
  echo node_modules not found. Running npm install first...
  call npm.cmd install
  if errorlevel 1 goto fail
  echo.
)

echo Building Windows installer and zip...
call npm.cmd run desktop:dist:win
if errorlevel 1 goto fail

echo.
echo Done.
echo Output folder:
echo %LOCALAPPDATA%\LFXDiary\release
echo.
pause
exit /b 0

:fail
echo.
echo Packaging failed. See the error above.
echo.
pause
exit /b 1

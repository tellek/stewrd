@echo off
setlocal

set "SRC=%~dp0src-tauri\target\release"
set "DEST=C:\Utilities\stewrd"

echo Stopping running stewrd...
taskkill /IM stewrd.exe /F >nul 2>&1

echo Building release...
call npm run tauri build
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

echo Deploying to %DEST% (skipping user-generated files)...
if not exist "%DEST%" mkdir "%DEST%"

rem make sure nothing is holding the deployed exe open before we overwrite it
taskkill /IM stewrd.exe /F >nul 2>&1

rem exe: always overwrite with the freshly built one
robocopy "%SRC%" "%DEST%" stewrd.exe /R:3 /W:2 >nul

rem resources: not user-editable, always overwrite
robocopy "%SRC%\resources" "%DEST%\resources" /E /R:3 /W:2 >nul

rem assets (category icons etc.): only add files the user doesn't already have,
rem never touch existing files (icons/templates/themes the user may have customized)
robocopy "%SRC%\assets" "%DEST%\assets" /E /XC /XN /XO /R:3 /W:2 >nul

echo Restarting stewrd from %DEST%...
start "" "%DEST%\stewrd.exe"

echo Done.
endlocal

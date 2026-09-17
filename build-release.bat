@echo off
setlocal

set REPO=%~dp0
set DEPLOY=C:\Utilities\stewrd
set RELEASE=%REPO%src-tauri\target\release

echo Closing running stewrd...
taskkill /IM stewrd.exe /F >nul 2>&1

echo Building release...
cd /d "%REPO%"
call npx tauri build
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

echo Deploying to %DEPLOY%...
if not exist "%DEPLOY%" mkdir "%DEPLOY%"

rem everything except build artifacts and the user-customizable assets dir
robocopy "%RELEASE%" "%DEPLOY%" /E /XF *.pdb *.lib *.exp *.rlib /XD deps build incremental .fingerprint examples wix nsis bundle assets /NFL /NDL /NJH /NJS
if %errorlevel% geq 8 (
    echo Deploy copy failed.
    exit /b 1
)

rem assets (category icons etc.): only add files the user doesn't already have,
rem never touch existing files (icons the user may have customized)
robocopy "%RELEASE%\assets" "%DEPLOY%\assets" /E /XC /XN /XO /NFL /NDL /NJH /NJS
if %errorlevel% geq 8 (
    echo Asset deploy failed.
    exit /b 1
)

echo Done.
endlocal

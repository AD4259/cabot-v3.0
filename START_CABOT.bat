@echo off
title CABot — Setup & Launch
color 0B

echo.
echo  ==========================================================
echo    CABot — AI Chartered Accountant  v3.1
echo    Indian CA Setup Script
echo  ==========================================================
echo.

REM ── Find Ollama ──────────────────────────────────────────────
set "OLLAMA_EXE="
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Ollama"
)
if exist "%APPDATA%\Local\Programs\Ollama\ollama.exe" (
    set "OLLAMA_EXE=%APPDATA%\Local\Programs\Ollama\ollama.exe"
)
where ollama >nul 2>&1
if %errorlevel% == 0 (
    set "OLLAMA_EXE=ollama"
)

if "%OLLAMA_EXE%"=="" (
    color 0C
    echo  [ERROR] Ollama not found!
    echo.
    echo  Please install Ollama first:
    echo  1. Go to: https://ollama.com/download
    echo  2. Download OllamaSetup.exe
    echo  3. Run the installer
    echo  4. Come back and run this script again
    echo.
    pause
    exit /b 1
)

echo  [OK] Ollama found at: %OLLAMA_EXE%
echo.

REM ── Start Ollama Service ──────────────────────────────────────
echo  [Step 1] Starting Ollama service...
start /B "" "%OLLAMA_EXE%" serve >nul 2>&1
timeout /t 4 /nobreak >nul

REM ── Download llama3.2 if not present ─────────────────────────
echo  [Step 2] Checking for base AI model (llama3.2)...
"%OLLAMA_EXE%" list 2>&1 | findstr "llama3.2" >nul
if %errorlevel% neq 0 (
    echo.
    echo  [DOWNLOAD] Downloading llama3.2 model (~2GB)...
    echo  This will take 5-15 minutes depending on your internet.
    echo  Please do NOT close this window.
    echo.
    "%OLLAMA_EXE%" pull llama3.2
    if %errorlevel% neq 0 (
        echo  [WARN] llama3.2 failed, trying llama3.2:1b (smaller, faster)...
        "%OLLAMA_EXE%" pull llama3.2:1b
    )
) else (
    echo  [OK] llama3.2 already installed.
)

REM ── Create custom CABot model ─────────────────────────────────
echo.
echo  [Step 3] Building custom CABot model with Indian CA knowledge...
if exist "%~dp0Modelfile" (
    "%OLLAMA_EXE%" create cabot -f "%~dp0Modelfile"
    if %errorlevel% == 0 (
        echo  [OK] CABot model created successfully!
    ) else (
        echo  [WARN] Custom model creation had issues - will use llama3.2 directly.
    )
) else (
    echo  [WARN] Modelfile not found - skipping custom model creation.
)

REM ── Install Node dependencies ─────────────────────────────────
echo.
echo  [Step 4] Installing Node.js dependencies...
cd /d "%~dp0"
call npm install --silent
echo  [OK] Dependencies installed.

REM ── Start CABot Server ────────────────────────────────────────
echo.
echo  [Step 5] Starting CABot server...
echo.
echo  ==========================================================
echo    CABot is READY!
echo    Open your browser and go to: http://localhost:3000
echo  ==========================================================
echo.
start "" "http://localhost:3000"
node server.js

pause

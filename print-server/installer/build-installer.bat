@echo off
echo.
echo  ========================================
echo    ERP Azul - Generar Instalador
echo  ========================================
echo.

:: Paso 1: Compilar el .exe con pkg
echo  [1/2] Compilando ERP-Imprimir.exe ...
cd /d "%~dp0.."
if not exist "node_modules" (
    call npm install
)
call npx pkg . --targets node18-win-x64 --output dist\ERP-Imprimir.exe --compress GZip

if not exist "dist\ERP-Imprimir.exe" (
    echo.
    echo  ERROR: No se pudo compilar ERP-Imprimir.exe
    echo.
    pause
    exit /b 1
)
echo  [OK] ERP-Imprimir.exe compilado

:: Paso 2: Generar instalador con Inno Setup
echo.
echo  [2/2] Generando instalador con Inno Setup ...
cd /d "%~dp0"

:: Buscar Inno Setup en ubicaciones comunes
set "ISCC="
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
)

if "%ISCC%"=="" (
    echo.
    echo  ERROR: Inno Setup 6 no encontrado.
    echo  Descargalo gratis de: https://jrsoftware.org/isdl.php
    echo  Instala con las opciones por defecto y volve a ejecutar este script.
    echo.
    pause
    exit /b 1
)

:: Generar icono si no existe
if not exist "icon.ico" (
    echo  [INFO] No se encontro icon.ico, se usara icono por defecto.
    echo  Para personalizar, coloca un icon.ico en la carpeta installer/
)

:: Compilar el instalador
"%ISCC%" setup.iss

if %errorLevel% neq 0 (
    echo.
    echo  ERROR: Fallo la compilacion del instalador.
    echo.
    pause
    exit /b 1
)

:: Paso 3: Copiar al public/downloads del ERP para descarga desde el front
set "PUBLIC_DL=%~dp0..\..\public\downloads"
if not exist "%PUBLIC_DL%" mkdir "%PUBLIC_DL%"
copy /Y "output\ERP-Azul-Printer-Setup.exe" "%PUBLIC_DL%\ERP-Azul-Printer-Setup.exe" >nul 2>&1
if %errorLevel% equ 0 (
    echo  [OK] Copiado a public/downloads/ para descarga desde el ERP
) else (
    echo  [AVISO] No se pudo copiar a public/downloads/
)

echo.
echo  ========================================
echo    LISTO
echo  ========================================
echo.
echo  El instalador esta en:
echo    installer\output\ERP-Azul-Printer-Setup.exe
echo.
echo  Tambien se copio a public\downloads\ para
echo  que los usuarios lo descarguen desde el ERP.
echo.
pause

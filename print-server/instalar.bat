@echo off
echo.
echo  ========================================
echo    Instalador - ERP Azul Print Server
echo  ========================================
echo.

:: Requiere permisos de admin para Task Scheduler
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  Este instalador necesita permisos de administrador.
    echo  Click derecho ^> Ejecutar como administrador.
    echo.
    pause
    exit /b 1
)

:: Crear carpeta de instalacion
set "INSTALL_DIR=%ProgramData%\ERP-Imprimir"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Buscar el .exe junto al instalador
set "EXE_SRC=%~dp0ERP-Imprimir.exe"
if not exist "%EXE_SRC%" (
    :: Buscar en dist/ (si se ejecuta desde el proyecto)
    set "EXE_SRC=%~dp0dist\ERP-Imprimir.exe"
)
if not exist "%EXE_SRC%" (
    echo  ERROR: No se encontro ERP-Imprimir.exe
    echo  Primero ejecuta build.bat para compilar el ejecutable.
    echo.
    pause
    exit /b 1
)

:: Detener instancia anterior si esta corriendo
taskkill /F /IM ERP-Imprimir.exe >nul 2>&1

:: Copiar ejecutable
copy /Y "%EXE_SRC%" "%INSTALL_DIR%\ERP-Imprimir.exe" >nul
echo  [OK] Copiado a %INSTALL_DIR%\ERP-Imprimir.exe

:: Eliminar tarea anterior si existe
schtasks /Delete /TN "ERP-Imprimir" /F >nul 2>&1

:: Crear tarea programada: inicia con Windows, para cualquier usuario
schtasks /Create /TN "ERP-Imprimir" /TR "\"%INSTALL_DIR%\ERP-Imprimir.exe\"" /SC ONLOGON /RL HIGHEST /F >nul 2>&1

if %errorLevel% equ 0 (
    echo  [OK] Inicio automatico configurado (Task Scheduler)
) else (
    echo  [AVISO] No se pudo crear la tarea programada.
    echo          El servidor se puede iniciar manualmente ejecutando ERP-Imprimir.exe
)

:: Iniciar ahora
echo.
echo  Iniciando servidor de impresion...
start "" "%INSTALL_DIR%\ERP-Imprimir.exe"

echo.
echo  Instalacion completa.
echo.
echo  Siguiente paso:
echo    Abri el ERP ^> Configuracion ^> Impresora termica
echo    Elegi tu impresora y hace click en "Guardar"
echo.
pause

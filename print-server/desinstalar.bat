@echo off
echo.
echo  Desinstalando ERP Azul Print Server...
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  Ejecutar como administrador.
    pause
    exit /b 1
)

:: Detener proceso
taskkill /F /IM ERP-Imprimir.exe >nul 2>&1
echo  [OK] Proceso detenido

:: Eliminar tarea programada
schtasks /Delete /TN "ERP-Imprimir" /F >nul 2>&1
echo  [OK] Tarea programada eliminada

:: Eliminar archivos
set "INSTALL_DIR=%ProgramData%\ERP-Imprimir"
if exist "%INSTALL_DIR%" (
    rmdir /S /Q "%INSTALL_DIR%"
    echo  [OK] Archivos eliminados
)

:: Limpiar acceso directo viejo por si quedo de version anterior
set "SHORTCUT=%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup\ERP-Imprimir.lnk"
if exist "%SHORTCUT%" del "%SHORTCUT%"

echo.
echo  Desinstalacion completa.
echo.
pause

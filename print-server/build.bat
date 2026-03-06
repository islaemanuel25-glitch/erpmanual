@echo off
echo.
echo  Compilando ERP-Imprimir.exe ...
echo.
call npm install
call npx pkg . --targets node18-win-x64 --output dist\ERP-Imprimir.exe --compress GZip
echo.
if exist dist\ERP-Imprimir.exe (
    echo  OK: dist\ERP-Imprimir.exe creado
    echo.
    echo  Para instalar, copiar dist\ERP-Imprimir.exe a la PC del kiosco
    echo  y ejecutar: ERP-Imprimir.exe
) else (
    echo  ERROR: no se pudo crear el ejecutable
)
echo.
pause

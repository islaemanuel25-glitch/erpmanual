# ERP Azul - Servidor de Impresion

Imprime tickets directamente en la impresora termica USB sin pasar por el navegador.

## Para el desarrollador (compilar)

En la carpeta print-server:

```
1. Doble click en build.bat
2. Esperar a que termine
3. El ejecutable queda en dist/ERP-Imprimir.exe
```

## Para el kiosco (instalar)

```
1. Copiar ERP-Imprimir.exe e instalar.bat a la PC del kiosco
2. Doble click en instalar.bat (como administrador)
3. Listo: se instala y arranca automaticamente con Windows
```

## Configurar impresora

Desde el ERP:
1. Ir a Configuracion
2. En la seccion "Impresora termica" aparecen las impresoras de Windows
3. Elegir la impresora (ej: "Generic / Text Only")
4. Elegir ancho de papel (58mm o 80mm)
5. Click en "Guardar"
6. Click en "Imprimir prueba" para verificar

## Como funciona

- ERP-Imprimir.exe corre en background escuchando en localhost:17777
- Cuando el vendedor toca "Imprimir ticket (termica nativa)" en el POS, el ERP envia los datos del ticket al servidor local
- El servidor convierte los datos a comandos ESC/POS y los envia a la impresora
- Si el servidor no esta corriendo, el vendedor puede usar "Imprimir ticket (navegador)" como alternativa

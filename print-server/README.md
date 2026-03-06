# ERP Azul - Servidor de Impresion

Imprime tickets directamente en la impresora termica USB sin pasar por el navegador.

## Para el desarrollador (generar instalador)

### Requisitos (una sola vez)

1. **Node.js** — para compilar el .exe
2. **Inno Setup 6** — descarga gratis de https://jrsoftware.org/isdl.php (instalar con opciones por defecto)

### Generar el instalador

```
Doble click en: print-server/installer/build-installer.bat
```

Esto hace todo automaticamente:
1. Compila `ERP-Imprimir.exe` con pkg
2. Genera `ERP-Azul-Printer-Setup.exe` con Inno Setup
3. El instalador queda en `installer/output/ERP-Azul-Printer-Setup.exe`

Ese unico archivo es lo que se entrega al cliente.

## Para el cliente (instalar)

```
1. Doble click en ERP-Azul-Printer-Setup.exe
2. Seguir el asistente (Siguiente > Siguiente > Instalar)
3. Listo — el servidor queda corriendo y arranca con Windows
```

El cliente NO necesita terminal, npm, ni ningun paso manual.

### Configurar impresora

Desde el ERP:
1. Ir a Configuracion
2. En la seccion "Impresora termica" aparecen las impresoras de Windows
3. Elegir la impresora (ej: "Generic / Text Only")
4. Elegir ancho de papel (58mm o 80mm)
5. Click en "Guardar"
6. Click en "Imprimir prueba" para verificar

### Desinstalar

Panel de Control > Programas > "ERP Azul - Impresion" > Desinstalar

## Como funciona

- ERP-Imprimir.exe corre en background escuchando en localhost:17777
- Cuando el vendedor toca "Imprimir ticket (termica nativa)" en el POS, el ERP envia los datos del ticket al servidor local
- El servidor convierte los datos a comandos ESC/POS y los envia a la impresora
- Se inicia automaticamente con Windows via registro de Windows
- Si el servidor no esta corriendo, el vendedor puede usar "Imprimir ticket (navegador)" como alternativa

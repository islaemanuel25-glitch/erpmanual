# Auditoría: Ticket térmico POS (ESC/POS) — Mapa y plan

**Objetivo:** Mejorar el ticket para que sea “tipo ticket lindo” (alto contraste, jerarquía visual, columnas alineadas, TOTAL en grande/negrita, formato producto + cant x precio y subtotal).  
**Alcance:** Solo auditoría/mapa; no se modifica código.

---

## A) Tabla de archivos y responsabilidades

| Path | Responsabilidad |
|------|-----------------|
| **app/modulos/pos-ventas/page.jsx** | Tras cobrar exitoso: arma el objeto `ventaTicket` (numero, items, subtotal, descuento, total, formaPago, vendedor, localNombre, pagaCon, vuelto) y abre el modal de ticket. Al elegir “termica” llama a `imprimirTicketTermico(state.modalTicket)`. En reimpresión desde HistorialDia pasa un objeto con la misma forma (numero, items, subtotal, descuento, total, formaPago, vendedor, localNombre). |
| **components/pos-ventas/ModalTicket.jsx** | Modal post-venta con tres opciones: “Imprimir ticket (termica)”, “Descargar PDF”, “No imprimir”. Al hacer clic en “termica” invoca `onOpcion("termica")` → en page.jsx se ejecuta `imprimirTicketTermico(state.modalTicket)`. |
| **components/pos-ventas/HistorialDia.jsx** | Lista ventas del día; en detalle del ticket tiene botón “Reimprimir” que llama `onReimprimir(venta)`; el padre (page.jsx) pasa un handler que invoca `imprimirTicketTermico({ ...venta, vendedor, localNombre })`. |
| **lib/pos-ventas/imprimirTicketTermico.js** | **Único lugar donde se “arma” y se “imprime” el ticket térmico.** Genera una cadena HTML completa (DOCTYPE, head con estilos, body con contenido del ticket), abre una ventana nueva (`window.open`), escribe ese HTML en `ventana.document`, cierra el document y en `window.onload` llama `window.print()` y luego `window.close()`. No hay comandos ESC/POS ni envío a impresora por USB/serial/Bluetooth. |
| **lib/pos-ventas/generarTicketPDF.js** | Genera un PDF del ticket con jsPDF (formato A4); se usa cuando el usuario elige “Descargar PDF” en el modal. No interviene en la impresión térmica. |
| **app/modulos/turnos/[id]/page.jsx** | Contiene `imprimirZReport(turno, resumen, movimientos)`: arma HTML de un “Z Report” (cierre de turno) y también usa `window.open` + `document.write(html)` + `window.print()`. Misma técnica que el ticket de venta; no ESC/POS. |

**Conclusión:** En todo el repo **no existe** ningún flujo que envíe comandos ESC/POS a una impresora térmica (ni por node-escpos, ni por Sunmi SDK, ni por serial/USB/Bluetooth). La “impresión térmica” es en realidad **impresión por navegador**: se abre una ventana con HTML formateado para ancho 58 mm u 80 mm y se usa el diálogo de impresión del sistema (`window.print()`). La impresora que el usuario elija (térmica, PDF, etc.) recibe lo que el navegador renderiza (típicamente como gráfico/raster), no una secuencia de bytes ESC/POS.

---

## B) Mapa del flujo completo

```
[POS: usuario cobra]
       │
       ▼
  POST /api/pos-ventas/crear → éxito
       │
       ▼
  page.jsx: arma ventaTicket (numero, items, subtotal, descuento, total, formaPago, vendedor, localNombre, pagaCon, vuelto)
       │
       ▼
  dispatch(OPEN_MODAL { modal: "modalTicket", data: ventaTicket })
       │
       ▼
  ModalTicket se muestra (3 botones: termica | pdf | no imprimir)
       │
       ├─ "termica" ──► handleOpcionTicket("termica")
       │                    │
       │                    ▼
       │               import("@/lib/pos-ventas/imprimirTicketTermico")
       │                    │
       │                    ▼
       │               imprimirTicketTermico(ventaTicket [, ancho=80])
       │                    │
       │                    ▼
       │               Construye string HTML (ver sección C)
       │                    │
       │                    ▼
       │               window.open("", "_blank", "width=400,height=600")
       │                    │
       │                    ▼
       │               ventana.document.write(html); ventana.document.close()
       │                    │
       │                    ▼
       │               (onload) window.print() → diálogo del sistema
       │                    │
       │                    ▼
       │               Usuario elige impresora (térmica / PDF / etc.) → imprime
       │
       ├─ "pdf" ──► generarTicketPDF(ventaTicket) → descarga PDF (jsPDF)
       │
       └─ "no imprimir" ──► cierra modal

[Reimpresión desde Historial]
  HistorialDia → Reimprimir → onReimprimir(venta) → imprimirTicketTermico({ ...venta, vendedor, localNombre })
  (mismo flujo desde imprimirTicketTermico en adelante)
```

**Resumen:** No hay capa “driver” ni “formatter ESC/POS”. El formatter es el HTML generado en `imprimirTicketTermico.js`; el “driver” es el navegador + el controlador de impresión del sistema operativo.

---

## C) Ejemplo del ticket actual (output)

El sistema no genera un buffer ESC/POS ni un string de texto plano; genera **HTML**. Lo que la impresora recibe depende del driver (normalmente el navegador envía la página renderizada como imagen/gráfico). A continuación, el **equivalente en texto** de lo que representa ese HTML (y lo que el usuario vería al imprimir en una térmica como “copia” del contenido):

```
        POS Ventas
       Ticket #142
  20/02/2025, 14:32:15
   Vendedor: Juan Pérez

-------------------------------- (dashed)

Prod.          Cant      Subt
Coca 500ml        2    $1.200,00
Pan lactal        1      $450,50

--------------------------------

Subtotal:        $1.650,50
        TOTAL: $1.650,50
Pago: efectivo

Paga con: $2.000,00
Vuelto: $349,50

--------------------------------
    Gracias por su compra
```

**Estructura HTML actual (resumida):**

- Título: `localNombre` (14px, bold, center).  
- Líneas: Ticket #numero (10px), fecha (10px), “Vendedor: …” (10px).  
- Tabla: thead “Prod.” (left), “Cant” (center), “Subt” (right); tbody una fila por item: `item.nombre` (left), `item.cantidad` (center), `item.precio * item.cantidad` (right).  
- Separador; línea “Subtotal: $…”; div.total “TOTAL: $…” (16px, bold, center); “Pago: formaPago”.  
- Si hay efectivo: “Paga con: $…”, “Vuelto: $…” (16px bold).  
- Separador; “Gracias por su compra” (10px, center).

**Problemas visibles en el diseño actual:**

- Items en una sola fila (nombre | cant | subtotal): no hay “cant x precio” en línea aparte ni subtotal alineado a la derecha en dos líneas.  
- TOTAL es 16px pero en muchos drivers de impresora el bold no se nota mucho.  
- No hay doble altura ni comandos de realce; todo depende del CSS (font-size, font-weight).  
- Ancho de columna no fijo en caracteres; es layout CSS (porcentajes/width), lo que en impresión raster puede verse poco claro.

---

## D) Recomendación exacta de cambios (sin implementar)

### D.1 Si se mantiene solo impresión por navegador (HTML + window.print)

1. **Contraste y jerarquía (CSS)**  
   - Usar `color: #000; font-weight: 700` (o 800) en títulos y TOTAL.  
   - Evitar grises; cuerpo en `#000`, solo si hace falta algo secundario en `#333`.  
   - TOTAL: `font-size` mayor (ej. 18px–20px), `font-weight: 700`, y si el navegador lo soporta, `-webkit-print-color-adjust: exact` para que no se aclare al imprimir.

2. **Layout del detalle de ítems (objetivo “ticket lindo”)**  
   - Por cada ítem:  
     - **Línea 1:** nombre del producto (wrap inteligente: cortar por palabras hasta un máximo de caracteres según ancho, ej. 24 chars para 58 mm, 32 para 80 mm).  
     - **Línea 2:** texto izquierda “CANT x $PRECIO” (ej. “2 x $600,00”) y a la derecha “$SUBTOTAL” (ej. “$1.200,00”), en una misma línea con `display: flex; justify-content: space-between` o tabla de una fila.  
   - Dejar de usar la tabla actual de 3 columnas (Prod | Cant | Subt) y pasar a este bloque de dos líneas por producto.

3. **Títulos centrados**  
   - Nombre del local y “Ticket #N” ya están centrados; mantener y asegurar que “TOTAL” y la línea del monto total estén en un bloque centrado con clase única.

4. **Alineación de columnas**  
   - En HTML: fijar ancho del contenedor en mm (48 mm / 72 mm) y usar fuente monospace (`Courier New` ya está) y tamaños en `mm` o `px` coherentes para que “CANT x PRECIO” y “$SUBTOTAL” alineen bien en la segunda línea de cada ítem.

5. **Ancho y columnas**  
   - Mantener parámetro `ancho` (58 u 80). Para 58 mm usar ~24 caracteres de ancho útil; para 80 mm ~32. En el formatter, truncar/wrap el nombre del producto a ese ancho (por palabras).

6. **No hay comandos ESC/POS que ajustar**  
   - No existe density/heat/speed en código; el “gris” viene del render del navegador y del driver. Mejorar solo con CSS (más bold, más negro, tamaño mayor en TOTAL).

### D.2 Si más adelante se agrega impresión ESC/POS nativa (Sunmi, node-escpos, etc.)

1. **Nuevo módulo formatter**  
   - Función que, a partir del mismo objeto `ventaTicket`, genere un **buffer de bytes** (comandos ESC/POS), no HTML.  
   - Secuencia sugerida:  
     - Inicialización: ESC @ (reset).  
     - Alineación centro: GS ! para títulos; luego ESC a 1 (centrar).  
     - Nombre local: doble altura/doble ancho (FS ! 1 o GS ! 0x30) + texto + volver tamaño normal.  
     - Ticket # y fecha: tamaño normal, centrado.  
     - Separador: línea de guiones (32 o 48 caracteres según ancho).  
     - Items: por cada uno, línea 1: nombre (wrap a 24/32 chars, cortar por palabras); línea 2: ESC a 0 (izq) “CANT x $PRECIO”, luego espacios o tabulación hasta columna fija, “$SUBTOTAL”.  
     - Separador; Subtotal; luego GS ! 0x30 o similar para TOTAL en doble tamaño + bold (ESC E 1) + “TOTAL: $…” + ESC E 0.  
     - Pago, paga con, vuelto; separador; “Gracias por su compra” centrado.  
     - Cortar: GS V 0 o similar.  

2. **Driver**  
   - Según plataforma: Sunmi (SDK del dispositivo), node-escpos (USB/network), o bridge que reciba el buffer y lo envíe por serial/USB/Bluetooth. Esto no existe hoy en el repo.

3. **Density / heat**  
   - En ESC/POS: GS ( K (densidad) o parámetros de calefacción según modelo. Solo aplica cuando exista un camino que envíe comandos ESC/POS; hoy no hay tal camino.

---

## E) Parámetros sugeridos (ancho, chars, density, etc.)

### E.1 Actuales (en código)

| Parámetro | Dónde | Valor |
|-----------|--------|--------|
| Ancho papel | imprimirTicketTermico.js | Argumento `ancho` = 58 o 80 (default 80). |
| Ancho CSS | Mismo archivo | `anchoPx = ancho === 58 ? "48mm" : "72mm"` (body y @page size). |
| Columnas (chars) | No definido | No hay constante; la tabla usa porcentajes (left/center/right). |
| Fuente | CSS | `font-family: 'Courier New', monospace; font-size: 12px` body, 11px tabla, 16px total. |
| Density / heat / speed | — | No existe (no hay ESC/POS). |
| Bold | CSS | `font-weight: bold` en .bold y .total. |

### E.2 Recomendados para “ticket lindo” (HTML actual)

| Parámetro | Valor sugerido | Nota |
|-----------|----------------|------|
| Ancho | 80 mm por defecto; 58 mm opcional | Mantener `ancho` y `anchoPx` como están. |
| Chars por línea | 32 (80 mm), 24 (58 mm) | Usar para wrap del nombre y para alinear “CANT x PRECIO” y “$SUBTOTAL” (ej. 32 caracteres = 16 + 16 o 20 + 12). |
| Fuente cuerpo | 11px–12px, Courier New, color #000 | Asegurar `color: #000` en body. |
| Títulos (local, Ticket #) | 14px, font-weight: 700 | Ya 14px; subir a 700 si hace falta. |
| TOTAL | 18px–20px, font-weight: 700 | Más grande y muy negrita. |
| Line spacing | line-height: 1.2–1.3 en items | Separar un poco las dos líneas por ítem. |
| Bold | font-weight: 700 en total y encabezados | Mejor contraste que 600. |
| Double size | Solo en HTML: font-size 2em en TOTAL | No hay ESC/POS “double size”; en HTML se simula con em/px. |
| Density / heat / speed | N/A | No aplica hasta tener envío ESC/POS. |

### E.3 Si se implementara ESC/POS más adelante

| Comando / concepto | Uso |
|--------------------|-----|
| ESC @ | Reset al inicio. |
| ESC a 0 / 1 / 2 | Alineación izquierda / centro / derecha. |
| ESC E 1 / 0 | Bold on/off. |
| GS ! 0x10 / 0x20 / 0x30 | Doble altura / doble ancho / doble altura y ancho (títulos, TOTAL). |
| GS ( K (params) | Densidad (según manual de la impresora). |
| Line spacing | ESC 3 n (avance de línea n dots) o similar. |
| Ancho 58 mm | ~24 caracteres (font 12 cpi); 80 mm ~32. |
| Cortar | GS V 0 (full cut) o GS V 1 (partial). |

---

## F) Por qué puede verse “gris” o “flojo”

1. **No hay ESC/POS:** La impresora no recibe texto ni comandos nativos; recibe lo que el navegador envía (normalmente una imagen/raster de la página). Eso suele imprimirse más suave que el texto nativo en muchas térmicas.  
2. **CSS:** `font-weight: bold` (400→700) en algunos drivers se traduce poco; conviene usar 700 u 800 y comprobar en la impresora real.  
3. **Color:** Si en algún lugar hubiera gris (`#666`, etc.) o el navegador aplicara “optimización” al imprimir, se aclara; forzar `color: #000` y, si hace falta, `-webkit-print-color-adjust: exact`.  
4. **No hay comandos de density/heat:** En un flujo ESC/POS real se podría subir densidad o calor; en el flujo actual (solo HTML + print) no existe esa posibilidad en código.  
5. **Tamaño de fuente:** 12px/11px en papel chico puede verse fino; aumentar un poco y sobre todo el TOTAL (18–20px) mejora la lectura.

---

## Resumen

- **Archivos clave:** `lib/pos-ventas/imprimirTicketTermico.js` (generación del ticket e “impresión” vía ventana + `window.print()`), `app/modulos/pos-ventas/page.jsx` (origen de los datos y llamada a imprimir), `components/pos-ventas/ModalTicket.jsx` y `HistorialDia.jsx` (disparan la impresión).  
- **Flujo:** UI (Cobrar → modal ticket → “termica”) → `imprimirTicketTermico(venta)` → HTML string → ventana nueva → `window.print()`. No hay driver ESC/POS ni librería térmica.  
- **Ancho:** 58 mm (48mm CSS) u 80 mm (72mm CSS); columnas en caracteres no están fijadas (recomendado 24 / 32).  
- **Ticket actual:** HTML con tabla de 3 columnas (Prod | Cant | Subt), TOTAL 16px bold, sin formato “nombre + cant x precio / subtotal” en dos líneas.  
- **Objetivo:** En el HTML: alto contraste (#000, bold 700), TOTAL más grande (18–20px), ítems en dos líneas (nombre; “CANT x PRECIO” + “$SUBTOTAL” alineado a derecha), títulos centrados, wrap del nombre por ancho en caracteres. Si más adelante se agrega ESC/POS, implementar un formatter a buffer y usar comandos de alineación, bold, doble tamaño y corte.  
- **Gris/flojo:** Por impresión raster desde el navegador y posible poca aplicación del bold; no por density/heat en código (no existen). Mejorar con CSS (más bold, más negro, TOTAL más grande) y, a largo plazo, considerar un camino ESC/POS nativo para mejor calidad en térmica real.

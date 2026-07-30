# Módulo: Reportes de Ventas

**Última actualización:** 2026-07-30 08:03
**Archivos principales:** `app/modulos/reportes-ventas/*`, `components/reportes-ventas/*`, `app/api/reportes-ventas/*`, `lib/reportes-ventas/*`

## Descripción
Análisis de ventas del período con resumen financiero, desglose por forma de pago y productos más vendidos, más el listado venta por venta (o agrupado por cliente). Desde el listado se entra al detalle completo de cada venta ("Ver venta"), y desde ahí a la corrección de la venta.

Todo el flujo son **páginas navegables reales**: no hay modales grandes ni overlays. El flujo modal anterior (detalle y revisión de corrección dentro de `SunmiModalLayout` / `createPortal` con `fixed inset-0 z-[10000]`) fue eliminado. Se conservan solo modales chicos: corrección simple y confirmaciones.

## Ubicación
- Listado: `app/modulos/reportes-ventas/page.jsx`
- Detalle "Ver venta": `app/modulos/reportes-ventas/[ventaId]/page.jsx`
- Corrección completa: `app/modulos/reportes-ventas/[ventaId]/corregir/page.jsx`
- APIs: `app/api/reportes-ventas/general`, `listado`, `por-cliente`, `detalle/[id]`
- Componentes: `components/reportes-ventas/VentaDetalleAdmin.jsx`, `AccionesTicket.jsx`, `ReporteVentasPorCliente.jsx`, `EditorVentaCorreccion.jsx`, `LineaEditableCard.jsx`
- Helpers puros: `lib/reportes-ventas/returnParams.js`, `correccionDirty.js`, `modoLineaDeposito.js`

## Funcionalidad principal

### Listado (`/modulos/reportes-ventas`)
- Filtros compactos en una franja: desde, hasta, forma de pago y "Generar reporte"
- Resumen financiero en cards con icono y color semántico: ventas, total bruto, comisiones, neto recibido y ganancia neta (destacada)
- Desglose por forma de pago (tabla)
- Ventas del período con dos vistas en tabs segmentadas:
  - **Por venta**: tabla en desktop (cliente protagonista y ticket como referencia secundaria, local + cajero, ítems, forma de pago, estado, total) y cards en móvil. Paginación de 50
  - **Por cliente**: acordeón por cliente con total acumulado, tickets, unidades y última compra; al expandir muestra el desglose de pagos y el sublistado de tickets
- Productos más vendidos con margen coloreado por tramo
- Badges de estado (Cobrado / Pendiente) y de venta corregida con su versión

### Detalle "Ver venta" (`/modulos/reportes-ventas/[ventaId]`)
- Franja de encabezado: "Volver a ventas", `Venta #N`, estado, badge de corregida y fecha/hora
- Franja de acciones: Reimprimir, PDF, Compartir, Corrección simple, Corregir venta, Historial
- Información general en grilla (2 / 3 / 6 columnas): ticket, fecha, cliente, cajero, local, forma de pago, turno original, y observaciones / referencia interna cuando existen. Desglose de medios de pago cuando el cobro fue dividido
- Ítems como sección protagonista: tabla a todo el ancho desde `md` y cards en móvil. Por línea: nombre, cantidad comercial, precio, costo, ganancia, margen y subtotal
- **Modo de venta de depósito** por línea: badge `Pack/Bulto ×N`, `Unidad suelta` o `Piezas`, el factor ("1 pack = N unidades"), el consumo físico congelado ("= 36 u") y la escala del importe ("por pack" / "por unidad" / "por pieza")
- Totales en grilla de tiles: subtotal, descuento, total, comisión bancaria, neto recibido, costo total, ganancia bruta y ganancia neta
- Costos, ganancias y márgenes solo con permiso (`costos.ver` o admin): sin él, la tabla queda en Producto / Cant. / Precio / Subtotal y desaparecen los tiles de costo

### Corrección
- **Simple** (panel inline en el detalle): cliente, observaciones y referencia interna. Motivo obligatorio. En ventas fiadas no permite cambiar el cliente
- **Completa** (`/[ventaId]/corregir`): editor de líneas y pagos. La revisión de cambios es una **etapa in-page** (`RevisionVentaCorreccion`, misma URL), no un modal
- **Dirty guard**: `firmaCorreccion` (en `lib/reportes-ventas/correccionDirty.js`) calcula una firma determinista del payload funcional (líneas + pagos + cliente + motivo, en centavos/milésimas y con orden estable, ignorando metadatos de UI). Si hay cambios sin guardar: confirmación inline (`role=alertdialog`, no modal), `beforeunload` solo cuando está sucio, y botón atrás interceptado con centinela de `history` + `popstate`
- Habilitación de la corrección completa: feature flag beta (`CORRECCION_VENTAS_BETA_USER_IDS`, fail-closed) + permiso + turno original **abierto** + dentro de la ventana de 30 días. El botón deshabilitado explica el motivo por `title`
- Historial de correcciones en grilla, desde `VentaCorreccion`

### Navegación y contexto de retorno
`lib/reportes-ventas/returnParams.js` mantiene un contexto de retorno con whitelist (tab, page, fechaDesde, fechaHasta, localId, formaPago). "Ver venta" lo escribe en la URL del detalle y "Volver a ventas" lo reconstruye, restaurando tab, página, fechas, local y forma de pago. Además se guarda el scroll del listado en `sessionStorage` acotado por tab.

## Comprobante de venta (PDF y Compartir)

**Fuente común.** Las acciones "PDF" y "Compartir" del detalle entran las dos por `lib/pos-ventas/generarTicketPDF.js`; Compartir solo pide `output: "blob"` y cae a descarga cuando el dispositivo no soporta la Web Share API. **No hay dos implementaciones**: el archivo descargado y el compartido son el mismo documento (hay un test que compara texto, página y coordenadas de ambos). Nombre: `venta-{numero}[-copia].pdf`.

El mismo generador produce el ticket en vivo del POS, que no envía los campos nuevos: en ese caso el comprobante degrada a presentación neutra en vez de inventar datos.

### Flujo: medir → planificar → dibujar
El generador ya no dibuja al vuelo. Primero **mide** cada fila (líneas del nombre según el wrap, alto de la presentación, desglose del servicio) y el bloque de resumen; después **planifica** el reparto en páginas (`planificarPaginas`, exportada y testeada aparte); recién entonces **dibuja**. Es lo que permite garantizar que ninguna fila se corte entre páginas y decidir dónde va el resumen antes de pintar nada.

### Paginación real
- Tantas páginas A4 como hagan falta. Ninguna fila se parte entre páginas.
- El **encabezado de columnas se repite completo** en cada página que tiene productos, sobre un divisor de fondo suave.
- Pie discreto por página: `Ticket #N · Página X de Y`. La numeración se escribe en una segunda pasada, cuando ya se conoce el total.
- Totales y "Gracias por su compra" aparecen **una sola vez**, al final, después de los últimos productos.

### Regla contra la página huérfana de totales
La página que lleva el resumen debe tener al menos **40 mm de productos**. Si no llega, se bajan filas del final de la página anterior hasta alcanzar ese mínimo, con dos guardas: las filas movidas más el resumen tienen que entrar en la página, y la página anterior conserva al menos una fila. El reparto solo mueve índices: no corta filas, no duplica ni reordena productos y no toca importes.

Cubre los dos síntomas del mismo defecto: la página con **solo** el total, y la que traía 1 o 2 productos con el total suelto arriba. Ejemplo: una venta de 30 ítems pasó de `29 productos | 1 producto + total` a `24 productos | 6 productos + resumen`.

Un **"Resumen de la venta"** en página propia queda solo como *fallback excepcional*, para el caso en que el bloque sea tan grande que no admita ni una fila de producto. En ese caso la página se rotula con ese título en lugar de mostrar dos importes aislados arriba.

### Columnas
```
Producto | Presentación | Cantidad | Precio | Subtotal
```
El nombre admite hasta **dos líneas** con wrap controlado y se corta con puntos suspensivos si no entra. La presentación tiene columna propia de ancho fijo — **no** va debajo del nombre, que era lo que engordaba cada fila. Cantidad, precio y subtotal van alineados a la derecha.

### Presentaciones y cantidades
`lib/pos-ventas/presentacionLinea.js` es el **helper único** de etiqueta y formato de cantidad. Resuelve todo desde el descriptor `deposito` que ya devuelve `GET /api/reportes-ventas/detalle/[id]` (`modo`, `factorPack`, `unidadMedida`) más el flag `esServicio`. No infiere nada del nombre del producto.

| Condición | Presentación | Cantidad |
|---|---|---|
| `modo === PIEZA` (gana sobre kg) | `Pieza` | `1 pz`, `4 pz` |
| `unidadMedida === "kg"` | `Kg` | `1 kg`, `1,920 kg`, `3,285 kg` |
| `modo === PACK` + `factorPack > 1` | `Pack xN` | `1 pack`, `3 packs` |
| `modo === PACK` + `unidadMedida === "cajon"` | `Caja xN` | `2 cajas` |
| `modo === UNIDAD` / `modo_envio SOLO_UNIDAD` | `Unidad` | `3 u`, `20 u` |
| `esServicio` | `Servicio` | según el contrato del servicio |
| sin datos suficientes | `—` (neutro) | solo el número |

- **Los productos por peso nunca se muestran como unidades**: la fuente es `unidad_medida` del producto, no el modo ni el nombre.
- Formato **es-AR**: coma decimal, punto solo como separador de miles. Los enteros no llevan decimales (nunca `3,000`); en kg, si hay parte fraccionaria se muestran los tres decimales (`1,920`).
- El factor **no se inventa**: si `factor_pack` falta o no es mayor a 1, la etiqueta queda en `Pack` sin `xN`.
- No hay ningún campo que distinga **Bulto** de Pack (el enum `UnidadMedida` es `unidad | pack | cajon | kg`), así que `Pack xN` se usa como fallback neutral y `Caja xN` solo cuando el producto realmente es un cajón.

### Resumen final
Separador horizontal, etiquetas a la izquierda e importes a la derecha, con el TOTAL destacado tipográficamente: subtotal, descuento si existe, desglose de pagos con nombres legibles (Efectivo, Débito, Crédito, Mercado Pago, Transferencia, Cuenta corriente), TOTAL, comisión bancaria y neto recibido. Un único pago en efectivo por el total no genera desglose redundante. Después del resumen queda aire antes de "Gracias por su compra".

### Encabezado
`COMPROBANTE DE VENTA` como título; cuando es una reimpresión se aclara `Copia del comprobante` de forma secundaria y discreta — **ya no se usa "REIMPRESIÓN — COPIA" como título principal**. Debajo: origen (etiquetado `Origen (Depósito)` / `Origen (Local)` solo si la venta lo informa, y `Origen:` neutro si no), destino (cliente o `Consumidor final`), documento si existe, ticket, fecha, vendedor, forma de pago, estado y `Venta corregida · versión N` cuando corresponde.

El ticket **térmico** (`lib/pos-ventas/imprimirTicketTermico.js`) es otro camino y conserva su propia marca de copia: este rediseño no lo toca.

## Ancho y layout
El listado, el detalle y la corrección usan el **mismo patrón de contenedor que POS Ventas**: `w-full min-h-full p-2 lg:p-3`, sin `max-width` ni centrado. Los límites anteriores eran `max-w-7xl mx-auto` en el listado (1120 px con raíz de 14px), `max-w-3xl mx-auto` en el detalle (672 px) y `max-w-5xl mx-auto` en corregir (896 px).

El ancho útil de las tres pantallas coincide con POS en 360, 412, 768, 1024, 1366, 1440 y 1920 px (332 / 384 / 683 / 939 / 1281 / 1355 / 1835 px, con el mismo padding horizontal), sin overflow horizontal del body.

En **Corregir venta** la tabla de líneas muestra sus 9 columnas (producto con el toggle Pack/Unidad, cantidad original y corregida, precio original y corregido, subtotal original y corregido, diferencia y la acción) y el **scroll horizontal queda acotado al contenedor de la tabla** cuando no entra — a 1024 px se activa; a 1366 y más no hace falta. El body nunca scrollea en horizontal. En móvil se mantienen las cards y las acciones sticky.

## Dependencias

### Usa
- Ventas y VentaDetalle (fuente del listado y del detalle)
- VentaPago (desglose de medios de pago; ver módulo POS Ventas)
- Clientes, Locales, Usuarios (cliente, local y cajero de cada venta)
- ProductoBase (`unidad_medida`, `factor_pack`, `modoVentaDeposito`, `modo_envio`) para el modo Pack/Unidad
- Turnos (estado del turno original, que gobierna la corrección completa)
- `lib/pos-ventas/lineaModoDeposito` (`inferirModo`, `permiteToggleDeposito`) — la regla Pack/Unidad **no se duplica**, se reutiliza la de la corrección
- `lib/pos-ventas/generarTicketPDF` (comprobante PDF y Compartir) y `lib/pos-ventas/presentacionLinea` (etiqueta de presentación + formato de cantidad)
- `lib/pos-ventas/imprimirTicketTermico` (reimpresión térmica, camino aparte con su propia marca de copia)

### Genera
- VentaCorreccion (al aplicar una corrección simple o completa)
- No escribe stock ni pagos por sí mismo: eso vive en los endpoints de POS Ventas

## APIs

### Endpoints
- `GET /api/reportes-ventas/general` — resumen, desglose por forma de pago y top productos
- `GET /api/reportes-ventas/listado` — listado paginado venta por venta
- `GET /api/reportes-ventas/por-cliente` — ventas agrupadas por cliente
- `GET /api/reportes-ventas/detalle/[id]` — detalle completo de una venta, con flags de corrección y el descriptor `deposito` por línea

### Consume
- `POST /api/pos-ventas/corregir-simple/[id]`
- `GET /api/pos-ventas/correcciones/[id]` (historial)
- `POST /api/pos-ventas/venta/[id]/revisar`, `editar`, `corregir` (corrección completa)
- `GET /api/clientes/buscar` (reasignar cliente en la corrección simple)

## Permisos requeridos
- `reportes.ver` — acceso al módulo y a los tres endpoints de reportes
- `costos.ver` — costos, ganancias y márgenes (admin siempre)
- `ventas.corregir_simple` — corrección simple
- `ventas.corregir_completa` — corrección completa (además del flag beta)
- `ventas.corregir_turno_cerrado` — solo se informa; el turno cerrado bloquea igual la corrección completa

## Scope por local
Un usuario no admin solo ve ventas de su local. Leer una venta ajena devuelve **404**, no 403: no se revela que la venta existe.

## Estado actual
Flujo migrado a páginas reales y desplegado en producción. El detalle muestra el modo de venta de depósito con su equivalencia física, y el comprobante PDF está paginado con presentaciones y unidades correctas.

**Sin cambios de DB.** Todo lo anterior es presentación y layout: no hubo migraciones, ni cambios de schema, ni de persistencia, cálculos, stock, importes, permisos o beta. Las únicas ampliaciones fueron aditivas en la respuesta del detalle (el campo `deposito` por línea y `local.esDeposito`), sin tocar los campos que ya devolvía.

## Próximos pasos
- Graduar el beta de corrección completa (retirar `CORRECCION_VENTAS_BETA_USER_IDS` y dejar solo el permiso)
- El descriptor `deposito` devuelve `modo: null` para líneas legacy sin `cantidadStock`; evaluar si vale reconstruirlo o dejarlo neutro de forma definitiva

## Cambios recientes
- 2026-07-30: fix(reportes): mejorar resumen y unidades del comprobante
- 2026-07-29: fix(reportes): paginar comprobantes y ampliar corrección de ventas
- 2026-07-29: feat(reportes): mostrar modo y consumo físico de venta
- 2026-07-29: fix(reportes): ampliar y reorganizar detalle de venta
- 2026-07-29: fix(reportes): usar el mismo ancho útil que POS Ventas
- 2026-07-29: feat(reportes): rediseñar visualmente el listado de ventas
- 2026-07-29: feat(reportes): advertir cambios sin guardar en la corrección
- 2026-07-29: refactor(reportes): eliminar flujo modal de ventas

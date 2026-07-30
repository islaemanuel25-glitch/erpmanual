# Módulo: Reportes de Ventas

**Última actualización:** 2026-07-29 22:09
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

## Ancho y layout
El listado y el detalle usan el **mismo patrón de contenedor que POS Ventas**: `w-full min-h-full p-2 lg:p-3`, sin `max-width` ni centrado. Antes el listado estaba limitado por `max-w-7xl mx-auto` (1120 px con raíz de 14px) y el detalle por `max-w-3xl mx-auto` (672 px). El ancho útil ahora coincide con POS en 360, 412, 768, 1024, 1366, 1440 y 1920 px, sin overflow horizontal del body.

## Dependencias

### Usa
- Ventas y VentaDetalle (fuente del listado y del detalle)
- VentaPago (desglose de medios de pago; ver módulo POS Ventas)
- Clientes, Locales, Usuarios (cliente, local y cajero de cada venta)
- ProductoBase (`unidad_medida`, `factor_pack`, `modoVentaDeposito`, `modo_envio`) para el modo Pack/Unidad
- Turnos (estado del turno original, que gobierna la corrección completa)
- `lib/pos-ventas/lineaModoDeposito` (`inferirModo`, `permiteToggleDeposito`) — la regla Pack/Unidad **no se duplica**, se reutiliza la de la corrección
- `lib/pos-ventas/imprimirTicketTermico`, `generarTicketPDF` (reimpresión / PDF / compartir, marcados como copia)

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
Flujo migrado a páginas reales y desplegado en producción. El detalle muestra el modo de venta de depósito con su equivalencia física.

## Próximos pasos
- Graduar el beta de corrección completa (retirar `CORRECCION_VENTAS_BETA_USER_IDS` y dejar solo el permiso)
- El descriptor `deposito` devuelve `modo: null` para líneas legacy sin `cantidadStock`; evaluar si vale reconstruirlo o dejarlo neutro de forma definitiva

## Cambios recientes
- 2026-07-29: feat(reportes): mostrar modo y consumo físico de venta
- 2026-07-29: fix(reportes): ampliar y reorganizar detalle de venta
- 2026-07-29: fix(reportes): usar el mismo ancho útil que POS Ventas
- 2026-07-29: feat(reportes): rediseñar visualmente el listado de ventas
- 2026-07-29: feat(reportes): advertir cambios sin guardar en la corrección
- 2026-07-29: refactor(reportes): eliminar flujo modal de ventas

# Auditoría puntual — POS Ventas
## Tema 1: Carrito persistente / venta en espera  
## Tema 2: Reimpresión de comprobante

**Alcance:** Solo mapear y auditar. No implementar.

---

## 1. CARRITO PERSISTENTE

### Archivos involucrados

- **app/modulos/pos-ventas/page.jsx** — Página principal POS. Usa `useReducer(posVentaReducer, initialState)`; estado del carrito vive en `state.carrito`. No hay context ni store externo.
- **app/modulos/pos-ventas/reducer/posVentaReducer.js** — Define `initialState` (carrito: [], formaPago, cliente, descuentos, modales, cobrando) y acciones: ADD_ITEM, UPDATE_CANTIDAD, REMOVE_ITEM, CLEAR_CART, SET_*, OPEN_MODAL, CLOSE_MODAL.
- **app/modulos/pos-ventas/helpers/offlineQueue.js** — Cola de ventas offline en `localStorage` (key `posVentasOfflineQueue_v1`). Solo ventas **ya cobradas** pendientes de sincronización. No guarda carrito en curso.

### Estado actual

- El carrito es **solo estado en memoria** del reducer.
- Inicialización: `useReducer(posVentaReducer, initialState)` con `initialState.carrito = []`. No se lee de ningún storage.
- Funciones clave:
  - **Agregar / acumular:** `handleAgregar` → dispatch ADD_ITEM (si mismo productoBaseId, suma cantidad en reducer).
  - **Cambiar cantidad:** `handleCantidadChange` → dispatch UPDATE_CANTIDAD.
  - **Eliminar ítem:** `handleEliminar` → dispatch REMOVE_ITEM.
  - **Limpiar carrito:** `handleLimpiar` → dispatch CLEAR_CART (y limpia creditoInfo, mensajes).
  - **Cobrar / confirmar venta:** `handleCobrar` (online) o flujo offline; tras éxito ambos hacen dispatch CLEAR_CART.
  - **Reset del carrito:** Solo vía CLEAR_CART (explícito al limpiar o tras cobro exitoso).

### Dónde se pierde hoy

- **Desmontaje:** Al salir de la ruta (navegación a otro módulo), el componente se desmonta y el estado del reducer se pierde.
- **Refresh:** Recarga de página reinicia la app; el reducer se vuelve a crear con `initialState`.
- **Navegación:** Cualquier salida de `/modulos/pos-ventas` pierde el carrito.
- **useEffect de init:** No hay efecto que restaure el carrito desde storage; solo se usa `initialState`.
- **Tras cobro:** Correctamente se hace CLEAR_CART solo después de venta exitosa (online ~línea 984, offline ~línea 582).

No existe persistencia del carrito en localStorage, sessionStorage ni indexedDB.

### Persistencia local existente

- **localStorage:** Solo en `offlineQueue.js`: key `posVentasOfflineQueue_v1` para la cola de ventas pendientes de sincronización (objeto por venta: clientVentaId, items, total, etc.).
- No hay Zustand persist, sessionStorage ni cache propio para el carrito.

### Convivencia con offline

- **Cola offline:** `loadQueue` / `saveQueue` / `enqueue` / `dequeueById` en `helpers/offlineQueue.js`. Una venta entra a la cola cuando se “cobra” offline (se guarda el payload de la venta y se hace CLEAR_CART).
- **Formato cola:** `{ clientVentaId, createdAt, localId, grupoId, userId, formaPago, subtotal, descuento, total, clienteId, items: [{ productoBaseId, nombre, precio, cantidad }], ... }`.
- **Riesgo de mezcla:** La cola son ventas **cerradas**. Un “carrito persistente” sería un objeto distinto (venta en curso: carrito + formaPago + cliente + descuentos). Mientras se use otra key (por ejemplo `posVentasCarritoEnCurso_v1`) y al “cobrar” se siga haciendo CLEAR_CART y opcionalmente borrar esa key, no se mezcla venta en curso con ventas pendientes de sync.

### Mejor punto técnico para persistir (sin implementar)

- **Dónde enchufar:** En `app/modulos/pos-ventas/page.jsx`, al montar: leer de localStorage (o sessionStorage) un objeto “carrito en espera” y, si existe y es del mismo local (y opcionalmente mismo usuario/turno), hacer un dispatch de tipo RESTORE_CART con ese payload; al actualizar estado relevante (carrito, descuento, cliente, formaPago), escribir en storage. Al hacer CLEAR_CART (limpiar o cobrar), borrar esa key.
- **Qué persistir:** Parte del estado del reducer necesaria para rearmar la venta en curso: `carrito` (ítems con productoBaseId, nombre, precio, cantidad, unidadMedida, etc.), `descuento`, `descuentoInfo`, `clienteSeleccionado`, `formaPago`, `puntosCanje`, `descuentoPorPuntos`; y para consistencia `localId` (y opcionalmente turnoId / usuario) para no restaurar en otro contexto.
- **Qué no persistir:** Modales abiertos, `cobrando`, `modalTicket` (es post-venta), datos sensibles de pago (pagaCon/vuelto). Tampoco duplicar la cola offline: la key del carrito debe ser distinta de `posVentasOfflineQueue_v1`.

---

## 2. REIMPRESION COMPROBANTE

### Estado actual

- **Impresión térmica (navegador):** `lib/pos-ventas/imprimirTicketTermico.js` — función por defecto `imprimirTicketTermico(venta, ancho)`. Abre ventana con HTML de ticket (58/80 mm), usa `loadTicketConfig()` (localStorage `ticket-config`), llama `window.print()`. Espera `venta`: numero, items (nombre, precio, cantidad), subtotal, descuento, total, formaPago, localNombre, vendedor; opcional cliente (objeto con nombre, documento, telefono, direccion), pagaCon, vuelto.
- **Impresión post-venta:** Tras cobro exitoso, en `page.jsx` se setea `state.modalTicket` con el objeto venta (numero, items, subtotal, descuento, total, formaPago, etc.) y se muestra `ModalTicket`; desde ahí el usuario elige “Imprimir ticket (termica)” y se llama `imprimirTicketTermico(state.modalTicket)` (~líneas 1016–1020). También hay opción PDF (`generarTicketPDF` en `lib/pos-ventas/generarTicketPDF.js`).
- **Ticket offline:** Tras venta guardada offline, se arma `ticketOffline` y se muestra `ModalTicketOffline` con botón “Reimprimir” que llama `imprimirTicketTermico` con ese objeto (~1391–1398). Ese objeto sí lleva cliente (string), pagaCon, vuelto, localNombre, etc.

### Desde dónde se puede reimprimir hoy

1. **Post-venta (online):** Modal ticket con datos en memoria (`state.modalTicket`) → “Imprimir ticket (termica)” → `imprimirTicketTermico(state.modalTicket)`. Completo.
2. **Post-venta (offline):** Modal ticket offline → “Reimprimir” → `imprimirTicketTermico({ ...venta, ... })`. Completo para ese flujo.
3. **Historial del día:** En `HistorialDia` (desde POS, botón historial), al abrir detalle de una venta hay botón “Reimprimir” que llama `onReimprimir` con un objeto armado desde `detalle`: numero, items (desde detalle.detalles), subtotal, descuento, total, formaPago; la página añade `vendedor` y `localNombre`. No se pasa cliente, pagaCon, vuelto, ni fecha/hora de la venta. `imprimirTicketTermico` usa fecha/hora actual (`now`), no la de la venta.

### Qué falta para dejarlo bien

- **Reimpresión desde historial:** El API `GET /api/pos-ventas/historial-dia` devuelve ventas con `detalles` (nombre, cantidad, precio, subtotal) y vendedor, pero **no** incluye cliente (clienteId no está en el select; no hay include de Cliente ni clienteNombre), ni pagaCon/vuelto (esos no están en el modelo Venta en el listado). Para una reimpresión fiel desde historial haría falta:
  - Incluir en la venta (o en un endpoint de detalle de venta) datos de cliente (nombre al menos) y, si se guardan en algún lado, pagaCon/vuelto para efectivo.
  - Pasar en el objeto a `imprimirTicketTermico`: cliente (objeto o string), fecha/hora de la venta (para imprimir la fecha real en el ticket en vez de “now”), y opcionalmente pagaCon/vuelto si se persisten.
- **Fecha/hora en ticket:** Hoy `imprimirTicketTermico` usa `new Date()` para fecha/hora. Para reimpresión debería aceptar `venta.fecha` (o venta.fechaYHora) y usarla cuando exista.
- **Endpoint/mapper:** Si se quiere reimpresión sólida desde historial, conviene un endpoint tipo `GET /api/pos-ventas/venta/[id]` (o incluir en historial-dia más campos) que devuelva una venta con: numero, fecha, subtotal, descuento, total, formaPago, vendedor, localNombre, items (detalles), cliente (nombre y si hay documento/telefono), y si se almacenan pagaCon/vuelto para efectivo, incluirlos. Hoy historial-dia no trae cliente ni pagaCon/vuelto.

---

## 3. RIESGOS

- **Carrito persistente:** Si se persiste por localStorage y el usuario cambia de local (o de cajero) sin recargar, restaurar un carrito de otro contexto podría generar ventas en local equivocado; hay que atar la key a localId (y opcionalmente turno/usuario) y validar al restaurar.
- **Cuota de storage:** Guardar carrito + cola offline en localStorage está acotado; si se persisten muchos ítems o muchas ventas en cola, revisar límites.
- **Reimpresión desde historial:** Sin cliente ni fecha real el ticket reimpreso no es fiel al original; para auditoría o reclamos puede ser insuficiente.

---

## 4. PLAN MÍNIMO

**Carrito persistente (solo plan, sin código):**

1. Definir una key de storage distinta a la cola offline (ej. `posVentasCarritoEnCurso_v1`) y formato (carrito + localId + opcional turnoId).
2. En page.jsx: al montar, leer esa key; si hay datos y localId coincide con contexto actual, dispatch RESTORE_CART (o acción equivalente) con el payload; si no, dejar initialState.
3. En cada cambio relevante (ADD_ITEM, UPDATE_CANTIDAD, REMOVE_ITEM, SET_DESCUENTO, SET_CLIENTE, etc.), persistir en esa key el subconjunto necesario del state (carrito, descuento, cliente, formaPago, etc.).
4. En CLEAR_CART (tanto en handleLimpiar como tras cobro exitoso), borrar esa key.
5. No tocar la lógica de la cola offline ni la key `posVentasOfflineQueue_v1`.

**Reimpresión (solo plan):**

1. Mejorar objeto que se pasa a `imprimirTicketTermico` desde HistorialDia: incluir fecha/hora de la venta si está disponible; extender API historial-dia (o crear GET venta por id) para devolver nombre de cliente y, si existen, pagaCon/vuelto.
2. En `imprimirTicketTermico`: si `venta.fecha` existe, usarla para la línea de fecha/hora del ticket; si no, mantener `now`.
3. Mantener post-venta y ticket offline como están (ya reimprimen con datos completos en su contexto).

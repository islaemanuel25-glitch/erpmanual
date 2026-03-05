# Mapa + Plan: Historial de Ventas (POS) alineado a Turnos

**Objetivo:** Mejorar la pantalla Historial de ventas para que funcione como buscador de tickets y muestre cajero (vendedor), turnoId, filtros útiles y opción "solo con turno". Sin nuevas tablas, sin anular venta ni movimientos de caja.

---

## 1) Dónde vive HistorialDia y qué lo alimenta

### UI (componentes y página)

| Archivo | Rol |
|---------|-----|
| **components/pos-ventas/HistorialDia.jsx** | Componente del historial: overlay/modal, lista de ventas del día, resumen (cantidad + total), filas clickeables que abren detalle del ticket, botón Reimprimir y Cerrar. |
| **app/modulos/pos-ventas/page.jsx** | Página POS: importa `HistorialDia`, guarda estado `mostrarHistorial`; al hacer clic en "Historial" del header pone `setMostrarHistorial(true)`. Renderiza `<HistorialDia localId={localActual} onCerrar={...} onReimprimir={...} />` (aprox. líneas 1354-1369). |

El historial se abre como **modal/overlay** desde el POS; no es una ruta propia (`/modulos/pos-ventas/historial`). No hay página independiente de “Historial de ventas POS”.

### Endpoint(s) que alimentan la grilla

| Método | Ruta | Uso |
|--------|------|-----|
| GET | **/api/pos-ventas/historial-dia** | Único endpoint usado por HistorialDia. Query: `localId` (obligatorio; puede venir de session o de query). Devuelve ventas del **mismo día** (fecha >= hoy 00:00) del local, ordenadas por fecha desc. |

No hay otro endpoint de historial POS (por rango de fechas, por turno, etc.) usado por esta pantalla.

---

## 2) Datos que devuelve hoy y ampliación propuesta

### Respuesta actual del endpoint (select actual)

**Archivo:** `app/api/pos-ventas/historial-dia/route.js`

**Select actual:**

- **Venta:** id, numero, fecha, subtotal, descuento, total, formaPago.
- **Detalles:** nombre, cantidad, precio, subtotal.

**No incluye:**

- vendedorId
- vendedor (nombre del cajero)
- turnoId
- datos del turno (apertura/cierre para mostrar “Turno 07:12” o “Turno #id”)

### Propuesta de ampliación (solo lectura, mismo endpoint)

Ampliar el `select` de `prisma.venta.findMany` para incluir:

- **vendedorId** — para filtro y para permisos (filtrar por cajero si no tiene turnos.ver_todos).
- **turnoId** — para mostrar en columna y filtrar “solo con turno”.
- **vendedor:** `{ select: { id: true, nombre: true } }` — para mostrar nombre del cajero en la grilla.
- **turno:** `{ select: { id: true, apertura: true, cierre: true } }` — para armar etiqueta tipo “Turno 07:12” (hora de apertura) o “#id” y saber si está abierto (cierre null).

No hace falta nueva ruta ni nuevo modelo; solo ampliar el SELECT y, en el mismo endpoint, aceptar query params de filtro (vendedorId, formaPago, numero, soloConTurno, y opcionalmente fechaDesde/fechaHasta si se quiere dejar de limitar a “solo hoy”).

---

## 3) Propuesta de UI

### Columnas exactas (grilla / lista)

| Columna | Origen dato | Notas |
|---------|-------------|--------|
| Hora | venta.fecha | Formato HH:mm (o HH:mm:ss si se quiere). |
| Nº ticket | venta.numero | Ej. #42. |
| Total | venta.total | Formato moneda. |
| Forma pago | venta.formaPago | Efectivo, MercadoPago, Débito, Crédito, Fiado. |
| Cajero | venta.vendedor.nombre | Nombre del usuario que hizo la venta. |
| Turno | venta.turnoId + venta.turno | Si no hay turno: “—”. Si hay: “#id” o “07:12” (hora apertura); si turno.cierre es null se puede mostrar “(abierto)”. Ej. “#12 · 07:12” o “Turno 07:12 (abierto)”. |

El detalle del ticket (modal al hacer clic en la fila) puede seguir mostrando lo que ya muestra (numero, fecha, items, totales, formaPago) y sumar una línea: Cajero: {nombre}, Turno: {etiqueta}.

### Filtros exactos

| Filtro | Tipo | Comportamiento |
|--------|------|----------------|
| **Nº ticket** | Input numérico (opcional) | Filtrar ventas donde venta.numero = valor (o contiene, si se quiere búsqueda parcial). |
| **Forma de pago** | Select (opcional) | Valores: Todas, Efectivo, MercadoPago, Débito, Crédito, Fiado. Filtra por venta.formaPago. |
| **Cajero (vendedor)** | Select (opcional) | Solo visible o habilitado si el usuario tiene turnos.ver_todos (o *). Lista de usuarios que tienen ventas en el rango/local; opción “Todos”. Filtra por venta.vendedorId. |
| **Solo con turno** | Checkbox (opcional) | Si está marcado: venta.turnoId != null. |
| **Fecha** | Rango (opcional) | Por defecto “Hoy”. Si se amplía el endpoint a rango: fechaDesde, fechaHasta (ej. un solo día o últimos 7 días). |

La grilla se alimenta con los mismos items que devuelve el endpoint, aplicando filtros en backend (recomendado) o en front (si el backend sigue devolviendo “solo hoy” y los filtros son pocos).

### Cómo mostrar el turno

- **Opción A (recomendada):** “#id · HH:mm” — ej. “#12 · 07:12” (id del turno + hora de apertura). Si turno.cierre es null: “#12 · 07:12 (abierto)”.
- **Opción B:** Solo hora de apertura: “07:12” o “Turno 07:12”.
- **Opción C:** Solo id: “Turno #12”.

Para A o B hace falta que el endpoint incluya `turno: { select: { id: true, apertura: true, cierre: true } }`. La UI formatea `apertura` a hora local (HH:mm).

---

## 4) Permisos

| Rol | Permiso | Comportamiento en Historial |
|-----|---------|-----------------------------|
| Cajero | pos.usar (sin turnos.ver_todos) | Ve **solo sus propias ventas** (vendedorId = session.id). Filtro por cajero no se muestra o está fijo en “Yo”. |
| Encargado / Admin local | turnos.ver_todos o * | Ve **todas las ventas del local** en el rango de fechas. Puede usar el filtro “Cajero” para restringir por vendedor. |
| Mismo endpoint | — | El endpoint GET historial-dia debe: (1) validar sesión y local (como hoy); (2) si el usuario no tiene turnos.ver_todos ni *, filtrar por vendedorId = session.id; (3) aplicar resto de filtros (formaPago, numero, soloConTurno, fechas). |

No se requiere permiso nuevo solo para “ver historial”: quien tiene pos.usar ve al menos sus ventas; quien tiene turnos.ver_todos ve todas las del local. La UI puede ocultar el ítem “Historial” si no tiene pos.usar (ya que hoy el historial se abre desde el POS, que ya está protegido por pos.usar).

---

## 5) Checklist de archivos y endpoints

### Archivos a tocar

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | **app/api/pos-ventas/historial-dia/route.js** | (1) Ampliar select: vendedorId, turnoId, vendedor { id, nombre }, turno { id, apertura, cierre }. (2) Aceptar query params: vendedorId, formaPago, numero, soloConTurno; opcional fechaDesde/fechaHasta. (3) Si el usuario no tiene turnos.ver_todos ni *, agregar where.vendedorId = session.id. (4) Aplicar filtros al where. (5) Mantener orden fecha desc. |
| 2 | **components/pos-ventas/HistorialDia.jsx** | (1) Pasar filtros al endpoint (localId + opcionales: vendedorId, formaPago, numero, soloConTurno, fechaDesde/fechaHasta). (2) Grilla: columnas Hora, Nº ticket, Total, Forma pago, Cajero, Turno (formato acordado). (3) UI de filtros: input Nº ticket, select Forma pago, select Cajero (solo si puede ver otros), checkbox “Solo con turno”, y opcional selector de fecha/rango. (4) Detalle del ticket: añadir línea Cajero y Turno. (5) Resumen (cantidad/total) que respete filtros. |
| 3 | **app/modulos/pos-ventas/page.jsx** | (1) Pasar a HistorialDia si el usuario puede ver todos los cajeros (ej. prop `puedeVerTodosCajeros` = turnos.ver_todos o *) para mostrar u ocultar filtro Cajero. (2) Opcional: pasar `perfil` o `permisos` para que HistorialDia decida filtros visibles. |

No se tocan modelos Prisma ni se crean nuevas rutas; solo se amplía el endpoint existente y el componente.

### Endpoints a ajustar

| Endpoint | Ajustes |
|----------|--------|
| **GET /api/pos-ventas/historial-dia** | (1) Query params: localId (obligatorio, como hoy), vendedorId (opcional), formaPago (opcional), numero (opcional, búsqueda por número de ticket), soloConTurno (opcional, boolean), fechaDesde (opcional), fechaHasta (opcional). (2) Where: localId + fecha en rango (por defecto “hoy” si no se envían fechas). Si el usuario no tiene turnos.ver_todos ni *, agregar vendedorId = session.id. Aplicar filtros por vendedorId, formaPago, numero, soloConTurno. (3) Select ampliado: id, numero, fecha, subtotal, descuento, total, formaPago, vendedorId, turnoId, vendedor { id, nombre }, turno { id, apertura, cierre }, detalles (como hoy). (4) Respuesta: mismo shape { ok: true, items: [...] }; cada item incluye vendedor y turno para la UI. |

No se crean endpoints nuevos; solo se amplía este GET.

---

## 6) Resumen

- **Dónde está:** HistorialDia en `components/pos-ventas/HistorialDia.jsx`, usado desde `app/modulos/pos-ventas/page.jsx` como modal. Único backend: **GET /api/pos-ventas/historial-dia**.
- **Datos hoy:** No incluye vendedor ni turno; se propone ampliar el SELECT (vendedorId, turnoId, vendedor.nombre, turno.id/apertura/cierre) y añadir filtros por query.
- **UI:** Columnas Hora, Nº ticket, Total, Forma pago, Cajero, Turno (ej. “#12 · 07:12 (abierto)”). Filtros: Nº ticket, Forma pago, Cajero (solo si turnos.ver_todos o *), “Solo con turno”, y opcional rango de fechas.
- **Permisos:** Cajero (sin turnos.ver_todos) ve solo sus ventas; encargado (turnos.ver_todos o *) ve todas las del local; el endpoint aplica el filtro por vendedorId según permisos.
- **Checklist:** 1) historial-dia/route.js (select + filtros + permiso), 2) HistorialDia.jsx (grilla + filtros + detalle), 3) pos-ventas/page.jsx (pasar flag de “puede ver todos los cajeros”).

Sin cambios de base de datos ni implementaciones de anular venta o movimientos de caja.

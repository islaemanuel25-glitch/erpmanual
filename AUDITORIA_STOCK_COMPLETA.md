# Auditoría completa — Módulo Stock (ERP Azul)

## 1️⃣ Modelo de datos

### Tablas que guardan o afectan stock

| Modelo | Tabla | Rol en stock |
|--------|--------|----------------|
| **StockLocal** | StockLocal | Única tabla de existencia: `localId`, `productoId` (ProductoLocal), `cantidad`, `stockMin`, `stockMax`. @@unique(localId, productoId). |
| **ProductoLocal** | ProductoLocal | Producto en un local; referencia a ProductoBase. StockLocal.productoId → ProductoLocal.id. |
| **ProductoBase** | ProductoBase | Producto del grupo (nombre, unidad_medida, factor_pack, modoVentaDeposito, pesoReferenciaKg, etc.). No guarda stock. |
| **Venta** | Venta | Cabecera de venta POS. No guarda stock; el movimiento es vía StockLocal. |
| **VentaDetalle** | VentaDetalle | Ítems de la venta (productoBaseId, cantidad, precio). Histórico; el descuento de stock se hace en POS crear. |
| **Transferencia** | Transferencia | Cabecera depósito→destino. Estado: Pendiente → Recibida. |
| **TransferenciaDetalle** | TransferenciaDetalle | Ítems (productoId=ProductoLocal, cantidad, recibido, unidadEnviada). El movimiento de stock ocurre en confirmar-recepcion. |
| **PosTransferencia** | PosTransferencia | Transferencia “POS” (origen, destino, estado Borrador/Preparando/Solicitado/Enviado). No escribe StockLocal al enviar. |
| **PosTransferenciaDetalle** | PosTransferenciaDetalle | Sugerido/preparado por ítem. Al “enviar” se crea Transferencia + detalle; al “recibir” según qué endpoint se use. |
| **PedidoProveedor** | PedidoProveedor | Cabecera compra a proveedor (depositoId, estado BORRADOR→RECIBIDO). |
| **PedidoProveedorDetalle** | PedidoProveedorDetalle | Ítems (productoLocalId, cantidad, cantidadRecibida, kgRecibidos). El ingreso a stock ocurre en compras-proveedor/recibir. |
| **AuditoriaStock** | AuditoriaStock | Registro de ajustes y límites (accion, cantidadAnterior/Nueva, stockMin/Max, motivo, userId). |
| **ConfiguracionGrupo** | ConfiguracionGrupo | allowNegativeStock, requireMotivoAjusteStock, requireMotivoLimitesStock. |

### Relaciones clave

- **StockLocal** → Local, ProductoLocal (productoId = ProductoLocal.id).
- **VentaDetalle** → productoBaseId (ProductoBase), no ProductoLocal; el descuento en POS se resuelve por (localId + baseId) → ProductoLocal → StockLocal.
- **TransferenciaDetalle** → productoId = ProductoLocal.id (del origen); en confirmar-recepcion se buscan/crean ProductoLocal destino por baseId.

---

## 2️⃣ Flujo actual de stock

### VENTA POS

1. Usuario cobra en POS → `POST /api/pos-ventas/crear` (items con productoBaseId, cantidad, precio).
2. **app/api/pos-ventas/crear/route.js**: dentro de `prisma.$transaction`:
   - Idempotencia por clientTxnId.
   - Lock: `pg_advisory_xact_lock(localId)` + número de venta.
   - Por ítem: resuelve ProductoLocal por (localId, baseId). Depósito PIEZA: cantidad carrito en piezas → convierte a kg para stock (`cantidadParaStock`).
   - `SELECT cantidad FROM StockLocal ... FOR UPDATE` (lock fila).
   - Valida stock suficiente salvo si `ConfiguracionGrupo.allowNegativeStock`.
   - `stockLocal.updateMany` con `cantidad: { decrement: cantidadParaStock }`.
   - Crea Venta, VentaDetalle, MovimientoCuenta si fiado, ClientePuntoMovimiento si canje, etc.
3. **Conclusión:** Un solo lugar escribe stock por venta; con transacción y lock; negativo solo si allowNegativeStock.

### TRANSFERENCIA (legacy: depósito → local)

1. Se crea **Transferencia** (origen, destino) con **TransferenciaDetalle** (cantidad, unidadEnviada). Quién la crea no está en esta auditoría (puede ser flujo antiguo o otro módulo).
2. Recepción: **POST /api/transferencias/confirmar-recepcion** (body: transferenciaId).
3. **app/api/transferencias/confirmar-recepcion/route.js**: en `prisma.$transaction`:
   - Por cada detalle: calcula `recibidaUnidades` (para origen) e `incrementoLocal` (para destino; fiambre fijo: piezas→kg).
   - Crea ProductoLocal + StockLocal en destino si no existen.
   - **Destino:** `stockLocal.upsert` con `cantidad: { increment: incrementoLocal }`.
   - **Origen:** Crea ProductoLocal + StockLocal si no existen; luego `stockLocal.upsert` con `cantidad: { decrement: recibidaUnidades }`.
   - Actualiza TransferenciaDetalle (recibido, confirmadoPorId, fechaRecepcion) y Transferencia (estado Recibida).
4. **Conclusión:** Origen se descuenta en la misma transacción. No se valida stock en origen antes del decrement → **origen puede quedar negativo**.

### TRANSFERENCIA POS (PosTransferencia → Transferencia)

1. Usuario prepara en **POS Transferencias** y pulsa Enviar → **POST /api/pos-transferencias/enviar** (posId).
2. **app/api/pos-transferencias/enviar/route.js**: en `prisma.$transaction` solo:
   - Crea ProductoLocal en destino si no existe.
   - Crea **Transferencia** (origen, destino, posTransferenciaId) con **TransferenciaDetalle** (productoId destino, cantidadRaw, unidadEnviada).
   - Actualiza PosTransferencia a estado "Enviado".
   - **No toca StockLocal:** no descuenta en origen ni suma en destino.
3. Recepción puede ser por:
   - **POST /api/transferencias/confirmar-recepcion**: descuenta origen y suma destino (flujo correcto).
   - **POST /api/pos-transferencias/recibir**: **solo suma en destino**; no usa transacción; **no descuenta origen**.
4. **Conclusión:** Si se usa solo **pos-transferencias/recibir**, el depósito nunca pierde stock y el local gana stock → **duplicación de stock**. Si se usa **confirmar-recepcion** tras enviar, el flujo es coherente (origen se descuenta al confirmar).

### COMPRAS PROVEEDOR

1. Pedido en estado ENVIADO → Usuario recibe → **POST /api/compras-proveedor/recibir/[id]** (recibidos, kgRecibidos, costos, etc.).
2. **app/api/compras-proveedor/recibir/[id]/route.js**: en `prisma.$transaction`:
   - Por cada detalle con cantidad recibida > 0: calcula `incremento` (UNIDAD → kg reales; BULTO → cantRecibida * factor_pack en unidades).
   - `stockLocal.upsert` en **depositoId** con `cantidad: { increment: incremento }`.
   - Actualiza PedidoProveedorDetalle (cantidadRecibida, kgRecibidos, precioCosto) y PedidoProveedor (RECIBIDO, totalFactura, etc.).
3. **Conclusión:** Un solo ingreso a stock (depósito); atómico en transacción.

### EDICIÓN MANUAL (ajuste / límites)

1. **Ajuste de cantidad:** **POST /api/stock_locales/ajustar** (modo=ajuste, tipo=sumar|restar, cantidad, motivo, localId, productoLocalId).
2. **app/api/stock_locales/ajustar/route.js**:
   - Lee ConfiguracionGrupo (motivo obligatorio, allowNegativeStock).
   - Obtiene o crea StockLocal; calcula `nuevoStock = actual ± cantidad`; si nuevoStock < 0 y !allowNegativeStock → 0.
   - **Sin transacción:** `stockLocal.update` + `auditoriaStock.create` (create en catch, no crítico).
   - **Riesgo:** Condición de carrera: dos requests pueden leer el mismo “actual” y ambos hacer update → pérdida de una operación.
3. **Límites:** **POST /api/stock_locales/limites** (nuevoMin, nuevoMax). Mismo archivo o **app/api/stock_locales/limites/route.js**: update de stockMin/stockMax + auditoría. Sin transacción y sin lock.

---

## 3️⃣ Riesgos detectados

| Riesgo | Dónde | Detalle |
|--------|--------|--------|
| **Stock negativo en origen en transferencias** | transferencias/confirmar-recepcion | No se valida stock en origen antes de `decrement`; el depósito puede quedar en negativo. |
| **Duplicación de stock en flujo POS** | pos-transferencias/recibir | Solo incrementa destino; no descuenta origen. Si la UI usa solo este endpoint, el depósito no baja stock y el local sube → stock “duplicado”. |
| **Recibir POS sin transacción** | pos-transferencias/recibir | Varios `stockLocal.upsert` en loop + `transferencia.update` fuera de transacción. Fallo a mitad deja stock parcial y transferencia posiblemente sin marcar Recibida. |
| **Ajuste manual sin transacción ni lock** | stock_locales/ajustar | Read-modify-write sin lock. Concurrencia puede perder actualizaciones o dejar stock incoherente. |
| **Listar crea StockLocal** | stock_locales/listar | En flujo depósito, si ProductoLocal existe pero no tiene StockLocal, hace `prisma.stockLocal.create` dentro del GET. No es transaccional con el resto del listado; en alta concurrencia podría crear duplicados o comportamientos raros. |
| **Stock negativo permitido por grupo** | pos-ventas/crear, stock_locales/ajustar | allowNegativeStock permite negativo. Es intencional pero debe estar documentado y revisado por negocio. |
| **Dos endpoints de “recepción”** | confirmar-recepcion vs pos-transferencias/recibir | Comportamiento distinto (uno mueve origen→destino, otro solo destino). Riesgo de que front use uno u otro sin criterio único. |

---

## 4️⃣ Lugares donde se escribe stock

Solo se listan archivos que **modifican** `StockLocal` (create/update/upsert/decrement/increment).

| Archivo | Operación | Transacción | Notas |
|---------|-----------|-------------|--------|
| **app/api/pos-ventas/crear/route.js** | updateMany (decrement) | Sí + FOR UPDATE | Venta POS; respeta allowNegativeStock. |
| **app/api/stock_locales/ajustar/route.js** | update, create (stock si no existe) | No | Ajuste sumar/restar y modo límites. |
| **app/api/stock_locales/limites/route.js** | update, create (stock si no existe) | No | Solo stockMin/stockMax. |
| **app/api/transferencias/confirmar-recepcion/route.js** | upsert (increment destino, decrement origen), create (ProductoLocal+Stock si falta) | Sí | Recepción transferencia legacy; origen puede quedar negativo. |
| **app/api/pos-transferencias/recibir/route.js** | upsert (increment solo destino) | No | No descuenta origen; no atómico. |
| **app/api/compras-proveedor/recibir/[id]/route.js** | upsert (increment depósito) | Sí | Recepción compra. |
| **app/api/stock_locales/listar/route.js** | create (StockLocal si no existe en flujo depósito) | No | GET con efecto secundario. |
| **app/api/productos/crear/route.js** | createMany (StockLocal en 0) | Sí | Alta producto; depósito → todos los locales; local → solo ese. |
| **app/api/productos/import/apply/route.js** | create, updateMany (stock_inicial) | Sí por ítem | Importación productos; crea/actualiza stock según planilla. |
| **app/api/stock_locales/importar/route.js** | createMany | No (o parcial) | Revisar si hay transacción en el flujo completo. |
| **app/api/stock_locales/nuevo/route.js** | create (StockLocal en 0) | Sí | Alta producto desde módulo stock. |
| **app/api/grupos/[id]/sync-productos/route.js** | create (StockLocal en 0) | Sí | Sincronización productos a locales. |
| **app/api/productos/eliminar/[id]/route.js** | delete (StockLocal vía cascade o explícito) | Sí | Baja de producto. |
| **app/api/admin/reset-operativo/route.js** | delete masivo (incl. StockLocal) | Sí | Reset operativo. |
| **lib/grupos.js** | create (StockLocal en 0) | No explícito en fragmento visto | Herencia de productos a nuevo local. |

---

## 5️⃣ Mapa UI → Hook → API → DB

### POS Ventas

- **UI:** `app/modulos/pos-ventas/page.jsx` (CarritoVenta, FormaPago, handleCobrar).
- **Hook/estado:** `useReducer(posVentaReducer)` en la misma página; no hay hook dedicado de stock.
- **API:** `POST /api/pos-ventas/crear` (items, turnoId, formaPago, clienteId, etc.).
- **Servicio:** Lógica en el route: validación, lock, resolución ProductoLocal, FOR UPDATE StockLocal, decrement, creación Venta/VentaDetalle/otros.
- **DB:** StockLocal (updateMany decrement), Venta, VentaDetalle, PosVentaCounter, MovimientoCuenta, ClientePuntoMovimiento, etc.

### Transferencias (recepción legacy)

- **UI:** Módulo transferencias (listado, detalle, confirmar recepción).
- **API:** `POST /api/transferencias/confirmar-recepcion` (transferenciaId).
- **Servicio:** Todo en el route: en transacción, por cada detalle incrementa destino y decrementa origen (conversión kg/piezas según fiambre).
- **DB:** StockLocal (upsert increment/ decrement), TransferenciaDetalle, Transferencia, ProductoLocal/StockLocal create si no existen.

### Transferencias POS (enviar / recibir)

- **UI:** `app/modulos/pos-transferencias/nueva/page.jsx` (PreparadosTable, TablaSugeridos, Enviar / Recibir).
- **Enviar:** `POST /api/pos-transferencias/enviar` → crea Transferencia + detalle; no escribe StockLocal.
- **Recibir:** `POST /api/pos-transferencias/recibir` → solo incrementa StockLocal en destino; sin transacción; no descuenta origen. Alternativa: usar `POST /api/transferencias/confirmar-recepcion` para la misma Transferencia y así descontar origen.

### Compras proveedor

- **UI:** Flujo de compras (pedido, recibir).
- **API:** `POST /api/compras-proveedor/recibir/[id]` (recibidos, kgRecibidos, costos, etc.).
- **Servicio:** En el route, en transacción: incremento en StockLocal del depósito, actualización pedido/detalle.
- **DB:** StockLocal (upsert increment), PedidoProveedorDetalle, PedidoProveedor, ProductoBase (pesoPromedioKg si aplica).

### Edición manual de producto (stock)

- **UI:** `app/modulos/stock_locales/page.jsx` → TablaStock (Ajustar, Editar límites) → ModalAjuste, ModalLimites.
- **API:** `POST /api/stock_locales/ajustar` (ajuste/límites), `POST /api/stock_locales/limites` (solo límites).
- **Servicio:** En cada route: leer/crear StockLocal, update cantidad o stockMin/stockMax, AuditoriaStock.
- **DB:** StockLocal (update), AuditoriaStock (create).

---

## 6️⃣ Listado de archivos que tocan stock

### APIs que escriben StockLocal (create/update/upsert/decrement)

- app/api/pos-ventas/crear/route.js
- app/api/stock_locales/ajustar/route.js
- app/api/stock_locales/limites/route.js
- app/api/transferencias/confirmar-recepcion/route.js
- app/api/pos-transferencias/recibir/route.js
- app/api/compras-proveedor/recibir/[id]/route.js
- app/api/stock_locales/listar/route.js (create en flujo depósito)
- app/api/productos/crear/route.js
- app/api/productos/import/apply/route.js
- app/api/stock_locales/importar/route.js
- app/api/stock_locales/nuevo/route.js
- app/api/grupos/[id]/sync-productos/route.js
- app/api/productos/eliminar/[id]/route.js
- app/api/admin/reset-operativo/route.js

### APIs que solo leen stock (listados, validaciones, sugeridos)

- app/api/stock_locales/listar/route.js
- app/api/stock_locales/buscar-producto/route.js
- app/api/pos-ventas/buscar-producto/route.js
- app/api/pos-transferencias/sugeridos/route.js
- app/api/pos-transferencias/detalle/route.js
- app/api/pos-transferencias/agregarItem/route.js
- app/api/pos-transferencias/detalle/agregar/route.js
- app/api/pos-transferencias/detalle/editar/route.js
- app/api/pos-transferencias/detalle/quitar/route.js
- app/api/transferencias/detalle/route.js
- app/api/transferencias/guardar-recepcion/route.js (guarda recibido/motivo; no mueve stock)
- app/api/transferencias/listar/route.js
- app/api/compras-proveedor/productos/route.js
- app/api/config/stock-negativo/route.js

### Lib / conversiones

- lib/conversiones/stock.js (toUnidades, fromUnidades, piezasToKg, kgToPiezas, esFiambreFijo, validarEnvio, etc.)
- lib/grupos.js (hereda ProductoLocal + StockLocal a nuevo local)

### UI / componentes

- app/modulos/stock_locales/page.jsx
- components/stock_locales/TablaStock.jsx
- components/stock_locales/FiltrosStock.jsx
- components/stock_locales/ModalAjuste.jsx
- components/stock_locales/ModalLimites.jsx
- app/modulos/pos-ventas/page.jsx (flujo cobro)
- app/modulos/pos-transferencias/nueva/page.jsx
- components/pos-transferencias/nueva/PreparadosTable.jsx
- components/pos-transferencias/nueva/TablaSugeridos.jsx

### Modelo

- prisma/schema.prisma (StockLocal, ProductoLocal, ProductoBase, Transferencia, TransferenciaDetalle, PosTransferencia, PosTransferenciaDetalle, Venta, VentaDetalle, PedidoProveedor, PedidoProveedorDetalle, AuditoriaStock, ConfiguracionGrupo)

---

## 7️⃣ Recomendaciones

1. **Unificar recepción de transferencias:** Decidir un solo flujo: o bien el front siempre usa `confirmar-recepcion` (y se deja de usar `pos-transferencias/recibir` para mover stock), o bien `pos-transferencias/recibir` se reescribe para descontar origen dentro de la misma transacción (y opcionalmente reutilizar lógica de confirmar-recepcion). Evitar dos comportamientos distintos.
2. **Validar stock en origen antes de decrement:** En `transferencias/confirmar-recepcion`, antes de hacer `decrement` en origen, leer stock con lock y, si el grupo no permite negativo, validar que cantidad actual ≥ recibidaUnidades; si no, fallar la transacción con mensaje claro.
3. **Transacción en pos-transferencias/recibir:** Envolver todos los upsert de StockLocal y el update de Transferencia en `prisma.$transaction`. Si se añade descuento de origen, debe ser en la misma transacción.
4. **Ajuste con lock o atómico:** En `stock_locales/ajustar`, usar transacción y `SELECT ... FOR UPDATE` del StockLocal (o update con condición `cantidad = actual`) para evitar condición de carrera en read-modify-write.
5. **Evitar create en GET:** En `stock_locales/listar`, no crear StockLocal dentro del listado; delegar la creación a un flujo explícito (ej. al abrir ajuste o en un job/sync). Si se mantiene, al menos hacerlo dentro de una transacción corta y con manejo de unique constraint.
6. **Documentar allowNegativeStock:** Dejar claro en configuración y en mensajes al usuario que con allowNegativeStock la venta puede registrar stock negativo y que es una decisión de negocio.
7. **Auditoría en ajuste:** Mantener AuditoriaStock en ajustar/limites; valorar hacer la creación de auditoría dentro de la misma transacción que el update de stock para que no quede registro sin cambio aplicado (o aplicar retry/compensación).

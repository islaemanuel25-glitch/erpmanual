# Auditoría POS-Ventas — ERP Azul

**Alcance:** Módulo POS-Ventas. Solo análisis y mapeo; sin editar código ni proponer cambios de implementación.

---

## MAPA

### Rutas de pantalla
- **`/modulos/pos-ventas`** — única ruta del módulo (app/modulos/pos-ventas/page.jsx). Sin subrutas.

### Componentes principales
| Archivo | Rol |
|--------|-----|
| **app/modulos/pos-ventas/page.jsx** | Página única: estado global, reducer, conectividad, turno, cobro, offline, render de todos los bloques. |
| **components/pos-ventas/BuscadorProductos.jsx** | Búsqueda por código/nombre, voz, agregar al carrito. |
| **components/pos-ventas/CarritoVenta.jsx** | Lista de ítems, cantidad (stepper/input), kg/unidad, precio, subtotal, eliminar, limpiar. |
| **components/pos-ventas/FormaPago.jsx** | Total a cobrar, botones forma de pago (efectivo, mercadopago, debito, credito, fiado), botón COBRAR / GUARDAR PENDIENTE / PROCESAR COLA. |
| **components/pos-ventas/ModalPagoEfectivo.jsx** | Modal “paga con” / vuelto para efectivo. |
| **components/pos-ventas/ModalTicket.jsx** | Modal post-venta: opciones imprimir térmica / PDF. |
| **components/pos-ventas/ModalTicketOffline.jsx** | Ticket de venta guardada offline. |
| **components/pos-ventas/ModalDescuento.jsx** | Aplicar descuento (monto o %). |
| **components/pos-ventas/ModalCanjePuntos.jsx** | Canjear puntos de fidelidad. |
| **components/pos-ventas/ClientePickerFullscreen.jsx** | Selector de cliente (buscar, elegir). |
| **components/pos-ventas/ModalAperturaTurno.jsx** | Apertura de turno: monto inicial. |
| **components/pos-ventas/ModalCierreTurno.jsx** | Cierre de turno: monto real, observaciones, resumen (GET turnos/resumen). |
| **components/pos-ventas/ModalConfirmacion.jsx** | Modal genérico confirmar/cancelar (ej. límite crédito excedido). |
| **components/pos-ventas/ModalPendientesOffline.jsx** | Lista de ventas pendientes en cola, eliminar, vaciar, procesar cola, reimprimir. |
| **components/pos-ventas/StatsDelDia.jsx** | Estadísticas del día (ventas, total, ítems) vía GET stats-dia. |
| **components/pos-ventas/HistorialDia.jsx** | Historial de ventas del día (GET historial-dia). |

### Hooks / estado
- **useReducer(posVentaReducer, initialState)** — carrito, formaPago, clienteSeleccionado, descuento/descuentoInfo, puntosCanje/descuentoPorPuntos/saldoPuntos, modales (descuento, canje, efectivo, ticket, confirmación), cobrando.
- **useState (en page):** me, loading, errorMsg, successMsg, mostrarPickerCliente, turnoActual, mostrarCierre, mostrarHistorial, creditoInfo, ultimoBreakdown, datosPagoEfectivo, puntosActivo, puntosConfig, offlineMode, queueLength, procesandoCola, ultimoTicketOffline, mostrarPendientesOffline, offlineQueueSnapshot, grupoId.
- **useContextoActivo()** — localId, nombre (local), needsContexto.
- **useUser()** — perfil (permisos), cargando.
- **useRef:** prevOfflineModeRef, handleCobrarRef.
- **app/modulos/pos-ventas/reducer/posVentaReducer.js** — ActionTypes: ADD_ITEM, UPDATE_CANTIDAD, REMOVE_ITEM, CLEAR_CART, SET_CLIENTE, SET_DESCUENTO, REMOVE_DESCUENTO, SET_PUNTOS, REMOVE_PUNTOS, SET_FORMA_PAGO, SET_COBRANDO, OPEN_MODAL, CLOSE_MODAL, SET_SALDO_PUNTOS.
- **app/modulos/pos-ventas/helpers/offlineQueue.js** — loadQueue, saveQueue, enqueue, dequeueById, getQueueLength, clearQueue. Clave localStorage: `posVentasOfflineQueue_v1`.

### Endpoints / API usados
| Método | Ruta | Uso |
|--------|------|-----|
| GET | **/api/test** | Heartbeat para detectar offline. |
| GET | **/api/locales/{id}** | Obtener grupoId del local (para cola offline). |
| GET | **/api/pos-ventas/buscar-producto** | q, localId. Búsqueda productos (código exacto o nombre). |
| POST | **/api/pos-ventas/crear** | Registrar venta: clientTxnId, clienteId, turnoId, formaPago, descuento, items, esFiado, descuentoPorPuntos, puntosCanje. |
| GET | **/api/pos-ventas/stats-dia** | localId. Ventas del día (cantidad, total, ítems). |
| GET | **/api/pos-ventas/historial-dia** | localId, numero, formaPago, soloConTurno, vendedorId. Ventas del día con detalles. |
| GET | **/api/pos-ventas/turnos/actual** | localId. Turno abierto del vendedor. |
| POST | **/api/pos-ventas/turnos/abrir** | localId, montoInicial. |
| POST | **/api/pos-ventas/turnos/cerrar** | turnoId, montoRealEfectivo, observaciones. |
| GET | **/api/pos-ventas/turnos/resumen** | turnoId. Totales por forma de pago para cierre. |
| GET | **/api/pos-ventas/turnos/listar** | localId, etc. Listado de turnos. |
| GET | **/api/pos-ventas/turnos/ventas** | turnoId. Ventas de un turno. |
| GET | **/api/pos-ventas/caja-movimientos/listar** | turnoId. Movimientos de caja (INGRESO/RETIRO). |
| POST | **/api/pos-ventas/caja-movimientos/crear** | turnoId, tipo, monto, motivo. |
| GET | **/api/clientes/{id}** | Datos cliente (límite crédito). |
| GET | **/api/clientes/{id}/cuenta-corriente** | Saldo CC. |
| GET | **/api/locales/{id}** | Política límite crédito. |

### Modelos / tablas involucradas
- **Venta** — localId, vendedorId, clienteId, turnoId, numero, clientTxnId, subtotal, descuento, total, comisionBancaria, netoRecibido, costoTotal, gananciaBruta, gananciaNeta, formaPago, esFiado.
- **VentaDetalle** — ventaId, productoBaseId, nombre, precio, precioCosto, cantidad, subtotal, ganancia.
- **Turno** — localId, vendedorId, apertura, cierre, montoInicial, montoEsperadoEfectivo, montoRealEfectivo, diferenciaEfectivo, totalVentasEfectivo, totalVentasDigital, cantidadVentas, observaciones.
- **CajaMovimiento** — turnoId, usuarioId, tipo (INGRESO|RETIRO), monto, motivo.
- **MovimientoCuenta** — grupoId, localId, clienteId, tipo, direccion (DEBITO|CREDITO), monto, ventaId (cuenta corriente / fiado).
- **ClientePuntoMovimiento** — grupoId, localId, clienteId, direccion (CREDITO|DEBITO), tipo (ACREDITACION|CANJE|…), puntos, ventaId.
- **ProductoBase**, **ProductoLocal**, **StockLocal** — búsqueda y descuento de stock.
- **PosVentaCounter** — contador por local para número de venta.
- **ConfiguracionGrupo** — allowNegativeStock.
- **PuntosConfigLocal** — reglas puntos (puntosPorPeso, exclusiones).

### Flujo completo UI → hook → API → DB
1. **Entrada:** Usuario en /modulos/pos-ventas. useUser + useContextoActivo. Si no tiene permiso `pos.usar` → SinPermisos. Si needsContexto → redirect /inicio. Si localActual y me existen y turnoActual === null → ModalAperturaTurno (POST turnos/abrir → setTurnoActual).
2. **Turno actual:** Efecto que llama GET turnos/actual?localId= → setTurnoActual(turno o null).
3. **Búsqueda:** BuscadorProductos → GET buscar-producto?q=&localId= → items (ProductoLocal + base + stock). Usuario agrega → dispatch ADD_ITEM (producto con productoBaseId, precio, cantidad, unidadMedida, etc.).
4. **Carrito:** CarritoVenta muestra filas; UPDATE_CANTIDAD / REMOVE_ITEM. Subtotal/total calculados en página (carrito * precios - descuento - descuentoPorPuntos).
5. **Cliente:** Picker → GET clientes (implícito en ClientePickerFullscreen). SET_CLIENTE. Para fiado se consulta cuenta-corriente y cliente (límite).
6. **Descuento / puntos:** ModalDescuento → SET_DESCUENTO. ModalCanjePuntos → SET_PUNTOS; saldo viene de API (cuenta-corriente o endpoint puntos).
7. **Cobro:** FormaPago → handleCobrar. Si efectivo → ModalPagoEfectivo → handleConfirmarEfectivo. Si offline y efectivo → guardarVentaPendiente (enqueue en localStorage, ModalTicketOffline). Si online → ejecutarCobro → POST pos-ventas/crear (clientTxnId, turnoId, items, formaPago, descuento, etc.) → transacción: lock, número venta, validar/descontar stock, crear Venta + VentaDetalle, MovimientoCuenta si fiado, ClientePuntoMovimiento si canje; post-tx acreditar puntos fidelidad → respuesta con breakdown → OPEN_MODAL modalTicket (imprimir térmica/PDF).
8. **Cierre turno:** ModalCierreTurno → GET turnos/resumen → POST turnos/cerrar (montoRealEfectivo, observaciones) → onCerrado.
9. **Offline:** Heartbeat /api/test cada 10s; si falla → offlineMode. Cola en localStorage; al volver online, PROCESAR COLA → POST crear por cada ítem (con clientVentaId), dequeue al éxito.
10. **Historial:** HistorialDia → GET historial-dia (filtros opcionales).

---

## FUNCIONES ACTUALES

- **Cobro efectivo:** Forma pago efectivo; modal “paga con” / vuelto; POST crear con formaPago "efectivo"; sin comisión.
- **Débito / crédito / MercadoPago:** Formas de pago "debito", "credito", "mercadopago"; POST crear; comisión 7% (hardcode) aplicada en backend y mostrada en FormaPago (neto = total - comisión).
- **Descuento:** Modal descuento (monto o %); descuento manual en estado; enviado en POST crear; backend suma descuento automático (cliente/tags) + manual + puntos → descuentoTotal.
- **Recargo:** No existe; solo descuentos.
- **Cliente:** Selector fullscreen; opcional; usado para descuento automático (cliente/tags), fiado, puntos y límite de crédito.
- **Fiado / cuenta corriente:** Forma pago "fiado"; requiere cliente; validación límite de crédito (cliente + cuenta-corriente + politicaLimiteCredito BLOQUEAR/ADVERTIR); POST crear con esFiado true; se crea MovimientoCuenta DEBITO asociado a la venta.
- **Stock:** Buscar producto trae stock (StockLocal); CarritoVenta limita cantidad a stockMax; backend en crear valida y descuenta stock (FOR UPDATE); allowNegativeStock por ConfiguracionGrupo; respuesta allowNegativeStockUsed.
- **Cierre / turno / caja:** Apertura (monto inicial) → Turno; cierre con monto real contado; diferencia = real - esperado (esperado = montoInicial + totalEfectivo ventas). No se consideran CajaMovimiento (ingresos/retiros) en el cálculo de esperado. APIs: turnos/abrir, turnos/cerrar, turnos/actual, turnos/resumen, turnos/listar, turnos/ventas.
- **Ticket:** Post-venta modal con opción imprimir térmica (lib/pos-ventas/imprimirTicketTermico.js) o PDF (lib/pos-ventas/generarTicketPDF.js). Offline: ticket local (ModalTicketOffline) sin servidor.
- **Impresión:** Térmica vía ventana de impresión (ticketConfig desde localStorage); PDF descarga. No hay integración con impresora física directa.
- **Totales:** Subtotal (carrito), descuento manual, descuento por puntos, total a cobrar; backend devuelve breakdown (subtotal, descuentoAutomatico, descuentoManual, descuentoPorPuntos, descuentoTotal, total).
- **Validaciones:** Turno abierto para cobrar (online); cliente obligatorio para fiado; límite crédito (BLOQUEAR o ADVERTIR); cantidades > 0; items con precio; saldo puntos suficiente para canje; idempotencia por clientTxnId/clientVentaId; stock suficiente (o allowNegativeStock).
- **Permisos:** Página exige `pos.usar` (o admin *). Historial y turnos/ventas/caja-movimientos listar exigen `turnos.ver_todos` para ver otros vendedores. Varios endpoints de turnos/stats/buscar solo session, sin requirePerm(pos.usar).
- **Otras:** Descuento automático por cliente y tags; puntos por compra (ACREDITACION) y canje (DEBITO) en misma venta; cola offline solo efectivo; procesar cola al volver online; atajos F2–F6 forma pago, F10 cobrar; badge ONLINE/OFFLINE y pendientes.

---

## PROBLEMAS

### Bugs probables
- **Cierre de caja ignora CajaMovimiento:** turnos/cerrar calcula montoEsperadoEfectivo = montoInicial + totalEfectivo ventas. No suma INGRESO ni resta RETIRO de CajaMovimiento. Si hubo movimientos de caja, el “esperado” es incorrecto.
- **Procesar cola sin turno:** procesarCola verifica turnoActual?.id; si el usuario cierra turno y luego intenta procesar cola, no tiene turno. Las ventas pendientes quedan con turnoId null si se envían después (crear exige turnoId) → no se pueden procesar hasta abrir otro turno (correcto) pero el flujo no avisa claramente que debe abrir turno de nuevo.
- **Venta offline sin turnoId:** Los ítems en cola no guardan turnoId; al procesar se usa turnoActual.id. Si ese turno se cerró, las ventas se registran en el nuevo turno; no hay inconsistencia de datos pero el “turno” de la venta offline es el del momento del procesado, no el del momento del cobro.
- **Duplicado idempotencia:** Al procesar cola, si el backend devuelve isDuplicate (ok: true, isDuplicate: true), la página sí desencola (condición `data.ok || data.isDuplicate`). No hay bug de cola infinita por duplicado.

### Lógica inconsistente
- **Comisión 7% fija** en app/api/pos-ventas/crear/route.js y components/pos-ventas/FormaPago.jsx; no configurable por grupo/local.
- **Esperado en cierre = montoInicial + totalEfectivo;** no incluye CajaMovimiento. Los endpoints caja-movimientos/listar y caja-movimientos/crear existen pero no se usan en la UI del POS; el concepto de “ingresos/retiros de caja” no está integrado en el cierre.
- **Permisos en APIs:** pos-ventas/crear, historial-dia, turnos/listar, turnos/ventas, caja-movimientos/* usan requirePerm(req, "pos.usar"). turnos/abrir, turnos/cerrar, turnos/actual, turnos/resumen, stats-dia, buscar-producto solo getUsuarioSession; un usuario sin pos.usar podría abrir/cerrar turno o buscar productos si llama la API directa.

### UX mala
- **Cierre de turno sin ingresos/retiros visibles:** El usuario no ve ni registra ingresos/retiros desde el POS; si los usa otro módulo, el cierre sigue siendo solo “ventas efectivo”.
- **Procesar cola:** Si falla una venta (ej. stock), se corta el loop y las demás quedan en cola; no hay retry individual ni mensaje claro de “venta X falló por Y”.
- **Límite crédito ADVERTIR:** Modal de confirmación; si el usuario cierra sin elegir, el cobro no se realiza pero no hay feedback explícito de “cancelado”.

### Validaciones faltantes
- **turnos/abrir:** No valida que localId pertenezca al usuario/grupo más allá de sesión (session puede tener cualquier localId en teoría).
- **buscar-producto:** Si session.localId no coincide con localId y no es admin, devuelve 403; pero no se usa resolveLocalAndGrupo ni perm pos.usar.
- **stats-dia:** Sin permiso pos.usar; cualquier autenticado con localId puede ver totales del día de ese local.
- **Cantidad máxima en carrito:** Solo se limita por stockMax en stepper; no hay tope global ni validación de decimales para productos no kg.

### Riesgo de romper stock
- **allowNegativeStock:** Si está activo, se permite venta con stock negativo; se registra allowNegativeStockUsed. Riesgo operativo si no se controla carga/recepción.
- **Concurrencia:** Lock por producto en crear (FOR UPDATE StockLocal) y advisory lock por localId para número de venta; correcto. Posible condición de carrera si dos pestañas cobran al mismo tiempo (dos POST crear con mismos ítems) → doble descuento de stock; idempotencia por clientTxnId evita duplicar venta pero no evita dos ventas distintas con mismo stock.

### Riesgo de romper caja
- **Cierre sin movimientos de caja:** Si se usan ingresos/retiros en otro flujo, el “esperado” del cierre no los refleja.
- **Monto inicial / monto real:** No hay validación de monto real >= 0 ni tope; observaciones libres.

### Riesgo de romper ventas
- **Cola offline:** Si se borra localStorage o se cambia de dispositivo, las ventas pendientes se pierden.

### Hardcodeos
- **COMISION_PCT = 7** en app/api/pos-ventas/crear/route.js y components/pos-ventas/FormaPago.jsx.
- **Formas de pago** fijas en FormaPago.jsx (efectivo, mercadopago, debito, credito, fiado).
- **Heartbeat** 10s y timeout 2s en page.jsx.
- **Clave cola** posVentasOfflineQueue_v1 en offlineQueue.js.
- **Ancho ticket** 58/80 en imprimirTicketTermico (parámetro por defecto 58).

### Código duplicado
- **Cálculo comisión** (7% y neto) en crear/route.js y en FormaPago.jsx.
- **formatPrecio** en varios componentes (FormaPago, CarritoVenta, ModalCierreTurno, imprimirTicketTermico, etc.).
- **Construcción de payload de venta** (items, clienteId, descuento, etc.) en ejecutarCobro y en guardarVentaPendiente y en procesarCola con ligeras variaciones.

### Deuda técnica
- **Página monolítica:** page.jsx muy grande; mucho estado y lógica (cobro, offline, crédito, puntos, turno) en un solo archivo.
- **CajaMovimiento** no integrado en flujo de cierre ni en UI POS.
- **Permisos desiguales** entre endpoints (algunos con pos.usar, otros solo sesión).
- **Tipos formaPago** en string libre en DB; no hay enum; si se escribe "Efectivo" en vez de "efectivo" podría romper filtros/estadísticas.

---

## FALTANTES

- **Ingresos/retiros de caja en turno:** API existe (caja-movimientos/listar y crear) pero no hay UI en POS para registrar INGRESO/RETIRO ni para que el cierre use esos movimientos en “efectivo esperado”.
- **Comisión configurable:** No existe configuración por grupo/local para % comisión; siempre 7%.
- **Validación de permiso pos.usar en todos los endpoints de POS:** turnos/abrir, turnos/cerrar, turnos/actual, turnos/resumen, stats-dia, buscar-producto no verifican pos.usar.
- **Trazabilidad de venta offline:** Las ventas guardadas offline no tienen número de ticket hasta procesarse; el ticket offline solo tiene clientVentaIdCorto; no hay correlación explícita con venta posterior (aunque clientTxnId/clientVentaId lo permitiría).
- **Recargo:** No hay forma de aplicar recargo (solo descuento).
- **Anulación de venta:** No existe anulación/cancelación de venta ni devolución de stock desde el POS.
- **Múltiples formas de pago en una venta:** Solo una forma de pago por venta; no hay “parte efectivo, parte tarjeta”.
- **Auditoría de cambios:** No se registra quién cerró turno ni historial de movimientos de caja en pantalla POS (existe en DB).
- **Límite de ítems en búsqueda:** buscar-producto take 10 en búsqueda por nombre; sin paginación.

---

## PRIORIDAD 1 (CRÍTICO)

- **Cierre de caja sin CajaMovimiento:** El esperado de efectivo no incluye ingresos/retiros; riesgo de diferencias inexplicables. **CRÍTICO** para consistencia caja.
- **Permisos en APIs de turnos y búsqueda:** turnos/abrir, turnos/cerrar, turnos/actual, turnos/resumen, stats-dia, buscar-producto sin requirePerm("pos.usar"); acceso directo a APIs sin permiso POS. **CRÍTICO** seguridad/control.

---

## PRIORIDAD 2 (ALTO)

- **Comisión 7% hardcodeada:** Debe ser configurable (grupo/local). **ALTO** negocio.
- **allowNegativeStock sin advertencia fuerte en UI:** Aunque se muestra mensaje, el riesgo de stock negativo mal usado es alto. **ALTO** stock.
- **Página POS monolítica:** Dificulta mantenimiento y pruebas; extraer lógica a hooks o subcomponentes. **ALTO** deuda técnica.
- **Falta UI para ingresos/retiros de caja:** Si el negocio usa movimientos de caja, el POS debería permitir registrarlos y que el cierre los considere. **ALTO** funcional.

---

## PRIORIDAD 3 (MEDIO / BAJO)

- **formatPrecio y cálculo comisión duplicados:** Centralizar en util o constante. **MEDIO** mantenimiento.
- **Payload venta duplicado (ejecutarCobro vs guardarVentaPendiente vs procesarCola):** Unificar construcción. **MEDIO** mantenimiento.
- **Tipo formaPago en DB como string libre:** Valorar enum o whitelist para evitar valores inconsistentes. **MEDIO** datos.
- **Anulación de venta / devolución:** No existe; si se necesita, es feature nueva. **MEDIO** funcional.
- **Múltiples formas de pago por venta:** No soportado; feature. **BAJO** funcional.
- **Recargo:** No existe; feature. **BAJO** funcional.
- **Límite 10 en búsqueda productos:** Paginación o “ver más”. **BAJO** UX.

---

**Documento de auditoría; no incluye implementación ni cambios de código.**

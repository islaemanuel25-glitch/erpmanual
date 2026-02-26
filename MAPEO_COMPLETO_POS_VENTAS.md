# MAPEO COMPLETO: Módulo POS Ventas

**Fecha:** 2025-01-XX  
**Objetivo:** Listado completo de archivos, componentes, estados, hooks y flujos

---

## 1. PÁGINA PRINCIPAL

### Ruta y Archivo
- **Ruta:** `/modulos/pos-ventas`
- **URL:** `localhost:3000/modulos/pos-ventas`
- **Archivo:** `app/modulos/pos-ventas/page.jsx`
- **Tipo:** Página cliente (`"use client"`)
- **Líneas:** ~885

**Descripción:** Componente principal que orquesta todo el flujo del POS. Maneja estado global, coordina componentes, gestiona modales y ejecuta el proceso de venta completo.

---

## 2. COMPONENTES

### Componentes Principales (13 archivos)

#### 2.1. `components/pos-ventas/BuscadorProductos.jsx`
- **Función:** Busca productos por código de barra o nombre
- **Características:** 
  - Debounce 300ms en escritura manual
  - Detección automática de scanner (Enter rápido <200ms)
  - Búsqueda por voz (Web Speech API)
  - Autofocus al montar
- **Props:** `localId`, `onAgregar(producto)`
- **Eventos:** Ninguno (usa callback)

#### 2.2. `components/pos-ventas/CarritoVenta.jsx`
- **Función:** Muestra items del carrito, permite editar cantidad y eliminar
- **Características:**
  - Lista compacta en mobile, tabla en desktop
  - Validación de cantidad máxima (stockMax)
  - Muestra subtotal
- **Props:** `items`, `onCantidadChange`, `onEliminar`, `onLimpiar`, `subtotal`, `descuento`, `descuentoInfo`, `onAbrirDescuento`, `clienteSeleccionado`, `onAbrirCliente`
- **Eventos:** Ninguno (usa callbacks)

#### 2.3. `components/pos-ventas/FormaPago.jsx`
- **Función:** Selecciona forma de pago y muestra totales con comisiones
- **Características:**
  - 5 formas de pago: efectivo, mercadopago, debito, credito, fiado
  - Calcula comisión bancaria 7% para pagos digitales
  - Muestra neto recibido (total - comisión)
- **Props:** `subtotal`, `descuento`, `descuentoPorPuntos`, `formaPago`, `onFormaPagoChange`, `onCobrar`, `cobrando`, `disabled`
- **Eventos:** Ninguno (usa callbacks)

#### 2.4. `components/pos-ventas/ClientePickerFullscreen.jsx`
- **Función:** Pantalla fullscreen para buscar y seleccionar cliente
- **Características:**
  - Búsqueda mínima 2 caracteres
  - Opción "Consumidor Final" (sin cliente)
- **Props:** `localId`, `onSeleccionar(cliente)`, `onCerrar`
- **Eventos:** Ninguno (usa callbacks)

#### 2.5. `components/pos-ventas/ModalDescuento.jsx`
- **Función:** Aplica descuento manual (porcentaje o monto fijo)
- **Características:**
  - Botones rápidos para porcentajes (5%, 10%, 15%, 20%)
  - Preview en tiempo real
- **Props:** `subtotal`, `descuentoActual`, `onAplicar`, `onQuitar`, `onCancelar`
- **Eventos:** Ninguno (usa callbacks)

#### 2.6. `components/pos-ventas/ModalCanjePuntos.jsx`
- **Función:** Canjea puntos de fidelidad por descuento
- **Características:**
  - Botones rápidos (25%, 50%, 75%, Todo)
  - Preview de descuento calculado
- **Props:** `saldo`, `pesoPorPunto`, `canjeActual`, `onCanjear`, `onQuitar`, `onCancelar`
- **Eventos:** Ninguno (usa callbacks)

#### 2.7. `components/pos-ventas/ModalPagoEfectivo.jsx`
- **Función:** Captura monto recibido y calcula vuelto
- **Características:**
  - Montos sugeridos redondeados (1000, 5000, 10000)
  - Botón "Monto exacto"
  - Cálculo automático de vuelto
- **Props:** `total`, `onConfirmar({ pagaCon, vuelto })`, `onCancelar`
- **Eventos:** Ninguno (usa callbacks)

#### 2.8. `components/pos-ventas/ModalTicket.jsx`
- **Función:** Muestra opciones post-venta (imprimir térmico, PDF, no imprimir)
- **Características:**
  - 3 opciones: térmico, PDF, cancelar
- **Props:** `venta`, `onOpcion("termica"|"pdf")`, `onCerrar`
- **Eventos:** Ninguno (usa callbacks)

#### 2.9. `components/pos-ventas/ModalAperturaTurno.jsx`
- **Función:** Abre turno de caja con monto inicial
- **Características:**
  - Montos rápidos (0, 5000, 10000)
  - Validación de monto >= 0
- **Props:** `localId`, `vendedorNombre`, `onApertura(turno)`
- **Eventos:** Ninguno (usa callbacks)

#### 2.10. `components/pos-ventas/ModalCierreTurno.jsx`
- **Función:** Cierra turno con monto real contado y calcula diferencia
- **Características:**
  - Muestra resumen del turno (ventas, efectivo, digital)
  - Calcula diferencia automáticamente
  - Campo de observaciones opcional
- **Props:** `turno`, `onCerrar`, `onCerrado(turno)`
- **Eventos:** Ninguno (usa callbacks)

#### 2.11. `components/pos-ventas/StatsDelDia.jsx`
- **Función:** Muestra estadísticas del día (ventas, total, items)
- **Características:**
  - Auto-refresh cada 30 segundos
  - Hook interno `useStatsDelDia`
- **Props:** `localId`
- **Eventos:** Ninguno

#### 2.12. `components/pos-ventas/HistorialDia.jsx`
- **Función:** Muestra lista de ventas del día con detalle y reimpresión
- **Características:**
  - Modal con lista de ventas
  - Detalle de cada venta al hacer click
  - Botón de reimpresión
- **Props:** `localId`, `onReimprimir(venta)`, `onCerrar`
- **Eventos:** Ninguno (usa callbacks)

#### 2.13. `components/pos-ventas/ModalCliente.jsx`
- **Función:** Modal alternativo para seleccionar cliente (NO usado en página principal)
- **Estado:** Componente legacy, no se usa en el flujo actual
- **Nota:** El flujo actual usa `ClientePickerFullscreen`

---

## 3. ESTADOS PRINCIPALES

### Estados en `app/modulos/pos-ventas/page.jsx`

#### 3.1. Estados de Autenticación y Contexto
- `me` - Usuario actual (cargado de `/api/me`)
- `loading` - Estado de carga inicial
- `errorMsg` - Mensajes de error
- `successMsg` - Mensajes de éxito
- `contexto` - Contexto activo (localId, nombre) desde `useContextoActivo`
- `needsContexto` - Flag si necesita seleccionar contexto

#### 3.2. Estados del Carrito
- `carrito` - Array de items: `{ productoBaseId, nombre, precio, cantidad, stockMax }`
- `formaPago` - String: "efectivo" | "mercadopago" | "debito" | "credito" | "fiado"
- `cobrando` - Boolean: flag de proceso de cobro

#### 3.3. Estados de Cliente
- `clienteSeleccionado` - Object: `{ id, nombre, telefono?, documento?, email? }` o null
- `mostrarPickerCliente` - Boolean: controla visibilidad del picker
- `creditoInfo` - Object: `{ limiteCredito, saldoActual }` para ventas fiado

#### 3.4. Estados de Descuentos
- `descuento` - Number: monto de descuento manual
- `descuentoInfo` - Object: `{ tipo: "porcentaje"|"fijo", valor: number }` o null
- `modalDescuento` - Boolean: controla visibilidad del modal

#### 3.5. Estados de Puntos de Fidelidad
- `saldoPuntos` - Number: puntos disponibles del cliente
- `puntosActivo` - Boolean: si el sistema de puntos está activo
- `puntosConfig` - Object: configuración de puntos del local
- `puntosCanje` - Number: puntos a canjear en esta venta
- `descuentoPorPuntos` - Number: descuento calculado por puntos
- `modalCanjePuntos` - Boolean: controla visibilidad del modal

#### 3.6. Estados de Turno
- `turnoActual` - Object | null | undefined: turno abierto (undefined=cargando, null=sin turno)

#### 3.7. Estados de Modales
- `modalEfectivo` - Object | null: `{ total, formaPago }` para modal de pago efectivo
- `modalTicket` - Object | null: datos de venta para ticket
- `datosPagoEfectivo` - Object | null: `{ pagaCon, vuelto }`
- `mostrarCierre` - Boolean: controla modal de cierre de turno
- `mostrarHistorial` - Boolean: controla modal de historial

#### 3.8. Estados de Resultados
- `ultimoBreakdown` - Object | null: breakdown de última venta (subtotal, descuentos, total)

**Total:** ~20 estados independientes (useState)

---

## 4. HOOKS INVOLUCRADOS

### 4.1. Hooks de React
- `useState` - Gestión de estado local (20+ estados)
- `useEffect` - Efectos secundarios (cargar usuario, verificar turno, cargar puntos, shortcuts)
- `useCallback` - Callbacks memoizados (handleAgregar, handleCantidadChange, handleEliminar, handleLimpiar)
- `useRouter` - Navegación (Next.js)

### 4.2. Hooks Personalizados

#### `hooks/useContextoActivo.js`
- **Función:** Obtiene contexto operativo activo (localId, nombre)
- **Endpoint:** `GET /api/contexto-activo/get`
- **Retorna:** `{ loading, contexto, needsContexto }`
- **Uso:** Se usa en página principal para obtener localId

#### `app/context/UserContext` (useUser)
- **Función:** Contexto global de usuario
- **Retorna:** `{ perfil, cargando }`
- **Uso:** Verificación de permisos (`pos.usar` o `*`)

### 4.3. Hooks Internos de Componentes

#### `components/pos-ventas/StatsDelDia.jsx` - `useStatsDelDia`
- **Función:** Hook interno que carga stats cada 30 segundos
- **Endpoint:** `GET /api/pos-ventas/stats-dia`
- **Retorna:** `{ ventas, total, items }`

---

## 5. ENDPOINTS QUE CONSUME

### 5.1. Autenticación y Contexto
- **`GET /api/me`** - Obtiene usuario actual
- **`GET /api/contexto-activo/get`** - Obtiene contexto operativo activo

### 5.2. Búsqueda de Productos
- **`GET /api/pos-ventas/buscar-producto?q={query}&localId={localId}`**
  - Busca productos por código de barra o nombre
  - Retorna: `{ ok, items: [{ productoBaseId, nombre, codigoBarra, precioVenta, stock }] }`

### 5.3. Creación de Venta
- **`POST /api/pos-ventas/crear`**
  - Crea venta completa
  - Payload: `{ clientTxnId?, localId, clienteId?, turnoId?, formaPago, esFiado, descuento, descuentoPorPuntos, puntosCanje, items }`
  - Retorna: `{ ok, ventaId, numero, isDuplicate?, breakdown }`

### 5.4. Turnos de Caja
- **`GET /api/pos-ventas/turnos/actual?localId={localId}`** - Obtiene turno abierto
- **`POST /api/pos-ventas/turnos/abrir`** - Abre turno (payload: `{ localId, montoInicial }`)
- **`POST /api/pos-ventas/turnos/cerrar`** - Cierra turno (payload: `{ turnoId, montoRealEfectivo, observaciones? }`)
- **`GET /api/pos-ventas/turnos/resumen?turnoId={turnoId}`** - Resumen del turno

### 5.5. Estadísticas e Historial
- **`GET /api/pos-ventas/stats-dia?localId={localId}`** - Stats del día (ventas, total, items)
- **`GET /api/pos-ventas/historial-dia?localId={localId}`** - Lista de ventas del día

### 5.6. Clientes
- **`GET /api/clientes/buscar?localId={localId}&q={query}`** - Busca clientes (usado en ClientePickerFullscreen)
- **`GET /api/clientes/{id}?localId={localId}`** - Obtiene datos del cliente (para límite de crédito)
- **`GET /api/clientes/{id}/cuenta-corriente?localId={localId}`** - Obtiene saldo de cuenta corriente
- **`GET /api/clientes/{id}/puntos?localId={localId}`** - Obtiene saldo de puntos

### 5.7. Locales
- **`GET /api/locales/{id}`** - Obtiene datos del local (para política de límite de crédito)

---

## 6. FLUJO COMPLETO

### 6.1. Inicialización
1. Usuario accede a `/modulos/pos-ventas`
2. Se verifica autenticación (`GET /api/me`)
3. Se verifica permisos (`pos.usar` o `*`)
4. Se carga contexto activo (`useContextoActivo` → `GET /api/contexto-activo/get`)
5. Si no hay contexto → redirige a `/inicio`
6. Se verifica turno abierto (`GET /api/pos-ventas/turnos/actual`)
7. Si no hay turno → muestra `ModalAperturaTurno`

### 6.2. Buscar Producto
1. Usuario escribe en `BuscadorProductos` (o escanea código)
2. Debounce 300ms (o detección de scanner)
3. Llamada a `GET /api/pos-ventas/buscar-producto?q={query}&localId={localId}`
4. Se muestran resultados (máximo 10, solo con stock > 0)
5. Usuario hace click o presiona Enter → se agrega al carrito

### 6.3. Agregar al Carrito
1. Se ejecuta `handleAgregar(producto)` en página principal
2. Si el producto ya está en carrito → incrementa cantidad (si no excede stockMax)
3. Si no está → agrega nuevo item: `{ productoBaseId, nombre, precio, cantidad: 1, stockMax }`
4. Se actualiza estado `carrito`
5. Se recalcula `subtotal` automáticamente

### 6.4. Gestión del Carrito
- **Editar cantidad:** `handleCantidadChange(idx, nuevaCantidad)` → actualiza item en carrito
- **Eliminar item:** `handleEliminar(idx)` → filtra item del carrito
- **Limpiar carrito:** `handleLimpiar()` → resetea carrito y todos los estados relacionados

### 6.5. Seleccionar Cliente (Opcional)
1. Usuario presiona "Elegir cliente"
2. Se abre `ClientePickerFullscreen`
3. Usuario busca cliente (mínimo 2 caracteres)
4. Llamada a `GET /api/clientes/buscar?localId={localId}&q={query}`
5. Usuario selecciona cliente → se actualiza `clienteSeleccionado`
6. Si hay cliente → se cargan puntos (`GET /api/clientes/{id}/puntos`)
7. Si forma de pago es "fiado" → se carga info de crédito

### 6.6. Aplicar Descuentos (Opcional)
1. Usuario presiona "Descuento" en carrito
2. Se abre `ModalDescuento`
3. Usuario elige tipo (porcentaje o fijo) y valor
4. Se calcula descuento y se actualiza `descuento` y `descuentoInfo`
5. Se recalcula `total = subtotal - descuento - descuentoPorPuntos`

### 6.7. Canjear Puntos (Opcional)
1. Si hay cliente con puntos activos → se muestra botón "Puntos"
2. Usuario presiona → se abre `ModalCanjePuntos`
3. Usuario elige cantidad de puntos a canjear
4. Se actualiza `puntosCanje` y `descuentoPorPuntos` (solo estado local)
5. **Nota:** El canje real se hace dentro de la transacción de venta

### 6.8. Seleccionar Forma de Pago
1. Usuario selecciona forma de pago en `FormaPago`
2. Se actualiza `formaPago`
3. Si es "fiado" → se valida cliente seleccionado y límite de crédito
4. Se calcula comisión bancaria (7% para pagos digitales)

### 6.9. Cobrar
1. Usuario presiona "COBRAR" o F10
2. Se genera `clientTxnId` (UUID)
3. Se ejecuta `ejecutarCobro()`
4. Validaciones:
   - Si es fiado → verifica cliente y límite de crédito
   - Si es efectivo → abre `ModalPagoEfectivo`
5. Si no es efectivo → llama directamente a API

### 6.10. Pago en Efectivo (Si aplica)
1. Se abre `ModalPagoEfectivo`
2. Usuario ingresa monto recibido
3. Se calcula vuelto automáticamente
4. Usuario confirma → se ejecuta `ejecutarCobro()` con `pagoEfectivo: { pagaCon, vuelto }`

### 6.11. Proceso de Venta (Backend)
1. Llamada a `POST /api/pos-ventas/crear` con:
   - `clientTxnId` (para idempotencia)
   - `localId`, `clienteId?`, `turnoId?`
   - `formaPago`, `esFiado`
   - `descuento`, `descuentoPorPuntos`, `puntosCanje`
   - `items: [{ productoBaseId, nombre, precio, cantidad }]`

2. Backend:
   - Verifica idempotencia (si `clientTxnId` existe)
   - Obtiene número de venta thread-safe (contador)
   - Valida y descuenta stock con locks
   - Crea `Venta` + `VentaDetalle[]`
   - Si es fiado → crea `MovimientoCuenta` DEBITO
   - Si hay puntos → canjea puntos dentro de transacción
   - Acredita puntos por compra (post-transacción)

3. Response:
   - `{ ok: true, ventaId, numero, isDuplicate?, breakdown }`
   - O `{ ok: false, error }` con status 409 (stock/concurrencia) o 500

### 6.12. Post-Cobro
1. Si `ok: true`:
   - Se guarda `breakdown` en estado
   - Se preparan datos del ticket
   - Se muestra `ModalTicket`
   - Se limpia carrito y estados relacionados
   - Se resetea forma de pago a "efectivo"

2. Si `isDuplicate: true`:
   - Se muestra mensaje "Venta ya estaba registrada"
   - Se continúa flujo normal (ticket, limpiar)

3. Si `ok: false`:
   - Se muestra error (específico si es 409, genérico si es 500)

### 6.13. Impresión de Ticket
1. Usuario elige opción en `ModalTicket`:
   - **"termica":** Importa `imprimirTicketTermico` → abre ventana de impresión
   - **"pdf":** Importa `generarTicketPDF` → descarga PDF
   - **"no imprimir":** Solo cierra modal

2. Se muestra mensaje de éxito con número de venta

---

## 7. ARCHIVOS DE LIBRERÍAS

### 7.1. `lib/pos-ventas/imprimirTicketTermico.js`
- **Función:** Genera HTML con formato de ticket térmico (58mm/80mm)
- **Método:** Abre `window.open()` con HTML y llama `window.print()`
- **Dependencias:** Ninguna (HTML puro + CSS)

### 7.2. `lib/pos-ventas/generarTicketPDF.js`
- **Función:** Genera PDF usando jsPDF
- **Método:** `doc.save()` descarga el PDF
- **Dependencias:** `jspdf` (npm package)

---

## 8. ENDPOINTS DEL BACKEND

### 8.1. `app/api/pos-ventas/buscar-producto/route.js`
- **Método:** GET
- **Función:** Busca productos por código de barra o nombre
- **Validaciones:** Requiere `localId`, filtra solo activos con stock > 0
- **Modelos Prisma:** `ProductoLocal`, `ProductoBase`, `StockLocal`

### 8.2. `app/api/pos-ventas/crear/route.js`
- **Método:** POST
- **Función:** Crea venta completa con validaciones y transacciones
- **Validaciones:** Stock, puntos, límite de crédito, idempotencia
- **Modelos Prisma:** `Venta`, `VentaDetalle`, `StockLocal`, `MovimientoCuenta`, `ClientePuntoMovimiento`, `PosVentaCounter`

### 8.3. `app/api/pos-ventas/turnos/actual/route.js`
- **Método:** GET
- **Función:** Obtiene turno abierto del vendedor actual
- **Modelos Prisma:** `Turno`

### 8.4. `app/api/pos-ventas/turnos/abrir/route.js`
- **Método:** POST
- **Función:** Abre nuevo turno de caja
- **Validaciones:** Verifica que no haya turno abierto
- **Modelos Prisma:** `Turno`

### 8.5. `app/api/pos-ventas/turnos/cerrar/route.js`
- **Método:** POST
- **Función:** Cierra turno con monto real y calcula diferencia
- **Modelos Prisma:** `Turno`, `Venta`

### 8.6. `app/api/pos-ventas/turnos/resumen/route.js`
- **Método:** GET
- **Función:** Calcula resumen del turno (ventas, efectivo, digital, comisiones)
- **Modelos Prisma:** `Turno`, `Venta`

### 8.7. `app/api/pos-ventas/historial-dia/route.js`
- **Método:** GET
- **Función:** Lista ventas del día del local
- **Modelos Prisma:** `Venta`, `VentaDetalle`

### 8.8. `app/api/pos-ventas/stats-dia/route.js`
- **Método:** GET
- **Función:** Calcula estadísticas del día (cantidad ventas, total, items)
- **Modelos Prisma:** `Venta`, `VentaDetalle`

---

## 9. MODELOS DE BASE DE DATOS

### Modelos Prisma Usados

#### `Venta`
- Campos: `id`, `localId`, `vendedorId`, `clienteId?`, `turnoId?`, `numero`, `clientTxnId?`, `fecha`, `subtotal`, `descuento`, `total`, `comisionBancaria`, `netoRecibido`, `costoTotal`, `gananciaBruta`, `gananciaNeta`, `formaPago`, `esFiado`
- Relaciones: `VentaDetalle[]`, `MovimientoCuenta[]`, `ClientePuntoMovimiento[]`

#### `VentaDetalle`
- Campos: `id`, `ventaId`, `productoBaseId`, `nombre`, `precio`, `precioCosto`, `cantidad`, `subtotal`, `ganancia`

#### `Turno`
- Campos: `id`, `localId`, `vendedorId`, `apertura`, `cierre?`, `montoInicial`, `montoEsperadoEfectivo?`, `montoRealEfectivo?`, `diferenciaEfectivo?`, `totalVentasEfectivo?`, `totalVentasDigital?`, `cantidadVentas?`, `observaciones?`

#### `PosVentaCounter` (NUEVO)
- Campos: `id`, `grupoId`, `localId` (unique), `ultimoNumero`, timestamps
- Función: Contador thread-safe para números de venta

#### `StockLocal`
- Campos: `id`, `localId`, `productoId`, `cantidad`, `stockMin?`, `stockMax?`

#### `MovimientoCuenta`
- Campos: `id`, `grupoId`, `localId`, `clienteId`, `tipo`, `direccion`, `monto`, `ventaId?`, `userId?`, `nota?`

#### `ClientePuntoMovimiento`
- Campos: `id`, `grupoId`, `localId`, `clienteId`, `direccion`, `tipo`, `puntos`, `ventaId?`, `userId?`, `nota?`

---

## 10. FLUJO DETALLADO: Buscar → Agregar → Cobrar → Ticket

### Paso 1: Buscar Producto
**Archivo:** `components/pos-ventas/BuscadorProductos.jsx`
1. Usuario escribe en input (id="buscar-producto")
2. `handleChange` → debounce 300ms → `buscar(query)`
3. `GET /api/pos-ventas/buscar-producto?q={query}&localId={localId}`
4. Backend busca en `ProductoLocal` (match exacto código de barra o LIKE nombre)
5. Filtra solo productos con `stock > 0`
6. Retorna máximo 10 resultados
7. Se muestran en lista con nombre, código, stock, precio
8. Usuario hace click o presiona Enter → `handleAgregar(producto)`

### Paso 2: Agregar al Carrito
**Archivo:** `app/modulos/pos-ventas/page.jsx` (línea 251)
1. `handleAgregar(producto)` recibe: `{ productoBaseId, nombre, precioVenta, stock }`
2. Busca si producto ya está en carrito (`productoBaseId`)
3. Si existe:
   - Incrementa cantidad (si no excede `stockMax`)
4. Si no existe:
   - Agrega nuevo item: `{ productoBaseId, nombre, precio: precioVenta, cantidad: 1, stockMax: stock }`
5. Actualiza estado `carrito`
6. Limpia input de búsqueda y resultados

### Paso 3: Gestionar Carrito
**Archivo:** `components/pos-ventas/CarritoVenta.jsx`
- **Editar cantidad:** Input numérico → `onCantidadChange(idx, nuevaCantidad)`
- **Eliminar:** Botón "Quitar" → `onEliminar(idx)`
- **Limpiar:** Botón "Limpiar" → `onLimpiar()`
- **Subtotal:** Calculado en página principal: `carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0)`

### Paso 4: Seleccionar Cliente (Opcional)
**Archivo:** `components/pos-ventas/ClientePickerFullscreen.jsx`
1. Usuario presiona "Elegir cliente"
2. Se abre modal fullscreen
3. Usuario escribe mínimo 2 caracteres
4. `GET /api/clientes/buscar?localId={localId}&q={query}`
5. Se muestran resultados
6. Usuario selecciona → `onSeleccionar(cliente)`
7. Se actualiza `clienteSeleccionado`
8. Se cierra modal
9. Si hay cliente → useEffect carga puntos (`GET /api/clientes/{id}/puntos`)

### Paso 5: Aplicar Descuentos (Opcional)
**Archivo:** `components/pos-ventas/ModalDescuento.jsx`
1. Usuario presiona "Descuento" en carrito
2. Se abre modal
3. Usuario elige tipo (porcentaje o fijo) y valor
4. Se calcula: `descuento = tipo === "porcentaje" ? subtotal * valor/100 : valor`
5. `onAplicar(descuento, tipo, valor)`
6. Se actualiza `descuento` y `descuentoInfo`
7. Se recalcula `total = subtotal - descuento - descuentoPorPuntos`

### Paso 6: Canjear Puntos (Opcional)
**Archivo:** `components/pos-ventas/ModalCanjePuntos.jsx`
1. Si hay cliente con puntos activos → botón "Puntos" visible
2. Usuario presiona → se abre modal
3. Usuario elige cantidad de puntos
4. Se calcula: `descuentoPorPuntos = puntos * pesoPorPunto`
5. `onCanjear(puntos)` → solo actualiza estado local (`puntosCanje`, `descuentoPorPuntos`)
6. **Nota:** El canje real se hace en backend dentro de transacción

### Paso 7: Seleccionar Forma de Pago
**Archivo:** `components/pos-ventas/FormaPago.jsx`
1. Usuario selecciona botón de forma de pago (F2-F6)
2. `onFormaPagoChange(formaPago)` → actualiza `formaPago`
3. Si es "fiado" → valida cliente seleccionado
4. Se calcula comisión bancaria (7% para pagos digitales)
5. Se muestra total: `total = subtotal - descuento - descuentoPorPuntos`

### Paso 8: Cobrar
**Archivo:** `app/modulos/pos-ventas/page.jsx` (línea 446)
1. Usuario presiona "COBRAR" o F10
2. Se genera `clientTxnId = crypto.randomUUID()`
3. Se ejecuta `ejecutarCobro({ formaPago, total })`
4. Validaciones:
   - Si es fiado → verifica cliente y límite de crédito
   - Si es efectivo → abre `ModalPagoEfectivo`
5. Si no es efectivo → llama API directamente

### Paso 9: Pago en Efectivo (Si aplica)
**Archivo:** `components/pos-ventas/ModalPagoEfectivo.jsx`
1. Usuario ingresa monto recibido
2. Se calcula vuelto: `vuelto = pagaCon >= total ? pagaCon - total : 0`
3. Usuario confirma → `onConfirmar({ pagaCon, vuelto })`
4. Se ejecuta `ejecutarCobro()` con datos de pago efectivo

### Paso 10: Proceso de Venta (Backend)
**Archivo:** `app/api/pos-ventas/crear/route.js`
1. Verifica idempotencia (si `clientTxnId` existe → retorna venta existente)
2. Valida payload básico
3. Obtiene descuento automático del cliente
4. Calcula totales
5. Valida stock disponible (pre-transacción)
6. Valida saldo de puntos (si `puntosCanje > 0`)
7. Valida límite de crédito (si es fiado)
8. **Transacción:**
   - Obtiene número de venta thread-safe (contador con FOR UPDATE)
   - Valida y descuenta stock con locks (FOR UPDATE)
   - Crea `Venta` + `VentaDetalle[]`
   - Si es fiado → crea `MovimientoCuenta` DEBITO
   - Si hay puntos → canjea puntos dentro de transacción
9. Post-transacción: Acredita puntos por compra
10. Retorna: `{ ok: true, ventaId, numero, breakdown }`

### Paso 11: Post-Cobro
**Archivo:** `app/modulos/pos-ventas/page.jsx` (línea 490)
1. Si `data.ok`:
   - Si `data.isDuplicate` → muestra mensaje "Venta ya estaba registrada"
   - Guarda `breakdown` en estado
   - Prepara datos del ticket
   - Muestra `ModalTicket`
   - Limpia carrito y estados
2. Si `data.ok === false`:
   - Si status 409 → muestra error específico (stock/concurrencia)
   - Si status 500 → muestra error genérico

### Paso 12: Impresión de Ticket
**Archivo:** `components/pos-ventas/ModalTicket.jsx` + `lib/pos-ventas/`
1. Usuario elige opción:
   - **"termica":** `imprimirTicketTermico(ventaTicket)` → abre ventana con HTML → `window.print()`
   - **"pdf":** `generarTicketPDF(ventaTicket)` → genera PDF con jsPDF → `doc.save()`
   - **"no imprimir":** Solo cierra modal
2. Se muestra mensaje de éxito: "Venta #X registrada correctamente"

---

## RESUMEN DE ARCHIVOS

### Páginas (1)
- `app/modulos/pos-ventas/page.jsx` - Página principal

### Componentes (13)
- `components/pos-ventas/BuscadorProductos.jsx`
- `components/pos-ventas/CarritoVenta.jsx`
- `components/pos-ventas/FormaPago.jsx`
- `components/pos-ventas/ClientePickerFullscreen.jsx`
- `components/pos-ventas/ModalDescuento.jsx`
- `components/pos-ventas/ModalCanjePuntos.jsx`
- `components/pos-ventas/ModalPagoEfectivo.jsx`
- `components/pos-ventas/ModalTicket.jsx`
- `components/pos-ventas/ModalAperturaTurno.jsx`
- `components/pos-ventas/ModalCierreTurno.jsx`
- `components/pos-ventas/StatsDelDia.jsx`
- `components/pos-ventas/HistorialDia.jsx`
- `components/pos-ventas/ModalCliente.jsx` (legacy, no usado)

### APIs Backend (8)
- `app/api/pos-ventas/buscar-producto/route.js`
- `app/api/pos-ventas/crear/route.js`
- `app/api/pos-ventas/turnos/actual/route.js`
- `app/api/pos-ventas/turnos/abrir/route.js`
- `app/api/pos-ventas/turnos/cerrar/route.js`
- `app/api/pos-ventas/turnos/resumen/route.js`
- `app/api/pos-ventas/historial-dia/route.js`
- `app/api/pos-ventas/stats-dia/route.js`

### Librerías (2)
- `lib/pos-ventas/imprimirTicketTermico.js`
- `lib/pos-ventas/generarTicketPDF.js`

### Hooks (1)
- `hooks/useContextoActivo.js`

### Contextos (1)
- `app/context/UserContext` (useUser)

**Total:** 26 archivos principales

---

**FIN DEL MAPEO**


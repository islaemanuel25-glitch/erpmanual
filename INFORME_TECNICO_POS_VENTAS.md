# INFORME TÉCNICO: Módulo POS Ventas (ERP Azul)

**Fecha:** 2025-01-XX  
**Objetivo:** Mapeo end-to-end del flujo POS (UI → estado → hooks → APIs → DB → tickets/impresión)

---

## 1. ENTRY POINTS Y RUTAS

### Ruta Principal
- **Path:** `app/modulos/pos-ventas/page.jsx`
- **URL:** `localhost:3000/modulos/pos-ventas`
- **Tipo:** Página cliente (`"use client"`)

### Subrutas
- **NO HAY subrutas adicionales** - Todo el flujo está en una sola página con modales

### Layout Wrapper
- **NO hay layout específico** - Usa el layout general de `/modulos`
- **Guards:**
  - Verifica permisos: `pos.usar` o `*` (admin)
  - Verifica contexto activo (localId) - redirige a `/inicio` si falta
  - Verifica turno abierto - muestra `ModalAperturaTurno` si no hay turno

---

## 2. ÁRBOL DE COMPONENTES (UI)

### Componente Principal
**`app/modulos/pos-ventas/page.jsx`** (885 líneas)
- **Función:** Orquesta todo el flujo POS
- **Props:** Ninguna (página raíz)
- **Estado local:** 20+ estados useState (carrito, cliente, descuentos, puntos, turno, modales, etc.)

### Componentes Secundarios

#### 2.1. `BuscadorProductos` (`components/pos-ventas/BuscadorProductos.jsx`)
- **Función:** Busca productos por código/nombre, detecta scanner, soporta voz
- **Props:**
  - `localId` (number)
  - `onAgregar(producto)` - callback cuando se agrega producto
- **Eventos emitidos:** Ninguno (usa callback)
- **Características:**
  - Debounce 300ms en escritura manual
  - Detección de scanner: Enter rápido (<200ms entre teclas)
  - Búsqueda por voz (Web Speech API)
  - Autofocus al montar

#### 2.2. `CarritoVenta` (`components/pos-ventas/CarritoVenta.jsx`)
- **Función:** Muestra items del carrito, permite editar cantidad, eliminar
- **Props:**
  - `items` (array) - items del carrito
  - `onCantidadChange(idx, nuevaCantidad)` - callback al cambiar cantidad
  - `onEliminar(idx)` - callback al eliminar item
  - `onLimpiar()` - callback para limpiar todo
  - `subtotal` (number)
  - `descuento` (number)
  - `descuentoInfo` (object | null)
  - `onAbrirDescuento()` - callback para abrir modal descuento
  - `clienteSeleccionado` (object | null)
  - `onAbrirCliente()` - callback para abrir picker cliente
- **Eventos emitidos:** Ninguno (usa callbacks)
- **Responsive:** Lista compacta en mobile, tabla en desktop

#### 2.3. `FormaPago` (`components/pos-ventas/FormaPago.jsx`)
- **Función:** Selecciona forma de pago y muestra totales con comisiones
- **Props:**
  - `subtotal` (number)
  - `descuento` (number)
  - `descuentoPorPuntos` (number)
  - `formaPago` (string) - "efectivo" | "mercadopago" | "debito" | "credito" | "fiado"
  - `onFormaPagoChange(formaPago)` - callback al cambiar forma de pago
  - `onCobrar({ formaPago, total })` - callback al presionar COBRAR
  - `cobrando` (boolean)
  - `disabled` (boolean)
- **Eventos emitidos:** Ninguno (usa callbacks)
- **Comisiones:** 7% para pagos digitales (mercadopago, debito, credito)

#### 2.4. `ClientePickerFullscreen` (`components/pos-ventas/ClientePickerFullscreen.jsx`)
- **Función:** Pantalla fullscreen para buscar y seleccionar cliente
- **Props:**
  - `localId` (number)
  - `onSeleccionar(cliente)` - callback al seleccionar cliente
  - `onCerrar()` - callback para cerrar
- **Eventos emitidos:** Ninguno (usa callbacks)
- **Búsqueda:** Mínimo 2 caracteres, llama a `/api/clientes/buscar`

#### 2.5. `ModalDescuento` (`components/pos-ventas/ModalDescuento.jsx`)
- **Función:** Aplica descuento manual (porcentaje o monto fijo)
- **Props:**
  - `subtotal` (number)
  - `descuentoActual` (object | null) - `{ tipo, valor }`
  - `onAplicar(montoDescuento, tipo, valor)` - callback al aplicar
  - `onQuitar()` - callback para quitar descuento
  - `onCancelar()` - callback para cancelar
- **Eventos emitidos:** Ninguno (usa callbacks)

#### 2.6. `ModalCanjePuntos` (`components/pos-ventas/ModalCanjePuntos.jsx`)
- **Función:** Canjea puntos de fidelidad por descuento
- **Props:**
  - `saldo` (number) - puntos disponibles
  - `pesoPorPunto` (number) - valor en pesos por punto
  - `canjeActual` (number) - puntos ya canjeados
  - `onCanjear(puntos)` - callback al canjear
  - `onQuitar()` - callback para quitar canje
  - `onCancelar()` - callback para cancelar
- **Eventos emitidos:** Ninguno (usa callbacks)

#### 2.7. `ModalPagoEfectivo` (`components/pos-ventas/ModalPagoEfectivo.jsx`)
- **Función:** Captura monto recibido y calcula vuelto
- **Props:**
  - `total` (number)
  - `onConfirmar({ pagaCon, vuelto })` - callback al confirmar
  - `onCancelar()` - callback para cancelar
- **Eventos emitidos:** Ninguno (usa callbacks)
- **Montos sugeridos:** Redondea a 1000, 5000, 10000

#### 2.8. `ModalTicket` (`components/pos-ventas/ModalTicket.jsx`)
- **Función:** Muestra opciones post-venta (imprimir térmico, PDF, no imprimir)
- **Props:**
  - `venta` (object) - datos de la venta
  - `onOpcion(opcion)` - callback: "termica" | "pdf"
  - `onCerrar()` - callback para cerrar
- **Eventos emitidos:** Ninguno (usa callbacks)

#### 2.9. `ModalAperturaTurno` (`components/pos-ventas/ModalAperturaTurno.jsx`)
- **Función:** Abre turno de caja con monto inicial
- **Props:**
  - `localId` (number)
  - `vendedorNombre` (string)
  - `onApertura(turno)` - callback al abrir turno
- **Eventos emitidos:** Ninguno (usa callbacks)

#### 2.10. `ModalCierreTurno` (`components/pos-ventas/ModalCierreTurno.jsx`)
- **Función:** Cierra turno con monto real contado y calcula diferencia
- **Props:**
  - `turno` (object) - turno actual
  - `onCerrar()` - callback para cancelar
  - `onCerrado(turno)` - callback al cerrar turno
- **Eventos emitidos:** Ninguno (usa callbacks)

#### 2.11. `StatsDelDia` (`components/pos-ventas/StatsDelDia.jsx`)
- **Función:** Muestra estadísticas del día (ventas, total, items)
- **Props:**
  - `localId` (number)
- **Eventos emitidos:** Ninguno
- **Auto-refresh:** Cada 30 segundos

#### 2.12. `HistorialDia` (`components/pos-ventas/HistorialDia.jsx`)
- **Función:** Muestra lista de ventas del día con detalle y reimpresión
- **Props:**
  - `localId` (number)
  - `onReimprimir(venta)` - callback para reimprimir ticket
  - `onCerrar()` - callback para cerrar
- **Eventos emitidos:** Ninguno (usa callbacks)

---

## 3. ESTADO Y FLUJO DE DATOS

### Gestión de Estado
- **Tipo:** `useState` local (NO usa Context, Zustand, Redux, ni reducer)
- **Ubicación:** `app/modulos/pos-ventas/page.jsx`
- **Problema:** 20+ estados independientes sin gestión centralizada

### Estados Principales

#### Carrito
```javascript
const [carrito, setCarrito] = useState([]);
```
- **Estructura del item:**
  ```javascript
  {
    productoBaseId: number,
    nombre: string,
    precio: number,        // precio unitario
    cantidad: number,
    stockMax: number       // límite de stock disponible
  }
  ```
- **Operaciones:**
  - `handleAgregar(producto)` - Agrega o incrementa cantidad (línea 251)
  - `handleCantidadChange(idx, nuevaCantidad)` - Edita cantidad (línea 285)
  - `handleEliminar(idx)` - Elimina item (línea 296)
  - `handleLimpiar()` - Limpia todo el carrito (línea 303)

#### Cliente
```javascript
const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
const [mostrarPickerCliente, setMostrarPickerCliente] = useState(false);
```
- **Estructura:** `{ id, nombre, telefono?, documento?, email? }`
- **Fuente:** `ClientePickerFullscreen` → `/api/clientes/buscar`

#### Descuentos
```javascript
const [descuento, setDescuento] = useState(0);
const [descuentoInfo, setDescuentoInfo] = useState(null); // { tipo: "porcentaje"|"fijo", valor: number }
const [descuentoPorPuntos, setDescuentoPorPuntos] = useState(0);
```

#### Puntos de Fidelidad
```javascript
const [saldoPuntos, setSaldoPuntos] = useState(0);
const [puntosActivo, setPuntosActivo] = useState(false);
const [puntosConfig, setPuntosConfig] = useState(null);
const [puntosCanje, setPuntosCanje] = useState(0);
```

#### Turno
```javascript
const [turnoActual, setTurnoActual] = useState(undefined); // undefined=cargando, null=sin turno, object=turno
```

#### Forma de Pago
```javascript
const [formaPago, setFormaPago] = useState("efectivo");
```

### Cálculo de Totales

**Ubicación:** Líneas 322-327 de `page.jsx`

```javascript
const subtotal = carrito.reduce(
  (acc, item) => acc + item.precio * item.cantidad,
  0
);

const total = subtotal - descuento - descuentoPorPuntos;
```

**Descuentos:**
- **Manual:** Aplicado por usuario via `ModalDescuento`
- **Automático:** Calculado en backend según `cliente.descuentoPorcentaje` y tags del cliente
- **Por puntos:** Calculado como `puntosCanje * pesoPorPunto`

**Comisiones:**
- **7%** para pagos digitales (mercadopago, debito, credito)
- **NO se aplica al total** - solo se muestra como info interna
- **Neto recibido:** `total - comisionBancaria`

**Redondeo/Impuestos:**
- **NO hay redondeo automático** en el POS
- **NO hay impuestos** (IVA) en el cálculo

### Atajos de Teclado

**Ubicación:** Líneas 203-246 de `page.jsx`

```javascript
F1  → Focus en buscador de productos
F2  → Forma de pago: Efectivo
F3  → Forma de pago: MercadoPago
F4  → Forma de pago: Débito
F5  → Forma de pago: Crédito
F6  → Forma de pago: Fiado
F10 → Iniciar cobro (si hay items en carrito)
```

**Restricciones:**
- No intercepta si hay input/textarea activo
- No intercepta si hay modal abierto

---

## 4. BÚSQUEDA/AGREGADO DE PRODUCTOS

### Endpoint
- **Path:** `GET /api/pos-ventas/buscar-producto`
- **Archivo:** `app/api/pos-ventas/buscar-producto/route.js`

### Parámetros
- `q` (string) - query de búsqueda
- `localId` (number) - requerido

### Lógica de Búsqueda

1. **Match exacto por código de barra** (prioridad)
   ```javascript
   where: {
     localId,
     activo: true,
     base: { codigo_barra: q, activo: true }
   }
   ```

2. **Búsqueda por nombre/código** (LIKE, case-insensitive)
   ```javascript
   OR: [
     { nombre: { contains: q, mode: "insensitive" } },
     { base: { nombre: { contains: q, mode: "insensitive" } } },
     { base: { codigo_barra: { contains: q, mode: "insensitive" } } }
   ]
   ```

3. **Filtro:** Solo productos con `stock > 0`

### Response
```javascript
{
  ok: true,
  items: [
    {
      productoBaseId: number,
      productoLocalId: number,
      nombre: string,
      codigoBarra: string,
      precioVenta: number,
      precioCosto: number,
      stock: number
    }
  ]
}
```

### Debounce/Throttle
- **Debounce:** 300ms en escritura manual (`BuscadorProductos.jsx` línea 130)
- **Scanner:** Sin debounce - detección por timing (<200ms entre teclas + Enter)

### Manejo de Stock

**Validación en Frontend:**
- `BuscadorProductos` solo muestra productos con `stock > 0` (línea 93 de `buscar-producto/route.js`)
- `CarritoVenta` limita cantidad máxima a `item.stockMax` (línea 109, 152)

**Validación en Backend:**
- **NO HAY validación de stock** en `/api/pos-ventas/crear`
- **Riesgo:** Puede vender más de lo disponible si hay race conditions

**Descuento de Stock:**
- Se descuenta **después** de crear la venta (líneas 250-268 de `crear/route.js`)
- **Transacción:** Dentro de `prisma.$transaction` para atomicidad

---

## 5. CLIENTES

### Selección de Cliente
- **Componente:** `ClientePickerFullscreen` (fullscreen modal)
- **Trigger:** Botón "Elegir cliente" en header o carrito
- **Búsqueda:** Mínimo 2 caracteres
- **Endpoint:** `GET /api/clientes/buscar?localId={localId}&q={query}`

### Almacenamiento
- **Estado local:** `clienteSeleccionado` (useState)
- **NO se persiste** en localStorage ni sessionStorage
- **Se limpia** al limpiar carrito o después de cobrar

### Integración con Fiado/Cuenta Corriente

**Verificación de Límite de Crédito:**
- **Ubicación:** Líneas 356-393 de `page.jsx`
- **Endpoint:** 
  - `GET /api/clientes/{id}?localId={localId}` - obtiene `limiteCredito`
  - `GET /api/clientes/{id}/cuenta-corriente?localId={localId}` - obtiene saldo actual
  - `GET /api/locales/{localId}` - obtiene `politicaLimiteCredito`

**Políticas:**
- **"ADVERTIR":** Muestra confirmación si excede límite
- **"BLOQUEAR":** Impide la venta si excede límite

**Movimiento de Cuenta Corriente:**
- Se crea automáticamente en backend si `esFiado === true` (líneas 270-295 de `crear/route.js`)
- **Tipo:** `MovimientoCuenta` con `tipo: "VENTA"`, `direccion: "DEBITO"`

### Integración con Puntos

**Carga de Puntos:**
- **Endpoint:** `GET /api/clientes/{id}/puntos?localId={localId}`
- **Auto-carga:** useEffect cuando hay cliente seleccionado (líneas 162-198 de `page.jsx`)
- **Response:**
  ```javascript
  {
    ok: true,
    saldo: number,
    activo: boolean,
    config: { redencionJson: { pesoPorPunto: number } }
  }
  ```

**Canje de Puntos:**
- **Endpoint:** `POST /api/clientes/{id}/puntos` con `{ puntos, localId }`
- **Se ejecuta ANTES de cobrar** (líneas 802-825 de `page.jsx`)
- **Se asocia a la venta** después del cobro (líneas 347-365 de `crear/route.js`)

**Acreditación de Puntos:**
- Se calcula en backend después de crear la venta (líneas 300-370 de `crear/route.js`)
- **Fórmula:** `Math.floor(subtotalElegible * puntosPorPeso)`
- **Exclusiones:** Categorías y productos excluidos según `PuntosConfigLocal.exclusionesJson`

---

## 6. COBRO

### Métodos de Pago

1. **Efectivo**
   - Muestra `ModalPagoEfectivo` para capturar monto recibido
   - Calcula vuelto automáticamente
   - **NO tiene comisión**

2. **MercadoPago**
   - Cobro directo (sin modal adicional)
   - **Comisión:** 7% del total

3. **Débito**
   - Cobro directo
   - **Comisión:** 7% del total

4. **Crédito**
   - Cobro directo
   - **Comisión:** 7% del total

5. **Fiado**
   - Requiere cliente seleccionado
   - Valida límite de crédito antes de cobrar
   - Crea `MovimientoCuenta` DEBITO
   - **NO tiene comisión**

### Flujo al Presionar COBRAR

**Ubicación:** Líneas 398-539 de `page.jsx`

1. **Validaciones iniciales:**
   - Si es fiado → verifica cliente seleccionado
   - Si es fiado → verifica límite de crédito (línea 404)
   - Si es efectivo → abre `ModalPagoEfectivo` (línea 408)
   - Si no es efectivo → llama `ejecutarCobro` directo (línea 410)

2. **Ejecutar Cobro (`ejecutarCobro`):**
   - Valida `localActual` (línea 447)
   - Valida carrito no vacío (línea 452)
   - Setea `cobrando = true` (línea 460)

3. **Llamada API:**
   - **Endpoint:** `POST /api/pos-ventas/crear`
   - **Payload:**
     ```javascript
     {
       localId: number,
       clienteId: number | null,
       turnoId: number | null,
       formaPago: string,
       esFiado: boolean,
       descuento: number,
       descuentoPorPuntos: number,
       puntosCanje: number,
       items: [
         {
           productoBaseId: number,
           nombre: string,
           precio: number,
           cantidad: number
         }
       ]
     }
     ```

4. **Response:**
   ```javascript
   {
     ok: true,
     ventaId: number,
     numero: number,
     message: string,
     breakdown: {
       subtotal: number,
       descuentoAutomatico: number,
       descuentoManual: number,
       descuentoPorPuntos: number,
       descuentoTotal: number,
       total: number
     }
   }
   ```

5. **Post-cobro:**
   - Guarda `breakdown` en estado (línea 494)
   - Prepara datos del ticket (líneas 497-515)
   - Muestra `ModalTicket` (línea 518)
   - Limpia carrito y estados (líneas 521-529)

### Manejo de Errores

**Errores posibles:**
- `401` → Redirige a `/login`
- `400` → Muestra `data.error` en `errorMsg`
- `500` → Muestra "Error de conexion al cobrar"

**Retries:**
- **NO HAY retries automáticos**
- El usuario debe reintentar manualmente

**Confirmaciones:**
- Solo para fiado cuando excede límite (si política es "ADVERTIR")
- **NO hay confirmación** para otras formas de pago

---

## 7. APIs Y BACKEND

### Endpoints del POS

#### 7.1. `GET /api/pos-ventas/buscar-producto`
- **Archivo:** `app/api/pos-ventas/buscar-producto/route.js`
- **Método:** GET
- **Query params:**
  - `q` (string) - query de búsqueda
  - `localId` (number) - requerido
- **Response:**
  ```javascript
  {
    ok: true,
    items: Array<{
      productoBaseId: number,
      productoLocalId: number,
      nombre: string,
      codigoBarra: string,
      precioVenta: number,
      precioCosto: number,
      stock: number
    }>
  }
  ```
- **Validaciones:**
  - Requiere autenticación (`getUsuarioSession`)
  - Requiere `localId`
  - Filtra solo productos activos con stock > 0
- **Errores:**
  - `401` - No autenticado
  - `400` - localId requerido
  - `500` - Error interno

#### 7.2. `POST /api/pos-ventas/crear`
- **Archivo:** `app/api/pos-ventas/crear/route.js`
- **Método:** POST
- **Payload:**
  ```javascript
  {
    localId: number,
    clienteId: number | null,
    turnoId: number | null,
    formaPago: string,
    esFiado: boolean,
    descuento: number,
    descuentoPorPuntos: number,
    puntosCanje: number,
    items: Array<{
      productoBaseId: number,
      nombre: string,
      precio: number,
      cantidad: number
    }>
  }
  ```
- **Response:**
  ```javascript
  {
    ok: true,
    ventaId: number,
    numero: number,
    message: string,
    breakdown: {
      subtotal: number,
      descuentoAutomatico: number,
      descuentoManual: number,
      descuentoPorPuntos: number,
      descuentoTotal: number,
      total: number
    }
  }
  ```
- **Validaciones:**
  - Requiere `localId` y `grupoId` (via `resolveLocalAndGrupo`)
  - Requiere `formaPago`
  - Si `esFiado` → requiere `clienteId`
  - Valida items no vacíos
  - Valida cada item (productoBaseId, cantidad > 0, precio > 0)
  - Valida saldo de puntos si `puntosCanje > 0`
  - Valida límite de crédito si es fiado
  - Valida `total > 0`
- **Transacciones:**
  - **SÍ usa `prisma.$transaction`** (línea 209)
  - Operaciones atómicas:
    1. Obtener próximo número de venta
    2. Crear `Venta` + `VentaDetalle[]`
    3. Descontar stock (`StockLocal.updateMany` con `decrement`)
    4. Crear `MovimientoCuenta` si es fiado
- **Post-transacción:**
  - Acreditar puntos de fidelidad (líneas 300-370)
  - Asociar canje de puntos a la venta (líneas 347-365)
- **Errores:**
  - `400` - Validaciones fallidas
  - `401` - No autenticado
  - `500` - Error interno

#### 7.3. `GET /api/pos-ventas/turnos/actual`
- **Archivo:** `app/api/pos-ventas/turnos/actual/route.js`
- **Método:** GET
- **Query params:**
  - `localId` (number) - requerido
- **Response:**
  ```javascript
  {
    ok: true,
    turno: {
      id: number,
      localId: number,
      vendedorId: number,
      apertura: DateTime,
      cierre: DateTime | null,
      montoInicial: number,
      // ... más campos
    } | null
  }
  ```
- **Validaciones:**
  - Requiere autenticación
  - Requiere `localId`
- **Lógica:** Busca turno abierto (`cierre: null`) para el vendedor actual

#### 7.4. `POST /api/pos-ventas/turnos/abrir`
- **Archivo:** `app/api/pos-ventas/turnos/abrir/route.js`
- **Método:** POST
- **Payload:**
  ```javascript
  {
    localId: number,
    montoInicial: number
  }
  ```
- **Response:**
  ```javascript
  {
    ok: true,
    turno: Turno
  }
  ```
- **Validaciones:**
  - Requiere autenticación
  - Requiere `localId`
  - Verifica que NO haya turno abierto para el vendedor
- **Errores:**
  - `400` - Ya hay turno abierto
  - `401` - No autenticado
  - `500` - Error interno

#### 7.5. `POST /api/pos-ventas/turnos/cerrar`
- **Archivo:** `app/api/pos-ventas/turnos/cerrar/route.js`
- **Método:** POST
- **Payload:**
  ```javascript
  {
    turnoId: number,
    montoRealEfectivo: number,
    observaciones?: string
  }
  ```
- **Response:**
  ```javascript
  {
    ok: true,
    turno: Turno
  }
  ```
- **Validaciones:**
  - Requiere autenticación
  - Verifica que el turno pertenezca al vendedor actual
  - Verifica que el turno NO esté cerrado
- **Lógica:**
  - Calcula totales de ventas del turno
  - Calcula `montoEsperadoEfectivo = montoInicial + totalVentasEfectivo`
  - Calcula `diferenciaEfectivo = montoRealEfectivo - montoEsperadoEfectivo`
  - Actualiza turno con todos los campos
- **Errores:**
  - `400` - Turno ya cerrado
  - `404` - Turno no encontrado
  - `401` - No autenticado
  - `500` - Error interno

#### 7.6. `GET /api/pos-ventas/turnos/resumen`
- **Archivo:** `app/api/pos-ventas/turnos/resumen/route.js`
- **Método:** GET
- **Query params:**
  - `turnoId` (number) - requerido
- **Response:**
  ```javascript
  {
    ok: true,
    cantidadVentas: number,
    totalEfectivo: number,
    totalDigital: number,
    totalComision: number,
    netoDigital: number,
    desglose: {
      mercadopago: number,
      debito: number,
      credito: number
    }
  }
  ```
- **Validaciones:**
  - Requiere autenticación
  - Requiere `turnoId`

#### 7.7. `GET /api/pos-ventas/historial-dia`
- **Archivo:** `app/api/pos-ventas/historial-dia/route.js`
- **Método:** GET
- **Query params:**
  - `localId` (number) - requerido
- **Response:**
  ```javascript
  {
    ok: true,
    items: Array<{
      id: number,
      numero: number,
      fecha: DateTime,
      subtotal: number,
      descuento: number,
      total: number,
      formaPago: string,
      detalles: Array<{
        nombre: string,
        cantidad: number,
        precio: number,
        subtotal: number
      }>
    }>
  }
  ```
- **Validaciones:**
  - Requiere autenticación
  - Requiere `localId`
- **Lógica:** Ventas de hoy (`fecha >= hoy 00:00:00`)

#### 7.8. `GET /api/pos-ventas/stats-dia`
- **Archivo:** `app/api/pos-ventas/stats-dia/route.js`
- **Método:** GET
- **Query params:**
  - `localId` (number) - requerido
- **Response:**
  ```javascript
  {
    ok: true,
    stats: {
      ventas: number,
      total: number,
      items: number
    }
  }
  ```
- **Validaciones:**
  - Requiere autenticación
  - Requiere `localId`
- **Lógica:** Agregaciones de ventas de hoy

### Modelos Prisma Usados

#### `Venta`
```prisma
model Venta {
  id              Int
  localId         Int
  vendedorId      Int
  clienteId       Int?
  turnoId         Int?
  numero          Int              // Auto-incremental por local
  fecha           DateTime         @default(now())
  subtotal        Decimal
  descuento       Decimal          @default(0)
  total           Decimal
  comisionBancaria Decimal          @default(0)
  netoRecibido    Decimal          @default(0)
  costoTotal      Decimal          @default(0)
  gananciaBruta   Decimal          @default(0)
  gananciaNeta    Decimal          @default(0)
  formaPago       String
  esFiado         Boolean          @default(false)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}
```

#### `VentaDetalle`
```prisma
model VentaDetalle {
  id              Int
  ventaId         Int
  productoBaseId  Int
  nombre          String
  precio          Decimal
  precioCosto     Decimal           @default(0)
  cantidad        Int
  subtotal        Decimal
  ganancia        Decimal           @default(0)
  createdAt       DateTime          @default(now())
}
```

#### `Turno`
```prisma
model Turno {
  id                      Int
  localId                 Int
  vendedorId              Int
  apertura                DateTime         @default(now())
  cierre                  DateTime?
  montoInicial            Decimal
  montoEsperadoEfectivo   Decimal?
  montoRealEfectivo       Decimal?
  diferenciaEfectivo      Decimal?
  totalVentasEfectivo     Decimal?
  totalVentasDigital      Decimal?
  cantidadVentas          Int?
  observaciones           String?
  createdAt               DateTime         @default(now())
  updatedAt               DateTime         @updatedAt
}
```

#### `MovimientoCuenta`
```prisma
model MovimientoCuenta {
  id         Int
  grupoId    Int
  localId    Int
  clienteId  Int
  tipo       String           // "VENTA" | "PAGO" | "AJUSTE"
  direccion  String           // "DEBITO" | "CREDITO"
  monto      Decimal
  ventaId    Int?             // @unique - solo una venta puede crear un movimiento
  userId     Int?
  nota       String?
  createdAt  DateTime         @default(now())
}
```

#### `ClientePuntoMovimiento`
```prisma
model ClientePuntoMovimiento {
  id         Int
  grupoId    Int
  localId    Int
  clienteId  Int
  direccion  String           // "CREDITO" | "DEBITO"
  tipo       String           // "ACREDITACION" | "CANJE" | "AJUSTE" | "EXPIRACION"
  puntos     Int
  ventaId    Int?
  userId     Int?
  nota       String?
  createdAt  DateTime         @default(now())
}
```

#### `PuntosConfigLocal`
```prisma
model PuntosConfigLocal {
  id              Int
  grupoId         Int
  localId         Int              @unique
  activo          Boolean          @default(false)
  reglasJson      Json?            // { "puntosPorPeso": 0.01 }
  redencionJson   Json?            // { "pesoPorPunto": 10 }
  exclusionesJson Json?            // { "categoriaIds": [], "productoBaseIds": [] }
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}
```

### Relaciones Clave

- `Venta.localId` → `Local.id` (grupoId implícito via Local)
- `Venta.vendedorId` → `Usuario.id`
- `Venta.clienteId` → `Cliente.id` (opcional)
- `Venta.turnoId` → `Turno.id` (opcional)
- `VentaDetalle.ventaId` → `Venta.id` (CASCADE delete)
- `VentaDetalle.productoBaseId` → `ProductoBase.id`
- `MovimientoCuenta.ventaId` → `Venta.id` (@unique)
- `ClientePuntoMovimiento.ventaId` → `Venta.id` (@unique([ventaId, tipo]))

---

## 8. BASE DE DATOS

### Tablas Principales

#### `Venta`
- **Campos clave:**
  - `numero` - Auto-incremental por local (no global)
  - `fecha` - Timestamp de creación
  - `total` - Lo que paga el cliente (SIN comisión)
  - `comisionBancaria` - 7% para pagos digitales
  - `netoRecibido` - `total - comisionBancaria`
  - `costoTotal` - Suma de costos de productos
  - `gananciaBruta` - `total - costoTotal`
  - `gananciaNeta` - `netoRecibido - costoTotal`
- **Índices:**
  - `[localId]`
  - `[fecha]`

#### `VentaDetalle`
- **Campos clave:**
  - `precio` - Precio de venta unitario
  - `precioCosto` - Precio de costo unitario
  - `cantidad` - Cantidad vendida
  - `subtotal` - `precio * cantidad`
  - `ganancia` - `subtotal - (precioCosto * cantidad)`
- **Índices:**
  - `[ventaId]`
  - `[productoBaseId]`

#### `Turno`
- **Campos clave:**
  - `apertura` - Timestamp de apertura
  - `cierre` - Timestamp de cierre (null si abierto)
  - `montoInicial` - Efectivo al abrir
  - `montoEsperadoEfectivo` - `montoInicial + totalVentasEfectivo`
  - `montoRealEfectivo` - Efectivo contado al cerrar
  - `diferenciaEfectivo` - `montoRealEfectivo - montoEsperadoEfectivo`
- **Índices:**
  - `[localId]`
  - `[vendedorId]`
  - `[apertura]`

#### `MovimientoCuenta`
- **Campos clave:**
  - `tipo` - "VENTA" | "PAGO" | "AJUSTE"
  - `direccion` - "DEBITO" | "CREDITO"
  - `monto` - Monto del movimiento
  - `ventaId` - @unique (solo una venta puede crear un movimiento)
- **Índices:**
  - `[grupoId, localId, clienteId]`
  - `[clienteId]`
  - `[localId]`
  - `[createdAt]`

#### `ClientePuntoMovimiento`
- **Campos clave:**
  - `direccion` - "CREDITO" | "DEBITO"
  - `tipo` - "ACREDITACION" | "CANJE" | "AJUSTE" | "EXPIRACION"
  - `puntos` - Cantidad de puntos
  - `ventaId` - Opcional, se asocia después del canje
- **Índices:**
  - `[grupoId, localId, clienteId]`
  - `[localId]`
  - `[createdAt]`
- **Unique:** `[ventaId, tipo]` - Evita duplicar acreditaciones por venta

---

## 9. TURNOS/CAJA

### Apertura de Turno

**Flujo:**
1. Usuario entra a POS sin turno abierto
2. Se muestra `ModalAperturaTurno`
3. Usuario ingresa `montoInicial` (efectivo en caja)
4. Se llama `POST /api/pos-ventas/turnos/abrir`
5. Se crea `Turno` con `cierre: null`
6. Se actualiza estado `turnoActual`

**Validaciones:**
- No puede haber turno abierto para el mismo vendedor
- `montoInicial >= 0`

### Cierre de Turno

**Flujo:**
1. Usuario presiona "Cerrar Turno"
2. Se muestra `ModalCierreTurno`
3. Se carga resumen del turno (`GET /api/pos-ventas/turnos/resumen`)
4. Usuario ingresa `montoRealEfectivo` (efectivo contado)
5. Se calcula diferencia automáticamente
6. Se llama `POST /api/pos-ventas/turnos/cerrar`
7. Se actualiza `Turno` con todos los totales y `cierre: now()`
8. Se limpia estado `turnoActual = null`

**Cálculos:**
- `montoEsperadoEfectivo = montoInicial + totalVentasEfectivo`
- `diferenciaEfectivo = montoRealEfectivo - montoEsperadoEfectivo`
- `totalVentasDigital = sum(ventas donde formaPago != "efectivo")`
- `totalComision = sum(comisionBancaria de ventas digitales)`
- `netoDigital = totalVentasDigital - totalComision`

### Permisos

**NO HAY permisos específicos para turnos:**
- Cualquier usuario con `pos.usar` puede abrir/cerrar turno
- **Riesgo:** Múltiples turnos abiertos si hay bugs de concurrencia

**Reglas:**
- Un vendedor solo puede tener UN turno abierto a la vez
- El turno se asocia a `localId` y `vendedorId`
- **NO hay validación de grupo/depósito** - solo local

---

## 10. IMPRESIÓN / TICKET

### Generación de Ticket

**Ubicación:** `lib/pos-ventas/`

#### 10.1. `imprimirTicketTermico.js`
- **Función:** Genera HTML con formato de ticket térmico (58mm/80mm)
- **Método:** Abre `window.open()` con HTML y llama `window.print()`
- **Formato:**
  - Header: Nombre del local, número de ticket, fecha
  - Tabla: Producto, cantidad, subtotal
  - Totales: Subtotal, descuentos, total
  - Pago: Forma de pago, paga con, vuelto (si efectivo)
  - Footer: "Gracias por su compra"
- **Ancho:** 58mm o 80mm (configurable)
- **Dependencias:** Ninguna (HTML puro + CSS)

#### 10.2. `generarTicketPDF.js`
- **Función:** Genera PDF usando jsPDF
- **Método:** `doc.save()` descarga el PDF
- **Formato:** A4 con tabla de items y totales
- **Dependencias:** `jspdf` (npm package)

### Flujo de Impresión

1. **Post-venta:** Se muestra `ModalTicket` con opciones
2. **Opción "termica":**
   - Importa dinámicamente `imprimirTicketTermico`
   - Llama `imprimirTicketTermico(ventaTicket)`
   - Abre ventana de impresión del navegador
3. **Opción "pdf":**
   - Importa dinámicamente `generarTicketPDF`
   - Llama `generarTicketPDF(ventaTicket)`
   - Descarga PDF automáticamente
4. **Opción "no imprimir":**
   - Solo cierra el modal

### Datos del Ticket

```javascript
{
  numero: number,
  items: Array<{
    nombre: string,
    precio: number,
    cantidad: number
  }>,
  subtotal: number,
  descuento: number,
  descuentoAutomatico: number,
  descuentoManual: number,
  total: number,
  formaPago: string,
  vendedor: string,
  cliente: string,
  localNombre: string,
  pagaCon: number | null,      // Solo si efectivo
  vuelto: number | null         // Solo si efectivo
}
```

### Impresoras

**NO HAY integración directa con impresoras:**
- Usa el diálogo de impresión del navegador
- El usuario debe seleccionar la impresora manualmente
- **Riesgo:** No hay garantía de que se imprima correctamente

---

## 11. RIESGOS Y DEUDA TÉCNICA

### Cuellos de Botella

1. **Búsqueda de productos sin límite de resultados**
   - `buscar-producto/route.js` línea 65: `take: 10` solo en búsqueda por nombre
   - Match exacto por código de barra no tiene límite (pero solo devuelve 1)
   - **Riesgo:** Si hay muchos productos con mismo nombre, puede ser lento

2. **Cálculo de puntos post-transacción**
   - Líneas 300-370 de `crear/route.js` - fuera de la transacción
   - **Riesgo:** Si falla, la venta ya está creada pero sin puntos

3. **Stats del día sin caché**
   - `stats-dia/route.js` hace agregaciones cada 30 segundos
   - **Riesgo:** Muchas consultas a DB si hay muchos usuarios

### Re-renders

1. **20+ estados independientes en `page.jsx`**
   - Cada cambio de estado causa re-render completo
   - **Riesgo:** Performance en dispositivos lentos

2. **Stats auto-refresh cada 30s**
   - `StatsDelDia` actualiza estado cada 30s
   - **Riesgo:** Re-renders innecesarios si no cambia nada

### Estados Duplicados

1. **Cálculo de totales duplicado**
   - Frontend calcula `subtotal` y `total` (líneas 322-327)
   - Backend recalcula todo (líneas 91-99)
   - **Riesgo:** Inconsistencias si hay bugs en frontend

2. **Info de crédito cargada múltiples veces**
   - Se carga en `useEffect` (líneas 131-157)
   - Se vuelve a cargar en `verificarLimiteCredito` (líneas 360-363)
   - **Riesgo:** Requests duplicados innecesarios

### Endpoints Pesados

1. **`POST /api/pos-ventas/crear`**
   - Hace múltiples queries a DB:
     - Cliente y tags (líneas 66-88)
     - Validación de puntos (líneas 109-131)
     - Validación de crédito (líneas 134-174)
     - Productos base para costos (líneas 182-192)
     - Transacción con múltiples writes
     - Post-transacción: puntos (líneas 300-370)
   - **Riesgo:** Lento si hay muchos productos o clientes complejos

2. **`GET /api/pos-ventas/turnos/resumen`**
   - Agrega todas las ventas del turno
   - Calcula comisiones por cada venta
   - **Riesgo:** Lento si hay muchas ventas en el turno

### Race Conditions

1. **Stock sin validación en backend**
   - Frontend valida `stockMax` pero backend NO valida stock disponible
   - **Riesgo:** Dos ventas simultáneas pueden vender más de lo disponible

2. **Puntos canjeados antes de crear venta**
   - Se canjean puntos ANTES de cobrar (líneas 802-825)
   - Si falla el cobro, los puntos ya están canjeados
   - **Riesgo:** Puntos perdidos si falla la venta

3. **Turno abierto sin lock**
   - No hay lock en DB para evitar múltiples turnos
   - **Riesgo:** Dos requests simultáneos pueden crear dos turnos

### Otros Problemas

1. **NO HAY manejo offline**
   - Todo depende de conexión a internet
   - **Riesgo:** POS inutilizable si se cae la conexión

2. **NO HAY persistencia local del carrito**
   - Si se recarga la página, se pierde el carrito
   - **Riesgo:** Pérdida de trabajo del vendedor

3. **Errores silenciosos en puntos**
   - Si falla el procesamiento de puntos, solo se loguea (línea 368)
   - La venta continúa sin puntos
   - **Riesgo:** Clientes no reciben puntos sin saberlo

4. **Comisiones hardcodeadas**
   - `COMISION_PCT = 7` está hardcodeado en `FormaPago.jsx` y `crear/route.js`
   - **Riesgo:** No se puede cambiar sin modificar código

5. **Números de venta no thread-safe**
   - Se obtiene el último número y se incrementa (líneas 211-216)
   - Si hay concurrencia, puede haber números duplicados
   - **Riesgo:** Números de venta duplicados

---

## 12. MAPA OFFLINE (Solo Diagnóstico)

### Dependencias 100% Online

1. **Búsqueda de productos**
   - `GET /api/pos-ventas/buscar-producto` - requiere conexión
   - **Impacto:** No se puede buscar productos sin internet

2. **Creación de venta**
   - `POST /api/pos-ventas/crear` - requiere conexión
   - **Impacto:** No se puede cobrar sin internet

3. **Validación de stock**
   - Se consulta en cada búsqueda
   - **Impacto:** No se puede validar stock sin internet

4. **Validación de crédito**
   - Consulta saldo de cuenta corriente
   - **Impacto:** No se puede validar límite sin internet

5. **Canje de puntos**
   - `POST /api/clientes/{id}/puntos` - requiere conexión
   - **Impacto:** No se pueden canjear puntos sin internet

6. **Apertura/cierre de turno**
   - Requiere conexión para guardar en DB
   - **Impacto:** No se puede abrir/cerrar turno sin internet

### Qué Sería Cacheable/Local-First

1. **Catálogo de productos**
   - **Cacheable:** Productos activos con stock > 0
   - **Estrategia:** IndexedDB o localStorage
   - **Tamaño estimado:** ~100KB por 1000 productos
   - **Actualización:** Sync periódico o webhook

2. **Precios**
   - **Cacheable:** Precios de venta por producto
   - **Estrategia:** Mismo que productos
   - **Actualización:** Sync cuando cambien precios

3. **Clientes frecuentes**
   - **Cacheable:** Top 100 clientes más usados
   - **Estrategia:** IndexedDB
   - **Actualización:** Sync periódico

4. **Configuración de puntos**
   - **Cacheable:** `PuntosConfigLocal` del local actual
   - **Estrategia:** localStorage
   - **Actualización:** Sync al cambiar contexto

5. **Carrito**
   - **Cacheable:** Estado del carrito actual
   - **Estrategia:** sessionStorage
   - **Actualización:** Cada cambio en carrito

### Conflictos al Reconectar

1. **Ventas duplicadas**
   - **Problema:** Si se guarda venta offline y luego se sincroniza, puede duplicarse
   - **Solución:** IDs temporales (UUID) y deduplicación por timestamp

2. **Stock desactualizado**
   - **Problema:** Stock puede haber cambiado mientras estaba offline
   - **Solución:** Validar stock al sincronizar y rechazar si no hay suficiente

3. **Números de venta duplicados**
   - **Problema:** Dos POS offline pueden generar el mismo número
   - **Solución:** Prefijo por dispositivo o UUID como número temporal

4. **Puntos duplicados**
   - **Problema:** Puntos acreditados offline pueden duplicarse
   - **Solución:** Idempotencia por `ventaId + tipo` (ya existe unique constraint)

5. **Turnos conflictivos**
   - **Problema:** Múltiples turnos abiertos si hay reconexión
   - **Solución:** Validar turno único al sincronizar y cerrar duplicados

6. **Movimientos de cuenta corriente duplicados**
   - **Problema:** Movimientos offline pueden duplicarse
   - **Solución:** Idempotencia por `ventaId` (ya existe unique constraint)

---

## CONCLUSIÓN

El módulo POS Ventas es funcional pero tiene varias áreas de mejora:

### Fortalezas
- ✅ Flujo completo end-to-end funcional
- ✅ Transacciones atómicas para ventas
- ✅ Soporte para múltiples formas de pago
- ✅ Integración con puntos y cuenta corriente
- ✅ UI responsive y accesible

### Debilidades
- ❌ NO hay manejo offline
- ❌ Estados duplicados y re-renders innecesarios
- ❌ Validación de stock débil (solo frontend)
- ❌ Race conditions potenciales
- ❌ Comisiones hardcodeadas
- ❌ NO hay persistencia local del carrito

### Prioridades de Mejora
1. **Alta:** Validación de stock en backend
2. **Alta:** Manejo offline básico (carrito + productos)
3. **Media:** Optimización de re-renders (useMemo, useCallback)
4. **Media:** Configuración de comisiones en DB
5. **Baja:** Mejora de números de venta thread-safe

---

**FIN DEL INFORME**


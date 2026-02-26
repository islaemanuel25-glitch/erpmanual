# DISEÑO: Fixes Críticos POS Ventas

**Fecha:** 2025-01-XX  
**Objetivo:** Resolver 4 problemas críticos sin romper funcionalidad existente

---

## PROBLEMAS A RESOLVER

1. **Validación de stock en backend** - Evitar vender más que stock disponible
2. **Idempotencia del cobro** - Evitar ventas duplicadas por reintento
3. **Número de venta thread-safe** - Evitar números duplicados en concurrencia
4. **Puntos: canje seguro** - No canjear puntos si la venta falla

---

## A) ARCHIVOS A TOCAR

### Backend

1. **`app/api/pos-ventas/crear/route.js`**
   - Agregar validación de stock dentro de transacción
   - Agregar verificación de idempotencia (clientTxnId)
   - Cambiar generación de número de venta a thread-safe
   - Mover canje de puntos dentro de transacción

### Frontend

2. **`app/modulos/pos-ventas/page.jsx`**
   - Generar `clientTxnId` antes de llamar a API
   - Enviar `clientTxnId` en payload
   - Manejar respuesta de idempotencia (venta duplicada)
   - **NO canjear puntos antes de cobrar** - remover llamada a `/api/clientes/{id}/puntos` POST

### Base de Datos

3. **`prisma/schema.prisma`**
   - Agregar campo `clientTxnId` a modelo `Venta` (opcional, único)
   - Agregar índice único en `[localId, numero]` para garantizar unicidad

4. **Nueva migración Prisma**
   - `prisma/migrations/YYYYMMDDHHMMSS_add_pos_ventas_fixes/migration.sql`
   - Agregar columna `clientTxnId` a tabla `Venta`
   - Agregar índice único `venta_clientTxnId_unique`
   - Agregar índice único `venta_localId_numero_unique`

---

## B) CAMBIOS DE BASE DE DATOS

### Modelo Prisma: `Venta`

**Cambios:**
```prisma
model Venta {
  // ... campos existentes ...
  clientTxnId     String?          @unique  // UUID generado en frontend
  // ... resto de campos ...
  
  @@unique([localId, numero])  // NUEVO: garantiza unicidad de número por local
  @@index([clientTxnId])        // NUEVO: para búsqueda rápida de idempotencia
}
```

### Migración SQL

```sql
-- Agregar columna clientTxnId
ALTER TABLE "Venta" ADD COLUMN "clientTxnId" TEXT;

-- Crear índice único para clientTxnId
CREATE UNIQUE INDEX "Venta_clientTxnId_key" ON "Venta"("clientTxnId");

-- Crear índice único compuesto para localId + numero
CREATE UNIQUE INDEX "Venta_localId_numero_key" ON "Venta"("localId", "numero");

-- Crear índice para búsqueda rápida
CREATE INDEX "Venta_clientTxnId_idx" ON "Venta"("clientTxnId");
```

**Nota:** Los valores existentes de `clientTxnId` serán `NULL`, lo cual es válido (opcional).

---

## C) FLUJO NUEVO DE `/api/pos-ventas/crear` PASO A PASO

### Flujo Actual (Líneas 7-393)

```
1. Resolver localId/grupoId
2. Validar payload básico
3. Obtener descuento automático del cliente
4. Calcular totales
5. Validar saldo de puntos (si puntosCanje > 0)
6. Validar límite de crédito (si es fiado)
7. Calcular comisiones
8. Obtener precios de costo
9. Calcular ganancias
10. TRANSACCIÓN:
    a. Obtener último número de venta
    b. Incrementar número
    c. Crear Venta + VentaDetalle[]
    d. Descontar stock (sin validar)
    e. Crear MovimientoCuenta si fiado
11. POST-TRANSACCIÓN:
    a. Acreditar puntos
    b. Asociar canje de puntos
```

### Flujo Nuevo (Cambios Mínimos)

```
1. Resolver localId/grupoId
2. Validar payload básico
3. **NUEVO: Verificar idempotencia (si clientTxnId existe)**
   - Si existe venta con clientTxnId → retornar venta existente
4. Obtener descuento automático del cliente
5. Calcular totales
6. **NUEVO: Validar stock disponible (ANTES de transacción)**
   - Para cada item: verificar StockLocal.cantidad >= item.cantidad
   - Si falta stock → error 400 con detalle
7. Validar saldo de puntos (si puntosCanje > 0)
   - **CAMBIADO: Validar puntos DISPONIBLES (sin descontar aún)**
8. Validar límite de crédito (si es fiado)
9. Calcular comisiones
10. Obtener precios de costo
11. Calcular ganancias
12. TRANSACCIÓN:
    a. **CAMBIADO: Obtener número de venta thread-safe**
       - Usar SELECT FOR UPDATE en última venta
       - O usar tabla de contadores separada
    b. Crear Venta + VentaDetalle[] (con clientTxnId)
    c. **CAMBIADO: Validar y descontar stock atómicamente**
       - Para cada item: SELECT FOR UPDATE en StockLocal
       - Verificar cantidad >= item.cantidad
       - Si no hay stock → ROLLBACK
       - Descontar stock
    d. Crear MovimientoCuenta si fiado
    e. **NUEVO: Canjear puntos DENTRO de transacción (si puntosCanje > 0)**
       - Crear ClientePuntoMovimiento tipo "CANJE" con ventaId
       - Validar saldo nuevamente (por si cambió)
13. POST-TRANSACCIÓN:
    a. Acreditar puntos por compra (sin cambios)
```

### Pseudocódigo Detallado

```javascript
export async function POST(req) {
  try {
    // 1-2. Validaciones iniciales (sin cambios)
    const scope = await resolveLocalAndGrupo(req);
    const { grupoId, localId, session } = scope;
    const body = await req.json();
    const { 
      clientTxnId,  // NUEVO: UUID del frontend
      clienteId, 
      turnoId, 
      formaPago, 
      descuento, 
      items, 
      esFiado, 
      descuentoPorPuntos, 
      puntosCanje 
    } = body;

    // 3. NUEVO: Verificar idempotencia
    if (clientTxnId) {
      const ventaExistente = await prisma.venta.findUnique({
        where: { clientTxnId },
        select: { 
          id: true, 
          numero: true, 
          total: true,
          fecha: true 
        }
      });
      
      if (ventaExistente) {
        // Retornar venta existente (idempotencia)
        return NextResponse.json({
          ok: true,
          ventaId: ventaExistente.id,
          numero: ventaExistente.numero,
          message: `Venta #${ventaExistente.numero} ya registrada (idempotencia)`,
          isDuplicate: true,  // NUEVO: flag para frontend
          breakdown: { /* calcular desde ventaExistente */ }
        });
      }
    }

    // 4-5. Descuentos y totales (sin cambios)
    // ... código existente ...

    // 6. NUEVO: Validar stock disponible (ANTES de transacción)
    const stockValidations = [];
    for (const item of items) {
      const productoLocal = await prisma.productoLocal.findFirst({
        where: { localId, baseId: item.productoBaseId },
        select: { id: true }
      });
      
      if (!productoLocal) {
        return NextResponse.json({
          ok: false,
          error: `Producto ${item.nombre} no encontrado en este local`
        }, { status: 400 });
      }

      const stock = await prisma.stockLocal.findFirst({
        where: {
          localId,
          productoId: productoLocal.id
        },
        select: { cantidad: true }
      });

      const stockDisponible = Number(stock?.cantidad || 0);
      if (stockDisponible < item.cantidad) {
        return NextResponse.json({
          ok: false,
          error: `Stock insuficiente para ${item.nombre}. Disponible: ${stockDisponible}, Solicitado: ${item.cantidad}`
        }, { status: 400 });
      }

      stockValidations.push({
        productoLocalId: productoLocal.id,
        cantidadRequerida: item.cantidad,
        stockActual: stockDisponible
      });
    }

    // 7. Validar puntos (CAMBIADO: solo verificar, no descontar)
    if (clienteId && puntosCanje > 0) {
      // ... código existente de validación de saldo ...
      // NO crear movimiento aún, solo validar
    }

    // 8-11. Resto de validaciones y cálculos (sin cambios)
    // ... código existente ...

    // 12. TRANSACCIÓN
    const venta = await prisma.$transaction(async (tx) => {
      // a. NUEVO: Obtener número thread-safe
      // Opción 1: SELECT FOR UPDATE (recomendado)
      const ultima = await tx.$queryRaw`
        SELECT numero 
        FROM "Venta" 
        WHERE "localId" = ${localId}
        ORDER BY numero DESC 
        LIMIT 1
        FOR UPDATE
      `;
      const numero = (ultima?.[0]?.numero || 0) + 1;

      // Opción 2: Tabla de contadores (más complejo, no recomendado para este fix)

      // b. Crear venta con clientTxnId
      const nuevaVenta = await tx.venta.create({
        data: {
          localId,
          vendedorId: session.id,
          clienteId: clienteId || null,
          turnoId: turnoId || null,
          numero,
          clientTxnId: clientTxnId || null,  // NUEVO
          subtotal,
          descuento: descuentoTotal,
          total,
          comisionBancaria,
          netoRecibido,
          costoTotal,
          gananciaBruta,
          gananciaNeta,
          formaPago,
          esFiado: !!esFiado,
          detalles: {
            create: itemsConCosto.map((item) => ({
              productoBaseId: item.productoBaseId,
              nombre: item.nombre,
              precio: item.precio,
              precioCosto: item.precioCosto,
              cantidad: item.cantidad,
              subtotal: item.subtotalItem,
              ganancia: item.ganancia,
            })),
          },
        },
      });

      // c. CAMBIADO: Validar y descontar stock atómicamente
      for (const validation of stockValidations) {
        // SELECT FOR UPDATE para lockear la fila
        const stockLocked = await tx.$queryRaw`
          SELECT cantidad 
          FROM "StockLocal" 
          WHERE "localId" = ${localId} 
            AND "productoId" = ${validation.productoLocalId}
          FOR UPDATE
        `;

        const stockActual = Number(stockLocked[0]?.cantidad || 0);
        
        if (stockActual < validation.cantidadRequerida) {
          // ROLLBACK automático al lanzar error
          throw new Error(
            `Stock insuficiente. Disponible: ${stockActual}, Solicitado: ${validation.cantidadRequerida}`
          );
        }

        // Descontar stock
        await tx.stockLocal.updateMany({
          where: {
            localId,
            productoId: validation.productoLocalId,
          },
          data: {
            cantidad: { decrement: validation.cantidadRequerida }
          },
        });
      }

      // d. MovimientoCuenta si fiado (sin cambios)
      if (esFiado && clienteId) {
        // ... código existente ...
      }

      // e. NUEVO: Canjear puntos DENTRO de transacción
      if (clienteId && puntosCanje > 0) {
        // Validar saldo nuevamente (por si cambió)
        const aggPuntos = await tx.clientePuntoMovimiento.groupBy({
          by: ["direccion"],
          where: { clienteId, localId, grupoId },
          _sum: { puntos: true },
        });

        let creditosPuntos = 0;
        let debitosPuntos = 0;
        for (const row of aggPuntos) {
          const val = Number(row._sum.puntos || 0);
          if (row.direccion === "CREDITO") creditosPuntos = val;
          else if (row.direccion === "DEBITO") debitosPuntos = val;
        }
        const saldoPuntos = creditosPuntos - debitosPuntos;

        if (puntosCanje > saldoPuntos) {
          throw new Error("Saldo de puntos insuficiente durante la transacción");
        }

        // Crear movimiento de canje
        await tx.clientePuntoMovimiento.create({
          data: {
            grupoId,
            localId,
            clienteId,
            direccion: "DEBITO",
            tipo: "CANJE",
            puntos: puntosCanje,
            ventaId: nuevaVenta.id,  // Asociado directamente a la venta
            userId: session.id,
            nota: `Venta #${numero}`,
          },
        });
      }

      return nuevaVenta;
    });

    // 13. POST-TRANSACCIÓN: Acreditar puntos (sin cambios)
    // ... código existente ...

    return NextResponse.json({
      ok: true,
      ventaId: venta.id,
      numero: venta.numero,
      message: `Venta #${venta.numero} registrada correctamente`,
      breakdown: { /* ... */ }
    });
  } catch (err) {
    // Manejo de errores mejorado
    if (err.message.includes("Stock insuficiente")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 400 }
      );
    }
    if (err.code === 'P2002') {  // Unique constraint violation
      // Puede ser por clientTxnId duplicado o número duplicado
      return NextResponse.json(
        { ok: false, error: "Error de concurrencia. Intenta nuevamente." },
        { status: 409 }
      );
    }
    // ... resto de manejo de errores ...
  }
}
```

---

## D) CONTRATOS NUEVOS DE API

### Request: `POST /api/pos-ventas/crear`

**Payload (Cambios):**
```typescript
{
  // Campos existentes (sin cambios)
  localId: number;
  clienteId: number | null;
  turnoId: number | null;
  formaPago: string;
  esFiado: boolean;
  descuento: number;
  descuentoPorPuntos: number;
  puntosCanje: number;
  items: Array<{
    productoBaseId: number;
    nombre: string;
    precio: number;
    cantidad: number;
  }>;
  
  // NUEVO
  clientTxnId?: string;  // UUID v4 generado en frontend (opcional para retrocompatibilidad)
}
```

**Response Exitoso (Sin cambios en estructura, solo nuevo flag opcional):**
```typescript
{
  ok: true;
  ventaId: number;
  numero: number;
  message: string;
  isDuplicate?: boolean;  // NUEVO: true si es venta duplicada (idempotencia)
  breakdown: {
    subtotal: number;
    descuentoAutomatico: number;
    descuentoManual: number;
    descuentoPorPuntos: number;
    descuentoTotal: number;
    total: number;
  };
}
```

**Response Error Stock Insuficiente (NUEVO):**
```typescript
{
  ok: false;
  error: string;  // Ej: "Stock insuficiente para Producto X. Disponible: 5, Solicitado: 10"
}
```

**Response Error Concurrencia (NUEVO):**
```typescript
{
  ok: false;
  error: string;  // "Error de concurrencia. Intenta nuevamente."
}
```

**Response Error Idempotencia (Ya existe):**
```typescript
{
  ok: true;  // Es exitoso, pero es duplicado
  ventaId: number;
  numero: number;
  message: string;
  isDuplicate: true;
  breakdown: { /* ... */ };
}
```

---

## E) CAMBIOS EN FRONTEND

### `app/modulos/pos-ventas/page.jsx`

**Cambios en función `ejecutarCobro` (líneas 446-539):**

1. **Generar clientTxnId antes de llamar API:**
```javascript
const ejecutarCobro = async (datos, pagoEfectivo = null) => {
  // ... validaciones existentes ...

  // NUEVO: Generar UUID para idempotencia
  const clientTxnId = crypto.randomUUID();  // o usar uuid library

  setCobrando(true);

  try {
    const res = await fetch("/api/pos-ventas/crear", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientTxnId,  // NUEVO
        localId: localActual,
        clienteId: clienteSeleccionado?.id || null,
        turnoId: turnoActual?.id || null,
        formaPago: datos.formaPago,
        esFiado: datos.formaPago === "fiado",
        descuento,
        descuentoPorPuntos,
        puntosCanje,  // NUEVO: ahora se envía pero NO se canjea antes
        items: carrito.map((item) => ({
          productoBaseId: item.productoBaseId,
          nombre: item.nombre,
          precio: item.precio,
          cantidad: item.cantidad,
        })),
      }),
    });

    const data = await res.json();
    
    // NUEVO: Manejar respuesta de idempotencia
    if (data.ok && data.isDuplicate) {
      // Venta duplicada - mostrar mensaje pero continuar flujo normal
      setSuccessMsg(`Venta #${data.numero} ya estaba registrada.`);
    } else if (data.ok) {
      // ... resto del flujo existente ...
    } else {
      // NUEVO: Manejar error de stock específico
      if (data.error?.includes("Stock insuficiente")) {
        setErrorMsg(data.error);
        // Opcional: recargar stock y actualizar carrito
      } else {
        setErrorMsg(data.error || "Error al registrar la venta.");
      }
    }
  } catch (err) {
    // ... manejo de errores existente ...
  } finally {
    setCobrando(false);
  }
};
```

2. **REMOVER canje de puntos antes de cobrar (líneas 802-825):**

**ANTES:**
```javascript
onCanjear={async (pts) => {
  try {
    const res = await fetch(`/api/clientes/${clienteSeleccionado.id}/puntos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ puntos: pts, localId: localActual }),
    });
    const data = await res.json();
    if (data.ok) {
      setPuntosCanje(data.puntosUsados);
      setDescuentoPorPuntos(data.descuento);
      setSaldoPuntos(data.saldoNuevoEstimado);
      setModalCanjePuntos(false);
    }
  } catch (err) {
    // ...
  }
}}
```

**DESPUÉS:**
```javascript
onCanjear={(pts) => {
  // NUEVO: Solo actualizar estado local, NO llamar API
  setPuntosCanje(pts);
  // Calcular descuento localmente
  const descuentoCalc = pts * (puntosConfig?.redencionJson?.pesoPorPunto || 0);
  setDescuentoPorPuntos(descuentoCalc);
  // Estimar saldo nuevo (sin confirmar)
  setSaldoPuntos(saldoPuntos - pts);
  setModalCanjePuntos(false);
}}
```

**Nota:** El canje real se hará DENTRO de la transacción de la venta en el backend.

---

## F) RIESGOS Y CÓMO TESTEAR

### Riesgos Identificados

#### 1. Validación de Stock

**Riesgo:** Race condition entre validación pre-transacción y descuento en transacción.

**Mitigación:**
- Validación pre-transacción es optimista (mejora UX)
- Validación en transacción con `SELECT FOR UPDATE` es pesimista (garantiza corrección)
- Si falla en transacción, se hace ROLLBACK completo

**Test:**
```javascript
// Test concurrente: 2 ventas simultáneas del mismo producto
// Producto con stock = 10
// Venta 1: cantidad = 8
// Venta 2: cantidad = 5
// Resultado esperado: Una venta exitosa, otra falla con "Stock insuficiente"
```

#### 2. Idempotencia (clientTxnId)

**Riesgo:** Si el frontend no genera UUID único, puede haber colisiones.

**Mitigación:**
- Usar `crypto.randomUUID()` (nativo en navegadores modernos)
- Fallback a librería `uuid` si no está disponible
- El índice único en DB previene duplicados reales

**Test:**
```javascript
// Test: Enviar misma request 2 veces con mismo clientTxnId
// Resultado esperado: Primera vez crea venta, segunda vez retorna venta existente con isDuplicate=true
```

#### 3. Número de Venta Thread-Safe

**Riesgo:** `SELECT FOR UPDATE` puede causar deadlocks si hay muchas transacciones concurrentes.

**Mitigación:**
- `SELECT FOR UPDATE` solo bloquea la última fila, no toda la tabla
- Timeout de transacción en Prisma (configurable)
- Retry automático en caso de deadlock (Prisma lo maneja)

**Test:**
```javascript
// Test concurrente: 10 ventas simultáneas al mismo local
// Resultado esperado: Todas las ventas tienen números únicos y secuenciales
```

#### 4. Canje de Puntos en Transacción

**Riesgo:** Si falla la venta después de canjear puntos, los puntos se pierden.

**Mitigación:**
- Canje DENTRO de la transacción → si falla venta, se hace ROLLBACK del canje también
- Validación de saldo dentro de transacción (por si cambió)

**Test:**
```javascript
// Test: Venta con puntos que falla por stock insuficiente
// Resultado esperado: Puntos NO se descuentan (ROLLBACK completo)
```

### Casos de Prueba

#### Caso 1: Concurrencia - Stock
```
Setup: Producto con stock = 5
Acción: 3 ventas simultáneas con cantidad = 3 cada una
Resultado esperado:
  - 1 venta exitosa (stock queda en 2)
  - 2 ventas fallan con "Stock insuficiente"
```

#### Caso 2: Concurrencia - Números de Venta
```
Setup: Local con última venta #100
Acción: 5 ventas simultáneas
Resultado esperado:
  - Números: 101, 102, 103, 104, 105 (sin duplicados)
  - Todas las ventas se crean correctamente
```

#### Caso 3: Idempotencia - Reintento
```
Setup: Venta con clientTxnId = "abc-123"
Acción: 
  1. Primera request con clientTxnId = "abc-123" → éxito
  2. Segunda request con clientTxnId = "abc-123" (reintento)
Resultado esperado:
  - Primera: crea venta #50
  - Segunda: retorna venta #50 existente con isDuplicate=true
```

#### Caso 4: Puntos - Venta Fallida
```
Setup: Cliente con 100 puntos, intenta canjear 50
Acción: Venta con puntos que falla por stock insuficiente
Resultado esperado:
  - Venta NO se crea
  - Puntos NO se descuentan (siguen siendo 100)
```

#### Caso 5: Puntos - Concurrencia
```
Setup: Cliente con 100 puntos
Acción: 2 ventas simultáneas que canjean 80 puntos cada una
Resultado esperado:
  - 1 venta exitosa (puntos quedan en 20)
  - 1 venta falla con "Saldo de puntos insuficiente"
```

### Testing Offline Futuro

**Nota:** Estos fixes NO implementan offline, pero preparan el terreno:

1. **clientTxnId:** Útil para sincronización offline
   - Cada venta offline tiene UUID único
   - Al sincronizar, se verifica si ya existe
   - Evita duplicados al reconectar

2. **Validación de stock:** En offline, se validaría contra caché local
   - Al sincronizar, se revalida en servidor
   - Si falla, se rechaza la venta offline

3. **Números de venta:** En offline, se usarían números temporales
   - Formato: `TEMP-{UUID}` o `-{timestamp}`
   - Al sincronizar, se reemplazan por números reales

4. **Puntos:** En offline, se marcarían como "pendientes"
   - Al sincronizar, se procesan dentro de transacción
   - Si falla, se revierten

---

## RESUMEN DE CAMBIOS

### Archivos Modificados: 2
1. `app/api/pos-ventas/crear/route.js` - Lógica principal
2. `app/modulos/pos-ventas/page.jsx` - Frontend

### Archivos Nuevos: 1
1. `prisma/migrations/YYYYMMDDHHMMSS_add_pos_ventas_fixes/migration.sql`

### Cambios de Schema: 1
1. `prisma/schema.prisma` - Agregar `clientTxnId` y índices únicos

### Líneas Afectadas (Estimado)
- Backend: ~150 líneas modificadas/agregadas
- Frontend: ~30 líneas modificadas
- Schema: ~5 líneas agregadas
- Migración: ~10 líneas SQL

### Breaking Changes
- **Ninguno** - `clientTxnId` es opcional, retrocompatible

### Compatibilidad
- ✅ Funciona sin `clientTxnId` (retrocompatible)
- ✅ Funciona con `clientTxnId` (nuevo comportamiento)
- ✅ No rompe módulos existentes
- ✅ No cambia contratos de API existentes (solo agrega campos opcionales)

---

**FIN DEL DISEÑO**


# RESUMEN: Implementación de Fixes Críticos POS Ventas

**Fecha:** 2025-01-XX  
**Estado:** ✅ Implementado (pendiente migración)

---

## ARCHIVOS MODIFICADOS

### 1. `prisma/schema.prisma`

**Cambios:**
- ✅ Agregado campo `clientTxnId String? @unique` a modelo `Venta`
- ✅ Agregado `@@unique([localId, numero])` a modelo `Venta`
- ✅ Agregado `@@index([clientTxnId])` a modelo `Venta`
- ✅ Creado modelo `PosVentaCounter` para números thread-safe
- ✅ Agregadas relaciones en `Grupo` y `Local`

**Líneas modificadas:** ~15 líneas agregadas

---

### 2. `app/api/pos-ventas/crear/route.js`

**Cambios principales:**

#### A) Idempotencia (líneas 20-58)
```javascript
// Verificar idempotencia por clientTxnId
if (clientTxnId) {
  const ventaExistente = await prisma.venta.findUnique({
    where: { clientTxnId },
    // ...
  });
  if (ventaExistente) {
    return NextResponse.json({
      ok: true,
      isDuplicate: true,
      // ...
    });
  }
}
```

#### B) Contador thread-safe (líneas 248-272)
```javascript
// Obtener/crear contador con FOR UPDATE
const contadorRaw = await tx.$queryRaw`
  SELECT id, "ultimoNumero" 
  FROM "PosVentaCounter" 
  WHERE "localId" = ${localId}
  FOR UPDATE
`;

if (contadorRaw && Array.isArray(contadorRaw) && contadorRaw.length > 0) {
  numero = Number(contadorRaw[0].ultimoNumero) + 1;
  await tx.$executeRaw`UPDATE ...`;
} else {
  await tx.posVentaCounter.upsert({ ... });
}
```

#### C) Validación de stock con locks (líneas 274-310)
```javascript
// Para cada item:
const stockLocked = await tx.$queryRaw`
  SELECT cantidad 
  FROM "StockLocal" 
  WHERE "localId" = ${localId} AND "productoId" = ${productoLocal.id}
  FOR UPDATE
`;

const stockActual = Number(stockLocked[0].cantidad || 0);
if (stockActual < item.cantidad) {
  throw new Error(`Stock insuficiente...`);
}

// Descontar stock
await tx.stockLocal.updateMany({ ... });
```

#### D) Canje de puntos en transacción (líneas 350-380)
```javascript
// Dentro de la transacción, si puntosCanje > 0:
if (clienteId && puntosCanje > 0) {
  // Validar saldo dentro de tx
  const aggPuntos = await tx.clientePuntoMovimiento.groupBy({ ... });
  // ...
  if (puntosCanje > saldoPuntos) {
    throw new Error("Saldo de puntos insuficiente...");
  }
  
  // Crear movimiento de canje
  await tx.clientePuntoMovimiento.create({
    data: {
      direccion: "DEBITO",
      tipo: "CANJE",
      puntos: puntosCanje,
      ventaId: nuevaVenta.id,
      // ...
    },
  });
}
```

#### E) Manejo de errores mejorado (líneas 420-445)
```javascript
if (err.message && err.message.includes("Stock insuficiente")) {
  return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
}

if (err.code === 'P2002') {
  return NextResponse.json(
    { ok: false, error: "Error de concurrencia. Intenta nuevamente." },
    { status: 409 }
  );
}
```

**Líneas modificadas:** ~200 líneas (agregadas/modificadas)

---

### 3. `app/modulos/pos-ventas/page.jsx`

**Cambios principales:**

#### A) Generar clientTxnId (líneas 460-464)
```javascript
// Generar clientTxnId para idempotencia
const clientTxnId = typeof crypto !== "undefined" && crypto.randomUUID 
  ? crypto.randomUUID() 
  : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

#### B) Enviar clientTxnId en payload (línea 468)
```javascript
body: JSON.stringify({
  clientTxnId,  // NUEVO
  localId: localActual,
  // ... resto de campos
}),
```

#### C) Manejar respuesta isDuplicate (líneas 491-494)
```javascript
if (data.ok) {
  if (data.isDuplicate) {
    setSuccessMsg(`Venta #${data.numero} ya estaba registrada.`);
  }
  // ... resto del flujo
}
```

#### D) Manejar errores 409 (líneas 530-536)
```javascript
} else {
  if (res.status === 409) {
    setErrorMsg(data.error || "Error de concurrencia. Intenta nuevamente.");
  } else {
    setErrorMsg(data.error || "Error al registrar la venta.");
  }
}
```

#### E) Eliminar POST de canje de puntos (líneas 802-825 → 802-812)
**ANTES:**
```javascript
onCanjear={async (pts) => {
  const res = await fetch(`/api/clientes/${clienteSeleccionado.id}/puntos`, {
    method: "POST",
    // ...
  });
  // ...
}}
```

**DESPUÉS:**
```javascript
onCanjear={(pts) => {
  // Solo actualizar estado local, el canje se hará dentro de la transacción de venta
  setPuntosCanje(pts);
  const pesoPorPunto = puntosConfig?.redencionJson?.pesoPorPunto || 0;
  const descuentoCalc = pts * pesoPorPunto;
  setDescuentoPorPuntos(descuentoCalc);
  setSaldoPuntos(Math.max(0, saldoPuntos - pts));
  setModalCanjePuntos(false);
}}
```

**Líneas modificadas:** ~30 líneas (agregadas/modificadas)

---

## MIGRACIÓN PRISMA

**Comando para crear migración:**
```bash
npx prisma migrate dev --name add_pos_ventas_fixes
```

**SQL generado (estimado):**
```sql
-- Agregar clientTxnId a Venta
ALTER TABLE "Venta" ADD COLUMN "clientTxnId" TEXT;
CREATE UNIQUE INDEX "Venta_clientTxnId_key" ON "Venta"("clientTxnId");
CREATE UNIQUE INDEX "Venta_localId_numero_key" ON "Venta"("localId", "numero");
CREATE INDEX "Venta_clientTxnId_idx" ON "Venta"("clientTxnId");

-- Crear tabla PosVentaCounter
CREATE TABLE "PosVentaCounter" (
  "id" SERIAL NOT NULL,
  "grupoId" INTEGER NOT NULL,
  "localId" INTEGER NOT NULL,
  "ultimoNumero" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosVentaCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosVentaCounter_localId_key" ON "PosVentaCounter"("localId");
CREATE INDEX "PosVentaCounter_localId_idx" ON "PosVentaCounter"("localId");
CREATE INDEX "PosVentaCounter_grupoId_idx" ON "PosVentaCounter"("grupoId");

ALTER TABLE "PosVentaCounter" ADD CONSTRAINT "PosVentaCounter_localId_fkey" 
  FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosVentaCounter" ADD CONSTRAINT "PosVentaCounter_grupoId_fkey" 
  FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

---

## DIFERENCIAS POR ARCHIVO

### `prisma/schema.prisma`

**Agregado:**
```prisma
model Venta {
  // ...
  clientTxnId  String?        @unique
  // ...
  @@unique([localId, numero])
  @@index([clientTxnId])
}

model PosVentaCounter {
  id           Int      @id @default(autoincrement())
  grupoId      Int
  localId      Int      @unique
  ultimoNumero Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  local        Local    @relation(fields: [localId], references: [id])
  grupo        Grupo    @relation(fields: [grupoId], references: [id])

  @@index([localId])
  @@index([grupoId])
}
```

---

### `app/api/pos-ventas/crear/route.js`

**Agregado al inicio (después de línea 19):**
```javascript
const { clientTxnId, clienteId, turnoId, ... } = body;

// Verificar idempotencia por clientTxnId
if (clientTxnId) {
  const ventaExistente = await prisma.venta.findUnique({
    where: { clientTxnId },
    select: { id: true, numero: true, total: true, fecha: true, subtotal: true, descuento: true },
  });

  if (ventaExistente) {
    return NextResponse.json({
      ok: true,
      ventaId: ventaExistente.id,
      numero: ventaExistente.numero,
      message: `Venta #${ventaExistente.numero} ya registrada (idempotencia)`,
      isDuplicate: true,
      breakdown: { /* ... */ },
    });
  }
}
```

**Reemplazado en transacción (líneas 209-216):**
```javascript
// ANTES:
const ultima = await tx.venta.findFirst({ ... });
const numero = (ultima?.numero || 0) + 1;

// DESPUÉS:
const contadorRaw = await tx.$queryRaw`SELECT ... FOR UPDATE`;
// ... lógica de contador thread-safe
```

**Reemplazado descuento de stock (líneas 250-268):**
```javascript
// ANTES:
for (const item of items) {
  // ... encontrar productoLocal
  await tx.stockLocal.updateMany({ cantidad: { decrement: item.cantidad } });
}

// DESPUÉS:
for (const item of items) {
  // ... encontrar productoLocal
  const stockLocked = await tx.$queryRaw`SELECT cantidad ... FOR UPDATE`;
  const stockActual = Number(stockLocked[0].cantidad || 0);
  if (stockActual < item.cantidad) {
    throw new Error(`Stock insuficiente...`);
  }
  await tx.stockLocal.updateMany({ cantidad: { decrement: item.cantidad } });
}
```

**Agregado en creación de venta (línea 225):**
```javascript
clientTxnId: clientTxnId || null,  // NUEVO
```

**Agregado antes de return nuevaVenta (después de línea 295):**
```javascript
// Canjear puntos dentro de transacción (si puntosCanje > 0)
if (clienteId && puntosCanje > 0) {
  // ... validar saldo
  await tx.clientePuntoMovimiento.create({
    data: {
      direccion: "DEBITO",
      tipo: "CANJE",
      puntos: puntosCanje,
      ventaId: nuevaVenta.id,
      // ...
    },
  });
}
```

**Reemplazado manejo de errores (líneas 386-392):**
```javascript
// ANTES:
catch (err) {
  return NextResponse.json({ ok: false, error: "Error interno..." }, { status: 500 });
}

// DESPUÉS:
catch (err) {
  if (err.message && err.message.includes("Stock insuficiente")) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
  }
  if (err.code === 'P2002') {
    return NextResponse.json(
      { ok: false, error: "Error de concurrencia. Intenta nuevamente." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: false, error: "Error interno..." }, { status: 500 });
}
```

**Eliminado (líneas 347-365):**
```javascript
// REMOVIDO: Asociar canje reciente a esta venta
// (ya no se necesita, el canje se crea directamente en transacción)
```

---

### `app/modulos/pos-ventas/page.jsx`

**Agregado en ejecutarCobro (después de línea 460):**
```javascript
// Generar clientTxnId para idempotencia
const clientTxnId = typeof crypto !== "undefined" && crypto.randomUUID 
  ? crypto.randomUUID() 
  : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

**Agregado en body de fetch (línea 468):**
```javascript
body: JSON.stringify({
  clientTxnId,  // NUEVO
  localId: localActual,
  // ...
}),
```

**Agregado después de data.ok (línea 491):**
```javascript
if (data.ok) {
  if (data.isDuplicate) {
    setSuccessMsg(`Venta #${data.numero} ya estaba registrada.`);
  }
  // ... resto
}
```

**Reemplazado manejo de errores (líneas 530-532):**
```javascript
// ANTES:
} else {
  setErrorMsg(data.error || "Error al registrar la venta.");
}

// DESPUÉS:
} else {
  if (res.status === 409) {
    setErrorMsg(data.error || "Error de concurrencia. Intenta nuevamente.");
  } else {
    setErrorMsg(data.error || "Error al registrar la venta.");
  }
}
```

**Reemplazado onCanjear (líneas 802-825):**
```javascript
// ANTES: async function con fetch POST
onCanjear={async (pts) => {
  const res = await fetch(`/api/clientes/${clienteSeleccionado.id}/puntos`, {
    method: "POST",
    // ...
  });
  // ...
}}

// DESPUÉS: función síncrona que solo actualiza estado
onCanjear={(pts) => {
  setPuntosCanje(pts);
  const pesoPorPunto = puntosConfig?.redencionJson?.pesoPorPunto || 0;
  const descuentoCalc = pts * pesoPorPunto;
  setDescuentoPorPuntos(descuentoCalc);
  setSaldoPuntos(Math.max(0, saldoPuntos - pts));
  setModalCanjePuntos(false);
}}
```

---

## COMANDOS PARA APLICAR

### 1. Generar cliente Prisma
```bash
npx prisma generate
```

### 2. Crear y aplicar migración
```bash
npx prisma migrate dev --name add_pos_ventas_fixes
```

**Nota:** Si falla por shadow database, usar:
```bash
npx prisma migrate dev --name add_pos_ventas_fixes --skip-seed
```

### 3. Verificar build
```bash
npx next build
```

---

## VERIFICACIÓN

### Tests Manuales Recomendados

1. **Idempotencia:**
   - Hacer una venta
   - Reintentar con mismo clientTxnId
   - Verificar que retorna `isDuplicate: true`

2. **Stock:**
   - Producto con stock = 5
   - Intentar vender 10
   - Verificar error 409 "Stock insuficiente"

3. **Concurrencia números:**
   - Abrir 2 tabs del POS
   - Hacer ventas simultáneas
   - Verificar números únicos y secuenciales

4. **Puntos:**
   - Cliente con 100 puntos
   - Canjear 50 puntos
   - Intentar venta que falla (stock insuficiente)
   - Verificar que puntos NO se descuentan

---

## COMPATIBILIDAD

✅ **Retrocompatible:** Si `clientTxnId` no viene, funciona igual (opcional)  
✅ **No rompe módulos:** Solo cambios internos en POS  
✅ **Manejo de errores:** Errores específicos con códigos HTTP correctos

---

**FIN DEL RESUMEN**


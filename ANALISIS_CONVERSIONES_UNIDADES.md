# 🔍 ANÁLISIS COMPLETO: CONVERSIÓN DE UNIDADES Y STOCK

## 📊 RESUMEN EJECUTIVO

**PROBLEMA DETECTADO:**
El sistema tiene un flujo de conversión de unidades entre depósito y locales, pero presenta **inconsistencias críticas** que impiden manejar correctamente:
1. Packs rotos/incompletos en depósito
2. Edición de precio/margen desde depósito (está bloqueado incorrectamente)
3. Conversiones unidad ↔ pack ↔ cajón

---

## 🗂️ MODELO DE DATOS ACTUAL

### ProductoBase (Producto global por grupo)
```prisma
model ProductoBase {
  id                Int
  grupoId           Int
  nombre            String
  unidad_medida     UnidadMedida    // ⭐ unidad | pack | cajon | kg
  factor_pack       Int?            // ⭐ Conversión: 1 pack = X unidades
  precio_costo      Decimal
  precio_venta      Decimal
  margen            Decimal?
  // ... más campos
  locales           ProductoLocal[]
}

enum UnidadMedida {
  unidad
  pack
  cajon
  kg
}
```

### ProductoLocal (Override por local)
```prisma
model ProductoLocal {
  id           Int
  localId      Int
  baseId       Int
  precio_costo Decimal?   // Override del precio base
  precio_venta Decimal?   // Override del precio base
  margen       Decimal?   // Override del margen base
  activo       Boolean
  // ... más campos
  stock        StockLocal[]
}
```

### StockLocal (Inventario por local)
```prisma
model StockLocal {
  id         Int
  localId    Int
  productoId Int          // → ProductoLocal.id
  cantidad   Decimal      // ⭐⭐ SIEMPRE EN UNIDADES BASE
  stockMin   Decimal?
  stockMax   Decimal?
}
```

---

## 🔄 FLUJO ACTUAL DE CONVERSIÓN

### 1. CREACIÓN DE PRODUCTO

**Código: `app/api/productos/crear/route.js`**

```javascript
// Cuando depósito crea producto:
// 1. Crea ProductoBase con unidad_medida y factor_pack
// 2. Replica ProductoLocal en TODOS los locales del grupo
// 3. Crea StockLocal inicial en 0 para cada local
```

**Ejemplo:**
```javascript
// Depósito crea: Coca-Cola pack de 6
ProductoBase:
  nombre: "Coca-Cola"
  unidad_medida: "pack"
  factor_pack: 6
  precio_costo: 100
  precio_venta: 150

// Se crean automáticamente:
ProductoLocal (Depósito 1): baseId=123, localId=1
ProductoLocal (Local 2):    baseId=123, localId=2
ProductoLocal (Local 3):    baseId=123, localId=3

StockLocal (Depósito 1): cantidad=0
StockLocal (Local 2):    cantidad=0
StockLocal (Local 3):    cantidad=0
```

---

### 2. EDICIÓN DE PRODUCTO

**Código: `app/api/productos/editar/[id]/route.js`**

```javascript
// Línea 52-58:
if (localId <= 0) return await editarBase(baseId, baseData);

const local = await prisma.local.findUnique({
  where: { id: localId },
});

if (local?.es_deposito) return await editarBase(baseId, baseData);

// Línea 73-123: editarBase()
// ⭐ EDITA TODO: nombre, unidad_medida, factor_pack,
//               precio_costo, precio_venta, margen, etc.
```

**❌ PROBLEMA 1: DEPÓSITO PUEDE EDITAR PRECIO**

El código actual **SÍ permite** que depósito edite precio_costo, precio_venta y margen.

**Tu requerimiento:** 
> "Cuando estoy en depósito, no puedo editar el precio ni el porcentaje de venta"

**Realidad del código:**
```javascript
// editarBase() - línea 86-88
precio_costo: baseData.precio_costo,   // ⚠️ Se permite editar
precio_venta: baseData.precio_venta,   // ⚠️ Se permite editar
margen: baseData.margen,               // ⚠️ Se permite editar
```

---

### 3. TRANSFERENCIA DE DEPÓSITO → LOCAL

**Código: `app/api/transferencias/confirmar-recepcion/route.js`**

```javascript
// Línea 78-82: CONVERSIÓN AUTOMÁTICA
const factor = Number(d.producto.base.factor_pack || 1);

const recibidaBultos = recibida;             // depósito
const recibidaUnidades = recibida * factor;  // local

// Línea 131: SUMA UNIDADES AL LOCAL
update: { cantidad: { increment: recibidaUnidades } }

// Línea 186: DESCUENTA BULTOS DEL DEPÓSITO
update: { cantidad: { decrement: recibidaBultos } }
```

**Ejemplo real:**
```
Producto: Coca-Cola pack de 6
factor_pack = 6

ANTES:
  Depósito: 10 packs
  Local:    0 unidades

TRANSFERENCIA: 2 packs
  recibidaBultos = 2
  recibidaUnidades = 2 * 6 = 12

DESPUÉS:
  Depósito: 8 packs       (10 - 2)
  Local:    12 unidades   (0 + 12)
```

---

## ❌ PROBLEMAS CRÍTICOS DETECTADOS

### PROBLEMA 1: STOCK SIEMPRE EN UNIDADES, NO EN PACK

**Schema actual:**
```prisma
model StockLocal {
  cantidad Decimal  // ⚠️ NO distingue unidad vs pack
}
```

**Ejemplo del problema:**
```
Depósito tiene:
  10 packs completos de 6 uds
  
StockLocal guarda: cantidad = 10  (¿10 qué? ¿packs? ¿unidades?)

Si se rompe 1 ud del pack:
  Realidad física: 9 packs + 5 uds sueltas
  
StockLocal debería guardar: ???
  - ¿cantidad = 9.833 packs? (9 + 5/6)
  - ¿cantidad = 59 uds? (9*6 + 5)
  - ¿Dos campos separados?
```

**🔥 DESCUBRIMIENTO IMPORTANTE:**

Analizando el código de `confirmar-recepcion`:
- Línea 186: `decrement: recibidaBultos` (descuenta en unidad del depósito)
- Línea 131: `increment: recibidaUnidades` (suma unidades convertidas)

**ESTO SIGNIFICA QUE EL STOCK SE GUARDA DE FORMA DIFERENTE:**
- **Depósito:** cantidad en PACKS (sin convertir)
- **Local:** cantidad en UNIDADES (convertido)

**PERO NO HAY VALIDACIÓN NI DOCUMENTACIÓN DE ESTO.**

---

### PROBLEMA 2: NO SE PUEDE TRANSFERIR UNIDADES SUELTAS

**Flujo actual:**
```javascript
// pos-transferencias/enviar/route.js - línea 129-132
detallesTransferencia.push({
  productoId: productoLocalDestino.id,
  cantidad: item.cantidad,  // ⚠️ Sin especificar unidad
});
```

**Escenario real:**
```
Depósito tiene:
  - 10 packs completos (60 uds)
  - 1 pack roto con 5 uds

Usuario quiere transferir 5 uds sueltas al local.

❌ PROBLEMA:
  - Sistema no diferencia entre "5 packs" y "5 unidades"
  - No hay campo para especificar la unidad de medida de la transferencia
```

---

### PROBLEMA 3: EDICIÓN DE PRECIO DESDE DEPÓSITO

**Requerimiento:**
> "Cuando estoy en depósito, no puedo editar el precio ni el porcentaje de venta"

**Código actual (editar/[id]/route.js):**
```javascript
// Línea 73-123: editarBase() permite editar TODO
async function editarBase(baseId, baseData) {
  const dataFinal = {
    // ... otros campos
    precio_costo: baseData.precio_costo,   // ⚠️ SÍ edita
    precio_venta: baseData.precio_venta,   // ⚠️ SÍ edita
    margen: baseData.margen,               // ⚠️ SÍ edita
  };
  
  await prisma.productoBase.update({
    where: { id: baseId },
    data: dataFinal,
  });
}
```

**¿Por qué existe esta lógica?**

El sistema actual permite que depósito edite precios para que:
1. Actualice el precio_costo global (cuando cambia el proveedor)
2. Los locales pueden hacer override después

**Pero tu negocio necesita:**
- Depósito NO edita precios (solo locales)
- Depósito solo edita: nombre, categoría, unidad, factor, etc.

---

## 🎯 PROPUESTA DE SOLUCIÓN

### SOLUCIÓN 1: CAMPO ADICIONAL PARA UNIDADES SUELTAS

**Agregar a StockLocal:**
```prisma
model StockLocal {
  id              Int
  localId         Int
  productoId      Int
  cantidad        Decimal      // Stock en unidad base (packs, cajas, kg)
  cantidad_suelta Decimal?     // ⭐ NUEVO: Unidades sueltas
  stockMin        Decimal?
  stockMax        Decimal?
}
```

**Ejemplo:**
```
Producto: Coca-Cola pack de 6
Depósito tiene:
  - cantidad: 10 (10 packs completos)
  - cantidad_suelta: 5 (5 unidades sueltas de un pack roto)
  
Total real: (10 * 6) + 5 = 65 unidades
```

**Ventajas:**
- ✅ Clara separación entre bultos completos y sueltos
- ✅ Fácil de entender para el usuario
- ✅ Permite transferir unidades sueltas

**Desventajas:**
- ⚠️ Requiere migración de datos
- ⚠️ Más complejo en UI (dos inputs)

---

### SOLUCIÓN 2: TODO EN UNIDADES + CAMPO DE VISUALIZACIÓN

**Mantener StockLocal.cantidad en UNIDADES:**
```prisma
model StockLocal {
  cantidad Decimal  // SIEMPRE en unidades
}
```

**Agregar campo de presentación en ProductoBase:**
```prisma
model ProductoBase {
  unidad_medida       UnidadMedida
  factor_pack         Int?
  unidad_almacenaje   UnidadMedida?  // ⭐ NUEVO: cómo se almacena en depósito
}
```

**Ejemplo:**
```javascript
ProductoBase:
  nombre: "Coca-Cola"
  unidad_medida: "unidad"        // Se vende por unidad
  unidad_almacenaje: "pack"      // Se almacena en packs
  factor_pack: 6                 // 1 pack = 6 unidades

StockLocal (Depósito):
  cantidad: 65 unidades
  
UI muestra:
  "10 packs + 5 unidades" (65 / 6 = 10 resto 5)
```

**Ventajas:**
- ✅ Consistencia total: todo en unidades
- ✅ No requiere migración
- ✅ Cálculos más simples

**Desventajas:**
- ⚠️ UI más compleja (cálculo de división)
- ⚠️ Puede haber pérdida de precisión con decimales

---

### SOLUCIÓN 3: UNIDAD DINÁMICA EN TRANSFERENCIAS

**Agregar campo en TransferenciaDetalle:**
```prisma
model TransferenciaDetalle {
  id              Int
  transferenciaId Int
  productoId      Int
  cantidad        Decimal
  unidad_enviada  UnidadMedida  // ⭐ NUEVO: pack | unidad | cajon
  recibido        Decimal?
  // ...
}
```

**Flujo:**
```javascript
// Depósito envía:
TransferenciaDetalle:
  cantidad: 2
  unidad_enviada: "pack"
  
// Al confirmar, convierte según destino:
if (destino.es_deposito) {
  // Mantiene en packs
  cantidad_final = 2 packs
} else {
  // Convierte a unidades
  cantidad_final = 2 * 6 = 12 unidades
}
```

**Ventajas:**
- ✅ Flexibilidad total
- ✅ Histórico claro de qué se envió
- ✅ Permite enviar 5 unidades sueltas

**Desventajas:**
- ⚠️ Más complejidad en código de transferencias
- ⚠️ Requiere validaciones extras

---

### SOLUCIÓN 4: BLOQUEAR EDICIÓN DE PRECIO EN DEPÓSITO

**Cambio simple en `productos/editar/[id]/route.js`:**

```javascript
async function editarBase(baseId, baseData, esDeposito = false) {
  const dataFinal = {
    nombre: baseData.nombre,
    descripcion: baseData.descripcion,
    sku: baseData.sku,
    codigo_barra: baseData.codigo_barra,
    
    // Campos técnicos (siempre se permiten)
    unidad_medida: baseData.unidad_medida,
    factor_pack: baseData.factor_pack,
    categoria_id: baseData.categoria_id,
    proveedor_id: baseData.proveedor_id,
    area_fisica_id: baseData.area_fisica_id,
    
    // ⭐ CAMBIO: Solo editar precios si NO es depósito
    ...(esDeposito ? {} : {
      precio_costo: baseData.precio_costo,
      precio_venta: baseData.precio_venta,
      margen: baseData.margen,
    }),
    
    // Resto de campos...
  };
  
  await prisma.productoBase.update({
    where: { id: baseId },
    data: dataFinal,
  });
}
```

**Llamada actualizada:**
```javascript
// Línea 52-58:
if (localId <= 0) return await editarBase(baseId, baseData, true);

const local = await prisma.local.findUnique({
  where: { id: localId },
});

if (local?.es_deposito) {
  return await editarBase(baseId, baseData, true);  // ⭐ Pasa flag
}
```

---

## 📋 PREGUNTAS CRÍTICAS PARA TI

### 1. **¿Cómo se registra ACTUALMENTE el stock en depósito?**

Cuando hacés inventario físico en depósito:
- [ ] A) Contás packs completos: "Tengo 10 packs"
- [ ] B) Contás unidades totales: "Tengo 60 unidades"
- [ ] C) Ambos: "10 packs + 5 unidades sueltas"

### 2. **¿Qué pasa cuando se rompe un pack?**

- [ ] A) Lo dejás como está y seguís vendiendo del pack roto
- [ ] B) Separás las unidades sueltas y las contás aparte
- [ ] C) Lo eliminás del inventario (pérdida)

### 3. **¿Podés transferir unidades sueltas de depósito a local?**

- [ ] A) Sí, transfiero "5 unidades" (de un pack roto)
- [ ] B) No, solo transfiero packs completos
- [ ] C) Depende del producto

### 4. **¿Quién define los precios de venta?**

- [ ] A) Cada local define sus precios (override)
- [ ] B) Depósito define precio base, locales pueden override
- [ ] C) Solo administración central define precios

### 5. **¿Los locales compran o reciben?**

- [ ] A) Locales RECIBEN transferencias gratis de depósito
- [ ] B) Locales COMPRAN con precio interno
- [ ] C) Mix: algunos productos se cobran, otros no

---

## 🚀 PLAN DE ACCIÓN RECOMENDADO

### FASE 1: ARREGLOS INMEDIATOS (1-2 días)

**1. Bloquear edición de precio en depósito**
- ✅ Cambio simple en `productos/editar/[id]/route.js`
- ✅ Agregar validación en frontend también

**2. Documentar convención actual de stock**
- ¿Stock en packs o unidades?
- Agregar comentarios en código

**3. UI: Mostrar conversión en tiempo real**
```jsx
// En modal de transferencia
<div>
  <input value={cantidad} />
  {esDepositoOrigen && factor_pack > 1 && (
    <span className="text-xs text-gray-500">
      = {cantidad * factor_pack} unidades
    </span>
  )}
</div>
```

---

### FASE 2: MEJORAS ESTRUCTURALES (1 semana)

**Opción A: Agregar campo cantidad_suelta**
- Migración de DB
- Actualizar APIs de stock
- Actualizar UI de ajuste de stock
- Actualizar transferencias

**Opción B: Estandarizar todo en unidades**
- Agregar helpers de conversión
- Actualizar UI para mostrar packs automáticamente
- Validar que toda la lógica use unidades

---

### FASE 3: FEATURES AVANZADAS (2-3 semanas)

**1. Transferir unidades sueltas**
- Agregar selector de unidad en transferencias
- Validar conversiones

**2. Ajuste de stock con motivo**
```javascript
// Nuevo endpoint: /api/stock_locales/ajustar-pack-roto
{
  productoId: 123,
  packsCompletos: 10,
  unidadesSueltas: 5,
  motivo: "Pack roto en transporte"
}
```

**3. Reportes de pérdidas**
- Dashboard de packs rotos
- Historial de ajustes

---

## 📊 ARCHIVOS A MODIFICAR

### Cambio Inmediato (Bloquear precio en depósito):
```
✏️ app/api/productos/editar/[id]/route.js
✏️ components/productos/ModalProductoFinal.jsx
```

### Cambio Estructural (Solución 1 - campo suelta):
```
✏️ prisma/schema.prisma
✏️ app/api/productos/crear/route.js
✏️ app/api/stock_locales/ajustar/route.js
✏️ app/api/stock_locales/listar/route.js
✏️ app/api/transferencias/confirmar-recepcion/route.js
✏️ components/stock_locales/TablaStock.jsx
✏️ components/stock_locales/ModalAjuste.jsx
```

### Cambio Estructural (Solución 2 - todo unidades):
```
✏️ lib/conversiones.js (NUEVO)
✏️ app/api/stock_locales/* (agregar helpers)
✏️ components/stock_locales/* (UI conversión)
✏️ components/transferencias/* (UI conversión)
```

---

## 🎯 CONCLUSIÓN

El sistema actual **tiene la base** para manejar conversiones de unidades, pero:

❌ **Problemas:**
1. No maneja packs rotos/incompletos
2. Depósito puede editar precios (contra requerimiento)
3. No hay campo para diferenciar bultos completos de sueltos
4. Falta claridad en si stock es en packs o unidades

✅ **Tiene bien:**
1. Conversión automática en transferencias (factor_pack)
2. Sistema de override de precios por local
3. Separación depósito vs local

🎯 **Recomendación:**
1. **HOY:** Bloquear edición de precio en depósito (2 horas)
2. **ESTA SEMANA:** Decidir entre Solución 1 o 2
3. **PRÓXIMA SEMANA:** Implementar solución elegida

---

**¿Cuál de las soluciones te parece mejor? ¿O necesitás que combine aspectos de varias?**

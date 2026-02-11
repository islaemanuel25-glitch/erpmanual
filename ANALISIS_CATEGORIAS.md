# ANÁLISIS Y PLAN DE MEJORAS: MÓDULO DE CATEGORÍAS

## HALLAZGOS DEL ESCANEO

### Archivos encontrados:
- ✅ `app/api/categorias/listar/route.js` (139 líneas)
- ✅ `app/api/categorias/crear/route.js` (74 líneas)
- ✅ `app/api/categorias/editar/route.js` (98 líneas)
- ✅ `app/api/categorias/eliminar/route.js` (70 líneas)
- ✅ `app/api/catalogos/categorias/route.js` (2 líneas - reexporta listar)

### Estado actual:
- ❌ **Ningún endpoint valida sesión/permisos**
- ❌ **Bug en listar cuando destinoId/posId no tiene productos**
- ❌ **No hay constraint único en DB para nombre**

---

## A) PATRÓN EXACTO DE AUTH QUE YA EXISTE

### Referencia: `app/api/proveedores/crear/route.js`

**Fragmento de código:**
```javascript
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // ... resto del código ...
```

**Patrón completo:**
1. Importar `getUsuarioSession` de `@/lib/auth`
2. Al inicio del handler, llamar `getUsuarioSession(req)`
3. Si `!session`, retornar 401 con error "No autenticado"
4. (Opcional) Validar permisos específicos si aplica

**Nota:** Los endpoints de proveedores solo validan sesión, no permisos específicos. Para permisos, ver ejemplo en `app/api/usuarios/eliminar/[id]/route.js` que valida `usuarios.eliminar`.

---

## B) QUÉ LÍNEAS/BLOQUES DEBERÍAN MODIFICARSE

### 1. `app/api/categorias/listar/route.js`

**Ubicación:** Después del import, antes de `try`

**Bloque a agregar:**
```javascript
// Después de línea 3 (imports)
import { getUsuarioSession } from "@/lib/auth";

// Después de línea 6 (try), antes de línea 7
const session = getUsuarioSession(req);
if (!session) {
  return NextResponse.json(
    { ok: false, error: "No autenticado" },
    { status: 401 }
  );
}
```

**Riesgos:** 
- ⚠️ Bajo: Es solo lectura, no modifica datos
- ⚠️ Puede afectar llamadas desde frontend si no envían cookies

---

### 2. `app/api/categorias/crear/route.js`

**Ubicación:** Después del import, antes de `try`

**Bloque a agregar:**
```javascript
// Después de línea 3 (imports)
import { getUsuarioSession } from "@/lib/auth";

// Después de línea 6 (try), antes de línea 7
const session = getUsuarioSession(req);
if (!session) {
  return NextResponse.json(
    { ok: false, error: "No autenticado" },
    { status: 401 }
  );
}

// (Opcional) Validar permisos si se define en lib/permisos.js
// const permisos = Array.isArray(session.permisos) ? session.permisos : [];
// const esAdmin = permisos.includes("*");
// if (!esAdmin && !permisos.includes("categorias.crear")) {
//   return NextResponse.json(
//     { ok: false, error: "No tenés permisos para crear categorías." },
//     { status: 403 }
//   );
// }
```

**Riesgos:**
- ⚠️ Medio: Bloquea creación sin sesión
- ⚠️ Si se agregan permisos, actualizar `lib/permisos.js` y roles

---

### 3. `app/api/categorias/editar/route.js`

**Ubicación:** Después del import, antes de `try`

**Bloque a agregar:**
```javascript
// Después de línea 3 (imports)
import { getUsuarioSession } from "@/lib/auth";

// Después de línea 6 (try), antes de línea 7
const session = getUsuarioSession(req);
if (!session) {
  return NextResponse.json(
    { ok: false, error: "No autenticado" },
    { status: 401 }
  );
}
```

**Riesgos:**
- ⚠️ Medio: Bloquea edición sin sesión
- ⚠️ Similar a crear

---

### 4. `app/api/categorias/eliminar/route.js`

**Ubicación:** Después del import, antes de `try`

**Bloque a agregar:**
```javascript
// Después de línea 3 (imports)
import { getUsuarioSession } from "@/lib/auth";

// Después de línea 6 (try), antes de línea 7
const session = getUsuarioSession(req);
if (!session) {
  return NextResponse.json(
    { ok: false, error: "No autenticado" },
    { status: 401 }
  );
}
```

**Riesgos:**
- ⚠️ Alto: Bloquea eliminación sin sesión (crítico)
- ⚠️ Similar a crear/editar

---

### 5. `app/api/catalogos/categorias/route.js`

**Estado:** Solo reexporta `GET` de `listar/route.js`

**Acción:** No requiere cambios adicionales si se corrige `listar/route.js`

**Riesgos:**
- ✅ Ninguno: Se beneficia automáticamente del fix en listar

---

## C) LÓGICA ESPERADA PARA EL FIX destinoId/posId

### Problema identificado:

**Ubicación:** `app/api/categorias/listar/route.js` líneas 47-100

**Bug:**
Cuando se pasa `destinoId` o `posId` y NO hay productos asociados, `categoriaIdsFiltradas` queda como array vacío `[]`. Luego, en línea 99, se aplica:
```javascript
where.id = { in: Array.from(new Set(categoriaIdsFiltradas)) };
```

Si `categoriaIdsFiltradas` es `[]`, Prisma interpreta `{ in: [] }` como "ningún ID coincide", resultando en 0 resultados incluso si hay categorías en la BD.

### Lógica esperada:

**Caso 1: Sin destinoId ni posId**
- Devolver todas las categorías según filtros normales (estado, search)

**Caso 2: Con destinoId o posId, pero sin productos**
- Devolver array vacío `[]` (comportamiento actual es correcto conceptualmente)
- **PERO:** El problema es que si hay categorías en BD pero ningún producto las usa, debería devolver `[]` explícitamente, no fallar silenciosamente

**Caso 3: Con destinoId o posId, con productos pero sin categorías asignadas**
- `haySinCategoria = true`
- `categoriaIdsFiltradas = []` (solo IDs no-null)
- Devolver `[]` en items, pero `tieneSinCategoria: true`

**Caso 4: Con destinoId o posId, con productos y categorías**
- Devolver solo las categorías que tienen productos asociados

### Fix propuesto:

**Ubicación:** Línea 97-100

**Código actual:**
```javascript
if (categoriaIdsFiltradas && categoriaIdsFiltradas.length > 0) {
  where.id = { in: Array.from(new Set(categoriaIdsFiltradas)) };
}
```

**Lógica corregida:**
```javascript
// Si hay contexto (destinoId o posId), SIEMPRE aplicar filtro
if (destinoId || posId) {
  if (categoriaIdsFiltradas && categoriaIdsFiltradas.length > 0) {
    // Hay categorías con productos → filtrar por esas
    where.id = { in: Array.from(new Set(categoriaIdsFiltradas)) };
  } else {
    // No hay categorías con productos → devolver vacío explícitamente
    // Forzar where que nunca coincida
    where.id = { in: [] }; // Esto ya hace que no devuelva nada
    // O mejor: where.id = -1 (ID imposible)
  }
}
```

**Alternativa más clara:**
```javascript
// Si hay contexto (destinoId o posId)
if (destinoId || posId) {
  if (!categoriaIdsFiltradas || categoriaIdsFiltradas.length === 0) {
    // No hay productos con categorías → devolver vacío
    return NextResponse.json({
      ok: true,
      items: [],
      total: 0,
      totalPages: 1,
      tieneSinCategoria: haySinCategoria,
      error: null,
    });
  }
  // Hay categorías → aplicar filtro
  where.id = { in: Array.from(new Set(categoriaIdsFiltradas)) };
}
```

**Riesgos:**
- ⚠️ Bajo: Solo cambia el comportamiento cuando no hay productos
- ⚠️ Verificar que el frontend maneje correctamente arrays vacíos

---

## D) ESTRATEGIA DE MIGRACIÓN PARA unique(nombre)

### Estado actual en Prisma Schema:

```prisma
model Categoria {
  id        Int            @id @default(autoincrement())
  nombre    String         // ❌ NO tiene @unique
  activo    Boolean        @default(true)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  productos ProductoBase[]
}
```

### Problema:
- No hay constraint único en DB
- La validación de duplicados es solo en código (case-insensitive con Prisma)
- Puede haber duplicados si se insertan directamente en DB o con case diferente

### Estrategia de migración (sin romper datos existentes):

#### Paso 1: Verificar duplicados existentes

**SQL:**
```sql
-- Encontrar duplicados (case-insensitive)
SELECT 
  lower(trim(nombre)) as nombre_normalizado,
  COUNT(*) as cantidad,
  array_agg(id) as ids,
  array_agg(nombre) as nombres_reales
FROM "Categoria"
GROUP BY lower(trim(nombre))
HAVING COUNT(*) > 1;
```

**Acción:** Si hay duplicados, decidir:
- Opción A: Eliminar duplicados (mantener el más antiguo o el que tenga productos)
- Opción B: Renombrar duplicados (agregar sufijo numérico)

#### Paso 2: Normalizar nombres existentes

**SQL:**
```sql
-- Normalizar todos los nombres (trim + lowercase)
UPDATE "Categoria"
SET nombre = lower(trim(nombre));
```

**Riesgo:** ⚠️ Medio - Cambia los nombres visibles en la UI

#### Paso 3: Crear índice único funcional (PostgreSQL)

**SQL:**
```sql
-- Crear índice único sobre nombre normalizado
CREATE UNIQUE INDEX IF NOT EXISTS categoria_nombre_unique_idx
ON "Categoria" (lower(trim(nombre)));
```

**Ventajas:**
- ✅ No requiere cambiar el schema de Prisma
- ✅ Funciona a nivel de DB
- ✅ Case-insensitive y trim-aware
- ✅ No rompe datos existentes si se normalizaron primero

**Alternativa (si se quiere constraint en Prisma):**

#### Opción 4: Agregar @unique en Prisma Schema

**Cambio en `prisma/schema.prisma`:**
```prisma
model Categoria {
  id        Int            @id @default(autoincrement())
  nombre    String         @unique  // ← AGREGAR
  activo    Boolean        @default(true)
  // ...
}
```

**Migración:**
```bash
npx prisma migrate dev --name add_unique_categoria_nombre
```

**Riesgos:**
- ⚠️ **ALTO:** Si hay duplicados, la migración FALLARÁ
- ⚠️ Requiere normalizar y eliminar duplicados ANTES
- ⚠️ El constraint de Prisma es case-sensitive por defecto (PostgreSQL)

**Solución híbrida recomendada:**

1. **Paso 1:** Normalizar y limpiar duplicados (SQL manual)
2. **Paso 2:** Crear índice único funcional (SQL manual) - NO modificar Prisma
3. **Paso 3:** Mantener validación en código (ya existe) como segunda capa

**Ventajas:**
- ✅ No requiere migración de Prisma
- ✅ No rompe el código existente
- ✅ Constraint real en DB
- ✅ Case-insensitive

---

## RESUMEN DE CAMBIOS PROPUESTOS

| Archivo | Líneas | Cambio | Riesgo |
|---------|--------|--------|--------|
| `app/api/categorias/listar/route.js` | 3-7 | Agregar auth | Bajo |
| `app/api/categorias/listar/route.js` | 97-100 | Fix destinoId/posId | Bajo |
| `app/api/categorias/crear/route.js` | 3-7 | Agregar auth | Medio |
| `app/api/categorias/editar/route.js` | 3-7 | Agregar auth | Medio |
| `app/api/categorias/eliminar/route.js` | 3-7 | Agregar auth | Alto |
| `prisma/schema.prisma` | 106 | (Opcional) Agregar @unique | Alto |
| SQL Manual | - | Índice único funcional | Medio |

---

## ORDEN DE IMPLEMENTACIÓN RECOMENDADO

1. ✅ **Paso 1:** Agregar auth a todos los endpoints (bajo riesgo)
2. ✅ **Paso 2:** Fix bug destinoId/posId (bajo riesgo)
3. ✅ **Paso 3:** Verificar duplicados en BD (SQL)
4. ✅ **Paso 4:** Normalizar nombres existentes (SQL)
5. ✅ **Paso 5:** Crear índice único funcional (SQL)
6. ⚠️ **Paso 6 (Opcional):** Agregar @unique en Prisma (solo si se quiere)

---

## NOTAS ADICIONALES

- El patrón de auth es consistente en proveedores, pero no todos los módulos lo tienen
- El bug de destinoId/posId solo afecta cuando se usa desde otros módulos (transferencias, POS)
- La unicidad de nombre es crítica para evitar inconsistencias en la UI
- Considerar agregar permisos específicos en `lib/permisos.js` si se quiere granularidad


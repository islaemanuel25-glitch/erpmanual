# AUDITORÍA: ENDPOINTS ACTUALIZACIÓN DE PRECIOS

## A) PERMISOS

### Validación actual de usuario/sesión

**Ambos endpoints (`preview/route.js` y `apply/route.js`):**
- Usan `getUsuarioSession(req)` de `lib/auth.js` (línea 3, 12)
- Validan solo autenticación: `if (!session) return 401` (línea 72-75 en preview, 12-15 en apply)
- **NO validan permisos específicos**

### Verificación de permisos

**❌ FALTA:** No existe verificación de permisos tipo `productos.editar` o equivalente.

**Referencia en repo:**
- `app/api/stock_locales/importar/route.js` (líneas 19-27) muestra el patrón:
  ```javascript
  const { permisos } = session;
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("productos.importar")) {
    return NextResponse.json({ ok: false, error: "..." }, { status: 403 });
  }
  ```

**Dónde agregar el check:**
- **`app/api/productos/precios/preview/route.js`**: Después de línea 75 (después de `if (!session)`)
- **`app/api/productos/precios/apply/route.js`**: Después de línea 15 (después de `if (!session)`)

**Helper a usar:**
- `session.permisos` (array) ya viene de `getUsuarioSession(req)`
- Verificar: `permisos.includes("productos.editar")` o `permisos.includes("*")`
- Patrón: igual a `stock_locales/importar/route.js`

---

## B) SCOPE MULTI-LOCAL/GRUPO

### Preview (`app/api/productos/precios/preview/route.js`)

**✅ Correcto:**
- Línea 106-109: `findMany` con `where: { grupoId, proveedor_id }` ✅
- `grupoId` viene de `session.grupoId` (línea 77)

**⚠️ Menor (solo diagnóstico):**
- Línea 132-133: `count` sin `grupoId` (solo para mensaje de error/hint)
- No es bug crítico porque es solo para diagnóstico, pero idealmente debería filtrar por `grupoId` también

### Apply (`app/api/productos/precios/apply/route.js`)

**✅ Correcto:**
- Línea 77-82: `updateMany` con `where: { id: productoBaseId, grupoId, proveedor_id }` ✅
- `grupoId` viene de `session.grupoId` (línea 17)
- Validación adicional: si `updated.count === 0`, lanza error (línea 89-91)

**✅ Sin bugs de scope:** Todos los `where` críticos incluyen `grupoId`.

---

## C) SYNC PRODUCTOLOCAL

### Estado actual

**❌ NO actualiza ProductoLocal:**
- `app/api/productos/precios/apply/route.js` (línea 77-87) solo actualiza `ProductoBase`:
  ```javascript
  await tx.productoBase.updateMany({
    where: { id: productoBaseId, grupoId, proveedor_id },
    data: { precio_costo: costoNuevo, precio_venta: ventaNueva },
  });
  ```
- **NO hay código que toque `ProductoLocal`**

### Propuesta de cambio mínimo

**Estrategia:** Actualizar `ProductoLocal` solo cuando sus precios actuales sean iguales al precio anterior (no tiene override).

**Lógica:**
1. Después de `updateMany` en `ProductoBase` (línea 87)
2. Buscar `ProductoLocal` donde `baseId = productoBaseId`
3. Para cada `ProductoLocal` encontrado:
   - Si `precio_costo === null` o `precio_costo === costoAnterior` → actualizar a `costoNuevo`
   - Si `precio_venta === null` o `precio_venta === ventaAnterior` → actualizar a `ventaNueva`
   - Si tiene override diferente (precio_costo !== costoAnterior), NO tocar

**Tabla/Campos a tocar:**
- **Tabla:** `ProductoLocal` (modelo Prisma)
- **Campos:** `precio_costo`, `precio_venta` (ambos `Decimal?`)
- **Where:** `baseId = productoBaseId` (no necesita `localId` porque queremos todos los locales que tengan ese producto)
- **Operación:** `updateMany` condicional dentro de la misma transacción

**Código aproximado (pseudocódigo):**
```javascript
// Después de línea 87
const locales = await tx.productoLocal.findMany({
  where: { baseId: productoBaseId },
  select: { id: true, precio_costo: true, precio_venta: true },
});

for (const local of locales) {
  const data = {};
  const costoLocal = local.precio_costo ? Number(local.precio_costo) : null;
  const ventaLocal = local.precio_venta ? Number(local.precio_venta) : null;
  
  // Solo actualizar si no tiene override o si el override coincide con el anterior
  if (costoLocal === null || costoLocal === costoAnterior) {
    data.precio_costo = costoNuevo;
  }
  if (ventaLocal === null || ventaLocal === ventaAnterior) {
    data.precio_venta = ventaNueva;
  }
  
  if (Object.keys(data).length > 0) {
    await tx.productoLocal.update({
      where: { id: local.id },
      data,
    });
  }
}
```

**⚠️ Consideración:** Comparación de Decimal puede requerir tolerancia (ej: `Math.abs(costoLocal - costoAnterior) < 0.01`)

---

## D) ATOMICIDAD

### Estado actual

**✅ Correcto:**
- `app/api/productos/precios/apply/route.js` (línea 48-108):
  - Todo corre dentro de `prisma.$transaction(async (tx) => { ... })`
  - Incluye:
    - `tx.precioUpdate.create()` (línea 49)
    - Loop con `tx.productoBase.updateMany()` (línea 77)
    - `tx.precioUpdateItem.create()` (línea 93)
  - Si cualquier operación falla, toda la transacción hace rollback

**✅ Sin riesgo de registros huérfanos:** Todo está atómico.

**Nota:** El `throw new Error()` en línea 74 y 90 dentro de la transacción causará rollback completo, lo cual es correcto.

---

## E) SALIDA FINAL

### Cambio 1: Agregar validación de permisos en preview
**Archivo:** `app/api/productos/precios/preview/route.js`  
**Sección:** Después de línea 75 (después de `if (!session)`)  
**Acción:** Agregar check `if (!esAdmin && !permisos.includes("productos.editar")) return 403`

### Cambio 2: Agregar validación de permisos en apply
**Archivo:** `app/api/productos/precios/apply/route.js`  
**Sección:** Después de línea 15 (después de `if (!session)`)  
**Acción:** Agregar check `if (!esAdmin && !permisos.includes("productos.editar")) return 403`

### Cambio 3: Sincronizar ProductoLocal en apply
**Archivo:** `app/api/productos/precios/apply/route.js`  
**Sección:** Después de línea 87 (después de `updateMany` en `ProductoBase`)  
**Acción:** Buscar `ProductoLocal` por `baseId`, actualizar solo si `precio_costo === null || precio_costo === costoAnterior` (y mismo para `precio_venta`)

### Cambio 4: Agregar grupoId en count de diagnóstico (opcional)
**Archivo:** `app/api/productos/precios/preview/route.js`  
**Sección:** Línea 132-133 (queries de `count` para hint)  
**Acción:** Agregar `grupoId` en `where` de ambos `count` para consistencia

### Cambio 5: Validar límite de items en apply (opcional, recomendado)
**Archivo:** `app/api/productos/precios/apply/route.js`  
**Sección:** Después de línea 46 (después de validar `items.length === 0`)  
**Acción:** Agregar `if (items.length > 1000) return 400` para prevenir timeouts

---

## RESUMEN DE PRIORIDADES

**ALTA:**
- Cambio 1 (permisos preview)
- Cambio 2 (permisos apply)
- Cambio 3 (sync ProductoLocal)

**MEDIA:**
- Cambio 4 (grupoId en count)
- Cambio 5 (límite de items)




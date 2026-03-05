# Auditoría: Cálculo de costo en reporte de ventas

**Problema:** En `/modulos/reportes-ventas` el costo aparece muy alto (ej. venta $49.200, costo $414.000, ganancia -$364.800). El sistema está usando el costo del pack/cajón completo en lugar del costo unitario.

---

## 1. Endpoint que genera el reporte

| Qué | Dónde |
|-----|--------|
| Página | `app/modulos/reportes-ventas/page.jsx` |
| Llamada | `fetch(\`/api/reportes-ventas/general?${params}\`)` (línea 62) |
| Endpoint | **`app/api/reportes-ventas/general/route.js`** (GET) |

No hay otros endpoints usados por este módulo para el reporte principal.

---

## 2. Dónde se calculan costo, ganancia y top productos

### 2.1 En el endpoint del reporte (`app/api/reportes-ventas/general/route.js`)

El reporte **no calcula** costo ni ganancia. Solo **lee** de la base de datos:

- **Resumen (líneas 76-91):**  
  `totalCostos += Number(v.costoTotal)` y `gananciaNeta += Number(v.gananciaNeta)` por cada `Venta`.  
  Origen: campos `Venta.costoTotal` y `Venta.gananciaNeta` guardados al crear la venta.

- **Top productos (líneas 112-129):**  
  Por cada detalle `d`:  
  - `totalCosto += Number(d.precioCosto) * d.cantidad`  
  - `ganancia += Number(d.ganancia)`  
  Origen: `VentaDetalle.precioCosto` y `VentaDetalle.ganancia` guardados al crear la venta.

Conclusión: el error no está en el reporte, sino en **qué se guarda** al crear la venta en POS.

### 2.2 Origen real de los datos: creación de la venta POS

Los valores de costo y ganancia se **calculan y persisten** en:

**Archivo:** `app/api/pos-ventas/crear/route.js`  
**Momento:** al procesar `POST /api/pos-ventas/crear` (crear una venta desde POS).

Ahí se calculan `costoTotal`, `gananciaBruta`, `gananciaNeta` y por ítem `precioCosto` y `ganancia`, y se guardan en `Venta` y en `VentaDetalle`. El reporte solo los agrega.

---

## 3. Uso actual de costo en POS crear

### 3.1 Fuente del costo

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `app/api/pos-ventas/crear/route.js` | 230-239 | Obtiene productos con `prisma.productoBase.findMany({ select: { id: true, precio_costo: true, categoria_id: true } })`. Arma `costosMap[baseId] = Number(p.precio_costo) \|\| 0`. |
| Mismo | 244-250 | Por cada ítem: `precioCosto = costosMap[item.productoBaseId] \|\| 0`, luego `costoItem = precioCosto * item.cantidad`. |

- Se usa **solo** `ProductoBase.precio_costo`.  
- **No** se usa `ProductoLocal.precio_costo`.  
- **No** se consulta `factor_pack` ni `unidad_medida`.  
- **No** hay conversión pack ↔ unidad.

### 3.2 Convención en el resto del sistema (stock, etc.)

En `app/api/stock_locales/listar/route.js` (líneas 118-124) y `stock_locales/obtener/route.js` (47-57):

- Para productos con `factor_pack > 1` (pack/cajón), el costo guardado en base/local es **costo del bulto**.
- El costo **unitario** se calcula como:  
  `costo_unitario = precio_costo / factor_pack`.

En `stock_locales/importar` y `stock_locales/nuevo` los comentarios indican explícitamente que **precio_costo = precio del bulto**.

Por tanto: en POS crear se está usando **costo del bulto** como si fuera **costo por unidad**, y multiplicando por la cantidad vendida **en unidades**.

---

## 4. Confirmación: se está usando costo pack × cantidad

- En crear se hace:  
  `precioCosto = ProductoBase.precio_costo` (sin dividir por `factor_pack`).  
  Para productos en bulto, ese valor es **costo por pack**.
- Luego:  
  `costoItem = precioCosto * item.cantidad`.  
  En POS la `cantidad` es en **unidades** (salvo venta por kg u otra lógica explícita).
- Resultado:  
  **costo_total_ítem = costo_pack × cantidad_unidades** → sobreestimación por un factor igual a `factor_pack` (ej. 12 si el pack tiene 12 unidades).

Ejemplo: pack 12 uds, costo bulto $12.000, venta 4 uds.  
- Actual: costo ítem = 12.000 × 4 = 48.000 (incorrecto).  
- Correcto: costo ítem = (12.000 / 12) × 4 = 4.000.

---

## 5. Fórmula correcta vs actual

### 5.1 Por ítem (detalle de venta)

- **Unidades:** la cantidad vendida `item.cantidad` está en **unidades** (y el precio de venta es unitario).
- **Costo en DB:** para productos pack/cajón, `ProductoBase` (y/o `ProductoLocal`) guarda el **costo del bulto**.

Fórmula correcta:

- `costo_unitario = costo_base / unidades_por_pack`  
  (con `unidades_por_pack = factor_pack`, y si `factor_pack <= 0` o no aplica, tratar como 1).
- `costo_total_ítem = costo_unitario * cantidad_vendida`.

No debe usarse:

- `costo_total_ítem = costo_pack * cantidad_vendida`.

### 5.2 Ubicación exacta del error y fórmulas

**Archivo:** `app/api/pos-ventas/crear/route.js`

| Líneas | Fórmula / lógica actual | Fórmula corregida (conceptual) |
|--------|-------------------------|---------------------------------|
| 231-234 | `productosBase = findMany(..., select: { id, precio_costo, categoria_id })` — no se trae `factor_pack` ni `unidad_medida`. | Incluir en el `select`: `factor_pack`, `unidad_medida` (y si se quiere costo por local: leer también ProductoLocal o un join con precio_costo por local). |
| 237-239 | `costosMap[p.id] = Number(p.precio_costo) \|\| 0` — se usa el costo “crudo” (costo bulto cuando aplica). | No usar un único “precio de costo” por base sin considerar pack. Calcular costo unitario por producto (ver siguiente fila). |
| 245 | `precioCosto = costosMap[item.productoBaseId] \|\| 0` — es el costo base tal cual (pack si aplica). | `costo_unitario = (precio_costo_base o local) / Math.max(1, factor_pack)` cuando la venta es en unidades. El valor a guardar en detalle como “precio de costo” debe ser este costo unitario. |
| 247 | `costoItem = precioCosto * item.cantidad` — en la práctica: costo_pack × cantidad_unidades. | `costoItem = costo_unitario * item.cantidad`, con `costo_unitario` definido como arriba. |

Resumen en una línea:

- **Actual:**  
  `precioCosto = base.precio_costo`,  
  `costoItem = precioCosto * item.cantidad`  
  → equivale a **costo_pack × cantidad** cuando el producto es pack/cajón.
- **Corregido:**  
  `costo_unitario = base.precio_costo / Math.max(1, factor_pack)` (para venta en unidades),  
  `costoItem = costo_unitario * item.cantidad`,  
  y en el detalle guardar `precioCosto = costo_unitario` para que el reporte siga haciendo `d.precioCosto * d.cantidad` y obtenga el costo total correcto.

---

## 6. Reporte de ventas (solo lectura)

**Archivo:** `app/api/reportes-ventas/general/route.js`

| Líneas | Qué hace | ¿Ajuste? |
|--------|----------|----------|
| 49-72 | Lee `Venta` con `costoTotal`, `gananciaBruta`, `gananciaNeta` y detalles con `precioCosto`, `ganancia`. | No: solo refleja lo guardado. |
| 84-90 | Suma `v.costoTotal` y `v.gananciaNeta` para el resumen. | No. |
| 126 | `totalCosto += Number(d.precioCosto) * d.cantidad` para top productos. | No; si `precioCosto` se guarda como costo unitario en crear, esta fórmula ya es la correcta. |

El reporte no necesita cambio de fórmula; el cambio debe ser únicamente en **cómo se calcula y guarda** `precioCosto` y `costoTotal` en `app/api/pos-ventas/crear/route.js`.

---

## 7. Resumen

- **Causa raíz:** En `pos-ventas/crear` se usa `ProductoBase.precio_costo` (costo del bulto cuando hay pack) sin dividir por `factor_pack`, y se multiplica por la cantidad vendida en unidades → **costo_total_ítem = costo_pack × cantidad_unidades**.
- **Dónde corregir:** Solo en `app/api/pos-ventas/crear/route.js`: traer `factor_pack` (y si aplica `unidad_medida`), calcular costo unitario como `precio_costo / max(1, factor_pack)` para venta en unidades, y usar ese costo unitario para `precioCosto` y para `costoItem = costo_unitario * item.cantidad`.
- **Reporte:** No tocar fórmulas; con datos bien guardados en crear, el reporte ya mostrará costos y ganancias coherentes.

Este documento es solo auditoría; no se ha modificado código.

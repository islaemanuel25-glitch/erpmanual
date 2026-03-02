# Precio unitario: Stock (3800) vs POS (3791,67)

## 1. Lista de archivos y líneas relevantes

### Dónde se calcula / forma el precio mostrado en **Stock** (redondeado)

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| **app/api/stock_locales/listar/route.js** | **105-106** | Incluye `precio_venta: true`, `redondeo_100: true` del base. |
| **app/api/stock_locales/listar/route.js** | **128-136** | Calcula venta unitaria: `ventaUnit = precio_venta` (o `precio_venta / factor` si pack). Si `base.redondeo_100 === true` aplica **`ventaUnit = Math.ceil(ventaUnit / 100) * 100`**. |
| **app/api/stock_locales/listar/route.js** | **154-157** | Devuelve `precioVentaUnitario: ventaUnit` (ya redondeado) y `precioVenta` (bulto crudo). |
| **components/stock_locales/TablaStock.jsx** | **248-253** | Columna **Venta**: renderiza `(p.precioVentaUnitario \|\| p.precioVenta \|\| 0).toFixed(2)`. La fuente de datos es la respuesta del API listar (items con `precioVentaUnitario` ya redondeado). |

**Helper de redondeo en Stock:** La lógica está **en el API** (listar), no en un helper compartido: `Math.ceil(ventaUnit / 100) * 100`. El mismo criterio “redondo a 100 hacia arriba” existe en **components/productos/FormProducto.jsx** como `roundUp100` (líneas 50, 192-193) para el formulario de productos.

**Config de redondeo:** Es por **producto** (campo `ProductoBase.redondeo_100`), no por local. No hay config de redondeo por local.

---

### Dónde se calcula / forma el precio mostrado en **POS** (sin redondeo)

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| **app/api/pos-ventas/buscar-producto/route.js** | **44-46, 67-69** | Include `base: true` (trae todo el base; no hay select que excluya `redondeo_100`). |
| **app/api/pos-ventas/buscar-producto/route.js** | **106-131** | **mapProductos:** `precioDB = pl.precio_venta \|\| pl.base.precio_venta`. Si pack: `precioVentaUnitario = (precioDB / factorPack).toFixed(2)` y `precioVentaBulto = precioDB.toFixed(2)`. **No** aplica `redondeo_100`. `precioVenta` = bulto o unitario según modo. |
| **components/pos-ventas/BuscadorProductos.jsx** | **211-214** | Muestra el precio: `Number(p.precioVenta).toLocaleString("es-AR", { minimumFractionDigits: 2 })`. La fuente es la respuesta de **GET /api/pos-ventas/buscar-producto** (items con `precioVenta` / `precioVentaUnitario` sin redondeo a 100). |
| **app/modulos/pos-ventas/reducer/posVentaReducer.js** | **76-81** | Al agregar al carrito: `precio: producto.precioVenta`, `precioVentaUnitario: producto.precioVentaUnitario ?? producto.precioVenta`. Usa el valor que devolvió buscar-producto. |

POS **no** usa producto.precioVenta “directo de DB” sin más: divide bulto por factor cuando corresponde, pero **no** aplica el redondeo a 100 que usa Stock.

---

## 2. Por qué divergen

- **Stock** usa el API **stock_locales/listar**, que para locales no depósito calcula el precio unitario de venta y, si el producto tiene **redondeo_100**, aplica **Math.ceil(ventaUnit/100)*100**. La UI solo muestra ese valor ya calculado.
- **POS** usa el API **pos-ventas/buscar-producto**, que calcula precio unitario como `precio_venta / factorPack` y lo deja en 2 decimales con `toFixed(2)`, **sin leer ni aplicar** `base.redondeo_100`. Por eso se ve 3791,67 en POS y 3800 en Stock.

La divergencia es de **lógica de negocio**: un solo lugar (listar) aplica redondeo; el otro (buscar-producto) no.

---

## 3. Propuesta de cambio mínimo (POS = mismo cálculo que Stock)

**Objetivo:** Que el precio mostrado y cobrado en POS sea el mismo que en Stock (mismo criterio de redondeo por producto), con impacto mínimo.

**Opción A (recomendada):** Aplicar en **pos-ventas/buscar-producto** la misma regla que en **stock_locales/listar**.

- **Archivo a tocar:** `app/api/pos-ventas/buscar-producto/route.js`
- **Dónde:** En `mapProductos`, después de calcular `precioVentaUnitario` (y opcionalmente `precioVentaBulto`):
  - Leer `redondeo_100 = pl.base?.redondeo_100 === true`.
  - Si `redondeo_100` y el precio a mostrar es unitario (o siempre para el unitario): aplicar `precioVentaUnitario = Math.ceil(precioVentaUnitario / 100) * 100`.
  - Recalcular `precioVenta` según `modoSalidaDefault` con el unitario ya redondeado, y seguir devolviendo `precioVenta`, `precioVentaUnitario`, `precioVentaBulto` de forma coherente (p. ej. bulto = unitario * factor si aplica).

Con eso, POS y Stock usan la misma regla; la UI del POS (BuscadorProductos) y el reducer no requieren cambios porque ya consumen `precioVenta` / `precioVentaUnitario` del API.

**Opción B (alternativa):** Que POS consuma un endpoint que ya devuelva precios como Stock (p. ej. reutilizar lógica de listar o un helper compartido). Implica más cambios (nuevo endpoint o refactor de datos) y no es necesario si se aplica la misma lógica en buscar-producto.

**Archivos a modificar (opción A):**

1. **app/api/pos-ventas/buscar-producto/route.js**  
   - En `mapProductos`: después de calcular `precioVentaUnitario` (y si aplica `precioVentaBulto`), si `pl.base?.redondeo_100 === true`, aplicar redondeo a 100 al precio unitario; luego volver a definir `precioVenta` según modo y devolver los mismos campos.  
   - No hace falta tocar el `include` si con `base: true` ya se recibe `redondeo_100` (Prisma devuelve todos los campos del base). Si en algún momento se pasara a `select` explícito, añadir `redondeo_100: true` en base.

**No tocar (por este cambio):**

- components/stock_locales/TablaStock.jsx  
- components/pos-ventas/BuscadorProductos.jsx  
- app/modulos/pos-ventas/reducer/posVentaReducer.js  

Solo el API de POS debe devolver el mismo criterio de precio que el API de Stock.

# Mapeo: Agregar producto extra a la boleta al recibir (compras-proveedor)

**Objetivo:** Permitir agregar un producto que no estaba en el pedido original cuando el proveedor lo envía, en estado ENVIADO y antes de confirmar "Recibir". Sin implementar código todavía.

---

## 1) Endpoint usado hoy para buscar productos en compras-proveedor/nueva

**Path exacto:**  
**GET** `/api/compras-proveedor/productos`

**Uso en nueva:**  
- Archivo: `app/modulos/compras-proveedor/nueva/page.jsx`  
- Línea aprox.: 66–72 (dentro de `cargarProductos`).  
- Llamada: `fetch(\`/api/compras-proveedor/productos?${qs}\`)` con `qs = new URLSearchParams({ proveedorId }); if (search) qs.set("search", search)`.

**Query:**  
- `proveedorId` (obligatorio)  
- `search` (opcional) — búsqueda por nombre, SKU o código de barras  

**Respuesta:**  
- `{ ok: true, items: [...] }` donde cada ítem tiene `productoLocalId`, `baseId`, `nombre`, `sku`, `codigo_barra`, `unidad_medida`, `factor_pack`, `modoCompra`, `precio_costo`, `precio_venta`, `stockActual`, `stockMin`, `stockMax`, `faltante`, `sugerido`, etc.  
- Los productos son **ProductoLocal del depósito** del grupo cuyo base tiene a ese proveedor (proveedor_id / proveedor2_id / proveedor3_id).

**Conclusión:** Ese mismo endpoint se puede reutilizar en la pantalla de detalle cuando estado === ENVIADO: se llama con `proveedorId = pedido.proveedorId` y opcionalmente `search`, para listar productos del mismo proveedor y depósito y elegir el “extra”.

---

## 2) Estructura de PedidoProveedorDetalle en Prisma

**Modelo:** `PedidoProveedorDetalle` (prisma/schema.prisma, aprox. líneas 771–788)

| Campo            | Tipo              | Relevante para "extra" |
|------------------|-------------------|-------------------------|
| id               | Int               | PK, se usa en recibidos/costos por detalle. |
| pedidoId         | Int               | FK PedidoProveedor. |
| productoLocalId  | Int               | FK ProductoLocal (depósito). Obligatorio. |
| cantidad         | Decimal(12,2)     | “Cantidad pedida”; en un extra puede ser = cantidad recibida. |
| unidad           | ModoPedido        | BULTO \| UNIDAD. Default BULTO. |
| cantidadRecibida | Decimal(12,2)?    | Se llena al recibir. |
| kgRecibidos      | Decimal(12,3)?    | Para fiambre (UNIDAD). |
| precioCosto      | Decimal(12,2)?    | Costo unitario. |
| createdAt        | DateTime          | |
| updatedAt        | DateTime          | |

**Relaciones:**  
- `pedido` → PedidoProveedor  
- `producto` → ProductoLocal  

Para un ítem **extra** (agregado en recepción):  
- `cantidad` y `cantidadRecibida` pueden ser iguales (lo que se recibe).  
- `precioCosto` se puede setear al agregar o dejar null y editarlo en la tabla de costos como el resto.  
- `unidad` según producto (BULTO/UNIDAD).  
- No hace falta ningún campo nuevo en el modelo; un detalle “extra” es un `PedidoProveedorDetalle` más con el mismo `pedidoId`.

---

## 3) Archivo que renderiza la tabla de detalle en [id]/page.jsx

**Archivo único:**  
`app/modulos/compras-proveedor/[id]/page.jsx`

**Dónde está la tabla:**  
- Aprox. líneas 362–520.  
- Dentro del **SunmiPanel** con título “Detalle (N items)” (líneas 363–369).  
- La tabla es un **SunmiTable** con headers según estado (Producto, SKU, Cant. pedida, Unidad, Costo, y en recepción: Cant. recibida, Kg recibidos si hay fiambre; en RECIBIDO: Recibido, Kg reales).  
- El cuerpo se renderiza con `(pedido.detalles || []).map((det) => ...)` (SunmiTableRow por cada `det`).  
- No hay componente separado: todo el listado de detalle está inline en esa page.

**Estado usado en la tabla:**  
- `pedido.detalles` (viene de GET obtener).  
- `recibidos[det.id]`, `kgRecibidos[det.id]` (por detalle).  
- `costos[det.id]` (por detalle).  
- `esRecepcion` = (pedido.estado === "ENVIADO").  
- `tieneFiambre` = algún detalle tiene modoCompraProveedor === "UNIDAD".

Cualquier detalle nuevo que devuelva `obtener` (tras agregar el ítem) se pinta en esa misma tabla y `cargar()` ya inicializa `recibidos` y `costos` para todos los `data.item.detalles`, por lo que un detalle extra quedará cubierto.

---

## 4) Función que recarga el pedido después de una acción

**Nombre:** `cargar`

**Dónde:**  
`app/modulos/compras-proveedor/[id]/page.jsx`

**Definición:**  
- Aprox. líneas 60–105.  
- `const cargar = async () => { setLoading(true); try { const res = await fetch(\`/api/compras-proveedor/obtener?id=${id}\`); ... setPedido(data.item); ... setRecibidos(rec); setKgRecibidos(kgRec); setCostos(costosInit); setTotalReal(...); setNroFactura(...); setFechaFactura(...); } finally { setLoading(false); } }`.

**Uso después de una acción:**  
- En `ejecutarAccion` (aprox. líneas 111–147): tras `fetch(url, ...)` y `data = await res.json()`, si `data.ok` se llama **`cargar()`** (línea 141) para refrescar pedido, detalles, recibidos, kgRecibidos, costos y datos de factura.

**Conclusión:** Tras agregar un ítem extra con un endpoint nuevo, basta llamar **`cargar()`** para que la tabla muestre el nuevo detalle y los estados de recepción/costos lo incluyan.

---

## 5) Lista de archivos a tocar

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | **app/api/compras-proveedor/pedido/[id]/agregar-item/route.js** (nuevo) | POST: validar pedido ENVIADO y grupo; validar productoLocalId (mismo depósito; opcional mismo proveedor); crear PedidoProveedorDetalle; devolver detalle creado o pedido actualizado. |
| 2 | **app/modulos/compras-proveedor/[id]/page.jsx** | Solo cuando estado === ENVIADO: bloque “Agregar producto a la boleta” (buscador reutilizando GET productos, selector de producto, cantidad/costo), botón agregar → POST agregar-item → cargar(). Sin tocar la tabla actual (sigue siendo `pedido.detalles.map`). |
| 3 | **app/api/compras-proveedor/obtener/route.js** | Sin cambio estructural; ya devuelve pedido con detalles. Si en el futuro se filtra algo por “solo originales”, no hacerlo: los extras son detalles normales. |

No tocar:  
- `prisma/schema.prisma` (PedidoProveedorDetalle ya sirve).  
- `app/api/compras-proveedor/recibir/[id]/route.js` (sigue iterando `pedido.detalles`; los extras ya serán parte del pedido al recibir).  
- `app/api/compras-proveedor/productos/route.js` (reutilizado tal cual).

---

## 6) Propuesta de endpoint nuevo o reutilizado

**Reutilizado:**  
- **GET** `/api/compras-proveedor/productos?proveedorId=...&search=...`  
- Uso: en la pantalla detalle, cuando estado === ENVIADO, para buscar y elegir el producto a agregar como extra. Se usa con `proveedorId = pedido.proveedorId`.

**Nuevo:**  
- **POST** `/api/compras-proveedor/pedido/[id]/agregar-item`  
- **Path:** `app/api/compras-proveedor/pedido/[id]/agregar-item/route.js`  
- **Body sugerido:**  
  - `productoLocalId` (number, obligatorio)  
  - `cantidad` (number, obligatorio, > 0) — para un extra suele ser “cantidad recibida” (misma cifra).  
  - `cantidadRecibida` (number, opcional) — si no se envía, usar `cantidad`.  
  - `precioCosto` (number, opcional)  
  - `unidad` (string, opcional) — "BULTO" | "UNIDAD"; si no se envía, derivar del producto (modoCompraProveedor o default BULTO).  
- **Validaciones:**  
  - Pedido existe y pertenece al grupo del usuario (mismo flujo que recibir/obtener).  
  - Pedido.estado === "ENVIADO".  
  - productoLocalId existe, pertenece al mismo depósito que el pedido (pedido.depositoId) y es del grupo. Opcional: que el ProductoBase tenga a pedido.proveedorId en proveedor_id / proveedor2_id / proveedor3_id.  
- **Acción:** Crear un registro en `PedidoProveedorDetalle` con pedidoId, productoLocalId, cantidad, cantidadRecibida: cantidadRecibida ?? cantidad, unidad, precioCosto.  
- **Response:** Por ejemplo `{ ok: true, detalle: { id, ... } }` o `{ ok: true, pedido: ... }`. El front solo necesita llamar a `cargar()` después para refrescar.

Alternativa de path si se prefiere no anidar bajo `pedido`:  
- **POST** `/api/compras-proveedor/[id]/agregar-item`  
- Misma lógica; el `[id]` es el id del pedido.

---

## 7) Flujo UI → API → DB

**Flujo “Agregar producto extra” (estado ENVIADO):**

1. **UI** (`app/modulos/compras-proveedor/[id]/page.jsx`):  
   - Usuario ve el detalle del pedido en estado ENVIADO.  
   - Se muestra un bloque “Agregar producto a la boleta” (solo si `pedido.estado === "ENVIADO"`).  
   - Usuario escribe en un buscador (opcional) y/o elige de una lista.  
   - **UI** llama **GET** `/api/compras-proveedor/productos?proveedorId=${pedido.proveedorId}&search=...` (mismo endpoint que nueva) y muestra resultados (nombre, SKU, costo sugerido, etc.).  
   - Usuario selecciona un producto y completa cantidad (y opcional costo).  
   - Usuario pulsa “Agregar” (o similar).  
   - **UI** llama **POST** `/api/compras-proveedor/pedido/[id]/agregar-item` (o `/[id]/agregar-item`) con body: `{ productoLocalId, cantidad, cantidadRecibida?, precioCosto?, unidad? }`.  
   - Si la respuesta es ok, **UI** llama **`cargar()`**, que hace **GET** `/api/compras-proveedor/obtener?id=...` y actualiza `pedido`, `recibidos`, `costos`, etc.  
   - La tabla de detalle se re-renderiza con `pedido.detalles` (ahora incluye el nuevo ítem); los inputs de cant. recibida y costo se rellenan para el nuevo detalle gracias a la inicialización en `cargar()`.

2. **API agregar-item:**  
   - Resuelve contexto (resolveLocalAndGrupo).  
   - Obtiene pedido por id; verifica grupoId y estado === ENVIADO.  
   - Valida productoLocalId (existe, localId === pedido.depositoId, base del grupo).  
   - Crea `PedidoProveedorDetalle` con pedidoId, productoLocalId, cantidad, cantidadRecibida ?? cantidad, unidad, precioCosto.  
   - Devuelve ok + detalle o pedido.

3. **DB:**  
   - Un nuevo registro en **PedidoProveedorDetalle** (pedidoId, productoLocalId, cantidad, cantidadRecibida, unidad, precioCosto).  
   - No se toca PedidoProveedor ni otros detalles.

**Flujo “Recibir pedido” (sin cambio):**

- Al pulsar “Recibir pedido”, la UI sigue enviando **POST** `/api/compras-proveedor/recibir/[id]` con `recibidos`, `kgRecibidos`, `costos`, totalReal, etc.  
- El endpoint **recibir** ya recorre `pedido.detalles` (incluidos los recién agregados), actualiza stock, cantidadRecibida, kgRecibidos y marca pedido RECIBIDO.  
- Los detalles “extra” se tratan igual que el resto: se les aplica la misma lógica de incremento de StockLocal y actualización de detalle.

---

## Resumen

- **Buscar productos (nueva y “extra”):** GET `/api/compras-proveedor/productos` (mismo endpoint, mismo path).  
- **PedidoProveedorDetalle:** ya tiene todos los campos necesarios (productoLocalId, cantidad, cantidadRecibida, kgRecibidos, precioCosto, unidad).  
- **Tabla de detalle:** renderizada inline en `app/modulos/compras-proveedor/[id]/page.jsx` (SunmiPanel + SunmiTable + `pedido.detalles.map`).  
- **Recarga tras acción:** función **`cargar()`** en esa misma page; se llama después de agregar el ítem para refrescar pedido y detalles.  
- **Archivos a tocar:** 1 ruta API nueva (POST agregar-item), 1 page (bloque “Agregar producto a la boleta” + llamada a productos + agregar-item + cargar()).  
- **Flujo:** UI (buscar con GET productos → elegir producto → POST agregar-item) → API (crear PedidoProveedorDetalle) → DB (insert detalle); luego UI llama cargar() y la tabla muestra el nuevo ítem; al recibir, recibir sigue procesando todos los detalles igual.

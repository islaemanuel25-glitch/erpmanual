# Alcance: productoLocalId en contexto depósito

Listado de todos los archivos y líneas donde se usa **productoLocalId** en flujos que involucran depósito (POS transferencias, transferencias, stock con local depósito, compras a proveedor). Solo listado, sin cambios.

---

## 1. API — Endpoints que reciben o devuelven productoLocalId

### 1.1 Stock (válido para cualquier local, incluido depósito)

| Archivo | Líneas | Uso | Contexto depósito |
|---------|--------|-----|-------------------|
| `app/api/stock_locales/ajustar/route.js` | 34, 123, 138, 145, 173, 183, 214, 227 | Recibe `body.productoLocalId`; valida ProductoLocal; actualiza StockLocal y opcionalmente MovimientoStock. Usa `localId` del body (puede ser depósito). | Sí: el local puede ser depósito (`esDeposito` en 107, 117). |
| `app/api/stock_locales/limites/route.js` | 34, 65, 67, 93, 109, 117, 130, 163, 177 | Recibe `body.productoLocalId`; actualiza stockMin/stockMax en StockLocal. | Sí: mismo patrón que ajustar; el local puede ser depósito. |

### 1.2 POS Transferencias (origen = depósito o destino = local)

| Archivo | Líneas | Uso | Contexto depósito |
|---------|--------|-----|-------------------|
| `app/api/pos-transferencias/agregarItem/route.js` | 21, 26, 30, 63, 85, 114, 143, 158 | Recibe `body.productoLocalId`; valida producto en origen (depósito); crea/actualiza detalle; devuelve `productoLocalId`. | Sí: origen es depósito; productoLocalId = ProductoLocal del depósito. |
| `app/api/pos-transferencias/detalle/agregar/route.js` | 16, 29, 163 | Recibe `body.productoLocalId` (destino); lógica depósito/admin para modificar en estado Solicitado. | Sí: depósito puede agregar; productoLocalDestinoId o productoLocal (local destino). |
| `app/api/pos-transferencias/detalle/editar/route.js` | 164 | Devuelve `productoLocalId: updated.productoId` en respuesta. | Sí: detalle de POS transferencia (origen depósito). |
| `app/api/pos-transferencias/detalle/route.js` | 72, 129, 141 | 72: comentario "STOCK ORIGEN (depósito)"; 129: devuelve `productoLocalId: detalle.productoId`. | Sí: listado detalle de una POS (origen depósito). |
| `app/api/pos-transferencias/detalle/quitar/route.js` | 113 | Devuelve `productoLocalId: detalle.productoId`. | Sí: mismo flujo POS transferencias. |
| `app/api/pos-transferencias/eliminarItem/route.js` | 68 | Devuelve `productoLocalId: detalle.productoId`. | Sí: mismo flujo. |
| `app/api/pos-transferencias/buscarProductos/route.js` | 72 | Devuelve `productoLocalId: productoLocal.id` en cada ítem (productos del origen/depósito). | Sí: búsqueda para agregar ítems a la transferencia (origen depósito). |

### 1.3 Compras a proveedor (ítems son ProductoLocal del depósito)

| Archivo | Líneas | Uso | Contexto depósito |
|---------|--------|-----|-------------------|
| `app/api/compras-proveedor/agregar-item/[id]/route.js` | 34, 52, 54, 56, 63, 80, 127 | Recibe `body.productoLocalId`; valida que ProductoLocal pertenezca al depósito del pedido; crea detalle con `productoLocalId`. | Sí: explícito "ProductoLocal del depósito del pedido" (61, 71). |
| `app/api/compras-proveedor/crear/route.js` | 60, 86 | 60: mensaje de error con `productoLocalId`; 86: crea detalles con `productoLocalId: Number(it.productoLocalId)`. | Sí: pedido es a depósito; ítems son ProductoLocal del depósito. |
| `app/api/compras-proveedor/recibir/[id]/route.js` | 198, 203, 211 | 198: comentario "productoLocalId ya apunta directo al ProductoLocal del depósito"; 203, 211: usa `det.productoLocalId` para actualizar StockLocal del depósito. | Sí: recepción de compra incrementa stock en depósito. |
| `app/api/compras-proveedor/productos/route.js` | 153 | Devuelve `productoLocalId: pl.id` en lista de productos (ProductoLocal del depósito). | Sí: productos del depósito para armar pedido a proveedor. |

### 1.4 Pedidos (local pide al depósito; productoLocalId = ProductoLocal del LOCAL)

| Archivo | Líneas | Uso | Contexto depósito |
|---------|--------|-----|-------------------|
| `app/api/pedidos/set-cantidad/route.js` | 98, 158, 187, 210 | 98: `productoLocalId = productoLocal.id` (ProductoLocal del **local**, no del depósito); 158, 187: usa en StockLocal; 210: devuelve en ítem. | Sí: flujo depósito→local; set-cantidad trabaja con ProductoLocal del local para el detalle de la POS. |
| `app/api/pedidos/carrito/route.js` | 131 | Devuelve `productoLocalId: d.productoId` en ítems del carrito. | Sí: carrito del pedido (local pide al depósito). |

### 1.5 POS Ventas (puede ser local o depósito)

| Archivo | Líneas | Uso | Contexto depósito |
|---------|--------|-----|-------------------|
| `app/api/pos-ventas/crear/route.js` | 327, 347 | 327: log "venta con stock negativo" con productoLocalId; 347: `stockValidations.push({ productoLocalId: productoLocal.id })`. | Opcional: si el POS se usa en un local tipo depósito. |
| `app/api/pos-ventas/buscar-producto/route.js` | 163 | Devuelve `productoLocalId: pl.id` en cada producto (ProductoLocal del local actual, puede ser depósito). | Opcional: mismo. |

### 1.6 Productos (eliminación; aplica a todos los locales, incluido depósito)

| Archivo | Líneas | Uso | Contexto depósito |
|---------|--------|-----|-------------------|
| `app/api/productos/eliminar/[id]/route.js` | 54, 56, 59, 72, 88 | Obtiene `productoLocalIds` de todos los ProductoLocal del base; borra StockLocal, etc. por `productoId: { in: productoLocalIds }`. | Sí: incluye ProductoLocal del depósito al eliminar un producto base. |

---

## 2. Componentes frontend que envían o usan productoLocalId

### 2.1 Stock locales (local puede ser depósito)

| Archivo | Líneas | Uso |
|---------|--------|-----|
| `components/stock_locales/ModalAjuste.jsx` | 52 | Envía `productoLocalId: producto.id` en body a `POST /api/stock_locales/ajustar`. |
| `components/stock_locales/ModalLimites.jsx` | 43 | Envía `productoLocalId: producto.id` en body a `POST /api/stock_locales/ajustar` (modo límites). |

### 2.2 POS Transferencias (origen depósito / destino local)

| Archivo | Líneas | Uso |
|---------|--------|-----|
| `components/pos-transferencias/nueva/BuscadorManual.jsx` | 232 | Usa `p.productoLocalId` como `key` al renderizar lista de productos (resultado de búsqueda). |
| `components/pos-transferencias/nueva/TablaSugeridos.jsx` | 194, 268, 271, 277, 284, 314, 319, 331 | Usa `p.productoLocalDestinoId` y fallback `p.productoLocalOrigenId ?? p.productoLocalDestinoId ?? p.productoLocalId` para identificar producto en sugeridos; `onEditSugerido(productoLocalDestinoId, ...)`. |

(En la misma pantalla de POS transferencias, los requests a `agregarItem` y `detalle/agregar` suelen enviar `productoLocalId` desde el estado o desde la lista de productos; los endpoints están listados arriba.)

---

## 3. Hooks

- **hooks/:** no hay ocurrencias de `productoLocalId` en este directorio.

---

## 4. Módulo Transferencias (clásicas)

- **app/api/transferencias/** usa `productoId` (FK a ProductoLocal) en `confirmar-recepcion/route.js` (productoOrigen.id, productoDestino.id) pero **no** el nombre de campo `productoLocalId` en request/response. Incluir en alcance si se unifica nomenclatura: `app/api/transferencias/confirmar-recepcion/route.js` líneas 121, 134, 136, 142, 176, 190, 192, 198.

---

## 5. Resumen por módulo

| Módulo | Archivos API | Archivos components |
|--------|--------------|--------------------|
| Stock locales | ajustar, limites | ModalAjuste, ModalLimites |
| POS Transferencias | agregarItem, detalle/agregar, detalle/editar, detalle/route, detalle/quitar, eliminarItem, buscarProductos | TablaSugeridos, BuscadorManual |
| Compras a proveedor | agregar-item/[id], crear, recibir/[id], productos | (llamadas desde páginas de compras) |
| Pedidos | set-cantidad, carrito | (desde módulo pedidos) |
| POS Ventas | crear, buscar-producto | (no envían productoLocalId en body; API lo usa internamente) |
| Productos | eliminar/[id] | — |

Total aproximado: **12 archivos de API** con uso explícito de `productoLocalId` en contexto que puede ser depósito, y **4 componentes** que envían o usan `productoLocalId` en flujos de stock o POS transferencias.

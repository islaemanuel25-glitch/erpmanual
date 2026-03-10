# Auditoría — Modo pedido / Compra a proveedor / Fiambres

**Objetivo:** Entender cómo funcionan hoy `modoPedido`, `modoCompraProveedor` y el caso FIAMBRES para mejorar su uso en Edición Rápida y en el flujo de productos.

---

## 1. DEFINICIÓN EN BASE DE DATOS

### 1.1 `modoPedido`

| Aspecto | Valor |
|--------|--------|
| **Nombre en DB** | `modo_pedido` |
| **Nombre en UI / mapper** | `modoPedido` (camelCase) |
| **Tipo de dato** | Enum Prisma `ModoPedido` |
| **Valores posibles** | `BULTO`, `UNIDAD` |
| **Valor por defecto** | `BULTO` |
| **Modelo** | `ProductoBase` (prisma/schema.prisma línea 183) |

```prisma
modo_pedido       ModoPedido   @default(BULTO)
```

```prisma
enum ModoPedido {
  BULTO
  UNIDAD
}
```

- **Uso:** Define si al **pedir al depósito** o en **transferencias** se pide por bulto o por unidad (según `factor_pack` y `unidad_medida`). No es lo mismo que “cómo se compra al proveedor” (eso es `modoCompraProveedor`).

---

### 1.2 `modoCompraProveedor`

| Aspecto | Valor |
|--------|--------|
| **Nombre en DB** | `modoCompraProveedor` (camelCase en schema) |
| **Nombre en UI / mapper** | `modoCompraProveedor` |
| **Tipo de dato** | Enum Prisma `ModoPedido` (mismo enum: BULTO / UNIDAD) |
| **Valores posibles** | `BULTO`, `UNIDAD` |
| **Valor por defecto** | `BULTO` |
| **Modelo** | `ProductoBase` (prisma/schema.prisma línea 189-190) |

```prisma
// Compras a proveedor — modo fiambre
modoCompraProveedor             ModoPedido @default(BULTO)
```

- **Uso:** Define cómo se **compra al proveedor** y cómo se **recibe**:
  - **BULTO:** producto en bultos/packs; stock en unidades (cantidad × factor_pack); recepción en unidades.
  - **UNIDAD (fiambre):** producto por kg/pieza; stock en **kg**; pedido en “unidades” (piezas); en recepción se cargan **kg recibidos** y opcionalmente se actualiza `pesoPromedioKg`.

---

## 2. FLUJO DE GUARDADO

### 2.1 GET /api/productos/listar

- **Cómo llegan al frontend:**  
  La consulta hace `prisma.productoBase.findMany` con `include` (categoría, proveedor, area_fisica, locales). No usa `select` en el base, así que **todas** las columnas de `ProductoBase` vienen en `p`. Luego se mapea con `mergeBaseLocalToUi(p, override)`.
- **En el mapper (mergeBaseLocalToUi):**
  - `modoPedido: base.modo_pedido ?? "BULTO"`
  - `modoCompraProveedor: base.modoCompraProveedor ?? "BULTO"`
- **Conclusión:** El front recibe cada ítem con `modoPedido` y `modoCompraProveedor` en camelCase. No hay override por local (solo en base).

### 2.2 PUT /api/productos/editar/[id]

- **Cómo se guardan:**  
  El body se procesa con `splitUiToDb(payload)`.
- **En el mapper (splitUiToDb):**
  - `modo_pedido: payload.modo_pedido ?? "BULTO"` (snake_case en baseData)
  - `modoCompraProveedor: payload.modoCompraProveedor ?? "BULTO"` (camelCase en baseData)
- **En la ruta editar:**  
  - `modo_pedido` se revalida con `validarModoPedido(modoPedido, unidad_medida, factor_pack)`:
    - Si `unidad_medida === "unidad"` o `factor_pack` null/≤1 → se fuerza `UNIDAD`.
    - Si no, se acepta `BULTO` o `UNIDAD`.
  - `modoCompraProveedor` se escribe solo si `baseData.modoCompraProveedor !== undefined` (y hay fallback si el schema no tiene el campo).
- **Conversión:** UI envía camelCase (`modoPedido`, `modoCompraProveedor`). El mapper acepta ambos nombres en FormProducto; en Edición Rápida se usa `uiToPayload` que envía `modo_pedido` y `modoCompraProveedor` correctos para `splitUiToDb`.

---

## 3. USO REAL EN EL SISTEMA

### 3.1 `modo_pedido` (modoPedido)

| Archivo | Uso |
|--------|-----|
| **app/api/productos/crear/route.js** | Validación al crear: `validarModoPedido(body.modo_pedido, ...)`. |
| **app/api/productos/editar/[id]/route.js** | Validación al editar: `validarModoPedido(baseData.modo_pedido, ...)`. |
| **app/api/productos/import/preview/route.js** | Cálculo en import: `modoPedido = esPack && fp ? "BULTO" : "UNIDAD"` (no se lee de Excel). |
| **app/api/productos/import/apply/route.js** | Crear: `modo_pedido: p.modo_pedido || (esPack && fp ? "BULTO" : "UNIDAD")`. Actualizar: si `p.modo_pedido` existe, se actualiza. |
| **app/api/pedidos/catalogo/route.js** | Catálogo de productos para pedidos: `modoPedido: base?.modo_pedido \|\| "BULTO"`. |
| **app/api/pos-transferencias/sugeridos/route.js** | Sugeridos de transferencia: `modoPedido = base.modo_pedido \|\| "BULTO"`. Si BULTO y factorPack>1 → cantidad en bultos; si no → en unidades. |
| **components/productos/FormProducto.jsx** | Campo "Modo de pedido" (BULTO/UNIDAD); sincronizado con `unidad_medida` y `factor_pack`: si unidad o factor vacío → UNIDAD; si no → BULTO. |
| **components/productos/edicion-rapida/EdicionRapidaPage.jsx** | Columna "Modo pedido"; opciones Bulto/Unidad; se envía en `uiToPayload` como `modo_pedido`. |

### 3.2 `modoCompraProveedor`

| Archivo | Uso |
|--------|-----|
| **app/api/productos/crear/route.js** | Crear: `modoCompraProveedor: body.modoCompraProveedor \|\| "BULTO"` (con fallback si el campo no existe en DB). |
| **app/api/productos/editar/[id]/route.js** | Solo actualiza si `baseData.modoCompraProveedor !== undefined`. |
| **app/api/compras-proveedor/obtener/route.js** | Incluye `modoCompraProveedor` en el select del base. |
| **app/api/compras-proveedor/productos/route.js** | Listado de productos para armado de pedido: `modoCompra = pl.base.modoCompraProveedor \|\| "BULTO"`. Si UNIDAD → fiambre: stock en kg, sugerido en piezas con pesoRef. |
| **app/api/compras-proveedor/agregar-item/[id]/route.js** | Al agregar ítem al pedido: `unidadFinal = unidad \|\| pl.base?.modoCompraProveedor \|\| "BULTO"`. |
| **app/api/compras-proveedor/recibir/[id]/route.js** | Recepción: si `modoCompra === "UNIDAD"` → fiambre: incremento de stock por **kg recibidos** (o estimado con pesoReferenciaKg); si BULTO → incremento en unidades (cantidad × factor_pack). Actualiza `pesoPromedioKg` si aplica. |
| **app/modulos/compras-proveedor/[id]/page.jsx** | Inicializa kg para fiambres; filtra detalles UNIDAD; muestra badge "FIAMBRE" y campos kg recibidos. |
| **app/modulos/compras-proveedor/nueva/page.jsx** | Muestra "FIAMBRE" en UI cuando el producto es compra por unidad. |
| **components/productos/FormProducto.jsx** | Sección "Compras a proveedor (fiambre)": campo Modo compra proveedor (BULTO / Unidad fiambre/kg); si UNIDAD muestra pesoReferenciaKg, pesoEsFijo, actualizaPromedioPorRecepcion. |
| **components/productos/edicion-rapida/EdicionRapidaPage.jsx** | Columna "Compra prov." con opciones Bulto / Unidad (fiambre); se envía en `uiToPayload` como `modoCompraProveedor`. |

---

## 4. CASO ESPECIAL: FIAMBRES

### 4.1 Cómo se identifican

- **Fiambre = producto con `modoCompraProveedor === "UNIDAD"`.**
- No hay un campo “es_fiambre” ni categoría especial; la única señal es `modoCompraProveedor`.

### 4.2 Diferencias respecto a otros productos

| Aspecto | BULTO (normal) | UNIDAD (fiambre) |
|--------|-----------------|-------------------|
| Stock en depósito | En **unidades** (piezas equivalentes; bultos × factor_pack). | En **kg**. |
| Pedido a proveedor | Cantidad en bultos/unidades según modo_pedido. | Cantidad en “unidades” (piezas). |
| Recepción | Se reciben bultos; stock += cantidad × factor_pack. | Se cargan **kg recibidos**; stock += kg. Opcional: actualiza pesoPromedioKg. |
| Cálculo de sugerido (compras) | Faltante en unidades → sugerido en bultos (÷ factor_pack). | Faltante en kg → sugerido en piezas (÷ pesoReferenciaKg o pesoPromedioKg). |

### 4.3 Campos adicionales para fiambre (ProductoBase)

- **pesoReferenciaKg:** Peso por pieza de referencia (ej. 4.5 kg mortadela).
- **pesoEsFijo:** Si el peso no varía por pieza.
- **pesoPromedioKg:** Se puede actualizar en recepción (`actualizaPromedioPorRecepcion`).
- **actualizaPromedioPorRecepcion:** Si al recibir se actualiza `pesoPromedioKg` con el promedio real.

### 4.4 Cómo se edita hoy un producto fiambre

- En **FormProducto** (edición full): sección “Compras a proveedor (fiambre)”: se elige Modo compra proveedor = “Unidad (fiambre/kg)” y se completan peso referencia, peso fijo y actualizar promedio.
- En **Edición Rápida** solo está el campo **Modo compra proveedor** (Bulto / Unidad fiambre). **No** se editan pesoReferenciaKg, pesoEsFijo, etc.; al guardar desde el grid, `uiToPayload` no envía esos campos, pero el backend solo actualiza fiambre cuando `baseData.* !== undefined`, así que **no se borran** al guardar solo modoCompraProveedor desde Edición Rápida.

### 4.5 Lógica especial en backend

- **compras-proveedor/recibir:** Si `modoCompraProveedor === "UNIDAD"`: valida `kgRecibidosMap`; incremento = kg reales (o estimado con pesoReferenciaKg); opcionalmente actualiza `pesoPromedioKg`.
- **compras-proveedor/productos:** Para UNIDAD, sugerido = ceil(faltante_kg / pesoRefKg); no convierte stock a bultos.

---

## 5. EXPORT / IMPORT

### 5.1 Export (POST /api/productos/export)

- **modo_pedido:** **No** aparece en el Excel. Las columnas exportadas son: id, codigo_barra, nombre, categoria, proveedor, area_fisica, unidad_medida, factor_pack, precio_costo, precio_venta, margen, stock_actual, stock_min, stock_max, activo, local_nombre.
- **modoCompraProveedor:** **No** aparece en el Excel.

### 5.2 Import (preview y apply)

- **modo_pedido:** **No** se lee de columnas. En preview se **calcula**: `modoPedido = (unidad_medida pack/cajon y factor_pack > 1) ? "BULTO" : "UNIDAD"`. Ese valor se usa en apply al crear; en actualizar se usa `p.modo_pedido` si viene en el ítem del preview (siempre viene calculado).
- **modoCompraProveedor:** **No** se lee ni se calcula en import. En apply **no** se setea al crear (el create usa baseData sin modoCompraProveedor, por lo que queda default BULTO). En actualizar **no** se actualiza.
- **Conversión:** No hay columna en Excel para ninguno de los dos; solo conversión interna de modo_pedido a partir de unidad_medida y factor_pack.

---

## 6. EDICIÓN RÁPIDA

### 6.1 Presencia en el grid

- **modoPedido:** Sí. Columna "Modo pedido" (key `modoPedido`), opciones Bulto / Unidad (MODO_PEDIDO_OPCIONES).
- **modoCompraProveedor:** Sí. Columna "Compra prov." (key `modoCompraProveedor`), opciones Bulto / Unidad (fiambre) (MODO_COMPRA_OPCIONES).

### 6.2 Cómo se guardan

- **uiToPayload** (EdicionRapidaPage.jsx) arma:
  - `modo_pedido: row.modoPedido ?? "BULTO"`
  - `modoCompraProveedor: row.modoCompraProveedor ?? "BULTO"`
- Ese payload se envía al PUT `/api/productos/editar/[id]` (con localId). El backend usa `splitUiToDb` y luego `validarModoPedido` para modo_pedido; modoCompraProveedor se persiste si está definido.
- **Conclusión:** Guardan correctamente y con los mismos valores/validaciones que el resto del sistema (mismo mapper y misma ruta).

### 6.3 Lo que no incluye Edición Rápida

- **modo_envio / modo_stock:** No están en el grid ni en `uiToPayload`. El mapper/editar los rellenan por defecto si no se envían (modo_envio según unidad_medida, modo_stock "BULTO"), por lo que no se sobrescriben de forma inesperada.
- **Campos fiambre (pesoReferenciaKg, pesoEsFijo, pesoPromedioKg, actualizaPromedioPorRecepcion):** No están en el grid ni en `uiToPayload`. El editar solo actualiza estos campos si vienen en `baseData`; al no enviarlos, no se modifican. Por tanto, marcar un producto como "Unidad (fiambre)" en Edición Rápida **no** borra esos campos, pero tampoco permite editarlos desde el grid; para completar peso referencia etc. hay que usar el formulario completo de producto.

---

## 7. RESUMEN Y RECOMENDACIONES

### 7.1 Definición exacta

- **modoPedido:** Enum BULTO | UNIDAD; en DB `modo_pedido`; define si pedidos/transferencias son por bulto o unidad; default BULTO; validado con unidad_medida y factor_pack.
- **modoCompraProveedor:** Enum BULTO | UNIDAD; en DB `modoCompraProveedor`; define compra y recepción a proveedor (bulto vs fiambre/kg); default BULTO.

### 7.2 Valores posibles

- Ambos: **BULTO**, **UNIDAD** (enum `ModoPedido`).

### 7.3 Cómo funciona el caso FIAMBRES

- Fiambre = `modoCompraProveedor === "UNIDAD"`. Stock en kg; recepción con kg recibidos; sugeridos en piezas usando pesoReferenciaKg/pesoPromedioKg. Campos opcionales: pesoReferenciaKg, pesoEsFijo, pesoPromedioKg, actualizaPromedioPorRecepcion.

### 7.4 Dónde impactan

- **modo_pedido:** Crear/editar producto, import, catálogo de pedidos, sugeridos de transferencias (cálculo bulto/unidad).
- **modoCompraProveedor:** Crear/editar producto, listado y agregar ítem en compras a proveedor, recepción (incremento en kg vs unidades), UI de compras (badge FIAMBRE, kg recibidos).

### 7.5 Integración en Edición Rápida

- **Sí están integrados:** Ambas columnas existen, se envían en el payload y se guardan bien; valores y validación alineados con el resto del sistema.
- **Limitación:** En Edición Rápida no se editan los campos específicos de fiambre (peso referencia, peso fijo, etc.); solo el modo “Unidad (fiambre)”. Para configurar un fiambre completo sigue siendo necesario el formulario de producto o ampliar el grid.

### 7.6 Recomendaciones para edición masiva

1. **Export/Import:** Incluir en el Excel columnas `modo_pedido` y `modo_compra_proveedor` (o nombres acordados) y en import preview/apply leerlas y mapear a BULTO/UNIDAD, para poder corregir y cargar masivamente sin tocar solo Edición Rápida.
2. **Edición Rápida – fiambres:** Si se quiere soporte masivo completo para fiambres, valorar añadir columnas opcionales (por ejemplo pesoReferenciaKg) o un panel “opciones fiambre” al editar una fila con modoCompraProveedor = UNIDAD, sin obligar a abrir el formulario completo.
3. **Validación en front (Edición Rápida):** Mantener coherencia con FormProducto: si el usuario pone unidad_medida “unidad” o factor_pack vacío/1, considerar forzar o sugerir modoPedido = UNIDAD (hoy la corrección la hace el backend en validarModoPedido).
4. **Labels en UI:** En el grid y en import/export usar etiquetas claras (“Modo pedido (bulto/unidad)” y “Modo compra proveedor (bulto/fiambre kg)”) para no confundir ambos conceptos.

---

**Documento de auditoría; no incluye cambios de código.**

# Auditoría Productos — Nuevo / Editar (unidad, kg, kg por pieza)

**Alcance:** Mapeo y diagnóstico del alta/edición de productos y su relación con venta por unidad, kg y kg por pieza. Sin implementación ni cambios de código.

---

## RUTAS Y ARCHIVOS

### Rutas de pantalla
- **Alta:** `/modulos/productos/nuevo` — app/modulos/productos/nuevo/page.jsx
- **Edición (por id en path):** `/modulos/productos/[id]/editar` — app/modulos/productos/[id]/editar/page.jsx
- **Edición (ruta alternativa):** `/modulos/productos/editar/[id]` — app/modulos/productos/editar/[id]/page.jsx
- **Listado con modal editar:** app/modulos/productos/page.jsx puede abrir edición en modal o navegar a editar.
- **Edición rápida (grid):** `/modulos/productos/edicion-rapida` — app/modulos/productos/edicion-rapida/page.jsx + components/productos/edicion-rapida/EdicionRapidaPage.jsx

### Componentes
- **Formulario alto/edición:** components/productos/FormProducto.jsx (unidad_medida, factor_pack, peso_kg, precios, modo_pedido, modo_envio, modoCompraProveedor, pesoReferenciaKg, etc.).
- **Páginas:** nuevo/page.jsx usa FormProducto y POST crear; [id]/editar y editar/[id] cargan con GET obtener y PUT editar.

### Hooks
- **useContextoActivo** (hooks/useContextoActivo.js) — localId para crear/editar/obtener.
- No hay hook específico “useProductoForm”; la lógica de formulario está en FormProducto y en las páginas.

### Endpoints
- **GET** `/api/productos/obtener?id=&localId=` — un producto (mergeBaseLocalToUi). app/api/productos/obtener/route.js
- **POST** `/api/productos/crear?localId=` — alta. app/api/productos/crear/route.js
- **PUT** `/api/productos/editar/[id]?localId=` — edición. app/api/productos/editar/[id]/route.js

### Tablas / modelos
- **ProductoBase** — unidad_medida, factor_pack, modo_pedido, modo_envio, modo_stock, peso_kg, volumen_ml, modoCompraProveedor, pesoReferenciaKg, pesoEsFijo, pesoPromedioKg, actualizaPromedioPorRecepcion, precio_costo, precio_venta, margen, codigo_barra, etc.
- **ProductoLocal** — override por local (precio_costo, precio_venta, margen, activo, nombre, descripcion).
- **StockLocal** — localId, productoId (ProductoLocal.id), cantidad (Decimal), stockMin, stockMax.
- **Mapper:** lib/mappers/producto.js — mergeBaseLocalToUi (DB → UI camelCase), splitUiToDb (UI → baseData + localData).

---

## CAMPOS REALES

### En base de datos (ProductoBase)
| Campo | Tipo | Uso |
|-------|------|-----|
| **unidad_medida** | Enum UnidadMedida | unidad \| pack \| cajon \| kg |
| **factor_pack** | Int? | Unidades por bulto (pack/cajón). Null o 1 para unidad/kg. |
| **modo_pedido** | ModoPedido | BULTO \| UNIDAD (pedido a depósito) |
| **modo_envio** | ModoEnvio? | SOLO_BULTO \| MIXTO \| SOLO_UNIDAD (envío/venta en depósito) |
| **modo_stock** | ModoStock | BULTO (default) |
| **peso_kg** | Decimal? | Peso del producto (referencia). No es “precio por kg”. |
| **volumen_ml** | Decimal? | Volumen |
| **modoCompraProveedor** | ModoPedido | BULTO \| UNIDAD (fiambre: compra por pieza, stock en kg) |
| **pesoReferenciaKg** | Decimal? | Peso por pieza (fiambre). Ej.: mortadela 4.5 kg. |
| **pesoEsFijo** | Boolean | Si el peso por pieza es fijo o variable. |
| **pesoPromedioKg** | Decimal? | Promedio actualizado en recepción (fiambre). |
| **precio_costo** | Decimal | Costo (por unidad, bulto o kg según producto). |
| **precio_venta** | Decimal | Precio de venta (por unidad, bulto o kg según producto). |
| **codigo_barra** | String? | Código de barras. |
| **margen**, **redondeo_100**, etc. | — | Resto de campos de precios y estado. |

### En UI / mapper (camelCase)
- unidadMedida, factorPack, modoPedido, modoEnvio, modoStock, pesoKg, volumenMl, modoCompraProveedor, pesoReferenciaKg, pesoEsFijo, pesoPromedioKg, precioCosto, precioVenta, codigoBarra.

### Lo que no existe
- **tipoVenta** — no hay campo “tipo de venta” explícito; se infiere de unidad_medida y contexto.
- **ventaPorPeso** — no hay bandera; “venta por peso” se asocia a unidad_medida === "kg".
- **ventaPorPieza** — no hay bandera “vender por pieza” (kg en stock pero cantidad en piezas).
- **precio por unidad** vs **precio por kg** — un solo precio_venta; para pack/cajón el POS deriva precio unitario = precio_venta / factor_pack. Para kg, precio_venta es “precio por kg”.

### Stock
- **StockLocal.cantidad** — un número (puede ser decimal). Para productos en **unidad/pack/cajón** suele ser “unidades” (o equivalentes según convención). Para productos **kg** o **fiambre** (modoCompraProveedor UNIDAD) es **kg**. No hay campo “unidad de stock” en ProductoBase; la convención es: kg si unidad_medida === "kg" o si es fiambre; unidades si no.

---

## LOGICA ACTUAL DEL PRODUCTO

### Producto normal por unidad
- **unidad_medida = "unidad"**. factor_pack null o 1. precio_venta = precio por unidad. Stock en StockLocal en unidades. En POS: cantidad entera, se descuenta 1:1.

### Producto por kg
- **unidad_medida = "kg"**. factor_pack no aplica (1). precio_venta = precio por kg. Stock en kg (StockLocal.cantidad en kg). En POS: cantidad decimal (kg), input/stepper en kg, se descuenta cantidad (kg) del stock.

### Producto kg pero vendido por pieza
- **No está modelado**. Lo más cercano: **modoCompraProveedor = UNIDAD** (fiambre) con **pesoReferenciaKg** y **pesoPromedioKg**: stock en kg, compra por “piezas”. En **POS** no hay “venta por pieza” para esos productos: si se cargan con unidad_medida = "kg", se vende por kg; no hay flujo “cantidad = piezas, descontar cantidad × pesoReferenciaKg del stock”. Si se cargaran con unidad_medida = "unidad", el stock en DB sigue en kg y habría inconsistencia (comparar/descontar “unidades” contra stock en kg).

### Producto pack / cajón
- **unidad_medida = "pack" o "cajon"**. factor_pack > 1 (unidades por bulto). precio_venta en DB = precio del bulto; el POS deriva precio unitario = precio_venta / factor_pack. modo_pedido / modo_envio definen si en depósito se vende por bulto o por unidad. Stock en unidades (cantidad de ProductoLocal en StockLocal = unidades). En POS (local no depósito): se vende por unidad; modoSalidaDefault = UNIDAD; precio mostrado/cobrado unitario.

---

## COMPATIBILIDAD CON POS

### ¿El POS puede saber cuándo abrir “modal kg”?
- No hay modal “ingresar kg” al agregar. El POS usa **unidadMedida === "kg"** (app/api/pos-ventas/buscar-producto/route.js → mapProductos devuelve unidadMedida; CarritoVenta.jsx y posVentaReducer.js usan `item.unidadMedida === "kg"`) para: cantidad decimal, step 0.001, input acepta coma/punto. No hay popup; el carrito ya muestra input decimal para kg. **Conclusión:** Sí puede saber cuándo tratar cantidad como kg (unidadMedida === "kg").

### ¿El POS puede saber cuándo sumar 1 unidad?
- Sí. Para producto no kg, reducer y carrito usan cantidad entera; al agregar desde búsqueda se suma 1 (o cantidadInicial). **Conclusión:** Sí.

### ¿El POS puede distinguir “kg real” vs “kg por pieza”?
- **No.** No existe en el modelo “venta por pieza” (cantidad = piezas, descontar piezas × peso por pieza). El POS solo recibe unidadMedida, factorPack, precioVenta, stock; no usa pesoReferenciaKg ni pesoPromedioKg. Cantidad se descuenta tal cual del stock (item.cantidad en POS crear). **Conclusión:** No puede distinguir; solo existe “cantidad en kg” para unidad_medida === "kg".

### ¿Falta algún campo o bandera?
- Para soportar **“kg por pieza”** en POS haría falta al menos: (1) indicador de que la venta es “por pieza” (o que la cantidad del ítem son piezas), y (2) uso de pesoReferenciaKg o pesoPromedioKg para convertir piezas → kg al descontar stock. Hoy no existe ese indicador ni esa conversión en POS.

---

## INCONSISTENCIAS

- **Naming:** “peso_kg” en base es peso de referencia del producto; “pesoReferenciaKg” es peso por pieza (fiambre). Dos conceptos de “peso”; puede confundir.
- **Un solo precio_venta:** No hay “precio_por_kg” vs “precio_por_unidad” explícitos; la convención es: si unidad_medida es kg → precio es por kg; si pack/cajón → precio es por bulto y el POS divide por factor_pack. Si alguien carga un producto kg con precio “por bulto” por error, el POS lo trataría como precio por kg.
- **Stock sin unidad explícita:** StockLocal.cantidad no tiene “unidad” (kg vs unidades); se infiere por tipo de producto. Para fiambre (modoCompraProveedor UNIDAD) el stock es en kg; si en otro flujo se interpretara como “unidades” habría error.
- **Nuevo vs Editar:** Crear y editar usan el mismo mapper (splitUiToDb) y mismas validaciones (validarModoPedido, etc.); no se detectan diferencias de guardado. Edición rápida arma payload con uiToPayload (EdicionRapidaPage.jsx) y envía a PUT editar; incluye unidad_medida, factor_pack; no incluye modo_envio/modo_stock ni pesoReferenciaKg (pero el backend no los borra si no se envían).
- **Front vs backend:** En buscar-producto (POS) la regla “precio DB = bulto si factorPack > 1 y unidadMedida !== unidad” está en el API; FormProducto no aclara “precio es por bulto o por unidad” según unidad_medida. El cajero puede no saber si está cargando “precio por kg” o “precio por bulto” en un producto kg.
- **Fiambre en POS:** Productos fiambre (modoCompraProveedor UNIDAD, stock en kg) si se venden en POS con unidad_medida = "kg" están bien (vende por kg, descuenta kg). Si se quisiera “1 mortadela” (1 pieza), no hay soporte: no hay bandera “venta por pieza” ni conversión pieza → kg.

---

## DIAGNOSTICO FINAL

- **Con lo que existe hoy** se cubre bien:
  - Venta por **unidad** (unidad_medida = unidad).
  - Venta por **kg** (unidad_medida = kg, cantidad decimal, stock en kg).
  - Venta por **unidad** de un pack/cajón (unidad_medida = pack/cajon, factor_pack, precio bulto, POS deriva unitario).

- **No alcanza** para:
  - **Kg por pieza** (producto con stock en kg pero venta en “piezas”, ej. 1 mortadela = 4.5 kg): no hay campo “venta por pieza” ni uso de pesoReferenciaKg/pesoPromedioKg en POS para convertir piezas a kg al descontar. La estructura actual (unidad_medida, factor_pack, modoCompraProveedor, pesoReferenciaKg) no se usa en el flujo de venta para ese caso.

**Conclusión:** Para “unidad” y “kg” (venta directa por kg) la estructura alcanza. Para “kg por pieza” (vender por piezas y descontar en kg) **falta definir y soportar** en modelo y/o en POS (bandera o convención + conversión pieza → kg en stock).

---

**Documento de auditoría; no incluye implementación ni cambios de código.**

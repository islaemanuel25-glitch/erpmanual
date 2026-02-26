# AUDITORÍA COMPLETA — MÓDULO PRODUCTOS (ERP Azul)

**Alcance:** Mapeo técnico del módulo Productos actual. Sin código, sin modificaciones.

---

## 1) Flujo completo: UI → Hook → API → Prisma → DB

### 1.1 Listado de productos

| Capa | Detalle |
|------|--------|
| **UI** | `app/modulos/productos/page.jsx`: estado `rows`, `filtros`, `page`, `localId` (desde `useContextoActivo`). Tab "Listado": `FiltrosProductos` + `SunmiTablaProductos`. |
| **Hook / contexto** | `useContextoActivo()` (`hooks/useContextoActivo.js`) expone `contexto.localId` (y `loading`, `needsContexto`). No hay hook específico de productos; el page hace `fetchProductos()` en `useEffect` con dependencias `[page, filtros, localId]`. |
| **API** | `GET /api/productos/listar?page=&q=&categoriaId=&proveedorId=&areaFisicaId=&activo=&localId=` |
| **Prisma** | `getGrupoIdDeLocal(localId)` → `prisma.productoBase.findMany({ where: { grupoId, ...filtros }, include: { categoria, proveedor, area_fisica, locales: { where: { localId }, take: 1 } } })`. |
| **DB** | Tablas: `ProductoBase`, `Categoria`, `Proveedor`, `AreaFisica`, `ProductoLocal`. |

### 1.2 Crear producto

| Capa | Detalle |
|------|--------|
| **UI** | Mismo page: `?nuevo=1` abre `ModalProducto` con `initialData={null}`. Form en `ModalProductoFinal.jsx`; al enviar llama `onSubmit(form)`. |
| **Hook** | Sin hook específico; el page tiene `handleSubmit` que según `editing` llama crear o editar. |
| **API** | `POST /api/productos/crear?localId=` con body JSON del form (nombre, codigo_barra, unidad_medida, precios, etc.). |
| **Prisma** | `getGrupoIdDeLocal(localId)` → si local es depósito: `tx.productoBase.create` + `tx.productoLocal.createMany` (todos los locales del grupo) + `tx.stockLocal.createMany`; si no: `tx.productoBase.create` + `tx.productoLocal.createMany` (solo ese local) + `tx.stockLocal.createMany`. Todo dentro de `prisma.$transaction`. |
| **DB** | Inserciones en `ProductoBase`, `ProductoLocal`, `StockLocal`. |

### 1.3 Editar producto

| Capa | Detalle |
|------|--------|
| **UI** | `?editar=<id>`: el page hace `GET /api/productos/obtener?id=&localId=`, pone el resultado en `editing` y abre el mismo `ModalProducto`. Submit → `handleSubmit(form)`. |
| **API** | `PUT /api/productos/editar/[id]?localId=` con body del form. |
| **Prisma** | Si `localId <= 0` o local es depósito: `editarBase` (update `ProductoBase` + `syncFromBaseToLocales`). Si no: `editarOverride` (update o create `ProductoLocal` para ese baseId/localId). |
| **DB** | Updates en `ProductoBase` y/o `ProductoLocal`. |

### 1.4 Obtener un producto (para edición)

| Capa | Detalle |
|------|--------|
| **API** | `GET /api/productos/obtener?id=&localId=` |
| **Prisma** | `getGrupoIdDeLocal(localId)` → `productoBase.findUnique({ where: { id }, include: { locales: { where: { localId }, take: 1 } } })`. Se valida `base.grupoId === grupoId`. |
| **Salida** | `mergeBaseLocalToUi(base, override)` (mapper). |

### 1.5 Eliminar producto

| Capa | Detalle |
|------|--------|
| **API** | `DELETE /api/productos/eliminar/[id]` |
| **Prisma** | Comprueba uso en `TransferenciaDetalle` y `PosTransferenciaDetalle`; luego `productoLocal.deleteMany({ baseId })` y `productoBase.delete({ id })`. **No está dentro de `$transaction`.** |
| **DB** | Borrado en `ProductoLocal` y luego en `ProductoBase`. |

### 1.6 Importación (preview y apply)

| Capa | Detalle |
|------|--------|
| **UI** | Tab "Import / Export": subida de Excel, parse con XLSX, `POST /api/productos/import/preview` con `localId`, `modo`, `productos` (array del Excel). Luego "Confirmar" → `POST /api/productos/import/apply` con mismo payload. |
| **API preview** | Agrupa por `grupoId` (session), carga productos existentes del grupo por `codigo_barra`, valida filas y asigna `accion`: crear / actualizar / ignorar / error. |
| **API apply** | Dentro de `prisma.$transaction`: para cada "crear" → create Base + ProductoLocal + StockLocal (mismo local); para cada "actualizar" → update Base y opcionalmente ProductoLocal/StockLocal. |
| **DB** | Inserciones/actualizaciones en `ProductoBase`, `ProductoLocal`, `StockLocal`. |

### 1.7 Exportación

| Capa | Detalle |
|------|--------|
| **API** | `POST /api/productos/export` con `localId`, `proveedorId`, `categoriaId` opcionales. Filtra por `grupoId` (session) y opcionalmente por local; devuelve Excel. |

### 1.8 Catálogos (Categoría, Proveedor, Área)

| Capa | Detalle |
|------|--------|
| **UI** | El page llama `fetchCatalogos()` que hace en paralelo `GET /api/catalogos/categorias`, `GET /api/catalogos/proveedores`, `GET /api/catalogos/areas-fisicas`. |
| **API** | Rutas en `app/api/catalogos/` (no filtran por grupo; son catálogos globales o por tenant según implementación de cada ruta). |
| **Uso** | Se pasan a `FiltrosProductos`, `ModalProductoFinal`, export y columnas. |

---

## 2) Archivos involucrados

### 2.1 Páginas (UI)

| Ruta | Descripción |
|------|-------------|
| `app/modulos/productos/page.jsx` | Página principal: listado, filtros, tabs (Listado / Import-Export), modal nuevo/editar, export/import. |
| `app/modulos/productos/editar/[id]/page.jsx` | (Existente en glob; puede ser redirección o detalle; el flujo principal de edición es `?editar=<id>` en la página principal.) |
| `app/modulos/productos/actualizacion-precios/page.jsx` | Pestaña/ruta de actualización masiva de precios. |
| `app/modulos/productos/(acciones)/nuevo/page.jsx` | (Ruta alternativa "nuevo"; el flujo principal es `?nuevo=1` en la página principal.) |

### 2.2 APIs de productos

| Ruta | Método | Uso |
|------|--------|-----|
| `app/api/productos/listar/route.js` | GET | Listado paginado por grupo + localId. |
| `app/api/productos/crear/route.js` | POST | Crear producto (base + local + stock en transacción). |
| `app/api/productos/obtener/route.js` | GET | Un producto para edición (base + override local). |
| `app/api/productos/editar/[id]/route.js` | PUT | Editar base o override local. |
| `app/api/productos/eliminar/[id]/route.js` | DELETE | Borrar ProductoLocal(s) y ProductoBase (no transaccional). |
| `app/api/productos/import/preview/route.js` | POST | Preview de importación (acciones crear/actualizar/ignorar/error). |
| `app/api/productos/import/apply/route.js` | POST | Aplicar importación en transacción. |
| `app/api/productos/export/route.js` | POST | Exportar Excel por grupo (y opcional local). |
| `app/api/productos/precios/preview/route.js` | POST | Preview actualización precios. |
| `app/api/productos/precios/apply/route.js` | POST | Aplicar actualización precios. |
| `app/api/productos/precios/history/route.js` | GET | Historial precios. |
| `app/api/productos/precios/history/[id]/route.js` | GET | Historial por producto. |
| `app/api/productos/precios/parse/route.js` | POST | Parse de precios. |

### 2.3 Catálogos (usados por Productos)

| Ruta | Uso |
|------|-----|
| `app/api/catalogos/categorias/route.js` | Lista categorías para filtros y modal. |
| `app/api/catalogos/proveedores/route.js` | Lista proveedores. |
| `app/api/catalogos/areas-fisicas/route.js` | Lista áreas físicas. |

### 2.4 Hooks relacionados

| Hook | Uso en Productos |
|------|-------------------|
| `hooks/useContextoActivo.js` | Proporciona `contexto.localId` (y grupo implícito) para listar, crear, editar e import. |
| `app/context/UserContext` (`useUser`) | Permisos y perfil para ver módulo. |
| `components/productos/actualizacion-precios/hooks/useActualizacionPrecios.js` | Lógica del subflujo de actualización de precios. |

### 2.5 Componentes usados

| Componente | Uso |
|------------|-----|
| `components/productos/FiltrosProductos.jsx` | Filtros (búsqueda, categoría, proveedor, área, estado). |
| `components/productos/ModalProductoFinal.jsx` | Modal crear/editar producto (form completo). |
| `components/productos/SunmiTablaProductos.jsx` | Tabla del listado con columnas visibles, editar, eliminar. |
| `components/productos/ColumnManager.jsx` | Selector de columnas visibles. |
| `components/productos/TablaProductos.jsx` | (Referenciado en búsqueda; puede ser variante o legacy.) |
| `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx` | Página de actualización masiva de precios. |
| `components/productos/actualizacion-precios/PreviewPreciosTable.jsx` | Tabla preview en actualización de precios. |
| SunmiCard, SunmiSeparator, SunmiButton, SunmiSelectAdv, SunmiTable, SunmiLoader, etc. | UI común. |
| `components/auth/SinPermisos` | Cuando el usuario no tiene permiso. |

### 2.6 Libs / mappers

| Archivo | Uso |
|---------|-----|
| `lib/mappers/producto.js` | `mergeBaseLocalToUi(base, local)` y `splitUiToDb(payload)` para convertir entre Prisma (snake_case) y UI (camelCase). |
| `lib/grupos.js` | `getGrupoIdDeLocal(localId)`, `getLocalesDeGrupo(grupoId)` para multi-tenant y replicación depósito. |
| `lib/prisma` | Cliente Prisma. |
| `lib/auth.js` | `getUsuarioSession(req)` en APIs. |

---

## 3) Modelos Prisma involucrados

### 3.1 Directos

| Modelo | Rol |
|--------|-----|
| **ProductoBase** | Producto a nivel de grupo: nombre, código barra, precios base, categoría, proveedor, área, unidad, modo pedido/envío/stock, etc. `grupoId` obligatorio. |
| **ProductoLocal** | Instancia del producto en un local: override de precio_costo, precio_venta, margen, activo. Par (localId, baseId) único. |
| **StockLocal** | Stock por local y ProductoLocal: cantidad, stockMin, stockMax. Par (localId, productoId) único. |
| **Categoria** | Catálogo: id, nombre, activo. |
| **Proveedor** | Catálogo: id, nombre, cuit (unique), etc. |
| **AreaFisica** | Catálogo: id, nombre, tipo, activo. |
| **Local** | Locales y depósitos; relación con Grupo (GrupoLocal, GrupoDeposito). |
| **Grupo** | Agrupación de locales; ProductoBase pertenece a un grupo. |

### 3.2 Relacionados (lectura o integridad)

| Modelo | Relación con Productos |
|--------|-------------------------|
| **TransferenciaDetalle** | Usa `productoId` (ProductoLocal); se comprueba antes de eliminar producto. |
| **PosTransferenciaDetalle** | Usa `productoId` (ProductoLocal); se comprueba antes de eliminar. |
| **ProductoListaPrecio** | Precios por lista por ProductoBase. |
| **VentaDetalle** | Relación con ProductoBase. |
| **ListaPrecio** | Por local; usado en precios especiales. |

---

## 4) Campos obligatorios para un producto funcional hoy

### 4.1 ProductoBase (crear)

- **Obligatorios en schema / API crear:**  
  `grupoId`, `nombre`, `unidad_medida`, `precio_costo`, `precio_venta`.  
  `codigo_barra` es opcional (null permitido); si se envía, entra en el unique `(grupoId, codigo_barra)`.
- **Definidos por defecto en backend si no se envían:**  
  `modo_pedido` (según unidad/factor_pack), `modo_envio` (p. ej. MIXTO o SOLO_BULTO para cajon), `modo_stock` (BULTO), `activo` (true), `es_combo` (false), `redondeo_100` (false), `creadoEnLocalId` (localId del request).
- **Opcionales pero útiles:**  
  descripcion, sku, categoria_id, proveedor_id, area_fisica_id, factor_pack, peso_kg, volumen_ml, margen, iva_porcentaje, fecha_vencimiento, imagen_url.

### 4.2 ProductoLocal (creación desde API crear/import)

- **Obligatorios:**  
  `localId`, `baseId`.  
  El API rellena desde la base: `precio_costo`, `precio_venta`, `margen`, `activo`.  
  `nombre` y `descripcion` se dejan null (se heredan de base en UI vía mapper).

### 4.3 StockLocal (creación desde API crear/import)

- **Obligatorios:**  
  `localId`, `productoId` (id de ProductoLocal), `cantidad` (Decimal; típicamente "0").  
  `stockMin` y `stockMax` pueden ser null.

---

## 5) Validaciones actuales en backend

### 5.1 Unique constraints (Prisma)

| Modelo | Constraint | Efecto |
|--------|------------|--------|
| ProductoBase | `@@unique([grupoId, codigo_barra])` | Dentro de un grupo, `codigo_barra` no puede repetirse. Varios productos pueden tener `codigo_barra` null en el mismo grupo. |
| ProductoLocal | `@@unique([localId, baseId])` | Un mismo producto base solo puede tener una fila por local. |
| StockLocal | `@@unique([localId, productoId])` | Un registro de stock por (local, ProductoLocal). |
| Proveedor | `cuit` @unique | CUIT único. |
| Categoria / AreaFisica | Sin unique en nombre | No hay unicidad de nombre a nivel global. |

### 5.2 Índices

- **ProductoBase:** grupoId, creadoEnLocalId, categoria_id, proveedor_id, area_fisica_id.
- **ProductoLocal:** localId, baseId.
- **StockLocal:** localId, productoId.

### 5.3 Reglas multi-tenant (grupoId / localId)

- **Listar:** `grupoId = getGrupoIdDeLocal(localId)`; solo productos del grupo del local. Opcionalmente se filtra por el `ProductoLocal` de ese `localId` (override de precios/activo).
- **Crear:** `grupoId` obtenido del local; producto creado en ese grupo. Si el local es depósito, se replica ProductoLocal + StockLocal a todos los locales del grupo.
- **Obtener / Editar:** Se valida que `base.grupoId === grupoId` (del local pasado). Edición puede ser solo base (depósito o sin local) o solo override local.
- **Eliminar:** No se comprueba grupo; se elimina por `id` de base (cualquier usuario autenticado que llegue al endpoint).
- **Import:** Usa `session.grupoId` y `body.localId`; preview y apply filtran/crean por ese grupo y local.

---

## 6) Riesgos si se hace una importación masiva

| Riesgo | Detalle |
|--------|--------|
| **Duplicados** | El preview clasifica por `codigo_barra` dentro del grupo. Si dos filas del Excel tienen el mismo `codigo_barra` y ambas son "crear", la segunda fallará por unique (grupoId, codigo_barra). No hay deduplicación por filas duplicadas dentro del mismo archivo. |
| **Productos ya existentes** | Si `codigo_barra` ya existe en el grupo, preview marca "actualizar" (en modo crear_actualizar) o "ignorar" (en modo solo crear). En apply, actualizar hace update por `productoBaseId`; no se crea otra base. |
| **Conflictos de código de barras** | Unique `(grupoId, codigo_barra)`. Códigos repetidos en el grupo → error en create. Código vacío o null → varios productos pueden tener null (válido). |
| **Conflictos por grupo/local** | Import usa `session.grupoId` y `body.localId`. Todo se crea/actualiza en ese grupo. Si el Excel mezcla datos de otro grupo, no hay validación cruzada; el riesgo es de datos incorrectos, no de constraint. |
| **Catálogos (categoría/proveedor/área)** | Se resuelven por nombre (preview); si el nombre no coincide exactamente con el catálogo, se marca error o se deja null. Nombres con distinto casing/espacios pueden no matchear. |
| **Transacción parcial** | Apply corre en una sola `$transaction`; si un item falla, se captura y se agrega a `erroresDetalle`, pero el resto de la transacción sigue. Al final se hace un único commit: o todo el lote se aplica o nada (salvo que haya lógica explícita de savepoints, que no se vio). |

---

## 7) Confirmaciones solicitadas

### ¿La creación de producto es transaccional?

**Sí.** En `app/api/productos/crear/route.js` toda la lógica de creación está dentro de:

```js
const result = await prisma.$transaction(async (tx) => { ... });
```

Dentro de la transacción: create ProductoBase; luego, según si el local es depósito o no, createMany ProductoLocal (y en su caso para todos los locales del grupo) y createMany StockLocal. Si cualquier paso lanza, la transacción hace rollback.

### ¿Se crean ProductoBase + ProductoLocal + StockLocal en una sola operación?

**Sí.** En el mismo `$transaction`:

1. Se crea **ProductoBase**.
2. Se crea(n) **ProductoLocal** (uno por local: solo el local del request, o todos los del grupo si es depósito), con `skipDuplicates: true`.
3. Se obtienen los ids de ProductoLocal creados y se hace **createMany** de **StockLocal** (uno por ProductoLocal), con `skipDuplicates: true`.

Todo forma parte de una única operación atómica desde el punto de vista de la base de datos.

### Eliminación de producto

**No es transaccional.** En `app/api/productos/eliminar/[id]/route.js` se hace primero `productoLocal.deleteMany({ baseId })` y luego `productoBase.delete({ id })` sin `$transaction`. Si el segundo falla, quedaría un ProductoBase sin ProductoLocal (estado inconsistente). Sería recomendable envolver ambos borrados en `prisma.$transaction`.

---

*Fin del informe de auditoría. Sin código ni cambios aplicados.*

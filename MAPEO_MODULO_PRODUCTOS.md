# MAPEO COMPLETO: MÓDULO PRODUCTOS Y ACTUALIZACIÓN DE PRECIOS

## A. ÁRBOL DE ARCHIVOS (paths)

### Pages/Routes (Next.js App Router)
- `app/modulos/productos/page.jsx` - Página principal (listado + import/export)
- `app/modulos/productos/(acciones)/nuevo/page.jsx` - Crear nuevo producto
- `app/modulos/productos/editar/[id]/page.jsx` - Editar producto existente
- `app/modulos/productos/actualizacion-precios/page.jsx` - Wrapper para Actualización de Precios

### Componentes UI
- `components/productos/FiltrosProductos.jsx` - Filtros de búsqueda (categoría, proveedor, área, activo)
- `components/productos/TablaProductos.jsx` - Tabla de productos (legacy)
- `components/productos/SunmiTablaProductos.jsx` - Tabla de productos (Sunmi style)
- `components/productos/ColumnManager.jsx` - Gestor de columnas visibles
- `components/productos/ModalProductoFinal.jsx` - Modal para crear/editar producto
- `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx` - Página principal de actualización
- `components/productos/actualizacion-precios/PreviewPreciosTable.jsx` - Tabla de preview de precios
- `components/productos/actualizacion-precios/hooks/useActualizacionPrecios.js` - Hook personalizado para lógica de precios

### APIs (app/api/productos/)
- `app/api/productos/listar/route.js` - GET - Listar productos con paginación y filtros
- `app/api/productos/obtener/route.js` - GET - Obtener un producto por ID
- `app/api/productos/crear/route.js` - POST - Crear nuevo producto
- `app/api/productos/editar/[id]/route.js` - PUT - Editar producto existente
- `app/api/productos/eliminar/[id]/route.js` - DELETE - Eliminar producto
- `app/api/productos/export/route.js` - GET - Exportar productos a Excel
- `app/api/productos/import/preview/route.js` - POST - Preview de importación Excel
- `app/api/productos/import/apply/route.js` - POST - Aplicar importación Excel

### APIs de Actualización de Precios (app/api/productos/precios/)
- `app/api/productos/precios/parse/route.js` - POST - Parsear texto pegado (código|nombre|costo|venta)
- `app/api/productos/precios/preview/route.js` - POST - Preview de cambios de precios
- `app/api/productos/precios/apply/route.js` - POST - Aplicar cambios de precios (transacción)
- `app/api/productos/precios/history/route.js` - GET - Historial de actualizaciones
- `app/api/productos/precios/history/[id]/route.js` - GET - Detalle de una actualización

### Hooks
- `hooks/useContextoActivo.js` - Hook para obtener localId/grupoId activo

### Utils/Services
- `lib/mappers/producto.js` - Mappers: `mergeBaseLocalToUi()`, `splitUiToDb()`
- `lib/grupos.js` - `getGrupoIdDeLocal()`, `getLocalesDeGrupo()`
- `lib/auth.js` - `getUsuarioSession()`
- `lib/prisma.js` - Cliente Prisma

### Modelos Prisma (prisma/schema.prisma)
- `ProductoBase` - Producto base (por grupo)
- `ProductoLocal` - Override de precios/activo por local
- `StockLocal` - Stock por local (referencia a ProductoLocal)
- `PrecioUpdate` - Registro de actualización masiva de precios
- `PrecioUpdateItem` - Items individuales de cada actualización
- `ProductoListaPrecio` - Precios especiales por lista de precios

---

## B. MAPA UI → Hook/State → API → DB

### 1. PANTALLA: Listado de Productos (`/modulos/productos`)

**Ruta:** `app/modulos/productos/page.jsx`

**Componentes clave:**
- `FiltrosProductos` - Filtros de búsqueda
- `SunmiTablaProductos` - Tabla con paginación
- `ColumnManager` - Gestión de columnas
- `ModalProductoFinal` - Modal crear/editar

**Estado y hooks:**
- `useState`: `page`, `filtros` (search, categoria, proveedor, area, activo), `rows`, `totalPages`, `loading`, `catalogos`, `modalOpen`, `editing`
- `useContextoActivo()`: `localId`, `contexto`, `needsContexto`
- `useUser()`: `perfil`, `permisos`
- `useSearchParams()`: `nuevo`, `editarId`

**Endpoints llamados:**
- `GET /api/catalogos/categorias` - Cargar categorías
- `GET /api/catalogos/proveedores` - Cargar proveedores
- `GET /api/catalogos/areas-fisicas` - Cargar áreas físicas
- `GET /api/productos/listar?page={page}&q={q}&categoriaId={id}&proveedorId={id}&areaFisicaId={id}&activo={bool}&localId={id}` - Listar productos
- `GET /api/productos/obtener?id={id}&localId={id}` - Obtener producto para editar
- `POST /api/productos/crear?localId={id}` - Crear producto
- `PUT /api/productos/editar/{id}?localId={id}` - Editar producto
- `DELETE /api/productos/eliminar/{id}` - Eliminar producto

**Tablas/Modelos tocados:**
- `ProductoBase` (findMany, findUnique, create, update, delete)
- `ProductoLocal` (include en findMany, createMany)
- `Categoria`, `Proveedor`, `AreaFisica` (joins)
- `StockLocal` (creado automáticamente al crear producto)

**Campos clave:**
- `grupoId` (obligatorio, desde session)
- `localId` (obligatorio, desde contexto activo)
- `nombre`, `codigo_barra`, `sku`
- `precio_costo`, `precio_venta`, `margen`
- `categoria_id`, `proveedor_id`, `area_fisica_id`
- `unidad_medida`, `factor_pack`, `modo_pedido`
- `activo` (boolean)

---

### 2. PANTALLA: Crear/Editar Producto

**Ruta:** `app/modulos/productos/(acciones)/nuevo/page.jsx` o `app/modulos/productos/editar/[id]/page.jsx`

**Componentes clave:**
- `ModalProductoFinal` - Formulario completo

**Estado y hooks:**
- `useState`: `catalogos`, `open`, `loadingEditar`
- `useUser()`: `perfil.localId`
- `useRouter()`: navegación

**Endpoints llamados:**
- `GET /api/categorias/listar` - Categorías (fallback)
- `GET /api/proveedores/listar` - Proveedores (fallback)
- `GET /api/areas-fisicas/listar` - Áreas (fallback)
- `GET /api/productos/obtener?id={id}&localId={id}` - Cargar para editar
- `POST /api/productos/crear?localId={id}` - Crear
- `PUT /api/productos/editar/{id}?localId={id}` - Editar

**Tablas/Modelos tocados:**
- `ProductoBase` (create, update, findUnique)
- `ProductoLocal` (createMany con skipDuplicates)
- `StockLocal` (createMany con skipDuplicates)
- Si `creadoEnLocalId` es depósito → replica a todos los locales del grupo

**Campos clave:**
- Mismos que listado
- Validación: `modo_pedido` según `unidad_medida` y `factor_pack`
- Si `unidad_medida === "unidad"` o `factor_pack <= 1` → `modo_pedido = "UNIDAD"`
- Si `unidad_medida === "cajon"` → `modo_envio = "SOLO_BULTO"` (default)

---

### 3. PANTALLA: Actualización de Precios (`/modulos/productos/actualizacion-precios`)

**Ruta:** `app/modulos/productos/actualizacion-precios/page.jsx` → `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`

**Componentes clave:**
- `ActualizacionPreciosPage` - Página principal con tabs
- `PreviewPreciosTable` - Tabla de preview
- `useActualizacionPrecios` - Hook con lógica

**Estado y hooks:**
- `useActualizacionPrecios()`: `loadingPreview`, `loadingApply`, `preview`, `summary`, `alertas`, `selectedIds`, `selectedItems`, `history`, `historyDetail`, `errorMsg`, `successMsg`
- `useState`: `tab` ("proveedor" | "excel"), `proveedores`, `proveedorId`, `filas`, `globalPct`, `applying`
- `useContextoActivo()`: `needsContexto`
- `useUser()`: `perfil`

**Endpoints llamados:**
- `GET /api/proveedores/opciones` - Listar proveedores
- `GET /api/catalogos/proveedores` - Fallback proveedores
- `POST /api/productos/precios/preview` - Preview de cambios
- `POST /api/productos/precios/apply` - Aplicar cambios (transacción)
- `GET /api/productos/precios/history` - Historial
- `GET /api/productos/precios/history/{id}` - Detalle historial
- `POST /api/productos/precios/parse` - Parsear texto pegado (no usado en UI actual)

**Tablas/Modelos tocados:**
- `ProductoBase` (findMany por proveedorId, updateMany)
- `PrecioUpdate` (create en transacción)
- `PrecioUpdateItem` (create en transacción, uno por producto)

**Campos clave:**
- `grupoId` (obligatorio, desde session)
- `proveedorId` (obligatorio para filtrar productos)
- `metodo`: "AUMENTO" | "REGLAS" | "PEGADO" | "MANUAL"
- `pricingMode`: "KEEP_VENTA" | "RECALC_BY_MARGEN" | "SET_VENTA"
- `costoAnterior`, `costoNuevo`, `ventaAnterior`, `ventaNueva` (en PrecioUpdateItem)

---

### 4. PANTALLA: Import/Export Excel

**Ruta:** `app/modulos/productos/page.jsx` (tab "Import / Export")

**Componentes clave:**
- Mismo componente principal con tab switching

**Estado y hooks:**
- `useState`: `expProveedorId`, `expCategoriaId`, `expLoading`, `impModo`, `impFile`, `impPreview`, `impResumen`, `impLoading`, `impResultado`, `impError`
- `useContextoActivo()`: `localId`

**Endpoints llamados:**
- `GET /api/productos/export?proveedorId={id}&categoriaId={id}&localId={id}` - Exportar
- `POST /api/productos/import/preview` - Preview de importación
- `POST /api/productos/import/apply` - Aplicar importación (transacción)

**Tablas/Modelos tocados:**
- `ProductoBase` (findMany para export, create/update para import)
- `ProductoLocal` (createMany/update para import)
- `StockLocal` (createMany para import)
- `Categoria`, `Proveedor`, `AreaFisica` (búsqueda por nombre)

**Campos clave:**
- Mismos que crear/editar
- Validación: `unidad_medida` debe ser: "unidad", "pack", "cajon", "kg"
- `factor_pack` obligatorio si `unidad_medida === "pack"` o `"cajon"`
- `precio_costo` y `precio_venta` obligatorios y > 0
- Búsqueda de productos existentes por `codigo_barra`

---

## C. FLUJO "ACTUALIZACIÓN DE PRECIOS" PASO A PASO

### Flujo 1: Por Proveedor + Aumento Porcentual

1. **Usuario entra a `/modulos/productos/actualizacion-precios`**
   - Se carga lista de proveedores (`GET /api/proveedores/opciones`)
   - Se verifica `useContextoActivo()` (debe tener grupoId)

2. **Usuario selecciona proveedor**
   - `setProveedorId(proveedorId)`

3. **Usuario hace click en "Cargar productos"**
   - `handleCargarProductos()` ejecuta:
     - `POST /api/productos/precios/preview` con:
       - `proveedorId`
       - `metodo: "AUMENTO"`
       - `pricingMode: "KEEP_VENTA"`
       - `increase: { kind: "PCT", value: 0 }` (sin cambios inicial)
   - Backend (`preview/route.js`):
     - Valida `grupoId` desde session
     - Busca `ProductoBase` donde `grupoId` y `proveedor_id = proveedorId`
     - Retorna lista con `costoAnterior`, `ventaAnterior`, `margen`, `redondeo_100`
   - Frontend mapea a `filas` editables

4. **Usuario ingresa % global o edita filas individuales**
   - `handleAplicarGlobal()` aplica % a todas las filas
   - `handlePctChange()` o `handlePrecioDirectoChange()` edita fila individual
   - Se calcula `compraNueva = compraActual * (1 + pct/100)`
   - Se calcula `ventaNueva = compraNueva * (1 + margen/100)`
   - Si `redondeo_100`: `ventaNueva = Math.ceil(ventaNueva / 100) * 100`

5. **Usuario hace click en "Aplicar cambios"**
   - `handleAplicar()` valida que haya cambios
   - Construye `items` con `productoBaseId`, `costoAnterior`, `costoNuevo`, `ventaAnterior`, `ventaNueva`
   - `POST /api/productos/precios/apply` con:
     - `proveedorId`
     - `metodo: "AUMENTO"`
     - `pricingMode: "SET_VENTA"`
     - `items: [...]`

6. **Backend aplica cambios (`apply/route.js`):**
   - Inicia transacción `prisma.$transaction()`
   - Crea `PrecioUpdate` (registro de la actualización)
   - Para cada `item`:
     - `updateMany` en `ProductoBase` donde `id = productoBaseId`, `grupoId`, `proveedor_id`:
       - `precio_costo = costoNuevo`
       - `precio_venta = ventaNueva`
     - Crea `PrecioUpdateItem` con valores anteriores y nuevos
   - Commit transacción
   - Retorna `{ ok: true, message, updateId, applied }`

7. **Frontend recarga productos y muestra éxito**
   - `showSuccess(message)`
   - `handleCargarProductos()` para reflejar nuevos precios

---

### Flujo 2: Por Excel (Pegado de datos)

1. **Usuario selecciona tab "Excel"**
   - `setTab("excel")`

2. **Usuario selecciona proveedor y descarga Excel**
   - `handleDescargarExcel()`:
     - Carga productos del proveedor
     - Genera Excel con columnas: `codigo_barra`, `nombre`, `compra_actual`, `venta_actual`, `margen`
     - Descarga archivo

3. **Usuario edita Excel y pega datos**
   - `handlePegarExcel()`:
     - Parsea texto pegado (separado por `|`, `;`, `\t`)
     - Formato: `codigo|nombre|costo|venta`
     - Mapea a productos por `codigo_barra` o `nombre` (normalizado)

4. **Usuario hace click en "Aplicar"**
   - Similar a Flujo 1, pero con `metodo: "PEGADO"`

---

### Flujo 3: Por Reglas (no implementado en UI actual)

- Backend soporta `metodo: "REGLAS"` con array de reglas
- Cada regla tiene `match` (categoriaId, nombreIncludes) e `increase` (PCT/ABS)
- No hay UI para esto actualmente

---

### Flujo 4: Manual (no implementado en UI actual)

- Backend soporta `metodo: "MANUAL"` con `manualEdits` array
- No hay UI para esto actualmente

---

## D. LISTA DE RIESGOS/BUGS

### ALTA SEVERIDAD

1. **Falta validación de permisos en APIs de precios**
   - **Archivo:** `app/api/productos/precios/preview/route.js`, `app/api/productos/precios/apply/route.js`
   - **Problema:** Solo valida autenticación, no permisos específicos (`productos.editar`)
   - **Riesgo:** Cualquier usuario autenticado puede cambiar precios masivamente

2. **Actualización de precios NO sincroniza ProductoLocal**
   - **Archivo:** `app/api/productos/precios/apply/route.js` (línea 77-87)
   - **Problema:** Solo actualiza `ProductoBase`, no `ProductoLocal`
   - **Riesgo:** Si hay overrides locales, los precios no se reflejan en esos locales
   - **Impacto:** Inconsistencia entre base y locales

3. **Falta validación de grupoId en updateMany**
   - **Archivo:** `app/api/productos/precios/apply/route.js` (línea 77-87)
   - **Problema:** `updateMany` valida `grupoId` pero si hay race condition, podría actualizar producto de otro grupo
   - **Riesgo:** Actualización cruzada entre grupos

4. **No hay rollback si falla algún item en apply**
   - **Archivo:** `app/api/productos/precios/apply/route.js` (línea 48-108)
   - **Problema:** Si un `updateMany` retorna `count === 0`, lanza error pero la transacción ya creó `PrecioUpdate`
   - **Riesgo:** Registro huérfano en historial

5. **Falta validación de decimales/redondeo en preview**
   - **Archivo:** `app/api/productos/precios/preview/route.js` (línea 228-230)
   - **Problema:** `roundUpTo100()` puede generar precios inconsistentes si el margen cambia
   - **Riesgo:** Precios finales no coinciden con preview

### MEDIA SEVERIDAD

6. **Import Excel no valida duplicados por nombre si falta codigo_barra**
   - **Archivo:** `app/api/productos/import/preview/route.js` (línea 143-144)
   - **Problema:** Solo busca por `codigo_barra`, no por nombre normalizado
   - **Riesgo:** Duplicados si mismo producto tiene diferentes códigos de barras

7. **Falta índice en ProductoBase para búsquedas por proveedor**
   - **Archivo:** `prisma/schema.prisma` (línea 204)
   - **Problema:** Hay `@@index([proveedor_id])` pero no compuesto `[grupoId, proveedor_id]`
   - **Riesgo:** Queries lentas en grupos con muchos productos

8. **Preview no valida productos inactivos**
   - **Archivo:** `app/api/productos/precios/preview/route.js` (línea 106-122)
   - **Problema:** Incluye productos con `activo = false`
   - **Riesgo:** Usuario puede actualizar precios de productos inactivos sin darse cuenta

9. **No hay límite de items en apply**
   - **Archivo:** `app/api/productos/precios/apply/route.js` (línea 44)
   - **Problema:** Puede recibir miles de items y hacer updateMany uno por uno
   - **Riesgo:** Timeout en transacciones largas

10. **Falta validación de margen negativo en preview**
    - **Archivo:** `app/api/productos/precios/preview/route.js` (línea 224-226)
    - **Problema:** Si `margen < 0`, calcula `ventaNueva < costoNuevo`
    - **Riesgo:** Precios de venta menores que costo

### BAJA SEVERIDAD

11. **Historial limitado a 100 registros**
    - **Archivo:** `app/api/productos/precios/history/route.js` (línea 23)
    - **Problema:** `take: 100` hardcodeado
    - **Riesgo:** Historial antiguo no visible

12. **Falta paginación en preview de precios**
    - **Archivo:** `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`
    - **Problema:** Si proveedor tiene 1000+ productos, UI se vuelve lenta
    - **Riesgo:** Performance en clientes grandes

13. **No hay validación de formato de Excel en import**
    - **Archivo:** `app/api/productos/import/preview/route.js`
    - **Problema:** Asume formato correcto, errores genéricos
    - **Riesgo:** UX confusa si Excel está mal formateado

14. **Falta validación de codigo_barra único por grupo**
    - **Archivo:** `prisma/schema.prisma` (línea 200)
    - **Problema:** `@@unique([grupoId, codigo_barra])` existe pero permite `null`
    - **Riesgo:** Múltiples productos sin código de barras

15. **No hay auditoría de quién cambió precios manualmente**
    - **Archivo:** `app/api/productos/editar/[id]/route.js`
    - **Problema:** No crea `PrecioUpdate` cuando se edita producto individual
    - **Riesgo:** No se puede rastrear cambios manuales vs masivos

---

## E. RECOMENDACIONES MÍNIMAS (ordenadas por impacto)

1. **Agregar validación de permisos en APIs de precios**
   - Verificar `productos.editar` o `*` antes de permitir preview/apply
   - **Archivo:** `app/api/productos/precios/preview/route.js`, `app/api/productos/precios/apply/route.js`

2. **Sincronizar ProductoLocal al actualizar precios masivamente**
   - En `apply/route.js`, después de actualizar `ProductoBase`, actualizar todos los `ProductoLocal` relacionados
   - O crear lógica de sincronización automática

3. **Agregar validación de grupoId en updateMany con where explícito**
   - Asegurar que `updateMany` siempre incluya `grupoId` en where
   - **Archivo:** `app/api/productos/precios/apply/route.js`

4. **Implementar batch updates en apply**
   - En lugar de `updateMany` uno por uno, agrupar por rangos o usar `updateMany` con `IN`
   - **Archivo:** `app/api/productos/precios/apply/route.js`

5. **Filtrar productos inactivos en preview (opcional)**
   - Agregar parámetro `incluirInactivos: boolean` en preview
   - **Archivo:** `app/api/productos/precios/preview/route.js`

6. **Agregar límite de items en apply**
   - Validar `items.length <= 1000` antes de procesar
   - **Archivo:** `app/api/productos/precios/apply/route.js`

7. **Validar margen negativo en preview**
   - Si `margen < 0` y `pricingMode === "RECALC_BY_MARGEN"`, mostrar alerta crítica
   - **Archivo:** `app/api/productos/precios/preview/route.js`

8. **Agregar índice compuesto [grupoId, proveedor_id] en ProductoBase**
   - Mejorar performance de queries por proveedor
   - **Archivo:** `prisma/schema.prisma` → migración

9. **Implementar paginación en preview de precios**
   - Si hay > 100 productos, mostrar primeros 100 y botón "Cargar más"
   - **Archivo:** `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`

10. **Agregar auditoría de cambios manuales**
    - Crear `PrecioUpdate` con `metodo: "MANUAL"` cuando se edita producto individual
    - **Archivo:** `app/api/productos/editar/[id]/route.js`

---

## F. CONTRATOS Y VALIDACIONES

### Validaciones de Input

**No hay librería de validación (zod/yup):**
- Validaciones manuales en cada API route
- Validaciones básicas: `Number()`, `isNaN()`, `trim()`, `includes()`

### Campos Obligatorios

**ProductoBase:**
- `grupoId` (desde session)
- `nombre` (string, no vacío)
- `unidad_medida` (enum: "unidad", "pack", "cajon", "kg")
- `precio_costo` (Decimal > 0)
- `precio_venta` (Decimal > 0)

**Actualización de Precios:**
- `proveedorId` (Number > 0)
- `metodo` (enum: "AUMENTO", "REGLAS", "PEGADO", "MANUAL")
- `pricingMode` (enum: "KEEP_VENTA", "RECALC_BY_MARGEN", "SET_VENTA")
- `items` (Array, no vacío)

### Prevención de Duplicados

- `ProductoBase`: `@@unique([grupoId, codigo_barra])` (permite null)
- `ProductoLocal`: `@@unique([localId, baseId])`
- Import Excel: busca por `codigo_barra` antes de crear

### Transacciones

- `app/api/productos/precios/apply/route.js`: `prisma.$transaction()` para atomicidad
- `app/api/productos/crear/route.js`: `prisma.$transaction()` para crear base + local + stock
- `app/api/productos/import/apply/route.js`: `prisma.$transaction()` para batch create/update

### Manejo de Errores

- **401:** Redirige a `/login`
- **400:** Retorna `{ ok: false, error: "mensaje" }`
- **500:** Retorna `{ ok: false, error: "Error interno" }` + `console.error()`
- **Toasts:** `showError()`, `showSuccess()` en frontend (react-hot-toast)

---

## G. PERFORMANCE / ESCALA

### Paginación

- **Listado:** `PAGE_SIZE = 25` (hardcodeado en `listar/route.js`)
- **Preview precios:** Sin paginación (trae todos los productos del proveedor)
- **Historial:** `take: 100` (hardcodeado)

### Filtros

- **Server-side:** Todos los filtros (search, categoria, proveedor, area, activo) se aplican en `WHERE` de Prisma
- **Client-side:** Solo ordenamiento de columnas y selección de items en preview

### Índices

- `ProductoBase`: `@@index([grupoId])`, `@@index([proveedor_id])`, `@@index([categoria_id])`
- **Falta:** `@@index([grupoId, proveedor_id])` compuesto

### Queries Pesadas

- `listar/route.js`: `include` con `categoria`, `proveedor`, `area_fisica`, `locales` (puede ser lento con muchos productos)
- `preview/route.js`: `findMany` sin paginación (puede traer 1000+ productos)

### Problemas Típicos

- **N+1:** No detectado (usa `include` correctamente)
- **Re-render:** `useEffect` con dependencias correctas
- **useEffect mal:** Dependencias correctas en general

---

## H. MULTI-LOCAL / MULTI-GRUPO (CRÍTICO)

### Scoping por grupoId

✅ **Correcto:**
- `ProductoBase`: `grupoId` obligatorio, todas las queries filtran por `grupoId`
- `PrecioUpdate`: `grupoId` obligatorio
- APIs validan `grupoId` desde `session.grupoId`

✅ **Correcto:**
- `app/api/productos/listar/route.js`: Obtiene `grupoId` desde `localId` vía `getGrupoIdDeLocal()`
- `app/api/productos/precios/preview/route.js`: Valida `grupoId` desde session
- `app/api/productos/precios/apply/route.js`: Valida `grupoId` y lo usa en `updateMany`

### Scoping por localId

✅ **Correcto:**
- `ProductoLocal`: `localId` obligatorio, `@@unique([localId, baseId])`
- `app/api/productos/listar/route.js`: `localId` requerido en query, filtra `locales` por `localId`
- `app/api/productos/obtener/route.js`: `localId` requerido, retorna override local si existe

❌ **BUG:**
- `app/api/productos/precios/apply/route.js`: NO actualiza `ProductoLocal`, solo `ProductoBase`
- Si hay overrides locales, los precios no se reflejan

### Contexto Activo

✅ **Correcto:**
- `useContextoActivo()` proporciona `localId` y `grupoId`
- Todas las APIs requieren `localId` explícito (no confían en headers)

### Lugares donde falta grupoId o localId

❌ **BUG:**
- `app/api/productos/precios/apply/route.js`: No sincroniza `ProductoLocal` después de actualizar `ProductoBase`
- Si un local tiene override de precios, la actualización masiva no lo afecta

---

## FIN DEL MAPEO


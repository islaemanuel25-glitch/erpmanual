# MAPEO Y PLAN DE CAMBIOS — Nuevo Producto (modal → página) + 3 proveedores opcionales

**Proyecto:** ERP Azul (Next.js App Router + Prisma + Postgres)  
**Alcance:** Mapeo actual + propuestas de estructura y archivos a tocar. **Sin implementar código final.**

---

## A) MAPEO ACTUAL (UI → Hook → API → DB)

### A.1 Dónde está el modal de “crear producto”

| Concepto | Ruta / archivo exacto |
|----------|------------------------|
| **Página que abre el modal (flujo principal)** | `app/modulos/productos/page.jsx` |
| **Condición de apertura** | Query `nuevo=1` → `useEffect` setea `setModalOpen(true)` y `setEditing(null)`. Botón “+ Nuevo producto” llama `abrirNuevo()` que hace `router.push("/modulos/productos?nuevo=1")`. |
| **Componente modal** | `components/productos/ModalProductoFinal.jsx` (export default `ModalProducto`). |
| **Form** | No hay componente form separado: el formulario está **dentro** de `ModalProductoFinal.jsx` (estado `form`, `setField`, validación y submit en el mismo archivo). |

**Otras rutas que también usan el mismo modal:**

- `app/modulos/productos/(acciones)/nuevo/page.jsx` — Página dedicada “nuevo”: renderiza `<ModalProducto open={true} ... />` y no redirige por query; usa `handleSubmit` que llama `POST /api/productos/crear?localId=`.
- `app/modulos/productos/editar/[id]/page.jsx` — Edición por página: carga producto y renderiza `<ModalProducto initialData={initialData} ... />`; `handleSubmit` llama `PUT /api/productos/${id}?localId=` (ver nota en A.3 sobre ruta real).

### A.2 Hook o handler que guarda

| Dónde | Qué hace |
|-------|----------|
| **Listado principal (page.jsx)** | `handleSubmit` definido en el mismo `page.jsx` (no hay hook externo). Recibe `form` del modal; según `editing` arma URL y hace `fetch` POST crear o PUT editar; luego `cerrarModal()` y `fetchProductos()`. |
| **Página nuevo (acciones)** | `handleSubmit` en `app/modulos/productos/(acciones)/nuevo/page.jsx`: POST a crear, luego `router.push("/modulos/productos")`. |
| **Página editar** | `handleSubmit` en `app/modulos/productos/editar/[id]/page.jsx`: PUT a editar, luego `router.push("/modulos/productos")`. |
| **Modal** | `ModalProductoFinal` recibe `onSubmit` (ese handler) y desde su UI llama `onSubmit(form)` con el objeto form (campos en snake_case/camel según `camelToForm`). No hay hook tipo `useProductoForm`; toda la lógica de form está en el modal. |

No se usa ningún hook compartido para “guardar producto”; cada pantalla define su propio handler que llama al API correspondiente.

### A.3 Endpoint API para crear/editar y payload

| Acción | Ruta API | Archivo | Payload esperado (campos relevantes) |
|--------|----------|---------|--------------------------------------|
| **Crear** | `POST /api/productos/crear?localId=<number>` | `app/api/productos/crear/route.js` | Body: `nombre`, `descripcion`, `sku`, `codigo_barra`, `categoria_id`, **`proveedor_id`**, `area_fisica_id`, `unidad_medida`, `factor_pack`, `modo_pedido`, `peso_kg`, `volumen_ml`, `precio_costo`, `precio_venta`, `margen`, `precio_sugerido`, `iva_porcentaje`, `fecha_vencimiento`, `redondeo_100`, `activo`, `imagen_url`, `es_combo`, `modo_envio`, `modo_stock`. |
| **Editar** | `PUT /api/productos/editar/[id]?localId=<number>` | `app/api/productos/editar/[id]/route.js` | Mismo cuerpo; se usa `splitUiToDb(payload)` → `baseData` / `localData`. Para edición de base se actualiza `proveedor_id` desde `baseData.proveedor_id`. |

**Nota:** La página `editar/[id]/page.jsx` actualmente hace `fetch(\`/api/productos/${id}?localId=...\`)` para GET y PUT. La API real de edición es `PUT /api/productos/editar/[id]`. La de lectura es `GET /api/productos/obtener?id=&localId=`. Conviene alinear la página editar con esas rutas si no lo está ya.

### A.4 Prisma: modelo que guarda el producto y relación con proveedor

| Modelo | Uso | Campos relevantes actuales |
|--------|-----|-----------------------------|
| **ProductoBase** | Producto a nivel grupo (maestro). | `id`, `grupoId`, `creadoEnLocalId`, `nombre`, `descripcion`, `sku`, `codigo_barra`, **`proveedor_id`** (Int?, FK a Proveedor), `categoria_id`, `area_fisica_id`, `unidad_medida`, `factor_pack`, `modo_pedido`, `modo_envio`, `modo_stock`, `peso_kg`, `volumen_ml`, `precio_costo`, `precio_venta`, `margen`, `precio_sugerido`, `iva_porcentaje`, `fecha_vencimiento`, `redondeo_100`, `activo`, `imagen_url`, `es_combo`, `createdAt`, `updatedAt`. |
| **Proveedor** | Catálogo. | `id`, `nombre`, `cuit`, `telefono`, `email`, `direccion`, `activo`, etc. Relación: `ProductoBase.proveedor_id` → `Proveedor.id`. En schema: `proveedor Proveedor? @relation(fields: [proveedor_id], references: [id])` y `@@index([proveedor_id])`. |
| **ProductoLocal** | Instancia por local (precios/activo override). | No tiene campos de proveedor. |
| **StockLocal** | Stock por ProductoLocal. | No tiene proveedor. |

Hoy existe **un solo** proveedor por producto: `ProductoBase.proveedor_id` (nullable).

---

## B) PROPUESTA “MODAL → PÁGINA”

### B.1 Rutas nuevas propuestas

| Ruta | Propósito |
|------|-----------|
| `app/modulos/productos/nuevo/page.jsx` | Página “Nuevo producto” (form en página, no modal). Reemplaza o complementa el flujo `?nuevo=1` y la ruta `(acciones)/nuevo`. |
| `app/modulos/productos/[id]/editar/page.jsx` | Página “Editar producto” (form en página). Reemplaza o complementa `?editar=<id>` y la actual `editar/[id]`. |

Recomendación: usar **una** ruta canónica para nuevo (`/modulos/productos/nuevo`) y una para editar (`/modulos/productos/[id]/editar`), y desde el listado enlazar ahí en lugar de abrir modal por query. La ruta existente `(acciones)/nuevo` puede redirigir a `/modulos/productos/nuevo` para no romper bookmarks.

### B.2 Refactor mínimo: form reutilizable

| Concepto | Propuesta |
|----------|-----------|
| **Nombre del componente** | `FormProducto` (o `ProductoForm`). |
| **Ubicación sugerida** | `components/productos/FormProducto.jsx`. |
| **Contenido** | Extraer de `ModalProductoFinal.jsx`: estado `form`, `camelToForm`, `setField`, `setNumber`, lógica de costo/margen/redondeo, validación previa al submit, y todo el JSX de campos (nombre, descripción, categoría, proveedor(es), área, unidad, precios, etc.). El componente recibe: `initialData`, `catalogos`, `onSubmit`, `onCancel`, y opcionalmente `submitLabel` / `readOnly`. |
| **Modal** | `ModalProductoFinal.jsx` pasa a ser un wrapper: renderiza `FormProducto` dentro del modal y delega submit/cancel. Así el listado puede seguir abriendo “nuevo/editar en modal” si se desea, y las nuevas páginas solo usan `FormProducto` en layout de página (con header, breadcrumb, botón Volver). |

### B.3 Archivos a tocar (lista concreta)

| Archivo | Cambio / motivo |
|---------|------------------|
| `components/productos/ModalProductoFinal.jsx` | Extraer form a `FormProducto`; importar y usar ese componente; mantener misma API (open, onClose, onSubmit, catalogos, initialData, localId). |
| **Nuevo:** `components/productos/FormProducto.jsx` | Contener todo el form (estado, campos, validación, submit). Reutilizable en modal y en páginas. |
| **Nuevo:** `app/modulos/productos/nuevo/page.jsx` | Página “Nuevo producto”: layout (título, Volver), carga catálogos (mismo patrón que modal o que `(acciones)/nuevo`), `FormProducto` con `onSubmit` → POST crear y redirección a listado. Usar `useContextoActivo` o equivalente para `localId`. |
| **Nuevo:** `app/modulos/productos/[id]/editar/page.jsx` | Página “Editar producto”: layout, carga producto (GET obtener) + catálogos, `FormProducto` con `initialData` y `onSubmit` → PUT editar y redirección. |
| `app/modulos/productos/page.jsx` | Cambiar “+ Nuevo producto” para que navegue a `/modulos/productos/nuevo` en lugar de `?nuevo=1` (o ofrecer ambas: enlace a página y/o abrir modal). Si se elimina el flujo modal para nuevo, quitar el `useEffect` que reacciona a `nuevo===1` y el `<ModalProducto>` para nuevo; si se mantiene, dejar modal usando `FormProducto`. |
| `app/modulos/productos/page.jsx` | Para editar: cambiar “Editar” en fila para que navegue a `/modulos/productos/[id]/editar` (o seguir abriendo modal con `?editar=id` según decisión). |
| `app/modulos/productos/(acciones)/nuevo/page.jsx` | Opcional: redirigir a `/modulos/productos/nuevo` (redirect 308 o componente que haga `router.replace`) para no duplicar lógica. |
| `app/modulos/productos/editar/[id]/page.jsx` | Opcional: redirigir a `/modulos/productos/[id]/editar` o dejar de usar; si se unifica en `[id]/editar`, corregir aquí la URL del API a `GET /api/productos/obtener?id=&localId=` y `PUT /api/productos/editar/[id]?localId=` antes de cualquier refactor. |

No tocar middleware; no renombrar tablas ni modelos.

---

## C) PROPUESTA “3 PROVEEDORES OPCIONALES”

### C.1 Confirmación de relación actual

- **Sí existe:** `ProductoBase.proveedor_id` (Int?, FK a `Proveedor`). Un solo proveedor por producto.
- Uso: crear (body `proveedor_id`), editar (baseData.proveedor_id), listar (include proveedor, filtro por proveedor_id), export/import (proveedor/proveedorId), precios (proveedorId). Mapper: `lib/mappers/producto.js` usa `proveedor_id` / `proveedorId`.

### C.2 Migración Prisma mínima

- **Modelo:** `ProductoBase` (no crear nuevo modelo).
- **Agregar columnas (todas opcionales):**
  - `proveedor2_id Int?`
  - `proveedor3_id Int?`
  - Mantener `proveedor_id` como “proveedor 1” (o renombrar conceptualmente en documentación a “proveedor principal”; no renombrar la columna en DB para no romper).
- **Relaciones:**  
  - `proveedor Proveedor? @relation(...)` ya existe.  
  - Agregar en **ProductoBase:** `proveedor2 Proveedor? @relation("Proveedor2", fields: [proveedor2_id], references: [id])` y `proveedor3 Proveedor? @relation("Proveedor3", fields: [proveedor3_id], references: [id])`.  
  - En **Proveedor** hay que añadir las dos relaciones inversas con el mismo nombre: `productosProveedor2 ProductoBase[] @relation("Proveedor2")` y `productosProveedor3 ProductoBase[] @relation("Proveedor3")`. La relación actual `productos ProductoBase[]` queda para `proveedor_id`.
- **Índices:** `@@index([proveedor2_id])`, `@@index([proveedor3_id])` para filtros/listados por proveedor secundario si se usan.
- **Migración:** un único `prisma migrate dev` con nombre ej. `add_producto_proveedor2_proveedor3`.

### C.3 Cambios en API (create/update)

| Archivo | Cambio |
|---------|--------|
| `app/api/productos/crear/route.js` | En `baseData` aceptar `proveedor_id` (actual) y añadir `proveedor2_id`, `proveedor3_id` (num(body.proveedor2_id), num(body.proveedor3_id)). Validación opcional: los tres ids distintos si se envían. |
| `app/api/productos/editar/[id]/route.js` | En `dataFinal` (editarBase) incluir `proveedor2_id` y `proveedor3_id` desde baseData (mismo patrón que categoria_id/proveedor_id). |
| `lib/mappers/producto.js` | En `mergeBaseLocalToUi`: exponer `proveedor2Id`, `proveedor3Id` (y opcionalmente nombres si se incluyen en include). En `splitUiToDb`: mapear `proveedor2_id`, `proveedor3_id` desde payload. |

No cambiar el contrato de listar/filtros en la primera iteración: el filtro por “proveedor” puede seguir siendo por `proveedor_id`; luego se puede ampliar a “cualquiera de los 3” si se desea.

### C.4 Cambios en UI (3 selects) y validación anti-duplicados

| Archivo | Cambio |
|---------|--------|
| `components/productos/FormProducto.jsx` (o `ModalProductoFinal.jsx` si no se extrae aún) | Reemplazar un único select “Proveedor” por tres: “Proveedor 1”, “Proveedor 2”, “Proveedor 3” (todos opcionales). Cada uno con opción vacía “-” y lista de `catalogos.PROVEEDORES`. Estado: `proveedor_id`, `proveedor2_id`, `proveedor3_id`. |
| Validación anti-duplicados | En submit (client) y/o en API: si se envían dos o tres ids, comprobar que no sean iguales (ej. proveedor_id !== proveedor2_id, etc.). Mensaje claro: “No podés elegir el mismo proveedor más de una vez”. |

Backend: en crear/editar, ignorar o rechazar si algún id duplicado; en validación mínima, rechazar body con dos ids iguales.

---

## D) CHECKLIST DE IMPACTO

### D.1 Pantallas / listados que muestran proveedor

| Pantalla / flujo | Uso de proveedor | Impacto si se agregan 3 proveedores |
|------------------|------------------|-------------------------------------|
| Listado productos (`app/modulos/productos/page.jsx` + `SunmiTablaProductos`) | Columna “Proveedor” (proveedorId / proveedorNombre) | Decisión: seguir mostrando solo “proveedor principal” (proveedor_id) o mostrar “Proveedor 1, 2, 3” o “Proveedor 1; 2; 3”. Afecta `mergeBaseLocalToUi` y/o el componente de tabla (DEFINICIONES proveedorId). |
| Export Excel (`app/api/productos/export/route.js`) | Incluye columna proveedor (nombre). Filtro por proveedorId. | Opcional: añadir columnas proveedor2, proveedor3 en Excel; filtro “proveedor” puede seguir siendo por proveedor_id o ampliarse. |
| Import preview/apply (`app/api/productos/import/preview/route.js`, `apply/route.js`) | Un solo proveedor por fila (proveedor / proveedorId). | Opcional: en formato Excel permitir columnas proveedor2, proveedor3 y mapear a proveedor2_id, proveedor3_id en apply. |
| Actualización de precios (preview/apply/parse) | Filtran por proveedorId (un proveedor). | Sin cambio obligatorio: siguen por “proveedor principal” (proveedor_id). |
| Filtros en listado (FiltrosProductos) | Filtro por proveedor (un id). | Mantener filtro por un proveedor (proveedor_id); o ampliar después a “cualquiera de los 3”. |

### D.2 Seeds / migraciones / queries a ajustar

| Qué | Acción |
|-----|--------|
| **Seeds** | `prisma/seed.js` no crea ProductoBase ni asigna proveedores; no hay cambio obligatorio. Si en el futuro se agregan productos en seed, incluir opcionalmente proveedor2_id/proveedor3_id. |
| **Migraciones** | Una nueva migración: añadir columnas e índices (y relaciones) en ProductoBase; en Proveedor, añadir las dos relaciones inversas con nombres distintos. |
| **Queries existentes** | Donde se hace `include: { proveedor: ... }` (listar, obtener, export), añadir `proveedor2`, `proveedor3` si se quieren mostrar en UI/export. Mapper y DTOs actualizar para esos campos. |

### D.3 Riesgos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Romper listado o edición actual | Mantener `proveedor_id` y solo añadir columnas opcionales; mapper y API aceptan los nuevos campos sin obligar su uso. |
| Duplicados en los 3 proveedores | Validación en front y en API: rechazar dos o tres ids iguales. |
| Performance en listado | Incluir solo los nombres necesarios (select id, nombre para proveedor, proveedor2, proveedor3); índices en proveedor2_id/proveedor3_id. |
| Import/export con formato antiguo | Import: si no vienen proveedor2/proveedor3, dejar null. Export: se puede seguir exportando una columna “Proveedor” (principal) y opcionalmente dos más. |
| Rutas antiguas (nuevo=1, editar/[id]) | Mantener redirecciones o el modal que use el mismo FormProducto hasta decidir deprecar; no borrar de golpe. |

---

## Resumen de paths exactos

- **Modal y form actuales:** `app/modulos/productos/page.jsx`, `app/modulos/productos/(acciones)/nuevo/page.jsx`, `app/modulos/productos/editar/[id]/page.jsx`, `components/productos/ModalProductoFinal.jsx`.
- **API:** `app/api/productos/crear/route.js`, `app/api/productos/editar/[id]/route.js`, `app/api/productos/obtener/route.js`.
- **Mapper:** `lib/mappers/producto.js`.
- **Prisma:** `prisma/schema.prisma` (modelos ProductoBase, Proveedor).
- **Listado y tabla:** `app/modulos/productos/page.jsx`, `components/productos/SunmiTablaProductos.jsx`, `app/api/productos/listar/route.js`.
- **Export/import:** `app/api/productos/export/route.js`, `app/api/productos/import/preview/route.js`, `app/api/productos/import/apply/route.js`.

**Salida:** Este informe en markdown con secciones A/B/C/D y paths exactos. Sin implementación de código final.

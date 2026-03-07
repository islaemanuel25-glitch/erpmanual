# Auditoría técnica — Módulo Productos (ERP Azul)

**Alcance:** Módulo Productos. Sin implementación; solo diagnóstico, mapa de flujo y plan de cambios mínimos.

---

## 1. Resumen ejecutivo

En el módulo Productos ocurre lo siguiente:

- **Listado:** Depende solo de estado en memoria (React state). No se lee orden, página ni búsqueda desde la URL ni desde localStorage al cargar.
- **Orden por defecto:** Está fijado en código como `sortKey: "createdAt"`, `sortDir: "desc"`. No hay orden inicial por nombre A–Z.
- **Persistencia:** Solo se persiste `visibleCols` en `localStorage` ("productosCols"). `page`, `pageSize`, `sortKey`, `sortDir` y `filtros` no se guardan ni se restauran.
- **Navegación editar → volver:** Al editar se usa `router.push("/modulos/productos/{id}/editar")`. Al volver, `router.push("/modulos/productos")` sin query. La página de listado se monta de nuevo con estado inicial (página 1, orden por defecto, búsqueda vacía).
- **Buscador:** El API de listado ya busca por nombre, código de barra y SKU (OR con `contains`). POS Ventas además prioriza match exacto por código de barra y usa otro modelo (ProductoLocal). El comportamiento del buscador en Productos es distinto al del POS (sin prioridad “código exacto primero”) y la UX no está alineada.

**Causa raíz única:** El estado del listado (página, orden, búsqueda, filtros) vive solo en React state y no se persiste en URL ni en almacenamiento; al navegar a otra ruta el componente se desmonta y al volver se reinicia todo.

---

## 2. Mapa UI → Estado → API → DB (Módulo Productos)

```
[Usuario]
    │
    ▼
/modulos/productos (page.jsx)
    │
    ├─ useSearchParams() ──► solo lee: nuevo, editar (para modal)
    ├─ useState: page, pageSize, totalPages, totalItems, sortKey, sortDir, filtros, rows, loading, visibleCols, catalogos, modalOpen, editing…
    ├─ useContextoActivo() ──► localId (para API)
    │
    ├─ Efecto: fetchCatalogos() una vez
    ├─ Efecto: fetchProductos() cuando [page, pageSize, sortKey, sortDir, filtros, localId]
    │       │
    │       ▼
    │   GET /api/productos/listar?page=&pageSize=&sortKey=&sortDir=&q=&categoriaId=&proveedorId=&areaFisicaId=&activo=&localId=
    │       │
    │       ▼
    │   Prisma: ProductoBase (where grupoId + filtros, orderBy, skip/take)
    │
    ├─ FiltrosProductos: filtros.search, categoria, proveedor, area, activo → onChange → setFiltros + setPage(1)
    ├─ SunmiTablaProductos: onSort → setSortKey/setSortDir/setPage(1); onEditar → abrirEditar(id)
    │
    └─ abrirEditar(id) ──► router.push("/modulos/productos/{id}/editar")
                                │
                                ▼
                    [Página editar montada; listado desmontado]
                                │
                    handleCancel / después de guardar ──► router.push("/modulos/productos")
                                │
                                ▼
                    [Listado montado de nuevo con estado inicial]
```

- **No hay** lectura de `page`, `sortKey`, `sortDir`, `q` (búsqueda) ni filtros desde la URL al montar.
- **No hay** escritura de esos valores en la URL al cambiar página/orden/filtros.
- **localStorage:** solo `productosCols` (columnas visibles). Nada para listado.

---

## 3. Archivos exactos involucrados

| Archivo | Rol | Estado que controla / afecta |
|--------|-----|------------------------------|
| **app/modulos/productos/page.jsx** | Página principal del listado. Orquesta estado, fetch, filtros, tabla, modales y navegación. | page, pageSize, sortKey, sortDir, filtros, rows, totalPages, totalItems, visibleCols (persiste en localStorage), modalOpen, editing. Lee de URL solo `nuevo` y `editar`. No persiste ni restaura page/sort/filtros. |
| **components/productos/FiltrosProductos.jsx** | Filtros (búsqueda + categoría, proveedor, área, activo). | Estado local: search, categoria, proveedor, area, activo. Debounce 250 ms → onChange hacia el padre. No persiste; recibe `initial` del padre. |
| **components/productos/SunmiTablaProductos.jsx** | Tabla con paginación, orden por columnas, acciones editar/eliminar. | Presentacional: recibe sortKey, sortDir, onSort, page, onNext/onPrev, onEditar. No tiene estado propio de listado. |
| **components/productos/ColumnManager.jsx** | Selector de columnas visibles. | Llama a handleVisibleColsChange en la página. La página persiste en localStorage. |
| **app/api/productos/listar/route.js** | API del listado. | Acepta page, pageSize, sortKey, sortDir, q, categoriaId, proveedorId, areaFisicaId, activo, localId. Default sortKey = "createdAt", sortDir = "desc". Búsqueda: OR(nombre, codigo_barra, sku) contains. |
| **app/modulos/productos/[id]/editar/page.jsx** | Página de edición (ruta por id). | Al "Volver" o tras guardar: router.push("/modulos/productos") sin query. No recibe ni devuelve estado del listado. |
| **app/modulos/productos/editar/[id]/page.jsx** | Otra ruta de edición (editar/id). | Misma idea: vuelve con router.push("/modulos/productos"). |
| **hooks/useContextoActivo.js** | Contexto operativo (local/depósito). | Proporciona localId usado en listar y filtros. No afecta persistencia del listado. |

No hay hook dedicado de “datos del listado”; el fetch está en la página dentro de `fetchProductos` y un `useEffect` que depende de page, pageSize, sortKey, sortDir, filtros, localId.

---

## 4. Fase 1 — Mapeo del módulo Productos (detalle)

### 4.1 Página principal del listado

- **Archivo:** `app/modulos/productos/page.jsx`
- **Estado inicial relevante:**
  - `page = 1`
  - `sortKey = "createdAt"`
  - `sortDir = "desc"`
  - `filtros = { search: "", categoria: "", proveedor: "", area: "", activo: "" }`
- **URL:** Solo se lee `searchParams.get("nuevo")` y `searchParams.get("editar")`. No se lee page, sortKey, sortDir ni filtros.
- **Efecto:** `useEffect(() => { fetchProductos(); }, [page, pageSize, sortKey, sortDir, filtros, localId]);` — cada cambio de esos valores dispara un nuevo fetch.

### 4.2 Componente de tabla / listado

- **Archivo:** `components/productos/SunmiTablaProductos.jsx`
- **Rol:** Renderiza filas, cabeceras ordenables, paginación (next/prev, page size). Llama a `onSort(key)`, `onEditar(id)`, `onEliminar(id)`.
- **Estado:** No guarda página ni orden; todo viene por props desde la página.

### 4.3 Fetch / API de listado

- **Archivo:** `app/api/productos/listar/route.js`
- **Query params:** page, pageSize, sortKey, sortDir, q, categoriaId, proveedorId, areaFisicaId, activo, localId.
- **Defaults:** sortKey = "createdAt", sortDir = "desc" (si no se envían).
- **Ordenamiento:** Whitelist SORT_FIELDS (nombre, codigoBarra, precioCosto, etc.) → orderBy Prisma.
- **Búsqueda:** `q` → OR con contains (mode: insensitive) sobre nombre, codigo_barra, sku.

### 4.4 Búsqueda

- **UI:** `FiltrosProductos` — input de búsqueda + filtros avanzados. Valor en `filtros.search`.
- **Flujo:** Usuario escribe → debounce 250 ms → onChange → setFiltros en página → setPage(1) → useEffect dispara fetchProductos con nuevo `filtros.search` que llega como `q` al API.
- **API:** Ya soporta búsqueda por nombre, código y SKU. No hay prioridad “código exacto primero” como en POS.

### 4.5 Paginación

- **Estado en página:** page, pageSize, totalPages, totalItems. Se actualizan con setPage, setPageSize y con la respuesta del API.
- **No se persiste:** Al desmontar la página (por ejemplo al ir a editar) se pierde.

### 4.6 Ordenamiento

- **Estado en página:** sortKey, sortDir. Al hacer clic en columna: onSort → setSortKey/setSortDir y setPage(1).
- **No se persiste:** No se escribe en URL ni en localStorage. Al volver a la página, se usan de nuevo los valores iniciales (createdAt, desc).

### 4.7 Navegación listado → editar → volver

- **Ir a editar:** `abrirEditar(id)` → `router.push("/modulos/productos/" + id + "/editar")`. Ruta distinta: el componente de la listado se desmonta.
- **Volver:** En `app/modulos/productos/[id]/editar/page.jsx`, handleCancel y tras guardar → `router.push("/modulos/productos")`. Sin query params.
- **Efecto:** Al montar de nuevo la listado, todos los useState vuelven a sus valores iniciales (page 1, sortKey createdAt, sortDir desc, filtros vacíos).

### 4.8 Persistencia de estado

- **Existente:** Solo `visibleCols` → localStorage clave "productosCols", leído en el inicializador de useState y escrito en un useEffect al cambiar visibleCols.
- **No existe:** Persistencia de page, pageSize, sortKey, sortDir, filtros (search, categoria, proveedor, area, activo) ni en URL ni en localStorage/sessionStorage. No hay Zustand ni contexto global para el listado.

---

## 5. Fase 2 — POS Ventas como referencia

### 5.1 Buscador POS

- **Componente:** `components/pos-ventas/BuscadorProductos.jsx`
- **API:** `GET /api/pos-ventas/buscar-producto?q=...&localId=...`
- **Lógica API:**
  1. Match exacto por `codigo_barra` (ProductoLocal + base). Si hay resultado, se devuelve ese y se termina.
  2. Si no, búsqueda por nombre / código con OR (nombre contains, base.nombre contains, base.codigo_barra contains), limit 10.
- **Debounce:** 300 ms en escritura manual (setTimeout en handleChange).
- **Scanner:** Detección de Enter rápido + buffer para códigos de barras.
- **Estado:** query y resultados en estado local del componente. No hay “listado” que conservar; es una sola pantalla POS.

### 5.2 Persistencia y contexto en POS

- POS no tiene listado paginado que “volver a abrir”. Tiene turno, carrito, modal de ticket, etc. El “buscador” es un input que no necesita restaurar estado al navegar.
- No usa query params para búsqueda ni orden. No es un patrón directo de “persistir listado en URL”.

### 5.3 Qué sí sirve de POS para Productos

- **Búsqueda:** Prioridad “código exacto primero” y luego nombre/código (contains). En Productos el API actual hace solo OR contains sin prioridad; se puede alinear la lógica de búsqueda (o al menos la prioridad por código) en el backend de listar o en un endpoint único.
- **Debounce:** POS 300 ms, Productos 250 ms en FiltrosProductos. Ya hay debounce en Productos; solo falta alinear criterio de búsqueda (nombre/código/código exacto).

---

## 6. Fase 3 — Causa raíz por problema

### 6.1 “Orden inconsistente” / “no arranca por nombre A–Z”

- **Causa:** En `app/modulos/productos/page.jsx` el estado inicial es `sortKey: "createdAt"`, `sortDir: "desc"`. El API en `app/api/productos/listar/route.js` usa por defecto `sortKey = "createdAt"`, `sortDir = "desc"` cuando no se envían.
- **Consecuencia:** El listado arranca siempre por “más recientes primero”, no por nombre A–Z. Si en algún momento se usara otro orden por defecto en el front sin persistirse, al recargar o volver se vería el “salto” a createdAt desc.
- **Causa raíz:** Orden por defecto fijado en código (front y back) a createdAt desc; no hay orden por defecto “nombre asc” ni lectura de preferencia guardada.

### 6.2 “No guarda el orden elegido por columna”

- **Causa:** sortKey y sortDir solo viven en React state. No se escriben en la URL ni en localStorage. Al salir del módulo (o recargar) el componente se desmonta o se reinicia y el estado se pierde.
- **Causa raíz:** Falta de persistencia (URL o localStorage) para sortKey y sortDir.

### 6.3 “Pierde la página actual al editar y volver”

- **Causa:** Navegación a `/modulos/productos/{id}/editar` desmonta la página de listado. Al volver con `router.push("/modulos/productos")` sin query, la página de listado se monta de nuevo y todos los useState se inicializan (page = 1, etc.).
- **Causa raíz:** No se conserva la página (ni el resto del estado) en la URL ni en otro almacenamiento, y la ruta de edición no recibe ni devuelve ese estado.

### 6.4 “Pierde búsqueda / filtros / sort al navegar”

- **Misma causa que 6.2 y 6.3:** Todo el estado del listado (page, sortKey, sortDir, filtros) es solo estado en memoria. Cualquier montaje “en frío” de la página (entrar al módulo, volver desde editar, recargar) usa los valores iniciales.
- **Causa raíz:** Ningún mecanismo (URL o localStorage) para guardar y restaurar page, sortKey, sortDir y filtros.

### 6.5 “Buscador no se comporta como POS”

- **Comportamiento actual en Productos:** Un solo parámetro `q` → OR(nombre, codigo_barra, sku) con contains. Sin prioridad para código exacto.
- **Comportamiento en POS:** Primero búsqueda exacta por codigo_barra; si no hay resultado, búsqueda por nombre/código (contains). Además POS usa ProductoLocal (por local) y limit bajo; Productos usa ProductoBase por grupo y paginación.
- **Causa raíz:** Lógica de búsqueda distinta en el backend (listar vs buscar-producto) y posiblemente UX distinta (un input con debounce vs input + prioridad código). Para “equivalente” hace falta alinear: al menos prioridad “código exacto” en listar o documentar la diferencia y, si se quiere, unificar criterio (nombre/código) entre ambos.

---

## 7. Fase 4 — Plan técnico de implementación (sin código)

### 7.1 Objetivos

1. Orden por defecto: nombre ASC (A–Z) al abrir el módulo, salvo que exista preferencia persistida.
2. Persistir y restaurar: sortField, sortDirection, y opcionalmente page, pageSize, filtros (búsqueda, categoría, etc.).
3. Al volver desde editar: conservar página, búsqueda, orden y filtros.
4. Buscador alineado con POS: mismo criterio (nombre/código; prioridad código exacto si se desea).

### 7.2 Dónde persistir

- **Recomendación:** URL (query params) como fuente de verdad para página, orden y filtros. Ventajas: se puede compartir enlace, refrescar mantiene estado, y “volver” puede construirse con la misma URL que tenía el listado.
- **Alternativa:** localStorage (clave tipo "productosListado") para sortKey, sortDir, pageSize y quizá última búsqueda/filtros. Menos bueno para “página actual” (que depende del total de ítems) y para “volver desde editar con la misma página”.

Plan concreto sugerido:

- **URL:** Inicializar y actualizar `page`, `sortKey`, `sortDir`, `q` (filtros.search), y si se desea `categoriaId`, `proveedorId`, `areaFisicaId`, `activo` (o nombres estables) en query params. Al montar la página, leer esos params y usarlos como estado inicial (con defaults: sortKey=nombre, sortDir=asc, page=1, q="", etc.).
- **Navegación a editar:** En lugar de `router.push("/modulos/productos/" + id + "/editar")`, usar `router.push("/modulos/productos/" + id + "/editar?" + currentQueryString)` para pasar el estado actual del listado. La página de edición, al “Volver”, usa esa query (o la guarda en sessionStorage/estado y construye `/modulos/productos?...)` para volver con la misma URL.
- **Persistencia opcional de “preferencia”:** Si se quiere que “orden preferido” sobreviva a cerrar pestaña, se puede guardar en localStorage solo sortKey y sortDir (y opcionalmente pageSize) y usarlos como default cuando la URL no trae sort. La URL seguiría teniendo prioridad cuando exista.

### 7.3 Orden por defecto A–Z

- En `page.jsx`: estado inicial de sortKey/sortDir debe ser "nombre" y "asc". Si se lee desde URL, usar esos valores cuando vengan; cuando no vengan, usar "nombre" y "asc" (no "createdAt" ni "desc").
- En `app/api/productos/listar/route.js`: cambiar defaults a sortKey = "nombre", sortDir = "asc" cuando no se envíen (opcional pero coherente con el front).

### 7.4 Conservar contexto al editar y volver

- **Opción A (recomendada):** Estado del listado en la URL. Al ir a editar, hacer por ejemplo `router.push(\`/modulos/productos/${id}/editar?returnTo=...\`)` donde `returnTo` sea la query string actual del listado (page, sortKey, sortDir, q, etc.), codificada si hace falta. En la página de edición, “Volver” = `router.push("/modulos/productos?" + returnTo)`.
- **Opción B:** Guardar en sessionStorage antes de ir a editar (clave "productosListadoState") el objeto { page, sortKey, sortDir, filtros }. Al montar la página de listado, si hay esa clave, leerla, aplicarla al estado (o a la URL) y borrarla. Así el “volver” puede ser solo `router.push("/modulos/productos")` y la página al montar restaura desde sessionStorage.
- La opción A permite además enlaces directos a “página 5 ordenada por nombre” sin depender de sessionStorage.

### 7.5 Buscador alineado con POS

- **Backend:** En `app/api/productos/listar/route.js`, si se quiere el mismo criterio que POS:
  - Si `q` tiene valor: primero intentar match exacto por codigo_barra (y quizá sku) en el grupo; si hay resultados, devolverlos (y opcionalmente marcar que es “exacto”). Si no, seguir con el OR actual (nombre, codigo_barra, sku) contains. No hace falta cambiar el contrato del endpoint; solo el orden de las consultas y la prioridad.
- **Frontend:** Mantener un solo input de búsqueda y debounce; el cambio es solo qué devuelve el API (prioridad código). Si el placeholder dice “código o nombre”, ya está alineado en mensaje; la diferencia es solo la lógica del servidor.
- **Archivos a tocar para búsqueda:** Solo `app/api/productos/listar/route.js` (y opcionalmente documentar en FiltrosProductos que la búsqueda prioriza código de barra exacto).

### 7.6 Riesgos y edge cases

- **URL larga:** Muchos filtros pueden hacer la URL larga. Usar nombres cortos de params (p, s, d, q, cat, prov, etc.) y valores acotados.
- **Valores inválidos:** Al leer de la URL, validar page (≥ 1), sortKey (whitelist), sortDir (asc/desc). Si algo es inválido, usar default sin romper la UI.
- **Dos rutas de edición:** Existe `productos/[id]/editar` y `productos/editar/[id]`. Confirmar cuál se usa desde el listado (en el código actual es `productos/${id}/editar`) y aplicar el “returnTo” o sessionStorage solo en esa.
- **Modal editar por URL:** Hoy `?editar=123` abre el modal en la misma página; no desmonta el listado. Si se mantiene ese flujo para algunos accesos, el estado no se pierde. El problema es solo cuando se navega a la ruta `/productos/:id/editar`.

### 7.7 Lista de archivos a tocar (plan mínimo)

| Archivo | Cambio |
|--------|--------|
| **app/modulos/productos/page.jsx** | (1) Inicializar sortKey/sortDir desde URL o default "nombre"/"asc". (2) Sincronizar page, sortKey, sortDir, filtros con la URL (lectura al montar, escritura al cambiar). (3) Al llamar a abrirEditar, pasar la query actual (o guardar estado en sessionStorage) para poder volver con contexto. |
| **app/modulos/productos/[id]/editar/page.jsx** | (1) Leer query de retorno (returnTo o params) o sessionStorage. (2) En handleCancel y tras guardar, navegar a `/modulos/productos?{query}` con esa query en lugar de solo `/modulos/productos`. |
| **app/api/productos/listar/route.js** | (1) Opcional: default sortKey = "nombre", sortDir = "asc". (2) Opcional: prioridad búsqueda por código exacto (consulta exacta por codigo_barra antes del OR contains). |
| **components/productos/FiltrosProductos.jsx** | Opcional: si el padre pasa `initial` desde URL, ya reflejará la búsqueda restaurada; puede no requerir cambios si la página controla todo desde URL. |

### 7.8 Archivos a no tocar (sin cambios de comportamiento)

- **components/productos/SunmiTablaProductos.jsx** — Solo recibe props; no necesita saber de URL ni persistencia.
- **components/productos/ColumnManager.jsx** — Sigue con localStorage para columnas.
- **app/modulos/productos/editar/[id]/page.jsx** — Si no se usa desde el listado, se puede dejar igual o aplicar el mismo criterio de “volver con query” si se usa en el futuro.
- **app/modulos/productos/nuevo/page.jsx** — Misma idea: si al volver se quiere conservar listado, se puede usar la misma URL con query; no es obligatorio en la primera iteración.
- **hooks/useContextoActivo.js**, **lib/grupos.js**, **API catalogos** — Sin cambios para esta mejora.

---

## 8. Lista final

### Archivos a tocar (para el plan mínimo)

1. **app/modulos/productos/page.jsx** — Inicialización desde URL, sincronización estado ↔ URL, pasar contexto al ir a editar.
2. **app/modulos/productos/[id]/editar/page.jsx** — Volver a listado con query (returnTo o sessionStorage).
3. **app/api/productos/listar/route.js** — Default orden nombre/asc; opcional prioridad código exacto en búsqueda.

### Archivos a no tocar

- components/productos/SunmiTablaProductos.jsx  
- components/productos/ColumnManager.jsx  
- components/productos/FiltrosProductos.jsx (salvo pequeños ajustes si el padre pasa initial desde URL)  
- app/modulos/productos/nuevo/page.jsx  
- app/modulos/productos/editar/[id]/page.jsx (a menos que se decida unificar flujo de edición)  
- hooks, contextos, otros APIs.

---

**Documento solo de auditoría; no incluye implementación ni cambios de código.**

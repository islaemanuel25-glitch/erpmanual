# Auditoría técnica — Nuevo módulo "Edición rápida de productos" (ERP Azul)

**Alcance:** Evaluar arquitectura para un módulo de edición masiva rápida de productos. Sin implementación; solo diagnóstico y recomendación.

---

# 1. RESUMEN EJECUTIVO

Conviene implementar un **módulo nuevo separado** (por ejemplo `/modulos/productos/edicion-rapida`), reutilizando al máximo lo que ya existe: **API listar** (paginado, filtros, orden), **API editar** (PUT por producto con payload completo), **FiltrosProductos** (o variante), **ColumnManager** (columnas configurables), **SunmiTable + filas con SunmiInput** (patrón ya usado en Actualización de precios), **catálogos** (categorías, proveedores, áreas) y **permisos** (productos.ver / productos.editar). No existe hoy un grid editable inline genérico; el patrón más cercano es la tabla de Actualización de precios (SunmiTable + celdas con SunmiInput). La edición por producto se puede hacer enviando el objeto completo de la fila (merge en front del valor editado) al PUT existente, sin nuevo endpoint; opcionalmente más adelante un PATCH o bulk. Fase 1: módulo nuevo, listado paginado con filtros, columnas configurables, tabla con celdas editables (proveedor, factor_pack, categoría, área, etc.) y guardado por fila o por celda (debounce) llamando al PUT actual. Fase 2: “solo incompletos”, selección múltiple y aplicar valor a varias filas. Fase 3: voz en celda activa (reutilizando SpeechRecognition ya usado en FiltrosProductos/POS). Así se logra velocidad operativa sin tocar el módulo Productos actual ni las APIs existentes, con cambios acotados y mantenibles.

---

# 2. MAPA DEL MÓDULO PRODUCTOS ACTUAL

## Archivos relevantes

| Archivo | Rol |
|--------|-----|
| **app/modulos/productos/page.jsx** | Página principal: estado (page, pageSize, sortKey, sortDir, filtros, rows, visibleCols), fetchProductos, FiltrosProductos, ColumnManager, SunmiTablaProductos. Navega a editar con router.push(`/modulos/productos/${id}/editar`). |
| **components/productos/FiltrosProductos.jsx** | Búsqueda (debounce 250 ms), categoría, proveedor, área, activo. onChange → setFiltros en padre. Soporte voz (SpeechRecognition) para búsqueda. |
| **components/productos/SunmiTablaProductos.jsx** | Tabla presentacional: columnas por DEFINICIONES, orden por cabecera, paginación (onNext/onPrev, pageSize), onEditar(id), onEliminar(id). **No editable inline**; abre pantalla de edición. |
| **components/productos/ColumnManager.jsx** | Selector de columnas visibles (buscador interno, checkboxes). allColumns, visibleKeys, onChange, lockedKeys. Persistencia en padre (localStorage "productosCols"). |
| **app/modulos/productos/[id]/editar/page.jsx** | Edición full: carga producto por GET obtener, formulario FormProducto, PUT editar/[id]. Volver → router.push("/modulos/productos"). |
| **components/productos/FormProducto.jsx** | Formulario completo de producto (todos los campos). SunmiSelectAdv searchable para categoría, proveedores, área. |
| **hooks/useContextoActivo.js** | localId para listar/editar. |

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| GET | **/api/productos/listar** | page, pageSize, sortKey, sortDir, q, categoriaId, proveedorId, areaFisicaId, activo, localId. Devuelve items con mergeBaseLocalToUi (nombre, codigoBarra, sku, categoriaId, proveedorId, areaFisicaId, unidadMedida, factorPack, precioCosto, precioVenta, margen, activo, etc.) + nombres de catálogo. |
| GET | **/api/productos/obtener** | id, localId. Un producto para edición. |
| PUT | **/api/productos/editar/[id]** | localId en query; body completo (splitUiToDb). Edita base o override según localId/depósito. |

## Modelos / mapper

- **Prisma:** ProductoBase (grupoId, nombre, codigo_barra, sku, categoria_id, proveedor_id, area_fisica_id, unidad_medida, factor_pack, precio_costo, precio_venta, margen, activo, …), ProductoLocal (override por local). Relaciones categoria, proveedor, area_fisica.
- **lib/mappers/producto.js:** mergeBaseLocalToUi (DB → UI), splitUiToDb (UI → baseData + localData). Campos UI incluyen proveedor, factor_pack, categoría, área, unidad, etc.

## Flujo real

```
Usuario → /modulos/productos
  → useState(page, sortKey, sortDir, filtros, rows, visibleCols)
  → fetchProductos() → GET listar?page=&pageSize=&sortKey=&sortDir=&q=&categoriaId=&...&localId=
  → setRows(data.items), setTotalPages, setTotalItems
  → FiltrosProductos (filtros) + ColumnManager (visibleCols → localStorage) + SunmiTablaProductos (rows, onEditar)
  → Click Editar → router.push(/modulos/productos/{id}/editar)
  → Página editar: GET obtener?id=&localId= → FormProducto → PUT editar/{id} body completo
  → Volver → router.push(/modulos/productos) → listado remonta con estado inicial
```

- No hay hook dedicado de listado; fetch en la página. No hay edición inline; siempre se sale a la ruta de edición.

---

# 3. MAPA DEL MÓDULO AUMENTO DE PRECIOS

## Archivos relevantes

| Archivo | Rol |
|--------|-----|
| **app/modulos/productos/actualizacion-precios/page.jsx** | Wrapper que renderiza ActualizacionPreciosPage. |
| **components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx** | Tabs Proveedor / Excel. Carga proveedores (GET opciones/catalogos). Tab Proveedor: selector proveedor → "Cargar productos" → POST precios/preview (0%) → setFilas. Tabla con **SunmiTable + tr por fila**, celdas con **SunmiInput** para % y compra nueva (edición inline). Aplicar → POST precios/apply. |
| **components/productos/actualizacion-precios/PreviewPreciosTable.jsx** | Tabla preview (checkboxes, columnas costo/venta). No usado en el flujo actual de la página; usa SunmiTable. |
| **components/productos/actualizacion-precios/hooks/useActualizacionPrecios.js** | Hook con preview, apply, history; no usado por ActualizacionPreciosPage actual. |

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| GET | **/api/proveedores/opciones** o **/api/catalogos/proveedores** | Lista de proveedores. |
| POST | **/api/productos/precios/preview** | proveedorId, metodo, pricingMode, increase, localId → items con costoAnterior, ventaAnterior, margen, etc. |
| POST | **/api/productos/precios/apply** | Aplicar cambios de precios (lote). |

## Flujo real

```
Usuario → /modulos/productos/actualizacion-precios
  → ActualizacionPreciosPage: estado (proveedorId, filas, globalPct, applying, …)
  → GET proveedores/opciones → setProveedores
  → Selecciona proveedor → Cargar productos → POST precios/preview → setFilas (mapeo a filas con pct, compraNueva, editadoPor)
  → Tabla: SunmiTable, filas.map → <tr> con <td> + SunmiInput (pct, compraNueva). Handlers handlePctChange, handlePrecioDirectoChange
  → Aplicar % a todos / editar celdas → setFilas
  → Aplicar cambios → POST precios/apply (items con cambios)
```

- Patrón reutilizable: **tabla con filas en estado local y celdas editables con SunmiInput**, guardado por acción (botón "Aplicar"). No hay paginado en esa tabla (se cargan todos los productos del proveedor). No hay columnas configurables; columnas fijas.

---

# 4. REUTILIZABLES DETECTADOS

| Archivo / componente / API | Qué hace hoy | Reutilizar | Adaptación |
|----------------------------|--------------|------------|------------|
| **GET /api/productos/listar** | Paginado, filtros (q, categoriaId, proveedorId, areaFisicaId, activo), orden, localId. Devuelve items con todos los campos base+local (nombre, codigoBarra, categoriaId, proveedorId, factorPack, unidadMedida, precios, etc.). | Sí | Ninguna. Sirve como fuente del grid. |
| **PUT /api/productos/editar/[id]** | Edición full por producto (body completo, splitUiToDb). | Sí | Desde el grid hay que enviar el body completo (fila actual mergeada con el campo editado). No hace falta PATCH si el front arma el payload completo. |
| **GET /api/catalogos/categorias** | Lista categorías. | Sí | Ninguna. |
| **GET /api/catalogos/proveedores** o **/api/proveedores/opciones** | Lista proveedores. | Sí | Ninguna. |
| **GET /api/catalogos/areas-fisicas** | Lista áreas físicas. | Sí | Ninguna. |
| **FiltrosProductos** | Búsqueda + categoría, proveedor, área, activo; debounce; voz en búsqueda. | Sí | Posiblemente reutilizar como bloque o copiar y simplificar (quitar lo que no aplique). Añadir filtro "solo incompletos" sería nuevo (backend o filtro cliente). |
| **ColumnManager** | Selector de columnas con búsqueda, checkboxes, lockedKeys. | Sí | Reutilizable tal cual con otra lista de columnas (nombre, proveedor, factor_pack, categoría, área, precio, costo, código, etc.) y otra clave localStorage (ej. "productosEdicionRapidaCols"). |
| **SunmiTable** | Tabla con thead desde theme, tbody con children (tr). | Sí | Ninguna. |
| **SunmiTableRow** | Fila con hover theme. | Sí | Ninguna. |
| **SunmiInput** | Input controlado. | Sí | Ninguna. Usar en celdas editables. |
| **SunmiSelectAdv** (searchable) | Select con búsqueda interna. | Sí | Para celdas de categoría/proveedor/área en el grid. |
| **ActualizacionPreciosPage** (patrón) | Tabla con filas en state y celdas con SunmiInput/SunmiSelectAdv. | Como referencia | No reutilizar el componente; sí el patrón: estado filas, handlers por celda, guardado que llama API. |
| **lib/mappers/producto.js** | mergeBaseLocalToUi, splitUiToDb. | Sí | splitUiToDb espera payload completo; el front debe construir payload completo desde la fila actual + cambio. |
| **useContextoActivo** | localId. | Sí | Ninguna. |
| **Permisos** | productos.ver, productos.editar. | Sí | Mismo permiso para ver/editar en el nuevo módulo. |

---

# 5. GAPS / FALTANTES

| Pieza | Existe hoy | Qué falta |
|-------|------------|-----------|
| **Grid editable inline genérico** | No. SunmiTablaProductos es solo lectura; Actualización de precios tiene tabla editable pero fija a precios (columnas y flujo específicos). | Un componente (o página) que renderice filas de productos con celdas editables según columnas configurables (texto, número, select). Puede construirse con SunmiTable + filas que contengan SunmiInput/SunmiSelectAdv por columna. |
| **Guardado por celda/fila** | No. Solo existe PUT editar con body completo por producto. | Estrategia en front: al cambiar una celda, mantener en state la fila actualizada; al “guardar fila” (o debounce) armar payload con mergeBaseLocalToUi inverso (splitUiToDb) desde la fila en state y llamar PUT editar/[id]. No es obligatorio un endpoint nuevo. |
| **Bulk / aplicar a varias filas** | No. No hay API que reciba “aplicar proveedor X a productos [ids]”. | Fase 2: o múltiples PUT en secuencia/paralelo, o un endpoint nuevo POST productos/actualizar-lote (ids + campos a actualizar). |
| **Filtro “solo incompletos”** | No. Listar no filtra por “sin proveedor” o “sin categoría”. | Opción 1: filtro en front sobre items ya cargados (limitado a la página actual). Opción 2: nuevo param en listar (ej. soloIncompletos=true) que en backend filtre por proveedor_id null o categoria_id null, etc. |
| **Virtualización** | No. Tablas actuales renderizan todas las filas de la página. | Con pageSize 25–50 no es crítico. Si se sube a 100 o más, valorar virtualización más adelante. |
| **Voz en celda** | Voz existe en FiltrosProductos y BuscadorProductos (SpeechRecognition → setear valor de input). | No hay “celda activa + voz”. Fase 3: reutilizar el mismo patrón en un input de celda cuando está enfocada. |

---

# 6. OPCIONES DE IMPLEMENTACIÓN

## Opción A: Extender el módulo Productos actual

- **Idea:** En la misma página de listado, hacer la tabla editable inline (por ejemplo doble modo: “Vista” vs “Edición rápida”) o añadir una pestaña “Edición rápida” en productos.
- **Pros:** Un solo lugar para productos; no hay nueva ruta.
- **Contras:** Mezcla dos flujos (navegar a editar producto completo vs editar en grid); estado y lógica se complican (columnas, guardado, filtros). Riesgo de romper el listado actual y la navegación a editar.
- **Riesgo:** Alto (cambios en página muy cargada).
- **Impacto:** Alto en productos/page.jsx y en SunmiTablaProductos (que hoy no es editable).
- **Velocidad de implementación:** Media-baja (refactor y muchos condicionales).
- **Mantenibilidad:** Baja (dos modos en el mismo componente).

## Opción B: Módulo nuevo reutilizando tabla/hook existentes

- **Idea:** Nueva ruta (ej. `/modulos/productos/edicion-rapida`) y nueva página que use GET listar (mismo endpoint), mismo FiltrosProductos (o variante), mismo ColumnManager (otra clave localStorage), y una tabla que en lugar de SunmiTablaProductos use un “grid” con el mismo patrón que Actualización de precios (SunmiTable + filas con SunmiInput/SunmiSelectAdv en celdas). Guardado por fila o por celda con debounce llamando a PUT editar/[id] con payload completo de la fila.
- **Pros:** No toca el módulo Productos; reutiliza listar, editar, catalogos, filtros, columnas, SunmiTable, SunmiInput, SunmiSelectAdv. Patrón de “tabla editable” ya probado en Actualización de precios.
- **Contras:** Hay que construir el mapeo columna → celda editable (texto, número, select) y la lógica de guardado (merge fila + PUT). No reutilizas SunmiTablaProductos tal cual porque es solo lectura.
- **Riesgo:** Bajo (módulo aislado).
- **Impacto:** Solo archivos nuevos + posible hook useEdicionRapida (estado filas, guardar, loading).
- **Velocidad de implementación:** Media (1–2 semanas para MVP).
- **Mantenibilidad:** Alta (responsabilidad clara, separada).

## Opción C: Grid especializado separado (librería o componente muy custom)

- **Idea:** Introducir una librería de data grid (ej. TanStack Table con celdas editables, o AG-Grid) o un componente React muy específico para “tabla tipo Excel”.
- **Pros:** Potencialmente más features (virtualización, copy/paste, etc.).
- **Contras:** Dependencia nueva, tema del ERP hay que mapearlo a la librería, y el backend sigue siendo el mismo (listar + editar por producto). Sobrecarga para el problema actual.
- **Riesgo:** Medio (integración tema, bundle size).
- **Impacto:** Nuevo dependency + wrappers para tema y para llamar a listar/editar.
- **Velocidad de implementación:** Baja (integración y ajustes).
- **Mantenibilidad:** Depende de la librería.

---

# 7. RECOMENDACIÓN FINAL

**Opción B: módulo nuevo reutilizando listar, editar, filtros, columnas y patrón de tabla editable.**

- Mantiene el módulo Productos intacto y la experiencia “editar producto completo” igual.
- Reutiliza 100% de APIs (listar + editar) y de catálogos; reutiliza FiltrosProductos (o una variante), ColumnManager, SunmiTable, SunmiInput, SunmiSelectAdv.
- El “grid editable” es una vista nueva: misma lista que listar, pero con celdas editables y guardado por fila (o debounce por celda) vía PUT existente, construyendo el body completo desde el estado de la fila.
- Bajo riesgo, buena mantenibilidad y tiempo de implementación acotado.

---

# 8. PROPUESTA DE ARQUITECTURA

- **Ruta sugerida:** `/modulos/productos/edicion-rapida` (o `/modulos/edicion-rapida-productos`). Entrada desde el menú o desde el módulo Productos (botón “Edición rápida”).
- **Componentes:**
  - Página: `app/modulos/productos/edicion-rapida/page.jsx` → renderiza un contenedor que usa filtros, columnas y grid.
  - Contenedor principal: p. ej. `components/productos/edicion-rapida/EdicionRapidaProductosPage.jsx` (o nombre similar): estado (rows, page, totalPages, filtros, visibleCols, loading, savingId), carga con GET listar, tabla con celdas editables.
  - Grid: tabla (SunmiTable) cuyas filas son productos; cada celda según tipo de columna: SunmiInput (texto/número) o SunmiSelectAdv (categoría, proveedor, área). No hace falta un componente genérico “DataGrid”; puede ser un mapa columna → componente + handler.
  - Reutilizar FiltrosProductos (o un wrapper que pase los mismos filtros) y ColumnManager con lista de columnas para edición rápida (nombre, codigoBarra, proveedorId, categoriaId, areaFisicaId, factorPack, unidadMedida, precioCosto, precioVenta, margen, activo, etc.) y clave localStorage propia.
- **Hooks:** Opcional `useEdicionRapidaProductos(localId)`: estado rows, page, filtros, fetch (listar), guardarFila(id, payload) → PUT editar/[id]. Si se prefiere, puede vivir todo en la página sin hook.
- **Endpoints:** Ninguno nuevo en Fase 1. GET listar para cargar página; PUT editar/[id] para guardar (payload = splitUiToDb(filaCompleta)).
- **Estrategia de guardado:** Por fila: botón “Guardar” por fila o guardado al salir de la fila (onBlur). Alternativa: debounce por celda (ej. 800 ms después del último cambio en esa fila) y luego PUT. Evitar guardado inmediato por tecla en cada celda (muchas peticiones). Recomendación: “Guardar” por fila o autosave por fila con debounce.
- **Paginado:** Igual que Productos: page, pageSize (25/50/100), totalPages desde listar. Controles reutilizables (next/prev, selector pageSize).
- **Filtros:** Mismos que listar: q, categoriaId, proveedorId, areaFisicaId, activo. Opcional Fase 2: soloIncompletos (backend o filtro cliente).
- **Columnas configurables:** ColumnManager con lista de columnas permitidas para edición rápida; persistencia en localStorage con clave distinta (ej. "productosEdicionRapidaCols"). Columnas bloqueadas opcionales (ej. nombre).
- **Voz:** Fase 3. Reutilizar SpeechRecognition como en FiltrosProductos: en la celda activa (input enfocado), botón de micrófono que llene el valor de ese input. No tocar precios/stock por voz con lógica automática; solo rellenar el valor del campo actual.

---

# 9. PLAN POR FASES

## Fase 1 (Mínima viable)

- Nueva ruta y página; estado: rows, page, pageSize, totalPages, filtros, visibleCols (desde ColumnManager + localStorage).
- Carga con GET listar (mismos params que Productos).
- Filtros: reutilizar FiltrosProductos o bloque equivalente (q, categoría, proveedor, área, activo).
- Columnas: ColumnManager con columnas: nombre, codigoBarra, sku, proveedorId, categoriaId, areaFisicaId, factorPack, unidadMedida, precioCosto, precioVenta, margen, activo (y las que se consideren útiles). Persistencia en localStorage.
- Tabla: SunmiTable; por cada fila, celdas editables según columna (SunmiInput para texto/número, SunmiSelectAdv searchable para proveedor/categoría/área). Handlers que actualicen estado local de la fila.
- Guardado: por fila (botón “Guardar” en fila o guardar al blur). Payload = objeto completo de la fila (merge con datos actuales de listar); splitUiToDb en front o enviar payload en formato esperado por editar; PUT editar/[id]?localId=.
- Paginación: controles next/prev y pageSize; al cambiar página o filtros, nuevo fetch listar.
- Permisos: productos.ver para ver; productos.editar para poder guardar.

## Fase 2 (Mejoras)

- Filtro “solo incompletos” (sin proveedor o sin categoría): param en listar o filtro en cliente sobre la página actual.
- Selección múltiple: checkboxes por fila; toolbar “Aplicar a seleccionados” (ej. mismo proveedor o misma categoría). Implementación: múltiples PUT en paralelo o nuevo endpoint batch (POST productos/actualizar-lote).
- Mejor feedback: indicador de “guardando” por fila, mensaje éxito/error por fila o global.

## Fase 3 (Opcional)

- Voz: en inputs de celdas editables, botón de micrófono que use SpeechRecognition y setee el valor del input (mismo patrón que FiltrosProductos). Solo para completar la celda activa; sin lógica que modifique precios/stock por IA.
- Virtualización: si se sube pageSize o se pide “scroll infinito”, valorar virtualización de filas (react-window o similar) para no renderizar cientos de filas a la vez.

---

# 10. ARCHIVOS A TOCAR / CREAR

## Reutilizar sin modificar

- **app/api/productos/listar/route.js**
- **app/api/productos/editar/[id]/route.js**
- **app/api/productos/obtener/route.js** (si se necesita cargar un producto concreto)
- **app/api/catalogos/categorias/route.js**, **app/api/catalogos/proveedores/route.js**, **app/api/catalogos/areas-fisicas/route.js** (o proveedores/opciones)
- **components/sunmi/SunmiTable.jsx**, **SunmiTableRow.jsx**, **SunmiInput.jsx**, **SunmiSelectAdv.jsx**, **SunmiCard.jsx**, **SunmiButton.jsx**
- **lib/mappers/producto.js**
- **hooks/useContextoActivo.js**
- **components/productos/FiltrosProductos.jsx** (reutilizar como componente o copiar estructura)
- **components/productos/ColumnManager.jsx** (reutilizar con otra lista de columnas y otra clave localStorage)

## Modificar (mínimo)

- **Menú / navegación:** Añadir entrada “Edición rápida de productos” (o similar) que apunte a la nueva ruta (y permiso productos.ver o productos.editar). Archivo según dónde esté definido el menú (ej. lib/menuConfig.js o componentes de layout).
- **app/modulos/productos/page.jsx:** Opcional: botón “Edición rápida” que haga router.push a la nueva ruta.

## Crear

- **app/modulos/productos/edicion-rapida/page.jsx** — Página que renderice el contenedor del módulo.
- **components/productos/edicion-rapida/EdicionRapidaProductosPage.jsx** (o nombre similar) — Estado, fetch listar, filtros, ColumnManager, tabla editable, guardado PUT por fila.
- Opcional: **components/productos/edicion-rapida/GridProductosEditable.jsx** — Componente que recibe rows, columns, catalogos, onCellChange, onGuardarFila. Encapsula SunmiTable + mapeo columna → celda editable.
- Opcional: **hooks/useEdicionRapidaProductos.js** — Estado rows, paginación, filtros, fetchListar, guardarFila (PUT).

---

# 11. RIESGOS TÉCNICOS

- **Performance:** Con pageSize 25–50, re-renders de la tabla al editar una celda son manejables si el estado está por fila y se actualiza solo esa fila. Evitar estado que obligue a re-renderizar todo el grid en cada keystroke; usar estado local por fila o por “filas” con actualización inmutable.
- **Consistencia de datos:** Tras guardar una fila, el backend puede devolver el item actualizado; se puede reemplazar esa fila en state. Si otro usuario modifica el mismo producto, no hay locking; es el mismo nivel de riesgo que el módulo Productos actual.
- **Conflictos con módulo Productos:** Ninguno si el nuevo módulo no modifica rutas ni componentes de Productos. Solo lectura de los mismos endpoints.
- **Validaciones:** PUT editar ya valida (proveedores no repetidos, etc.). El front debe enviar payload coherente (splitUiToDb desde la fila completa); si falta algún campo requerido, el backend puede devolver error y mostrarlo en UI.
- **Edge cases:** Filas con muchos productos del mismo proveedor/categoría: SunmiSelectAdv con searchable ya filtra en cliente. Código de barras único: validación sigue en backend al guardar. Celdas vacías (proveedor/categoría null): enviar null en el payload; el mapper ya lo soporta.

---

# 12. CONCLUSIÓN FINAL

La implementación más sólida para ERP Azul es un **módulo nuevo de Edición rápida de productos** en una ruta dedicada, que reutilice **GET listar** (paginado y filtros), **PUT editar** (por producto, payload completo), **catálogos**, **FiltrosProductos**, **ColumnManager**, **SunmiTable** y el patrón de **tabla con celdas editables** (SunmiInput / SunmiSelectAdv) ya usado en Actualización de precios. Guardado por fila (o con debounce por fila) construyendo el body completo desde el estado de la fila y llamando al PUT existente evita nuevos endpoints y mantiene una sola fuente de verdad para la edición de productos. Así se gana velocidad operativa para completar proveedor, factor_pack, categoría, área y otros campos en muchos productos sin tocar el flujo actual de “editar producto completo” y con bajo riesgo y buena mantenibilidad.

---

**Documento de auditoría; no incluye implementación ni cambios de código.**

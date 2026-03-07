# Auditoría técnica — Módulo Productos / Actualización de precios

**Alcance:** Módulo `productos/actualizacion-precios`. Solo diagnóstico y plan; sin implementación.

---

## 1. Resumen ejecutivo

- **Selector de proveedor:** Se usa `SunmiSelectAdv` **sin** la prop `searchable`. El mismo componente en el proyecto ya soporta `searchable={true}` (buscador dentro del dropdown y filtro en tiempo real), por ejemplo en FormProducto y FiltrosStock. La causa es que en ActualizacionPreciosPage no se pasó `searchable`; no hace falta otro componente.
- **Theme / UI:** La grilla de resultados (tablas de productos y preview) usa clases Tailwind fijas (`bg-slate-950`, `hover:bg-slate-900`, `border-slate-800`, `text-slate-300`, `text-amber-200`, etc.) en lugar de tokens del tema (variables CSS `--table-row-hover`, clases `sunmi-divider`, `sunmi-text-muted`, y componente `SunmiTableRow`). Por eso la pantalla no respeta el theme del ERP y se ve “hardcodeada”.
- **Plan mínimo:** (1) Añadir `searchable` a los dos `SunmiSelectAdv` de proveedor. (2) Sustituir `<tr className="bg-slate-950 hover:bg-slate-900">` por `SunmiTableRow` o por `tr` con `hover:bg-[var(--table-row-hover)]` y reemplazar bordes/colores por clases/variables del tema en los archivos indicados abajo.

---

## 2. Mapa UI → Estado → API

```
[Usuario] → /modulos/productos/actualizacion-precios
    │
    ▼
app/modulos/productos/actualizacion-precios/page.jsx
    └── renderiza <ActualizacionPreciosPage />
            │
            ▼
components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx
    │
    ├── Estado: tab, proveedores, proveedorId, filas, loadingProductos, globalPct, applying,
    │           excelProveedorId, excelPreview, applyingExcel, errorMsg, successMsg
    ├── useEffect: GET /api/proveedores/opciones (o /api/catalogos/proveedores) → setProveedores
    ├── Selector proveedor (tab Proveedor): SunmiSelectAdv value=proveedorId, sin searchable
    ├── "Cargar productos" → POST /api/productos/precios/preview (proveedorId, metodo, increase 0%) → setFilas
    ├── Tabla de filas: SunmiTable + <tr className="bg-slate-950 hover:bg-slate-900"> (hardcoded)
    ├── Tab Excel: otro SunmiSelectAdv (excelProveedorId), sin searchable
    │              + input file + preview con SunmiTable y mismo tr hardcoded
    └── Mensajes error/éxito: div con border-red-500/50, bg-red-500/10, etc. (hardcoded)

PreviewPreciosTable.jsx (no usado en este flujo actual; usado en otro flujo con useActualizacionPrecios)
    └── Contenedor: border-slate-800; filas: bg-slate-900/50, text-slate-300, text-amber-200 (hardcoded)
```

- **APIs usadas por ActualizacionPreciosPage:**  
  - `GET /api/proveedores/opciones` o `GET /api/catalogos/proveedores` (listado de proveedores).  
  - `POST /api/productos/precios/preview` (preview de precios por proveedor).  
  - `POST /api/productos/precios/apply` (aplicar cambios; se llama desde el mismo componente).  
- **Hook useActualizacionPrecios:** Definido en `hooks/useActualizacionPrecios.js`; en la página actual de actualización de precios **no se usa**. La página maneja todo con estado local. El hook y `PreviewPreciosTable` forman parte de otro flujo (por ejemplo, otra vista o versión anterior); igualmente conviene corregir theme en PreviewPreciosTable para consistencia.

---

## 3. Archivos exactos involucrados

| Archivo | Rol | Afecta selector | Afecta theme/UI |
|--------|-----|------------------|------------------|
| **app/modulos/productos/actualizacion-precios/page.jsx** | Envuelve y renderiza el componente principal. | No | No |
| **components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx** | Página completa: tabs Proveedor/Excel, selector proveedor, carga de productos, tablas, aplicar. | Sí (aquí está el SunmiSelectAdv sin searchable) | Sí (tablas con tr y clases hardcoded; mensajes error/éxito) |
| **components/productos/actualizacion-precios/PreviewPreciosTable.jsx** | Tabla de preview (items, checkboxes, columnas costo/venta). | No | Sí (contenedor y filas con slate/amber hardcoded) |
| **components/productos/actualizacion-precios/hooks/useActualizacionPrecios.js** | Hook con estado preview, apply, history; no usado por ActualizacionPreciosPage actual. | No | No |
| **components/sunmi/SunmiSelectAdv.jsx** | Select avanzado con opción `searchable` (input + filtro en dropdown). | Es el componente a reutilizar; solo falta pasar `searchable` donde se use para proveedor | No |
| **components/sunmi/SunmiTable.jsx** | Tabla con thead desde theme y tbody con divide. | No | No (ya usa theme) |
| **components/sunmi/SunmiTableRow.jsx** | Fila con `hover:bg-[var(--table-row-hover)]`. | No | Sí (es el patrón a usar en lugar de tr + bg-slate-*) |

---

## 4. Fase 1 — Mapeo del módulo

### 4.1 Página principal

- **Ruta:** `app/modulos/productos/actualizacion-precios/page.jsx`  
- **Contenido:** Solo importa y renderiza `ActualizacionPreciosPage`. Sin estado ni lógica.

### 4.2 Componente principal ActualizacionPreciosPage

- **Archivo:** `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`
- **Estado:** tab, proveedores, loadingProveedores, proveedorId, filas, loadingProductos, globalPct, applying, excelProveedorId, loadingExcel, excelPreview, applyingExcel, errorMsg, successMsg.
- **Proveedores:** Se cargan al montar con `/api/proveedores/opciones` (fallback `/api/catalogos/proveedores`).
- **Selector proveedor (tab Proveedor):** Líneas 585–600. `<SunmiSelectAdv value={proveedorId} onChange={...} disabled={...}>` con `<option>` por cada proveedor. **No tiene `searchable`.**
- **Selector proveedor (tab Excel):** Líneas 730–745. Mismo patrón, sin `searchable`.
- **Tablas:**  
  - Tab Proveedor (filas cargadas): líneas 639–704. `SunmiTable` con `filas.map` → `<tr key=... className="bg-slate-950 hover:bg-slate-900">` y celdas con `SunmiInput` y clases `!border-amber-400/60` / `!border-cyan-400/60`.  
  - Tab Excel (preview import): líneas 790–822. Mismo `SunmiTable` y `<tr className="bg-slate-950 hover:bg-slate-900">`.  
- **Mensajes:** Líneas 838–848. Error: `border-red-500/50 bg-red-500/10 text-red-200`. Éxito: `border-emerald-500/50 bg-emerald-500/10 text-emerald-200`.  
- **Input file:** Línea 774. Clases `file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600` y texto `text-slate-500`.

### 4.3 PreviewPreciosTable

- **Archivo:** `components/productos/actualizacion-precios/PreviewPreciosTable.jsx`
- **Uso:** No se referencia en ActualizacionPreciosPage actual; sí usa SunmiTable.
- **Contenedor:** `rounded-lg border border-slate-800 overflow-hidden` (línea 32).
- **Filas:** `className="bg-slate-900/50 hover:bg-slate-800/60"` (línea 58).
- **Celdas:** `text-slate-300` (líneas 67, 71), `text-xs text-amber-200` (73). Checkboxes: `accent-amber-400` (37, 61).

### 4.4 APIs

- **Proveedores:** `GET /api/proveedores/opciones` o `GET /api/catalogos/proveedores`.
- **Preview precios:** `POST /api/productos/precios/preview` (body: proveedorId, metodo, pricingMode, increase, localId).
- **Aplicar:** `POST /api/productos/precios/apply` (desde el mismo componente).

---

## 5. Fase 2 — Selector de proveedor

### 5.1 Cómo está armado hoy

- **Componente:** `SunmiSelectAdv` (importado desde `@/components/sunmi/SunmiSelectAdv`).
- **Uso:** Dos instancias (tab Proveedor y tab Excel). Props: `value`, `onChange`, `disabled`. Hijos: un `<option value="">` para placeholder y un `<option key={p.id} value={p.id}>` por cada proveedor.
- **Búsqueda:** No. No se pasa `searchable`; el dropdown es lista fija sin input ni filtro.

### 5.2 Soporte searchable en el proyecto

- **SunmiSelectAdv** ya tiene `searchable = false` por defecto y, cuando `searchable === true`:
  - Muestra un input con icono de búsqueda en la parte superior del dropdown.
  - Filtra opciones en tiempo real por el texto del hijo (por ejemplo `p.nombre`) con `toLowerCase().includes(search.toLowerCase())`.
- **Dónde se usa searchable:**  
  - `components/productos/FormProducto.jsx` (varios selects con `searchable`).  
  - `components/stock_locales/FiltrosStock.jsx` (SunmiSelectAdv con `searchable` para local, etc.).

### 5.3 Componente ideal a reutilizar

- **Mismo componente:** `SunmiSelectAdv` con `searchable` activado.
- **Cambio:** En `ActualizacionPreciosPage.jsx`, en los dos bloques donde se renderiza el selector de proveedor, añadir la prop `searchable` (por ejemplo `searchable` o `searchable={true}`). No hace falta sustituir por otro componente ni crear uno nuevo.
- **Opcional:** Usar `SunmiSelectOption` en lugar de `<option>` si el resto del proyecto lo usa en SunmiSelectAdv (el componente acepta ambos; el filtro searchable usa `c.props.children` como texto).

### 5.4 Impacto

- **Solo UI y UX:** El estado (proveedorId, excelProveedorId) y el flujo (cargar productos, aplicar) no cambian. El usuario podrá escribir en el selector y filtrar la lista de proveedores sin tocar estado ni APIs.

---

## 6. Fase 3 — Problema de theme / UI hardcodeada

### 6.1 Dónde se rompe el theme

- **Archivos:**  
  - `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`  
  - `components/productos/actualizacion-precios/PreviewPreciosTable.jsx`

### 6.2 Bloques concretos y causa

**ActualizacionPreciosPage.jsx**

1. **Líneas 655–667 (tabla productos por proveedor):**  
   - `<tr key={f.productoBaseId} className="bg-slate-950 hover:bg-slate-900">`  
   - Causa: Color de fondo y hover fijos en Tailwind (slate), no usan variables del tema (`--table-row-hover`) ni el componente `SunmiTableRow`.

2. **Líneas 674 y 686 (inputs de % y precio):**  
   - `className={isPct ? "!border-amber-400/60" : ""}` y `className={isPrecio ? "!border-cyan-400/60" : ""}`  
   - Causa: Colores de acento fijos (amber/cyan); no usan variables o clases del sistema (p. ej. sunmi-state-warning / sunmi-state-info si existieran para bordes).

3. **Líneas 801–804 (tabla preview Excel):**  
   - `<tr ... className="bg-slate-950 hover:bg-slate-900">`  
   - Misma causa que 1.

4. **Líneas 774 y 777 (input file y texto):**  
   - `file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600`, `text-slate-500`  
   - Causa: Colores de control y texto secundario hardcodeados en lugar de clases tipo `sunmi-control` / `sunmi-text-muted`.

5. **Líneas 838–848 (mensajes error/éxito):**  
   - `border-red-500/50 bg-red-500/10 text-red-200` y `border-emerald-500/50 bg-emerald-500/10 text-emerald-200`  
   - Causa: No usan clases del sistema (p. ej. `sunmi-state-danger` / `sunmi-state-success` o equivalentes en el proyecto).

**PreviewPreciosTable.jsx**

1. **Línea 32:** `border border-slate-800` → debería usar `sunmi-border` o variable de borde del tema.
2. **Línea 58:** `className="bg-slate-900/50 hover:bg-slate-800/60"` en `<tr>` → mismo problema que las tablas de ActualizacionPreciosPage.
3. **Líneas 67, 71:** `text-slate-300` → debería usar algo como `sunmi-text-muted`.
4. **Línea 73:** `text-amber-200` → color fijo; idealmente clase de “alerta/warning” del tema.
5. **Líneas 37 y 61:** `accent-amber-400` en checkboxes → color fijo; si el tema define variables para checkbox, usarlas.

### 6.3 Por qué no toma el theme

- El tema del ERP se aplica vía variables CSS (p. ej. en `app/globals.css` y `styles/sunmi.css`: `--table-row-hover`, `--app-border`, `--table-header-bg`, etc.) y clases como `sunmi-thead`, `sunmi-divider`, `sunmi-text-muted`, `sunmi-state-danger`, etc.
- En este módulo se usan directamente clases Tailwind de color (`slate-*`, `amber-*`, `cyan-*`, `red-*`, `emerald-*`) que no están ligadas a esas variables ni a la paleta del tema, por eso la pantalla se ve “fuera” del theme y con estilos aislados.

---

## 7. Fase 4 — Plan de implementación (sin código)

### 7.1 Selector de proveedor searchable

- **Archivo a tocar:** `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`.
- **Cambio:** En los dos `SunmiSelectAdv` de proveedor (tab Proveedor y tab Excel), añadir la prop `searchable` (o `searchable={true}`).
- **No tocar:** SunmiSelectAdv.jsx, APIs, estado, ni otros componentes.

### 7.2 Theme en ActualizacionPreciosPage.jsx

- **Filas de tabla:** Sustituir `<tr className="bg-slate-950 hover:bg-slate-900">` por uso de `SunmiTableRow` (envolviendo las celdas) o, si se mantiene `<tr>`, por una clase que use el token del tema, por ejemplo `hover:bg-[var(--table-row-hover)]` y quitar `bg-slate-950` (o usar la misma convención que SunmiTableRow: solo hover con variable).
- **Inputs destacados (% / precio):** Sustituir `!border-amber-400/60` y `!border-cyan-400/60` por clases del sistema si existen (p. ej. estados warning/info); si no, dejarlas o usar variables CSS del tema en lugar de colores fijos.
- **Input file:** Reemplazar `file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600` y `text-slate-500` por clases de controles y texto secundario del tema (p. ej. las usadas en otros formularios del ERP).
- **Mensajes error/éxito:** Reemplazar las clases actuales por las que use el resto del proyecto para error/éxito (p. ej. `sunmi-state-danger` / `sunmi-state-success` o equivalentes en docs/estilos).

### 7.3 Theme en PreviewPreciosTable.jsx

- Contenedor: `border-slate-800` → `sunmi-border` (o clase de borde del tema).
- Filas: `bg-slate-900/50 hover:bg-slate-800/60` → `SunmiTableRow` o `tr` con `hover:bg-[var(--table-row-hover)]` y sin fondos slate fijos.
- Celdas: `text-slate-300` → `sunmi-text-muted`; alertas → clase de aviso del tema en lugar de `text-amber-200`.
- Checkboxes: si el tema define estilos para checkbox, usarlos; si no, se puede dejar `accent-*` documentado como excepción o mapearlo a variable.

### 7.4 Riesgos y edge cases

- **SunmiSelectAdv con muchos proveedores:** Con `searchable` el filtro es en cliente; si la lista es muy grande (miles), el rendimiento puede degradarse; en ese caso sería un cambio posterior (paginación o búsqueda por API). Para listas habituales de proveedores no suele ser problema.
- **SunmiTableRow y celdas:** SunmiTableRow espera `children` como celdas `<td>`. Hay que mantener la misma estructura de celdas que hoy (incluyendo SunmiInput dentro de `<td>`) para no romper layout ni accesibilidad.
- **Mensajes y estados:** Verificar en el proyecto cómo se estilizan errores y éxitos (clases o componentes concretos) para no introducir inconsistencia al reemplazar.

---

## 8. Listas finales

### Archivos a tocar

1. **components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx**  
   - Añadir `searchable` a los dos selectores de proveedor.  
   - Reemplazar clases hardcoded en tablas (tr), inputs destacados, input file, mensajes error/éxito por clases/variables del tema (y/o SunmiTableRow).

2. **components/productos/actualizacion-precios/PreviewPreciosTable.jsx**  
   - Reemplazar contenedor y filas por tema (sunmi-border, variable de fila / SunmiTableRow).  
   - Reemplazar colores de texto y alertas por clases del tema.

### Archivos a no tocar

- **app/modulos/productos/actualizacion-precios/page.jsx** — Solo wrapper.  
- **components/productos/actualizacion-precios/hooks/useActualizacionPrecios.js** — No afecta selector ni tablas actuales.  
- **components/sunmi/SunmiSelectAdv.jsx** — Ya soporta searchable.  
- **components/sunmi/SunmiTable.jsx** — Ya usa theme.  
- **APIs** (proveedores, precios/preview, precios/apply) — Sin cambios.

---

**Documento solo de auditoría; no incluye implementación ni cambios de código.**

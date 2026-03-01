# Auditoría + propuesta de refactor UX — /modulos/stock_locales

**Objetivo:** Reducir encabezados redundantes, detectar hardcodes de color y proponer estructura (1 header + filtros compactos + tabla). Sin implementar cambios.

---

## 1. Entrypoint y componentes

| Tipo | Ruta | Rol |
|------|------|-----|
| **Entrypoint** | `app/modulos/stock_locales/page.jsx` | Página principal: cabecera, FiltrosStock, TablaStock, ModalAjuste, ModalLimites. |
| **Filtros** | `components/stock_locales/FiltrosStock.jsx` | Buscador, selectores (categoría, proveedor, área), checkboxes (Con stock, Sin stock, Faltantes), botón Limpiar. |
| **Tabla** | `components/stock_locales/TablaStock.jsx` | Listado de stock por producto, paginación, botones Ajustar / Límites. |
| **Modales** | `components/stock_locales/ModalAjuste.jsx`, `ModalLimites.jsx` | Ajuste de stock y edición de límites min/max. |

---

## 2. Dónde se renderiza cada título / panel

| Elemento UI | Archivo | Líneas | Cómo se pinta |
|-------------|---------|--------|----------------|
| **"Stock de Locales"** | `app/modulos/stock_locales/page.jsx` | **66-71** | Dentro de un `div.sunmi-card`: `<div className="sunmi-header-cyan">Stock de Locales</div>` y debajo un `<p>` con el nombre del local (sunmi-text-accent). |
| **Panel "Filtros"** | `components/stock_locales/FiltrosStock.jsx` | **54-57** | Contenedor `div.sunmi-card` y dentro `<div className="sunmi-header-cyan">Filtros</div>`. Contenido: input búsqueda, Limpiar, 3 SunmiSelectAdv, 3 checkboxes. |
| **"Stock del Local"** | `components/stock_locales/TablaStock.jsx` | **157-160** | Dentro de un `div.sunmi-card`: `<div className="sunmi-header-cyan">Stock del Local</div>`. Es el bloque que envuelve la tabla y la paginación. |
| **"Stock"** (sin contexto) | `components/stock_locales/TablaStock.jsx` | **147-152** | Cuando `!localSeleccionado`: mismo `sunmi-card` + `<div className="sunmi-header-cyan">Stock</div>` y mensaje "No hay contexto operativo activo.". |

**Barras cyan/blue:** Todas usan la clase **`sunmi-header-cyan`**, definida en `styles/sunmi.css` (líneas 26-31) como `bg-cyan-400 text-slate-900` (Tailwind fijo). Los botones "Ajustar" / "Límites" / "Limpiar" usan **`sunmi-btn-cyan`**, **`sunmi-btn-amber`**, **`sunmi-btn-red`** (también en sunmi.css con colores fijos).

---

## 3. Mapa UI → componentes

```
app/modulos/stock_locales/page.jsx
├── [CABECERA] div.sunmi-card
│   └── div.sunmi-header-cyan  →  "Stock de Locales"
│   └── p (nombre del local)
│
├── [FILTROS] FiltrosStock
│   └── div.sunmi-card
│       └── div.sunmi-header-cyan  →  "Filtros"
│       └── Input + Limpiar + 3 selects + 3 checkboxes
│
├── [TABLA] TablaStock
│   └── div.sunmi-card
│       └── div.sunmi-header-cyan  →  "Stock del Local" (o "Stock" si sin contexto)
│       └── loading/error + table + paginación
│
├── ModalAjuste
└── ModalLimites
```

---

## 4. Hardcodes de color (archivo + línea + clase)

| Archivo | Línea | Clase / estilo hardcodeado |
|---------|-------|----------------------------|
| **app/modulos/stock_locales/page.jsx** | 66-69 | `sunmi-card`, `sunmi-header-cyan` (cyan fijo vía sunmi.css). |
| **components/stock_locales/FiltrosStock.jsx** | 54-57 | `sunmi-card`, `sunmi-header-cyan`. |
| **components/stock_locales/FiltrosStock.jsx** | 72 | `sunmi-btn sunmi-btn-red`. |
| **components/stock_locales/FiltrosStock.jsx** | **104** | `text-slate-300`. |
| **components/stock_locales/TablaStock.jsx** | 147-150, 157-160 | `sunmi-card`, `sunmi-header-cyan`. |
| **components/stock_locales/TablaStock.jsx** | **151** | `text-slate-400`. |
| **components/stock_locales/TablaStock.jsx** | **163** | `text-slate-400`. |
| **components/stock_locales/TablaStock.jsx** | **165** | `text-red-400`. |
| **components/stock_locales/TablaStock.jsx** | **188** | `text-slate-500`. |
| **components/stock_locales/TablaStock.jsx** | **198** | `hover:bg-slate-800/40`. |
| **components/stock_locales/TablaStock.jsx** | **208** | `text-slate-500`. |
| **components/stock_locales/TablaStock.jsx** | **266, 273** | `sunmi-btn-cyan`, `sunmi-btn-amber`. |
| **components/stock_locales/TablaStock.jsx** | **288** | `text-slate-400`. |
| **components/stock_locales/TablaStock.jsx** | **290** | `text-slate-200`. |
| **components/stock_locales/TablaStock.jsx** | **295, 307** | `bg-slate-800 text-slate-200`. |
| **components/stock_locales/TablaStock.jsx** | **302** | `text-slate-300`. |
| **components/stock_locales/ModalAjuste.jsx** | **77** | `bg-black/50`. |
| **components/stock_locales/ModalAjuste.jsx** | **83** | `text-slate-900`. |
| **components/stock_locales/ModalAjuste.jsx** | **90-95** | `text-slate-300`, `text-slate-100`. |
| **components/stock_locales/ModalAjuste.jsx** | **135-136** | `text-slate-400`, `text-slate-200`. |
| **components/stock_locales/ModalAjuste.jsx** | **187** | `sunmi-btn-cyan`. |
| **components/stock_locales/ModalLimites.jsx** | **71** | `bg-black/50`. |
| **components/stock_locales/ModalLimites.jsx** | **77** | `text-slate-900`. |
| **components/stock_locales/ModalLimites.jsx** | **83-88** | `text-slate-300`, `text-slate-100`. |
| **components/stock_locales/ModalLimites.jsx** | **141** | `sunmi-btn-cyan`. |

**Origen de las barras cyan:** La clase `sunmi-header-cyan` está en `styles/sunmi.css` (líneas 26-31): `@apply bg-cyan-400 text-slate-900 ...` (colores fijos, no variables). Los botones `sunmi-btn-cyan`, `sunmi-btn-amber`, `sunmi-btn-red` están en el mismo archivo con Tailwind fijo.

---

## 5. Root causes

- **Redundancia de títulos:** Tres bloques con barra cyan: (1) "Stock de Locales" + nombre del local en page, (2) "Filtros" en FiltrosStock, (3) "Stock del Local" (o "Stock") en TablaStock. El usuario ve tres encabezados seguidos; el de la tabla repite la idea de "stock" y el de "Filtros" ocupa espacio sin aportar contexto nuevo.
- **Hardcode de color:** Uso de `sunmi-header-cyan` y `sunmi-btn-cyan/amber/red` (definidos con bg-cyan-*, bg-amber-*, etc. en sunmi.css) y de clases Tailwind directas en JSX (`text-slate-*`, `bg-slate-*`, `hover:bg-slate-*`, `bg-black/50`, `text-slate-900`) en lugar de variables o clases theme-safe (p. ej. sunmi-pos-*, vars --app-*).

---

## 6. Propuesta de refactor mínimo (sin romper lógica)

- **Unificar header en un solo bloque:** Un único encabezado tipo "Stock" + nombre del local seleccionado (o "Sin local"). Eliminar la cabecera actual que tiene "Stock de Locales" + nombre como bloque aparte, y no repetir "Stock del Local" encima de la tabla.
- **Filtros en una fila compacta:** Mover los controles de FiltrosStock a una sola fila (o fila + segunda línea de checkboxes si hace falta) **encima de la tabla**, sin tarjeta propia y sin el título "Filtros". Mantener la misma API (props/localSeleccionado/onFiltroChange/onReset) y la lógica interna de FiltrosStock; solo cambiar dónde se renderiza y el layout (ej. en page o en un bloque sin card).
- **Eliminar el panel/título "Stock del Local":** En TablaStock, quitar el `div.sunmi-card` que envuelve todo y el `div.sunmi-header-cyan` "Stock del Local". Dejar solo la tabla (y su contenedor overflow) + paginación; opcionalmente envolver en un contenedor sin card o con una clase de bloque único. El estado "sin contexto" (mensaje "No hay contexto operativo activo") puede mostrarse con un bloque simple sin barra cyan.
- **Opcional (theme):** Sustituir progresivamente `sunmi-header-cyan` y `sunmi-btn-*` por componentes o clases que usen variables (p. ej. SunmiHeader con theme o clases POS theme-safe) para que el módulo respete el theme.

---

## 7. Plan de cambios mínimos (archivos a tocar, sin código)

1. **app/modulos/stock_locales/page.jsx**
   - Reemplazar la cabecera actual (sunmi-card + "Stock de Locales" + nombre) por un único header compacto: "Stock" + local seleccionado.
   - Integrar los filtros en la misma página: o bien renderizar el contenido de FiltrosStock (buscador, selects, checkboxes, Limpiar) en una fila/barra compacta encima de donde hoy está TablaStock, sin tarjeta "Filtros", o bien hacer que FiltrosStock acepte un prop de "modo compacto" y no renderice card ni título.

2. **components/stock_locales/FiltrosStock.jsx**
   - Permitir modo sin card ni título: por ejemplo prop `compact` o `showCard={false}` que omita el `div.sunmi-card` y el `div.sunmi-header-cyan` "Filtros", dejando solo el contenido (input, botón, selects, checkboxes) para que page.jsx lo coloque en la fila compacta.

3. **components/stock_locales/TablaStock.jsx**
   - Quitar el wrapper `div.sunmi-card` y el `div.sunmi-header-cyan` "Stock del Local" (y el bloque "Stock" cuando no hay contexto). Mantener solo el contenido: mensaje de loading/error, tabla, paginación. Opcionalmente envolver en un `div` sin card para espaciado.
   - Ajustar el estado "sin contexto": mostrar el mensaje en un bloque simple (sin barra cyan), o delegar ese mensaje a page.jsx si se prefiere.

4. **Modales (ModalAjuste, ModalLimites)**  
   - No obligatorios para el refactor de estructura; si se quiere homogeneizar tema después, sustituir en otro paso las clases hardcodeadas (`text-slate-*`, `bg-black/50`, `sunmi-btn-cyan`) por variables o clases theme-safe.

5. **Estilos (opcional)**  
   - Si se unifica uso de headers/botones con el resto del ERP: en `styles/sunmi.css` (o donde corresponda) las clases `sunmi-header-cyan` y `sunmi-btn-*` ya existen; el cambio sería solo en qué componentes las usan (o sustituirlas por SunmiHeader / botones con vars). No es necesario tocar sunmi.css para cumplir solo la propuesta de 1 header + filtros compactos + tabla sin panel redundante.

---

## 8. Resumen

- **Entrypoint:** `app/modulos/stock_locales/page.jsx`; componentes: FiltrosStock, TablaStock, ModalAjuste, ModalLimites.
- **Títulos:** "Stock de Locales" en page (66-71), "Filtros" en FiltrosStock (58), "Stock del Local" / "Stock" en TablaStock (160, 150). Barras cyan = clase `sunmi-header-cyan` en sunmi.css.
- **Hardcodes:** listados por archivo y línea (text-slate-*, bg-slate-*, sunmi-btn-*, bg-black/50, etc.).
- **Refactor propuesto:** Un header único "Stock" + local; filtros en fila compacta sin card "Filtros"; eliminar panel/título "Stock del Local" en TablaStock; archivos a tocar: page.jsx, FiltrosStock.jsx, TablaStock.jsx (y opcionalmente modales/estilos para theme).

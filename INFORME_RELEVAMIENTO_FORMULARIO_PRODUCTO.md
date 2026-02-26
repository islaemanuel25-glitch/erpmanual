# Relevamiento completo — Formulario de producto (ERP Azul)

**Objetivo:** Estructura real, campos, wrappers, estilos y componentes disponibles para rediseñar visualmente el formulario sin tocar lógica.  
**Alcance:** Solo relevamiento e informe; no implementación.

---

## A) MAPEO DE CAMPOS

Formulario actual en **`components/productos/FormProducto.jsx`**. Orden de aparición y detalle por bloque.

### Bloque "Identidad" (SunmiSeparator "Identidad")

| Campo        | Tipo        | Componente usado   | Archivo : línea aprox |
|-------------|-------------|--------------------|------------------------|
| Nombre *    | input text  | SunmiInput         | FormProducto.jsx : 228-230 |
| Código barras | input text | SunmiInput         | FormProducto.jsx : 232-234 |
| SKU         | input text  | SunmiInput         | FormProducto.jsx : 236-238 |
| Descripción | input text  | SunmiInput         | FormProducto.jsx : 240-242 (Field con colSpan) |

### Bloque "Catálogos"

| Campo      | Tipo   | Componente usado   | Archivo : línea aprox |
|-----------|--------|--------------------|------------------------|
| Categoría | select | SunmiSelectAdv + SunmiSelectOption | FormProducto.jsx : 250-264 |
| Área física | select | SunmiSelectAdv + SunmiSelectOption | FormProducto.jsx : 266-282 |

### Bloque "Proveedores"

| Campo       | Tipo   | Componente usado   | Archivo : línea aprox |
|------------|--------|--------------------|------------------------|
| Proveedor 1 | select | SunmiSelectAdv + SunmiSelectOption | FormProducto.jsx : 288-302 |
| Proveedor 2 | select | SunmiSelectAdv + SunmiSelectOption | FormProducto.jsx : 304-318 |
| Proveedor 3 | select | SunmiSelectAdv + SunmiSelectOption | FormProducto.jsx : 320-334 |

### Bloque "Presentación"

| Campo       | Tipo        | Componente usado   | Archivo : línea aprox |
|------------|-------------|--------------------|------------------------|
| Unidad *   | select      | SunmiSelectAdv (unidad, pack, cajon, kg) | FormProducto.jsx : 340-358 |
| Factor pack | number     | SunmiInput type="number" | FormProducto.jsx : 360-373 |
| Peso (kg)  | number      | SunmiInput type="number" | FormProducto.jsx : 375-380 |
| Volumen (ml) | number   | SunmiInput type="number" | FormProducto.jsx : 382-387 |

### Bloque "Precios"

| Campo    | Tipo   | Componente usado   | Archivo : línea aprox |
|----------|--------|--------------------|------------------------|
| Costo *  | number | SunmiInput (onChange → onChangeCosto) | FormProducto.jsx : 393-398 |
| Margen % | number | SunmiInput (onChangeMargen) | FormProducto.jsx : 400-405 |
| Venta *  | number | SunmiInput (onChangeVenta) | FormProducto.jsx : 407-412 |
| IVA %    | number | SunmiInput         | FormProducto.jsx : 414-419 |

### Bloque "Otros"

| Campo            | Tipo        | Componente usado   | Archivo : línea aprox |
|-----------------|-------------|--------------------|------------------------|
| Precio sugerido | number      | SunmiInput         | FormProducto.jsx : 325-330 |
| Fecha vencimiento | date      | SunmiInput type="date" | FormProducto.jsx : 332-337 |
| Imagen URL      | input text  | SunmiInput         | FormProducto.jsx : 339-344 |

### Bloque "Opciones" (switches)

| Campo           | Tipo     | Componente usado   | Archivo : línea aprox |
|----------------|----------|--------------------|------------------------|
| Redondeo a $100 | toggle  | SunmiToggleEstado   | FormProducto.jsx : 350-358 |
| Es combo       | toggle   | SunmiToggleEstado   | FormProducto.jsx : 361-366 |
| Activo         | toggle   | SunmiToggleEstado   | FormProducto.jsx : 368-373 |

### Bloque "Reposición automática"

| Campo                    | Tipo   | Componente usado   | Archivo : línea aprox |
|-------------------------|--------|--------------------|------------------------|
| Modo de pedido          | select | SunmiSelectAdv (BULTO/UNIDAD), puede ir disabled | FormProducto.jsx : 381-398 |
| Cómo sale (depósito→locales) | select | SunmiSelectAdv (SOLO_BULTO/SOLO_UNIDAD) | FormProducto.jsx : 400-410 |

**Nota:** El payload incluye `modo_stock`; en el formulario actual no hay un control explícito para modo_stock (se envía default en handleSubmit). No hay campo "Modo stock" renderizado.

**Wrapper de cada campo:** el form usa un subcomponente local `Field({ label, children, colSpan })` (FormProducto.jsx : 416-422): envuelve en `div` con `flex flex-col gap-1`, label con `text-[11px] text-slate-400 mb-1 block`, y opcionalmente `md:col-span-2` si `colSpan`.

---

## B) ESTRUCTURA ACTUAL DE LAYOUT

- **Contenedor raíz del form:**  
  `<>` con dos bloques hermanos:
  1. `div` con `ref={scrollRef} className="space-y-4"` — aquí va todo el contenido del formulario.
  2. `div` con `className="mt-4 pt-4 border-t border-slate-800 flex justify-end gap-2"` — barra de acciones (Cancelar + botón submit).

- **¿Todo dentro de un solo div?**  
  Sí: todos los campos están dentro del primer `div` (space-y-4). No hay cards ni paneles internos; solo separadores y grids.

- **Grids:**  
  Se usan `grid grid-cols-1 md:grid-cols-*` en cada bloque:
  - Identidad: `grid-cols-1 md:grid-cols-2 gap-4`
  - Catálogos: `grid-cols-1 md:grid-cols-2 gap-4`
  - Proveedores: `grid-cols-1 md:grid-cols-3 gap-4`
  - Presentación: `grid-cols-1 md:grid-cols-4 gap-4`
  - Precios: `grid-cols-1 md:grid-cols-4 gap-4`
  - Otros: `grid-cols-1 md:grid-cols-3 gap-4`
  - Opciones (switches): `grid-cols-1 md:grid-cols-3 gap-4`
  - Reposición: `grid-cols-1 md:grid-cols-2 gap-4`

- **Wrappers tipo Section / Card / Panel:**  
  No se usan dentro del form. Solo:
  - **SunmiSeparator** con `label` para títulos de bloque ("Identidad", "Catálogos", "Proveedores", "Presentación", "Precios", "Otros", "Opciones", "Reposición automática").
  - **Field** (local) para cada par label + control.

- **Clases Tailwind principales del contenedor de campos:**  
  - Raíz: `space-y-4`  
  - Cada bloque: un `SunmiSeparator` seguido de un `div` con `grid grid-cols-1 md:grid-cols-* gap-4`.

---

## C) COMPONENTES UI DISPONIBLES EN EL PROYECTO

Componentes reutilizables encontrados (Sunmi y layout):

| Componente   | Path                             | Uso típico |
|--------------|-----------------------------------|------------|
| Card         | `components/sunmi/SunmiCard.jsx`  | Contenedor con tema (theme.card), rounded, shadow, padding. |
| CardHeader   | `components/sunmi/SunmiCardHeader.jsx` | Título de card + slot para acciones (children). |
| Panel        | `components/sunmi/SunmiPanel.jsx` | Similar a Card (theme.card, rounded-2xl), con prop `title` opcional y `noPadding`. |
| Section      | `components/sunmi/SunmiSection.jsx` | Bloque con `title`, `description`, `footer`, separador opcional; usa theme. |
| Separator    | `components/sunmi/SunmiSeparator.jsx` | Línea con label opcional (ya usado en el form). |
| Header       | `components/sunmi/SunmiHeader.jsx` | Barra de título (gradient, uppercase); no es “page header” con breadcrumb/volver. |
| Grid         | `components/sunmi/SunmiGrid.jsx`  | Existe; en FormProducto no se usa (se usa `div` con clases grid de Tailwind). |
| EntityCard   | `components/sunmi/SunmiEntityCard.jsx` | Card + CardHeader + cuerpo. |
| ModalLayout  | `components/sunmi/SunmiModalLayout.jsx` | Card + CardHeader para modales. |

**No existen como componentes reutilizables en el proyecto:**

- **PageHeader:** No hay componente con nombre PageHeader (breadcrumb + título + “Volver”). El header de página se arma con SunmiHeader u otros en cada vista.
- **StickyHeader:** No hay componente específico; se podría lograr con clases (`sticky top-0 z-10`).
- **Tabs:** No hay componente `Tabs` reutilizable. En `ActualizacionPreciosPage.jsx` los “tabs” son botones (SunmiButton) y estado local (`tab === "proveedor"` / `"excel"`).
- **Accordion:** No existe en `components/`.

---

## D) RESTRICCIONES TÉCNICAS

- **Tailwind:**  
  Sí, se usa Tailwind en todo el proyecto. Se puede usar clases libremente; el form ya usa `grid`, `gap-4`, `space-y-4`, `text-[11px]`, `text-slate-400`, etc.

- **Sistema de temas:**  
  Sí. **SunmiThemeProvider** (`components/sunmi/SunmiThemeProvider.jsx`) expone un contexto con `theme` (objeto por tema). Los temas están en **`lib/sunmiThemes.js`** (ej. `sunmiDark`). Cada tema define:
  - `layout` (bg, text)
  - `card` (bg, border)
  - `header` (bg, border, text)
  - `sidebar`, `table`, `badgeActivo`/`badgeInactivo`, etc.  
  Los componentes Sunmi (SunmiCard, SunmiPanel, SunmiSeparator, SunmiHeader, etc.) usan `useSunmiTheme()` y aplican clases del tema. Para un rediseño coherente conviene usar esos componentes o las mismas variables de tema (no hardcodear colores que ignoren el tema).

- **Convenciones de spacing / tamaños:**  
  No hay un archivo único de “design tokens”. En el form y en el resto del proyecto se ve:
  - `gap-4`, `gap-2`, `gap-1` para espaciado entre elementos.
  - `p-3`, `p-4` en cards.
  - `text-[11px]`, `text-[12px]`, `text-[13px]` para tipografía pequeña.
  - Labels del form: `text-[11px] text-slate-400`.  
  Mantener rangos similares (11–13px para secundario, gap-2/4) ayuda a no romper la sensación visual del resto de la app.

---

## E) PROPUESTA VISUAL (SIN CÓDIGO)

Estructura sugerida solo a nivel de bloques y responsividad. No implementación.

- **Contenedor principal:**  
  `<FormProducto>` (sin cambiar props ni lógica).
  - Opcional: **Header fijo/sticky** arriba (título “Nuevo producto” / “Editar producto” + botón Volver si es página), para que al hacer scroll sigan visibles título y navegación.

- **Bloques con Card por sección (recomendado):**
  - **Card "Identidad"**  
    Campos: Nombre *, Código barras, SKU, Descripción.  
    - Desktop: 2 columnas.  
    - Mobile: 1 columna.

  - **Card "Catálogos"**  
    Campos: Categoría, Área física.  
    - Desktop: 2 columnas.  
    - Mobile: 1 columna.

  - **Card "Proveedores"**  
    Campos: Proveedor 1, Proveedor 2, Proveedor 3.  
    - Desktop: 3 columnas.  
    - Mobile: 1 columna.

  - **Card "Presentación"**  
    Campos: Unidad *, Factor pack, Peso (kg), Volumen (ml).  
    - Desktop: 4 columnas (o 2+2).  
    - Mobile: 1 columna.

  - **Card "Precios"**  
    Campos: Costo *, Margen %, Venta *, IVA %.  
    - Desktop: 4 columnas.  
    - Mobile: 1 columna.

  - **Card "Otros"**  
    Campos: Precio sugerido, Fecha vencimiento, Imagen URL.  
    - Desktop: 3 columnas.  
    - Mobile: 1 columna.

  - **Card "Opciones"**  
    Switches: Redondeo a $100, Es combo, Activo.  
    - Desktop: 3 columnas.  
    - Mobile: 1 columna.

  - **Card "Reposición automática"**  
    Campos: Modo de pedido, Cómo sale (depósito→locales) + textos de ayuda.  
    - Desktop: 2 columnas.  
    - Mobile: 1 columna.

- **Pie del form:**  
  Barra fija o al final con bordes (como la actual): Cancelar + botón principal (Crear producto / Guardar cambios).

- **Componentes a usar:**  
  SunmiCard (o SunmiPanel) por bloque, con título de sección en el card (o SunmiCardHeader). SunmiSeparator se puede mantener entre cards o sustituir por el título del card. Los mismos SunmiInput, SunmiSelectAdv, SunmiToggleEstado y Field (o equivalente) dentro de cada card, sin cambiar lógica ni estado.

---

## F) ARCHIVOS A TOCAR

| Archivo | Motivo |
|---------|--------|
| **components/productos/FormProducto.jsx** | Contiene todo el form: estructura (divs, grids), SunmiSeparator, Field y campos. Aquí se aplicaría el rediseño: envolver cada bloque en SunmiCard/SunmiPanel, ajustar clases del contenedor raíz (y opcional header sticky), mantener mismos campos y handlers. |
| **components/productos/ModalProductoFinal.jsx** | Solo si se cambia algo del contenedor del modal (por ejemplo, quitar el scroll interno o añadir clase al wrapper). Actualmente solo envuelve FormProducto en SunmiCard y un div con max-h y overflow-y-auto; podría no tocarse si el rediseño es solo dentro de FormProducto. |

No es necesario tocar rutas, API ni estado: solo estructura y estilos dentro del form y, si se desea, el wrapper modal.

---

*Fin del relevamiento. Sin código implementado.*

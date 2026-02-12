# Reporte de Inconsistencias de UI

Analisis de TODOS los modulos en `/app/modulos/` comparados con los componentes Sunmi en `/components/sunmi/`.

**Archivos analizados:** 35+
**Modulos analizados:** 16
**Componentes Sunmi analizados:** 34
**Inconsistencias encontradas:** 45+
**Modulos afectados:** 11 de 16 (69%)

---

## 1. SunmiButton - Uso inconsistente

**Estandar Sunmi:** `color="amber|cyan|red"`, altura `h-[36px]`, text `text-[13px]`. No soporta props `variant`, `size`, `ghost`.

| Archivo | Linea aprox | Problema | Solucion |
|---------|-------------|----------|----------|
| `app/modulos/categorias/page.jsx` | ~192-238 | Usa `variant="secondary"`, `variant="danger"`, `variant="ghost"` que no existen en SunmiButton | Reemplazar por `color="cyan"`, `color="red"`, `color="amber"` |
| `app/modulos/transferencias/page.jsx` | ~211-269 | Usa `size="sm"`, `size="xs"`, `variant="outline"` — props no definidos | Eliminar props inexistentes, usar solo `color` |
| `app/modulos/proveedores/page.jsx` | ~234-242 | Mezcla SunmiButton con `<button>` nativo para editar/eliminar | Usar SunmiButton consistentemente o SunmiButtonIcon |
| `app/modulos/proveedores/page.jsx` | ~259-266 | Emojis como iconos de accion (pencil, trash) en `<button>` nativo | Usar lucide-react icons con SunmiButton |

---

## 2. SunmiSelect - Uso inconsistente

**Estandar Sunmi:** `SunmiSelect` (nativo con theme) o `SunmiSelectAdv` (custom dropdown). Ambos usan `useSunmiTheme()`.

| Archivo | Linea aprox | Problema | Solucion |
|---------|-------------|----------|----------|
| `components/productos/stock_locales/FiltrosStock.jsx` | ~84-106 | Usa `<select>` nativo con clase `.sunmi-input` inventada | Reemplazar por `SunmiSelect` |
| `app/modulos/transferencias/page.jsx` | ~162-180 | `<select>` nativo con colores hardcodeados `bg-slate-900/60 border border-slate-600` | Reemplazar por `SunmiSelect` |
| `components/productos/stock_locales/FiltrosStock.jsx` | ~76 | Usa clase `.sunmi-btn-red` que no existe | Usar `SunmiButton color="red"` |

---

## 3. SunmiInput - Uso inconsistente

**Estandar Sunmi:** padding `px-2 py-1.5`, text `text-[13px]`, usa `useSunmiTheme()` para colores.

| Archivo | Linea aprox | Problema | Solucion |
|---------|-------------|----------|----------|
| `components/productos/FiltrosProductos.jsx` | ~51 | Usa prop `icon="search"` que no existe en SunmiInput | Eliminar prop o agregar soporte de icono a SunmiInput |
| `components/productos/stock_locales/FiltrosStock.jsx` | ~63-72 | `<input>` nativo con colores hardcodeados `bg-slate-900 border border-slate-700` | Reemplazar por `SunmiInput` |

---

## 4. SunmiCard / Panel / Section

**Estandar Sunmi:** `SunmiCard` como wrapper principal. `SunmiPanel` y `SunmiSection` disponibles pero poco usados.

| Archivo | Linea aprox | Problema | Solucion |
|---------|-------------|----------|----------|
| Modulos stock_locales | varios | No usan `SunmiCard` como wrapper externo | Envolver contenido en `SunmiCard` |
| `app/modulos/transferencias/[id]/page.jsx` | varios | Usa divs con clases manuales en vez de SunmiCard | Usar `SunmiCard` para secciones |

---

## 5. HTML nativo vs Sunmi equivalente

| Archivo | Linea aprox | Elemento nativo | Sunmi equivalente |
|---------|-------------|-----------------|-------------------|
| `stock_locales/FiltrosStock.jsx` | ~63 | `<input>` | `SunmiInput` |
| `stock_locales/FiltrosStock.jsx` | ~84 | `<select>` | `SunmiSelect` |
| `transferencias/page.jsx` | ~165 | `<select>` | `SunmiSelect` |
| `transferencias/page.jsx` | ~179 | `<select>` | `SunmiSelect` |
| `proveedores/page.jsx` | ~259 | `<button>` | `SunmiButton` |
| `stock_locales/` | varios | `<tr>/<td>` directos | `SunmiTableRow` |
| `productos/ModalProductoFinal.jsx` | varios | `div` overlay custom | `SunmiModalLayout` |
| `stock_locales/ModalAjuste.jsx` | varios | `div` overlay custom | `SunmiModalLayout` |
| `stock_locales/ModalLimites.jsx` | varios | `div` overlay custom | `SunmiModalLayout` |

---

## 6. Theme: useSunmiTheme() - Respeto del sistema de temas

### Modulos que respetan el theme
- `app/modulos/productos/page.jsx` (via componentes Sunmi)
- `app/modulos/usuarios/page.jsx`
- `app/modulos/categorias/page.jsx`
- `app/modulos/roles/page.jsx`
- `app/modulos/configuracion/apariencia/page.jsx`

### Modulos con colores hardcodeados (NO respetan theme)

| Archivo | Linea aprox | Color hardcodeado | Deberia ser |
|---------|-------------|-------------------|-------------|
| `stock_locales/FiltrosStock.jsx` | ~63 | `bg-slate-900 border border-slate-700` | `useSunmiTheme()` → `theme.card` |
| `transferencias/page.jsx` | ~165 | `bg-slate-900/60 border border-slate-600` | `useSunmiTheme()` → `theme.card` |
| `transferencias/page.jsx` | ~179 | `bg-slate-900/60 border border-slate-600` | `useSunmiTheme()` → `theme.card` |
| `transferencias/page.jsx` | ~161 | `text-slate-100 text-xs` labels | `text-[11px] text-slate-400` (estandar) |

---

## 7. Responsive - Uso de grid

### Patrones encontrados (inconsistentes)

| Modulo | Patron usado | Correcto? |
|--------|-------------|-----------|
| `productos/page.jsx` | `grid grid-cols-1 md:grid-cols-3` | Si |
| `usuarios/page.jsx` | `flex flex-col md:flex-row md:items-center` | Si (flex) |
| `categorias/page.jsx` | `w-full` en flex containers | Aceptable |
| `stock_locales/` | Sin responsive, tablas fijas | No |
| `transferencias/page.jsx` | Mezcla flex/grid sin patron claro | No |

### Tablas sin overflow responsive
- `stock_locales/` — tablas sin `overflow-x-auto`
- Algunas tablas en `transferencias/` — sin wrapper responsive

---

## 8. Spacing - Gap, padding, margin inconsistentes

**Estandar inferido del mejor modulo (productos):**
- Card padding: `p-2` o `p-3`
- Gap entre secciones: `gap-2`
- Separator margin: `!my-1` (override del default `my-2`)
- Table cell padding: `px-2 py-1.5`
- Labels: `mb-1`

### Inconsistencias

| Archivo | Linea aprox | Spacing actual | Deberia ser |
|---------|-------------|----------------|-------------|
| `SunmiTablaProductos.jsx` | ~170 | `px-3 py-1.5 text-[13px]` en celdas | `px-2 py-1.5 text-[12px]` (estandar SunmiTable) |
| `categorias/page.jsx` | ~216 | `px-3 py-2` en celdas de tabla | `px-2 py-1.5` |
| `transferencias/page.jsx` | ~161 | `text-slate-100 text-xs` en labels | `text-[11px] text-slate-400` |
| `proveedores/page.jsx` | ~149 | `my-4` en separadores | `!my-1` (compacto como productos) |

---

## 9. Problemas adicionales encontrados

### Props incorrectos (bugs)

| Archivo | Linea aprox | Bug | Fix |
|---------|-------------|-----|-----|
| `categorias/page.jsx` | ~212 | Usa `mensaje=` en SunmiTableEmpty | Cambiar a `message=` (prop correcto) |
| `categorias/page.jsx` | ~184 | Pasa `options=` como prop a SunmiSelectAdv | Usar `children` con `<SunmiSelectOption>` |

### Loading states inconsistentes

| Archivo | Patron | Deberia ser |
|---------|--------|-------------|
| `productos/page.jsx` | Texto "Cargando..." | `<SunmiLoader />` |
| `transferencias/[id]/page.jsx` | Texto "Cargando..." | `<SunmiLoader />` |
| `categorias/page.jsx` | `<SunmiLoader />` | Correcto |
| Stock modulo | Div custom | `<SunmiLoader />` |

### Modales sin SunmiModalLayout

| Archivo | Implementacion actual |
|---------|----------------------|
| `productos/ModalProductoFinal.jsx` | `fixed inset-0 bg-black/60 z-[9999]` custom |
| `stock_locales/ModalAjuste.jsx` | Custom overlay |
| `stock_locales/ModalLimites.jsx` | Custom overlay |
| `proveedores/ModalProveedor.jsx` | Custom overlay |

Todos deberian usar `SunmiModalLayout` que ya provee overlay, centrado, footer y z-index estandarizado.

---

## Resumen por severidad

| Severidad | Cantidad | Areas afectadas |
|-----------|----------|-----------------|
| **CRITICA** | 8 | Button variants inexistentes, Select nativos, Theme no usado |
| **ALTA** | 12 | Colores hardcodeados, Componentes faltantes, Props incorrectos |
| **MEDIA** | 15 | Spacing inconsistente, Responsive faltante, Labels distintos |
| **BAJA** | 10 | Spacing menor, Emojis vs icons, Nombres de clases |

---

## Modulo referencia (MEJOR patron UI)

### `app/modulos/productos/page.jsx`

Es el modulo con MEJOR patron UI porque:

1. **Usa todos los componentes Sunmi correctamente**: SunmiCard, SunmiSeparator, SunmiButton (solo amber/cyan), SunmiSelect, SunmiTable
2. **Tabs implementados limpiamente**: botones con estados activo/inactivo usando amber-400
3. **Labels consistentes**: `text-[11px] text-slate-400 mb-1 block`
4. **Grid responsive**: `grid grid-cols-1 md:grid-cols-3`
5. **Spacing uniforme**: gap-2/gap-3, `!my-1` en separadores
6. **Respeta el theme**: todos los componentes usan `useSunmiTheme()` internamente
7. **Import/Export bien estructurado**: secciones claras con SunmiSeparator
8. **Preview table con badges**: badges de accion coloreados por estado
9. **Error handling visual**: mensajes en cajas con bordes coloreados

**Recomendacion**: Usar `productos/page.jsx` como template base para estandarizar el resto de modulos.

### Segundo mejor: `app/modulos/usuarios/page.jsx`
- Buen uso de SunmiSelectAdv para filtros
- Responsive correcto con flex
- Usa SunmiBadgeEstado correctamente

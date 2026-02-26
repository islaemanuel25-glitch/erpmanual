# Reporte de Inconsistencias de Componentes Sunmi

Auditoria tecnica del uso de componentes Sunmi en toda la aplicacion.
Solo analiza uso TECNICO de componentes, no estructura de modulos.

---

## 1. Uso de componentes nativos HTML vs Sunmi

### Resumen

| Elemento nativo | Instancias | Sunmi equivalente |
|-----------------|------------|-------------------|
| `<select>` | 13 | `SunmiSelect` / `SunmiSelectAdv` |
| `<input>` | 20 | `SunmiInput` |
| `<button>` | 38 | `SunmiButton` / `SunmiButtonIcon` |
| **Total** | **71** | |

### `<select>` nativos (13 instancias)

| Archivo | Linea aprox | Contexto |
|---------|-------------|----------|
| `app/modulos/transferencias/page.jsx` | ~162 | Filtro de estado |
| `app/modulos/transferencias/page.jsx` | ~176 | Filtro de local |
| `components/transferencias/TablaDetalleTransferencia.jsx` | ~82 | Motivo principal |
| `components/pos-transferencias/nueva/PreparadosTable.jsx` | ~43 | Filas por pagina |
| `components/pos-transferencias/nueva/PreparadosTable.jsx` | ~203 | Selector de unidad |
| `components/pos-transferencias/nueva/FiltrosDeposito.jsx` | ~21 | Area fisica |
| `components/pos-transferencias/nueva/FiltrosDeposito.jsx` | ~35 | Categoria |
| `components/pos-transferencias/nueva/TablaSugeridos.jsx` | ~257 | Selector de unidad |
| `components/stock_locales/FiltrosStock.jsx` | ~84 | Categoria |
| `components/stock_locales/FiltrosStock.jsx` | ~92 | Proveedor |
| `components/stock_locales/FiltrosStock.jsx` | ~100 | Area fisica |
| `components/stock_locales/ModalAjuste.jsx` | ~162 | Tipo de ajuste |

### `<input>` nativos (20 instancias)

| Archivo | Linea aprox | Tipo |
|---------|-------------|------|
| `components/stock_locales/FiltrosStock.jsx` | ~65 | text (busqueda) |
| `components/stock_locales/FiltrosStock.jsx` | ~112, 122, 132 | number (stock) |
| `components/stock_locales/ModalAjuste.jsx` | ~106, 119, 146 | number/text |
| `components/stock_locales/ModalLimites.jsx` | ~72, 81 | number |
| `components/transferencias/TablaDetalleTransferencia.jsx` | ~57, 114 | number |
| `components/transferencias/ColumnSettingsModal.jsx` | ~72 | text |
| `components/pos-transferencias/nueva/BuscadorManual.jsx` | ~167 | text |
| `components/pos-transferencias/nueva/PreparadosTable.jsx` | ~182 | number |
| `components/pos-transferencias/nueva/TablaSugeridos.jsx` | ~232 | number |
| `components/productos/ColumnManager.jsx` | ~83 | text |
| `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx` | ~721 | file |
| `components/productos/actualizacion-precios/PreviewPreciosTable.jsx` | ~35, 60 | number |

### `<button>` nativos (38 instancias)

Distribuidos en modulos de POS transferencias, stock, transferencias, proveedores (acciones editar/eliminar con emojis) y multiples modales custom.

---

## 2. Props inconsistentes / incorrectos

### SunmiButton - Props que NO existen

**API real de SunmiButton:**
```jsx
// UNICAS props validas:
<SunmiButton color="amber|cyan|red" disabled={bool} onClick={fn}>
  texto
</SunmiButton>
```

#### `color="slate"` — NO EXISTE (16 instancias)

| Archivo | Linea aprox |
|---------|-------------|
| `app/modulos/grupos/page.jsx` | ~297, 397, 405 |
| `app/modulos/grupos/nuevo/page.jsx` | ~71 |
| `app/modulos/locales/page.jsx` | ~236, 294, 302 |
| `app/modulos/proveedores/page.jsx` | ~170, 281, 289 |
| `app/modulos/roles/page.jsx` | ~183, 237, 245 |
| `app/modulos/usuarios/page.jsx` | ~265, 328, 336 |

**Efecto:** El boton renderiza con estilo de `color="cyan"` (default) porque "slate" no esta en el mapa de estilos.

**Correccion:** Agregar "slate" al mapa de estilos de SunmiButton, o reemplazar por color valido.

#### `variant=` — NO EXISTE (7 instancias)

| Archivo | Linea aprox | Valor usado |
|---------|-------------|-------------|
| `app/modulos/categorias/page.jsx` | ~169 | `variant="secondary"` |
| `app/modulos/transferencias/page.jsx` | ~211, 263, 267 | `variant="outline"`, `variant="ghost"` |
| `components/categorias/ModalCategoria.jsx` | ~151 | `variant="secondary"` |
| `components/sunmi/SunmiTableMaster.jsx` | ~116, 124 | `variant="outline"` |

**Efecto:** Prop ignorado silenciosamente. Boton renderiza con color default.

#### `size=` — NO EXISTE (3 instancias)

| Archivo | Linea aprox | Valor usado |
|---------|-------------|-------------|
| `app/modulos/transferencias/page.jsx` | ~211 | `size="sm"` |
| `app/modulos/transferencias/page.jsx` | ~263, 267 | `size="xs"` |

**Efecto:** Prop ignorado. Todos los botones son 36px de alto.

### SunmiSeparator - `color=` NO EXISTE (14 instancias)

| Archivo | Linea aprox | Valor |
|---------|-------------|-------|
| `app/modulos/grupos/nuevo/page.jsx` | ~59 | `color="amber"` |
| `app/modulos/grupos/page.jsx` | ~160, 201 | `color="amber"` |
| `app/modulos/locales/page.jsx` | ~128, 168 | `color="amber"` |
| `app/modulos/proveedores/page.jsx` | ~118, 159 | `color="amber"` |
| `app/modulos/roles/page.jsx` | ~106, 145 | `color="amber"` |
| `app/modulos/transferencias/page.jsx` | ~155, 222 | `color="amber"` |
| `app/modulos/transferencias/[id]/page.jsx` | ~62 | `color="amber"` |
| `app/modulos/usuarios/page.jsx` | ~120, 159 | `color="amber"` |

**Efecto:** Prop ignorado. SunmiSeparator toma color del theme automaticamente.

### SunmiCardHeader - `titulo=` en vez de `title=`

| Archivo | Linea aprox | Problema |
|---------|-------------|----------|
| `components/categorias/ModalCategoria.jsx` | ~125 | `titulo="Editar categoría"` en vez de `title=` |

**Efecto:** El titulo NO se renderiza (prop incorrecto).

### SunmiTableEmpty - `mensaje=` en vez de `message=`

| Archivo | Linea aprox | Problema |
|---------|-------------|----------|
| Verificar `categorias/page.jsx` | ~212 | Posible uso de `mensaje=` |

**Prop correcto:** `message="Sin datos"` y `colSpan={N}`

---

## 3. Themes

### Como funciona el sistema de temas

```
SunmiThemeProvider (en layout.jsx)
  → useSunmiTheme() hook
    → { themeKey, theme, setThemeKey }
      → theme.layout (bg + text del body)
      → theme.card (bg + border de cards)
      → theme.table.header / theme.table.row
      → theme.badgeActivo / theme.badgeInactivo
```

**Temas disponibles:** sunmiDark (default), sunmiDarkCompact, sunmiLight

### Componentes que usan useSunmiTheme() internamente

Todos los componentes Sunmi lo usan. Si se usa SunmiSelect en vez de `<select>`, los colores se adaptan automaticamente.

### Archivos con colores hardcodeados (NO respetan theme)

| Archivo | Colores hardcodeados |
|---------|---------------------|
| `app/modulos/transferencias/page.jsx` | `bg-slate-900/60`, `border-slate-600`, `text-slate-100` |
| `app/modulos/pos-transferencias/page.jsx` | `bg-slate-900`, `border-slate-700` |
| `app/modulos/pos-transferencias/nueva/page.jsx` | `bg-slate-950`, `border-slate-800` |
| `components/stock_locales/FiltrosStock.jsx` | `bg-slate-900`, `border-slate-700` |
| `components/stock_locales/ModalAjuste.jsx` | `bg-slate-900`, `border-slate-700` |
| `components/stock_locales/ModalLimites.jsx` | `bg-slate-900`, `border-slate-700` |
| `components/transferencias/TablaDetalleTransferencia.jsx` | `bg-slate-900`, `border-slate-700` |
| `components/transferencias/ColumnSettingsModal.jsx` | `bg-slate-900`, `border-slate-700` |
| `components/pos-transferencias/nueva/*.jsx` | Multiples archivos con colores hardcodeados |
| `components/productos/actualizacion-precios/*.jsx` | `bg-slate-900`, `border-slate-800` |

**Total:** 40+ archivos con colores que no se adaptan al cambiar theme.

**Impacto:** Si el usuario cambia a sunmiLight, estos elementos quedan oscuros.

---

## 4. Responsive

### Patrones de grid encontrados

| Patron | Modulos que lo usan | Responsive? |
|--------|--------------------|----|
| `grid grid-cols-1 md:grid-cols-3` | productos (export filters) | Si |
| `grid grid-cols-1 md:grid-cols-2` | productos (import filters) | Si |
| `flex flex-col md:flex-row` | usuarios, grupos, locales, roles | Si |
| `flex gap-3` sin breakpoint | stock_locales, POS transferencias | No |
| Sin grid/flex | algunos modales | No |

### Modulos con problemas en mobile

| Modulo | Problema |
|--------|----------|
| `stock_locales` | Filtros no colapsan en mobile, tablas sin `overflow-x-auto` |
| `pos-transferencias/nueva` | Layout de 2 paneles sin breakpoint responsive |
| `transferencias/[id]` | Tabla de detalle sin responsive wrapper |

### Modulos con buen responsive

| Modulo | Patron |
|--------|--------|
| `productos/page.jsx` | Grid responsive en export, flex responsive en acciones |
| `usuarios/page.jsx` | `flex flex-col md:flex-row` consistente |
| `grupos/page.jsx` | Botones con `flex-col sm:flex-row` |

---

## 5. Labels en inputs

### SunmiInput NO tiene prop `label`

El componente SunmiInput es un wrapper de `<input>` sin soporte de label integrado.

### Patrones encontrados

| Patron | Ejemplo | Frecuencia | Correcto? |
|--------|---------|------------|-----------|
| **A:** Label separado | `<label className="text-[11px] text-slate-400 mb-1 block">Nombre</label><SunmiInput />` | 12 usos | Si (recomendado) |
| **B:** Label con estilos diferentes | `<label className="text-slate-100 text-xs mb-1 block">` | 4 usos | No (colores hardcodeados) |
| **C:** Solo placeholder | `<SunmiInput placeholder="Buscar..." />` | 15+ usos | Aceptable para busqueda |
| **D:** Sin label ni placeholder | `<SunmiInput />` | 3 usos | No (sin contexto para usuario) |

### Patron recomendado

```jsx
// CORRECTO — label separado con estilo estandar
<div>
  <label className="text-[11px] text-slate-400 mb-1 block">Campo</label>
  <SunmiInput value={x} onChange={fn} />
</div>
```

### Inconsistencias de styling en labels

| Archivo | Estilo de label | Deberia ser |
|---------|----------------|-------------|
| `transferencias/page.jsx` | `text-slate-100 text-xs` | `text-[11px] text-slate-400` |
| `grupos/nuevo/page.jsx` | `text-sm text-slate-300` | `text-[11px] text-slate-400` |
| `productos/page.jsx` | `text-[11px] text-slate-400` | Correcto (referencia) |

---

## 6. Feedback (errores / exito)

### Patrones de feedback usados

| Patron | Instancias | Modulos |
|--------|------------|---------|
| `alert()` nativo | 30+ | Todos los modulos |
| `div` con colores custom | 5 | productos (import/export), actualizacion-precios |
| Toast / notificacion | 0 | Ninguno |
| SunmiComponent de feedback | 0 | No existe |

### Detalle de `alert()` por modulo

| Modulo | Cantidad de alerts |
|--------|--------------------|
| `categorias/page.jsx` | 4 |
| `grupos/page.jsx` | 2 |
| `grupos/nuevo/page.jsx` | 2 |
| `locales/page.jsx` | 2 |
| `productos/page.jsx` | 3 |
| `proveedores/page.jsx` | 3 |
| `roles/page.jsx` | 2 |
| `transferencias/page.jsx` | 2 |
| `usuarios/page.jsx` | 3 |
| Componentes varios | 7+ |

**Problema:** `alert()` es bloqueante, no tematizable, y rompe la experiencia de usuario.

**Recomendacion:** Crear `SunmiToast` o usar libreria como `react-hot-toast`.

---

## 7. Spacing

### Gap mas comunes

| Valor | Frecuencia | Uso tipico |
|-------|------------|------------|
| `gap-1` | Bajo | Botones compactos |
| `gap-2` | Alto | Contenido dentro de cards |
| `gap-3` | Alto | Grids de filtros, secciones |
| `gap-4` | Medio | Secciones principales |
| `gap-6` | Bajo | Separacion mayor |

### Padding de contenedores

| Valor | Frecuencia | Uso tipico |
|-------|------------|------------|
| `p-2` | Alto | Paginas principales |
| `p-3` | Medio | SunmiCard default |
| `p-4` | Medio | Modales, secciones |
| `p-6` | Bajo | Cards espaciosas |

### Patron recomendado (basado en productos/page.jsx)

```
Pagina: p-2
  SunmiCard: (p-3 default)
    Contenido: flex flex-col gap-2
      Separadores: SunmiSeparator className="!my-1"
      Grids de filtros: grid grid-cols-1 md:grid-cols-3 gap-3
      Labels: text-[11px] text-slate-400 mb-1 block
      Acciones: flex gap-2
```

---

## Componentes Sunmi que existen pero NO se usan

| Componente | Descripcion | Potencial uso |
|------------|-------------|---------------|
| `SunmiTableMaster.jsx` | Tabla con paginacion integrada | Reemplazar tablas custom con paginacion |
| `SunmiModalLayout.jsx` | Layout de modal con overlay, titulo, footer | Reemplazar 5+ modales custom |
| `SunmiEstadoCell.jsx` | Celda de tabla con badge de estado | Reemplazar badges en tablas |
| `SunmiGrid.jsx` | Grid auto-responsive | Reemplazar grids manuales |
| `SunmiRow.jsx` | Layout flex left/right | Raramente usado (1 import) |
| `SunmiLoader.jsx` | Spinner tematizado | Reemplazar textos "Cargando..." |

### Duplicados que deberian consolidarse

| Componente A | Componente B | Diferencia | Recomendacion |
|-------------|-------------|------------|---------------|
| `SunmiBadge` | `SunmiBadgeEstado` | Prop: `estado` vs `value` | Unificar en uno solo |

---

## Patrones que se repiten y deberian ser componentes Sunmi

| Patron repetido | Donde aparece | Componente sugerido |
|-----------------|---------------|---------------------|
| Label + Input wrapper | 12+ archivos | `SunmiField` (label + input + error) |
| Confirm dialog | 8+ archivos (`confirm()`) | `SunmiConfirmDialog` |
| Feedback message | 5+ archivos (divs coloreados) | `SunmiToast` o `SunmiAlert` |
| Filter bar (search + selects + reset) | 5+ modulos | `SunmiFilterBar` |
| Pagination (prev/next buttons) | 6+ modulos | Ya existe en `SunmiTableMaster` (no usado) |

---

## Modulos referencia

### TIPO A (CRUD simple) — Mejor uso de Sunmi

**`app/modulos/usuarios/page.jsx`**

- Usa SunmiCard, SunmiSeparator, SunmiButton, SunmiSelectAdv, SunmiInput correctamente
- SunmiBadgeEstado para estado activo/inactivo
- Layout responsive con `flex flex-col md:flex-row`
- Paginacion con SunmiButton
- Unico problema: `color="slate"` en botones de paginacion (16 instancias globales)

### TIPO B (complejo) — Mejor uso de Sunmi

**`app/modulos/productos/page.jsx`**

- Tabs limpios con estados activo/inactivo
- Import/Export con SunmiSelect para filtros, SunmiTable para preview
- Labels consistentes: `text-[11px] text-slate-400 mb-1 block`
- Grid responsive: `grid-cols-1 md:grid-cols-3`
- Badges de accion coloreados por estado en preview
- Manejo de errores visual (no solo alert)
- Unico problema menor: texto "Cargando..." en vez de SunmiLoader

---

## Resumen de acciones por prioridad

### Inmediatas (bugs)
1. Fix `titulo=` → `title=` en `ModalCategoria.jsx` (titulo no se renderiza)
2. Fix `color="slate"` en SunmiButton (16 instancias) — agregar "slate" al componente o cambiar a color valido

### Alta prioridad
3. Reemplazar 13 `<select>` nativos por SunmiSelect
4. Eliminar props inexistentes: `variant`, `size` de SunmiButton (10 instancias)
5. Eliminar prop `color` de SunmiSeparator (14 instancias — no hace nada)

### Media prioridad
6. Reemplazar 20 `<input>` nativos por SunmiInput
7. Reemplazar colores hardcodeados por theme (40+ archivos)
8. Usar SunmiModalLayout en vez de modales custom (5+ modales)
9. Usar SunmiLoader en vez de textos "Cargando..." (4+ modulos)
10. Implementar sistema de toast/notificaciones (reemplazar 30+ alerts)

### Baja prioridad
11. Eliminar componentes muertos: SunmiTableMaster, SunmiEstadoCell
12. Consolidar SunmiBadge + SunmiBadgeEstado en uno solo
13. Estandarizar label styling a `text-[11px] text-slate-400 mb-1 block`
14. Agregar responsive a modulos stock_locales y POS transferencias

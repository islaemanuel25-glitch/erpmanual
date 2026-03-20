# Auditoría de compatibilidad con themes — Dashboard

## 1. Diagnóstico general

El dashboard usa **parcialmente** el sistema de temas del ERP:

- **Bien:** Uso de `theme.card` (vía `useSunmiTheme()`) en varios contenedores; `SunmiCard` (que aplica `theme.card`) en listas y bloques; bordes con `border-current/[0.06]` que heredan el color de texto del tema.
- **Mal:** Hovers basados solo en `dark:` (binario light/dark); CTA principal y acentos fijos en azul; badges y colores de iconos hardcodeados (Tailwind); overlay del modal fijo; textos secundarios solo con `opacity-*` sin clases semánticas del proyecto; ningún uso de clases `sunmi-*` ni de variables CSS `--app-*` / `--pos-*` en el dashboard.

El sistema real del proyecto tiene dos capas:

1. **Tokens JS** (`lib/sunmiThemes.js` + `useSunmiTheme()`): `theme.card`, `theme.header`, `theme.sidebar`, `theme.table`, `theme.badgeActivo`/`badgeInactivo`. No hay `theme.surface`, `theme.primary`, `theme.muted`, etc.
2. **CSS variables** (`app/globals.css` por `data-theme`) y **clases semánticas** (`styles/sunmi.css`): `--app-bg`, `--app-fg`, `--app-border`, `--card-bg`, `--card-border`, `--hover-bg`, `--pos-accent`, `--pos-link`, `--pos-muted`, `--pos-surface`, `--pos-overlay`, etc., y clases como `.sunmi-text-muted`, `.sunmi-text-accent`, `.sunmi-surface-soft`, `.sunmi-divider`, `.sunmi-row-hover`, etc.

Los temas se aplican con `data-theme` en `<html>`, no con la clase `dark` de Tailwind. Por eso, depender de `dark:` en el dashboard hace que en temas como Sand, France o Blue Classic el resultado sea incoherente o “lavado”.

---

## 2. Archivo por archivo

### 2.1 `components/dashboard/AccesosRapidos.jsx`

| Qué | Estado | Problema |
|-----|--------|----------|
| Contenedor de cada tile | OK | Usa `theme.card` + `shadow-sm`. |
| Hover / borde del tile | Frágil | `hover:bg-current/[0.04]`, `border-current/[0.04]`, `hover:border-current/[0.08]` — heredan de `theme.card`, aceptable. |
| Fondos e iconos de color | Incompatible | `TILE_BG` y `TILE_ICON` usan Tailwind fijo: `bg-blue-500/[0.14]`, `dark:bg-blue-400/[0.12]`, `text-blue-600 dark:text-blue-400`, etc. Solo contemplan “light vs dark” de Tailwind, no los 7 temas. En Sunmi Sand, France o Blue Classic pueden verse mal. |
| Label del tile | Frágil | `opacity-95` sobre color heredado; en algunos temas el contraste puede ser bajo. |

**Patrón correcto en el proyecto:** Otros módulos usan `sunmi-text-muted` para secundario, `sunmi-surface-soft` para fondos suaves, y para acentos `sunmi-text-accent` o `var(--pos-accent)`. No hay tokens por “color semántico” (azul/naranja/verde) en el theme; si se quieren mantener colores por tipo, habría que usar variables o clases que existan, o aceptar que solo light/dark Tailwind no cubre todos los temas.

---

### 2.2 `components/dashboard/UltimasVentas.jsx`

| Qué | Estado | Problema |
|-----|--------|----------|
| Card contenedora | OK | `SunmiCard` (aplica `theme.card`). |
| Bordes extra | OK | `border-current/[0.06]` coherente con el resto. |
| Badges forma de pago | Incompatible | `FORMA_PAGO` con clases fijas: `bg-emerald-500/12 text-emerald-700 dark:text-emerald-400`, `bg-blue-500/12 text-blue-700 dark:text-blue-400`, etc. Solo light/dark; en otros temas pueden perder contraste o verse mal. |
| Cuadro de color por pago | Incompatible | `BOX_COLOR`: `bg-emerald-500/15`, `bg-blue-500/15`, etc. Mismo problema. |
| Hover de fila | Incompatible | `hover:bg-black/[0.07] dark:hover:bg-white/[0.08]`. Asume fondo oscuro (black) o claro (white). En Sand, France, Graphite, Blue Classic el fondo no es literalmente black/white; el hover puede verse mal o “lavado”. |
| Textos secundarios | Frágil | `opacity-80`, `opacity-50`, `opacity-45`, `opacity-55` sin clase semántica. |
| Chevron | Frágil | `opacity-20 group-hover:opacity-60`; depende del color heredado. |

**Patrón correcto:** Hover de fila: `sunmi-row-hover` (usa `var(--table-row-hover)`). Texto secundario: `sunmi-text-muted`. Badges: si el proyecto no define badges por “tipo de pago”, al menos evitar `dark:` y considerar `sunmi-state-success` u otras clases `sunmi-*` donde encajen.

---

### 2.3 `components/dashboard/ActividadReciente.jsx`

| Qué | Estado | Problema |
|-----|--------|----------|
| Card | OK | `SunmiCard` + `border-current/[0.06]`. |
| Títulos / enlaces | Frágil | `opacity-70`, `opacity-55`, `opacity-50` sin `sunmi-text-muted`. |
| Hover de ítem navegable | Incompatible | `hover:bg-black/[0.07] dark:hover:bg-white/[0.08]` — mismo problema que UltimasVentas. |
| Ícono y metadata | Frágil | `opacity-45`, `opacity-50`; en algunos temas poco contraste. |
| Ítem no navegable | Frágil | `opacity-60` fija. |

**Patrón correcto:** Hover: `sunmi-row-hover`. Texto secundario: `sunmi-text-muted`.

---

### 2.4 `components/dashboard/DashboardDesktop.jsx`

| Qué | Estado | Problema |
|-----|--------|----------|
| Contenedores del bloque | OK | `theme.card` + `border-current/[0.06]`. |
| CTA “Nueva Venta” | Incompatible | `bg-blue-600 text-white hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400`. Azul fijo; no usa `theme.header` ni `--pos-accent` / `--pos-link`. En el ERP, otros CTAs principales usan `pos-accent` o estilos del header. |
| CTAs secundarios | OK | `theme.card` + `border-current/[0.08]` + `hover:bg-current/[0.03]`. |
| Títulos | Frágil | `opacity-85`, `opacity-40`, `opacity-65`; mejor con clase semántica. |

**Patrón correcto:** CTA principal: usar `theme.header` (bg/border/text) o clases/variables de acento (`--pos-accent`, `sunmi-btn-cyan`, etc.) según el patrón ya usado en el resto del app.

---

### 2.5 `components/dashboard/DashboardMobile.jsx`

| Qué | Estado | Problema |
|-----|--------|----------|
| Cards | OK | `theme.card` + `border-current/[0.06]`. |
| CTA “Nueva Venta” | Incompatible | Mismo azul fijo que en desktop: `bg-blue-600 text-white ... dark:bg-blue-500 dark:hover:bg-blue-400`. |
| Textos hero | Frágil | `opacity-50`, `opacity-55`; sin `sunmi-text-muted`. |

**Patrón correcto:** Mismo que desktop para CTA y textos secundarios.

---

### 2.6 `components/dashboard/KpiCard.jsx`

| Qué | Estado | Problema |
|-----|--------|----------|
| Contenedor | OK | `theme.card`. |
| Iconos por color | Incompatible | `COLOR_ICON`: `bg-blue-500/15 text-blue-600 dark:text-blue-400`, etc. Solo light/dark Tailwind. |
| Badge variación | Incompatible | `bg-emerald-500/20 text-emerald-600 dark:text-emerald-400` y `bg-red-500/20 text-red-600 dark:text-red-400`. En temas no “slate dark” pueden desentonar. |
| Label | Frágil | `opacity-60`; podría ser `sunmi-text-muted`. |
| “0%” sin variación | Frágil | `opacity-40`. |

**Patrón correcto:** Para éxito/error ya existen `sunmi-text-success` y `sunmi-text-danger` (y estados `sunmi-state-success`, etc.). Para iconos de KPI no hay token por color; mantener colores suaves está bien, pero evitar depender solo de `dark:`.

---

### 2.7 `components/dashboard/ModalDetalleVenta.jsx`

| Qué | Estado | Problema |
|-----|--------|----------|
| Overlay | Incompatible | `bg-black/50` fijo. En `globals.css` existe `--pos-overlay` por theme; no se usa. |
| Card del modal | OK | `SunmiCard` (theme.card). |
| Contenido (versión con sunmi-*) | Parcial | Si el modal usa `sunmi-text-muted`, `sunmi-surface-soft`, `sunmi-divider`, `sunmi-text-success`, `sunmi-text-accent`, esa parte sí es theme-aware. |
| Botón Cerrar | OK | `SunmiButton color="slate"`. |

**Patrón correcto:** Overlay: clase o estilo que use `var(--pos-overlay)` (o una clase `.sunmi-overlay` que lo use, si se añade). El resto del contenido debería usar de forma consistente clases `sunmi-*` y evitar opacidades fijas sobre colores no definidos por tema.

---

### 2.8 `components/dashboard/VentaDetalleContent.jsx`

| Qué | Estado | Problema |
|-----|--------|----------|
| Cards | OK | `SunmiCard`. |
| Texto secundario (labels) | Frágil | `opacity-60` en todos los labels; no usa `sunmi-text-muted`. |
| Bordes tabla | OK | `border-current/10` y `border-current/5` heredan. |

**Patrón correcto:** Labels y textos secundarios: `sunmi-text-muted` (o `sunmi-label-muted` donde aplique).

---

## 3. Resumen: qué rompe compatibilidad

- **Hover de filas:** `hover:bg-black/[0.07] dark:hover:bg-white/[0.08]` en UltimasVentas y ActividadReciente. No respeta los 7 temas.
- **CTA principal (Nueva Venta):** Azul fijo (`bg-blue-600` / `dark:bg-blue-500`). Debería usar acento del sistema (`theme.header` o `--pos-accent` / `--pos-link`).
- **Badges y colores de ítems:** Forma de pago, iconos de accesos, iconos KPI, variación KPI: Tailwind fijo + `dark:`. No hay tokens por “color semántico” en el theme; al menos evitar depender solo de `dark:` y valorar clases/variables existentes donde encajen.
- **Overlay del modal:** `bg-black/50` en lugar de `var(--pos-overlay)`.
- **Textos secundarios en general:** Uso de `opacity-*` sin `sunmi-text-muted` ni equivalentes, con riesgo de bajo contraste en algunos temas.

---

## 4. Patrones correctos del proyecto a usar

- **Fondo de tarjetas / superficies:** `theme.card` (vía `useSunmiTheme()`) o `SunmiCard`. Bordes suaves: `border-current/[0.06]` o similar está bien.
- **Texto secundario / labels:** `sunmi-text-muted` (usa `var(--app-fg)` al 60%).
- **Acento (CTA principal, totales):** `sunmi-text-accent` o variables `--pos-accent` / `--pos-link`; para botón principal, el patrón existente es header o `sunmi-btn-cyan` / estilos que usen esas variables.
- **Hover de fila:** `sunmi-row-hover` (usa `var(--table-row-hover)`).
- **Separadores:** `sunmi-divider` (usa `var(--app-border)`).
- **Superficie suave (ítems, listas):** `sunmi-surface-soft` (usa `var(--app-input-bg)`).
- **Éxito / error:** `sunmi-text-success`, `sunmi-text-danger`; estados: `sunmi-state-success`, `sunmi-state-danger`, etc.
- **Overlay:** Usar `var(--pos-overlay)` (está definido por theme en `globals.css`).

---

## 5. Plan mínimo de corrección (sin implementar aquí)

1. **Hovers de fila (UltimasVentas, ActividadReciente)**  
   Sustituir `hover:bg-black/[0.07] dark:hover:bg-white/[0.08]` por la clase `sunmi-row-hover` (y si hace falta una clase que combine con el resto de estilos del elemento).

2. **CTA “Nueva Venta” (DashboardDesktop, DashboardMobile)**  
   Cambiar a un estilo que use `theme.header` o variables/clases de acento (`--pos-accent`, `sunmi-btn-cyan`, etc.) en lugar de azul fijo.

3. **Overlay del modal (ModalDetalleVenta)**  
   Sustituir `bg-black/50` por una clase o estilo que use `var(--pos-overlay)` (y, si se quiere, añadir en `sunmi.css` algo tipo `.sunmi-modal-backdrop { background: var(--pos-overlay); }`).

4. **Textos secundarios**  
   Donde hoy solo se use `opacity-*` para “texto secundario”, añadir `sunmi-text-muted` (o la clase semántica que corresponda) y reducir o quitar opacidades fijas que dupliquen el efecto.

5. **Badges forma de pago y cuadros de color (UltimasVentas)**  
   Valorar usar `sunmi-state-success` para efectivo y clases/variables existentes para otros tipos; si se mantienen colores propios, evitar depender solo de `dark:` y probar en todos los temas.

6. **Accesos rápidos y KPI (colores de iconos)**  
   Mantener colores suaves está bien; priorizar que el contraste sea correcto en todos los temas (por ejemplo comprobando en Sand, France, Blue Classic). Si hace falta, introducir variantes por `themeKey` o usar variables existentes donde encajen, sin inventar un sistema nuevo.

7. **VentaDetalleContent y modal**  
   Unificar con clases `sunmi-*` para labels y totales (`sunmi-text-muted`, `sunmi-text-accent`, `sunmi-divider`, etc.) para alinear el detalle de venta al resto del ERP.

Con estos cambios el dashboard queda alineado con el sistema real de temas (tokens JS + variables CSS + clases sunmi) sin rehacer toda la UI.

---

## 6. Implementación del plan mínimo (post-auditoría)

Se aplicó el plan mínimo. Resumen:

- **Hovers de fila:** Reemplazados por clase `sunmi-row-hover` en UltimasVentas y ActividadReciente.
- **CTA Nueva Venta:** Reemplazado por clase `sunmi-pill-link` (usa `var(--pos-link)` y `var(--app-bg)`) en DashboardDesktop y DashboardMobile.
- **Overlay del modal:** Reemplazado `bg-black/50` por `style={{ background: "var(--pos-overlay)" }}` en ModalDetalleVenta.
- **Textos secundarios:** Reemplazadas opacidades sueltas por `sunmi-text-muted` en títulos, labels, metadatos y estados vacíos en UltimasVentas, ActividadReciente, DashboardDesktop, DashboardMobile, KpiCard, VentaDetalleContent y modal.
- **Detalle venta:** VentaDetalleContent y modal ya usan o pasan a usar `sunmi-text-muted`, `sunmi-divider`, `sunmi-text-accent` para totales.
- **Badges forma de pago:** Sustituidos por `sunmi-state-success sunmi-text-success` (efectivo), `sunmi-badge-link` (digital), `sunmi-badge-muted` (mixto, fiado, default). Cuadro de color por venta unificado con `sunmi-surface-soft`.

**Cierre final (badge variación KpiCard):**

- **KpiCard — badge de variación:** Usa **solo** variables del tema, sin nada hardcodeado: `style` con `var(--pos-success)` / `var(--pos-danger)` y `color-mix(...)` para fondo y borde (misma fórmula que en `sunmi.css`). Los valores vienen de `globals.css` por `data-theme`; el componente no aplica clases con fallback ni colores fijos.

**Limitaciones conocidas (se mantienen, sin reemplazo theme-aware real):**

- **AccesosRapidos:** TILE_BG y TILE_ICON siguen con Tailwind fijo (blue, amber, emerald, violet, sky, red) y `dark:`. No existe en el proyecto un patrón reutilizable para “colores por tile”; se mantienen como están.
- **KpiCard:** COLOR_ICON (blue, green, orange, purple por KPI) sigue con Tailwind + `dark:`. No hay en el repo tokens/clases para cuatro colores semánticos por KPI; se mantiene como limitación conocida.

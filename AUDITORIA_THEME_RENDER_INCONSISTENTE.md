# Auditoría: render inconsistente al cambiar Theme (ERP Azul)

**Objetivo:** Encontrar exactamente qué páginas no respetan el theme y por qué; proponer un arreglo mínimo y seguro.

---

## A) MAPA DEL ÁRBOL DE LAYOUTS Y PROVIDERS

### Dónde se define el theme actual

| Ubicación | Qué hace |
|-----------|----------|
| **`app/layout.jsx`** | Layout raíz. Inyecta un **script en `<head>`** que, antes de React, lee `localStorage.getItem("erp-sunmi-theme")` y asigna `document.documentElement.dataset.theme = t` (o `"sunmiDark"` por defecto). |
| **`app/layout.jsx`** | Envuelve todo en `<ThemeClientWrapper>` → `<UserProvider>` → `children`. No hay otro layout por encima. |
| **`components/sunmi/ThemeClientWrapper.jsx`** | Client component. Renderiza `<SunmiThemeProvider>` y dentro un `<div className="min-h-screen w-full overflow-x-hidden">` (sin clases de color; no aplica `theme.layout`). |
| **`components/sunmi/SunmiThemeProvider.jsx`** | Mantiene estado `themeKey`; sincroniza con `localStorage` y con **`document.documentElement.dataset.theme`** en cada cambio. No pinta colores en el DOM; solo escribe `data-theme` en `<html>`. |
| **`app/globals.css`** | Define variables por theme: `html[data-theme="sunmiDark"]`, `html[data-theme="sunmiLight"]`, etc. (incl. `sunmiGraphite`, `sunmiSand`, `sunmiBlueClassic`, `sunmiFrance`). En cada bloque: `--app-bg`, `--app-fg`, `--app-border`, etc. Luego `html, body { background: var(--app-bg); color: var(--app-fg); }`. |

**Conclusión:** La fuente de verdad visual del theme es **`data-theme` en `<html>`** + variables CSS en `globals.css`. Cualquier página que cubra el viewport con un div con **fondo/color fijos** (p. ej. `bg-slate-900`, `bg-slate-950`) tapa el `body` y deja de “ver” el theme.

---

### Árbol de render por ruta

Todas las rutas pasan por **`app/layout.jsx`** (no hay rutas “sueltas” sin ThemeClientWrapper). La diferencia es:

- Rutas **fuera** de `/modulos` no tienen layout intermedio.
- Rutas **dentro** de `/modulos` tienen además `app/modulos/layout.jsx` (LayoutSettingsProvider + LayoutBase).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ app/layout.jsx                                                               │
│   <html lang="es" suppressHydrationWarning>                                  │
│     <head> <script> → document.documentElement.dataset.theme = localStorage  │
│     <body>                                                                   │
│       ThemeClientWrapper                                                     │
│         SunmiThemeProvider  ← escribe data-theme en <html>                    │
│           ThemeBody (div.min-h-screen.w-full, sin colores)                   │
│             UserProvider                                                    │
│               {children}                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**`/inicio`**

- `app/layout.jsx` → `ThemeClientWrapper` → `UserProvider` → **`app/inicio/page.jsx`**.
- No hay `app/modulos/layout.jsx` (inicio no está bajo `/modulos`).
- **Problema:** La page envuelve todo en `<main className="... bg-slate-950">`, que tapa el fondo del body y no respeta el theme.

**`/modulos/pos-ventas`**

- `app/layout.jsx` → … → `UserProvider` → **`app/modulos/layout.jsx`** (LayoutSettingsProvider, LayoutBase) → **`app/modulos/pos-ventas/page.jsx`**.
- La page usa `sunmi-bg` (que en `styles/sunmi.css` es `background: var(--app-bg)`), así que **sí respeta** el theme.

**`/modulos/pos-transferencias`**

- Mismo árbol: `app/layout` → … → `app/modulos/layout` → **`app/modulos/pos-transferencias/page.jsx`**.
- **Problema:** La page envuelve en `<div className="min-h-screen bg-slate-900 text-slate-100">`, fondo fijo → no respeta theme.

**`/modulos/productos`**

- Mismo árbol: … → `app/modulos/layout` → **`app/modulos/productos/page.jsx`**.
- Usa `sunmi-bg` (vars) → **respeta** el theme.

**Rutas que fallan (viewport con fondo fijo)**

- **`/inicio`** — `app/inicio/page.jsx`: `bg-slate-950` en `<main>`.
- **`/modulos/pedidos`** — `app/modulos/pedidos/page.jsx`: `min-h-screen bg-slate-900` en loading y en vista principal.
- **`/modulos/pedidos/historial`** — `app/modulos/pedidos/historial/page.jsx`: `min-h-screen bg-slate-900`.
- **`/modulos/pos-transferencias`** — `app/modulos/pos-transferencias/page.jsx`: `min-h-screen bg-slate-900`.
- **`/modulos/pos-transferencias/nueva`** — `app/modulos/pos-transferencias/nueva/page.jsx`: `min-h-screen bg-slate-900 text-slate-100`.

---

## B) PÁGINAS “SUELTAS” Y OVERRIDES

### Layouts en `app/**`

| Archivo | Alcance | Contiene providers |
|---------|---------|--------------------|
| `app/layout.jsx` | Todas las rutas | ThemeClientWrapper (SunmiThemeProvider), UserProvider |
| `app/modulos/layout.jsx` | Solo `/modulos/*` | LayoutSettingsProvider, LayoutBase |

No hay más `layout.jsx`/`layout.tsx` en `app`. Ninguna ruta deja de pasar por el root layout.

### Páginas que fuerzan fondo/texto y “pisan” el theme

Son las que envuelven el contenido en un contenedor a pantalla completa con clases **fijas** (Tailwind), no variables:

| Ruta | Archivo | Motivo |
|------|---------|--------|
| `/inicio` | `app/inicio/page.jsx` | `<main className="... bg-slate-950">` en loading y en contenido. |
| `/modulos/pedidos` | `app/modulos/pedidos/page.jsx` | Loading y vista principal: `<div className="min-h-screen bg-slate-900 ...">`. |
| `/modulos/pedidos/historial` | `app/modulos/pedidos/historial/page.jsx` | Loading y contenido: `<div className="min-h-screen bg-slate-900 text-slate-100">`. |
| `/modulos/pos-transferencias` | `app/modulos/pos-transferencias/page.jsx` | Loading (x2) y contenido: `<div className="min-h-screen bg-slate-900 ...">`. |
| `/modulos/pos-transferencias/nueva` | `app/modulos/pos-transferencias/nueva/page.jsx` | Contenido: `<div className="min-h-screen bg-slate-900 text-slate-100">`. |

No se detectó:

- Uso de `document.body` / `document.documentElement` para pintar desde páginas (solo SunmiThemeProvider y el script del layout tocan `dataset.theme`).
- Providers duplicados de theme en layout y en page.
- `createPortal` solo en SunmiSelectAdv (dropdown a `document.body`), sin afectar theme.

### Estilos globales e imports

- **`app/globals.css`** (importado en `app/layout.jsx`): Define `--app-bg`, `--app-fg`, etc. por `html[data-theme="..."]` y aplica `background: var(--app-bg); color: var(--app-fg);` a `html, body`. Correcto.
- **`styles/sunmi.css`** (importado desde globals): `.sunmi-bg` usa `var(--app-bg)` y `var(--app-fg)`, por tanto respeta theme. Otras clases (p. ej. `.sunmi-header-amber`) siguen con Tailwind fijo; no son el origen del “render distinto” entre rutas, sino las **páginas que no usan `.sunmi-bg`** y en su lugar usan `bg-slate-900` / `bg-slate-950` en el root de la página.

---

## C) “DIFF” DE ESTILOS POR THEME

- **Qué cambia con el theme:** El atributo **`data-theme`** en `<html>` (valores como `sunmiDark`, `sunmiLight`, etc.). No hay `className` en `html`/`body` que cambie por theme; solo ese atributo.
- **Quién lo escribe:**
  - Script en `app/layout.jsx` (antes de React).
  - `SunmiThemeProvider`: al montar lee `localStorage` y asigna `document.documentElement.dataset.theme`; y en un `useEffect` dependiente de `themeKey` vuelve a asignar `document.documentElement.dataset.theme = themeKey`.
- **Qué hace el CSS:** En `globals.css`, los selectores `html[data-theme="sunmiDark"]`, `html[data-theme="sunmiLight"]`, etc. definen las variables (`--app-bg`, `--app-fg`, …). Luego `html, body` usan esas variables. Cualquier página cuyo **root visible** sea un div con `min-h-screen` y `bg-slate-900` (o similar) cubre el body y no “recibe” el theme vía variables en ese contenedor; el body sí cambia, pero no se ve.

---

## D) DETECCIÓN EMPÍRICA (OPCIONAL, REVERSIBLE)

Para comprobar en runtime que todas las páginas están bajo el mismo provider y que el theme llega:

1. **En `SunmiThemeProvider.jsx`** (dentro del `return` del provider, o en un `useEffect` que dependa de `themeKey`):
   - Hacer `console.log("[THEME]", themeKey, document.documentElement?.dataset?.theme);` (solo en cliente).
2. **En una page “problemática”** (p. ej. `app/modulos/pedidos/page.jsx`), al inicio del componente:
   - `console.log("[PAGE] pedidos", typeof useSunmiTheme);` o llamar a `useSunmiTheme()` y loguear `themeKey`. Si no está bajo el provider, el hook podría fallar o dar default.

Si en las rutas “que fallan” el hook existe y `themeKey` cambia pero la pantalla sigue oscura, confirma que el fallo es solo el **wrapper con fondo fijo**, no la ausencia del provider.

---

## E) ENTREGABLES

### 1. Lista de rutas problemáticas

| Ruta | Archivo `app/.../page.*` | Por qué no respeta theme |
|------|---------------------------|---------------------------|
| `/inicio` | `app/inicio/page.jsx` | Root de la página es `<main>` con **`bg-slate-950`** (y en loading también). Cubre el body y no usa variables. |
| `/modulos/pedidos` | `app/modulos/pedidos/page.jsx` | Root de la página (y estados de carga) es `<div>` con **`min-h-screen bg-slate-900`** (y `text-slate-100` en contenido). Override de fondo/texto. |
| `/modulos/pedidos/historial` | `app/modulos/pedidos/historial/page.jsx` | Root (y loading) es `<div>` con **`min-h-screen bg-slate-900 text-slate-100`**. Override de fondo/texto. |
| `/modulos/pos-transferencias` | `app/modulos/pos-transferencias/page.jsx` | Loading y contenido usan **`min-h-screen bg-slate-900`** (y `text-slate-100` en contenido). Override. |
| `/modulos/pos-transferencias/nueva` | `app/modulos/pos-transferencias/nueva/page.jsx` | Contenido principal envuelto en **`min-h-screen bg-slate-900 text-slate-100`**. Override. |

Todas están bajo el mismo **layout y ThemeProvider**; el problema es solo el **wrapper con clases fijas** en la page.

---

### 2. Mapa de providers y layouts (resumen)

```
app/layout.jsx (root)
├── <html>, <head> (script theme en documentElement)
├── <body>
│   └── ThemeClientWrapper
│       └── SunmiThemeProvider  ← escribe data-theme en <html>
│           └── div (min-h-screen w-full, sin colores)
│               └── UserProvider
│                   └── children
│
│   Para rutas /modulos/*  →  children = app/modulos/layout.jsx
│                               └── LayoutSettingsProvider
│                                   └── LayoutBase
│                                       └── page (modulos/.../page.jsx)
│
│   Para /inicio, /login  →  children = app/inicio/page.jsx | app/login/page.jsx
```

- **Todo** el app pasa por `app/layout.jsx` → `ThemeClientWrapper` → `SunmiThemeProvider` → `UserProvider`.
- **Solo** las rutas bajo `/modulos/*` pasan además por `app/modulos/layout.jsx` (LayoutSettingsProvider + LayoutBase).
- Ninguna page define su propio ThemeProvider ni layout alternativo; la inconsistencia es **solo CSS**: contenedores a pantalla completa con `bg-slate-900` / `bg-slate-950`.

---

### 3. Plan de fix mínimo (por archivo)

Objetivo: que el **root visible** de cada página use el fondo (y texto) del theme, sin refactor grande. La forma más segura es usar las mismas variables que el body (`var(--app-bg)`, `var(--app-fg)`) o la clase existente `.sunmi-bg` (que ya las usa).

| # | Archivo | Líneas / bloque | Cambio | Riesgo |
|---|---------|-----------------|--------|--------|
| 1 | `app/inicio/page.jsx` | Loading: `<main className="min-h-screen grid place-items-center bg-slate-950">` | Sustituir `bg-slate-950` por `sunmi-bg` (clase ya definida con `var(--app-bg)`). Ej.: `className="min-h-screen grid place-items-center sunmi-bg"`. | Bajo: solo clase del contenedor. |
| 2 | `app/inicio/page.jsx` | Contenido: `<main className="min-h-screen grid place-items-center p-4 bg-slate-950">` | Igual: usar `sunmi-bg` en lugar de `bg-slate-950`. Ej.: `className="min-h-screen grid place-items-center p-4 sunmi-bg"`. | Bajo. |
| 3 | `app/modulos/pedidos/page.jsx` | Loading (líneas ~283 y ~293): `<div className="min-h-screen bg-slate-900 flex items-center justify-center">` | Reemplazar `bg-slate-900` por `sunmi-bg`. Añadir `sunmi-bg` y quitar `bg-slate-900` para que el fondo use `var(--app-bg)`. Texto secundario puede quedar `text-slate-300` o pasarse a variable si se define una (opcional). | Bajo. |
| 4 | `app/modulos/pedidos/page.jsx` | Vista “carrito” (líneas ~304 y ~381): `<div className="min-h-screen bg-slate-900 text-slate-100">` | Sustituir por `min-h-screen sunmi-bg` (`.sunmi-bg` ya lleva color de texto `var(--app-fg)`). Ej.: `className="min-h-screen sunmi-bg ..."` y quitar `bg-slate-900 text-slate-100`. | Bajo. |
| 5 | `app/modulos/pedidos/historial/page.jsx` | Loading (~109): `<div className="min-h-screen bg-slate-900 flex items-center justify-center">` | Igual: `sunmi-bg` en lugar de `bg-slate-900`. | Bajo. |
| 6 | `app/modulos/pedidos/historial/page.jsx` | Contenido (~121): `<div className="min-h-screen bg-slate-900 text-slate-100">` | Igual: `sunmi-bg` y quitar `bg-slate-900 text-slate-100`. | Bajo. |
| 7 | `app/modulos/pos-transferencias/page.jsx` | Loading (~224 y ~236): `<div className="min-h-screen bg-slate-900 ...">` | Igual: `sunmi-bg` en lugar de `bg-slate-900`. | Bajo. |
| 8 | `app/modulos/pos-transferencias/page.jsx` | Contenido (~263): `<div className="min-h-screen bg-slate-900 text-slate-100">` | Igual: `sunmi-bg`, quitar `bg-slate-900 text-slate-100`. | Bajo. |
| 9 | `app/modulos/pos-transferencias/nueva/page.jsx` | Contenido (~686): `<div className="min-h-screen bg-slate-900 text-slate-100">` | Igual: `sunmi-bg`, quitar `bg-slate-900 text-slate-100`. | Bajo. |

Snippet genérico para cualquier “root de página” que hoy tenga fondo fijo:

- **Antes:** `className="min-h-screen bg-slate-900 text-slate-100"` (o `bg-slate-950`).
- **Después:** `className="min-h-screen sunmi-bg"` (y si hace falta, conservar el resto de clases de layout, p. ej. `flex flex-col`, `p-4`, etc.). No hace falta tocar `ThemeClientWrapper` ni providers.

---

### 4. Regla canónica recomendada

- **“Toda la app debe renderizar bajo `app/layout.jsx`, que incluye `ThemeClientWrapper` (SunmiThemeProvider). Toda ruta bajo `/modulos/*` debe pasar además por `app/modulos/layout.jsx` (LayoutSettingsProvider + LayoutBase).”**
- **“Ninguna page debe usar un contenedor a pantalla completa con colores fijos (p. ej. `min-h-screen bg-slate-900` o `bg-slate-950`) como root. Debe usar la clase `sunmi-bg` o variables CSS (`var(--app-bg)`, `var(--app-fg)`) para fondo y texto de la página, para que respeten `data-theme`.”**

Excepción actual: las 5 rutas listadas arriba, que son las que este plan corrige. No hay excepciones deseadas (p. ej. login/inicio pueden seguir usando el mismo theme que el resto).

---

## Resumen

- **Causa del bug:** Mismo árbol de layout y mismo ThemeProvider para todas las rutas. El theme se aplica vía `data-theme` en `<html>` y variables en `globals.css`; `html`/`body` usan `var(--app-bg)` y `var(--app-fg)`. En 5 rutas, el root de la página es un div/main a pantalla completa con **fondo (y a veces texto) fijos** (`bg-slate-900` / `bg-slate-950`), que tapa el body y no cambia con el theme.
- **Fix:** Sustituir en esos roots las clases fijas por **`sunmi-bg`** (o equivalentes con variables), sin tocar layouts ni providers. Lista exacta de archivos y bloques en la sección “Plan de fix mínimo”.

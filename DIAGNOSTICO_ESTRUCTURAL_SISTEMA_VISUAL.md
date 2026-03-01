# Diagnóstico estructural del sistema visual — ERP Azul

**Alcance:** `app/modulos/**` — uso de fondos, sombras, bordes, botones, cards, tablas y colores respecto al sistema Sunmi.

---

## 1. Módulos que NO usan SunmiCard

| Módulo | Archivo | Qué rompe consistencia | Gravedad |
|--------|---------|------------------------|----------|
| Dashboard | `app/modulos/dashboard/page.jsx` | Contenido en `<div className="p-4">` sin SunmiCard; títulos y párrafos con `text-xl`, `text-gray-700`, `text-gray-500`; botón "Salir" con `text-sm underline` (sin SunmiButton). | **Medio** |
| Módulos (raíz) | `app/modulos/page.jsx` | Solo `<div className="p-4">` vacío (página placeholder/redirect). | **Leve** |

---

## 2. Módulos que NO usan sunmi-bg en el root

| Módulo | Archivo | Root actual | Gravedad |
|--------|---------|-------------|----------|
| Dashboard | `app/modulos/dashboard/page.jsx` | `<div className="p-4">` | **Medio** |
| Módulos | `app/modulos/page.jsx` | `<div className="p-4">` | **Leve** |
| Transferencias | `app/modulos/transferencias/page.jsx` | `<div className="p-2 sm:p-4 max-w-6xl mx-auto">` — sin fondo explícito; hereda body. | **Leve** |
| Reportes de ventas | `app/modulos/reportes-ventas/page.jsx` | `<div className="p-2 lg:p-3 space-y-3 max-w-7xl mx-auto">` — sin sunmi-bg. | **Leve** |
| Categorías | `app/modulos/categorias/page.jsx` | `<div className="p-3 space-y-4">` — sin sunmi-bg. | **Leve** |
| Configuración / Apariencia | `app/modulos/configuracion/apariencia/page.jsx` | `<div className="max-w-5xl mx-auto">` — sin sunmi-bg. | **Leve** |

---

## 3. Fondos / bordes / texto propios (hardcode) — por archivo

| Módulo | Archivo | Qué rompe consistencia | Gravedad |
|--------|---------|------------------------|----------|
| **Pedidos** | `app/modulos/pedidos/page.jsx` | Bloques de error `bg-red-900/20 border border-red-500/40`; badge `bg-amber-500 text-slate-900`; contenedores `bg-slate-900/80 border border-slate-800`; avatares `bg-slate-800`; controles +/- `bg-slate-800 rounded-lg border border-slate-700`, botones con `text-slate-300 hover:bg-slate-700`; card resumen `bg-slate-900/80`; banner `bg-amber-500/10 border border-amber-400/40`. Muchos fondos y bordes fijos. | **Grave** |
| **Pedidos / Historial** | `app/modulos/pedidos/historial/page.jsx` | Estados con clases tipo `bg-amber-500/20 text-amber-300 border-amber-400/40`, `bg-slate-900/80 border border-slate-800`, `bg-slate-500/20 text-slate-300`; bloque error `bg-red-900/20 border border-red-500/40`. | **Medio** |
| **POS Transferencias** | `app/modulos/pos-transferencias/page.jsx` | Paneles con `bg-slate-900/80`; mensaje error `bg-red-900/20 border border-red-500/40`; múltiples `text-slate-400`, bordes y fondos slate. | **Medio** |
| **POS Transferencias / Nueva** | `app/modulos/pos-transferencias/nueva/page.jsx` | Lógica de clase `bg-cyan-500 hover:bg-cyan-600`; bloques `bg-slate-800/70`, `bg-emerald-500/20 border border-emerald-500/40 text-emerald-300`, `text-amber-400 bg-amber-900/20 border border-amber-500/40`; barra sticky `bg-slate-800/90 border-t border-slate-700/50`; botones con `shadow-md`. | **Medio** |
| **Compras a proveedor** | `app/modulos/compras-proveedor/page.jsx` | Badges de estado: `bg-slate-600 text-slate-200`, `bg-amber-600 text-amber-100`, `bg-cyan-600 text-cyan-100`, `bg-red-600 text-red-100` (Tailwind fijo). | **Medio** |
| **Compras a proveedor / [id]** | `app/modulos/compras-proveedor/[id]/page.jsx` | Mismo mapa de badges (BORRADOR, CONFIRMADO, etc.) con `bg-slate-600`, `bg-amber-600`, etc.; `SunmiPanel` con `className="bg-slate-900/40 ring-2 ring-inset ring-slate-500/70 shadow-sm"` (colores fijos); botones +/- `bg-slate-700 text-slate-200 hover:bg-slate-600`; panel cyan `ring-cyan-500/30`. | **Medio** |
| **Compras a proveedor / Nueva** | `app/modulos/compras-proveedor/nueva/page.jsx` | `SunmiPanel` con `bg-slate-900/40 ring-2 ring-inset ring-slate-500/70`; botones +/- `bg-slate-700 text-slate-200 hover:bg-slate-600`. | **Medio** |
| **Compras a proveedor / Ganancia** | `app/modulos/compras-proveedor/ganancia/page.jsx` | `SunmiPanel` con `bg-slate-900/40`, `bg-green-900/30 ring-green-500/40`, `bg-slate-900/40 ring-slate-500/40`; tablas y textos con `text-slate-400`, `border-slate-700`, `text-green-400`, `text-red-400`. | **Medio** |
| **Clientes** | `app/modulos/clientes/page.jsx` | Inputs `border border-slate-700 bg-slate-950`, `text-slate-200`; tabla `thead className="bg-slate-800/80"`; celdas y badges con `text-slate-400`, `bg-amber-500/20`, `text-emerald-400`, `bg-red-500/10`, etc.; modales `bg-black/80`; muchos bordes y fondos slate/amber/cyan/red. | **Grave** |
| **Clientes / [id]** | `app/modulos/clientes/[id]/page.jsx` | Badges `bg-cyan-500/20 text-cyan-300 border border-cyan-500/30`; bloques `bg-slate-900/50`, `bg-red-500/10`, `bg-emerald-500/15`; inputs `border border-slate-700 bg-slate-950 text-slate-200`. | **Medio** |
| **Clientes / Analytics** | `app/modulos/clientes/analytics/page.jsx` | Selects/botones con `bg-slate-800 text-slate-400 border-slate-700`, `bg-cyan-500/20 text-cyan-300`; inputs `border border-slate-700 bg-slate-950 text-slate-200`; bloques error `bg-red-500/10 border border-red-500/30`; filas `hover:bg-slate-800/50`; badges `bg-cyan-500/20 text-cyan-300`, `bg-amber-500/20 text-amber-300`. | **Medio** |
| **Reportes de ventas** | `app/modulos/reportes-ventas/page.jsx` | Labels `text-slate-400`; bloques métricas `bg-slate-900/50`; bloque éxito `bg-emerald-500/10 border border-emerald-500/30`; error `bg-red-500/10 border border-red-500/30`; filas tabla `hover:bg-slate-800/40`. | **Medio** |
| **Fidelidad** | `app/modulos/fidelidad/page.jsx` | Bloques `bg-slate-900/50 border border-slate-700`; inputs/selects `bg-red-500/20 border-red-500/50` / `bg-slate-800/50 border-slate-700`; filas `text-slate-300 hover:bg-slate-800`; badges `bg-red-500/20 border border-red-500/50`; mensajes `bg-red-500/10`, `bg-emerald-500/10`. | **Medio** |
| **Productos** | `app/modulos/productos/page.jsx` | Tabla con `thead`/`tbody` y clases propias; badges y bloques con `bg-amber-500/20`, `bg-cyan-500/20`, `bg-red-500/20`, `bg-emerald-500/20`, `bg-slate-500/20`; detalles `border border-slate-700 bg-slate-800/50`; file input y mensajes con slate/red/emerald. | **Medio** |
| **Configuración / Apariencia** | `app/modulos/configuracion/apariencia/page.jsx` | Preview con `text-slate-400`, `border border-dashed border-slate-700`; iconos `text-amber-400` / `text-slate-400`. | **Leve** |
| **Dashboard** | `app/modulos/dashboard/page.jsx` | `text-gray-700`, `text-gray-500` (no variables ni Sunmi). | **Leve** |

---

## 4. Botones sin clases Sunmi (bg-* directo o sin SunmiButton)

| Módulo | Archivo | Qué rompe consistencia | Gravedad |
|--------|---------|------------------------|----------|
| **Pedidos** | `app/modulos/pedidos/page.jsx` | Badge "Carrito" `bg-amber-500 text-slate-900`; botones de navegación/acción con `bg-slate-800`, `text-slate-300`, `hover:bg-slate-700`; botones +/- en controles de cantidad. | **Grave** |
| **Compras a proveedor** | `app/modulos/compras-proveedor/page.jsx`, `[id]/page.jsx` | Badges de estado con `bg-slate-600`, `bg-amber-600`, `bg-cyan-600`, `bg-red-600`; en [id] botones +/- `bg-slate-700 text-slate-200 hover:bg-slate-600`. | **Medio** |
| **Compras a proveedor / Nueva** | `app/modulos/compras-proveedor/nueva/page.jsx` | Botones +/- `bg-slate-700 text-slate-200 hover:bg-slate-600 active:scale-95`. | **Medio** |
| **Clientes** | `app/modulos/clientes/page.jsx`, `[id]/page.jsx` | Múltiples `<button>` con estilos propios (links/botones de acción) sin SunmiButton. | **Medio** |
| **Clientes / Analytics** | `app/modulos/clientes/analytics/page.jsx` | Botones de rango/filtro con `bg-slate-800 text-slate-400 border-slate-700` o `bg-cyan-500/20 text-cyan-300`. | **Medio** |
| **POS Transferencias / Nueva** | `app/modulos/pos-transferencias/nueva/page.jsx` | Botón principal con clases que incluyen `bg-cyan-500`, `shadow-md`; lógica que devuelve `bg-cyan-500 hover:bg-cyan-600`. | **Medio** |
| **Dashboard** | `app/modulos/dashboard/page.jsx` | Botón "Salir" con `text-sm underline` (sin SunmiButton). | **Leve** |
| **Fidelidad** | `app/modulos/fidelidad/page.jsx` | Botones en formularios/modales con clases propias. | **Medio** |

---

## 5. Cards / paneles sin SunmiCard (o con estilos propios encima)

| Módulo | Archivo | Qué rompe consistencia | Gravedad |
|--------|---------|------------------------|----------|
| **Dashboard** | `app/modulos/dashboard/page.jsx` | Todo el contenido es un bloque en div, sin SunmiCard. | **Medio** |
| **Compras a proveedor** (varios) | `[id]/page.jsx`, `nueva/page.jsx`, `ganancia/page.jsx` | Uso de `SunmiPanel` con `className="bg-slate-900/40 ring-2 ring-inset ring-slate-500/70 shadow-sm"` — colores y ring fijos, no variables. | **Medio** |
| **Pedidos** | `app/modulos/pedidos/page.jsx` | Dentro de SunmiCard hay bloques que actúan como sub-cards: `bg-slate-900/80 border border-slate-800 rounded-xl`, `bg-amber-500/10 border border-amber-400/40 rounded-xl`. | **Leve** |
| **Reportes de ventas** | `app/modulos/reportes-ventas/page.jsx` | Métricas en divs con `bg-slate-900/50`, `bg-emerald-500/10` (no SunmiCard). | **Leve** |
| **Fidelidad** | `app/modulos/fidelidad/page.jsx` | Bloques con `bg-slate-900/50 border border-slate-700` como sub-paneles. | **Leve** |

---

## 6. Tablas con estilos propios (sin SunmiTable)

| Módulo | Archivo | Qué rompe consistencia | Gravedad |
|--------|---------|------------------------|----------|
| **Productos** | `app/modulos/productos/page.jsx` | `<table className="w-full text-[11px] border-collapse">` con `<tbody className="text-slate-300">` y estilos de celdas propios. | **Medio** |
| **Clientes** | `app/modulos/clientes/page.jsx` | `<table className="w-full text-xs">` con `<thead className="bg-slate-800/80 sticky top-0">` y celdas con colores por estado. | **Medio** |
| **Reportes de ventas** | `app/modulos/reportes-ventas/page.jsx` | Filas con `className="hover:bg-slate-800/40"` y estructura de tabla propia. | **Leve** |
| **Pedidos / Historial** | `app/modulos/pedidos/historial/page.jsx` | Contenido tabular dentro de SunmiCard con estilos de estado (badges/colores) propios. | **Leve** |
| **Fidelidad** | `app/modulos/fidelidad/page.jsx` | Listas/tablas con `border border-slate-700 bg-slate-900/50` y hover/fila propios. | **Leve** |
| **Compras a proveedor / Ganancia** | `app/modulos/compras-proveedor/ganancia/page.jsx` | Tablas con `border border-slate-700`, celdas `text-slate-400`, `text-green-400`, `text-red-400`. | **Leve** |

---

## 7. Resumen por gravedad

- **Grave:** Pedidos (page), Clientes (page) — muchos fondos, bordes, botones y en clientes tabla con thead propio; uso masivo de bg-*/border-*/text-* fijos.
- **Medio:** Pedidos/historial, POS Transferencias (y nueva), Compras a proveedor (todos), Clientes ([id], analytics), Reportes de ventas, Fidelidad, Productos, Dashboard (sin SunmiCard/sunmi-bg), Config/apariencia (preview).
- **Leve:** Módulos raíz, Transferencias (sin sunmi-bg), Reportes/Categorías/Apariencia (sin sunmi-bg o solo detalles), sub-cards y tablas con pocas clases propias.

---

## 8. Patrones detectados

- **Fondos:** Uso repetido de `bg-slate-900/80`, `bg-slate-800`, `bg-slate-950`, `bg-slate-900/50`, `bg-red-500/10`, `bg-amber-500/20`, `bg-cyan-500/20`, `bg-emerald-500/10` (o similares) en lugar de variables `--app-*` / `--pos-*`.
- **Bordes:** `border-slate-700`, `border-slate-800`, `border-red-500/40`, `border-amber-400/40` repetidos.
- **Texto:** `text-slate-400`, `text-slate-300`, `text-slate-200`, `text-red-400`, `text-amber-400`, `text-cyan-400`, `text-emerald-400` en lugar de clases semánticas o variables.
- **Botones:** Muchos `<button>` con `bg-slate-700`, `bg-slate-800`, `hover:bg-slate-600/700` o badges con `bg-amber-600`, `bg-cyan-600`, etc., sin `sunmi-btn` ni `sunmi-pos-btn-*`.
- **Paneles:** `SunmiPanel` con `className` fijo `bg-slate-900/40 ring-2 ring-inset ring-slate-500/70` en compras-proveedor.
- **Tablas:** Varias páginas con `<table>` + `thead`/`tbody` y clases de fondo/borde/hover propias en lugar de SunmiTable o clases theme-safe.

No se ha modificado ningún archivo; solo diagnóstico.

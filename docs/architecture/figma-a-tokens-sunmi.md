# De las variables de Figma a los tokens del kit Sunmi

Relevado el 2026-09-11 sobre `67a02305`. Solo lectura: no se tocó ninguna
pantalla ni ningún componente.

## Cómo leer esta tabla

El kit **no expone tokens directamente**: expone **clases** —`.sunmi-text-strong`,
`.sunmi-border`— y cada clase lee una **variable CSS** que los catorce temas
redefinen. Así que una variable de Figma no mapea a "un token" sino a un par:
la clase que se escribe en el JSX y la variable que hay detrás.

Los catorce temas viven en `app/globals.css` (`html[data-theme="…"]`) y las
clases en `styles/sunmi.css`.

**Verificación de cobertura.** Para cada variable se contó en cuántos de los
catorce temas está definida. Una variable que falta en alguno no es equivalente
a una que está en todos: en los que falta se cae al valor de `:root`, que es el
del tema oscuro. Eso está anotado donde pasa.

---

## Colores

### `color/text/primary` → **`.sunmi-text-strong`** / `--app-fg`

Definida en los 14. Sin ambigüedad: es el color del texto principal y lo usan
además `.sunmi-section-title` y el `color` de `.sunmi-bg`.

### `color/text/secondary` → **dos candidatos, no elijo**

- **`.sunmi-text-muted`** → `color-mix(in srgb, var(--app-fg) 60%, transparent)`.
  Es el secundario **general del ERP**: lo usan las pantallas de módulos, las
  tablas y la recepción. Se deriva del texto primario, así que sigue al tema sin
  una variable propia.
- **`.sunmi-pos-muted`** → `--pos-muted`, definida en los 14. Es el secundario
  **del POS**, con su propio valor por tema (`#64748b` en `sunmiLight`).

No son el mismo color y no se pueden intercambiar. Cuál corresponde depende de
si la pantalla de Figma es del POS o del ERP general.

Hay además `--pos-muted-strong` (14/14), un intermedio entre el muted y el
primario, sin clase propia del kit que lo lea.

### `color/bg/app` → **`.sunmi-bg`** / `--app-bg`

Definida en los 14. `.sunmi-surface` lee la misma variable; la diferencia es que
`.sunmi-bg` además fija el `color` del texto, así que para el fondo de una
pantalla completa va `.sunmi-bg` y para un bloque suelto `.sunmi-surface`.

### `color/bg/surface` → **dos candidatos, no elijo**

- **`.sunmi-card-surface`** → `--card-bg` (14/14). El fondo de una tarjeta o
  panel elevado sobre el fondo de la app. `.sunmi-card` usa la misma variable y
  agrega radio, sombra y padding.
- **`.sunmi-surface-soft`** → `--app-input-bg` (14/14). El fondo de un campo de
  formulario.

En `sunmiLight` las dos valen `#ffffff` y parecen la misma; en otros temas no.
Son dos roles distintos y el nombre de Figma no alcanza para decidir cuál.

### `color/bg/subtle` → **tres candidatos, no elijo**

- **`.sunmi-thead`** → `--table-header-bg` (14/14). Encabezado de tabla.
- **`.sunmi-row-hover`** → `--table-row-hover` (14/14). Fila de tabla al pasar
  por encima. Existe además `--hover-bg` (14/14) para el hover general.
- **`.sunmi-pos-bg-surface`** / `.sunmi-pos-panel` → `--pos-panel-bg` (14/14).
  Panel del POS.

Los tres son "un fondo apenas distinto del de la app" y en varios temas
coinciden en valor. Cuál corresponde depende de qué es el bloque en Figma.

### `color/border/default` → **dos candidatos, no elijo**

- **`.sunmi-border`** → `--app-border` (14/14). El borde general. Lo leen también
  `.sunmi-divider` y `.sunmi-divide`.
- **`--card-border`** (14/14), que usan `.sunmi-card` y `.sunmi-card-surface`.

En la mayoría de los temas difieren: en `sunmiLight`, `--app-border` es `#cbd5e1`
y `--card-border` es `#e2e8f0`. El borde de una tarjeta es más suave que el
borde general, a propósito.

Aparte, y no es un borde: `--card-elevacion` es el límite visible de un panel
contra el fondo y va como `outline`, no como `border-color`. Está explicado en
`styles/sunmi.css`.

### `color/action/primary` → **dos candidatos, y son colores distintos**

- **`.sunmi-btn-primary`** → `--pos-accent` (14/14). En `sunmiLight` es `#d97706`,
  un ámbar. Lo leen también `.sunmi-text-accent` y `.sunmi-pos-text-accent`.
- **`.sunmi-pos-btn-primary`** → `--pos-btn-primary-bg` (14/14). En `sunmiLight`
  es `#16a34a`, un verde.

No es una diferencia de matiz: son la acción primaria del ERP y la del POS, y
eligen distinto. Hace falta saber de qué pantalla es el botón de Figma.

### `color/status/warning` → **dos candidatos, con distinta cobertura**

- **`.sunmi-text-warning`** → `--pos-warning`. **Definida en los 14.** Es la que
  el kit expone con clase propia.
- **`--warning-fg`**. **Definida en 10 de los 14**: faltan `sunmiDark`,
  `sunmiDarkCompact`, `sunmiGraphite` y `sunmiBlueClassic`, que caen al `:root`
  (`#fbbf24`). No tiene clase del kit que la lea; se usa directamente en algunas
  pantallas.

Y no valen lo mismo aunque suenen igual: en `sunmiLight`, `--pos-warning` es
`#b45309` y `--warning-fg` es `#d97706`. El primero está elegido a propósito
para dar 5,02 de contraste sobre el fondo claro — el ámbar de los oscuros daba
2,15 y no se leía. Está anotado en `app/globals.css`.

### `color/status/warning-subtle` → **NO hay token equivalente**

Hay una clase, `.sunmi-state-warning-soft`, pero no lee ninguna variable de
warning: se arma con `background: color-mix(in srgb, var(--pos-accent) 5%,
transparent)`. Lo mismo `.sunmi-state-warning`, que usa `--pos-accent` al 10 %
con borde al 40 %.

O sea que el "warning suave" del kit **se deriva del acento, no del warning**.
En los temas donde el acento y el warning coinciden se ve igual; donde no
—`sunmiLight`, `#d97706` contra `#b45309`— no es el tono suave de la variable de
warning. No elijo una equivalencia porque cualquiera de las dos lecturas sería
inventarla; si la variable de Figma tiene que existir de verdad en el kit, hay
que decidir antes si el warning suave se deriva de `--pos-warning` o sigue
derivándose de `--pos-accent`.

---

## Espaciados y radios

**El kit no los maneja con tokens.** No hay ninguna variable `--space-*`,
`--spacing-*`, `--radius-*` ni equivalente en `app/globals.css` ni en
`styles/sunmi.css`. Se escriben con **clases de Tailwind**, versión 3.4, con su
escala por defecto —donde el número es la medida en cuartos de `rem`—.

Las únicas medidas propias que el proyecto agrega están en
`tailwind.config.js`, y **ninguna de las seis variables pedidas cae en ellas**:

- `borderRadius.xl2` = `14px` → `rounded-xl2`
- `spacing["4.5"]` = `18px` → `p-4.5`, `gap-4.5`, …

| Variable de Figma | Clase de Tailwind | Valor |
|---|---|---|
| `space/4` | `p-1`, `gap-1`, `m-1`, `space-y-1`… | `0.25rem` = 4 px |
| `space/8` | `p-2`, `gap-2`, `m-2`, `space-y-2`… | `0.5rem` = 8 px |
| `space/12` | `p-3`, `gap-3`, `m-3`, `space-y-3`… | `0.75rem` = 12 px |
| `space/16` | `p-4`, `gap-4`, `m-4`, `space-y-4`… | `1rem` = 16 px |
| `radius/8` | `rounded-lg` | `0.5rem` = 8 px |
| `radius/12` | `rounded-xl` | `0.75rem` = 12 px |

El prefijo depende de qué se está midiendo —`p-` padding, `m-` margen, `gap-`
separación de flex o grid, `space-y-` separación entre hijos—; el **número** es
lo que traduce la variable de Figma.

Dos medidas del kit que no salen de esta escala, para que no sorprendan:
`.sunmi-card` usa `rounded-2xl` (`1rem` = 16 px) y `.sunmi-btn-parte-radio` fija
`border-radius: 0.375rem` (6 px) escrito a mano.

---

## Lo que hay que saber antes de usar esta tabla

**Una clase del kit no se concatena con una utilidad de Tailwind de la misma
familia.** Dos clases con la misma especificidad no las resuelve el orden del
atributo sino el de la hoja de estilos, así que poner las dos es dejar que gane
cualquiera. Hoy 16 de los 19 componentes del kit concatenan y por eso un ancho
escrito en la pantalla no se aplica; `SunmiInput` es el único que lo negocia, y
el porqué está en `lib/sunmi/claseAncho.js`.

**Y los colores no se hardcodean.** El contador del trinquete existe para eso.
Si una variable de Figma no tiene equivalente —hoy, `color/status/warning-subtle`
y las seis de espaciado y radio— la salida no es escribir el hex ni el píxel: es
decidir el token que falta, o usar la clase de Tailwind que corresponde.

# Marcadores del despliegue de `--pos-warning`

**Preparado el 2026-08-17 para `d77b27e`. NO se desplegó: eso lo dispara Emanuel.**

Producción está en `3767e80` —imagen
`ghcr.io/islaemanuel25-glitch/erpmanual:3767e80215d3f52360f710718f31470d145e9fce`—
y la tanda a desplegar va de ahí a `d77b27e`.

Lo único de estos commits que cambia lo que se ve es
`4c36e56`: `--pos-warning` pasa a estar definido en los catorce temas de
`app/globals.css`. El resto son candados, documentación y el comando de la suite.

---

## El marcador: la DEFINICIÓN, no el color

    --pos-warning:#b45309

Se busca con `grep -F` sobre la hoja servida, **sin espacio antes del valor**:
en el build de producción el CSS está minificado y es una sola línea.

Su hermano, para los cinco temas oscuros:

    --pos-warning:#f59e0b

**Los dos tienen que dar CERO antes y positivo después.** Medido contra la hoja
que sirve `operix.cloud` ahora mismo —no contra el fuente—: los dos dan 0.

Esperado después: **9 con `#b45309`** (los temas claros) y **5 con `#f59e0b`**
(los oscuros), que son 14. Corrobora que es la cuenta correcta el hecho de que
`--pos-accent:` ya da exactamente 14 en la hoja de producción: la minificación
conserva la definición de cada bloque de tema.

### Por qué NO se usa el color suelto, que era el candidato natural

`#b45309` **ya existe en el commit desplegado**: es el `--pos-accent` de
`sunmiSand`. En la hoja viva de producción la subcadena `b45309` aparece **8
veces**.

Un marcador con ese color habría dado **positivo en la imagen vieja** y se habría
leído como "mi cambio ya viajó". Es exactamente el caso de `my-0` dentro de
`!my-0` del 2026-08-16, con otro disfraz: **el marcador va anclado a la forma en
que aparece en la hoja**, y acá esa forma es la definición completa con sus dos
puntos y su valor.

---

## Los controles

**Control 1 — que la búsqueda encuentre algo cuando tiene que.** Un vacío sólo
significa algo si la misma búsqueda no siempre da vacío:

- `--pos-warning` suelto sobre la hoja de producción → **1**. Es el USO en
  `styles/sunmi.css:430`, que ya está desplegado. O sea que la cadena se encuentra
  y el archivo llega a la hoja.
- `--pos-accent:` sobre la misma hoja → **14**. Prueba que una DEFINICIÓN de token
  se encuentra en ese formato, que es justo lo que se va a buscar después.

**Control 2 — que el marcador esté bien elegido.** `b45309` suelto da 8, y por eso
se descarta como marcador. El control es lo que lo descubrió, no la lectura del
diff.

**El archivo está importado por alguien:** `app/layout.jsx:1` hace
`import "./globals.css"`, y es el layout raíz, así que entra en todas las páginas.
Y `globals.css:6` hace `@import "../styles/sunmi.css"`, que es de donde sale el
uso del token.

---

## Marcador de desaparición: NO HAY, y no se fuerza

La tanda no saca nada de la hoja:

- `styles/sunmi.css` **no cambió** entre `3767e80` y `d77b27e` —diff vacío—, así
  que la regla `.sunmi-text-warning { color: var(--pos-warning, #f59e0b); }` es la
  misma línea exacta antes y después. El respaldo sigue escrito ahí.
- La subcadena `f59e0b` en la hoja de producción da **17** hoy, y después de la
  tanda **sube a 22**, porque se agregan las cinco definiciones de los temas
  oscuros. Sube, no baja.

O sea que no hay nada que tenga que desaparecer. **Se dice en vez de inventar
uno**, que es la regla: un marcador de desaparición forzado sobre algo que sigue
existiendo da falso negativo y se lee como "no viajó".

---

## Qué NO prueban estos marcadores

Que el token esté definido en la hoja **no prueba que el aviso se lea mejor**. Eso
se probó antes de commitear, con la sonda de contraste sobre elementos reales en
los catorce temas, y está en el mensaje de `4c36e56`: los nueve claros pasan de
2,06–2,15 a 4,83–5,02, y los cinco oscuros quedan idénticos.

Después de desplegar, lo que corresponde es volver a correr esa sonda contra
producción, no volver a leer los números de acá.

---

## Las capturas del antes y después

**No van al repo**: se ven datos reales del negocio —nombres de productos y
proveedores— y este repositorio es público.

Quedaron en la máquina de desarrollo, en el scratchpad de la sesión del
2026-08-17:

    …/Temp/claude/c--Users-emanuel-Desktop-programas-programas-erpmanual/
      8e13a443-73eb-42ad-b6e0-c2114b638ed4/scratchpad/capturas/

Son cuatro: `1-antes-tema-claro.png`, `2-despues-tema-claro.png`,
`3-antes-tema-oscuro.png` y `4-despues-tema-oscuro.png`. El aviso "Sin receta" de
`/modulos/proveedores/recetas`, en su tarjeta y con las filas de arriba y abajo.

Control de ruido: tres capturas idénticas en cada una de las cuatro tomas. Y las
dos del tema oscuro son **el mismo archivo byte a byte** —hash `cf6fe4eb95d8`—,
que es la prueba de que ahí no se movió nada.

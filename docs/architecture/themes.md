# Temas y apariencia

Tres capas que **se apilan, no compiten**. Confundirlas es el error clásico de
esta área.

---

## Las tres capas

1. **`lib/sunmiThemes.js`** — 14 temas, cada uno con **clases de Tailwind escritas
   a mano**. Lo consumen los componentes vía `useSunmiTheme()`.
2. **`app/globals.css`** — 14 bloques `html[data-theme=...]` más dos `:root`, que
   definen **variables CSS**.
3. **`styles/sunmi.css`** — clases sueltas.

**Los dos primeros tienen los mismos catorce nombres**, y esa coincidencia es la
trampa: son sistemas paralelos.

**Cuál gobierna:** el atributo `data-theme` del `<html>` decide qué tema está
activo. Para el color de una marca —el acento— **manda la variable CSS de
`globals.css`**, no el hex de `sunmiThemes.js`. Nada de un hex fijo ni de una
clase de Tailwind con número.

---

## Quién escribe `data-theme`, y en qué orden

1. **El SSR**, en `app/layout.jsx:23`. Resuelve el tema institucional del local
   leyendo `ConfiguracionLocal` y lo pinta antes de que el navegador dibuje. Es lo
   que evita el flash de oscuro a claro.
2. **Un `<script>` en el `<head>`** (`app/layout.jsx:30`) — aplica la preferencia
   **personal** guardada en `localStorage`, que gana sobre la institucional.
3. **El provider**, que **saltea a propósito el primer sync**
   (`lib/apariencia/syncDataTheme.js:18`) para no pisar lo que ya pintaron los dos
   anteriores.

La resolución tiene tres niveles: **personal → institucional del local →
default**. `lib/apariencia/resolver.js` y `temaServidor.js`.

Candados: `lib/apariencia/resolver.test.mjs` y `syncDataTheme.test.mjs`.

---

## La excepción al "no hay Server Components con datos"

`app/layout.jsx:19` **es** un Server Component que consulta la base. Es la única
excepción encontrada a lo que afirma `docs/01-ARQUITECTURA.md`, y es deliberada:
sin ella no se puede resolver el tema antes del primer pintado.

---

## El aviso ámbar contra el acento de la marca

**Anotado y deliberadamente no resuelto.** En el tema naranja, el ámbar semántico
de `sunmi-text-warning` y el acento de la marca son casi el mismo color.

La decisión tomada fue **que el aviso siga siendo semántico** y no se ate al tema:
un aviso que cambia de color según la marca deja de leerse como aviso. Queda a la
vista para mirarlo cuando alguien abra esa pantalla en ese tema.

---

## Contradicciones con la documentación

- `docs/03-COMPONENTES-SUNMI.md:7` dice que el tema "lee/guarda en localStorage".
  Hoy hay **tres niveles** con resolución en el servidor; el `localStorage` es solo
  el primero.
- `docs/03-COMPONENTES-SUNMI.md` **no documenta cinco componentes que existen**:
  `SunmiToast`, `SunmiPageSizer`, `SunmiDateRangePicker`, `SunmiBackButton` y
  `SunmiSelectConCrearRapido`.
- `docs/03-COMPONENTES-SUNMI.md:108` y `docs/05-GUIA-ESTILOS-UI.md:7` no coinciden
  en los colores que acepta `SunmiButton`. **[DUDA]** — no se abrió el componente
  para dirimirlo.

---

## Verificar un cambio de tema

Con capturas, en **al menos dos temas de colores distintos**, y con el mismo ancho
**y** alto en los dos lados. El procedimiento está en la skill `/capturas`.

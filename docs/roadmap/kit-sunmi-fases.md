# El kit de Sunmi, por fases

**PENDIENTE CONFIRMADO.** Aprobado por Emanuel. Este documento no existía: el
plan vivía en la conversación, y por eso la fase 1 estaba a punto de ejecutarse
con una premisa que la medición mostró falsa.

Medido sobre `ee09abe` — 2026-08-12.

## La regla de oro, que vale para todas las fases

**Cada pieza sale de una pantalla que HOY funciona, tal cual está. Nada se
inventa pensando en casos futuros.** Y la prueba de que un paso salió bien es
que la pantalla de donde se sacó la pieza quede **idéntica**, comparada píxel a
píxel. Si aparece una diferencia, la pieza está mal, no la pantalla.

*Por qué:* las dos piezas que se escribieron adivinando sirven para menos casos
de los que hay. `SunmiModalLayout` solo sabe centrar y hay dos pantallas que por
eso no lo pueden usar; `SunmiButtonIcon` trae tres colores fijos adentro y no
acepta `title` ni `aria-label`.

## Fase 1 — Sacar la fila y sus partes. CORREGIDA.

**Lo que decía:** crear una celda y un encabezado nuevos.

**Lo que dice ahora:** no se crean. El camino de la enorme mayoría de las celdas
crudas es **migrar a `SunmiTable` en modo por columnas**, que ya existe, ya arma
encabezado, celdas, tono de fila y el panel que cuelga debajo, y corre en
producción desde `718ab1c`.

### Lo que lo cambió, medido

Enumerado con `git ls-files` sobre el repo entero —no `readdirSync`, que mira un
solo nivel— y el patrón `<td` no seguido de letra, que atrapa las cinco celdas
escritas con los atributos en la línea siguiente:

- **494 celdas `<td` en 53 archivos**, sacando los tres del kit, que son el
  mecanismo y no candidatos.
- **133** dentro de un `<table>` armado a mano, en 17 tablas.
- **361** hijas de `SunmiTable` en modo clásico, en 53 instancias.
- **447 pueden pasar a modo por columnas. 47 no.**

Contar la palabra `colSpan` habría dado 191 celdas trabadas. Mirando cada una,
son 47: doce de los dieciséis archivos que la tienen la usan para la fila vacía,
la de "Cargando…" o la de detalle desplegado, y **las tres las hace el modo por
columnas hoy** con `vacio`, `cargando` y `filaExpandible`.

Se buscaron además dos bloqueos que no aparecieron: no hay ningún encabezado de
dos pisos en el repo, ni ninguna tabla que mezcle filas de agrupación con filas
de datos.

### Las cuatro tablas que no entran

Tres por lo mismo — una fila de TOTAL al pie —: la recepción de
`compras-proveedor/[id]`, el TOTAL CORREGIDO de `EditorVentaCorreccion` y el
`<tfoot>` de `auditoria-pos-ventas/turnos/[id]`. La cuarta es la grilla de
errores de importación de productos, que usa `rowSpan` para abrir una fila del
archivo en varias, una por error.

**El pie de totales es lo único que le falta a la pieza**, y no lo tiene:
verificado, no hay `tfoot` ni `pie` ni `footer` en `SunmiTable`. Va en esta
fase, en su propia tanda, y **no espera a la fase 2**: la migración de las 447
pasa por esas tres pantallas, y si el pie no existe alguien las saltea o las
resuelve a mano, que es lo que esto viene a frenar. Las tres se miran juntas
antes de escribir una línea.

La de `rowSpan` **se queda como está**. Una sola celda suelta no justifica una
familia, y una familia escrita para un caso es el error que ya se cometió dos
veces.

### Lo hecho

- `SunmiPar` (`2cc15c1`): el par de dos renglones, sacado de `TablaCatalogo`,
  que es la tabla que la pantalla de listas renderiza de verdad. Siete usos
  reales, cuatro en el catálogo y tres en comprobantes, y ya se habían separado
  en 9.5 px contra 10 px. El catálogo quedó en cero píxeles de diferencia a 360
  y a 1366.
- Borrado `GrillaConciliacion` (`ee09abe`): 390 líneas que duplicaban una
  pantalla viva y que no renderizaba nadie.
- **Falta:** que la conciliación de comprobantes importe `SunmiPar`, y el pie de
  totales.

## Deuda anotada de esta fase

- **Los 9.5 px contra los 10 px del kit.** `SunmiPar` a propósito no lo decide:
  unificar hoy movería una pantalla viva. Se mira cuando las dos estén migradas
  y el cambio se pueda medir en las dos a la vez.
- **16 de los 19 componentes del kit concatenan el `className` en vez de
  negociarlo**, y por eso un ancho escrito en la pantalla no se aplica. Es el
  trabajo de la fase 4. Ninguna pieza nueva nace con ese defecto:
  `lib/sunmi/claseAncho.js` y `lib/sunmi/claseNegociada.js` tienen la forma.

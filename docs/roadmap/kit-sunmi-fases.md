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

### EL PADDING: leer esto ANTES de migrar una sola celda

En modo por columnas el padding de la celda lo pone `densidad`, y hay tres:
`compacta` px-2 py-1, `normal` px-2 py-1.5 y `comoda` px-3 py-2.5.

**De las 440 celdas crudas del repo que traen padding propio, esas tres cubren
145. Las otras 295 usan otra cosa.** Las cuatro formas más comunes que ninguna
densidad cubre son `px-3 py-1.5` en 67 celdas, `px-3 py-2` en 63, `px-2 py-2` en
52 y `px-2.5 py-3` en 46.

O sea: **migrar una tabla cualquiera sin saber esto le cambia el padding a dos de
cada tres celdas.** Y hasta `db47914` tampoco se arreglaba escribiéndolo en
`tdClassName`, porque la tabla lo concatenaba con el de la densidad y ganaba el
que Tailwind hubiera puesto último en la hoja de estilos. `px-3` le gana a
`px-2` por el orden numérico, así que a veces salía bien — que es la peor forma
de salir bien, porque al revés sale mal en silencio.

Desde `db47914` la densidad **cede, por eje**: si la columna declara `px-3`, la
tabla no pone su `px` y sí conserva su `py`. No hacen falta densidades nuevas.

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

## Fase 5 — al cerrar la fase 2, antes de la 3

**PENDIENTE CONFIRMADO.** Decidido el 2026-08-13, con dos evidencias y no una.

Lo único que le falta a la fase 5 es que los chequeos corran **del lado del
servidor** y no solo en la máquina de quien está trabajando. Las dos cosas que
ya se escaparon las atajaría eso mismo:

- **El trinquete avisa pero no obliga.** Corre en un hook local, que solo existe
  dentro de una sesión de Claude Code en este repo. Una terminal cualquiera lo
  esquiva sin querer.
- **Un commit que no compilaba llegó a `origin/main`.** Traía un candado que
  importaba algo que su propio commit no exportaba. La suite estaba en verde
  porque corrió contra el árbol de trabajo, donde la exportación sí estaba.

No se adelanta porque partir la fase 2 al medio cuesta más de lo que ahorra,
pero queda fijado el momento: al cerrar la fase 2, antes de empezar la 3.

## Fase 2 — qué declaró cada pantalla contra el default del kit

**EL PARÁMETRO ES UNA POSTERGACIÓN, NO UN PERDÓN.** Sin esta cuenta, la fase 2
termina con 36 modales parametrizados, ninguno igual a otro, y nadie sabe después
qué se puede unificar y qué tiene razón de ser distinto. Una postergación sin
registro es un olvido.

Se anota cada pantalla que pase un parámetro distinto del default, con qué
declaró y por qué. Al cerrar la fase se mira esta tabla entera y se decide qué se
unifica.

Los parámetros que existen, todos con el valor del kit por defecto y todos
sacados de pantallas que hoy funcionan:

- **`z`** — el apilado. El repo tiene un escalonado con intención: 40 el fondo del
  cajón, 50 el modal, 60 el desplegable que se abre dentro del modal.
- **`espacioCuerpo` / `espacioPie`** — el espaciado interior. Emparejar es la capa
  y la estructura, no repintar el interior: el `gap-3` del kit separa todos los
  bloques de un formulario, y migrar una capa no puede estirar un modal de
  permisos con quince toggles.
- **el alto del cuerpo** — decidido, todavía sin escribir: se agrega cuando migre
  la primera pantalla que lo necesite. Hoy conviven 65, 70, 80, 90 y 92vh.
- **el padding de la tarjeta** — decidido, todavía sin escribir, por lo mismo.
  Tres modales tienen `p-0 overflow-hidden` y ponen su propio padding adentro.
- **`refCuerpo`** — una referencia al div del cuerpo. **Lo usa UNO SOLO**:
  `ModalProveedor`, para mandar el scroll arriba cuando el modal se reabre. Sin
  eso, abrirlo para editar otro proveedor lo deja scrolleado donde quedó el
  anterior, y alguien termina editando el campo equivocado. Es el único
  parámetro de la familia que NO es de aspecto: sin él esa pantalla no se podía
  migrar sin perder una función.

  **Cuando estén las 36:** mirar si esto debería hacerlo la pieza para todos
  —reabrir un modal arriba es razonable siempre— en vez de recibirlo de afuera.

### PUNTO FIJO DE LA LISTA BASE: el cuerpo con `space-y-*` se separa

**Todo modal cuyo cuerpo traiga `space-y-*` se va a separar unos píxeles al
migrar.** Va declarado de antemano en cada tanda, con el número medido de esa
pantalla.

*Por qué:* la pieza pone `flex flex-col` en el cuerpo y los originales son
bloque. Con un contenedor de bloque, el `space-y-*` y los márgenes internos de
cada campo **se colapsan**; en un contenedor flex no, así que se suman. No es que
el `space-y-*` se pierda: se comporta distinto.

Medido en `ModalProveedor`, que fue el primero: **12 píxeles en total** repartidos
en el formulario entero. "Nombre" pasó de 160 a 171 desde el borde de la tarjeta,
y el par de botones del pie de 631 a 643.

**Esto es un cambio ACEPTADO, no una verificación de que no lo hubo.** Se decidió
así por tres motivos, y no se rediscute:

1. Sacar el `flex flex-col` movería los ocho modales ya migrados, que están
   desplegados y andan bien. Cambiar ocho pantallas vivas para dejar una idéntica
   es el peor de los tres canjes.
2. Un séptimo parámetro sería el primero que NO sale de una necesidad de una
   pantalla sino de dos formas de calcular el mismo espaciado. Los otros seis
   salieron de algo que una pantalla real necesitaba; este saldría de una
   diferencia de motor. Esa puerta no se abre.
3. Doce píxeles repartidos en un formulario entero es "un poco más aireado", no
   algo roto.

**A cuántos les aplica, contado:** de las **30 capas que quedan por migrar**,
**8 tienen `space-y-*` en el cuerpo** y 22 no. Las ocho son los tres modales de
`clientes`, `configuracion/mantenimiento`, `turnos/[id]`, `ModalProcesoPendiente`,
`ModalCategoria`, `ModalListaPrecio`, `ModalPreviewPrecio` y
`ModalPedirOperador`. A esas ocho hay que medirles el número antes de migrarlas.

**Y TENER `space-y-*` NO ALCANZA PARA QUE EL NÚMERO SEA DISTINTO DE CERO.**
Medido en `ModalCategoria`, que es el primero de las ocho que se migró: **cero
píxeles a 1366 y cero a 360**, campo por campo y en el alto de la tarjeta.

El motivo, que es el que hay que llevarse: lo que el `flex flex-col` cambia es
que los márgenes **dejen de colapsar entre sí**. El `space-y-4` le pone
`margin-top` a los hijos del segundo en adelante; si esos hijos **no traen
márgenes propios**, no hay nada con qué colapsar y bloque y flex dan lo mismo.
Los 12 píxeles de `ModalProveedor` salieron de que sus campos sí los traen.

O sea que la pregunta no es "¿tiene `space-y-*`?" sino "¿los hijos del cuerpo
tienen márgenes propios?". La lista de ocho sigue siendo la lista de sospechosos
—hay que medirlos igual—, pero el número puede dar cero, y dio cero las tres
primeras veces: `ModalCategoria`, `ModalListaPrecio` y `ModalPreviewPrecio`, las
tres a 1366 y a 360. **Tres ceros seguidos no autorizan a saltearse la medición
en la cuarta**, que es exactamente el razonamiento que este párrafo existe para
frenar: los 12 px de `ModalProveedor` fueron reales. Cómo se mide, sin tocar una línea: se abre el modal, se anotan los `top` de
cada hijo contra el borde de la tarjeta, se le pone `display:flex` con
`flexDirection:column` al div del cuerpo desde el navegador, y se vuelven a
anotar.

### Declaraciones

| pantalla | parámetro | valor | por qué |
| --- | --- | --- | --- |
| `roles/ModalRol` | `espacioCuerpo` / `espacioPie` | `""` | el `gap-3` del kit separaría los quince toggles de permisos entre sí |
| `locales/ModalLocal` | `espacioCuerpo` / `espacioPie` | `""` | mismo caso: emparejar la capa no puede repintar el formulario |
| `operadores/ModalOperador` | `espacioCuerpo` / `espacioPie` | `""` | ídem |
| `usuarios/ModalUsuario` | `espacioCuerpo` / `espacioPie` | `""` | ídem |
| `proveedores/ModalProveedor` | `encabezado` | `"cinta"` | su título es una cinta ámbar en mayúsculas; el default del kit lo dejaría en texto blanco normal |
| `proveedores/ModalProveedor` | `refCuerpo` | `modalRef` | manda el scroll arriba al reabrir. **No es aspecto**: sin esto, editar otro proveedor abre el modal donde quedó el anterior |
| `proveedores/ModalProveedor` | `espacioCuerpo` | `"px-2 pb-4 mt-2 space-y-4"` | el `space-y-4` separa los campos del formulario |
| `proveedores/ModalProveedor` | `espacioPie` | `"pt-2"` | tenía `pt-2`, no el `mt-3` del kit |
| `compras-proveedor/ModalEnviarPedido` | `encabezado` | `"cinta"` | mismo caso que proveedor |
| `compras-proveedor/ModalEnviarPedido` | `espacioCuerpo` / `espacioPie` | `""` | su cuerpo es contenido suelto con sus propios márgenes |
| `compras-proveedor/ModalVincularCodigo` | `encabezado` | `"cinta"` | mismo caso |
| `compras-proveedor/ModalVincularCodigo` | `espacioCuerpo` / `espacioPie` | `""` | el cuerpo trae sus propios márgenes |
| `proveedores/ModalCodigosProveedor` | `encabezado` | `"cinta"` | mismo caso |
| `proveedores/ModalCodigosProveedor` | `espacioCuerpo` / `espacioPie` | `""` | es de solo lectura y no tiene pie: el único botón es el de cerrar, que lo pone la pieza |
| `categorias/ModalCategoria` | `maxWidth` | `"max-w-md"` | su tarjeta es `max-w-md`; con el `max-w-xl` del kit pasaría de 392 a 504 px a 1366 |
| `categorias/ModalCategoria` | `espacioCuerpo` | `"p-4 space-y-4"` | el cuerpo trae su propio padding y su propia separación de campos |
| `listas-precios/ModalListaPrecio` | `maxWidth` | `"max-w-md"` | su tarjeta es `max-w-md`, no el `max-w-xl` del kit |
| `listas-precios/ModalListaPrecio` | `espacioCuerpo` | `"p-4 space-y-4"` | ídem categorías |
| `listas-precios/ModalPreviewPrecio` | `maxWidth` | `"max-w-2xl"` | su tarjeta es `max-w-2xl` |
| `listas-precios/ModalPreviewPrecio` | `espacioCuerpo` | `"p-4 space-y-4"` | ídem |

### El padding de la tarjeta NO se escribió, y este es el motivo

**PENDIENTE CONFIRMADO — decidido el 2026-08-13, midiendo.**

`ModalCategoria` era, según el plan, "la primera pantalla que lo necesita":
declara `p-0 overflow-hidden` en su `SunmiCard` y pone su propio padding adentro.
Al medirlo antes de tocar nada, **ese `p-0` nunca se aplicó**. La tarjeta tiene
21 px de padding hoy, y sigue teniendo 21 px después de migrada.

De dónde salen los 21 px, que es lo que hay que saber antes de tocar esto:
**`SunmiCard` tiene un comentario adentro del `className`**, y por eso las tres
piezas del comentario entran como clases de verdad:

    p-3           /* antes p-4 / p-6 */

El navegador ve `p-3`, `p-4` y `p-6` en la misma tarjeta. Las tres existen en la
hoja de estilos porque el repo las usa en otro lado, tienen la misma
especificidad, y gana la última que Tailwind haya escrito: `p-6`. Con la raíz en
14 px eso da 21. **Le pasa a TODAS las tarjetas del sistema**, no solo a los
modales: la sonda contra una tarjeta cualquiera de la pantalla de categorías da
los mismos 21 px.

Así que el `p-0` de esas tres pantallas no perdía contra el `p-3` del kit —que ya
sería el defecto de concatenar en vez de negociar—: perdía contra una clase que
nadie escribió. **Una pantalla que declara algo que nunca se aplicó no es una
pantalla que necesite un parámetro**, y escribirlo igual sería inventar la
séptima pieza sin una necesidad detrás, que es el error que este documento
prohíbe en la primera línea.

Queda para decidir, y **no se resolvió acá porque mueve todas las tarjetas del
repo a la vez**: sacar el comentario de adentro del `className` de `SunmiCard`
baja el padding de 21 a 10.5 px en cada tarjeta del sistema. Es un cambio de una
línea y de una tanda entera de verificación.

### El velo: qué se pierde, no qué tan peligroso es

**PENDIENTE CONFIRMADO — decidido el 2026-08-13, y CORRIGE el criterio anterior.**

El criterio que estaba escrito al lado del prop decía "una acción que escribe y
no se puede deshacer sola". Eso mezcla dos cosas distintas y lleva a la respuesta
equivocada.

**El velo no cierra cuando cerrar sin querer PIERDE algo** —lo que la persona
escribió, o una operación en vuelo—, no cuando la acción es peligrosa.

El caso que lo mostró: "¿Borrar este comprobante?" es todo lo peligrosa que se
quiera y cerrarla sin querer no cuesta nada, se vuelve a abrir y se confirma. Un
formulario de proveedor con media pantalla escrita no es peligroso, y un toque al
costado —que en el teléfono pasa solo— tira lo escrito.

En la práctica: **los modales de CARGA y EDICIÓN lo declaran; los informativos,
los de confirmación y los de selección no.**

**`destructivo` es candidato a renombrarse al cerrar la fase 2.** El nombre
arrastra la confusión que este criterio corrige. No se renombra ahora: hacerlo
mientras se migra ensucia las comparaciones. En esa misma vuelta se revisan
`ModalRevertir` y `ModalTerminar`, que hoy lo declaran por el criterio viejo y
quedan como están.

La lista de los dos lados —enumerada con `git grep` sobre `app` y `components`,
abriendo cada pantalla y no fiándose del conteo de campos— la fija el candado
`components/sunmi/SunmiModalLayout.test.mjs`, que además exige que la lista sean
TODOS los consumidores de la pieza y no los que alguien recordó.

Lo que el conteo de campos habría contestado mal: `PanelComprobantes` da tres
campos, y sus dos modales no tienen ninguno — los campos están en el panel.

### Props muertos que se conservan a propósito

Se dejan escritos para no perder el texto antes de decidir si el kit los muestra
o si salen. Hoy NO se dibujan, y el candado `lib/sunmi/propsDelKit.test.mjs` los
tiene contados.

| pantalla | prop | valor | estado |
| --- | --- | --- | --- |
| `locales/ModalLocal` | `subtitle` | "Configurá los datos del local" | muerto: `SunmiCardHeader` no lo acepta |
| `usuarios/ModalUsuario` | `subtitle` | "Configurá los datos del usuario" | muerto: se conserva en la pieza |

### Props muertos que se DESCARTARON, con el motivo

Para que el que los encuentre dentro de un año no rehaga el análisis.

| pantalla | prop | texto | por qué se descarta |
| --- | --- | --- | --- |
| `configuracion/arqueo-caja` | `titulo` | "Retiros de recaudación" | el texto está vivo y es correcto, pero **ya aparece veinte líneas más abajo** como título de la primera tarjeta. Repetirlo arriba no agrega nada. Subirlo y sacar el de abajo dejaría la pantalla mejor, pero eso es rediseñarla: esta fase mueve la capa, no el contenido |
| `configuracion/arqueo-caja` | `subtitulo` | "Alertas de retiro de recaudación de este local" | además de estar en español, `SunmiHeader` **no tiene** subtítulo. Agregárselo para un texto que se iba a descartar sería trabajo para nada |

**El criterio que salió de acá, y que vale para los siete `subtitle` que
quedan:** no alcanza con preguntar si el texto está vivo. Hay que preguntar
también **si repite lo que la pantalla ya dice**. Arqueo-caja fue el primer caso
y no va a ser el único.

### Para la fase 3 — lo que le falta a `SunmiButtonIcon`

Se le arreglaron los props que descartaba —`aria-label` y `disabled`— porque uno
de ellos era comportamiento y no aspecto. **Le quedan los tres colores fijos**:

    amber: "text-amber-300 hover:text-amber-200"
    red:   "text-red-400 hover:text-red-300"
    slate: "text-slate-400 hover:text-slate-200"

Son colores de Tailwind, no tokens del tema, así que en un tema claro se ven
igual que en el oscuro. Cambiarlos toca todas las pantallas que lo usan, y por
eso no entró en la tanda del `disabled`: mezclar un arreglo de comportamiento con
un cambio de aspecto deja una comparación que no prueba ninguno de los dos.

El análisis ya está hecho y no hace falta rehacerlo: son esas tres líneas.

### Para la fase 4

**Cinco `className` a `SunmiTable`.** El componente los ignora **a propósito** y
está escrito en su encabezado: implementarlo cambiaría el aspecto de esas
pantallas solo por existir. Pero cinco pantallas escribieron algo creyendo que
hacía efecto, así que la decisión no es "está documentado y listo": o el
componente los acepta y esas cinco cambian a propósito, o se sacan de las cinco.

## Deuda anotada de esta fase

- **`PanelComprobantes`: el import se verificó en la imagen, no ejerciendo el
  error.** El 2026-08-13 se arregló que usara `queHacerHttp` y `SIN_RESPUESTA`
  sin importarlos, y se comprobó que el import viajó a la imagen desplegada. Lo
  que NO se hizo es forzar una subida fallida en producción para ver el mensaje
  correcto: cuesta más de lo que agrega y toca un módulo que se está usando.
  **Queda pendiente para la próxima vez que falle una de verdad**: cuando pase,
  mirar que salga el texto y no un ReferenceError.

- **Los 9.5 px contra los 10 px del kit.** `SunmiPar` a propósito no lo decide:
  unificar hoy movería una pantalla viva. Se mira cuando las dos estén migradas
  y el cambio se pueda medir en las dos a la vez.
- **15 de los 19 componentes del kit concatenan el `className` en vez de
  negociarlo**, y por eso un ancho escrito en la pantalla no se aplica. Eran 16:
  `SunmiTable` ya está hecho en `db47914` —el primero—, así que **la fase 4 no lo
  rehace**. Ninguna pieza nueva nace con ese defecto; `lib/sunmi/claseAncho.js` y
  `lib/sunmi/claseNegociada.js` tienen la forma.

## El arnés de captura, y por qué una captura sola no prueba nada

`scripts/medir-desborde.mjs` toma la foto. Dos cosas que no son opcionales:

- **`--repeticiones 3`.** Fotografía tres veces y compara los bytes. Si no dan
  idénticas lo dice y sale con error, y guarda las tres para poder encontrar la
  causa. Un arnés que a veces acierta es peor que no tener: produce ceros que uno
  se cree. La captura de la recepción a 360 daba 27.639 píxeles de diferencia
  entre dos corridas de la MISMA versión, y los ceros que se habían informado
  antes con ella fueron suerte.
- **`--alto-captura`**, que acota la foto a una banda fija —2400 px por defecto—.
  Sin eso, un píxel de más arriba de todo corre el resto de la página y contamina
  la comparación entera.

La causa de aquel ruido era el tiempo: transiciones y animaciones fotografiadas
a mitad de camino. Antes de la foto el arnés las apaga, manda el scroll a cero y
saca el foco. Aun así el chequeo queda: quedó una intermitencia de
aproximadamente una corrida de cada seis, y **el chequeo la agarra**.

### `--elemento`: el recorte deja de ubicarse a mano

Hasta el 2026-08-13 la foto salía de la banda entera y había que **ubicar a mano
la caja de la tarjeta** en cada captura para poder compararlas. Medido sobre las
tandas de modales, esa parte manual era dos tercios del costo de cada una, y
quedan 26 capas.

    --elemento ".fixed.inset-0 .rounded-xl.shadow-md" [--margen 24]

El arnés mide el `getBoundingClientRect` de ese nodo y recorta a esa caja. Va con
tres cosas que no son opcionales:

- **Si el selector no encuentra nada, sale en rojo nombrándolo y NO saca la
  foto.** Ese candado no existía, y sin él un selector viejo recorta la zona
  equivocada: la comparación informa una diferencia que no existe y nadie se
  entera.
- **El chequeo de "entra entero" pasa a preguntar por ESE elemento**, no por todo
  lo pintado. Con recorte al elemento, lo de afuera queda afuera a propósito; lo
  que no puede pasar es que algo de adentro se derrame fuera de la foto.
- **El selector queda guardado en una ficha `.json` al lado de la captura**, y
  `scripts/comparar-capturas.mjs` se niega a comparar dos fotos cuyas fichas no
  coincidan. Si el antes se recortó por un selector y el después por otro, la
  resta mide regiones distintas.

`comparar-capturas.mjs` sale con **0** si son idénticas, **1** si difieren
—informa cuántos píxeles, entre qué esquinas y en qué filas— y **2** si no son
comparables. El 2 también salta cuando **el elemento cambió de tamaño**, que es
información y no una molestia: al migrar `ModalCategoria` la tarjeta creció 3 px
de alto y el comparador lo dijo antes de mirar un solo píxel.

Y una que se paga en cada tanda: **el perfil de Edge NO conserva la sesión**. Al
navegador se lo mata con `kill`, no con un cierre limpio, así que la cookie nunca
se escribe al disco del perfil. Lo que funciona es dejar UN Edge vivo en el
puerto 9224, logueado y con el contexto fijado: cuando el arnés intenta levantar
el suyo, el perfil ya está tomado, su Edge se muere solo y se engancha a ese.

### Y el otro `--abrir`

Un modal no tiene URL propia. Si no se lo abre, la foto es de la pantalla de
atrás — y esa foto es perfectamente determinista, así que pasa todos los
chequeos. `--abrir "Nueva"` toca el primer botón cuyo texto lo contenga, y falla
nombrándolo si no hay ninguno. El `--abrir-primero` que ya estaba busca
`/Cargar|Cambiar/` y servía para una pantalla sola.

Rehecha con el arnés arreglado, la comparación de la recepción contra el commit
anterior a `SunmiPar` da **idéntico byte a byte** a 360 y a 1366.

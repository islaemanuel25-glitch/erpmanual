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

## Cuántas capas quedan: UNA cifra, y de dónde sale

**PENDIENTE CONFIRMADO — reconciliado el 2026-08-13.** Había tres números
circulando —54, 43 y 21— y ninguno era comparable con los otros. Es la segunda
vez del mismo patrón, después del 43 contra el 54, y así es como se planifica
mal.

### El criterio, que es lo que faltaba escribir

**Una capa de modal es un `fixed inset-0` que tapa la pantalla para poner algo
encima y bloquear lo de atrás.** Cuenta:

- si el panel está ADENTRO de la capa (el modal centrado de siempre), y
- si el panel es HERMANO de la capa (un velo suelto al lado de un cajón o de una
  hoja). El kit dibuja las dos cosas: para eso están `hoja` y `cajon`.

Se cuentan **capas y no archivos**, porque un archivo puede tener varias:
`clientes/page.jsx` tiene tres, y `CarritoPedido` tiene dos que además son formas
distintas. Se saltean las líneas comentadas: una capa nombrada en un comentario
no es una capa.

Un archivo que ya importa `SunmiModalLayout` no aporta ninguna, aunque adentro le
quede algo a mano. Es una limitación conocida del contador y se anota acá para
que no se descubra de nuevo.

### La cifra

**43 capas de modal armadas a mano**, en 37 archivos. Enumerado con `git ls-files`
sobre `app` y `components` —el repo entero, no un nivel— aplicando el criterio de
arriba.

**Y es exactamente el número que imprime el trinquete** como "modales armados a
mano". O sea que ya estaba automatizado y no hacía falta un segundo conteo: **de
acá en adelante la cifra es la del trinquete**, y cualquier otra que aparezca en
un informe hay que reconciliarla contra esa antes de usarla.

### Los que creí que había que descontar, y por qué NO se descuentan

Dije que seis no eran modales. Al abrirlos, **cinco sí lo son** por el criterio de
arriba, y el sexto nunca estuvo en la cuenta:

- `sidebar/SidebarPro`, `sidebar/SidebarMobile`, `layout/MobileNav` y
  `notificaciones/CampanaNotificaciones` son **velos sueltos**: el `fixed inset-0`
  oscurece el fondo y el panel se dibuja al lado, con su propio `fixed`. Los
  descarté por el nombre —"eso es navegación, no un modal"— y estructuralmente
  son exactamente lo que `cajon` y `hoja` vienen a dibujar. Son candidatos, no
  ruido.
- `layout/SubmenuPanel` es **un modal centrado de verdad**, con
  `flex items-center justify-center` y el panel adentro. Se llama panel y eso me
  alcanzó para descartarlo. No alcanzaba.
- `components/sunmi/SunmiModalLayout` nunca estuvo en la cuenta: el contador
  excluye los archivos que importan la pieza, y la pieza se nombra a sí misma.

**Lo que esto deja como aviso, y es la parte que se repite:** cinco de seis salieron
de mirar el nombre del archivo. Abrirlos costó dos minutos y cambió la cifra en
cinco. Es la misma familia que la firma que agrupaba por cuatro rasgos elegidos a
ojo y daba 12 grupos donde había 23.

### Un hallazgo del recuento

**`components/sunmi/SunmiSelectConCrearRapido` arma su propio modal a mano**, con
`fixed inset-0 z-[60] flex items-center justify-center bg-black/50` y una tarjeta
adentro. Es un componente DEL KIT que no usa la pieza de modal del kit. No se
toca en esta fase —no es una pantalla— pero queda anotado: cuando se migre, es el
que más raro se lee si sigue como está.

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

**A cuántos les aplica, contado:** medido sobre `ee09abe`, cuando quedaban 30
capas por migrar —esa cifra está **superada**, ver "Cuántas capas quedan" arriba:
la que vale es la del trinquete—, **8 tenían `space-y-*` en el cuerpo** y 22 no. Las ocho son los tres modales de
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
| `caja/ModalCambioPrevio` | `forma` | `"hoja-o-centrado"` | **es la pantalla de ORIGEN de esa forma**: hoja pegada abajo en el teléfono, centrada de `sm` para arriba |
| `caja/ModalCambioPrevio` | `alto` | `"max-h-[92vh] sm:max-h-[88vh]"` | el par entero, tal como lo escribía. La forma lo aplica a la TARJETA |
| `caja/ModalCambioPrevio` | `paddingTarjeta` | `"!p-0"` | su tarjeta no tiene padding: cada bloque pone su `px-4` |
| `caja/ModalCambioPrevio` | `sombraTarjeta` | `"!shadow-2xl"` | más marcada que el `shadow-md` del kit |
| `caja/ModalCambioPrevio` | `espacioCuerpo` / `espacioPie` | `"px-4 space-y-3"` / `"!grid …"` | el pie es una GRILLA, no el flex del kit: apilado en el teléfono, en fila de `sm` para arriba |
| `caja/ModalCambioPrevio` | `className` | `"sm:mx-4"` | el margen lateral del panel de `sm` para arriba |

### La primera vez que una forma del kit se dibuja desde el kit

`hoja`, `cajon` y `hoja-o-centrado` se extrajeron de tres pantallas y **ninguna
de las tres había vuelto al kit**: hasta acá las cuatro formas tenían un solo
usuario real, `centrado`. O sea que tres de las cuatro nunca se habían dibujado
desde la pieza, y su única prueba era que compilaban.

`ModalCambioPrevio` es el primer caso, y por eso sus capturas van a los dos
anchos **con intención y no por costumbre**: la forma cambia con el ancho, así
que a 360 tiene que salir hoja pegada abajo y a 1366 centrada. **Si a un ancho
sale la otra forma, la pieza está mal aunque los píxeles del panel coincidan.**

Medido, y las dos dieron lo que tenían que dar: a 1366 el `align-items` calculado
es `center` y la tarjeta queda a 448x673 centrada; a 360 es `flex-end`, la
tarjeta mide 360x589 pegada al borde de abajo —**la misma caja exacta que antes
de migrar**— con 14 px de radio arriba y 0 abajo.

### El redondeo del `cajon`, CONTESTADO Y MEDIDO: no se redondea de ningún lado

Se había dejado pendiente a propósito, para no adivinar de qué lado se redondea
un cajón que ninguna pantalla usaba. La respuesta salió de mirar la pantalla de
origen, no de razonar qué queda bien.

`CarritoPedido` en modo cajón dibuja
`relative sunmi-surface h-full w-full max-w-[420px] border-l sunmi-divider p-4
shadow-[-2px_0_24px_rgba(0,0,0,0.35)] overflow-y-auto`: **ninguna clase
`rounded-*`**. Es un panel de alto completo pegado al borde derecho, con un borde
a la izquierda. Confirmado en la captura: 420x900 en x=946 a 1366 de ancho, o sea
tocando el borde.

O sea que la forma `cajon` no declara redondeo, y eso ahora es un hecho medido y
no una omisión.

**Y el archivo tiene TRES caminos, no dos.** Además de la hoja y el cajón hay un
tercero —`variant="aside"`, el default— que **no es un modal**: dibuja una
tarjeta en línea con `rounded-2xl ring-2 ring-inset`. Ese no se toca.

**No tiene `space-y-*`.** El punto fijo no corresponde, comprobado.

### El andamio para fotografiar un componente aislado

La pantalla de pedido nuevo arranca sin proveedor y sin carrito, así que para que
el modal exista habría que elegir proveedor y agregar productos. `CarritoPedido`
es un componente con props, así que se monta solo: una ruta descartable que lo
dibuja con un carrito de mentira. **No toca la base.**

Dos cosas que costaron una corrida cada una y conviene saber antes:

- **Una carpeta que empieza con `_` NO crea ruta en Next**: es una carpeta
  privada. `app/_andamio-carrito` daba 404. Va sin guion bajo.
- **La forma de los datos se saca de leer al consumidor.** Los campos son los que
  el componente lee y los props son los del objeto `resumenProps` de la pantalla
  real. Es la regla que ya se cobró una tanda con los grupos del sidebar.

**El andamio NO se commitea**: es una ruta de la aplicación y se desplegaría con
datos de mentira. Eso ya NO lo sostiene acordarse: `scripts/andamiosNoSeCommitean.test.mjs`
pone la suite en rojo si aparece trackeado cualquier `app/andamio-*`. Sirve para
todos los que vengan, y van a venir. Comprobado que atrapa la versión mala:
con el andamio del carrito stageado a la fuerza, el candado se pone rojo.

### EL BALDE NUEVO: cuántas capas traen SUPERFICIE PROPIA

**Relevado el 2026-08-13**, después de que el carrito lo destapara. Superficie
propia = el panel se pinta el fondo y el borde a mano en vez de usar `SunmiCard`.
Migrarlas con el kit les cambia fondo y bordes, y eso no es una diferencia que se
declare y se acepte.

⚠️ **LAS CIFRAS DE ESTA SECCIÓN QUEDARON VIEJAS.** La buena está más abajo, en
"EL CENSO CERRADO". Lo que sigue se conserva porque las tres pasadas que
mintieron valen más que el número: son el registro de cómo se equivocó.

De las **43 capas a mano** (tercera pasada, superada):

- **13 con superficie propia** — `compras-proveedor/nueva` (dos),
  `configuracion/mantenimiento`, `ModalProcesoPendiente`, `CarritoPedido` (el
  cajón), `CampanaNotificaciones`, `ModalArqueoCaja`, `ModalCajaMovimiento`,
  `ModalConfirmacion`, `ActualizacionPreciosPage`, `ModalAjuste`, `ModalLimites`
  y `SunmiSelectConCrearRapido`.
- **24 con `SunmiCard`** — el grupo que sí se puede seguir migrando.
- **6 sin decidir**, que hay que abrir a mano.

Las tres superficies que aparecen son `sunmi-surface`, `sunmi-pos-panel` y
`sunmi-card` —esta última es la CLASE del tema puesta en un div crudo, que no es
lo mismo que el componente—.

**Estas 13 quedan FUERA de la fase 2.** El problema no es del modal: es que el
kit tiene una opinión sobre la superficie que media aplicación no comparte. Un
prop de superficie sería el séptimo, y llegaríamos ahí por el mismo camino por el
que llegamos a seis. Vuelven cuando `SunmiCard` se toque de verdad en la fase 4,
**junto con las 117 del padding, que es la misma deuda con otra cara**.

**EL CONTEO NECESITÓ TRES PASADAS Y LAS DOS PRIMERAS MINTIERON**, que es la parte
que hay que llevarse:

1. La primera dio **17**, contando el `bg-black/50` del VELO como si fuera la
   tarjeta.
2. La segunda dio **16**, contando el fondo de la CAPA cuando se lo pinta en su
   propia línea —`fixed inset-0 bg-black/50`—.
3. La tercera da **13**, y recién ahí se abrieron tres casos para comprobar que
   la firma decía la verdad: `ModalAjuste` con `sunmi-card`, `ModalArqueoCaja`
   con `sunmi-pos-panel`, y `ModalDescuento` con `<SunmiCard`. Los tres
   coincidieron.

Tercera vez en esta fase que una firma elegida a ojo dice una cosa y abrir los
archivos dice otra.

#### Y el 13 TAMPOCO es el total: es un piso

Al abrir las 6 "sin decidir" —que era el paso que faltaba— aparecieron capas con
superficie propia que el conteo no había visto, **por dos puntos ciegos del
método**:

- **El `className` armado con template literal.** `SidebarPro` pinta su panel con
  `${theme.sidebar.bg}` adentro de un `` className={`…`} ``: es una superficie
  interpolada del tema, una cuarta forma además de `sunmi-surface`,
  `sunmi-pos-panel` y `sunmi-card`. Una expresión que busca clases literales no
  la ve. Lo mismo `SidebarMobile` y `MobileNav`.
- **Un comentario largo empuja la tarjeta fuera de la ventana.** La hoja de
  `CarritoPedido` cayó en "sin decidir" solo porque entre la capa y su tarjeta
  hay un bloque de comentario de nueve líneas, y la ventana era de dieciocho.
  Su tarjeta es `sunmi-surface`, medido al migrarla.

Confirmadas por ahora: **la hoja de `CarritoPedido`** y **`SubmenuPanel`**
—`bg-[color:var(--card-bg)] border border-[color:var(--card-border)]`—, más los
tres de navegación, que interpolan.

**Así que el balde de superficie propia es de 13 PARA ARRIBA y el número no está
cerrado.** Las 24 con `SunmiCard` sí son firmes: se clasificaron por un `<SunmiCard`
presente, que es una señal positiva y no una ausencia.

**No se elige grupo con este censo.** Elegir sobre un conteo que se acaba de
mostrar poco confiable es exactamente el error que la regla de abrir un caso de
cada grupo existe para evitar — y sería la cuarta vez en la fase. Lo que falta es
rehacerlo mirando el `className` compuesto, no solo el literal.

### EL CENSO CERRADO — quinta pasada, y las tres correcciones de método

**Relevado el 2026-08-13.** Enumerado con `git ls-files app components`, sobre
los `.jsx`, salteando los archivos que ya importan `SunmiModalLayout`. Sigue
dando **43 capas a mano**, o sea el criterio de enumeración no se movió; lo que
se movió es en qué balde cae cada una.

- **18 con superficie propia** — las 13 de antes, más la hoja de `CarritoPedido`,
  `SubmenuPanel`, `MobileNav`, `SidebarMobile` y `SidebarPro`.
- **24 con `SunmiCard`** — el grupo migrable. **No se movió ni una**, y era
  esperable: se clasificaron por un `<SunmiCard` PRESENTE. Un punto ciego hace
  perder positivos, no inventarlos.
- **1 que no es de nadie**: `SunmiModalLayout.jsx:314` es la capa que dibuja **el
  kit mismo**. Entró al conteo porque el filtro saca a los que IMPORTAN la pieza
  y la pieza no se importa a sí misma. Se descuenta: no es una migración
  pendiente.

18 + 24 + 1 = 43.

#### Las tres correcciones de método, que valen más que el 18

1. **La ventana no se agranda: se saltean los comentarios.** Agrandarla solo
   mueve el umbral hasta el próximo comentario más largo. `esComentario` ya está
   exportada del contador para esto, y usarla arregló sola a `CarritoPedido`.
2. **La superficie se busca en el `className` COMPUESTO.** Y "compuesto" resultó
   tener dos formas, no una: el template literal con `${theme.sidebar.bg}` —que
   era la que se había visto— y el **valor arbitrario con variable CSS**,
   `bg-[color:var(--card-bg)]`, que es literal y aun así no matcheaba porque la
   expresión enumeraba paletas de Tailwind (`bg-slate`, `bg-zinc`…) en vez de la
   familia entera. `theme.sidebar.bg` resultó ser `bg-[var(--sidebar-bg)]`: las
   dos formas eran la misma cosa escrita distinto.
3. **Lo que no se puede resolver leyendo va a un balde que dice "abrir".** Un
   censo que solo sabe contestar sí o no miente justo donde no sabe.

#### Y una que se había escapado, que es lo que había que buscar

**`ClientePickerFullscreen`** cayó entre las 24 porque usa `<SunmiCard` — y es
verdad—, pero **su capa es `fixed inset-0 z-[80] sunmi-surface p-2 lg:p-3`**: se
pinta una superficie sólida de pantalla completa y **no tiene velo**. No es un
modal velado, es una pantalla. Migrarla al kit le pondría un velo donde hoy hay
una superficie opaca.

Queda **fuera del grupo migrable** y anotada aparte: no es del balde de
superficie propia por su tarjeta —esa es del kit— sino por su CAPA. Es una
tercera manera de traer superficie que ninguna de las dos preguntas anteriores
hacía.

**Así que el grupo migrable es de 23, no de 24.**

#### Los cuatro tonos de velo que conviven en esas 23

Sale de mirar la capa de las 23, y hace falta saberlo antes de declarar
diferencias: `sunmi-overlay` (negro 50 %) en 11, `sunmi-pos-overlay` en 5,
`sunmi-overlay-strong` (negro 80 %) en 3, y `bg-black/50`, `/60` y `/80` escritos
a mano en 3. Una —`ModalDetalleVenta`— no pinta la capa: tiene un velo aparte con
`style` en línea, `var(--pos-overlay)`.

El velo del kit no es ninguno de esos: es
`color-mix(in srgb, var(--app-bg) 78%, transparent)`. **Cada migración que quede
cambia el tono del velo**, y eso va en la lista declarada de todas.

#### Las 23 desde el OTRO lado: ¿alguna le escribe superficie a la tarjeta?

Tener `<SunmiCard` las salva de estar en el balde equivocado, pero no de pasarle
un `className` que le sobrescriba la superficie **al kit**: `SunmiCard` pinta con
`${theme.card}` y después concatena lo que le den, dos clases de la misma familia
con la misma especificidad, y gana el orden de la hoja de estilos.

**Una de las 23 lo hace: `ModalDetalleVenta`**, con
`"p-4 border border-current/10 shadow-lg"`. Le escribe un borde y una sombra
encima de los del tema. Migrarla mueve borde y sombra igual que le pasó al
carrito, y **eso aparecería recién en la comparación** si no estuviera declarado.
Las otras 22 solo escriben ancho, padding, alto y `overflow`.

Y **la primera respuesta a esta pregunta fue "ninguna", y era mía, no del repo**:
la expresión que buscaba superficie enumeraba paletas de Tailwind y
`border-current/10` no es ninguna. Se vio imprimiendo las 24 clases y leyéndolas,
que era el paso que la expresión pretendía ahorrar. Cuarta vez en esta fase que
una firma dice una cosa y abrir los archivos dice otra.

### EL VELO EN UN TEMA CLARO: la pregunta se contestó, y el defecto estaba en el otro eje

**Medido el 2026-08-13**, sobre `SunmiModalLayout` montado en un andamio, a
1366x900, con tres temas puestos por `localStorage` —que es por donde los pone el
dispositivo de verdad— y contra el velo hecho a mano como término de comparación.

La pregunta era si en un tema claro el velo del kit sigue diciendo "lo de atrás
está bloqueado", ya que en vez de oscurecer, **aclara**. Se midieron dos
contrastes, y la trampa era confundirlos:

- **A) el texto de atrás contra su propio fondo**, los dos ya velados. Cuanto más
  bajo, más apagado quedó lo de atrás. Dice "esto no se toca".
- **B) la tarjeta contra el velo que tiene al lado.** Cuanto más alto, más se
  despega el modal. Dice "esto sí".

Velo del kit —`color-mix(in srgb, var(--app-bg) 78%, transparent)`—:

- `sunmiDark`: A 1,70:1 · **B 1,00:1**
- `sunmiLight`: A 1,41:1 · **B 1,10:1**
- `ambarCaja`: A 1,39:1 · **B 1,04:1**

Velo hecho a mano —`sunmi-overlay`, negro al 50 %, el que tienen las 23 que
faltan—:

- `sunmiDark`: A 3,41:1 · B 1,10:1
- `sunmiLight`: A 3,49:1 · **B 4,31:1**
- `ambarCaja`: A 3,43:1 · **B 4,12:1**

**La respuesta a la pregunta que se hizo es que NO hay defecto ahí**: en un tema
claro el velo del kit apaga lo de atrás MÁS que el viejo, no menos —1,41 contra
3,49—. Aclarar en vez de oscurecer no importa; lo que apaga es que baje el
contraste, y baja más.

**El defecto está en el otro eje, y es real.** Con el velo del kit **la tarjeta
deja de despegarse del fondo**: en claro cae de 4,31 a 1,10, y en oscuro da
**1,00 exacto** — el corte horizontal muestra que el relleno de la tarjeta y el
del velo son **el mismo color**, `rgb(15,23,42)`, y lo único que separa el modal
de la pantalla es **un borde de un píxel** de `rgb(30,41,59)` y una sombra de una
unidad de luminancia.

El porqué es de una línea: el velo del kit no oscurece, **desvanece hacia el
fondo de la app**. Todo lo de atrás se va hacia `--app-bg`… y en el tema oscuro
la tarjeta YA ES `--app-bg`. El velo se come justo la diferencia que hacía que el
modal fuera una figura sobre un fondo.

**Esto lo arrastran las 13 migradas y desplegadas.** No lo vio nadie porque el
borde alcanza para que la tarjeta se lea; lo que se perdió es el golpe de vista.
Y va peor en `sunmiDark`, que es el default, no en los claros.

**CONFIRMADO SOBRE LA PANTALLA REAL, no solo sobre el andamio.** Con la clave del
admin local, `ModalCategoria` abierto en `/modulos/categorias` a 1366x900 da los
mismos números que el andamio: en `sunmiDark` el relleno de la tarjeta y el del
velo son los dos `rgb(15,23,42)` —B = 1,00— y en `sunmiLight` la tarjeta es
blanca contra un velo `rgb(244,247,250)` —B = 1,08—. El andamio no había mentido.

**La decisión es de Emanuel** y no entra por una tanda técnica: cambiar el velo
del kit mueve las 13 pantallas que ya están en producción.

#### ARREGLADO, y medido en los catorce temas

Emanuel lo resolvió con el criterio escrito: *no es una decisión estética
abierta — esas trece se ven peor que antes de tocarlas, y un modal que no se
despega del fondo perdió algo que tenía. Que estuviera declarado "el velo pasa al
del tema" no lo cubre: nadie declaró que la tarjeta iba a dejar de despegarse,
porque nadie lo sabía.*

**El barrido de los catorce**, sobre `/modulos/categorias` a 1366x900 con el
modal abierto, recortando al rect de la tarjeta con 200 px de margen. `A` es el
contraste entre el percentil 5 y el 95 de la banda de velo —cuánto detalle
sobrevive atrás, más bajo es mejor—; `B` es la mediana de adentro de la tarjeta
contra la del velo —más alto es mejor—.

- `sunmiDark`: A 1,04 → 1,01 · B **1,00 → 1,13**
- `sunmiDarkCompact`: A 1,00 → 1,00 · B 1,10 → 1,13
- `sunmiGraphite`: A 1,00 → 1,00 · B 1,08 → 1,17
- `sunmiBlueClassic`: A 1,00 → 1,00 · B 1,12 → 1,37
- `operixNight`: A 1,02 → 1,00 · B 1,08 → 1,17
- `sunmiLight`: A 1,02 → 1,00 · B **1,08 → 7,15**
- `sunmiSand`: A 1,02 → 1,01 · B 1,06 → 7,03
- `sunmiFrance`: A 1,46 → 1,26 · B 1,08 → 7,22
- `sunmiFranceSplit`: A 1,46 → 1,26 · B 1,08 → 7,22
- `operixBluePro`: A 1,05 → 1,02 · B 1,05 → 7,10
- `verdeComercio`: A 1,04 → 1,02 · B 1,04 → 7,04
- `grafitoEjecutivo`: A 1,08 → 1,05 · B 1,08 → 7,22
- `ambarCaja`: A 1,04 → 1,02 · B 1,03 → 6,99
- `violetaSaas`: A 1,06 → 1,03 · B 1,04 → 7,07

**A mejora o queda igual en los catorce. B sube en los catorce.**

Y la sospecha de que `sunmiDark` no era el único quedó corta: con el velo viejo
**diez de los catorce daban B = 1,00 exacto** —tarjeta y velo del mismo color— y
los otros cuatro no pasaban de 1,12.

#### Los cinco oscuros mejoran pero quedan bajos, y hay un techo

`sunmiDark`, `sunmiDarkCompact`, `sunmiGraphite`, `sunmiBlueClassic` y
`operixNight` quedan entre 1,13 y 1,37. Suben respecto del velo viejo y respecto
de lo que esas pantallas tenían ANTES de migrarse, así que la regresión está
reparada — pero no llegan a lo de los claros, y **no hay velo que lo consiga**.

El techo es aritmético: la tarjeta de `sunmiDark` es `rgb(15,23,42)`, cuya
luminancia relativa es 0,0110. Con un velo NEGRO PURO el contraste sería
(0,0110 + 0,05) / 0,05 = **1,22**. Cualquier número por encima de eso requiere
mover la TARJETA, no el velo — o sea `theme.card`, que es media aplicación y
otra fase.

Vale decir además que **el contraste WCAG es mal juez en el extremo oscuro**: el
+0,05 de la fórmula aplasta las diferencias ahí abajo. En la captura de
`sunmiDark` la tarjeta se despega a simple vista aunque el número diga 1,13. El
número sirve para comparar antes contra después, no para decidir si algo se ve.

#### La implementación, y por qué así

    export const COLOR_VELO = "color-mix(in srgb, black 70%, var(--app-bg))";
    export const OPACIDAD_VELO = 0.92;

El color **sigue saliendo del tema** —un negro fijo en un tema claro se ve como
un apagón, y eso no cambió— pero se lo lleva al 70 % hacia el negro antes de
aplicarlo: conserva el matiz y queda más oscuro que cualquier tarjeta.

`opacity` como propiedad aparte en vez de un tercer color adentro del
`color-mix`: **anidar `color-mix` es más nuevo que usarlo suelto**, y este velo se
dibuja en la Sunmi de la caja. Con dos propiedades el piso de soporte no se
mueve.

Y las dos ramas del velo —la que cierra al tocar y la que no— comparten la
constante. Antes tenían el color escrito literal cada una.

#### Dos candados, con su control negativo

Uno impide que el velo vuelva a salir de `--app-bg` sin oscurecer, que es la
forma exacta del defecto. Otro exige que el color se escriba una sola vez.
**Ejercidos**: con la constante vuelta a la forma vieja la suite da 2 en rojo con
el mensaje que nombra el problema, y con la nueva vuelve a 27 en verde.

#### El defecto de la PRIMERA medición, que es el de siempre

El barrido inicial de los catorce dio "B = 1,00 en diez, y el velo nuevo tampoco
lo arregla". Era falso, y el error era mío: `ficha.recorte` es el recorte **con
el margen incluido** —440x316 para un elemento de 392x269 con margen 24— y yo lo
usé como si fuera el tamaño del elemento. La muestra "de adentro de la tarjeta"
barría entonces la foto entera, velo incluido, y su mediana daba el color del
velo.

Números perfectamente reproducibles **de otra cosa**. Se descubrió mirando la
captura, que mostraba el modal despegándose de un velo gris oscuro mientras la
planilla decía 1,00. **Las fotos estaban bien desde el principio**; se remidieron
esas mismas y no hizo falta volver a sacarlas.

### EL PRÓXIMO GRUPO: los siete gemelos del POS

`ModalCanjePuntos`, `ModalCliente`, `ModalDescuento`, `ModalPesoKg`,
`ModalTicket`, `ModalTicketOffline` y el modal de detalle de `HistorialDia`
(línea 240).

**Por qué estos.** La firma se comparó contra los siete rasgos que el kit dibuja
—capa, velo, panel, tarjeta, encabezado, botón y cuerpo—, no contra rasgos
elegidos a ojo, y **se abrieron los siete archivos antes de proponerlos**, no uno
de muestra. Los siete escriben la capa carácter por carácter igual:

    fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50

y la tarjeta también:

    <SunmiCard className="w-full max-w-md p-4">

La única diferencia entre los siete es el `z-[60]` de `HistorialDia`, y el `z` ya
es un parámetro del kit. Es el grupo más uniforme que queda entre las 23, por
lejos: el que le sigue son dos (`ModalImporteServicio` y `ModalPagoEfectivo`, con
`max-w-xl p-6 max-h-[90vh]`).

**Y son del POS**, o sea que si algo se corre se ve en la caja. Eso no es motivo
para saltearlos —hay que migrarlos igual— pero sí para que la comparación de
estos se mire con la atención que se miró la del carrito.

#### La lista declarada, escrita por lo que se va a ver

1. **La ventana se va a DESPEGAR MÁS del fondo, no solo cambiar de tono.**
   Reescrito después de arreglar el velo, porque la diferencia dejó de ser
   neutral. Hoy estos seis usan `sunmi-overlay`, negro al 50 %. El velo del kit
   lleva el fondo del tema al 70 % hacia el negro, y medido eso da **más**
   separación entre la tarjeta y el velo, no menos: en los temas claros pasa de
   ~4,3 a ~7,1, y en los oscuros de ~1,10 a ~1,13. Lo de atrás además queda más
   apagado. **Es el único punto de esta lista que mejora en vez de solo
   cambiar**, y conviene mirarlo con esa expectativa: si en la comparación la
   ventana NO se despega más, algo salió mal.
2. **El modal se ensancha 7 px.** El padding de la capa pasa de `p-4` a `p-3`,
   14 → 10,5 px, 3,5 de cada lado. En un monitor no se nota; en la pantalla
   angosta de la caja, sí.
3. **El título se ve más chico, menos grueso y más separado.** Hoy es
   `text-lg font-bold` —15,75 px, peso 700—; con `SunmiCardHeader` queda en
   15 px, peso 600 y `tracking-wide`. Y se corre 3,5 px a la derecha por el
   `px-1` del encabezado.
4. **Aparece un SEGUNDO botón de cerrar, arriba a la derecha.** Los siete ya
   tienen el suyo abajo: "Cancelar" en `ModalCanjePuntos`, `ModalCliente`,
   `ModalDescuento` y `ModalPesoKg`; "Cerrar" en `ModalTicket`,
   `ModalTicketOffline` y `HistorialDia`. El del kit se suma, no reemplaza a
   ninguno. **Los cuatro "Cancelar" son la mitad de un par Cancelar/Confirmar**,
   así que sacarlos no es lo mismo que sacar un "Cerrar" suelto — pendiente de
   decisión, no de trabajo.
5. **Aparece un tope de alto con scroll donde hoy no hay.** El cuerpo del kit
   trae `max-h-[65vh] overflow-y-auto`. El que lo va a notar es
   `ModalTicketOffline`, que hoy scrollea adentro con su propio `max-h-96` y
   pasaría a tener dos topes.
6. **El ancho máximo hay que declararlo**: `maxWidth="max-w-md"`. Sin eso los
   siete pasan de 392 a 504 px.
7. **El padding de la tarjeta NO cambia, y ese es el punto.** Los siete declaran
   `p-4` y dibujan 21 px, porque nunca se aplicó. Con el kit siguen dibujando 21.
   Cero.
8. **La separación del cuerpo está SIN MEDIR.** Hoy es un `space-y-3` con el
   `mb-3` del `h3` adelante; el kit usa `mt-2 gap-3`. Van cuatro ceros seguidos
   en este punto y **eso no autoriza el quinto**: se mide antes de tocar, con el
   arnés, como se hizo con categorías.

**El punto 1 cambió con el arreglo del velo, y para bien.** Ya no es "de negro al
50 % al fondo de la app al 78 %": ahora el velo del kit lleva el fondo del tema
al 70 % hacia el negro. Medido contra lo que estos siete tienen hoy, **la tarjeta
se va a despegar MÁS que ahora**: en los temas claros el contraste pasa de ~4,3 a
~7,1, y en los oscuros de ~1,10 a ~1,13. Es la única diferencia declarada que
mejora en lugar de solo cambiar.

#### AL IR A SACAR LAS CAPTURAS, EL GRUPO SE CAYÓ A SEIS Y SE TRABÓ

**`ModalCliente` de `pos-ventas` NO LO RENDERIZA NADIE.** Cero importadores en
todo el repo, buscado con `git grep` sobre `app`, `components`, `lib` y `hooks`,
y también por importación dinámica. La página de clientes tiene su PROPIO
`ModalCliente` definido adentro del archivo —otra función, con otros props— y es
esa la que se usa.

Migrar un componente que ninguna pantalla dibuja **no se puede verificar**: la
prueba de la fase es que la pantalla de donde salió quede idéntica, y acá no hay
pantalla. Sale del grupo. Qué hacer con él —borrarlo o dejarlo— es una decisión
aparte y no de esta fase.

Y arrastra un segundo hallazgo: **`lib/ventas-internas/avisoVentaInterna.test.mjs`
lo trata como "consumidor existente"** y le afirma cosas —que consume
`clientes/buscar`, que no renderiza el aviso—. Son candados sobre un archivo que
no corre en ninguna pantalla. Es la misma familia que "un candado puede estar
mirando el lugar equivocado", con otra cara: acá mira un lugar que no ocurre.

**Las fechas afilan el hallazgo.** El POS reemplazó ese modal por
`ClientePickerFullscreen` el **2026-02-15** (`e854077`), dos días después de
estrenarlo. El candado se escribió el **2026-07-30**. O sea que no es un candado
que se quedó viejo: **nació apuntando a un archivo muerto** y pasó en verde cinco
meses y medio afirmando sobre algo que ninguna pantalla dibuja.

**Apuntarlo al `ModalCliente` que sí corre no era la respuesta**, y comprobarlo
fue el paso que valió: el que corre está definido adentro de
`app/modulos/clientes/page.jsx`, es un formulario de alta y edición —no un
buscador—, **no consume `clientes/buscar`** y no renderiza el aviso. Apuntarle el
candado lo habría hecho afirmar algo falso. El que reemplazó al muerto de verdad
es `ClientePickerFullscreen`, y ya estaba en la lista.

**Lo que se arregló es la pregunta, no la lista.** El candado ahora hace dos
cosas: enumera los consumidores DESDE EL REPO y exige que cada uno sea
alcanzable. Derivar la lista solo no alcanzaba —el muerto también contiene la
cadena, así que un `grep` lo volvía a incluir—; lo que lo destapa es la
alcanzabilidad.

Y en el camino se comió su propio anzuelo, que es la parte que hay que recordar:
**la primera versión pasó en verde porque el comentario que explica el caso
NOMBRA la ruta del archivo muerto.** Un candado que busca texto encuentra el
texto de su propio comentario. Se arregló como corresponde —un test no renderiza
nada y un comentario tampoco, las dos exclusiones escritas y `esComentario`
importada del contador— y no reescribiendo el comentario para esquivarlo, que ya
está anotado como hábito a evitar.

**El muerto se borró** con los tres chequeos de `GrillaConciliacion` (`ee09abe`):
como identificador, como cadena suelta —con `MSYS_NO_PATHCONV=1`, que es la
trampa que casi arruina ese conteo— y el build después. Cero referencias de
runtime por las tres vías, y ningún módulo huérfano: los tres que importaba
—`SunmiCard`, `SunmiButton`, `SunmiInput`— tienen 116, 151 y 93 consumidores más.

**Los otros seis están detrás de un POS bloqueado.** `/modulos/pos-ventas` no
dibuja el punto de venta: dibuja **"Caja vencida — Tenés una caja abierta de un
día anterior. Cerrala antes de seguir vendiendo."** Y no es de una ubicación:
`depo` tiene una caja abierta del 30/07/2026 y `mini el 7` una del 04/08/2026.
Comprobado en las dos, con `--ubicacion`.

Destrabarlo es **cerrar una caja**, que es una acción de negocio real sobre datos
de Emanuel y cambia el estado del que dependen otras capturas. No se hizo.

**Y la base que sirve el 3111 NO es `erpazul_al`, es `erpazul_dev`.** Apareció al
ir a sacar la copia de seguridad: el `DATABASE_URL` del `.env` apunta a
`erpazul_dev`. El skill `/capturas` dice "base `erpazul_al`", así que una de las
dos cosas está desactualizada y conviene saber cuál antes de comparar contra la
línea de base de huellas —los conteos de filas de `tests/huellas/baseline` se
tomaron sobre otra base—.

Las comparaciones de esta fase NO se caen por esto: el antes y el después se
sacaron los dos contra la misma base, que es la condición que hace que la resta
valga. Lo que no sirve es cruzarlas contra el baseline viejo.

Las salidas posibles, que las decide Emanuel:

1. **Cerrar una caja desde la interfaz** —acción real de la aplicación, permitida
   por la regla— y sacar las capturas del POS de verdad. Es lo único que prueba
   que la pantalla queda idéntica.
2. **Montar los seis en un andamio**, como se hizo con `CarritoPedido`. Compara
   el componente contra sí mismo, pero **no prueba la pantalla**, que es
   justamente el control que vale.
3. **Cambiar de grupo** y dejar los del POS para cuando haya una caja abierta del
   día.

### LA MIGRACIÓN DEL CARRITO SE ESCRIBIÓ, SE MIDIÓ Y SE REVIRTIÓ

**2026-08-13.** Se escribió entera —los dos caminos, con `encabezado="ninguno"`—
y la comparación la rechazó. Se revirtió: no se commitea una migración que mueve
el carrito. Las capturas de antes quedan sacadas y el diagnóstico también, así
que la próxima arranca sabiendo qué arreglar.

**A 360 la hoja pasó de 574 a 416 px de alto**, y en la captura se ve el efecto:
la lista queda cortada a la mitad del segundo producto y el tercero no entra.

La causa está encontrada y es exacta: la forma `hoja` aplica el `alto` **a la
tarjeta**, y no se le pasó ninguno, así que tomó el default del kit —`max-h-[65vh]`—.
**640 × 0,65 = 416.** El carrito no tiene tope en su tarjeta: crece con el
contenido, y quien acota es la lista, con su `max-h-[46dvh]`.

O sea que el default del `alto`, que es correcto para un modal centrado, es
**equivocado para una hoja**. Está anotado como lo que hay que decidir antes de
retomar: o la hoja no tiene default y lo exige, o el default de la hoja es
"ninguno" y quien quiera topar lo dice.

**A 1366 el cajón conserva la caja exacta —420x900 en x=946— y aun así difieren
50.053 píxeles de 399.600, el 12,53 %**, repartidos por toda la superficie. Las
filas más movidas son la 0 y la 899 enteras, o sea los bordes: la tarjeta pasa de
`sunmi-surface` con `border-l sunmi-divider` a lo que dibuja `SunmiCard`
—`bg-slate-900` con `border border-slate-800`—. Fondo y borde distintos, y un
borde de más en tres lados.

Eso NO estaba en la lista declarada, y es la diferencia que importa: **la tarjeta
del kit y la tarjeta del carrito no están hechas del mismo material.** Hasta acá
las pantallas migradas usaban `SunmiCard`, así que el punto nunca apareció.

### LO QUE FRENA LA MIGRACIÓN DE `CarritoPedido`: el encabezado del kit no se puede apagar

Leído antes de escribir una línea, y por eso se frena acá y no después.

El `cuerpo` de `CarritoPedido` **trae su propio encabezado**: título "Resumen del
pedido", el nombre del proveedor, el contador de avisos de costo, el conteo de
productos y una X para cerrar. Y ese cuerpo lo comparten **los tres caminos**,
incluido el `aside`, que no se migra.

`SunmiModalLayout` dibuja su fila de encabezado **siempre**: no hay forma de
pedirle que no la ponga. Así que la migración deja dos salidas y las dos se ven:

- pasarle `title` y sacar el encabezado propio del cuerpo → hay que duplicarlo
  para que el `aside` lo conserve, o el `aside` lo pierde. Es tocar el contenido
  de un camino que esta tanda no migra.
- no pasarle `title` → la fila se dibuja igual, con un `<h2>` vacío y su `mb-3`.
  Queda un hueco arriba de todo.

**Esto está LEÍDO, no medido**: sale de la estructura del JSX, no de una captura.
Medirlo pide escribir la migración, que es lo que se frenó.

Lo que hace falta antes de retomar: que la pieza sepa **no dibujar encabezado**.
Sería el primer caso de una pantalla que no quiere el encabezado del kit, así que
sale de una necesidad real y no de adivinar — pero es una decisión de Emanuel,
porque agrega superficie a la pieza justo cuando se está tratando de cerrarla.

### El `!` es el defecto de la fase 4 apareciendo adentro del kit mismo

Todo lo que la pieza le pasa a la tarjeta tiene que llevar `!`, y hay un candado
que lo exige. El motivo es que `SunmiCard` **concatena su `className` en vez de
negociarlo** — que es exactamente la deuda anotada para la fase 4, encontrada
esta vez de adentro para afuera.

Vale anotarlo con esas palabras porque cuando le toque a `SunmiCard` el trabajo
va a estar medio hecho: ya están identificadas las familias que pelean —padding,
redondeo, sombra y `display`— y ya está medido cuántos consumidores dependen de
cada una.

Y una trampa que costó una corrida: **`!p-0` es una clase que se llama `!p-0`**.
El `!` es parte del nombre, así que un selector CSS `.p-0` no la encuentra y
`.\!p-0` sí. Al buscar la tarjeta por `.shadow-2xl` el arnés no encontró nada,
y el candado del selector lo dijo en vez de recortar cualquier cosa.

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

### LOS SEIS SUBTÍTULOS DE MODAL, QUE SIGUEN APAGADOS A PROPÓSITO

**Actualizado el 2026-08-14** — esta sección decía que `SunmiCardHeader` no
aceptaba `subtitle`, y desde `42e7e27` sí lo acepta y lo dibuja. Lo que quedó
apagado es otra cosa y por otro motivo.

Los diez subtítulos **de pantalla** ya se resolvieron: seis se encienden y cuatro
se borraron por repetir su propio título. Los seis **de modal** no entraron en esa
tanda, y `SunmiModalLayout` **no reenvía** el prop justamente para que no se
prendieran solos.

| pantalla | valor | por qué sigue apagado |
| --- | --- | --- |
| `locales/ModalLocal` | "Configurá los datos del local" | **repite el título**: por el criterio de arqueo-caja habría que borrarlo, no mostrarlo |
| `usuarios/ModalUsuario` | "Configurá los datos del usuario" | ídem: repite el título |
| `proveedores/listas/ModalRevertir` | "Los productos vuelven al costo que tenían antes de aplicar esta lista." | dice algo que el título no dice: candidato a encenderse |
| `proveedores/listas/ModalTerminar` | "Se cierra el trabajo sobre esta lista. No se toca ningún costo." | ídem |
| `comprobantes/PanelComprobantes` | `identidad(borrando)` | ídem, y es **calculado**: hay que mirarlo con datos reales |
| `comprobantes/PanelComprobantes` | "Contestá ahora, con el papel en la mano" | ídem |

El candado `lib/sunmi/propsDelKit.test.mjs` los tiene contados, y la excepción
—`SunmiModalLayout.subtitle` declarado y no reenviado— está anotada ahí en
`DECLARADOS_SIN_USAR`, con un segundo test que se pone rojo si algún día se
reenvía y nadie saca la excepción.

#### Y LO QUE HAY QUE SABER ANTES DE ENCENDER ESOS SEIS: LOS BOTONES BAJAN LA MITAD

**Medido el 2026-08-13**, sobre `BitacoraAuditoria`, que fue el único
`SunmiCardHeader` con subtítulo de la tanda. Es una propiedad de la pieza, no de
esa pantalla, y hoy **no tiene ningún consumidor que la sufra** — por eso se
anota acá y no en el cuerpo de un commit, donde nadie la va a encontrar el día
que pase.

`SunmiCardHeader` dibuja su encabezado como `flex items-center justify-between`:
a la izquierda el título, a la derecha el hueco de los `children`, que son los
botones. Con subtítulo, el título pasa a ser una columna de dos renglones y **la
fila entera crece** — en la bitácora, de 22,5 a 40,75 px.

El hueco de los botones no crece: lo **recentra** el `items-center`. Medido, se
corre **9,13 px, la mitad de los 18,25** que se corre todo lo de abajo. En
`BitacoraAuditoria` es invisible porque ese hueco mide 0x0 —no le pasa botones—,
pero **la primera pantalla que pase subtítulo Y botones a la vez va a ver los
botones bajar la mitad del alto agregado**, y eso no va a estar en ninguna lista
de diferencias declarada si no se lee esto antes.

Cuatro de los seis de arriba son de modal, así que sus botones los pone
`SunmiModalLayout` y no van en esa fila; el caso llega el día que una pantalla
—no un modal— use `SunmiCardHeader` con subtítulo y botones juntos.

**Lo que hay que decidir ese día, y no ahora:** si la fila alinea arriba
—`items-start`— en vez de centrar cuando hay subtítulo, que dejaría los botones
quietos, o si el corrimiento se acepta y se declara. Cambiar el `items-center`
mueve **todos** los encabezados de tarjeta del sistema, así que no es un
detalle de esa tanda.

**Y un segundo efecto del mismo cambio, también medido y también invisible hoy:**
el `<h2>` del título pasa de ser un item de flex dimensionado por su contenido a
un bloque dentro de la columna, así que **se estira al ancho entero** — en la
bitácora, de 157,72 a 442,67 px. No mueve un píxel porque el texto va alineado a
la izquierda y no lleva fondo. El día que un título se centre o tenga fondo, sí.

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

**Y lo que le falta a QUIEN LO USA, que es del mismo viaje.** El botón que abre
el preview en `configuracion/listas-precios` es un `SunmiButtonIcon` con el ícono
de ojo y **sin `aria-label`**: no tiene ningún nombre accesible, así que un
lector de pantalla no puede decir qué hace. La pieza ya acepta el prop desde
`95ac86e`; lo que falta es que las pantallas lo pasen. Va en la misma vuelta que
los colores: son los dos el mismo componente y la misma comparación.

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

**LOS CINCO TEMAS OSCUROS LLEGAN A LA FASE 4 CON SU NÚMERO MEDIDO.** El velo se
arregló y la tarjeta volvió a despegarse en los catorce temas, pero en los
oscuros el margen quedó chico y **el techo es aritmético, no de esfuerzo**: con
un velo negro puro `sunmiDark` daría 1,22, así que subirlo pide mover
`theme.card`. Eso es la misma deuda de la superficie —las 18 capas con superficie
propia y las 117 del padding— y por eso llega acá y no se resolvió en la fase 2.

Los cinco, tarjeta contra velo, con el velo nuevo:

- `sunmiBlueClassic`: 1,37 — tarjeta `rgb(16,42,77)`
- `sunmiGraphite`: 1,17 — tarjeta `rgb(22,27,34)`
- `operixNight`: 1,17 — tarjeta `rgb(15,27,45)`
- `sunmiDark`: 1,13 — tarjeta `rgb(15,23,42)`
- `sunmiDarkCompact`: 1,13 — tarjeta `rgb(14,22,40)`

Los nueve claros, para comparar, están entre 6,99 y 7,22.

**La palanca es la luminancia de la tarjeta.** `sunmiBlueClassic` es el más
claro de los cinco y también el que mejor da: no es casualidad, es la misma
variable. Aclarar `theme.card` en los oscuros sube este número sin tocar el velo.
La decisión llega con estos datos y no hay que volver a medir.

**Cinco `className` a `SunmiTable`.** El componente los ignora **a propósito** y
está escrito en su encabezado: implementarlo cambiaría el aspecto de esas
pantallas solo por existir. Pero cinco pantallas escribieron algo creyendo que
hacía efecto, así que la decisión no es "está documentado y listo": o el
componente los acepta y esas cinco cambian a propósito, o se sacan de las cinco.

## Deuda anotada de esta fase

- **EL CONTADOR DECIDE "ya usa la pieza" CON UN MATCH DE TEXTO, comentarios
  incluidos.** `lib/hardcodeo/contador.js` hace
  `importaModalDelKit = /SunmiModalLayout/.test(contenido)` sobre el archivo
  entero. Nombrar el componente en un comentario hace que sus capas
  **desaparezcan de la cuenta**: pasó el 2026-08-13 al marcar las tarjetas de
  `CarritoPedido`, y el trinquete bajó de 42 a 40 sin que se migrara nada.

  Es la misma familia que el comentario adentro del `className` de `SunmiCard`:
  **un comentario cambiando comportamiento.** Hoy está tapado reescribiendo el
  comentario, que es un hábito y no un candado. El arreglo es mirar un `import`
  de verdad en vez de un match de texto, y necesita su propio candado porque
  puede cambiar la cifra. Comprobado que hoy **ningún otro archivo** lo nombra
  sin importarlo, así que la cuenta actual es correcta.

- **`ModalProcesoPendiente` queda SIN MIGRAR y SIN VERIFICAR**, junto al de
  `PanelComprobantes`. Solo se dibuja cuando hay un proceso de caja pendiente, y
  en `erpazul_al` no hay ninguno: no se puede abrir ni medir. **No se fabricó la
  fila y no se ejerció un retiro real**, porque dejar estado en la base que otras
  capturas usan cuesta más que migrar a ciegas una pantalla, justo en la tanda
  que existe para verificar una forma. Se retoma la próxima vez que haya un
  proceso de verdad. Es de los ocho con `space-y-*` y su número sigue sin medir.

- **117 tarjetas declararon un padding que nunca se aplicó**, y por eso hoy el
  sistema es uniforme en 21 px **por accidente**. Todas dibujan 21 px porque el
  `p-6` que venía del comentario le gana a lo que escribieron.

  **RECONTADO EL 2026-08-13 CON EL MÉTODO NUEVO, y el número se movió.** Es el
  que va a sostener la decisión al cierre de la fase, así que convenía que no se
  cayera entonces. Enumerado con `git ls-files app components lib hooks` y con
  `etiquetasDeApertura` del contador —que ya sabe dónde termina una apertura
  JSX—: **234 usos de `SunmiCard`, 150 con `className`, 117 declaran padding, 31
  no declaran ninguno**, y 2 no son tarjetas de consumidor (la del kit y
  `SunmiEntityCard`, que reenvía el `className` de quien la use y **no la usa
  nadie**: cero usos). Los 84 restantes no pasan `className`.

  Qué declararon las 117: **`p-3` cincuenta y seis** (55 más un `!p-3`), `p-4`
  treinta y tres, `p-6` nueve, `p-0` ocho, `p-5` seis y `p-2` cinco.

  Antes decía 233 / 130 / 104 / 26, y "treinta escribieron `p-3`". **Los cuatro
  números daban de menos, y las tres causas son de la misma familia** — todas
  hacen que algo escrito no se vea:

  1. El límite de la expresión del padding era `(^|\s)`, y la clase viene con su
     comilla pegada adelante: `"p-4 …"` **nunca matcheaba**. Un `p-N` al empezar
     la cadena no se contaba jamás.
  2. El valor del `className` se recortaba hasta el primer `}`, que en
     `` {`${CARD_BASE} p-5 …`} `` es el `}` de `${CARD_BASE}` — y se llevaba el
     `p-5`. Es el mismo defecto del `>` que `etiquetasDeApertura` ya resuelve, un
     nivel más adentro.
  3. **El agujero no era el template literal, era la INDIRECCIÓN.**
     `className={cardClass}` no tiene un solo `$` y declara `p-4`: se resolvió
     abriendo el archivo. Buscar `${` habría dejado esas cuatro afuera igual.

  El repo tenía además **dos cifras distintas para lo mismo**: este registro
  decía 233/130/104 y el comentario de `SunmiModalLayout` decía 246/151/109.
  Quedaron las dos apuntando al mismo número.

  **Esto NO entra por la puerta de atrás de una tanda técnica.** Se pensó hacer
  negociable el `className` de la tarjeta —como ya lo hace el panel— y se
  descartó al contarlo: las 117 pasarían a recibir el padding que declararon
  —cincuenta y seis escribieron `p-3`, o sea 10,5 px— y eso es cambiar el aspecto
  de media aplicación por una pantalla. **Lo decide Emanuel al cierre de la
  fase**, junto con los seis parámetros.

  Y si algún día se unifica, **las 31 que traen `className` sin padding son las
  que hay que mirar una por una**: son las que no declararon nada y por lo tanto
  no dicen qué querían.

- **El segundo "Cerrar" de `ModalPreviewPrecio` está SIN VERIFICAR**, con esas
  palabras. Al migrarlo quedaban dos botones con el mismo texto y se sacó el de
  abajo; había un tercero igual en la rama de "activá un local desde Inicio" y
  se sacó también, **por simetría**. Esa rama **no se fotografió**: necesita un
  navegador sin contexto activo. El razonamiento es bueno y no es lo mismo que
  haberlo visto. Dentro de tres meses la diferencia no se va a poder
  reconstruir, y por eso queda escrita acá.

- **Dos puntos que FALTARON en la declaración previa de `ModalPreviewPrecio`.**
  Están contados en el commit, pero después del hecho: al sacar ese botón se fue
  también **la línea separadora que tenía encima** —sin el botón quedaba
  colgando— y la tarjeta **bajó de 263 a 198 px** de alto a 1366. Los dos eran
  previsibles mirando el JSX antes de tocarlo: el separador está tres líneas
  arriba del botón. **La lista se escribe antes justamente para que esto no
  pase**, y contarlo después no es lo mismo que haberlo declarado.

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

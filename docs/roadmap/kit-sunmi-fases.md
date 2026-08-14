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

## CÓMO SE ELIGE UN GRUPO — corregido el 2026-08-14, y es una corrección del método

**EL CRITERIO ANTERIOR ESTABA MAL, y no por poco.** Decía: un grupo es un
conjunto de capas cuya CAPA y cuya TARJETA coinciden carácter por carácter. Con
ese criterio se eligieron los siete gemelos del POS, y el grupo se cayó dos veces
—primero a seis, cuando uno resultó ser código muerto, y después a cero, cuando
la pantalla no se pudo abrir—. No se cayó por un error de medición: la firma
decía la verdad. Se cayó porque **la firma contestaba la pregunta equivocada.**

Que dos capas se escriban igual es **una señal sobre el código**. Y en esta fase
el trabajo de escribir la migración es la parte barata: lo caro es **verificar**
—abrir la pantalla, sacar el antes, migrar, sacar el después y restar—. Un
criterio que solo mira el código optimiza justo lo que no cuesta.

**De ahora en más un grupo se elige por DOS cosas juntas, y las dos son
obligatorias:**

1. **Que la capa y la tarjeta coincidan** carácter por carácter. Sin esto, las
   diferencias declaradas no son las mismas para todos los del grupo y la lista
   deja de servir para comparar.
2. **Que la pantalla se pueda abrir SIN FABRICAR CONDICIONES.** O sea: con la
   sesión y el local que ya existen, navegando y tocando, sin escribir en la base
   ni ejercer una acción de negocio que deje estado del que dependan otras
   capturas.

**NO ALCANZA CON LA PRIMERA.** Ese es el punto entero de esta sección, y es el
error que ya se cometió: un grupo perfectamente uniforme cuya pantalla no se
puede abrir **no es un grupo**, es una lista de archivos. La prueba de la fase es
que la pantalla de donde salió la pieza quede idéntica; sin pantalla no hay
prueba, y sin prueba la migración no se puede commitear. Migrarlo igual sería
exactamente lo que la regla de oro prohíbe en la primera línea.

En la práctica, el orden importa: **primero se pregunta si se abre, después se
mide la firma.** Al revés se paga el relevamiento entero de un grupo que después
hay que archivar — que es lo que pasó con el POS.

Y "abrir sin fabricar condiciones" se comprueba **ejecutando**, no leyendo el
JSX. Un modal que el código dice que se dibuja con `{estado && …}` no dice nada
sobre si ese estado es alcanzable hoy, con estos datos, en esta base.

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

⚠️ **ACTUALIZADO EL 2026-08-14: HOY SON 41, y las dos bajas están explicadas.**
El trinquete imprime 41 contra una línea de base de 42. Reconciliado enumerando
con el contador mismo —`contarArchivo` sobre los `.jsx` de `git ls-files app
components`, filtrando `categoria === "modal"`—, que da **exactamente 41** y por
lo tanto la lista y la cifra oficial son la misma cosa. De 43 a 41:

- **−1 la pieza del kit.** `SunmiModalLayout.jsx:314` entraba a la cuenta porque
  el filtro sacaba a los que IMPORTAN la pieza y la pieza no se importa a sí
  misma. El contador ahora la saca por su ruta (`esLaPiezaDeModal`). Ya estaba
  descontada a mano en el censo de abajo; ahora la descuenta el contador.
- **−1 `ModalCliente` de `pos-ventas`**, que era código muerto y se borró.

El reparto de las 41: **18 con superficie propia** —las mismas 18 del censo
cerrado— y **23 con `SunmiCard`**. Menos `ClientePickerFullscreen`, que queda
afuera por su CAPA, **el grupo migrable es de 22**.

**43 capas de modal armadas a mano**, en 37 archivos —cifra del 2026-08-13, ver
la corrección de arriba—. Enumerado con `git ls-files`
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
- **`altoVa`** — DÓNDE cae ese alto: en la tarjeta o en el cuerpo. **Escrito el
  2026-08-14**, con el default intacto: sin declararlo lo sigue derivando la
  forma. Es una EXCEPCIÓN DECLARABLE y no la regla cayéndose — ver la sección
  "EL SÉPTIMO PARÁMETRO" más abajo. **Todavía no lo declara ninguna pantalla**:
  nació para las dos de `clientes`, cuya migración se frenó por otro motivo.
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

### POS-VENTAS SALE DE LA FASE 2 — decidido el 2026-08-14, con el relevamiento ya hecho

**Aprobado por Emanuel.** `pos-ventas` entero —no solo los seis gemelos— queda
**para después de la fase 4**. El motivo no es que la migración sea difícil: es
que la pantalla no se puede abrir sin cerrar una caja, y cerrarla es una acción
de negocio real sobre los datos de Emanuel que además cambia el estado del que
dependen otras capturas.

Las cuatro que estaban abiertas quedan contestadas, todas por la negativa: **no**
se abre la caja de `depo`, **no** se cobran ventas contra la base de desarrollo
para destrabar los modales que necesitan una venta, **no** se parte la tanda en
cuatro, y **sí** se corrige el roadmap — que es esta sección.

**Este relevamiento NO se tira: se archiva.** Todo lo que sigue —la firma de los
siete, la lista declarada de ocho puntos, los tres desajustes de abajo y las
condiciones de negocio— queda escrito para el día que le toque. Rehacerlo costaría
otra vez lo mismo, y lo medido no se vence salvo que el código cambie.

**Y queda una consecuencia que hay que saber antes de retomar:** el grupo se
eligió con el criterio viejo, el que solo miraba el código. Cuando se retome hay
que pasarle el criterio nuevo —ver "CÓMO SE ELIGE UN GRUPO" arriba— y la primera
pregunta ya no es la firma sino si la pantalla abre.

#### LOS TRES DESAJUSTES ENTRE EL PLAN Y LOS NÚMEROS REALES

Medidos el 2026-08-14 abriendo los seis archivos, no deduciéndolos del texto del
plan. Los tres estaban mal en la lista declarada de más abajo, y los tres se
habrían visto recién en la comparación.

**1. El reparto de "Cancelar" y "Cerrar" no es cuatro y tres: es TRES Y DOS, más
un botón que no es ninguno de los dos.** El punto 4 de la lista declarada decía
"'Cancelar' en `ModalCanjePuntos`, `ModalCliente`, `ModalDescuento` y
`ModalPesoKg`; 'Cerrar' en `ModalTicket`, `ModalTicketOffline` y `HistorialDia`".
Lo real:

- **"Cancelar" son tres**: `ModalCanjePuntos`, `ModalDescuento` y `ModalPesoKg`.
  El cuarto era `ModalCliente`, que estaba muerto y se borró.
- **"Cerrar" son dos**: `ModalTicketOffline` —que además lo escribe en
  mayúsculas, "CERRAR"— y el detalle de `HistorialDia`.
- **`ModalTicket` no dice "Cerrar": dice "No imprimir".** Y no es la mitad de un
  par: su pie es una PILA de tres botones de ancho completo —"Imprimir ticket
  (termica)", "Descargar PDF" y "No imprimir"—, no una fila de dos.
- **Y donde el plan decía "par" hay un TRÍO.** `ModalCanjePuntos` y
  `ModalDescuento` dibujan un tercer botón "Quitar" entre el Cancelar y el
  confirmar, condicionado a que ya haya un canje o un descuento aplicado
  (`canjeActual > 0` y `descuentoActual`). O sea que su pie es
  Cancelar/Quitar/Canjear y Cancelar/Quitar/Aplicar cuando esa condición se
  cumple, y Cancelar/Canjear y Cancelar/Aplicar cuando no.

Por qué importa y no es un detalle de redacción: la decisión pendiente era "¿se
saca el botón de abajo cuando aparezca el del kit?". Sacar la mitad de un par no
es lo mismo que sacar uno de tres, y no es lo mismo que sacar el "No imprimir" de
una pila donde los otros dos son acciones de verdad.

**2. `ModalPesoKg` y el detalle de `HistorialDia` NO TIENEN CUERPO.** El punto 8
decía "hoy es un `space-y-3` con el `mb-3` del `h3` adelante". Eso es cierto para
cuatro de los seis. En estos dos **no hay ningún div de cuerpo**: los hijos
cuelgan directo de la tarjeta y cada uno se separa con su propio margen de abajo.

- `ModalPesoKg`: `mb-1` en el `h3` del nombre, `mb-4` en la línea del precio por
  kg y `mb-4` en la grilla del selector de modo.
- El detalle de `HistorialDia`: `mb-3` en el encabezado, `mb-3` en la fila de
  cajero y turno, y `mb-3` en la lista de ítems.

O sea que los márgenes que hay que medir son **1, 3 y 4**, y no un `space-y-3`
uniforme. Y el cambio al migrar no es "de `space-y-3` a `gap-3`": es que aparece
un contenedor donde hoy no hay ninguno. La medición del punto 8 tiene que
hacerse en estos dos por separado, porque la pregunta no es la misma.

**3. El detalle de `HistorialDia` está ANIDADO adentro de otro modal, y ya trae
su propio scroll.** El archivo tiene dos capas: la de la línea 120, que es el
historial —`fixed inset-0 sunmi-overlay-strong … z-50 overflow-y-auto`— y la de
la 240, que es el detalle —`z-[60]`—, dibujada **adentro** del mismo return. Y la
lista de ítems del detalle declara `max-h-48 overflow-y-auto`.

El punto 5 de la lista declarada avisaba que el cuerpo del kit agrega
`max-h-[65vh] overflow-y-auto` y nombraba a `ModalTicketOffline` como el que lo
iba a notar. **El detalle de `HistorialDia` lo nota más**, y por otro motivo: no
pasaría a tener dos topes sino **tres contenedores de scroll anidados** —el
`overflow-y-auto` del modal de afuera, el `max-h-[65vh]` que agregaría el kit y
su propio `max-h-48`—. Eso no estaba en ninguna lista.

#### LAS CONDICIONES DE NEGOCIO: qué hace falta para que cada uno se dibuje

Leídas de las guardas de render en `app/modulos/pos-ventas/page.jsx`. Esto es lo
que hay que tener el día que se retome, y es la parte que el criterio viejo no
preguntaba:

- **`ModalDescuento`** (línea 1930) — `state.modalDescuento`. Es el único de los
  seis que depende solo de un botón, aunque necesita un carrito con subtotal para
  que muestre algo.
- **`ModalCanjePuntos`** (1941) — `state.modalCanjePuntos && state.clienteSeleccionado`.
  **Hace falta un cliente elegido**, y con saldo de puntos para que el "Quitar"
  aparezca.
- **`ModalTicket`** (1981) — `state.modalTicket`, que se llena **al registrar una
  venta**. No hay forma de abrirlo sin cobrar.
- **`ModalTicketOffline`** (1990) — `ultimoTicketOffline`: hace falta una venta
  hecha **con la aplicación sin conexión**.
- **`HistorialDia`** (2011) — `mostrarHistorial`; y su detalle necesita además que
  haya **al menos una venta del día** para poder tocarla.
- **`ModalPesoKg`** (2031) — `productoKgPendiente`: hace falta agregar al carrito
  **un producto que se venda por peso**.

**Cuántos "no se dibujan solos" depende de dónde se corte, y el corte es parte de
la afirmación.** Si la línea es "necesita algo más que abrir el POS y tocar un
botón", son **cinco** y no cuatro: los únicos que quedan afuera son
`ModalDescuento`. Si la línea es "necesita ESCRIBIR en la base", son **tres**:
`ModalTicket`, `ModalTicketOffline` y el detalle de `HistorialDia`. La cifra de
cuatro que circulaba no corresponde a ninguno de los dos cortes, así que no se
usa: se usan estos dos, con su criterio escrito al lado.

#### LA FIRMA QUE SE ARCHIVA: los siete gemelos, como estaban

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

### EL GRUPO NUEVO: el par de `clientes` — "Historial de Ventas" y "Cuenta Corriente"

**Elegido el 2026-08-14, con el criterio nuevo y en su orden**: primero se
preguntó cuáles abren, después se midió la firma.

`app/modulos/clientes/page.jsx:1493` y `app/modulos/clientes/page.jsx:1705`.

#### De dónde sale el universo, y por qué son solo estas dos

Reconciliado contra el trinquete, que es la cifra oficial: **41 capas**. De ahí,
18 con superficie propia quedan fuera de la fase 2, y **23 tienen `SunmiCard`**.
Menos `ClientePickerFullscreen`, que sale por su capa, el migrable es **22**. De
esas, **13 viven en `components/pos-ventas/`** y salen del universo elegible por
la decisión de arriba — no de la cuenta.

**Quedan 9 elegibles**, y esta es la lista entera:

- `clientes/page.jsx:1124` — alta y edición de cliente
- `clientes/page.jsx:1493` — Historial de Ventas
- `clientes/page.jsx:1705` — Cuenta Corriente
- `turnos/[id]/page.jsx:604` — ingreso y retiro de efectivo
- `clientes/ModalMergeClientes.jsx:146` — unificar duplicados
- `dashboard/ModalDetalleVenta.jsx:93` — detalle de venta
- `grupos/ModalGrupo.jsx:154` — alta y edición de grupo
- `operador/ModalPedirOperador.jsx:31` — identificate para seguir
- `productos/ModalProductoFinal.jsx:22` — alta y edición de producto

Comparadas capa Y tarjeta carácter por carácter, **hay un solo conjunto de más de
uno**, y son estas dos:

    capa:    fixed inset-0 sunmi-pos-overlay flex items-center justify-center p-4 z-50
    tarjeta: w-full max-w-3xl p-4 max-h-[90vh] overflow-hidden flex flex-col

Las otras siete son singletons. **`clientes:1124` comparte la capa exacta pero no
la tarjeta** —es `max-w-md … overflow-y-auto` en vez de `max-w-3xl … overflow-hidden
flex flex-col`—, así que no entra. Es justamente el caso que el criterio viejo
habría metido adentro mirando solo la capa.

#### Que abren, comprobado EJECUTANDO

Los dos, contra `erpazul_dev` en el 3111, con sesión real y `--ubicacion depo`.
Se abren tocando el botón de la fila —"Ventas" y "Cta Cte"— sobre los **5
clientes que ya existen** en la base. No se fabricó ninguna fila.

Con datos de verdad: el historial de "Minimarket ayala" trae 8 ventas, tickets
#8 a #64; su cuenta corriente da saldo $0,00 y "Sin movimientos registrados",
que es su estado real y no un vacío inventado.

**Una trampa que costó una corrida y conviene no repetir:** `--abrir "Ventas"`
NO sirve, porque toca el primer botón cuyo texto lo contenga y el sidebar tiene
un ítem "Ventas". La foto salió de la pantalla sin modal y el selector del
recorte fue lo único que avisó. Los disparadores van por
`--abrir-selector "button.sunmi-link-accent.text-xs"` y
`--abrir-selector "button.sunmi-link-success.text-xs"`.

**El que sí queda afuera por no poder abrirse es `ModalPedirOperador`**, y esto
es leído y no ejecutado: se dibuja con `!exento && !operador && huboOperador`, o
sea que hace falta que una sesión de operario **haya existido y se caiga a mitad
de camino**, y el admin además es `exento`. No hay forma de llegar ahí sin
fabricar la condición. Las otras seis no se verificaron ejecutando porque son
singletons y no podían formar grupo de todos modos; su apertura queda por
comprobar el día que les toque.

#### LO QUE ESTAS DOS TIENEN Y NADIE ESPERABA: no hay div de cuerpo

Medido con una sonda de geometría sobre la pantalla real, no leído del JSX.

**La tarjeta ya es `flex flex-col`** y los hijos cuelgan directo de ella. No hay
ningún contenedor de cuerpo, ni `space-y-*`, ni `gap`: la tarjeta declara
`gap: normal`. Lo que separa a los hijos es **el margen propio de cada uno**.

Historial de Ventas — tarjeta 672x424,5, padding 21 px, `max-height` 810 px:

- encabezado, `top` 22, alto 42, `margin-bottom` 14
- la tabla, `overflow-y-auto flex-1`, `top` 78, alto 259,5
- el pie, `mt-4 pt-4 border-t`, `top` 351,5, alto 51, `margin-top` 14

Cuenta Corriente — cinco hijos, mismos 21 px de padding:

- encabezado, `top` 22, alto 42, `mb` 14
- el saldo, `top` 78, alto 47,5, `mb` 14
- los dos botones, `top` 139,5, alto 36, `mb` 14
- "Sin movimientos registrados", `top` 189,5, alto 77
- el pie, `top` 280,5, alto 51, `mt` 14

**La separación medida es 14 px, pareja, en los dos y entre todos los hijos.**

#### La lista declarada, escrita por lo que se va a ver

1. **Los bloques del modal se van a separar 10 px más.** Hoy hay 14 px entre cada
   par de bloques, puestos por el margen de cada uno. El cuerpo del kit agrega
   `gap-3` —10,5 px— **encima** de esos márgenes, así que la separación pasaría a
   24,5 px si los márgenes se conservan. En Cuenta Corriente eso son cuatro
   separaciones: el modal se estira unos 42 px. Es el punto que hay que decidir
   antes de escribir: o se sacan los `mb-4` de los hijos, o se declara el
   ensanchamiento.
2. **LA TABLA DEL HISTORIAL PUEDE DEJAR DE ESTIRARSE, y esto no es cosmético.**
   Su contenedor es `overflow-y-auto flex-1`, y el `flex-1` funciona porque su
   padre es la TARJETA, que es la que tiene el `max-h-[90vh]`. Envolver los hijos
   en el div de cuerpo del kit mete un contenedor en el medio, y el `flex-1` pasa
   a resolverse contra ese envoltorio. **Si la tabla deja de ocupar el alto
   disponible, la migración está mal**, y hay que mirarlo expresamente.
3. **Aparece un tope de alto con scroll donde ya había uno.** El cuerpo del kit
   trae `max-h-[65vh] overflow-y-auto`. La tarjeta ya declara `max-h-[90vh]
   overflow-hidden` —810 px medidos— y el historial ya scrollea adentro con su
   `overflow-y-auto`. Quedarían tres.
4. **El velo cambia de tono y la ventana se va a DESPEGAR MÁS del fondo.** Hoy
   los dos usan `sunmi-pos-overlay`. El velo del kit lleva el fondo del tema al
   70 % hacia el negro y eso, medido, da más separación entre tarjeta y velo, no
   menos. Es el único punto que mejora en vez de solo cambiar: **si en la
   comparación la ventana no se despega más, algo salió mal.**
5. **El modal se ensancha 7 px.** El padding de la capa pasa de `p-4` a `p-3`,
   14 → 10,5 px, 3,5 de cada lado.
6. **El título se ve más chico, menos grueso y más separado.** Hoy es
   `text-lg font-bold`; con `SunmiCardHeader` queda en 15 px, peso 600 y
   `tracking-wide`, y se corre 3,5 px a la derecha por el `px-1` del encabezado.
7. **El subtítulo YA EXISTE y hay que decidir qué pasa con él.** Los dos dibujan
   el nombre del cliente debajo del título, con `text-sm sunmi-text-muted`. No
   repite el título, así que por el criterio de arqueo-caja se enciende — pero
   `SunmiModalLayout` **no reenvía `subtitle`**, así que hoy no hay por dónde
   pasarlo sin tocar la pieza. Es el primer caso real que pide esa puerta.
8. **Aparece un segundo botón de cerrar arriba a la derecha.** Los dos ya tienen
   su ✕ en el encabezado Y su "Cerrar" abajo. Con el del kit serían tres formas
   de cerrar el mismo modal.
9. **El ancho máximo hay que declararlo**: `maxWidth="max-w-3xl"`. Sin eso los
   dos pasan de 672 px a los 504 del `max-w-xl` del kit — se ACHICAN, que es al
   revés de lo que pasó en los grupos anteriores.

#### Las capturas de antes, ya sacadas

A 1366x900 contra `erpazul_dev`, tema `sunmiDark` pasado explícito,
`--repeticiones 3`, `--ubicacion depo`, sin `--alto-captura`, y recortadas a
`[data-sunmi-modal="tarjeta"]` — el atributo se le agregó a mano a las dos
tarjetas, que es inerte y no mueve un píxel.

Las dos fichas dicen `repeticiones: 3` y `apto: true`, y el arnés informó "3
corridas idénticas" en las dos. Recortes: 672x425 el historial, 672x354 la cuenta
corriente. **Ojo con la ficha:** `recorte` trae el margen incluido —720x473 y
720x401— y confundirlo con el tamaño del elemento ya arruinó una medición.

#### LAS CUATRO DECISIONES DE EMANUEL, tomadas el 2026-08-14

Ninguna abre tanda nueva, y quedan escritas para cuando esto se retome:

1. **Los márgenes se sacan y el gap se declara.** A los hijos se les sacan los
   `mb-*`, porque el kit tiene que ser el único que decide el espaciado. Pero el
   gap se declara **para que dé los mismos 14 px de hoy**, no los 10,5 del
   default. Ni el apretón de 4 px ni el estirón de 42: las dos son la pantalla
   moviéndose, y esta fase empareja la capa.
2. **El subtítulo NO se abre.** El nombre del cliente queda escrito a mano dentro
   del cuerpo. Reenviar `subtitle` encendería los seis subtítulos de modal que
   están apagados a propósito, y esa es su propia tanda.
3. **Se saca el "Cerrar" de abajo**, por el precedente de `ModalPreviewPrecio`.
4. **`ModalPedirOperador` se revisa junto con los seis del POS después de la
   fase 4** — ver abajo.

##### LA CLASE DEL GAP NO ES `gap-3.5`, ES `gap-4`. La raíz de este proyecto es 14 px.

Vale anotarlo porque el número se calculó dos veces mal antes de mirarlo:
`app/globals.css:1124` fija `font-size: 14px` en `html, body`. Con esa raíz,
`gap-3` es 10,5 px, **`gap-3.5` es 12,25** y **`gap-4` es 14**. La aritmética de
16 px —la que hace que `-3.5` dé 14— no es la de este repo.

Y no hizo falta deducirlo: la sonda ya había medido `margin-bottom: 14px` sobre
un hijo con `mb-4`. **El número estaba medido antes de que nadie lo calculara.**

#### SE ESCRIBIÓ, SE MIDIÓ Y SE REVIRTIÓ — 2026-08-14

Se escribieron las dos migraciones enteras, con las cuatro decisiones aplicadas,
y **la comparación las rechazó**. Se revirtió. El atributo
`data-sunmi-modal="tarjeta"` queda commiteado en las dos tarjetas: es inerte y es
lo que va a permitir comparar el día que se retome.

**Lo que sí salió bien, medido en el caso normal** (1366x900, cliente con 8
ventas): las dos tarjetas se achican y el resto queda donde tiene que quedar. La
tarjeta del historial pasa de 424,5 a 378 px y la de cuenta corriente de 354 a
307. **Y acá una corrección de la lista declarada:** yo había declarado que la
tarjeta subiría "unos 65 px" tomando el precedente de `ModalPreviewPrecio`. El
número real es **46,5 y 47**. Los 65 son lo que se va con el pie; el encabezado
del kit devuelve unos 18. Declarar un número prestado de otra pantalla no es
declarar.

##### LO QUE LA FRENÓ: el `alto` de un modal centrado va al CUERPO, no a la TARJETA

Es una limitación real de la pieza, y aparece recién con contenido largo — por eso
el caso normal no la mostró.

`FORMAS.centrado` tiene `altoVa: "cuerpo"`, y está escrito a propósito en el
encabezado de `SunmiModalLayout`: para un modal centrado, el tope va al cuerpo y
la tarjeta crece con su contenido. **Estas dos declaran `max-h-[90vh]` en la
TARJETA**, con `overflow-hidden`.

Medido forzando el desborde con una ventana de 250 px de alto —que no fabrica
datos, solo achica la ventana—, sobre el mismo cliente y con la misma sesión:

- **antes:** tarjeta 225 px, `max-height` 225, `overflow: hidden`
- **después:** tarjeta **312 px**, `max-height: none`, `overflow: visible`

**+87 px, y la tarjeta deja de estar topada.** Es más del estirón de 42 que la
decisión 1 rechaza expresamente, y por eso se frena acá y no se declara.

Y el caso normal no lo mostraba: a 900 de ventana el contenido entra, así que las
dos capturas daban una tarjeta más chica y todo bien. **La medición que encontró
el defecto es la que forzó el caso que no se ve.**

##### Y un segundo hallazgo, del mismo cambio: el scroll se muda adentro de la tabla

`SunmiTable` envuelve su tabla en un `overflow-x-auto`. En CSS, `overflow-x`
distinto de `visible` obliga a `overflow-y` a calcular `auto`, así que ese
envoltorio **también scrollea vertical**.

Antes el que scrolleaba era el envoltorio deliberado —`overflow-y-auto flex-1`,
medido con `scrollHeight` 260 sobre `clientHeight` 60— y la tabla ocupaba los 620
px enteros de su padre. Después, el que scrollea es el `overflow-x-auto` de
`SunmiTable` —260 sobre 194— y **la tabla pasa a 620 de un padre de 628**: los 8
px se los come una barra de scroll que ahora vive ADENTRO del área de la tabla.

La cuenta de scrolls que scrollean de verdad sigue siendo **uno** antes y después,
así que esa mitad del candado pasa. Lo que no pasa es cuál: el scroll dejó de
estar donde alguien lo puso y apareció donde nadie lo pidió.

##### Lo que hace falta antes de retomar, y es una decisión de Emanuel

Que la pieza sepa poner el `alto` en la **tarjeta** también en `centrado`. Sería
el séptimo parámetro y sale de una necesidad real de dos pantallas reales, que es
como nacieron los otros seis — **pero contradice una decisión escrita del kit**:
hoy dónde cae el alto lo deriva la FORMA a propósito, para que no se puedan poner
incoherentes. Abrirlo es cambiar esa regla, y eso no entra por una tanda técnica.

Es la misma familia que "el encabezado del kit no se puede apagar", que frenó
`CarritoPedido`. Dos pantallas distintas llegaron al mismo lugar: **la pieza
decide cosas que la pantalla necesita decidir.**

Mientras tanto el grupo queda elegido, medido y con las capturas de antes
sacadas. Retomarlo cuesta la migración, no el relevamiento.

### EL SÉPTIMO PARÁMETRO: `altoVa`, y es una EXCEPCIÓN DECLARABLE

**Aprobado por Emanuel y escrito el 2026-08-14.** Con el default intacto.

**La regla NO se cayó.** "El alto lo deriva la forma" sigue siendo el default y
sigue siendo la regla: sin declarar nada, `dondeVaElAlto = altoVa ?? f.altoVa`
da exactamente lo de antes. Lo único que se agrega es **poder declarar lo
contrario a mano, con el porqué al lado**.

Y el porqué de que eso no rompa nada: la regla existía para que nadie los pusiera
incoherentes **por descuido**. Un parámetro que hay que escribir a propósito no
hace eso — y además obliga a que quien lo escriba quede anotado en el registro de
declaraciones, como los otros seis.

**La columna viaja con el alto.** Cuando el tope va a la tarjeta, la tarjeta tiene
que ser columna, o el `flex-1 min-h-0` del cuerpo no resuelve contra nada y el
scroll no aparece nunca. Las tres formas que ya nacían con el tope en la tarjeta
traen su `flex flex-col` en `FORMAS`; `centrado` no, así que se lo agrega la
pieza. Son dos caras de lo mismo y por eso no se declaran por separado.

#### Cómo se comprobó que el default no se movió, y por qué no son cuatro capturas

Lo pedido era una captura de un caso de cada forma, antes y después. **De las
cuatro, hoy solo UNA se puede abrir**, y eso salió de enumerar y no de suponer:
`git grep` sobre `app` y `components` da **16 consumidores**, de los cuales **15
usan `centrado`** por default y el único que declara forma es `ModalCambioPrevio`
con `hoja-o-centrado`. **`hoja` y `cajon` no tienen NINGÚN consumidor.**

Y `ModalCambioPrevio` vive bajo `pos-ventas`: al abrir `/modulos/pos-ventas/retiros/nuevo`
la pantalla dice **"No hay una caja abierta a tu nombre en este local."** Es el
mismo bloqueo que sacó al POS de la fase 2.

Así que:

- **`centrado`, con captura sobre pantalla real.** `ModalCategoria` en
  `/modulos/categorias`, 1366x900, tema `sunmiDark` explícito, `--repeticiones 3`,
  recorte a `[data-sunmi-modal="tarjeta"]`. Antes y después del cambio en el kit:
  **IDÉNTICAS byte a byte, cero píxeles de diferencia**, 440x316 las dos.
- **Las otras tres, con un candado**, porque no hay foto posible sin fabricar la
  condición. El candado afirma que la clase resuelta es la misma con y sin el
  parámetro para las cuatro formas, que `altoVa` no trae default en la firma, y
  que el operador es `??` y no `||` —con `||` un `altoVa=""` caería a la forma sin
  que nadie lo note—.
- **Ejercido contra la versión mala**, que es lo que hace que el candado valga:
  cambiando `??` por `||` la suite se pone en rojo nombrando el problema, y
  volviendo atrás vuelve a verde.

### EL PATRÓN, que ya tiene DOS casos: la pieza decide algo que la pantalla necesita decidir

Anotado como patrón el 2026-08-14 **para que el tercero se reconozca al toque y no
se resuelva de nuevo desde cero.**

La forma es siempre la misma: el kit toma una decisión de diseño razonable y la
deja fija; después aparece una pantalla real que necesita decidir esa misma cosa,
y la migración se traba. No se descubre leyendo el kit: se descubre cuando una
pantalla concreta no entra.

1. **El encabezado, que no se puede apagar.** `SunmiModalLayout` dibuja su fila de
   encabezado siempre. `CarritoPedido` trae el suyo adentro del cuerpo y lo
   comparte con un tercer camino que no se migra, así que las dos salidas se ven.
   **Sigue sin resolver, y no se resuelve en esta tanda.**
2. **El alto, que lo decidía la forma.** Resuelto acá con `altoVa`.

Los dos comparten diagnóstico y los dos comparten la salida: **un parámetro con el
default intacto, nacido de una pantalla real y anotado en el registro.** Lo que
hay que mirar cuando aparezca el tercero es si encaja en esa forma antes de
inventar otra.

### LAS DOS DE CLIENTES, SEGUNDO INTENTO: el parámetro anduvo, y frenó otra cosa

**2026-08-14.** Se rehizo la migración con `altoVa="tarjeta"`. **La mitad que
frenó la vez anterior quedó arreglada y medida**; frenó una segunda, que no es de
esta tanda.

**Lo que el parámetro arregló, medido forzando el desborde con la ventana de 250
px, que es el caso que a 900 no se ve:**

- **antes de migrar:** tarjeta 225 px, `max-height` 225
- **primer intento, sin el parámetro:** 312 px, `max-height: none` — los 87 px
- **segundo intento, con `altoVa="tarjeta"`:** **225 px, `max-height` 225 px**

O sea **idéntica a antes de migrar**. Y a 900 la tarjeta queda en 378 —de 424,5—
con la cadena entera de vuelta: tarjeta `flex flex-col` topada en 810, cuerpo
`flex flex-col flex-1 min-h-0 overflow-y-auto mt-2 gap-4`. Las capturas salieron
deterministas las dos.

#### LO QUE LA FRENÓ AHORA, y afecta a 18 pantallas: `SunmiTable` arrastra el scroll vertical

`components/sunmi/SunmiTable.jsx:266` envuelve la tabla en `overflow-x-auto` (o
`overflow-auto` con `stickyHeader`). **En CSS, un `overflow-x` distinto de
`visible` obliga al `overflow-y` a calcular `auto`**, así que ese envoltorio
también scrollea vertical.

Con el desborde forzado, el que scrollea de verdad **sigue siendo el de
`SunmiTable`** —260 sobre 107— y no el envoltorio deliberado. Y la tabla queda en
**620 px de un padre de 628**: los 8 px se los come una barra que aparece adentro
del área de la tabla.

**Antes de migrar no pasaba**, y el motivo es de una línea: el envoltorio hecho a
mano era un BLOQUE —`overflow-y-auto flex-1`— y el cuerpo del kit es una COLUMNA
FLEX. En un bloque el hijo no se encoge y clipea el de afuera; en una columna
flex el hijo se encoge y el scroll se lo queda el de adentro.

**Por eso se frena y no se declara:** no es una diferencia de estas dos pantallas,
es de `SunmiTable` contra el cuerpo del kit, y **`SunmiTable` la usan 18 pantallas
bajo `app/` y 41 archivos en total** (enumerado con `git ls-files` vía `git grep
-l`). Cualquier migración que meta una `SunmiTable` adentro del cuerpo del kit va
a heredar esto.

El código de las dos migraciones se revirtió. El parámetro queda, verificado y con
su candado.

#### Y UNA QUE APARECIÓ SOLA: el contador se queda CIEGO al primer import

**Medido el 2026-08-14 y es la limitación documentada mordiendo de verdad.**

Al migrar dos de las TRES capas de `app/modulos/clientes/page.jsx`, el trinquete
pasó de **41 a 38**. Se migraron dos, no tres. La tercera —`ModalCliente`, la capa
de la línea 1125— **sigue armada a mano y dejó de contarse**, porque
`importaModalDelKit` mira si el ARCHIVO importa la pieza, y ahora la importa.

O sea que **un archivo con varias capas desaparece entero de la cuenta apenas se
migra la primera**, y la cifra oficial queda corta sin que nada avise. Es la misma
familia que el comentario que hacía bajar el trinquete sin migrar nada, con otra
cara: allá el defecto era mirar texto en vez de un import, y acá es que la unidad
es el archivo cuando debería ser la capa.

**Consecuencia práctica, y hay que tenerla presente el día que esto se retome:**
apenas se migre la primera capa de `clientes/page.jsx`, la cifra del trinquete
deja de ser comparable contra las anteriores hasta que se migren las tres. No se
tocó la línea de base a propósito.

### EL SCROLL DE `SunmiTable`: LA PALANCA ERA `flex-shrink`, NO EL OVERFLOW

**2026-08-14.** Corregido por Emanuel antes de escribir una línea, y comprobado
midiendo.

**Lo que NO funciona, y quedó medido para que nadie lo reintente:** declarar
`overflow-y-visible` al lado del `overflow-x-auto`. Lo pisa el navegador, por la
misma regla que hace aparecer el problema. Medido en el navegador, preguntando por
el valor CALCULADO, con las dos formas de escribirlo:

- clase `overflow-x-auto` → calculado `overflow-x: auto`, **`overflow-y: auto`**
- clase `overflow-x-auto overflow-y-visible` → **exactamente lo mismo**
- inline `overflow-x:auto; overflow-y:visible` → **exactamente lo mismo**
- control, sin declarar nada → `visible` / `visible`

El control importa: sin él, cuatro filas iguales no prueban que la sonda mire algo.

**La palanca es `flex-shrink`.** El problema no es que el envoltorio PUEDA
scrollear: es que **se encoge** adentro de una columna flex, y al encogerse el
scroll se lo queda él en vez del contenedor de afuera. Un envoltorio que no se
encoge conserva su alto de contenido y se comporta como cuando el padre era un
bloque, que es como se comportaba antes de que existiera esto.

`components/sunmi/SunmiTable.jsx:266` pasa a `overflow-x-auto shrink-0`. La rama
de `stickyHeader` NO lo lleva: ahí el scroll vertical es deliberado —declara
`overflow-auto` con su propio tope— y encogerse es parte de lo que hace.

#### Medido, con el desborde forzado a 250 px de ventana

Sobre el historial de ventas de `clientes` migrado al kit:

- **sin `shrink-0`:** scrollea el envoltorio de `SunmiTable` —260 sobre 107— y la
  tabla queda en **620 px de un padre de 628**
- **con `shrink-0`:** scrollea **el cuerpo del kit** —291 sobre 138—, que es el
  envoltorio deliberado, y la tabla vuelve a **620 de 620**

Las dos mitades del candado quedan: **cuántos scrollean de verdad Y CUÁL.**

#### A cuántas pantallas les puede cambiar algo: CERO, y así se enumeró

`flex-shrink` es **inerte fuera de un contenedor flex**, así que la pregunta no es
cuáles usan `SunmiTable` —son 18 bajo `app/`, enumeradas con `git grep -l`— sino
**en cuáles el envoltorio de la tabla tiene un padre que es contenedor flex**.

Se midió en el navegador y no leyendo el JSX, porque eso depende del CSS calculado
y no del texto: se visitaron las 18 rutas con sesión real, buscando los divs con
`overflow-x` auto que contienen una tabla y preguntando por el `display` del
padre.

**De 13 rutas con tabla visible, CERO tienen el envoltorio en un contenedor
flex.** Ninguna puede moverse.

**Cinco quedaron sin medir y se dice cuáles**, porque con los datos de hoy no
dibujan tabla: `reportes-ventas`, `transferencias`, `turnos`, `clientes/[id]` y
`turnos/[id]`. No se fabricó nada para que la dibujaran.

Y además se comprobó **empíricamente** que es inerte, que no es lo mismo que
deducirlo de la regla: `/modulos/categorias` a 1366x1400 —el alto hace falta
porque la tabla mide 946 px y a 900 no entra entera—, recortando al `<table>`,
con `--repeticiones 3` a los dos lados. **IDÉNTICAS byte a byte, cero píxeles.**

Vale anotar el rodeo, porque se va a repetir: los dos primeros intentos dieron
"IDÉNTICAS" **y el arnés las descalificó igual**, con "ARNÉS DETERMINISTA, pero la
foto no muestra lo que dice". Se cortaba contenido por abajo. El cero de una foto
que no entra entera no vale, y el arnés lo dijo antes que nadie.

### EL CONTADOR: LA UNIDAD PASA A SER LA CAPA, NO EL ARCHIVO

**Arreglado el 2026-08-14**, y era más urgente que todo lo demás.

`importaModalDelKit` miraba si el ARCHIVO importaba la pieza, así que **un archivo
con varias capas desaparecía entero de la cuenta apenas se migraba la primera**.
Medido: al migrar dos de las tres capas de `app/modulos/clientes/page.jsx` el
trinquete pasó de 41 a 38 —bajó tres— y la tercera seguía escrita a mano.

La pregunta correcta no era "¿este archivo usa la pieza?" sino **"¿ESTA capa está
escrita a mano?"**, y esa se contesta sola: si una línea escribe `fixed inset-0`,
la capa la dibuja la pantalla. Un archivo puede usar la pieza para dos modales y
escribir el tercero a mano — que es el estado de cualquiera a medio migrar, o sea
justo cuando hace falta que la cuenta sea fiel. La pieza misma se sigue sacando
por su RUTA.

#### La línea de base, con el número viejo al lado del nuevo

**Modales armados a mano: 42 → 40.** El 42 es del 2026-08-13, commit `127b9d6`.
**No subió ni bajó solo**, y se descompone en tres:

- **−1** el `ModalCliente` de `pos-ventas`, que era código muerto y se borró
  (`pos-ventas` pasa de 18 a 17)
- **−2** los dos de `clientes` migrados en esta tanda (`clientes` pasa de 4 a 2)
- **+1** una capa que ANTES ERA INVISIBLE y ahora se ve: `app/andamio-velo/page.jsx`
  escribe su capa a mano **y** importa la pieza, así que el contador viejo la
  descontaba. Aparece bajo `(suelto)`, que pasa de 0 a 1.

Ese +1 es la mejor confirmación de que el arreglo hace lo suyo: la primera capa
que destapó es exactamente del tipo que el defecto escondía.

**Y hay que saberlo antes de leer el próximo trinquete:** el andamio no está
trackeado y se borra, así que cuando se vaya la cifra va a bajar a 39. Esa baja no
es progreso, es que se fue un archivo descartable.

**Cómo se reconcilió, que es parte del número:** el enumerador que usa el contador
sobre `git ls-files app components` da **39**, y el trinquete da **40**. No es una
contradicción: `scripts/hardcodeo.mjs` enumera con
`git ls-files --cached --others --exclude-standard`, o sea trackeados **y** no
trackeados, a propósito. La diferencia es el andamio.

### LOS SIETE QUE QUEDAN: relevados ANTES de migrar ninguno

**2026-08-14.** Es la regla nueva aplicada en su orden: **primero si abre, después
la firma.** Comprobado EJECUTANDO contra `erpazul_dev` en el 3111, con sesión real
y `--ubicacion depo` por nombre, y **leyendo el texto de la pantalla** en cada
caso — porque una foto determinista de un cartel de error también es determinista.

`ModalPedirOperador` no se intentó: ya está anotado abajo como no verificable y va
con los del POS después de la fase 4.

#### Los cuatro que ABREN sin fabricar condiciones

- **`ModalCliente`** (`clientes/page.jsx:1125`) — `/modulos/clientes`, botón
  "+ Nuevo Cliente". La capa dice "Nuevo Cliente ✕ Nombre * DNI / CUIT Teléfono
  Email Lista de precios…". Capa `sunmi-pos-overlay …p-4 z-50`, tarjeta
  `w-full max-w-md p-4 max-h-[90vh] overflow-y-auto`. **Sin tabla adentro.**
- **`ModalGrupo`** (`grupos/ModalGrupo.jsx:154`) — `/modulos/grupos`, botón "Nuevo
  grupo". La capa dice "Nuevo grupo Configurá el grupo y sus asignaciones…". Capa
  `z-50 …bg-black/50 p-3`, y entre la capa y la tarjeta hay un div intermedio
  `w-full max-w-xl` con una `<SunmiCard>` **sin `className`**. **Sin tabla.**
- **`ModalProductoFinal`** (`productos/ModalProductoFinal.jsx:22`) — **abre por
  URL**, `/modulos/productos?editar=<id>` sobre un producto que ya existe. La capa
  dice "EDITAR PRODUCTO Cerrar Identidad Nombre *…". **Sin tabla** en el
  envoltorio, que son 51 líneas: el contenido vive en subcomponentes.
- **`ModalMergeClientes`** (`clientes/ModalMergeClientes.jsx:146`) —
  `/modulos/clientes`, botón "Unificar duplicados". La capa dice "Unificar
  clientes duplicados ✕ 1. Cliente principal (el que queda) Cancelar Unificar
  cliente(s)". Capa `bg-black/80`, tarjeta `max-w-2xl p-4 max-h-[90vh]
  overflow-y-auto`. **TIENE TABLA adentro.**

**Y una trampa que costó una corrida, anotada para no repetirla:** el botón
"+ Producto" del listado **no abre el modal**, hace `router.push` a
`/modulos/productos/nuevo`, que es otra página. Y `?nuevo=1` tampoco lo abre: la
capa queda en el DOM con `display: none`. El único camino que lo abre es
`?editar=`. Se descubrió porque la sonda distingue tres estados y no dos —no
existe, existe y está OCULTA, y se ve—; con dos, "existe y está oculta" se habría
leído como "no existe" y el diagnóstico habría ido al lugar equivocado.

#### ⚑ EL PRÓXIMO HITO ES LA TABLA DE DECLARACIONES, NO LA FASE 5

**Decidido por Emanuel el 2026-08-14, y se anota acá para que no se saltee.** Al
terminar los cuatro abribles, la fase 2 **no** pasa directo a la fase 5: primero
se mira la tabla de declaraciones entera y se decide **qué se unifica y qué tiene
razón de ser distinto**. Es lo que este documento pide desde el principio —"el
parámetro es una postergación, no un perdón"— y saltearlo dejaría la fase cerrada
con siete parámetros y ninguna revisión.

Recién después de esa revisión se pasa a la fase 5.

#### Los dos que HOY NO SE PUEDEN ABRIR, y por qué

- **`ModalDetalleVenta`** (`dashboard/ModalDetalleVenta.jsx:93`) — necesita una
  venta **del día** para tener una fila que tocar en `UltimasVentas`. El dashboard
  dice hoy "VENTAS HOY $0,00 · 0 TICKETS". Hay ventas en la base, pero de mayo.
- **El ingreso/retiro de `turnos/[id]`** (`turnos/[id]/page.jsx:604`) — sus botones
  se dibujan con `{operativo && …}`, o sea que hace falta un turno **abierto**. La
  pantalla de turnos filtrada por "Abiertas" dice "No hay cajas para estos
  filtros", y el turno 42 dice "Estado Cerrado".

**No se fabricó ninguna de las dos condiciones.**

**Decidido el 2026-08-14: quedan ESPERANDO, y van después de los cuatro
abribles.** Cuando les toque, si el dato no apareció solo, se le avisa a Emanuel y
él arma el rato para operar la caja de verdad —abrir un turno, hacer una venta—.
**No se fabrican**: escribir en la base para simularlas es exactamente lo que la
regla 4 prohíbe, y además dejaría estado del que dependen otras capturas.

#### EL ORDEN ELEGIDO, de menor a mayor costo de verificación

1. **`ModalCliente`.** Abre con un botón, no tiene tabla, y **vive en el mismo
   archivo que las dos ya migradas**, así que el import ya está y su capa es
   idéntica a la de ellas. Es el más barato por lejos.
2. **`ModalGrupo`.** Abre con un botón y no tiene tabla. Cuesta un poco más porque
   trae un div intermedio entre la capa y la tarjeta —que es lo que el panel del
   kit dibuja— y su tarjeta no declara nada, así que hay que mirar qué le pone el
   kit donde hoy no hay nada escrito.
3. **`ModalProductoFinal`.** Abre, pero por URL y sobre un producto existente, y
   su montaje es distinto: la capa vive SIEMPRE en el DOM y se apaga con `hidden`,
   mientras que el kit no dibuja nada con `open` en falso. Ese cambio de patrón hay
   que declararlo.
4. **`ModalMergeClientes`.** Tiene tabla adentro. Con el `shrink-0` de
   `SunmiTable` ya resuelto no debería traer sorpresas, pero es el que más
   superficie de verificación tiene y por eso va último de los que abren.

Después de esos cuatro, la fase 2 se queda **sin ningún candidato abrible**: los
tres que sobran son los dos bloqueados por datos y `ModalPedirOperador`.

**Capturas de antes del primero, ya sacadas.** `ModalCliente` a 1366x900 contra
`erpazul_dev`, tema `sunmiDark` explícito, `--repeticiones 3`, `--ubicacion depo`,
sin `--alto-captura`, recortado a `[data-sunmi-modal="tarjeta"]` —atributo inerte
agregado a mano—. Ficha: `repeticiones: 3`, `apto: true`. La tarjeta mide **392x810**,
o sea que está TOCANDO su tope de `90vh` y scrollea: es un formulario largo, no una
tarjeta que crece con su contenido. Eso lo pone en la misma familia que las dos
recién migradas y anticipa que va a necesitar `altoVa="tarjeta"`.

### `ModalCliente` — LA LISTA DECLARADA, escrita ANTES de tocar

**2026-08-14.** Con los números DE ESTA PANTALLA, medidos con la sonda sobre
`/modulos/clientes` a 1366x900, y no prestados de las dos anteriores.

**Lo que hay hoy, medido:** tarjeta 392x810, `display: block`, `max-height: 810px`,
`overflow: auto`. Dos hijos: el encabezado —`flex items-center justify-between
mb-4`, 24,5 px de alto— y el cuerpo —`space-y-3`, 895,5 px—, separados 14 px.

Y una diferencia estructural con las dos ya migradas, que cambia qué hay que
mirar: **acá el que scrollea es LA TARJETA misma** —976 sobre 808—, no un
envoltorio interno. Las otras dos eran `flex flex-col overflow-hidden` con un div
adentro que scrolleaba.

1. **LA TARJETA DEJA DE SCROLLEAR Y EL TÍTULO DEJA DE IRSE.** Hoy el `SunmiCard`
   se lleva todo el scroll, encabezado incluido: al bajar en el formulario, el
   "Nuevo Cliente" se va de la vista. Con el kit el encabezado queda fijo y
   scrollea solo el cuerpo. **Es la diferencia más visible de esta migración** y
   es una mejora, pero es un cambio: si al comparar el título sigue subiéndose,
   algo salió mal.
2. **El título se ve más chico, menos grueso y más separado, y el ✕ pasa a ser un
   botón "Cerrar".** Hoy el encabezado mide 24,5 px de alto; el del kit midió 36
   en las dos anteriores, así que la tarjeta redistribuye unos 11,5 px.
3. **El velo cambia de tono y la ventana se despega más del fondo.** Hoy usa
   `sunmi-pos-overlay`.
4. **El modal se ensancha 7 px**: el padding de la capa pasa de `p-4` a `p-3`,
   3,5 de cada lado.
5. **El ancho máximo hay que declararlo**, `maxWidth="max-w-md"`. Sin eso pasa de
   392 a 504 px.
6. **El alto va a la TARJETA**, `altoVa="tarjeta"`, para que siga topada en 810 y
   no crezca. Es la misma familia que las dos anteriores y por eso se anticipó al
   relevar: 392x810 ya estaba tocando el tope.
7. **La separación entre encabezado y cuerpo se mantiene en 14 px**, declarando
   `espacioCuerpo="mt-4"`. El `mt-2` del kit la dejaría en 7, y el `gap-3` no
   hace nada acá porque el cuerpo tiene UN SOLO hijo.
8. **El interior NO se toca.** El `space-y-3` entra entero como único hijo del
   cuerpo, así que sus campos siguen en contexto de bloque y sus márgenes siguen
   colapsando igual que hoy. El punto fijo del `space-y-*` **no corresponde**, y
   por eso: lo que lo dispara es que el contenedor de los campos pase de bloque a
   flex, y acá ese contenedor sigue siendo el mismo div de bloque.
9. **El par Cancelar/Guardar se queda ADENTRO del cuerpo**, no pasa al pie del
   kit. El pie del kit es `justify-end` y estos dos son `flex-1`, mitad y mitad:
   mandarlos al pie los haría chicos y alineados a la derecha.

#### MIGRADO Y COMPARADO: los nueve puntos, contra la medición

Migrado el 2026-08-14. **Nada apareció fuera de la lista.** Punto por punto:

- **1 cumplido, y es el más importante.** El que scrollea pasó de ser la TARJETA
  —976 sobre 808— a ser el CUERPO —896 sobre 716—. El encabezado queda fijo.
- **2 cumplido, y el número dio exacto**: el encabezado pasa de 24,5 a **36 px**,
  los 11,5 declarados. El ✕ es ahora un botón "Cerrar".
- **3 cumplido.** Se ve en la captura: el velo viejo dejaba pasar la barra ámbar
  de arriba; el nuevo la apaga.
- **5, 6 y 7 cumplidos y medidos**: la tarjeta sigue en **392x810** con
  `max-height: 810px` —o sea que el `maxWidth` y el `altoVa` hicieron lo suyo— y
  la separación entre encabezado y cuerpo sigue siendo **14 px**, con el cuerpo
  arrancando en `top` 72 contra 60,5 de antes.
- **8 cumplido.** El cuerpo tiene un solo hijo, el `space-y-3` de siempre.
- **9 cumplido**: el par sigue adentro del cuerpo.

**Y EL PUNTO 4 PEDÍA UNA ACLARACIÓN QUE NO TENÍA.** Decía "el modal se ensancha
7 px" a secas. A **1366 no se ensancha nada**: la tarjeta mide 392 antes y
después, porque el `max-w-md` la topa muy por debajo del ancho disponible y el
padding de la capa no llega a decidir.

Medido a **360**, que es donde sí decide: **332 → 339 px**, exactamente los 7.

O sea que el punto era correcto y estaba mal redactado: **ese ensanche solo se ve
en una pantalla lo bastante angosta como para que la tarjeta toque el padding de
la capa** — la Sunmi de la caja, no un monitor. Se anota porque **el mismo punto
se declaró así en las listas anteriores**, sin la aclaración, y una diferencia que
se declara y después no aparece a 1366 hace dudar de la lista entera en vez de
del renglón.

#### Lo que declara esta pantalla, para el registro

- `maxWidth` → `"max-w-md"`, porque su tarjeta es `max-w-md`.
- `alto` → `"max-h-[90vh]"`, el que ya declaraba.
- **`altoVa` → `"tarjeta"`. Es la PRIMERA pantalla que declara el séptimo
  parámetro**, y por el motivo por el que se escribió: su tope estaba en la
  tarjeta y ya lo estaba tocando.
- `espacioCuerpo` → `"mt-4"`, para conservar los 14 px. El `gap` no se declara
  porque el cuerpo tiene un solo hijo y no haría nada.
- `destructivo` → es un formulario de alta y edición: cerrar sin querer tira lo
  escrito.

### `ModalGrupo` — LA LISTA DECLARADA, escrita ANTES de tocar

**2026-08-14.** **Todos los números de abajo son a 1366x900**, y se dice porque la
tanda anterior enseñó que un número sin su ancho al lado engaña: el ensanche de
7 px de `ModalCliente` no aparecía a 1366 y sí a 360.

**Lo que hay hoy, medido:** tarjeta **504x577,5** a 1366, `display: block`,
`max-height: none`, padding 21. Cuatro hijos: el encabezado —que **ya es un
`SunmiCardHeader`**, 22,5 px—, un `<p>` de subtítulo escrito a mano, el cuerpo
—`flex flex-col gap-3 max-h-[65vh] overflow-y-auto pr-1`, 422,5 px— y el pie
—`flex justify-end gap-2 mt-3 pt-3 border-t sunmi-divider`, 47,5 px—.
Separaciones: **7, 7 y 10,5**.

**Es la más parecida al kit de las cuatro**: ya usa el encabezado del kit y su
cuerpo ya tiene exactamente la forma del cuerpo del kit.

#### LOS DOS PUNTOS QUE HABÍA QUE MIRAR, contestados antes de tocar

**1. El div intermedio `w-full max-w-xl` ES EL PANEL, y el del kit es casi el
mismo.** El kit arma su panel con `["relative", w-full si no declaran ancho,
maxWidth si no declaran uno, f.panel, lo pedido]`. Para `centrado` sin declarar
nada eso da **`relative w-full max-w-xl`**. O sea que lo único que se agrega es
`relative`, que crea contexto de posicionamiento y **no mueve nada por sí solo**
—no hay `top`/`left`/`inset` que resolver contra él—.

Y el `max-w-xl` es **el default del kit**, así que **no hay que declarar
`maxWidth`**: la tarjeta tiene que seguir en 504.

**2. El `SunmiCard` sin `className`: el kit tampoco le pone nada.** La pieza le
pasa `[f.tarjeta, columnaEnLaTarjeta, altoEnLaTarjeta, paddingTarjeta,
sombraTarjeta].filter(Boolean).join(" ")`. Para `centrado`, sin `altoVa` y sin
padding ni sombra declarados, **las cinco dan vacío** y el resultado es la cadena
`""`. Y el prop ya tiene `className = ""` por default, así que recibir `""` y no
recibir nada son lo mismo. **Donde hoy no hay nada escrito, el kit sigue sin
escribir nada.**

#### La lista, por lo que se va a ver

1. **APARECE UN BOTÓN "Cerrar" ARRIBA A LA DERECHA, DONDE HOY NO HAY NINGUNO.** Es
   el punto más visible y el más distinto de las tres anteriores: este modal
   **no tiene botón de cerrar en el encabezado** —ni ✕ ni nada— y hoy solo se
   cierra con "Cancelar" abajo o tocando el velo. El encabezado va a crecer de
   22,5 a unos 36 px, como pasó en `ModalCliente`.
2. **El pie pierde su línea separadora de arriba y su `pt-3`.** Hoy es
   `mt-3 pt-3 border-t sunmi-divider`; el del kit es `shrink-0 flex justify-end
   gap-2 mt-3`. Se va la línea y 10,5 px de padding, así que el bloque del pie
   baja de 47,5 a unos 37. **Va declarado antes por el precedente de
   `ModalPreviewPrecio`**, donde el separador se fue con el botón y se contó
   después.
3. **El subtítulo se separa 3,5 px más del primer campo.** Sigue escrito a mano
   —`subtitle` no se reenvía— pero pasa a ser el primer hijo del cuerpo, así que
   lo que lo separa deja de ser su `mb-2` (7 px) y pasa a ser el `gap-3` del
   cuerpo (10,5). Se le sacan el `-mt-1` y el `mb-2`, que eran relativos al
   encabezado.
4. **El velo cambia de tono y la ventana se despega más del fondo.** Hoy es
   `bg-black/50` escrito a mano.
5. **El ancho NO cambia, a ningún ancho de pantalla.** La tarjeta sigue en 504 a
   1366 porque `max-w-xl` es el default del kit, y el padding de la capa **ya es
   `p-3`**, el mismo que pone `centrado`. Acá no hay ensanche ni a 1366 ni a 360:
   es la diferencia con las tres anteriores, que venían de `p-4`.
6. **NO lleva `altoVa`.** Su tarjeta no está topada —`max-height: none`— y el tope
   vive en el cuerpo, `max-h-[65vh]`, que es exactamente lo que hace `centrado`
   por default. **Es la primera de las migradas que no necesita el séptimo
   parámetro**, y eso confirma que el parámetro no se está usando por costumbre.
7. **Hay que declarar `espacioCuerpo="mt-2 gap-3 pr-1"`** para conservar el
   `pr-1`. Son 3,5 px de padding a la derecha que hoy existen para que la barra
   de scroll no se coma el borde de los campos; el default del kit no los tiene.

#### MIGRADO Y COMPARADO: nada apareció fuera de la lista

Migrado el 2026-08-14. **La tarjeta pasa de 504x578 a 504x583 a 1366**: crece
**5 px de alto** y no cambia de ancho.

- **1 cumplido y el número dio.** Aparece el botón "Cerrar" y el encabezado pasa
  de **22,5 a 36 px**, los ~36 declarados.
- **2 cumplido.** El pie queda en `shrink-0 flex justify-end gap-2 mt-3` —sin
  `border-t` y sin `pt-3`— y baja de **47,5 a 36 px**. Declaré "unos 37".
- **3 cumplido.** El `<p>` es ahora el primer hijo del cuerpo y lo separa el
  `gap-3` del cuerpo, 10,5 px, contra los 7 de su `mb-2`.
- **5 cumplido.** 504 px antes y después. No hay ensanche, porque `max-w-xl` es el
  default del kit y el padding de la capa ya era `p-3`.
- **6 cumplido.** La tarjeta sigue con `max-height: none` y el tope sigue en el
  cuerpo. **No lleva `altoVa`.**
- **7 cumplido.** El cuerpo quedó
  `flex flex-col max-h-[65vh] overflow-y-auto mt-2 gap-3 pr-1`.

**Y los 5 px cierran con la aritmética**, que es lo que confirma que no hay nada
suelto: el encabezado suma 13,5, el pie resta 11,5, y el cuerpo sube 27 porque el
subtítulo —16,5 px más su hueco de 10,5— se mudó adentro de él. La cuenta da lo
medido dentro del redondeo.

**Lo que declara esta pantalla, para el registro:** `espacioCuerpo` con
`"mt-2 gap-3 pr-1"` y `destructivo`. **Nada más** — ni `maxWidth`, ni `alto`, ni
`altoVa`. Es la migración más liviana de las cuatro, y confirma que el séptimo
parámetro no se está usando por costumbre.

**Un defecto de lint que NO es de esta tanda y queda anotado:** `ModalGrupo.jsx`
tiene un error de eslint —"Calling setState synchronously within an effect can
trigger cascading renders"— en su primer `useEffect`. Comprobado que **ya estaba
antes de migrar**: aparece igual en la versión anterior, una línea más abajo. No
se tocó.

### `ModalProductoFinal` — NO SE MIGRÓ, y el motivo corrige el relevamiento

**2026-08-14.** Se frenó antes de tocar una línea. Los dos hallazgos van por
separado porque son de distinta naturaleza.

#### 1. EL CAMBIO DE MONTAJE ES REAL PERO INERTE, y lo contrario de lo que se temía

La pregunta era qué implica que hoy su capa viva siempre en el DOM apagada con
`hidden` mientras el kit no dibuja nada con `open` en falso — en concreto, si el
estado del formulario se comporta distinto al cerrar y volver a abrir.

**Medido, no deducido**, sobre `/modulos/productos?editar=1` a 1366:

- **abierto:** la capa existe y se ve, `display: flex`, y tiene **9 inputs
  adentro** con el producto cargado.
- **cerrado, tocando "Cerrar":** la capa **sigue en el DOM** con `display: none`,
  y tiene **0 inputs adentro**.

O sea que **el formulario ya se desmonta hoy**, y no por el `hidden` sino porque
el archivo ya lo tiene detrás de `{open && <FormProducto …/>}`. Quien lo escribió
ya había resuelto el problema.

**Consecuencia: migrar al kit NO cambia el comportamiento del estado.** Hoy
cerrar y volver a abrir arranca de cero, y con el kit también. Lo único que se va
es el envoltorio vacío —la capa, el encabezado y el contenedor de scroll— que hoy
queda colgando en el DOM mientras el modal está cerrado. Eso no se ve y no cambia
nada que alguien pueda notar.

**Queda declarado igual**, porque el día que alguien saque ese `{open && …}`
creyendo que el kit ya lo cubre, lo va a cubrir — pero al revés que hoy: sería el
`return null` del kit el que desmonta, y no el guard del archivo.

#### 2. LO QUE LO FRENÓ: la pantalla abre A VECES, y eso invalida la verificación

`?editar=<id>` **no abre siempre**. Medido: **4 de 7 corridas**, con sesión real
y el mismo producto —`id=1`, que la API devuelve bien cuando se la consulta
directo—.

Cuando falla no hay error a la vista: **no dispara ningún `alert`** —comprobado
interceptando `window.alert` antes de navegar— y **la URL queda en
`/modulos/productos`, sin el `?editar=`**. O sea que algo reescribe la URL y le
saca el parámetro, y entonces el efecto cae en su última rama y cierra el modal.
Es una carrera entre dos efectos de esa página, y no se investigó más porque
excede esta fase.

**Por qué eso frena la migración y no es un detalle:** la verificación de esta
fase es comparar una captura de antes contra una de después. Con una apertura que
funciona la mitad de las veces, **una corrida fallida produce una captura
perfectamente determinista de la pantalla SIN el modal** — y pasaría
`--repeticiones 3` sin despeinarse. Es exactamente la trampa que este documento ya
tiene anotada dos veces.

#### Y CORRIGE EL RELEVAMIENTO: una sola observación no alcanzaba

En el relevamiento de los siete quedó anotado que `ModalProductoFinal` **"abre por
URL"**, sin reservas. Esa afirmación salió de **UNA sola corrida**.

El propio arnés de este proyecto usa `--repeticiones 3` justamente porque un
resultado que parece determinista no lo es hasta que se repite. **La regla se
aplicó al fotografiar y no al relevar**, y por eso el orden de trabajo se armó
sobre un dato que no estaba medido con el mismo estándar.

**La regla que queda:** cuando el relevamiento diga "abre", eso también se repite.
Una vez no es una medición.

#### EL CAMINO NORMAL NO PASA POR AHÍ — pero `?editar=` TAMPOCO es solo a mano

**Comprobado ejecutando, 4 de 4 corridas**, tocando el lápiz de una fila del
listado de productos: **navega a `/modulos/productos/<id>/editar`**, que es una
PÁGINA aparte y no abre ningún modal. Esa ruta usa `FormProducto` directo, con su
botón de volver. **No pasa por `?editar=` ni por la carrera.** Las cuatro
corridas dieron lo mismo, así que el camino de uso diario del módulo de productos
está sano.

**Pero `?editar=` no se escribe solo a mano**, y eso lo destapó buscar más ancho:
`components/proveedores/listas/VistaProductosSistema.jsx` arma
`/modulos/productos?editar=<id>` para abrir la ficha de un producto, y tiene el
motivo escrito al lado — eligieron esa ruta **a propósito** porque la otra "no
llega a montar el formulario sin el contexto del listado".

Así que la carrera **sí afecta a un camino de usuario**, solo que no al que yo
suponía: no al lápiz del listado de productos, sino al botón de ficha de la vista
de listas de proveedor. **4 de 7.**

**Y `?editar=` es la convención de la casa**, no una rareza: la usan clientes,
grupos, locales, operadores, proveedores y roles. Enumerado con `git grep` sobre
`app`, `components`, `hooks` y `lib`. Lo que no se midió es si la carrera existe
también en esas otras pantallas — acá solo se midió la de productos.

**Lo que NO se verificó y se dice:** si la vista de listas de proveedor es
alcanzable hoy con estos datos. Se midió la URL, que es la misma, no el recorrido
completo desde esa pantalla.

#### LA REGLA QUE SALE DE ACÁ: relevar también se repite

**Escrita el 2026-08-14.** Estaba solo en un informe y por eso sube al documento.

**Cuando el relevamiento diga "abre", eso se comprueba TRES VECES, igual que una
captura.** El arnés usa `--repeticiones 3` porque un resultado que parece
determinista no lo es hasta que se repite, y ese estándar **se estaba aplicando al
fotografiar y no al relevar**.

El caso: `ModalProductoFinal` quedó anotado como "abre por URL" sin reservas, y
esa afirmación salía de **una sola corrida**. Repetida, abre 4 de 7. Con una sola
observación se armó un orden de trabajo sobre un dato que no estaba medido con el
mismo estándar que todo lo demás.

Y el motivo por el que importa más acá que en otros lados: **una apertura fallida
produce una captura perfectamente determinista de la pantalla sin el modal**, que
pasa `--repeticiones 3` sin despeinarse. La repetición al relevar es lo único que
lo atrapa antes.

#### El orden se reacomoda

`ModalProductoFinal` **sale del tercer puesto** y queda esperando a que se
entienda por qué la URL pierde el parámetro. Su lugar lo toma
**`ModalMergeClientes`**, que abre con un botón —comprobado— y cuyo único costo
extra es que tiene una tabla adentro, y eso ya está resuelto con el `shrink-0`.

Orden vigente: `ModalCliente` (hecho), `ModalGrupo` (hecho),
`ModalMergeClientes` (**hecho el 2026-08-14**), y después `ModalProductoFinal`
si se destraba.

**Con eso la fase 2 se queda sin candidatos abribles.** Lo que sigue es la
**tanda del `?editar=`** —por qué la URL pierde el parámetro— y después la
**tabla de declaraciones**, que es el cierre de la fase.

### LA CARRERA DEL `?editar=`, CONTESTADA Y ARREGLADA

**2026-08-14.** Tanda propia, corrida justo después de `ModalMergeClientes`
porque después de él la fase se queda sin candidatos igual.

#### Quién le sacaba el parámetro

Enganchando `history.pushState` y `replaceState` **antes** de que la página
cargue —única forma de ver las llamadas de arranque, que son las que importan—
apareció uno solo y siempre el mismo: un `replaceState` a `/modulos/productos`
alrededor de un segundo después de cargar. Sale de
[productos/page.jsx:138](../../app/modulos/productos/page.jsx#L138), el efecto que
sincroniza el estado del listado con la URL.

**`buildListingUrl` arma la query desde cero** con los parámetros del listado, así
que cualquier otro —`editar`, `nuevo`— desaparece. Eso está bien en los tres
lugares donde se vuelve al listado a propósito, y está mal en el efecto que
sincroniza solo.

#### Por qué a veces abría: la carrera, medida

El efecto de `editar` pide el producto a la API. El modal abre cuando esa
respuesta llega; se cierra cuando el `replaceState` deja la URL sin el parámetro y
el efecto vuelve a correr por su última rama. **Gana el que llegue último**, y por
eso el resultado cambia entre corridas: siete dieron 4, otras siete dieron 1.

#### Y el disparador es de DESARROLLO, que es la parte que cambia el diagnóstico

El guardia del efecto —un `ref` que saltea el primer render— **no alcanza en modo
estricto**: React monta, desmonta y vuelve a montar, y en la segunda montada el
`ref` ya está en `true`, así que el efecto pasa de largo y pisa la URL.

Comprobado apagando `reactStrictMode` en `next.config.mjs` y volviendo a medir:
**5 de 5 abriendo, y el parámetro sobrevivió las cinco veces.** El cambio se
revirtió enseguida — era el experimento, no el arreglo.

**Consecuencia: en producción hoy esto no pasa**, porque el doble montado es de
desarrollo. Lo que quedaba era una bomba: el mismo pisotón ocurre en producción el
día que cualquiera de las cuatro dependencias de `buildListingUrl` cambie con el
modal abierto.

#### El arreglo, y por qué no fue apagar el modo estricto

Apagarlo habría sido apagar el detector. El arreglo saca el motivo: **el listado
no escribe la URL cuando la URL está en manos del modal** — `if (editarId || nuevo
=== "1") return;`.

**Verificado ejerciendo: 7 de 7**, con el modo estricto puesto, y el parámetro
intacto las siete veces. Y la contraprueba está de antes: la versión sin el
guardia dio 1 de 7 y 4 de 7, o sea que la medición sí atrapa la versión mala.

**Y se comprobó que el efecto sigue haciendo lo suyo**, que es la otra mitad:
escribir en el buscador deja `?q=leche` en la URL, y cerrar el modal devuelve la
URL al listado. Un guardia que apagara el sync rompería los enlaces guardados, que
es justamente para lo que el efecto existe.

#### El relevamiento de las otras pantallas con `?editar=`

Son ocho las que leen el parámetro. **Ninguna otra tiene la carrera**, y el motivo
es distinto según el grupo:

- **`grupos`, `locales`, `operadores`, `roles` y `usuarios`** son inmunes por
  construcción: abren con `useState(Boolean(nuevo || editar))`, o sea en el primer
  render y desde la URL inicial. Aunque algo borrara el parámetro después, el
  estado del modal ya está en `true` y no depende más de él.
- **`clientes`** sí borra el parámetro, pero bien: lo hace **después** de abrir el
  modal y **conservando los demás** —`new URLSearchParams(searchParams)` y
  `delete("editar")`, no una query armada de cero—. Ejercido: **7 de 7**.
- **`proveedores` tiene la misma FORMA que productos** —el modal se dibuja con
  `{editarId && editData && …}`, así que depende de que el parámetro sobreviva—
  **pero no tiene el disparador**: en ese archivo no hay ningún `router.replace`.
  Es la que hay que mirar el día que alguien le agregue un sync de filtros a la
  URL.

**No se arregló ninguna**, porque ninguna está rota por esto.

### `ModalMergeClientes` — LA LISTA DECLARADA, escrita ANTES de tocar

**2026-08-14.** **Todos los números son a 1366x900.**

**Abre 3 de 3**, con el botón "Unificar duplicados" de `/modulos/clientes` — la
regla nueva aplicada antes de escribir una línea de esta lista.

**Lo que hay hoy, medido:** tarjeta **588x210,5**, `display: block`,
`max-height: 810px`, `overflow: auto` — o sea que **scrollea la tarjeta misma**,
igual que le pasaba a `ModalCliente` y al revés de los dos de arriba. **No tiene
div de cuerpo**: los cuatro hijos cuelgan de la tarjeta.

Encabezado 24,5 px con `mb-4`; el `SunmiSeparator` con `mt-21` y `mb-21` propios;
el bloque del cliente principal con `mb-3`; y el pie `flex gap-2 pt-2` de 43 px.
**Separaciones desiguales: 21, 21 y 10,5**, dadas por el margen de cada uno.

1. **La tarjeta deja de scrollear y scrollea el cuerpo.** Hoy el `SunmiCard` se
   lleva todo el scroll, título incluido. Con el kit el encabezado queda fijo.
2. **Aparece un botón "Cerrar" y se va el ✕.** El encabezado pasa de 24,5 a unos
   36 px, como en las dos anteriores.
3. **El velo cambia de tono, y este es el salto más grande de los cuatro.** Hoy es
   `bg-black/80` escrito a mano — el más oscuro de todos los que quedaban.
4. **HAY QUE DECLARAR `maxWidth="max-w-2xl"` o el modal SE ACHICA 84 px.** Su
   tarjeta es 588 y el default del kit es `max-w-xl`, 504. Es la primera de las
   migradas donde olvidarse del `maxWidth` **encoge** en vez de ensanchar.
5. **Va con `altoVa="tarjeta"` y `alto="max-h-[90vh]"`**, porque su tope está
   declarado en la tarjeta —`max-height: 810px` medido— igual que `ModalCliente`.
6. **El ensanche de 7 px de la capa NO se ve a 1366** —588 está muy por debajo del
   ancho disponible— y **sí se vería a 360**, donde el padding de la capa decide.
   Se dice el ancho porque sin él el renglón engaña.
7. **Las separaciones desiguales se conservan.** ~~Se declara
   `espacioCuerpo="mt-4"` —los 14 px del `mb-4` del encabezado—~~ **CORREGIDO
   MIDIENDO: va `espacioCuerpo=""` y con un div que envuelva el cuerpo.** El
   porqué está más abajo, en "dos números de la lista declarada estaban mal". Lo
   que no cambia es que **no se declara gap**: los 21, 21 y 10,5 los ponen los
   márgenes propios de cada bloque, y meter un `gap` los emparejaría a todos, que
   es repintar el interior.
8. **El par Cancelar/Unificar se queda ADENTRO del cuerpo.** Son `flex-1`, mitad
   y mitad; el pie del kit es `justify-end` y los haría chicos y a la derecha.

#### LA TABLA SÍ SE PUEDE VER, Y DECIR QUE NO SE PODÍA FUE UN ERROR DE MÉTODO

**Escrito primero:** que este modal "no dibuja su tabla y por eso esa parte se
migra sin verificar". **Es falso, y se comprobó ejecutando el 2026-08-14.**

La tabla está a **dos pasos** del estado en que se abre, y los dos son uso normal:
escribir en "Buscar cliente principal", elegir uno de los resultados, y escribir
en "Buscar duplicados". Ahí aparece, con **cuatro filas de clientes reales de
`erpazul_dev`**. Ninguna condición fabricada: los dos pasos son GET a
`/api/clientes/buscar`, no se toca la base y no se toca "Unificar".

**Por qué la conclusión anterior estaba mal, que es lo que hay que recordar:**
`resultadosDuplicados` **no son duplicados detectados**. Son los resultados de una
búsqueda cualquiera menos el principal. O sea que la tabla se dibuja con cualquier
par de clientes que compartan letras, y la premisa —"haría falta que existan
clientes duplicados detectables"— salió de leer el nombre de la variable en vez de
leer qué la llena.

**Y es el mismo error que el de `ModalProductoFinal`, en su otra cara.** Ahí se
concluyó "abre" mirando una sola vez; acá se concluyó "no se puede llegar" mirando
un solo estado. Las dos veces la conclusión se sacó del primer estado que la
pantalla mostró. **La regla que queda: un modal con pasos se releva recorriendo
sus pasos, no fotografiando el primero.**

**Y hay una segunda cosa mal, que sobrevivía desde el orden de trabajo.** Este
modal quedó último porque "tiene una tabla adentro y eso ya está resuelto con el
`shrink-0`". **No usa `SunmiTable`**: es un `<table className="w-full text-xs">`
escrito a mano dentro de un `div.max-h-48.overflow-y-auto`, y sus importaciones
son `SunmiCard`, `SunmiButton`, `SunmiInput` y `SunmiSeparator`. El arreglo del
`shrink-0` **no tiene nada que ver con esta pantalla**. Lo que sí hay que mirar es
que ese div con `max-h-48` no se encoja al pasar a ser hijo de una columna flex.

**Consecuencia práctica: no queda nada sin verificar.** Se sacaron las dos
capturas de antes, las dos con `--repeticiones 3` y las dos deterministas: el
modal recién abierto (588x210,5) y el modal con la tabla y sus cuatro filas
(588x454).

#### LO QUE HIZO FALTA AGREGARLE AL ARNÉS: `--pasos`

`--abrir` alcanzaba mientras un modal tuviera un solo estado. Este no. Para poder
fotografiar el estado con la tabla se le agregó a `scripts/medir-desborde.mjs` un
`--pasos` con tres verbos —`escribir`, `tocar` y `esperar`—, y sale del caso que
lo necesitó, no de adivinar los que vengan.

Dos detalles que no se deducen leyendo y por eso están en el comentario del
archivo: `escribir` usa el **setter nativo del prototipo** y después emite el
evento, porque poner `.value` a secas no dispara el `onChange` de React y el paso
parecería darse sin que la pantalla se mueva; y los tres **fallan nombrando el
selector**, por lo mismo que `--abrir` — un paso que no ocurrió deja la foto del
estado anterior, y ese estado es perfectamente determinista.

#### DOS NÚMEROS DE LA LISTA DECLARADA ESTABAN MAL, medidos antes de tocar

**`espacioCuerpo` va vacío, no `"mt-4"`.** La lista decía `mt-4` "para conservar
los 14 px del `mb-4` del encabezado", y **los 14 no son la separación real**:
medida, es **21**. El `mb-4` del encabezado vale 14 px pero **colapsa** contra el
`margin-top` de 21 px del `SunmiSeparator` que le sigue, y en flujo de bloque gana
el más grande. Declarar `mt-4` habría sumado 14 a los 21 del separador y bajado
todo 14 px.

**Y hace falta un div que envuelva el cuerpo, por el mismo motivo.** En una
columna flex los márgenes **no colapsan, se suman**. Medido: el bloque del cliente
principal tiene `mb-3` (10,5 px) y lo sigue el segundo `SunmiSeparator` con
`mt` de 21; hoy colapsan a **21** y sueltos en la columna del kit darían **31,5**.
Con el envoltorio —que como hijo de un contenedor flex establece su propio
contexto de formato— los cuatro a siete hijos siguen en flujo de bloque y sus
márgenes siguen colapsando igual que hoy. **Es el mismo recurso que en
`ModalCliente`**, donde el envoltorio ya existía y se pasó entero como hijo único.

#### LA MIGRACIÓN, VERIFICADA: dos estados, y solo apareció lo declarado

**2026-08-14.** Los dos estados fotografiados con `--repeticiones 3`, los dos
deterministas, los dos a 1366x900 y los dos recortados por
`[data-sunmi-modal="tarjeta"]`.

**Recién abierto:** 588x210,5 → **588x222**. **Con la tabla y sus cuatro filas:**
588x454 → **588x465,5**.

**El ancho no se movió ni un píxel en ninguno de los dos**, que es lo que
comprueba el `max-w-2xl` declarado. Y **el alto creció 11,5 en los dos, que es
exactamente lo que mide el encabezado nuevo**: 24,5 el `<h3>` con el ✕, 36 el del
kit con el botón "Cerrar". No hay ningún otro alto de más escondido en ese
número.

**Las separaciones internas se conservaron una por una**, que es lo que el
envoltorio existía para lograr: **21, 21, 21, 7 y 10,5** antes y después. Sin el
envoltorio la tercera habría dado 31,5.

**La tabla quedó igual**: 542x137,5 sobre un padre de 544, cuatro filas. No se
encogió al pasar a ser hija de una columna flex, que era el único riesgo real
—`SunmiTable` nunca estuvo en juego acá—.

**El scroll se mudó, y se comprobó forzándolo.** A 900 no desborda nada ni antes
ni después, así que el punto se midió con la ventana a **400**, donde el
`max-h-[90vh]` topa la tarjeta en 360:

- **Antes** el único que scrolleaba de verdad era **la tarjeta misma** —452 de
  contenido en 358 de caja—, así que el título se iba con el scroll.
- **Después** el único que scrollea es **el cuerpo del kit** —386 en 280— y el
  encabezado queda fijo.

**Uno solo en los dos casos**, que es la mitad del candado que esta fase se
comprometió a mirar. Es la diferencia 1 de la lista declarada, ejercida y no
supuesta.

**El contador bajó exactamente lo que tenía que bajar.** Modales armados a mano
**38 → 37**, y las otras dos bajas están atribuidas una por una a las cuatro
líneas que se borraron de este archivo: colores fijos **289 → 287** —el
`bg-black/80` de la capa y el `text-slate-` del ✕— y elementos crudos **319 →
318** —el `<button>` del ✕—. Comprobado comparando la ficha del módulo `clientes`
contra la misma ficha con el archivo sin migrar: cuatro hallazgos menos, los
cuatro de este archivo, ninguno de otro lado.

Suite: **3.257 candados, 0 en rojo.** El único que se puso en rojo fue el registro
de `destructivo`, que es lo que tiene que pasar cuando aparece un consumidor
nuevo; se le agregó la entrada con su motivo. **No se aflojó nada.**

#### Y de paso: `SunmiSeparator` tiene un comentario CSS aplicándose como clase

`my-2` sugiere 7 px y el separador mide **21**. El motivo es que su `className` es
un template literal con un comentario adentro —`my-2 /* antes my-4 o my-6 */`—,
así que el atributo termina conteniendo las palabras sueltas, y entre ellas
**`my-4` y `my-6` son clases de Tailwind de verdad**: gana `my-6`, 1,5rem, 21 px.

**No se toca en esta tanda**, porque arreglarlo movería el espaciado de todas las
pantallas que usan el separador y esta tanda migra una capa. Queda anotado como
deuda propia: hoy el número que se ve no es el que está escrito, y cualquiera que
lea `my-2` para calcular un espaciado va a errarle por 14 px.

#### `ModalPedirOperador`: migrable por firma y NO VERIFICABLE

**Decidido el 2026-08-14: se revisa junto con los seis del POS, después de la
fase 4.** Queda escrito acá para que nadie lo tome suelto creyendo que es un
singleton más de la lista de nueve.

Su capa y su tarjeta están perfectamente en condiciones de migrarse. Lo que no se
puede es **verificar** que la pantalla quede idéntica: se dibuja con
`!exento && !operador && huboOperador`, o sea que hace falta que una sesión de
operario haya existido y se caiga a mitad de camino, y el admin con el que se
mide es `exento`. No hay forma de abrirlo sin fabricar la condición.

Es exactamente el caso que el criterio nuevo existe para atajar: firma impecable,
pantalla inalcanzable. Va con los del POS porque comparte el motivo —una
condición de negocio que no se puede montar sin ensuciar datos— y no porque
comparta el módulo.

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

### ⚠️ LA LÍNEA DE BASE DE HUELLAS YA NO ES COMPARABLE

**Anotado el 2026-08-14.** Los conteos de filas de `tests/huellas/baseline` se
tomaron **sobre `erpazul_al`**, y esa base está **7 migraciones atrasada** —90
aplicadas contra las 97 del árbol—, así que hoy no puede servir ni la aplicación
ni una captura sin migrarla antes. La que sirve el dev server es `erpazul_dev`,
que está en 97 de 97.

**Qué se cae y qué no**, que es la parte que importa: un antes y un después
sacados **los dos** contra `erpazul_dev` valen, porque la condición que hace que
la resta sirva es que los dos lados midan lo mismo. Lo que **no** sirve es cruzar
cualquiera de los dos contra el baseline viejo: eso compara dos bases distintas y
va a informar diferencias que no son del cambio.

En la práctica: hasta que el baseline se retome sobre `erpazul_dev`, **no se usa
como término de comparación de nada.** Las comparaciones de esta fase se hacen
antes-contra-después dentro de la misma corrida.

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

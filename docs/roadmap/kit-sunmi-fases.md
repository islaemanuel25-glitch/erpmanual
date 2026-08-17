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

### EL MOTIVO CONCRETO, MEDIDO EL 2026-08-15

Las dos evidencias de arriba son de proceso —un trinquete que no obliga, un
commit que no compilaba—. **Hay una tercera y es de la aplicación**, medida
contra producción y sin sesión:

**No existe `middleware`.** No hay ningún guardia que corra en el servidor antes
de entregar una página. Comprobado: `/inicio` y `/modulos/categorias` devuelven
**200 a cualquiera**, sin cookie.

**Lo que eso NO es**, y hay que decirlo con el mismo cuidado:

- **La cáscara no filtra.** El HTML de `/modulos/categorias` sin sesión son 9.367
  caracteres de esqueleto de React: el título, el script del tema, las
  referencias a los chunks y el árbol de layout vacío, con
  `institucionalInicial: null`. **Leído, no contado por tamaño**: se buscaron seis
  nombres que existen en la base —Arcor, Pepsico, Nutrisur, Minimarket, ayala y
  un código de producto— y los seis dan cero.
- **La API cierra.** Nueve rutas de lectura pedidas sin ninguna credencial
  contestaron **401 "No autenticado"** con la lista vacía: `categorias/listar`,
  `proveedores/listar`, `productos/listar`, `clientes/buscar`,
  `catalogos/proveedores`, `pedidos/opciones` y `usuarios/listar`. Dos más
  —`reportes/ventas`, `turnos/listar`— dieron 404 porque no existen con ese
  nombre. `/api/version` es la única pública y devuelve **solo el buildId**.

**Lo que falta, entonces, es exactamente el guardia de servidor**: hoy cualquier
página que se agregue queda servida a cualquiera, y lo único que la protege es lo
que esa página haga del lado del cliente. Una que no compruebe nada no tiene
segunda barrera. **No es un incendio —no hay datos del otro lado— pero es la
razón concreta por la que esta fase existe.**

**CORRECCIÓN DEL NÚMERO, 2026-08-15: son 270 rutas, no 206.**

El 206 era **otra cosa**: la cantidad de archivos que contestan `"Error interno"`,
contada al cerrar el `INC-0006`. Se arrastró como si fuera el total de rutas
porque las dos cifras nacieron el mismo día y en el mismo párrafo. El total real
sale de `git ls-files "app/api/**/route.js"` y da **270**.

Vale la forma del error más que el número: **dos cifras del mismo módulo escritas
juntas se confunden**, y la que se repite después es la que uno recuerda, no la
que corresponde. Es la tercera vez —ya pasó con los usos de `SunmiCard`, 246 y
233 para el mismo hecho—. Cuando se anota un conteo, va con **qué se contó** al
lado, no solo con el número.

**LO QUE NO SE MIRÓ, y sin esto el párrafo de arriba engaña:**

- **Nueve rutas de 270** bajo `app/api`. Es una muestra, no un censo.
- **Ninguna de escritura.** Solo se probaron lecturas.
- **Sin probar con un rol de menos permisos.** Todo lo de arriba es "sin sesión";
  no se probó nada con una sesión válida y acotada.

### ⚑ PREGUNTA PROPIA, Y ES LA QUE MÁS IMPORTA DE LAS DOS

**¿Un operario puede pedirle a la API algo que su rol no debería ver?**

Es distinta de la de arriba y es peor si la respuesta es que sí, por dos motivos:
**del otro lado hay datos de verdad**, y **quien pregunta tiene una sesión
válida**, así que ninguna de las barreras medidas hoy lo frena — el 401 no aplica
y la cáscara ya la tiene.

Lo que habría que medir: con una sesión de operario, pedir directamente las rutas
que su pantalla no le muestra —costos, reportes de otro local, usuarios, roles— y
ver si contestan con datos o con un 403. **No se probó nada de esto.**

Y hay un antecedente que la hace menos hipotética: el `INC-0006` mostró que una
ruta puede tener el alcance escrito **y aplicarlo mal** —`obtener` de proveedores
acotaba por un campo que no existe— sin que nada avisara durante diecinueve días.

**LO QUE FRENÓ ESTA MEDICIÓN, el 2026-08-15:** en `erpazul_dev` había **un solo
rol —`Admin` con el permiso `*`— y un solo usuario**. Para entrar con una sesión
real de un rol acotado habría que crearlo, y **eso mediría una invención**: el
riesgo depende de qué permisos tenga el rol que usa de verdad la caja, no de los
que a uno le parezcan.

**DESTRABADA EL 2026-08-15, y la respuesta es que SÍ.** Emanuel pasó la
configuración real —`CAJERO` en producción tiene cuatro permisos: los dos de
puntos de clientes y los dos de cuenta corriente, y ninguno más—, se armó ese rol
exacto en la base local y se entró con él.

**`/api/proveedores/listar` le contesta con la lista completa**: nombres,
teléfonos y días de pedido de los proveedores, a un rol que solo tiene permisos de
`clientes.*`. La causa es de una línea —la ruta comprueba sesión y no comprueba
permiso— y está escrita con su medición en
[`INC-0007`](../incidents/INC-0007-proveedores-listar-sin-permiso.md).

**Lo que ese incidente aporta al método, y vale más que el caso:** la primera
corrida dio **200 con la lista vacía**, que se lee igual que un cierre. Lo estaba
protegiendo **el dato y no la autorización** —el usuario de prueba estaba en un
local sin proveedores—. Un 200 vacío no prueba nada hasta saber por qué está
vacío.

**Y esto cambia el peso de la fase.** El párrafo de más arriba dice que el guardia
de servidor "no es un incendio porque no hay datos del otro lado". Eso sigue
siendo cierto **de las páginas sin sesión**. De la API con una sesión válida y
acotada ya no.

### EL CENSO — 147 rutas de lectura pedidas corriendo, 2026-08-15

No era una ruta: **son 19**. Se pidieron las 147 rutas que exportan `GET` con la
cookie del CAJERO, una por una.

- **147 probadas** de las 270 del repo.
- **103 cierran bien**, todas con 403 y nombrando el permiso que falta.
- **19 contestan datos que ese rol no debería ver.**

Lo más grave de las 19 son **dos remitos en PDF con productos, cantidades y
COSTOS** —`transferencias/pdf` y `pdf-recepcion`—, y **las ventas recientes con
total, forma de pago, cliente y vendedor**. El detalle completo, con lo que
entregó cada una y lo que el censo NO cierra, está en el `INC-0007`.

**Ninguna de las 19 chequea permiso en su GET.** Cuatro lo tienen escrito, pero en
el handler de escritura.

**Y la fase 5 ya no alcanza para tapar esto.** Un guardia del lado del servidor
resuelve que las PÁGINAS se sirvan a cualquiera; estas 19 se le contestan a alguien
que tiene sesión válida, así que ningún guardia de sesión las frena. Lo que falta
es un chequeo de PERMISO en el camino de lectura, y eso es trabajo aparte — más
grande que la fase 5 y no lo mismo.

### ARREGLADO EL 2026-08-15 — 117 cierran, y hay candado

**13 de las 19 pasaron a 403**, cada una con el permiso de su módulo sacado del
consumidor real. **El censo volvió a correr entero y es la prueba:** las que
cierran pasaron de **103 a 117**, ninguna que antes cerraba contesta ahora, y el
admin sigue recibiendo 200 en las catorce tocadas.

**Las 6 restantes esperan una decisión y quedaron sin tocar** —las tres del
dashboard, el contador de notificaciones, y `locales/opciones` y `grupos/opciones`,
que ya recortan al local y grupo propios—.

**Y ahora hay trinquete:** `scripts/permisoEnCadaGet.test.mjs` impide que ninguna
ruta exporte un GET sin comprobar permiso, anclado al **handler** —que es lo que
falló— y con contraprueba de seis mutaciones en los dos sentidos. El detalle está
en el [`INC-0007`](../incidents/INC-0007-proveedores-listar-sin-permiso.md).

**Lo que esto NO cierra:** las lecturas que se piden por POST, las 148 rutas de
escritura, y las cinco que contestan 200 vacío porque su tabla no tiene filas.

## ⚑ REDISEÑO DE ROLES — el insumo, dicho por Emanuel el 2026-08-15

**EL TRABAJO REAL DEL CAJERO en un minimercado**, que es contra lo que hay que
diseñar el rol y no contra su nombre:

1. **Cobrar.**
2. **Recibir mercadería**, y anotar si llegó toda la transferencia o si hubo un
   error.
3. **Hacer los pedidos que NO son a depósito** — pollo, pan, y los productos
   creados en su propio local.
4. **Ingresar la factura cuando llega.**

**Una persona por turno tiene esas cuatro responsabilidades**, y el motivo es
operativo y no de organigrama: **el encargado no está siempre.** Quien está en el
mostrador a las nueve de la noche es quien recibe al proveedor de pan.

### EL ROL `CAJERO` DE HOY NO PERMITE NADA DE ESO

Sus seis permisos son `pos.usar`, `clientes.crear` y los cuatro de puntos y
cuenta corriente. Contra la lista de arriba:

- **Cobrar:** sí, `pos.usar`.
- **Recibir mercadería:** no. Eso es `transferencias.recibir`, que no tiene.
- **Hacer pedidos:** no. Es `pedidos.solicitar` / `pedidos.ver`, que no tiene.
- **Ingresar la factura:** no. Es `compras.crear` y `compras.ver`, que no tiene.

**Tres de las cuatro responsabilidades reales están fuera del rol.**

**Y ahí está la explicación del cero.** `CAJERO` tiene **cero usuarios** en
producción, y no es que nadie haga ese trabajo: es que **con ese rol no se puede
hacer**. Quien está en el mostrador entra con `Mini` —que sí tiene
`transferencias.recibir`, `compras.crear` y `compras.ver`— o con `DUEÑO_LOCAL`,
que tiene 44 permisos.

O sea que **el rol acotado existe y no se usa, y el trabajo se hace con roles
anchos.** Ese es el problema a resolver, y es más grande que cerrar rutas: no
alcanza con negar permisos si el rol que queda no deja trabajar.

**Corolario para el censo:** medir `CAJERO` describe un rol que nadie usa. El
riesgo de hoy es `Mini`, con un usuario activo, y `DUEÑO_LOCAL`, con tres. Por eso
el censo se corrió también con `Mini`.

### SEGUNDA ENTRADA: LEER PARA TRABAJAR NO ES LO MISMO QUE VER LA CONFIGURACIÓN

Salió de `config/ticket` y no es un caso suelto: **es una forma que se repite y
que los permisos de hoy no saben expresar.**

Esa ruta la lee la pantalla de configuración —para editarla— y también el POS, en
cada impresión, para saber qué encabezado y qué pie poner. Quedó con
`config_local.ticket` **o** `pos.usar`, y los seis roles reales tienen `pos.usar`,
así que **no le cierra la puerta a nadie.**

**Decidido el 2026-08-15: queda así**, y el motivo es que lo que devuelve son los
datos del ticket, o sea lo que igual se imprime y se le entrega al cliente. No hay
nada que esconder ahí.

**Lo que el caso deja para el rediseño** es la forma: hoy un mismo permiso tiene
que servir para *leer un dato porque lo necesito para trabajar* y para *ver y
cambiar la configuración del negocio*. Son dos cosas distintas y se resuelven de
una de estas maneras, ninguna de las cuales es "otro permiso más":

- partir la ruta en dos —una de lectura mínima para el POS, otra completa para
  configurar—, o
- que el ticket se arme del lado del servidor y el POS no necesite la
  configuración en la mano.

**Los otros dos casos de la misma forma**, medidos en esta tanda, para que se vea
que no es uno solo: `config/pos-ventas-cliente` —el POS la lee para saber si tiene
que exigir cliente y operario antes de cobrar— y `operador/listar` —el selector de
operario del POS—. Las tres terminaron con el mismo par y por la misma razón.

### ⚑ AUTENTICAR PRIMERO, VALIDAR DESPUÉS

**El orden correcto: hasta que no se sabe quién pregunta, la única respuesta es
401.** Validar antes le contesta sobre la forma del pedido a alguien que no tiene
derecho a que le contesten nada — dice qué parámetros espera la ruta, y con eso se
puede mapear una API sin credenciales.

**El caso, medido:** `app/api/pos-ventas/arqueos/listar` contesta
**400 `"turnoId requerido"` sin ninguna sesión**. Con un `turnoId` real contesta
401, así que **no filtra datos** — lo que filtra es la forma del pedido.

**Cuántas más tienen el orden invertido: una, la misma.** Enumeradas las 270 y
mirando dentro de cada handler la posición de la primera respuesta 400 o 422
contra la de la primera llamada a un ayudante de autenticación.

**Y el método tiene un límite que hay que decir, porque ya mintió dos veces
hoy.** No sigue llamadas: una ruta que autentique adentro de un envoltorio propio
se le escapa. El primer conteo marcó **30 handlers** como "contestan 400 y no
autentican", y **es un artefacto**: `grupos/[id]` autentica con un `_guard` local
y `push/suscribir` con `resolverScopeNotif`, ninguno de los dos en la lista de
patrones. Se probaron **las seis de lectura de esas 30 sin credenciales y las seis
contestaron 401**.

Así que el número que vale es **uno**, y sale de ejercerlo, no del grep. **No se
arregló**, por pedido expreso: es una medición.

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

## ⚑ EL CIERRE DE LA FASE 2 — 2026-08-15

La fase arrancó para que los modales del sistema dejaran de tener cada uno su
capa. Cierra acá, y esto es lo que quedó.

### Qué quedó migrado

**22 modales en 19 archivos usan `SunmiModalLayout`.** Los cuatro últimos de esta
vuelta —`ModalCliente`, `ModalGrupo`, `ModalMergeClientes` y
`ModalProductoFinal`— entraron con su lista declarada escrita **antes** de tocar,
con capturas de los dos anchos y con la diferencia de píxeles explicada hasta el
último renglón.

El contador de modales armados a mano bajó de **54 al empezar la fase a 36**.

### Qué quedó afuera, y por qué

- **Los dos bloqueados por datos.** `ModalDetalleVenta` necesita una venta del
  día; el ingreso/retiro de `turnos/[id]` necesita un turno abierto. **No se
  fabricó ninguna de las dos condiciones.** Cuando les toque, o el dato aparece
  solo o Emanuel arma el rato para operar la caja de verdad.
- **`ModalPedirOperador`.** Firma impecable y pantalla inalcanzable: se dibuja con
  `!exento && !operador && huboOperador`, y el admin con el que se mide es
  `exento`. Va con los seis del POS, después de la fase 4.
- **Los seis del POS**, por decisión de negocio tomada al empezar.
- **Los 32 archivos que todavía arman su capa a mano.** Son el trabajo que queda,
  y ahora tienen un motivo más para migrar además de la uniformidad: **el portal
  del kit los cubriría del problema del `backdrop-filter`**, y sueltos siguen
  expuestos.

### Lo que la fase dejó además de las migraciones

Tres arreglos que no eran el objetivo y salieron de mirar de cerca:

- **La capa del kit se monta en el `body`.** `backdrop-filter` creaba bloque
  contenedor y dejaba a `ModalProveedor` 278 px fuera de la ventana a 360.
- **Los tres defaults que nadie elegía.** El `alto` pasó a 90vh con el tope en la
  tarjeta; `espacioCuerpo` y `z` se quedaron **sin default**, con el valor de cada
  pantalla escrito y un candado que lo obliga.
- **Dos subtítulos muertos borrados** —los de `ModalLocal` y `ModalUsuario`, que
  repetían el título—.

Y una regla que sirve para todo el proyecto: **un default que ningún consumidor
elige se saca o se cambia, no se deja.**

### LOS CUATRO SUBTÍTULOS — FRENADOS POR DATOS, con lo decidido escrito

**2026-08-15. Ninguno de los cuatro se puede abrir hoy**, comprobado ejecutando:
`/modulos/proveedores/listas` dice "Todavía no importaste ninguna lista" —así que
`ModalRevertir` y `ModalTerminar` quedan afuera— y no hay ningún comprobante
cargado en los tres pedidos que existen, con el agravante de que **el volumen de
imágenes no está configurado en esta máquina**, así que ni subiendo uno se
destraba sin montar eso primero.

**No se fabricó ninguna condición.** Se destraban el día que haya una lista
importada o un comprobante subido.

**Lo que ya está decidido, para cuando se destrabe:**

- **De `ModalTerminar` se corta la PRIMERA ORACIÓN del subtítulo.** "Se cierra el
  trabajo sobre esta lista" es el título —"Terminar esta importación"— con otras
  palabras, y por ese mismo criterio se borraron los de `ModalLocal` y
  `ModalUsuario`. **Queda solo "No se toca ningún costo"**, que es información
  nueva y además es lo que lo distingue de `ModalRevertir`.
- **Los otros tres se encienden tal cual están.** Ninguno repite su título:
  el de borrar comprobante dice **cuál** comprobante —su `subtitle` es
  `identidad(borrando)`, una función, y lo que produce es `"FACTURA A
  0001-00012345"` o `"Sin número todavía"`, leído por lo que RENDERIZA y no por
  el nombre de la variable—; el de la factura nueva dice **cuándo y con qué**
  contestar; y el de `ModalRevertir` nombra **qué se toca**, los productos y el
  costo.
- **El subtítulo cuesta +31 px de alto**, medido. Como los cuatro están cerrados,
  se midió prestando `ModalCategoria` —que no toca el tope— y pasándole el
  subtítulo más largo de los cuatro: la tarjeta pasa de **253 a 284 px**, igual a
  1366 y a 360, y a 360 el texto envuelve en **dos renglones** sin pisar el botón
  de cerrar. Es el costo de la pieza, no de esas pantallas.

**Lo que queda sin medir:** si alguno de los cuatro toca su tope de alto al
sumarle los 31 px. Sin poder abrirlos no se sabe.

### EL PRIMER PASO DE LA FASE 5

**Los cuatro subtítulos que quedan vivos y no se dibujan.** `PanelComprobantes`
tiene dos, `ModalRevertir` y `ModalTerminar` uno cada uno; los cuatro declaran un
`subtitle` que la pieza **no reenvía a propósito**. Encenderlos es comportamiento
nuevo en cuatro pantallas y merece su propia tanda, con su lista declarada: hay
que ver qué dice cada uno, si aporta algo que el título no diga, y cómo queda el
encabezado con dos renglones.

Es el primer paso porque es chico, está acotado a cuatro pantallas que ya están
migradas, y cierra una deuda que esta fase abrió y no pagó.

**Y detrás de eso, la deuda más vieja: que `Escape` no cierra ningún modal.** El
kit nunca lo implementó. Eso sí es comportamiento nuevo en las 22.

## `Escape` — HECHO el 2026-08-15

**La regla no es nueva: `Escape` sigue la misma que el velo.** Cierra donde el
velo cierra, y no cierra donde la pantalla declara `destructivo`. Ese prop existe
para que un clic afuera no tire un formulario escrito, y **`Escape` es el mismo
accidente por otra tecla**. No se inventó una tercera categoría ni se preguntó
pantalla por pantalla: la declaración ya estaba escrita.

**Los dos números, contados antes de escribir el comportamiento: de los 23
modales —subió de 22 porque `ModalProductoFinal` entró en la tanda anterior—,
**16 declaran `destructivo` y 7 no**. O sea que Escape cierra 7 y no hace nada en
16.

Los 7 que cierran: el "Historial de Ventas" de clientes, `ModalEnviarPedido`, los
dos de `PanelComprobantes`, `ModalPreviewPrecio`, `ModalVerComposicion` y
`ModalCodigosProveedor`.

### Ejercido en las dos direcciones, con captura

- **`ModalCodigosProveedor`**, que NO declara `destructivo`: **cierra**. La
  captura muestra el listado de proveedores sin ninguna capa.
- **`ModalRol`**, que sí lo declara: **no cierra**. La tarjeta sigue ahí después
  de la tecla —504x810, la misma caja de antes— y la captura salió determinista
  con `--repeticiones 3`.

### Dos modales a la vez

**El caso que había que mirar no era del kit.** El detalle de `HistorialDia` son
**dos capas hechas a mano**, una en `z-50` y el detalle en `z-[60]`, así que el
cierre con teclado del kit no las toca — ni antes ni después.

Y como en el sistema **no hay hoy ningún lugar con dos modales del kit abiertos a
la vez**, la garantía habría quedado escrita y sin ejercer. Se armó
`app/andamio-escape` con dos, sin datos de ningún tipo, y **una sola tecla cerró
el de arriba y dejó el de abajo abierto**, comprobado en la captura.

El mecanismo es una **pila a nivel de módulo**: cada modal se anota al abrirse y
solo contesta si es el último. Es una lista y no un contexto de React a propósito
—los modales se montan por portal en el `body`, así que uno anidado no
necesariamente es descendiente del otro en el árbol—.

Y una decisión que conviene tener escrita: **si el de arriba es `destructivo`,
Escape no hace nada y NO se cae al de atrás.** Cerrar el de abajo cuando la
persona quiso cerrar el de arriba es peor que no hacer nada.

### El candado, y la contraprueba que lo corrigió

**La primera versión daba VERDE con el chequeo de `destructivo` sacado**, porque
encontraba la palabra en un comentario tres líneas más arriba. Es la tercera vez
del mismo defecto en este proyecto —un contador que sumaba por un comentario, un
candado anclado a un texto— y esta vez **lo atrapó la contraprueba**. Sin ejercer
la versión mala, el candado habría quedado escrito, en verde y sin afirmar nada.

Corregido: el candado **saca los comentarios antes de mirar**. Y se ancla en los
nombres —`cierraElVelo`, `PILA`, `marca`— y no en un `return (`, que ya se mudó
una vez.

Contraprueba hecha con **cuatro mutaciones, y las cuatro se detectan**: sacar el
chequeo de `destructivo`, sacar el de la pila, sacar el `splice` que la limpia, y
mudar el ancla.

## ⚑ `backdrop-filter` CREA BLOQUE CONTENEDOR PARA LOS `fixed` DESCENDIENTES

**De las que se olvidan y se vuelven a pagar, así que va arriba de todo.**

Un elemento con `backdrop-filter`, `filter`, `transform` o `perspective` distinto
de `none` **deja de ser transparente para sus descendientes `position: fixed`**:
esos hijos pasan a resolver su `inset` contra ese elemento en vez de contra la
pantalla. No hay aviso, no hay error de consola, y el `fixed` sigue diciendo
`fixed` en las herramientas.

**El caso, medido el 2026-08-15:** `SunmiCard` trae `backdrop-blur-sm`. El modal
de `/modulos/proveedores` se dibuja adentro de una, así que a 360x640 su capa
medía **1004 px de alto en vez de 640, arrancando en y=131**, y la tarjeta iba de
346,3 a 918,3 — **278 px fuera de la ventana**. Además quedaba de **273 de ancho
contra los 339** de los modales sanos, porque el 95 % se calculaba sobre la
tarjeta y no sobre la pantalla. En `/modulos/productos` pasaba lo mismo y a 1366
la cortaba 3 px, que es la clase de cosa que no se ve nunca.

**Cómo se reconoce:** un modal descentrado, o más angosto de lo que declara, o que
se sale por abajo solo en pantallas chicas. Y cómo se confirma: se mide la capa
—tiene que dar el alto del viewport en y=0— y se enumeran los ancestros con esas
cuatro propiedades. **Leyendo el JSX no se ve**, porque depende del CSS calculado.

### ✅ DEUDA DEL KIT: `Escape` NO CERRABA NINGÚN MODAL — HECHO el 2026-08-15

**Cerrado en `c69fbe3`**, "feat(kit): Escape cierra el modal, con la misma regla
que el velo". `components/sunmi/SunmiModalLayout.jsx:445` registra el
`addEventListener("keydown")`, y hay candado en
`components/sunmi/SunmiModalLayout.test.mjs`.

**La marca quedó vieja dos días**, y se encontró recién el 2026-08-17 revisando el
archivo entero contra el repo. Es la razón por la que este documento se relee: una
sección que dice "el kit nunca implementó X" manda a rehacer algo terminado.

Lo que sigue es lo que decía cuando era deuda, y se conserva porque explica por
qué se hizo aparte en vez de colarse en la tanda de la capa:

**Apareció midiendo el camino C, y no la causó el camino C.** El kit no
implementaba el cierre con teclado: comprobado antes y después del portal, en
`proveedores` y en `roles`, la tecla no hacía nada.

**No se implementó en esa tanda a propósito.** Es **comportamiento nuevo** y
merece su propia declaración —qué modales lo aceptan, qué pasa con los que
declaran `destructivo`, y si cerrar con Escape tiene que perder lo escrito—, no
colarse adentro de un arreglo de capa donde nadie lo estaba mirando.

### ⚑ Y EL ARREGLO DE `productos` YA NO ES LO QUE RESUELVE EL PROBLEMA

`cc1453e` sacó los dos modales de `productos` de adentro de su `SunmiCard`, y
**queda**: montar un modal afuera de una tarjeta es correcto igual, y esa pantalla
tiene además su propio historial. Pero **con el camino C aplicado ya no hace
falta**: el portal resuelve la causa para todos los que usan el kit, incluido ese.

Se escribe para que nadie crea que hacen falta los dos, ni salga a mover los
demás modales de a uno pensando que eso es lo que arregla.

## EL CAMINO C — EL PORTAL AL `body`, evaluado, medido y APLICADO

**2026-08-15. Evaluado y revertido primero; aplicado después, con las capturas.**

### Aplicado — lo que se midió al aplicarlo

**Capturas a 360, antes y después, de los cuatro que cambian.**

- **`proveedores`**: pasa de **273x572 en (40, 346) —que el arnés se negó a
  fotografiar porque no entra— a 339x553 en (11, 44)**, entrando entera y con el
  ancho correcto. Es el que estaba roto de verdad.
- **`categorias`**, **el de unificar de `clientes`** y **`Nuevo cliente`**:
  **conservan su tamaño exacto** —339x269, 339x222 y 339x576— y **suben entre 5 y
  7 píxeles**. Ese corrimiento es el centrado arreglándose.
- Los tres difieren entre 1,26 % y 2,81 % de píxeles, y mirando las imágenes son
  indistinguibles: lo que cambia es el marco de velo del recorte, porque la
  tarjeta se movió esos pocos píxeles.

**Los diez modales vuelven a dar la capa en 640 px en y=0.** Suite: 3.262, cero en
rojo.

**El candado del landmark se reescribió, no se aflojó**, y su contraprueba está
hecha en los dos sentidos: se pone en rojo si alguien le da un `z` propio al velo,
**y también si alguien muda el ancla** —renombrar `capa` lo deja en rojo con el
mensaje "se movió la declaración de la capa: reanclar este candado, no borrarlo"—.
Esa segunda mitad es la que faltaba antes: el ancla vieja se mudó en silencio.

### La evaluación previa, que es la que decidió

La idea: si la pieza se hace cargo de la capa, le corresponde garantizar que se
resuelva contra la pantalla. Hoy no lo hace, y `proveedores` es la prueba.

### ¿Arregla?

**Sí, los diez de una.** Medida la capa de cada modal a 360, tiene que dar 640 en
y=0: los cuatro que estaban rotos —`proveedores`, `categorias` y los dos de
`clientes`— pasan a sanos, y los seis que ya estaban bien no se mueven. **Sin
tocar el `backdrop-blur` y sin mover ningún modal a mano.**

### ¿Rompe algo? Las cinco cosas que se miraron

Medidas antes y después, a 360:

1. **El foco al abrir:** `body` antes y después. El kit no maneja foco hoy y el
   portal no lo cambia.
2. **Escape:** **no cierra ni antes ni después.** El kit no lo implementa — eso es
   una deuda propia, anterior a esto, y queda anotada acá porque apareció
   midiendo.
3. **Un clic en el centro de la pantalla** cae adentro del modal en los dos casos.
4. **El apilado contra la campana de notificaciones: MEJORA.** Antes, en
   `proveedores`, la campana **quedaba clickeable con el modal abierto** —otra
   consecuencia de la capa mal resuelta, que no llegaba a cubrirla—. Después queda
   tapada, como en los sanos.
5. **El primer render del servidor: no cambia.** Medido apagando el JavaScript, o
   sea viendo el HTML que manda el servidor sin hidratar: **el modal no viene ni
   antes ni después**. Estas pantallas resuelven su contexto en el cliente, así
   que el modal ya era client-only. Y **cero errores o avisos de consola** en las
   dos versiones: no hay problema de hidratación.

### El costo que sí apareció, y cómo se resolvió

**La primera versión rompió cuatro candados de verdad.** Con
`useEffect` + estado para montar el portal, el primer render devuelve `null`, y
`lib/caja/ordenCambioPrevio.test.mjs` **renderiza el modal a HTML** para
verificar su contenido: recibía vacío. No era una falsa alarma.

La variante que funciona es **portar solo si existe `document`**, y dibujar donde
cae si no: `typeof document !== "undefined" ? createPortal(capa, document.body) :
capa`. Con eso el navegador porta y los candados —y cualquier render de
servidor— siguen viendo el HTML de siempre. **Suite: 3.262, 1 en rojo.**

**El único que queda en rojo es de LANDMARK, no de contenido.** El candado "EL
VELO Y EL PANEL NO LLEVAN Z PROPIO" delimita el cuerpo del componente con
`SRC.indexOf("return (")`, y con el portal ese `return (` deja de ser el de la
capa. Es exactamente el caso que este documento ya tiene escrito: **un candado que
lee un archivo y busca un patrón deja de afirmar lo que dice cuando el patrón se
muda.** Si se adopta el camino C, ese candado se reescribe para anclarse a algo
que no se mueva —`const capa = (`— y no se afloja.

### Lo que el camino C NO cubre, y queda escrito así

**Cubre a los modales que usan `SunmiModalLayout` y a los que vengan. No cubre a
los 32 archivos que todavía arman la capa a mano**, que siguen exactamente igual
de expuestos: si alguno se dibuja adentro de un `SunmiCard`, se rompe lo mismo y
el kit no tiene cómo enterarse. Esos se arreglan migrando, que es la fase 2, o de
a uno.

## EL RELEVAMIENTO DEL `backdrop-filter` — medido en el navegador, a 360

**2026-08-15. No se arregló nada en esta pasada, por pedido expreso.**

### Cómo se midió, que es lo que hace que el número valga

**En el navegador y no leyendo el JSX**, porque que un ancestro tenga
`backdrop-filter` depende del CSS CALCULADO: la clase puede venir de la pieza, de
un tema o de una concatenación. Y **a 360x640**, porque a 1366 el caso de
`productos` se cortaba 3 px y nadie lo habría visto nunca.

**Se abrió cada modal y se midió su capa real.** Hubo un primer intento que
medía distinto —inyectar una capa de prueba adentro de cada elemento con
`backdrop-filter`— y **daba 12 pantallas "rotas" de 14**. Ese número era falso:
contestaba "esta página tiene algún elemento que rompería un `fixed` montado
adentro", que no es lo mismo que "el modal de esta pantalla está roto". Medido:
`roles` y `locales` tienen uno de esos elementos y sus modales están perfectos.
**La firma agrupaba mal, y la única forma de saberlo fue abrir un caso de cada
grupo.**

### El resultado, con la capa real de cada modal

De **diez modales medidos**, la capa tiene que dar 640 de alto en y=0:

- **Sanos, capa 640 en y=0 — cinco:** `grupos`, `locales`, `operadores`, `roles`
  y `usuarios`.
- **`productos` también da sano**, porque su arreglo ya está aplicado.
- **Roto y SALE DE LA VENTANA — uno: `proveedores`.** Capa de 1004 en y=131, y la
  tarjeta va de 346,3 a 918,3 sobre una ventana de 640. Además queda de **273 de
  ancho contra los 339 de los sanos**. El botón de cerrar igual queda visible.
- **Rotos pero la tarjeta ENTRA IGUAL — tres:** `categorias` (capa 626 en y=14) y
  los dos de `clientes` (capa 630 en y=11). El desfase es de 10 a 14 px: el modal
  queda apenas descentrado y no se pierde nada.

**O sea que de diez, uno solo está roto de verdad hoy**, y es el mismo
`proveedores` que ya había frenado el bloque 2.

### Lo que NO cubre este relevamiento

El universo son **52 archivos** —32 con capa hecha a mano y 20 que usan el kit,
enumerados con `git grep -l` sobre `app` y `components`—. Se midieron **diez
modales**, que son los que se pueden abrir con los datos de hoy. Los que necesitan
un comprobante subido, una lista importada, un combo, un turno abierto o una venta
del día **siguen sin medir**, y no se fabricó ninguna condición.

### LOS DOS CAMINOS, con lo que cuesta cada uno

**Camino A — mover los modales de a uno**, como ya se hizo en `productos`. Cuesta
una línea por pantalla y **hoy hay un solo caso que lo necesita de verdad**,
`proveedores`. Los tres descentrados podrían quedar como están. El riesgo es el
que el propio relevamiento muestra: **la lista no está completa**, así que puede
aparecer el siguiente el día que alguien abra una pantalla que hoy no se puede
abrir.

**Camino B — sacarle el `backdrop-blur-sm` a `SunmiCard`.** Alcance: **240 usos en
116 archivos, y 62 pantallas**. Se probó sacándolo y volviendo a poner, con
capturas de tres pantallas a 1366:

- `productos` difiere **4,10 %**, `categorias` **1,84 %**, `clientes` **2,00 %**.
- **Pero las dos fotos son indistinguibles a ojo.** La diferencia no está en el
  fondo de las tarjetas: está **en las filas de texto** —las más movidas son la
  paginación de abajo y la fila de encabezados de la tabla—. Es el **antialiasing
  del texto**, que cambia porque `backdrop-filter` fuerza al elemento a su propia
  capa de composición.
- El motivo por el que el desenfoque en sí no se ve: la tarjeta se apoya sobre un
  fondo plano, así que desenfocar lo que está detrás da el mismo color plano.

**En una línea: el camino B no cambia el aspecto de ninguna pantalla, cambia cómo
se dibujan los bordes de las letras en las 62.** Es un cambio medible y no
perceptible — pero es de los que hay que mirar en la Sunmi antes de darlo por
bueno, porque ahí la pantalla es otra.

**Y si se toma el camino B, el arreglo de `productos` queda innecesario.** No
molesta —mover los modales afuera de la tarjeta es correcto igual— pero deja de
ser lo que resuelve el problema. Queda anotado acá para que quien lo lea después
no crea que hacen falta los dos.

### `ModalProductoFinal` — LA LISTA DECLARADA, escrita ANTES de tocar

**2026-08-15.** Quedó destrabado con el arreglo de la carrera de la URL.
**Comprobado primero, con el modo estricto puesto: abre 7 de 7**, y la URL
conserva el parámetro las siete veces. Antes del arreglo daba 4 de 7 y 1 de 7.

**Todo se declara explícito, incluido lo que hoy coincide con el default**, porque
en la misma tanda el default del `alto` cambia y lo declarado no se mueve.

#### Lo que hay hoy, medido

**A 1366x900:** tarjeta **784x727**, `display: block`, padding 21, **sin tope
propio** (`max-height: none`). Encabezado **42,5** con `mb-3`. Cuerpo
`max-h-[70vh] overflow-y-auto px-1` de **630**, que es **exactamente 70vh de 900**:
lo está tocando. Separación única: **10,5**.

**A 360x640** —el ancho real de la Sunmi—: tarjeta **272,64x545**. Encabezado
**42,5** igual. Cuerpo de **448**, que es **70vh de 640**: también tocando.
Separación **10,5**.

**Y hay DOS scrolls anidados, que ya existen hoy**: el cuerpo del modal y, adentro
de `FormProducto`, un `overflow-auto max-h-[70dvh]` con 1365 de contenido. La
migración no los toca, pero conviene saber que están antes de mirar una captura.

#### Lo que se va a ver distinto

1. **El velo cambia de tono.** Hoy es `bg-black/60` escrito a mano; pasa al velo
   del kit, que sale del tema. Se ve en los dos anchos.
2. **El botón "Cerrar" pasa de cyan a slate.** El kit dibuja el suyo y **no
   parametriza el color**. Es la diferencia más visible de esta pantalla y no se
   puede evitar sin tocar el kit.
3. **El encabezado NO pierde la cinta**, porque se declara `encabezado="cinta"`.
   Sin declararlo, el título ámbar en mayúsculas pasaría a texto blanco normal.
4. **Puede moverse la alineación vertical del par título/botón.** El encabezado de
   hoy es `items-center` y el del kit es `items-start`. Los 42,5 px de alto
   deberían quedar, pero el botón podría subir. Se mide después.
5. **Desaparece del DOM el envoltorio vacío cuando está cerrado.** Hoy la capa
   vive siempre y se apaga con `hidden`; el kit no dibuja nada con `open` en
   falso. **No cambia el comportamiento del formulario**: ya se desmontaba hoy por
   el `{open && <FormProducto/>}` que el archivo tiene desde antes. Medido el
   2026-08-14: cerrado, la capa tenía cero inputs adentro.

#### Lo que se declara, y por qué cada uno

- **`maxWidth="max-w-4xl"` y `className="w-[95%]"`.** La tarjeta declara los dos
  hoy. El kit negocia el ancho: al recibir `w-[95%]` retira su `w-full`, así que
  el 95 % se conserva. Sin el `max-w-4xl` el modal se achicaría a `max-w-xl`.
- **`alto="max-h-[70vh]"` y `altoVa="cuerpo"`, los dos explícitos.** Hoy el tope
  vive en el CUERPO y lo está tocando en los dos anchos, así que moverlo a la
  tarjeta cambiaría la pantalla. `altoVa` se escribe aunque hoy sea el default de
  `centrado`, porque en el bloque siguiente ese default pasa a `"tarjeta"`.
- **`z={9999}`**, explícito por lo mismo: hoy es el default del kit y en esta
  misma tanda el default se saca.
- **`destructivo`.** No es solo por el criterio de qué se pierde —que también, es
  un formulario de producto lleno—: **hoy el velo NO cierra**, porque la capa a
  mano no tiene `onClick`. Sin declararlo, el velo del kit pasaría a cerrar y eso
  sería un cambio de comportamiento en el modal más largo del sistema.
- **`espacioCuerpo="mt-3 px-1"`.** El `mt-3` son los 10,5 que hoy pone el `mb-3`
  del encabezado; el `px-1` es el del cuerpo actual. **No se declara gap**: el
  cuerpo tiene un solo hijo y un gap no haría nada.
- **`encabezado="cinta"`**, por el punto 3.

#### PRIMERO HUBO QUE ARREGLAR LA PANTALLA, y no era del modal

Las capturas del "antes" **no se pudieron sacar**: el arnés rechazó las dos
—1366 y 360— porque la tarjeta no entraba entera en la foto. No era el arnés.

Medido: **`SunmiCard` trae `backdrop-blur-sm`**, o sea `backdrop-filter`, y esa
propiedad **crea un bloque contenedor para los descendientes `position: fixed`**.
Los dos modales de la pantalla se dibujaban adentro de esa tarjeta, así que la
capa dejaba de resolverse contra el viewport: medía **1095,5 de alto en vez de
640**, y a 360 la tarjeta quedaba en y=398,8 con el borde de abajo en 943,8 —
**304 px fuera de la pantalla**. A 1366 la cortaba 3 px.

**Migrar al kit no lo habría arreglado**: la capa del kit también es `fixed`, así
que adentro de un `SunmiCard` le pasaría exactamente lo mismo. Se arregló aparte,
sacando los modales de adentro de la tarjeta, y va en su propio commit porque
arregla la pantalla tal como está hoy, sin tocar el kit.

Con eso la tarjeta pasa a entrar entera en los dos anchos y **recupera su ancho
real a 360: de 272,6 a 322**, que es el 95 % de los 339 disponibles que el archivo
declara. Estaba mal por partida doble.

**Lo que NO se relevó:** cuántos otros modales del repo se dibujan adentro de un
`SunmiCard`. Se comprobaron los de `roles` y `locales` y los dos resuelven bien
contra el viewport, así que no es general — pero el universo entero no se miró.

#### La migración, verificada

Los dos anchos con `--repeticiones 3`, los dos deterministas, y **la caja de la
tarjeta no se movió ni un píxel**: 784x727 en (291, 87) a 1366, y 322x545 en
(19, 48) a 360, idénticas antes y después.

Los píxeles que cambiaron son **exactamente los dos declarados**. A 1366 difieren
27.225 de 594.400, y la cuenta cierra sola: el marco de velo de 8 px alrededor de
la tarjeta son 24.432 px y el botón de cerrar unos 2.880 — **27.312 contra 27.225
medidos**. No hay diferencia sobrante en ningún otro lado. A 360, 16.926 de
189.618 con el mismo reparto.

**La cinta ámbar se conservó**, que era el punto 3. **El riesgo del punto 4 —que
`items-start` moviera el botón— no se materializó**: el encabezado mide lo mismo
y la tarjeta no cambió de alto.

Contador: modales armados a mano **37 → 36**, y colores fijos **287 → 286** por el
`bg-black/60` de la capa.

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

## LA TABLA DE DECLARACIONES — el cierre de la fase 2

**2026-08-14.** Es el hito que Emanuel puso antes de la fase 5: mirar todo lo que
se declaró y decidir **qué se unifica y qué tiene razón de ser distinto**. El
compromiso del documento fue siempre que un parámetro es una postergación y no un
perdón; esto es cobrar la postergación.

**Cómo se enumeró, que es parte de la afirmación:** `git grep -l SunmiModalLayout
-- app components`, que recorre el repo entero, sacando la pieza y los candados. Y
se cortó **por cada etiqueta de apertura**, no una por archivo, porque
`clientes/page.jsx` tiene tres modales y `PanelComprobantes.jsx` dos. Da **22
modales en 19 archivos**. El conteo de archivos coincide con la lista del candado
de `destructivo`, que se mantiene aparte y a mano.

### Lo que declara cada uno

- **`espacioCuerpo` — 17 de 22.** El más declarado por lejos.
- **`espacioPie` — 9 de 22.**
- **`maxWidth` — 14 de 22**, con cinco anchos distintos: `max-w-md`, `max-w-lg`,
  `max-w-2xl`, `max-w-3xl` y `sm:max-w-lg`.
- **`destructivo` — 15 de 22.**
- **`alto` — 5 de 22**, con dos valores: `max-h-[90vh]` (cuatro) y
  `max-h-[92vh] sm:max-h-[88vh]` (uno).
- **`z` — 5 de 22**, y los cinco declaran `{50}`.
- **`altoVa` — 4 de 22**, y los cuatro declaran `"tarjeta"`.
- **`encabezado` — 4 de 22**, y los cuatro declaran `"cinta"`.
- **`subtitle` — 6 de 22.**
- **`forma` — 1 de 22** (`hoja-o-centrado`).
- **`paddingTarjeta`, `sombraTarjeta`, `refCuerpo` — 1 cada uno.**
- **`showCloseButton` — 0 de 22.**

### LO QUE LA TABLA MUESTRA, que no se veía migrando de a uno

**1. Hay tres defaults del kit que NADIE quiere, y son los tres más caros.**

- **`alto`.** El default es `max-h-[65vh]` y **ninguno de los 22 lo usa**. Los
  cinco que declaran algo declaran 90 u 88/92. Y ya sabemos que ese default hace
  daño cuando llega alguien nuevo: la migración del carrito quedó a 416 px de alto
  contra 574 justamente por tomarlo (640 × 0,65).
- **`espacioCuerpo`.** El default es `mt-2 gap-3` y **ocho de los diecisiete lo
  declaran VACÍO** —`ModalEnviarPedido`, `ModalVincularCodigo`, `ModalLocal`,
  `ModalOperador`, `ModalRol`, `ModalUsuario`, `ModalCodigosProveedor` y
  `ModalMergeClientes`—, o sea que le piden al kit que no ponga nada. Con
  `espacioPie` pasa lo mismo: siete de los nueve lo declaran vacío.
- **`z`.** El default es `9999` y los cinco que declaran algo declaran `50`.
  Ninguno declara 40 ni 60 desde acá.

**Un default que cero consumidores eligen no es un default: es una trampa para el
próximo.** Los tres son candidatos directos a cambiar, y el criterio para decidir
está a la vista en los números.

**2. Cuatro parámetros nacieron para una pantalla y siguen sirviendo a una.**
`paddingTarjeta`, `sombraTarjeta`, `refCuerpo` y `forma` tienen **un solo
consumidor cada uno**, y los cuatro son de pantallas que hoy funcionan. Eso es lo
que el criterio pedía y no hay nada que unificar: son excepciones reales,
declaradas, con su motivo escrito al lado.

**3. `altoVa` se usó exactamente donde se dijo que iba a usarse.** Cuatro
consumidores, los cuatro `"tarjeta"`, los cuatro de `clientes`. Nadie declaró
`"cuerpo"` ni `"ninguno"`. **Queda una pregunta abierta que la tabla destapa:** si
los únicos que hablan piden todos lo contrario del default de `centrado`, capaz el
default de `centrado` debería ser `"tarjeta"`. **No se cambia sin medir** — habría
que mirar los otros dieciocho centrados forzando el desborde, uno por uno, porque
es precisamente el caso que a 900 de ventana no se ve.

**4. Los seis `subtitle` siguen muertos, y ahora están contados.** La pieza no los
reenvía a propósito —está escrito en su comentario— así que esos seis declaran un
subtítulo que no se dibuja. Dos de ellos, "Configurá los datos del local" y
"Configurá los datos del usuario", **repiten el título**, así que por el criterio
aprobado habría que borrarlos y no encenderlos. Es la decisión que quedó pendiente
y ahora tiene su número: **seis, de los cuales dos se borran y cuatro se
encienden.**

**5. Dos de las cuatro formas no tienen NINGÚN consumidor.** `hoja` y `cajon`
salieron de `CarritoPedido`, y esa migración se escribió, se midió y **se
revirtió**. O sea que hoy están probadas por candado y por andamio, **no por una
pantalla real**. Es exactamente lo que este documento advierte de las piezas
escritas adivinando, con el atenuante de que estas no se adivinaron: se sacaron de
una pantalla que existe y que todavía no las usa.

**6. `showCloseButton` no lo declara nadie.** Es el único de los parámetros viejos
con cero uso. Candidato a sacarse cuando se revise la lista, no antes.

### Lo que NO decide esta tabla

Las 22 son las migradas. **Quedan siete modales sin migrar** —los dos bloqueados
por datos, `ModalProductoFinal`, `ModalPedirOperador` y los del POS— y cualquiera
de ellos puede pedir algo nuevo. La tabla se vuelve a mirar cuando estén, pero las
decisiones de arriba **no dependen de ellos**: un default que hoy nadie elige no
lo va a empezar a elegir el número 23.

**Ninguna de las seis se aplicó en esta tanda.** La tabla es el insumo de la
decisión, y la decisión es de Emanuel.

### ⚑ LA REGLA QUE SALE DE LA TABLA

**UN DEFAULT QUE NINGÚN CONSUMIDOR ELIGE SE SACA O SE CAMBIA, NO SE DEJA.**

No es una preferencia de estilo. Un default existe para que el caso común no haya
que escribirlo; si **cero** de los consumidores lo eligen, dejó de ser el caso
común y pasó a ser **lo que le va a tocar al próximo que no sepa que tiene que
declarar algo**.

*El caso, medido:* el default del `alto` es `max-h-[65vh]` y **ninguno de los 22
modales lo usa**. La migración de `CarritoPedido` lo tomó por no declarar nada y
**la hoja quedó a 416 px de alto contra 574**: 640 × 0,65. La lista quedó cortada
a la mitad del segundo producto. La migración se revirtió, y el default sigue ahí
esperando al siguiente.

Y hay una segunda parte que este caso enseña y que no se ve contando: **el destino
del valor también es un default.** Los cinco que declaran `alto` lo mandan todos a
la TARJETA —cuatro con `altoVa="tarjeta"` y `ModalCambioPrevio` por su forma— y
**ninguno al cuerpo**, que es adonde lo manda el default de `centrado`. Cuando un
default no lo elige nadie, hay que preguntarse si lo que sobra es el valor o el
camino.

### LO QUE PASA SI SE CAMBIA EL DEFAULT DEL `alto` — medido, no razonado

**2026-08-14. El cambio se escribió, se midió y SE REVIRTIÓ.** No está commiteado.

**Un tope solo se nota cuando el contenido lo alcanza**, así que la pregunta no es
cuántos toman el default —son 17— sino cuántos **tienen contenido que lo toca**.
Medido abriendo cada uno con sesión real:

- **A 1366x900** (65vh = 585 px), de los 8 que se pudieron abrir, **tocan el tope
  2**: `ModalLocal` (contenido 643) y `ModalRol` (contenido 2117).
- **A 360x640** (65vh = 416 px), de los 7 medidos, **tocan el tope 4**:
  `ModalGrupo` (450), `ModalLocal` (643), `ModalRol` (2117) y `ModalProveedor`
  (529). En el teléfono es donde un formulario se pasa, y por eso se mide ahí
  también.

**Con `max-h-[90vh]` a secas —el tope sigue yendo al cuerpo— se rompe una
pantalla.** `ModalLocal` pasa de 701 a 759 y deja de scrollear. Y `ModalRol` pasa
de 701 a **926 en una ventana de 900**: la tarjeta arranca en **y = −13**, se corta
12 px arriba y 12 abajo, y **los de arriba no se recuperan scrolleando**, porque la
capa centra y no tiene scroll propio. El encabezado y el botón de cerrar quedan
fuera de la pantalla. Los otros seis quedaron idénticos al dígito.

Es exactamente lo que el comentario de `FORMAS` ya advertía para `hoja`: **90 % del
cuerpo más el encabezado más el pie pasa del 100 %.**

**Con `max-h-[90vh]` Y el tope en la TARJETA para `centrado`, nada sale de la
ventana, pero igual se mueven dos.** `ModalRol` 701 → 810 —entra, y su cuerpo
muestra 694 de 2117 en vez de 585— y `ModalLocal` 701 → 759. El resto, idéntico.

**Conclusión: la comprobación de que no se mueva ninguna NO PUEDE PASAR**, por
ningún camino, porque hay pantallas que hoy tocan ese tope de verdad. Cambiar el
default **es** cambiar esas pantallas. Lo que queda para decidir no es si se
mueven, sino **cuáles y cuánto**, y eso ya está medido acá arriba.

### APLICADO EL 2026-08-15: el alto va a 90vh con el tope en la TARJETA

Se aplicaron **las dos mitades juntas**, porque una sin la otra rompe: 90vh en el
CUERPO dejaba a `ModalRol` en 926 px sobre una ventana de 900, arrancando en
y=−13. El destino también era un default que nadie elegía —los cinco que declaran
`alto` lo mandan a la tarjeta— así que se movió con él.

**Capturas antes y después en los dos anchos, de los cuatro que tocan el tope más
dos controles.** Todo con `--repeticiones 3`:

- **A 1366x900 se mueven dos, y las dos entran.** `ModalLocal` **701 → 759** y
  `ModalRol` **701 → 810 en y=45**, o sea 855 de 900. `ModalGrupo` (583) y
  `ModalProveedor` (666) no se mueven a este ancho porque no tocaban el tope.
- **A 360x640 se mueven cuatro, y las cuatro entran.** `ModalGrupo` 550 → 576,
  `ModalLocal` 532 → 576, `ModalRol` 532 → 576 y `ModalProveedor` 553 → 576. Los
  cuatro quedan en **576, que es 90vh de 640**, arrancando en y=32: **608 de
  640**. Ninguno sale de la ventana.
- **El botón de cerrar queda visible**, comprobado en el más alto —`ModalRol`—:
  54..90 sobre 640.
- **Los dos controles no se movieron ni un píxel en ninguno de los dos anchos**:
  `ModalCategoria` 269 y `ModalOperador` 403, idénticos.

**Los dos candados del default se reescribieron, no se aflojaron**: siguen fijando
un número y un destino exactos, con el motivo del cambio al lado, para que
moverlos otra vez vuelva a costar una medición.

### LOS OTROS DOS DEFAULTS: los dos números de cada camino

**Medido y NO aplicado**, por pedido expreso.

#### `espacioCuerpo` — default `mt-2 gap-3`

- **17 de 22 lo declaran, y 8 de esos lo declaran VACÍO.** Los otros 5 no lo
  declaran: los dos de `PanelComprobantes`, `ModalVerComposicion`, `ModalRevertir`
  y `ModalTerminar`.
- **Cambiar el default a vacío:** se mueven **5 modales**, hay que tocar **0
  archivos**.
- **Sacarle el default y obligar a declararlo:** se mueven **0 modales**, hay que
  escribir **5 declaraciones** nuevas.

**Y hay un dato que inclina la balanza: los cinco afectados NO SE PUEDEN ABRIR
HOY.** Comprobado: en productos no hay ningún combo, así que `ModalVerComposicion`
no tiene de dónde salir; `/modulos/proveedores/listas` dice "Todavía no importaste
ninguna lista", así que `ModalRevertir` y `ModalTerminar` tampoco; y los dos de
`PanelComprobantes` son confirmaciones que necesitan un comprobante subido y una
acción sobre él.

O sea que **el camino de cambiar el default movería cinco pantallas que no se
pueden fotografiar para comprobar que quedaron bien.** El otro camino no mueve
nada y deja las cinco declaraciones escritas, que es lo que este documento viene
pidiendo desde el principio.

#### `z` — default `9999`

- **5 de 22 lo declaran, y los cinco declaran `{50}`.** Los otros 17 toman 9999.
- **Cambiar el default a 50:** cambian de altura de apilado **17 modales**, y hay
  que tocar **0 archivos**.
- **Sacarle el default:** **22 declaraciones obligatorias**, de las cuales 17 son
  nuevas, y **0 modales** cambian.

**Y esto no es cosmético, porque hay cosas por encima de 50 que están FUERA del
modal** —o sea que no las protege el contexto de apilado de la capa—. Inventario
del repo entero: `CampanaNotificaciones` a **9998 y 9999**, el `ColumnManager` de
productos a **9999**, `ModalPedirOperador` a **10000**, `ClientePickerFullscreen` a
80, `HistorialDia` y `SunmiSelectConCrearRapido` a 60.

Con el default en 50, esos 17 modales quedarían **debajo** de la campana de
notificaciones y del gestor de columnas. **Y los cinco que hoy declaran 50 ya están
ahí**: no es un riesgo hipotético, es lo que hay, y conviene mirarlo cuando se
decida.

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

### ⚑ EL CRITERIO DEL PADDING CERO: LA TABLA SÍ, EL FORMULARIO NO

**RESUELTO EN PARTE el 2026-08-15.** Esto cierra la mitad del pendiente de arriba
y deja la otra abierta a propósito.

La regla, que es lo que hay que recordar de toda esta sección:

**Un `p-0` con `overflow-hidden` sobre una TABLA es una intención estructural
declarada. Un `p-0` sobre un FORMULARIO, no.**

En la tabla el cero dice "el contenido va de borde a borde y las esquinas se
recortan" — sin eso la tabla queda flotando adentro de un marco y las filas no
llegan a los bordes. En el formulario el mismo cero no dibuja ninguna tabla:
aprieta el título y los campos contra el marco. Escriben lo mismo y piden cosas
distintas, y por eso no se puede migrar "todos los `p-0`" de un saque.

**El reparto, contado con `git grep` sobre el repo entero y resolviendo las
`const` del mismo archivo:** de los 231 usos de `SunmiCard` en 114 archivos, 147
traen `className` propio y 108 de esos declaran padding. Ocho piden CERO y cien
piden menos aire —49 `p-3`, 30 `p-4`, 9 `p-6`, 3 `p-5` y el resto sueltas—.

De las ocho de cero se migraron **SIETE**, todas tablas. La octava,
`CardDefaultDeposito`, es un formulario y quedó afuera declarando el `p-6` que ya
venía dibujando, con el motivo escrito en el archivo.

**Por qué el predicado es `declaraPaddingCero` y no el del eje entero.**
Negociar el padding completo cambiaría las 108 de una vez, y las 100 del aire son
una decisión de aspecto de toda la aplicación que no es de quien migra. El
predicado del cero aplica la intención estructural sin tomar la decisión
estética. El día que el aire se decida, se reemplaza por
`declaraPaddingX || declaraPaddingY` y el predicado se va.

**Lo que se mide al aplicarlo:** la tarjeta pasa de 21 px por los cuatro lados a
0, y baja 42 px de alto. Medido en la tarjeta real de la pantalla, no en un
elemento inyectado. En cajas se pasan de ver 7 cajas a 12 en la misma altura.

#### Y EL CONTEO DEL AIRE NO ES 100: SON 86 QUE NUNCA SE APLICAN Y 4 A MEDIAS

De las 100 del aire hay que descontar tres grupos antes de decidir nada:

- **9 piden `p-6`**, que es lo que la pieza ya dibuja. Migrarlas no mueve un
  píxel: son ruido del conteo, no trabajo.
- **1 es `!p-3`** y ya gana por el `!`. Lo único que cambiaría es que deja de
  necesitarlo.
- **4 traen variante `lg:`** —tres `p-2 lg:p-3` y un `p-3 lg:p-4`, todas en el
  POS— y **ya se aplican por encima de 1024 px**. Medido con su control en los
  dos sentidos: a 1366 la pantalla gana y dibuja 10.5 y 14 px; a 1000 pierde y
  dibuja los 21 de la pieza. O sea que esas cuatro están **a medias hoy**: el
  mostrador ancho ve una cosa y el angosto otra.

Quedan **86 que no se aplican a ningún ancho**. Ese es el número de la decisión
pendiente, no 100 ni 108.

Las cuatro del `lg:` no se pudieron medir en su pantalla —el POS no se abre desde
la sesión de capturas— así que lo que está medido es la CASCADA, con el elemento
inyectado y su control. Se dice cuál de las dos preguntas se contestó.

#### LA CONTRAPRUEBA ENCONTRÓ DOS CANDADOS MUDOS, Y NINGUNO SE VEÍA LEYENDO

El candado que defiende que el formulario siga afuera quedó VERDE dos veces
seguidas con el `p-0` puesto de vuelta a propósito:

1. **Le pasaba la etiqueta JSX entera al predicado.** Al partir por espacios,
   `className="p-0` no parece un token de padding. El predicado no veía el cero.
2. **Miraba solo la PRIMERA etiqueta del archivo.** Y ese archivo tiene DOS
   `SunmiCard`: la primera es la aclaración que ve un local normal, con `p-3`.
   El candado afirmaba sobre una tarjeta que no era la del caso — verde, sobre el
   archivo correcto y la tarjeta equivocada.

Las dos las encontró romper la pieza a propósito, no releer el candado. Es la
cuarta vez que un candado de texto mira el lugar equivocado y la enésima vez que
la contraprueba es lo único que lo distingue.

#### Y UN CANDADO QUE AFIRMABA DE MÁS, QUE SE ACOTÓ EN VEZ DE AFLOJARSE

"NUNCA DOS PADDINGS" salió rojo en la primera corrida, sobre reportes-ventas:
`p-6 p-3`. **Tenía razón el rojo.** Las 100 del aire salen hoy con dos paddings a
propósito — la pieza pone el suyo, la pantalla el suyo, y gana el de la pieza por
el orden de la hoja. Esa es la deuda que falta pagar, no un defecto de esta
migración.

Afirmarlo sobre las dos listas dejaba dos salidas y las dos malas: aflojar el
candado, o migrar el aire de apuro para ponerlo en verde —que es tomar por error
una decisión ajena—. Se acotó al cero, con el motivo escrito al lado, y se abre a
la otra lista el día que el aire se decida.

### ⚑ EL AIRE SE MIGRÓ: 86 TARJETAS CAMBIAN, Y ESE ES EL ARREGLO

**RESUELTO el 2026-08-16.** Cierra la otra mitad del pendiente del padding, y con
esto el eje queda negociado entero.

**El relleno sale de `paddingQueSobrevive`, que ya existía.** Es la misma función
con la que la tabla negocia el padding de sus celdas, y hace lo que hay que
hacer: el `p-6` de la pieza sobrevive salvo que la pantalla declare LOS DOS ejes.
Una tarjeta que declarara solo `px-2` conserva el vertical, en vez de perder los
cuatro lados por declarar uno. No se escribió un predicado nuevo al lado.

Y para una tarjeta sin `className` la cadena que sale es carácter por carácter la
de antes. **Eso es lo que se exigió a cero píxeles**, porque el resultado
esperado de esta tanda NO era cero: 86 tarjetas se mueven a propósito.

**Los tres controles —categorías, usuarios y proveedores— dieron CERO.** Se
eligieron leyendo el repo, no a ojo: son pantallas donde NINGUNA tarjeta declara
padding, de las 53 que están en esa condición. Y las tres pantallas de aire se
movieron: inicio 6,90 %, clientes 13,08 %, clientes/analytics 26,63 %, y clientes
a 1000 px 18,50 %. El control de ruido previo dio cero en las siete.

**Los números, con la raíz en 14 px:** `p-2` son 7 px, `p-3` son 10.5, `p-4` son
14, `p-5` son 17.5 y `p-6` son 21. Las 49 de `p-3` pasan de 21 a 10.5 y las 30 de
`p-4` de 21 a 14.

**Las cuatro del `lg:` dejan de estar a medias, y acá está el número que importa:**
por encima de 1024 px no cambia nada —ya ganaban—, así que siguen en 10.5 px las
tres de `p-2 lg:p-3` y en 14 px la de `p-3 lg:p-4`. Por DEBAJO de 1024 es donde
se nota: pasan de 21 px a **7 px** las tres primeras y de 21 px a **10.5 px** la
cuarta. O sea que el mostrador angosto era el que estaba viendo el padding que
nadie había pedido.

**Los nueve `p-6` no mueven un píxel.** Antes ganaba el de la pieza, ahora gana el
de la pantalla, y son la misma clase.

**El `!p-3` de `TicketEditor` perdió el `!`, y se midió antes de sacarlo.** `p-3`
solo y `!p-3` solo dan los mismos 10.5 px, y la pieza sin nada da 0 — o sea que
el `p-6` ya no compite y el `!` no tiene contra qué ganar. Las siete capturas con
el `!` y sin el `!` dieron idénticas byte a byte.

Lo que **no** se pudo hacer: fotografiar esa pantalla. Es el editor de ticket del
POS y no hay ninguna caja abierta en la base de desarrollo, ni en el depósito ni
en el otro local. Abrir una es una acción real de la aplicación y estaría
permitida, pero escribiría un turno que se vería en las pantallas de turnos y de
auditoría, y habría contaminado las otras capturas de la tanda. Se dijo en vez de
hacerlo.

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

### ⚑ REGLA DE MEDICIÓN: UNA MEDICIÓN DE CSS SE HACE EN UNA PANTALLA QUE USE ESAS CLASES

**Y con el control de que la clase sola aplica.** Sin eso, un resultado perfecto
puede ser de una pantalla donde la clase ni existe.

*El caso, del 2026-08-15, sondeando `SunmiSelectAdv`.* La pregunta era quién gana
entre el `w-full` de la pieza y el ancho que declara la pantalla. Se midió en
`/login` y dio **600 px en todos los casos, incluido `!w-44`**.

Eso no cerraba: **un `!important` no puede perder**. El control lo explicó — se
inyectó `w-44` a secas, sin nada que compitiera, y **también dio 600**. Si la
clase sola no aplica, es que **no está en la hoja que carga esa página**:
Turbopack en desarrollo parte el CSS por ruta, así que `/login` no trae las
utilidades que solo usan otras pantallas.

Repetida en `/modulos/productos/edicion-rapida`, que sí las usa, los controles
dieron 85, 140 y 154 px por separado y la comparación pasó a significar algo:
tres declaraciones perdían y tres ganaban por el `!`.

**En la práctica:** medir en una ruta que use esas clases, y agregar SIEMPRE la
fila de control —la clase sola, sin competencia—. Si el control no da lo que la
clase declara, la medición no vale y no hay que interpretarla.

### ⚑ LAS TRES SON LA MISMA FAMILIA

Las tres formas de un resultado **perfectamente reproducible y de la pregunta
equivocada**. Conviene leerlas juntas porque el síntoma es siempre el mismo: sale
lo que uno esperaba.

1. **El marcador que ya existía.** `altoVa` dio positivo en la imagen VIEJA, o sea
   en una que no tenía la tanda: el identificador ya vivía en la tabla `FORMAS`.
   Leído rápido decía "mi cambio viajó".
2. **La captura determinista de una pantalla de error.** Tres fotos idénticas
   prueban que no hay ruido; no prueban que la foto sea de lo que uno cree. Una
   página de error es perfectamente determinista.
3. **La medición de CSS en una pantalla sin esas clases**, que es la de acá.

**Lo que las tres necesitan es el mismo par:** además de la medición, un control
que FALLE cuando tiene que fallar. El grep que encuentra algo cuando debe
encontrarlo, el marcador comprobado contra el commit desplegado, la clase sola que
aplica, el texto adversario que desborda. **Un control que no puede fallar no es
un control**, y esta sesión lo pagó cuatro veces.

### ⚑ REGLA DE MEDICIÓN: UNA COMPARACIÓN DE COLOR SE MIDE DONDE LOS VALORES DIFIEREN

**`sunmiDark` es el tema de siempre y es justo el que iguala los dos lados.** Una
medición hecha ahí puede dar "no cambia nada" sobre un cambio que mueve trece
apariencias.

*El caso, del 2026-08-15, migrando `SunmiPanel`.* La pregunta era quién gana entre
el `bg-*` que trae `theme.card` y el `sunmi-surface` que declara la pantalla. Se
midió en `sunmiDark` y el fondo calculado dio `rgb(15,23,42)` **con y sin**
`sunmi-surface`: parecía que no había nada que decidir.

No era que no hubiera pelea: era que **en ese tema los dos valen `#0f172a`**.
`bg-slate-900` es `#0f172a` y `--app-bg` de `sunmiDark` también. La misma medición
en `sunmiLight` —`bg-white` contra `--app-bg: #f1f5f9`— contestó de una: gana
Tailwind, y las 28 declaraciones nunca se aplicaron.

**Contado sobre los 14 temas: en 13 los dos valores DIFIEREN y en 1 coinciden.**
Ese 1 es el de siempre.

**En la práctica:** antes de medir un color, comprobar que en ese tema los dos
lados valgan distinto. Si valen igual, la medición no distingue y hay que cambiar
de tema — no sirve repetirla. Y el candado se escribe con **los dos**: uno que los
iguale y otro que los diferencie, así se ve si el candado distingue o si está
midiendo un empate.

Vale para cualquier par que se compare, no solo para fondos: es la misma forma que
el `altoVa` que dio positivo en la imagen vieja. **Un control que no puede fallar
no es un control.**

### ⚑ LAS NOTAS DE ESTE DOCUMENTO SE QUEDAN VIEJAS — EJERCER LA PREMISA PRIMERO

**Dos veces en dos días se empezó a trabajar sobre una nota que ya no era cierta.
Las dos veces el trabajo era arreglar algo que ya estaba arreglado.**

1. **`w-[137px]`.** Estaba anotado que el contador de hardcodeo no lo veía como
   medida mágica. Ejercido: **lo ve, y lo vio siempre** — `git log -S` sobre el
   regex muestra que no se tocó desde que se escribió el contador. El agujero
   real era otro y más grande: las otras familias de longitud y las unidades
   relativas, 46 medidas que no se contaban.
2. **`title` y `type` de `SunmiButtonIcon`.** Estaba anotado que la pieza no los
   aceptaba. Renderizada: **los dos llegan al `<button>`**, junto con
   `aria-label`, `disabled` y el `className`. Los recoge el `...resto` que entró
   en `95ac86e`, y `type="button"` está escrito ANTES del spread, así que un
   consumidor puede reemplazarlo.

**La forma es siempre la misma:** la nota se escribió cuando era verdad, alguien
lo arregló en otra tanda, y la nota se quedó. Nadie la actualizó porque nadie
volvió a mirarla hasta el día en que la usó para planificar.

**En la práctica, y no es opcional: antes de trabajar sobre una nota de este
documento, EJERCER LA PREMISA.** Es un minuto —un `git log -S`, un render, una
corrida del script— contra media tanda escribiendo lo que ya estaba escrito. Y lo
peor no es el tiempo: es que el informe habría dicho "arreglado" sobre algo que no
se tocó, y el que lo lea después no tiene cómo saberlo.

Vale también al revés: si al ejercerla la premisa resulta cierta, se sigue
tranquilo. Lo que no se puede es no preguntar.

### ⚑ `SunmiButtonIcon` — FRENADO EN LOS COLORES, medido el 2026-08-15

**No se migró, y el motivo es una medición.** Los tres colores fijos pasarían a
token, y eso **cambia el aspecto en casi todos los temas**. Medido en el navegador
sobre seis apariencias, con el control puesto: **hoy los tres se ven idénticos en
las seis** —ámbar `rgb(252,211,77)`, rojo `rgb(248,113,113)`, gris
`rgb(148,163,184)`—, así que la comparación mide lo que dice medir.

**DECIDIDO por Emanuel: el ámbar y el rojo NO se migran.** Y los dos motivos son
distintos, así que van separados:

- **El ámbar no ata nada al tema.** `sunmi-text-warning` es
  `var(--pos-warning, #f59e0b)` y **`--pos-warning` no está definida en ninguno de
  los 14 temas** — cae siempre al respaldo. Migrarlo cambiaría el color de
  `#fcd34d` a `#f59e0b` en los catorce por igual y seguiría igual de fijo que
  antes. Es cambiar un color a cambio de nada.
- **El rojo es el token equivocado.** `--pos-danger` está pensado para FONDO de
  botón —`sunmi-btn-red` lo usa como `background` con el texto en `--app-bg`—, no
  como color de texto sobre fondo oscuro. Contado sobre los 14: **4 temas
  conservan `#f87171` y 10 pasan a `#dc2626` o `#ef4444`**, que sobre los fondos
  oscuros de `operixNight` o `verdeComercio` contrasta MENOS que hoy.

**El gris queda esperando decisión.** `sunmi-text-muted` es el 60 % de `--app-fg`,
y `--app-fg` tiene **12 valores distintos** entre los 14 temas: en los temas
claros el ícono pasaría de un gris medio a uno muy oscuro. Probablemente sea una
mejora —hoy un `slate-400` sobre fondo claro tiene poco contraste— pero es visible
en las seis pantallas que usan la pieza.

**Y hay una razón de fondo para no migrarla igual:** de los 17 usos, **ninguno le
pasa `className`**. La negociación por eje no tendría un solo caso real que la
ejerza, y escribir una pieza para casos imaginarios es justo lo que la regla de
oro prohíbe.

### ⚑ TANDA DE PALETA — definir `--pos-warning` en los 14 temas

**Decide Emanuel. No es una migración del kit: es una decisión de paleta.**

Hoy `--pos-warning` no existe en ningún tema, así que **todo lo que dice "aviso"
en la aplicación es el mismo naranja fijo `#f59e0b` en las catorce apariencias**,
por el respaldo de `var()`. Eso incluye `sunmi-text-warning`,
`sunmi-state-warning` y los `style={{ color: "var(--pos-warning, #f59e0b)" }}`
escritos a mano en las pantallas de compras.

Mientras no se defina, cualquier migración a ese token es decorativa. Y está el
caso ya anotado del **ámbar de aviso contra el acento en el tema naranja**, que es
la misma pregunta desde el otro lado.

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

## ⚑ EL COMANDO DE CONSULTA DEL TRINQUETE SELLABA LA BASE — arreglado el 2026-08-17

**No es una deuda: es el trinquete pudiendo aflojarse solo.** Va arriba de todo
porque afecta al mecanismo con el que se mide toda esta fase.

`node scripts/hardcodeo.mjs --linea-base` **escribía** el archivo. Era el comando
con nombre de sustantivo, el que uno tipea para MIRAR los siete contadores, y de
paso sellaba la base en lo que hubiera en ese momento.

Se corrió así, distraídamente, cerrando el despliegue de `00fcaf0`: hacía falta
leer los números para un informe. Los siete estaban idénticos, así que lo único
que se movió fueron la fecha y el commit del encabezado, y se revirtió en el acto.

**Pero el daño posible no es el que ocurrió.** Si alguno de los siete hubiera
subido, ese mismo comando lo habría fijado como base nueva sin que nadie lo
decidiera, y a partir de ahí el trinquete habría contestado "sin cambios" para
siempre sobre un terreno recién perdido. Y no queda rastro: el archivo sellado de
más se ve exactamente igual de bien formado que uno sellado a propósito.

**Un trinquete cuyo comando de consulta sella la base deja de ser un trinquete el
día que alguien lo corre distraído.** Es la misma forma que el `.env.bak` que
llenaba el árbol del VPS y dejaba el `git status --porcelain` siempre con ruido:
nadie apaga el control a propósito, se apaga solo por el camino de uso normal.

**El arreglo.** Ahora son dos cosas: `--linea-base` MIRA —imprime lo del archivo
y lo del escaneo de hoy en dos columnas, con el delta— y `--linea-base --sellar`
ESCRIBE. **El nombre viejo quedó siendo el seguro a propósito**, porque es el que
invocan la memoria muscular, el mensaje del trinquete y el del hook; para lo otro
hay que escribir una palabra que antes no existía, y queda en el historial de la
terminal.

**El candado es `scripts/hardcodeoNoSella.test.mjs`, y ejerce el caso que
importa**, que no es el que pasó: deja la línea de base con los números POR
DEBAJO de los de hoy —o sea en estado "subió", que es cuando un sellado
accidental hace daño— y comprueba que el modo de consulta la deje byte a byte
igual. Con sus dos mitades: que con `--sellar` sí escriba —si no, "no escribe" no
se distingue de un script roto— y que el modo de consulta ADEMÁS informe la
subida, porque no escribir también lo hace un script que no mira nada.

Contraprueba corrida: devolviéndole al script el comportamiento viejo, el candado
se pone rojo nombrando el defecto; restaurado, los seis casos en verde.

Dos cosas que aparecieron escribiéndolo y no leyéndolo. **El script se ejecutaba
al importarlo**, así que el candado se mataba solo al cargar la función que venía
a probar — ahora tiene guardia de ejecución directa. Y la ruta de la línea de
base se puede sobreescribir con `HARDCODEO_LINEA_BASE`, que es la costura que
permite ejercer todo esto sin ensuciar el archivo real: un test que rompe el repo
cuando falla es peor que el defecto que cuida.

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
- **16 componentes del kit concatenan el `className` en vez de negociarlo**, y por
  eso un ancho escrito en la pantalla no se aplica. `SunmiTable` ya está hecho en
  `db47914` —el primero—, así que **la fase 4 no lo rehace**. Ninguna pieza nueva
  nace con ese defecto; `lib/sunmi/claseAncho.js` y `lib/sunmi/claseNegociada.js`
  tienen la forma.

  **El número decía 15 y son 16**, contado el 2026-08-15 buscando la firma de la
  concatenación en los `components/sunmi/*.jsx`. No cambia el plan; se corrige
  para que el que reste no se lleve una sorpresa.

### EL ORDEN DE LA FASE 4, POR COSTO DE VERIFICACIÓN

**Dos filtros antes del costo, y los dos son eliminatorios:**

1. **¿Algún consumidor le pasa `className`?** Si no, la negociación no tiene un
   caso real que la ejerza. `SunmiButtonIcon` tiene 17 usos y **ninguno** le pasa
   nada; `SunmiRow`, `SunmiBackButton`, `SunmiPageSizer` y las cinco sin usos,
   tampoco. Esas nueve no se tocan todavía.
2. **¿La pieza tiene colores fijos adentro?** Entonces arrastra la decisión de
   paleta, que es de Emanuel. `SunmiSeparator` —`bg-slate-700`, `text-slate-400`—
   queda ahí junto con `SunmiButtonIcon`.

**Quedan cinco, y el costo es CUÁNTAS PANTALLAS HAY QUE MIRAR, no cuántos usos
tiene:**

| pieza | usos | pasan className | archivos | estado |
|---|---|---|---|---|
| `SunmiPanel` | 29 | **29** | **8** | HECHO 2026-08-15 |
| `SunmiTableRow` | 40 | 5 | 29 | HECHO |
| `SunmiSelectAdv` | 106 | 39 | 51 | HECHO 2026-08-15 |
| `SunmiCard` | 231 | 147 | 114 | HECHO |
| `SunmiButton` | 494 | 248 | 150 | **FALTA — es el único** |

**El más barato es `SunmiPanel`**, y no por poco: ocho archivos contra
veintinueve del siguiente, y **los 29 usos le pasan `className`**, así que cada
pantalla que se abra ejerce la negociación en vez de solo comprobar que no se
movió nada. **HECHO el 2026-08-15**, y fue el primero de los cinco.

### DÓNDE ESTÁ LA FASE 4 — 2026-08-17: queda UNO

**Cuatro de los cinco ya negocian. El único que falta es `SunmiButton`.**

Y el kit entero va por nueve piezas negociando: `SunmiCard`, `SunmiInput`,
`SunmiModalLayout`, `SunmiPanel`, `SunmiPar`, `SunmiSelectAdv`, `SunmiSeparator`,
`SunmiTable` y `SunmiTableRow`. Siete por `lib/sunmi/claseNegociada.js` y tres por
`lib/sunmi/claseAncho.js`; `SunmiModalLayout` usa las dos.

**`SunmiSeparator` salió del grupo apartado y se hizo.** Lo había parado el
segundo filtro eliminatorio —tiene `bg-slate-700` y `text-slate-400` adentro, o
sea arrastra la decisión de paleta— y se migró igual el 2026-08-16, porque el eje
que se negoció es el MARGEN VERTICAL y ese no toca ningún color. La decisión de
paleta sigue pendiente y sigue siendo de Emanuel; lo que el caso muestra es que
**el filtro es por EJE y no por pieza**: una pieza con colores fijos puede
negociar un eje que no sea el color.

#### CÓMO SE COMPROBÓ, Y POR QUÉ NO POR LAS MARCAS DE HECHO

**Por los imports, uno por uno:** para cada `components/sunmi/*.jsx` enumerado con
`git ls-files`, si importa `claseNegociada` o `claseAncho`. Una pieza que negocia
no puede no importar una de las dos, así que la señal es positiva y no una
ausencia.

**No por las marcas de HECHO de esta misma tabla, y ese es el punto: estaban
viejas para dos de los cuatro.** `SunmiTableRow` y `SunmiCard` figuraban sin
marcar y ya negociaban. Leyendo la tabla, la fase parecía tener tres pendientes
en vez de uno, y el más barato de esos tres habría sido trabajo ya hecho.

Es la sexta vez en esta fase que una firma escrita dice una cosa y abrir los
archivos dice otra —después de los cuatro rasgos que daban 12 grupos donde había
23, del balde de superficie propia que necesitó cinco pasadas, de los seis
modales descartados por el nombre y del conteo de "pasan className" que hubo que
rehacer dos veces—. **La regla que sale de todas: una marca de estado escrita a
mano es un recuerdo, no una medición.** Antes de planificar sobre ella, se
verifica con algo que el código tenga que tener sí o sí.

### LA PREGUNTA DE `SunmiPanel` NO SE REPITE EN `SunmiTableRow`

**Se sondeó antes de empezarlo, para no contestarla una vez por pieza. La
respuesta es que NO: sus declaraciones no son inertes.** Son otra cosa.

Las cinco, leídas del primer nivel de la etiqueta:

- `"cursor-pointer hover:bg-[var(--table-row-hover)]"`, dos veces, y
  `"cursor-pointer"`, una. **Son DUPLICADOS de lo que la pieza ya emite**: pone
  `cursor-pointer` cuando hay `onClick` y ese mismo `hover:bg-…` cuando no hay
  tono ni selección. Piden lo mismo con el mismo valor, así que gane quien gane
  se ve igual. Sobran, no fallan.
- `"transition-colors"` — un eje que la pieza no toca. No hay pelea.
- `getRowClassName(row.id)` es dinámico y devuelve
  `"border-l-2 border-l-[var(--pos-accent)]"` o vacío. **Tampoco pelea**: la pieza
  no pone borde izquierdo.

**Así que `SunmiTableRow` es una migración distinta y más barata de decidir**: no
hay que resolver qué se ve, solo dejar de concatenar. Lo caro sigue siendo
verificarla, 29 archivos.

**Y la lección general**: "concatena" no implica "hay una pelea". `SunmiPanel`
tenía 28 declaraciones perdiendo la cascada; `SunmiTableRow` tiene cinco que
piden lo mismo o piden otra cosa. **Antes de cada pieza se mira qué ejes chocan
DE VERDAD**, que es una sonda de media hora y evita migrar a ciegas.

**`SunmiTableRow` engaña**: tiene menos declaraciones que `SunmiPanel` pero está
repartido en 29 archivos, así que verificarlo cuesta casi cuatro veces más.

**Y el conteo de "pasan className" hubo que rehacerlo dos veces**, que es lo que
conviene recordar del método. La primera versión cortaba la etiqueta en el primer
`>` y contaba los `className` de los props con JSX anidado. La segunda reusó
`etiquetasDeApertura` del contador —que sí acota bien la apertura— y seguía
contando de más, porque el `className` de un `<div>` adentro de un prop sigue
estando dentro de la etiqueta. **Lo que hay que mirar son los atributos de PRIMER
NIVEL**, contando llaves. Con el número malo, `SunmiRow` figuraba con un consumidor
que le pasa `className` y **no le pasa ninguno**: estuvo a punto de ser elegido
como la migración más barata.

### Y HUBO UNA TERCERA VUELTA, QUE ES LA QUE FALTABA: LAS VARIABLES

**2026-08-15, migrando `SunmiCard`.** Acotar la etiqueta al primer nivel arregla
*dónde* se lee el `className`. No arregla *qué dice*.

Cuando una pantalla escribe `className={cardClass}`, el token que se lee es la
palabra `cardClass`, que no es de ninguna familia de Tailwind — así que el conteo
la da por inocente. Y `cardClass` vale, tres líneas más arriba del mismo archivo,
`p-4 border border-current/[0.06] shadow-sm`: borde Y sombra.

El primer conteo de `SunmiCard` dijo **seis declaraciones en tres pantallas**. El
verdadero es **once usos en ocho archivos**. Los dos que faltaban son
`ActividadReciente` y `UltimasVentas`, o sea el tablero entero y `/inicio`.

**Y `UltimasVentas` se escapó una segunda vez, por otro motivo:** su `className`
es un ternario con `${CARD_BASE}` adentro, y el lector de llaves cerraba en la
primera `}` que encontraba —la del `${`— en vez de contarlas. Dos agujeros
distintos en el mismo conteo.

**Lo que lo encontró no fue releer nada.** Fue que `/inicio`, que estaba puesta
como CONTROL y tenía que dar cero píxeles, se moviera 5.308. Es la misma familia
que ya viene mordiendo toda la fase: un resultado perfectamente reproducible **de
la pregunta equivocada**. Tres corridas idénticas prueban que no hay ruido; no
prueban que se esté midiendo lo que uno cree.

En la práctica, para el próximo conteo de consumidores:

1. Atributos de **primer nivel**, contando llaves.
2. Al cerrar un valor `{…}`, **contar las llaves**, que `${}` anida.
3. **Resolver las `const X = "…"` del mismo archivo** antes de clasificar, e
   informar aparte cuántos quedaron sin resolver — un ternario o una función no
   se adivinan, y decir cuántos son es parte de la afirmación.
4. Y poner **controles que puedan fallar**. Ninguno de los tres pasos de arriba
   se le ocurrió a nadie leyendo: los tres salieron de que un control se moviera.

### ⚑ `SunmiButton` — EL BOTÓN VA AL REVÉS QUE LA TARJETA, medido el 2026-08-16

**Relevado, no migrado.** 494 usos en 150 archivos —contados por etiqueta de
apertura con nombre exacto; `git grep -o "<SunmiButton"` da 511 en 152 porque
`<SunmiButtonIcon` empieza igual y son 17 usos de otra pieza—. De esos, 248
traen `className` propio, y ahí hay **388 declaraciones que pelean con un eje que
la pieza declara**.

**Por qué es al revés que `SunmiCard`.** La tarjeta peleaba utilidad de Tailwind
contra utilidad de Tailwind, y el orden de la hoja favorecía a la pieza. El botón
pone clases PROPIAS —`.sunmi-btn-base`, `.sunmi-btn-<color>`, especificidad
0-1-0— y `styles/sunmi.css` se importa ANTES de `@tailwind utilities`. A igual
especificidad gana la última, o sea la utilidad de la pantalla. **Acá la pantalla
gana casi siempre.**

El reparto medido, con dos controles por forma —que la clase esté en la hoja,
preguntado a `document.styleSheets` y no deducido, y que la clase sola dé
distinto de la pieza sola—:

- **1 pierde**, y no por la cascada. Ver abajo.
- **327 ganan por el orden de la hoja.**
- **0 ganan por `!important`.**
- **60 son redundantes**: piden exactamente lo que la pieza ya pone. Entre ellas
  17 `items-center` y 16 `inline-flex`, que es literalmente lo que
  `.sunmi-btn-base` declara, y 15 `!py-1`, que son los mismos 3,5 px.

**De ahí sale que 151 declaraciones llevan `!` sin necesitarlo.** Ninguna de las
388 lo necesita para ganar.

**La que pierde es `h-8` en `components/productos/ColumnManager.jsx:37`**, y el
motivo no es el orden: `h-8` pone `height: 28px` y la pieza pone
`min-height: 36px`. El mínimo le gana al alto por regla de layout, no por
cascada — ponerle `!` no lo arreglaría. El botón quiere ser un cuadrado de 28 y
mide 36 de alto.

#### DE DÓNDE SALE EL `min-height: 36`, buscado en la historia y no supuesto

**No está documentado como mínimo táctil.** Entró como `height: 36px` en el
commit `671e616` —"feat: mejoras POS + sidebar overflow fix + redondeo precios",
2026-03-02—, dentro de la creación de `.sunmi-btn-base` y sin ninguna
justificación al lado. Lo único escrito sobre ese número es el comentario de
`becb1ef`, que explica el cambio de alto FIJO a mínimo, y su motivo es el
desborde del contenido, no que se pueda tocar con el dedo.

**Y el repo sí tiene un criterio táctil escrito, pero es 44 y no 36**, y vive en
la navegación: `min-h-[44px]` en `Header`, `MobileNav`, `TopbarNav` y
`SidebarMobile`. Ninguna pieza del kit de botones lo usa.

O sea que las dos mitades de la pregunta se contestan así: el 36 **funciona**
como piso tocable, pero **no fue puesto por eso** y no hay decisión escrita
detrás. Y el 28 del `h-8` queda por debajo tanto del 36 del botón como del 44 que
el propio repo usa donde sí decidió pensar en el dedo.

#### ⚑ EL KIT DE BOTONES NO USA EL MÍNIMO TÁCTIL QUE EL PROPIO REPO ELIGIÓ

**Anotado el 2026-08-16. NO se arregló: queda escrito para decidirlo aparte.**

Es más grande que el caso del `h-8`. El repo tiene **dos** números para "lo
mínimo que se puede tocar" y no coinciden:

- **44 px** en la navegación —`min-h-[44px]` en `Header`, `MobileNav`,
  `TopbarNav` y `SidebarMobile`—. Ahí alguien decidió pensando en el dedo.
- **36 px** en `.sunmi-btn-base`, o sea en **todos los botones del sistema**. Y
  ese 36 no se decidió por el dedo: entró como `height: 36px` dentro de la
  creación de la clase, sin justificación, y lo único escrito sobre él explica
  otra cosa —por qué pasó de alto fijo a mínimo, que fue el desborde—.

O sea que la pieza que más se toca en la aplicación —el botón, 494 usos— usa un
piso 8 px más chico que el que el repo eligió donde sí lo pensó. En la Sunmi del
mostrador eso se nota.

**Lo que hay que decidir, y no es un retoque:** subir `.sunmi-btn-base` a 44
mueve la altura de todos los botones y con eso el alto de cada barra, cada modal
y cada fila que los contenga. Es una tanda con capturas, no una línea. Y la
alternativa —dejar 36 y escribir POR QUÉ— también es una decisión, pero al menos
deja de ser un número sin dueño.

#### ⚑ `ModalCierreTurno` ES CÓDIGO HUÉRFANO, Y ESO NO ES UN DESCUIDO

**Encontrado el 2026-08-16 verificando un despliegue. NO se tocó.**

Nadie lo importa. `git grep` de `import ModalCierreTurno` sobre `app/`,
`components/` y `lib/` devuelve **una sola línea, y es un candado que prohíbe
importarlo**. Las otras dos menciones del nombre en el repo están adentro de
comentarios.

Los dos candados que lo sostienen están en `lib/caja/cierrePantallaRender.test.mjs`:

- **La 29, "el botón del POS ya NO abre el modal clásico"**, afirma que
  `app/modulos/pos-ventas/page.jsx` no tiene `<ModalCierreTurno`, no lo importa,
  y que en su lugar llama a `abrirCierre(turnoActual.id)`.
- **La 30, "el cierre clásico sigue existiendo pero rechaza un turno con corte"**,
  dice textualmente *"No se borra todavía: queda como vía administrativa
  acotada"*, y comprueba que el archivo del modal siga teniendo contenido.

O sea que el cierre se migró a las páginas de `/modulos/pos-ventas/cierres/…` y
esto quedó como resto **a propósito**, junto con su ruta
`/api/pos-ventas/turnos/cerrar`.

**Qué habría que comprobar el día que se decida, y son dos decisiones distintas:**

*Si se BORRA:* que la ruta `/api/pos-ventas/turnos/cerrar` no la llame nadie más
—hoy la nombran `arqueos/registrar`, `turnos/resumen` y la página del POS, y hay
que mirar si la llaman o solo la mencionan—; que la "vía administrativa acotada"
de la prueba 30 no se esté usando desde afuera de la aplicación; y reescribir las
dos pruebas, porque la 30 se pone roja sola al borrar el archivo. La 29 en cambio
sigue verde, que es la trampa: prohíbe importarlo, y un archivo borrado tampoco
se importa.

*Si se REVIVE:* que la prueba 29 se ponga roja es lo que tiene que pasar, y hay
que entender por qué se sacó antes de volver a ponerlo — la 30 dice que el cierre
clásico **rechaza un turno con corte**, así que revivirlo sin eso reabre el caso
que motivó la migración.

**Y la marca de que estaba muerto no la dio leer el código: la dio el build.**
Ninguna cadena de ese archivo llega a la imagen. Eso vale como método: un archivo
puede estar en el repo, compilar, pasar los candados y no existir en el build,
simplemente porque nadie lo importa.

#### ⚠️ LOS 151 `!` DEL BOTÓN SON 151 EN EL REPO Y 135 EN LA PANTALLA

Los dos números son correctos y hay que escribir los dos, porque el día que
alguien recuente le va a dar distinto y no va a saber por qué.

**151** es lo que se sacó del repo. **16 de esos salieron de
`ModalCierreTurno`**, que nadie importa, así que no se ven en ninguna pantalla.
**135** es lo que efectivamente cambió de código servido.

No rompe nada —sacarle un `!` a código muerto es inocuo— pero el conteo de "lo
que se ve" no es el mismo que el de "lo que hay". Cualquier medición de este tipo
sobre el kit tiene el mismo agujero: el censo cuenta usos en el REPO, y el repo
tiene archivos que no se renderizan.

#### ⚠️ EL 388 ES UN PISO, NO UN TOTAL — dos límites del censo

Los dos son del extractor y los dos hacen que el número salga corto:

1. **Siete usos tienen algo en el `className` que no se puede resolver leyendo**
   —una variable o una llamada—. Sus declaraciones no se cuentan. Es el mismo
   agujero que con `SunmiCard` dio un conteo falso hasta que `/inicio`, puesta
   como control, se movió: ahí el `className` era `{cardClass}` y la constante
   valía tres declaraciones.
2. **El extractor deja la comilla pegada cuando el `className` es un ternario con
   cadenas adentro.** Salen tokens como `text-[11px]"` o `"!px-2`, que no
   matchean ninguna familia y quedan sin clasificar. Son cuatro declaraciones
   detectadas así, y no hay motivo para pensar que sean las únicas: el borde
   aparece en cualquier `className={cond ? "..." : "..."}`.

Cualquier afirmación sobre "las 388" tiene que decir que es lo que este extractor
ve, no lo que hay.

## El arnés de captura, y por qué una captura sola no prueba nada

### ⚠️ EL BOTÓN Y EL INPUT FUNCIONAN POR UN ORDEN DE IMPORT, NO POR UNA DECISIÓN

**Anotado el 2026-08-16. NO se tocó. Es lo más frágil que encontró toda la fase.**

`SunmiButton` pone clases propias de `styles/sunmi.css` —`.sunmi-btn-base`,
`.sunmi-btn-<color>`— y `SunmiInput` pone `.sunmi-input`. Las declaraciones de
las pantallas son utilidades de Tailwind. Las dos tienen especificidad 0-1-0, así
que a igual especificidad **decide cuál se escribió última en la hoja**.

Y lo que decide eso es una línea de `app/globals.css`:

    @import "../styles/sunmi.css";     ← línea 6
    @tailwind base;                     ← línea 11
    @tailwind components;
    @tailwind utilities;                ← línea 13

**`sunmi.css` va ANTES de `@tailwind utilities`. Por eso gana la pantalla.**

Eso no es una decisión declarada en ningún lado: es un orden de import. **El día
que alguien mueva esa línea —o agregue un `@layer`, o cambie el orden al migrar a
Tailwind v4— las 388 declaraciones del botón y las 147 del input se dan vuelta en
silencio y sin que ningún candado lo vea.** No romperían el build, no pondrían un
test en rojo: cada pantalla que hoy define su tamaño de letra, su padding o su
ancho pasaría a mostrar el del kit, y solo se vería abriendo las pantallas.

Es la misma familia que todo lo demás de esta fase —algo que no falla donde se
rompe— pero con el radio más grande de todos: **535 declaraciones medidas** que
dependen de dos líneas de un archivo que nadie mira.

#### ¿SE PUEDE PONER UN CANDADO? SÍ, Y HAY QUE PONER DOS

**El barato, sobre el archivo:** leer `app/globals.css` y afirmar que el índice
de `@import "../styles/sunmi.css"` es menor que el de `@tailwind utilities`. Es
una función pura, cuesta cinco líneas y se pone rojo si alguien mueve la línea.
Su límite es real y hay que escribirlo al lado: **no ve un `@layer` agregado en
otro archivo, ni un cambio de motor**, y en Tailwind v4 —que no usa
`@tailwind utilities`— el candado dejaría de encontrar lo que busca. Por eso el
candado tiene que fallar cerrado: si no encuentra las dos marcas, ROJO, no verde.

**El que vale de verdad, sobre el resultado:** medir en el navegador que una
utilidad de Tailwind le gana a la clase del kit. Un elemento con
`sunmi-btn-base py-3` tiene que dar 10.5 px y no 3.5. Eso no afirma sobre el
orden del archivo sino sobre lo que el orden PRODUCE, y sobrevive a un cambio de
motor, a un `@layer` y a cualquier otra forma de romperlo. El costo es que
necesita el navegador, o sea que no entra en la suite de candados puros: va como
sonda del arnés.

#### ESCRITOS LOS DOS, Y CON SU CONTRAPRUEBA — 2026-08-16

Decía *"ninguno de los dos existe hoy"*. Ya existen:

- **El del archivo:** `lib/sunmi/ordenDeCascada.test.mjs`, nueve casos. Saca los
  comentarios antes de mirar —`globals.css` tiene un bloque de comentario justo
  encima de cada una de las dos líneas que mide— y falla cerrado en las cuatro
  formas de no poder afirmar: sin `@import`, sin `@tailwind utilities`, con el
  import repetido y con la marca duplicada. Lleva además **la premisa**: que
  `.sunmi-btn-base` y `.sunmi-input` sigan viviendo en `styles/sunmi.css` y no
  estén redeclaradas en `globals.css` después de las utilidades. Sin eso el orden
  del `@import` sería correcto y no protegería nada — la forma exacta del candado
  que mira el lugar equivocado.
- **La sonda del navegador:** `scripts/sonda-cascada.mjs`. Corre sin sesión sobre
  `/login`, porque la hoja la sirve el layout raíz. Sale 0 o 1.

**La sonda mide CUATRO cosas y no dos, y ese es su punto.** Con solo el par
mezclado, un `.sunmi-btn-base` que se quedara sin `padding-block` daría 10,5 px
igual y la sonda contestaría verde midiendo una utilidad contra nadie. Así que
cada pieza va con su control:

- `.sunmi-btn-base` solo → **3,5 px**; con `py-3` encima → **10,5 px**.
- `.sunmi-input` solo → **7 px**; con `px-3` encima → **10,5 px**.

Y antes de medir comprueba que las cuatro reglas ESTÉN en la hoja servida, que es
la trampa de la sección siguiente: una utilidad que Tailwind nunca generó mide
exactamente igual que una que no gana.

##### LA CONTRAPRUEBA, Y CORRIGE UNA PREMISA DE ARRIBA

Este párrafo daba por hecho que mover la línea da vuelta las 535 declaraciones
**en silencio**. Se probó moviéndola, y **no es así**: `@import` tiene que
preceder a todas las demás reglas, así que con el `@import` debajo de
`@tailwind utilities` Turbopack no compila el archivo y `/login` contesta **500,
"Parsing CSS source code failed"**. La inversión literal es ruidosa.

**Lo silencioso es la otra mitad, la que el candado del archivo no puede ver.**
Se ejerció con una hoja descartable importada desde `app/layout.jsx` que
redeclara las dos clases del kit después de las utilidades —que es lo que haría
un `@layer`, otro import, o la migración a v4—:

- **el candado del archivo quedó en VERDE**, 9 de 9, porque `globals.css` estaba
  intacto;
- **la sonda se puso ROJA en los cuatro números**: los dos controles siguieron
  dando 3,5 y 7, y los dos mezclados **cayeron** de 10,5 a 3,5 y de 10,5 a 7. Esa
  es la firma exacta que busca.

Con el orden bueno los dos vuelven a verde. O sea que el reparto de trabajo entre
los dos candados no es teórico: **está medido cuál agarra qué.**

Y ante la versión ruidosa —la página de error— la sonda **no informó verde**:
salió en rojo diciendo que la hoja no tiene `.sunmi-btn-base` y que por eso no
mide nada. Una página de error es perfectamente determinista, y ese es el modo en
que este arnés ya mintió dos veces.

##### DOS DEFECTOS DE LA SONDA QUE APARECIERON CORRIÉNDOLA

Ninguno se veía leyéndola, y los dos habrían dejado un candado que acompaña:

1. **`CSSStyleRule` también tiene `cssRules`.** Escrita como *"si tiene
   `cssRules`, bajá y seguí"*, la recursión que enumera la hoja se saltea **todas**
   las reglas de estilo, porque en Chrome moderno el anidamiento de CSS es parte
   del estándar y hasta una regla simple trae la lista, vacía. La primera corrida
   informó "faltan las cuatro clases" sobre una hoja de 30 reglas. Con el `if`
   arreglado enumera 1.534.
2. **La línea del orden informaba la PRIMERA aparición de cada selector.** En la
   corrida de la contraprueba —donde la clase del kit aparece dos veces— eso
   imprimió *"la utilidad va después, que es lo que la hace ganar"* justo cuando
   la utilidad estaba perdiendo. Ahora guarda todas las apariciones, informa la
   **última**, que es la que decide, y avisa cuando un selector está repetido.

Y una tercera que no es de la sonda sino del método: **el backtick adentro de un
comentario adentro de un template literal**, por quinta vez en el repo. Lo agarró
`scripts/scriptsCompilan.test.mjs`, que existe justamente para eso.

### ⚑ SACAR UN `!` DEL CÓDIGO NO SACA LA CLASE DEL BUNDLE — la mantiene viva un comentario

**Medido el 2026-08-16, eligiendo el marcador del despliegue.** Vale para todo lo
que queda de la campaña de los `!`, así que va acá y no en el informe de una
tanda.

Después de sacar los diez `!` del separador, **ningún componente escribe `!my-0`
ni `!my-1`**. Y las dos reglas se siguen generando igual: `.\!my-0` y `.\!my-1`
están en la hoja. El motivo es que **Tailwind escanea el contenido CRUDO de los
archivos de `content`, y un comentario es contenido** — el JSDoc de
`lib/sunmi/claseNegociada.js` las nombra al explicar por qué existían.

Comprobado con tres corridas limpias de `npx tailwindcss`, no con el dev server,
que además cachea:

- repo entero → `.\!my-0`, `.\!my-1`, `.my-0`, `.my-1`, `.my-2`, `.my-3`,
  `.my-4`, `.my-6`;
- sacando `lib/` del `content` → **desaparecen las dos con `!`** y `.my-0` se
  queda, o sea que el único que las sostiene es ese archivo;
- un archivo suelto que escribe solo `!my-0` y `my-7` → genera `.\!my-0` y
  `.my-7` y **no** `.my-0`, así que el extractor **no** deriva la pelada de la
  que tiene `!`. Eso es lo que hace que `my-0` sirva como marcador.

**Las tres consecuencias, que son distintas:**

1. **Un marcador de desaparición sobre una clase con `!` da falso.** Antes de
   usar uno: `git grep` de la clase sobre `app`, `components` y `lib` en `.js` y
   `.jsx` — los `.md` y los `.test.mjs` no entran en `content`.
2. **El peso del bundle no baja al sacar los `!`** mientras el comentario los
   nombre. Es poquísimo y no justifica tocar el comentario, pero no hay que
   informarlo como una baja que no ocurrió.
3. **Es la misma familia que el archivo huérfano, al revés.** Con
   `ModalCierreTurno` el repo tenía de más y el build de menos; acá el build
   tiene de más. Las dos veces la causa es la misma: **el código del repo y lo
   que llega al build no son la misma lista**, y ninguna de las dos se deduce
   leyendo la otra.

### ⚑ NO SE PUEDE MEDIR "¿GANA SIN EL `!`?" INYECTANDO LA CLASE PELADA

**Encontrado el 2026-08-16, midiendo `SunmiSeparator`. Invalida una vía que se
usó en la tanda anterior.**

El método era: inyectar la clase con `!`, inyectarla sin `!`, y comparar. Si la
pelada gana igual, el `!` no hace falta.

**No sirve cuando la clase pelada no está en la hoja.** Tailwind genera **solo lo
que encuentra escrito en el código**. Si el repo nunca escribe `my-0` sin el `!`,
la regla `.my-0` **no existe**, y medirla devuelve el valor por defecto — que se
lee exactamente igual que "no gana".

Comprobado enumerando las reglas `.my-*` que la ruta sirve: están `.\!my-0`,
`.\!my-1`, `.\!my-2`, `.my-1`, `.my-2`, `.my-3`, `.my-4` y `.my-6`. **`.my-0` no
está.** Y la sonda decía a la vez "clase ausente" y "el token cambia el valor de
7 px a 0", que no pueden ser ciertas del mismo selector: eran dos selectores.

**La única vía que queda en pie: editar el archivo y volver a medir**, porque
recién ahí Tailwind genera la clase. Se hizo así con los diez `!` del separador,
y el número salió del elemento real —3,5 px con `my-1` a secas— y no de una
inyección.

#### Y LO DE `SunmiButton` FUE SUERTE, NO DISEÑO — pero se comprobó

Los 151 `!` del botón se sacaron con el método que ahora está invalidado. La
comprobación hacia atrás dio limpio: **las quince clases peladas ya estaban en la
hoja** que servía la imagen `a285f1c`, así que las 151 declaraciones se midieron
contra algo que existía y ninguna se sacó a ciegas.

Por qué estaban: esas clases —`text-xs`, `py-3`, `font-bold`, `text-[11px]`…— se
usan **sin** `!` en otras partes del repo, así que Tailwind ya las generaba.
`my-0` no la escribe nadie sin `!` en ningún lado.

**Y así hay que decirlo: fue suerte.** Si el botón hubiera usado un valor que
solo aparece con `!`, la medición habría sido ciega y el cambio ya estaría
desplegado.

**Cómo se comprueba, que es la parte reusable:** no se le puede preguntar al dev
server de hoy —ahí las peladas existen porque las escribió la propia tanda, y la
comprobación sale circular—. Se saca el CSS de **la imagen anterior**, con un
contenedor descartable de ese tag, y se busca el selector escapado de cada clase.

### ⚑ LA FUENTE QUE NO CARGÓ: TRES CORRIDAS IDÉNTICAS DE LA PANTALLA EQUIVOCADA

**Encontrado el 2026-08-16, migrando el aire de `SunmiCard`.**

La corrida de "después" dio diferencias del 1,6 al 3,2 % **en las siete
pantallas, incluidas las TRES de control** — que no declaran padding y no podían
haberse movido por ese cambio. El arnés había informado "3 corridas idénticas.
La captura sirve como prueba" en las siete.

**Era la tipografía.** El texto salió con la fuente de reserva porque la web font
no había cargado: mismo contenido, mismas cajas, otros glifos. Y como cada
palabra queda unos píxeles corrida, difieren todas las filas de texto de toda la
pantalla, que es exactamente la forma que tenía el ruido.

Por qué pasó: esa corrida arrancó **inmediatamente después de editar un archivo**,
con el dev server recompilando. La fuente perdió la carrera.

**Y por qué el arnés no lo vio, que es lo que hay que aprender:** las tres
repeticiones viven DENTRO de la misma corrida y comparten su estado. Si la fuente
falta, falta en las tres. `--repeticiones 3` contesta "esta corrida no varía", y
no contesta "esta corrida retrató lo que digo". Son las dos preguntas de siempre,
y ésta es la vez que se separaron solas.

**Lo único que lo atrapó fue el control CRUZADO**: volver a capturar el mismo
estado en otra corrida. `antes`, la corrida con el `!` y la corrida nueva dieron
las tres IDÉNTICAS byte a byte entre sí; la contaminada quedó sola, con los
mismos conteos de píxeles en las tres pantallas de control. Ahí se supo que el
raro era el retrato y no el cambio.

**Cómo se reconoce sin investigar nada:** si los píxeles que difieren caen sobre
filas de texto de TODAS las pantallas, incluidas las que no podían moverse, es la
fuente. Si caen sobre una zona —un bloque, una tarjeta, una columna—, es el
cambio. Y mirar las dos imágenes al lado tarda diez segundos y lo decide.

**En la práctica: no se captura con el dev server recién tocado.** Y una corrida
cuyos controles se mueven se descarta entera; no se le busca explicación al
número, se vuelve a capturar.

Nota sobre la hipótesis que NO era: se sospechó de contenido que cambia solo
—horas, fechas, "hace X minutos"—, que era razonable porque tres de las pantallas
muestran cosas recientes. La descartó mirar DÓNDE caían los píxeles: si fueran
las fechas, las pantallas de control —categorías, usuarios, proveedores— no se
habrían movido, y se movieron las tres.

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

## ⚑ LOS RÓTULOS DE 10px NO SE LEEN — tanda propia, anotada el 2026-08-17

**PENDIENTE, con el número puesto.** Salió midiendo el recuadro de caja del
detalle de turno, y **no** es un problema de esa pantalla: es del gris.

`text-gray-400` es `#9ca3af`. Sobre blanco da **2,54:1**, y el mínimo de WCAG
para texto chico es 4,5:1. Medido sobre los elementos reales en los catorce
temas: **falla en 10 de 14**. Los cuatro donde pasa son temas oscuros, y pasaba
por accidente — el fondo era oscuro porque el recuadro leía un token, que es
justamente el defecto que se arregló. Con el recuadro ya en gris fijo, el rótulo
da **2,31:1 en los catorce**, o sea que ahora falla parejo.

Eso último importa y no hay que taparlo: **arreglar el fondo empeoró el rótulo en
cuatro temas**, de 5,33–6,81 a 2,31. Es real, y es el precio de que el valor
—que es lo que no se leía— pasara de 1,03 a 16,12. Los dos no se podían tener a
la vez sin tocar el gris, y tocar el gris es esta tanda.

### El alcance, que es lo que la hace una tanda y no un arreglo

No se arregla en esta pantalla. Es un relevamiento de la familia de grises claros
de texto en todo el repo. Enumerado con `git grep -o --untracked` sobre `*.jsx` y
`*.js` —que recorre el repo entero, trackeado y no trackeado, y no un nivel de
directorio—:

- `text-gray-400` — **16 apariciones en 2 archivos**, y 14 de las 16 están en
  `app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx`. Casi todo el uso de
  esta clase vive en la pantalla que lo destapó.
- `text-slate-400` — **24 apariciones en 11 archivos**.
- `text-slate-300` — **6 en 4**.
- El resto de la familia —`gray-300`, `zinc-400`, `neutral-400`, `stone-400`— en
  **cero**.

Total: **46 apariciones en unos 17 archivos**.

### Por qué no es un reemplazo masivo

Porque **el número depende del fondo, y el fondo depende del tema**. `slate-400`
sobre un fondo oscuro se lee perfecto; el que falla es sobre blanco. Las 24 de
`text-slate-400` están en pantallas que siguen al tema, así que ahí hay que medir
caso por caso. Las 14 de esta pantalla son el caso fácil y seguro: la tarjeta es
blanca fija, siempre, en los catorce temas — ahí `text-gray-500` (`#6b7280`,
**4,83:1**) alcanza para pasar, y ya se usa en 7 lugares del repo.

### Lo que el contador NO veía — CERRADO el 2026-08-17

**El contador de colores fijos no contaba ningún gris.** La lista de
`scripts/check-theme-tokens.js` perseguía `slate`, `red`, `amber`, `cyan`,
`emerald`, `green` y `orange` — `gray` no estaba. Por eso el arreglo del recuadro
dejó la línea de base clavada en 286, delta cero, sin declarar excepciones.

Ya está cerrado: entraron los ocho patrones de gris —`text-`, `bg-`, `border-`,
`ring-`, `divide-`, los dos `hover:` y `placeholder:text-`—.

**Medido ANTES de agregarlos, que era la condición: sube +31, de 286 a 317.** En
cinco archivos, y contrastado con un conteo independiente que no usa el contador
del repo y da el mismo 31 con la misma distribución. No bloquea trabajo, así que
no se congeló nada.

Veintitrés de los 31 son del documento imprimible del turno y van declarados como
excepción, uno por uno con su rol y su motivo, así que la cifra quedó **sellada en
294**.

### Los 8 grises que SÍ son deuda

Los que quedaron contando, y son deuda de verdad porque viven en pantallas que
siguen al tema:

- `components/grupos/TablaDepositos.jsx` — 3. Un vacío en `bg-gray-50
  text-gray-500`, un `thead` en `bg-gray-100 text-gray-700` y una celda en
  `text-gray-800`.
- `components/grupos/TablaLocales.jsx` — 3. Las mismas tres, es el archivo gemelo.
  Los dos son candidatos a `SunmiTable`.
- `components/pos-transferencias/nueva/FiltrosDeposito.jsx` — 1. Un botón en
  `bg-gray-100` que además ya mezcla un token del POS en el borde.
- `components/pos-transferencias/nueva/ResumenPreparados.jsx` — 1. Un `span` en
  `text-gray-500`.

### Cómo se declara una excepción ahora, y por qué cambió el mecanismo

La whitelist era una lista de regex sobre la LÍNEA, sin archivo. Declarar
`text-[10px] text-gray-600 uppercase` para los ocho rótulos del turno habría
eximido esa combinación en los **300 archivos de interfaz**: una excepción de una
pantalla perdonando el repo entero.

Ahora conviven dos formas. La regex pelada sigue valiendo en cualquier archivo
—las dos del kit que ya estaban—, y la nueva es un objeto con `archivo`, `linea`,
`lineas` y `motivo`.

**`lineas` es la parte que evita el perdón silencioso.** Es la cantidad de líneas
que la excepción cubre hoy, medida, y
`lib/hardcodeo/excepcionesDeclaradas.test.mjs` la comprueba contra el archivo
real. Una excepción escrita para ocho rótulos que mañana cubre catorce dejó de ser
una excepción declarada: se estiró sola. Sin ese conteo eso pasa sin que nadie se
entere, que es la forma que tiene el perdón en bloque de entrar por la ventana.

Y la regla de exención vive en UN solo lugar —`estaExento`, en
`check-theme-tokens.js`— y se le pasa al contador. Los dos consumidores hacían su
propio `w.test(linea)`; el que no se enterara del `archivo` aplicaría las
excepciones en todo el repo. Falla cerrado: sin ruta, no exime.

### Y una trampa del contador que conviene saber

**Decide si una línea es comentario mirando su primer carácter:** `//`, `*` o
nada. Un bloque JSX de varias líneas con prosa pelada NO es comentario para él, y
la primera versión del comentario del turno le sumó +2 colores fijos por nombrar
dos hex. Los comentarios largos de esa pantalla van con asteriscos por eso.

Es la cuarta vez de la familia "un comentario cambiando el conteo". Arreglarlo de
raíz —que `esComentario` entienda bloques de varias líneas— movería números de
todo el repo y es su propia tanda.

## ⚑ LA REGLA DE NEGOCIO QUE DECIDIÓ TRES BORRADOS — dicha por Emanuel el 2026-08-17

**Escrita acá porque explica tres tandas que, leídas en el diff, parecen limpieza
de código y no lo son.** Sin ella, el próximo que las lea va a creer que se borró
funcionalidad por descuido.

### La regla

**BORRADOR es "todavía se está armando". ENVIADO es "ya se armó".**

Y lo que cambia después de enviar **no lo hace uno: lo hace el proveedor** — manda
de menos porque no tiene, agrega lo que no se pidió, o cobra más caro de lo
acordado. **Esa diferencia se compara contra la boleta al recibir**, que es
exactamente a lo que vino el módulo de recepción por comprobante.

### Qué se sigue de ahí, y por qué no es una preferencia de estilo

Editar la línea de un pedido ENVIADO no es una comodidad que falte: **es un daño.**
Haría coincidir lo que se pidió con lo que llegó, y así **la diferencia —que es el
dato que la recepción existe para registrar— desaparece sin dejar rastro.** El
pedido dejaría de ser el testimonio de lo que se acordó.

Por eso las tres cosas que se borraron no se "desconectaron por ahora": **no van.**

- **El editor de borrador dentro del detalle** —tabla, tarjetas de mobile, banner y
  las funciones de editar y quitar una línea—. El borrador se edita en `/nueva`,
  que es el editor único. Tener un segundo editor acá era, además, lo que el
  redirect a `/nueva` vino a terminar.
- **El contador "N líneas tienen un costo distinto del catálogo"** en el detalle.
  Compara **lo pedido contra el catálogo**, que es la pregunta de cuando se arma el
  pedido, no la de cuando llega la mercadería. La comparación que sirve en el
  detalle ya existe y es otra: la de la conciliación, que cruza **la factura**
  contra lo pedido y contra el costo maestro.

### El dato que la respalda, medido y no argumentado

**Ninguno de los 13 pedidos ENVIADO de `erpazul_dev` mostraba ese contador.** Se
probaron los 13 uno por uno —#9, #11, #12, #24, #25, #26, #27, #28, #29, #30, #31,
#34 y #42— buscando el elemento `[data-contador-avisos]` en el DOM: en los 13 el
selector no encontró nada.

### EL MECANISMO QUE SE ESCRIBIÓ ACÁ PRIMERO ERA FALSO — corregido el 2026-08-17

**Decía: "compras a proveedor reescribe el costo maestro al crear o editar una
línea, así que pedido y catálogo quedan sincronizados por construcción".** Es
falso, y hay que decirlo con todas las letras porque se usó para explicar el cero.

Lo cierto es lo contrario, y está decidido y desplegado desde el 2026-08-10 en
`ed52991`: **ninguna ruta de pedido escribe el costo maestro.** Ni `crear`, ni
`editar-item`, ni `agregar-item`, ni `confirmar`, ni `marcar-enviado`, ni `anular`.
Solo `recibir/[id]` propaga, y adentro de un `if (escribeCosto)`. Comprobado
enumerando las 26 rutas del módulo de forma recursiva, y defendido por candados que
miran por nombre Y por efecto.

**EL MECANISMO REAL: la línea del pedido NACE CLONANDO el costo del catálogo.**
Al agregar un producto, la pantalla de armado lee `precio_costo` del producto y lo
copia al ítem. Coinciden porque la línea es una **fotocopia** del catálogo tomada
en ese momento, **no un vínculo**. La prueba de que es copia está en el propio
código: la pantalla guarda **aparte** el valor del catálogo, justamente para poder
comparar cuando los dos se separan.

**Y esto cambia una conclusión, no solo la explicación.** Se había escrito que el
contador era incapaz de encenderse. **No es así: se enciende en cuanto la línea y
el catálogo se separan** — al editar el costo de la línea, al editar el producto, o
al aplicar una lista de proveedor, que arrastra la venta por margen. Los tres
caminos existen hoy.

**O sea que el cero de 13 es un hecho de ESTOS datos, no una ley.** Vale como
medición —los 13 se probaron uno por uno— y no vale como demostración de que el
contador nunca podría verse.

**LA DECISIÓN DE SACARLO NO SE APOYABA EN ESE CERO.** Se apoya en la regla de
negocio de más arriba: comparar lo pedido contra el catálogo es la pregunta de
cuando se ARMA el pedido, y ponerla en la pantalla de cuando LLEGA la mercadería es
la comparación equivocada, se encienda o no. El cero era refuerzo, y era un
refuerzo con el porqué mal escrito.

### Y qué NO prueban las capturas de esa tanda

Como el contador no se dibujaba en ninguno de los 13, sacarlo no mueve un píxel en
esta base. La captura confirma que no se rompió nada alrededor; **no** confirma que
el contador se viera y dejara de verse, porque no se veía.

## ✅ `TablaDetallePedido` — BORRADA el 2026-08-17

**Hecha.** Se borró el componente (283 líneas), su import y su uso, más los cinco
identificadores que quedaban colgando de él: `puedeEditarProductoP`,
`irAEditarProducto`, `contexto` de la desestructuración del hook, y los imports de
`ORIGENES` y `linkEditarProducto`.

**Las tres preguntas se reconfirmaron antes de tocar**, porque el repo pudo haber
cambiado desde la medición: el redirect sigue sin ramas, el único importador sigue
siendo la línea 27 de esa misma página, y los seis hermanos de ruta siguen siendo
segmentos estáticos, que ganan sobre el `[id]` dinámico.

**Cómo se verificó, que es lo que hace que el borrado valga:**

- **Cero píxeles** en el pedido 42 —no borrador—. ⚠️ **ESTA MEDICIÓN SE HIZO DOS
  VECES, Y LA PRIMERA NO VALÍA:** las tres capturas de ese día eran de la
  **pantalla de login**, porque el arnés no tenía sesión y sacaba la foto igual.
  El login es determinista, así que las tres dieron cero y el control de
  estabilidad no podía atraparlo. El instrumento se arregló en `135f3a4` —ahora se
  niega si no llegó a la pantalla pedida— y la medición **se rehízo el mismo día**
  contra `afeece9^` = `403df63`, poniendo cada punta en el árbol con
  `git checkout <sha> -- <archivos>` sobre el mismo servidor.

  **El resultado se sostiene: cero píxeles.** Y ahora se sabe que la foto es la
  buena porque **las dos puntas midieron 3440px de alto** —el detalle real— y no
  los 900 del login. Ese alto queda escrito en la ficha `.json` de cada captura,
  así que es comprobable después y no hay que creerle a nadie.
- **La suite pasó de 3416 a 3414 tests**, de 3394 a 3392 pases, con `fail 0` en los
  dos lados y los mismos 21 salteados y 1 `todo`. El −2 son exactamente los dos
  candados borrados; nada más se movió.
- **La sonda de tabla confirmó que la captura retrataba lo que dice**: llegó a
  `/modulos/compras-proveedor/42` sin redirigir, o sea que el pedido no es
  borrador. Una página de error es determinista y también habría dado cero.

### Los dos candados que la nombraban: LOS DOS SE BORRARON, y por qué

Es el caso del que avisa la regla 5: un candado que busca un patrón en un archivo
sigue pasando cuando el archivo se va. Estos dos no llegaron a hacerlo —al borrar
el archivo `fs.readFileSync` tira excepción y se ponen rojos— pero lo que
afirmaban ya era falso desde antes.

- **`avisoCostoLinea.test.mjs`, "el DETALLE muestra el aviso por línea".** No se
  reescribió apuntando a otro lado porque NO HAY OTRO LADO. En un pedido enviado o
  recibido se dibuja `ListaConciliacion`, y el aviso por línea que hay ahí es otro:
  compara el precio de la FACTURA contra el catálogo, con el umbral del proveedor
  y no con `UMBRAL_CENTAVOS`, y solo si la línea llegó por un comprobante leído y
  vinculado. Apuntarlo ahí lo habría dejado afirmando sobre otra comparación con
  el nombre de ésta.
- **`retornoPedido.test.mjs`, "el botón de editar producto está en el DETALLE".**
  Tampoco hay alternativa: ni `ListaConciliacion` ni `PanelComprobantes` tienen
  lápiz, y `ORIGENES.PEDIDO_DETALLE` ya no lo produce nadie en la aplicación.

Los dos dejaron su motivo escrito en el lugar donde estaban, con lo que se pierde,
para que nadie los reescriba sin saber qué contrato describían.

**Y el trinquete bajó, que no es lo mismo que mejorar:** −1 en elementos crudos
(318→317) y −6 en medidas mágicas (1893→1887). Los otros cinco contadores no se
movieron. **Es una baja por borrado, no progreso**: nada se migró al kit, se fue
código que ya no se dibujaba. Se comprobó a qué atribuirla en vez de suponerlo —
restaurando solo el componente, con la página y los candados ya cambiados, los
cuatro contadores vuelven a la base exacta, así que el delta entero es del archivo
y las ediciones de la página aportan cero.

### ⚑ LO QUE EL BORRADO DEJÓ AL DESCUBIERTO — tres cosas, y ninguna la causó

Aparecieron relevando para borrar. **Las tres ya pasaban antes**, y conviene no
leerlas en el diff como si el borrado las hubiera provocado.

**1 · Desde el detalle se puede AGREGAR una línea pero no quitarla ni editarla.**
El panel de "Agregar producto extra" está vivo —cuelga de `esRecepcion`— mientras
que `editarItemAPI` y `eliminarDetalle` solo se invocan desde el bloque muerto. O
sea que en un pedido enviado se suma un producto y después no hay forma de sacarlo
desde esa pantalla.

**2 · El contador de arriba cuenta líneas que no se pueden ir a mirar.** Decía "N
líneas tienen un costo distinto del catálogo" pero el aviso por línea que señalaba
cuáles vivía en la tabla borrada. **RESUELTO el mismo día, y no agregando el aviso
sino sacando el contador** — ver la tanda de más abajo. La comparación estaba mal
elegida, no incompleta.

**3 · El lápiz de editar producto no existe en el detalle.** Solo se llega a editar
un producto desde una compra por `/nueva`, que únicamente acepta borradores.
**Queda así**, por la misma regla: en un pedido enviado no se corrige la ficha para
que cierre — se registra lo que llegó contra la boleta.

### ✅ EL RESTO DEL BLOQUE MUERTO — BORRADO el 2026-08-17, en su tanda propia

Se fue todo lo que colgaba de `esBorrador`: las tarjetas de mobile, el banner azul
"Estás editando un borrador", `editarItemAPI`, `eliminarDetalle`, el estado
`deleting`, y los imports de `SunmiSelectAdv`, `SunmiSelectOption`,
`permiteToggleUnidad` y `unidadDisplay`.

**Se borró, no se conectó**, por la regla de negocio de más arriba. La pregunta
estaba abierta y la contestó Emanuel: lo que cambia después de enviar lo hace el
proveedor y se captura contra la boleta.

**El banner era lo único visible del bloque**, así que se comprobó aparte que no
existiera en otro lado: el texto "Estás editando un borrador" aparecía en **un solo
archivo del repo**, dentro del bloque inalcanzable. `/nueva` —que sí acepta
borradores— no lo tiene ni tiene equivalente; avisa por otro camino, con el aviso
de "este pedido no es un borrador" cuando no corresponde.

**Los dos helpers NO se borraron del módulo**, solo dejaron de importarse acá: los
usan `/nueva` y `CarritoPedido`, y sus candados unitarios los siguen ejerciendo.
Igual con las rutas `editar-item` y `eliminar-item`, que quedan intactas y las usa
`/nueva`.

Verificación: **cero píxeles** en el pedido 42 —sobre la pantalla real, de 3440px
de alto, con el control de ruido en cero antes— y **−12 en medidas mágicas**
(1887→1875), los otros seis contadores quietos. **Baja por borrado, no progreso.**

Lo que **no** se tocó, y queda dicho: los operandos `esBorrador` que sobreviven en
código vivo —el `if` de `calcLineaDetalle`, el `(esRecepcion || esBorrador)` del
panel de agregar, y el ternario del título de ese panel, que por eso nunca dice
"Agregar productos al pedido"—. Son inocuos: evalúan siempre a lo mismo. Y
`tieneFiambre`, que se calcula y no se usa en ninguna parte, sin relación con
`esBorrador`.

### ✅ EL CONTADOR CONTRA EL CATÁLOGO — SACADO DEL DETALLE el 2026-08-17

Segunda tanda de la misma regla de negocio, y va aparte porque **borra una cosa
distinta por un motivo distinto**: el bloque de arriba era código muerto; esto era
código vivo, con la comparación equivocada.

Se fue el contador "N líneas tienen un costo distinto del catálogo", su cálculo,
y los imports de `TriangleAlert` y del módulo `avisoCostoLinea`.

**No se movió NADA de `/nueva`.** Ahí el aviso es el que Emanuel usa mientras arma
el pedido, y ahí la comparación contra el catálogo es la correcta. `CarritoPedido`
quedó intacto —importa el módulo, calcula el contador y lo marca con
`data-contador-avisos`—, y los dos candados que lo afirmaban se reescribieron para
hablar de una pantalla en vez de dos. **Lo que afirman no cambió; cambió de cuántas
pantallas se afirma.**

**`contarLineasConAviso` y `textoContadorAvisos` NO se borraron.** Quedaron sin uso
en el detalle pero siguen usadas en `/nueva`, así que el módulo se queda como está.

**Y se agregó un candado que defiende la decisión**, que es lo que hace que esto no
vuelva por descuido: afirma que el detalle NO importa el módulo ni dibuja el
contador, y nombra la regla de negocio en su mensaje de error. Saca los comentarios
antes de mirar —el propio archivo explica por qué se sacó el contador y lo nombra,
así que un candado que busca texto crudo se ensucia con la prosa—. Contraprueba
hecha: volviendo a poner el import, ROJO con el mensaje correcto; sacándolo, verde;
y el archivo quedó idéntico al respaldo, así que la contraprueba no dejó rastro.

**Verificación, y hay que leerla con cuidado:** cero píxeles en el pedido 42.
**Ese cero NO prueba que el contador se viera y dejara de verse** — prueba que no
se rompió nada alrededor. El contador **no se dibujaba en ninguno de los 13 pedidos
enviados**, medido uno por uno, así que en esta base no había nada que desaparecer.
Decirlo al revés sería vender como prueba lo que es una ausencia.

Trinquete: **−1 en medidas mágicas** (1875→1874), el resto quieto. Baja por
borrado.

## ⚑ (histórico) `TablaDetallePedido` NO SE DIBUJA NUNCA — la medición que la mandó a borrar

**ES LA ÚNICA ENTRADA DE ESTA TANDA.** Hubo una segunda más abajo —"BORRAR
`TablaDetallePedido`"— que decía lo mismo con otras palabras: se escribieron el
mismo día, con horas de diferencia, sin que la segunda se diera cuenta de que ya
existía la primera. Se unificó acá el 2026-08-17. Si aparece otra, es un
duplicado, no una tanda nueva.

**Medido el 2026-08-17 y CONFIRMADO POR LAS TRES PREGUNTAS, con archivo y línea.**
No se borró nada: va como tanda propia, no de paso.

**1 · ¿La rama es inalcanzable?** Sí, y no hace falta el redirect para probarlo.
`app/modulos/compras-proveedor/[id]/page.jsx:382` corta antes de renderizar:

    if (pedido.estado === "BORRADOR") return null;

y recién en la 385 define `const esBorrador = pedido.estado === "BORRADOR"`. O sea
que **`esBorrador` es siempre `false` por construcción** en todo el JSX de abajo,
y el `{esBorrador && <TablaDetallePedido …>}` de la 662 no puede ser verdadero
nunca. El redirect de la 153-158 —`router.replace("/nueva?pedidoId=…")`, sin
ninguna rama que lo saltee— es la segunda cerradura, no la única.

Comprobado además navegando, que es lo que importa: con el pedido 19 (BORRADOR, 6
líneas) la sonda informó que llegó a `/modulos/compras-proveedor/nueva?pedidoId=19`.

**2 · ¿La importa alguien más?** No. `git grep` sobre el repo entero, trackeado y
sin trackear, da un solo importador —`[id]/page.jsx:27`— más el propio archivo.
Aparece también en dos candados que lo leen COMO TEXTO y no lo ejecutan:
`lib/compras-proveedor/avisoCostoLinea.test.mjs:327` y
`lib/compras-proveedor/retornoPedido.test.mjs:361`. **Esos dos hay que releerlos
antes de borrar nada**: un candado que busca un patrón en un archivo sigue pasando
cuando el archivo se va, sin afirmar nada y sin quejarse.

**3 · ¿Se llega por otra ruta?** No. Los hermanos de `compras-proveedor` son
`activos`, `ganancia`, `historial`, `nueva`, `pendientes` y `recepcion`, todos
segmentos estáticos, así que ninguno resuelve al `[id]` dinámico. Y el editor de
borrador de verdad es `/nueva`, que no la importa.

**Lo que hay que decidir, y es de aspecto, no de plomería:** o sobra la tabla, o
sobra el redirect. Si sobra el redirect, el borrador vuelve a editarse en DOS
pantallas distintas — que es lo que ese redirect vino a terminar—.

### Y las otras tres tablas con `tdClassName`, que tampoco se podían medir

Son cuatro en todo el repo —`git grep -l "tdClassName"` sobre `app/` y
`components/`— y al buscar con cuál verificar el commit 2 salieron las cuatro
trabadas, cada una por su motivo:

- `EditorVentaCorreccion` — **destrabada, y así se midió el commit 2.** De las 54
  ventas con más de una línea que había en la base, **las 54 tenían el turno
  original cerrado**, así que la pantalla dibujaba el panel de bloqueo. No se
  fabricó ninguna fila: se abrió un turno desde el POS y se cargó una venta de dos
  líneas con acciones reales de la aplicación. Quedó la venta 113, ticket #87.
- `TablaCatalogo` — sin ninguna importación en `erpazul_dev`:
  `/api/proveedores/listas/<id>` da 404 para los ids 1 a 6. La abierta que menciona
  el skill `/capturas` es de `erpazul_al`, que está 7 migraciones atrasada.
- `ListaConciliacion` — vive en la pantalla del pedido y necesita comprobantes; el
  pedido 42 dice "Todavía no hay comprobantes".

## ✅ UN COLOR FIJO SE LEÍA COMO TAMAÑO — RESUELTO el 2026-08-17

**Cerrado en `459aa1a`.** Lo de abajo queda como estaba escrito, porque el
relevamiento que lo describe sigue siendo el mapa del terreno; lo que cambió es
que ya no es un pendiente. Tres cosas que el arreglo agregó al diagnóstico:

- **Eran CINCO familias, no sólo los colores.** También `text-wrap`, `text-nowrap`,
  `text-balance`, `text-pretty`, `text-ellipsis`, `text-clip` y `text-opacity-*`.
  24 falsos positivos medidos pasándole cada clase al predicado, y **cero falsos
  negativos**: erraba en una sola dirección.
- **No había daño escrito en ninguna pantalla.** Las 596 instancias de las cuatro
  piezas, con las 137 apariciones `text-*` que reciben de verdad, son todas
  tamaños, alineación o variante. El agujero estaba latente.
- **El cuarto lector se eliminó en vez de documentarse**: `SunmiTableRow` ya no
  llama al predicado directo, la expresión vive en `claseDeFila`, y el candado
  que probaba una copia a mano pasó a ejercer la función real.

## ⚑ AMPLIAR EL TRINQUETE A LOS COLORES QUE NO VE — tanda propia

**Anotada el 2026-08-17, al arreglar el predicado. NO se hizo, y el motivo es lo
que importa.**

`scripts/check-theme-tokens.js` persigue ocho familias en `text-`: slate, red,
amber, cyan, emerald, green, orange y gray. **No ve** blue, indigo, violet, sky,
teal, yellow, purple, rose, ni `text-white`, `text-black`, `text-transparent`,
`text-current`, `text-inherit`, ni los arbitrarios. Medido: hay **21 `text-white`
en el repo**, más 5 `text-blue-`, 3 `text-violet-`, 2 `text-indigo-` y 1
`text-black`, y ninguno le aparece.

**PERO AMPLIAR LA LISTA DE COLORES NO ALCANZA, Y ÉSE ES EL PUNTO ENTERO.** El
defecto del predicado tenía cinco familias y **cuatro de las cinco no son
colores**:

- ajuste de línea — `text-wrap`, `text-nowrap`, `text-balance`, `text-pretty`
- desborde — `text-ellipsis`, `text-clip`
- opacidad — `text-opacity-*`
- y cualquier `text-` que Tailwind agregue mañana

**Ninguna lista de colores las ve, por larga que sea.** `text-nowrap` no es
hardcodeo de nada: es una utilidad legítima que cualquiera escribiría sin que a
nadie le llamara la atención. Un trinquete de colores no puede cubrirlas ni
ampliándolo al infinito, porque no son colores.

Por eso el arreglo fue del PREDICADO y no del trinquete: el predicado dejó de
confundirse aunque alguien escriba cualquiera de las cinco. Ampliar el trinquete
sigue siendo deseable, pero por otro motivo —que un color fijo no siga al tema— y
con su propio costo: **mueve la cifra de colores fijos y obliga a declarar
excepciones una por una**, como pasó con los 23 grises del documento imprimible
del turno.

Y para las piezas del kit ese trabajo ya está hecho por otro lado:
`lib/sunmi/colorSobreElKit.test.mjs` reconoce el color POR DESCARTE —cualquier
`text-` que no sea tamaño, alineación, ajuste, desborde, opacidad ni clase del
tema— así que cubre blue, `text-white` y los arbitrarios sin enumerar ninguno.
Su alcance son las cuatro piezas que negocian el tamaño; el resto del repo es lo
que falta.

## ✅ EL CORREDOR DE LA SUITE — RESUELTO el 2026-08-17, sin nada afuera

**Cerrado en `cfc817f`, `394ec20` y `072c7d0`**, y este último corrige a los dos
primeros: el resolutor que agregaron era un DUPLICADO de
`scripts/alias-loader.mjs`, que ya existía. El detalle está más abajo, en "los 8
que quedaban afuera", junto con la regla que dejó.

**El estado final: la suite entera en verde por primera vez.** 3412 casos, 3390
pasan, CERO fallos, 21 salteados por fixture y 1 pendiente declarado. Antes de
esta tanda corrían 2323.

Lo de abajo queda como el relevamiento que originó la tanda. Lo que el arreglo
agregó:

- **Eran 940 candados mudos, no 739.** A los 739 de los 37 archivos con alias se
  sumaron **101 más** de una segunda causa que no estaba en el relevamiento: el
  glob del comando miraba sólo `lib/**`, así que **12 archivos de `components/` y
  `scripts/` ni entraban a la suite**. Once corren perfecto.
- La suite pasa de **2367 casos a 3176**, y de 2301 que pasaban a **3146**.
- **Ninguno de los 940 estaba en rojo.** Estaban todos bien y callados, que era
  la hipótesis menos probable de las tres.
- **Y NO se cambiaron los archivos a ruta relativa**, que sigue siendo la decisión
  correcta: el cargador resuelve el alias, así que el próximo candado escrito con
  alias corre solo. Lo que cambió es cuál cargador — el que ya estaba, no uno
  nuevo.
- Y va con `lib/sunmi/todosLosCandadosCorren.test.mjs`, que compara los archivos
  que EXISTEN contra los que pueden correr Y contra los que el comando mira. Sin
  eso esto se arreglaba hoy y se rompía solo.

### ✅ LOS 8 QUE QUEDABAN AFUERA — RESUELTOS, Y NO HIZO FALTA CONSTRUIR NADA

**Cerrado en `072c7d0`.** Lo de arriba quedó escrito diciendo que faltaba elegir
una herramienta de transformación de JSX y que `authorize` necesitaba un doble de
Next. **Las dos cosas eran falsas, y el motivo es el que importa.**

`scripts/alias-loader.mjs` ya estaba en el repo —desde `353923b`— y ya hacía todo:
resuelve el alias, **transforma el JSX con el SWC que Next ya trae**, sustituye
`next/link` por un doble (`scripts/stub-next-link.mjs`) y cubre los subcaminos de
Next. Corriendo la suite con ÉL, los ocho arrancan y **los ocho pasan**:

- `aperturaRelevo` 45 · `retiroPantallaRender` 51 · `ordenCambioPrevio` 56 ·
  `cierrePantallaRender` 37 · `circuitoDinero` 29 · `detalleTurnoRender` 8
- `components/sunmi/SunmiButton` 4
- **`lib/authorize.test.mjs` 16 — RESUELTO, no pendiente.** Era el único de los
  ocho que toca permisos y no necesita ningún doble: el cargador ya trae
  `next/server` entre sus subcaminos.

Son **246 candados** que nunca habían corrido, ninguno en rojo.

**EL AGUJERO REAL ERA QUE `package.json` NO TENÍA SCRIPT `test`**, así que el
cargador estaba ahí sin que nadie lo invocara. Nada más que eso.

### La regla que deja, y es la más cara de las tres tandas

**Antes de construir una herramienta: leer `docs/PROJECT.md` y mirar `scripts/`.**

En esta tanda se escribió un resolutor de alias duplicado —`cfc817f`, ya
empujado— creyendo que faltaba infraestructura. No faltaba, y no estaba
escondida: `docs/PROJECT.md:245` documenta el comando entero, tres de los seis
candados de caja lo nombran en su propio encabezado, y también aparece en
`docs/CURRENT_STATE.md` y en el skill de despliegue.

**Una herramienta duplicada no la atrapa ningún candado, porque las dos andan.**
No hay rojo, no hay conflicto, no hay nada que avise; el duplicado se descubre
sólo si alguien lo mira. Es la regla 1 aplicada a las herramientas, y es donde
más fácil se cuela, porque uno cree que está construyendo y no duplicando.

## ✅ 44 ARCHIVOS DE CANDADOS NO CORRÍAN — HECHO el 2026-08-17

**Cerrado el mismo día en que se encontró**, en `cfc817f` → `072c7d0`. Hoy la
suite entera corre: 3412 casos, 3390 pasan, **cero fallos**.

**Esta sección contradecía a la de más arriba** —la del corredor, marcada ✅— en el
mismo archivo y con dos días de diferencia entre una y otra. La de arriba es la
que vale y tiene el detalle completo; ésta queda con el relevamiento que la
originó, que es lo único que aporta, y se cierra acá para que nadie la lea como
pendiente.

Lo que decía cuando lo era:

**Encontrado el 2026-08-17 arreglando el predicado.** De los 45 fallos que
informaba `node --test "lib/**/*.test.mjs"`, **44 no eran candados en rojo: eran
archivos que ni llegaban a ejecutarse**, porque importan por el alias `@/lib` o
`@/components` y `node --test` pelado no resuelve los alias de Next.

Eso es peor que un rojo. **Un candado que no corre se ve igual que uno que pasa**:
no aparece en la lista de fallos con su nombre, y el conteo global de "45 fallos"
se lee como ruido conocido.

Se comprobó en carne propia: `lib/sunmi/claseNegociada.test.mjs` era uno de ellos
y tiene **59 candados** —los del cursor, el hover, el fondo y el tamaño de la
fila, más los de `SunmiCard` y `SunmiSeparator`—. **Ninguno se había ejecutado
nunca.** Se arregló ese archivo solo, pasándolo a ruta relativa: es el mismo
módulo, no se afloja nada, y los 59 corren y pasan.

**Quedan 44, y se parten en dos grupos.** Contados corriendo la suite y mirando
cada archivo que sale en rojo, no estimados:

- **38 fallan por SU PROPIO import con alias** —`from "@/lib/…"` o
  `from "@/components/…"` escrito en el archivo de candado—. Ésos se arreglan uno
  por uno con ruta relativa, como se hizo con `claseNegociada.test.mjs`, y es
  mecánico.
- **6 fallan más abajo en la cadena**, no en el candado: el módulo que importan
  importa por alias, o hace un import de DIRECTORIO. Son `authorize`,
  `fronteraCosto`, `lineaPorImporte` y los tres de `comprobante`. Ejemplos
  medidos: `lib/authorize.js` importa el directorio `lib/auth`, y
  `posVentaReducer.js` importa `@/lib`. Ésos no se arreglan tocando el candado.

Y la pregunta de fondo, que es la que hay que contestar antes de empezar:
**el proyecto no tiene un comando de suite propio.** `node --test` pelado no es el
corredor real —no resuelve los alias de Next— y es exactamente lo que dejó el
agujero abierto. Un `npm test` que resuelva los alias arreglaría los 44 de una vez
y evitaría que el próximo candado nazca mudo.

**Es la que más pesa de las tres que deja esta tanda.** Salió de un stash de la
sesión que se cortó, no de una medición nueva: esa versión traía el hallazgo y se
habría perdido con el stash.

`declaraTamanoDeLetra`, en `lib/sunmi/claseNegociada.js`, cuenta como tamaño
**cualquier `text-…` que no sea alineación**. Así que un COLOR FIJO de Tailwind lo
lee como si fuera un tamaño: con `className="text-blue-600"` la tabla CEDE su
`text-[12px]` y se queda con el tamaño heredado, que no es lo que nadie pidió.
Comprobado corriéndolo, no deducido leyendo.

Los colores del TEMA no tienen el problema —`sunmi-text-muted` no matchea— y
`text-right` tampoco, que es otra propiedad. Las dos mitades están afirmadas en
`lib/sunmi/claseDeTabla.test.mjs`: sin la segunda, "cede con todo" no se
distinguiría de "cede con un color".

**POR QUÉ NO SE ARREGLÓ EN ESTA TANDA, que es lo que hay que entender antes de
tocarlo:** el predicado NO es de la tabla. Cambiarlo desde el lado de la tabla es
exactamente lo que la regla 1 prohíbe.

**Son CUATRO lectores, enumerados con `git grep "declaraTamanoDeLetra"` sobre el
repo entero** —y conviene decir que la primera redacción de esta anotación decía
"dos", escrita de memoria; el grep la corrigió antes de commitearla, que es
justamente para lo que está la regla 10—:

- `lib/sunmi/claseNegociada.js:532` — `claseDeTabla`, la tabla. La nueva.
- `lib/sunmi/claseNegociada.js:567` — `PARTES_DEL_BOTON`, donde
  `sunmi-btn-parte-letra` cede por él. O sea `SunmiButton` y sus 248 consumidores
  con `className`.
- `lib/sunmi/claseNegociada.js:472` — `componerClaseTexto`, el renglón chico de
  las celdas de dos renglones.
- `components/sunmi/SunmiTableRow.jsx:77` — **importa el predicado y lo llama
  DIRECTO**, sin pasar por ninguna de las tres funciones de arriba:
  `const tamano = declaraTamanoDeLetra(className) ? "" : TAMANO;`

Hay que medir qué se mueve en los cuatro, no en el que uno tiene abierto.

### EL CUARTO ES LA TRAMPA DE ESTA TANDA, Y NO UN DETALLE DEL CONTEO

Conviene separarlo, porque los tres primeros y el cuarto no se buscan igual.

Los tres primeros son **funciones del módulo**: `claseDeTabla`, `PARTES_DEL_BOTON`
y `componerClaseTexto` viven todas en `lib/sunmi/claseNegociada.js`, al lado del
predicado. Quien vaya a cambiarlo abre ese archivo y los tiene los tres a la
vista, sin buscar nada.

**`SunmiTableRow` no.** Importa `declaraTamanoDeLetra` y lo invoca él mismo, en su
propio archivo, sin intermediario. No aparece leyendo el módulo del predicado, no
aparece leyendo las funciones que lo envuelven, y no aparece si uno enumera "las
funciones que negocian". Aparece **sólo** si se busca el NOMBRE DEL PREDICADO en
todo el repo.

Y eso ya ocurrió, en esta misma anotación: la primera redacción decía que los
lectores eran dos —el botón y las celdas—, escrita mirando el módulo. `git grep
"declaraTamanoDeLetra"` sobre el repo entero la corrigió antes de commitearla.
Fue el conteo el que se salvó; en la próxima tanda lo que está en juego no es un
número sino una pieza que se mueve sin que nadie la haya medido.

**Así que el primer paso de la tanda del predicado no es tocar el predicado: es
`git grep` del nombre sobre el repo entero**, y recién con esa lista completa
decidir. Un lector que llama directo, desde su propio archivo, es exactamente la
forma que tenía el script que fue invisible en tres auditorías seguidas — el
mismo error, en otro plano.

**Y el agujero es ALCANZABLE, no teórico.** Lo que hoy lo mantiene lejos es el
trinquete de hardcodeo, que persigue slate, red, amber, cyan, emerald, green,
orange y —desde el 2026-08-17— gray. **`blue` no está en esa lista**, ni indigo,
ni violet, ni las demás. O sea que nada impide escribir `text-blue-600` sobre una
pieza del kit y que el eje ceda sin que nadie se entere.

Hoy no afecta a ninguna pantalla: las 57 instancias de `<SunmiTable>` pasan cero
`className`. Es una bomba con la mecha larga, no un incendio.

**La forma que tendría la tanda:** enumerar los lectores del predicado con
`git grep`, decidir si la distinción correcta es "tamaño" contra "color" —los
tamaños de Tailwind son una lista corta y cerrada, así que se pueden enumerar en
vez de aceptar todo lo que empiece con `text-`—, y medir las tres piezas antes y
después. El candado de la tabla se pondrá rojo al arreglarlo, y eso es lo que
tiene que pasar: le va a mostrar a quien lo arregle qué más estaba tocando.

## ✅ EL ALMACÉN DE COMPROBANTES EN DESARROLLO — configurado el 2026-08-17

**No pide credenciales de ningún servicio: es una carpeta local y una variable.**
Medido por descarte además de leído: `grep` de `s3|aws|cloudinary|supabase|bucket|http`
sobre `almacenDisco.js` y `almacenImagenes.js` da **cero** en los dos.

Lo que necesita son cuatro cosas y las cuatro son locales:

1. `COMPROBANTES_VOLUMEN_PATH` apuntando a un directorio.
2. Que ese directorio exista.
3. Que adentro esté el centinela **`.volumen-comprobantes`**.
4. Que sea escribible.

**El centinela no es burocracia.** Docker crea el punto de montaje aunque el
volumen falte, así que un directorio vacío no distingue "volumen montado" de
"carpeta suelta del contenedor". El centinela es lo único que lo prueba.

**Lo configurado en la máquina de desarrollo:**

    C:/Users/emanuel/Desktop/programas/programas/erpazul-comprobantes-dev

Fuera del árbol del repo a propósito. La variable se pasa al levantar el server:

    COMPROBANTES_VOLUMEN_PATH=<esa ruta> npx next dev -p 3111

**Falta la línea permanente en `.env`** — no se pudo escribir desde la sesión que
lo configuró, que lo tenía bloqueado. Sin esa línea hay que pasar la variable a
mano en cada arranque.

**Comprobado escribiendo, no leyendo la variable:** se escribió, se leyó y se borró
un archivo a mano; el inspector del repo —`inspeccionarAlmacen`— devolvió
`ok: true`; y al arrancar el server imprimió "almacén de imágenes verificado". Y la
prueba más fuerte la hizo la aplicación sola: subió un comprobante, el archivo
apareció en el volumen, y al borrarlo desde la aplicación el archivo desapareció.

### Lo que el almacén NO destraba, y es la parte que faltaba saber

La pantalla del detalle de compras **sigue afuera de la línea de base**, y ahora se
sabe exactamente por qué. Tiene DOS tablas y dependen de cosas distintas:

- **La de comprobantes** —Comprobante, Estado, Fotos, Líneas, Último intento—
  dibuja su fila **con sólo subir el archivo**. `subir/route.js:219` crea el
  comprobante en `PENDIENTE_LECTURA` antes de que nadie lo interprete.
- **La de líneas del comprobante** —Producto, Pedido, Factura— **aparece recién al
  subir**, y dice "Este comprobante no tiene líneas leídas". **Ésa depende de que
  el lector haya interpretado el papel.**

O sea que subir una imagen cualquiera no alcanza: **llena una tabla y crea otra
vacía**, y la línea de base exige que todas tengan filas. Hace falta **una foto de
un comprobante real** que el lector pueda interpretar — y además la clave del
modelo, que en desarrollo tampoco está: el server avisa "sin clave de lectura
configurada".

El comprobante de prueba que se usó para medir esto **se borró** desde la
aplicación; `erpazul_dev` quedó como estaba.

## ⚑ LA LÍNEA QUE FALTA EN `.env` — escrita acá para copiar y pegar

**Anotado el 2026-08-17.** El almacén está configurado y probado, pero la variable
se está pasando a mano en cada arranque porque la sesión que lo configuró tenía
`.env` bloqueado para escritura. Mientras esa línea no esté, **cualquier arranque
que se olvide de la variable deja el almacén sin configurar** y la subida de
comprobantes no funciona — con el aviso en la consola, eso sí, no en silencio.

Va en **`.env`**, en la raíz del repo. Es el único archivo de entorno que existe
en esta máquina y está en `.gitignore` desde la línea 76, así que no se commitea.
La línea es ésta, tal cual, en un renglón propio:

    COMPROBANTES_VOLUMEN_PATH=C:/Users/emanuel/Desktop/programas/programas/erpazul-comprobantes-dev

**Con barras normales, no invertidas.** El valor lo lee `almacenDisco.js:38` y se
lo pasa a `node:path` y a `node:fs`, que en Windows aceptan las dos; las
invertidas además serían escapes para quien lea el archivo. Sin comillas: no hay
espacios en la ruta.

**Esa carpeta ya existe y ya tiene su centinela `.volumen-comprobantes` adentro.**
No hay que crear nada: la línea es lo único que falta. Para comprobar que quedó
bien, al levantar el server tiene que aparecer

    [comprobantes] almacén de imágenes verificado en C:/Users/…/erpazul-comprobantes-dev

y **no** el aviso de "ALMACÉN DE IMÁGENES NO DISPONIBLE". Ese renglón sale de
`instrumentation.js`, así que aparece solo, sin abrir ninguna pantalla.

## ⚑ EL DETALLE DE COMPRAS QUEDA FUERA DE LA LÍNEA DE BASE — falta la referencia, no la pantalla

**Anotado el 2026-08-17, después de medirlo.** `05-compras-proveedor-detalle` no
entra a `tests/huellas/baseline/`, y conviene decir bien qué es lo que falta:
**no falta la pantalla, falta la referencia.** La pantalla anda. Lo que no hay es
un estado suyo que sirva para comparar mañana contra hoy.

### La cadena entera, que son tres eslabones y hacen falta LOS TRES

1. **Una foto de un comprobante real.** Una imagen cualquiera no sirve, y por qué
   está abajo. La consigue Emanuel — no se fabrica un papel para que la captura
   salga linda, que es la regla 4.
2. **`GEMINI_API_KEY` configurada en desarrollo.** Hoy no está: el server avisa al
   arrancar "sin clave de lectura configurada: no se verifica el modelo". Sin
   clave el lector ni siquiera intenta — `gemini.js:105` devuelve `NO_CONFIGURADO`
   antes de tocar la red. **Esto gasta plata y es una decisión de Emanuel**, no
   algo que se resuelva leyendo el repo.
3. **Que el lector ACIERTE.** Es el eslabón que no depende de nadie de este lado:
   con la foto y la clave puestas, el modelo puede volver con las líneas o volver
   con nada. Si vuelve con nada, la tabla queda vacía igual y la pantalla sigue
   afuera.

### Por qué los tres, y no alcanza con el primero

La pantalla tiene **dos tablas y dependen de cosas distintas** —está medido más
arriba, en la sección del almacén—: la de comprobantes dibuja su fila con sólo
subir el archivo, y la de líneas **aparece recién al subir** y depende de la
lectura.

O sea que subir una imagen cualquiera **empeora la pantalla en vez de arreglarla**:
antes había una tabla vacía, después hay una llena y una vacía. Y el generador
—desde `59c0910`— se pone rojo antes que guardar una tabla sin filas, así que ese
estado no entra ni por descuido.

### Lo que cuesta dejarla afuera, para que la decisión sea con los ojos abiertos

Mientras no esté, **un cambio del kit que mueva esa pantalla no lo ve nadie**.
Es la única de las 19 con tabla que muestra el detalle de un comprobante, así que
no hay otra huella que la cubra de rebote. Se revisa a ojo o no se revisa.

## ⚑ LA SEGUNDA TABLA VACÍA AL SUBIR — cosa a mirar, no tarea

**Anotado el 2026-08-17. NO SE TOCA AHORA.** Esto no es una tarea: es una
observación que apareció midiendo otra cosa y que conviene no perder.

**Qué se vio:** al subir un comprobante, la pantalla del detalle **gana una tabla
que antes no estaba** —Producto, Pedido, Factura— y esa tabla dice *"Este
comprobante no tiene líneas leídas"* hasta que el lector corre. O sea que entre la
subida y la lectura hay una ventana en la que el usuario ve una tabla nueva y
vacía, sin que nada esté roto.

**Lo que importa: esto pasa IGUAL EN PRODUCCIÓN.** No es un artefacto de
desarrollo ni una consecuencia de que falte la clave — el comprobante nace en
`PENDIENTE_LECTURA` en `subir/route.js:219` en las dos partes, y la tabla se dibuja
a partir de eso. En producción la ventana es más corta porque el lector corre,
pero existe.

**Y nadie la revisó nunca.** No hay captura de ese estado, no hay candado que lo
afirme, y no está escrito en ninguna doc del módulo si el texto que se muestra es
el que se quiere mostrar. Puede estar perfecto; lo que no hay es constancia de que
alguien lo haya mirado a propósito.

Cuando se lo mire, las preguntas son: si el estado intermedio se entiende sin
explicación, cuánto dura de verdad en producción, y si conviene que la tabla
aparezca antes de tener nada que mostrar o que aparezca recién con las líneas.

## ⚑ LOS ARCHIVOS DE PROVEEDOR VAN FUERA DEL REPO, APUNTADOS POR VARIABLE

**Anotado el 2026-08-17. Es UNA decisión para DOS casos que hasta ahora se
trataban por separado, y por eso ninguno se resolvía.**

### El motivo, que es el mismo para los dos

**Este repositorio es público.** Un Excel de lista de proveedor lleva precios de
compra y nombres de proveedores: es información comercial del negocio, no un
fixture de prueba. No puede entrar al árbol, ni recortado, ni anonimizado a medias
— un recorte con los precios reales sigue teniendo los precios reales.

Por eso la salida no es "buscar un archivo más chico": es que **vivan afuera y el
repo los encuentre por una variable de entorno**, exactamente como
`COMPROBANTES_VOLUMEN_PATH` resuelve el volumen de fotos.

### Los dos casos

**1 · Los 21 candados que hoy se saltean.** Están descritos en su propia sección
más abajo: 13 esperan `ARCOR_FIXTURE` y 8 `ARCOR_FIXTURE_B`. **La variable ya
existe y el mecanismo ya está**: cada candado la lee y se saltea con su motivo
escrito si no está. Lo que falta no es código — es decidir dónde vive el archivo
y dejarlo ahí.

Mientras tanto, 21 candados que afirman sobre el parser de listas —917 productos,
77 categorías, 887 códigos numéricos— no corren en ninguna máquina que no tenga
esos archivos, así que un cambio al parser puede pasar la suite entera sin haber
sido probado contra un papel real.

**2 · La importación de lista que le falta a la línea de base.**
`22-listas-conciliacion` y `23-listas-armado-dudoso` quedaron afuera porque en
`erpazul_dev` no existe ninguna importación: `/api/proveedores/listas/<id>` da 404
para los ids 1 a 6. Para que existan hay que subir un Excel por la interfaz.

**Son el mismo archivo.** Con el fixture real ubicado afuera y apuntado por
variable, se sube una vez por la interfaz —acción real de la aplicación— y quedan
destrabadas las dos pantallas Y los 21 candados. Resolverlo por separado significa
conseguir dos veces el mismo papel.

### LA DECISIÓN, tomada el 2026-08-17

**Viven en una carpeta FUERA DEL REPO, apuntada por variable de entorno.** Es la
misma forma que ya usa `COMPROBANTES_VOLUMEN_PATH` para el volumen de fotos, y la
que los propios candados ya contemplan con `ARCOR_FIXTURE`.

Lo que **no** es una opción es meterlos al repo "por ahora": un archivo con
precios de proveedor commiteado no se saca del historial con un `git rm`.

### Y SU CONSECUENCIA, que se acepta con los ojos abiertos

**Los 21 candados de `ARCOR_FIXTURE` y la importación de listas corren SÓLO en la
máquina que tenga esos archivos.**

En una sesión de nube —o en cualquier máquina nueva, o en CI— esos archivos no
están, así que:

- los **21 candados siguen salteándose**, con su motivo escrito en la salida de la
  suite: "sin ARCOR_FIXTURE: el Excel real no está en el repositorio";
- y **`22-listas-conciliacion` y `23-listas-armado-dudoso` siguen fuera de la
  línea de base**, declaradas en su README.

**Eso es DECLARADO, no ignorado**, y la diferencia importa: un salteo con su
motivo a la vista es información —dice qué no se probó y por qué— mientras que un
candado que no corre sin avisar se lee como uno que pasa. Es la misma distinción
que la tanda del corredor de la suite dejó escrita.

Lo que hay que tener presente al leer un verde: **la suite en verde en una máquina
sin los fixtures NO significa que el parser de listas esté probado.** Significa que
se probó todo lo demás. Los 917 productos, las 77 categorías y los 887 códigos
numéricos que esos candados verifican sólo se comprueban donde el archivo está.

## ⚑ LOS DATOS DE `erpazul_dev` QUE ESTÁN A PROPÓSITO — no son basura

Todo lo de esta sección se cargó **por la interfaz, con acciones reales de la
aplicación**. Nada escrito a mano en la base. Está acá para que nadie lo barra
creyendo que es resto de una prueba.

### Venta 114, ticket #88 — para la pantalla de análisis de clientes

**Cargada el 2026-08-17.** Dos líneas —AGUA OXIGENADA 10V 100ML y ALA CREMOSO
750ML LIMON AMARILLO—, total $2.303, en efectivo, **con el cliente Minimarket
casiano elegido desde el selector del POS**.

**Para qué:** `/modulos/clientes/analytics` tiene dos tablas y la primera es el
ranking de clientes por facturación **del período por defecto, los últimos 30
días**. Antes de esta venta esa tabla decía "Sin datos en este período", así que
la pantalla no podía dar una huella honesta: se habría guardado el estado vacío
como referencia.

Con la venta cargada, las dos tablas tienen filas y la pantalla pasa el corte del
generador.

**Lo que la distingue de la venta 113:** aquélla se cargó sin cliente —consumidor
final— y por eso no aparece en el ranking. Las dos siguen haciendo falta y por
motivos distintos: la 113 destraba `EditorVentaCorreccion`, la 114 destraba
analytics.

### Y una corrección: el pedido 42 NO sirve para la huella del detalle

Se creía que sí, por tener 24 líneas. **No alcanza.** La única tabla que esa
pantalla dibuja hoy es la de comprobantes, y dice "Todavía no hay comprobantes":
la tabla de líneas era `TablaDetallePedido`, que **se borró el 2026-08-17** por no
dibujarse nunca —ver su sección más arriba—. Vuelto a comprobar ese día con la
sonda de tabla sobre el pedido 42: una sola tabla, cero filas de datos.

O sea que `05-compras-proveedor-detalle` necesita un pedido **con un comprobante
subido**, no un pedido con líneas. Queda declarada afuera de la línea de base
hasta que eso exista.

## ⚑ EL TURNO 49 QUEDA ABIERTO A PROPÓSITO — no es un turno olvidado

En `erpazul_dev`, local `depo`. **No hay que cerrarlo sin leer esto.**

Es el único camino para volver a medir `EditorVentaCorreccion`, que es la única de
las cuatro tablas con `tdClassName` que se puede abrir. La pantalla exige que el
turno ORIGINAL de la venta esté abierto: con el turno cerrado dibuja el panel de
bloqueo en vez de la tabla, y la sonda se pone roja porque no hay filas que medir.

Cuando se relevó, **las 54 ventas con más de una línea que había en la base tenían
el turno cerrado**, o sea que no había ni un caso medible. Por eso se creó éste.

**Cómo se creó, que importa porque es la regla 4:** no se escribió nada en la base.
Se abrió la caja desde la pantalla de "Abrir caja · sin tomar un cambio anterior",
contando diez billetes de $1.000 —$10.000— con el origen escrito, y se cargó la
venta apretando el POS: dos productos buscados y tocados, cobro en efectivo con
pago exacto. Todas acciones reales de la aplicación.

Lo que quedó: **turno 49 abierto** y **venta 113, ticket #87**, dos líneas —AGUA
OXIGENADA 10V 100ML a $443 y ALA CREMOSO 750ML LIMON AMARILLO a $1.860—, total
$2.303. Con sus consecuencias de verdad: una unidad menos de stock de cada
producto y $2.303 más de efectivo en la caja del turno.

**Si alguien lo cierra**, `EditorVentaCorreccion` vuelve a ser inmedible y hay que
repetir todo el procedimiento de arriba. Cerrarlo no está mal —es dev— pero es una
decisión, no limpieza.

## ⚑ SIETE CANDADOS DEL CONTRATO VIEJO POR REESCRIBIR — pendiente DECLARADO

**Corregido el 2026-08-17.** Esta sección decía "UN CANDADO EN ROJO QUE NO ES DE
ESTA TANDA, y está diciendo algo", y **nunca hubo tal rojo**. Lo escribí yo el
mismo día leyendo mal la salida de la suite: el mensaje que tomé por una
`AssertionError` suelta venía de una prueba marcada como PENDIENTE a propósito.

Lo que hay de verdad está en `lib/proveedores/listas/panelDecision.test.mjs:139`:

    test("EXCLUIDO ya no es un estado del enum",
         { todo: "quedan 7 candados del contrato viejo por reescribir" }, …)

Es un `todo` de `node:test`, o sea una anotación deliberada de quien lo escribió.
El archivo pasa 31 de 31 y no falla nada. En la suite sale con `⚠` y no con `✖`, y
así se cuenta: **1 pendiente declarado**, no un fallo.

**Lo que SÍ queda por hacer, y es real:** reescribir esos siete candados contra el
contrato nuevo. `ESTADO_LINEA.EXCLUIDO` existía en el enum y nada lo escribía
nunca, porque pisar el estado perdería el motivo por el que la fila estaba así y
desexcluir no podría restaurarlo — la exclusión vive en `excluidaManual`. Es la
regla 3, un hecho una columna. Los siete todavía afirman sobre el enum viejo.

**Mientras no se reescriban, ese `todo` es un candado apagado**: no defiende nada
y no se queja. La forma de la tanda es abrir ese archivo, ver cuáles son los siete
y reescribirlos contra `excluidaManual`, o borrarlos si el caso ya lo cubre otro.

Y la lección de por qué esta sección estuvo mal dos veces seguidas: **un `todo` y
un rojo se parecen en la salida de la suite si uno mira el mensaje y no el
símbolo.** Antes de anotar un candado como rojo, correr ese archivo solo y mirar
el conteo — `pass`, `fail` y `todo` van en líneas distintas.

## ⚑ LAS CINCO TABLAS DE CLIENTES A `text-xs` — tanda de aspecto

**Debería estar acá desde `64bdb62` y no estaba.** Ese commit dice, textual,
"Queda anotado en el roadmap como tanda de aspecto propia", y la anotación nunca
se escribió. Se encontró el 2026-08-17 revisando el archivo entero contra el repo,
buscando justamente pendientes que figuraran en los commits y no acá.

**Qué pasó.** Cinco `SunmiTable` de clientes pasaban `className="text-xs"` y la
pieza lo descartaba en silencio, porque no declaraba la prop. Tres en
`app/modulos/clientes/[id]/page.jsx` —líneas 334, 447 y 785— y dos en
`app/modulos/clientes/page.jsx` —1542 y 1888—. En `64bdb62` se sacaron las cinco:
no movían nada, porque ya se ignoraban.

**Por qué es una tanda de aspecto y no plomería.** Ahora `SunmiTable` SÍ acepta y
negocia `className` (`0eed768`). Devolvérselas haría que se apliquen de verdad: las
cinco tablas pasarían de 12 px a 10,5, en dos pantallas que Emanuel mira seguido.
Eso es una decisión de cómo se ve, no de código, y por eso quedó separada del
commit de plomería.

**Lo que hay que decidir:** si esas cinco tablas van en 10,5 px o se quedan en 12.
Si van, el cambio es devolver el `className` a las cinco líneas. Si no van, esta
entrada se cierra y no se toca nada.

## ⚑ LOS 21 CANDADOS QUE SE SALTEAN POR FALTA DE FIXTURE

**Anotado el 2026-08-17.** Es la tercera forma de candado que no se ejecuta, y las
otras dos ya están cerradas: el archivo corre, pero adentro saltea.

Son 21, todos del mismo módulo y bien declarados —cada uno dice por qué—:

- **13** se saltean sin `ARCOR_FIXTURE`: el Excel real del proveedor no está en el
  repositorio.
- **8** se saltean sin `ARCOR_FIXTURE_B`: la exportación con códigos de barras,
  ídem.

**No es un defecto y por eso no se arregló**: un Excel de proveedor no va en el
repo. Queda anotado por dos motivos. El primero, que 21 candados que afirman sobre
el parser de listas —917 productos, 77 categorías, 887 códigos numéricos— **no
corren en ninguna máquina que no tenga esos archivos**, así que un cambio al parser
puede pasar la suite entera sin haber sido probado contra un papel real.

El segundo, que el número no está vigilado por nada: si mañana son 40, nadie se
entera. **Lo que haría falta es decidir dónde viven esos dos archivos** —una
carpeta fuera del repo con la ruta en el `.env`, o un fixture recortado y anónimo
que sí se pueda commitear— y que la suite diga en voz alta cuántos salteó.

## ⚑ SIETE CANDADOS DEL CONTRATO VIEJO — ver más arriba

El `todo` de `lib/proveedores/listas/panelDecision.test.mjs:139`. Está descrito en
la sección "SIETE CANDADOS DEL CONTRATO VIEJO POR REESCRIBIR", unas líneas más
arriba; se nombra también acá porque en el relevamiento del 2026-08-17 figuraba
como pendiente sin anotar y conviene que aparezca buscando por "contrato viejo".

## ⚑ `--accent` — MEDIDO Y DECIDIDO EL 2026-08-17. **NO IMPLEMENTADO.**

> **ESTADO: listo para retomar.** Está todo medido y la decisión está tomada. Lo
> que falta es escribir el token en los catorce temas y comprobarlo. **Nada de
> esto se tocó en el código: el defecto sigue vivo en producción.**

### LA DECISIÓN, para no volver a discutirla

**Un `--accent` propio, calculado por tema**, conservando el tono del acento de
cada uno y bajándole luminosidad hasta que el blanco encima llegue a 4,5.

**Por qué ésa y no otra, en una línea:** es **la única que llega a 14 de 14**, y la
única que sobrevive a que la pantalla se rehaga — no depende de qué haya detrás del
botón ni de qué forma tenga el resalte.

Siete temas no necesitan ningún cambio; el resto se oscurece un poco. **Lo que sí
cambia es el aspecto**: en los temas ámbar el botón seleccionado pasa de amarillo
brillante a un dorado apagado. Eso está aceptado y forma parte de la decisión.

### LOS SIETE USOS, EN TRES ARCHIVOS — no era un botón

La primera anotación decía "el botón de balances". `git grep` sobre el repo entero
dio **siete usos y TRES FORMAS distintas**, y eso cambia el alcance de la tanda:
lo que se decida mueve las tres a la vez.

- **Fondo de un botón seleccionado** (4): `auditoria-pos-ventas/balances/page.jsx:220`
  y `auditoria-pos-ventas/productos/page.jsx:183`, `:198` y `:210`. Los cuatro con
  `text-white` al lado.
- **Borde** (1): `balances/page.jsx:228`, un `border-l-2` en el panel de comparación.
- **Subrayado** (1): `productos/page.jsx:233`, una barra de 2px.
- **Círculo con la inicial** (1): `components/operador/OperadorSelector.jsx:51`, con
  **texto blanco de 10px en negrita** — el caso más exigente de los siete, y encima
  en un componente compartido, así que aparece en más de una pantalla.

**El candado `tokensDefinidos.test.mjs` sólo nombra el primero.** Al retomar, esa
lista hay que ampliarla o el candado sigue describiendo un problema más chico del
que hay.

### QUÉ SE VE HOY, medido

Calculado sobre `app/globals.css` para los catorce, y verificado en pantalla en dos
—uno claro y uno oscuro— con capturas ancladas al botón.

Como la propiedad es inválida, el fondo no se pinta y queda lo que haya detrás. El
resultado se parte en dos:

- **Los nueve temas claros: el botón seleccionado es ILEGIBLE.** Blanco sobre el
  fondo de página da entre 1,04 y 1,13, y **sobre el fondo de tarjeta da 1,00
  exacto** — blanco puro sobre blanco puro. **El estado activo es PEOR que el
  inactivo**, que se lee perfecto.
- **Los cinco oscuros sí se distinguen, pero no por lo que el diseño quería.** El
  texto pasa de gris apagado a blanco brillante, con 16 a 20 de contraste. Se nota,
  pero no hay pastilla de color: quedó la mitad del efecto.

En ningún tema son idénticos: en los oscuros se distinguen por brillo, en los claros
se distinguen para peor.

### LAS CINCO SALIDAS COMPARADAS — cuántos de 14 llegan, y el peor caso

El peor caso es el que decide, porque es el tema donde el botón queda ilegible.

- **Como está hoy** — 5 de 14. Peor: **1,00**.
- **`--accent` = `--pos-accent`, texto blanco** — 7 de 14. Peor: **1,67**.
- **`--accent` = `--pos-accent`, texto negro** — 7 de 14. Peor: **1,41**. No mejora:
  cambia CUÁLES fallan, no cuántos. Los ámbar suben a 12,58 y los azules oscuros se
  caen a 2,84.
- **`--accent` propio calculado — LA ELEGIDA** — **14 de 14**. Peor: **4,52**.
- **Anillo o subrayado, sin tocar el texto** — 13 de 14. Acá el umbral es 3,0 y no
  es una concesión: 4,5 rige para TEXTO y un anillo es elemento no textual
  (WCAG 1.4.11). El texto queda con el par del tema —de 13 a 18 en los catorce— y
  el anillo pasa en trece. Falla `sunmiLight` con **2,91** contra 3,0.

**Por qué se descartó el anillo, que era la otra candidata seria:** llega a 13 y no
a 14, cambia la forma del resalte de pastilla llena a contorno, y de todos modos
habría que oscurecerlo en `sunmiLight`. Con eso pierde su ventaja —no tocar ningún
color— y sigue sin llegar a los catorce.

### AL RETOMAR

El medidor está en el historial de esta sesión y se rehace en minutos; lo que no
hay que repetir es el error que tuvo: **el primer patrón leyó 13 temas y no 14**,
porque `sunmiDark` no abre llave en su propia línea —comparte bloque con
`html:not([data-theme])`, separados por coma— y el medidor informó "13 de 14" tan
tranquilo. Cualquier medidor por tema tiene que contar los nombres declarados en la
hoja aparte y frenar si no coinciden.

---

**Lo que sigue es la medición original del 2026-08-17, que sigue valiendo:**

**Separado del resto el 2026-08-17 a propósito.** Los otros seis tokens huérfanos
son deuda: no rompen nada que se vea. Éste sí, y por eso va aparte.

**Dónde.** `app/modulos/auditoria-pos-ventas/balances/page.jsx:220`, en la clase
condicional del botón de filtro:

    ? "bg-[var(--accent)] text-white shadow-sm"

**Qué se ve, medido en el navegador con control.** `background-color` calculado da
`rgba(0, 0, 0, 0)` — **exactamente lo mismo que no declarar nada**. `--accent` no
lo define ningún tema y la declaración no tiene respaldo, así que la propiedad
queda inválida y el fondo se hereda.

O sea que **el botón SELECCIONADO se dibuja igual que los no seleccionados**,
salvo por el `text-white` que sí se aplica. Queda texto blanco sobre el fondo
heredado, sin ningún resalte. En un tema claro eso es blanco sobre casi blanco.

El control de la medición: un gemelo con `var(--pos-accent)` —token que sí
existe— da `rgb(251, 191, 36)`, así que la medición distingue "se aplicó" de
"heredó". El primer intento usó `--app-fg` de gemelo y no distinguía; esa corrida
se descartó.

**Por qué no se arregló en la tanda del `--pos-warning`:** ahí lo que faltaba era
el valor de un token que ya tenía respaldo y andaba. Acá hay que decidir DOS
colores a la vez, y ésa es la tanda entera. **No se tocó nada.**

### ⚠️ LA DECISIÓN NO ES EL FONDO: ES EL PAR FONDO + TEXTO

Esto es lo que hay que entender antes de escribir una línea, y es el motivo de que
no sea un pendiente de un renglón.

La reparación obvia es apuntar la clase a `--pos-accent`, que ya existe, está
definido en los catorce temas y está pensado justo para un resalte. **Y arreglar
el fondo así rompe el texto**: el `text-white` que va pegado en la misma clase
pasaría a ir sobre el ámbar del tema, y **blanco sobre `#fbbf24` da 1,67** contra
un mínimo de 4,5. Calculado, con el control de la fórmula al lado.

O sea que hoy el botón seleccionado no se resalta, y la reparación directa lo
dejaría resaltado pero con el texto ilegible. **Ninguna de las dos mitades se
puede decidir sola.**

**ES EL MISMO CANJE DEL RECUADRO DE CAJA DEL TURNO, y conviene tenerlo presente
porque ya se pagó una vez.** Allá arreglar el fondo del recuadro EMPEORÓ el rótulo
en cuatro temas —de 5,33–6,81 a 2,31— porque el rótulo pasaba por accidente
gracias a un fondo que era oscuro por el defecto que se estaba arreglando. Se
descubrió después, y hubo que abrir una tanda aparte para los grises. Acá el
número está antes, así que no hay excusa para repetirlo.

**Las tres salidas posibles, y las tres son de aspecto:**

1. Apuntar a `--pos-accent` **y cambiar el texto** —de `text-white` a un color
   oscuro sobre el ámbar—. Hay que medir el par en los catorce, no en uno.
2. Definir `--accent` como un color propio del resalte, elegido para que el blanco
   encima llegue a 4,5. Eso lo cumple un ámbar oscuro o un azul; en los temas
   claros el margen es chico.
3. Cambiar la forma del resalte en vez del color: borde, sombra o peso de letra,
   sin fondo. Se sale del canje por completo y es lo más barato de medir.

**Cómo se verifica, sea cual sea la elegida:** el par se mide con la sonda de
contraste en los catorce temas —la misma de `--pos-warning`, con sus dos
controles: la fórmula y que el tema cambie de verdad— y sobre el botón real de
`balances`, no sobre un color suelto. Y va con captura, porque un resalte se juzga
mirándolo.

## ⚑ LOS CINCO TOKENS HUÉRFANOS SIN DEFINIR — MEDIDOS, no arreglados

**Medido el 2026-08-17 en el navegador, sobre las pantallas reales.** No se tocó
nada: la pregunta era qué se está viendo hoy en lugar de lo que alguien escribió.

**EL CONTROL, que es lo que hace que los números valgan.** Cada medición se hace
contra un GEMELO que usa `--pos-accent` —un token que sí existe— para poder
separar "se aplicó" de "heredó". El primer intento usó `--app-fg` de gemelo y **no
distinguía**: ese token vale lo mismo que el color de texto heredado, así que el
gemelo daba igual que un elemento sin declarar nada. Esas dos mediciones se
tiraron y se rehicieron.

**Y una corrección al relevamiento anterior: sólo TRES van sin respaldo, no cinco.**
Se había leído el `var(` sin mirar lo que venía después de la coma.

### Lo que se ve hoy, uno por uno

- **`--accent`** — `bg-[var(--accent)]` en `auditoria-pos-ventas/balances:220`.
  Da `rgba(0,0,0,0)`: **idéntico a no declarar nada**. Es un NO-OP, y **es el
  único de los cinco con daño visible**: marca el estado SELECCIONADO de un botón,
  así que ese botón queda con `text-white` sobre el fondo heredado y sin ningún
  resalte. Quien lo escribió esperaba un fondo de acento.
- **`--border`** — `border-[var(--border)]` en `auditoria-pos-ventas/cajas:95`.
  **NO es un no-op**: da `rgb(226,232,240)` contra `rgb(229,231,235)` sin declarar.
  Al quedar inválida, la propiedad cae a `currentColor`, o sea al color del texto.
  El borde se ve, pero es del color de la letra en vez del borde del tema.
- **`--foreground`** — color de texto en `auditoria-pos-ventas/turnos:372`. Da
  `rgb(226,232,240)`, **idéntico a no declarar**. NO-OP, y hoy sin daño: hereda
  justo el color que el token pretendía. Eso depende del tema, así que es suerte y
  no diseño.
- **`--pos-bg-soft`** — `BitacoraAuditoria.jsx:216`. **Tiene respaldo** y resuelve
  a `rgba(127,127,127,0.12)`, que es lo escrito. Anda; lo que falta es que algún
  tema lo pueda cambiar.
- **`--sunmi-warning`** — `ModalAperturaTurno.jsx:133`. **Tiene respaldo** y
  resuelve al ámbar al 12 % adentro del `color-mix`. Ídem.

### El saldo

**De los cinco, uno solo pinta mal algo que se ve**: `--accent`, el resalte del
botón seleccionado en balances. Dos son no-ops sin consecuencia visible hoy
—`--foreground` por suerte, `--border` con el color equivocado pero visible— y dos
funcionan por su respaldo.

Que el daño sea chico no los vuelve inofensivos: **los cinco son declaraciones que
alguien escribió creyendo que hacían algo.** El que las escribió no tiene forma de
enterarse, porque no hay error ni pantalla rota. De eso se ocupa ahora
`lib/sunmi/tokensDefinidos.test.mjs`.

**Todas las mediciones son del tema por defecto** —el oscuro, con `--app-fg`
`#e2e8f0`—. El no-op de `--accent` no depende del tema; el de `--foreground` sí, y
en un tema claro podría dejar de ser inofensivo. Falta medirlo en los catorce.

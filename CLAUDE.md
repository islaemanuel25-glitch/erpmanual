# ERP Azul - Instrucciones para Claude Code

## Cómo trabajar en este proyecto

Estas diez reglas salieron de errores concretos, y cada una tiene abajo el suyo.
No son preferencias de estilo: son las cosas que ya salieron mal.

### 1. Reusar, no reescribir al lado

Si ya existe una función que decide algo, se reusa. Si hace falta cambiarle la
firma, se cambia — con sus candados corriendo. **Nunca escribir una parecida al
lado.**

*Por qué:* dos funciones que hacen lo mismo no se rompen el día que se escriben,
se rompen el día que una cambia. `productoDelProveedorWhere` mira `proveedor_id`
y `proveedor2_id` y no los vínculos de código, por una razón que está escrita al
lado: un vínculo viejo metía productos ajenos en la conciliación. Una búsqueda
"parecida" en otra pantalla habría sugerido productos que el motor no considera
del proveedor, y nadie se habría enterado hasta ver un costo mal aplicado.

Corolario para el kit: **si una pantalla necesita algo que el kit no tiene, se
agrega al kit, nunca a la pantalla.** Y la pieza que se agrega sale de una
pantalla que HOY funciona, tal cual está — nunca escrita adivinando casos
futuros.

*Por qué:* las dos que se escribieron adivinando sirven para menos casos de los
que hay. `SunmiModalLayout` solo sabe centrar, y hay dos pantallas que por eso no
lo pueden usar. `SunmiButtonIcon` trae `text-amber-300`, `text-red-400` y
`text-slate-400` fijos adentro y no acepta `title` ni `aria-label`: usarlo
empeoraría productos. Una pieza que sirve para menos casos de los que hay no es
media pieza, es una pieza que no se puede usar.

Y la prueba de que salió bien no es que compile: **la pantalla de donde se sacó
tiene que quedar IDÉNTICA**, comparada píxel a píxel y no a ojo. Si aparece una
diferencia, la pieza está mal, no la pantalla.

Corolario, y es del tipo que no se deduce leyendo: **juntar dos hijos de JSX en
una sola cadena mueve píxeles.** El navegador moldea cada nodo de texto por
separado, así que el interletraje del límite entre dos nodos pegados no se
calcula igual que dentro de uno solo. Sacar el par de dos renglones de
`TablaCatalogo` movió 44 píxeles a 1366 por eso, sin cambiar una sola letra del
texto. Cuando se saca una pieza, los hijos quedan como estaban.

Corolario del método, que vale más que el caso: **antes de atribuirle un
movimiento de píxeles a un cambio, correr dos veces la MISMA versión y comprobar
que dan cero.** Si la captura tiene ruido, cualquier diagnóstico es inventado —
se estaría explicando una diferencia que el cambio no produjo. Acá dieron cero, y
recién por eso los 44 píxeles se pudieron atribuir.

Y el corolario del corolario, que es el que faltaba: **reproducible y correcto
son dos preguntas distintas.** Tres fotos idénticas prueban que no hay ruido; no
prueban que la foto sea de lo que uno cree. **Una página de error es
perfectamente determinista.** El arnés informó "la captura sirve como prueba"
sobre una pantalla de error dos veces en la misma tarde — una con el build roto,
otra con un componente que explotaba— y las dos veces las tres fotos salieron
idénticas. Cualquier arnés que se declare apto tiene que contestar las dos
preguntas: que no varía, y que retrató lo que dice retratar.

Corolario sobre los datos del andamio, y es la SEGUNDA vez del mismo patrón —el
primero está más abajo, en el candado del pie con `total: 0`—: **cuando un
andamio necesite datos, la forma se saca de donde vive de verdad en el repo, no
se escribe de memoria.** El menú del sidebar son GRUPOS con ítems adentro; se
escribió como una lista de ítems planos y los dos componentes explotaron. Treinta
segundos de leer el consumidor real habrían evitado dos corridas y un
diagnóstico equivocado.

**EL CÓDIGO NO SE ESCRIBE POR SHELL.** Ni `sed`, ni `>`, ni heredoc, ni
`node -e` que escriba archivos. Se escribe con el editor, siempre. Son dos
motivos y el segundo es peor que el primero.

*El primero:* el shell se come las barras invertidas. Escribir `/\s+/` desde
Bash dejó `/s+/` —que borra las eses de los nombres de clase— y la pantalla se
movió 20.362 píxeles. Peor todavía: eso llevó a informar que el cambio de la
alineación movía la pantalla, cuando lo que la movía era el destrozo. Un
diagnóstico falso sobre una medición correcta. Ya pasó tres veces con backticks,
con `${}` y con `\n`.

*El segundo, que es el que importa:* **un cambio escrito desde Bash no lo ve el
hook del trinquete**, que intercepta `Edit` y `Write`. Por ese camino entra
hardcodeo sin que nadie lo cuente, que es exactamente lo que el trinquete existe
para impedir.

Corolario de cómo nace una pieza: **negocia el `className`, no lo concatena.**
Dos clases de Tailwind de la misma familia tienen la misma especificidad, así que
no decide el orden dentro del atributo sino el de la hoja de estilos — poner las
dos es dejar que gane cualquiera. Cuando esto se escribió eran 16 de 19 los que
concatenaban, y por eso un ancho escrito en la pantalla no se aplicaba;
`SunmiInput` era el único que lo hacía bien, y el porqué sigue estando en
`lib/sunmi/claseAncho.js`. **El número de hoy —14 que negocian contra 19 que
concatenan, sobre los 33 que aceptan `className`— está medido, con qué se contó,
en la sección del kit al final de este archivo.** El corolario no cambió: la
pieza negocia.

Corolario: el default de un valor se define UNA vez. Buscar el rango de aumento
esperado dio cinco lugares distintos, tres de ellos con `?? 10` y `?? 20` escritos
a mano. Cambiar la constante no los habría tocado.

**ANTES DE CONSTRUIR HERRAMIENTA, LEER `docs/PROJECT.md` Y MIRAR `scripts/`.**

Una herramienta duplicada no la atrapa ningún candado: **las dos andan.** No hay
rojo, no hay conflicto, no hay nada que avise. Lo que la delata está escrito en la
documentación y en los encabezados de los candados, no en el código — así que la
única defensa es haber mirado antes.

*Por qué:* `scripts/alias-loader.mjs` ya resolvía el alias y transformaba JSX, y
estaba documentado en `docs/PROJECT.md:245` y nombrado en tres candados de caja;
se escribió un resolutor peor al lado y hubo que deshacerlo en `072c7d0`.

### 2. Verificar ejecutando, no leyendo

Nada se da por bueno porque compile o porque el código se lea bien.

*Por qué:* las cinco fallas de la cadena de backup —`gpg` fuera del PATH,
`--passphrase-fd 0` colgando el proceso, el descifrado colgado, `git clone`
escribiendo en stderr, el clon sin identidad de git— **ninguna era visible
leyendo**. Están todas resueltas y anotadas con su detalle en el skill `/backup`.

Corolario: la comparación tiene que medir lo mismo de los dos lados. Dos capturas
tomadas con ventanas de distinto alto informan diferencias que no existen. Cómo
se saca una captura comparable: `/capturas`.

Corolario, y es el que más veces se cobró: **los candados prueban piezas, la
pantalla prueba el camino, y los defectos viven entre las piezas.** Suite en
verde y build limpio no dicen nada sobre si el camino completo funciona.

Cinco veces en el módulo de comprobante, todas con la misma forma —algo
compilaba, sus candados estaban en verde, y el defecto vivía en el espacio entre
dos piezas que cada candado probaba por separado—:

1. El panel **nunca se montó**: el script que insertaba el JSX comprobaba que el
   archivo hubiera cambiado de largo, y el cambio del import ya lo alteraba.
2. `SunmiInput` sin importar. Es JSX: compila, y explota en el navegador.
3. La cadena de lectores pasaba `archivo` y los lectores esperaban `archivos`.
   La lectura **no anduvo ni una vez**, y el motivo falso —ARCHIVO_NO_SOPORTADO—
   además impedía el pase al respaldo, así que el síntoma señalaba a la pieza
   equivocada.
4. `gemini-2.5-flash` estaba dado de baja. El nombre se escribió de memoria tres
   líneas debajo del comentario que advierte que Google los da de baja sin avisar.
5. El **código del proveedor se leía y se tiraba al guardar**, así que el único
   escalón de la cascada de vínculo que no interpreta nada no podía funcionar
   nunca. Apareció buscando un caso para una captura.

Ninguno lo encontró un candado. A los cinco los encontró abrir la pantalla.

En la práctica: **una tanda que toca una pantalla no está terminada hasta que se
abrió con datos reales.** Y cuando se verifica que un cambio se aplicó, se
comprueba el cambio —que el JSX está, que el texto salió— y no un efecto lateral
como que el archivo pesa distinto.

Corolario, y es el que apagó el candado más importante del proyecto: **un campo
obligatorio en una salida estructurada es una orden de inventar.** Lo que puede
faltar se pregunta aparte, con un booleano que no se pueda derivar de los otros
datos.

`total` era obligatorio en el esquema del lector. Un remito o una planilla no
traen total, pero el campo había que llenarlo igual, así que el modelo ponía el
valor más plausible: **la suma de las líneas**. Y la verificación aritmética
—todo el candado del módulo— compara justamente la suma de las líneas contra el
total. Comparaba la suma contra sí misma: cerraba siempre, con cero de
diferencia, y el comprobante quedaba habilitado para escribir costos. **La
verificación se apagaba sola exactamente en los papeles donde más falta hace.**

Lo peligroso no es que un campo sea obligatorio, es que su valor **se pueda
derivar de los otros**. El contraste está medido sobre el mismo papel y el mismo
modelo: los cuatro campos de identidad —tipo, punto de venta, número, fecha— son
obligatorios y no se derivan de nada, y volvieron en `null` las cinco veces. El
total se deriva, y volvió con la suma exacta las tres veces.

Y el arreglo tiene la forma que hay que recordar: preguntar **aparte** si el
papel trae un total impreso. Un sí o un no no se puede calcular sumando, y por
eso sobrevive a que el modelo tenga ganas de completar el número. La respuesta
manda sobre el dato.

Corolario del corolario: **la defensa puede estar escrita y ser inalcanzable.**
`verificarCoherenciaDeLineas` ya salteaba las líneas sin subtotal impreso, con el
comentario correcto al lado explicando que comparar un número calculado contra sí
mismo no prueba nada — y `subtotalImpreso` era obligatorio, así que nunca llegaba
vacío y esa rama no corría jamás. Lo mismo le pasó al estado `SIN_TOTAL` recién
creado: existía, y un `return` anterior lo hacía inalcanzable. Cuando se escribe
una defensa, hay que ejercer el caso que la activa.

**Un caso quedó abierto a propósito, y conviene saber cuál.** El conteo de
renglones —`lineasEnElPapel`— es obligatorio Y derivable de la cantidad de líneas
transcriptas: tiene la forma exacta del agujero del total, y lo único que lo
defiende es el prompt, que le pide expresamente al modelo que no lo saque de ahí.
No se sacó porque el control sirve —antes del arreglo informó 31 sobre 21
transcriptas, así que sí mira el papel—, pero no hay forma de comprobar desde
adentro si en una lectura dada lo miró o lo copió.

Lo que sí hay es cómo enterarse: **los dos números se guardan en columnas
separadas**, `lineasEnElPapel` y `lineasTranscriptas`. Dentro de veinte facturas
se mira si alguna vez difirieron. Si nunca difieren, el prompt no está
funcionando y el control es decorativo — y se sabrá con datos, no discutiéndolo.

**Y un candado puede estar mirando el lugar equivocado.** Había dos exigiendo que
los mensajes digan qué pasó: uno sobre el catálogo del servidor, otro sobre los
textos de la pantalla. El día que producción se cayó, lo único que se vio fue
"Error interno" — porque ese texto salía del `catch` de la ruta, un TERCER lugar
donde ninguno de los dos miraba. Cuando un defecto que un candado debería haber
atrapado igual pasa, la primera pregunta no es si el candado es débil: es si está
mirando donde el problema ocurre.

Deuda anotada de ese mismo episodio, **recontada el 2026-08-14 con
`git grep -l "Error interno" -- app/api`: son 206 archivos**, no los 188 de
entonces. El candado que los prohíbe cubre solo las rutas del módulo de
comprobante, más la de obtener un proveedor, que se agregó al arreglar el
INC-0006. Cualquier error de cualquier otro módulo sigue llegando igual de mudo.
Bajo `app/api/proveedores` solo quedan **18**.

Y el episodio del INC-0006 le agregó **una segunda mitad que no estaba escrita**:
el mensaje no es el único lugar donde un error se vuelve invisible. **La pantalla
puede descartarlo.** `app/modulos/proveedores/page.jsx` preguntaba por el caso
bueno y no tenía rama para el malo, así que un 500 se veía exactamente igual que
un botón que no hace nada — y ahí el mensaje, mudo o elocuente, daba lo mismo.

**No se relevó cuántas pantallas más hacen eso.** Se arregló la de proveedores y
nada más. Es un conteo pendiente y hay que hacerlo con el criterio de la regla 10:
buscar el patrón en todo el repo, no en el módulo que uno tiene abierto.

Y un corolario sobre los candados: **la forma del dato de prueba tiene que ser la
forma del dato real.** Un pie con `total: 0` y un pie sin el campo no son lo
mismo, y el candado estaba probando el que nunca ocurre.

**Y ÉSE ES EL DEFECTO QUE MÁS SE REPITE. HAY QUE BUSCARLO EN CADA REVISIÓN.**

Un candado montado sobre un dato que el endpoint NUNCA manda queda **verde para
siempre y no cubre nada**. No falla, no molesta, no avisa: se lee como cubierto.
Es peor que no tenerlo, porque cierra la pregunta — nadie vuelve a mirar ahí.

Apareció **tres veces en tres tandas seguidas**, y las tres con la misma forma:
alguien escribió a mano un fixture "razonable" en vez de copiar el que produce el
sistema.

1. **El contador de diferencias sin motivo** (2026-09-11). La barra de cierre
   contaba las líneas con diferencia y sin motivo, derivándolas de
   `pasaFiltro(DIFERENCIAS)`. Ese filtro solo ve líneas YA REVISADAS —
   `estadoDeProducto` devuelve PENDIENTE para todo lo no revisado— y el servidor
   no deja revisar con diferencia y sin motivo. La condición era
   **inalcanzable**: siempre cero. El candado la afirmaba leyendo el fuente, así
   que estaba verde.
2. **`conImporte`** (2026-09-11). Doce candados montaban `FilaProducto` con
   `conImporte: true` para afirmar la fila de dinero. Cuando esa fila se mudó a
   la tarjeta móvil, **nadie pasaba más esa prop**: los doce siguieron verdes
   probando una rama que no se renderizaba en ninguna pantalla.
3. **F7** (2026-09-12). Afirmaba que un no declarado muestra su importe, pasando
   `subtotal: 32500` sobre una línea con `agregadoEnRecepcion: true`. El endpoint
   **nunca** manda eso: `subtotal` sale de `valorizarLineaDelRemito`, que para una
   agregada opera sobre `cantidadPresentada: 0` y devuelve CERO. Por eso el
   candado no vio el `$0,00` de la #195 durante una tanda entera, y el defecto lo
   encontró Emanuel usando la pantalla.

**Cómo se busca**, y es una pregunta que hay que hacerse de cada candado, no una
que se conteste sola:

- **¿De dónde salió este fixture?** Si se escribió a mano, comprobar contra el
  endpoint o contra la base que esa combinación de campos exista. Los tres casos
  eran fixtures plausibles y ninguno ocurría.
- **¿La condición que afirma puede ser verdadera?** Si es una rama, ejercerla:
  romperla a propósito y ver el rojo. Es lo que hace la contraprueba, y es lo
  único que distingue un candado que afirma de uno que acompaña.
- **¿Quién pasa esta prop HOY?** Un `git grep` del nombre. Si la respuesta es
  "solo el test", el candado defiende código muerto.

Y el corolario del corolario: **un candado que pasa a ser inalcanzable no avisa,
pero el código que defendía sí se puede borrar.** Cuando se descubre uno, la
salida no es arreglarle el fixture: es preguntar si la rama que prueba todavía
tiene que existir. En el caso 2 la respuesta fue que no, y se sacó.

Corolario, y es de los que más caro salieron: **una consulta de Prisma no se
prueba con candados ni con el build. Hay que ejercerla contra Postgres.**

Y el detalle que lo hace fácil de saltear: **falla igual con cero filas.** Lo que
Postgres valida son los ARGUMENTOS, no el resultado, así que "la base local está
vacía" NO es motivo para no correrla. Es al revés: correrla contra una base vacía
cuesta segundos y encuentra exactamente lo mismo.

El 2026-08-12 tres rutas pedían `productoLocal` en un `select` de
`ComprobanteLinea`. Esa relación no existe —el modelo tiene el escalar
`productoLocalId` y nada más—. El build compiló, los 3.071 candados quedaron en
verde, y la pantalla de comprobantes se cayó en producción. La subida se veía
rota sin estarlo: subía bien y fallaba al recargar la lista, así que el error de
la recarga tapaba el éxito de la subida.

Nada podía atajarlo: Next no mira los argumentos de Prisma al compilar y los
candados son funciones puras que no tocan la base. Es la misma familia que el
cliente sin regenerar, y las dos terminan igual — **algo que no falla donde se
rompe.**

En la práctica, después de escribir o cambiar una consulta: correrla, con su
forma exacta, contra la base. Y comprobar que esa corrida atrapa la versión mala,
o no se sabe si prueba algo.

Corolario: **después de tocar `schema.prisma`, correr `prisma generate` antes de
probar nada.** Esto no lo ve ni el build ni los candados. El proyecto es
JavaScript, así que Next compila sin mirar los argumentos de Prisma, y los
candados son funciones puras que no tocan la base: los dos pasan en verde con un
cliente viejo. La consulta falla recién contra Postgres, con un mensaje que
además apunta a otro lado —`Unknown argument`, o un P2022 nombrando una columna
que no existe—. La migración aplicada no alcanza: el cliente se genera aparte.
En la imagen esto ya está resuelto —el Dockerfile corre `prisma generate` antes
de `npm run build`, con el CLI fijado en `dependencies`— y el que falta es
siempre el de la máquina de quien está probando.

### 3. Un hecho, una columna

El veredicto del motor y la decisión de una persona son datos distintos y no se
pisan. Ante la duda: dos hechos y un predicado que los lea juntos.

*Por qué:* `ESTADO_LINEA.EXCLUIDO` existía en el enum y **nada lo escribía nunca**.
La exclusión vive en `excluidaManual`, una columna aparte, porque pisar el estado
perdería el motivo por el que la fila estaba así — y desexcluir, que es
reversible, no podría restaurarlo. El contador que sí contaba por estado daba
siempre cero mientras las filas excluidas se contaban bajo su estado original.

Mismo caso con la confirmación: no se borra al revincular, **vence**. Se compara
`confirmadoEn` contra `vinculadoEn` y la autoría se conserva.

### 4. No fabricar datos para probar

Si un caso no se puede ejercer con los datos reales, se dice. No se inventa una
fila para que la captura salga linda.

*Por qué:* una captura de un caso fabricado prueba que el código dibuja algo, no
que el caso ocurra ni que se vea así cuando ocurra. En `erpazul_al` no hay
ninguna fila en `ERROR` ni en `BLOQUEADO`: esos cuerpos quedaron sin captura y
eso es información, no una tarea pendiente disfrazada.

Ejercer una acción real de la aplicación —excluir una fila desde la interfaz— sí
vale. Escribir en la base para simularla, no.

### 5. Los candados no se aflojan

Si un test se pone rojo, se entiende qué afirma y se reescribe sabiendo qué se
está cambiando. **Nunca se ajusta el test para que pase.**

*Por qué:* un candado en rojo es información. El que decía "el error no bloquea la
cola" encontró que una fila con `ERROR` desaparecía de la lista, dejando un
problema que nadie podía resolver porque nadie lo veía. Si se hubiera "arreglado"
el test, el bug seguiría ahí con el suite en verde.

Cuando un cambio deja candados del contrato viejo en rojo y no hay margen para
reescribirlos bien, **se revierte el cambio y se anota**, no se commitean rojos.

**UN CANDADO Y LO QUE NECESITA PARA CORRER SON LA MISMA UNIDAD REVERTIBLE.** Un
commit trajo un candado que importaba `esComentario` del contador y la
exportación se quedó en el árbol sin commitear. Ese commit, en `origin/main`, no
compilaba su propio candado.

Corolario, y es el que lo ataja: **antes de empujar, la suite se corre contra el
COMMIT, no contra el árbol.** Con `git stash` o con un clon limpio. Es un paso
del procedimiento, no una intención.

*Por qué:* el verde de la suite era del escritorio, no del commit. Todo estaba en
verde y lo empujado no compilaba. Un `git stash` de treinta segundos lo mostró
—`does not provide an export named 'esComentario'`— y fue el mismo comando que
después sirvió para diagnosticarlo. Correrlo antes cuesta lo mismo que correrlo
después de romper.

Corolario que solo aparece al mudar código: **después de sacar algo a un
componente, hay que releer los candados que tocaban el archivo original —sobre
todo los que quedaron en VERDE.** Un candado que lee un archivo y busca un patrón
sigue pasando cuando el patrón se fue a otro lado: no afirma nada y no se queja.

Al mudar la tabla del detalle del pedido, dos se pusieron en rojo y esos avisaron
solos. El que importa es el tercero: el del botón de editar producto afirmaba
cuatro cosas sobre un archivo, y después de la mudanza tres seguían ahí y una se
había ido. Reescribirlo obligó a mirar qué quedaba de cada lado, y ahí apareció
lo que faltaba: **nadie comprobaba que la página le PASARA el permiso a la
tabla.** Sin eso el botón no aparece nunca, y las afirmaciones viejas seguirían
todas en verde. La mudanza abrió esa grieta y solo se vio releyendo.

En la práctica: `git grep` el nombre del archivo mudado en los `*.test.mjs`, y
releer cada uno preguntando qué afirma HOY, no si pasa.

**Y EL PRIMO HERMANO, QUE YA VA POR LA TERCERA VEZ: UN CANDADO QUE BUSCA TEXTO
ENCUENTRA LOS COMENTARIOS.** No es el caso de arriba —ahí el patrón se mudaba—:
acá el patrón está, pero **en prosa**, y el candado lo toma por código.

Las tres, para que se reconozca la forma:

1. **El contador de hardcodeo subió +1** por un comentario que nombraba la clase
   de la capa de un modal. Falso positivo: molesta y se ve.
2. **Un candado de la pantalla de proveedores dio ROJO** señalando una línea que
   estaba adentro de un comentario. Falso positivo otra vez.
3. **El candado de `Escape` dio VERDE con el chequeo de `destructivo` sacado**,
   porque encontraba la palabra en un comentario tres líneas más arriba.

**La tercera es la peligrosa y las dos primeras no lo eran.** Un falso positivo
frena y se mira; un falso VERDE deja el candado escrito, en la suite, afirmando
nada. Y no se distingue leyéndolo: se ve igual que uno que funciona.

Lo que las separa: **un candado que mira código tiene que sacar los comentarios
antes de mirar.** Una línea —`texto.replace(/\/\/[^\n]*/g, "")`— y el problema se
va para los tres casos.

Y lo que lo atrapó no fue leer el candado: **fue la contraprueba.** Romper a
propósito lo que el candado dice defender es lo único que distingue un candado
que afirma de uno que acompaña. Por eso no es opcional.

### 6. Scripts que tocan la base

Ver la sección **"Scripts que tocan la base"** más abajo, que tiene las reglas
completas con su caso de origen. En una línea: nadie construye `PrismaClient`
directo, la fábrica se importa primero, el nivel sigue al modo y no al script, y
un paso de datos que corre en producción es una migración.

### 7. Commits

Uno por unidad revertible. Si algo no se verificó, va **SIN VERIFICAR** en el
título y con lo que falta en el cuerpo. **Nunca `git add -A`**: se stagea por
ruta, una por una.

*Por qué:* el árbol suele tener trabajo de otras tandas sin commitear. `git add -A`
los arrastra a un commit que no los menciona, y revertir ese commit se lleva
puesto trabajo ajeno. Lo de SIN VERIFICAR es para que quien lea el historial
sepa qué está probado y qué no, sin tener que deducirlo.

El cuerpo explica **por qué**, no qué: el diff ya dice qué cambió.

### 8. Cómo preguntar

Emanuel trabaja desde el celular y tiene que cerrar una app para abrir la otra.
Preguntar de a una cosa por vez le hace perder el día.

- **Todo lo que el código determina, se resuelve leyendo el código** y se informa
  la conclusión. No se pregunta.
- **Solo se pregunta lo que es genuinamente una decisión suya:** algo que cambia
  comportamiento, que gasta plata, o donde hay dos caminos defendibles.
- **Las preguntas van todas juntas al final del informe**, con el costo de cada
  opción. No repartidas durante el trabajo.
- **Si algo bloquea, se avanza con todo lo demás** y se informa el bloqueo al
  final. No se frena la tanda entera esperando una respuesta.

Sin bloques de código ni tablas en los informes: al copiarlos al teléfono los
bloques quedan como "Código" y las tablas se desarman. Texto corrido y listas.

### 8.bis. Lo que NO se hace en una tanda

Las diez reglas de arriba dicen qué hacer. Ésta dice qué **dejar de hacer**, y
existe porque todo lo que sigue se hizo más de una vez sin que nadie lo pidiera.

**NO se sacan capturas de pantalla como entregable.** Ni con el arnés, ni con
`screenshot()`, ni "para mostrar el resultado". Emanuel no corrige mirando una
foto: abre la pantalla en su celular y la usa. Una captura cuesta tokens, alarga
la tanda y no la mira nadie.

*La única excepción:* cuando la tanda es específicamente **de medición** —medir
un desborde, comparar un antes y un después— y **el número medido es el
entregable**. Ahí la imagen es un subproducto del que se saca el número, no el
informe. El criterio se comprueba con una pregunta: si lo que se va a informar es
"se ve bien", la captura sobra; si es "mide 310 × 52 y el contrato pedía 358 ×
52", la medición es el punto.

**NO se corre el arnés completo con navegador después de cada arreglo.** Solo
cuando la tanda es de relevar defectos. Verificar ejecutando —la regla 2— no
significa correr todo el arnés cada vez: significa ejercer lo que se tocó.

**NO se corre la suite más de una vez por tanda.** Una sola, al final, contra el
HEAD que se va a empujar. Si hay que ir a un candado puntual mientras se
trabaja, se corre ese archivo, no la suite entera. Y si una corrida falla por el
entorno y no por el código, se arregla el entorno ANTES de repetirla — repetir
con el entorno roto es exactamente la repetición que hay que eliminar.

**El informe va corto.** No se narra el camino recorrido ni se listan los
archivos tocados, salvo que un archivo haga falta para entender una decisión. El
diff ya dice qué cambió; el informe dice qué pasa ahora.

**Y lo que SÍ se informa siempre, aunque el informe sea corto:** qué quedó **sin
verificar**, y **qué medidas del contrato no se cumplieron y por qué**. Son las
dos cosas que nadie puede deducir leyendo el código, y las dos que se vuelven
caras cuando faltan: una medida aproximada en silencio se descubre en el
teléfono, y algo dado por verificado sin estarlo se descubre en producción.

### 9. Cuándo frenar

No empezar un cambio delicado sin margen para verificarlo. **Mejor decir "no
llegué" que dejar el motor a medias.**

*Por qué:* un cambio a medias en `conciliarFila` o en `aplicacion.js` es un
cambio en lo que decide qué costos se escriben en producción. Dejarlo sin
verificar es peor que no haberlo empezado, porque el commit siguiente lo da por
hecho.

Antes de cerrar, commitear lo que esté en verde y anotar lo que falta.

### 10. Los relevamientos se hacen recursivos

**Antes de sacar una conclusión de un conteo, verificar cómo se enumeró.** Y antes
de cambiar un campo compartido, buscar **todos** sus lectores, no los del archivo
que se está tocando.

*Por qué:* dos veces esta semana un conteo salió mal por mirar un solo nivel.
`scripts/generador/fix-admin-role.js` —que hace `rol.update` sobre el rol Admin,
sin ninguna validación y heredando el `.env`— fue **invisible en todas las
auditorías de scripts**, porque estaban hechas con `fs.readdirSync` sobre
`scripts/` y él vive en un subdirectorio. Estuvo ahí todo el tiempo, en la lista
de los peligrosos, sin que ninguna de las tres pasadas lo viera.

Y `confirmar/route.js` no apareció en el primer grep de rutas que reconcilian
porque no llama a `conciliarFila` —hace un `update` directo— así que el patrón
buscado no lo encontraba. Era el único de los tres que escribía la autoría de una
decisión.

**UNA LISTA DE DIFERENCIAS SE ESCRIBE POR LO QUE SE VA A VER, NO POR LO QUE
CAMBIA EN EL CÓDIGO.** "Pasa al encabezado del kit" es verdad y no le avisa a
nadie de nada. "El título deja de ser una cinta ámbar en mayúsculas y pasa a
texto blanco normal" sí.

*Por qué:* con la primera redacción, el punto más visible de una tanda —cinco
modales perdiendo la cinta de su título— entró como si fuera un detalle de
plomería, y solo apareció al mirar la captura. Es la diferencia entre una lista
que sirve para comparar y una que sirve para tranquilizarse.

**UNA FIRMA QUE AGRUPA SE COMPARA CONTRA LO QUE EXISTE, NO CONTRA UNA LISTA DE
RASGOS ELEGIDA DE ANTEMANO.** Y antes de usar un agrupamiento para planificar, se
abre UN CASO DE CADA GRUPO y se comprueba que la firma dijo la verdad.

*Por qué:* es la quinta vez del mismo patrón y la más cara. Para planificar la
migración de los modales se agrupó por cuatro rasgos elegidos a ojo —velo,
encabezado, ancho de tarjeta y alto—. La firma decía que cuatro modales diferían
solo en el velo. Al abrirlos, tres diferían en SIETE cosas y el cuarto ni
siquiera era del mismo grupo. Comparada contra lo que el kit dibuja de verdad
—capa, velo, panel, tarjeta, encabezado, botón y cuerpo—, la misma medición dio
**23 grupos y no 12**.

Lo que lo salvó fue abrir los cuatro antes de tocarlos. Sin eso, la tanda habría
salido con una lista de diferencias esperadas de un renglón contra un cambio de
siete, y todo lo que no estaba en la lista habría pasado como si estuviera bien.

En la práctica: `git ls-files` y `git grep` recorren el repo entero;
`fs.readdirSync` mira un nivel y `find -maxdepth` lo que se le diga. Cuando el
conteo alimenta una afirmación —"son 54 scripts", "son tres rutas"— decir con qué
se enumeró es parte de la afirmación.

**Y RECORRER EL REPO ENTERO NO ES LO MISMO QUE VERLO ENTERO: `git ls-files` Y
`git grep` MIRAN SOLO LO TRACKEADO.** Un archivo recién escrito y todavía sin
commitear no existe para ninguno de los dos. La corrida entra en verde, se
empuja, y el candado se pone rojo en la tanda SIGUIENTE — cuando el archivo ya
está commiteado y la tanda ya se desplegó.

Es la peor forma del problema porque **es indistinguible de un verde bueno**: no
avisa, no tarda más, no deja rastro. El candado no falló, no pudo mirar.

Pasó dos veces, con los dos comandos. El 2026-08-10 la suite informó 2575
candados con nueve recién escritos que no había corrido —`git ls-files`—. El
2026-09-14 los dos censos de `lib/layout/accionDePagina.test.mjs` dieron verde
sobre una pantalla nueva que consumía el slot —`git grep`— y se pusieron rojos
después de desplegar.

Las banderas son `--cached --others --exclude-standard` para `ls-files` y
`--untracked` para `grep`; las dos respetan `.gitignore`. **Ya no hay que
acordarse:** `scripts/enumeracionesVenLoSinCommitear.test.mjs` recorre todos los
`*.test.mjs` y se pone rojo si alguno enumera sin ellas. Tiene una sola exención
—`andamiosNoSeCommitean`, donde lo trackeado ES la pregunta— y está en una lista
con su motivo, no en un `if`.

Medido con contraprueba, y por eso vale: con una ruta GET sin chequeo de permiso
escrita y sin commitear, `scripts/permisoEnCadaGet.test.mjs` daba **5 en verde y
0 en rojo**. Con la bandera puesta, rojo nombrando la ruta.

Corolario para los campos compartidos: buscar el nombre del campo en todo el
repo, no solo donde se lo está por cambiar. Buscar `aumentoEsperadoMinPct` dio
**cinco lectores en cuatro archivos**, tres de ellos componentes que no estaban
en el plan.

El procedimiento —qué herramienta recorre qué, cómo enumerar por envoltorios y
cómo se informa un conteo— está en el skill `/relevar`.

## Auto-documentación

Al finalizar CADA sesión donde se hayan modificado archivos del proyecto, ejecutar:

1. `node scripts/update-docs.js` — Actualiza docs de módulos afectados, CHANGELOG.md y ULTIMA-ACTUALIZACION.md
2. Verificar que los docs generados sean correctos
3. Commit con mensaje: `docs: auto-update [módulos afectados]`

### Cuándo NO ejecutar
- Si solo se modificaron archivos de documentación (docs/)
- Si solo se modificaron archivos de configuración (.env, package.json)
- Si la sesión fue solo de consulta/lectura

## Estructura del proyecto

- **Framework:** Next.js (App Router) + React + Tailwind CSS
- **Base de datos:** PostgreSQL + Prisma ORM
- **UI:** Sistema de componentes Sunmi (custom)
- **Módulos:** app/modulos/[nombre]/page.jsx
- **APIs:** app/api/[nombre]/[accion]/route.js
- **Componentes:** components/[nombre]/

## Dónde está la memoria del proyecto

`CLAUDE.md` enseña a **orientarse**, no contiene la enciclopedia. Antes de
trabajar:

1. **`docs/PROJECT.md`** — qué es ERP Azul, cómo está armado, quiénes son los
   actores, y el concepto de depósito y local, del que cuelga casi todo lo demás.
   Es breve y estable.
2. **`docs/CURRENT_STATE.md`** — el estado real, con el commit del relevamiento en
   el encabezado. **Comparar ese hash contra `git rev-parse HEAD` antes de
   confiar**: si difieren, es histórico.

Y después, según lo que busques: `docs/business-rules/` para una regla y dónde
está implementada —empezando por `contradicciones.md`, que es lo que hay que
mirar antes de tocar algo—, `docs/architecture/` para cómo está construida un
área transversal, `docs/decisions/` para por qué se decidió algo,
`docs/incidents/` para qué salió mal, `docs/roadmap/` para qué falta, y
`docs/modulos/` para un módulo concreto.

Cada afirmación de esos documentos va etiquetada como verificada en código,
documentada, inferida o dudosa. **Si no tiene etiqueta ni evidencia, no es un
hecho del proyecto.**

## EN EL VPS DE PRODUCCIÓN NO SE INVESTIGA

**El VPS se toca solo desde `/deploy` y desde `/backup`. Nada más.**

No se investiga, **no se restauran bases**, **no se levantan contenedores** y
**no se crean archivos**. Lo que haga falta para entender o medir un módulo
—recorrer pantallas, sembrar datos, simular una regla, cronometrar— va en la
máquina de desarrollo, contra `erpazul_al` y con los archivos de
`erpazul-fixtures-dev`, que es la carpeta hermana del repo.

*Por qué:* el 2026-09-16, relevando el módulo de listas de proveedor, se
restauró una base `erpazul_plan_listas` del backup del día y se levantó un
contenedor `erpazul_plan_app` **al lado de producción**, en la misma máquina y
contra el mismo Docker y el mismo PostgreSQL que atienden a los cinco locales.
No rompió nada, y esa es exactamente la razón por la que hay que escribirlo: se
sintió gratis. Un `next dev` con 917 filas compite por CPU y por conexiones con
el POS, y una restauración de varios cientos de MB compite por E/S con la base
que registra las ventas.

Y hay un segundo daño, más silencioso: **la investigación salió mal igual.** La
base y los archivos de prueba no están en el VPS, así que el circuito completo
—subir el Excel, conciliar de cero, cronometrar— quedó sin recorrer y la mitad
del relevamiento quedó marcada como pendiente. Se pagó el riesgo y no se obtuvo
el resultado.

**En la práctica, lo primero de cualquier tanda de investigación es comprobar
dónde se está**: `hostname`, que exista la base `erpazul_al` y que exista la
carpeta `erpazul-fixtures-dev`. Si falta alguna de las tres, se frena y se dice
—no se sigue en otra máquina "mientras tanto"—.

**La sesión en la nube de Claude Code también es máquina de desarrollo**
(decidido por Emanuel el 2026-09-24, cuando no podía usar su notebook). Ahí
`erpazul_al` y `erpazul-fixtures-dev` no vienen puestos y **se arman en la misma
sesión**, y recién armados cuentan como presentes:

- un PostgreSQL local del contenedor, con `erpazul_al` creada vacía y las
  migraciones del repo aplicadas (`prisma migrate dev`; `migrate deploy` es el
  de producción y la guardia lo frena), más `node prisma/seed.js`;
- los datos mínimos del caso cargados con el código de la app o con un script
  que pida el cliente a `scripts/lib/clientePrisma.mjs` —nunca SQL suelto a
  mano—, y lo que sea una acción de la app, por sus rutas;
- `erpazul-fixtures-dev` como carpeta hermana del repo, con ese script y sin
  commitear.

**Prohibido** traer datos o dumps de producción a ese entorno y conectarse al
servidor `srv1431538`. La sesión de nube no despliega: termina con la rama
juntada en `main` y empujada, y el despliegue lo hace la sesión del servidor.

## Procedimientos que viven en skills

Son recetas de varios pasos, con sus trampas y su verificación de cierre. No se
repiten acá: se invocan.

- **Desplegar a producción** — `/deploy`. Referencia larga en
  `docs/RELEASE-CHECKLIST.md` §3.bis.
- **La cadena de backup** — `/backup`. Restaurar es otro procedimiento y está en
  `docs/RESTAURACION-BACKUP.md`.
- **Sacar capturas comparables** — `/capturas`.
- **Relevar el repo sin dejar niveles afuera** — `/relevar`.

⚠️ **Nunca imprimir secretos**, en ningún contexto y no solo desplegando:
`docker compose config` sin filtrar vuelca `POSTGRES_PASSWORD` en claro. Tampoco
`DATABASE_URL`, ni el contenido de `.env.prod`, ni la frase de cifrado de los
backups.

## Convenciones

- Español en toda la documentación y comentarios de usuario
- Fechas en formato ISO: YYYY-MM-DD HH:mm
- Commits en español con prefijo: feat:, fix:, docs:, refactor:
- Componentes UI usar la librería Sunmi (SunmiCard, SunmiButton, SunmiInput, etc.)
- No usar `<select>` ni `<input>` nativos — usar SunmiSelectAdv y SunmiInput

## Scripts que tocan la base

Reglas que no se negocian. Vienen de un caso real: `new PrismaClient()` sin
argumentos no falla cuando falta `DATABASE_URL` — usa la del `.env`. Había 23
scripts que escribían en `erpazul_dev` creyendo que trabajaban en otro lado, y 19
que hacían `TRUNCATE` de todas las tablas protegidos solamente por que la palabra
"test" no aparecía en el nombre de esa base.

- **Ningún script de `scripts/` construye `PrismaClient` directo.** Todos piden el
  cliente a `scripts/lib/clientePrisma.mjs`, que exige la URL de forma explícita y
  aborta con código 2 si falta, en vez de heredarla. La única excepción es la
  fábrica misma. Tres niveles: `LECTURA` (URL explícita), `ESCRITURA` (además host
  local y `NODE_ENV` distinto de production) y `DESTRUCTIVO` (además nombre exacto
  en lista blanca y `SEED_DESTRUCTIVO` igual a ese nombre). El nivel sigue al
  **modo**, no al script: uno con dry-run pide `LECTURA` al simular y `ESCRITURA`
  al aplicar, así la simulación puede auditar producción sin habilitar escrituras.
- **La fábrica se importa ANTES que cualquier cosa que arrastre a Prisma.** En la
  práctica, primero de todo. `@prisma/client` carga el `.env` al importarse, y la
  fábrica distingue "la puso el operador" de "la puso el archivo" capturando la
  variable antes de que eso ocurra. Si algo carga Prisma antes, esa distinción se
  pierde en silencio.
- **Un paso de datos que corre en producción va como migración de Prisma, nunca
  como script.** Las migraciones ya tienen su lugar en el despliegue, quedan
  registradas y se aplican una sola vez; un script suelto no. Corolario: si algo
  necesita correr en el VPS, no es un script — es una migración.

## El kit Sunmi

Relevado el 2026-09-19 sobre `9eb66e3`. **Enumerado con
`git ls-files --cached --others --exclude-standard 'components/sunmi/*.jsx'`**, que
es el mismo universo que usa `lib/sunmi/propsDelKit.test.mjs` para decidir qué es
"del kit": `components/sunmi/` y un nombre que empieza en mayúscula. Con esa
definición son **56 archivos**. `readdirSync` no sirve acá: la regla 10 de este
archivo tiene el caso.

### Las tres reglas

**1. Las pantallas se arman con piezas del kit.** Nada de elementos crudos ni
medidas escritas a mano. Si la pieza no existe, se agrega al kit sacándola de una
pantalla que HOY funciona — nunca se escribe una parecida al lado, y nunca
adivinando casos futuros. El porqué largo, con los dos casos que salieron mal, está
en la regla 1. Los dos que ya están cerrados: no se usa `<select>` ni `<input>`
nativo —van `SunmiSelectAdv` y `SunmiInput`—, y un tamaño de letra o un alto de
toque van como token del config, no como `text-[16px]` ni `min-h-[44px]`.

**2. El diseño de pantallas se hace en Figma ANTES de implementar.** La pieza no se
inventa mientras se escribe el JSX. `SunmiLinkButton` es el precedente y está
anotado adentro del archivo: su contrato —sin fondo, sin borde, sin radio, sin
padding, el margen exterior es del consumidor— lo cerró el archivo de Figma
`fYqIEZxHRb6yx6pIUrUG2h`, nodo `13:2`, y por eso la pieza no tiene que discutirse
de nuevo cada vez que alguien la usa. **La biblioteca de Figma se arma con los
componentes de este inventario, no con dibujos**: un boceto hecho con rectángulos
produce props que la pieza no tiene, que es el defecto que
`lib/sunmi/propsDelKit.test.mjs` existe para atrapar.

Y una medida que el diseño traiga de la grilla de 16 px de Figma **no se copia
tal cual**: este proyecto corre con `1rem = 14px`, fijado en `app/globals.css`
sobre el `html`. Por eso `h-11` da 38,5 px y no 44. La decisión ya tomada, escrita
en `tailwind.config.js`: los TAMAÑOS DE LETRA del diseño entran a la escala porque
se ven —son los números protagonistas—; los paddings y radios se AJUSTAN a la
escala del proyecto, porque se corren como mucho 1,25 px.

**3. El contador del trinquete.** Vive en `lib/hardcodeo/contador.mjs`; el comando
es `node scripts/hardcodeo.mjs`, con `--trinquete` para comparar y
`--linea-base [--sellar]` para mirar o sellar. La línea de base es
`docs/hardcodeo-linea-base.json` y **no se edita a mano**. El hook
`scripts/hook-trinquete-hardcodeo.mjs` corre en PostToolUse sobre `Edit` y `Write`
de `.jsx` bajo `app/` o `components/`: avisa y no revierte, y si él mismo se cae
deja pasar diciéndolo.

**Que un número suba significa que entró deuda visual**: una decisión de
apariencia escrita en una pantalla en vez de pedida al kit. No es un error de
compilación y no lo ve ningún otro candado. Las salidas son dos y las dos son
explícitas: usar la pieza que ya existe, o subir la base a propósito diciendo por
qué en el commit. El trinquete compara el INVENTARIO —archivo, categoría, texto y
cantidad—, no los totales, así que mover una ocurrencia de lugar también se ve.

Las siete categorías, con el número medido hoy —`--linea-base`, delta cero contra
la base sellada en `266cbe1`—: colores fijos 284; clases del tema paralelo del POS
87; modales armados a mano 34; componentes del kit que pisan la clase recibida 0;
elementos crudos con reemplazo en el kit 283; celdas de tabla escritas a mano 430;
medidas mágicas 1625.

El camino corto para una pantalla concreta —qué tiene hardcodeado y con qué pieza
se reemplaza— es el skill `/revisar-pantalla`.

### Cómo negocia una pieza, que es su contrato real

Una pieza del kit **no concatena el `className` que recibe: cede el eje que la
pantalla declaró**. Las funciones están en `lib/sunmi/claseNegociada.js` —un
`declaraX` por eje, más `tarjetaQueSobrevive`, `paddingQueSobrevive`,
`componerClaseTexto`, `claseDeFila`, `claseDeTabla`, `baseDeBoton`— y en
`lib/sunmi/claseAncho.js` para el ancho de los campos.

El botón es el caso a copiar: `sunmi-btn-base` está partida en nueve sub-clases
—`PARTES_DEL_BOTON`— y cada una cede ante su eje; `sunmi-btn-parte-nucleo` no cede
nunca. Si un tamaño nuevo entra a `tailwind.config.js`, entra el mismo día a
`ESCALA` en `claseNegociada.js`, o el kit no lo reconoce como tamaño y la pieza
vuelve a poner el suyo.

Medido hoy con `git grep` sobre los 56: **33 aceptan `className`. De esos, 14
negocian y 19 todavía concatenan.** Los que negocian: `SunmiButton`,
`SunmiBackButton` —por delegar en él—, `SunmiCard`, `SunmiPanel`, `SunmiInput`,
`SunmiTextarea`, `SunmiSeparator`, `SunmiTable`, `SunmiTableRow`, `SunmiPar`,
`SunmiSelectAdv`, `SunmiSelectorUnidad`, `SunmiModalLayout` y `SunmiProductoCard`.

### Los tokens, que son lo que se dibuja en Figma

- **Escala de letra propia**, en `tailwind.config.js`: `xs2` 10, `sm2` 11, `sm3`
  13, `base` 14, `base2` 15, `md2` 16, `lg2` 17, `lg3` 19, `xl2` 22, `xl3` 28 —
  todos en px. Usados hoy: `text-sm2` 312 veces, `text-sm3` 101, `text-xs2` 46,
  `text-base2` 13 (contado con `grep -rhoE` sobre `app` y `components`).
- **Toque**: `min-h-toque` y `min-w-toque` son 44 px, escritos en px a propósito.
- **Otros del config**: radio `xl2` 14 px, `spacing.4.5` 18 px, `borderWidth.1.5`
  1,5 px, `width.35p` 35 %, sombras `soft` y `card`.
- **El botón, en CSS** (`styles/sunmi.css`): alto mínimo 36 px, radio 0.375rem,
  letra 13 px, peso 500, padding 0.25rem por 1rem, transición 150 ms, `:disabled`
  opacidad 0,5 y `:active` escala 0,98.
- **Medidas de la tarjeta de producto y de las solapas**, como variables CSS:
  hueco de lista 9 px, bloque de valor 202 × 51,5 px con rótulo de 9 px y número
  de 25 px, miniatura 44 px, acción 44 px; solapas radio 7 px con padding 3 px y
  solapa 3,5 px; acción ancha 36 px.
- **Color: nunca fijo.** Sale de las clases `sunmi-*` de `styles/sunmi.css`, que
  leen variables `--pos-*` y `--app-*`. Los temas son **14**, en
  `lib/sunmiThemes.js`: `sunmiDark`, `sunmiDarkCompact`, `sunmiLight`,
  `sunmiGraphite`, `sunmiSand`, `sunmiBlueClassic`, `sunmiFrance`,
  `sunmiFranceSplit`, `operixBluePro`, `operixNight`, `verdeComercio`,
  `grafitoEjecutivo`, `ambarCaja`, `violetaSaas`. Una pieza con `text-amber-300`
  adentro se ve igual en los catorce, que es el defecto que `SunmiButtonIcon`
  tiene anotado.

### El inventario

Los usos están contados así, y el número no significa nada sin eso: **IMPORTAN**
es cuántos archivos lo importan por su ruta —`git grep -l` de
`components/sunmi/<Nombre>"`, excluyendo el archivo mismo—; **USOS** es cuántas
etiquetas `<Nombre` hay en los `.jsx` del repo FUERA de `components/sunmi/`, con
`git grep -oE`. Los dos con `--untracked`. Un componente que otra pieza del kit
usa por dentro tiene USOS bajo y no está muerto.

El detalle prop por prop, largo, está en `docs/03-COMPONENTES-SUNMI.md`. Acá va lo
que hace falta para elegir una pieza y para dibujarla.

**Estructura y superficie**

- `SunmiCard` — 135 / 275. Props: `children`, `className`, resto reenviado.
  Tarjeta `rounded-xl`, `shadow-md`, `backdrop-blur-sm`, padding `p-6`. Negocia
  tarjeta, sombra, difuminado y padding.
- `SunmiPanel` — 10 / 35. Props: `children`, `className`, `noPadding`, `elevado`.
  `rounded-2xl`, padding `px-4 py-4`. `elevado` agrega `sunmi-elevado` y cede ante
  un `outline` de la pantalla. Marca `data-sunmi-panel` para el arnés.
- `SunmiCardHeader` — 11 / 9. Props: `title`, `subtitle`, `children`. Título 15 px
  semibold; subtítulo 11 px. `mb-3 px-1`.
- `SunmiHeader` — 34 / 34. Props: `title`, `color` (`amber` | `cyan`), `subtitle`,
  `children`. Cinta en degradado, `rounded-xl`, `px-4 py-2`, 13 px, bold,
  MAYÚSCULAS. El subtítulo va debajo de la cinta, 11 px.
- `SunmiSection` — 0 / 0. Props: `title`, `description`, `children`, `footer`,
  `noSeparator`, `className`. Título 13 px, descripción 11 px. **Sin consumidores.**
- `SunmiSeparator` — 40 / 89. Props: `label`, `className`. 12 px, `my-2`
  negociado, línea de 1 px del borde del tema.
- `SunmiRow` — 1 / 1. Props: `left`, `right`, `center`, `align`
  (`start` | `center` | `end`), `className`. `gap-3 py-1`.
- `SunmiGrid` — 0 / 0. Props: `children`, `className`, `minWidth` (260),
  `gap` (16). Grilla `auto-fill minmax`, en estilo inline. **Sin consumidores.**
- `SunmiPar` — 1 / 2. Props: `arriba`, `abajo`, `className`, `classNameAbajo`,
  `title`, `titleAbajo`, resto. La línea de abajo es `text-xs2` +
  `sunmi-text-muted`, negociada.

**Acción**

- `SunmiButton` — 188 / 606. Props: `color`, `children`, `className`, resto.
  **Colores válidos, enumerados en el archivo: `cyan`, `amber`, `red`, `slate`,
  `primary`, `secondary`, `warning`, `ghost`.** Un color desconocido cae en
  `slate`, que es visible: antes se quedaba sin fondo y parecía texto suelto.
  `amber` y `primary` pintan el mismo token, así que pedir `amber` para
  distinguirse de `primary` no distingue nada; `ghost` es la ausencia de relleno.
- `SunmiButtonIcon` — 7 / 16. Props: `icon`, `color` (`amber` | `red` | `slate`),
  `size` (16), `onClick`, `className`, resto. `p-1 rounded`. **Los tres colores son
  fijos de Tailwind, no tokens**: se ven igual en los catorce temas. Anotado en el
  roadmap, fase 3.
- `SunmiBackButton` — 40 / 48. Props: `href`, `onVolver`, `texto` ("Volver"),
  `className`. Delega en `SunmiButton` color `slate` con flecha de 15 px. **Va en
  el slot del shell con `useAccionDePagina`** —`lib/layout/accionDePagina.js`, 21
  pantallas—, que vive afuera del `<main>` que scrollea; dibujado adentro del
  contenido se va de pantalla al bajar.
- `SunmiLinkButton` — 4 / 4. Props: `children`, `className`, `type`, resto.
  `text-xs`, `sunmi-text-accent`, subrayado. Sin fondo, borde, radio ni padding: el
  margen exterior es del consumidor. Foco nativo a propósito.
- `SunmiActionCard` — 3 / 3. Props: `children`, `className`, `type`, resto.
  `<button>` de ancho completo, `sunmi-card-surface`, `rounded-lg p-3`.
- `SunmiNavCard` — 4 / 3. Props: `icon`, `insignia`, `label`, `descripcion`,
  `estado`, `href`, `atenuado`, `className`. Redondel `size-12 rounded-xl`, título
  18 px, descripción 14 px. Sin `href` no dibuja la flecha.
- `SunmiEntityCard` — 0 / 0. Props: `title`, `subtitle`, `color`, `icon`,
  `actions`, `children`, `className`. **Sin consumidores.**

**Campos**

- `SunmiInput` — 105 / 247. Props: `className` y todo lo del `<input>`, con `ref`.
  Clase `sunmi-input`; `w-full` solo si la pantalla no declaró ancho. **Es el que
  inauguró la negociación.**
- `SunmiTextarea` — 1 / 1. Igual que el anterior, sobre `<textarea>`.
- `SunmiSelect` — 1 / 3. Props: `className`, `children`, resto. `<select>` nativo
  con flecha. **No se usa en pantallas nuevas: va `SunmiSelectAdv`.**
- `SunmiSelectAdv` — 53 / 98. Props: `value`, `onChange`, `children`,
  `placeholder` ("Seleccionar..."), `className`, `multiple`, `searchable`,
  `onClose`, resto. Las opciones son `SunmiSelectOption` —`value`, `children`,
  `encabezado`—; al buscar, los encabezados se sacan.
- `SunmiSelectConCrearRapido` — 1 / 5. Props: `label`, `value`, `onChange`,
  `items`, `placeholder`, `getOptionLabel`, `getOptionValue`, `crearLabel`
  ("+ Nuevo"), `tituloModal`, `campos`, `onCrear`, `disabled`, `searchable`,
  `puedeCrear`. Con `puedeCrear` en false se oculta el "+ Nuevo"; el backend igual
  exige admin.
- `SunmiCampoCantidad` — 2 / 3. Props: `valor`, `onCambiar`, `etiqueta`, `minimo`
  (0), `maximo`, `paso` (1), `decimales` (0), `normalizaAlSalir`, `difiere`,
  `tipo`, `conMarco`, `claseMarco`, `claseInput`, `tamano`
  (`normal` = 9×9 / `compacto` = 7×7). Con decimales o paso fraccionario acepta
  coma y usa `parseFloat`; sin ellos `parseInt`.
- `SunmiSelectorUnidad` — 2 / 2. Props: `valor`, `onCambiar`, `rotulo`
  ("Ver precios por"), `nota`, `opciones`, `className`. Exporta `UNIDAD`
  (`pack` | `un`) y `OPCIONES_PRECIO`. El radio lo pone el envoltorio, no los
  botones: `SunmiButton` cede las ocho esquinas y un token de un lado repone
  cuatro.
- `SunmiCampoBusquedaVoz` — 5 / 5. Props: `value`, `onChange`, `onVoz`,
  `inputRef`, `placeholder`, `id`, `ariaLabel`, `onKeyDown`, `autoFocus`,
  `className`, `onEscuchandoChange`, `avisoDeEstado`. Exporta `soportaVoz()`,
  `IDIOMA_VOZ` (`es-AR`) y `TEXTO_ESCUCHANDO`.
- `SunmiToggle` — 12 / 14. Props: `value`, `onChange`, `label`, `disabled`. Track
  8×4, thumb 4×4, texto 12 px. **Guarda estado propio con `useState`**, así que un
  `value` que cambie de afuera no lo mueve.
- `SunmiToggleEstado` — 7 / 10. Props: `value`, `onChange`. Track 10×5, thumb 5×5.
  Dice "Habilitado" / "Inactivo".
- `SunmiDateRangePicker` — 1 / 1. Props: `valueDesde`, `valueHasta`,
  `onChangeDesde`, `onChangeHasta`, `onApply`, `placeholder`, `maxDate`,
  `className`. Calendario propio, semana de lunes a domingo.
- `SunmiEscanerCodigoBarra` — 2 / 1. Props: `abierto`, `onCerrar`, `onCodigo`,
  `onSinCamara`, `titulo`, `ayuda`. Exporta `hayEscanerDisponible()`,
  `FORMATOS_CODIGO`, `MOTIVO_SIN_CAMARA` y `MENSAJES_SIN_CAMARA`. El texto de ayuda
  es neutral a propósito: la pieza no sabe qué se escanea.

**Tabla**

- `SunmiTable` — 37 / 53. Dos modos. Crudo: `headers`, `children`. **Por columnas:
  `columnas` —`clave`, `titulo`, `align` (`izq` | `der` | `centro`), `ordenable`,
  `render`, `thClassName`, `tdClassName`, `title`— más `filas`, `claveFila`.** Y
  `densidad` (`compacta` `px-2 py-1` | `normal` `px-2 py-1.5` | `comoda`
  `px-3 py-2.5`), `cargando`, `vacio`, `onSort`, `ordenClave`, `ordenDir`,
  `tonoFila`, `filaExpandible`, `onClickFila`, `filaSeleccionada`, `pie`,
  `stickyHeader`, `maxHeightClass` (`max-h-[70dvh]`), `scrollId`, `altoLibre`,
  `className`.
- `SunmiTableRow` — 26 / 36. Props: `children`, `selected`, `onClick`,
  `className`, `tono`, `intensidad` (`ambiente`). Los tonos son las clases
  `sunmi-fila-*`: `ok`, `atencion`, `alerta`, `apagado`, `fuerte`, `ambiente`,
  `seleccionada`. Tamaño de fila 12 px, en `TAMANO_DE_FILA`.
- `SunmiTableEmpty` — 21 / 24. Props: `message` ("Sin datos disponibles"),
  `colSpan` (50). 12 px, itálica, `py-3`.
- `SunmiTableMaster` — 0 / 0. Props: `columns`, `rows`, `actions`, `page`,
  `totalPages`, `onPrev`, `onNext`, `pageSize`, `pageSizeOptions`,
  `onChangePageSize`, `loading`, `emptyMessage`. **Sin consumidores.**
- `SunmiPaginador` — 3 / 3. Props: `page`, `pageSize`, `totalPages`, `totalItems`,
  `onNext`, `onPrev`, `onGoToPage`, `onPageSizeChange`. Dos diseños, celular y
  escritorio, con `data-paginador` como asidero de captura. Los botones del celular
  son 44×44 escritos en px.
- `SunmiPageSizer` — 4 / 4. Props: `value` (25), `onChange`, `options`
  (25/50/100), `label` ("Mostrar"), `className`.

**Estado y aviso**

- `SunmiAviso` — 13 / 11. Props: `icon`, `titulo`, `children`, `tono`
  (`neutral` | `success` | `danger` | `warning`), `className`. `rounded-2xl p-4`,
  redondel `size-10`, texto 14 px.
- `SunmiPill` — 17 / 45. Props: `children`, `color`
  (`amber` | `cyan` | `green` | `slate`). `px-1.5 py-[1px] rounded-md`, 10,5 px.
- `SunmiBadgeEstado` — 10 / 10. Prop: `value`. Dice "Activo" / "Inactivo".
  `rounded-md`, 10,5 px.
- `SunmiBadge` — 0 / 0. **Es un duplicado de `SunmiBadgeEstado` con otras medidas
  —`rounded-full`, 11 px, `px-2 py-0.5`— y con la función exportada llamada
  `SunmiBadgeEstado` adentro. Prop `estado` en vez de `value`. Sin consumidores:
  candidato a borrar, no a usar.**
- `SunmiEstadoCell` — 0 / 0. Prop: `value`. Centra un `SunmiBadgeEstado`.
  **Sin consumidores.**
- `SunmiLoader` — 66 / 72. Prop: `size` (20). Anillo que gira, `border-2`, en un
  `flex justify-center py-2`.
- `SunmiToast` — 4 / 0. No es un componente con props: exporta `showSuccess`,
  `showError`, `showWarning`, `showInfo` y el `SunmiToaster` que va en el shell.
  **El `SunmiToaster` tiene los colores y el radio escritos fijos, no en tokens.**
- `SunmiSolapas` — 1 / 1. Props: `opciones` (`valor`, `texto`), `valor`,
  `onCambiar`, `etiqueta`. `role="tablist"`, solapa `py-1.5`, `text-sm3`.
- `SunmiChipsFiltro` — 3 / 3. Props: `opciones` (`clave`, `texto`, `cantidad`),
  `valor`, `onCambiar`, `rotulo`, `textoTodas` ("Todas"), `className`. Exporta
  `CLAVE_TODAS`. Scrollea en horizontal y los chips no se encogen.
- `SunmiFiltroEstado` — 1 / 1. Props: `opciones`, `valor`, `onCambiar`, `rotulo`,
  `ariaLabel`, `className`. Grilla de 3, 4 o 5 columnas según cuántas opciones.

**Listas**

- `SunmiProductoCard` — 4 / 4. Props: `nombre`, `empresa`, `codigoBarra`,
  `codigoInterno`, `valor`, `marca`, `aviso`, `acciones`, `ancla`, `destacado`,
  `className`. Exporta además `BloqueValorTarjeta`, `RotuloBloqueValor`,
  `NumeroBloqueValor`, `MiniaturaProductoTarjeta`, `AccionTarjeta` y
  `PieDeCodigosTarjeta`. `aviso` y `marca` son RANURAS: la pieza sabe dibujarlas,
  no sabe cuándo corresponden.
- `SunmiListaProductoCards` — 3 / 3. Solo `children`. Grilla de una columna con
  `auto-rows-fr`.
- `SunmiListItem` — 4 / 19. Props: `label`, `description`, `left`, `right`,
  `onClick`, `clickable`, `className`. Label 13 px, descripción 11 px.
- `SunmiList` — 0 / 0. Props: `children`, `className`. **Sin consumidores.**
- `SunmiListCard` — 1 / 2, `SunmiListCardItem` — 1 / 2, `SunmiListCardRemove` —
  1 / 2. Trío de una sola pantalla. **`SunmiListCardItem` dibuja su separador con
  una clase ARMADA POR CONCATENACIÓN** a partir del borde del tema, así que el
  nombre final nunca aparece literal en ningún archivo y Tailwind no lo genera:
  comprobado, no hay una sola aparición literal de `bg-slate-<n>/20` en `app`,
  `components` ni `lib`, y en once de los catorce temas el borde es un hex
  arbitrario, con lo que la clase pedida sería `bg-[#243244]/20` y tampoco existe.
  **Ese separador no se pinta en ningún tema.**
- `SunmiUserCell` — 1 / 1. Props: `nombre`, `email`. Avatar `w-8 h-8` con
  `bg-amber-400` o `bg-cyan-400` fijos.

**Modal**

- `SunmiModalLayout` — 39 / 43. Props: `open`, `title`, `subtitle`, `color`,
  `onClose`, `children`, `footer`, `maxWidth` (`max-w-xl`), `showCloseButton`,
  `destructivo`, `forma`, `z`, `espacioCuerpo`, `espacioPie` (`mt-3`), `alto`
  (`max-h-[90vh]`). **Formas: `centrado`, `hoja`, `cajon`, `hoja-o-centrado`.**
  Exporta `COLOR_VELO`, `OPACIDAD_VELO` y `NIVEL_MODAL_GLOBAL` (9999); marca la
  tarjeta con `data-sunmi-modal`. `destructivo` significa que tocar el velo no
  cierra, y el criterio es **qué se pierde al cerrar sin querer, no qué tan
  peligrosa es la acción**: lo declaran los de carga y edición, no los de
  confirmación. El nombre arrastra esa confusión y es candidato a renombrarse al
  cerrar la fase 2.

**Infraestructura, no dibujan nada**

- `SunmiThemeProvider` — 13 importadores. Exporta `useSunmiTheme()`; props
  `children`, `institucionalInicial`. Guarda en `localStorage` bajo
  `erp-sunmi-theme`.
- `ThemeClientWrapper` — 1. Envuelve al provider y monta el `SunmiToaster`.
- `AparienciaInstitucionalSync` — 1. Lee `/api/config/apariencia-local` y aplica el
  tema del local. Devuelve `null`.

### Lo que NO es del kit y conviene no confundir

Con nombre Sunmi pero fuera de `components/sunmi/`, y son tablas de una pantalla:
`components/locales/SunmiTableLocales.jsx`,
`components/productos/SunmiTablaProductos.jsx` y
`components/usuarios/SunmiTableUsuarios.jsx`.

Compartido de verdad y fuera del kit hay uno solo: `components/auth/SinPermisos.jsx`,
con 74 importadores —contados con `git grep -l` de su ruta—. El shell vive en
`components/layout/` y su slot de acción en `lib/layout/accionDePagina.js`.

**Y HAY UN `Aviso` PARALELO, DEFINIDO TRES VECES.** `SunmiAviso` existe en el kit
con 13 importadores, y además hay tres componentes llamados `Aviso` afuera, usados
por 13 archivos —enumerado con `git grep -ln 'function Aviso('` y
`git grep -l '<Aviso[ >]'`—: uno en `components/caja/PanelesRetiro.jsx` con tonos
`warning` / `danger` / `info` y `rounded-lg p-2 text-[11px]`; uno en
`components/proveedores/listas/PiezasPantallas.jsx` con `warning` / `danger` /
`success` y `rounded-lg p-3 text-sm2`; y uno privado en
`components/comprobantes/PanelComprobantes.jsx` que dibuja una barra de color con
`bg-current`. Los tres tienen tablas de tonos DISTINTAS entre sí y distintas de la
del kit —`SunmiAviso` usa `neutral` / `success` / `danger` / `warning`, así que un
`tono="info"` cae en neutral sin avisar—.

Es el caso de la regla 1 con nombre y apellido: **la misma cosa visual escrita
cuatro veces.** Para la biblioteca de Figma va UNO, el del kit, y los otros tres
se migran; dibujar los cuatro sería copiar la duplicación al diseño.

**Siete piezas no tienen NINGÚN importador hoy**: `SunmiBadge`, `SunmiEntityCard`,
`SunmiEstadoCell`, `SunmiGrid`, `SunmiList`, `SunmiSection` y `SunmiTableMaster`.
Antes de llevarlas a Figma hay que decidir si existen o se borran: dibujar en la
biblioteca una pieza que el repo no usa es prometer un componente que nadie
mantiene. `SunmiRow` NO está en esa lista: tiene un importador,
`components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`.

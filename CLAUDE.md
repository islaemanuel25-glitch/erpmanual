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

Corolario: el default de un valor se define UNA vez. Buscar el rango de aumento
esperado dio cinco lugares distintos, tres de ellos con `?? 10` y `?? 20` escritos
a mano. Cambiar la constante no los habría tocado.

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

Y un corolario sobre los candados: **la forma del dato de prueba tiene que ser la
forma del dato real.** Un pie con `total: 0` y un pie sin el campo no son lo
mismo, y el candado estaba probando el que nunca ocurre.

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

En la práctica: `git ls-files` y `git grep` recorren el repo entero;
`fs.readdirSync` mira un nivel y `find -maxdepth` lo que se le diga. Cuando el
conteo alimenta una afirmación —"son 54 scripts", "son tres rutas"— decir con qué
se enumeró es parte de la afirmación.

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

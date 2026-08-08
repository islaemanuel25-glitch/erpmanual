# ERP Azul - Instrucciones para Claude Code

## Cómo trabajar en este proyecto

Estas nueve reglas salieron de errores concretos, y cada una tiene abajo el suyo.
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

*Por qué:* de las fallas encontradas esta semana, **ninguna era visible leyendo**.
`gpg` no estaba en el PATH de PowerShell y la tarea habría fallado todos los
domingos como una línea de error perdida. `--passphrase-fd 0` colgaba el proceso
sin timeout, sin mensaje y sin terminar. El comando de descifrado del propio
documento de restauración se colgaba igual. `git clone` escribe su progreso en
stderr y PowerShell lo tomaba por error, así que un clon perfecto se veía como
falla. Un clon nuevo no podía commitear por falta de identidad de git.

Corolario: la comparación tiene que medir lo mismo de los dos lados. Dos capturas
tomadas con ventanas de distinto alto informan diferencias que no existen.

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

## Despliegue a producción

El procedimiento completo está en `docs/RELEASE-CHECKLIST.md` §3.bis. Reglas que no se
negocian:

- **El VPS no construye la imagen.** La construye GitHub Actions y la publica en
  `ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>`. El VPS solo descarga.
- **Nunca `latest`** ni SHA corto. Producción despliega siempre por SHA completo.
- Deben coincidir: SHA de `origin/main`, HEAD del VPS, tag de la imagen, `APP_BUILD_ID`
  y `/api/version`. Si alguno difiere, parar.
- Nada de `docker build`, `docker compose up --build` ni `docker compose down` en el VPS.
  Nunca recrear PostgreSQL: siempre `--no-deps app`.
- `APP_IMAGE` va en el `.env` de Compose del VPS, **nunca en `.env.prod`**.
- Migraciones con `prisma migrate deploy` (**sin `npx`**) en un container one-off de la
  imagen nueva, *antes* de recrear la app.
- Backup validado antes de cualquier despliegue. Registrar el RepoTag fijo o el image ID
  exacto de la imagen anterior y conservarlo: es la referencia de rollback. Nunca usar
  `latest` para volver atrás.

⚠️ **Nunca imprimir secretos**: `docker compose config` sin filtrar vuelca
`POSTGRES_PASSWORD` en claro. Tampoco `DATABASE_URL` ni el contenido de `.env.prod`.

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

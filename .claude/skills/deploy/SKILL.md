---
name: deploy
description: Despliegue a producción por GHCR — backup validado, referencia de rollback, pull, migración en contenedor descartable, recrear solo app y verificación de cierre.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

# Desplegar a producción

**El VPS no construye la imagen.** La construye GitHub Actions
(`.github/workflows/build-imagen.yml`) y la publica en
`ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>`. El VPS solo descarga.

Datos del entorno: alias ssh `vps-erp`, directorio `/srv/produccion/erpazul`,
compose `docker-compose.prod.yml`, contenedores `erpazul_app` y `erpazul_db`,
dominio `https://operix.cloud`, backups en `/srv/produccion/backups/`.

## Las ocho reglas duras

1. **Nunca `latest`, nunca SHA corto.** Solo el SHA completo de 40 caracteres.
   Una etiqueta móvil impide saber qué versión corre y volver a una anterior.
2. **Cinco valores tienen que coincidir siempre**: SHA de `origin/main`, HEAD del
   VPS, tag de la imagen, `APP_BUILD_ID` dentro del contenedor y lo que devuelve
   `/api/version`. Si alguno difiere, el despliegue está mal — parar.
3. **Nunca `docker build` ni `docker compose up --build` en el VPS.** Lo que hoy
   lo impide es `pull_policy: missing`: cuando un servicio declara `build:`, el
   default de Compose es construir la imagen si falta.
4. **Nunca `docker compose down`. Nunca recrear PostgreSQL.** Siempre
   `--no-deps app`. El servicio `db` fue creado fuera de Compose y hay un
   pendiente conocido de interpolación de `POSTGRES_PASSWORD`: recrearlo lo
   levantaría sin contraseña.
5. `APP_IMAGE` va en `/srv/produccion/erpazul/.env` (el `.env` de Compose,
   permisos 600, gitignored). **Nunca en `.env.prod`**: ese es el `env_file` del
   contenedor, sus variables no interpolan el compose y además terminarían
   dentro de la aplicación. Y **se actualiza ANTES de bajar la imagen y de
   migrar**, no antes de recrear: todo `docker compose` decide qué imagen usar
   leyendo esa variable, incluido el contenedor descartable de las migraciones.
6. **Registrar la referencia de rollback antes de tocar nada**, y conservarla.
7. **El código de salida de `migrate deploy` no prueba que se aplicó nada.** Se
   compara el CONTEO de migraciones que informa el contenedor contra el del
   árbol, y tiene que coincidir. Ver "El código de salida de `migrate deploy` NO
   alcanza" en el paso 4.
8. **Cuatro comandos de Prisma están bloqueados siempre y no tienen
   autorización posible**: `db push`, `migrate reset`, `db execute` y
   `migrate resolve`. No es un olvido ni una regla que se afloje cuando aprieta.
   La lista, el criterio por el que es esa y no otra, y lo que se miró y NO se
   tapó están en `lib/deploy/guardiaMigraciones.mjs`. Ver "Los cuatro comandos
   bloqueados" en el paso 4 antes de tocarlos. **Dos excepciones, cada una por
   texto exacto y solo `--rolled-back`**: la recuperación tipada de
   `20260927120000_libro_stock` por lock timeout —ver "La excepción de
   `libro_stock`"— y la de `20260929200000_libro_costo_activacion` por lock
   timeout —ver "La excepción de la activación del Libro de Costos"—.

## EL TOPE DE CORTE: 30 SEGUNDOS

**Si el sitio no responde 30 segundos después de recrear la app, es un incidente
y se revierte.** No se espera a ver si levanta.

Producción son cinco locales vendiendo. Un corte de segundos es el precio normal
de un despliegue; tres minutos no lo es, y a los tres minutos ya no importa por
qué: importa volver.

Cómo se mide, arrancando el reloj INMEDIATAMENTE después del `up -d`:

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml up -d --no-deps app'
# y sin pausa:
for i in $(seq 1 30); do
  curl -s -m 2 -o /dev/null -w "%{http_code}" https://operix.cloud/api/version | grep -q 200 && { echo "arriba a los ${i}s"; break; }
  sleep 1
done
```

Si el bucle termina sin un 200, **se revierte YA**: se pone `APP_IMAGE` en la
imagen anterior —la que quedó anotada en el paso 2, que para eso se anota— y se
recrea. Diagnosticar viene después, con el sitio arriba.

El motivo por el que esto es una regla y no un criterio: el 2026-08-12 hubo dos
caídas de más de tres minutos durante una jornada de quince despliegues, y nadie
estaba mirando el reloj. Está en `docs/incidents/INC-0005-caidas-por-despliegue.md`.

**Y no se encadenan despliegues.** Quince en un día son quince cortes. Si hay
varios arreglos chicos, se juntan en uno.

## REGLA: NINGUNA MEDICIÓN CORRE DENTRO DEL CONTENEDOR QUE ATIENDE

**Prohibido `docker exec erpazul_app …` para medir, probar o diagnosticar.** No es
una recomendación: ese contenedor es el que atiende a los cinco locales, y todo
lo que se ejecute ahí adentro compite con las ventas por CPU, memoria y
conexiones a la base.

Lo que sí se puede: un contenedor descartable de la MISMA imagen, que ve los
mismos datos, el mismo volumen y las mismas variables, y muere al terminar.

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && \
  docker compose -f docker-compose.prod.yml run --rm --no-deps app node -e "…"'
```

`--rm` para que no quede, `--no-deps` para que no levante nada más.

Vale igual para lo que parece inofensivo: una consulta de un segundo abre su
propio pool de conexiones a PostgreSQL, y una lectura de comprobante carga una
foto de varios MB en memoria. Si hace falta medir con datos reales —y hace falta,
es la regla 2 de CLAUDE.md— se mide **al lado**, no adentro.

`docker exec` queda solo para MIRAR sin ejecutar trabajo: `printenv`, `ls`,
`cat` de un log. Nada que abra una conexión ni cargue un archivo grande.

## Qué operaciones pueden dejar el sitio abajo

Estas se hacen SABIENDO lo que cuestan, no de paso, y no mientras hay gente
vendiendo:

| Operación | Por qué corta |
|---|---|
| `docker compose up -d --no-deps app` | Recrea el contenedor que atiende. Es el corte normal del despliegue, de segundos — salvo que el arranque se demore (ver abajo). |
| `docker compose up` **sin** `--no-deps` | Recrea también PostgreSQL. **Prohibido**: el servicio `db` fue creado fuera de Compose y volvería a levantar sin contraseña. |
| `docker compose down` | Baja todo. **Prohibido.** |
| `docker exec erpazul_app node …` con trabajo pesado | Corre DENTRO del proceso que sirve la aplicación. Una ráfaga de lecturas con una foto de 6,5 MB en memoria compite con los locales por CPU y memoria, y si se cruza el límite el kernel mata el contenedor. Si hay que medir con datos reales, va en un contenedor descartable de la misma imagen: `docker compose run --rm --no-deps app …`. |
| `pg_dump` completo | Compite por E/S con la base que atiende las ventas. Es obligatorio antes de migrar; no se corre "para chequear algo". |
| `prisma migrate deploy` | Entre migrar y recrear, el esquema es nuevo y el código viejo. Ver "La ventana entre migrar y recrear". |
| `docker compose pull` | Descarga cientos de MB. No corta por sí solo, pero satura la red del servidor mientras baja. |

**Y una causa de corte que no se ve en la tabla: lo que corre al arrancar.**
`instrumentation.js` se ejecuta ANTES del primer pedido. Cualquier `await` de red
ahí adentro es tiempo de sitio caído en cada recreación, multiplicado por cada
despliegue del día. Lo que va en ese archivo tiene que ser instantáneo o correr
en segundo plano.

## PASO 0 — ¿HAY ALGO QUE DESPLEGAR, Y ESTÁ PUBLICADO?

**Esto va PRIMERO, antes del backup y antes de cualquier otra cosa. Y FRENA: no
avisa y sigue.**

### Por qué existe

El 2026-08-14 el procedimiento se corrió entero con **17 commits sin empujar** y
terminó **sin desplegar nada**. Nada falló: el VPS bajó la imagen de
`origin/main`, los cinco valores coincidieron entre sí, y todo quedó consistente
—en el commit VIEJO—. Un despliegue que no despliega y no lo dice es peor que uno
que falla, porque el que lo corrió se queda creyendo que su trabajo está en
producción.

La causa es de una línea y está arriba, en la primera regla dura: **el VPS no
construye, Actions construye a partir de `origin/main`.** Si lo que se quiere
desplegar no llegó a `origin/main`, no existe ninguna imagen que lo contenga, y
todos los chequeos de este procedimiento van a dar bien igual — porque son
chequeos de consistencia, no de contenido.

### El chequeo

```bash
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTO=$(git rev-parse origin/main)
SIN_EMPUJAR=$(git rev-list --count origin/main..HEAD)
DESPLEGADO=$(curl -s -m 10 https://operix.cloud/api/version | grep -o '[0-9a-f]\{40\}')

echo "local:      $LOCAL"
echo "origin/main:$REMOTO"
echo "desplegado: $DESPLEGADO"
echo "sin empujar: $SIN_EMPUJAR"
```

**El `git fetch` no es opcional.** Sin él, `origin/main` es la referencia local de
la última vez que esta máquina habló con GitHub, y la comparación mide contra un
recuerdo. Es el mismo defecto que el paso 4.1 ya tenía del lado del VPS.

### Las dos frenadas, y hay que decir CUÁL de las dos es

**A) Hay commits sin empujar** —`SIN_EMPUJAR` mayor que cero—:

> FRENO: hay N commits sin empujar. Actions construye desde `origin/main`, así que
> lo que se desplegaría NO es lo que tenés local. Empujá primero y volvé a
> empezar.

**B) No hay nada nuevo que publicar** —`SIN_EMPUJAR` en cero y `REMOTO` igual a
`DESPLEGADO`—:

> FRENO: `origin/main` ya está desplegado. No hay nada nuevo que publicar, y
> desplegar igual sería un corte de producción a cambio de nada.

**Solo se sigue si `SIN_EMPUJAR` es cero Y `REMOTO` difiere de `DESPLEGADO`.**

### Y ANTES DE SEGUIR: ¿ALGUNO DE ESOS COMMITS ESTÁ FRENADO?

**Leer [`docs/deploy/TANDAS-BLOQUEADAS.md`](../../../docs/deploy/TANDAS-BLOQUEADAS.md).**

El chequeo de arriba contesta **si hay algo nuevo, no si ese algo tiene que
salir.** Una tanda puede estar empujada a propósito y no aprobada para
producción; nada de lo que se calcula acá lo sabe.

Mirar el rango real —`git log --oneline $DESPLEGADO..$REMOTO`— y cruzarlo contra
esa lista. Si incluye un commit frenado, el corte no sale, o se corta antes de
ese commit. Lista vacía = todo lo que está en `origin/main` se puede desplegar.

**Por qué es un archivo y no algo que se recuerda:** el 2026-08-19 el paso 0 dio
luz verde sobre una tanda bloqueada y lo único que lo frenó fue que quien
desplegaba se acordara. El detalle está en el propio archivo.

### Y ANTES DE SEGUIR: ¿ESTE RANGO CAMBIA EL PROCEDIMIENTO?

```bash
git diff --name-only $DESPLEGADO..$REMOTO -- .claude/skills/deploy/SKILL.md
```

**Si devuelve algo, este archivo cambió adentro del rango que se está por
desplegar, y la versión que se está leyendo es la VIEJA.** Hay que volver a
leerlo entero desde el árbol actualizado y seguir esa versión, no ésta.

*Por qué, con su caso:* el 2026-09-17, desplegando `ffb85675`, la tanda traía un
paso nuevo —la auditoría de costos fuera de rango, que entró en `d988b50b`— y el
despliegue **no lo corrió**. No se salteó por olvido: el procedimiento se carga
al invocar `/deploy`, y en ese momento el clon estaba en el commit anterior. El
`git merge --ff-only` del paso 0 actualizó el árbol, pero el texto que ya estaba
leído siguió siendo el de antes. Se desplegó bien y el informe salió completo
**según un procedimiento que ya no era el vigente**.

Es la misma familia que el `git fetch` que falta: algo que se compara contra un
recuerdo en vez de contra lo que hay. Y tiene el mismo síntoma, que es el que lo
hace difícil de ver — **no falla, sale bien de menos.**

### Lo que este chequeo NO contesta

Que `origin/main` tenga el commit **no** prueba que Actions haya terminado de
construir y publicar su imagen. Eso se comprueba en el paso 3, que es donde vive.
Este paso solo contesta si hay algo que desplegar y si está publicado en la rama.

Y tampoco reemplaza a los cinco valores del paso 5: aquellos comparan lo que
quedó corriendo, éste compara lo que se va a empezar a desplegar. Son los dos
extremos de la misma cadena y ninguno tapa al otro — la corrida del 2026-08-14
pasó los cinco valores con todo bien y aun así no desplegó la tanda.

### Y ACÁ SE LEE QUÉ MIGRACIONES TRAE, ANTES DE TOCAR NADA

**Leer [`docs/deploy/MIGRACIONES-SIN-APLICAR.md`](../../../docs/deploy/MIGRACIONES-SIN-APLICAR.md).**
Es la lista de lo que está en `main` y todavía no se aplicó en producción, con
qué hace cada una, qué dijo el clasificador y si el quinto chequeo del backup
aplica. Vacía significa que el despliegue es solo de código.

**Por qué acá y no más adelante:** el clasificador del paso 4 igual lo va a
encontrar, porque calcula el rango solo. Pero lo encuentra con el backup ya
sacado y la imagen ya construida, que es el peor momento para enterarse de que
hay que decidir algo. Una tanda puede quedar empujada sin desplegar a propósito
—pasó el 2026-08-18—, y varias tandas después el rango deja de ser de cero sin
que nadie lo esté esperando.

**Es una lista viva.** Cuando una migración se aplica en producción, se borra de
ese archivo en el mismo commit que confirma el despliegue. Si el archivo acumula
filas viejas deja de contestar qué falta.

### Y LA SONDA PRE, CORRIDA AFUERA — FRENA SI NO ES VERDE

```bash
git show origin/main:scripts/sonda-externa.mjs | \
  node --input-type=module - --fase pre --sha-esperado "$DESPLEGADO"
echo "sonda PRE: $?"
```

**Cualquier código distinto de 0 FRENA, y no hay excepción:**

> FRENO: la sonda PRE no dio VERDE. Motivo: <la línea ROJO que imprimió>. No se
> saca backup ni se toca nada hasta tenerla en verde.

Dispara `.github/workflows/sonda-cascada.yml` en GitHub Actions, espera y lee el
veredicto: el VPS no tiene navegador y no se le instala uno. La sonda es la misma
de "Antes de empezar", con el Chrome del runner; el workflow además comprueba que
producción sirva `$DESPLEGADO` antes y después de medir. El detalle, y el token
que hay que crear UNA vez en esta máquina, en
[`docs/deploy/SONDA-EXTERNA.md`](../../../docs/deploy/SONDA-EXTERNA.md).

**Por qué `git show origin/main:` y no el archivo del árbol:** el árbol del VPS
sigue en el SHA viejo hasta el paso 4, que es donde se mueve a propósito. Así
corre la versión de `main` del cliente —la misma del workflow— sin tocar el
árbol de producción ni crear ningún archivo. Por eso va después del
`git fetch` del chequeo de arriba, nunca antes.

**Si falla por el token** —falta, venció, no tiene permiso—, el mensaje lo dice y
es ROJO igual: se arregla el token y se vuelve a correr este paso. No se
reemplaza por una medición a mano ni por "la corrí ayer".

**Qué contesta la PRE:** que producción, ANTES de tocarla, tiene la cascada
bien. Es el "antes" contra el que se compara la POST: si la POST da rojo, se sabe
que lo trajo este despliegue.

## Antes de empezar

- Árbol limpio y todo commiteado. `git status` de la máquina local.
- Suite en verde. Para enumerar:
  `git ls-files --cached --others --exclude-standard "*.test.mjs"`, y correrlos
  con `node --import ./scripts/alias-loader.mjs --test <archivos>`.
  **`git ls-files` a secas no alcanza:** solo lista lo trackeado, así que un
  candado recién escrito y todavía sin commitear no entra y el total sale igual
  al de antes. Pasó el 2026-08-10: la suite informó 2575 con nueve candados
  nuevos que no había corrido.
- Si se tocó `prisma/schema.prisma`, `npx prisma generate` local antes de probar
  nada: ni el build ni los candados lo ven.
- `npm run build` compila sin errores.
- **La sonda de cascada en verde**, al lado del build y con el mismo peso:

      MSYS_NO_PATHCONV=1 node scripts/sonda-cascada.mjs --base http://localhost:3000

  Necesita un servidor sirviendo la aplicación —el `--base` va al que esté
  levantado— y **no necesita sesión ni credenciales**: la hoja la sirve el layout
  raíz, así que mide sobre `/login` y no gasta intentos del límite de login.
  Corre igual contra producción con `--base https://operix.cloud`. **Contra
  producción, el "antes" y el "después" del despliegue ya no se sacan a mano**:
  son la sonda PRE del paso 0 y la POST del paso 5, que la corren en GitHub
  Actions con `scripts/sonda-externa.mjs`.

  **Con qué navegador.** En Windows con Edge, el comando de arriba, sin más. En
  otro entorno se le da el navegador con `--edge <ruta>` —cualquier Chromium—, y
  si el proceso corre como root, como en la sesión de nube, se agrega
  `--no-sandbox`, que la sonda pide explícito y nunca pone sola:

      node scripts/sonda-cascada.mjs --base https://operix.cloud \
        --edge <ruta-del-chromium> --no-sandbox

  En un Node sin `WebSocket` global (Node 18) usa el paquete `ws` que el repo
  ya instala. Si no encuentra ninguno de los dos, sale en ROJO diciéndolo.

  **Y que corra no alcanza: tiene que haber mirado la página de verdad.** Un
  navegador que no confía en el certificado —como el Chromium de la sesión de
  nube detrás de su proxy— carga su propia página de error, y la sonda da ROJO
  diciendo que a la hoja le falta `.sunmi-btn-base`. Es rojo y frena igual, pero
  el motivo es el entorno, no la cascada: antes de diagnosticar, comprobar que el
  navegador abre la URL.

  **Qué afirma:** que una utilidad de Tailwind le sigue ganando a la clase del
  kit. De eso cuelgan **535 declaraciones medidas** de `SunmiButton` y
  `SunmiInput`. Si se dan vuelta no rompen el build ni ponen la suite en rojo:
  cada pantalla que hoy define su padding, su letra o su ancho pasa a mostrar el
  del kit, y solo se ve abriéndolas de a una. Por eso el build no la tapa — son
  preguntas distintas.

  **EL CRITERIO, Y NO SE NEGOCIA: si no puede medir, es ROJO Y FRENA.** La clase
  no está en la hoja, la utilidad no está generada, la página no responde, el
  navegador no levantó: todo eso es rojo, no "no se pudo comprobar". La sonda
  sale con 1 en cada uno de esos casos y dice cuál — está escrita así a propósito.
  Un despliegue no arranca con una verificación en estado desconocido, porque el
  desconocido se convierte solo en "supongo que sí" cuando ya hay una imagen
  construida y ganas de terminar.

  **Veinte segundos por despliegue es el precio de no depender de acordarse.**
  El hermano barato —`lib/sunmi/ordenDeCascada.test.mjs`— ya viaja en la suite y
  mira el orden en `app/globals.css`. Esta mira lo que ese orden PRODUCE, que es
  lo único que sobrevive a un `@layer` de otro archivo, a otra hoja importada
  después y a un cambio de motor. Está medido cuál agarra qué: ver el roadmap del
  kit, sección "ESCRITOS LOS DOS, Y CON SU CONTRAPRUEBA".

- **La sonda de la tarjeta de producto en verde**, si la tanda toca el catálogo,
  la tarjeta o `SunmiPanel`:

      node scripts/sonda-tarjeta-producto.mjs --base http://localhost:3111 \
        --usuario admin@admin.com --clave <clave-de-desarrollo>

  **Contra el servidor de DESARROLLO, nunca contra producción**: hace login y
  toca la interfaz.

  **Qué afirma, y por qué ninguna otra cosa lo cubre.** Abre
  `/modulos/productos` a 390 px con datos reales y ejerce la secuencia —tocar,
  leer la capa, tocar de nuevo, tocar Editar— afirmando en cada paso: que el
  rótulo del precio no contradiga a la línea de equivalencia, que Editar entre
  sin cartel de error, que la capa tenga exactamente los botones esperados, que
  el segundo toque cierre, y que la tarjeta tenga un límite visible de 3,0 contra
  el fondo.

  **De dónde salió.** El 2026-08-18 la tarjeta llegó a producción con esos cinco
  defectos, y ninguno de los controles existentes podía verlos: la suite son
  funciones puras, el build compila JSX que después explota, el marcador de la
  hoja de estilos prueba que las clases VIAJARON —no que la pantalla ande—, y el
  andamio pasó porque tenía los textos escritos a mano y un botón sin manejador.
  El peor fue un precio de bulto rotulado como unitario: falso en 1.293 de los
  2.600 productos del catálogo, por 24 veces en el caso que lo destapó.

  **Está verificada por contraprueba**: se reintrodujo cada uno de los cinco
  defectos y la sonda se puso roja por el que correspondía, uno por uno y sin
  arrastrar a los otros.

  Mismo criterio que la de cascada: **si no puede medir, es ROJO Y FRENA.** Una
  sesión que no entró, una pantalla que no cargó o una tarjeta que no apareció no
  son "no se pudo comprobar".

## Paso 1 — Backup validado

Antes de cualquier otra cosa, y no se saltea. El procedimiento de backup y sus
trampas están en el skill `/backup`; acá alcanza con sacar uno y validarlo:

```bash
ssh vps-erp 'docker exec erpazul_db pg_dump -U erpazul -d erpazul --no-owner --no-acl \
  | gzip -9 > /srv/produccion/backups/pre-<SHA_CORTO>_$(date +%Y%m%d_%H%M%S).sql.gz'
```

Y validarlo en el VPS, los cuatro chequeos: `pg_dump` salió con 0, `gzip -t` sin
salida, la marca `PostgreSQL database dump complete` en las últimas 20 líneas
(pg_dump 16 cierra con la marca y después un token `\unrestrict`, así que buscar
solo en la última línea da falso negativo), y 40 tablas o más con
`grep -c '^CREATE TABLE'`.

El `pg_dump` va con `set -o pipefail` adelante: sin eso, el código de salida que
se lee es el del `gzip` y un dump fallido pasa como bueno.

**Si el despliegue trae una migración de DATOS, hay un quinto chequeo** —
comprobar que un valor de los que se van a borrar esté dentro del dump—, y está
en el skill `/backup`. No es opcional: los cuatro primeros prueban que el archivo
está bien formado, no que contenga lo que se va a perder.

## Paso 2 — Registrar la referencia de rollback

```bash
ssh vps-erp 'docker inspect erpazul_app --format "{{.Image}}"'
ssh vps-erp 'docker image inspect <ID> --format "{{.RepoTags}}"'
```

Anotar el **image ID exacto o el RepoTag fijo** en el informe. **No sirve
`erpazul-app:latest`** ni ninguna etiqueta móvil: apunta a lo último que se
construyó y mañana puede señalar otra imagen. Es la misma razón por la que
producción despliega solo por SHA completo.

## Paso 3 — Publicar la imagen

```bash
git push origin main          # normal, sin force
gh run list --limit 3         # esperar success, no seguir antes
```

**`gh` puede no estar instalado** — en la notebook de trabajo no lo está, ni en
PowerShell ni en Git Bash. No es un bloqueo: la espera se hace contra el registry,
que además es la fuente que vale, sondeando hasta que el tag aparece:

```bash
ssh vps-erp 'IMG=ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>;
for i in $(seq 1 45); do
  docker manifest inspect "$IMG" >/dev/null 2>&1 && { echo "publicada (intento $i)"; exit 0; }
  sleep 20
done; echo "no publicada"; exit 1'
```

Medido: Actions tarda unos 140 segundos en publicar.

Validar la imagen **contra el registry**, no contra el log del workflow: tag,
digest, `linux/amd64`, `APP_BUILD_ID` y el label
`org.opencontainers.image.revision`.

## Paso 4 — Desplegar en el VPS

Cinco pasos, en este orden. Cada comando con `-T` o `</dev/null` si viaja por
heredoc de ssh (ver trampas).

**`APP_IMAGE` SE ACTUALIZA SEGUNDO, ANTES DE PULL Y DE MIGRAR.** No al final.
Todo `docker compose` —`pull`, `run`, `up`— resuelve qué imagen usar leyendo
`APP_IMAGE` del `.env`. Mientras esa variable apunte al SHA viejo, los tres
comandos trabajan sobre la imagen vieja, y eso incluye el contenedor descartable
que corre las migraciones. El detalle de cómo se descubrió está abajo, en
"La trampa del contenedor descartable".

**El clasificador va ANTES del paso 1, no entre el tercero y el cuarto.** Se
corre desde la máquina local, con el VPS todavía en el SHA viejo:

```bash
node scripts/clasificar-migraciones.mjs --vps
```

**Desplegando desde ADENTRO del VPS, ese mismo comando antes del paso 1 sale
INDETERMINADO, y está bien que salga.** En el servidor, `--vps` toma como destino
la imagen de `APP_IMAGE`, que antes del paso 2 todavía es la que atiende: rango
degenerado. Para mirar el release antes de tocar nada, se dice el destino y el
repositorio que lo tiene —el clon de trabajo, actualizado—:

```bash
node scripts/clasificar-migraciones.mjs --vps --hasta <SHA_COMPLETO> --repo "$(pwd)"
```

Ver "Qué repositorio consulta el clasificador y qué copia de la guardia corre".

**Por qué antes:** para leerlo con tiempo y no con el despliegue a medio hacer.
El orden ya no es lo que decide si el chequeo sirve — eso cambió el 2026-08-13 y
está abajo.

### LA BASE SALE DE LA IMAGEN QUE ATIENDE, no del HEAD de git del VPS

Hasta el 2026-08-13 el clasificador preguntaba `git rev-parse HEAD` en el VPS. El
paso 1 —`git merge --ff-only`— mueve ese HEAD al SHA nuevo, así que para cuando
corre `migrate deploy` el rango salía **degenerado**: el script comparaba el
árbol contra sí mismo y la guardia frenaba con INDETERMINADO.

Eso pasaba en **todos** los despliegues, trajeran migraciones o no, y la única
salida era `DEPLOY_MIGRACION_AUTORIZADA=1`. Ahí está el daño, que no es la
molestia: **una puerta que se abre en todos los despliegues no es una puerta.**
Dos autorizaciones manuales seguidas el 2026-08-13 fueron el aviso.

Ahora la base sale del SHA de la **imagen del contenedor que atiende**
—`docker inspect erpazul_app --format '{{.Config.Image}}'`—, que es el mismo dato
que el paso 2 ya anota como referencia de rollback. Ese SHA no lo mueve el paso 1
sino el paso 5, cuando la ventana ya se cerró. Y es el dato correcto: durante la
ventana lo que importa es qué CÓDIGO está sirviendo pedidos, no qué commit tiene
checkouteado el repo del servidor.

**Y lee la imagen por el camino que corresponda según dónde corra.** Si en la
máquina existe `/srv/produccion/erpazul` con su compose —la firma del servidor de
producción y de ningún otro lado— pregunta al docker local; si no, va por ssh.

Eso se agregó el 2026-09-15 y es la otra mitad del mismo daño: desplegando desde
adentro del VPS, `vps-erp` no existe —es un alias del ssh de la máquina de
trabajo— así que el chequeo salía INDETERMINADO por "Could not resolve hostname",
y la única salida volvía a ser la autorización manual. **La puerta que se abre
siempre, otra vez, por otra causa.** La condición NO es "¿hay docker?": una
máquina de desarrollo también tiene, y podría tener un contenedor con el mismo
nombre.

Sigue fallando cerrado: si no puede leer la imagen —ni local ni por ssh—, si el
contenedor no está, o si la etiqueta no es un SHA de 40 —`latest`, una imagen
construida a mano— sale con 2.

Comprobado en los dos sentidos, que es lo que hace que el arreglo valga: con un
rango sano y cero migraciones **pasa sin pedir nada**; y con una migración de
verdad en el rango —una rama descartable con un `DROP COLUMN`— **la guardia
denegó el comando**, nombrando el archivo, la línea y el motivo. Sin ese segundo
sentido el arreglo habría cambiado un pedido molesto por un control muerto.

Si por lo que sea la imagen no sirve como base, se le pasa el SHA a mano:
`--desde <SHA_QUE_CORRÍA_ANTES>`.

No se saltea aunque el despliegue "no traiga migraciones": eso es justamente lo
que el chequeo comprueba. Si igual se lo saltea, la guardia lo intercepta en el
cuarto comando.

```bash
# 1. Traer el código — EL FETCH NO ES OPCIONAL, ver abajo
ssh vps-erp 'cd /srv/produccion/erpazul && git fetch origin --quiet && git merge --ff-only origin/main'

# 2. APUNTAR A LA IMAGEN NUEVA — antes que nada que use compose
#    La copia del .env va FUERA DEL ÁRBOL. Ver abajo por qué.
ssh vps-erp 'install -d -m 700 /srv/produccion/backups/env && cd /srv/produccion/erpazul && \
  cp -a .env /srv/produccion/backups/env/env-pre<SHA_CORTO>-$(date +%Y%m%d_%H%M%S) && \
  sed -i "s#^APP_IMAGE=.*#APP_IMAGE=ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>#" .env'
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml config --images'

# 3. Bajar la imagen (ahora sí, la nueva)
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml pull app'

# 4. Migrar, en un contenedor descartable DE LA IMAGEN NUEVA
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate deploy'

# 5. Recrear solo la app
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml up -d --no-deps app'
```

El `config --images` del paso 2 no es adorno: es la confirmación barata de que
compose ya ve el tag nuevo, antes de que importe.

### SIN EL `git fetch`, EL PASO 1 NO HACE NADA Y NO SE QUEJA

`origin/main` en el repo del VPS es una **referencia local**: la última vez que
ese repo habló con GitHub. Si nadie la actualiza, `git merge --ff-only
origin/main` mergea el SHA viejo contra sí mismo, contesta **"Already up to
date"** y deja el HEAD donde estaba.

Y el despliegue sigue. Los pasos 2 a 5 no miran el HEAD del VPS: `APP_IMAGE` se
escribe a mano con el SHA nuevo, la imagen que se baja es la nueva y la app se
recrea con esa imagen. Lo único que queda atrás es el repo del servidor —el que
usan `migrate deploy` para leer `prisma/migrations` y el clasificador para
calcular el rango—, así que en un despliegue **con** migraciones el contenedor
descartable no vería la migración nueva y el síntoma sería el de la trampa del
contenedor descartable, apuntando al lugar equivocado.

**Lo atrapa el paso 5, pero al final de todo**: el segundo de los cinco valores
—el HEAD del VPS— sale distinto de los otros cuatro. Falla seguro, no en
silencio; lo que cuesta es que se entera después de haber recreado la app.

Pasó el 2026-08-14 desplegando `42e7e27`, y el snippet estaba mal desde antes: la
bitácora muestra que los despliegues del 12 de agosto sí corrían
`git fetch origin --quiet && git merge --ff-only origin/main`. La línea se perdió
al escribir este documento, no en el procedimiento.

**Y EL 2026-09-17 EL FETCH ESTABA ESCRITO Y FALLÓ IGUAL.** El repositorio pasó a
privado y el repo del servidor lo tenía apuntado por **HTTPS anónimo**: el fetch
cortó con `could not read Username for 'https://github.com'` y el `&&` impidió el
merge, así que el HEAD del servidor se quedó dos commits atrás **y el despliegue
siguió**. Su `prisma/migrations` mostraba 17 cuando el árbol tenía 18.

Lo atrapó el chequeo del conteo del paso 4, que para eso está. Pero conviene
saber la forma, porque el clon de trabajo **no la ve**: ése usa SSH con clave y
anda perfecto. El síntoma vive solo del lado del servidor.

El arreglo fue apuntar el remoto del repo de despliegue a SSH, igual que el clon:

```bash
git -C /srv/produccion/erpazul remote set-url origin git@github.com:islaemanuel25-glitch/erpmanual.git
```

**Y la lección general:** el `&&` del snippet hace que el merge no corra si el
fetch falla, que está bien — pero nada frena el despliegue ahí. Después del paso
4.1, mirar que el HEAD del servidor sea el SHA que se está desplegando, antes de
seguir. Son dos segundos y es el único momento barato para enterarse.

### LA COPIA DEL `.env` VA FUERA DEL ÁRBOL, Y NO ES ORDEN

Hasta el 2026-08-13 el paso 2 escribía `.env.bak-pre<SHA>` **al lado del
compose**, o sea adentro del repo del VPS. Un archivo por despliegue, sin
trackear. Para esa fecha había **26 acumulados**.

El daño no es el desorden: es que **apagan un control**. La verificación de
cierre pide `git status --porcelain` del VPS vacío, y ese chequeo existe para
avisar que alguien tocó algo a mano en el servidor. Con 26 archivos sin trackear
nunca sale vacío, así que la única respuesta posible es ruido — y **un control
que siempre devuelve ruido se lee salteado**. Deja de avisar de lo que existe
para avisar, sin que nadie lo apague a propósito.

Por eso la copia va a `/srv/produccion/backups/env/`, con el directorio en 700,
y con la fecha en el nombre para que dos despliegues del mismo SHA no se pisen.

Lo que se limpió ese día, y lo que se miró antes de borrar:

- Los **26 `.env.bak-pre*`** estaban todos en 600 y **contenían una sola
  variable, `APP_IMAGE`**: no llevaban ninguna clave. Comprobado listando los
  NOMBRES de variable con `cut -d= -f1`, sin imprimir un solo valor. Borrados.
- Las dos `.env.prod.bak-*` son otra cosa: son copias de `.env.prod`, el
  `env_file` del contenedor, y **sí llevan claves** —`AUTH_SECRET`,
  `DATABASE_URL`, `POSTGRES_PASSWORD`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
  `WEB_PUSH_PRIVATE_KEY`—. No se borraron: se movieron a ese mismo directorio de
  afuera del árbol, conservando el 600.

**Cómo mirar uno de estos archivos sin exponerlo:** `cut -d= -f1` da los nombres
de las variables y ningún valor. `stat -c "%a %U:%G %s"` da permisos, dueño y
tamaño. Nunca `cat`, nunca `grep` de un valor, nunca `docker compose config` sin
filtrar.

Y un detalle que hizo perder un minuto: `ls`, `stat` y `mv` con `*` **no matchean
nombres que empiezan con punto**. Un `stat dir/*` sobre un directorio lleno de
`.env.*` informa "No such file or directory" y parece que la copia falló cuando
está hecha.

`git merge --ff-only`: si el VPS tiene algo que no está en `origin/main`, el
merge falla en vez de fabricar un commit de merge en producción.

Sobre `prisma migrate deploy`: **sin `npx`** — el CLI viene en la imagen — y en
un contenedor descartable **de la imagen nueva**, nunca con `docker exec` sobre
el contenedor viejo, que tiene el cliente Prisma anterior.

### La trampa del contenedor descartable

Ocurrió el 2026-08-10, en el primer despliegue con migración de datos. El
procedimiento decía "antes del cuarto, actualizar `APP_IMAGE`", o sea al final.
Funcionó tres veces seguidas **solo porque ninguno de esos despliegues traía
migraciones**: si `migrate deploy` no tiene nada que aplicar, da igual de qué
imagen salga el contenedor.

Con una migración de por medio, `migrate deploy` informó:

```
81 migrations found in prisma/migrations
No pending migrations to apply.
```

y **salió con éxito**. El repo del VPS ya tenía la migración nueva —el `git
merge` es el paso 1—, pero el contenedor descartable salió de la imagen vieja,
que no la contiene. Contó las 81 que esa imagen conoce y no vio la 82.

La misma variable rompía el paso anterior: `docker compose pull app` con
`APP_IMAGE` viejo baja —o encuentra ya bajada— la imagen vieja, e informa
`Skipped - Image is already present locally` con toda tranquilidad.

### El código de salida de `migrate deploy` NO alcanza

**Nunca dar por aplicada una migración porque el comando salió con 0.**
"No pending migrations to apply" con éxito significa una de dos cosas, y son
opuestas:

- que estaba todo aplicado, que es lo normal en un despliegue sin migraciones; o
- que la imagen que se miró no conoce la migración que se quiere aplicar.

Las dos se ven idénticas en la salida y las dos devuelven 0.

**Lo que hay que comparar es el CONTEO de migraciones, y tiene que subir.**
`migrate deploy` imprime `N migrations found in prisma/migrations`. Se cuenta
cuántas hay en el árbol antes de empezar y ese número tiene que ser el que
imprime el contenedor:

```bash
ls -1 prisma/migrations | grep -c '^[0-9]'        # local, lo que se espera
```

En el caso real: el árbol tenía 82 y el contenedor informó 81. Esa diferencia de
uno era todo el problema. Con `APP_IMAGE` ya apuntando a la imagen nueva, el
mismo comando informó 82 y aplicó.

Si el número que informa el contenedor es menor que el del árbol, **la imagen
está atrasada: parar y arreglar `APP_IMAGE`**, no reintentar.

### Qué habría pasado si no se detectaba

Es la misma familia que la trampa del cliente de Prisma sin regenerar —ver
`CLAUDE.md`, "Verificar ejecutando, no leyendo"— y conviene leerlas juntas,
porque las dos terminan igual: **algo que no falla donde se rompe**.

Sin detectarlo, el paso 5 recrea la app con el **código nuevo** contra una base
**sin migrar**. Nada avisa: el build ya pasó hace rato, los candados son
funciones puras que no tocan la base, `migrate deploy` salió con 0 y el
contenedor levanta sano. Los cinco valores de la verificación de cierre
**coinciden igual**, porque miran el SHA del código y no el estado del esquema.

La rotura aparece recién contra Postgres, en la primera consulta que toque lo que
la migración debía preparar, y con un mensaje que apunta a otro lado: un
`Unknown argument`, o un P2022 nombrando una columna que no existe. En horario de
atención, con gente vendiendo.

Y hay un agravante propio de este caso: una migración de DATOS que no corre no
deja ningún rastro de que faltó. Una de esquema al menos rompe una consulta. Una
de datos simplemente no pasó, y el sistema sigue andando con los datos viejos —
que es exactamente lo que uno cree que acaba de cambiar.

Por eso el chequeo del conteo va en el procedimiento y no en la cabeza de nadie.

### La ventana entre migrar y recrear

Entre el paso de migrar y el de recrear, **el esquema es nuevo y el código que
corre es el viejo**. Son segundos, pero existen y hay tráfico real: la app vieja
sigue atendiendo pedidos contra el esquema nuevo.

**LA REGLA (decidida el 2026-08-09, obligatoria desde acá):** toda migración que
se despliegue mientras la versión anterior sigue atendiendo tráfico tiene que ser
**compatible hacia atrás con esa versión** durante toda la ventana. Las
migraciones destructivas o incompatibles **no pasan por este flujo**: necesitan
estrategia por fases —agregar, desplegar el código que usa lo nuevo, y recién en
un despliegue posterior borrar lo viejo— y se planean aparte.

**LO OBSERVADO, que es distinto y no la respalda:** el repo tiene 81 migraciones
y **14 contienen sentencias destructivas** —`DROP COLUMN` sobre `Proveedor` y
sobre `AuditoriaBitacora`, `DROP INDEX`, cambios de tipo de columna—, enumeradas
con `grep -l -iE 'DROP (COLUMN|TABLE|CONSTRAINT|INDEX|TYPE)|RENAME (COLUMN|TO)|SET NOT NULL|ALTER COLUMN .* TYPE|TRUNCATE|DELETE FROM' prisma/migrations/*/migration.sql`.
Todas se desplegaron por este mismo flujo como si fueran aditivas. No rompió
nada visible, pero eso es suerte y poco tráfico, no una garantía. La regla existe
justamente porque la costumbre **no** era la que se creía.

### El chequeo que frena el deploy — antes de migrar

Una regla que solo vive en un documento se viola en silencio la primera vez. Es
un script versionado, con sus candados:

```bash
node scripts/clasificar-migraciones.mjs --vps
```

Pide por ssh el SHA de la imagen que está atendiendo y clasifica exactamente lo
que este árbol introduce por encima. El rango sale de ahí y no de
`migrate status`: son las migraciones que este despliegue mete sobre el código
que hoy sirve pedidos.

**«Archivos a mirar: 0» tiene TRES formas de mentir.** Las tres terminan en un
cero tranquilizador sobre un despliegue que sí trae migraciones:

1. **La migración no está commiteada.** El rango se calcula con
   `git diff --name-only <SHA_QUE_ATIENDE>..HEAD -- prisma/migrations`, y un
   archivo sin trackear no está en `HEAD`. Pasó el 2026-08-10: dio cero antes del commit y
   marcó la migración como no aditiva después. Se corre **después** de
   commitear, no antes. **Este caso todavía sale con 0 y hay que tenerlo
   presente**: el script no puede distinguirlo.
2. **El directorio de migraciones no está donde el script cree.** Cubierto: sale
   con 2 por el `existsSync` de `principal()`.
3. **El rango es degenerado** — la base y el extremo son el mismo commit.
   Cubierto desde el 2026-08-11: sale con 2. **Desde el 2026-08-13 ya no salta en
   un despliegue normal**, porque la base dejó de ser el HEAD de git del VPS y
   pasa a ser la imagen que atiende; sigue cubriendo un `--desde` mal pasado y un
   contenedor recreado antes de tiempo. Los candados están en
   `scripts/clasificar-migraciones.test.mjs`, sobre `esRangoDegenerado` y
   `shaDeLaEtiqueta`.

De las tres, **la primera es la única que sigue sin cubrir**, y no se puede
cubrir con este mecanismo: un archivo que no está en ningún commit no existe
para `git diff`. Lo que la tapa es commitear antes, que es un hábito, no un
candado.

Códigos de salida: **0** no encontró nada, **1** marcó al menos una y el
despliegue se frena, **2** no pudo determinar el rango. Falla cerrado: si el ssh
no llega, si el SHA no existe o si el directorio de migraciones no está donde lo
espera, sale con 2. **Nunca pasa por no haber podido mirar.**

**Un 0 no es una autorización.** El propio script lo imprime al salir bien, para
que no haya que venir a leer esto para enterarse. El análisis es textual: busca
palabras conocidas y nada más.

Si sale con 1: **no se continúa por criterio propio.** Se le informa a Emanuel
qué migración es, qué sentencia la marcó y por qué rompería a la versión que está
atendiendo, y se espera confirmación explícita. Puede ser un falso positivo —un
`DROP INDEX IF EXISTS` sobre un índice muerto lo es, y una migración de datos
idempotente que rellena nulos también— y confirmarlo es de él, no del que está
desplegando.

### La guardia automática, y por dónde se saltea

El chequeo no depende de que alguien se acuerde de correrlo. Hay un hook
`PreToolUse` registrado en `.claude/settings.json` que intercepta cualquier
comando Bash con `migrate deploy`, corre el clasificador y **deniega** si no sale
con 0. Autorizar a mano es explícito y visible en la línea:
`DEPLOY_MIGRACION_AUTORIZADA=1` adelante del comando, misma idea que
`SEED_DESTRUCTIVO`.

La decisión vive en `lib/deploy/guardiaMigraciones.mjs`, que es una función pura
con sus candados al lado; el hook solo lee la entrada, corre el clasificador
cuando hace falta y escribe la respuesta.

### Qué proyecto se migra — desde el 2026-10-07

El clasificador calcula el rango **del ERP** —desde la imagen que atiende
`erpazul_app` hasta el HEAD del checkout del ERP— y lee `prisma/migrations` del
ERP. Solo dice algo de la base del ERP. Antes de esa fecha, la guardia mandaba al
clasificador cualquier `migrate deploy`, y el deploy de Azul Chat de ese día —hecho
desde una sesión de este repo— salió INDETERMINADO por el rango del ERP (25172fe,
imagen que atendía y HEAD a la vez) y se terminó con la autorización manual. Fue
un falso positivo: el ERP no tenía nada que ver con esa migración.

Ahora la guardia primero identifica el proyecto del comando
(`lib/deploy/proyectoDelComando.mjs`).

**Azul Chat se reconoce por el comando ENTERO, no por señales.** La primera
versión de la frontera eximía todo comando con el directorio y el servicio de
Azul Chat, y la revisión del PR #151 la rompió con argumentos que conservaban
las dos señales y cambiaban qué corre: `-v=../erpazul/prisma:/app/prisma`,
`--entrypoint=sh`, `-eDATABASE_URL=…`, `--schema=…` al final, `-f
../erpazul/docker-compose.prod.yml`, una variable adelante. Por eso la exención
es igualdad contra una de estas tres formas, sin nada más:

- `cd /srv/produccion/azul-chat && docker compose -f docker-compose.prod.yml run --rm --no-deps azul-chat-app prisma migrate deploy`
- la misma línea adentro de `ssh vps-erp '…'`, con comillas simples;
- la línea sin el `cd`, con la sesión parada exactamente en
  `/srv/produccion/azul-chat`.

El `-f` es `docker-compose.prod.yml` o
`/srv/produccion/azul-chat/docker-compose.prod.yml`; las únicas opciones de `run`
son `--rm`, `--no-deps` y `-T`, cada una a lo sumo una vez y en cualquier orden;
un espacio entre palabras y **nada después de `deploy`**. No hay parser de shell:
`$C` sin expandir, comillas de más, `;`, `&&` extra, pipes, redirecciones,
`$(…)`, `sudo`, `bash -c` o una variable adelante ya no son la forma.

Con eso:

- **ERP** (directorio y servicio `app` del ERP, ninguna señal de Azul Chat): la
  guardia de siempre, sin cambios. Clasificador, y si no sale con 0 —una
  migración marcada, o INDETERMINADO— se frena.
- **Azul Chat** (exactamente una de las tres formas): la guardia del ERP **no**
  la clasifica. Pasa avisando y deja una línea `MIGRACIÓN AZUL CHAT` en
  `.claude/migraciones-autorizadas.log`. No necesita `DEPLOY_MIGRACION_AUTORIZADA`.
  Rigen los controles de Azul Chat (su `docs/DEPLOY.md`: migraciones validadas
  desde una base vacía y sin deriva en su CI, backup de su base antes de migrar,
  migrar antes de levantar la app). Azul Chat no tiene un clasificador de
  compatibilidad propio; si lo necesita, va en su repo y con su SHA productivo.
- **Parecido a Azul Chat sin ser la forma** (su directorio, su servicio,
  cualquier mención de `azul-chat` en el comando, o la sesión parada en una
  carpeta de Azul Chat): **se rechaza**, también con la autorización manual. No
  se manda al clasificador del ERP, que mira otras migraciones y podría salir
  con 0. Se corrige el comando hasta que sea la forma, no se autoriza.
- **Desconocido** (ninguna señal de ningún proyecto, o el servicio no es de
  nadie): la guardia del ERP entera, como antes.
- **Ambiguo** (señales de los dos proyectos, o más de un `migrate deploy` en la
  línea): se rechaza, y la autorización manual no lo cambia.

Los rechazos (`db push`, `migrate reset`, `db execute`, `migrate resolve`) valen
para los dos proyectos igual.

`INDETERMINADO` sigue significando lo mismo: el clasificador no pudo establecer
qué migraciones del ERP entran (sin ssh, contenedor ausente, SHA que no está en el
historial, rango degenerado, árbol que no es el del ERP). Frena siempre.

`DEPLOY_MIGRACION_AUTORIZADA=1` es la puerta de excepción **del ERP**: Emanuel
confirmó una migración que el clasificador frenó o no pudo mirar. No es el
mecanismo para desplegar la migración de otro proyecto. El valor tiene que ser
exactamente `1` (desde 2026-10-07 `=1.5` o `=1-x` ya no autorizan) y no habilita
nada de la lista de rechazo ni un comando ambiguo.

El clasificador, además, se niega a clasificar en un árbol que no sea el del ERP
(`"name": "erpmanual"` en `package.json`): sale INDETERMINADO en vez de comparar
un SHA del ERP contra un historial ajeno.

### Qué repositorio consulta el clasificador y qué copia de la guardia corre — desde el 2026-10-08

Dos defectos que aparecieron al querer activar en el VPS la corrección del PR
#151 (INC-0014). Los dos vivían entre piezas que tenían candados verdes.

**A · El clasificador consultaba el clon equivocado.** Corría git sobre el árbol
donde vive el script. En el VPS ese árbol es el clon de trabajo desde el que
corre Claude Code, no `/srv/produccion/erpazul`: si el clon estaba atrasado, el
SHA que atiende no estaba en su historial y salía INDETERMINADO con un SHA
válido. Y el destino era el HEAD de ese clon, que no es lo que se despliega.

Ahora el directorio desde el que se ejecuta y el repositorio que se consulta son
dos cosas separadas, y los tres datos del rango se resuelven explícitos:

- **Origen:** la imagen que atiende `erpazul_app` (o `--desde`). Sin cambios.
- **Destino:** en el VPS con `--vps`, la imagen de `APP_IMAGE` en
  `/srv/produccion/erpazul/.env` —la que usa el contenedor descartable de
  `migrate deploy`, que el paso 2 apunta antes de migrar—. Se lee solo esa línea
  y no se imprime nada más del archivo. Fuera del VPS, el HEAD del repositorio.
  `--hasta` manda sobre los dos.
- **Repositorio:** en el VPS con `--vps`, `/srv/produccion/erpazul`, que el
  paso 1 ya trajo al día con su `git fetch`. Fuera del VPS o sin `--vps`, el
  árbol del script. `--repo <ruta absoluta>` manda sobre los dos.
- **Migraciones:** se leen del commit destino con `git show`, no del árbol de
  trabajo.

El repositorio se valida antes de usarlo: tiene que ser la raíz de un repo git, y
los dos commits tienen que estar en su historial con un `package.json` que se
llame `erpmanual` y un `prisma/migrations`. Si no, INDETERMINADO: nunca se
adivina otro repositorio, y nunca se corre git sobre Azul Chat para clasificar el
ERP. INDETERMINADO sigue frenando como siempre.

**B · El hook se resolvía contra el directorio actual.** `.claude/settings.json`
decía `node scripts/hook-guardia-migraciones.mjs`. Claude Code corre el comando
de un hook en el directorio ACTUAL de la sesión, que se mueve con cada `cd`.
**Comprobado con Claude Code 2.1.293, con un `claude -p` sobre un proyecto
descartable:** después de un `cd sub`, el hook corrió en `sub`. Con el archivo
ausente, node salió con 1 y **el comando corrió igual**. Así que después de un
`cd /srv/produccion/erpazul` corría la copia de producción, que es otra versión,
y después de un `cd` a cualquier otro lado no corría ninguna.

Ahora el comando es:

- `$CLAUDE_PROJECT_DIR/scripts/hook-guardia-migraciones.mjs`.
  `$CLAUDE_PROJECT_DIR` es la raíz del proyecto donde arrancó la sesión y no se
  mueve con `cd`; también comprobado que llega al hook.
- Va envuelto en un `sh` que, si el hook no pudo correr (archivo ausente, la
  variable vacía, node ausente, error de sintaxis), sale con **2 si el comando
  nombra prisma** y deja pasar el resto con un aviso visible de "GUARDIA ROTA".
  Comprobado con el `claude` real que el 2 frena el comando.

Y el hook, al decidir sobre un `migrate deploy`:

- dice qué copia es ("Guardia efectiva: <ruta> en <commit>");
- frena lo que nombra prisma si la copia que corre no es la del proyecto de la
  sesión;
- frena si falta el clasificador, o si se cayó (un 1 sin "FRENO:", una señal, un
  timeout), diciendo el motivo real y no "migración marcada".

**Lo que hace y no hace el PreToolUse, comprobado o documentado:**

- **Solo el código 2 bloquea por sí solo.** Un 1, un 127 (archivo ausente) o un
  error cualquiera dejan correr el comando: comprobado.
- **Un hook que se pasa de su `timeout` NO bloquea:** el comando sigue.
  Comprobado: un hook de 4 s que iba a salir con 2 a los 20 s no frenó nada. Por
  eso el clasificador tiene 90 s (se corta aunque un ssh hijo siga colgado:
  comprobado), los `git` de la identidad 5 s cada uno, y el hook 150 s. Un
  candado compara esos números.
- **El evento real** (comprobado): JSON de una línea con `tool_name`,
  `tool_input.command` como string, `cwd` y otros; las comillas y las barras
  invertidas van escapadas, las letras nunca.
- **El envoltorio deja pasar solo si el hook salió con 0 Y contestó una
  decisión** (`permissionDecision`). Un hook que sale con 0 sin decisión —texto,
  `{}`, vacío— cuenta como caído; un 2 del hook se propaga. Y un evento que el
  hook no puede interpretar —JSON roto, sin `tool_name`, un `command` que no es
  texto— no recibe `allow` si nombra prisma: hasta el 2026-10-08 sí lo recibía.
- **La red del hook caído es `grep -i prisma` sobre el JSON crudo.** No
  decodifica escapes `\u`: Claude Code no los usa para letras, pero la red no se
  apoya en un parser. Registrado como límite en un candado.
- **Un cambio en el ARCHIVO del hook rige en el comando siguiente**, sin
  reiniciar: comprobado.
- **Un cambio en `.claude/settings.json`** lo levanta un vigilador de archivos
  según la documentación, con reiniciar la sesión como remedio si no lo levantó.
  No comprobado: **después de actualizar `settings.json`, se reinicia la sesión.**
- **No hay ningún interruptor de "fallar cerrado".** Lo que falla cerrado es el
  envoltorio de arriba, y solo si `settings.json` es el nuevo: una sesión con el
  `settings.json` viejo cargado sigue con la ruta relativa.

**Nube y VPS:**

- En la sesión de nube no existe `/srv/produccion/erpazul`. El clasificador va
  por ssh a `vps-erp`, que no resuelve, y sale INDETERMINADO: la nube no
  despliega.
- En el VPS lee la imagen con el docker local y consulta el checkout de
  producción.
- El hook es el del proyecto donde arrancó la sesión en los dos casos.

**Activación, después de que el arreglo esté en `main`.** No toca la imagen del
ERP, no reinicia contenedores, no toca PostgreSQL ni `/srv/produccion/erpazul`:

1. En el VPS, en el clon de trabajo desde el que se lanza Claude Code (no en
   `/srv/produccion/erpazul`): `git status` limpio —si no, se frena y se
   pregunta—, después `git fetch origin && git merge --ff-only origin/main`.
2. Cerrar la sesión de Claude Code y abrir una nueva **desde ese clon**.
3. Comprobar en la sesión nueva, con un comando que no hace nada:
   `echo "npx prisma db push"` tiene que salir FRENADO, y lo mismo después de
   `cd /tmp`. Si pasa, la guardia no está activa y no se despliega.

**No se lanza Claude Code desde `/srv/produccion/erpazul`.** La guardia que
correría sería la del commit desplegado, no la del clon actualizado, y moverla
sería un despliegue.

**Riesgos que quedan:**

- Sigue siendo texto: un `migrate deploy` escondido no se ve. Hay un candado que
  lo registra como límite.
- Una sesión abierta antes de la activación sigue con la configuración vieja.
- Un `timeout` del hook deja pasar el comando.
- El clon de trabajo atrasado corre una guardia atrasada: lo nuevo dice qué copia
  corre, pero una copia vieja no tiene ese código.
- En Windows el envoltorio necesita Git Bash.
- El hook solo mira la herramienta Bash: otra herramienta que ejecute comandos
  no pasa por él.

**Qué imagen migra de verdad, y qué se puede afirmar.** Son cinco cosas
distintas y no hay que confundirlas:

- el **commit** de git;
- la **etiqueta** `erpmanual:<SHA>`;
- el **digest** de la imagen;
- la **imagen que el docker del VPS tiene** bajo esa etiqueta;
- las **migraciones adentro** de esa imagen.

Lo que está garantizado y lo que no:

- El clasificador mira el commit cuyo SHA está en la etiqueta de `APP_IMAGE`.
- El contenedor de `migrate deploy` corre lo que el docker local tiene bajo esa
  etiqueta. Con `pull_policy: missing` es lo que ya estaba en caché, y si no
  estaba, lo baja de GHCR.
- La CI construye la imagen desde ese commit (`COPY . .`, con `prisma/` adentro),
  le pone la etiqueta OCI `org.opencontainers.image.revision` y comprueba que
  `APP_BUILD_ID` viajó adentro. Imprime el digest en el resumen del workflow.
- **Nada de eso ata la etiqueta al contenido con una garantía criptográfica.**
  Una etiqueta se puede volver a apuntar en GHCR. El build local de emergencia
  (`docker compose build app` con `APP_IMAGE` puesto) la pisa con el árbol del
  VPS, cambios sin commitear incluidos, y no lleva la etiqueta OCI `revision`.
  Hoy no se comprueba ni el digest ni el contenido de la imagen contra el commit.

Lo que sí se comprueba desde el 2026-10-08: si `APP_IMAGE` está definida en el
entorno con otro valor que el del `.env` —compose le da prioridad—, el
clasificador sale INDETERMINADO.

Lo que **no** se comprueba, y queda pedido como decisión porque agrega un
mecanismo o cambia lo que hoy recibe un comando desconocido:

1. **Comprobar la imagen local antes de clasificar.** Antes de dar el 0, leer con
   `docker image inspect` la etiqueta OCI `revision` y el `APP_BUILD_ID` de la
   imagen de `APP_IMAGE`, y exigir que coincidan con el SHA. Ataja el build
   local de emergencia y una etiqueta reapuntada a otro build. No ataja una
   imagen fabricada con las dos etiquetas falsas; eso pide comparar el digest
   con el de la CI.
2. **La forma exacta del runbook también para el ERP**, como la de Azul Chat del
   PR #151. Hoy un comando que pone otra imagen en la misma línea
   (`APP_IMAGE=… docker compose …`), monta otras migraciones (`-v …:/app/prisma`),
   usa otro `--env-file` o corre `docker run <otra imagen>` sigue yendo al
   clasificador, que mira la del `.env` y con 0 lo dejaría pasar. Un candado lo
   registra como límite.

### LA GUARDIA ESTUVO MUERTA Y NADIE SE ENTERÓ — 2026-09-15

**Un control que falla abierto es peor que no tener control**, porque se lee como
presente. Pasó, y conviene saber la forma exacta para reconocerla en otro lado.

El hook importaba `lib/deploy/guardiaMigraciones` cuando ese archivo se llamaba
`.js`. Tiene sintaxis de módulo ES, y como el `package.json` del repo no declara
`"type": "module"`, un `.js` es CommonJS. **Node 20 lo disimula** —reparsea como
ESM y sigue— **y node 18 no**. El node del sistema del VPS es 18, y es el que
ejecuta los hooks.

Resultado: la guardia andaba en la CI y en el entorno de pruebas, y estaba muerta
**justo en la máquina desde la que se despliega**. El hook se caía con un error de
sintaxis, salía con código 1 —que para un PreToolUse no es un bloqueo— y el
comando corría igual. Se descubrió después de un despliegue que ya había corrido
`migrate deploy` sin guardia, y no lo encontró ningún control: se encontró
mirando a propósito.

Los cuatro comandos bloqueados **tampoco** estaban bloqueados en esa máquina.

Lo que quedó, y son tres cosas porque una sola no alcanzaba:

1. El módulo se llama `.mjs`. Arregla el caso conocido.
2. El hook carga con `import()` adentro de un `try` que **DENIEGA** si no puede
   cargar. La próxima causa no va a ser una extensión y no la vamos a ver venir;
   esto la ataja igual. Para no volverse inusable, la red de último recurso solo
   frena lo que nombra `prisma` y deja pasar el resto **diciendo** que no
   comprobó nada.
3. `scripts/hooksSeCargan.test.mjs`, que se pone rojo si un hook vuelve a
   alcanzar un `.js` con sintaxis de módulo ES. **Afirma sobre la CAUSA y no
   sobre el síntoma**, a propósito: la suite corre con node 20, donde el defecto
   no se reproduce, así que un candado que solo ejecutara el hook habría estado
   en verde todo el tiempo. Verificado por contraprueba: reintroducido el
   defecto, ese candado da rojo mientras los que ejecutan el hook siguen verdes.

**Desde el 2026-08-10 esta guardia importa más que antes.** Ese día Emanuel sacó
los pedidos de permiso —`defaultMode` en `dontAsk`— porque un cartel que siempre
se acepta no protege y solo frena. El cartel era el segundo control de todo lo de
acá. Al desaparecer, este hook pasó a ser el único que queda del lado de la
máquina, y por eso se le agregaron las dos cosas de abajo.

**Esa guardia NO hace obligatorio el chequeo.** Cubre un solo camino. Estos
llegan a producción sin pasar por ella:

1. **Una terminal cualquiera fuera de Claude Code.** `ssh vps-erp` y el comando a
   mano desde PowerShell, Git Bash o el editor: el hook ni se entera.
2. **Un `docker compose` tipeado dentro del VPS.** Es otra máquina; nada de esto
   existe ahí.
3. **`DEPLOY_MIGRACION_AUTORIZADA=1`**, que es la puerta prevista. Deja rastro en
   la línea de comandos, avisa en pantalla, y desde el 2026-08-10 además escribe
   una línea en `.claude/migraciones-autorizadas.log`. Ver más abajo por qué no
   alcanzaba con las dos primeras.
4. **Otra sesión de Claude Code fuera de este repo**, o con `--settings` propio:
   el hook es de proyecto y se resuelve por directorio.
5. **`prisma migrate deploy` escrito de otra forma** — un script intermedio, un
   alias, un `Makefile` que lo envuelva. La guardia hace match sobre el texto del
   comando, así que un envoltorio la esquiva sin querer.
6. **GitHub Actions.** Hoy solo construye la imagen y no migra, pero si algún día
   migrara, el hook no corre ahí. Ese es el único lugar que obligaría de verdad,
   y está fuera del alcance de lo local.
7. **La consola del proveedor o cualquier cliente SQL** contra la base.
8. **`prisma mcp`, si alguien alguna vez lo conecta.** Es un comando del propio
   CLI que levanta un servidor MCP para herramientas de IA. Hoy no está
   conectado y por eso no es un agujero abierto, pero si se conectara, las
   operaciones sobre la base llegarían como llamadas de herramienta MCP y **no
   como comandos de shell** — y toda esta guardia mira comandos de shell.
   Enchufarlo daría la vuelta completa alrededor de los cuatro bloqueos, de la
   autorización manual y de su bitácora, de una sola vez y sin que nada avise.
   **Es una decisión pendiente, no un detalle:** está en
   `docs/decisions/DEC-0007-prisma-mcp-sin-decidir.md`, sin resolver.

En resumen: la guardia atrapa el camino que se usa todos los días —desplegar
desde una sesión de Claude Code en este repo— y **ninguno de los otros**. Es el
mecanismo local más fuerte disponible, no una garantía. Lo que hace obligatorio
un chequeo es que corra del lado del servidor, y eso todavía no existe.

### Los cuatro comandos bloqueados — no los desbloquees sin leer esto

La guardia rechaza cuatro comandos de Prisma, **siempre y sin variable que los
habilite**. `DEPLOY_MIGRACION_AUTORIZADA=1` no sirve para ninguno: se probó con
los cuatro y siguen rechazando. Es a propósito.

1. **`db push`** — compara `schema.prisma` contra la base y aplica la diferencia
   sin generar archivo de migración. Si esa diferencia incluye tirar una columna,
   la tira con los datos adentro y no queda ni la sentencia que lo hizo.
2. **`migrate reset`** — borra la base entera y la reconstruye. Lo dice su propia
   ayuda: *all data will be lost*. No tiene versión suave.
3. **`db execute`** — manda SQL crudo desde un archivo o desde la entrada
   estándar. Además acepta `--url`, o sea que la base destino se escribe en la
   misma línea y no depende del `.env`: puede apuntar a producción sin que nada
   del entorno lo delate.
4. **`migrate resolve`** — marca una migración como aplicada o revertida **sin
   ejecutarla**. No toca los datos: falsea `_prisma_migrations`, que es la tabla
   contra la que este mismo documento verifica en el paso 4. Un estado mentido
   hace que la verificación dé bien con el esquema mal.

**El criterio, que es lo que hay que entender antes de tocar la lista.** Un
comando entra si cumple las dos condiciones: puede destruir o falsear, Y no hace
falta para el trabajo de todos los días. La segunda es la que explica las
ausencias. Lo que sí hace falta no se tapa aunque sea peligroso —se informa y
decide Emanuel—, porque una guardia que estorba todos los días se termina
apagando, y ahí deja de proteger de todo.

**Lo que se miró y NO se tapó**, con el motivo, está en la constante
`NO_TAPADOS` de `lib/deploy/guardiaMigraciones.mjs`: `migrate dev` (puede resetear
la base, pero es el comando del trabajo diario), `studio` (edita cualquier fila,
pero el daño lo hace una persona haciendo clic y eso no lo distingue un match de
texto), `db seed` (ya está protegido mejor por `scripts/lib/clientePrisma.mjs`) y
`db pull` (pisa `schema.prisma`, pero eso está en git). **No son olvidos.**

**Por qué no los cubre el clasificador.** El clasificador lee archivos de
migración. Estos cuatro o no generan archivo, o no lo ejecutan. No es que se los
dejó pasar: no existe la superficie sobre la que trabaja.

**Qué estaban tapando.** Hasta el 2026-08-10 los frenaba el cartel de permiso.
Ese día los carteles se apagaron por decisión de Emanuel, y los cuatro quedaron
pudiendo tocar producción sin que nada los mirara.

**La regla, textual:** *"db push no lo quiero nunca, en ningún caso. Si algún día
hace falta, lo hablamos."* Y sobre la lista: *"no lo hagas solo, porque si vamos
de a uno siempre va a faltar la próxima."* Son decisiones suyas, no propiedades
del sistema.

**Si aparece un comando nuevo, se agrega a la lista. No se hace una excepción**,
no se le pone un `if` al lado, y no se le agrega una variable de escape a
ninguno. Mientras haya un solo lugar, agregar el próximo cuesta una línea y un
candado; en cuanto haya dos mecanismos, el que revise va a mirar uno y creer que
vio los dos. Y si uno hace falta de verdad, se saca de la lista **a propósito**,
diciendo en el commit qué caso lo justificó.

Los candados están en `lib/deploy/guardiaMigraciones.test.mjs`: uno por comando
llamado "NO SE AUTORIZA CON NADA", más "LA LISTA DE RECHAZO NO SE RECORTA", que
se pone rojo si alguien saca una entrada. Verificados por mutación con siete
formas distintas de aflojar la guardia; las siete se detectan.

**De dónde salió la lista:** de enumerar el CLI instalado, no de acordarse.
`prisma --help` de la 6.19.3 más los sub-help de `db` y de `migrate`. Si se
actualiza Prisma, se vuelve a enumerar así.

**El costo, que es real y conocido:** la guardia hace match sobre el TEXTO del
comando, así que frena también un `echo`, un `grep` o un `cat` que mencionen una
de las frases. Pasó dos veces al construirla: la prueba se frenó a sí misma, y
después se frenó la edición de este documento. Si hace falta escribir sobre
estos comandos, se hace con las herramientas de edición, no con la shell. Frena
de más y esa es la dirección correcta.

### Los límites del clasificador

- **Es análisis de texto, no un parser SQL**, y no lo va a ser. No distingue un
  `DROP COLUMN` de una columna muerta de uno de una columna en uso.
- **No lee adentro de bloques dinámicos.** Un `DO $$ ... $$` o un `EXECUTE` con
  la sentencia armada como string le pasan por al lado.
- **No detecta incompatibilidades semánticas sin palabras conocidas.** Un
  `CREATE UNIQUE INDEX` sobre datos que ya tienen duplicados falla al aplicarse y
  no aparece acá. Una migración que agrega una columna que el código viejo no
  espera pero que cambia el comportamiento de un trigger, tampoco.
- **Marca de más.** Todo `UPDATE` queda marcado, incluidos los backfills
  idempotentes que rellenan nulos. Es a propósito: preferimos frenar de más.
- Los candados están en `scripts/clasificar-migraciones.test.mjs`, con dos
  fixtures en `tests/migraciones/` —una aditiva y una destructiva— que no se
  aplican nunca y existen para que el clasificador se pueda romper solo.

## Paso 5 — Verificación de cierre

No se cierra el despliegue sin esto. Los cinco valores tienen que dar el **mismo
SHA completo**:

```bash
git rev-parse origin/main
ssh vps-erp 'cd /srv/produccion/erpazul && git rev-parse HEAD'
ssh vps-erp 'docker inspect erpazul_app --format "{{.Config.Image}}"'
ssh vps-erp 'docker exec erpazul_app printenv APP_BUILD_ID'
curl -s https://operix.cloud/api/version
```

Y el estado del sistema:

```bash
ssh vps-erp 'docker ps --filter name=erpazul --format "{{.Names}} {{.Status}}"'
ssh vps-erp 'docker inspect erpazul_app --format "{{.RestartCount}}"'      # 0
ssh vps-erp 'docker logs erpazul_app --since 10m 2>&1 | grep -iE "error|fatal" | head'
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate status'
curl -s -o /dev/null -w "%{http_code}\n" https://operix.cloud/login   # 200
ssh vps-erp 'cd /srv/produccion/erpazul && git status --porcelain'    # vacío
```

PostgreSQL healthy, 0 reinicios, logs sin errores, migraciones al día, `/login`
en 200 y el árbol del VPS limpio. Si algo de esto no da, se informa — no se
maquilla.

### Y LA SONDA POST, CORRIDA AFUERA — SIN VERDE NO SE CIERRA

Con los cinco valores ya coincidiendo, y con el SHA COMPLETO que se desplegó:

```bash
git show origin/main:scripts/sonda-externa.mjs | \
  node --input-type=module - --fase post --sha-esperado <SHA_COMPLETO>
echo "sonda POST: $?"
```

**Solo con 0 el despliegue se da por cerrado.** Es el mismo mecanismo que la PRE
del paso 0 —mismo workflow, misma sonda— y comprueba además que producción sirva
`<SHA_COMPLETO>` antes y después de medir.

**Si da ROJO, el despliegue NO está cerrado**, y el informe lo dice con la línea
ROJO y el enlace de la corrida:

- Si el rojo es de la cascada o de la versión servida, es un defecto de lo que se
  desplegó: la PRE estaba en verde, así que lo trajo este despliegue. Se decide
  con las reglas de "Rollback sin compilar", no se deja corriendo "a ver".
- Si el rojo es de la medición —el token, GitHub que no contesta, una corrida que
  no terminó—, se arregla la causa y se vuelve a correr ESTE comando. Mientras
  no dé VERDE, el despliegue sigue sin cerrar: no se reemplaza por una medición
  a mano ni se da por bueno porque los cinco valores coinciden.

Los cinco valores prueban que corre lo que se quiso desplegar; la POST prueba que
lo que corre se ve como tiene que verse. Ninguna tapa a la otra.

### CÓMO SE ELIGE UN MARCADOR PARA MIRAR ADENTRO DE LA IMAGEN

Los cinco valores prueban que el despliegue es **consistente**, no que la imagen
tenga lo que se quería desplegar. Para eso hay que buscar algo adentro del build
—`docker exec erpazul_app grep -r … /app/.next`— y ahí se elige un marcador. Se
elige mal muy fácil.

**El marcador TIENE QUE NO EXISTIR ANTES, y eso se comprueba contra el commit
desplegado, no contra la memoria de quien lo escribió.**

```bash
git show <SHA_QUE_ESTABA>:ruta/al/archivo.jsx | grep -c "mi-marcador"   # tiene que dar 0
```

*El caso, del 2026-08-14:* se eligió `altoVa` como marcador de una tanda que
agregaba ese parámetro al kit. Dio **positivo en la imagen vieja**, o sea en una
imagen que no tenía la tanda. No era un error del grep: `altoVa` ya vivía adentro
de la tabla `FORMAS` desde antes, como clave. El que lo escribió se acordaba de
haberlo agregado como PROP y no de que el identificador ya estaba. Leído rápido,
ese positivo decía "mi cambio viajó" — y era falso.

El que sirvió fue `overflow-x-auto shrink-0`, comprobado con el `git show` de
arriba: cero apariciones en el commit desplegado.

**UN IDENTIFICADOR NO PUEDE SER MARCADOR: EL BUILD DE PRODUCCIÓN LO MINIFICA.**

Es la lección que faltaba del caso de arriba, y no es que `altoVa` estuviera
elegido con poca memoria: es que **ningún** nombre de función, de variable o de
prop sirve para esto.

*Medido el 2026-08-16, y lo mostró el control.* Se probaron dos identificadores
dentro de la imagen que atendía: `declaraMargenVertical`, que **no** existía en
el commit desplegado, y `declaraPaddingY`, que **sí** existía en él sin ninguna
duda. Los dos dieron **vacío**. El segundo es el control, y su vacío es lo que
prueba que el método no anda: un identificador que está no se encuentra igual que
uno que no está.

O sea que un marcador de identificador **no afirma nada, ni a favor ni en
contra**. Si se usa uno y da vacío, eso no dice "no viajó" — no dice nada. Lo que
sirve son las CADENAS: un nombre de clase, un texto de interfaz, un selector CSS.
Esas no se manglan.

Corolario del corolario: **si el control de un marcador da vacío, el marcador se
descarta entero.** No se busca una explicación para el marcador y se deja el
control de lado; el control es el que decide si la pregunta se pudo hacer.

**Y EL MARCADOR VA ANCLADO, NO SUELTO.**

*El caso, del mismo día:* el marcador de la tanda era la clase `my-0`, nueva en
el commit a desplegar. Buscada **suelta**, como subcadena, dio **positivo en la
imagen vieja** — porque `my-0` vive adentro de `!my-0`, que sí estaba. Tres
archivos. Leído rápido, otra vez "mi cambio ya está".

Buscada **anclada en la forma en que aparece en la hoja** —`.my-0{`, con el punto
y la llave— dio vacío en la vieja y **un archivo en la nueva**, que es lo que
tenía que dar. El control `.my-2{`, presente en las dos.

Dos cosas que hacen falta para anclar bien y que se pagan si no se saben:

- **En el build de producción el CSS está minificado y es UNA SOLA LÍNEA.** La
  llave va pegada al selector —`.my-0{`— y no hay espacio. Un patrón copiado de
  cómo se ve la hoja en desarrollo, con `.my-0 {`, no matchea nada, y ese vacío
  se lee como "no viajó". Y `grep -c '^\.'` sobre un archivo minificado devuelve
  **1**, no la cantidad de reglas.
- **Se busca con `grep -F`**, cadena fija. Un punto y una llave son metacaracteres
  y ya hicieron dar "ausente" a reglas que estaban.

**Y UN MARCADOR QUE VIVE SOLO EN UN COMENTARIO DA VACÍO: EL BUILD LOS BORRA.**

*El caso, del 2026-09-18, desplegando `652a5c03`.* El marcador elegido fue
`BUSCARLO EN LA LISTA`, una cadena en mayúsculas que el `git grep` encontraba en
dos archivos de `app/` y **cero veces** en el commit desplegado — o sea que pasaba
la comprobación de "no existía antes" con holgura. Adentro de la imagen dio
**vacío**, con el control encontrando bien. Leído según la regla de arriba, eso
dice "no viajó", que para un despliegue ya recreado es una frenada.

No era eso. Las dos apariciones estaban **adentro de comentarios** —un encabezado
de sección y un título de archivo—, y el build de producción los saca. La cadena
nunca iba a estar, con la tanda desplegada o sin desplegar.

**Es el primo del caso de Tailwind, y va al revés.** Allá el build tiene DE MÁS
—una clase se sigue generando porque un comentario la nombra— y acá tiene DE
MENOS. La regla que sale de los dos juntos: lo que un comentario hace con un
marcador depende de quién lo lee. Tailwind escanea el archivo crudo y los ve; el
compilador de JavaScript los borra.

En la práctica, después de comprobar que el marcador no existía antes, **mirar
CÓMO está escrito donde sí existe**: si las apariciones son todas comentarios, no
sirve. El que sirvió fue `Elegí un renglón de la lista.`, que es el texto de un
error que la ruta devuelve de verdad.

**Y UN MARCADOR CON ACENTOS NO SIRVE SI EL TEXTO VIVE EN UN TEMPLATE LITERAL.**

*El caso, del 2026-09-18, desplegando `37cf5c87`.* El marcador era el cartel
nuevo de la pantalla, y se buscó por `quedaron afuera: los productos que tenían
vinculados`. Dio **vacío** — con el marcador hermano encontrando y el control
encontrando, o sea con la búsqueda funcionando perfectamente. Leído según las
reglas de arriba, eso dice "no viajó".

El texto estaba. Lo que pasa es que ese cartel se arma con un **template
literal** —lleva un número interpolado adelante— y ahí el build **escapa los
caracteres no ASCII**: en el archivo, `tenían` quedó escrito `ten\xedan` y
`después` quedó `despu\xe9s`. La cadena con la `í` de verdad no matchea nada.

**Y en el mismo archivo, a tres caracteres de distancia, los acentos SÍ
sobreviven**: la otra rama del mismo cartel es un string normal entre comillas y
ahí `Una fila quedó afuera` se encuentra tal cual. La diferencia no está en el
texto ni en el archivo: está en **qué clase de literal lo contiene**.

En la práctica: **el trozo que se busca va sin acentos**. `quedaron afuera: los
productos` encuentra; la misma frase estirada hasta la primera `í`, no. Es gratis
—siempre hay un tramo ASCII largo— y evita exactamente esta media hora.

Van tres variantes de la misma familia y conviene nombrarla entera: **el texto
del repo y el texto del build no son la misma cadena.** Tailwind ve los
comentarios y el compilador los borra; el minificador mangla identificadores; y
un template literal escapa lo que no es ASCII. Antes de creerle a un vacío, mirar
CÓMO quedó escrito lo que se busca —`grep -oE 'trozo.{0,120}'` sobre el chunk lo
muestra en un comando—.

**Y su par, que es la otra mitad: un vacío solo significa algo si la misma
búsqueda encuentra algo cuando tiene que encontrarlo.**

```bash
docker exec erpazul_app sh -c 'grep -rl "overflow-x-auto shrink-0" /app/.next'  # vacío = no está
docker exec erpazul_app sh -c 'grep -rl "overflow-x-auto" /app/.next'           # con líneas = la búsqueda anda
```

Sin esa segunda línea, un grep mal escrito, una ruta equivocada o un `docker exec`
que falló en silencio dan el mismo vacío que "no está" — y ese vacío se lee como
la respuesta que uno esperaba.

**En una tanda que solo QUITA código**, el marcador es al revés: algo que tiene
que haber DESAPARECIDO, y el control es que siga apareciendo antes. Misma regla
dada vuelta y las dos mitades siguen haciendo falta.

**Y UNA CLASE DE TAILWIND NO DESAPARECE PORQUE LA SAQUES DEL CÓDIGO: DESAPARECE
CUANDO NADIE LA NOMBRA, NI SIQUIERA EN UN COMENTARIO.** Tailwind escanea el
CONTENIDO CRUDO de los archivos de `content`, y un comentario es contenido.

*El caso, medido el 2026-08-16:* la tanda sacó los diez `!` del separador, así
que ningún componente escribe ya `!my-0` ni `!my-1`. Un marcador de desaparición
sobre eso **habría dado falso**: las dos reglas se siguen generando, porque el
JSDoc de `lib/sunmi/claseNegociada.js` las nombra al explicar por qué existían.
Comprobado con tres corridas limpias de `npx tailwindcss`, no con el dev server
—que además cachea—: con el repo entero salen `.\!my-0` y `.\!my-1`; sacando
`lib/` del `content`, desaparecen las dos y `.my-0` se queda. Un archivo, un
comentario.

En la práctica, antes de usar un marcador de desaparición para una clase:

```bash
git grep -lE 'mi-clase' -- "app/**/*.jsx" "components/**/*.jsx" "lib/**/*.js"   # tiene que dar vacío
```

Los `.md` y los `.test.mjs` no entran en `content` y no cuentan; los `.js` de
`lib/` sí. **Es la misma familia que la trampa del archivo huérfano —el código
del repo y lo que llega al build no son lo mismo— pero al revés: acá el build
tiene de más, no de menos.**

**CONFIRMADO EN LA HOJA VIVA DE PRODUCCIÓN, 2026-08-17.** Lo de arriba se había
medido con `npx tailwindcss` en la máquina local. El despliegue de `00fcaf0` lo
puso a prueba contra la hoja que sirve `operix.cloud`, y el discriminador acertó
en los dos sentidos:

- `.\!my-0{` y `.\!my-1{` **siguen ahí**, y el `git grep` de arriba devuelve
  `lib/sunmi/claseNegociada.js` para las dos.
- `.\!my-2{` **desapareció**, y el mismo `git grep` para `!my-2` devuelve vacío.

Las tres clases las dejó de escribir la misma tanda, en el mismo archivo y el
mismo día. **La única diferencia entre la que se fue y las dos que quedaron es un
JSDoc que nombra a dos y no a la tercera.** No hay nada en el código que las
distinga, así que esto no se deduce mirando el diff: se pregunta con el `git
grep`, siempre.

Y dejó un rastro que conviene reconocer, porque al principio se leyó como un
problema: **el total de reglas de la hoja no se movió** —1521 antes y 1521
después—, y eso hizo sospechar que se estaba midiendo una hoja cacheada. No lo
era. Es que se fue una regla y llegó otra: menos `.\!my-2`, más `.my-0`. Un conteo
global que no cambia puede estar tapando dos cambios que se compensan, igual que
en la verificación de una migración de datos se cruzan los ids y no los totales.

Y si para algo no se puede armar un marcador con su control —porque el cambio no
deja rastro en el build, por ejemplo—, **se dice que no se pudo verificar** en vez
de darlo por bueno.

### Y con el despliegue ya verificado: la auditoría de costos fuera de rango

```bash
DATABASE_URL="<la de producción>" node --import ./scripts/alias-loader.mjs \
  scripts/auditoria/costos-aplicados-fuera-de-rango.mjs
```

**Va DESPUÉS de verificar el despliegue, no antes**, y el orden importa: si el
despliegue se cayó o hubo que hacer rollback, lo que este informe mire no es lo
que está atendiendo. Primero se confirma qué versión quedó corriendo, después se
le pregunta a la base.

**Qué contesta.** Por cada importación que escribió costos, cuáles quedaron fuera
del rango que ese proveedor tenía configurado: producto, costo anterior, costo
escrito y porcentaje. Separa los que **alguien eligió a mano sabiendo** —que son
legítimos y llevan su marca— de los que **nadie eligió**, que son los que
importan.

**De dónde viene.** Hasta `27c70832` nada volvía a controlar el rango al aplicar:
el estado de una fila se congela al conciliar, `clasificarLinea` nunca miró el
rango, y la rama de las filas confirmadas se salteaba el cálculo entero. Con eso
se podía escribir un +1.008 % sobre un proveedor que aumenta entre 2 y 15. Desde
`27c70832` no puede volver a pasar, pero **lo que ya se escribió sigue escrito**,
y esto es lo que lo busca.

**Es de SOLO LECTURA y se puede comprobar**: pide el cliente en nivel `LECTURA`
—el único que la fábrica deja apuntar a un host que no sea local— y no tiene una
sola llamada de escritura. Hay un candado, `scripts/auditoria/soloLectura.test.mjs`,
que lo afirma leyendo el fuente y se pone rojo si alguien le agrega un `update`
"para arreglar de paso".

**El resultado va en el informe**, aunque dé cero: "ningún costo fuera de rango"
es un dato, y no decirlo hace que la próxima vez nadie sepa si se corrió. Si
aparece alguno sin elegir, va con su número y su producto — **y no se corrige
desde acá**: lo que haya que arreglar se arregla desde la aplicación.

**ESTE PASO CORRE SIEMPRE, traiga migraciones el despliegue o no.** No depende de
que la tanda haya tocado el módulo de listas: lo que busca son costos que ya
estaban escritos de antes, así que el día que no se corre es justamente el día en
que nadie mira.

La primera corrida fue a mano el 2026-09-17, después del despliegue de
`ffb85675` y porque Emanuel la pidió — el despliegue mismo no la había hecho, por
el motivo que está en el paso 0. Encontró **186 costos fuera de rango, 162 sin
que nadie los eligiera**, repartidos en tres importaciones de agosto y
septiembre. O sea que el paso no es teórico: la primera vez que corrió, encontró.

### Y antes de escribir el reporte: la bitácora de autorizaciones

```bash
cat .claude/migraciones-autorizadas.log
```

Si aparece una línea con la fecha de hoy, **se dice en el reporte**: que se usó
la autorización manual, sobre qué comando, y que por eso el clasificador no miró
las migraciones que entraron. No es un detalle técnico — es el único control que
quedó de ese caso.

Este paso existe porque **el aviso de pantalla no alcanza, y eso se comprobó**:
en la ruta de "permitir", ni el `systemMessage` ni la razón del hook vuelven al
contexto de quien está trabajando. El cartel se le muestra a Emanuel en el
momento y a nadie más; si él está mirando otra cosa, no queda nada. El archivo sí
queda.

Está en `.gitignore` a propósito: es el rastro de lo que pasó en esta máquina, no
del repo. Si algún día el despliegue se hace desde otro lado, ese lado necesita
su propia bitácora.

### Los cinco valores no ven la base

**Todos miran el SHA del código; ninguno mira el estado del esquema.** Si la
migración no se aplicó, los cinco coinciden igual y el despliegue parece
perfecto. Por eso, cuando el despliegue trae migraciones, la verificación de
cierre lleva además esto:

```bash
ls -1 prisma/migrations | grep -c '^[0-9]'    # cuántas hay en el árbol
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml \
  run --rm -T --no-deps app prisma migrate status'
```

`migrate status` tiene que informar el mismo número que el árbol y decir
"Database schema is up to date!".

Y si la migración era **de datos**, se comprueba el efecto contra la base, solo
lectura, con números decididos de antemano:

- Cuántas filas debían cambiar y cuántas cambiaron.
- Que las que cambiaron sean **exactamente** las de la lista: ninguna de la lista
  sin tocar, y ninguna tocada que no estuviera en ella. Los dos lados, no uno.
- Si la migración escribe bitácora, que las filas aparezcan y con su autor.

Un conteo global que "da bien" puede tapar que se tocaron unas de más y otras de
menos. Se cruzan los ids, no los totales.

## Trampas ya conocidas

- **`docker compose run` sin `-T` consume stdin.** Si el comando llega por
  heredoc de `ssh`, se come el resto del script y los pasos siguientes no
  corren. Usar `-T` o redirigir `</dev/null`.
- **Nunca `docker compose config` sin filtrar**: resuelve la interpolación y
  vuelca `POSTGRES_PASSWORD` en claro. Usar `config --images` o filtrar. Tampoco
  imprimir `DATABASE_URL` ni el contenido de `.env.prod`.
- **El warning `The "POSTGRES_PASSWORD" variable is not set`** es el pendiente
  conocido de interpolación. Mientras no se resuelva, **no ejecutar nada que
  cree o recree el servicio `db`**, y no silenciarlo duplicando el secreto en el
  `.env` de Compose.
- **`APP_IMAGE` dentro del contenedor tiene que dar 0**:
  `docker exec erpazul_app env | grep -c APP_IMAGE`. Si da 1, está en el archivo
  equivocado.
- **Un 404 de `curl` contra un servidor recién levantado no distingue "no existe
  la ruta" de "no llegaste bien".** Confirmar que el proceso terminó de arrancar
  antes de sacar conclusiones.
- La rotación de credenciales **no** se revierte con el rollback: la versión
  anterior tiene que levantar con la contraseña nueva.

## Rollback sin compilar

Apuntar `APP_IMAGE` a la referencia fija registrada en el paso 2 y repetir el
paso de recrear. Sin compilar, sin `build`. Este camino sí se usó.

### Un rollback de imagen NO deshace una migración

Volver la imagen atrás revierte el **código** y nada más. El esquema y los datos
quedan como los dejó `migrate deploy`, y la entrada en `_prisma_migrations`
también: para Prisma esa migración sigue aplicada.

Es la asimetría central del despliegue con migración, y hay que tenerla presente
**antes** de desplegar, no al momento de volver atrás:

- **El código vuelve en segundos. Los datos no vuelven solos.**
- Si la migración era compatible hacia atrás —y por la regla de la ventana
  debería serlo—, la versión anterior corre bien sobre el esquema nuevo. Ese es
  el caso feliz: se revierte el código y no hace falta tocar la base.
- Si además hay que reponer datos, hay dos caminos y **ninguno es automático**:
  el SQL de reposición que dejó la propia tanda —para el vaciado de códigos está
  en `docs/business-rules/codigos-vaciados-2026-08-10.md`, con un `UPDATE` por
  fila y la condición para no pisar lo que se haya cargado en el medio—, o el
  dump previo, que es el último recurso porque restaurarlo entero se lleva puesto
  todo lo que pasó desde que se sacó.

Corolario para el que despliega: **toda migración de datos tiene que llegar con
su reposición escrita**, con los valores anteriores, antes de aplicarse. Si no la
tiene, el único camino de vuelta es el dump completo, y eso significa perder las
ventas del día.

Deshacer la migración en sí —el SQL inverso más la entrada de
`_prisma_migrations`— es otra cosa, y está abajo.

### Si una migración falla a mitad de camino — LEER ESTO ANTES DE TOCAR NADA

Es el peor momento del despliegue y hay que leerlo con la cabeza fría, así que
está escrito para leerlo justo ahí y no antes.

**Primero: ¿el local puede seguir vendiendo?** Es la única pregunta urgente. El
orden del despliegue migra ANTES de recrear, así que en ese momento la
aplicación que atiende **sigue siendo la versión vieja**. Si la migración que
falló no dejó el esquema roto para ese código, el mostrador sigue funcionando y
no hay apuro. Establecer eso primero y decírselo a Emanuel primero. Todo lo
demás puede esperar diez minutos; esto no.

**Segundo: NO reintentar y NO marcar.** Prisma deja la migración anotada en
`_prisma_migrations` como fallida, y a partir de ahí `migrate deploy` se niega a
seguir hasta que alguien resuelva esa entrada. Eso no es un problema a esquivar:
es el mecanismo funcionando. Reintentar a ciegas puede aplicar dos veces lo que
sí entró.

**Tercero: el comando que Prisma manda usar acá está BLOQUEADO a propósito.**
`prisma migrate resolve` es exactamente lo que la documentación oficial indica
para este caso, y es exactamente por eso que está en la lista de rechazo: es el
comando que hace que el registro diga que algo pasó cuando no pasó. Usado bien
es la salida; usado con apuro y sin entender qué quedó aplicado, deja la base en
un estado que ningún control posterior detecta, porque el control lee el
registro que se acaba de falsear.

No está bloqueado por descuido ni porque nadie pensó en este día. **Está
bloqueado pensando en este día.** Y `prisma db execute` también, así que el SQL
inverso del rollback tampoco se ejecuta con Prisma.

**Cuarto: juntar los hechos, que se puede sin desbloquear nada.** Todo esto pasa
por la guardia sin problema:

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate status'
ssh vps-erp 'docker logs erpazul_app --since 30m 2>&1 | tail -50'
```

Y leer el `migration.sql` que falló, que está en el repo. Con eso se arma la
única respuesta que importa: **qué sentencias entraron y cuáles no.**

⚠️ Una advertencia honesta sobre eso: Prisma aplica cada archivo de migración
dentro de una transacción, así que lo esperable es que un fallo no deje nada a
medias. **Pero no todas las sentencias son transaccionables en PostgreSQL**, y
este proyecto nunca vio el caso. Tratar "no quedó nada a medias" como una
hipótesis a comprobar mirando la base, no como un hecho.

**Quinto: informar y ESPERAR.** Decirle a Emanuel qué migración falló, con qué
sentencia, qué quedó aplicado, si el local sigue operando, y cuáles son las
opciones. **No decidir por criterio propio y no desbloquear nada.** Si la salida
es marcar la migración, eso significa sacarla de la lista de rechazo de
`lib/deploy/guardiaMigraciones.mjs` a propósito y con su confirmación — no
inventarle un flag, no correrla por otro camino, no hacerla desde el VPS para
esquivar la guardia. Ese trámite cuesta a propósito, y el día que cuesta es este.

### La excepción de `libro_stock` por lock timeout

Ese trámite se hizo por primera vez el 2026-09-27: Emanuel autorizó una
recuperación tipada para `20260927120000_libro_stock` cuando falla porque no
consiguió su candado en 3 s. **Es uno de los dos casos en que este runbook
permite un `migrate resolve` —el otro es la activación del Libro de Costos, más
abajo—, y es solo `--rolled-back`.** `--applied` sigue prohibido
siempre: medido, deja el registro diciendo que el libro existe cuando no existe,
y `migrate deploy` ya no lo vuelve a correr nunca. Cualquier otra migración que
falle, o esta por cualquier otra causa, va por lo de arriba: FRENAR e informar.

**Por qué es seguro en este caso y no en general.** La activación del libro es un
único bloque atómico: si no consigue el candado, PostgreSQL la revierte entera
—ni tablas, ni triggers, ni una fila del punto cero—. Probado contra PostgreSQL
por el camino real de Prisma en `scripts/pruebas-db/recuperacionLibroStock.mjs`.
El `--rolled-back` escribe en `_prisma_migrations` exactamente eso: que el intento
se revirtió. No falsea nada. Lo que la hace segura es que un diagnóstico de solo
lectura LO DEMUESTRA antes, y la guardia solo deja pasar el comando que encadena
el diagnóstico con el resolve.

**NO restaurar el backup por esto.** Un CASO 1 confirmado dejó la base como estaba
más `correccion_caja` —medido: los mismos objetos más los de `CorreccionCaja`, y
`StockLocal` idéntica fila por fila—. `correccion_caja` queda aplicada: NO se
revierte porque la siguiente haya fallado. El backup y el rollback general quedan
para lo que NO se pueda demostrar como CASO 1.

**`migrate status` NO prueba nada acá.** Medido: después del `--rolled-back`
dice "Database schema is up to date!" con el libro SIN aplicar. Lo que prueba es
el diagnóstico, y después del reintento, la verificación POST de abajo.

#### PRE — antes del paso 4 del despliegue

1. Backup validado, como siempre (paso 0).
2. Después del paso 3 (pull de la imagen) y justo antes de migrar, el precheck de
   solo lectura. Si da ROJO, **NO se inicia ninguna migración**: se espera a que
   termine lo que retiene el stock, o se reprograma la ventana.

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -f - < scripts/deploy/precheck-libro-stock.sql'
```

   Frena si hay una migración fallida sin resolver, una transacción abierta hace
   más de 2 s, o un candado sobre `StockLocal`, `ProductoBase` o `Local` que choque
   con el de la activación. Informa las filas de `StockLocal` —la activación tarda
   del orden de 28 ms con 4k, 283 ms con 50k, 764 ms con 100k— y la salud de
   PostgreSQL. Reduce el riesgo; no reemplaza la recuperación.
3. Clasificación y autorización del paso 4 como siempre. Ventana fuera del
   horario de venta.

#### INTENTO

El paso 4 normal: `migrate deploy`. Trae `correccion_caja` y después `libro_stock`.

- **Si falla `correccion_caja`:** FRENAR. Prisma se detiene ahí y el libro ni se
  intenta. No hay diagnóstico ni resolve para esto: va por la sección de arriba.
- **Si pasan las dos:** verificación POST.
- **Si `correccion_caja` pasa y `libro_stock` falla:** diagnóstico, SIN resolver
  nada todavía.

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -v modo=recuperar -f - < scripts/deploy/diagnostico-recuperacion-libro-stock.sql'
```

Imprime cada condición con ✓ o ✗ y termina en `RESULTADO: CASO_1_RECUPERABLE` o en
`RESULTADO: FRENAR`. CASO 1 es, TODAS juntas: la única migración fallida sin
resolver es `libro_stock`; su último intento no aplicó ningún paso; los logs
traen SQLSTATE 55P03 y el "lock timeout" del LOCK TABLE de la activación; las 38
migraciones anteriores están aplicadas, `correccion_caja` incluida; y no existe
ningún objeto del libro —tablas, secuencias, índices, el enum, las funciones
`libro_stock_*`, los triggers, las restricciones—.

- **`RESULTADO: FRENAR`:** FRENAR. Sin resolve, sin reintento, sin `up -d`. La app
  vieja sigue atendiendo. Informar a Emanuel con la salida entera del diagnóstico.
- **`RESULTADO: CASO_1_RECUPERABLE`:** la recuperación tipada. Es el ÚNICO
  `migrate resolve` que la guardia deja pasar, y solo con este texto EXACTO —un
  espacio de más y se rechaza—:

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -v modo=recuperar -f - < scripts/deploy/diagnostico-recuperacion-libro-stock.sql && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate resolve --rolled-back 20260927120000_libro_stock'
```

  Vuelve a correr el diagnóstico adentro, y el `&&` hace que el resolve solo
  corra si dio CASO 1: si entre el diagnóstico de arriba y éste cambió algo, frena
  solo. La guardia lo deja pasar AVISANDO y deja rastro. Y enseguida, confirmar:

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -v modo=revertida -f - < scripts/deploy/diagnostico-recuperacion-libro-stock.sql'
```

  Tiene que dar `RESULTADO: REVERTIDA_LIMPIA`: nada sin resolver, el último intento
  revertido y sin pasos, ningún objeto del libro. Si no, FRENAR.

#### REINTENTO — el segundo, y el último

Con el precheck en VERDE otra vez, el paso 4 de nuevo. Aplica solo `libro_stock`.

- **Si pasa:** verificación POST.
- **Si vuelve a fallar:** el diagnóstico de nuevo. Va a avisar
  `ESTE ES UN SEGUNDO FALLO`.
  - Si es CASO 1: la recuperación tipada y la confirmación `revertida`, para no
    dejar a Prisma trabado en P3009 —que bloquea CUALQUIER despliegue posterior,
    incluso uno sin migraciones—. Y después **FRENAR LA VENTANA**: NUNCA un tercer
    intento, NO el `up -d`, la app vieja sigue atendiendo, informar.
  - Si NO es CASO 1: FRENAR sin resolver.

El límite es de **DOS intentos de aplicar el libro por ventana**. Es una regla de
este runbook, no una garantía del código: el diagnóstico cuenta los intentos
revertidos de toda la historia y avisa desde el segundo, pero no sabe dónde
empieza una ventana. El que despliega la cumple.

#### POST — para declarar el libro activo

`migrate status` no alcanza. Hace falta todo esto:

- las 39 migraciones del árbol aplicadas, **contadas por nombre** entre las filas
  terminadas y no revertidas de `_prisma_migrations`: los intentos revertidos del
  libro quedan como filas aparte y no cuentan;
- `libro_stock` con UN intento terminado; `correccion_caja` aplicada;
- el verificador del libro, de solo lectura, con la integridad física en VERDE:

```bash
DATABASE_URL="<la de producción>" node --import ./scripts/alias-loader.mjs \
  scripts/verificar-libro-stock.mjs
```

- tantas filas `ESTADO_INICIAL` como filas tenía `StockLocal`, con un único
  instante;
- los 5 triggers una vez cada uno, y las 9 funciones `libro_stock_*`;
- después del `up -d` y de las sondas PRE/POST de siempre, una escritura
  productiva real de stock capturada en `MovimientoStock`, y la app sana.

### La excepción de la activación del Libro de Costos por lock timeout

El mismo trámite, para el segundo caso, el 2026-09-29: una recuperación tipada
para `20260929200000_libro_costo_activacion` cuando falla porque
`libro_costo_activar()` no consiguió sus candados en 3 s. Solo `--rolled-back`.
**No activa el libro**: deja el intento anotado como revertido para que el
camino normal —`migrate deploy`— pueda volver a intentarlo. Cualquier otra causa
de fallo, o cualquier otra migración, va por "Si una migración falla": FRENAR e
informar.

**Por qué es seguro en este caso.** La migración es una sola sentencia,
`SELECT "libro_costo_activar"();`, y la función toma sus dos `LOCK TABLE` —sobre
`ProductoBase`, `ProductoLocal` y `Local`, y sobre las tablas del libro— ANTES
de su primera escritura. Si no los consigue, PostgreSQL revierte la transacción
entera: ni triggers, ni versiones, ni fila de activación. Las tablas y funciones
del libro quedan como las dejó la instalación, que es otra migración. Probado por
el camino real de Prisma en `scripts/pruebas-db/recuperacionLibroCostos.mjs`.

**En qué se diferencia de `libro_stock`.** Allá "no quedó nada" es "no existe
ningún objeto del libro". Acá el libro ya existe —vacío, lo creó la
instalación—, y lo que no tiene que existir es lo que la activación escribe. Por
eso el diagnóstico es otro archivo, con otras condiciones, y no el de
`libro_stock` con otro nombre.

**NO restaurar el backup por esto.** Un CASO 1 confirmado dejó la base como
estaba: medido, el mismo catálogo de objetos y la misma huella de `ProductoBase`
y `ProductoLocal`.

#### PRE — antes del paso 4 del despliegue

1. Backup validado, como siempre (paso 0).
2. Comprobar en el VPS, de solo lectura, que el punto de partida es el esperado:
   la instalación `20260929120000_libro_costos` aplicada, la activación
   pendiente, `SELECT * FROM libro_costo_estado()` en NO_ACTIVADO, y sin
   transacciones largas ni candados sobre `ProductoBase`, `ProductoLocal` o
   `Local`. **No hay un precheck en archivo para esto todavía**: el de
   `libro_stock` no mira `ProductoLocal`, así que no sirve tal cual.
3. Clasificación y autorización del paso 4 como siempre. Ventana fuera del
   horario de venta.

#### INTENTO

El paso 4 normal: `migrate deploy`, que aplica la activación.

- **Si pasa:** verificación POST.
- **Si falla:** el diagnóstico, SIN resolver nada todavía.

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -v modo=recuperar -f - < scripts/deploy/diagnostico-recuperacion-libro-costos.sql'
```

Imprime cada condición con ✓ o ✗ y termina en `RESULTADO: CASO_1_RECUPERABLE` o
en `RESULTADO: FRENAR`. CASO 1 es, TODAS juntas:

1. la única migración fallida sin resolver es la activación;
2. su último intento no aplicó ningún paso;
3. los logs traen SQLSTATE 55P03;
4. los logs traen el "lock timeout" de un `LOCK TABLE` de
   `libro_costo_activar()`;
5. el intento es del archivo exacto de la activación, por su checksum;
6. las 42 migraciones anteriores están aplicadas, y la instalación con su
   checksum;
7. el libro está vacío: ni versiones, ni punto cero, ni fila de activación, ni
   triggers de captura —por nombre ni por la función a la que apuntan—;
8. `libro_costo_estado()` dice INTENTO_FALLIDO.

Sobre la condición 8: el estado del libro NO alcanza solo, porque no mira la
causa. Medido: con una falla SQL distinta a mitad de la activación también dice
INTENTO_FALLIDO. Por eso el diagnóstico exige además las condiciones 3 y 4.

- **`RESULTADO: FRENAR`:** FRENAR. Sin resolve, sin reintento, sin `up -d`. La app
  vieja sigue atendiendo. Informar a Emanuel con la salida entera del diagnóstico.
- **`RESULTADO: CASO_1_RECUPERABLE`:** la recuperación tipada, con este texto
  EXACTO —un espacio de más y la guardia lo rechaza—:

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -v modo=recuperar -f - < scripts/deploy/diagnostico-recuperacion-libro-costos.sql && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate resolve --rolled-back 20260929200000_libro_costo_activacion'
```

  Vuelve a correr el diagnóstico adentro, y el `&&` hace que el resolve solo
  corra si dio CASO 1. La guardia lo deja pasar AVISANDO y deja rastro. Y
  enseguida, confirmar:

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -v modo=revertida -f - < scripts/deploy/diagnostico-recuperacion-libro-costos.sql'
```

  Tiene que dar `RESULTADO: REVERTIDA_LIMPIA`: nada sin resolver, el último
  intento revertido y sin pasos, el libro vacío y `libro_costo_estado()` en
  NO_ACTIVADO. Si no, FRENAR.

#### REINTENTO — el segundo, y el último

Con el punto de partida comprobado otra vez, el paso 4 de nuevo.

- **Si pasa:** verificación POST.
- **Si vuelve a fallar:** el diagnóstico de nuevo. Va a avisar
  `ESTE ES UN SEGUNDO FALLO`. Si es CASO 1: la recuperación tipada y la
  confirmación `revertida`, para no dejar a Prisma trabado en P3009. Y después
  **FRENAR LA VENTANA**: NUNCA un tercer intento, NO el `up -d`. Si NO es CASO
  1: FRENAR sin resolver.

El límite es de **DOS intentos de activar el libro por ventana**, como en
`libro_stock`: el diagnóstico cuenta los intentos revertidos de toda la historia
y avisa desde el segundo, pero no sabe dónde empieza una ventana.

#### POST — para declarar el libro activo

- `SELECT * FROM libro_costo_estado()` dice **ACTIVADO**;
- `LibroCostoActivacion` tiene una fila, y sus cantidades son las filas de
  `ProductoBase` y `ProductoLocal` al activar;
- la activación con UN intento terminado, contada por nombre: los intentos
  revertidos quedan como filas aparte.

### Rollback de una migración: NUNCA SE EJECUTÓ

Esto es la continuación de la sección de arriba: si una migración falló y la
decisión de Emanuel fue deshacerla, este es el camino — y hay que saber en qué
estado está antes de empezarlo.

El procedimiento existe y está en `docs/RELEASE-CHECKLIST.md` §3: identificar el
`migration.sql` aplicado, escribir el SQL inverso, ejecutarlo contra la base,
borrar la entrada de `_prisma_migrations` y recién ahí revertir el código.

**No es un mecanismo probado.** Nunca se ejecutó ni se verificó de punta a punta,
ni en producción ni en una copia. Está escrito, no está validado, y la diferencia
importa el día que haga falta: los cuatro pasos tienen orden y un error en
`_prisma_migrations` deja la base en un estado que `migrate deploy` no sabe
resolver.

Decirlo así, con estas palabras, el día que se proponga: **no es "el
procedimiento de rollback", es "un procedimiento escrito que nunca nadie
corrió".** Proponerlo sin esa aclaración, en medio de un incidente, es hacer
pasar por probado algo que no lo está.

**Y dos de sus pasos chocan con la guardia, a propósito.** El paso 3 —ejecutar
el SQL inverso— y el paso 4 —tocar `_prisma_migrations`— son justamente lo que
hacen `prisma db execute` y `prisma migrate resolve`, los dos bloqueados. El
documento largo dice "ejecutarlo directamente en la base" sin nombrar la
herramienta, así que el que llegue ahí va a buscar la de Prisma y se va a chocar.
Eso no es un obstáculo a esquivar: es el punto donde hay que frenar y confirmar
con Emanuel, porque un rollback de migración nunca probado es exactamente la
clase de cosa que no se ejecuta por criterio propio a las nueve de la mañana.

Antes de considerarlo confiable necesita una prueba segura: restaurar un dump en
una base descartable, aplicar la migración, revertirla siguiendo los cuatro pasos
y comprobar que `migrate status` queda coherente y que la versión anterior
levanta. **Esa prueba no se hace en producción**, y hasta que se haga, el
rollback de código es la única vuelta atrás con evidencia.

## Referencia larga

`docs/RELEASE-CHECKLIST.md` — §3.bis tiene el procedimiento oficial con la
justificación de cada regla, §3 el rollback con migración aplicada, y §4 los
tiempos reales medidos y el camino de emergencia con build local (solo si Actions
o GHCR no están disponibles; el build **debe** recibir `APP_BUILD_ID` o falla a
propósito). Leerlo cuando algo se sale de la secuencia de arriba.

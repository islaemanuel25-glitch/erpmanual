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
   tapó están en `lib/deploy/guardiaMigraciones.js`. Ver "Los cuatro comandos
   bloqueados" en el paso 4 antes de tocarlos.

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

### Lo que este chequeo NO contesta

Que `origin/main` tenga el commit **no** prueba que Actions haya terminado de
construir y publicar su imagen. Eso se comprueba en el paso 3, que es donde vive.
Este paso solo contesta si hay algo que desplegar y si está publicado en la rama.

Y tampoco reemplaza a los cinco valores del paso 5: aquellos comparan lo que
quedó corriendo, éste compara lo que se va a empezar a desplegar. Son los dos
extremos de la misma cadena y ninguno tapa al otro — la corrida del 2026-08-14
pasó los cinco valores con todo bien y aun así no desplegó la tanda.

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
  Corre igual contra producción con `--base https://operix.cloud`, que sirve para
  sacar el "antes" y para volver a preguntar después de recrear.

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

Sigue fallando cerrado: si el ssh no llega, si el contenedor no está, o si la
etiqueta no es un SHA de 40 —`latest`, una imagen construida a mano— sale con 2.

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

La decisión vive en `lib/deploy/guardiaMigraciones.js`, que es una función pura
con sus candados al lado; el hook solo lee la entrada, corre el clasificador
cuando hace falta y escribe la respuesta.

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
`NO_TAPADOS` de `lib/deploy/guardiaMigraciones.js`: `migrate dev` (puede resetear
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

Y si para algo no se puede armar un marcador con su control —porque el cambio no
deja rastro en el build, por ejemplo—, **se dice que no se pudo verificar** en vez
de darlo por bueno.

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
`lib/deploy/guardiaMigraciones.js` a propósito y con su confirmación — no
inventarle un flag, no correrla por otro camino, no hacerla desde el VPS para
esquivar la guardia. Ese trámite cuesta a propósito, y el día que cuesta es este.

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

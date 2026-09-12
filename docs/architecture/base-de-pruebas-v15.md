# La base descartable `erpazul_v15`, y cómo se recrea

Escrito el 2026-09-12, cuando verificar el rediseño móvil de recepción obligó a
crearla. Está acá para no volver a discutirlo.

## Por qué existe

Verificar la pantalla de recepción **ejerciéndola** —tocar "Coincide", mover el
contador, elegir un motivo, comprobar que el cierre se destraba— **escribe**:
`revisar-producto` persiste el conteo, el autor y la fecha. Eso no puede correr
contra producción.

Y no puede correr contra `erpazul_revision`: esa base tiene **otro linaje de
migraciones** —55 aplicadas, la última del 2026-08-02, contra las 10 del árbol
que llegan al 2026-09-10—, así que no tiene ni `revisadoEnRecepcion` ni
`motivoPrincipal`. No está atrasada: es una historia distinta, y `migrate deploy`
no la trae para acá. Tampoco tiene un usuario asignado al local destino de sus
transferencias abiertas.

De ahí esta tercera base. Se crea vacía, se le aplican las migraciones del árbol
y se le siembra lo mínimo.

## Los cuatro pasos

Todo corre en contenedores; nada se instala en el VPS. La contraseña sale de
`.env.prod` y **nunca se imprime**: se deriva en una variable y se pasa al
contenedor.

**1 · Crear la base.**

    docker exec erpazul_db psql -U erpazul -d postgres -c "DROP DATABASE IF EXISTS erpazul_v15;"
    docker exec erpazul_db psql -U erpazul -d postgres -c "CREATE DATABASE erpazul_v15;"

**2 · Aplicar las migraciones del árbol.** Se conecta por la red del compose; el
host es `erpazul_db`.

    URL="$(grep -m1 '^DATABASE_URL=' /srv/produccion/erpazul/.env.prod \
      | sed 's/^DATABASE_URL=//; s/"//g' | sed 's#/erpazul\([?]\|$\)#/erpazul_v15\1#')"
    docker run --rm --network erpazul_default \
      -v /home/emanuel/trabajo/erpmanual:/app \
      -v /home/emanuel/.cache/erpazul-test/node_modules:/app/node_modules -w /app \
      -e DATABASE_URL="$URL" erpazul-test:estable npx prisma migrate deploy

**3 · Sembrar.** Acá el contenedor va con `--network container:erpazul_db`, y no
es un detalle: `scripts/lib/clientePrisma.mjs` solo acepta el nivel ESCRITURA
contra `localhost`, así que compartir la red del contenedor de la base es lo que
hace que el host SEA `localhost`. Con la red del compose, la fábrica aborta —y
tiene razón.

    PWD_DB="$(grep -m1 '^DATABASE_URL=' /srv/produccion/erpazul/.env.prod \
      | sed 's/^DATABASE_URL=//; s/"//g' | sed 's#.*://[^:]*:##; s#@.*##')"
    docker run --rm --network container:erpazul_db \
      -v /home/emanuel/trabajo/erpmanual:/app \
      -v /home/emanuel/.cache/erpazul-test/node_modules:/app/node_modules -w /app \
      -e DATABASE_URL="postgresql://erpazul:${PWD_DB}@localhost:5432/erpazul_v15" \
      -e NODE_ENV=test \
      erpazul-test:estable node scripts/sembrar-v15-recepcion.mjs

El script es **idempotente**: borra lo que sembró antes —por nombre, no por id— y
lo vuelve a crear. Imprime al final los tres números que el arnés necesita, y
cambian en cada corrida porque los ids son autoincrementales: hay que leerlos, no
memorizarlos.

**4 · Levantar la app contra esa base.** Acotada, para no competir con producción.

    URL="…/erpazul_v15"   # el mismo de arriba
    docker run -d --name erpazul_v15_app --network erpazul_default --cpus=2 --memory=2g \
      -v /home/emanuel/trabajo/erpmanual:/app \
      -v /home/emanuel/.cache/erpazul-test/node_modules:/app/node_modules -w /app \
      --env-file /srv/produccion/erpazul/.env.prod \
      -e DATABASE_URL="$URL" -e NODE_ENV=development -e PORT=3210 \
      -p 127.0.0.1:3210:3210 \
      erpazul-test:estable sh -c 'npx next dev -p 3210 -H 0.0.0.0'

Producción sigue en el 3000 y no se toca. Al terminar:
`docker rm -f erpazul_v15_app` y borrar el `.next` que queda —lo escribe root
dentro del contenedor, así que hace falta
`docker run --rm -v …:/app alpine rm -rf /app/.next`—.

## Correr las dos verificaciones

**La secuencia a 390, que afirma cada paso.** Re-sembrar ANTES de cada corrida:
la secuencia escribe, y una corrida a medias deja líneas revisadas que la
siguiente encuentra fuera del filtro "Pendientes".

    docker run --rm --network container:erpazul_v15_app --shm-size=1g \
      -v /home/emanuel/trabajo/erpmanual:/app \
      -v /home/emanuel/.cache/erpazul-test/node_modules:/app/node_modules -w /app \
      -v /tmp/v15-capturas:/salida \
      -e CHROMIUM_USER_FLAGS=--no-sandbox -e AUTH_SECRET="$SECRETO" \
      erpazul-test:estable node --experimental-websocket scripts/capturas-recepcion-movil.mjs \
        --base http://localhost:3210 --transferencia N --usuario N --local N \
        --anchos 390 --modo v15-secuencia --chrome /usr/bin/chromium --salida /salida

**La huella de escritorio a 1366**, antes y después:

    node --experimental-websocket scripts/huella-escritorio-recepcion.mjs \
      --base http://localhost:3210 --transferencia N --usuario N --local N \
      --salida /salida/huella-despues.json

Después `git stash push -u` de los archivos de pantalla, esperar ~12 s a que el
servidor recompile, sacar `huella-antes.json`, y `git stash pop`. Las dos se
comparan por digest: si difieren, escritorio se movió.

## Tres trampas que costaron una corrida cada una

**`WebSocket` no existe en el Node de la imagen.** `erpazul-test:estable` trae
Node 20, donde el global está detrás de `--experimental-websocket`. Las imágenes
`node22*` lo tienen de fábrica pero **no traen Chromium**, así que la que sirve
es la estable con el flag. Y `--chrome /usr/bin/chromium`, porque el default del
arnés apunta a una ruta que en esa imagen no existe.

**El `aria-label` de un botón contiene el nombre del producto.** Buscar un chip
"Faltante" dentro de la tarjeta de "V15 Faltante PACK" encontraba primero el
botón `−`, cuyo `aria-label` es "Restar uno a V15 Faltante PACK". El síntoma es
que el motivo queda sin elegir y la tarjeta sigue pidiéndolo. Por eso
`tocarEnTarjeta` tiene `exacto: true`, que compara el texto y ninguna etiqueta.

**Un SVG no tiene `offsetParent`.** Es una propiedad de `HTMLElement`, así que en
un `<svg>` o un `<path>` devuelve `undefined` y un filtro por `!== null` los deja
pasar. La primera huella de escritorio incluyó así 20 iconos de la composición
móvil —apagada a 1366— y dijo que escritorio se había movido cuando no se había
movido nada. Se mide por caja: `width > 0 && height > 0`.

## Qué siembra, y por qué esas cuatro líneas

Un grupo, un depósito, un local destino, un usuario de ese local, cuatro
productos y un remito de cuatro líneas. Cuatro líneas iguales probarían cuatro
veces lo mismo; éstas cubren los cuatro estados que el diseño distingue:

- **UNIDAD, 10 enviadas** — la secuencia toca "Coincide".
- **PACK x24, 6 packs** — baja el contador dos veces: faltante con motivo.
- **CAJÓN x12, 5 cajones** — sube el contador dos veces: sobrante con motivo.
- **PACK x6, 4 packs + 3 sueltas ya cargadas** — nace con diferencia **por las
  sueltas**, que es el caso que un contador de un solo número no puede producir.

El local no lleva `grupoId`: el vínculo son dos tablas aparte, `GrupoLocal` para
los locales y `GrupoDeposito` para los depósitos. Sin ellas `getGrupoIdDeLocal`
devuelve null y la confirmación falla adentro de la transacción, porque
`AuditoriaStock.grupoId` es obligatorio.

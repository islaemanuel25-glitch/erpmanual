# La base descartable `erpazul_v15`, y cómo se recrea

Escrito el 2026-09-12, cuando verificar el rediseño móvil de recepción obligó a
crearla. Está acá para no volver a discutirlo.

## Por qué existe

Verificar la pantalla de recepción **ejerciéndola** —tocar "Coincide", mover el
corregir una cantidad, elegir un motivo, comprobar que el cierre se destraba—
**escribe**:
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

## PENDIENTE: a 440 px de alto el botón de guardar queda fuera de pantalla

**Descubierto midiendo el V25 el 2026-09-12. No está arreglado y no es de esa
tanda: pasa igual con el código anterior.**

La hoja de corrección no ancla su pie. Mientras el contenido entra, el botón «✓
Guardar diferencia y seguir» no se mueve —medido a 640 y a 520 px, cero
píxeles—. Cuando NO entra, el botón se corre y se va abajo del borde:

- con el código anterior al V25: 383 px → 443 px, en un viewport de 440;
- con las dos reservas del V25 puestas: 419 px → 443 px.

O sea que reservar alto redujo el salto de 60 a 24 px y **no resuelve este
caso**: con el teclado grande abierto el botón queda afuera en los dos estados.
Lo que hace falta ahí es anclar el pie de la hoja, que es un cambio de
composición y no de reserva.

El arnés lo mide y lo imprime en cada corrida —`botonAVariasAlturas`—, pero a
440 px **no lo afirma**, a propósito: afirmarlo pondría en rojo algo que la
tanda no rompió. A 640 y 520 sí lo afirma.

Y el residuo de 24 px tiene nombre: el renglón teñido de resultado, que con el
texto nuevo —«4 PACK x24 de 6 PACK x24 · faltan 48 unidades»— pasa a dos líneas
a 390 px de ancho. Reservarlo obliga a decidir si ese bloque va SIEMPRE en dos
líneas, y eso cambia una forma aprobada en el V22.

## PENDIENTE: el panel de escritorio necesita su propio planteo

**Anotado el 2026-09-12, decisión de Emanuel. No está hecho y es a propósito.**

Cinco tandas seguidas —V21 a V24— rediseñaron el panel de corrección SOLO para el
teléfono, detrás del `enHoja` que ya existía. Escritorio quedó como estaba en
todas, con la huella de 1366 exigida en cero.

Eso fue correcto para no mover una pantalla que funciona, pero deja una deuda de
diseño: **escritorio no es un teléfono grande.** Ahí hay ancho, teclado y mouse,
así que varias de las decisiones del celular no aplican:

- los `−` y `+` no aportan nada: con teclado se tipea más rápido que tocando;
- los dos campos no necesitan ir al 35 % con un hueco en el medio — pueden ir en
  una fila con el resto de los datos;
- el bloque de importe y el resultado teñido probablemente entren al lado del
  conteo en vez de apilados.

**Lo que NO hay que hacer es copiar la hoja del celular a 1366.** Es un planteo
propio, con su diseño, y hasta que exista escritorio se queda con la forma que
tiene hoy — que anda.

## PENDIENTE: la huella no cubre la vista de quien NO puede recibir

**Anotado el 2026-09-12, después de encontrar dos defectos vivos ahí.** No está
hecho, y es a propósito: Emanuel lo dejó fuera de la tanda de la #191.

La página elige qué dibujar con `puedeRecibir ? <WorkspaceRecepcion/> :
<TablaDetalleTransferencia/>`. El sembrado crea **un solo usuario**, con un rol
de permisos `["*"]`, así que el arnés y la huella entran siempre por la primera
rama. **`TablaDetalleTransferencia` no la mide nadie.**

No es una vista de segunda: el comentario de la propia página dice que es la que
usa la mitad de los usuarios —se lee, se imprime y se compara—.

Y ahí vivían los dos defectos que la #191 destapó, los dos a la vez:

- el importe de línea no seguía a la corrección —leía `subtotal` pelado—;
- un producto agregado se dibujaba en **$0,00**, que es la #195 otra vez, del
  lado que nunca se arregló.

Los encontró leer el código buscando otra cosa, no una verificación. La huella
de escritorio dio **cero** sobre esa tanda y ese cero no significaba que nada se
movió: significaba que la pantalla que cambió no estaba en la foto.

**Lo que falta:** sembrar un segundo usuario con un rol SIN
`transferencias.recibir`, y correr la huella también con ese usuario. Son dos
huellas de escritorio, no una, y la segunda es la que cubre la tabla.

**Y hay un SEGUNDO agujero en la huella, encontrado el 2026-09-12.** El V25 sacó
el bloque de adopción de las dos superficies, incluida escritorio, y la huella
dio **184 = 184, cero diferencias**. Ese cero no significa que escritorio no se
movió: significa que **el bloque nunca estuvo en la foto**.

El sembrado crea cuatro líneas y todas tienen snapshot de despacho, así que
`admiteAdopcion` devolvía false en las cuatro y el bloque no se dibujaba nunca.
La huella no podía ver lo que se sacó.

Es el mismo patrón que el de arriba y la misma lección: **un cero de la huella
solo vale si antes se comprobó que la huella VE el elemento en cuestión.** Lo
que cubrió el caso fue un candado de render con el fixture de la línea real de
la #195 —ficha PACK x12, remito UNIDAD, sin snapshot—, que es la combinación que
el sembrado no tiene.

Si alguna tanda vuelve a tocar algo que solo aparece en una línea histórica sin
snapshot, hay que sembrar esa quinta línea primero.

Cuidado al hacerlo: el rol del sembrado hoy es `["*"]`. Un rol con la lista de
permisos enumerada menos uno no es lo mismo que `["*"]` menos uno — hay que mirar
cómo resuelve `puedeRecibir` antes de escribir la lista, o la vista que se
termina midiendo vuelve a ser la equivocada.

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
        --anchos 390 --modo v21-secuencia --buscar "V15 NoDeclarado KG" \
        --chrome /usr/bin/chromium --salida /salida

El `--buscar` **no es opcional** desde el V21: el paso 8 corrige una línea por
PESO, y la única que hay es el producto que vive fuera del remito. Sin él, el
arnés busca el default de producción —que en esta base no existe— y el paso del
no declarado no tiene con qué trabajar.

Y los tres números **cambian en cada sembrado**, porque los ids son
autoincrementales y el script borra y vuelve a crear. Hay que leer los que
imprime esa corrida, no los de la anterior.

**Los colores de las dos acciones, en los catorce temas.** No necesita sesión ni
la base sembrada: las variables las sirve el layout raíz, así que mide sobre
`/login`.

    docker run --rm --network container:erpazul_v15_app --shm-size=1g \
      -v /home/emanuel/trabajo/erpmanual:/app \
      -v /home/emanuel/.cache/erpazul-test/node_modules:/app/node_modules -w /app \
      -e CHROMIUM_USER_FLAGS=--no-sandbox \
      erpazul-test:estable node --experimental-websocket scripts/sonda-acciones-recepcion.mjs \
        --base http://localhost:3210 --chrome /usr/bin/chromium

Mide 90 pares —2 acciones × 3 fondos de tarjeta × 15 temas— contra los umbrales
de WCAG: 4,5 para el texto y 3,0 para el contorno. **Encontró un defecto real la
primera vez que se corrió**, y por eso está: el acento como color de TEXTO da
3,19 sobre la tarjeta blanca de `sunmiLight` y de `ambarCaja`, y baja a 2,08
sobre las teñidas.

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
- **PACK x24, 6 packs** — se corrige a 4 en el panel: faltante con motivo.
- **CAJÓN x12, 5 cajones** — se corrige a 7 en el panel: sobrante con motivo.
- **PACK x6, 4 packs + 3 sueltas ya cargadas** — nace con diferencia **por las
  sueltas**, que es el caso que un contador de un solo número no puede producir.

Y un quinto producto **fuera del remito**, `V15 NoDeclarado KG`, que cubre dos
casos de una vez: el alta de un no declarado desde el catálogo —sin modal, como
quedó en el V16— y la corrección de una línea por **PESO**, que es el motivo de
fondo por el que el V21 sacó el contador de la tarjeta. 3,250 KG no se cuenta
tocando "+" tres mil doscientas cincuenta veces.

## Lo que el arnés aprendió a la mala, y conviene no volver a pisar

**Una sonda que infiere la estructura del DOM se rompe justo cuando hay que
confiar en ella.** `textoDeTarjeta` buscaba "el div más chico que contiene el
nombre y algún botón". El V21 mudó "✓ Coincide" al encabezado, esa fila pasó a
tener un botón, y la sonda empezó a devolver el encabezado en vez de la tarjeta:
informaba que no había "Corregir" mientras la pantalla lo mostraba. Ahora la
tarjeta se marca con `data-tarjeta-recepcion` y la sonda busca ese atributo.

**`offsetParent` es `null` en todo elemento `position: fixed`.** La capa del
modal del kit lo es, así que filtrar los diálogos por `offsetParent !== null`
descarta exactamente el diálogo que se está buscando. Es la segunda forma en que
esa propiedad engaña acá —la primera fueron los SVG, que directamente no la
tienen—.

**En el tab "Pendientes" una línea revisada desaparece de la lista.** Cualquier
afirmación sobre esa tarjeta pasa entonces por ausencia: `(no está la tarjeta)`
no contiene "Corregir", y el candado queda verde sin haber mirado nada. La
secuencia se pasa a "Todos" después del estado inicial, y antes de afirmar sobre
una tarjeta comprueba que la tarjeta EXISTE.

## Y tres más, de la sonda de temas

**Cambiar `data-theme` y esperar NO sirve: el proveedor lo pisa.**
`SunmiThemeProvider` reescribe `document.documentElement.dataset.theme` con el
tema guardado, así que una sonda que pone el tema, duerme y mide, mide quince
veces el tema por defecto. Y el chequeo obvio —leer el atributo justo después de
escribirlo— no lo ve, porque en ESE instante todavía está bien: es un candado
puesto sobre un momento que no es el momento que importa. Hay que comprobarlo al
MEDIR, y reponerlo si hizo falta.

**Cambiar `data-theme` y medir en el MISMO tick tampoco sirve.** El atributo
queda bien pero los colores salen viejos: Chromium actualiza la propiedad
personalizada —`getComputedStyle(el).getPropertyValue('--pos-accent')` devuelve
el valor nuevo— y sin embargo el `color` que ya derivó de un `var()` sigue siendo
el anterior. Medido sobre el mismo elemento y en la misma llamada: token
`#d97706`, color `rgb(251, 191, 36)`. Hay que darle un respiro al navegador entre
poner el tema y leer.

**Los colores calculados no se parsean con una expresión regular.** Chromium
devuelve `rgba(...)`, `color(srgb 0.98 0.74 0.14 / 0.4)` y
`oklab(0.777465 0.0391703 0.153345 / 0.4)` según de dónde venga el color y qué
tema esté puesto. Perseguir formatos es perder. Se pinta en un canvas de 1×1 y se
lee el píxel: el navegador entiende sus propios formatos y compone el alfa con la
misma matemática con la que dibuja la pantalla.

El local no lleva `grupoId`: el vínculo son dos tablas aparte, `GrupoLocal` para
los locales y `GrupoDeposito` para los depósitos. Sin ellas `getGrupoIdDeLocal`
devuelve null y la confirmación falla adentro de la transacción, porque
`AuditoriaStock.grupoId` es obligatorio.

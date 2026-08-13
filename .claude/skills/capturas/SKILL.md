---
name: capturas
description: Levanta el arnés de huellas sobre erpazul_al y saca capturas verificables a 1366x900 (y Sunmi 360x640), con las condiciones que hacen que la comparación valga.
context: fork
agent: verificador
allowed-tools: Bash, Read, Glob, Grep
---

# Sacar capturas y huellas de pantalla

Emanuel no puede mirar localhost. Lo visual lo ve en producción o por capturas.
Una captura que no se puede comparar no sirve para nada, así que la mitad de este
procedimiento son las condiciones, no los comandos.

## Antes de nada: ¿el 3111 está sano?

Antes de culpar a otra cosa —un 404, una tabla vacía, una pantalla en blanco—
comprobar el servidor. Un dev server a medio recargar devuelve 404 en rutas que
existen, y **un 404 no distingue "no existe la ruta" de "no llegaste bien"**.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3111/login          # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3111/api/version    # responde
```

Si algo no da, **reiniciar el servidor y volver a medir** antes de sacar
conclusiones. Y si se tocó `prisma/schema.prisma` o un interceptor de Prisma, el
reinicio no es opcional: el cliente extendido queda cacheado y congela el código
viejo en su clausura, así que la medición mide la versión anterior.

Con el server recién reiniciado, la primera navegación compila la ruta y tarda.
Eso no es lentitud de la pantalla.

## Las condiciones que hacen que la comparación valga

Sin estas, la comparación informa diferencias que no existen:

- **Ventana 1366x900 exactos.** El alto pesa tanto como el ancho: el contenedor
  de scroll usa `max-h-[70dvh]`, así que a 900 mide 630px y a 800 mide 560px. A
  1280 de ancho todas las tablas salen 86px más angostas. **Los dos lados de una
  comparación se miden con el mismo ancho Y el mismo alto.**
- **Base `erpazul_al`**, servidor en el 3111, contexto en el grupo del depósito y
  ubicación `depo`. Con otro local cambian los conteos de filas por las reglas de
  visibilidad.
- **Datos cargados de verdad.** El arnés espera a que la tabla se asiente, no a
  que pase un tiempo — ver abajo.
- **Pantallas que dependen del día**: Turnos arranca filtrada por "hoy" y
  "abiertas". El generador repone las fechas de la corrida antes de medir
  (`--fecha-turnos`). Las de listas dependen del id de importación
  (`--importacion`, por default 3, que es la abierta de `erpazul_al`); con otra
  base la pantalla da 404 y la huella sale vacía.

Para la vista Sunmi el tamaño es **360x640**, con `--ancho 360 --alto 640`. Es
otra medición, no comparable contra la de 1366x900.

## Correr el arnés

```bash
node scripts/generar-huellas.mjs --salida /tmp/despues \
  --usuario admin@admin.com --clave <clave> [--tanda 1] [--base http://localhost:3111]
node scripts/comparar-huellas.mjs tests/huellas/baseline /tmp/despues
```

Opciones que importan:

- `--tanda N` captura el bloque N de 5 y **acumula** sobre el `huellas.json` que
  ya exista en `--salida`. Sin `--tanda` captura las 16 pantallas de una.
- `--solo nombre1,nombre2` recaptura pantallas sueltas, que es lo que hace falta
  cuando una salió mal.
- `--ancho` / `--alto`, `--contexto-px`, `--puerto-cdp`, `--edge`.

El navegador es Edge headless por CDP en el puerto 9223. **El perfil se reusa
entre tandas**, así que la cookie de sesión sobrevive: conviene aprovecharlo,
porque `/api/login` limita a **10 intentos cada 15 minutos por IP** y una corrida
por tandas los consume enseguida. Si empieza a fallar el login, esperar, no
reintentar.

El login es **real** contra `/api/login`: no se firman tokens ni se inyectan
cookies a mano. Después el arnés fija grupo activo y ubicación como haría el
selector de la interfaz — sin eso, un admin sin local fijo entra sin contexto y
el ERP lo desvía a `/inicio`, y no hay tabla que medir.

## La trampa de la tabla que parece cargada

`SunmiTable` dibuja "Cargando…" y el mensaje de vacío igual: **una fila con una
sola celda con `colspan`**. Contar `tbody tr` a secas la toma por una fila de
datos, la espera da la tabla por asentada y se captura la pantalla mientras
todavía dice "Cargando…".

Eso dejó cinco pantallas de la línea de base con 1 fila contra 25, 5, 2033 y
2 reales, y hubo que recapturarlas. El generador ya lo distingue: reconoce el
relleno por la forma —una celda con colspan—, no por el texto, y si el relleno
dice "cargando" sigue esperando.

**Que haya filas se confirma leyendo dos veces. Que NO las haya no se puede
confirmar leyendo una vez**: hay pantallas que dibujan el mensaje de vacío
mientras la consulta viaja. Por eso el vacío necesita 12 lecturas estables. Es la
única espera por reloj que queda y está ahí porque no hay ninguna señal en el DOM
que diga "ya no va a llegar nada".

**Antes de dar por buena una captura, mirar el conteo de filas que informa el
arnés.** Si dice 1 y la pantalla debería tener cientos, la captura no sirve.

## La captura NO retrata la pantalla, y por eso una rota puede pasar el control

Pasó el 2026-08-12 con la pantalla de recetas: se sacaron las capturas de 360, se
miraron, y llegó rota al celular igual. **El problema no fue no mirar.**

Son dos cosas, las dos medidas:

1. **`Page.captureScreenshot` sin `captureBeyondViewport` fotografía solo el
   viewport.** De un formulario largo quedan retratados 640 píxeles.

2. **Y agregar esa opción NO alcanza en esta aplicación**, que es lo que menos se
   ve venir. Acá el que scrollea NO es el documento: es un contenedor interno
   —`MAIN.flex-1.min-h-0`— con overflow propio. Como el documento mide lo que el
   viewport, una captura de "página completa" sale IDÉNTICA a una de viewport.

   Medido en esa pantalla: el contenedor mostraba **539px de 6477px**, o sea que
   el **92 %** del formulario no aparecía en ninguna imagen. Lo que estaba roto
   estaba ahí.

Y hay un tercer motivo, independiente de los dos anteriores: **un desborde de 14
píxeles no se ve como un error.** Se ve como dos tarjetas un poco pegadas. El ojo
no lo llama.

### Qué hacer entonces

**Medir, no mirar.** `scripts/medir-desborde.mjs` informa números:

    MSYS_NO_PATHCONV=1 node scripts/medir-desborde.mjs --url /modulos/... \
      --ancho 360 --alto 640 --salida /tmp/desborde --nombre pantalla [--abrir-primero]

Devuelve qué contenedor scrollea de verdad y cuánto queda afuera; qué elementos
tienen más contenido que su caja —`scrollHeight > clientHeight`, que es lo que
delata un derrame antes de que se vea—; los altos de los botones de una línea,
que tienen que seguir siendo 36 si se tocó el kit; y una captura con el recorte
abierto, que es la única que muestra la pantalla entera. Sale con código 1 si
algo desborda.

El `MSYS_NO_PATHCONV=1` no es adorno: sin él, Git Bash convierte `/modulos/...`
en una ruta de Windows y el navegador no puede navegar ahí.

### Si la captura va a usarse como PRUEBA, `--repeticiones 3`

Comparar un antes contra un después solo prueba algo si dos corridas de la MISMA
versión dan lo mismo. La de la recepción a 360 no lo daba: **27.639 píxeles de
diferencia entre dos corridas idénticas**, repartidos por toda la página, con el
mismo alto y sin corrimiento. No era layout, era tiempo — transiciones y
animaciones fotografiadas a mitad de camino. Y los ceros que se habían informado
con esa captura fueron suerte.

    ... --repeticiones 3 --alto-captura 2400

`--repeticiones` fotografía tres veces y compara los bytes: si no dan idénticas
lo dice, guarda las tres para poder encontrar la causa, y sale con código 1.
`--alto-captura` acota la foto a una banda fija, porque sin eso un píxel de más
arriba de todo corre el resto de la página y contamina la comparación entera.

El arnés apaga transiciones y animaciones, manda el scroll a cero y saca el foco
antes de fotografiar. Aun así quedó una intermitencia de una corrida de cada seis
más o menos, así que **el chequeo se corre igual**: un arnés que a veces acierta
es peor que no tener, porque produce ceros que uno se cree.

**Una pantalla con formulario largo no se da por revisada con una captura de
viewport.** Se mide, y recién después se mira la imagen completa.

### Para comparar un modal: `--abrir` y `--elemento`

Un modal no tiene URL propia, y su tarjeta ocupa un pedacito de la foto. Sin esto
hay que abrirlo a mano y ubicar la caja a ojo en cada captura, que es dos tercios
del costo de una tanda de migración.

    MSYS_NO_PATHCONV=1 node scripts/medir-desborde.mjs --url /modulos/categorias \
      --ancho 1366 --alto 900 --perfil /tmp/desborde-edge \
      --abrir "Nueva" --elemento ".fixed.inset-0 .rounded-xl.shadow-md" \
      --repeticiones 3 --salida /tmp/cat-antes --nombre categoria

- `--abrir <texto>` toca el primer botón cuyo texto lo contenga. **Falla
  nombrándolo si no hay ninguno**: sin eso la foto sale de la pantalla de atrás,
  y esa foto es perfectamente determinista, así que pasa todos los chequeos.
- `--elemento <selector>` recorta a la caja de ese nodo con `--margen` (24 px por
  defecto). **Falla nombrándolo si el selector no encuentra nada**, y el chequeo
  de "entra entero" pasa a preguntar por ese elemento en vez de por todo lo
  pintado.
- El selector elegido tiene que encontrar **la misma cosa antes y después**. Para
  la tarjeta de un modal, `.fixed.inset-0 .rounded-xl.shadow-md` sirve en los
  dos: la capa es `fixed inset-0` con o sin `SunmiModalLayout`, y la tarjeta es
  una `SunmiCard`.

Cada captura deja una ficha `.json` al lado con el selector, el margen y el
recorte. Comparar es:

    node scripts/comparar-capturas.mjs /tmp/cat-antes/x.png /tmp/cat-despues/x.png

Sale con **0** si son idénticas, **1** si difieren —dice cuántos píxeles, entre
qué esquinas y en qué filas— y **2** si NO son comparables: falta una ficha, o
las fichas dicen que retratan regiones distintas. Ese 2 también salta cuando el
elemento cambió de tamaño entre las dos corridas, y eso es información: la
tarjeta de `ModalCategoria` creció 3 px de alto al migrarla y el comparador lo
dijo antes de mirar un solo píxel.

### La sesión no sobrevive al perfil

**El perfil de Edge NO conserva la cookie de sesión.** Al navegador se lo mata
con `kill` y no con un cierre limpio, así que la base de cookies nunca se escribe
al disco. Reusar `--perfil` no alcanza: la pantalla sale en blanco porque el
módulo hace `if (!perfil) return null`.

Lo que funciona es dejar **un Edge vivo** en el puerto que usa el arnés (9224),
logueado contra `/api/login` y con grupo y ubicación fijados como hace
`generar-huellas.mjs`. Cuando el arnés intenta levantar el suyo, el perfil ya
está tomado, su Edge se muere solo y `urlDepurador()` se engancha al que está.

Y antes de culpar a la sesión: **si el 3111 corre `next start`, sirve el build
que había cuando arrancó**. Un `npm run build` posterior deja al server con un
manifiesto viejo y el navegador informa `Failed to load chunk`, con la pantalla
en blanco. Se reinicia el server, no se persigue el síntoma.

## Qué mide la huella y qué no

Mide **estructura en reposo**: columnas, alineaciones, padding, fondo efectivo
del encabezado, alto de fila, opacidad, tipografía, ancho de tabla y overflow del
contenedor. Es lo que permite comparar dos corridas sin que un antialias o un
dato distinto generen ruido.

**No mide** estados de interacción: `:hover`, el tinte de una fila editada. Eso se
mira a ojo y se dice que se miró a ojo.

El comparador separa dos clases de diferencia: **estructural** (lo que un
refactor puede romper) y **datos** (cantidad de filas y texto, que dependen de la
base). Si la cantidad de filas cambió, la pantalla se marca **NO COMPARABLE**: la
línea de base se tomó sobre otro conjunto de datos y cualquier diferencia
estructural que aparezca ahí no es concluyente.

## Comparar contra la línea de base

`tests/huellas/baseline/` — 16 pantallas, referencia anterior al refactor de
SunmiTable. Su `README.md` tiene la procedencia de cada una, cuáles se
recapturaron y por qué, y las cinco pantallas sin `<table>` que quedaron afuera
(no producen huella comparable: se revisan a ojo).

`tests/huellas/conciliacion/` — las dos pantallas de listas de proveedor.

**Comparar solo las pantallas firmes.** Las que se sabe inestables no se
recapturan para "emparejar" el resultado: eso convierte la comparación en una
tautología.

## Reglas al informar

- **No fabricar datos para que la captura salga linda.** Si un caso no se puede
  ejercer con los datos reales, se dice. En `erpazul_al` no hay ninguna fila en
  `ERROR` ni en `BLOQUEADO`: esos cuerpos quedan sin captura, y eso es
  información, no una tarea pendiente disfrazada.
- Ejercer una acción real de la aplicación —hacer clic, excluir una fila desde la
  interfaz— sí vale. Escribir en la base para simularla, no.
- Decir siempre con qué tamaño y contra qué base se sacó cada captura.

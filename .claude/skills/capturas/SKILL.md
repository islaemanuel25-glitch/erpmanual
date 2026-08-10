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

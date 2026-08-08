# Línea de base de huellas de tablas

Referencia **anterior al refactor de SunmiTable**. Corresponde al árbol en
`22fde45^` (commit `2b68d4a`), que es el último estado antes de que la tabla
incorporara densidad, align, render, ordenable, filaExpandible y tono de fila.

Sirve para responder una sola pregunta: *¿alguna pantalla con tabla se movió sin
que quisiéramos?* Se compara con:

    node scripts/generar-huellas.mjs --salida /tmp/despues --usuario <mail> --clave <clave>
    node scripts/comparar-huellas.mjs tests/huellas/baseline /tmp/despues

## Condiciones de captura

Sin estas condiciones la comparación informa diferencias que no existen:

- **Ventana 1366x900.** El alto pesa tanto como el ancho: el contenedor de
  scroll usa `max-h-[70dvh]`, así que a 900 mide 630px y a 800 mide 560px. A
  1280 de ancho todas las tablas salen 86 px más angostas.
- **Base `erpazul_al`**, servidor en el 3111, contexto en el grupo del depósito
  y ubicación `depo`. Con otro local cambian los conteos de filas por las reglas
  de visibilidad.
- **Turnos** filtra por "hoy" y "abiertas", así que su huella depende del día en
  que se corra. El generador repone las fechas de esta corrida antes de medir.

## Qué mide y qué no

Mide estructura en reposo: columnas, alineación, padding, fondo del encabezado,
alto de fila, opacidad, tipografía, ancho de tabla y overflow del contenedor.

**No mide** estados de interacción. El `:hover` y el tinte de una fila editada no
aparecen acá y hay que mirarlos a ojo; el intento de automatizarlos no se
justificaba.

## Procedencia de cada pantalla

Son 16 pantallas, las que tienen tabla. Cinco se recapturaron el 2026-08-07
porque la corrida original las había tomado a medio cargar o con la base caída,
y sus valores no servían:

- `04-clientes-analytics` — la segunda tabla se capturó con Postgres inalcanzable
  y lo medido fue la fila de "Sin clientes inactivos", no una fila de datos.
- `08-locales` — 1 fila contra 5 reales.
- `10-productos` — 1 fila contra 25 reales.
- `12-reportes-stock` — 1 fila contra 2033 reales.
- `19-productos-fila-seleccionada` — ancho de tabla inconsistente con el resto.

Las once restantes vienen de la corrida original del 2026-08-06, verificadas
contra una recaptura: dieron idénticas.

## Pantallas que quedaron afuera

Cinco pantallas del relevamiento original no tienen `<table>` y por lo tanto no
producen huella comparable: `03-clientes-detalle`, `13-reportes-ventas`,
`15-transferencias`, `17-turnos-detalle` y `21-edicion-rapida-fila-editada`.
Se revisan a ojo.

## Pantallas que no están acá

La conciliación de listas de proveedor tiene tabla y no entró en el relevamiento
original. Sus huellas viven en `tests/huellas/conciliacion`, con su propio README:
son posteriores a este momento y meterlas acá haría que este directorio dejara de
referirse a un árbol identificable.

## Sobre las cinco que hubo que recapturar

El motivo real apareció después: el generador esperaba a que la tabla dejara de
moverse contando `tbody tr`, y `SunmiTable` dibuja "Cargando…" como UNA fila con
UNA celda que ocupa todas las columnas. Esa fila contaba como dato y se quedaba
quieta en 1, así que la espera daba la tabla por asentada y capturaba la pantalla
a medio cargar. No era lentitud de la base.

Está arreglado: la espera ahora separa las filas de datos de la fila de relleno.
Con eso, `12-reportes-stock` volvió a dar sus 2033 filas y `16-turnos` volvió a
tener tabla, las dos coincidiendo con esta línea de base. Dos corridas seguidas
dan huellas idénticas.

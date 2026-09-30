# El Libro de Costos

La historia inmutable de lo que costaba cada producto en cada ubicación. Existe
para que el Stock Diario pueda valorizar un día con el costo vigente a las 00:00
(hora Argentina) aunque el costo cambie durante el día. Hasta la activación, la
base solo guardaba el costo actual. **En producción está ACTIVADO desde el
2026-09-29 03:17:54.566 UTC** [producción].

Relevado sobre la rama `claude/libro-costos`. Etiquetas: **[código]** verificado
leyendo el código, **[probado]** ejercido contra PostgreSQL en
`scripts/pruebas-db/libroCostos.mjs`, **[decisión]** decidido por el negocio,
**[pendiente]** fuera de esta etapa, **[producción]** informado por el
despliegue desde el acceso al VPS, no medido por la sesión que escribe.

## Qué hay y dónde

- La migración `prisma/migrations/20260929120000_libro_costos` crea todo lo del
  libro: tres tablas, un enum, una secuencia, funciones y los triggers de
  inmutabilidad. **No lo activa** [código] [probado].
- Las constantes que el SQL y JavaScript comparten están en
  `lib/libros/libroCostos.js`. Las ata `lib/libros/libroCostos.test.mjs`
  [código].

Las tablas:

- `CostoBaseVersion` guarda el estado de `ProductoBase` que decide el costo y su
  lectura: `precioCosto`, `unidadMedida`, `factorPack`, `pesoReferenciaKg`,
  `pesoEsFijo`, `modoCompraProveedor`, `modoVentaDeposito`, `esCombo` y
  `grupoId` [código].
- `CostoUbicacionVersion` guarda el estado de `ProductoLocal`: el costo propio
  **crudo** (NULL = hereda de la base) y `esDeposito`, congelado del `Local` en
  ese momento [código].
- `LibroCostoActivacion` tiene una sola fila: la activación, con su instante,
  cantidades y huellas [código].

## Reglas del diseño

- **Estado completo, no delta.** Cada versión se lee sola. `camposCambiados`
  dice qué movió un CAMBIO. Un UPDATE que no mueve ningún campo guardado no deja
  versión [probado].
- **El costo efectivo no se guarda.** Se reconstruye con
  `precioDeLaUbicacion(base, ubicación)` sobre las dos versiones vigentes al
  mismo instante. Guardarlo sería una segunda verdad [decisión].
- **La conversión no se duplica.** Las columnas de `CostoBaseVersion` son los
  nombres que acepta `costoPorUnidadFisica`: una versión se le pasa tal cual,
  sin adaptador. La prueba compara, para cada familia y ubicación, la función
  sobre el libro contra la función sobre las tablas vivas [probado]:
  - Maní: pieza de 2 kg a $9.000 en el depósito, $4.500/kg en un local.
  - Chisito: pieza a $2.000.
  - Pack x6: $2.000 la unidad.
  - Combo: NO_APLICA.
  - Costo cero: SIN_COSTO.
- **Sin claves foráneas.** Un producto borrado conserva su historia. La BAJA
  lleva el último estado y la identidad congelada: nombre y código de barras
  [probado].
- **El cero se guarda crudo.** Que un cero no sea un costo válido lo decide la
  regla de precios, no el libro [probado].

## Orden y transacción

- `libro_costo_seq` es **una** secuencia para las dos tablas: el orden entre dos
  versiones cualesquiera es total, aunque compartan instante [probado].
- `txid` es la transacción que produjo la versión: junta la base con la
  propagación a sus locales [probado].
- Dentro de una fila, `instante` y `version` crecen juntos: el trigger corre con
  la fila bloqueada. El cambio de `Local.es_deposito` bloquea las ubicaciones del
  local antes de leer el reloj, por lo mismo [código].
- El reloj y el día son los del libro de stock, `libro_stock_instante()` y
  `libro_stock_dia()` (America/Argentina/Cordoba). Están reusados para que las
  dos historias corten el día en el mismo lugar [código].

## Qué captura

Captura a nivel PostgreSQL, así que ve Prisma, `createMany`, `updateMany`,
`upsert`, SQL directo y scripts por igual [probado].

- **ProductoBase:**
  - INSERT es ALTA.
  - UPDATE de los campos guardados es CAMBIO.
  - DELETE es BAJA, incluido el borrado en cascada de un Grupo.
  - Cambiar el `id` es BAJA + ALTA.
- **ProductoLocal:**
  - INSERT es ALTA.
  - UPDATE de `precio_costo` es CAMBIO.
  - Cambiar de local o de base es BAJA + ALTA.
  - DELETE es BAJA.
- **Local:** cambiar `es_deposito` deja un CAMBIO `[esDeposito]` en cada
  ubicación de ese local.
- **Origen:** es el que ya declaran los escritores con `declararOrigenDeCosto`
  (`erpazul.costo_origen`). Sin declarar queda SIN_ORIGEN, que es válido. No hay
  un segundo sistema de origen [probado].
- **Si falla, falla cerrado.** Si una ubicación no encuentra su Local —solo con
  una sentencia que borre ubicación y local juntos—, la escritura aborta en vez
  de dejar historia sin escala [código].

## Inmutabilidad

- UPDATE y DELETE sobre las tres tablas se rechazan desde la migración.
  TRUNCATE se rechaza desde la activación [probado].
- Un INSERT directo se rechaza: solo escriben los triggers de captura
  (`pg_trigger_depth()`) y la activación [probado]. Es un resguardo contra un
  escritor distraído, no contra uno malicioso.
- **Por qué TRUNCATE recién desde la activación:** 25 scripts de desarrollo
  vacían la base entera con TRUNCATE (enumerado con `git grep -l "RESTART
  IDENTITY CASCADE" -- scripts`). Antes de activar, las tablas están vacías y no
  hay nada que proteger [código].

## La activación: `libro_costo_activar()`

En una transacción, todo o nada [probado]:

1. Pone un tope de espera de 3 s, local a la transacción.
2. Toma SHARE ROW EXCLUSIVE sobre `ProductoBase`, `ProductoLocal` y `Local`, y
   EXCLUSIVE sobre las tablas del libro.
3. Exige libro vacío y sin activar. Una segunda activación falla con
   `LIBRO_COSTO_YA_ACTIVADO`.
4. Crea los seis triggers: tres de captura y tres contra TRUNCATE.
5. Escribe el PUNTO_CERO de todas las filas, con un solo instante y un solo
   txid.
6. Compara las cantidades y las **huellas**. La huella es un md5 del estado,
   fila por fila, calculado igual sobre las tablas vivas y sobre el punto cero.
   Si difieren, falla con `LIBRO_COSTO_HUELLA_DISTINTA`.
7. Escribe la fila de `LibroCostoActivacion`.

**Si no consigue el candado**, falla con SQLSTATE 55P03 a los 3 s y PostgreSQL
revierte todo: no quedan triggers, versiones ni fila. El estado sigue
NO_ACTIVADO y se puede reintentar [probado].

`libro_costo_estado()` devuelve una de cuatro [probado]:

- NO_ACTIVADO.
- ACTIVADO: fila, seis triggers y un punto cero que todavía reproduce su huella.
- INTENTO_FALLIDO: la migración de activación figura fallida y sin resolver.
- INCONSISTENTE: cualquier otra combinación. Nunca debería verse.

## La activación en producción: hecha el 2026-09-29

Se activó con el despliegue de `406cfb05ef35fb9496f831d5b10a975e05e90d06`. La
migración `20260929200000_libro_costo_activacion` se aplicó el 2026-09-29
03:17:55 UTC, **al primer intento**, sin recuperación y sin ejecutar la función
a mano [producción]. El Punto Cero real [producción]:

- Instante **2026-09-29 03:17:54.566 UTC** (00:17:54 Argentina), txid
  **120115**.
- **3.131** bases y **12.533** ubicaciones: **15.664** versiones PUNTO_CERO,
  con origen `ACTIVACION_DEL_LIBRO_DE_COSTOS`, sin duplicados ni huérfanos.
- Huella base `1b3f562cf086ee0df5a96f220e8bb861`; huella ubicación
  `857c9bac43138f38364b1f4b3aedafd9`.
- `LibroCostoActivacion`: una fila, `versionDesde` 1 y `versionHasta` 15666.
- `libro_costo_estado()`: ACTIVADO, con los seis triggers una vez cada uno y
  habilitados.

El detalle del despliegue —backup, sondas, identidad del SHA— está en
`docs/deploy/MIGRACIONES-SIN-APLICAR.md`.

## Cómo se activa, y cómo se recupera si falla

Lo que sigue es el procedimiento con el que se activó, y el que vale si alguna
vez hay que volver a aplicar la activación —restaurar un backup anterior al
Punto Cero, reconstruir una base—. Con autorización expresa y por el camino de
`/deploy`, nunca a mano:

1. La migración propia `20260929200000_libro_costo_activacion`, cuyo único
   contenido es `SELECT "libro_costo_activar"();` [código]. Un paso de datos en
   producción es una migración (CLAUDE.md, "Scripts que tocan la base"). El
   candado `libroCostos.test.mjs` exige que sea la ÚNICA que llama a la función,
   que no tenga otra sentencia, que vaya después de la instalación y que la
   instalación siga byte por byte como se mergeó en #107 [código]. Desde que
   existe, toda base nueva construida con las migraciones —CI, desarrollo—
   nace ACTIVADA con un punto cero vacío, y el TRUNCATE de la base entera que
   hacen los scripts de desarrollo se rechaza [probado].
2. Si el deploy falla, se corre el diagnóstico de solo lectura
   `scripts/deploy/diagnostico-recuperacion-libro-costos.sql`. Dice
   CASO_1_RECUPERABLE solo si el fallo es el lock timeout de
   `libro_costo_activar()` y no dejó nada: la activación es la única fallida,
   del archivo exacto y sin pasos; el libro está vacío; y
   `libro_costo_estado()` dice INTENTO_FALLIDO [probado]. El estado solo no
   alcanza: ante una falla SQL distinta también dice INTENTO_FALLIDO [probado].
3. Con CASO 1, la recuperación tipada. La guardia de migraciones rechaza
   cualquier otro `resolve`, y deja pasar solo este texto exacto
   (`lib/deploy/recuperacionLibroCostos.mjs`) [código]:

   `ssh vps-erp 'cd /srv/produccion/erpazul && docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1 -v modo=recuperar -f - < scripts/deploy/diagnostico-recuperacion-libro-costos.sql && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate resolve --rolled-back 20260929200000_libro_costo_activacion'`

   El estado vuelve a NO_ACTIVADO y cuenta el intento revertido. Nunca
   `--applied`: dejaría el libro sin activar y a Prisma creyendo que sí.
4. Reintentar el deploy fuera de hora pico. Son dos intentos por ventana como
   máximo. El procedimiento completo está en el skill `/deploy`, en "La
   excepción de la activación del Libro de Costos".

La prueba ejerce los cuatro pasos con `migrate deploy` real y la migración real
del árbol, sobre una base descartable [probado]. La recuperación tipada —el
diagnóstico, la cadena con la forma exacta del comando y cada estado en que
tiene que frenar— la ejerce `scripts/pruebas-db/recuperacionLibroCostos.mjs`
[probado]. También aplica ese mismo
archivo dos veces: la segunda falla con `LIBRO_COSTO_YA_ACTIVADO` y no deja
nada [probado].

## El día de activación y lo que el Stock Diario va a leer

**Desde el 2026-09-30 lo lee el Valor del Stock** (`lib/stock/libro/valorDelStock.js`
y `valorDelStockServer.js`, descrito en `docs/modulos/stock.md`) [código]
[probado en `scripts/pruebas-db/valorDelStock.mjs`]. Lo que quedó hecho: el
costo de un día es la versión base y la de ubicación con `dia` anterior —el
estado a las 00:00—, combinadas con `precioDeLaUbicacion`; el primer día
valorizable es el siguiente a `LibroCostoActivacion.dia`; un costo que falta
deja la cadena fuera del total y nombrada, nunca en cero; y el cruce con el
punto cero del libro de stock está hecho: el primer día es el mayor de los dos.
Lo que sigue abajo era el plan. Desde la segunda tanda del 2026-09-30 también está hecho:
un producto que nace durante el día vale ese día con el costo de su ALTA, y la
diferencia de costo entre días se separa en revalorización por costo y
reexpresión por escala. La separación NO lee `camposCambiados`: compara las
dos versiones vigentes y usa un costo intermedio —el costo comercial nuevo con
la escala vieja— [código] [probado]. El detalle, en `docs/modulos/stock.md`.

- **Antes del punto cero:** sin historia económica confiable. El libro no
  inventa nada.
- **El día de la activación:** parcial. `LibroCostoActivacion.dia` lo nombra.
- **Desde el día siguiente:** el costo de las 00:00 sale de la versión de mayor
  `instante` ≤ 00:00, para la base y para la ubicación, combinadas con
  `precioDeLaUbicacion`.
- **Un producto que nace durante el día** se reconoce por un ALTA posterior a
  las 00:00 (NACIÓ_DURANTE_DÍA).
- **Un producto sin costo válido a las 00:00** queda COSTO_DESCONOCIDO ese día,
  aunque se cargue a las 14:00.
- **Revalorización y reexpresión:** un cambio de costo entre días
  (REVALORIZACION_POR_COSTO) y un cambio de escala (REEXPRESION_POR_ESCALA) se
  distinguen por `camposCambiados`.
- **El cruce con el punto cero físico** del libro de stock no está hecho. Las
  dos historias usan el mismo reloj y el mismo día, así que nada lo impide.

## Índices

- `CostoBaseVersion (productoBaseId, instante, version)`: "el estado de un
  producto a un instante" es un barrido hacia atrás desde `(id, t)`. Como dentro
  de un producto `instante` y `version` crecen juntos, el mismo índice da su
  historia ordenada.
- `CostoUbicacionVersion (localId, productoLocalId, instante, version)`: el
  Stock Diario es por local. Con este índice sale el estado de todas las
  ubicaciones de un local a un instante (DISTINCT ON) y la historia de una sola.
- `txid` en las dos tablas: juntar lo que hizo una operación.
- El orden global y la secuencia ya están cubiertos por la clave primaria,
  `version`.
- **No se indexa `instante` ni `dia` solos:** la valorización pregunta por el
  estado a las 00:00 (los dos índices de arriba), no por los cambios de un día.
  Se agregan cuando haya una consulta que los pida.

## Límites conocidos

- **TRUNCATE sobre `ProductoBase` o `ProductoLocal` no deja BAJA**, porque los
  triggers de fila no lo ven. Es lo mismo que en el libro de stock. Solo lo
  hacen los scripts de desarrollo; después de activar, ese mismo TRUNCATE de la
  base entera falla en las tablas del libro [código].
- **El instante es el del reloj dentro de la transacción** (`clock_timestamp`),
  no el de su confirmación. Una transacción que cambia un costo a las 23:59:59.9
  y confirma a las 00:00:00.1 queda en el día anterior. Es el mismo criterio que
  el libro de stock [código].

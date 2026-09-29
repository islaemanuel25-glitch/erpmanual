# El Libro de Costos

La historia inmutable de lo que costaba cada producto en cada ubicación. Existe
para que el Stock Diario pueda valorizar un día con el costo vigente a las 00:00
(hora Argentina) aunque el costo cambie durante el día. Hoy la base solo guarda
el costo actual.

Relevado sobre la rama `claude/libro-costos`. Etiquetas: **[código]** verificado
leyendo el código, **[probado]** ejercido contra PostgreSQL en
`scripts/pruebas-db/libroCostos.mjs`, **[decisión]** decidido por el negocio,
**[pendiente]** fuera de esta etapa.

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

## Cómo se activará en producción [pendiente]

Con autorización expresa y por el camino de `/deploy`, nunca a mano:

1. Una migración propia, `<fecha>_libro_costo_activacion`, cuyo único contenido
   es `SELECT "libro_costo_activar"();`. Un paso de datos en producción es una
   migración (CLAUDE.md, "Scripts que tocan la base"). El candado
   `libroCostos.test.mjs` exige que hoy no exista ninguna.
2. Si el deploy falla por el candado (P3018 con 55P03), hay que comprobar el
   estado: `SELECT * FROM libro_costo_estado()` tiene que decir INTENTO_FALLIDO,
   sin restos.
3. Después, `prisma migrate resolve --rolled-back <esa migración>`. El estado
   vuelve a NO_ACTIVADO y cuenta el intento revertido.
4. Reintentar el deploy fuera de hora pico.

La prueba ejerce los cuatro pasos con `migrate deploy` real, sobre una base
descartable [probado].

## El día de activación y lo que el Stock Diario va a leer [pendiente]

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

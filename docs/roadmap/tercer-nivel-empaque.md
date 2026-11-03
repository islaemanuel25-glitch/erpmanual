# El tercer nivel de empaque: diez tandas, en orden

Relevado el 2026-11-01 leyendo el repo, sin datos de producción (sesión de
nube). El diseño de negocio lo decidió Emanuel; las decisiones técnicas están
marcadas como tales. Cada afirmación lleva su etiqueta: **[verificado en
código]**, **[decidido]** o **[inferido]**.

## El problema

Hoy un producto tiene un solo escalón entre el bulto y la unidad: `factor_pack`
en `ProductoBase` **[verificado en código]**. Hay productos con tres:

- Cigarrillos: cartón (10 atados) → atado (20 cigarrillos) → cigarrillo suelto.
  El local vende el atado Y el suelto del mismo producto.
- Café: pack de 10 cajas → caja de 10 unidades → unidad suelta. Si el depósito
  manda por pack, al local le llega el precio de la caja y no lo puede vender
  suelto.

Hoy esos productos se arman a mano, y quedan mal (ej. "Camel yellow 20" en Mini
unidas). Cuántos son no se pudo contar: hace falta la base de producción, y
"armado a mano" no tiene una firma en los datos. Sale en la tanda 10.

## El diseño **[decidido]**

1. El stock se cuenta por dentro en el escalón más chico. Vender un atado
   descuenta 20, un suelto 1; un cartón que llega suma 200.
2. En pantalla nunca se muestra el escalón más chico pelado: "1 cartón" en el
   depósito, "10 atados" en el local, y si se abrió uno "9 atados y 15 sueltos".
3. Todos los productos tienen el dato opcional **sueltos por unidad**. Vacío =
   el producto funciona exactamente como hoy. Solo se completa en los de tres
   niveles.
4. **Los rótulos no son genéricos** (corrección de Emanuel al relevamiento):
   junto a `sueltos_por_unidad`, el producto lleva un **nombre opcional de la
   unidad** ("atado", "caja"), que se carga en la ficha al completar el dato. El
   escalón de abajo se rotula siempre **"sueltos"**. Si el nombre está vacío, la
   unidad se rotula **"unidades"**. El bulto conserva el nombre que ya tiene.
5. Cada escalón tiene su propio precio de venta por ubicación. El suelto NO es
   la unidad dividida: se carga aparte.
6. El costo se reparte hacia abajo solo: el local recibe el costo correcto del
   atado y del suelto (costo de la unidad ÷ sueltos por unidad).
7. En el POS del local el cajero elige si vende la unidad o el suelto, y el
   stock baja lo que corresponde. El depósito sigue vendiendo bulto y unidad
   **[decisión técnica]**.

## Lo que ya está a favor **[verificado en código]**

`StockLocal.cantidad` ya está siempre en el escalón más chico que existe hoy, la
unidad —lo dice `lib/pos-ventas/consumoStock.js`—, salvo la pieza de fiambre en
el depósito. El tercer nivel es el mismo invariante con un escalón más abajo:
cuando un producto tenga sueltos, la columna pasa a contar sueltos.

## La regla de orden, que es la que impide cobrar en una escala y descontar en otra

**El campo no se puede cargar hasta la tanda 9.** Hasta entonces la unidad vale
1 suelto en todos los productos, así que cada tanda intermedia es inerte: cambia
el camino del número, no el número. Ninguna tanda puede dejar la venta cobrando
en una escala y descontando en otra, porque el escalón nuevo no existe para
ningún producto hasta que todos los caminos lo conocen.

El candado que lo vigila es la atadura de `lib/precios/escalaDeVenta.test.mjs`:
exige que, mientras no haya venta suelta, una unidad valga exactamente un
suelto. La tanda 4 lo reescribe a sabiendas cuando la venta suelta exista.

## Las dos trampas

**1. La cantidad guardada en ventas y transferencias viejas está en la escala de
entonces.** `VentaDetalle.cantidadStock` y la cantidad de `TransferenciaDetalle`
se escribieron en unidades. Si después se carga "20 sueltos por unidad", anular
una venta vieja devolvería 1 donde tiene que devolver 20, y una transferencia en
tránsito acreditaría la vigésima parte. Por eso ventas y transferencias guardan
**N congelado**: los sueltos por unidad del momento, igual que hoy se congela el
factor (`factorPresentacion`, `valorizacionFactorPack`). Anular, corregir,
editar, revertir, cancelar y recibir leen ese N y no el de la ficha viva.

**2. Al cargar el dato en un producto con stock, el stock existente se
multiplica.** En la misma transacción en que la ficha guarda
`sueltos_por_unidad`, cada `StockLocal` del producto multiplica `cantidad`,
`enTransito`, `stockMin` y `stockMax` por N, y queda la constancia en
`ReinterpretacionDeStock`. Sin eso, "10 atados" pasarían a leerse como "10
sueltos". Mientras haya transferencias en tránsito o conteos de control abiertos
de ese producto, el dato no se deja cambiar.

## Las tandas

### 1 · El embudo — sin migración — HECHA

Una sola función, `unidadesDeStockPorEscalon` en `lib/conversiones/stock.js`,
contesta cuántas unidades de stock son un bulto, una unidad y un suelto. Pasan
por ella `cantidadParaStockNormal`, `toUnidades`/`fromUnidades` y
`costoPorUnidadFisica`. El suelto vale 1 (`SUELTOS_POR_UNIDAD_SIN_DATO`) y el
resultado es idéntico al de antes. La atadura de las 32 combinaciones se
extendió con el escalón suelto y tiene contraprueba.

### 2 · Las columnas — LLEVA MIGRACIÓN — HECHA

Migración `20261103230000_tercer_nivel_empaque`, anotada en
`docs/deploy/MIGRACIONES-SIN-APLICAR.md` (no aditiva para el clasificador por
sus dos bloques `DO`).

- `ProductoBase.sueltos_por_unidad` (entero, nulo, CHECK mayor que 1) y
  `ProductoBase.nombre_unidad` (texto, nulo, CHECK no vacío).
- `ProductoLocal.precio_venta_suelto` (nulo, CHECK mayor que cero).
- `sueltosPorUnidadCongelado` en `VentaDetalle` y en `TransferenciaDetalle`
  (nulo = 1, CHECK mayor que 1).
- **Solo `sueltos_por_unidad` reinterpreta**: `nombre_unidad` es un rótulo y no
  cambia ninguna cantidad ni costo, así que ningún libro lo mira
  **[decisión técnica]**. Entra en el trigger de reinterpretación del libro de
  stock, en `CAMPOS_QUE_REINTERPRETAN` de `libroStock.js`, en
  `CAMPOS_DE_ESCALA_BASE` de `valorDelStock.js` y, para que esa última no mire
  un dato que nunca llega, en la captura del libro de costos: columna
  `CostoBaseVersion.sueltosPorUnidad` y `CAMPOS_BASE` de `lib/libros/libroCostos.js`.
- Los triggers de los dos libros se recrean solo si ya existen; la migración no
  activa nada. `libro_costo_activar()` queda como estaba: crea el trigger con la
  lista vieja, pero en una base que aplica todas las migraciones en orden esta
  migración corre después de la activación y lo recrea.
- **El embudo sigue sin leer la columna** (`SUELTOS_POR_UNIDAD_SIN_DATO = 1`).
  Empieza a leerla la tanda que la necesite, con la venta, las entradas y las
  pantallas ya preparadas; leerla antes sería abrir la puerta que la regla de
  orden cierra.
- Pendiente para la tanda 3: un candado que vea que un cambio de
  `sueltosPorUnidad` entre versiones se trata como cambio de escala. Hoy no se
  puede observar, porque el embudo devuelve 1 de los dos lados.

### 3 · El costo hacia abajo — sin migración — HECHA

- **Una sola definición:** `costoDelSuelto` en `lib/conversiones/stock.js`, el
  costo de la unidad dividido los sueltos por unidad. `costoPorUnidadFisica` la
  usa después de llevar el bulto a la unidad, en pack y en productos por unidad;
  el kilo y la pieza no se reparten.
- **El embudo lee los sueltos solo si el que pregunta se los pasa.** El costo se
  los pasa (desde la ficha, `sueltos_por_unidad`, o desde la versión del libro,
  `sueltosPorUnidad`). La venta y el stock todavía no: para ellos la unidad sigue
  valiendo 1 aunque la columna tuviera un número, y así sigue cerrada la puerta
  de cobrar en una escala y descontar en otra hasta las tandas 4 y 5.
- **`fronteraCosto` no se tocó porque no convierte escala**
  **[verificado en código]**: compara dos costos que ya le llegan en la misma.
- **La valuación del stock no divide por su cuenta**
  **[verificado en código]**: `costoDeLasVersiones` le pasa la versión a
  `costoPorUnidadFisica`, que desde la tanda 2 trae `sueltosPorUnidad`.
- Candados: el costo del cigarrillo × 20 cierra con el atado y × 200 con el
  cartón; 10 atados y 200 sueltos valen lo mismo, y en la cadena el período abre
  y cierra con la misma plata, sin revalorización.
- **Divergencia conocida, para la tanda 9 [verificado ejecutando]:** el costo de
  un día es el vigente a sus 00:00, así que el DÍA en que se carga el dato cierra
  con los sueltos valorizados al costo del atado (200 × $1.200 = $240.000 por
  $12.000 de mercadería). Desde el día siguiente está bien y el período cierra.
  Lo fija un candado "DIVERGENCIA CONOCIDA" en `valorDelStock.test.mjs`; la tanda
  9 decide cómo entra el cambio de escala al día en que se carga.
- **Para la tanda 6 [verificado en código]:** el control de stock valoriza la
  diferencia de un conteo con `costoPorUnidadFisica`, pero su `SELECT_BASE`
  (`lib/stock/control/controlStockServer.js`) no trae `sueltos_por_unidad`.
  Hay que agregarlo cuando el conteo pase a cargarse en sueltos.

### 4 · La venta en el servidor — sin migración

- `pos-ventas/crear` acepta el modo de línea SUELTO en un local: cobra
  `precio_venta_suelto` y descuenta 1. La unidad descuenta N.
- La línea guarda N congelado; `escalaContradictoria` conoce la escala nueva.
- Anular, corregir, editar, `reversionVenta`, `motorCorreccion` y
  `consumoPersonalServer` leen el N congelado.
- El servidor rechaza SUELTO si el producto no tiene el dato o el precio del
  suelto.
- `buscar-producto` devuelve el precio y el costo del suelto, con la lista de
  precios aplicada.
- La atadura pasa a cubrir los tres escalones con venta suelta real.

### 5 · Las entradas de mercadería — sin migración

Compras (`compras-proveedor/recibir`), transferencias (`crearTransferencia`,
`confirmar-recepcion`, `cancelar`, con N congelado), `pos-transferencias/enviar`,
ventas internas (`mapearVentaATransferencia`, `snapshotDePresentacion`), combos
(`planConsumoVenta`, `ventaConsumo`) y pedidos.

### 6 · La carga manual — sin migración

Ajuste, importación, control de stock y límites: se cargan como "unidades +
sueltos" y se guardan en sueltos.

### 7 · Las pantallas — sin migración

`fromUnidades` pasa a tres niveles. Rótulos: el nombre del bulto que ya existe,
`nombre_unidad` (o "unidades" si está vacío) y "sueltos". "1 cartón" en el
depósito, "9 atados y 15 sueltos" en el local; el suelto nunca aparece solo.
Tabla de stock, buscador del POS, `lib/stock/mapItem.js`, Stock Diario y
transferencias.

### 8 · El POS en pantalla — sin migración

Selector de unidad o suelto en el carrito y en el reducer del POS, sobre el
servidor de la tanda 4.

### 9 · La activación — migración solo si hace falta

La ficha muestra "se vende más chico: cuántos sueltos trae cada unidad", el
nombre de la unidad y el precio del suelto por ubicación. Al guardar el dato se
multiplica el stock existente (trampa 2). No se deja cambiar con transferencias
en tránsito ni conteos abiertos. Es la primera tanda que cambia algo para el
usuario. Lleva migración solo si el bloqueo necesita una restricción en la base.

### 10 · Los datos — sin migración, desde la aplicación

Cargar el dato en cigarrillos y café, y dar de baja los productos armados a
mano, pasando su stock al producto de tres niveles por las rutas de la
aplicación, no por script. Acá sale el conteo que en el relevamiento no se pudo
hacer.

## Tamaño del terreno **[verificado en código, 2026-11-01]**

Enumerado con `git grep --untracked` sobre `app`, `lib`, `components` y
`scripts`, sin tests: 253 archivos nombran el factor, 22 escriben en
`StockLocal` y 19 leen `cantidadStock`. Cada tanda vuelve a enumerar los suyos
antes de empezar.

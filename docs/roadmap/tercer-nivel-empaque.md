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
- **Defecto que la tanda 9 TIENE QUE RESOLVER [verificado ejecutando]:** el
  costo de un día es el vigente a sus 00:00, así que el DÍA en que se carga el
  dato cierra con los sueltos valorizados al costo del atado (200 × $1.200 =
  $240.000 por $12.000 de mercadería). **No es una divergencia aceptada**
  (corrección de Emanuel, 2026-11-03): al cargar el dato, el costo vigente de ese
  día tiene que quedar en la escala nueva. El candado de
  `valorDelStock.test.mjs` exige el valor correcto ($12.000 los dos días) y está
  marcado `todo` hasta la tanda 9, que lo tiene que poner en verde y sacarle la
  marca.
- **Para la tanda 6 [verificado en código]:** el control de stock valoriza la
  diferencia de un conteo con `costoPorUnidadFisica`, pero su `SELECT_BASE`
  (`lib/stock/control/controlStockServer.js`) no trae `sueltos_por_unidad`.
  Hay que agregarlo cuando el conteo pase a cargarse en sueltos.

### 4 · La venta en el servidor — sin migración — HECHA

- **El descuento:** `cantidadParaStockNormal` le pasa al embudo los sueltos del
  `baseStock` (que ahora traen los dos mapas de productos). BULTO descuenta
  factor × N, UNIDAD descuenta N y el modo nuevo `SUELTO` descuenta 1. El kilo
  no tiene sueltos.
- **El cobro del suelto lo pone el servidor**, como en los servicios:
  `lib/pos-ventas/lineaSuelta.js` (`resolverLineaSuelta`) decide quién puede
  vender suelto y pisa el precio con `precio_venta_suelto` (con la lista del
  cliente aplicada como en `buscar-producto`) y el costo con el del suelto
  (`costoPorUnidadFisica` → `costoDelSuelto`). Rechaza con código y mensaje: en
  el depósito, sin `sueltos_por_unidad`, sin precio de suelto en la ubicación, y
  en kilo, combo o servicio. Las ofertas no se aplican a una línea suelta (son
  un precio por unidad): motivo `SUELTO` en el motor.
- **El N congelado:** `planConsumoVenta` lo devuelve junto a `cantidadStock`, y
  `crear` y `corregir` lo guardan en `VentaDetalle.sueltosPorUnidadCongelado`.
- **La vuelta del stock:** `cantidadDeStockEnLaEscalaDeHoy` (en el embudo)
  convierte del N de la venta al de hoy. La usan `deltaDeDevolucion` (anular y
  cancelar transferencia) y `reconstruirConsumoOriginal` (corregir, editar,
  revisar). Ventas viejas sin N congelado = 1.
- `buscar-producto` del POS devuelve `sueltosPorUnidad`, `precioVentaSuelto` y
  `precioCostoSuelto`, con la misma pieza que cobra. Null en todo producto hoy.
- `detectarEscalaContradictoria` conoce el suelto (costo de unidad en línea
  suelta y al revés). Sigue sin estar enganchada en ningún lado, como antes.
- La atadura de `escalaDeVenta.test.mjs` recorre las 32 combinaciones con N = 1
  y con N = 20, en las tres escalas, con cinco contrapruebas.

**Lo que esta tanda deja para otras [verificado en código]:**

- **Tanda 5:** los combos. `VentaDetalleComponente` no tiene N congelado y su
  consumo vuelve sin convertir; `ComboComponente.cantidad` está en unidades de
  stock y hay que decidir qué significa con sueltos. También la venta interna
  (`mapearVentaATransferencia`) y la transferencia que genera: su cantidad ya
  sale con N, pero `TransferenciaDetalle.sueltosPorUnidadCongelado` todavía no
  se escribe.
- **Tanda 7:** la copia de `stock_locales/buscar-producto` no trae el suelto. Y
  el `stock` que devuelve `buscar-producto` está en la escala de StockLocal
  (sueltos, cuando haya), así que el carrito tiene que mostrarlo en unidades y
  sueltos. `lib/reportes-ventas/modoLineaDeposito.js` deduce el modo de una
  línea del depósito comparando contra el factor sin N.
- **Tanda 8:** el editor de corrección del depósito (`lineaModoDeposito.js`)
  calcula su vista previa sin N; el servidor recalcula con N, así que lo que se
  guarda está bien. Los códigos de rechazo del suelto no están en
  `CODIGO_RECHAZO_VENTA`: la cola offline los trata como un rechazo genérico.
- **Consumo del personal:** no admite SUELTO (lo frena con mensaje).
  `ConsumoPersonalLinea` no tiene N congelado; hoy nada revierte un consumo, pero
  si algo llega a revertirlo, necesita la columna.
- **En la corrección, el precio del suelto es el del editor**, como en toda
  línea corregida: la corrección no resuelve la lista del cliente. El costo sí lo
  pone el servidor. Es la misma deuda que la Gravedad 1 de
  `docs/roadmap/el-precio-que-se-cobra.md`.
- **Deuda de la regla 1, anotada y no tocada:** `cargarMapsProductos`
  (`correccionCompletaServer.js`) es una copia de `cargarMapasDeProductos` con
  su propio select; en esta tanda hubo que sumar `sueltos_por_unidad` en los
  dos.

### 5 · Las entradas de mercadería — sin migración — HECHA

**Lo que quedó sin verificar en la tanda 4, verificado:** una venta suelta de
punta a punta por las rutas reales, en `scripts/pruebas-db/tercerNivelEmpaque.mjs`
(base descartable, que el CI corre): 1 suelto descuenta 1 y cobra el precio del
servidor, 1 atado descuenta 20, 1 cartón en el depósito descuenta 200, el
suelto se rechaza en el depósito, y anular las tres vuelve el stock exacto.

**La regla de las transferencias [decisión técnica]:**
`TransferenciaDetalle.cantidad` sigue contando bultos o UNIDADES (atados): una
unidad es la misma con cualquier N. Las unidades de stock son esa cantidad ×
factor (si es bulto) × el N CONGELADO en la línea; vacío = 1, que es lo que vale
toda transferencia vieja. La tanda 9 no deja cambiar N con transferencias en
tránsito, así que el N congelado es siempre el de hoy.

- **Envío:** `toUnidades` acepta `sueltosPorUnidad`. `crearTransferencia` lo usa
  (el del llamador si lo dice, si no el de la ficha) y lo congela en
  `sueltosPorUnidadCongelado`. `pos-transferencias/enviar` valida el stock con
  él. Una línea que no sea BULTO o UNIDAD se rechaza antes de escribir: el
  depósito no manda sueltos (el enum de la columna ya lo impedía).
- **Recepción y cancelación:** `milesimasFisicas` multiplica el total entero por
  N. Le llega por `detalleParaValidar` (confirmar, guardar, revisar) y por
  `fisicasEnviadasDe(d, { sueltosPorUnidad })` (cancelar). Sin la opción,
  `fisicasEnviadasDe` sigue contando atados, que es lo que muestra la pantalla.
  La línea agregada en recepción (`linea-recepcion`) congela el N de la ficha.
- **Venta interna:** viaja en UNIDADES con su N cuando la cantidad física es
  múltiplo entero de N (lo normal: el depósito vende bultos y unidades); si no
  —un combo con sueltos sueltos—, en unidades de stock con N vacío. Las dos
  mueven exactamente lo que la venta descontó. El snapshot de presentación
  cuenta bultos y unidades y se compara × N. `snapshotDePresentacion` no
  cambió: no conoce la escala física.
- **Corrección económica de la venta interna:** recibe factor × N y congela el N
  en las líneas que reescribe, para que anularlas después convierta bien.
- **Compra:** lo que entra se cuenta en unidades —la hoja, el papel y el control
  de escala hablan en unidades— y se multiplica por N recién después de ese
  control. `stockIngresado` queda en unidades de stock; nada lo revierte.
- **Combos:** el costo de un componente es el del suelto (`costoDelSuelto`).
- **Pedidos sugeridos:** el faltante (en unidades de stock) se lleva a bultos o
  unidades por el embudo.

**Verificado:** la misma comparación de siempre, ahora con `milesimasFisicas`,
`validarDetalleRecepcion` y el costo de los componentes, da 108.480 casos y cero
diferencias. El candado de base cubre también la transferencia: 1 cartón suma
200 al confirmar y devuelve 200 al cancelar, 1 atado son 20, y una línea sin N
se lee × 1. Sacarle el N a `detalleParaValidar` pone siete afirmaciones en rojo.

**Sin verificar contra la base:** el ingreso de una COMPRA de un producto con
sueltos (la multiplicación está cubierta por el embudo y la ruta corre igual
que antes sin sueltos, `recepcionCompras.mjs` en verde) y los pedidos
sugeridos con sueltos.

**Lo que la tanda 9 tiene que hacer por esto [verificado en código]:**

- `ComboComponente.cantidad` está en unidades de stock: al cargar N, los
  componentes de ese producto se multiplican por N junto con el stock, o los
  combos pasarían a llevar 1 cigarrillo donde llevaban 1 atado.
- `VentaDetalleComponente` no tiene N congelado: anular un combo vendido antes
  de cargar N devolvería sin convertir. Lleva la columna en la migración de la
  tanda 9.
- `PedidoProveedorDetalle.stockIngresado` no tiene N congelado. Hoy nada lo lee
  para revertir; si algo empieza a hacerlo, necesita la columna.

### 6 · La carga manual — sin migración

Ajuste, importación, control de stock y límites: se cargan como "unidades +
sueltos" y se guardan en sueltos.

### 7 · Las pantallas — sin migración

`fromUnidades` pasa a tres niveles. Rótulos: el nombre del bulto que ya existe,
`nombre_unidad` (o "unidades" si está vacío) y "sueltos". "1 cartón" en el
depósito, "9 atados y 15 sueltos" en el local; el suelto nunca aparece solo.
Tabla de stock, buscador del POS, `lib/stock/mapItem.js`, Stock Diario y
transferencias. **Y la copia de `app/api/stock_locales/buscar-producto`**, que
en la tanda 4 quedó sin el precio y el costo del suelto a propósito: se le
agrega con la misma pieza (`resolverLineaSuelta`), no con una cuenta propia.

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

# El precio que se ve contra el que se cobra

Estado: **tres pendientes anotados, ninguno empezado**. Fecha del relevamiento:
2026-08-18. Los números salen de consultas de solo lectura contra la base de
producción, en contenedor descartable.

## De dónde viene esto

La tarjeta de producto del catálogo mostraba un número y el mostrador cobraba
otro. Se cerraron dos casos y quedaron tres abiertos. Los tres tienen la misma
forma: **el catálogo muestra el precio guardado, y hay otra pantalla que aplica
una regla encima antes de cobrar**.

Lo ya resuelto, para no volver a abrirlo:

- **La escala.** `precio_venta` está guardado por bulto para pack y cajón. La
  tarjeta lo rotulaba "/ un". Arreglado: la etiqueta sale de
  `lib/precios/escalaPrecio.js`, la misma que usa la ficha. Afectaba a 1.293 de
  2.600 productos.
- **El redondeo a $100.** El POS redondea el precio unitario y el catálogo no lo
  hacía. Arreglado: el número sale de `precioEnEscalaQueSeCobra`, en
  `lib/precios/redondeo.js`. Afectaba a 1.130 productos —12 en el número grande y
  1.118 en la línea de equivalencia—.
- **Los servicios de importe variable.** Mostraban `$0,00`. Arreglado: la tarjeta
  usa `esProductoServicio`, la misma marca del POS. Son 4.

## PENDIENTE 1 — Los 142 combos pueden mostrar un precio viejo

**Cuántos:** 142 combos en producción.

**El motivo, y qué parte es inferencia.** Un combo tiene `precio_venta` propio,
escrito por `resolverPrecioVenta` en `lib/combos/service.js`. Ese cálculo corre
en **dos lugares y nada más**: crear combo y editar combo. Buscado en todo el
repo con `git grep resolverPrecioVenta`, no hay un tercer llamador. Y la
propagación de costos **excluye combos a propósito** —`lib/compras-proveedor/
costoMaestro.js` dice "los combos no tienen costo físico que propagar" y corta—.

De ahí se sigue que si sube el costo de un componente, el precio del combo no se
recalcula hasta que alguien reabra y guarde el combo. **Eso es inferencia**: sale
de la ausencia de otro escritor, no de un comentario que lo diga.

**Cómo se convierte en dato**, y hasta que no se haga no se toca nada: para cada
`ProductoBase` con `es_combo`, comparar su `precio_costo` guardado contra la suma
actual de los costos de sus componentes. Los que difieran son los que muestran un
precio viejo. Con ese número se decide si es un problema de uno o de todos.

## PENDIENTE 2 — Las listas de precios de cliente no se reflejan

**Cuántos:** no medido. Depende de cuántos clientes tengan lista asignada y de
cuántos productos toque cada lista.

**El motivo.** El catálogo muestra siempre el precio base. La lista se aplica
**solo en el POS**, en `app/api/pos-ventas/buscar-producto/route.js`, con
`calcularPrecioConLista` y `resolverListaCliente`. La ruta de listar productos no
importa ninguna de las dos: verificado leyéndola entera.

O sea que a un cliente con lista se le cobra otro número del que muestra el
catálogo, y eso es correcto —el catálogo no sabe para qué cliente es—.

**Por qué no entra ahora, y es una pregunta de negocio antes que de código:** el
catálogo no tiene cliente. Mostrar "el precio que se cobra" exigiría elegir cuál
de todas las listas mostrar, o mostrar un rango, o aclarar que el precio es el de
lista general. Es una decisión de Emanuel, no un arreglo.

**Aclaración para no confundir:** las **listas de proveedor** son otra cosa y sí
quedan reflejadas, porque al aplicarlas se escribe el precio en la base.

## PENDIENTE 3 — El fiambre fijo se muestra por kilo y se cobra por pieza

**Cuántos:** no medido para el fiambre en general. Lo que sí está medido: de los
1.130 productos a los que el redondeo les cambia el número, **cero son fiambre de
pieza fija**, así que este pendiente no se cruza con el redondeo hoy.

**El motivo.** En el depósito, el POS multiplica el precio por el peso de
referencia para dar el precio de la pieza —`buscar-producto/route.js`, alrededor
de la línea 298—. El catálogo no hace esa conversión: muestra el valor por kilo
con la etiqueta "por kg".

**La complicación, que es la razón de que no entre de paso:** el predicado es de
UBICACIÓN y no de producto. `esFiambreFijoEnUbicacion` existe justamente porque
el mismo producto se cuenta en piezas en el depósito y en kilos en cualquier
local. Y el listado de productos hoy **no expone lo que ese predicado necesita**:
el mapper devuelve `unidadMedida` en camelCase y no devuelve `modoCompraProveedor`,
así que no se le puede pasar la fila tal cual.

## Y una divergencia que quedó a la vista, sin arreglar

**Las dos pantallas que ya redondeaban no usan la misma condición.** El POS
excluye el fiambre de pieza fija y solo en el depósito; el listado de stock
(`lib/stock/mapItem.js`) no excluye nada. El helper nuevo tomó la condición del
listado de stock, que es la otra LISTA.

No fue a ciegas: **de los 1.130 productos a los que el redondeo les cambia el
número, cero son fiambre de pieza fija**, así que hoy las dos condiciones dan el
mismo resultado para todo el catálogo. Migrar el POS y el stock al helper
compartido es una tanda propia — hacerlo de paso tocaría el precio que se cobra
en el mostrador.

## PENDIENTE 4 — Las 1.691 filas sin regla de precio

**Cuántas:** 1.691 de 10.614 filas activas, medidas en producción el 2026-08-18,
repartidas casi parejo entre cuatro locales —422, 420, 420 y 420— y con solo 9 en
Casiano casas. Esa distribución no la explica el código: es un dato de cómo se
cargaron.

**Qué les pasa, y por qué NO es lo mismo que vender al costo.** No tienen
porcentaje de venta asignado y su regla es la de margen, así que **no hay nada
que mueva su precio cuando suba el costo**. Hoy la mayoría vende con ganancia
igual, porque el precio se puso por otro camino —una lista de proveedor, una
importación, a mano—. El problema es a futuro.

Las que YA venden al costo o por debajo son **429**, y ésas sí están marcadas en
la tarjeta desde el 2026-08-18, con el texto "Se vende sin ganancia". Los dos
conjuntos se superponen poco.

**Por qué no se marcan en la tarjeta, y está decidido:** marcarlas sería marcar
el 16 % del catálogo por algo que todavía no ocurrió, y un aviso que aparece en
una de cada seis tarjetas enseña a ignorar los avisos. El problema de estas
1.691 no es de una tarjeta: es de una pantalla propia, del tipo "qué productos
quedarían vendiendo bajo costo si sube tal proveedor", que es una pregunta que se
hace de a lotes y no producto por producto.

**Lo que ya existe y sirve de punto de partida:** `hayReglaAutomatica` en
`lib/precios/precioDesdeMargen.js` es exactamente el predicado —exige margen
mayor a cero— y `propagarCostoALocales` ya devuelve aparte los que quedarían bajo
costo al propagar. La consulta no habría que inventarla.

## Y uno que está esperando decisión, no relevamiento

**Los 17 `ProductoLocal` con precio en cero.** El catálogo usa un `pick` que solo
mira nulo, así que un cero del local **gana** sobre el precio del depósito y se
muestra `$0,00`. El módulo de stock usa `||`, que cae al de la base. Las dos
pantallas se contradicen para esos 17.

Está frenado a propósito: antes de unificar hay que decidir cuál de los dos
criterios es el correcto, no cuál es más cómodo de escribir.

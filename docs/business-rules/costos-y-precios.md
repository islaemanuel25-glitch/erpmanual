# Costos y precios

Lo que decide qué plata se escribe en la base. Es el área más delicada del
sistema: un cambio acá cambia precios reales en producción.

---

## RN-10 — Solo el dueño del producto edita su costo · **[CÓDIGO]**

Regla única, módulo puro, sin imports de servidor:
**`lib/productos/propiedadCosto.js`**.

- `esProductoDeDeposito(creadoEnLocalId, depositoLocalId)` (línea 22) — sin
  creador, es del depósito. **Sin depósito resoluble, no asume depósito**: falla
  cerrado.
- `puedeEditarCosto(operandoEnLocalId, creadoEnLocalId, depositoLocalId)` (41) —
  solo el dueño. `localId` inválido o dueño irresoluble → `false`.
- `puedeEditarBaseProducto` (62) — **reusa** `puedeEditarCosto`, para que la
  propiedad del costo y la de la ficha maestra no puedan divergir.
- `alcanceEdicionProducto` (74) — devuelve `base` / `override` / `deny`.
- `mismoCosto` (117) — tolerancia de 0,005, para que reenviar el formulario sin
  tocar nada no cuente como intento de cambio.

Candado: `lib/productos/propiedadCosto.test.mjs`, 32 tests.

### Quién la respeta

Verificado con `git grep -ln "puedeEditarCosto"`: nueve lugares de servidor
—`productos/editar/[id]`, `productos/obtener`, `productos/import/apply`,
`productos/precios/apply`, `lib/compras-proveedor/costoMaestro.js:106`,
`lib/proveedores/listas/aplicacion.js:175`, y tres rutas de listas de proveedor—
más cinco pantallas que lo usan como bandera informativa.

**No lo respetan todos los caminos que escriben costo.** Ver RN-13.

---

## RN-11 — Sin guardado engañoso · **[CÓDIGO]**

Si un local que no es dueño manda cambios de ficha maestra, el servidor
**rechaza con 403** en vez de descartarlos en silencio.

`app/api/productos/editar/[id]/route.js:60-93` (`CAMPOS_FICHA_MAESTRA`,
`detectarCambioFichaMaestra`) y `:331-338`.

Corolario del mismo archivo: `precio_costo: baseData.precio_costo ?? undefined`
(línea 407). Un `null` significa **"no cambiar"**, nunca "borrar".

---

## RN-12 — Un cambio de costo se propaga recalculando con el margen de CADA ubicación · **[CÓDIGO]**

`lib/precios/propagarCostoALocales.js:45`. No copia el precio de venta: lo
**recalcula** en cada ubicación con el margen o el recargo de esa ubicación.

Si una ubicación no tiene margen configurado, **el precio no se toca** y se
devuelve en `sinMargen` con la bandera `bajoCosto` (`:117-127`).

**[ACCIDENTE POSIBLE]** — quien la llama solo escribe esa bandera en la consola
(`app/api/productos/editar/[id]/route.js:122-129`). Un producto que quedó vendiéndose
por debajo del costo se informa a un log que nadie mira.

---

## RN-13 — La superficie que escribe el costo maestro es amplia · **[CÓDIGO]**

Enumerado con un patrón sobre `productoBase|productoLocal.(update|create…)` que
lleve `precio_costo` en el bloque `data`, más lo encontrado leyendo:

`productos/crear` · `productos/editar/[id]` · `productos/import/apply` ·
`productos/precios/apply` · `productos/promover-a-deposito` ·
`compras-proveedor/recibir/[id]` · `stock_locales/nuevo` · `stock_locales/listar` ·
`transferencias/confirmar-recepcion` · `grupos/[id]/sync-productos` ·
`lib/combos/service.js` · `lib/precios/propagarCostoALocales.js` ·
`lib/compras-proveedor/costoMaestro.js` · `proveedores/listas/[id]/aplicar` ·
`proveedores/listas/[id]/revertir`.

**Ese número es un piso.** El patrón no ve las escrituras cuyo objeto `data` se
arma en una variable aparte. Antes de cambiar la regla de propiedad del costo hay
que revisar todos, no los que aparecen primero.

---

## RN-14 — La fórmula de precio por margen es una sola… y tiene dos copias · **[CONTRADICCIÓN]**

La canónica es `lib/precios/precioDesdeMargen.js:96`.

Pero hay **dos copias** con la misma firma y otro comportamiento:

1. `lib/combos/service.js:35` — cuando **no** hay redondeo a 100, aplica `round2`
   en vez de dejar la precisión completa.
2. `lib/combos/formComboLogic.js:20` — copia en el front del combo.

El día que cambie la regla de precio, los combos quedan atrás y **nada se pone
rojo**. Es el caso textual de la regla 1 de `CLAUDE.md`.

---

## RN-15 — El redondeo a 100: una sola función · **[CÓDIGO]** · *unificada 2026-08-10*

**No conviven `ceil` y `round`.** Buscado el patrón `/ 100) * 100` en todo el
repo: las dos apariciones vivas son `Math.ceil`, y la tercera es un comentario de
test que advierte justamente contra `Math.round`
(`lib/precios/margenNoSeDeforma.test.mjs:113-114`).

Hoy hay **una sola**: `redondear100` en `lib/precios/redondeo.js`, con **diez
llamadores** que la importan de ese archivo. Normaliza a centavos antes de subir y
devuelve 0 ante un valor ≤ 0 o inválido.

**Hasta el 2026-08-10 eran dos**, ambas hacia arriba pero distintas:
`redondear100` no normalizaba a centavos —así que un 1400,0000000001 salido de un
cálculo lo empujaba a **1500: cien pesos de más**— y `redondearA100Arriba` sí. La
que usaba el POS era la defectuosa, o sea que el precio impreso en el ticket salía
de ella.

Se unificó en el nombre y el archivo que usa el POS, pero con el comportamiento
correcto de las dos. Candado en `lib/precios/redondeo.test.mjs`, con el caso de
los centavos, que es donde diferían, y uno estructural que recorre `lib/` y `app/`
buscando redondeos a 100 escritos a mano.

---

## RN-16 — `||` contra `??` al leer el override de costo · **[CONTRADICCIÓN]**

Tres lecturas del mismo hecho, con dos operadores:

- `lib/stock/mapItem.js:25` y `:30` → `pl.precio_costo || base.precio_costo`. Un
  override en **0 cae al de la base**.
- `app/api/reportes-stock/valorizado/route.js:110` y `:115` → `??`. Un 0 se
  respeta.
- `lib/combos/costo.js:42` → `??`, y **deja escrito en el comentario** que el POS
  usa `||` y que la divergencia es conocida y no resuelta (`costo.js:11-12`).

Consecuencia verificable: Stock Locales y Reporte Valorizado pueden mostrar el
**mismo producto con costo distinto**.

---

## RN-17 — El costo se guarda en la escala del producto · **[CÓDIGO]**

`lib/compras-proveedor/costoMaestro.js:41-49` (`costoLineaAMaestro`): por bulto si
`factor_pack > 1`; por kg para fiambre y para productos por kilo.

El dinero **nunca** lleva `factor_pack`: la fórmula económica está en
`lib/compras-proveedor/calculoPedido.js`, `subtotalLinea` (54), y el factor entra
solo en la entrada de stock. El fiambre se cobra por kg y, sin peso por pieza, no
inventa subtotal (`:64`).

**Este archivo no tiene candados propios.** Ver
[../CURRENT_STATE.md](../CURRENT_STATE.md), deuda 2.

---

## RN-18 — Un local que compra un producto del depósito no toca ningún costo · **[CÓDIGO]**

`lib/compras-proveedor/costoMaestro.js:105-112`, vía `puedeEditarCosto`. Es RN-10
aplicada al camino de compras.

---

## RN-19 — Prioridad del precio de venta en la venta · **[CÓDIGO]**

`lib/precios/resolverListaCliente.js:83-124`:

1. Lista de precios **del cliente**, si tiene.
2. Si no, **lista default del depósito** (`GrupoDeposito.listaPrecioDefaultId`).
3. Si no, el precio de la ubicación.

La ubicación se determina de forma autoritativa por `GrupoDeposito`/`GrupoLocal`,
**no** por `Local.es_deposito` ni por lo que diga el front (`:60-79`).

Un local normal no puede tener lista predeterminada
(`lib/precios/defaultDeposito.js:61-63`), y la default debe ser del mismo grupo y
estar activa (`:69-76`).

En la venta, una lista distinta declarada por el ítem devuelve **409**
(`app/api/pos-ventas/crear/route.js:461-470`): la única válida es la que resuelve
el servidor.

---

## RN-20 — `ListaPrecio.esDefault` no lo lee ningún camino de venta · **[CÓDIGO]** · *el control salió de la UI el 2026-08-10*

El campo se escribe desde la UI y dos endpoints (`crear`, `marcar-default`) lo
mantienen, desmarcando el anterior en transacción. Pero
`lib/precios/resolverListaCliente.js:10` dice, textual: *"La ListaPrecio.esDefault
del grupo NUNCA se consulta en runtime."* Verificado: no aparece en la resolución
de precio ni en `pos-ventas/crear`.

Era un botón que no cambiaba nada funcional: alguien lo marcaba, veía una pill
ámbar y se iba creyendo que había configurado los precios de la ubicación.

**El control se sacó de la pantalla el 2026-08-10** —la columna "Default", la pill,
el botón de la estrella y el toggle del modal—. **La columna NO se borró y no hubo
migración**: el dato queda por si algún día se conecta. La lista que sí se aplica
se elige en la tarjeta "Lista predeterminada del depósito", que escribe
`GrupoDeposito.listaPrecioDefaultId`.

Reconectarlo toca la resolución de precio y sigue siendo una tanda propia.

---

## RN-21 — El costo que propone una lista sale de `precio → recargo → impuesto`, y lo arma UNA función · **[CÓDIGO]**

`lib/proveedores/listas/configuracionProveedor.js` (`precioBaseDelCosto`). El
orden no es libre: el **recargo comercial** construye el costo del proveedor y el
**impuesto adicional** es lo que ese proveedor agrega por fuera de los de su
lista, así que va sobre el costo ya armado. El multiplicador de la presentación
va después de los dos y conmuta, que es por qué no se pregunta "por unidad o por
pack".

La consultan los tres que deciden un costo: `hipotesisDeCosto`, el
`lecturasPosibles` del lector genérico y el atajo de fila confirmada de
`revalidarFila`.

**Los tres, desde el 2026-09-19.** Antes la composición estaba escrita dos veces
y **faltaba en la tercera** —la que escribe—, así que toda fila confirmada a mano
de un proveedor con impuesto distinto de cero se omitía al aplicar con
PROPUESTA_DIFERENTE. Es el [INC-0010](../incidents/INC-0010-la-propuesta-confirmada-a-mano-no-se-podia-aplicar.md).

**La columna `precioConRecargo` de la fila es otra cosa y sigue siéndolo**: guarda
**solo el recargo comercial**, fiel a su nombre. El costo se reconstruye desde la
fila como precio con recargo, por el impuesto, por el multiplicador.

---

## RN-22 — Lo que la pantalla del resultado cuenta es lo que aplicar va a escribir, revalidado contra el producto de hoy · **[CÓDIGO]**

`lib/proveedores/listas/aplicacion.js` (`revisarAntesDeAplicar` → `revalidarFila`).
El resultado y el previo de aplicar preguntan a la **misma** función, con el
**mismo** `where` —`seleccionada: true, aplicada: false`— y el **mismo** `select`
de producto (`CAMPOS_PRODUCTO_PARA_REVALIDAR`).

Hasta el 2026-09-19 el contador decidía solo con lo que dice la fila, y su propio
comentario afirmaba que el resto "no se puede saber sin leer los productos". Se
puede: aplicar los lee. La importación #12 contaba 11 y aplicar escribió 3.

Las que el recálculo va a omitir salen de `listos`, tienen su propio contador
—`omitidasAlAplicar`— y se muestran con el valor de antes y el de ahora.

---

## RN-23 — El precio se multiplica por el bulto a precisión completa, y la comparación no es al centavo · **[CÓDIGO]**

Dos mitades de la misma regla.

**La cuenta**: el unitario NO se redondea antes de multiplicarlo por el factor
del bulto. Está escrito en `calculoCosto.js` desde el principio —redondear antes
arrastra el error por el factor— y hasta el 2026-09-19 el `lecturasPosibles` del
lector genérico era el único lugar que no lo seguía: conciliar guardaba
`round2(round2(P) × F)` y aplicar recalculaba `round2(P × F)`.

**La comparación**: al aplicar, el costo recalculado se compara con el guardado
usando `difierenSoloEnElRedondeo` (`calculoCosto.js`), no al centavo. El margen es
el mayor entre `TOLERANCIA_REDONDEO_PCT` (0,1 %) y `TOLERANCIA_REDONDEO_PESOS`
($1) — dos umbrales porque el porcentaje no cubre los costos chicos y el piso no
cubre los grandes. Por debajo se escribe el **recalculado**, que es el que sale de
los datos de hoy.

Es el [INC-0011](../incidents/INC-0011-siete-centavos-frenaban-la-aplicacion.md):
siete centavos sobre $31.428 —el 0,0002 %— frenaban la escritura, y el cartel
afirmaba que el precio había cambiado. La tolerancia es la red para las filas ya
conciliadas con el número viejo, no el arreglo.

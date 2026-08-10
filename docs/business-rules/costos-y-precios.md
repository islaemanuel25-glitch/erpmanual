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

## RN-15 — El redondeo a 100 es siempre hacia arriba, pero hay dos funciones · **[CÓDIGO]**

**No conviven `ceil` y `round`.** Buscado el patrón `/ 100) * 100` en todo el
repo: las dos apariciones vivas son `Math.ceil`, y la tercera es un comentario de
test que advierte justamente contra `Math.round`
(`lib/precios/margenNoSeDeforma.test.mjs:113-114`).

Lo que sí hay son **dos funciones distintas, ambas hacia arriba**:

- `redondear100` (`lib/precios/redondeo.js:9`) — devuelve 0 si el valor es ≤ 0 o
  inválido. La usan stock, reportes, POS buscar-producto, listas y combos.
- `redondearA100Arriba` (`lib/precios/precioDesdeMargen.js:55`) — normaliza a
  centavos antes de subir, **para no empujar 1400 a 1500 por ruido binario**;
  devuelve el valor tal cual si es ≤ 0. La usan precios, recargo fijo, preview y
  `FormProducto`.

Para valores con centavos **las dos pueden dar resultados distintos**.

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

## RN-20 — `ListaPrecio.esDefault` no lo lee ningún camino de venta · **[ACCIDENTE POSIBLE]**

El campo se escribe desde la UI y dos endpoints (`crear`, `marcar-default`) lo
mantienen, desmarcando el anterior en transacción. Pero
`lib/precios/resolverListaCliente.js:10` dice, textual: *"La ListaPrecio.esDefault
del grupo NUNCA se consulta en runtime."* Verificado: no aparece en la resolución
de precio ni en `pos-ventas/crear`.

Es un botón que no cambia nada funcional. **Requiere decisión humana**: sacarlo de
la UI o volver a conectarlo. Ver [../roadmap/README.md](../roadmap/README.md).

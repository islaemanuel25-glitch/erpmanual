# Compras a proveedor

> **Escrito a mano el 2026-08-10** sobre el commit `d20afa9`. **No lo genera
> `scripts/update-docs.js`**: este módulo no está en su `MODULO_MAP`, así que no
> se pisa solo. Si se agrega al mapa, este archivo se sobrescribe.

**Es el segundo camino que escribe el precio de costo maestro en producción**, y
el único de los dos que **no tiene candados propios**. Por eso se documenta
primero.

## Propósito

Armar, confirmar, enviar y recibir pedidos a proveedor, y que la recepción mueva
el stock y actualice el costo.

**No confundir con `pedidos`**, que a pesar del nombre es el pedido interno
local→depósito y trabaja sobre `PosTransferencia`.

## Entradas

**Pantallas** — `app/modulos/compras-proveedor/`: `page.jsx`, `nueva`, `[id]`,
`recepcion`, `pendientes`, `activos`, `historial`, `ganancia`.

Hay además un panel de entrada, `app/modulos/compras/page.jsx`, que no tiene API
propia: consume `GET /api/compras-proveedor/resumen` y exige `compras.ver`.

**Endpoints** (15 en total; los que cambian estado o dinero): `crear`,
`agregar-item/[id]`, `editar-item/[id]`, `eliminar-item/[id]`, `confirmar/[id]`,
`marcar-enviado/[id]`, `recibir/[id]`, `anular/[id]`.

## Modelos

`PedidoProveedor`, `PedidoProveedorDetalle`, `ProductoBase`, `ProductoLocal`,
`StockLocal`, `Proveedor`, `GrupoDeposito`, `ProductoCodigoProveedor`.

Estados: enum `EstadoPedidoProveedor` (`prisma/schema.prisma:648`) — `BORRADOR`,
`CONFIRMADO`, `ENVIADO`, `RECIBIDO`, `ANULADO`.

## Reglas verificadas en código

- **Solo se recibe un pedido `ENVIADO`** — `recibir/[id]/route.js:107`.
- **El destino del stock no viene del body.** El `depositoId` es siempre el
  depósito del grupo, y el destino real lo fija `creadoEnLocalId` desde el
  contexto autorizado — `crear/route.js:34-35` y `:92-95`.
- **El dinero nunca lleva `factor_pack`.** La fórmula económica está en
  `lib/compras-proveedor/calculoPedido.js`: `naturalezaLinea` (15) distingue
  FIAMBRE / KG / PACK / UNIDAD, y `subtotalLinea` (54) no mete el factor en el
  importe. El factor entra **solo** en la entrada de stock
  (`recibir/[id]/route.js:246`).
- **El fiambre se cobra por kg y, sin peso por pieza, no inventa subtotal** —
  `calculoPedido.js:64`.
- **El costo maestro se guarda en la escala del producto**: por bulto si
  `factor_pack > 1`, por kg para fiambre y kg — `costoMaestro.js:41-49`
  (`costoLineaAMaestro`).
- **El margen nunca se toca desde compras**, pero el precio de venta **sí** se
  recalcula en todas las ubicaciones, usando el margen de **cada una** —
  `costoMaestro.js:11-14` y `:136`.
- **Un local que compra un producto del depósito no toca ningún costo** —
  `costoMaestro.js:105-112`, vía `puedeEditarCosto`. Es DEC-0002 aplicada acá.
- **Alcance por grupo Y por ubicación dueña** — `lib/compras/scope.js`,
  `ownerLocalIdDePedido` (6) y `pedidoEnAlcance` (13).

## Dependencias

Productos, stock, precios (`lib/precios/precioDesdeMargen.js`,
`propagarCostoALocales.js`), combos (`lib/combos/guards.js`), visibilidad,
proveedores.

**Y al revés:** el módulo de listas de proveedor depende de `costoMaestro.js` y
`calculoPedido.js` para no reinventar la conversión. Tocar esos dos archivos toca
los dos módulos.

## Candados

`lib/compras/scope.test.mjs`, 6 tests. **Y nada más.**

`calculoPedido.js`, `costoMaestro.js` y `textoPedido.js` **no tienen tests
propios**. La única cobertura es indirecta: `lib/precios/margenNoSeDeforma.test.mjs`
los lee **como texto** para verificar que deleguen la fórmula, lo cual detecta que
alguien copie la fórmula pero no que la fórmula esté mal.

**Es la superficie con menos candados de todo el dominio de compras, y es la que
escribe costos en producción.** Está en el roadmap como deuda 2.

## Deuda e inconsistencias

- Sin candados (arriba).
- Sin documentación hasta este archivo.
- `app/api/proveedores/eliminar/route.js:29` cuenta **solo** `ProductoBase` antes
  de borrar un proveedor. `Proveedor` tiene además relaciones a `PedidoProveedor`,
  `ProductoCodigoProveedor` e `ImportacionListaProveedor`
  (`prisma/schema.prisma:251-253`). Un proveedor sin productos pero con pedidos o
  con importaciones aplicadas **hoy pasa el chequeo**. **[DUDA]** — no se leyó el
  `onDelete` de esas tres relaciones.

## Fuentes

`app/modulos/compras-proveedor/**`, `app/api/compras-proveedor/**`,
`app/modulos/compras/page.jsx`, `lib/compras-proveedor/{calculoPedido,costoMaestro,textoPedido}.js`,
`lib/compras/scope.js`, `prisma/schema.prisma`. Enumerado con `git ls-files`.

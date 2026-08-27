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

## Crear un borrador desde foto, PDF o Excel

Desde `nueva` se elige el proveedor y se navega a la pantalla dedicada
`/modulos/compras-proveedor/importar`, que crea un borrador desde una foto, PDF,
XLSX o XLS. No es la pantalla de recepción ni modifica ese circuito:

1. `POST /api/compras-proveedor/importar/analizar` lee una foto/PDF con la misma
   configuración de Gemini que usa el sistema, o un XLSX/XLS de forma
   determinista con `xlsx`.
2. La pantalla muestra código, descripción, cantidad y unidad crudos, el costo
   vigente del sistema y el precio leído del papel en la misma escala. Si son
   distintos, exige elegir explícitamente cuál usar antes de crear el borrador;
   el valor sigue siendo revisable.
3. El vínculo intenta, en orden, un código o alias aprendido exacto y luego una
   terminación única del código (de mayor a menor precisión, hasta cuatro
   dígitos). Si el código aproximado es ambiguo no elige. El nombre solo ordena
   sugerencias y siempre exige confirmación humana.
4. Cada producto confirmado guarda para ese proveedor el código del papel y un
   alias normalizado de la descripción. Así una factura futura puede reconocer
   incluso un renglón sin código. Se recuerda el producto y la escala del precio,
   no se congela el importe numérico del catálogo.
5. `UN` se convierte a `BULTO` únicamente cuando `cantidad / factor_pack` es
   entero. Una división no exacta queda en unidades y exige revisión; `DI`, una
   unidad ausente o una cantidad no entera también bloquean hasta revisar.
6. Al confirmar, un pedido nuevo entra por el endpoint normal `crear` y queda en
   `BORRADOR`. Si ya se abrió un borrador, `importar/aplicar/[id]` suma las líneas
   al mismo pedido en una transacción, sin crear otro.

La recepción de un pedido ya enviado conserva otra regla: compara el comprobante
solo con las líneas de ese pedido. La importación de esta sección arma o amplía
un borrador y, por eso, busca dentro del catálogo autorizado del proveedor.

La primera versión no persiste el archivo fuente: lo usa para armar la revisión
y lo descarta. Tampoco toca stock, recepción, recetas fiscales, impuestos,
envío ni producción.

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

La importación agrega `lib/compras-proveedor/importacion/*.test.mjs` para el
parser tabular, el contrato del lector visual, los vínculos exactos y por sufijo,
los alias persistentes, la elección entre ambos precios, la conversión de
cantidades y la suma sobre un borrador existente. La sonda
`scripts/sonda-importar-pedido-desde-archivo.mjs` recorre la pantalla dedicada en
escritorio y celular con datos sintéticos y bloquea escrituras no interceptadas.

### Cómo se corre la sonda, sin credenciales de nadie

La sonda hace login REAL contra `/api/login`: no firma tokens ni inyecta
cookies, para que lo que mide sea la aplicación y no una maqueta. El usuario con
el que entra es dedicado y se asegura antes de correrla:

    DATABASE_URL=<la de desarrollo>  node scripts/usuario-de-sonda.mjs --clave <una generada al vuelo>
    node scripts/sonda-importar-pedido-desde-archivo.mjs --base http://localhost:3111 \
      --usuario sonda@local.test --clave <la misma>

**El `.env` de desarrollo trae `?schema=` VACÍO.** Cuando el cliente de Prisma
carga el archivo por su cuenta lo tolera, pero pasado como variable de entorno
llega tal cual y Postgres contesta «un identificador delimitado tiene largo
cero». Hay que sacar el parámetro vacío antes de exportarlo.

**Contra desarrollo, nunca contra producción**: hace login y toca la interfaz.

### Qué afirma, y qué encontró

89 afirmaciones. Además del recorrido de siempre —reintento, macheo, los dos
precios, el ranking del selector, los dos guardados— ejerce el panel
conversacional entero, que la receta releyó las COLUMNAS y no solo las escalas,
que el renglón sin cantidad aparece nombrado como no enviado, el bloqueo por
importe incoherente con sus botones de corrección, y los dos anchos sobre esas
dos formas nuevas.

Encontró tres cosas que los 4.289 candados no veían:

1. **La tolerancia de redondeo se calculaba sobre la cantidad del pedido.** Con
   un pack, esa cantidad es más chica que la del papel y el margen quedaba corto:
   una factura con bonificación se bloqueaba sola por tres centavos.
2. **El panel del proveedor desaparecía al revisar**, y con él el control del
   formato — justo cuando alguien se da cuenta de que se leyó mal.
3. **Remapear sin mapear la columna de código** pierde el vínculo por código: una
   línea que se machaba sola dejaba de macharse.

`lib/compras/scope.test.mjs` cubre el alcance. El resto del armado histórico aún
mantiene la deuda indicada abajo.

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

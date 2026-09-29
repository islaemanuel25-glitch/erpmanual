# Gastos

Qué es un gasto en ERP Azul, de quién es y cómo se paga. Es el núcleo: el modelo
y las dos puertas que escriben. Todavía **no hay pantalla** ni rutas que lo usen.

## Qué es, y qué no

- **Un gasto es lo que una ubicación consumió y no es mercadería**: luz,
  alquiler, sueldos, una reparación, insumos de limpieza, impuestos. Modelo
  `Gasto`, categoría en el catálogo `CategoriaGasto` [CÓDIGO]
  (`prisma/schema.prisma`, migración `20260929230000_gastos`).
- **Gasto ≠ retiro de caja.** Un RETIRO es plata saliendo de un cajón. Puede ser
  el pago de un gasto, o la recaudación, o el cambio. Un retiro manual con motivo
  "luz" NO es un gasto: nadie registró el gasto. La migración no convirtió ningún
  retiro histórico [CÓDIGO].
- **Gasto ≠ compra de mercadería.** La compra mueve stock y su deuda es
  `CuentaPorPagarProveedor` [CÓDIGO].
- **Gasto ≠ costo de mercadería.** El Libro de Costos no registra gastos
  operativos, y no los tiene que registrar [CÓDIGO].
- **Pago del gasto ≠ gasto.** Son dos hechos en dos tablas: `Gasto` —qué, de qué
  ubicación, a qué día corresponde, cuánto— y `PagoGasto` —cuándo y cómo salió el
  dinero—. Un gasto puede no tener ningún pago todavía [CÓDIGO].

## De quién es, y quién lo paga

- **El gasto pertenece a UNA ubicación**, `Gasto.localId` [CÓDIGO].
- **Esa ubicación es la única que lo paga.** Cada pago sale de ella
  (`PagoGasto.localOrigenId` igual a `Gasto.localId`) y lo registra quien la
  está operando. El depósito no paga gastos de un local, ni un local los del
  depósito. Ver un gasto —el depósito, un admin en vista global— **no habilita a
  pagarlo** [CÓDIGO] (`registrarPagoGasto`, `lib/finanzas/gastosServer.js`).
- **También se registra operando esa ubicación**: el depósito no anota gastos a
  nombre de un local [CÓDIGO] (`crearGasto`).
- Es la misma regla que las deudas con proveedores (`registrarPagoProveedor`),
  copiada y no reinterpretada.

## El saldo no se guarda

- Total, pagado, saldo y estado —PENDIENTE, PARCIAL, PAGADA— se derivan del
  `total` y de la suma de los pagos, con `estadoDeCuenta`
  (`lib/finanzas/pagosProveedores.js`), la misma cuenta que las deudas con
  proveedores [CÓDIGO].
- No se paga más que el saldo, y un importe tiene que ser positivo [CÓDIGO]. La
  base también lo exige con CHECK.

## Cómo sale el dinero

- **Efectivo:** sale del cajón de un turno **operativo y no anulado de la misma
  ubicación**, y genera **un** `CajaMovimiento` RETIRO al que el pago queda
  apuntando por `PagoGasto.cajaMovimientoId` (UNIQUE). Todo en la transacción de
  quien llama: si algo falla, no queda ni pago ni retiro [CÓDIGO]. La regla es
  la de `lib/finanzas/salidaDelPago.js`, compartida con los pagos a proveedores.
- **Un RETIRO es de a lo sumo UN pago, de cualquiera de los dos tipos.** La
  base rechaza que un mismo `CajaMovimiento` sea de un `PagoProveedor` y de un
  `PagoGasto` a la vez. Lo arbitra la clave primaria de `CajaMovimientoDePago`,
  que es el movimiento; la llena un trigger de cada pago al insertarse, y un
  pago no puede cambiar de movimiento. Es un índice único y no un chequeo, así
  que dos transacciones concurrentes no pueden confirmar las dos, en READ
  COMMITTED ni en REPEATABLE READ [VERIFICADO: `scripts/pruebas-db/gastos.mjs`].
- **Transferencia, Mercado Pago, Otro:** registran el medio y el día. **Todavía
  no hay cuenta financiera de origen** (banco, Mercado Pago con saldo). Cuando
  exista, es una columna de `PagoGasto`, no del gasto [CÓDIGO].
- **Un gasto puede nacer pendiente, o con un pago inicial** parcial o total, en
  la misma operación y atómica [CÓDIGO].
- Crear y pagar son **idempotentes** por la clave del intento: un reintento
  devuelve lo que ya se registró y no saca dos veces la plata [CÓDIGO].

## En Finanzas

- El RETIRO de un pago de gasto se clasifica **PAGO_GASTO por su vínculo**,
  nunca por el texto del motivo, y no entra en los "retiros manuales"
  [CÓDIGO] (`lib/finanzas/movimientosDeCaja.js`).
- Los gastos **todavía no entran en el resumen del período**: siguen en
  `METRICAS_NO_DISPONIBLES` [CÓDIGO].

## Permiso

- Ver: `finanzas.ver`. Crear y pagar: además `finanzas.gastos.registrar`, que
  **chequea la propia capa que escribe**. No va a ningún rol de sistema; Admin lo
  tiene por `*` [CÓDIGO] (`lib/rbac/registry.js`).

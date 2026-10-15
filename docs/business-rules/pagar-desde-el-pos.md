# Pagar desde el POS y pagos clasificados

Desde 2026-10-15. Regla de Emanuel, no se discute.

## Dos miradas que no se mezclan

- **Plata** (caja, cierre, Tesorería): todo lo que sale de la caja resta igual,
  sea del tipo que sea. El tipo no entra al efectivo esperado ni a la diferencia
  [CÓDIGO] (`calcularEfectivoEsperado` no lo lee) [VERIFICADO:
  `scripts/pruebas-db/pagarDesdeElPos.mjs`, sección 5: esperado idéntico con y
  sin tipo].
- **Ganancia** (resultado del turno en Turnos y cierres): Sueldo y Gasto
  RESTAN. Proveedor y Al depósito NO (es mercadería: su costo ya entra como
  costo de lo vendido). Retiro del dueño NO. Un egreso sin tipo NO resta y se
  muestra "Sin clasificar" [CÓDIGO] (`lib/caja/tipoEgreso.js`,
  `sueldosYGastos` y `resultadoDelTurno` en
  `lib/turnosYCierres/lecturaTurnosYCierres.js`).
- Resultado del turno = neto después de comisiones − costo de la mercadería −
  (sueldos + gastos) [CÓDIGO].

## El tipo

- Columna `CajaMovimiento.tipoEgreso`, enum `TipoEgresoCaja`, nullable
  (migración `20261015120000_tipo_egreso_caja`, aditiva). Los movimientos
  anteriores quedan sin tipo [CÓDIGO].
- La escriben "Pagar" y los pagos en efectivo de Finanzas, en el único lugar
  que crea el retiro de un pago: `resolverSalidaDelPago` [CÓDIGO].
- Un retiro sin columna pero vinculado a un pago dice qué fue por el vínculo:
  `PagoProveedor` → Proveedor; `PagoGasto` → Gasto, o Sueldo si su categoría es
  Sueldos. Uno manual sin tipo no se adivina [CÓDIGO].
- Quien tiene `finanzas.ver` le asigna el tipo a un egreso manual desde la
  tarjeta del turno. Cambia solo el tipo; ni monto ni caja. El de un pago de
  Finanzas no se reclasifica (409) [CÓDIGO] [VERIFICADO: sección 7].

## "Pagar" en el POS

- Lo usa todo cajero con `pos.usar`. La plata sale siempre de su caja abierta
  [CÓDIGO] (`app/api/pos-ventas/pagar`, misma validación de turno que
  "Cambio +/−": `lib/caja/turnoParaMover.js`).
- Cada tipo entra por la puerta que ya existe, sin un egreso propio [CÓDIGO]
  (`lib/caja/pagarDesdeElPosServer.js`):
  - Proveedor: una compra "nacida de factura" en ENVIADO y su cuenta por pagar
    con el pago inicial en efectivo (`crearCuentaPorPagarDesdeCompra` →
    `registrarPagoProveedor`). Queda "por cargar".
  - Sueldo o adelanto: un Gasto de categoría Sueldos, concepto "Sueldo · X" o
    "Adelanto · X", pagado entero en efectivo (`crearGasto` con `desdeElPos`).
  - Gasto: un Gasto de la categoría elegida, pagado entero en efectivo.
  - Al depósito y Retiro del dueño: solo el retiro con su tipo.
- `desdeElPos` abre `crearGasto` con `pos.usar` en vez de los permisos de
  Finanzas, y solo para un gasto pagado entero en efectivo en el alta [CÓDIGO].
- "Cambio +/−" sigue para mover cambio; no se borró nada [CÓDIGO].

## Compras por cargar

- Es una compra ENVIADA de la ubicación cuya cuenta tiene un pago en efectivo
  de tipo Proveedor (`whereComprasPorCargar`). No se guarda como estado
  [CÓDIGO].
- Se lista en Compras → Compras por cargar, con `compras.recibir` [CÓDIGO].
- "Cargar" abre la recepción de siempre de esa compra. Al confirmar, la cuenta
  NO se crea de nuevo: toma el total real y conserva el pago del POS; lo que se
  paga ahora es lo que falta, y "Pagada" ya cubierta no saca plata [CÓDIGO]
  [VERIFICADO: sección 9, la caja no se descuenta otra vez].
- Si lo pagado desde la caja supera el total de la compra, no se recibe (409)
  [CÓDIGO]. Ver la pregunta abierta en el informe de la tanda.
- La foto del remito se sube con `pos.usar` solo a una compra por cargar de la
  ubicación [CÓDIGO] [VERIFICADO: sección 3].

## Al depósito en Finanzas

- Finanzas → Pago a depósito muestra "Pagado desde la caja" aparte: no suma ni
  resta del pago reconocido, que sigue siendo de Transferencias [CÓDIGO]
  (`lib/finanzas/pagoADepositoDesdeCajaServer.js`).

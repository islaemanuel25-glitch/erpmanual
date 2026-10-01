# Pago a depósito

Cómo Finanzas lee la mercadería que un local recibe del depósito. Desde
2026-10-01.

## La regla

- **La mercadería que un local recibe del depósito se considera pagada al
  depósito el día que el local confirma la recepción.** Es una convención
  comercial del ERP para explicar el uso de la recaudación, no un movimiento de
  billetes [DECISIÓN de Emanuel, 2026-10-01].
- **Transferencias es el dueño del número.** Finanzas no consulta transferencias
  ni valoriza líneas: pide la cuenta del local en el criterio de recepción a
  `resumenDePagoADeposito` (`lib/transferencias/cuentaDelPeriodoServer.js`)
  [CÓDIGO].
- No hay tabla de pago, ni deuda entre depósito y local, ni migración [CÓDIGO].

## Qué entra

- Solo transferencias con origen en un depósito, destino en el local consultado,
  estado `Recibida` y `Transferencia.fechaRecepcion` dentro del período, en día
  argentino [CÓDIGO] (`cuentaDelPeriodo`, criterio RECEPCION, en
  `lib/transferencias/bloquesPorLocal.js`).
- `fechaRecepcion` la escribe solo `confirmar-recepcion`, en la misma
  transacción que pone `Recibida` y mueve el stock del local. Una recibida no se
  cancela ni se edita [CÓDIGO].
- Enviada una semana y recibida la siguiente: cuenta en la semana de RECEPCIÓN.
  Un período cerrado no cambia porque alguien confirme después [CÓDIGO].
- `Enviada`, `Recibiendo` y `Cancelada` no suman [CÓDIGO].

## Cuánto vale

- `importeRecibidoDeDetalleCentavos` (`lib/transferencias/agregadosPeriodo.js`):
  lo recibido de cada línea, con el `precioCosto` congelado al enviar y la
  presentación congelada, sumado en centavos. Una diferencia de recepción cambia
  el importe: se paga lo recibido [CÓDIGO].
- No se usan el total de la venta interna, sus `VentaPago`, el importe enviado
  ni los Libros de Stock y de Costos [CÓDIGO].

## Las pendientes

- Las `Enviada` y `Recibiendo` que ya habían salido al terminar el período se
  informan como "Pendiente de recepción", con su importe —lo contado hasta ahora,
  o lo enviado si no se contó nada—. **No suman al pago y no se descuentan de
  nada** [CÓDIGO].
- Es el estado de hoy, no una foto del período: una que se confirmó después ya no
  está pendiente, y cuenta en el día en que se confirmó [CÓDIGO]. Las dos
  pantallas lo dicen en la nota del renglón —"Salieron hasta el cierre del
  período y hoy siguen sin confirmar"— para que mirando una semana pasada no se
  lea como lo que faltaba confirmar aquella semana [CÓDIGO] (`NOTA_PENDIENTES`,
  `lib/transferencias/criterioDeCuenta.js`).

## La caja no vuelve a pagar la mercadería

- Una entrega posterior de efectivo al depósito **no** es un pago a depósito.
  Ningún `CajaMovimiento` alimenta el número [CÓDIGO].
- Un retiro de recaudación es efectivo cambiando de lugar; un retiro manual no
  dice qué es, y su motivo es texto libre que no decide nada. Los dos siguen en
  "Movimientos de caja" y ningún total del resumen los resta [CÓDIGO]
  (`resumenDelPeriodo` no tiene un "resto"; candado
  `lib/finanzas/pagoADeposito.test.mjs`, F12/F13).

## En las pantallas

- Finanzas → Resumen muestra el bloque "Pago a depósito" en los locales. En el
  depósito no existe: `aplica: false` [CÓDIGO].
- El importe lo ve quien tiene `finanzas.ver`. El "Ver" aparece solo con
  `transferencias.ver` [CÓDIGO].
- "Ver" abre la cuenta del local en Transferencias con `criterio=RECEPCION`, el
  mismo período (unidad y desplazamiento) y el mismo local, armada con
  `urlDelTablero`. Esa vista calcula con la MISMA función, así que muestra el
  mismo total y las mismas transferencias, con los días por fecha de
  confirmación y las pendientes aparte [CÓDIGO] [VERIFICADO:
  `scripts/pruebas-db/pagoADeposito.mjs`].
- Sin el parámetro, Transferencias sigue con su cuenta de siempre: por fecha de
  envío, y sumando también lo que falta recibir [CÓDIGO].

## Lo que todavía no está

- No hay "resto del flujo comercial": con un solo uso registrado se leería como
  lo que quedó, y no lo es.
- No hay cruce con el Valor del Stock. Las dos bases son distintas —el pago vale
  al costo congelado del depósito; el Libro, al costo del local a las 00:00— y
  el cruce tiene que mostrar esa diferencia como tal, no como pérdida.

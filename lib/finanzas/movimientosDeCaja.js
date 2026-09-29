// lib/finanzas/movimientosDeCaja.js
//
// NO TODO `CajaMovimiento` ES LO MISMO, Y CONFUNDIRLOS ES EL ERROR DEL MÓDULO.
//
// ── LAS TRES CLASES, Y POR QUÉ HAY QUE SEPARARLAS ────────────────────────
//
// La tabla guarda tres cosas distintas bajo los mismos dos tipos —INGRESO y
// RETIRO— y solo se distinguen por CON QUÉ OTRA FILA están vinculadas:
//
//   · MANUAL       — lo que alguien cargó desde "Caja +/−" en el POS. Motivo
//                    escrito a mano. Es lo único que se parece a un gasto, y
//                    tampoco lo es: ver abajo.
//   · RECAUDACION  — el retiro con conteo, el que se lleva la plata del día.
//                    Nace en "Retirar recaudación" y lo referencia un
//                    `ArqueoCaja.cajaMovimientoRetiroId`.
//   · CIERRE       — el retiro que hace el cierre del turno con lo que quedó en
//                    el cajón. Lo referencia `Turno.retiroCierreMovimientoId`.
//   · PAGO_PROVEEDOR — el retiro que crea `registrarPagoProveedor` cuando se le
//                    paga a un proveedor en efectivo. Lo referencia
//                    `PagoProveedor.cajaMovimientoId`, UNIQUE en la base.
//
// ── POR QUÉ IMPORTA, Y ES EXACTAMENTE LA REGLA DEL MÓDULO ────────────────
//
// **Mover plata no es gastarla.** Un retiro de recaudación de $103.400 es la
// misma plata que ya se contó como venta, saliendo del cajón para ir al banco o
// a la mano del dueño. Sumarlo junto a los retiros manuales daría un renglón que
// se lee como si alguien hubiera sacado esa plata del negocio, y contaría dos
// veces el mismo hecho.
//
// El POS ya hace esta separación —`app/api/pos-ventas/turnos/resumen/route.js`
// la escribe con su motivo— y acá se reusa el mismo vínculo, no un heurístico
// sobre el texto del motivo. El motivo es texto libre y no decide nada.
//
// ── Y EL DE CIERRE ADEMÁS ROMPE LA CUENTA ────────────────────────────────
//
// El retiro de cierre se crea DESPUÉS del arqueo final, justamente para que el
// cierre no se reste a sí mismo. Pero queda en la tabla, así que quien recalcule
// el efectivo esperado de un turno cerrado sin excluirlo lo descuenta una
// segunda vez y obtiene un número que no coincide con el que el propio cierre
// persistió. Ya pasó, y está anotado allá.
//
// ── Y EL DEL PAGO A PROVEEDOR ES UN PAGO, NO UN RETIRO MÁS ───────────────
//
// Un pago en efectivo es UN hecho con dos lados: la deuda baja (`PagoProveedor`)
// y la plata sale del cajón (este `CajaMovimiento`). Como MANUAL, el mismo
// peso quedaría en el renglón de retiros manuales, y el día que el resumen sume
// los pagos a proveedores contaría dos veces la misma salida.
//
// Para el efectivo esperado no cambia nada: salió del cajón antes del corte, y
// `paraElEsperado` lo sigue incluyendo igual que cuando caía en MANUAL.

// ── Y EL DEL PAGO DE UN GASTO, LO MISMO ──────────────────────────────────
//
// `registrarPagoGasto` en efectivo crea su RETIRO y el `PagoGasto` lo apunta
// por `cajaMovimientoId`, con UNIQUE. Es un pago, no un retiro manual: si cayera
// en MANUAL, el día que el resumen sume los gastos esa salida contaría dos
// veces. Se reconoce por el vínculo, nunca por su motivo "Pago de gasto: …".

export const CLASE_MOVIMIENTO = Object.freeze({
  MANUAL: "MANUAL",
  RECAUDACION: "RECAUDACION",
  CIERRE: "CIERRE",
  PAGO_PROVEEDOR: "PAGO_PROVEEDOR",
  PAGO_GASTO: "PAGO_GASTO",
});

const comoConjunto = (ids) => (ids instanceof Set ? ids : new Set(ids || []));

/**
 * Le pone la clase a cada movimiento, a partir de los vínculos que ya existen.
 *
 * Los conjuntos los arma quien consulta:
 *   · los ids de retiro referenciados por un `ArqueoCaja`;
 *   · los referenciados por `Turno.retiroCierreMovimientoId`;
 *   · los referenciados por `PagoProveedor.cajaMovimientoId`;
 *   · los referenciados por `PagoGasto.cajaMovimientoId`.
 *
 * Se pasan por argumento y no se leen acá para que esta función siga siendo
 * pura y se pueda ejercer sin base. Un llamador que no pasa el de pagos obtiene
 * la clasificación anterior: el pago cae en MANUAL.
 *
 * ── EL ORDEN DE LAS PREGUNTAS NO ES CASUAL ───────────────────────────────
 *
 * Cierre primero. Un retiro de cierre también produce su `ArqueoCaja` FINAL, así
 * que puede estar en los dos conjuntos; preguntando por recaudación primero
 * quedaría clasificado como recaudación y volvería a entrar en la cuenta del
 * esperado, que es el defecto que esta separación viene a evitar.
 *
 * El pago a proveedor va después de los dos, y el pago de un gasto después de
 * él. Si un pago coincidiera alguna vez con un cierre, el cierre tiene que
 * seguir fuera del esperado.
 *
 * Entre los dos pagos el orden no decide nada, y no porque se confíe en el
 * código: la BASE no deja que un movimiento sea de un `PagoProveedor` y de un
 * `PagoGasto` a la vez —tabla `CajaMovimientoDePago`, cuya clave primaria es el
 * movimiento, llenada por un trigger de cada pago; migración
 * 20260929230000_gastos—. Los dos conjuntos son disjuntos por construcción de
 * la base, así que un id nunca está en los dos.
 *
 * @param {Array} movimientos
 * @param {{idsDeRecaudacion?: Set<number>|Array<number>, idsDeCierre?: Set<number>|Array<number>, idsDePagoProveedor?: Set<number>|Array<number>, idsDePagoGasto?: Set<number>|Array<number>}} vinculos
 */
export function clasificarMovimientos(
  movimientos = [],
  { idsDeRecaudacion, idsDeCierre, idsDePagoProveedor, idsDePagoGasto } = {}
) {
  const recaudacion = comoConjunto(idsDeRecaudacion);
  const cierre = comoConjunto(idsDeCierre);
  const pagoProveedor = comoConjunto(idsDePagoProveedor);
  const pagoGasto = comoConjunto(idsDePagoGasto);

  return (movimientos || []).map((m) => {
    let clase = CLASE_MOVIMIENTO.MANUAL;
    if (cierre.has(m?.id)) clase = CLASE_MOVIMIENTO.CIERRE;
    else if (recaudacion.has(m?.id)) clase = CLASE_MOVIMIENTO.RECAUDACION;
    else if (pagoProveedor.has(m?.id)) clase = CLASE_MOVIMIENTO.PAGO_PROVEEDOR;
    else if (pagoGasto.has(m?.id)) clase = CLASE_MOVIMIENTO.PAGO_GASTO;
    return { ...m, clase };
  });
}

/** Los que cargó una persona desde "Caja +/−". */
export function soloManuales(movimientos = []) {
  return (movimientos || []).filter((m) => m?.clase === CLASE_MOVIMIENTO.MANUAL);
}

/**
 * Los retiros que se llevaron la recaudación, sin los del cierre.
 *
 * Se informan APARTE y no se esconden: es plata que salió del cajón y tiene que
 * poder verse. Lo que no se hace es mezclarla con los movimientos manuales.
 */
export function soloRecaudacion(movimientos = []) {
  return (movimientos || []).filter((m) => m?.clase === CLASE_MOVIMIENTO.RECAUDACION);
}

/**
 * Lo que se le pasa a `calcularEfectivoEsperado`: todo MENOS el retiro de
 * cierre.
 *
 * La recaudación, el pago a proveedor y el pago de un gasto SÍ entran —salieron
 * del cajón de verdad y antes del corte—, y el de cierre no, porque el cierre ya lo descontó al
 * persistir su esperado.
 */
export function paraElEsperado(movimientos = []) {
  return (movimientos || []).filter((m) => m?.clase !== CLASE_MOVIMIENTO.CIERRE);
}

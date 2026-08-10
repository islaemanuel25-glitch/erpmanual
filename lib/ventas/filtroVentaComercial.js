// lib/ventas/filtroVentaComercial.js
//
// Define qué es una VENTA COMERCIAL. Fuente única: si se repite el filtro a mano
// en cada endpoint, tarde o temprano uno queda afuera y los números dejan de
// cuadrar entre pantallas.
//
// QUÉ PROBLEMA RESUELVE
//
// Cuando el POS del depósito le vende a un Cliente vinculado a un local propio,
// hoy se crea una Venta comercial + un VentaPago + una Transferencia. La
// mercadería viaja bien, pero la Venta no es una venta: es un movimiento interno
// entre dos cajas del mismo grupo. Sin filtrar:
//
//   · infla las ventas y el costo del depósito en los reportes;
//   · y —lo grave— suma al EFECTIVO ESPERADO del turno un cobro que nunca
//     ocurrió, así que al cerrar aparece un faltante que no existe.
//
// CÓMO SE IDENTIFICA
//
// Por la relación real Venta ↔ Transferencia, y solo por ella. Nunca por cliente,
// forma de pago, observaciones, ticket, usuario ni fecha: esos son heurísticos
// que se rompen con el primer caso raro.
//
//   Transferencia.ventaId  Int? @unique     (el FK vive en Transferencia)
//   Venta.transferencia    Transferencia?   @relation("VentaTransferencia")
//
// El lado inverso YA existe en el schema, así que esto NO necesita migración ni
// cambio de base: el filtro relacional se resuelve entero en el cliente Prisma.
//
// DÓNDE SE APLICA Y DÓNDE NO
//
//   Comercial (se filtra):  reportes, dashboard, analytics de clientes, stats del
//                           día, el historial de ventas de un cliente, y TODO lo
//                           que alimenta la pantalla de cierre de turno (resumen,
//                           ventas del turno, cierre).
//   Técnico (NO se filtra): auditoría POS, soporte, administración e inspección
//                           de pagos. Ahí las internas tienen que seguir
//                           viéndose.
//
// EL HISTORIAL DEL CLIENTE CAMBIÓ DE LADO (2026-08-10). Estaba clasificado como
// técnico. Es una pantalla que mira una persona para saber qué le compró un
// cliente, no una vista de inspección: con un cliente vinculado a un local
// interno, sus transferencias se mezclaban con sus compras reales. Ahora filtra
// por defecto y las internas se piden con `?incluirInternas=1`, que es una
// decisión explícita y no la mezcla automática.
//
// La consistencia del turno es obligatoria: resumen, listado y cierre tienen que
// devolver los MISMOS totales. Si uno filtra y otro no, el operador ve un
// esperado y el cierre calcula otro.

/**
 * Condición Prisma: la venta NO tiene remito asociado.
 * Se exporta como getter para que nadie pueda mutar por accidente un objeto
 * compartido entre requests.
 */
export function soloComercial() {
  return { transferencia: { is: null } };
}

/** Condición inversa: la venta SÍ es una operación interna. */
export function soloInterna() {
  return { transferencia: { isNot: null } };
}

/**
 * Compone un `where` de Venta agregándole la condición comercial.
 *
 * Sirve para findMany, aggregate, groupBy y count, que comparten la forma del
 * `where`. Si el `where` base ya trae `transferencia`, se respeta el del
 * llamador: es un caso deliberado (por ejemplo, una vista técnica que quiere ver
 * solo internas) y pisarlo en silencio sería peor.
 *
 * @param {object} [whereBase={}]
 * @returns {object} nuevo objeto; NO muta el original.
 */
export function whereVentaComercial(whereBase = {}) {
  const base = whereBase && typeof whereBase === "object" ? whereBase : {};
  if (Object.prototype.hasOwnProperty.call(base, "transferencia")) return { ...base };
  return { ...base, ...soloComercial() };
}

/**
 * Igual que el anterior, pero para consultas cuyo modelo raíz NO es Venta y la
 * alcanza por relación (VentaPago, VentaDetalle…).
 *
 * @param {string} [campo="venta"] nombre de la relación hacia Venta.
 * @param {object} [ventaWhere={}] condiciones adicionales sobre la Venta.
 */
export function relacionVentaComercial(campo = "venta", ventaWhere = {}) {
  return { [campo]: whereVentaComercial(ventaWhere) };
}

/**
 * ¿Esta venta ya cargada es comercial?
 *
 * Para filtrar en memoria una lista que se trajo con la relación incluida. Exige
 * que `transferencia` venga en el select/include: si no vino, no se puede saber,
 * y devolver `true` marcaría una interna como comercial. Ante la duda, se
 * considera NO comercial y se avisa por el segundo valor.
 *
 * @returns {{ esComercial: boolean, resoluble: boolean }}
 */
export function evaluarVentaComercial(venta) {
  if (!venta || typeof venta !== "object") return { esComercial: false, resoluble: false };
  if (!Object.prototype.hasOwnProperty.call(venta, "transferencia")) {
    return { esComercial: false, resoluble: false };
  }
  return { esComercial: venta.transferencia == null, resoluble: true };
}

/** Select mínimo para poder evaluar en memoria. */
export const SELECT_MARCA_INTERNA = { transferencia: { select: { id: true } } };

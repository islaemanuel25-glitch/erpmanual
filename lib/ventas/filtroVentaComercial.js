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

// ── LAS ANULADAS TAMPOCO SON COMERCIALES (2026-08-20) ───────────────────────
//
// Una venta anulada se marca y no se borra: conserva su fila y su número de
// ticket. Eso significa que sigue apareciendo en toda consulta que no la excluya
// expresamente, y una venta anulada que cuenta para el arqueo es peor que no
// poder anular — el operador cerraría el turno con un esperado que incluye plata
// que se decidió que no entró.
//
// SE AGREGA ACÁ Y NO EN LOS 17 LLAMADORES, y ésa es toda la razón por la que
// este archivo existe. Medido el 2026-08-20: de los 32 lugares del repo que
// consultan ventas, 17 pasan por `whereVentaComercial` —arqueo, cierre y relevo
// de turno, dashboard, reportes, estadísticas del día, analytics de clientes— y
// los 17 heredan esta condición sin tocar una línea.
//
// Los otros 15 NO deben heredarla, y tampoco es un olvido: 9 son de
// `auditoria-pos-ventas`, que es la vista técnica y tiene que seguir viendo todo
// —una anulada es justamente lo que un auditor va a buscar—; 4 leen UNA venta
// por id para mostrarla, y ahí hay que MARCARLA, no esconderla; uno es la
// creación y el otro el reset operativo.
//
// LA MISMA REGLA QUE LA INTERNA, POR EL MISMO MOTIVO. Si se repitiera el filtro
// a mano en cada endpoint, tarde o temprano uno queda afuera y los números dejan
// de cuadrar entre pantallas.

/** Condición Prisma: la venta está viva (no anulada). */
export function soloNoAnulada() {
  return { anuladaEn: null };
}

/**
 * Condición Prisma: la venta cuenta comercialmente — no tiene remito asociado Y
 * no está anulada.
 * Se exporta como función y no como constante para que nadie pueda mutar por
 * accidente un objeto compartido entre requests.
 */
export function soloComercial() {
  return { transferencia: { is: null }, ...soloNoAnulada() };
}

/**
 * Condición inversa: la venta SÍ es una operación interna.
 *
 * Excluye las anuladas igual que su par. Una interna anulada no es "una interna
 * más": no cuenta para ningún lado, y dejarla acá haría que las dos mitades no
 * sumaran el total.
 */
export function soloInterna() {
  return { transferencia: { isNot: null }, ...soloNoAnulada() };
}

/**
 * Compone un `where` de Venta agregándole la condición comercial.
 *
 * Sirve para findMany, aggregate, groupBy y count, que comparten la forma del
 * `where`. Si el `where` base ya trae `transferencia`, se respeta el del
 * llamador: es un caso deliberado (por ejemplo, una vista técnica que quiere ver
 * solo internas) y pisarlo en silencio sería peor.
 *
 * ── LAS DOS CONDICIONES SE DECIDEN POR SEPARADO ────────────────────────────
 *
 * Ésta es la parte delicada, y estuvo a punto de salir mal. La versión original
 * devolvía el `where` del llamador TAL CUAL cuando traía `transferencia`, así
 * que al agregar la anulación ese atajo se habría llevado puesto también el
 * `anuladaEn: null` — un llamador que pide "solo internas" habría contado las
 * internas anuladas, sin que nada avise.
 *
 * Ahora cada condición se pregunta por su cuenta: el llamador puede pisar la de
 * transferencia y seguir heredando la de anulación, o pisar las dos, pero
 * pisando una no se lleva la otra de arrastre.
 *
 * ── `incluirAnuladas`: MOSTRAR NO ES SUMAR ─────────────────────────────────
 *
 * Hay una vista que necesita las dos cosas a la vez: el LISTADO de ventas. Una
 * venta anulada tiene que verse ahí, marcada —si desapareciera, quien la anuló
 * por error no tendría dónde encontrarla— pero no tiene que sumar en ningún
 * total.
 *
 * En ese listado las dos cosas están separadas por construcción: pagina y marca,
 * y los totales de dinero los calcula otro endpoint. Por eso la excepción es
 * segura ahí y NO se usa en ninguna consulta que sume.
 *
 * Es un parámetro explícito y no un default para que quien lo escriba tenga que
 * decidirlo: el default sigue siendo esconderlas, que es lo correcto en 16 de los
 * 17 lugares.
 *
 * @param {object} [whereBase={}]
 * @param {object} [opciones]
 * @param {boolean} [opciones.incluirAnuladas=false] mostrar también las anuladas.
 * @returns {object} nuevo objeto; NO muta el original.
 */
export function whereVentaComercial(whereBase = {}, { incluirAnuladas = false } = {}) {
  const base = whereBase && typeof whereBase === "object" ? whereBase : {};
  const tiene = (campo) => Object.prototype.hasOwnProperty.call(base, campo);

  const compuesto = { ...base };
  if (!tiene("transferencia")) compuesto.transferencia = { is: null };
  if (!incluirAnuladas && !tiene("anuladaEn")) Object.assign(compuesto, soloNoAnulada());
  return compuesto;
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
  const tiene = (campo) => Object.prototype.hasOwnProperty.call(venta, campo);
  // Las DOS columnas tienen que haber venido. Si falta `anuladaEn` en el select,
  // una venta anulada se evaluaría como comercial — el mismo "ante la duda,
  // no comercial" que ya regía para la transferencia.
  if (!tiene("transferencia") || !tiene("anuladaEn")) {
    return { esComercial: false, resoluble: false };
  }
  return { esComercial: venta.transferencia == null && venta.anuladaEn == null, resoluble: true };
}

/** ¿Esta venta está anulada? Una sola fuente de verdad: la fecha. */
export function estaAnulada(venta) {
  return venta?.anuladaEn != null;
}

/** Select mínimo para poder evaluar en memoria. Las DOS columnas, o no resuelve. */
export const SELECT_MARCA_INTERNA = {
  transferencia: { select: { id: true } },
  anuladaEn: true,
};

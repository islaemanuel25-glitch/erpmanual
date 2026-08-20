// lib/transferencias/cancelarTransferencia.js
//
// ¿QUIÉN PUEDE CANCELAR UNA TRANSFERENCIA, Y QUÉ HAY QUE REVERTIR? Predicado
// puro: no consulta Prisma ni depende de Next.
//
// ── EL CASO QUE LO ORIGINÓ ──────────────────────────────────────────────────
//
// Transferencia #97, 2026-08-19: salió del depósito hacia Casiano casas por un
// error de carga —la venta 7726 se cargó al cliente equivocado— y la mercadería
// era para otro lado. Casiano abre el remito, ve que no le corresponde, y tiene
// que poder deshacerlo desde ahí.
//
// ── LAS DOS COSAS QUE ESTABAN MAL ───────────────────────────────────────────
//
// 1. EL DESTINO NO PODÍA. La pantalla mostraba el botón a cualquiera con el
//    permiso `transferencias.cancelar`, y el backend exigía
//    `transferencia.origenId === localId`. O sea: el local que RECIBE el remito
//    veía el botón y al tocarlo recibía un 403. Botón visible contra backend que
//    rechaza es peor que no tener botón.
//
// 2. UNA TRANSFERENCIA DE VENTA NO PODÍA CANCELARSE EN ABSOLUTO, y con razón: el
//    cancelado clásico devuelve `cantidad` al origen, pero cuando la
//    transferencia nació de una venta el descuento lo hizo la venta —política
//    `SOLO_TRANSITO`—, así que devolverla inventaría mercadería que la venta
//    sigue cobrando. La prohibición tapaba el síntoma; lo que faltaba era
//    revertir las dos cosas juntas.
//
// ── QUÉ NO ES ESTO ──────────────────────────────────────────────────────────
//
// No borra nada. La transferencia sigue existiendo, con sus líneas y sus
// cantidades originales; cambia de estado y queda con autor, fecha y motivo. La
// venta vinculada tampoco se borra: conserva su ticket y queda anulada.

/** Códigos estables. El llamador ramifica sobre ellos, no sobre el texto. */
export const CODIGOS_CANCELAR = {
  OK: "CANCELAR_OK",
  NO_ENCONTRADA: "TRANSFERENCIA_NO_ENCONTRADA",
  ESTADO_INVALIDO: "ESTADO_INVALIDO",
  CON_RECEPCION: "TRANSFERENCIA_CON_RECEPCION",
  FUERA_DE_ALCANCE: "FUERA_DE_ALCANCE",
  MOTIVO_AUSENTE: "MOTIVO_AUSENTE",
  // SIN_TURNO_DESTINO se retiró el 2026-08-20: este flujo no necesita una caja
  // abierta. Ver el bloque que lo explica más abajo.
};

// ── EL MOTIVO ES OBLIGATORIO, Y ESO ES TODO ────────────────────────────────
//
// Acá hubo un mínimo de 10 caracteres. Se sacó el 2026-08-20: la regla aprobada
// es "toda cancelación requiere motivo", y el número lo había puesto yo por mi
// cuenta. Un mínimo inventado no es una regla del negocio — rechaza "se rompio"
// y acepta "aaaaaaaaaa", así que ni siquiera consigue lo que aparenta.
//
// Lo que se exige es que exista y que no quede vacío al recortar los espacios.
// El texto se guarda íntegro, sin truncar.

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const no = (codigo, error) => ({ puede: false, codigo, error });

/**
 * ¿Alguna línea tiene recepción cargada?
 *
 * `null` es "nadie tocó todavía"; `0` es "abrieron el remito y registraron que no
 * llegó nada", y eso YA es un acto de recepción. Los dos no se colapsan.
 *
 * Se mira línea por línea y no el estado: el estado pasa a "Recibiendo" recién al
 * guardar, y entre medio puede haber una línea escrita.
 */
export function tieneRecepcionCargada(detalle = []) {
  return detalle.some((d) => d?.recibido !== null && d?.recibido !== undefined);
}

/**
 * ¿Este local participa de la transferencia?
 *
 * LAS DOS PUNTAS, y ésa es la corrección. El origen la mandó y puede arrepentirse
 * mientras nadie la haya tocado; el destino la recibe y es quien descubre que no
 * le corresponde. Los dos ven el mismo documento y los dos pueden deshacerlo.
 */
export function participaDeLaTransferencia(transferencia, localId) {
  const id = Number(localId);
  if (!idValido(id)) return false;
  return Number(transferencia?.origenId) === id || Number(transferencia?.destinoId) === id;
}

/**
 * ¿Se puede cancelar, y qué hay que revertir?
 *
 * @param {object} args
 * @param {object|null} args.transferencia  { id, estado, origenId, destinoId, detalle, venta }
 * @param {number|null} args.localId        local desde el que se opera (null = admin sin local)
 * @param {boolean} args.esAdmin
 * @param {string} args.motivo
 * @returns {{ puede: true, codigo, revierteVenta: boolean, ventaId: number|null }
 *          | { puede: false, codigo, error }}
 */
export function puedeCancelarTransferencia({
  transferencia = null,
  localId = null,
  esAdmin = false,
  motivo = "",
} = {}) {
  if (!transferencia || !idValido(transferencia.id)) {
    return no(CODIGOS_CANCELAR.NO_ENCONTRADA, "No se encontró la transferencia.");
  }

  if (transferencia.estado !== "Enviada") {
    const extra =
      transferencia.estado === "Recibida"
        ? " Ya fue recibida: la mercadería está en el otro local y hay que moverla desde ahí."
        : transferencia.estado === "Cancelada"
        ? " Ya está cancelada."
        : "";
    return no(
      CODIGOS_CANCELAR.ESTADO_INVALIDO,
      `Solo se puede cancelar una transferencia en estado "Enviada". Está en "${transferencia.estado}".${extra}`
    );
  }

  if (tieneRecepcionCargada(transferencia.detalle || [])) {
    return no(
      CODIGOS_CANCELAR.CON_RECEPCION,
      "Este remito ya tiene cantidades recibidas cargadas. Si faltó mercadería, " +
        "registrala como recibido 0 con su motivo en vez de cancelar: así queda el rastro de qué se envió."
    );
  }

  // Alcance: admin sin local ve todo; el resto tiene que participar.
  if (!esAdmin && !participaDeLaTransferencia(transferencia, localId)) {
    return no(
      CODIGOS_CANCELAR.FUERA_DE_ALCANCE,
      "Esta transferencia no sale de tu local ni llega a él."
    );
  }

  if (typeof motivo !== "string" || motivo.trim() === "") {
    return no(
      CODIGOS_CANCELAR.MOTIVO_AUSENTE,
      "Escribí por qué se cancela. Una transferencia cancelada sin motivo es indistinguible " +
        "dentro de un mes de un error de datos."
    );
  }

  // ── NO HACE FALTA UNA CAJA ABIERTA, Y ACÁ ESTÁ POR QUÉ ────────────────────
  //
  // Hasta el 2026-08-20 esto exigía un turno abierto en el local vendedor, y era
  // una exigencia HEREDADA del flujo genérico de anular una venta común. Ahí sí
  // hace falta: anular una venta que contaba para el arqueo baja el esperado, y
  // esa diferencia tiene que caer en alguna caja.
  //
  // Este flujo es otro. Una venta con remito NUNCA contó para el arqueo —el
  // filtro comercial la excluye por tener transferencia, y por eso su
  // `impactoEnArqueo` da `deltaEsperado: 0`—, así que al revertirla no hay
  // ninguna diferencia de efectivo que imputar. Exigir una caja abierta era
  // pedirle al depósito que abriera la suya para que Casiano pudiera deshacer un
  // remito que le llegó por error.
  //
  // Comprobado sobre las piezas, no supuesto: ni `aplicarDeltaStock`, ni
  // `ajustarCuentaCorriente`, ni `ajustarPuntosCorreccion` miran el turno, y
  // `VentaCorreccion.turnoIdCorreccion` es nullable con el comentario "si hay".
  //
  // `turnoIdCorreccion` queda en null en este flujo, siempre. Poner ahí el turno
  // que estuviera abierto diría que la diferencia impactó en esa caja, y no
  // impactó nada.
  //
  // Lo que NO cambia: anular una venta común, sin remito, sigue necesitando una
  // caja donde caiga la diferencia. Ese flujo no pasa por acá.
  const venta = transferencia.venta || null;
  if (venta && venta.anuladaEn != null) {
    return no(
      CODIGOS_CANCELAR.ESTADO_INVALIDO,
      `El ticket #${venta.numero ?? venta.id} que originó este remito ya está anulado.`
    );
  }

  return {
    puede: true,
    codigo: CODIGOS_CANCELAR.OK,
    revierteVenta: venta != null,
    ventaId: venta?.id ?? null,
  };
}

/**
 * Qué va a pasar, en palabras, para poder decirlo ANTES de hacerlo.
 *
 * La pantalla lo muestra en el diálogo de confirmación. Cancelar un remito manual
 * y cancelar uno que vino de una venta hacen cosas muy distintas —el segundo
 * revierte una venta cobrada— y desde el botón se ven iguales.
 */
export function resumenDeLaCancelacion(transferencia) {
  const venta = transferencia?.venta || null;
  const lineas = (transferencia?.detalle || []).length;
  const efectos = [
    `El remito #${transferencia?.id} queda Cancelado. Sus ${lineas} línea${lineas === 1 ? "" : "s"} ` +
      `siguen visibles con las cantidades que se enviaron.`,
    "El stock en tránsito del origen se libera.",
  ];
  if (venta) {
    // NOMENCLATURA: `numero` es el número de COMPROBANTE y el ERP lo muestra
    // como "Ticket #". El identificador interno de la venta es `id`, y son dos
    // cosas distintas: la venta 7726 tiene el ticket #1022. Llamar "venta #1022"
    // al ticket es el error que hay que no cometer — el operador busca por el
    // número que ve impreso.
    efectos.push(
      `Se anula el ticket #${venta.numero ?? venta.id}, que conserva su número y queda marcado como anulado.`,
      "El stock vuelve al local que vendió, una sola vez.",
      "Se revierten la cuenta corriente y los puntos de esa venta, si tenía."
    );
  } else {
    efectos.push("La mercadería vuelve al stock del origen.");
  }
  return { efectos, revierteVenta: venta != null };
}

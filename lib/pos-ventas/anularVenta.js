// lib/pos-ventas/anularVenta.js
//
// ANULAR UNA VENTA: el predicado puro. Decide si se puede y dónde cae la
// diferencia de caja. No consulta Prisma ni depende de Next.
//
// ── QUÉ ES ANULAR, Y QUÉ NO ES ──────────────────────────────────────────────
//
// Anular no borra: MARCA. La venta conserva su fila y su número de ticket, se
// sigue viendo en el listado y en su detalle con la marca puesta, y deja de
// contar para arqueo, reportes y estadísticas. El contador de comprobantes es
// monótono y un hueco en la numeración no se puede explicar.
//
// El estado se deriva de una sola columna, `anuladaEn`. No hay booleano al lado:
// dos fuentes de verdad discrepan algún día y ese día no hay forma de saber cuál
// manda.
//
// ── POR QUÉ FUNCIONA CON EL TURNO CERRADO, QUE ES LO NUEVO ──────────────────
//
// La corrección completa exige el turno original abierto. Medido el 2026-08-20:
// de las 99 ventas con transferencia, 82 están en turnos ya cerrados. Una
// herramienta de anulación que exigiera turno abierto serviría para 17 casos de
// 99, o sea que no serviría.
//
// La diferencia no se mete en el turno cerrado —eso sí rompería un arqueo ya
// contado y firmado—: cae en el turno ABIERTO al momento de anular. El registro
// de correcciones ya tiene los dos campos para expresarlo, `turnoIdOriginal` y
// `turnoIdCorreccion`, y hasta hoy siempre guardaban el mismo valor justamente
// porque la operación no podía cruzar turnos.
//
// ── Y POR QUÉ SE SACA LA VENTANA DE TREINTA DÍAS ────────────────────────────
//
// La ventana existe para las correcciones: cambiar cantidades de una venta vieja
// mueve stock y plata sobre un período ya cerrado. Anular es distinto — es
// declarar que la operación no existió, y una venta mal cargada hace cuarenta
// días sigue estando mal hoy. El límite lo pone el permiso, no el calendario.

/** Códigos estables. El llamador ramifica sobre ellos, no sobre el texto. */
export const CODIGOS_ANULAR = {
  OK: "ANULAR_OK",
  VENTA_AUSENTE: "VENTA_AUSENTE",
  YA_ANULADA: "VENTA_YA_ANULADA",
  MOTIVO_AUSENTE: "MOTIVO_AUSENTE",
  TRANSFERENCIA_NO_ENVIADA: "TRANSFERENCIA_NO_ENVIADA",
  TRANSFERENCIA_CON_RECEPCION: "TRANSFERENCIA_CON_RECEPCION",
  SIN_TURNO_DESTINO: "SIN_TURNO_DESTINO",
  SIN_PERMISO_TURNO_CERRADO: "SIN_PERMISO_TURNO_CERRADO",
};

export const MOTIVO_MIN_ANULACION = 10;

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const no = (codigo, error) => ({ puede: false, codigo, error });

/**
 * ¿Alguna línea del remito tiene recepción cargada?
 *
 * `null` es "nadie tocó todavía"; `0` es "abrieron el remito y registraron que no
 * llegó nada", y eso YA es un acto de recepción. Los dos no se colapsan.
 *
 * Se mira línea por línea y no el estado del remito: el estado pasa a
 * "Recibiendo" recién al guardar, y entre medio puede haber una línea escrita.
 */
export function transferenciaFueTocada(transferencia) {
  const detalle = transferencia?.detalle || [];
  return detalle.some((d) => d?.recibido !== null && d?.recibido !== undefined);
}

/**
 * ¿Se puede anular esta venta, y dónde cae la diferencia?
 *
 * @param {object} args
 * @param {object|null} args.venta         { id, anuladaEn, turnoId, turno: { cierre }, transferencia }
 * @param {object|null} args.turnoAbierto  turno operativo del local AHORA, o null
 * @param {string} args.motivo
 * @param {boolean} args.puedeTurnoCerrado permiso `ventas.corregir_turno_cerrado`
 * @returns {{ puede: true, codigo, turnoOriginalId, turnoDestinoId, turnoOriginalCerrado }
 *          | { puede: false, codigo, error }}
 */
export function puedeAnular({
  venta = null,
  turnoAbierto = null,
  motivo = "",
  puedeTurnoCerrado = false,
} = {}) {
  if (!venta || !idValido(venta.id)) {
    return no(CODIGOS_ANULAR.VENTA_AUSENTE, "No se encontró la venta.");
  }

  if (venta.anuladaEn != null) {
    return no(
      CODIGOS_ANULAR.YA_ANULADA,
      "Esta venta ya está anulada. Anularla de nuevo devolvería el stock dos veces."
    );
  }

  if (typeof motivo !== "string" || motivo.trim().length < MOTIVO_MIN_ANULACION) {
    return no(
      CODIGOS_ANULAR.MOTIVO_AUSENTE,
      `Escribí por qué se anula, con al menos ${MOTIVO_MIN_ANULACION} caracteres. Una venta anulada sin ` +
        `motivo es indistinguible dentro de un mes de un error de datos.`
    );
  }

  // ── La transferencia, si la hay ──────────────────────────────────────────
  //
  // Una venta sin remito se anula sin más. Con remito, solo mientras la
  // mercadería no haya empezado a entrar del otro lado: después ya está en el
  // stock de otro local y anular acá lo dejaría sin respaldo.
  const t = venta.transferencia;
  if (t) {
    if (t.estado !== "Enviada") {
      return no(
        CODIGOS_ANULAR.TRANSFERENCIA_NO_ENVIADA,
        `Esta venta generó el remito #${t.id}, que está en "${t.estado}". ` +
          (t.estado === "Recibida"
            ? "Ya lo recibieron: la mercadería está en el otro local y hay que moverla desde ahí."
            : "Solo se puede anular mientras el remito esté en \"Enviada\".")
      );
    }
    if (transferenciaFueTocada(t)) {
      return no(
        CODIGOS_ANULAR.TRANSFERENCIA_CON_RECEPCION,
        `El destino ya empezó a registrar la recepción del remito #${t.id}. Hablá con el local antes de anular.`
      );
    }
  }

  // ── El turno ─────────────────────────────────────────────────────────────
  //
  // El original puede estar cerrado; lo que no puede faltar es un turno ABIERTO
  // donde imputar la diferencia. Sin eso la plata no tiene dónde caer, y anular
  // igual dejaría un ajuste sin caja que lo reciba.
  const turnoOriginalCerrado = venta.turno ? venta.turno.cierre != null : venta.turnoId != null;

  if (turnoOriginalCerrado && !puedeTurnoCerrado) {
    return no(
      CODIGOS_ANULAR.SIN_PERMISO_TURNO_CERRADO,
      "El turno de esta venta ya está cerrado. Hace falta el permiso para corregir ventas con turno cerrado."
    );
  }

  if (!turnoAbierto || !idValido(turnoAbierto.id)) {
    return no(
      CODIGOS_ANULAR.SIN_TURNO_DESTINO,
      "No hay ningún turno abierto en este local donde imputar la anulación. Abrí la caja y volvé a intentar."
    );
  }

  return {
    puede: true,
    codigo: CODIGOS_ANULAR.OK,
    turnoOriginalId: venta.turnoId ?? null,
    turnoDestinoId: Number(turnoAbierto.id),
    turnoOriginalCerrado,
  };
}

/**
 * El efecto de la anulación sobre el arqueo, para poder DECIRLO antes de hacerlo.
 *
 * ── POR QUÉ ESTO ES UNA FUNCIÓN Y NO UN COMENTARIO ──────────────────────────
 *
 * Anular una venta que hoy cuenta para el arqueo BAJA el esperado del turno donde
 * cae. Anular una venta interna —que hoy no cuenta, porque tiene remito— no lo
 * mueve. Las dos cosas se ven iguales desde la pantalla y la diferencia es de
 * cientos de miles de pesos, así que el número se calcula y se muestra antes de
 * confirmar, en vez de que el cajero lo descubra al cerrar.
 *
 * @returns {{ contabaEnArqueo: boolean, deltaEsperado: number, medios: Array }}
 */
export function impactoEnArqueo(venta) {
  const pagos = venta?.pagos || [];
  // La misma definición que `soloComercial`: con remito no cuenta, y anulada
  // tampoco — pero acá todavía no lo está.
  const contaba = venta?.transferencia == null && venta?.anuladaEn == null;
  const medios = pagos.map((p) => ({ medio: p.medio, monto: Number(p.monto) || 0 }));
  const total = medios.reduce((a, m) => a + m.monto, 0);
  return {
    contabaEnArqueo: contaba,
    deltaEsperado: contaba ? -total : 0,
    medios: contaba ? medios : [],
  };
}

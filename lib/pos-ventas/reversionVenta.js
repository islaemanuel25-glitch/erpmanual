// lib/pos-ventas/reversionVenta.js
//
// EL MOTOR DE REVERSIÓN DE UNA VENTA. Recibe una transacción abierta y deshace
// los efectos de una venta: stock, cuenta corriente y puntos. Marca la venta como
// anulada y deja el rastro en `VentaCorreccion`.
//
// ── POR QUÉ ES UNA PIEZA Y NO UNA RUTA ──────────────────────────────────────
//
// Nació dentro de `/api/pos-ventas/venta/[id]/anular` el 2026-08-20. Ese mismo
// día se decidió que una venta interna se corrige desde el REMITO —en el módulo
// Transferencias, que es el documento que el local destino recibe y revisa— y no
// desde Ventas. La ruta se retiró; el motor no, porque es correcto y está
// probado.
//
// Vive acá para que el llamador sea quien decida CUÁNDO revertir, y el motor solo
// sepa CÓMO. Lo llaman dos rutas: `transferencias/cancelar`, para la venta interna
// que nació con un remito, y desde el 2026-10-10 `/api/pos-ventas/venta/[id]/anular`
// de nuevo, para la venta COMÚN del mostrador —sin remito—. Volvió por un caso real:
// el POS de Mini unidas se tildó y registró dos tickets duplicados que no había
// forma de anular. La venta interna sigue sin poder anularse desde Ventas: ver
// `veredictoAnulacionVentaComun`.
//
// ── LO QUE NO HACE, Y ES A PROPÓSITO ────────────────────────────────────────
//
// No toca la transferencia. Quien la cancela es el llamador, porque la
// transferencia tiene su propia política de stock —`SOLO_TRANSITO` cuando nació
// de una venta— y mezclarlas acá haría que el depósito recupere la mercadería dos
// veces: una por la reversión de la venta y otra por la del remito.
//
// No abre la transacción: la recibe. Así el llamador puede meter la cancelación
// del remito y la reversión de la venta en la MISMA, que es lo que hace que sea
// todo o nada.
//
// No borra nada. Ni la venta, ni sus líneas, ni sus pagos. Los pagos se conservan
// para que quede el rastro de cómo se había cobrado; la venta entera deja de
// contar porque el filtro comercial la excluye por `anuladaEn`.

import {
  aplicarDeltaStock,
  ajustarCuentaCorriente,
  ajustarPuntosCorreccion,
} from "@/lib/pos-ventas/correccionCompletaServer";
import { reconstruirConsumoOriginal } from "@/lib/pos-ventas/motorCorreccion";
import {
  estadoDelTurno,
  ESTADO_TURNO,
  ESTADO_CIERRE,
  calcularRetiroEsperado,
  calcularCierreDesdeRetiro,
  calcularCierreDesdeConteo,
} from "@/lib/caja/cierreRelevo";
import { aCentavos, desdeCentavos, calcularDiferencia, desglosarVentas } from "@/lib/caja/efectivoEsperado";
import { declararOrigenDeStock, ORIGEN_STOCK } from "@/lib/stock/libro/libroStock";

/** Códigos estables de la anulación de una venta común. Se ramifica sobre ellos. */
export const CODIGOS_ANULAR = {
  OK: "ANULAR_OK",
  VENTA_AUSENTE: "VENTA_AUSENTE",
  YA_ANULADA: "VENTA_YA_ANULADA",
  CON_REMITO: "VENTA_CON_REMITO",
  CONSUMO_NO_CONGELADO: "CONSUMO_NO_CONGELADO",
  MOTIVO_AUSENTE: "MOTIVO_AUSENTE",
  SIN_TURNO: "VENTA_SIN_TURNO",
  TURNO_EN_CIERRE: "TURNO_EN_CIERRE",
  TURNO_ANULADO: "TURNO_ANULADO",
  SIN_PERMISO_TURNO_CERRADO: "SIN_PERMISO_TURNO_CERRADO",
  CIERRE_NO_COINCIDE: "CIERRE_NO_COINCIDE",
};

/**
 * ¿Se puede anular esta venta desde su detalle? Lo leen IGUAL el detalle —para
 * decidir si dibuja el botón— y la ruta de anular —para decidir si lo hace—. Si
 * cada uno lo dedujera por su lado, el botón ofrecería algo que la ruta rechaza.
 *
 * Tres condiciones, y cada una tiene su porqué:
 *
 * · SIN REMITO. Una venta interna se anula cancelando su remito desde
 *   Transferencias (decisión del 2026-08-20, que sigue en pie). Desde acá se
 *   devolvería el stock sin liberar el tránsito.
 *
 * · CON SU TURNO ABIERTO, O CERRADO CON PERMISO. Decisión de Emanuel del
 *   2026-10-10, que reemplaza la del 2026-08-20: anular funciona aunque el turno
 *   de la venta esté CERRADO, y el ajuste va SIEMPRE a ese turno, el original —su
 *   esperado baja y la diferencia de su cierre se recalcula, ver
 *   `ajusteDelCierrePorAnulacion`—, nunca a otro. Con el turno cerrado se exige
 *   `ventas.corregir_turno_cerrado`, y por eso el permiso entra ACÁ y no en la
 *   pantalla: el botón y la ruta lo preguntan igual. Lo que sigue bloqueado es el
 *   turno con el corte tomado y sin confirmar —su esperado está congelado
 *   mientras alguien cuenta— y el turno anulado. Sin ventana de días.
 *
 * · CON EL CONSUMO CONGELADO. El motor devuelve lo que dicen `cantidadStock` y los
 *   componentes. Una línea vieja sin ese dato tendría que reconstruirse, y el motor
 *   la saltearía en silencio: la mercadería no volvería. Se pregunta con
 *   `reconstruirConsumoOriginal`, que es lo que usa la corrección completa para
 *   revertir, así que lo que se acepta acá es exactamente lo que ella revierte
 *   sin inferir nada.
 *
 * El motivo no entra acá: el botón se ofrece antes de que alguien lo escriba. Lo
 * valida `validarMotivoAnulacion`.
 *
 * @param {object|null} venta { id, anuladaEn, turnoId, turno, transferencia, detalles }
 * @param {object} [opciones]
 * @param {boolean} [opciones.puedeTurnoCerrado]  permiso `ventas.corregir_turno_cerrado`
 * @returns {{ puede: true, codigo, turnoId, turnoCerrado } | { puede: false, codigo, error }}
 */
export function veredictoAnulacionVentaComun(venta, { puedeTurnoCerrado = false } = {}) {
  const no = (codigo, error) => ({ puede: false, codigo, error });

  if (!venta || !Number.isInteger(Number(venta.id)) || Number(venta.id) <= 0) {
    return no(CODIGOS_ANULAR.VENTA_AUSENTE, "No se encontró la venta.");
  }
  if (venta.anuladaEn != null) {
    return no(
      CODIGOS_ANULAR.YA_ANULADA,
      "Esta venta ya está anulada. Anularla de nuevo devolvería el stock dos veces."
    );
  }
  if (venta.transferencia) {
    return no(
      CODIGOS_ANULAR.CON_REMITO,
      `Esta venta generó el remito #${venta.transferencia.id}. Se anula cancelando el remito desde Transferencias.`
    );
  }

  if (!venta.turnoId || !venta.turno) {
    return no(CODIGOS_ANULAR.SIN_TURNO, "Esta venta no tiene un turno donde reflejar la anulación.");
  }
  const estado = estadoDelTurno(venta.turno);
  if (estado === ESTADO_TURNO.CIERRE_EN_PREPARACION) {
    return no(
      CODIGOS_ANULAR.TURNO_EN_CIERRE,
      "El turno de esta venta tomó el corte de cierre y todavía no se confirmó. Confirmá o cancelá el cierre y volvé a intentar."
    );
  }
  if (estado === ESTADO_TURNO.ANULADO) {
    return no(CODIGOS_ANULAR.TURNO_ANULADO, "El turno de esta venta está anulado.");
  }
  const turnoCerrado = estado === ESTADO_TURNO.CERRADO;
  if (turnoCerrado && !puedeTurnoCerrado) {
    return no(
      CODIGOS_ANULAR.SIN_PERMISO_TURNO_CERRADO,
      "El turno de esta venta ya está cerrado. Hace falta el permiso para corregir ventas con turno cerrado."
    );
  }

  const sinCongelar = (venta.detalles || []).find((d) => {
    const r = reconstruirConsumoOriginal(d);
    return r.ambigua || !["SERVICIO", "COMBO", "CONGELADO"].includes(r.reconstruccion);
  });
  if (sinCongelar) {
    return no(
      CODIGOS_ANULAR.CONSUMO_NO_CONGELADO,
      `La línea "${sinCongelar.nombre}" no guardó cuánto stock descontó, así que anular no sabría cuánto devolver. ` +
        "Usá Corregir venta."
    );
  }

  return { puede: true, codigo: CODIGOS_ANULAR.OK, turnoId: venta.turnoId, turnoCerrado };
}

/** El motivo es obligatorio y no puede quedar vacío; no hay mínimo inventado. */
export function validarMotivoAnulacion(motivo) {
  const texto = typeof motivo === "string" ? motivo.trim() : "";
  if (!texto) {
    return {
      ok: false,
      codigo: CODIGOS_ANULAR.MOTIVO_AUSENTE,
      error: "Escribí por qué se anula. Una venta anulada sin motivo es indistinguible dentro de un mes de un error de datos.",
    };
  }
  return { ok: true, motivo: texto };
}

/**
 * Lo que hay que devolverle al stock: todo lo que la venta consumió.
 *
 * Una línea consume por sus COMPONENTES si es un combo, y por sí misma si no.
 * `cantidadStock` es la cantidad en escala física; `null` marca una línea que no
 * mueve stock —un servicio— y ésas no aportan nada.
 */
export function deltaDeDevolucion(detalles = []) {
  const porProducto = new Map();
  const sumar = (productoLocalId, cantidad) => {
    if (!productoLocalId) return;
    const c = Number(cantidad);
    if (!Number.isFinite(c) || c === 0) return;
    porProducto.set(productoLocalId, (porProducto.get(productoLocalId) || 0) + c);
  };

  for (const d of detalles) {
    const comps = d.componentes || [];
    if (comps.length > 0) {
      for (const c of comps) sumar(c.productoLocalId, c.cantidad);
      continue;
    }
    sumar(d.productoLocalId, d.cantidadStock);
  }

  // `delta` es lo que se SUMA al stock: devolver lo consumido es positivo.
  return [...porProducto.entries()].map(([productoLocalId, cantidad]) => ({
    productoLocalId,
    delta: cantidad,
  }));
}

/**
 * El efecto de la anulación sobre el arqueo, para poder DECIRLO antes de hacerlo.
 *
 * Anular una venta que hoy cuenta para el arqueo BAJA el esperado del turno donde
 * cae. Anular una venta interna —que no cuenta, porque tiene remito— no lo mueve.
 * Las dos cosas se ven iguales desde la pantalla y la diferencia es de cientos de
 * miles de pesos.
 */
export function impactoEnArqueo(venta) {
  const pagos = venta?.pagos || [];
  const contaba = venta?.transferencia == null && venta?.anuladaEn == null;
  const medios = pagos.map((p) => ({ medio: p.medio, monto: Number(p.monto) || 0 }));
  const total = medios.reduce((a, m) => a + m.monto, 0);
  // El esperado de la caja es de EFECTIVO: lo que se cobró con tarjeta no está
  // en el cajón. Se separa con `desglosarVentas`, la función con la que el
  // cierre armó ese esperado, no con una cuenta propia.
  const { efectivoCentavos } = contaba ? desglosarVentas([venta]) : { efectivoCentavos: 0 };
  return {
    contabaEnArqueo: contaba,
    deltaEsperado: contaba ? -total : 0,
    deltaEfectivo: efectivoCentavos === 0 ? 0 : -desdeCentavos(efectivoCentavos),
    medios: contaba ? medios : [],
  };
}

/**
 * CÓMO QUEDA EL CIERRE DEL TURNO ORIGINAL si se anula una venta suya, cuando ese
 * turno ya está CERRADO.
 *
 * Decisión de Emanuel del 2026-10-10: el ajuste va en el turno de la venta,
 * aunque esté cerrado, y en ningún otro. Su efectivo esperado baja por lo que la
 * venta cobró en efectivo y la diferencia de su cierre se recalcula con eso. Lo
 * que el operador CONTÓ no se toca: es un hecho físico, y es justamente contra lo
 * que se mide el esperado corregido.
 *
 * El esperado del cierre vive copiado en tres filas, y las tres se corrigen
 * juntas o las pantallas se contradicen (es lo que enseñó el error ×1000, ver
 * `lib/caja/correcciones/plan.js`): el turno, el corte confirmado y el arqueo
 * FINAL. Las cuentas derivadas salen de las MISMAS funciones con las que el
 * cierre las hizo —`calcularRetiroEsperado`, `calcularCierreDesdeRetiro`,
 * `calcularCierreDesdeConteo`, `calcularDiferencia`—; acá no hay fórmula de caja.
 *
 * Puro: recibe las filas leídas (con el turno ya bloqueado por el llamador) y
 * devuelve el antes y el después de cada campo que cambia. Eso mismo es el rastro.
 *
 * @param {object} args
 * @param {object} args.venta         con `turnoId` y `pagos`
 * @param {object} args.turno         la fila del turno ORIGINAL
 * @param {object|null} args.corte    su CierrePreparacion CONFIRMADO, si lo hay
 * @param {object|null} args.arqueoFinal  su ArqueoCaja FINAL, si lo hay
 * @returns {{ ok: true, turnoId, efectivoAnulado, filas: Array<{entidad,id,antes,despues}> }
 *          | { ok: false, error }}
 */
export function ajusteDelCierrePorAnulacion({ venta, turno, corte = null, arqueoFinal = null }) {
  if (!turno || !venta || Number(turno.id) !== Number(venta.turnoId)) {
    return { ok: false, error: "El cierre a ajustar no es el del turno de la venta." };
  }
  if (estadoDelTurno(turno) !== ESTADO_TURNO.CERRADO) {
    return { ok: false, error: "El turno de la venta no está cerrado: no hay cierre que ajustar." };
  }
  if (corte && (Number(corte.turnoId) !== Number(turno.id) || corte.estado !== ESTADO_CIERRE.CONFIRMADO)) {
    return { ok: false, error: "El corte no es el confirmado del turno de la venta." };
  }
  if (arqueoFinal && (Number(arqueoFinal.turnoId) !== Number(turno.id) || arqueoFinal.tipo !== "FINAL")) {
    return { ok: false, error: "El arqueo no es el FINAL del turno de la venta." };
  }

  const { efectivoCentavos, digitalCentavos } = desglosarVentas([venta]);
  const menosEfectivo = (v) => (v == null ? null : desdeCentavos(aCentavos(v) - efectivoCentavos));
  const num = (v) => (v == null ? null : Number(v));
  const filas = [];
  const fila = (entidad, id, antes, despues) => {
    const cambian = Object.keys(despues).filter((k) => aCentavos(antes[k]) !== aCentavos(despues[k]) || (antes[k] == null) !== (despues[k] == null));
    if (cambian.length === 0) return;
    filas.push({
      entidad,
      id,
      antes: Object.fromEntries(cambian.map((k) => [k, antes[k]])),
      despues: Object.fromEntries(cambian.map((k) => [k, despues[k]])),
    });
  };

  // ── El turno ─────────────────────────────────────────────────────────────
  let cierre;
  {
    const antes = {
      montoEsperadoEfectivo: num(turno.montoEsperadoEfectivo),
      diferenciaEfectivo: num(turno.diferenciaEfectivo),
      totalVentasEfectivo: num(turno.totalVentasEfectivo),
      totalVentasDigital: num(turno.totalVentasDigital),
      cantidadVentas: num(turno.cantidadVentas),
    };
    const esperado = menosEfectivo(antes.montoEsperadoEfectivo);
    // Cerrado sin conteo: no hubo contado, la diferencia sigue sin existir.
    const diferencia =
      turno.montoRealEfectivo != null && esperado != null
        ? calcularDiferencia(turno.montoRealEfectivo, esperado)
        : antes.diferenciaEfectivo;
    cierre = {
      esperadoAntes: antes.montoEsperadoEfectivo,
      esperadoDespues: esperado,
      contado: num(turno.montoRealEfectivo),
      diferenciaAntes: antes.diferenciaEfectivo,
      diferenciaDespues: diferencia,
    };
    fila("Turno", turno.id, antes, {
      montoEsperadoEfectivo: esperado,
      diferenciaEfectivo: diferencia,
      totalVentasEfectivo: menosEfectivo(antes.totalVentasEfectivo),
      totalVentasDigital:
        antes.totalVentasDigital == null ? null : desdeCentavos(aCentavos(antes.totalVentasDigital) - digitalCentavos),
      cantidadVentas: antes.cantidadVentas == null ? null : Math.max(0, antes.cantidadVentas - 1),
    });
  }

  // ── El corte confirmado ──────────────────────────────────────────────────
  if (corte) {
    const antes = {
      efectivoEsperadoCorte: num(corte.efectivoEsperadoCorte),
      efectivoRetiradoEsperado: num(corte.efectivoRetiradoEsperado),
      diferencia: num(corte.diferencia),
      cantidadVentasCorte: num(corte.cantidadVentasCorte),
    };
    const esperadoCorte = menosEfectivo(antes.efectivoEsperadoCorte);
    const despues = {
      efectivoEsperadoCorte: esperadoCorte,
      efectivoRetiradoEsperado: antes.efectivoRetiradoEsperado,
      diferencia: antes.diferencia,
      cantidadVentasCorte: antes.cantidadVentasCorte == null ? null : Math.max(0, antes.cantidadVentasCorte - 1),
    };
    if (antes.efectivoRetiradoEsperado != null) {
      // Orden actual: el cambio se separó antes y se contó solo el retiro.
      despues.efectivoRetiradoEsperado = calcularRetiroEsperado({
        efectivoEsperadoCorte: esperadoCorte,
        totalCambio: corte.totalCambio,
      });
      if (corte.totalRetiroContado != null) {
        despues.diferencia = calcularCierreDesdeRetiro({
          totalRetiroContado: corte.totalRetiroContado,
          totalCambio: corte.totalCambio,
          efectivoRetiradoEsperado: despues.efectivoRetiradoEsperado,
        }).diferencia;
      }
    } else if (corte.totalContado != null) {
      // Orden anterior: se contó todo el cajón.
      despues.diferencia = calcularCierreDesdeConteo({
        totalContado: corte.totalContado,
        totalCambio: corte.totalCambio ?? 0,
        efectivoEsperadoCorte: esperadoCorte,
      }).diferencia;
    }
    fila("CierrePreparacion", corte.id, antes, despues);
  }

  // ── El arqueo FINAL ──────────────────────────────────────────────────────
  if (arqueoFinal) {
    const antes = { efectivoEsperado: num(arqueoFinal.efectivoEsperado), diferencia: num(arqueoFinal.diferencia) };
    const esperado = menosEfectivo(antes.efectivoEsperado);
    fila("ArqueoCaja", arqueoFinal.id, antes, {
      efectivoEsperado: esperado,
      diferencia: calcularDiferencia(arqueoFinal.efectivoContado, esperado),
    });
  }

  return { ok: true, turnoId: turno.id, efectivoAnulado: desdeCentavos(efectivoCentavos), cierre, filas };
}

/**
 * Revierte una venta dentro de una transacción abierta.
 *
 * @param {object} tx            transacción de Prisma, YA abierta por el llamador
 * @param {object} args
 * @param {object} args.venta    la venta con detalles, pagos y turno
 * @param {number} args.grupoId
 * @param {number|null} args.usuarioId  quién revierte
 * @param {string} args.motivo
 * @param {object|null} [args.ajusteCierre]  lo que devuelve `ajusteDelCierrePorAnulacion`
 *   cuando el turno de la venta está cerrado. Lo arma el llamador con el turno ya
 *   bloqueado; el motor lo escribe y lo deja en el rastro.
 * @param {string} [args.origen="anulacion"]  de dónde vino la orden, para el rastro
 * @returns {Promise<object>} resumen de lo revertido
 * @throws {Error} VERSION_DESACTUALIZADA si otra corrección movió la venta
 */
export async function revertirVenta(
  tx,
  {
    venta,
    grupoId,
    usuarioId = null,
    motivo,
    ajusteCierre = null,
    versionEsperada,
    origen = "anulacion",
  }
) {
  const arqueo = impactoEnArqueo(venta);
  const delta = deltaDeDevolucion(venta.detalles);
  const turnoOriginalCerrado = venta.turno ? estadoDelTurno(venta.turno) === ESTADO_TURNO.CERRADO : false;

  // ── EL TURNO DEL AJUSTE ES EL DE LA VENTA, Y NINGÚN OTRO ────────────────────
  //
  // Hasta el 2026-10-10 este motor recibía un `turnoDestinoId`: "el turno abierto
  // AHORA, donde cae la diferencia". Ese criterio quedó descartado por Emanuel:
  // la anulación se refleja en el turno ORIGINAL, aunque esté cerrado. Por eso el
  // parámetro no existe más y el turno sale de la venta misma — no hay forma de
  // pedirle al motor que impute en otra caja.
  //
  // Una venta que no contaba para el arqueo —con remito— no tiene ajuste que
  // imputar en ningún lado, y ahí queda null.
  const turnoDelAjuste = arqueo.contabaEnArqueo ? venta.turnoId ?? null : null;
  if (ajusteCierre && (!arqueo.contabaEnArqueo || Number(ajusteCierre.turnoId) !== Number(venta.turnoId))) {
    throw new Error("AJUSTE_FUERA_DEL_TURNO_ORIGINAL");
  }
  if (turnoOriginalCerrado && arqueo.contabaEnArqueo && !ajusteCierre) {
    // Anular sin corregir el cierre dejaría el turno diciendo un esperado que ya
    // no es, con el faltante que la anulación vino a explicar.
    throw new Error("FALTA_AJUSTE_DEL_CIERRE");
  }

  // ── EL ORDEN: MARCA, RASTRO, Y RECIÉN DESPUÉS EL STOCK ──────────────────────
  //
  // El Libro de Stock anota la devolución con el documento que la explica, que
  // es el registro de esta anulación: tiene que existir antes de tocar el stock.
  // Antes el stock iba primero. Nada del registro depende de la escritura de
  // stock —el delta se calcula de las líneas—, y todo sigue en la transacción
  // del llamador. Marcar primero además hace que una segunda anulación
  // concurrente se detenga en el bloqueo optimista antes de tocar el stock.

  // ── 1 · Marcar la venta ────────────────────────────────────────────────────
  //
  // Con bloqueo optimista Y con `anuladaEn: null` en el where: sin esa segunda
  // condición, dos anulaciones concurrentes devolverían el stock dos veces.
  const versionBase = Number.isFinite(versionEsperada) ? versionEsperada : venta.version;
  const upd = await tx.venta.updateMany({
    where: { id: venta.id, version: versionBase, anuladaEn: null },
    data: {
      anuladaEn: new Date(),
      anuladaPorId: usuarioId,
      motivoAnulacion: motivo,
      version: { increment: 1 },
    },
  });
  if (upd.count === 0) throw new Error("VERSION_DESACTUALIZADA");

  // ── 2 · El rastro ──────────────────────────────────────────────────────────
  const correccion = await tx.ventaCorreccion.create({
    data: {
      ventaId: venta.id,
      tipo: "ANULACION",
      motivo,
      usuarioId,
      operadorId: venta.operadorId ?? null,
      localId: venta.localId,
      grupoId: grupoId ?? null,
      turnoIdOriginal: venta.turnoId ?? null,
      // El MISMO turno que el original, o null si no hubo nada que imputar.
      turnoIdCorreccion: turnoDelAjuste,
      turnoCerrado: turnoOriginalCerrado,
      versionAntes: versionBase,
      versionDespues: versionBase + 1,
      totalAnterior: venta.total,
      totalNuevo: 0,
      diferencia: Number(venta.total) * -1,
      snapshotAntes: {
        origenDeLaOrden: origen,
        total: String(venta.total),
        clienteId: venta.clienteId,
        esFiado: venta.esFiado,
        pagos: (venta.pagos || []).map((p) => ({ medio: p.medio, monto: String(p.monto) })),
        transferenciaId: venta.transferencia?.id ?? null,
      },
      snapshotDespues: { anulada: true, motivo },
      diffProductos: (venta.detalles || []).map((d) => ({
        nombre: d.nombre,
        productoLocalId: d.productoLocalId,
        cantidadAntes: d.cantidadStock,
        cantidadDespues: 0,
      })),
      diffPagos: (venta.pagos || []).map((p) => ({
        medio: p.medio,
        montoAntes: String(p.monto),
        montoDespues: "0",
      })),
      impactoStock: delta,
      // EL RASTRO DEL TURNO CERRADO: cada campo del cierre que cambió, con su
      // valor anterior. Junto con la venta, el autor, la fecha y el motivo de
      // esta misma fila, es lo que contesta qué le pasó a ese turno y por qué.
      impactoCaja: ajusteCierre
        ? { ...arqueo, cierreDelTurnoOriginal: { turnoId: ajusteCierre.turnoId, ...ajusteCierre.cierre, filas: ajusteCierre.filas } }
        : arqueo,
    },
  });

  // ── 2b · El cierre del turno original, si estaba cerrado ───────────────────
  //
  // Solo los campos del plan, y solo en filas del turno de la venta. Lo contado
  // (`montoRealEfectivo`, `efectivoContado`, los conteos del corte) no está en
  // el plan: no se escribe.
  if (ajusteCierre) {
    const modelo = { Turno: tx.turno, CierrePreparacion: tx.cierrePreparacion, ArqueoCaja: tx.arqueoCaja };
    for (const f of ajusteCierre.filas) {
      if (f.entidad === "Turno" && Number(f.id) !== Number(venta.turnoId)) {
        throw new Error("AJUSTE_FUERA_DEL_TURNO_ORIGINAL");
      }
      if (!modelo[f.entidad]) throw new Error(`AJUSTE_CON_ENTIDAD_DESCONOCIDA: ${f.entidad}`);
      await modelo[f.entidad].update({ where: { id: f.id }, data: f.despues });
    }
  }

  // ── 3 · El stock de la venta, a nombre de la anulación ─────────────────────
  //
  // Se declara acá aunque el llamador haya declarado otro origen antes: la
  // cancelación de una transferencia de venta interna libera el tránsito como
  // TRANSFERENCIA_CANCELACION y después llama a esto en la misma transacción.
  await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.ANULACION_VENTA, referencia: String(correccion.id) });
  await aplicarDeltaStock(tx, venta.localId, delta);

  // ── 4 · Cuenta corriente y puntos ──────────────────────────────────────────
  //
  // Las mismas funciones de la corrección completa, con "el después es nada":
  // solo emiten la reversa. Van DESPUÉS del registro porque las dos necesitan su
  // id para poder distinguir sus movimientos.
  const movimientosCC = await ajustarCuentaCorriente(tx, {
    correccionId: correccion.id,
    grupoId,
    localId: venta.localId,
    ventaId: venta.id,
    numero: venta.numero,
    userId: usuarioId,
    esFiadoAntes: venta.esFiado === true,
    esFiadoDespues: false,
    clienteAntes: venta.clienteId,
    clienteDespues: null,
    totalAnterior: venta.total,
    totalNuevo: 0,
  });

  const puntos = await ajustarPuntosCorreccion(tx, {
    correccionId: correccion.id,
    grupoId,
    localId: venta.localId,
    ventaId: venta.id,
    numero: venta.numero,
    userId: usuarioId,
    clienteAntes: venta.clienteId,
    clienteDespues: null,
    puntosOriginal: null,
    puntosNuevo: 0,
  });

  return {
    correccionId: correccion.id,
    productosDevueltos: delta.length,
    movimientosCuenta: movimientosCC.length,
    movimientosPuntos: (puntos?.movimientos || []).length,
    arqueo,
    cierreDelTurnoOriginal: ajusteCierre ? { turnoId: ajusteCierre.turnoId, ...ajusteCierre.cierre } : null,
  };
}

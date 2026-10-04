// lib/tesoreria/verificacionEfectivoLectura.js
//
// LEER VERIFICACIONES DE EFECTIVO: la forma en que se devuelven y la consulta de
// las vigentes que cubren unos movimientos. Sin escribir y sin importar el
// cliente de Prisma: lo usan la lectura de Tesorería, las acciones
// (verificacionEfectivoServer.js) y la corrección histórica de caja.

import { aCentavos } from "../caja/efectivoEsperado.js";
import { huellaDeVerificacion } from "./verificacionEfectivo.js";

export const SELECT_VERIFICACION = Object.freeze({
  id: true,
  localId: true,
  importeDeclarado: true,
  importeVerificado: true,
  diferencia: true,
  estado: true,
  vigente: true,
  verificadaPorUsuarioId: true,
  verificadaPorOperadorId: true,
  verificadaEn: true,
  observacion: true,
  idempotencyKey: true,
  anuladaEn: true,
  anuladaPorUsuarioId: true,
  motivoAnulacion: true,
  entregas: {
    orderBy: { cajaMovimientoId: "asc" },
    select: {
      cajaMovimientoId: true,
      vigente: true,
      montoDeclaradoSnapshot: true,
      localIdSnapshot: true,
      turnoIdSnapshot: true,
      operadorIdSnapshot: true,
      claseSnapshot: true,
      instanteEntregaSnapshot: true,
    },
  },
});

/** El contenido de lo que ya está guardado, en la misma forma que un pedido. */
export function contenidoGuardado(v) {
  return {
    cajaMovimientoIds: v.entregas.map((e) => e.cajaMovimientoId),
    importeVerificadoCentavos: aCentavos(v.importeVerificado),
    observacion: v.observacion,
  };
}

/**
 * Una verificación como la devuelven las acciones y la lectura. Los importes y
 * la diferencia son del ACTO entero: no se reparten entre sus entregas.
 * `correcta` es diferencia cero —"Correcto" no es otro tipo de verificación—.
 */
export function formatoDeVerificacion(v) {
  const diferencia = Number(v.diferencia);
  return {
    id: v.id,
    localId: v.localId,
    estado: v.estado,
    vigente: v.vigente,
    importeDeclarado: Number(v.importeDeclarado),
    importeVerificado: Number(v.importeVerificado),
    diferencia,
    correcta: aCentavos(diferencia) === 0,
    verificadaEn: v.verificadaEn,
    verificadaPorUsuarioId: v.verificadaPorUsuarioId,
    verificadaPorOperadorId: v.verificadaPorOperadorId,
    observacion: v.observacion,
    idempotencyKey: v.idempotencyKey,
    anuladaEn: v.anuladaEn,
    anuladaPorUsuarioId: v.anuladaPorUsuarioId,
    motivoAnulacion: v.motivoAnulacion,
    entregas: v.entregas.map((e) => ({
      cajaMovimientoId: e.cajaMovimientoId,
      clase: e.claseSnapshot,
      montoDeclarado: Number(e.montoDeclaradoSnapshot),
      turnoId: e.turnoIdSnapshot,
      localId: e.localIdSnapshot,
      operadorId: e.operadorIdSnapshot,
      instante: e.instanteEntregaSnapshot,
    })),
    huella: huellaDeVerificacion(contenidoGuardado(v)),
  };
}

/**
 * Las verificaciones VIGENTES que cubren alguno de estos movimientos, con todas
 * sus fotos —también las de movimientos que no se pidieron—. Una consulta.
 */
export function verificacionesVigentesDe(db, cajaMovimientoIds) {
  if (!cajaMovimientoIds?.length) return Promise.resolve([]);
  return db.verificacionEfectivo.findMany({
    where: { vigente: true, entregas: { some: { cajaMovimientoId: { in: cajaMovimientoIds } } } },
    orderBy: { id: "asc" },
    select: SELECT_VERIFICACION,
  });
}

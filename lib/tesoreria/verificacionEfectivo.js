// lib/tesoreria/verificacionEfectivo.js
//
// EL MODELO DE LA VERIFICACIÓN DE EFECTIVO, SIN ESCRIBIR NADA.
//
// Arma los datos de una verificación a partir de las ENTREGAS que devuelve la
// lectura canónica (lecturaTesoreria.js) y de lo que contó el responsable, y de
// una anulación. No es un CRUD: no hay "editar el verificado". La única forma de
// corregir es anular y verificar de nuevo, y eso es lo que estas funciones dejan
// expresar. Quién escribe —con qué permiso, con qué transacción— es de la PR que
// implemente las acciones.
//
// La base no confía en esto: lo vuelve a comprobar todo
// (prisma/migrations/20261004120000_verificacion_efectivo). Estas funciones
// existen para que el que escriba no tenga que reconstruir las reglas, y para que
// un error se diga con palabras antes de llegar a un CHECK.

import { createHash } from "node:crypto";
import { aCentavos } from "../caja/efectivoEsperado.js";
import { validarIdempotencyKey } from "../caja/retiroDinero.js";
import { idPositivo } from "../pos-ventas/cobroOffline.js";
import { jsonCanonico } from "../pos-ventas/intentoCobro.js";
import { CLASES_DE_ENTREGA } from "./lecturaTesoreria.js";

export const ESTADO_VERIFICACION = Object.freeze({ VIGENTE: "VIGENTE", ANULADA: "ANULADA" });

export class ErrorVerificacionEfectivo extends Error {}

/** Centavos enteros a texto decimal exacto, para no pasar por flotante. */
const comoDecimal = (centavos) => {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

/**
 * Los datos de una verificación nueva y de sus entregas.
 *
 * @param {object} a
 * @param {number} a.localId
 * @param {Array<{cajaMovimientoId:number, clase:string, montoDeclarado:number,
 *   instante:Date, turnoId:number, operadorId:number|null}>} a.entregas
 *   las entregas TAL COMO las devuelve la lectura canónica
 * @param {number|string} a.importeVerificado  lo que contó el responsable
 * @param {number} a.verificadaPorUsuarioId
 * @param {number|null} [a.verificadaPorOperadorId]  evidencia de PIN, si la hubo
 * @param {string|null} [a.observacion]
 * @param {string} a.idempotencyKey
 * @returns {{verificacion: object, entregas: object[]}}
 *   `verificacion` para `verificacionEfectivo.create`; `entregas` para
 *   `verificacionEfectivoEntrega.createMany`, sin `verificacionEfectivoId`.
 */
export function armarVerificacionEfectivo({
  localId,
  entregas,
  importeVerificado,
  verificadaPorUsuarioId,
  verificadaPorOperadorId = null,
  observacion = null,
  idempotencyKey,
} = {}) {
  if (!Number.isInteger(localId) || localId <= 0) throw new ErrorVerificacionEfectivo("Falta el local.");
  if (!Number.isInteger(verificadaPorUsuarioId) || verificadaPorUsuarioId <= 0) {
    throw new ErrorVerificacionEfectivo("Falta quién verifica.");
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    throw new ErrorVerificacionEfectivo("Falta la clave de idempotencia.");
  }
  if (!Array.isArray(entregas) || entregas.length === 0) {
    throw new ErrorVerificacionEfectivo("Una verificación cubre al menos una entrega.");
  }
  const vistos = new Set();
  let declarado = 0;
  const filas = entregas.map((e) => {
    if (!CLASES_DE_ENTREGA.includes(e?.clase)) {
      throw new ErrorVerificacionEfectivo(`El movimiento ${e?.cajaMovimientoId} no es una entrega de efectivo.`);
    }
    if (vistos.has(e.cajaMovimientoId)) {
      throw new ErrorVerificacionEfectivo(`La entrega ${e.cajaMovimientoId} está dos veces.`);
    }
    vistos.add(e.cajaMovimientoId);
    const monto = aCentavos(e.montoDeclarado);
    if (!(monto > 0)) throw new ErrorVerificacionEfectivo(`La entrega ${e.cajaMovimientoId} no tiene importe.`);
    declarado += monto;
    return {
      cajaMovimientoId: e.cajaMovimientoId,
      montoDeclaradoSnapshot: comoDecimal(monto),
      // El local de la foto es el de la verificación: la base rechaza mezclar.
      localIdSnapshot: localId,
      turnoIdSnapshot: e.turnoId,
      operadorIdSnapshot: e.operadorId ?? null,
      claseSnapshot: e.clase,
      instanteEntregaSnapshot: new Date(e.instante),
    };
  });

  // Sin contar no es contar cero: `Number(null)` y `Number("")` dan 0, y un
  // verificado de $0 es un faltante de todo el sobre.
  const verificado = aCentavos(importeVerificado);
  if (importeVerificado == null || importeVerificado === "" || !Number.isFinite(Number(importeVerificado)) || verificado < 0) {
    throw new ErrorVerificacionEfectivo("El importe contado no es válido.");
  }

  return {
    verificacion: {
      localId,
      importeDeclarado: comoDecimal(declarado),
      importeVerificado: comoDecimal(verificado),
      diferencia: comoDecimal(verificado - declarado),
      verificadaPorUsuarioId,
      verificadaPorOperadorId,
      observacion: observacion?.trim() || null,
      idempotencyKey: idempotencyKey.trim(),
    },
    entregas: filas,
  };
}

/**
 * Los datos de una anulación. Es la ÚNICA modificación que admite una
 * verificación, y es final.
 */
export function datosDeAnulacion({ anuladaPorUsuarioId, motivo, ahora = new Date() } = {}) {
  if (!Number.isInteger(anuladaPorUsuarioId) || anuladaPorUsuarioId <= 0) {
    throw new ErrorVerificacionEfectivo("Falta quién anula.");
  }
  if (typeof motivo !== "string" || !motivo.trim()) {
    throw new ErrorVerificacionEfectivo("Anular una verificación exige un motivo.");
  }
  return {
    estado: ESTADO_VERIFICACION.ANULADA,
    vigente: false,
    anuladaEn: ahora,
    anuladaPorUsuarioId,
    motivoAnulacion: motivo.trim(),
  };
}

/**
 * Si el movimiento cambió después de verificarlo. Compara, no recalcula: la
 * verificación sigue diciendo lo que se verificó.
 */
export function entregaDesactualizada(montoDeclaradoSnapshot, montoActual) {
  return aCentavos(montoDeclaradoSnapshot) !== aCentavos(montoActual);
}

// ── EL PEDIDO DE VERIFICAR, Y SU HUELLA ─────────────────────────────────────

/**
 * Lee el cuerpo de `POST …/verificaciones`. Acepta SOLO lo que el cliente puede
 * decidir: qué entregas, cuánto contó, la clave y una observación. El declarado,
 * la diferencia, la clase, el local y las fotos los decide el servidor, y un
 * cuerpo que los traiga se rechaza: si no, el cliente creería que los mandó.
 *
 * Los ids se ORDENAN: el mismo intento con las entregas en otro orden es el
 * mismo intento.
 *
 * @returns {{pedido: object} | {error: string, campo?: string}}
 */
export function leerPedidoDeVerificacion(cuerpo) {
  const c = cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) ? cuerpo : {};
  const ajenos = CAMPOS_QUE_DECIDE_EL_SERVIDOR.filter((k) => Object.prototype.hasOwnProperty.call(c, k));
  if (ajenos.length) {
    return { error: `Esos datos los calcula el servidor y no se aceptan: ${ajenos.join(", ")}.`, campo: ajenos[0] };
  }
  if (!Array.isArray(c.cajaMovimientoIds) || c.cajaMovimientoIds.length === 0) {
    return { error: "Elegí al menos una entrega para verificar.", campo: "cajaMovimientoIds" };
  }
  const ids = c.cajaMovimientoIds.map(idPositivo);
  if (ids.some((x) => x == null)) return { error: "Una de las entregas no es un id válido.", campo: "cajaMovimientoIds" };
  const ordenados = [...ids].sort((a, b) => a - b);
  if (new Set(ordenados).size !== ordenados.length) {
    return { error: "Una entrega está dos veces en el pedido.", campo: "cajaMovimientoIds" };
  }
  const v = c.importeVerificado;
  const numero = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(numero) || numero < 0) {
    return { error: "El importe contado no es válido.", campo: "importeVerificado" };
  }
  if (Math.abs(numero * 100 - Math.round(numero * 100)) > 1e-6) {
    return { error: "El importe contado tiene más de dos decimales.", campo: "importeVerificado" };
  }
  const clave = validarIdempotencyKey(c.idempotencyKey, { de: "de la verificación" });
  if (!clave.valido) return { error: clave.error, campo: "idempotencyKey" };
  if (c.observacion != null && typeof c.observacion !== "string") {
    return { error: "La observación tiene que ser texto.", campo: "observacion" };
  }
  const observacion = c.observacion?.trim() || null;
  if (observacion && observacion.length > 500) return { error: "La observación es demasiado larga.", campo: "observacion" };
  return {
    pedido: {
      cajaMovimientoIds: ordenados,
      importeVerificadoCentavos: Math.round(numero * 100),
      idempotencyKey: clave.clave,
      observacion,
    },
  };
}

/** Lo que el cliente no decide. Si viene en el cuerpo, el pedido se rechaza. */
export const CAMPOS_QUE_DECIDE_EL_SERVIDOR = Object.freeze([
  "localId",
  "importeDeclarado",
  "diferencia",
  "clase",
  "claseSnapshot",
  "montoDeclaradoSnapshot",
  "turnoIdSnapshot",
  "operadorIdSnapshot",
  "localIdSnapshot",
  "instanteEntregaSnapshot",
  "entregas",
  "verificadaPorUsuarioId",
  "verificadaPorOperadorId",
]);

/**
 * El CONTENIDO de un intento, en forma canónica: qué entregas, cuánto se contó
 * y qué se observó. Es lo que dos envíos con la misma clave tienen que compartir
 * para ser el mismo intento. Se arma igual desde un pedido que desde lo
 * guardado, así que no hace falta una columna: lo guardado ES el contenido.
 */
export function contenidoDeVerificacion({ cajaMovimientoIds, importeVerificadoCentavos, observacion }) {
  return {
    cajaMovimientoIds: [...cajaMovimientoIds].map(Number).sort((a, b) => a - b),
    importeVerificadoCentavos: Number(importeVerificadoCentavos),
    observacion: observacion?.trim() || null,
  };
}

/** SHA-256 del contenido canónico. Se informa; no se guarda. */
export function huellaDeVerificacion(contenido) {
  return createHash("sha256").update(jsonCanonico(contenidoDeVerificacion(contenido))).digest("hex");
}

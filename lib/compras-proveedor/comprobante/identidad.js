// lib/compras-proveedor/comprobante/identidad.js
//
// LA IDENTIDAD DE UN COMPROBANTE, Y EL CUIT.
//
// Módulo puro: sin Prisma, sin React. La unicidad de verdad la garantiza el
// índice parcial de la migración —dos subidas simultáneas se le escapan a
// cualquier chequeo en código—; lo de acá es para poder decir POR QUÉ se
// rechazó, y para normalizar antes de comparar.

/**
 * Normaliza un punto de venta o un número de comprobante para compararlos.
 *
 * El mismo comprobante se escribe de muchas formas: "0011" y "11", "00794708" y
 * "794708", con guiones o sin ellos. Si no se normaliza, la misma factura entra
 * dos veces y el índice único no la ve, porque para la base son cadenas
 * distintas.
 *
 * Se conservan solo los dígitos y se quitan los ceros de la izquierda. Se
 * guarda la forma normalizada, no la tipeada: la original queda en la imagen.
 */
export function normalizarNumero(valor) {
  const soloDigitos = String(valor ?? "").replace(/\D/g, "");
  if (!soloDigitos) return "";
  const sinCeros = soloDigitos.replace(/^0+/, "");
  // Un número que era todo ceros es "0", no cadena vacía: son cosas distintas.
  return sinCeros === "" ? "0" : sinCeros;
}

/**
 * La clave de identidad de un comprobante: proveedor, punto de venta y número.
 *
 * El TIPO no entra a propósito. Una A y una B con el mismo punto de venta y
 * número son, en la práctica, un error de carga y no dos comprobantes: la
 * numeración es por tipo pero el que carga se equivoca de tipo, no de número.
 * Dejarlo afuera hace que ese error se detecte en vez de duplicar.
 */
export function claveIdentidad({ proveedorId, puntoVenta, numero } = {}) {
  const p = Number(proveedorId);
  if (!Number.isFinite(p) || p <= 0) return null;
  const pv = normalizarNumero(puntoVenta);
  const nro = normalizarNumero(numero);
  if (!pv || !nro) return null;
  return `${p}|${pv}|${nro}`;
}

export const MOTIVO_RECHAZO = Object.freeze({
  SIN_IDENTIDAD: "Falta el proveedor, el punto de venta o el número: sin eso no se puede saber si ya está cargado.",
  DUPLICADO: "Este comprobante ya está cargado para este proveedor.",
  DUPLICADO_ARCHIVO: "Este archivo ya se subió: es idéntico byte por byte a uno que ya está cargado.",
});

/**
 * ¿Se acepta este comprobante, o choca con uno que ya está?
 *
 * `existentes` son los comprobantes ya cargados de ese proveedor, cada uno con
 * su `{ id, puntoVenta, numero, estado, archivoHash }`.
 *
 * Los ANULADO no cuentan: anular libera el número, y por eso el índice de la
 * base también los excluye. Las dos reglas tienen que decir lo mismo o una de
 * las dos miente.
 */
export function evaluarAlta({ candidato, existentes = [] } = {}) {
  const clave = claveIdentidad(candidato);
  if (!clave) return { ok: false, motivo: MOTIVO_RECHAZO.SIN_IDENTIDAD, choca: null };

  const vigentes = (Array.isArray(existentes) ? existentes : []).filter(
    (e) => e && e.estado !== "ANULADO"
  );

  // Cada existente se compara con SU proveedor, no con el del candidato. La
  // versión anterior usaba el del candidato y por lo tanto daba duplicado
  // contra un comprobante de otro proveedor con el mismo número — que es
  // perfectamente normal, porque cada proveedor numera por su cuenta.
  //
  // Si un existente no trae `proveedorId`, se asume que la lista ya viene
  // filtrada por proveedor, que es como la llama la ruta. Se asume dicho, no en
  // silencio.
  const mismoNumero = vigentes.find(
    (e) =>
      claveIdentidad({
        proveedorId: e.proveedorId ?? candidato.proveedorId,
        puntoVenta: e.puntoVenta,
        numero: e.numero,
      }) === clave
  );
  if (mismoNumero) return { ok: false, motivo: MOTIVO_RECHAZO.DUPLICADO, choca: mismoNumero.id ?? null };

  // El hash es la segunda red: la identidad de negocio atrapa la misma factura
  // recargada con otro número tipeado; el hash atrapa el mismo archivo exacto.
  const hash = candidato?.archivoHash;
  if (hash) {
    const mismoArchivo = vigentes.find((e) => e.archivoHash && e.archivoHash === hash);
    if (mismoArchivo) return { ok: false, motivo: MOTIVO_RECHAZO.DUPLICADO_ARCHIVO, choca: mismoArchivo.id ?? null };
  }

  return { ok: true, motivo: null, choca: null, clave };
}

// ── EL CUIT ────────────────────────────────────────────────────────────────

export const CUIT = Object.freeze({
  COINCIDE: "COINCIDE",
  DIFIERE: "DIFIERE",
  /// El proveedor no tiene CUIT cargado. NO se completa solo.
  PROVEEDOR_SIN_CUIT: "PROVEEDOR_SIN_CUIT",
  /// El comprobante no trajo CUIT legible.
  SIN_LEER: "SIN_LEER",
});

/** Solo los dígitos: el CUIT se escribe con guiones, con puntos o pelado. */
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * Compara el CUIT leído del papel contra el del proveedor.
 *
 * NUNCA lo completa. Es una decisión, no una limitación: un CUIT mal leído que
 * se autocompletara dejaría al proveedor con un dato falso que nadie volvería a
 * mirar, y el CUIT es único en la tabla — un valor equivocado bloquearía el alta
 * del proveedor que sí lo tiene.
 */
export function compararCuit({ cuitLeido, cuitProveedor } = {}) {
  const leido = soloDigitos(cuitLeido);
  const propio = soloDigitos(cuitProveedor);

  if (!leido) return { estado: CUIT.SIN_LEER, avisa: false, completar: false };
  if (!propio) {
    return {
      estado: CUIT.PROVEEDOR_SIN_CUIT,
      avisa: true,
      // Explícito y en false: que se lea en el código, no que se deduzca de una
      // ausencia.
      completar: false,
      leido,
    };
  }
  const coincide = leido === propio;
  return {
    estado: coincide ? CUIT.COINCIDE : CUIT.DIFIERE,
    avisa: !coincide,
    completar: false,
    leido,
  };
}

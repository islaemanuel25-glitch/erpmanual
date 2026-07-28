// lib/pos-ventas/pagosAjuste.js
//
// Helpers PUROS (sin DB, sin React, sin imports) del tender "Saldo automático"
// para la corrección COMPLETA. La suma de pagos SIEMPRE es igual al total
// corregido: exactamente un tender absorbe la diferencia (el "ajustador").
//
// Reglas (definición funcional del dueño):
//   · 1 medio  → su importe = total (solo lectura).
//   · N medios → exactamente 1 "Saldo automático" (solo lectura) = total − Σ(otros).
//   · Ajustador por defecto = último medio NO FIADO.
//   · Agregar medio → editable, NO ajustador, arranca en 0 (no se envía si es 0).
//   · Quitar medio → su importe vuelve al ajustador; si se quita el ajustador,
//     el nuevo ajustador es el último NO FIADO restante.
//   · FIADO = medio único (= total).
//
// TODO en CENTAVOS enteros: los floats NO son fuente de verdad. Se convierte a
// decimal solo para mostrar y para construir el payload.

export const FIADO = "FIADO";

// ---- Dinero en centavos -----------------------------------------------------

/** Número monetario → centavos enteros (redondeo bancario estable, +EPSILON). */
export function aCent(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100);
}

/** Centavos enteros → número decimal (solo para mostrar / payload). */
export function desdeCent(c) {
  const x = Number(c);
  return Number.isFinite(x) ? x / 100 : 0;
}

/**
 * Total corregido en CENTAVOS, replicando el redondeo POR LÍNEA del backend:
 *   subtotal = Σ round2(precio_i · cantidad_i);  total = subtotal − descuento.
 * (round2(x) ≡ centavos vía aCent). Se ignoran las líneas `removed`.
 */
export function totalCentDeLineas(lineas, descuentoCent = 0) {
  let sum = 0;
  for (const l of lineas || []) {
    if (l && l.removed) continue;
    sum += aCent(Number(l?.precio) * Number(l?.cantidad));
  }
  const d = Number(descuentoCent) || 0;
  return Math.max(0, sum - d);
}

// ---- Modelo de tender -------------------------------------------------------
// { id, medio, montoCent, ajusta }

let _pid = 0;
export function nuevoPagoId() { return `pg${++_pid}`; }

export function crearPago(medio, montoCent = 0, ajusta = false) {
  return { id: nuevoPagoId(), medio: String(medio || "EFECTIVO").toUpperCase(), montoCent: Math.max(0, Math.round(Number(montoCent) || 0)), ajusta: !!ajusta };
}

export function esFiado(pagos) {
  return (pagos || []).some((p) => p.medio === FIADO);
}

/**
 * Garantiza exactamente UN ajustador entre los NO-FIADO. Si hay FIADO, colapsa a
 * un único tender FIADO (regla del backend). Si nadie está marcado, el ajustador
 * es el último NO-FIADO. Si varios están marcados, conserva solo el primero.
 */
export function normalizarAjustador(pagos) {
  const ps = pagos || [];
  if (!ps.length) return ps;

  // FIADO presente → único tender FIADO.
  const fiado = ps.find((p) => p.medio === FIADO);
  if (fiado) return [{ ...fiado, ajusta: true }];

  const noFiado = ps.filter((p) => p.medio !== FIADO);
  if (!noFiado.length) return ps;

  const marcados = noFiado.filter((p) => p.ajusta);
  let ajId;
  if (marcados.length === 1) ajId = marcados[0].id;
  else if (marcados.length > 1) ajId = marcados[marcados.length - 1].id; // conserva el último marcado
  else ajId = noFiado[noFiado.length - 1].id; // ninguno → último NO-FIADO

  return ps.map((p) => ({ ...p, ajusta: p.id === ajId }));
}

/**
 * Recalcula el importe del ajustador = total − Σ(otros). Devuelve la lista
 * sincronizada + banderas. La suma SIEMPRE queda igual al total (aunque el
 * ajustador resulte negativo, que la UI debe impedir por clamp).
 */
export function recomputar(pagosIn, totalCent) {
  const pagos = normalizarAjustador(pagosIn);
  const aj = pagos.find((p) => p.ajusta) || null;
  const ajId = aj ? aj.id : null;
  const sumaOtros = pagos.filter((p) => p.id !== ajId).reduce((a, p) => a + (p.montoCent || 0), 0);
  const ajusteCent = (Number(totalCent) || 0) - sumaOtros;
  const out = pagos.map((p) => (p.id === ajId ? { ...p, montoCent: ajusteCent } : p));
  return {
    pagos: out,
    ajustadorId: ajId,
    disponibleCent: ajusteCent,       // lo que absorbe el ajustador
    negativo: ajusteCent < 0,         // estado inválido: los otros superan el total
    ceroAjustador: ajusteCent === 0 && out.length > 1, // ajustador en 0 con varios medios
    sumaCent: out.reduce((a, p) => a + (p.montoCent || 0), 0),
  };
}

/** Máximo que un tender editable puede tomar sin volver negativo al ajustador. */
export function maxAsignableCent(pagos, id, totalCent) {
  const norm = normalizarAjustador(pagos);
  const ajId = (norm.find((p) => p.ajusta) || {}).id;
  if (id === ajId) return Number(totalCent) || 0; // el ajustador no se edita
  const otros = norm.filter((p) => p.id !== ajId && p.id !== id).reduce((a, p) => a + (p.montoCent || 0), 0);
  return Math.max(0, (Number(totalCent) || 0) - otros);
}

/** Setea el monto (en centavos) de un tender editable, con clamp a [0, max]. */
export function setMontoCent(pagos, id, montoCent, totalCent) {
  const norm = normalizarAjustador(pagos);
  const ajId = (norm.find((p) => p.ajusta) || {}).id;
  if (id === ajId) return norm; // el ajustador es de solo lectura
  const max = maxAsignableCent(norm, id, totalCent);
  const val = Math.min(Math.max(0, Math.round(Number(montoCent) || 0)), max);
  return norm.map((p) => (p.id === id ? { ...p, montoCent: val } : p));
}

/** Cambia cuál tender es el ajustador (solo entre NO-FIADO). */
export function setAjustador(pagos, id) {
  const ps = pagos || [];
  if (!ps.some((p) => p.id === id && p.medio !== FIADO)) return ps;
  return ps.map((p) => ({ ...p, ajusta: p.id === id }));
}

/** Agrega un medio editable (NO ajustador, monto 0). No aplica si hay FIADO. */
export function agregarPago(pagos, medio = "EFECTIVO") {
  const ps = pagos || [];
  if (esFiado(ps)) return ps; // FIADO es único: no se agregan medios
  return normalizarAjustador([...ps, crearPago(medio, 0, false)]);
}

/** Quita un medio; el importe vuelve al ajustador (recompute). Reasigna ajustador. */
export function quitarPago(pagos, id) {
  const rest = (pagos || []).filter((p) => p.id !== id);
  return normalizarAjustador(rest);
}

/** FIADO como único tender = total. */
export function aplicarFiado(totalCent) {
  return [crearPago(FIADO, Number(totalCent) || 0, true)];
}

/** Un único medio (no FIADO) por el total completo. */
export function medioUnico(medio, totalCent) {
  return [crearPago(medio, Number(totalCent) || 0, true)];
}

/**
 * Cambia el medio de un tender. Maneja las transiciones con FIADO:
 *   · a FIADO      → colapsa a FIADO único = total.
 *   · desde FIADO  → único medio nuevo = total.
 *   · otro caso    → solo cambia el medio (renormaliza ajustador).
 */
export function cambiarMedio(pagos, id, medio, totalCent) {
  const ps = pagos || [];
  const nuevo = String(medio || "").toUpperCase();
  const eraFiado = esFiado(ps);
  if (nuevo === FIADO) return aplicarFiado(totalCent);
  if (eraFiado) return medioUnico(nuevo, totalCent);
  return normalizarAjustador(ps.map((p) => (p.id === id ? { ...p, medio: nuevo } : p)));
}

// ---- Payload ----------------------------------------------------------------

/** Tenders a enviar al backend: excluye montos ≤ 0 (el backend rechaza 0). */
export function payloadPagos(pagos) {
  return (pagos || [])
    .filter((p) => (p.montoCent || 0) > 0)
    .map((p) => ({ medio: p.medio, monto: desdeCent(p.montoCent) }));
}

/** Suma (centavos) de lo que efectivamente se enviaría (montos > 0). */
export function sumaPayloadCent(pagos) {
  return (pagos || []).filter((p) => (p.montoCent || 0) > 0).reduce((a, p) => a + p.montoCent, 0);
}

/** Guard defensivo: el payload suma EXACTAMENTE el total y no hay negativos. */
export function payloadValido(pagos, totalCent) {
  const t = Number(totalCent) || 0;
  if (t <= 0) return false;
  if ((pagos || []).some((p) => (p.montoCent || 0) < 0)) return false;
  return sumaPayloadCent(pagos) === t;
}

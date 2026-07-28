// lib/pos-ventas/correccion.js
//
// Helpers PUROS y testeables de la corrección de ventas (Fase A: corrección
// SIMPLE; la corrección COMPLETA —Fase B— reutilizará la ventana y los estados
// definidos acá). NO importa Prisma: recibe objetos ya leídos y devuelve
// decisiones. Todo lo que toca DB vive en el endpoint.
//
// Reglas de negocio congeladas (aprobadas por el dueño):
//   · Ventana de corrección: 30 días desde la fecha de la venta.
//   · Corrección SIMPLE: SOLO cliente / observaciones / referencia interna.
//     NO toca stock, pagos, total ni cuenta corriente.
//   · Cambiar el cliente de una venta FIADA NO se permite desde SIMPLE
//     (movería la deuda de CC a otro cliente → requiere corrección COMPLETA).

export const DIAS_LIMITE_CORRECCION = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

// Campos que la corrección SIMPLE puede tocar. Cualquier otro campo recibido se
// rechaza (contrato estricto: la simple NO edita productos/pagos/importes).
export const CAMPOS_SIMPLE = ["clienteId", "observaciones", "referenciaInterna"];

// Longitudes máximas de los campos descriptivos (evita snapshots gigantes).
export const MAX_OBSERVACIONES = 1000;
export const MAX_REFERENCIA = 120;
export const MAX_MOTIVO = 300;

/**
 * ¿La venta está fiada? Fuente de verdad: VentaPago con medio FIADO; con
 * fallback al flag legacy `esFiado`. Se acepta cualquiera de las dos formas
 * porque el helper es puro y puede recibir la venta con o sin `pagos`.
 * @param {{ esFiado?: boolean, pagos?: Array<{medio:string}> }} venta
 */
export function esVentaFiada(venta) {
  if (!venta) return false;
  if (Array.isArray(venta.pagos) && venta.pagos.length) {
    return venta.pagos.some((p) => String(p.medio).toUpperCase() === "FIADO");
  }
  return venta.esFiado === true;
}

/**
 * Estado de la ventana de corrección para una venta.
 * @param {{ fecha: Date|string }} venta
 * @param {{ ahora?: Date, dias?: number }} opts
 * @returns {{ diasTranscurridos:number, diasRestantes:number, dentroDeVentana:boolean, fueraDeVentana:boolean }}
 */
export function estadoVentanaCorreccion(venta, { ahora = new Date(), dias = DIAS_LIMITE_CORRECCION } = {}) {
  const f = venta?.fecha instanceof Date ? venta.fecha : new Date(venta?.fecha);
  const base = { diasTranscurridos: Infinity, diasRestantes: 0, dentroDeVentana: false, fueraDeVentana: true };
  if (!f || isNaN(f.getTime())) return base;
  const transcurridoMs = ahora.getTime() - f.getTime();
  const diasTranscurridos = Math.floor(transcurridoMs / MS_DIA);
  const dentro = transcurridoMs <= dias * MS_DIA;
  return {
    diasTranscurridos,
    diasRestantes: Math.max(0, dias - diasTranscurridos),
    dentroDeVentana: dentro,
    fueraDeVentana: !dentro,
  };
}

/**
 * Normaliza los campos entrantes de una corrección SIMPLE. Detecta campos NO
 * permitidos y valida longitudes. NO decide permisos ni ventana (eso lo hace
 * el endpoint / otros helpers). Devuelve solo los campos que efectivamente
 * CAMBIAN respecto de la venta actual.
 *
 * @param {object} body           - payload recibido
 * @param {object} ventaActual    - { clienteId, observaciones, referenciaInterna }
 * @returns {{ ok:boolean, error?:string, code?:string, cambios?:object, cambiaCliente?:boolean }}
 */
export function prepararCambiosSimple(body = {}, ventaActual = {}) {
  // 1) Rechazar cualquier campo fuera del contrato SIMPLE (además de motivo/version).
  const permitidos = new Set([...CAMPOS_SIMPLE, "motivo", "version"]);
  const extra = Object.keys(body).filter((k) => !permitidos.has(k));
  if (extra.length) {
    return {
      ok: false,
      code: "campos_no_permitidos",
      error: `La corrección simple no puede modificar: ${extra.join(", ")}.`,
    };
  }

  const cambios = {};
  let cambiaCliente = false;

  // clienteId: acepta número o null (consumidor final). "" → null.
  if ("clienteId" in body) {
    let nuevo = body.clienteId;
    if (nuevo === "" || nuevo === undefined) nuevo = null;
    nuevo = nuevo === null ? null : Number(nuevo);
    if (nuevo !== null && (!Number.isInteger(nuevo) || nuevo <= 0)) {
      return { ok: false, code: "cliente_invalido", error: "Cliente inválido." };
    }
    const actual = ventaActual.clienteId ?? null;
    if (nuevo !== actual) {
      cambios.clienteId = nuevo;
      cambiaCliente = true;
    }
  }

  // observaciones
  if ("observaciones" in body) {
    let v = body.observaciones;
    if (v === "" || v === undefined) v = null;
    if (v !== null) {
      if (typeof v !== "string") return { ok: false, code: "observaciones_invalida", error: "Observaciones inválidas." };
      v = v.trim();
      if (v.length === 0) v = null;
      else if (v.length > MAX_OBSERVACIONES) return { ok: false, code: "observaciones_larga", error: `Observaciones supera ${MAX_OBSERVACIONES} caracteres.` };
    }
    if ((v ?? null) !== (ventaActual.observaciones ?? null)) cambios.observaciones = v;
  }

  // referenciaInterna
  if ("referenciaInterna" in body) {
    let v = body.referenciaInterna;
    if (v === "" || v === undefined) v = null;
    if (v !== null) {
      if (typeof v !== "string") return { ok: false, code: "referencia_invalida", error: "Referencia inválida." };
      v = v.trim();
      if (v.length === 0) v = null;
      else if (v.length > MAX_REFERENCIA) return { ok: false, code: "referencia_larga", error: `Referencia supera ${MAX_REFERENCIA} caracteres.` };
    }
    if ((v ?? null) !== (ventaActual.referenciaInterna ?? null)) cambios.referenciaInterna = v;
  }

  return { ok: true, cambios, cambiaCliente };
}

/**
 * Valida el `motivo` obligatorio de toda corrección.
 * @returns {{ ok:boolean, error?:string, code?:string, motivo?:string }}
 */
export function validarMotivo(motivo) {
  if (typeof motivo !== "string" || motivo.trim().length === 0) {
    return { ok: false, code: "motivo_requerido", error: "El motivo de la corrección es obligatorio." };
  }
  const m = motivo.trim();
  if (m.length > MAX_MOTIVO) {
    return { ok: false, code: "motivo_largo", error: `El motivo supera ${MAX_MOTIVO} caracteres.` };
  }
  return { ok: true, motivo: m };
}

/**
 * Snapshot MÍNIMO de una venta para la corrección SIMPLE. Deliberadamente chico
 * (no incluye líneas ni pagos): la simple no toca dinero, así que el snapshot
 * solo guarda lo descriptivo + el total (invariante). Evita snapshots gigantes.
 */
export function snapshotSimple(venta, { clienteNombre = null } = {}) {
  return {
    tipo: "SIMPLE",
    ventaId: venta.id,
    numero: venta.numero,
    clienteId: venta.clienteId ?? null,
    clienteNombre: clienteNombre,
    observaciones: venta.observaciones ?? null,
    referenciaInterna: venta.referenciaInterna ?? null,
    total: venta.total != null ? String(venta.total) : null,
    esFiado: venta.esFiado === true,
    version: venta.version ?? 0,
  };
}

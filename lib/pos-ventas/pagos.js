// lib/pos-ventas/pagos.js
//
// Lógica PURA del subsistema de pagos múltiples (pago dividido). Sin imports de
// servidor: se usa en el backend (crear, agregaciones, migración) y en el POS.
//
// Reglas del dominio:
//   - Medios válidos = enum MedioPago del schema (EFECTIVO, MERCADOPAGO, DEBITO,
//     CREDITO, FIADO). Cualquier medio desconocido se RECHAZA (no se manda a "otros").
//   - Una venta tiene 1+ tenders; se consolidan por medio (máx. 1 por medio).
//   - Σ montos == total EXACTO (comparado en centavos enteros; nunca floats crudos).
//   - FIADO, si está, debe ser el ÚNICO tender y por el total (v1: no fiado parcial).
//   - Comisión por tender: solo medios digitales; % congelado en el tender.
//   - Campos derivados de Venta: formaPago (medio si 1 tender, "mixto" si ≥2),
//     esFiado (hay tender FIADO), comisionBancaria/netoRecibido (suma de tenders),
//     comisionPct (del único tender, o null si mixto).

/** Valores del enum MedioPago (schema). */
export const MEDIOS_PAGO = ["EFECTIVO", "MERCADOPAGO", "DEBITO", "CREDITO", "FIADO"];

/** Medios que cobran comisión bancaria. */
export const MEDIOS_CON_COMISION = ["MERCADOPAGO", "DEBITO", "CREDITO"];

/** Nombres legibles por medio (ticket, historial, reportes). */
export const MEDIO_LABEL = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "Mercado Pago",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  FIADO: "Fiado",
};

// Orden consistente de medios para mostrar el desglose.
const ORDEN_MEDIO = ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO", "FIADO"];

// Variantes legacy/tipeadas → enum. Cubre los valores históricos de Venta.formaPago
// (minúsculas: efectivo/mercadopago/debito/credito/fiado) y variantes con acentos/espacios.
const MAPA_MEDIO = {
  efectivo: "EFECTIVO",
  cash: "EFECTIVO",
  mercadopago: "MERCADOPAGO",
  "mercado pago": "MERCADOPAGO",
  mp: "MERCADOPAGO",
  debito: "DEBITO",
  "tarjeta debito": "DEBITO",
  credito: "CREDITO",
  "tarjeta credito": "CREDITO",
  fiado: "FIADO",
  "cuenta corriente": "FIADO",
  cc: "FIADO",
};

/**
 * Normaliza un medio (enum, legacy minúscula, variante) al enum MedioPago.
 * Devuelve null si es desconocido. Fail-closed: NO adivina.
 * @param {any} raw
 * @returns {string|null}
 */
export function normalizarMedio(raw) {
  if (raw == null) return null;
  const up = String(raw).trim().toUpperCase();
  if (MEDIOS_PAGO.includes(up)) return up;
  const key = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[áàä]/g, "a")
    .replace(/[éèë]/g, "e")
    .replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o")
    .replace(/[úùü]/g, "u")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  return MAPA_MEDIO[key] ?? MAPA_MEDIO[key.replace(/\s/g, "")] ?? null;
}

/** Redondeo monetario a 2 decimales (misma convención que el resto del POS). */
export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Monto → centavos enteros (para comparar dinero sin floats). NaN si no es finito. */
export function aCentavos(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.round(x * 100);
}

/**
 * Normaliza, valida y CONSOLIDA los pagos de una venta contra su total.
 * - rechaza vacío, montos ≤0, NaN/Infinity, medios desconocidos;
 * - consolida montos por medio (máx. 1 tender por medio);
 * - exige Σ montos == total (en centavos, exacto, sin tolerancia);
 * - aplica la regla FIADO = único tender.
 *
 * @param {Array<{medio:any, monto:any}>} pagosRaw
 * @param {number} totalVenta
 * @returns {{ pagos: Array<{medio:string, monto:number}>, esFiado: boolean } | { error: string }}
 */
export function normalizarYConsolidarPagos(pagosRaw, totalVenta) {
  if (!Array.isArray(pagosRaw) || pagosRaw.length === 0) {
    return { error: "Debe haber al menos un pago." };
  }
  const totalCent = aCentavos(totalVenta);
  if (!Number.isFinite(totalCent) || totalCent <= 0) {
    return { error: "Total de venta inválido." };
  }

  const porMedio = new Map();
  for (const p of pagosRaw) {
    const medio = normalizarMedio(p?.medio);
    if (!medio) {
      return { error: `Medio de pago desconocido: ${JSON.stringify(p?.medio ?? null)}` };
    }
    const c = aCentavos(p?.monto);
    if (!Number.isFinite(c) || c <= 0) {
      return { error: `Monto inválido para ${medio}: ${JSON.stringify(p?.monto ?? null)}` };
    }
    porMedio.set(medio, (porMedio.get(medio) || 0) + c); // consolida medios repetidos
  }

  if (porMedio.has("FIADO") && porMedio.size > 1) {
    return { error: "FIADO debe ser el único medio de pago de la venta." };
  }

  const sumaCent = [...porMedio.values()].reduce((a, b) => a + b, 0);
  if (sumaCent !== totalCent) {
    return {
      error: `La suma de los pagos ($${(sumaCent / 100).toFixed(2)}) debe ser exactamente igual al total ($${(totalCent / 100).toFixed(2)}).`,
    };
  }

  const pagos = [...porMedio.entries()].map(([medio, cent]) => ({ medio, monto: cent / 100 }));
  return { pagos, esFiado: porMedio.has("FIADO") };
}

/**
 * Calcula comisión y neto por tender y los congela. `comisionPctPorMedio` es un
 * mapa { MERCADOPAGO, DEBITO, CREDITO } → % (resuelto server-side de la config).
 * @returns {Array<{medio, monto, comisionPct:number|null, comision:number, neto:number}>}
 */
export function aplicarComisiones(pagos, comisionPctPorMedio = {}) {
  return pagos.map((p) => {
    const cobra = MEDIOS_CON_COMISION.includes(p.medio);
    const pct = cobra ? Number(comisionPctPorMedio?.[p.medio] ?? 0) : 0;
    const comision = cobra && pct > 0 ? round2((p.monto * pct) / 100) : 0;
    return {
      medio: p.medio,
      monto: round2(p.monto),
      comisionPct: cobra ? pct : null,
      comision,
      neto: round2(p.monto - comision),
    };
  });
}

/**
 * Deriva los campos legacy/compat de Venta a partir de los tenders con comisión.
 *   - formaPago: medio (minúscula) si hay 1 tender; "mixto" si ≥2.
 *   - esFiado: hay tender FIADO.
 *   - comisionBancaria / netoRecibido: suma de tenders.
 *   - comisionPct: del único tender (o null si mixto).
 */
/**
 * Tenders de una venta para AGREGACIÓN (cierres/reportes/auditoría). Usa las filas
 * `venta.pagos` (fuente de verdad); si faltan (venta pre-backfill / defensivo), cae
 * a un único tender derivado de los campos legacy. Cada tender aporta SU monto al
 * bucket de su medio — nunca el total completo a un solo bucket.
 * @param {{ pagos?: any[], formaPago?: string, esFiado?: boolean, total?: any, comisionBancaria?: any, netoRecibido?: any }} venta
 * @returns {Array<{medio:string, monto:number, comision:number, neto:number}>}
 */
export function tendersParaAgregar(venta) {
  if (Array.isArray(venta?.pagos) && venta.pagos.length > 0) {
    return venta.pagos.map((p) => ({
      medio: p.medio,
      monto: Number(p.monto) || 0,
      comision: Number(p.comision) || 0,
      neto: Number(p.neto) || 0,
    }));
  }
  const medio = venta?.esFiado ? "FIADO" : normalizarMedio(venta?.formaPago) || "EFECTIVO";
  const monto = Number(venta?.total) || 0;
  const comision = Number(venta?.comisionBancaria) || 0;
  const neto = Number(venta?.netoRecibido) || round2(monto - comision);
  return [{ medio, monto, comision, neto }];
}

/** Etiqueta legible de un medio (enum o legacy). */
export function etiquetaMedio(medioOrForma) {
  const m = normalizarMedio(medioOrForma);
  return m ? MEDIO_LABEL[m] : medioOrForma ? String(medioOrForma) : "—";
}

/**
 * Líneas de pago para ticket/comprobante/detalle, desde el SNAPSHOT de tenders
 * (venta.pagos). Fallback legacy a una línea desde formaPago + total cuando no hay
 * filas (venta pre-backfill). Ordenadas de forma consistente. Cada línea = el monto
 * de SU tender (nunca el total completo).
 * @returns {Array<{medio:string, label:string, monto:number}>}
 */
export function lineasPagoTicket(venta) {
  const pagos = Array.isArray(venta?.pagos) ? venta.pagos : [];
  let tenders;
  if (pagos.length > 0) {
    tenders = pagos.map((p) => ({ medio: normalizarMedio(p.medio) || p.medio, monto: Number(p.monto) || 0 }));
  } else {
    const medio = venta?.esFiado ? "FIADO" : normalizarMedio(venta?.formaPago) || "EFECTIVO";
    tenders = [{ medio, monto: Number(venta?.total) || 0 }];
  }
  tenders.sort((a, b) => ORDEN_MEDIO.indexOf(a.medio) - ORDEN_MEDIO.indexOf(b.medio));
  return tenders.map((t) => ({ medio: t.medio, label: MEDIO_LABEL[t.medio] || t.medio, monto: t.monto }));
}

/** ¿La venta es de pago dividido (≥2 tenders)? */
export function esPagoDividido(venta) {
  return Array.isArray(venta?.pagos) && venta.pagos.length >= 2;
}

/**
 * Vuelto del tender EFECTIVO. `montoACubrir` es el importe efectivo APLICADO a la
 * venta (no el total de la venta ni el "paga con"). Regla: `pagaCon` debe cubrir
 * ese monto; el vuelto es solo display y NO altera el monto persistido del tender.
 * @returns {{ valido: boolean, vuelto: number }}
 */
export function calcularVueltoEfectivo(pagaCon, montoACubrir) {
  const pc = Number(pagaCon);
  const mc = Number(montoACubrir);
  if (!Number.isFinite(pc) || !Number.isFinite(mc) || mc < 0) return { valido: false, vuelto: 0 };
  if (pc < mc) return { valido: false, vuelto: 0 }; // paga con < efectivo aplicado → inválido
  return { valido: true, vuelto: round2(pc - mc) };
}

export function derivarCamposVenta(pagosConComision) {
  const comisionBancaria = round2(pagosConComision.reduce((a, p) => a + (p.comision || 0), 0));
  const netoRecibido = round2(pagosConComision.reduce((a, p) => a + (p.neto || 0), 0));
  const esFiado = pagosConComision.some((p) => p.medio === "FIADO");
  const unico = pagosConComision.length === 1;
  const formaPago = unico ? pagosConComision[0].medio.toLowerCase() : "mixto";
  const comisionPct = unico ? pagosConComision[0].comisionPct : null;
  return { formaPago, esFiado, comisionBancaria, netoRecibido, comisionPct };
}

// lib/pos-ventas/servicios.js
//
// Lógica PURA de los SERVICIOS DE IMPORTE VARIABLE (cargas de colectivo / cargas
// virtuales). Sin imports de servidor: se usa en backend (crear venta, alta/edición),
// POS, ticket y tests. El backend es la ÚNICA fuente de verdad: el frontend puede
// reusar estos helpers por UX, pero nunca reemplaza la validación server-side.
//
// Modelo del dominio:
//   - modalidad del producto: NORMAL | IMPORTE_VARIABLE (enum ModalidadProducto).
//   - El cajero ingresa el IMPORTE BASE solicitado; el % de recargo se resuelve
//     server-side (ProductoLocal.recargoServicioPct ?? ProductoBase.recargoServicioDefaultPct ?? 0).
//   - Fórmula (congelada en VentaDetalle):
//        recargoImporte = round2(importeBase * recargoPct / 100)
//        precioFinal    = round2(importeBase + recargoImporte)
//        precioCosto    = importeBase
//        ganancia       = round2(precioFinal - importeBase)  (== recargoImporte)
//        cantidad       = 1 (fija)
//   - Servicios EXCLUIDOS de: stock, descuentos, listas, redondeo_100, margen normal,
//     puntos. Su total debe quedar cubierto ÍNTEGRAMENTE en efectivo (VentaPago EFECTIVO).
//   - Ninguna parte de un servicio puede quedar fiada (FIADO se rechaza si hay servicio).

import { round2, aCentavos } from "./pagos.js";

/** Valores del enum ModalidadProducto (schema). */
export const MODALIDAD_NORMAL = "NORMAL";
export const MODALIDAD_IMPORTE_VARIABLE = "IMPORTE_VARIABLE";
export const MODALIDADES_PRODUCTO = [MODALIDAD_NORMAL, MODALIDAD_IMPORTE_VARIABLE];

// Rango del importe solicitado (constantes de dominio, compartidas front/back).
export const IMPORTE_SERVICIO_MIN = 100;
export const IMPORTE_SERVICIO_MAX = 500000;

// Rango del porcentaje de recargo (0..100, hasta 2 decimales).
export const RECARGO_SERVICIO_PCT_MIN = 0;
export const RECARGO_SERVICIO_PCT_MAX = 100;

/** ¿La modalidad (enum o string) corresponde a un servicio de importe variable? */
export function esModalidadServicio(modalidad) {
  return String(modalidad || "").toUpperCase() === MODALIDAD_IMPORTE_VARIABLE;
}

/** ¿Este producto (base) es un servicio de importe variable? */
export function esProductoServicio(base) {
  return esModalidadServicio(base?.modalidad);
}

/**
 * Valida el IMPORTE BASE solicitado. Debe ser: número finito, entero (sin
 * centavos/decimales), > 0, dentro de [MIN, MAX]. Rechaza NaN, Infinity, negativos,
 * decimales, strings no numéricos.
 * @param {any} raw
 * @returns {{ valido: boolean, importe: number, error: string|null }}
 */
export function validarImporteServicio(raw) {
  // Rechazo explícito de tipos no numéricos (objetos, arrays, booleans, vacío).
  if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") {
    return { valido: false, importe: NaN, error: "Ingresá el importe del servicio." };
  }
  if (typeof raw === "object") {
    return { valido: false, importe: NaN, error: "Importe de servicio inválido." };
  }
  // String: solo se acepta si es un entero puro (sin punto/coma/espacios raros).
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!/^\d+$/.test(s)) {
      return { valido: false, importe: NaN, error: "El importe debe ser un número entero sin centavos." };
    }
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { valido: false, importe: NaN, error: "El importe debe ser un número válido." };
  }
  if (!Number.isInteger(n)) {
    return { valido: false, importe: NaN, error: "El importe debe ser entero (sin centavos)." };
  }
  if (n <= 0) {
    return { valido: false, importe: NaN, error: "El importe debe ser mayor a cero." };
  }
  if (n < IMPORTE_SERVICIO_MIN) {
    return { valido: false, importe: NaN, error: `El importe mínimo es $${IMPORTE_SERVICIO_MIN}.` };
  }
  if (n > IMPORTE_SERVICIO_MAX) {
    return { valido: false, importe: NaN, error: `El importe máximo es $${IMPORTE_SERVICIO_MAX}.` };
  }
  return { valido: true, importe: n, error: null };
}

/**
 * Valida un porcentaje de recargo (config, no venta). 0..100, hasta 2 decimales.
 * @param {any} raw
 * @returns {{ valido: boolean, pct: number, error: string|null }}
 */
export function validarRecargoServicioPct(raw) {
  if (raw === null || raw === undefined || raw === "") {
    // Ausente es válido: significa "sin override" / "sin default".
    return { valido: true, pct: 0, error: null };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { valido: false, pct: NaN, error: "El recargo debe ser un número válido." };
  }
  if (n < RECARGO_SERVICIO_PCT_MIN || n > RECARGO_SERVICIO_PCT_MAX) {
    return { valido: false, pct: NaN, error: `El recargo debe estar entre ${RECARGO_SERVICIO_PCT_MIN} y ${RECARGO_SERVICIO_PCT_MAX}.` };
  }
  // Máximo 2 decimales.
  if (Math.round(n * 100) !== n * 100) {
    return { valido: false, pct: NaN, error: "El recargo admite hasta 2 decimales." };
  }
  return { valido: true, pct: n, error: null };
}

/**
 * Resuelve el % de recargo EFECTIVO server-side:
 *   ProductoLocal.recargoServicioPct ?? ProductoBase.recargoServicioDefaultPct ?? 0.
 * Cualquier valor no finito o fuera de rango cae a 0 (fail-safe: nunca recarga de más).
 * @param {any} localPct
 * @param {any} basePct
 * @returns {number}
 */
export function resolverRecargoServicioPct(localPct, basePct) {
  const pick = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n < RECARGO_SERVICIO_PCT_MIN || n > RECARGO_SERVICIO_PCT_MAX) return null;
    return n;
  };
  const local = pick(localPct);
  if (local !== null) return local;
  const base = pick(basePct);
  if (base !== null) return base;
  return 0;
}

/**
 * Calcula el snapshot monetario de una línea de servicio a partir del importe base
 * (ya validado) y el % de recargo (ya resuelto server-side). Fuente de verdad.
 * @param {number} importeBase
 * @param {number} recargoPct
 * @returns {{ importeBase:number, recargoPct:number, recargoImporte:number, precioFinal:number, precioCosto:number, ganancia:number, cantidad:number }}
 */
export function calcularServicio(importeBase, recargoPct) {
  const base = round2(importeBase);
  const pct = Number.isFinite(Number(recargoPct)) ? Number(recargoPct) : 0;
  const recargoImporte = round2((base * pct) / 100);
  const precioFinal = round2(base + recargoImporte);
  const precioCosto = base;
  const ganancia = round2(precioFinal - base);
  return {
    importeBase: base,
    recargoPct: pct,
    recargoImporte,
    precioFinal,
    precioCosto,
    ganancia,
    cantidad: 1,
  };
}

/** ¿Una LÍNEA (item de carrito / VentaDetalle) es un servicio? Por snapshot esServicio. */
export function esLineaServicio(linea) {
  return linea?.esServicio === true || linea?.tipo === "SERVICIO";
}

/**
 * Suma el total (precio final) de TODAS las líneas de servicio de un carrito/venta.
 * Cada servicio aporta su precioFinal (cantidad fija = 1). Devuelve número redondeado.
 * @param {Array} lineas — cada una con { esServicio|tipo, precio|precioFinal }
 * @returns {number}
 */
export function sumarTotalServicios(lineas) {
  if (!Array.isArray(lineas)) return 0;
  let cent = 0;
  for (const l of lineas) {
    if (!esLineaServicio(l)) continue;
    const precio = l.precioFinal != null ? l.precioFinal : l.precio;
    const c = aCentavos(precio);
    if (Number.isFinite(c)) cent += c;
  }
  return round2(cent / 100);
}

/**
 * Mínimo de efectivo requerido = suma de precios finales de servicios.
 * @param {Array} lineas
 * @returns {number}
 */
export function minimoEfectivoRequerido(lineas) {
  return sumarTotalServicios(lineas);
}

/**
 * Valida que el efectivo cubra íntegramente el total de servicios. Compara en
 * CENTAVOS enteros (nunca floats). `pagos` = tenders [{medio, monto}].
 * @param {number} totalServicios
 * @param {Array<{medio:string, monto:any}>} pagos
 * @returns {{ valido: boolean, minEfectivo: number, efectivo: number, faltante: number }}
 */
export function validarCoberturaEfectivo(totalServicios, pagos) {
  const minCent = aCentavos(totalServicios);
  let efectivoCent = 0;
  if (Array.isArray(pagos)) {
    for (const p of pagos) {
      if (String(p?.medio || "").toUpperCase() === "EFECTIVO") {
        const c = aCentavos(p?.monto);
        if (Number.isFinite(c)) efectivoCent += c;
      }
    }
  }
  const minSafe = Number.isFinite(minCent) ? minCent : 0;
  const valido = efectivoCent >= minSafe;
  return {
    valido,
    minEfectivo: round2(minSafe / 100),
    efectivo: round2(efectivoCent / 100),
    faltante: valido ? 0 : round2((minSafe - efectivoCent) / 100),
  };
}

/** ¿Alguno de los tenders es FIADO? (usado para rechazar fiado con servicios). */
export function hayTenderFiado(pagos) {
  return Array.isArray(pagos) && pagos.some((p) => String(p?.medio || "").toUpperCase() === "FIADO");
}

/** Elegibilidad de una línea para descuentos/listas/puntos: los servicios NO son elegibles. */
export function servicioEsElegibleParaBeneficios() {
  return false;
}

/**
 * Snapshot para el TICKET/PDF/historial de una línea de servicio, leído del detalle
 * histórico (no del producto actual). Colectivo (0%) omite la línea de recargo.
 * @param {{ nombre?:string, importeBaseServicio:any, recargoServicioPct:any, recargoServicioImporte:any, precio:any }} detalle
 * @returns {{ nombre:string, importeBase:number, recargoPct:number, recargoImporte:number, total:number, mostrarRecargo:boolean }}
 */
export function snapshotServicioTicket(detalle) {
  const importeBase = round2(detalle?.importeBaseServicio ?? 0);
  const recargoPct = Number(detalle?.recargoServicioPct ?? 0) || 0;
  const recargoImporte = round2(detalle?.recargoServicioImporte ?? 0);
  const total = round2(detalle?.precio ?? importeBase + recargoImporte);
  return {
    nombre: detalle?.nombre || "Servicio",
    importeBase,
    recargoPct,
    recargoImporte,
    total,
    // Colectivo (0% y sin recargo) no necesita mostrar "Recargo 0%: $0".
    mostrarRecargo: recargoPct > 0 || recargoImporte > 0,
  };
}

// lib/caja/efectivoEsperado.js
//
// FUENTE DE VERDAD del efectivo esperado de una caja (turno).
//
// Antes esta fórmula vivía TRES veces: en turnos/cerrar, en turnos/resumen y
// —copiada a mano— en ModalCierreTurno.jsx. Agregar los arqueos parciales la
// hubiera llevado a cinco copias, y basta con que una se desincronice para que
// el cierre, el arqueo y el historial informen faltantes distintos sobre la
// misma caja. Acá vive una sola vez y todos la consumen.
//
// Es PURA: recibe los datos ya leídos y devuelve números. No consulta la base,
// no conoce Prisma y no sabe de HTTP, así que la regla que decide si falta
// plata se puede probar sin levantar nada.
//
// FÓRMULA (la vigente, no una nueva):
//
//   efectivoEsperado = montoInicial
//                    + ventas cobradas con tender EFECTIVO
//                    + movimientos INGRESO
//                    − movimientos RETIRO
//
// Reglas que la acompañan:
//   · En un pago mixto suma SOLO la porción en efectivo, nunca el total.
//   · MercadoPago, débito y crédito van a digital: no son plata en el cajón.
//   · Fiado y cuenta corriente no aportan efectivo ni digital.
//   · Las operaciones internas quedan fuera del universo de ventas — eso lo
//     resuelve el llamador con `whereVentaComercial`, porque es un filtro de
//     consulta, no de aritmética.
//   · Las diferencias de arqueos anteriores NO entran: un faltante detectado a
//     las 10:00 no es un movimiento de dinero, es un hallazgo. Sumarlo haría que
//     el mismo faltante se contara de nuevo en cada corte posterior.
//
// ARITMÉTICA: todo se acumula en CENTAVOS ENTEROS y se convierte una sola vez
// al final. Sumar floats de dos decimales arrastra residuo binario —el clásico
// 0.1 + 0.2 = 0.30000000000000004— y acá el residuo se lee como diferencia de
// caja. Nunca se usa float como acumulador.

// Import RELATIVO a propósito: este módulo se prueba con `node --test`, que no
// resuelve el alias `@/` de Next. Mismo criterio que el resto de lib/.
import { tendersParaAgregar } from "../pos-ventas/pagos.js";

/** Pasa un importe a centavos enteros. No finito → 0. */
export function aCentavos(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function desdeCentavos(centavos) {
  return centavos / 100;
}

/** Medios que representan dinero físico en el cajón. */
export const MEDIO_EFECTIVO = "EFECTIVO";

/** Medios que NO son dinero físico y tampoco son cobro (no suman a ningún total). */
export const MEDIOS_SIN_COBRO = new Set(["FIADO"]);

/**
 * Desglosa las ventas de un turno por tipo de tender.
 *
 * @param {Array} ventas  ya filtradas por turno y por criterio comercial
 * @returns {{ efectivoCentavos:number, digitalCentavos:number, fiadoCentavos:number,
 *             comisionCentavos:number, netoDigitalCentavos:number }}
 */
export function desglosarVentas(ventas = []) {
  let efectivoCentavos = 0;
  let digitalCentavos = 0;
  let fiadoCentavos = 0;
  let comisionCentavos = 0;
  let netoDigitalCentavos = 0;

  for (const v of ventas) {
    // `tendersParaAgregar` ya resuelve el caso legacy (venta sin filas en
    // VentaPago) devolviendo un único tender desde formaPago + total.
    for (const t of tendersParaAgregar(v)) {
      const monto = aCentavos(t.monto);
      if (MEDIOS_SIN_COBRO.has(t.medio)) {
        fiadoCentavos += monto;
        continue;
      }
      if (t.medio === MEDIO_EFECTIVO) {
        efectivoCentavos += monto;
        continue;
      }
      digitalCentavos += monto;
      comisionCentavos += aCentavos(t.comision);
      netoDigitalCentavos += aCentavos(t.neto);
    }
  }

  return { efectivoCentavos, digitalCentavos, fiadoCentavos, comisionCentavos, netoDigitalCentavos };
}

/**
 * Suma los movimientos manuales de caja.
 *
 * Hoy solo existen INGRESO y RETIRO. Un gasto se registra como RETIRO con
 * motivo descriptivo: no hay tipo propio y esta función NO lo inventa. Un tipo
 * desconocido se ignora en vez de asumirse como ingreso — ante la duda, no se
 * inventa plata en el cajón.
 */
export function desglosarMovimientos(movimientos = []) {
  let ingresosCentavos = 0;
  let retirosCentavos = 0;

  for (const m of movimientos) {
    const monto = aCentavos(m?.monto);
    if (m?.tipo === "INGRESO") ingresosCentavos += monto;
    else if (m?.tipo === "RETIRO") retirosCentavos += monto;
  }

  return { ingresosCentavos, retirosCentavos };
}

/**
 * Efectivo esperado de un turno, con su desglose completo.
 *
 * @param {object} args
 * @param {number|string} args.montoInicial  fondo de apertura
 * @param {Array} args.ventas       ventas del turno (criterio comercial ya aplicado)
 * @param {Array} args.movimientos  CajaMovimiento del turno
 * @returns {object} importes en PESOS, listos para persistir o mostrar
 */
export function calcularEfectivoEsperado({ montoInicial = 0, ventas = [], movimientos = [] } = {}) {
  const inicialCentavos = aCentavos(montoInicial);
  const { efectivoCentavos, digitalCentavos, fiadoCentavos, comisionCentavos, netoDigitalCentavos } =
    desglosarVentas(ventas);
  const { ingresosCentavos, retirosCentavos } = desglosarMovimientos(movimientos);

  const esperadoCentavos =
    inicialCentavos + efectivoCentavos + ingresosCentavos - retirosCentavos;

  return {
    montoInicial: desdeCentavos(inicialCentavos),
    ventasEfectivo: desdeCentavos(efectivoCentavos),
    ventasDigital: desdeCentavos(digitalCentavos),
    ventasFiado: desdeCentavos(fiadoCentavos),
    comisionDigital: desdeCentavos(comisionCentavos),
    netoDigital: desdeCentavos(netoDigitalCentavos),
    ingresos: desdeCentavos(ingresosCentavos),
    retiros: desdeCentavos(retirosCentavos),
    efectivoEsperado: desdeCentavos(esperadoCentavos),
    cantidadVentas: ventas.length,
  };
}

// ── Diferencia de un conteo ─────────────────────────────────────────────────

export const CORRECTO = "CORRECTO";
export const SOBRANTE = "SOBRANTE";
export const FALTANTE = "FALTANTE";

/**
 * Diferencia entre lo contado y lo esperado, en pesos exactos.
 *
 * Positiva = sobra plata en el cajón. Negativa = falta.
 */
export function calcularDiferencia(efectivoContado, efectivoEsperado) {
  return desdeCentavos(aCentavos(efectivoContado) - aCentavos(efectivoEsperado));
}

/** Clasifica una diferencia ya calculada. Cero exacto = CORRECTO. */
export function clasificarDiferencia(diferencia) {
  const c = aCentavos(diferencia);
  if (c === 0) return CORRECTO;
  return c > 0 ? SOBRANTE : FALTANTE;
}

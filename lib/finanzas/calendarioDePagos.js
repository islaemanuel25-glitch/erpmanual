// lib/finanzas/calendarioDePagos.js
//
// DÓNDE CAE CADA CUENTA POR PAGAR EN EL CALENDARIO DE LA LISTA. Puro.
//
// ── CADA PESTAÑA CONTESTA UNA PREGUNTA DISTINTA, CON SU FECHA ────────────
//
// No hay una fecha única para todas las cuentas, y forzarla sería inventar una.
// Cada pestaña usa la que contesta SU pregunta, y ninguna se fabrica:
//
//   · Pendientes → ¿qué deudas vencen, o ya vencieron? `vencimientoProveedor`,
//     el día que dio el proveedor. `fechaPrevistaPago` NO: es la planificación
//     interna de Finanzas y queda en el detalle.
//   · Pagados    → ¿qué deudas terminamos de pagar? El día del pago que llevó
//     el saldo a cero (`saldadaEl`, de `diaEnQueSeSaldo`). Se siguen mostrando
//     CUENTAS, no pagos sueltos: una parcial no está en esta pestaña.
//   · Todos      → ¿qué deudas nacieron? `createdAt`, el cierre de la compra. Es
//     la única fecha que tienen todas.
//
// ── PENDIENTES TIENE DOS BLOQUES FUERA DEL PERÍODO, Y NO SE ESCONDEN ─────
//
// Una deuda vencida es deuda viva: si el período mirado es esta semana y venció
// la pasada, filtrarla por período la haría desaparecer. Por eso las vencidas
// —vencimiento ANTERIOR A HOY— van en su bloque arriba, en CUALQUIER período,
// y no se repiten en los días: una cuenta está en un solo lugar de la lista.
// Las que no tienen vencimiento van en su bloque abajo, también siempre.
//
// ── EL PERÍODO ES EL DE FINANZAS, Y PENDIENTES PUEDE MIRAR ADELANTE ──────
//
// Semana de domingo a sábado y el período en curso por defecto: los de
// `periodoFinanciero.js`, que es de donde sale el resto de Finanzas. La única
// diferencia es que Pendientes deja avanzar a períodos FUTUROS, porque ahí es
// donde vencen las deudas: sin eso, lo que vence el mes que viene no se podría
// ver. Pagados y Todos no, porque ni un pago ni una deuda pueden tener fecha de
// mañana.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { fechaArgentinaISO, inicioDiaArgentina } from "@/lib/fechas/rangoArgentina";
import { descripcionDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import { tituloDelDia } from "@/lib/transferencias/diasDeTransferencias";

import {
  CORTE_SEMANAL_FINANCIERO,
  DESPLAZAMIENTO_MINIMO,
  descripcionFinanciera,
  desplazamientoFinanciero,
  unidadFinanciera,
} from "./periodoFinanciero";
import { ESTADO_CUENTA, FILTRO_CUENTAS, filtroDeCuentas } from "./pagosProveedores";

// ── EL DESPLAZAMIENTO ───────────────────────────────────────────────────

/** Hacia adelante, el mismo tope que hacia atrás. Solo lo usa Pendientes. */
export const DESPLAZAMIENTO_MAXIMO_PENDIENTES = -DESPLAZAMIENTO_MINIMO;

/**
 * El desplazamiento que se va a usar, con su tope según la pestaña.
 *
 * Hacia atrás y en Pagados y Todos es exactamente el de Finanzas. Solo
 * Pendientes puede pasar de cero.
 */
export function desplazamientoDePagos(valor, filtro) {
  if (filtroDeCuentas(filtro) !== FILTRO_CUENTAS.PENDIENTES) return desplazamientoFinanciero(valor);
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n)) return desplazamientoFinanciero(valor);
  return Math.max(DESPLAZAMIENTO_MINIMO, Math.min(DESPLAZAMIENTO_MAXIMO_PENDIENTES, n));
}

export function puedeAvanzarPagos(desplazamiento, filtro) {
  const tope = filtroDeCuentas(filtro) === FILTRO_CUENTAS.PENDIENTES ? DESPLAZAMIENTO_MAXIMO_PENDIENTES : 0;
  return desplazamientoDePagos(desplazamiento, filtro) < tope;
}

export function puedeRetrocederPagos(desplazamiento, filtro) {
  return desplazamientoDePagos(desplazamiento, filtro) > DESPLAZAMIENTO_MINIMO;
}

// ── EL NOMBRE DEL PERÍODO ───────────────────────────────────────────────

/**
 * Título, subtítulo y rango del período, como los de Finanzas.
 *
 * Hasta el en curso es `descripcionFinanciera` tal cual. Para un período futuro
 * —solo en Pendientes— se pide la misma descripción a la primitiva compartida,
 * con el corte de Finanzas, y se corrige lo único que diría falso: una semana
 * que todavía no empezó no es "Semana cerrada". El día y el mes ya se nombran
 * por su fecha y no mienten.
 */
export function descripcionDePagos({ unidad, desplazamiento = 0, filtro, hoy } = {}) {
  const desp = desplazamientoDePagos(desplazamiento, filtro);
  if (desp <= 0) return descripcionFinanciera({ unidad, desplazamiento: desp, hoy });

  const d = descripcionDelPeriodo({
    unidad: unidadFinanciera(unidad),
    diaDeCorte: CORTE_SEMANAL_FINANCIERO,
    hoy,
    desplazamiento: desp,
  });
  if (d.unidad !== UNIDADES.SEMANA) return d;
  return { ...d, titulo: desp === 1 ? "Semana próxima" : "Semana por venir" };
}

// ── LA FECHA DE CADA CUENTA ─────────────────────────────────────────────

/**
 * El día —"AAAA-MM-DD", en hora argentina— en que la cuenta cae según la
 * pestaña, o `null` si no tiene esa fecha.
 *
 * `vencimientoProveedor` y `saldadaEl` ya llegan como día. `createdAt` es un
 * instante y se pasa a día argentino: una deuda de las 22:00 es de ese día y
 * no del siguiente.
 */
export function diaDeLaCuenta(cuenta, filtro) {
  const f = filtroDeCuentas(filtro);
  if (f === FILTRO_CUENTAS.PENDIENTES) return cuenta?.vencimientoProveedor || null;
  if (f === FILTRO_CUENTAS.PAGADAS) return cuenta?.saldadaEl || null;
  return cuenta?.createdAt ? fechaArgentinaISO(cuenta.createdAt) : null;
}

/**
 * LA CIFRA PRINCIPAL de una cuenta en la lista: una sola.
 *
 * En Pendientes, lo que falta pagar. En Pagados, lo que se pagó, que es el
 * total. En Todos, la deuda que nació, que también es el total: el estado de la
 * fila dice si ya se pagó.
 */
export function importeDeLaCuenta(cuenta, filtro) {
  return filtroDeCuentas(filtro) === FILTRO_CUENTAS.PENDIENTES ? cuenta?.saldo : cuenta?.total;
}

/** ¿Venció? Solo una pendiente con vencimiento anterior a hoy. */
export function cuentaVencida(cuenta, hoy) {
  return Boolean(
    cuenta?.estado !== ESTADO_CUENTA.PAGADA && cuenta?.vencimientoProveedor && cuenta.vencimientoProveedor < hoy
  );
}

// ── LOS GRUPOS ──────────────────────────────────────────────────────────

/** "Sábado 19", desde un día "AAAA-MM-DD" y sin correrse por la zona horaria. */
export function tituloDelDiaDePago(dia) {
  // `tituloDelDia` formatea un INSTANTE en hora argentina. Un día suelto pasado
  // tal cual es la medianoche UTC —las 21:00 del día anterior acá— y el título
  // saldría un día antes. Se le da el comienzo de ese día en Argentina.
  return tituloDelDia(inicioDiaArgentina(dia));
}

function grupo(clave, titulo, cuentas, filtro) {
  const importe = cuentas.reduce((acc, c) => acc + aCentavos(importeDeLaCuenta(c, filtro)), 0);
  return { clave, titulo, cuentas, cantidad: cuentas.length, importe: desdeCentavos(importe) };
}

/**
 * LAS CUENTAS PUESTAS EN EL CALENDARIO DEL PERÍODO.
 *
 * @param {object} args
 * @param {object[]} args.cuentas  serializadas, en el orden de la ruta
 * @param {string}   args.filtro   la pestaña
 * @param {{desde:string, hasta:string}} args.rango  del período, inclusivo
 * @param {string}   args.hoy      "AAAA-MM-DD"
 * @returns {{ vencidas: object|null, dias: object[], sinFecha: object|null }}
 *
 * Los días de Pendientes van del más cercano al más lejano —lo que vence
 * primero, arriba—; los de Pagados y Todos, del más reciente al más viejo, como
 * los de Transferencias. Adentro de cada día, el orden de la ruta.
 */
export function calendarioDeCuentas({ cuentas = [], filtro, rango, hoy } = {}) {
  const f = filtroDeCuentas(filtro);
  const pendientes = f === FILTRO_CUENTAS.PENDIENTES;
  const porDia = new Map();
  const vencidas = [];
  const sinFecha = [];

  for (const c of cuentas || []) {
    const dia = diaDeLaCuenta(c, f);
    if (!dia) {
      if (pendientes) sinFecha.push(c);
      continue;
    }
    if (pendientes && dia < hoy) {
      vencidas.push(c);
      continue;
    }
    if (!rango || dia < rango.desde || dia > rango.hasta) continue;
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(c);
  }

  const claves = [...porDia.keys()].sort();
  if (!pendientes) claves.reverse();

  // Las vencidas, de la que venció hace más a la más reciente: la más atrasada
  // es la que más urge.
  vencidas.sort((a, b) => (a.vencimientoProveedor < b.vencimientoProveedor ? -1 : a.vencimientoProveedor > b.vencimientoProveedor ? 1 : 0));

  return {
    vencidas: vencidas.length ? grupo("vencidas", "Vencidas", vencidas, f) : null,
    dias: claves.map((dia) => grupo(dia, tituloDelDiaDePago(dia), porDia.get(dia), f)),
    sinFecha: sinFecha.length ? grupo("sin-fecha", "Sin fecha de vencimiento", sinFecha, f) : null,
  };
}

/**
 * El total de los días del período: lo que va grande en el resumen. Las
 * vencidas y las sin fecha NO suman acá —no son del período— y se cuentan
 * aparte para el aviso.
 */
export function totalDelPeriodo(calendario) {
  const dias = calendario?.dias || [];
  const importe = dias.reduce((acc, d) => acc + aCentavos(d.importe), 0);
  return { cantidad: dias.reduce((acc, d) => acc + d.cantidad, 0), importe: desdeCentavos(importe) };
}

/** "1 cuenta", "3 cuentas". */
export function rotuloDeCuentas(n) {
  return `${n} ${n === 1 ? "cuenta" : "cuentas"}`;
}

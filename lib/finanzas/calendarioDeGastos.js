// lib/finanzas/calendarioDeGastos.js
//
// DÓNDE CAE CADA GASTO EN LA LISTA, Y QUÉ SE LE PIDE A LA API. Puro.
//
// ── UNA SOLA FECHA: LA DEL GASTO ─────────────────────────────────────────
//
// A diferencia de una cuenta por pagar, un gasto no se ubica por vencimiento ni
// por pago: se ubica por su `fecha`, el día al que corresponde. Es la fecha que
// filtra la API (`fechaDesde` / `fechaHasta`) y la que pone cada gasto en su
// día. Así el período de la pantalla y el de la consulta son el mismo.
//
// ── ANTERIORES CON SALDO, Y POR QUÉ ES UNA SEGUNDA CONSULTA ──────────────
//
// Filtrar por la fecha del gasto hace que un gasto de hace dos semanas que
// todavía debe plata desaparezca de "esta semana". En Pagos eso lo resuelven
// las Vencidas; acá, en Pendientes, se pide aparte lo pendiente ANTERIOR al
// comienzo del período —`fechaHasta` es el día antes de `desde`— y va en su
// banda arriba. Las dos consultas no se pisan por construcción, y además se
// descartan ids repetidos: un gasto está en un solo lugar de la lista.
//
// ── EL TOPE DE LA API ────────────────────────────────────────────────────
//
// La API pagina: se piden hasta `PAGE_SIZE_MAX` por consulta, y si el total
// dice que hay más, la pantalla lo avisa en vez de cortar callada.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { PAGE_SIZE_MAX } from "@/lib/turnos/filtrosListado";
import { sumarDias } from "@/lib/transferencias/periodoDePago";
import { normalizarTexto } from "@/lib/productos/busquedaFuzzyProducto";

import { importeDeLaCuenta, tituloDelDiaDePago } from "./calendarioDePagos";
import { ESTADO_CUENTA, FILTRO_CUENTAS, filtroDeCuentas } from "./pagosProveedores";

/** Cuántos se piden por consulta: el máximo que acepta la API. */
export const GASTOS_POR_CONSULTA = PAGE_SIZE_MAX;

/**
 * El estado de un GASTO: "Pagado", no "Pagada". La API manda el rótulo de una
 * cuenta —femenino— y el estado es el mismo; lo que cambia es el género.
 */
export const ROTULO_ESTADO_GASTO = Object.freeze({
  [ESTADO_CUENTA.PENDIENTE]: "Pendiente",
  [ESTADO_CUENTA.PARCIAL]: "Parcial",
  [ESTADO_CUENTA.PAGADA]: "Pagado",
});

// ── LAS CONSULTAS ────────────────────────────────────────────────────────

/**
 * Los parámetros de la consulta del PERÍODO: la pestaña, la categoría y el
 * rango del período sobre la FECHA DEL GASTO.
 */
export function consultaDelPeriodo({ filtro, rango, categoriaId = null } = {}) {
  const qs = new URLSearchParams();
  qs.set("estado", filtroDeCuentas(filtro));
  if (rango?.desde) qs.set("fechaDesde", rango.desde);
  if (rango?.hasta) qs.set("fechaHasta", rango.hasta);
  if (categoriaId) qs.set("categoriaId", String(categoriaId));
  qs.set("pageSize", String(GASTOS_POR_CONSULTA));
  return qs.toString();
}

/**
 * Los de ANTES del período que todavía tienen saldo, o `null` si no
 * corresponde pedirlos: solo en Pendientes, y solo si el período tiene
 * comienzo. Pendientes en la API ya es "con saldo", parciales incluidos.
 */
export function consultaDeAnteriores({ filtro, rango, categoriaId = null } = {}) {
  if (filtroDeCuentas(filtro) !== FILTRO_CUENTAS.PENDIENTES || !rango?.desde) return null;
  const qs = new URLSearchParams();
  qs.set("estado", FILTRO_CUENTAS.PENDIENTES);
  qs.set("fechaHasta", sumarDias(rango.desde, -1));
  if (categoriaId) qs.set("categoriaId", String(categoriaId));
  qs.set("pageSize", String(GASTOS_POR_CONSULTA));
  return qs.toString();
}

/** ¿La respuesta trajo menos de los que hay? Entonces la lista está incompleta. */
export function respuestaIncompleta(respuesta) {
  const total = Number(respuesta?.paginacion?.total ?? 0);
  return total > (respuesta?.gastos?.length ?? 0);
}

// ── LA BÚSQUEDA ──────────────────────────────────────────────────────────

/**
 * ¿El gasto coincide con lo que se escribió? Concepto, beneficiario y
 * comprobante —lo mismo que busca la API—, sin acentos ni mayúsculas, con
 * `normalizarTexto`, como el buscador de Pagos. Vacío coincide con todo.
 */
export function gastoCoincideConBusqueda(gasto, texto) {
  const buscado = normalizarTexto(String(texto ?? ""));
  if (!buscado) return true;
  const donde = normalizarTexto([gasto?.concepto, gasto?.beneficiario, gasto?.comprobanteNumero].join(" "));
  return donde.includes(buscado);
}

// ── LOS GRUPOS ───────────────────────────────────────────────────────────

/** "1 gasto", "3 gastos". */
export function rotuloDeGastos(n) {
  return `${n} ${n === 1 ? "gasto" : "gastos"}`;
}

/**
 * Un grupo con la forma de los de Pagos —`clave`, `titulo`, `cantidad`,
 * `importe`— para que `totalDelPeriodo` y `DiaConBanda` lo lean igual. La
 * cifra de cada gasto es `importeDeLaCuenta`: el saldo en Pendientes, el total
 * en Pagados y en Todos.
 */
function grupo(clave, titulo, gastos, filtro) {
  const importe = gastos.reduce((acc, g) => acc + aCentavos(importeDeLaCuenta(g, filtro)), 0);
  return { clave, titulo, gastos, cantidad: gastos.length, importe: desdeCentavos(importe) };
}

/**
 * LOS GASTOS PUESTOS EN LA LISTA.
 *
 * @param {object} args
 * @param {object[]} args.gastos      los del período, como los mandó la API
 * @param {object[]} [args.anteriores] los pendientes de antes del período
 * @param {string}   args.filtro      la pestaña
 * @returns {{ anteriores: object|null, dias: object[] }}
 *
 * Los días van del más reciente al más viejo, como la API los ordena; adentro
 * de cada día, el orden de la API. Un id que ya está en el período no se repite
 * en Anteriores.
 */
export function calendarioDeGastos({ gastos = [], anteriores = [], filtro } = {}) {
  const f = filtroDeCuentas(filtro);
  const porDia = new Map();
  const vistos = new Set();
  for (const g of gastos || []) {
    if (!g?.fecha || vistos.has(g.id)) continue;
    vistos.add(g.id);
    if (!porDia.has(g.fecha)) porDia.set(g.fecha, []);
    porDia.get(g.fecha).push(g);
  }
  const antes = [];
  for (const g of anteriores || []) {
    if (!g || vistos.has(g.id)) continue;
    vistos.add(g.id);
    antes.push(g);
  }
  const claves = [...porDia.keys()].sort().reverse();
  return {
    anteriores: antes.length ? grupo("anteriores", "Anteriores con saldo", antes, f) : null,
    dias: claves.map((dia) => grupo(dia, tituloDelDiaDePago(dia), porDia.get(dia), f)),
  };
}

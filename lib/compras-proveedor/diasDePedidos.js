// LOS PEDIDOS QUE ESPERAN MERCADERÍA, AGRUPADOS POR DÍA.
//
// ── POR LA FECHA DE ENVÍO, Y NO ES UN DETALLE ─────────────────────────────
//
// La pantalla se llama "Recibir mercadería" y la tentación es agrupar por la
// fecha en que la mercadería llega. Esa fecha NO EXISTE todavía: lo que se está
// mirando es justamente lo que no llegó. Agrupar por un campo vacío pone todo
// en un solo montón con rótulo "—".
//
// La fecha de envío contesta la pregunta que se hace quien abre la pantalla:
// hace cuánto que pedí esto y cuánto hace que espera.
//
// ── EL RÓTULO SE ARMA ACÁ Y NO EN EL COMPONENTE ───────────────────────────
//
// "Sábado 19" sale de la fecha, y la fecha se normaliza a la zona horaria
// argentina UNA vez, al agrupar. Si cada tarjeta lo hiciera por su cuenta, dos
// pedidos del mismo día podrían caer en dos grupos por un huso aplicado dos
// veces — es el error que `caeEnElPeriodo` ya tiene documentado.
//
// Módulo puro: sin React y sin Prisma.

import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

const DIAS = Object.freeze([
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
]);

/** "Sábado 19", que es lo que pide el encabezado del grupo. */
export function rotuloDelDia(iso) {
  if (!iso) return "—";
  const [a, m, d] = String(iso).split("-").map(Number);
  if (!a || !m || !d) return "—";
  // `Date.UTC` y `getUTCDay`: la fecha ya viene normalizada a Argentina, así
  // que volver a pasarla por la zona local del navegador la correría un día.
  const nombre = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()] || "";
  return `${nombre} ${d}`;
}

/** La fecha con la que un pedido se agrupa: cuándo se mandó. */
export function fechaDeAgrupacion(pedido) {
  const cruda = pedido?.fechaEnviado || pedido?.createdAt || null;
  if (!cruda) return null;
  return typeof cruda === "string" && cruda.length === 10 ? cruda : fechaArgentinaISO(cruda);
}

/**
 * Agrupa por día, del más reciente al más viejo, con el subtotal de cada día.
 *
 * @returns {Array<{ fecha: string, rotulo: string, total: number, pedidos: object[] }>}
 */
export function agruparPedidosPorDia(pedidos = []) {
  const porDia = new Map();

  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    const fecha = fechaDeAgrupacion(p);
    if (!fecha) continue;
    if (!porDia.has(fecha)) porDia.set(fecha, []);
    porDia.get(fecha).push(p);
  }

  return [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([fecha, delDia]) => ({
      fecha,
      rotulo: rotuloDelDia(fecha),
      // El subtotal del día suma los ESTIMADOS de sus pedidos. Una línea sin
      // costo no suma cero: no suma, igual que en el texto del pedido.
      total: delDia.reduce((acc, p) => acc + (Number(p.totalEstimado) || 0), 0),
      pedidos: delDia,
    }));
}

/**
 * Cuántos días hace que espera el más viejo de la lista.
 *
 * Devuelve `null` con la lista vacía y no 0: "hace 0 días" y "no hay nada
 * esperando" son dos cosas distintas, y la tarjeta del total las dice distinto.
 */
export function diasEsperando(pedidos = [], hoy) {
  const fechas = (Array.isArray(pedidos) ? pedidos : [])
    .map(fechaDeAgrupacion)
    .filter(Boolean)
    .sort();
  if (fechas.length === 0) return null;

  const base = hoy || hoyArgentinaISO();
  const aUtc = (iso) => {
    const [a, m, d] = String(iso).split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  const dif = Math.round((aUtc(base) - aUtc(fechas[0])) / 86400000);
  return dif >= 0 ? dif : 0;
}

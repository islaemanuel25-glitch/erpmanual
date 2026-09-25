// lib/fechas/diaISO.js
//
// UN DÍA ISO ("2026-10-04") ESCRITO PARA LEER, SIN PASAR POR `Date`.
//
// ── POR QUÉ NO `fechaAR` ───────────────────────────────────────────────────
//
// `fechaAR` y `fechaLargaAR` (`formatearFechaHora.js`) reciben un INSTANTE y lo
// pasan a la hora argentina. Un día ISO no es un instante: `new Date("2026-10-04")`
// es la medianoche UTC, que en Argentina son las 21:00 del día ANTERIOR. Un
// cambio de semana que empieza el domingo 4 se leería "sábado 3". Acá se parte el
// texto y listo: no hay zona que aplicar porque el día ya es argentino.
//
// Salió de `lib/finanzas/pagosProveedores.js`, donde nació para los vencimientos;
// la semana operativa necesita lo mismo, y un helper de fechas no puede vivir en
// un dominio que otro tenga que importar para escribir un día.

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2026-10-04" → "04/10/2026". Lo que no es un día ISO devuelve `vacio`.
 */
export function diaLegible(iso, { vacio = "—" } = {}) {
  const m = SOLO_FECHA.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : vacio;
}

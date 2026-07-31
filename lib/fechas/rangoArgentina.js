// Helpers de rango de fechas en zona horaria Argentina (UTC-3, sin DST).
// Se usan para que los filtros de "del día X" no se desplacen un día cuando
// el contenedor corre en UTC.

const TZ_AR = "America/Argentina/Cordoba";

// Devuelve la fecha (en Argentina) como string YYYY-MM-DD para cualquier Date.
// No usar toISOString() porque toma UTC.
export function fechaArgentinaISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

// Día actual en Argentina (alias de fechaArgentinaISO(new Date())).
export function hoyArgentinaISO() {
  return fechaArgentinaISO(new Date());
}

function normalizar(fecha) {
  if (!fecha) return hoyArgentinaISO();
  // Aceptar tanto YYYY-MM-DD como YYYY-MM-DDTHH:mm:ss...
  return String(fecha).slice(0, 10);
}

// Devuelve { fechaInicio, fechaFin } como objetos Date que representan
// 00:00:00.000 y 23:59:59.999 hora Argentina del rango pedido.
export function getRangoArgentina(fechaDesde, fechaHasta) {
  const desde = normalizar(fechaDesde);
  const hasta = normalizar(fechaHasta);

  return {
    fechaInicio: new Date(`${desde}T00:00:00.000-03:00`),
    fechaFin: new Date(`${hasta}T23:59:59.999-03:00`),
  };
}

// ============================================================
// Límites INDEPENDIENTES de día calendario argentino
//
// getRangoArgentina() completa con "hoy" lo que falte, que es lo correcto para
// una pantalla que siempre muestra un rango. No sirve cuando cada extremo es
// opcional por separado: ahí, rellenar con hoy inventaría un tope que el usuario
// no pidió (pedir "desde el 01/07, sin tope" terminaría cortando en hoy).
//
// Estas dos devuelven `null` cuando no hay fecha, para que el llamador pueda
// omitir ese extremo del filtro.
//
// El offset -03:00 es EXPLÍCITO a propósito: `new Date("2026-07-30T23:59:59")`
// se interpreta en la zona del proceso, y los contenedores corren en UTC. Eso
// hacía que "hasta el 30/07" cortara a las 20:59:59 hora argentina y escondiera
// todo lo hecho entre las 21:00 y la medianoche.
// ============================================================

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function limite(fecha, horaConOffset) {
  if (!fecha) return null;
  const dia = String(fecha).slice(0, 10);
  // Una fecha con formato inesperado se ignora en vez de producir un
  // `Invalid Date`, que en una consulta Prisma reventaría el listado entero.
  if (!SOLO_FECHA.test(dia)) return null;
  const d = new Date(`${dia}T${horaConOffset}`);
  return isNaN(d.getTime()) ? null : d;
}

/** Inicio del día argentino. "2026-07-30" → 2026-07-30T03:00:00.000Z */
export function inicioDiaArgentina(fecha) {
  return limite(fecha, "00:00:00.000-03:00");
}

/** Fin del día argentino. "2026-07-30" → 2026-07-31T02:59:59.999Z */
export function finDiaArgentina(fecha) {
  return limite(fecha, "23:59:59.999-03:00");
}

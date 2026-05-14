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

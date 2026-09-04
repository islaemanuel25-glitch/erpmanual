// lib/ofertas/formato.js
//
// Cómo se escriben las fechas y los importes de una oferta en pantalla.
//
// Vive en el kit y no en cada componente por lo de siempre: si la lista y el
// detalle formatean por su cuenta, la misma oferta se lee "04/09 → 11/09" en una
// pantalla y "4 de septiembre" en la otra, y nadie se entera hasta que alguien
// compara. Acá hay una sola forma.
//
// ── LA ZONA HORARIA ES EXPLÍCITA, SIEMPRE ──────────────────────────────────
//
// El contenedor corre en UTC. Una fecha formateada sin decir la zona sale con
// tres horas de menos, y una oferta que termina el 11 a las 23:00 argentinas se
// mostraría terminando el 12. Es el mismo motivo por el que `rangoArgentina.js`
// escribe el offset a mano en vez de confiar en el reloj del proceso.

const TZ_AR = "America/Argentina/Cordoba";

function aFecha(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ausente de verdad. `Number(null)` es 0 y `Number("")` también, así que sin
 * esto un importe que no vino se imprimiría como "$0,00" y un porcentaje que no
 * existe como "0 %" — los dos son afirmaciones, no ausencias, y las dos mienten.
 * Es el mismo agujero que ya apareció en el detector de cambios de costo.
 */
function ausente(v) {
  return v == null || v === "";
}

/**
 * Las partes de la fecha en hora argentina, ya rellenadas a dos dígitos.
 *
 * NO se usa `format()` con `{day:"2-digit", month:"2-digit"}` y listo, aunque
 * sea lo obvio: con un pedido parcial gana el patrón del locale y devuelve
 * "4/9". Se comprobó corriéndolo, no leyéndolo. Con `formatToParts` se arma la
 * cadena a mano y el relleno queda garantizado.
 */
function partesAR(d) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  return {
    anio: g("year"),
    mes: g("month"),
    dia: g("day"),
    // Algunos entornos devuelven "24" para la medianoche; el reloj de la
    // pantalla y el input esperan "00".
    hora: g("hour") === "24" ? "00" : g("hour"),
    minuto: g("minute"),
  };
}

/** "04/09" — día y mes, para la vigencia de la tarjeta. */
export function fechaCorta(valor) {
  const d = aFecha(valor);
  if (!d) return "—";
  const { dia, mes } = partesAR(d);
  return `${dia}/${mes}`;
}

/** "04/09/2026 08:30" — para el detalle, donde la hora importa. */
export function fechaHora(valor) {
  const d = aFecha(valor);
  if (!d) return "—";
  const { dia, mes, anio, hora, minuto } = partesAR(d);
  return `${dia}/${mes}/${anio} ${hora}:${minuto}`;
}

/** "04/09 → 11/09", como en el ejemplo del pedido. */
export function formatearRangoOferta(inicio, fin) {
  return `${fechaCorta(inicio)} → ${fechaCorta(fin)}`;
}

/**
 * Importe en pesos, con separador de miles argentino y dos decimales.
 * Se pasa por acá y no por `toLocaleString` suelto para que un importe no salga
 * con coma decimal en una pantalla y con punto en otra.
 */
export function pesos(valor) {
  if (ausente(valor)) return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "10 %" / "-26,15 %". Devuelve "—" si no hay número, nunca "NaN %" ni "0 %". */
export function porcentaje(valor, { conSigno = false } = {}) {
  if (ausente(valor)) return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  const signo = conSigno && n > 0 ? "+" : "";
  return `${signo}${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}

/**
 * Para el campo de fecha y hora del formulario: convierte una fecha a la cadena
 * `YYYY-MM-DDTHH:mm` que espera un input, EN HORA ARGENTINA.
 *
 * `toISOString().slice(0,16)` sería lo obvio y está mal: devuelve UTC, así que
 * abrir una oferta que empieza a las 08:00 mostraría las 11:00 y guardarla sin
 * tocar nada la correría tres horas.
 */
export function paraInputFechaHora(valor) {
  const d = aFecha(valor);
  if (!d) return "";
  const { anio, mes, dia, hora, minuto } = partesAR(d);
  return `${anio}-${mes}-${dia}T${hora}:${minuto}`;
}

/**
 * Y la vuelta: lo que escribió la persona en el input es hora ARGENTINA, y hay
 * que mandarlo con su offset para que el servidor no lo lea como UTC.
 */
export function desdeInputFechaHora(texto) {
  const t = String(texto || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return null;
  const d = new Date(`${t}:00.000-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

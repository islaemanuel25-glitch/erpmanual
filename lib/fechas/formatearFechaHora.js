// LA HORA SE MUESTRA EN UN SOLO LUGAR, Y SIEMPRE IGUAL.
//
// ── LOS DOS PROBLEMAS QUE RESUELVE, QUE SON DISTINTOS ────────────────────────
//
// 1) LA ZONA. Todo el stack corre en UTC —PostgreSQL en `Etc/UTC`, el contenedor
//    sin `TZ`, el host en UTC— y las columnas son `timestamp without time zone`.
//    Argentina es UTC−3, así que TODO lo guardado está tres horas adelante de la
//    hora local. Un `toLocaleString` sin `timeZone` usa la zona DEL DISPOSITIVO:
//    en una Sunmi configurada en Argentina sale bien y en una que quedó en UTC
//    sale tres horas de más, sin que nada avise.
//
//    Medido con la venta 7726 —guardada 14:16:40, que en Argentina son las
//    11:16—: el detalle de la venta mostraba 11:16 y el ticket, con el
//    dispositivo en UTC, mostraba 14:16. La misma venta, dos horas distintas.
//
// 2) EL FORMATO DE 12 HORAS. Sin `hour12: false` el ICU devuelve "11:16 a. m."
//    para es-AR. Eso ya estaba detectado en el proyecto —`PanelesCierre.jsx` lo
//    dice textual: *"`hour12: false` es explícito y no un detalle de estilo"*— y
//    arreglado en cinco lugares, pero 41 de los 46 archivos que muestran hora no
//    lo tenían.
//
//    Y hay un caso peor que el sufijo, medido en el ticket PDF: un
//    `toLocaleString("es-AR")` SIN opciones devuelve **"02:16:40"** para las
//    14:16. No dice "p. m." ni nada: son las dos y cuarto, y no se distinguen de
//    las dos de la mañana. Eso está impreso en el único papel que sale de la
//    empresa.
//
// ── POR QUÉ UN HELPER Y NO UNA REGLA ESCRITA ────────────────────────────────
//
// Porque una regla escrita se cumple hasta que alguien escribe la línea 73. Con
// el helper hay UN lugar donde vive la zona y el formato de 24 horas, y un
// candado —`horaUnica.test.mjs`— que cuenta los archivos que todavía formatean
// por su cuenta y no deja que ese número suba.

export const TZ_AR = "America/Argentina/Cordoba";

// Las tres opciones que NO se negocian y por eso viven acá y no en cada llamada.
const BASE = { timeZone: TZ_AR, hour12: false };

function aFecha(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * "19/08/2026 11:16" — lo que se muestra en casi todas las pantallas.
 *
 * El separador es un espacio y no una coma: `Intl` mete ", " entre fecha y hora
 * y en una tarjeta angosta eso empuja el renglón. Se arma con `formatToParts`
 * para no depender de cómo el ICU decida unirlas.
 */
export function fechaHoraAR(valor, { vacio = "—" } = {}) {
  const d = aFecha(valor);
  if (!d) return vacio;
  return `${fechaAR(d)} ${horaAR(d)}`;
}

/** "19/08/2026 11:16:40" — para el ticket y la auditoría, donde el segundo importa. */
export function fechaHoraSegundosAR(valor, { vacio = "—" } = {}) {
  const d = aFecha(valor);
  if (!d) return vacio;
  return `${fechaAR(d)} ${horaAR(d, { segundos: true })}`;
}

/** "19/08/2026" */
export function fechaAR(valor, { vacio = "—" } = {}) {
  const d = aFecha(valor);
  if (!d) return vacio;
  return new Intl.DateTimeFormat("es-AR", {
    ...BASE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * "miércoles" — el día de la semana.
 *
 * Está acá y no como un `toLocaleDateString` suelto porque el día TAMBIÉN se
 * desplaza con la zona: una venta de las 22:00 en Argentina es del día siguiente
 * en UTC, así que sin la zona el nombre del día sale cambiado justo en las ventas
 * de la noche, que son las que más se miran al cerrar el turno.
 */
export function diaSemanaAR(valor, { vacio = "" } = {}) {
  const d = aFecha(valor);
  if (!d) return vacio;
  return new Intl.DateTimeFormat("es-AR", { ...BASE, weekday: "long" }).format(d);
}

/**
 * "04/09" — día y mes, sin año.
 *
 * Es lo que necesita una vigencia corta ("04/09 → 11/09"), donde el año ocupa
 * lugar y no agrega nada: las dos puntas son del mismo año y se están mirando
 * juntas. Vive acá y no en el módulo que lo necesitaba porque una fecha
 * formateada a mano en otro archivo es una fecha sin zona horaria, y el
 * contenedor corre en UTC: una oferta que termina el 11 a las 23:00 argentinas
 * se mostraría terminando el 12.
 *
 * EL LOCALE ES `en-CA` Y NO `es-AR`, Y NO ES UN DESCUIDO. Con un pedido parcial
 * —día y mes, sin año— gana el patrón del locale y `es-AR` devuelve "4/9" y
 * "11/9", sin el relleno que se le pidió. `en-CA` lo respeta. Se comprobó
 * corriéndolo con TZ=UTC, que es como corre el contenedor, no leyéndolo: la
 * primera versión de esta función pedía `es-AR` y daba "4/9".
 *
 * La ZONA sigue siendo la argentina: el locale decide cómo se escriben los
 * números, `timeZone` decide qué día es. Son dos cosas distintas y solo la
 * segunda cambia la fecha.
 */
export function diaMesAR(valor, { vacio = "—" } = {}) {
  const d = aFecha(valor);
  if (!d) return vacio;
  const partes = new Intl.DateTimeFormat("en-CA", {
    ...BASE,
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(d);
  const g = (t) => partes.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}`;
}

/**
 * "2026-09-04T08:30" — el valor de un `<input type="datetime-local">`, EN HORA
 * ARGENTINA.
 *
 * No es un formato de pantalla y por eso no se parece a los de arriba: es el
 * único que el navegador acepta en ese input. `toISOString().slice(0,16)` sería
 * lo obvio y está mal — devuelve UTC, así que abrir una oferta que empieza a las
 * 08:00 mostraría las 11:00, y guardarla sin tocar nada la correría tres horas.
 *
 * Mismo locale `en-CA` que `diaMesAR` y por el mismo motivo: es el que respeta
 * el relleno a dos dígitos que se le pide.
 *
 * Devuelve cadena VACÍA y no "—" cuando no hay fecha: esto alimenta un input, y
 * un guion largo ahí no es un valor válido.
 */
export function paraInputDateTimeLocalAR(valor) {
  const d = aFecha(valor);
  if (!d) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    ...BASE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const g = (t) => partes.find((x) => x.type === t)?.value ?? "";
  // Algunos entornos devuelven "24" para la medianoche; el input espera "00".
  const hora = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")}T${hora}:${g("minute")}`;
}

/** "11:16" o "11:16:40". SIEMPRE en 24 horas y SIEMPRE en hora de Argentina. */
export function horaAR(valor, { segundos = false, vacio = "—" } = {}) {
  const d = aFecha(valor);
  if (!d) return vacio;
  return new Intl.DateTimeFormat("es-AR", {
    ...BASE,
    hour: "2-digit",
    minute: "2-digit",
    ...(segundos ? { second: "2-digit" } : {}),
  }).format(d);
}

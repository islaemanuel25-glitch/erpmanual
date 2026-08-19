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

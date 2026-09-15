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

// LAS FECHAS SE PIDEN AL KIT DE FECHAS, NO SE ARMAN ACÁ.
//
// Este archivo tenía su propio `partesAR` con su propio `Intl.DateTimeFormat`, y
// un candado lo encontró: `lib/fechas/horaUnica.test.mjs` prohíbe que un archivo
// nuevo formatee la hora por su cuenta, porque sin la zona sale la del
// dispositivo y sin `hour12:false` sale con "a. m.".
//
// La función que faltaba —día y mes sin año— se agregó al kit en vez de dejarla
// acá, que es lo que corresponde cuando una pantalla necesita algo que el kit no
// tiene. Y se movió TAL CUAL estaba, con su locale `en-CA` incluido: pedirle
// `{day, month}` a `es-AR` devuelve "4/9" sin relleno, y eso ya estaba
// comprobado corriéndolo en el código de donde salió.
import {
  diaMesAR,
  fechaHoraAR,
  paraInputDateTimeLocalAR,
} from "@/lib/fechas/formatearFechaHora.js";

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

/** "04/09" — día y mes, para la vigencia de la tarjeta. */
export function fechaCorta(valor) {
  const d = aFecha(valor);
  if (!d) return "—";
  return diaMesAR(d);
}

/** "04/09/2026 08:30" — para el detalle, donde la hora importa. */
export function fechaHora(valor) {
  const d = aFecha(valor);
  if (!d) return "—";
  return fechaHoraAR(d);
}

/** "04/09 → 11/09", como en el ejemplo del pedido. */
export function formatearRangoOferta(inicio, fin) {
  return `${fechaCorta(inicio)} → ${fechaCorta(fin)}`;
}

/**
 * LA ÚNICA FORMA DE ESCRIBIR UN IMPORTE EN ESTE MÓDULO.
 *
 * ── EL ESPACIO DESPUÉS DEL SIGNO NO ES UN DETALLE ────────────────────────
 *
 * Hasta acá el módulo tenía DOS: esta escribía `$3.700,00` y `money`, en
 * `crearOfertaMovil.js`, escribía `$ 3.700,00` con espacio. El mismo importe se
 * leía distinto en el detalle y en la lista, que es exactamente lo que este
 * archivo dice en su encabezado que existe para impedir.
 *
 * Queda la forma CON ESPACIO, que es la de las pantallas nuevas. `money` pasa a
 * llamar a ésta: una sola implementación y dos políticas de ausencia, que es
 * una distinción real y no una duplicación —ver abajo—.
 */
function importeAR(n) {
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Importe para MOSTRAR. Lo ausente se dice como ausente: "—", no "$ 0,00".
 *
 * Es la diferencia con `money`, que se usa donde se está TIPEANDO un número y
 * ahí un cero es un estado legítimo. Las dos comparten el formato; lo que no
 * comparten es qué hacer cuando no hay dato, y eso no es un descuido.
 */
export function pesos(valor) {
  if (ausente(valor)) return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return importeAR(n);
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
  return paraInputDateTimeLocalAR(valor);
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

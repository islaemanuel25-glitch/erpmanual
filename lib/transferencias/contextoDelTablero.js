// lib/transferencias/contextoDelTablero.js
//
// DÓNDE ESTABA PARADA LA PERSONA EN EL TABLERO, SERIALIZADO EN LA URL.
//
// ── EL DEFECTO QUE ESTO CIERRA, CON SU NÚMERO ───────────────────────────
//
// Entrar a una transferencia y volver perdía TODO: el local, el chip, el
// período al que se había navegado con las flechas. Con 33 transferencias sin
// recibir de una semana pasada, eso es renavegar después de cada una.
//
// Eran dos causas a la vez y las dos hacían falta:
//
//   1. el período vivía en `useState` adentro de `useCuentaDeLocal`, así que se
//      perdía POR CONSTRUCCIÓN al desmontar la pantalla;
//   2. y "Volver" era un `router.push` a la lista pelada —`SunmiBackButton` con
//      `href` empuja, no vuelve— así que ni el back del navegador ayudaba.
//
// ── POR QUÉ LA URL Y NO `sessionStorage` ────────────────────────────────
//
// Porque con el contexto en la URL el back del navegador funciona solo, el botón
// "Volver" es un link como cualquier otro, y un enlace a un período concreto se
// puede compartir. Es lo que hace Ventas con `returnParams.js`.
//
// ── Y POR QUÉ NO SE REUSÓ NINGUNA DE LAS TRES QUE YA EXISTEN ────────────
//
// El repo ya resuelve este mismo problema en tres lugares, y **ninguna sirve tal
// cual**. Está medido y anotado en
// `docs/architecture/volver-al-mismo-lugar.md`; en corto:
//
//   · `lib/reportes-ventas/returnParams.js` — la forma es exactamente ésta, pero
//     su whitelist son `tab`, `formas`, `fechaDesde/Hasta` y `page`, y su base
//     está cableada a `/modulos/reportes-ventas`. No acepta otras claves.
//   · `lib/productos/estadoDeRetorno.js` — es `sessionStorage` versionado con
//     vencimiento, más un ancla en el DOM. Resuelve el ELEMENTO, no el contexto,
//     y va por otro canal.
//   · el `leerContextoRetorno` de `app/modulos/transferencias/page.jsx` — está
//     escrito adentro del archivo y es del REPORTE de escritorio, que decidió a
//     propósito no escribir la URL para no entrar en loops estado↔URL.
//
// Así que este archivo es el cuarto, y por eso el documento existe: para que el
// próximo lo lea antes de escribir el quinto.
//
// ── NO ACEPTA UNA RUTA DE VUELTA ────────────────────────────────────────
//
// Nada de `returnTo`. Lo que viaja es `local`, un entero, y de ahí se DERIVA la
// ruta: con local, la cuenta de ese local; sin local, la propia. Una URL que
// viene de afuera no puede elegir a dónde vuelve el botón.

import { UNIDADES } from "./periodoDePago";

/** La ruta del tablero de un local que mira SU cuenta. */
export const RUTA_CUENTA = "/modulos/transferencias/cuenta";
/** Y la del depósito mirando la de un local. */
export const RUTA_LOCAL = "/modulos/transferencias/local";
/** El detalle de una transferencia. */
export const RUTA_DETALLE = "/modulos/transferencias";

/**
 * EL PERÍODO QUE SE ABRE POR DEFECTO: el que acaba de cerrar, no el en curso.
 *
 * La pregunta del tablero es cuánto hay que cobrar, y eso se contesta con el
 * período TERMINADO. Vive acá y no en el hook porque ahora también lo necesita
 * quien lee la URL para saber si hay algo distinto del default que serializar.
 */
export const DESPLAZAMIENTO_POR_DEFECTO = -1;

const UNIDADES_VALIDAS = new Set(Object.values(UNIDADES));

// Un tope, para que una URL pegada a mano no pida diez mil períodos atrás. Dos
// años de semanas alcanza de sobra para cualquier cobro pendiente.
const DESPLAZAMIENTO_MINIMO = -120;

function leer(input) {
  if (input && typeof input.get === "function") return (k) => input.get(k);
  if (input && typeof input === "object") return (k) => input[k];
  return () => null;
}

/**
 * AUSENTE DE VERDAD, y esto se cobró en el primer intento.
 *
 * `URLSearchParams.get` devuelve **null** cuando la clave no está, y
 * `Number(null)` es **0**. Sin este filtro, una URL sin `desp` daba
 * `desp = 0` —el período EN CURSO— en vez del default, que es el CERRADO. La
 * pantalla abría en el período equivocado.
 *
 * Y no se veía en los candados: con un objeto plano la clave ausente da
 * `undefined`, y `Number(undefined)` es `NaN`, que sí se descarta. O sea que la
 * forma del dato de prueba no era la forma del dato real — el defecto que
 * `CLAUDE.md` marca como el que más se repite. Lo encontró el arnés.
 */
function ausente(v) {
  return v === null || v === undefined || v === "";
}

/**
 * Parsea y VALIDA el contexto. Todo lo que no reconoce, lo descarta.
 *
 * Devuelve siempre un objeto completo —con los defaults puestos— para que quien
 * lo use no tenga que volver a decidir qué hacer con lo que faltó.
 */
export function parseContextoDelTablero(input) {
  const get = leer(input);

  const u = String(get("unidad") ?? "");
  const unidad = UNIDADES_VALIDAS.has(u) ? u : UNIDADES.SEMANA;

  const dRaw = get("desp");
  const d = ausente(dRaw) ? NaN : Number(dRaw);
  const desp =
    Number.isInteger(d) && d <= 0 && d >= DESPLAZAMIENTO_MINIMO ? d : DESPLAZAMIENTO_POR_DEFECTO;

  const lRaw = get("local");
  const l = ausente(lRaw) ? NaN : Number(lRaw);
  const local = Number.isInteger(l) && l > 0 ? l : null;

  return { unidad, desp, local };
}

/**
 * ¿ESTA URL VIENE DEL TABLERO?
 *
 * ── POR QUÉ HACE FALTA PREGUNTARLO ──────────────────────────────────────
 *
 * Al detalle de una transferencia se llega por DOS caminos: el tablero del
 * teléfono y la tabla del reporte de escritorio. El segundo ya tiene su propio
 * retorno —`sessionStorage`, que el listado hidrata al montarse— y funciona.
 *
 * Si el botón "Volver" mandara siempre al tablero, el reporte perdería su
 * contexto: es el mismo defecto que esta tanda arregla, cambiado de lado.
 *
 * Se mira si HAY alguno de los parámetros, no si el contexto es distinto del
 * default: venir del tablero en el período por defecto es legítimo y no escribe
 * nada en la URL… por eso el tablero SIEMPRE manda `local` o, si es la cuenta
 * propia, la marca de abajo.
 */
export const MARCA_TABLERO = "tab";

export function vinoDelTablero(input) {
  const get = leer(input);
  return ["unidad", "desp", "local", MARCA_TABLERO].some((k) => {
    const v = get(k);
    return v !== null && v !== undefined && v !== "";
  });
}

/** ¿Este contexto es el de una pantalla recién abierta? */
export function esContextoPorDefecto({ unidad, desp } = {}) {
  return unidad === UNIDADES.SEMANA && desp === DESPLAZAMIENTO_POR_DEFECTO;
}

/**
 * Los parámetros, como cadena. Vacía cuando no hay nada que decir.
 *
 * ── LOS DEFAULTS NO SE ESCRIBEN ─────────────────────────────────────────
 *
 * Una URL con `?unidad=SEMANA&desp=-1` dice lo mismo que la URL pelada y se ve
 * como si alguien hubiera navegado. Al abrir la pantalla desde el menú, la barra
 * queda limpia.
 */
export function serializarContextoDelTablero(ctx = {}) {
  const { unidad, desp, local } = parseContextoDelTablero(ctx);
  const qs = new URLSearchParams();
  if (unidad !== UNIDADES.SEMANA) qs.set("unidad", unidad);
  if (desp !== DESPLAZAMIENTO_POR_DEFECTO) qs.set("desp", String(desp));
  if (local) qs.set("local", String(local));
  return qs.toString();
}

/** La URL del tablero que corresponde a este contexto. */
export function urlDelTablero(ctx = {}) {
  const { local } = parseContextoDelTablero(ctx);
  const base = local ? `${RUTA_LOCAL}/${local}` : RUTA_CUENTA;
  // `local` ya está en la ruta cuando corresponde: repetirlo en la query sería
  // el mismo hecho escrito dos veces, y dos que se pueden contradecir.
  const qs = serializarContextoDelTablero({ ...ctx, local: null });
  return qs ? `${base}?${qs}` : base;
}

/** La URL de una transferencia, LLEVÁNDOSE el contexto para poder volver. */
export function urlDelDetalle(transferenciaId, ctx = {}) {
  const id = Number(transferenciaId);
  if (!Number.isInteger(id) || id <= 0) return RUTA_DETALLE;
  const qs = new URLSearchParams(serializarContextoDelTablero(ctx));
  // LA MARCA VA SIEMPRE. Sin ella, entrar desde el tablero en el período por
  // defecto no escribiría ningún parámetro, y el detalle no podría distinguir
  // ese caso del que viene de la tabla de escritorio — que tiene su propio
  // retorno y no hay que pisarle.
  qs.set(MARCA_TABLERO, "1");
  return `${RUTA_DETALLE}/${id}?${qs.toString()}`;
}

/**
 * Y la vuelta: del detalle al tablero, con lo que traía.
 *
 * Es lo que se le pasa a `SunmiBackButton` como `href`. El componente NO se
 * toca: son 39 archivos y ya hay precedente —Productos le pasa un `returnUrl`
 * armado por la misma razón—.
 */
export function urlDeVuelta(input) {
  return urlDelTablero(parseContextoDelTablero(input));
}

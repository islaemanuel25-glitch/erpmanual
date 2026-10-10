// lib/compras-proveedor/comprobante/lector/esperas.js
//
// CUÁNTO SE ESPERA A CADA LECTOR. En un módulo propio, sin nada más.
//
// Vivían en `gemini.js`, y el texto que se le muestra a la persona cuando la
// espera vence vive en `contrato.js`, que `gemini.js` importa: el texto no
// podía leer la constante sin armar un ciclo, así que se escribió a mano. El
// 2026-10-10 la espera ya era de 90 s y la pantalla seguía diciendo "tardó más
// de 45 segundos". Acá las leen los dos.

/**
 * Cuánto se espera una lectura de Flash.
 *
 * ── ERAN 45 SEGUNDOS, Y EL MOTIVO DEJÓ DE EXISTIR ───────────────────────
 *
 * Se eligieron por debajo de los 60 de `proxy_read_timeout` de nginx, cuando
 * la lectura corría DENTRO del pedido HTTP. Desde el 2026-09-21 corre aparte
 * (`lecturasEnCurso.js`, y desde el 2026-10-10 con su estado en la base), así
 * que ningún proxy la mide: el único que corta es esta espera.
 *
 * Y cortaba. El 2026-10-09 a las 21:40, con el pedido 255 de Das, «Leer» dio
 * dos veces "La lectura tardó más de lo que el servidor espera y se cortó":
 * ese texto es el del 504, y la app solo contesta 504 cuando Flash vence esta
 * espera. Medido el 2026-08-11, una lectura tardaba entre 12 y 35 segundos;
 * esa noche tardó más de 45.
 *
 * 90 segundos: el doble de lo que tenía, sin techo de proxy que respetar. Con
 * 90 tampoco terminó (comprobante 22, `duracionMs` 90.012, medido en
 * producción el 2026-10-10): lo que se agregó entonces no fue más espera sino
 * un techo al razonamiento de Flash —ver `NIVEL_DE_RAZONAMIENTO` en
 * `gemini.js`— y, si igual no contesta, el pase al modelo grande.
 */
export const ESPERA_MAX_MS = 90_000;

/**
 * Cuánto se espera al modelo grande.
 *
 * Bastante más que Flash: piensa antes de contestar, y devuelve la lectura
 * entera más la receta. Eran 55 s, por debajo del techo de nginx que ya no
 * aplica (ver `ESPERA_MAX_MS`).
 *
 * 180 segundos. NO está medido con la API real: desde la nube no hay clave.
 * La primera escalada en producción deja su `duracionMs` en `LlamadaLector`, y
 * con eso se ajusta. Si no alcanza, la lectura de Flash NO se pierde: se
 * guarda con su estado y la pantalla dice que la interpretación no terminó.
 */
export const ESPERA_PRO_MS = 180_000;

/** Una espera dicha en castellano: "90 segundos", "3 minutos". */
export function esperaEnPalabras(ms) {
  const s = Math.round(Number(ms) / 1000);
  if (s >= 120 && s % 60 === 0) return `${s / 60} minutos`;
  return `${s} segundos`;
}

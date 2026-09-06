// ============================================================
// lib/formularios/escrituraNumerica.js
//
// ESCRIBIR O PEGAR SOBRE UN CAMPO QUE MUESTRA 0.
//
// ── EL DEFECTO ─────────────────────────────────────────────────────────────
//
// Un campo de porcentaje llega con `0` cargado. La persona toca la caja y
// escribe `1` esperando que quede `1`, y quedaba `10`: el dígito nuevo no
// reemplazaba al cero, se le sumaba al lado. Ese cero no era un dato suyo, era
// el valor por defecto que estaba mirando.
//
// ── POR QUÉ ESTO MIRA EL EVENTO Y NO EL TEXTO ─────────────────────────────
//
// Porque el texto no alcanza, y eso no es una precaución teórica: teclear `1`
// sobre `0` y pegar `"10"` sobre `0` pueden dejar exactamente el mismo valor, y
// tienen que terminar distinto. Una regla que solo compare el antes con el
// después no puede separarlos ni con la mejor heurística.
//
// Lo que sí los separa es preguntarle al navegador QUÉ operación ocurrió.
//
// ── LA MEDICIÓN, SOBRE EL INPUT REAL ──────────────────────────────────────
//
// `scripts/sonda-escritura-en-cero.mjs` lo mide en el navegador, sobre este
// mismo campo —`type="number"`, controlado por React, dentro de `SunmiInput`—.
// Lo que informó:
//
//   teclear 1 con el cursor antes del cero   inputType="insertText"       data="1"    value="10"
//   teclear 1 con el cursor después del cero inputType="insertText"       data="1"    value="01"
//   pegar "10"                               inputType="insertFromPaste"  data="10"   value="010"
//   pegar "12"                               inputType="insertFromPaste"  data="12"   value="012"
//
// Dos cosas quedaron claras ahí. La señal es fiable: el tipo de operación llega
// siempre y `data` trae exactamente el texto insertado. Y el pegado también
// estaba mal, de una forma que el reporte original no mencionaba: pegar `"12"`
// sobre un campo en cero dejaba `"012"`.
//
// ── LA REGLA ──────────────────────────────────────────────────────────────
//
// Si lo que había era exactamente `0` y lo que ocurrió fue una INSERCIÓN de
// texto numérico, ese texto reemplaza al cero. Da igual si vino de una tecla o
// de un pegado: en los dos casos el cero era el valor por defecto y lo que la
// persona quiere es lo que acaba de poner.
//
//   0 + tecla 1      → 1
//   0 + pegar "10"   → 10
//   0 + pegar "12"   → 12
//
// ── Y LO QUE LA REGLA NO TOCA, QUE ES LA MITAD QUE IMPORTA ────────────────
//
//   · El campo VACÍO. En comisión, vacío significa "heredá la del grupo" y se
//     guarda como `null`; cero significa "en este local es 0 %" y se guarda como
//     `0`. Son dos cosas distintas y confundirlas cambia plata. La regla solo
//     mira el caso en que había un cero.
//   · Borrar. `deleteContentBackward` no es una inserción y no trae `data`.
//   · El punto decimal. `0` + `.` inserta `"."`, que no es un número, así que
//     `0.` se sigue escribiendo normal y después `0.5`.
//   · Cualquier otro valor previo. Con `1` en la caja, escribir `0` da `10`.
//   · Un evento sin `inputType` ni `data` —un navegador que no los informe, un
//     evento fabricado—: se devuelve el valor tal cual llegó. Sin señal no se
//     adivina.
// ============================================================

/** Las operaciones que INSERTAN texto. Borrar y mover el cursor no están. */
const INSERCIONES = ["insertText", "insertFromPaste", "insertFromDrop", "insertCompositionText"];

/** Un texto que el campo puede aceptar como número: dígitos, con o sin decimales. */
const NUMERICO = /^\d+(?:\.\d+)?$/;

/**
 * El valor que corresponde dejar en un campo numérico después de escribir.
 *
 * @param {unknown} anterior Lo que el campo mostraba antes.
 * @param {{ target?: { value?: unknown }, nativeEvent?: { inputType?: string, data?: string } }} evento
 *   El evento de cambio, tal como lo entrega React.
 * @returns {unknown} El valor nuevo del campo.
 */
export function alEscribirNumero(anterior, evento) {
  const valor = evento?.target?.value;
  const { inputType, data } = evento?.nativeEvent || {};

  if (String(anterior) !== "0") return valor;
  if (!INSERCIONES.includes(inputType)) return valor;
  if (typeof data !== "string" || !NUMERICO.test(data)) return valor;

  // El cero que había era el valor por defecto: lo que se acaba de insertar lo
  // reemplaza entero, sin importar de qué lado del cursor haya caído.
  return data;
}

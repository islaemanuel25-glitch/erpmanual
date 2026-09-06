// ============================================================
// lib/formularios/escrituraNumerica.js
//
// ESCRIBIR SOBRE UN CAMPO QUE MUESTRA 0.
//
// ── EL DEFECTO ─────────────────────────────────────────────────────────────
//
// Un campo de porcentaje llega con `0` cargado. La persona toca la caja y
// escribe `1` esperando que quede `1`, y queda `10`: el dígito nuevo no
// reemplaza al cero, se le suma al lado. Según dónde haya quedado el cursor, el
// resultado es `10` o `01`, y las dos formas están mal por el mismo motivo — el
// cero que había no era un dato que la persona quisiera conservar, era el valor
// por defecto que estaba mirando.
//
// El arreglo obvio —seleccionar todo al enfocar— cambia el comportamiento de
// TODOS los valores, no solo del cero: alguien que entra a corregir un `12` se
// encontraría con que la primera tecla le borra los dos dígitos. Por eso esto
// mira el caso exacto y ningún otro.
//
// ── LA REGLA, Y POR QUÉ NO SE PASA DE LISTA ────────────────────────────────
//
// Solo actúa cuando lo que HABÍA era exactamente `0` y lo que quedó son dos
// dígitos. En cualquier otro caso devuelve el texto tal cual llegó:
//
//   · `""` sigue siendo `""`. En comisión eso significa "heredá la del grupo",
//     que es otra cosa que un cero, y confundirlos cambiaría lo que se guarda.
//   · `0` → `0.` sigue escribiéndose normal: no son dos dígitos.
//   · Con `1` en la caja, escribir `0` da `10`, como tiene que ser. La regla ya
//     no aplica porque lo que había dejó de ser el cero.
//   · Dos dígitos pegados de una vez —un pegado— se dejan como están: ahí nadie
//     estaba reemplazando nada.
//
// O sea que se puede seguir escribiendo cualquier número, incluido el 10: se
// teclea `1` —queda `1`— y después `0` —queda `10`—.
// ============================================================

/**
 * El valor que corresponde dejar en el campo después de escribir.
 *
 * @param {unknown} anterior Lo que el campo mostraba antes de la tecla.
 * @param {unknown} nuevo    Lo que el navegador dejó en el campo.
 * @returns {unknown} `nuevo`, salvo en el caso del cero reemplazado.
 */
export function reemplazarCeroInicial(anterior, nuevo) {
  if (String(anterior) !== "0") return nuevo;

  const texto = String(nuevo ?? "");
  if (!/^\d\d$/.test(texto)) return nuevo;

  // El cero que había puede haber quedado de cualquiera de los dos lados, según
  // dónde estuviera el cursor. Se descarta él y queda el dígito recién escrito.
  if (texto[0] === "0") return texto.slice(1);
  if (texto[1] === "0") return texto.slice(0, 1);

  return nuevo;
}

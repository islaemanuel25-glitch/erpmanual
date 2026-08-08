// lib/proveedores/listas/vigenciaConfirmacion.js
//
// ¿SIGUE VALIENDO LA CONFIRMACIÓN de una fila de lista de proveedor?
//
// Cuidado con el nombre: `confirmadoEn` existe también en cierres y retiros de
// caja, que no tienen nada que ver con esto. Por eso la función se llama
// `confirmacionDeInterpretacionVigente` y no `confirmacionVigente` a secas: quien
// grepee tiene que caer acá y no en `lib/caja/`.
//
// ── QUÉ SIGNIFICA CONFIRMAR ─────────────────────────────────────────────────
//
// Confirmar dice "una persona eligió esta interpretación PARA ESTE PRODUCTO".
// El producto es parte de la afirmación, no su contexto: las hipótesis salen del
// `factor_pack`, que es del producto, así que cambiarlo puede cambiar qué
// interpretaciones existen. Una confirmación de "× 450" puede quedar señalando
// una opción que ya no está en la lista.
//
// ── POR QUÉ NO SE BORRA, SE VENCE ───────────────────────────────────────────
//
// La primera idea fue limpiar la confirmación al revincular. Borrarla resolvía el
// problema y creaba otro: se perdía QUIÉN decidió y CUÁNDO, sin dejar rastro —y
// la tabla de filas no está en la bitácora, así que ese rastro no existía en
// ningún otro lado—.
//
// Lo que hace falta no es borrar la autoría: es que deje de contar. Son cosas
// distintas. Comparando las dos fechas que la fila YA guarda, una confirmación
// anterior a la última vinculación simplemente no está vigente. No se pierde
// nada, y de yapa queda el historial de que alguien confirmó y después se
// revinculó, que con el borrado se perdía.
//
// ── LOS TRES CONSUMIDORES ───────────────────────────────────────────────────
//
// La misma pregunta gobierna tres decisiones que antes se habrían escrito por
// separado, con tres redacciones que dirían lo mismo hasta el día que no:
//
//   1. `aplicacion.js` — si la confirmación no está vigente, su
//      `multiplicadorConfirmado` no se puede usar para escribir un costo.
//      Es el consumidor grave: acá se escribe en producción.
//   2. La cola de "pendientes de decisión" — una fila con confirmación vencida
//      vuelve a la cola, porque nadie decidió sobre el producto que tiene ahora.
//   3. El rango — el rango congelado en la fila existe SOLO mientras la
//      confirmación esté en pie. Vencida, manda el de la cabecera.

import { RANGO_POR_DEFECTO } from "./rangoAumento.js";

/** Una fecha comparable, o null. Tolera Date y string ISO. */
function fecha(v) {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ¿La confirmación de interpretación de esta fila sigue valiendo?
 *
 * @param confirmadoEn cuándo una persona eligió la interpretación
 * @param vinculadoEn  cuándo se vinculó el producto por última vez
 *
 * Sin confirmación, no hay nada vigente. Con confirmación y sin vinculación
 * manual —el caso normal: el motor macheó solo y después alguien confirmó— la
 * confirmación vale.
 */
export function confirmacionDeInterpretacionVigente(fila) {
  const conf = fecha(fila?.confirmadoEn);
  if (!conf) return false;

  const vinc = fecha(fila?.vinculadoEn);
  if (!vinc) return true;

  // Estrictamente posterior. El empate exacto se trata como NO vigente: si las
  // dos cosas ocurrieron en el mismo milisegundo no se puede saber cuál fue
  // primero, y ante la duda conviene que la fila vuelva a la cola —que alguien
  // mire de más— antes que aplicar un costo con una decisión dudosa.
  return conf.getTime() > vinc.getTime();
}

/**
 * El rango de aumento esperado que le corresponde a una fila.
 *
 * Tres fuentes, en este orden:
 *
 *   1. El rango CONGELADO en la fila, si la confirmación está vigente. `confirmar`
 *      lo guarda a propósito —"cambiarlo después no puede reescribir con qué
 *      criterio se decidió esto"— y esa protección solo tiene sentido mientras la
 *      decisión que protege siga en pie.
 *   2. El de la cabecera de la importación.
 *   3. El default del sistema.
 *
 * Existe porque el default estaba escrito en cinco lugares —dos veces importando
 * la constante y tres veces como `?? 10` y `?? 20` sueltos en componentes— y
 * ninguno de los cinco miraba el congelado. O sea que una fila confirmada se
 * evaluaba con el rango de la cabecera, que es justo lo que `confirmar` intenta
 * impedir.
 */
export function rangoDeLaFila(fila, cabecera) {
  const num = (v) => (v === null || v === undefined ? null : Number(v));

  if (confirmacionDeInterpretacionVigente(fila)) {
    const min = num(fila?.aumentoEsperadoMinPct);
    const max = num(fila?.aumentoEsperadoMaxPct);
    // Los dos o ninguno: medio rango congelado sería peor que ninguno, porque
    // mezclaría el criterio de la decisión con el de la cabecera.
    if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max)) {
      return { minPct: min, maxPct: max, origen: "fila" };
    }
  }

  const minCab = num(cabecera?.aumentoEsperadoMinPct);
  const maxCab = num(cabecera?.aumentoEsperadoMaxPct);
  if (minCab !== null && maxCab !== null && Number.isFinite(minCab) && Number.isFinite(maxCab)) {
    return { minPct: minCab, maxPct: maxCab, origen: "cabecera" };
  }

  return { ...RANGO_POR_DEFECTO, origen: "default" };
}

/**
 * ¿Se puede usar el multiplicador confirmado de esta fila para escribir un costo?
 *
 * Es la pregunta de `aplicacion.js`, con nombre propio para que en el punto de
 * uso se lea qué se está preguntando y no una comparación de fechas suelta.
 */
export function multiplicadorConfirmadoUsable(fila) {
  return (
    confirmacionDeInterpretacionVigente(fila) &&
    fila?.multiplicadorConfirmado !== null &&
    fila?.multiplicadorConfirmado !== undefined
  );
}

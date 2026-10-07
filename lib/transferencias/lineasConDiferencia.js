// lib/transferencias/lineasConDiferencia.js
//
// CUÁNTAS LÍNEAS DE UNA TRANSFERENCIA DIFIEREN DE LO QUE SE ENVIÓ. UNA SOLA
// DEFINICIÓN.
//
// ── DE DÓNDE SALE ─────────────────────────────────────────────────────────
//
// Vivía como función privada de `app/api/transferencias/tablero/route.js`. Se
// mudó acá SIN CAMBIOS el 2026-10-07, cuando apareció un segundo lector: la
// capacidad `transferencias_eventos` de la integración con Azul Chat, que dice
// "N líneas con diferencia" sobre la misma recepción que la pantalla de
// Transferencias. Dos copias de este conteo serían dos números el día que una
// cambie (CLAUDE.md, regla 1); por eso las dos leen ésta.
//
// ── LÍNEAS, NO PRODUCTOS ──────────────────────────────────────────────────
//
// Una misma transferencia puede tener dos líneas del mismo producto, y una
// línea agregada en recepción (enviada 0) cuenta como diferencia. Lo que esto
// cuenta son LÍNEAS, y así se llama el campo que lo lleva: `lineasConDiferencia`.
//
// ── NO ES `Transferencia.tieneDiferencias` ────────────────────────────────
//
// La columna es un booleano que escribe `confirmar-recepcion` al confirmar.
// Esto se calcula sobre las líneas, en cualquier estado. No se fuerzan a
// coincidir: con líneas históricas que la puerta no puede leer, la columna
// puede decir que hubo diferencia y el conteo saltear esa línea.

import { diferenciaDeLinea, fisicasEnviadasDe, fisicasRecibidasDe } from "./recepcionUI.js";

/**
 * Cuántas LÍNEAS de este remito difieren de lo que se envió.
 *
 * Se cuentan líneas, no unidades: la pantalla dice "2 diferencias" y eso son dos
 * productos que no coinciden, sin importar por cuánto.
 *
 * Solo cuentan las que YA SE CONTARON. `fisicasRecibidasDe` devuelve `null`
 * cuando nadie registró recepción de esa línea, y una línea sin contar no es una
 * diferencia: es una pregunta sin responder. Colapsarlas daría "77 diferencias"
 * en una transferencia recién abierta.
 *
 * La línea que la puerta no puede leer —una histórica sin snapshot ni
 * presentación adoptada— se saltea en vez de suponer. Contarla como diferencia
 * sería inventar un faltante; contarla como coincidencia, esconderlo.
 */
export function contarLineasConDiferencia(detalle = []) {
  let n = 0;
  for (const d of detalle) {
    let enviada;
    let recibida;
    try {
      enviada = fisicasEnviadasDe(d);
      recibida = fisicasRecibidasDe(d);
    } catch {
      continue;
    }
    if (recibida == null) continue;
    const dif = diferenciaDeLinea({ enviada, recibida });
    // El umbral es media milésima: las cantidades son `Decimal(12,3)`, así que
    // cualquier diferencia real es de al menos una milésima. Comparar contra
    // cero pelado haría que un residuo binario de una conversión cuente como
    // faltante.
    if (dif != null && Math.abs(dif) > 0.0005) n += 1;
  }
  return n;
}

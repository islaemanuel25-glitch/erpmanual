// POR QUÉ ESTE RENGLÓN NO ADMITE UNA LECTURA, DICHO DE ESTE RENGLÓN.
//
// `puedeConfirmarse` contesta con un motivo de seis, y uno de ellos —
// ESTADO_NO_CONFIRMABLE— junta cuatro causas que se arreglan distinto. Hasta el
// 2026-10-24 la hoja las decía las cuatro juntas ("o no se pudo leer, o no se le
// puede escribir el costo, o su código está repetido"), y además recién después
// de tocar «Usar». Ahora la hoja lo dice ANTES, y dice cuál es.
//
// Vive aparte porque mira el motivo del motor (`MOTIVO_CONCILIACION`), y
// `confirmarPresentacion.js` no puede importar `conciliarLista.js` sin cerrar un
// ciclo. Puro.

import { ESTADO_LINEA } from "./estados.js";
import { MOTIVO_CONCILIACION } from "./conciliarLista.js";
import { MOTIVO_BLOQUEO } from "./calculoCosto.js";
import { MOTIVO_NO_CONFIRMABLE, TEXTO_NO_CONFIRMABLE } from "./confirmarPresentacion.js";

/**
 * Cuando la ubicación ACTIVA no administra el costo. No es un motivo de
 * `puedeConfirmarse` —ésa no sabe desde dónde se opera— sino la otra pregunta
 * que hace `confirmar` antes de escribir.
 */
export const TEXTO_SIN_PROPIEDAD_DEL_COSTO =
  "Desde esta ubicación no se le puede cambiar el costo a este producto. Pasate a la ubicación que lo administra y volvé a esta lista.";

/**
 * Un producto por kilo en una lista que cotiza por unidad y NO sabe pasarla a
 * kilo (el formato de Arcor afirma la unidad comercial). Con un lector que sí
 * sabe —Dab, GRANIX— la tarjeta pregunta los kilos de la pieza en vez de esto.
 */
export const TEXTO_POR_KILO_SIN_CONVERSION =
  "Lo tenés cargado por kilo y esta lista lo cotiza por unidad, en un formato que no deja pasar el precio a kilo. Dejalo como está y cargá el costo a mano en la ficha del producto.";

/** Un bloqueo cuyo motivo no tiene texto: se dice que no se sabe, no se inventa uno. */
export const TEXTO_BLOQUEO_SIN_MOTIVO =
  "Este renglón quedó bloqueado por un motivo que no tengo explicado. Dejalo como está y avisá para que lo miren.";

/** Un combo no tiene costo propio: lo dice el motor y lo dice `confirmar`. */
export const TEXTO_COMBO = "Es un combo: no tiene costo propio. Su costo sale de los productos que lo forman.";

/**
 * @param motivo  el de `puedeConfirmarse`
 * @param fila    la fila, con `estado` y `motivo`
 * @returns el texto para la persona, o null si el motivo es null
 */
export function porQueNoSeConfirma(motivo, fila) {
  if (!motivo) return null;
  if (motivo !== MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE) return TEXTO_NO_CONFIRMABLE[motivo] ?? null;
  switch (fila?.estado) {
    case ESTADO_LINEA.BLOQUEADO:
      if (fila?.motivo === MOTIVO_CONCILIACION.SIN_PROPIEDAD_COSTO) {
        return "Este renglón se leyó desde una ubicación que no administra su costo. Tocá «No es este producto» y volvé a elegir el mismo renglón para que se lea de nuevo.";
      }
      if (fila?.motivo === MOTIVO_CONCILIACION.PRODUCTO_COMBO) return TEXTO_COMBO;
      if (fila?.motivo === MOTIVO_CONCILIACION.PRECIO_CERO || fila?.motivo === MOTIVO_CONCILIACION.PRECIO_NO_CREIBLE) {
        return "La lista trae este precio en cero o casi cero: seguro es un error del archivo. Dejalo como está.";
      }
      // ── CADA BLOQUEO CON SU MOTIVO (GRANIX, 2026-10-24) ──────────────────
      //
      // Acá decía "no admite que la lista le cambie el costo así (por cómo está
      // cargado: unidad, combo o precio)" para todo lo que no tenía texto, y lo
      // decía sobre GRANIX, que sí se podía pasar a kilo. Ahora un producto por
      // kilo con un lector que sabe pasarlo ni siquiera llega acá
      // (`puedeConfirmarse`, `admiteKilos`); el que llega es el de una lista que
      // afirma la unidad, como Arcor, y se dice eso.
      if (fila?.motivo === MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE) return TEXTO_POR_KILO_SIN_CONVERSION;
      if (fila?.motivo === MOTIVO_CONCILIACION.PRECIO_INVALIDO) {
        return "El precio de este renglón no es un número. Dejalo como está y mirá el precio en el papel del proveedor.";
      }
      return TEXTO_BLOQUEO_SIN_MOTIVO;
    case ESTADO_LINEA.CODIGO_DUPLICADO:
      return "El código de este renglón viene más de una vez en la lista con precios distintos. Tocá «No es este producto» y elegí el renglón que corresponde.";
    case ESTADO_LINEA.ERROR:
      return "Este renglón de la lista no se pudo leer. Dejalo como está y mirá el precio en el papel del proveedor.";
    case ESTADO_LINEA.NO_MACHEADO:
      return "Este renglón quedó sin atar a tu producto. Tocá «No es este producto» y volvé a elegirlo.";
    default:
      return TEXTO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE;
  }
}

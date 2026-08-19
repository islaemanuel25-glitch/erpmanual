// EN QUÉ ESCALA SE VENDE UN PRODUCTO. La respuesta del POS, en un solo lugar.
//
// ── QUÉ PROBLEMA RESUELVE ─────────────────────────────────────────────────
//
// La tarjeta del catálogo mostraba la escala en la que está GUARDADO el precio
// —que se deduce de `unidad_medida` y refleja cómo se COMPRA— y la presentaba
// como si fuera la escala de venta. Son cosas distintas y se separan de verdad:
// un producto puede entrar por pack y salir por unidad.
//
// Medido el 2026-08-19 sobre la copia con datos reales: **5.450 de 10.521 filas
// activas, el 51,8 %**, mostraban una escala distinta de la que el POS usa para
// vender. Casi todo es un solo caso —5.410 filas que decían "por bulto" y salen
// por unidad—, y se explica solo: en un local el POS vende SIEMPRE por unidad,
// así que todos los productos de pack tenían la tarjeta mal.
//
// ── DE DÓNDE SALE LA REGLA, Y POR QUÉ ACÁ ─────────────────────────────────
//
// `modoSalidaDeVenta` es `calcularModoSalida`, movida TAL CUAL desde
// `app/api/pos-ventas/buscar-producto/route.js:215`. No se reescribió ni se
// "mejoró": es la función que hoy decide lo que se cobra en el mostrador, y la
// única forma de que la tarjeta diga la verdad es que llame a la misma.
//
// Estaba declarada privada dentro de la ruta, así que nadie de afuera podía
// usarla — y ya existía una SEGUNDA COPIA idéntica en
// `app/api/stock_locales/buscar-producto/route.js:154`. Las dos se compararon
// línea por línea antes de mover: hoy se comportan igual. Las dos pasan a
// importar de acá, que es lo que impide que mañana se separen.
//
// ── LA FIRMA ES POSICIONAL A PROPÓSITO ────────────────────────────────────
//
// Se conservó `(esDeposito, modoEnvio, unidadMedida)` en vez de pasar a un
// objeto, que se leería mejor. El motivo es el riesgo: esto está en el camino
// del precio que se cobra, y cambiar la forma de llamarla obligaría a reescribir
// las dos invocaciones. Con la firma intacta, el diff en esas rutas es UNA línea
// borrada y un import. La comodidad de leerla no vale una equivocación ahí.
//
// ── LO QUE ESTE ARCHIVO NO HACE, Y ES DELIBERADO ──────────────────────────
//
// No toca las CUATRO condiciones divergentes de "¿el precio está guardado por
// bulto?" que hay hoy en el repo —el POS, `stock_locales/buscar-producto`,
// `lib/stock/mapItem.js` y `lib/precios/redondeo.js`, cada una con un criterio
// distinto—. Ésas mueven el precio que se cobra y van en tanda propia, con su
// medición antes y después. Acá solo se unifica la ESCALA.

import { defaultModoEnvio, esFiambreFijo } from "../conversiones/stock.js";
import { esProductoServicio } from "../pos-ventas/servicios.js";

export const SALIDA_BULTO = "BULTO";
export const SALIDA_UNIDAD = "UNIDAD";

/**
 * Modo de salida por defecto de una línea, tal como lo decide el POS.
 *
 * - Local normal → siempre UNIDAD (vende unitario al público)
 * - Depósito → según `modo_envio` del producto:
 *     SOLO_BULTO  → BULTO
 *     MIXTO       → BULTO  (default conservador para depósito)
 *     SOLO_UNIDAD → UNIDAD
 *     null        → usa `defaultModoEnvio(unidadMedida)` y aplica lo mismo
 *
 * OJO con el `null`: `lib/mappers/producto.js` rellena ese hueco con "MIXTO" y
 * acá se rellena con `defaultModoEnvio`, que para unidad y kg da SOLO_UNIDAD.
 * Son 120 productos activos y en los 120 las dos respuestas difieren, así que
 * quien quiera anticipar al POS tiene que llamar a ESTA función y no leer el
 * `modoEnvio` que devuelve el mapper.
 */
export function modoSalidaDeVenta(esDeposito, modoEnvio, unidadMedida) {
  if (!esDeposito) return SALIDA_UNIDAD;

  const efectivo = modoEnvio || defaultModoEnvio(unidadMedida);
  if (efectivo === "SOLO_UNIDAD") return SALIDA_UNIDAD;
  // SOLO_BULTO y MIXTO → default BULTO en depósito
  return SALIDA_BULTO;
}

/** Las escalas que la tarjeta sabe nombrar. */
export const ESCALA_BULTO = "por bulto";
export const ESCALA_UNIDAD = "por unidad";
export const ESCALA_KG = "por kg";
export const ESCALA_PIEZA = "por pieza";
export const ESCALA_IMPORTE = "importe variable";

/**
 * EN QUÉ ESCALA SE VENDE, en las palabras que la tarjeta muestra.
 *
 * Compone los tres casos que el POS resuelve ANTES de mirar el modo de salida,
 * en el mismo orden en que los resuelve `buscar-producto`:
 *
 *   1. Servicio de importe variable → no tiene precio fijo.
 *   2. Fiambre de pieza fija EN DEPÓSITO → se vende por pieza. Fuera del
 *      depósito ese mismo producto se vende por kilo: no es una propiedad del
 *      producto sino de dónde se está parado.
 *   3. Kilo → se vende por peso, y el modo de salida no aplica. El POS abre su
 *      modal de kg; `modoSalidaDeVenta` para un kg en depósito devolvería UNIDAD
 *      y sería una respuesta engañosa.
 *
 * Recién después manda el modo de salida.
 *
 * @param {object} p producto ya mapeado (`mergeBaseLocalToUi`) o la fila cruda.
 * @param {boolean} esDeposito si la UBICACIÓN activa es el depósito.
 */
export function escalaDeVentaDe(p = {}, esDeposito = false) {
  if (esProductoServicio(p)) return ESCALA_IMPORTE;

  // `esFiambreFijo` contesta sobre el PRODUCTO; la ubicación la resuelve el
  // llamador, igual que hace el POS en buscar-producto:271.
  const base = {
    unidad_medida: p.unidadMedida ?? p.unidad_medida,
    modoCompraProveedor: p.modoCompraProveedor,
    pesoReferenciaKg: p.pesoReferenciaKg,
    pesoEsFijo: p.pesoEsFijo,
    modoVentaDeposito: p.modoVentaDeposito,
  };
  if (esDeposito && esFiambreFijo(base)) return ESCALA_PIEZA;

  const unidad = base.unidad_medida;
  if (unidad === "kg") return ESCALA_KG;

  // El `modoEnvio` se toma CRUDO. Si viene del mapper ya está relleno con su
  // propio default y esta función no puede distinguirlo — por eso el llamador
  // debería pasar el valor de la base. Ver la advertencia de arriba.
  return modoSalidaDeVenta(esDeposito, p.modoEnvio ?? p.modo_envio ?? null, unidad) === SALIDA_BULTO
    ? ESCALA_BULTO
    : ESCALA_UNIDAD;
}

/** ¿El número que se muestra tiene que ser el unitario? */
export function seMuestraUnitario(escala) {
  return escala === ESCALA_UNIDAD;
}

/**
 * LO QUE LA TARJETA PUEDE MOSTRAR HOY, que no es todo lo que esta pieza sabe.
 *
 * ── POR QUÉ EXISTE ESTA EXCEPCIÓN, Y QUÉ HACE FALTA PARA BORRARLA ─────────
 *
 * `escalaDeVentaDe` dice la verdad: un fiambre de pieza fija en el depósito se
 * vende POR PIEZA. Pero la tarjeta no sabe todavía poner el precio de una pieza
 * —el POS lo calcula como `precio_por_kg × pesoReferenciaKg`, en
 * `buscar-producto:300`— ni tiene una línea de equivalencia que lo explique: la
 * que hay dice "Se vende por kilo".
 *
 * Rotular "por pieza" encima de un número que sigue siendo POR KILO sería
 * cambiar un error por otro peor, y con la contradicción a la vista en la misma
 * tarjeta. Lo encontró la sonda, no leyendo: dio rojo sobre "ACEITUNAS CON
 * CAROZO" señalando justamente eso.
 *
 * Así que esas filas se siguen mostrando como hasta hoy —por kilo— y quedan
 * anotadas. **Son 35 filas**, medidas el 2026-08-19: las únicas de las 5.450 que
 * esta tanda NO arregla.
 *
 * Para sacarlo hace falta: el precio por pieza en la tarjeta, y una línea de
 * equivalencia que diga "1 pieza = N kg". Las dos tocan el número, así que van
 * con la tanda del precio y no con ésta.
 */
export function escalaQueLaTarjetaSabeMostrar(escala) {
  return escala === ESCALA_PIEZA ? ESCALA_KG : escala;
}

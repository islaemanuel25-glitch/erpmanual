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
import { precioUnitarioQueSeCobra, precioEnEscalaQueSeCobra } from "./redondeo.js";

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
 * UN VALOR —PRECIO O COSTO— LLEVADO A LA ESCALA EN LA QUE SE VENDE.
 *
 * ── PARA QUÉ ─────────────────────────────────────────────────────────────
 *
 * La tarjeta muestra el costo al lado de la venta para que un error se vea de un
 * golpe de ojo: costo 1.000 contra venta 800 y listo. Eso SOLO funciona si los
 * dos números están en la misma escala. Un costo por bulto al lado de una venta
 * por unidad no es una comparación difícil: es una comparación al revés, que
 * hace parecer sano lo que está mal y al revés.
 *
 * Por eso hay una sola función y la usan los dos.
 *
 * ── EL REDONDEO NO ES SIMÉTRICO, Y ESE ES EL ÚNICO PARÁMETRO QUE CAMBIA ───
 *
 * El precio de venta lleva el redondeo comercial porque es lo que se cobra. El
 * costo NO: no se cobra, se paga. Por eso el llamador pasa `redondeo100: false`
 * para el costo — no se decide acá, para que no haya dos criterios sobre lo
 * mismo escondidos en una rama.
 *
 * ── LA PIEZA ES LA ÚNICA QUE NO SABEN LAS FUNCIONES DE ABAJO ─────────────
 *
 * Un fiambre de pieza fija tiene el valor guardado POR KILO y se vende por
 * pieza, y la pieza pesa siempre lo mismo: la paleta son 6 kg, el kilo sale
 * $1.000, la pieza sale $6.000. Es la misma cuenta que hace el POS en
 * `buscar-producto:300`.
 *
 * Y no lleva redondeo, también como el POS —`buscar-producto:317` excluye
 * explícitamente al fiambre fijo—.
 *
 * @param {object} p
 * @param {string} p.escala             la de `escalaDeVentaDe`.
 * @param {number|string|null} p.valor  el precio o el costo guardado.
 * @param {number|null} p.pesoReferenciaKg  cuánto pesa una pieza. Solo para PIEZA.
 */
export function valorEnLaEscalaDeVenta({
  escala,
  valor,
  factor,
  unidad,
  redondeo100 = false,
  pesoReferenciaKg = null,
} = {}) {
  if (escala === ESCALA_PIEZA) {
    if (valor === null || valor === undefined || valor === "") return null;
    const n = Number(valor);
    const peso = Number(pesoReferenciaKg);
    if (!Number.isFinite(n) || !Number.isFinite(peso) || peso <= 0) return null;
    return Number((n * peso).toFixed(2));
  }

  return seMuestraUnitario(escala)
    ? precioUnitarioQueSeCobra({ precio: valor, factor, unidad, redondeo100 })
    : precioEnEscalaQueSeCobra({ precio: valor, factor, unidad, redondeo100 });
}

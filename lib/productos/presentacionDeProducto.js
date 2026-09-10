// lib/productos/presentacionDeProducto.js
//
// UNA SOLA DEFINICIÓN DE EN QUÉ SE CUENTA UN PRODUCTO.
//
// ── POR QUÉ ESTO ES UN MÓDULO Y NO UNA FUNCIÓN ADENTRO DE UNA PANTALLA ────
//
// La pregunta "¿esto se cuenta en unidades, packs, cajones, kilos o piezas?" la
// hacen hoy al menos tres dominios: los comprobantes del POS, la transferencia
// entre locales y la recepción física. Cada uno la contestaba por su cuenta, y
// dos de esas respuestas eran distintas:
//
//   · `lib/pos-ventas/presentacionLinea.js` ya tenía la regla COMPLETA y bien:
//     PIEZA antes que kg, kg por `unidad_medida`, cajón distinguido de pack.
//   · `FichaProductoRecepcion.presentacionDelEnvio` tenía una versión pobre:
//     BULTO → "PACK xN", todo lo demás → "UNIDAD". Con eso un cajón se veía como
//     pack y un kilo como unidad.
//
// Así que la decisión se extrae acá y los dos la consumen. Cada uno conserva su
// VOCABULARIO —el ticket dice "Caja x8", la recepción dice "CAJÓN x8"— porque
// son públicos distintos, pero la decisión de QUÉ es, es una sola.
//
// ── EL ORDEN DE LAS PREGUNTAS NO ES ARBITRARIO ───────────────────────────
//
// PIEZA va ANTES que kg, y esto es lo que más veces se hace mal: el fiambre de
// pieza fija tiene `unidad_medida = "kg"` y aun así se cuenta y se despacha por
// PIEZAS. Preguntar por el kilo primero lo convertiría en un producto a granel y
// haría que "2 PIEZA" se mostrara como "2 KG", que son cosas distintas.
//
// ── LO QUE ACÁ NO SE HACE ────────────────────────────────────────────────
//
// Adivinar por el nombre del producto, por la categoría o por el local. La
// fuente es el dominio: `unidad_medida`, `factor_pack` y `modoVentaDeposito`.

import { elDepositoDespachaPorPieza } from "@/lib/conversiones/stock";

/** Las cinco formas en que este ERP cuenta mercadería. */
export const PRESENTACION = Object.freeze({
  UNIDAD: "UNIDAD",
  PACK: "PACK",
  CAJON: "CAJON",
  KG: "KG",
  PIEZA: "PIEZA",
});

/** Un factor de agrupación sirve solo si es entero y mayor que uno. */
export function factorAgrupacion(f) {
  const n = Number(f);
  return Number.isInteger(n) && n > 1 ? n : null;
}

/** ¿Esta presentación junta varias unidades en un bulto? */
export function agrupa(presentacion) {
  return presentacion === PRESENTACION.PACK || presentacion === PRESENTACION.CAJON;
}

/**
 * EN QUÉ SE CUENTA ESTE PRODUCTO.
 *
 * @param {object} p
 * @param {string} p.unidadMedida        `ProductoBase.unidad_medida`: unidad|pack|cajon|kg
 * @param {number} p.factorPack          `ProductoBase.factor_pack`
 * @param {string} p.modoVentaDeposito   `ProductoBase.modoVentaDeposito`: PIEZA|PESO
 * @param {number} p.pesoReferenciaKg    `ProductoBase.pesoReferenciaKg`
 * @param {string} [p.modoCompraProveedor] SE IGNORA, y está declarado a
 *   propósito para que un llamador que lo siga pasando no crea que influye.
 *   Describe la relación proveedor→depósito y no decide en qué cuenta el que
 *   recibe. Ver el comentario de PIEZA más abajo.
 * @param {boolean} p.pesoEsFijo         Fallback de los productos no migrados.
 * @param {string} [p.contadoEn]         Cómo se contó ESTA operación, si se sabe:
 *   "BULTO" o "UNIDAD". Un producto que agrupa igual puede despacharse suelto, y
 *   en ese caso la presentación de la operación es UNIDAD aunque el producto sea
 *   un pack. Sin este dato manda lo que el producto es.
 *
 * @returns {{ presentacion: string, factor: number|null, pesoPiezaKg: number|null }}
 */
export function presentacionDeProducto({
  unidadMedida = null,
  factorPack = null,
  modoVentaDeposito = null,
  pesoReferenciaKg = null,
  modoCompraProveedor = null,
  pesoEsFijo = null,
  contadoEn = null,
} = {}) {
  const um = String(unidadMedida ?? "").toLowerCase();
  const factor = factorAgrupacion(factorPack);
  const peso = Number(pesoReferenciaKg);

  // ── PIEZA PRIMERO. Ver el encabezado: el fiambre de pieza fija dice "kg" y se
  //    cuenta por piezas.
  //
  // El predicado NO se reescribe acá: sale de `elDepositoDespachaPorPieza`, que
  // es el único lugar del repo donde se decide eso. Escribir
  // `modoVentaDeposito === "PIEZA" && pesoReferenciaKg > 0` a mano habría sido
  // la enésima copia — hay un candado que las cuenta y que atrapó justamente
  // esa línea cuando la escribí así.
  //
  // ── POR QUÉ YA NO ES `esFiambreFijo` ────────────────────────────────────
  //
  // Porque aquél exige además `modoCompraProveedor === "UNIDAD"`, y eso es cómo
  // el depósito le COMPRA al proveedor. Esta función contesta en qué se cuenta
  // la mercadería para quien la recibe, y esa relación no tiene nada que decir
  // ahí: un fiambre de pieza fija comprado por bulto seguiría saliendo del
  // depósito en piezas. `esFiambreFijo` sigue igual y sigue gobernando el stock;
  // acá se pregunta solo por la mitad de venta.
  //
  // Se arma con la forma de `ProductoBase` —`unidad_medida` en snake— porque es
  // lo que ese predicado sabe leer.
  const comoBase = {
    unidad_medida: um,
    pesoReferenciaKg: peso,
    modoVentaDeposito,
    pesoEsFijo,
  };
  if (elDepositoDespachaPorPieza(comoBase)) {
    return { presentacion: PRESENTACION.PIEZA, factor: null, pesoPiezaKg: peso };
  }

  // ── PESO. La unidad de medida manda; el nombre no se mira nunca.
  if (um === "kg") {
    return { presentacion: PRESENTACION.KG, factor: null, pesoPiezaKg: null };
  }

  // ── AGRUPADOS ───────────────────────────────────────────────────────────
  //
  // Hay DOS formas de saber que una salida agrupó, y las dos valen:
  //
  //   · el catálogo dice que el producto es un pack o un cajón;
  //   · la OPERACIÓN dice que se contó en bultos (`contadoEn === "BULTO"`).
  //
  // La segunda no es redundante: es lo único que tiene una línea vieja cuyo
  // producto ya no declara `unidad_medida`, o cuyo tipo cambió después. Ignorarla
  // convertía en "UNIDAD" a remitos que se habían contado en bultos, que es
  // justo la compatibilidad que hay que conservar.
  //
  // Y al revés: un cajón despachado POR UNIDADES es una salida en UNIDAD, no un
  // cajón fraccionado. Por eso `contadoEn === "UNIDAD"` gana sobre el catálogo.
  if (contadoEn === "UNIDAD") {
    return { presentacion: PRESENTACION.UNIDAD, factor: null, pesoPiezaKg: null };
  }

  const esAgrupado = um === "pack" || um === "cajon" || contadoEn === "BULTO";
  if (esAgrupado) {
    if (!factor) {
      // Agrupa, pero no se sabe con cuánto. No se inventa un factor: se afirma
      // lo único que se puede afirmar, que es una unidad.
      return { presentacion: PRESENTACION.UNIDAD, factor: null, pesoPiezaKg: null };
    }
    // El TIPO lo dice el catálogo. Sin catálogo, "pack" es el nombre neutro para
    // un bulto — es el mismo criterio que ya usa `presentacionLinea` del POS.
    const presentacion = um === "cajon" ? PRESENTACION.CAJON : PRESENTACION.PACK;
    return { presentacion, factor, pesoPiezaKg: null };
  }

  return { presentacion: PRESENTACION.UNIDAD, factor: null, pesoPiezaKg: null };
}

/** La política de salida del depósito, tal como la nombra `ProductoBase.modo_envio`. */
export const MODO_ENVIO = Object.freeze({
  SOLO_BULTO: "SOLO_BULTO",
  MIXTO: "MIXTO",
  SOLO_UNIDAD: "SOLO_UNIDAD",
});

/** Diagnósticos de una política que el catálogo no puede sostener. */
export const DIAGNOSTICO_SALIDA = Object.freeze({
  SIN_BULTO_POSIBLE: "SIN_BULTO_POSIBLE",
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CÓMO SALE HOY ESTA MERCADERÍA DEL DEPÓSITO HACIA EL LOCAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `presentacionDeProducto` contesta QUÉ ES el producto. Esta contesta otra cosa:
 * en qué presentación el depósito lo DESPACHA hoy al local. Son distintas
 * porque el catálogo guarda las dos mitades en campos separados, y la política
 * de salida vive en `modo_envio` — el mismo campo con el que el POS del depósito
 * decide si una línea puede venderse en pack (`permiteToggleDeposito`).
 *
 * ── POR QUÉ HACÍA FALTA, MEDIDO ────────────────────────────────────────────
 *
 * La recepción nunca miraba `modo_envio`. **291 productos** son `pack` o `cajon`
 * con factor mayor que uno y `modo_envio = SOLO_UNIDAD`: el depósito solo los
 * despacha sueltos y la recepción los ofrecía como "PACK xN". Otros **27** son
 * `unidad` o `kg` con `SOLO_BULTO`.
 *
 * ── DÓNDE SE USA, Y DÓNDE NO ───────────────────────────────────────────────
 *
 * Solo para decisiones NUEVAS: la propuesta de adopción de una histórica y el
 * alta de un producto no declarado. **No** para reconstruir una línea vieja sin
 * snapshot: una histórica no nos deja afirmar cómo salió aquel día, y aplicarle
 * la política de HOY sería reescribir el pasado en silencio. Esa reconstrucción
 * se conserva tal cual en `descriptorDeEnvio`.
 *
 * Y nunca gana sobre un snapshot: una línea que registró su salida ya tiene la
 * respuesta, y cambiar `modo_envio` o `factor_pack` después no la mueve.
 *
 * ── LAS TRES POLÍTICAS ─────────────────────────────────────────────────────
 *
 * · SOLO_UNIDAD → sale suelto. Si el producto agrupa, se baja a UNIDAD y se
 *   descarta el factor: mostrar "PACK x6" sobre algo que solo sale de a uno es
 *   ofrecer una escala que la operación no puede producir.
 * · SOLO_BULTO → agrupado, pero SOLO si hay un bulto real que ofrecer. Si el
 *   producto no agrupa —los 27 casos— no se inventa: se conserva la
 *   presentación segura y se informa el desacuerdo en `diagnostico`.
 * · MIXTO → los dos caminos están abiertos y la política no alcanza para
 *   decidir; decide la operación concreta. Se devuelve lo que el producto es.
 *
 * KG y PIEZA no se tocan con ninguna: no hay bultos que completar ahí.
 *
 * @returns {{presentacion, factor, pesoPiezaKg, politica, diagnostico}}
 */
export function presentacionDeSalida({ modoEnvio = null, ...producto } = {}) {
  // La base sale de la MISMA función de siempre. Acá no se decide qué es el
  // producto: se decide si la política de salida modifica esa respuesta.
  const base = presentacionDeProducto({ ...producto, contadoEn: null });
  const politica = String(modoEnvio ?? "").toUpperCase() || null;
  const salida = { ...base, politica, diagnostico: null };

  // Ni el peso ni la pieza tienen bulto que completar: ninguna política las mueve.
  if (base.presentacion === PRESENTACION.KG || base.presentacion === PRESENTACION.PIEZA) {
    return salida;
  }

  if (politica === MODO_ENVIO.SOLO_UNIDAD) {
    return { ...salida, presentacion: PRESENTACION.UNIDAD, factor: null };
  }

  if (politica === MODO_ENVIO.SOLO_BULTO && !agrupa(base.presentacion)) {
    // El catálogo dice que solo sale en bulto y no dice de cuántos. No se
    // fabrica un factor: se conserva lo que sí se puede afirmar y se avisa.
    return { ...salida, diagnostico: DIAGNOSTICO_SALIDA.SIN_BULTO_POSIBLE };
  }

  return salida;
}

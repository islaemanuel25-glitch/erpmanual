// lib/conversiones/stock.js
// Helpers para conversión entre bultos+sueltas y unidades

/**
 * Tres decimales, que es la escala física de StockLocal.cantidad
 * (`Decimal(12,3)`). Todo lo que se muestre o se derive de esa columna se
 * redondea acá: la aritmética binaria de JavaScript inventa dígitos que la
 * columna no puede contener, y esos dígitos terminan en pantalla.
 */
function aEscalaFisica(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

/**
 * Convierte cantidad en bultos+sueltas a unidades totales
 * @param {Object} params
 * @param {number} params.cantidad - Cantidad (puede ser bultos o unidades según unidad)
 * @param {string} params.unidad - "BULTO" | "UNIDAD"
 * @param {number} params.factorPack - Factor del pack (ej: 12 para cajón x12)
 * @returns {number} Total en unidades
 */
export function toUnidades({ cantidad, unidad, factorPack = 1 }) {
  if (!cantidad || cantidad <= 0) return 0;
  
  if (unidad === "BULTO" && factorPack > 1) {
    return cantidad * factorPack;
  }
  
  // UNIDAD o factorPack <= 1
  return cantidad;
}

/**
 * Convierte unidades totales a bultos + sueltas
 * @param {Object} params
 * @param {number} params.unidades - Total en unidades
 * @param {number} params.factorPack - Factor del pack (ej: 12)
 * @returns {Object} { bultos: number, sueltas: number, totalUnidades: number }
 */
export function fromUnidades({ unidades, factorPack = 1 }) {
  const total = Number(unidades || 0);

  if (factorPack <= 1) {
    return {
      bultos: 0,
      sueltas: aEscalaFisica(total),
      totalUnidades: total,
    };
  }

  // Se calcula sobre el VALOR ABSOLUTO y recién al final se le pone el signo.
  //
  // Antes era `Math.floor(total / factorPack)` con `total % factorPack`, y esas
  // dos no son operaciones compañeras cuando el número es negativo: `Math.floor`
  // redondea hacia abajo y `%` conserva el signo del dividendo. Con -13 y factor
  // 12 daba -2 bultos y -1 sueltas, que reconstruido es -25 y no -13: contaba un
  // bulto de más. Se veía en el buscador del POS, que es la única superficie que
  // pinta el par sin mirar el signo.
  const signo = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const bultos = Math.floor(abs / factorPack);
  // La resta, y no el módulo: `18.35 % 10` da 8.350000000000001 porque el módulo
  // arrastra el error binario. Restar y redondear a la escala física deja 8.35.
  const sueltas = aEscalaFisica(abs - bultos * factorPack);

  // El `|| 0` no es adorno: `-1 * 0` en JavaScript da -0, y -0 no es 0 para
  // Object.is —que es con lo que comparan los candados— ni se ve igual al
  // imprimirlo. Un "-0 bultos" en pantalla sería una respuesta nueva.
  return {
    bultos: signo * bultos || 0,
    sueltas: signo * sueltas || 0,
    totalUnidades: total,
  };
}

/**
 * Valida si se puede enviar con la unidad elegida según modo_envio
 * @param {Object} params
 * @param {string} params.modoEnvio - "SOLO_BULTO" | "MIXTO" | "SOLO_UNIDAD"
 * @param {string} params.unidadElegida - "BULTO" | "UNIDAD"
 * @returns {Object} { ok: boolean, error?: string }
 */
export function validarEnvio({ modoEnvio, unidadElegida }) {
  if (!modoEnvio || modoEnvio === "MIXTO") {
    return { ok: true };
  }
  
  if (modoEnvio === "SOLO_BULTO" && unidadElegida !== "BULTO") {
    return {
      ok: false,
      error: "Este producto solo se puede enviar por bulto",
    };
  }
  
  if (modoEnvio === "SOLO_UNIDAD" && unidadElegida !== "UNIDAD") {
    return {
      ok: false,
      error: "Este producto solo se puede enviar por unidad",
    };
  }
  
  return { ok: true };
}

/**
 * Devuelve el factor para conversión BULTO ↔ UNIDAD.
 * Fuente única: ProductoBase.factor_pack (Int?).
 * Si factor_pack es null/0/1, retorna 1 (sin conversión).
 * @param {Object} base - Objeto ProductoBase (o { factor_pack })
 * @returns {number} Factor >= 1
 */
export function factorBulto(base) {
  const fp = Number(base?.factor_pack || 1);
  return fp > 1 ? fp : 1;
}

/**
 * Determina si el producto opera en modo BULTO.
 * SOLO_BULTO, MIXTO y null → true (bulto). SOLO_UNIDAD → false.
 * @param {string|null} modoEnvio
 * @returns {boolean}
 */
export function esBultoMode(modoEnvio) {
  return modoEnvio !== "SOLO_UNIDAD";
}

/**
 * Calcula el default de modo_envio según unidad_medida
 * cajon/pack/caja → SOLO_BULTO, unidad/kg → SOLO_UNIDAD
 * @param {string} unidadMedida - "unidad" | "pack" | "cajon" | "kg" (el enum entero)
 * @returns {string} "SOLO_BULTO" | "SOLO_UNIDAD"
 */
export function defaultModoEnvio(unidadMedida) {
  // Acá decía además "caja" y "carton", que no existen en el enum `UnidadMedida`
  // del schema. Eran ramas inalcanzables y se sacaron sin cambiar comportamiento.
  if (["cajon", "pack"].includes(unidadMedida)) {
    return "SOLO_BULTO";
  }
  return "SOLO_UNIDAD";
}

// ============================================================
// Fiambre: piezas ↔ kg (solo transferencias depósito → local)
// ============================================================

/**
 * ¿ESTE PRODUCTO SE MIDE EN KILOS?
 *
 * Contesta por la UNIDAD DE MEDIDA del producto y nada más: es el campo que usa
 * el POS para decidir si abre el teclado de peso al venderlo.
 *
 * ── OJO: NO ES LA PREGUNTA DE LA RECEPCIÓN ────────────────────────────────
 *
 * Para costear un renglón AL RECIBIR hay que preguntar
 * `elDepositoCuentaPorKilo`, más abajo. Son dos preguntas distintas sobre el
 * mismo producto: Papas Congeladas se mide en kilos —y se vende por kilo en dos
 * locales— pero el depósito la compra y la guarda POR PIEZA.
 *
 * Esta función se usó para las dos durante un día, y por eso la recepción le
 * pedía kilos a las papas. Son 40 de los 100 productos en kilos los que están
 * en esa situación, medido contra producción.
 *
 * @param {Object} base - ProductoBase o { unidad_medida }
 * @returns {boolean}
 */
export function seMideEnKilos(base) {
  if (!base) return false;
  return String(base.unidad_medida || "").toLowerCase() === "kg";
}

/**
 * Indica si el producto es fiambre (compra por pieza, stock en kg, venta por kg).
 * Condición: unidad_medida = kg, modoCompraProveedor = UNIDAD, pesoReferenciaKg > 0.
 * @param {Object} base - ProductoBase o { unidad_medida, modoCompraProveedor, pesoReferenciaKg }
 * @returns {boolean}
 */
export function esProductoFiambre(base) {
  if (!base) return false;
  // El "kg" lo lee `seMideEnKilos`, que es el único lugar que mira ese campo.
  const modo = base.modoCompraProveedor || "";
  const peso = Number(base.pesoReferenciaKg ?? 0);
  return seMideEnKilos(base) && modo === "UNIDAD" && peso > 0;
}

/**
 * Indica si el producto se vende/maneja por PIEZA en depósito.
 * Depósito maneja en PIEZAS, local en KG. Conversión solo al recibir.
 * Condición: esProductoFiambre + modoVentaDeposito = "PIEZA".
 * Fallback: pesoEsFijo (compatibilidad hasta migrar todos los productos).
 * @param {Object} base - ProductoBase
 * @returns {boolean}
 */
export function esFiambreFijo(base) {
  if (!esProductoFiambre(base)) return false;
  // Campo nuevo: modoVentaDeposito
  if (base.modoVentaDeposito) return base.modoVentaDeposito === "PIEZA";
  // Fallback: pesoEsFijo (productos no migrados)
  return base.pesoEsFijo === true;
}

/**
 * EL PREDICADO ÚNICO. Si el stock de este producto, EN ESTA UBICACIÓN, se
 * cuenta en piezas.
 *
 * ── LA REGLA DE NEGOCIO, QUE ES DE UBICACIÓN Y NO DE PRODUCTO ───────────────
 *
 * En el DEPÓSITO el fiambre de pieza fija se guarda EN PIEZAS. En CUALQUIER
 * LOCAL se guarda EN KILOS, convertido con `pesoReferenciaKg` (una pieza de
 * mortadela son 4,5 kg). No es una propiedad del producto: el mismo producto se
 * cuenta distinto según dónde esté parado el stock.
 *
 * ── POR QUÉ EXISTE ESTA FUNCIÓN Y NO SE USA `esFiambreFijo` SUELTO ──────────
 *
 * Porque `esFiambreFijo(base)` contesta sobre el PRODUCTO y no sabe dónde está.
 * La recepción la llamaba sola y sumaba piezas a la fila de un local, mientras
 * el POS de ese local descontaba kilos: el mismo número leído en dos unidades.
 * Todo lo que ESCRIBE stock tiene que preguntar acá, no allá.
 *
 * `esFiambreFijo` sigue existiendo para las superficies que ya resuelven la
 * ubicación por su cuenta y solo necesitan la parte del producto.
 *
 * @param {Object} base - ProductoBase
 * @param {boolean} esDeposito - si la UBICACIÓN donde vive ese stock es depósito
 * @returns {boolean}
 */
export function esFiambreFijoEnUbicacion(base, esDeposito) {
  if (esDeposito !== true) return false;
  return esFiambreFijo(base);
}

/**
 * ¿EL DEPÓSITO GUARDA ESTE PRODUCTO POR KILO?
 *
 * ── LA PREGUNTA QUE HAY QUE HACER AL RECIBIR, Y NO ES LA DE LA VENTA ──────
 *
 * Decisión de Emanuel: *"acá estamos hablando de depósito"*. Si un producto se
 * costea por kilo o por pieza AL RECIBIR lo decide cómo lo COMPRA Y LO GUARDA
 * el depósito, no cómo lo vende el POS en los locales. Son dos preguntas
 * distintas sobre el mismo producto y se contestan con campos distintos.
 *
 * El caso que lo destapó: **Papas Congeladas**. Se vende POR KILO en Casiano
 * casas y en Mini unidas —medido: 53 de 95 renglones con decimales en uno, los
 * 2 que hay en el otro— y el depósito la compra y la guarda POR PIEZA, con sus
 * 47 renglones enteros. Preguntando por la venta, la recepción le pedía kilos a
 * un producto que entra en bolsones contados.
 *
 * Alcance medido contra producción: de los 100 productos activos que se miden
 * en kilos, **40 los guarda el depósito por pieza**. A esos cuarenta la
 * recepción les pedía kilos que nadie pesa.
 *
 * ── CÓMO SE CONTESTA, Y POR QUÉ NO HACE FALTA UN CAMPO NUEVO ──────────────
 *
 * `esFiambreFijoEnUbicacion(base, true)` ya contesta si el stock se cuenta en
 * PIEZAS en el depósito — es el predicado que el cierre de la recepción usa
 * desde antes para decidir cuánto stock entra. El campo que lo decide es
 * `modoVentaDeposito` (PIEZA o PESO), con `pesoEsFijo` de respaldo para los
 * productos que todavía no se migraron.
 *
 * Así que esto no agrega criterio: junta los dos que ya existen. Se mide en
 * kilos Y el depósito no lo cuenta por pieza.
 *
 * Medido sobre los cuatro renglones por peso del pedido #242:
 *
 *   Papas Congeladas         modoVentaDeposito PIEZA  → por PIEZA
 *   Salametro                modoVentaDeposito PESO   → por KILO
 *   Salamín Fox Picado Fino  modoVentaDeposito PESO   → por KILO
 *   Barra Tremblay           modoVentaDeposito PESO   → por KILO
 *
 * @param {Object} base - ProductoBase
 * @returns {boolean}
 */
export function elDepositoCuentaPorKilo(base) {
  if (!seMideEnKilos(base)) return false;
  return !esFiambreFijoEnUbicacion(base, true);
}

/**
 * Convierte piezas a kg usando peso de referencia.
 * @param {number} piezas
 * @param {number} pesoReferenciaKg
 * @returns {number} kg (redondeado a 3 decimales)
 */
export function piezasToKg(piezas, pesoReferenciaKg) {
  const p = Number(piezas || 0);
  const ref = Number(pesoReferenciaKg || 0);
  if (p <= 0 || ref <= 0) return 0;
  return Math.round(p * ref * 1000) / 1000;
}

/**
 * Convierte kg a piezas (referencia para mostrar en UI).
 * @param {number} kg
 * @param {number} pesoReferenciaKg
 * @returns {number} piezas (redondeado a 2 decimales)
 */
export function kgToPiezas(kg, pesoReferenciaKg) {
  const k = Number(kg || 0);
  const ref = Number(pesoReferenciaKg || 0);
  if (k <= 0 || ref <= 0) return 0;
  return Math.round((k / ref) * 100) / 100;
}




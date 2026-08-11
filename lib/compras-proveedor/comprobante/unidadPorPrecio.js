// lib/compras-proveedor/comprobante/unidadPorPrecio.js
//
// ¿EL PRECIO DE LA FACTURA ES POR UNIDAD O POR BULTO?
//
// La factura no lo dice. La de DYSSA trae "Pr Unit S/Desc" y nada más: no hay
// ninguna columna que declare la presentación. En el módulo de LISTAS sí la hay
// —el archivo del proveedor trae UN, BU o DI y `basePrecioDeFila` la lee—, así
// que esto NO es un reuso: es un mecanismo nuevo, y por eso va en su propia
// tanda y con sus propios candados.
//
// ── LA IDEA, Y POR QUÉ FUNCIONA ────────────────────────────────────────────
//
// Si el ERP costea el pack de 10 a $10.000 y la factura cobra $1.000, el
// cociente da 10 y coincide con el `factor_pack`: vino por unidad.
//
// Funciona porque un aumento de precio y un cambio de unidad tienen TAMAÑOS
// distintos. Un aumento es del orden del 5 al 20 %; un cambio de unidad es del
// orden del factor del pack. Con esa distancia no se confunden.
//
// ── LO MEDIDO SOBRE EL CATÁLOGO REAL ───────────────────────────────────────
//
// `erpazul_al`, 2026-08-11: 1279 productos con `factor_pack` mayor que 1.
//
//     factor 6  → 238 productos      factor 12 → 287
//     factor 10 → 168                factor 24 → 128
//     factor 20 →  97                mínimo 2 · máximo 450
//
// Y el dato que decide el diseño: **los packs de 2 y de 3 son SEIS productos
// sobre 1279, el 0,5 %.** La zona donde un aumento grande y un cambio de unidad
// se parecen existe, pero es diminuta. No hace falta un criterio que la resuelva
// adivinando: alcanza con que la detecte y pregunte.
//
// ── CÓMO SE DECIDE ─────────────────────────────────────────────────────────
//
// Se comparan las DOS hipótesis por el cambio de precio que cada una implica, y
// gana la que implica el cambio más chico. Pero solo si la otra es implausible:
// si las dos explican el número con un cambio razonable, NO SE DECIDE, SE
// PREGUNTA. Es la misma regla del vínculo — solo lo que no interpreta nada
// resuelve solo.
//
// ── EL ORDEN IMPORTA: NETO A FINAL ANTES DE COMPARAR ───────────────────────
//
// El costo del ERP está en escala FINAL —con impuestos adentro— y el precio de
// la factura viene NETO. Comparar neto contra final mete el 21 % del IVA en el
// cociente, y un 21 % se lee como un cambio de unidad cuando el pack es chico.
// Por eso esta función EXIGE que le pasen el unitario ya convertido a final, y
// hay un candado que lo demuestra con números.

/** Los veredictos posibles. */
export const UNIDAD = Object.freeze({
  POR_UNIDAD: "POR_UNIDAD",
  POR_BULTO: "POR_BULTO",
  NO_SE_PUEDE_DECIDIR: "NO_SE_PUEDE_DECIDIR",
  SIN_DATOS: "SIN_DATOS",
});

export const TEXTO_UNIDAD = Object.freeze({
  [UNIDAD.POR_UNIDAD]:
    "La factura cobra por unidad suelta, y el producto se costea por bulto. El costo del " +
    "bulto sale de multiplicar por las unidades que trae.",
  [UNIDAD.POR_BULTO]: "La factura cobra el bulto entero, igual que el ERP. El precio entra tal cual.",
  [UNIDAD.NO_SE_PUEDE_DECIDIR]:
    "No se puede saber si la factura cobra por unidad o por bulto: las dos lecturas explican " +
    "el precio con un cambio razonable. Elegí vos cuál es.",
  [UNIDAD.SIN_DATOS]:
    "Falta el costo anterior del producto o cuántas unidades trae el bulto. Sin eso no hay con " +
    "qué comparar.",
});

/**
 * Cuánto puede cambiar un precio de una compra a la otra sin que sorprenda.
 *
 * 35 %. Sale de arriba del rango de aumento que el proyecto ya considera
 * esperable —entre 10 y 20 %, con 30 % como umbral de variación en listas— con
 * margen para una compra espaciada o un salto de inflación. Por encima de esto,
 * "el precio subió" deja de ser la explicación cómoda.
 */
export const CAMBIO_PLAUSIBLE_PCT = 35;

/**
 * Cuánto puede desviarse el cociente del factor para seguir siendo "ese factor".
 *
 * El mismo 35 %: es el mismo fenómeno visto desde el otro lado. Si el pack es de
 * 10 y el cociente da 9,7, la explicación es un precio 3 % más caro, no otro
 * factor — no existen packs de 9,7.
 */
const aCambioPct = (esperado, observado) => Math.abs(esperado / observado - 1) * 100;

/**
 * ¿Por unidad o por bulto?
 *
 * @param {number} costoAnteriorFinal  el costo del ERP, en escala FINAL
 * @param {number} precioFacturaFinal  el unitario de la factura, YA convertido a
 *                                     final. Neto acá mete el IVA en el cociente.
 * @param {number} factorPack          cuántas unidades trae el bulto
 */
export function deducirUnidad({ costoAnteriorFinal, precioFacturaFinal, factorPack } = {}) {
  const costo = Number(costoAnteriorFinal);
  const precio = Number(precioFacturaFinal);
  const factor = Number(factorPack);

  if (!Number.isFinite(costo) || costo <= 0 || !Number.isFinite(precio) || precio <= 0) {
    return sinDatos("Falta el costo anterior o el precio de la factura.");
  }
  if (!Number.isFinite(factor) || factor <= 1) {
    // Sin bulto no hay dos lecturas posibles: el precio es lo que es.
    return {
      unidad: UNIDAD.POR_BULTO,
      texto: "El producto no se costea por bulto, así que el precio de la factura entra tal cual.",
      cociente: costo / precio,
      requiereDecision: false,
      cambioImplicado: { porBulto: (costo / precio - 1) * 100, porUnidad: null },
    };
  }

  const cociente = costo / precio;

  // Cuánto cambio de precio implica cada hipótesis.
  //   por bulto → el precio de la factura debería parecerse al costo (cociente 1)
  //   por unidad → debería parecerse al costo dividido el factor (cociente = factor)
  const cambioSiBulto = aCambioPct(1, cociente);
  const cambioSiUnidad = aCambioPct(factor, cociente);

  const ganadora = cambioSiUnidad < cambioSiBulto ? UNIDAD.POR_UNIDAD : UNIDAD.POR_BULTO;
  const cambioGanador = Math.min(cambioSiUnidad, cambioSiBulto);
  const cambioPerdedor = Math.max(cambioSiUnidad, cambioSiBulto);

  const base = {
    cociente,
    factorPack: factor,
    cambioImplicado: { porBulto: cambioSiBulto, porUnidad: cambioSiUnidad },
  };

  // La ganadora tiene que explicar el número con un cambio PLAUSIBLE...
  if (cambioGanador > CAMBIO_PLAUSIBLE_PCT) {
    return {
      ...base,
      unidad: UNIDAD.NO_SE_PUEDE_DECIDIR,
      requiereDecision: true,
      porque:
        `Ninguna de las dos lecturas explica el precio: por bulto haría falta un cambio de ` +
        `${cambioSiBulto.toFixed(0)} % y por unidad uno de ${cambioSiUnidad.toFixed(0)} %. ` +
        `Puede ser un precio muy viejo, o un producto distinto.`,
      texto: TEXTO_UNIDAD[UNIDAD.NO_SE_PUEDE_DECIDIR],
    };
  }

  // ...Y LA PERDEDORA TIENE QUE SER IMPLAUSIBLE. Si las dos explican el número,
  // elegir la mejor sería adivinar: es el caso de los packs chicos, donde un
  // aumento grande y un cambio de unidad se parecen. Son 6 productos de 1279,
  // así que preguntar ahí cuesta muy poco y equivocarse cuesta una factura.
  if (cambioPerdedor <= CAMBIO_PLAUSIBLE_PCT) {
    return {
      ...base,
      unidad: UNIDAD.NO_SE_PUEDE_DECIDIR,
      requiereDecision: true,
      porque:
        `Las dos lecturas explican el precio: por bulto sería un cambio de ` +
        `${cambioSiBulto.toFixed(0)} % y por unidad uno de ${cambioSiUnidad.toFixed(0)} %. ` +
        `Con un bulto de ${factor} las dos son creíbles.`,
      texto: TEXTO_UNIDAD[UNIDAD.NO_SE_PUEDE_DECIDIR],
    };
  }

  return {
    ...base,
    unidad: ganadora,
    requiereDecision: false,
    porque:
      ganadora === UNIDAD.POR_UNIDAD
        ? `El costo del bulto es ${cociente.toFixed(1)} veces el precio de la factura, y el bulto ` +
          `trae ${factor}. Leerlo por bulto obligaría a un cambio de ${cambioSiBulto.toFixed(0)} %.`
        : `El precio de la factura se parece al costo del bulto (${cambioSiBulto.toFixed(0)} % de ` +
          `diferencia). Leerlo por unidad obligaría a un cambio de ${cambioSiUnidad.toFixed(0)} %.`,
    texto: TEXTO_UNIDAD[ganadora],
  };
}

function sinDatos(porque) {
  return {
    unidad: UNIDAD.SIN_DATOS,
    requiereDecision: true,
    porque,
    texto: TEXTO_UNIDAD[UNIDAD.SIN_DATOS],
    cociente: null,
    cambioImplicado: { porBulto: null, porUnidad: null },
  };
}

/**
 * DÓNDE ESTÁ LA ZONA AMBIGUA DE UN FACTOR, calculada y no supuesta.
 *
 * Las dos hipótesis son plausibles en dos rangos de cociente:
 *
 *   por bulto  → c entre 1/(1+t) y 1/(1-t)
 *   por unidad → c entre f/(1+t) y f/(1-t)
 *
 * Si esos rangos se tocan, hay cocientes que las dos explican, y ahí no se
 * decide. Devuelve el tramo, o null si no se tocan.
 *
 * MEDIDO con el umbral actual del 35 %: SOLO EL PACK DE 2 tiene zona ambigua, y
 * va de 1,48 a 1,54 — un tramo del 4 % de ancho. Del 3 en adelante los rangos ni
 * se rozan. En el catálogo real los packs de 2 son CUATRO productos de 1279.
 *
 * El primer candado que escribí para esto ponía la ambigüedad del pack de 2 en
 * el cociente 2 —el precio exacto por unidad— y estaba mal: ahí "por bulto"
 * exigiría un precio a mitad, que no es plausible, así que el sistema decide
 * bien y decide solo. La ambigüedad está donde los rangos se tocan, no donde
 * uno esperaría.
 */
export function zonaAmbigua(factorPack, cambioPlausiblePct = CAMBIO_PLAUSIBLE_PCT) {
  const f = Number(factorPack);
  const t = cambioPlausiblePct / 100;
  if (!Number.isFinite(f) || f <= 1) return null;
  const bultoHasta = 1 / (1 - t);
  const unidadDesde = f / (1 + t);
  if (unidadDesde > bultoHasta) return null;
  return { desde: unidadDesde, hasta: bultoHasta, anchoPct: (bultoHasta / unidadDesde - 1) * 100 };
}

/** A partir de qué factor de pack la deducción NUNCA es ambigua. */
export function factorSinZonaAmbigua(cambioPlausiblePct = CAMBIO_PLAUSIBLE_PCT) {
  for (let f = 2; f <= 1000; f++) {
    if (!zonaAmbigua(f, cambioPlausiblePct)) return f;
  }
  return null;
}

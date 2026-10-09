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

import { armadoQueDiceElPapel } from "@/lib/compras-proveedor/contenidoDelBulto";

/** Los veredictos posibles. */
export const UNIDAD = Object.freeze({
  POR_UNIDAD: "POR_UNIDAD",
  POR_BULTO: "POR_BULTO",
  /**
   * Una presentación INTERMEDIA: un pack que es una fracción del bulto. DYSSA
   * cobra el Gancia por pack de 6 y el catálogo lo tiene por plancha de 24.
   * Viaja con `unidadesPorFacturada` —el 6—.
   */
  POR_PRESENTACION: "POR_PRESENTACION",
  NO_SE_PUEDE_DECIDIR: "NO_SE_PUEDE_DECIDIR",
  SIN_DATOS: "SIN_DATOS",
});

export const TEXTO_UNIDAD = Object.freeze({
  [UNIDAD.POR_UNIDAD]:
    "La factura cobra por unidad suelta, y el producto se costea por bulto. El costo del " +
    "bulto sale de multiplicar por las unidades que trae.",
  [UNIDAD.POR_BULTO]: "La factura cobra el bulto entero, igual que el ERP. El precio entra tal cual.",
  [UNIDAD.POR_PRESENTACION]:
    "La factura cobra un pack que es una parte del bulto. El costo del bulto sale de " +
    "multiplicar por cuántos packs trae.",
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
/**
 * LOS DIVISORES DEL BULTO: cuántas unidades puede traer lo que factura el
 * proveedor. Para 24: 1, 2, 3, 4, 6, 8, 12 y 24. El 1 es la unidad suelta y el
 * último es el bulto entero; los del medio son packs intermedios.
 */
export function divisoresDelBulto(factorPack) {
  const f = Number(factorPack);
  if (!Number.isInteger(f) || f < 1) return [];
  const d = [];
  for (let k = 1; k <= f; k++) if (f % k === 0) d.push(k);
  return d;
}

/** El veredicto que corresponde a k unidades por lo facturado, en un bulto de f. */
const unidadDe = (k, f) => (k === 1 ? UNIDAD.POR_UNIDAD : k === f ? UNIDAD.POR_BULTO : UNIDAD.POR_PRESENTACION);

/**
 * ¿Por unidad, por un pack intermedio o por bulto?
 *
 * ── LO QUE CAMBIÓ EL 2026-10-09: TODOS LOS DIVISORES DEL BULTO ─────────────
 *
 * Hasta acá había DOS hipótesis: cociente 1 (bulto) o cociente igual al factor
 * (unidad suelta). DYSSA cobra el Gancia por PACK DE 6 y el catálogo lo tiene
 * por plancha de 24: el cociente da 4,08, que no está cerca ni de 1 ni de 24,
 * así que no se decidía y el precio entraba sin escalar — la hoja decía "el
 * precio bajó 75,5 %" sobre una variación de −1,9 %.
 *
 * Ahora se prueba cada divisor k del bulto: si lo facturado trae k unidades, el
 * cociente esperado es f ÷ k. Los mismos dos de siempre son k = 1 y k = f.
 *
 *   · exactamente UNO dentro del umbral → ésa es la lectura;
 *   · dos o más → se pregunta, con los resultados de cada uno;
 *   · ninguno → recién ahí es un salto de precio.
 *
 * Los casos de siempre no cambian: el divisor más cercano a 1 y a f queda a un
 * cociente del DOBLE de distancia, afuera del umbral, así que una lectura que
 * antes era "por unidad" o "por bulto" sola sigue siéndolo.
 *
 * ── LO QUE CONFIRMA, Y QUÉ NO DECIDE NUNCA ─────────────────────────────────
 *
 * Dos cosas pueden resolver a favor de un pack intermedio cuando el precio deja
 * más de uno posible —el 6 y el 8 del Gancia caen los dos adentro del 35 %—, y
 * ninguna decide SOLA: el pack tiene que estar entre los que el precio explica.
 *
 *   · `unidadesGuardadas`: la conversión que una persona ya confirmó en el
 *     vínculo del proveedor con ese producto. Es la que hace que la próxima
 *     boleta no pregunte.
 *   · `descripcion`: "473MLX6X4" dice 6 por pack. Si coincide con un pack que
 *     el precio explica, lo refuerza; si el precio deja un solo pack intermedio
 *     y el papel dice otro, se pregunta.
 *
 * @param {number} costoAnteriorFinal  el costo del ERP, en escala FINAL
 * @param {number} precioFacturaFinal  el unitario de la factura, YA convertido a
 *                                     final. Neto acá mete el IVA en el cociente.
 * @param {number} factorPack          cuántas unidades trae el bulto
 * @param {string} [descripcion]       el texto impreso del renglón
 * @param {number} [unidadesGuardadas] lo confirmado en el vínculo del proveedor
 */
export function deducirUnidad({ costoAnteriorFinal, precioFacturaFinal, factorPack, descripcion = null, unidadesGuardadas = null } = {}) {
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

  // Cuánto cambio de precio implica cada hipótesis: si lo facturado trae k
  // unidades, el precio de la factura debería parecerse al costo del bulto
  // dividido f ÷ k.
  const cambioSiBulto = aCambioPct(1, cociente);
  const cambioSiUnidad = aCambioPct(factor, cociente);
  const hipotesis = divisoresDelBulto(factor).map((k) => ({
    unidadesPorFacturada: k,
    unidad: unidadDe(k, factor),
    cambioPct: aCambioPct(factor / k, cociente),
  }));
  const posibles = hipotesis.filter((h) => h.cambioPct <= CAMBIO_PLAUSIBLE_PCT);
  // Un factor no entero (un pack de 2,5) no tiene divisores: quedan las dos de siempre.
  if (!hipotesis.length) {
    for (const [k, c] of [[1, cambioSiUnidad], [factor, cambioSiBulto]]) {
      if (c <= CAMBIO_PLAUSIBLE_PCT) posibles.push({ unidadesPorFacturada: k, unidad: unidadDe(k, factor), cambioPct: c });
    }
  }
  const intermedios = posibles.filter((h) => h.unidad === UNIDAD.POR_PRESENTACION);

  const base = {
    cociente,
    factorPack: factor,
    cambioImplicado: { porBulto: cambioSiBulto, porUnidad: cambioSiUnidad },
    /** Las lecturas que el precio explica, para poder decir cada resultado. */
    posibles: posibles.map((h) => h.unidadesPorFacturada),
  };
  const armado = armadoQueDiceElPapel(descripcion);
  const packDelPapel = armado?.porPack ?? null;

  /** Una lectura elegida, con el motivo dicho en criollo. */
  const elegir = (h, porque, origen) => ({
    ...base,
    unidad: h.unidad,
    unidadesPorFacturada: h.unidadesPorFacturada,
    requiereDecision: false,
    origen,
    porque,
    texto: TEXTO_UNIDAD[h.unidad],
  });
  const preguntar = (porque) => ({
    ...base,
    unidad: UNIDAD.NO_SE_PUEDE_DECIDIR,
    requiereDecision: true,
    porque,
    texto: TEXTO_UNIDAD[UNIDAD.NO_SE_PUEDE_DECIDIR],
  });

  // NINGUNA lectura explica el precio: recién acá es un salto.
  if (!posibles.length) {
    return preguntar(
      `Ninguna de las dos lecturas explica el precio: por bulto haría falta un cambio de ` +
        `${cambioSiBulto.toFixed(0)} % y por unidad uno de ${cambioSiUnidad.toFixed(0)} %` +
        (hipotesis.length > 2 ? `, y tampoco un pack intermedio del bulto de ${factor}` : "") +
        `. Puede ser un precio muy viejo, o un producto distinto.`
    );
  }

  // LO YA CONFIRMADO, si el precio lo sigue explicando. Un pack guardado que
  // el precio de hoy no explica no se fuerza: se vuelve a deducir.
  const guardada = posibles.find((h) => h.unidadesPorFacturada === Number(unidadesGuardadas));
  if (guardada) {
    return elegir(guardada, `Ya se confirmó que este proveedor lo trae de a ${guardada.unidadesPorFacturada}.`, "GUARDADA");
  }

  // ── PRIMERO LAS DOS DE SIEMPRE, CON SU REGLA DE SIEMPRE ───────────────
  //
  // Medido con el candado de la suba del 30 %: entre la unidad suelta y el
  // pack de 2 hay una franja donde los dos son plausibles —la misma que tiene
  // el pack de 2 entre unidad y bulto—, así que mirar todos los divisores a la
  // vez hacía preguntar sobre renglones que hoy se deciden solos. Los packs
  // intermedios entran SOLO cuando ni la unidad ni el bulto explican el precio,
  // que es exactamente el caso que faltaba.
  const extremos = posibles.filter((h) => h.unidad !== UNIDAD.POR_PRESENTACION);
  if (extremos.length) {
    if (extremos.length > 1) {
      return preguntar(
        `Las dos lecturas explican el precio: por bulto sería un cambio de ` +
          `${cambioSiBulto.toFixed(0)} % y por unidad uno de ${cambioSiUnidad.toFixed(0)} %. ` +
          `Con un bulto de ${factor} las dos son creíbles.`
      );
    }
    const [h] = extremos;
    return elegir(
      h,
      h.unidad === UNIDAD.POR_UNIDAD
        ? `El costo del bulto es ${cociente.toFixed(1)} veces el precio de la factura, y el bulto ` +
            `trae ${factor}. Leerlo por bulto obligaría a un cambio de ${cambioSiBulto.toFixed(0)} %.`
        : `El precio de la factura se parece al costo del bulto (${cambioSiBulto.toFixed(0)} % de ` +
            `diferencia). Leerlo por unidad obligaría a un cambio de ${cambioSiUnidad.toFixed(0)} %.`,
      "PRECIO"
    );
  }

  // EL PAPEL CONFIRMA un pack intermedio que el precio explica.
  const confirmadoPorElPapel = intermedios.find((h) => h.unidadesPorFacturada === packDelPapel);
  if (confirmadoPorElPapel) {
    return elegir(
      confirmadoPorElPapel,
      `El papel dice ${packDelPapel} por pack y el precio lo confirma: ${posibles.length > 1 ? "de las lecturas posibles es " : ""}` +
        `la única que el papel describe.`,
      "CONFIRMADA_POR_EL_PAPEL"
    );
  }

  // De acá para abajo solo quedan packs intermedios.
  if (posibles.length > 1) {
    // Dos packs que explican el número, y el papel no dice cuál: elegir el
    // mejor sería adivinar. Se pregunta con el resultado de cada uno.
    return preguntar(
      `Más de una lectura explica el precio: de a ${posibles.map((h) => h.unidadesPorFacturada).join(", de a ")} ` +
        `unidades por lo facturado, en un bulto de ${factor}.`
    );
  }

  const [unica] = posibles;
  // Un solo pack intermedio, y el papel describe OTRO: se pregunta.
  if (packDelPapel !== null && packDelPapel !== unica.unidadesPorFacturada) {
    return preguntar(
      `El precio dice de a ${unica.unidadesPorFacturada} y el papel dice ${packDelPapel} por pack: no coinciden.`
    );
  }
  return elegir(
    unica,
    `El costo del bulto es ${cociente.toFixed(1)} veces el precio de la factura: es un pack de ` +
      `${unica.unidadesPorFacturada} en un bulto de ${factor}.`,
    "PRECIO"
  );
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

// ── DE LA DEDUCCIÓN A ALGO QUE SE LEA ──────────────────────────────────────
//
// El cociente no le dice nada a nadie. "3,08" no es una respuesta: la respuesta
// es "son 3 bultos y el bulto sale 37.474".
//
// Y cuando hay que preguntar, la pregunta NO puede ser entre dos etiquetas
// abstractas —"¿por unidad o por bulto?"— sino entre DOS RESULTADOS CONCRETOS,
// cada uno con su cantidad y su costo. Elegir entre dos resultados es fácil;
// elegir entre dos etiquetas obliga a reconstruir la cuenta mentalmente.

/**
 * Las dos lecturas posibles de una línea, cada una con sus números.
 *
 * @param cantidad      la que dice la factura
 * @param precioFinal   el unitario de la factura, YA en escala final
 * @param factorPack    cuántas unidades trae el bulto del ERP
 */
export function lecturasPosibles({ cantidad, precioFinal, factorPack, unidadesPorFacturada = null, posibles = [] } = {}) {
  const c = Number(cantidad);
  const p = Number(precioFinal);
  const n = Number(factorPack);
  if (!Number.isFinite(c) || !Number.isFinite(p) || !Number.isFinite(n) || n <= 1) return null;

  // ── UN PACK INTERMEDIO: k unidades por lo facturado, f ÷ k packs por bulto ─
  //
  // 8 packs de 6 en una plancha de 24 son 8 × 6 ÷ 24 = 2 planchas, y la plancha
  // cuesta lo que el pack por los 4 packs que trae.
  const deUnPack = (k) => {
    const packsPorBulto = n / k;
    const bultos = (c * k) / n;
    return {
      unidad: UNIDAD.POR_PRESENTACION,
      unidadesPorFacturada: k,
      packsPorBulto,
      bultos,
      costoPorBulto: p * packsPorBulto,
      divideJusto: Number.isInteger(bultos),
      texto: `Es por pack de ${limpio(k)}: ${formatearBultos(bultos)} de ${limpio(n)} a ${pesos(p * packsPorBulto)} cada uno`,
      cuenta: `${limpio(c)} ${c === 1 ? "pack" : "packs"} = ${formatearBultos(bultos)} de ${limpio(n)}`,
    };
  };
  const esIntermedio = (k) => Number.isFinite(Number(k)) && Number(k) > 1 && Number(k) < n;
  const extras = {};
  if (esIntermedio(unidadesPorFacturada)) extras.porPresentacion = deUnPack(Number(unidadesPorFacturada));
  // Las intermedias que el precio explica, para poder decir cada resultado cuando se pregunta.
  const intermedias = (posibles ?? []).filter(esIntermedio).map((k) => deUnPack(Number(k)));
  if (intermedias.length) extras.intermedias = intermedias;

  const bultosSiUnidad = c / n;
  return {
    ...extras,
    porUnidad: {
      unidad: UNIDAD.POR_UNIDAD,
      bultos: bultosSiUnidad,
      costoPorBulto: p * n,
      // Una cantidad que NO divide justo por el pack es señal de que la lectura
      // por unidad no cierra: nadie compra 3,08 bultos. Se dice, no se redondea.
      divideJusto: Number.isInteger(bultosSiUnidad),
      texto: `Es por unidad: ${formatearBultos(bultosSiUnidad)} a ${pesos(p * n)} cada uno`,
      cuenta: `${limpio(c)} ÷ ${limpio(n)} = ${formatearBultos(bultosSiUnidad)}`,
    },
    porBulto: {
      unidad: UNIDAD.POR_BULTO,
      bultos: c,
      costoPorBulto: p,
      divideJusto: true,
      texto: `Es por bulto: ${formatearBultos(c)} a ${pesos(p)} cada uno`,
      cuenta: `${limpio(c)} bultos, el precio entra tal cual`,
    },
  };
}

/**
 * La frase que explica un veredicto ya tomado, en criollo.
 *
 * "La factura lo trae por unidad: 36 ÷ 12 = 3 bultos". El cociente queda
 * disponible en el objeto para quien quiera comprobar la cuenta, pero no es lo
 * que se lee.
 */
/**
 * LA LECTURA QUE CORRESPONDE AL VEREDICTO, o null.
 *
 * Una sola pregunta para los tres lugares que la hacían por su cuenta —el
 * precio a escribir, la cantidad en la escala del pedido y la tarjeta— con
 * `unidad === "POR_UNIDAD" ? porUnidad : porBulto`. Con el pack intermedio esa
 * forma caía en "por bulto" y entraba 8 planchas en vez de 2.
 *
 * @param u  el veredicto con sus `lecturas`, como lo deja `analizarPrecioDeLinea`
 */
export function lecturaElegida(u) {
  if (!u || u.requiereDecision) return null;
  const l = u.lecturas;
  if (!l) return null;
  if (u.unidad === UNIDAD.POR_PRESENTACION) return l.porPresentacion ?? null;
  if (u.unidad === UNIDAD.POR_UNIDAD) return l.porUnidad ?? null;
  return l.porBulto ?? null;
}

export function explicarVeredicto({ veredicto, cantidad, precioFinal, factorPack, proveedor = null } = {}) {
  const lecturas = lecturasPosibles({
    cantidad,
    precioFinal,
    factorPack,
    unidadesPorFacturada: veredicto?.unidadesPorFacturada,
    posibles: veredicto?.posibles,
  });
  if (!lecturas) return null;
  const quien = String(proveedor ?? "").trim() || "La factura";

  // ── EL PACK INTERMEDIO, CON LA CUENTA A LA VISTA ──────────────────────
  //
  // "Dyssa lo trae por pack de 6: 8 packs = 2 bultos de 24". El cociente no se
  // dice: no es una respuesta.
  if (veredicto?.unidad === UNIDAD.POR_PRESENTACION && lecturas.porPresentacion) {
    const l = lecturas.porPresentacion;
    return {
      frase: `${quien} lo trae por pack de ${limpio(l.unidadesPorFacturada)}: ${l.cuenta}`,
      detalle: `El bulto de ${limpio(factorPack)} queda en ${pesos(l.costoPorBulto)}.`,
      elegida: l,
      avisoDivision: l.divideJusto
        ? null
        : `Ojo: ${limpio(cantidad)} packs de ${limpio(l.unidadesPorFacturada)} no completan bultos ` +
          `enteros de ${limpio(factorPack)} —nadie compra ${formatearBultos(l.bultos)}—. ` +
          `Revisá la cantidad o cargá lo que entró.`,
    };
  }
  // ── Y CUANDO SE PREGUNTA, CADA RESULTADO CON SUS NÚMEROS ──────────────
  if (veredicto?.requiereDecision && lecturas.intermedias?.length) {
    const opciones = [
      ...(veredicto.posibles ?? []).includes(Number(factorPack)) ? [lecturas.porBulto.texto] : [],
      ...lecturas.intermedias.map((l) => l.texto),
      ...(veredicto.posibles ?? []).includes(1) ? [lecturas.porUnidad.texto] : [],
    ];
    return {
      frase: `No se sabe cómo lo trae ${quien === "La factura" ? "la factura" : quien}. ${opciones.join(". ")}.`,
      detalle: null,
      elegida: null,
      avisoDivision: null,
    };
  }

  if (veredicto?.unidad === UNIDAD.POR_UNIDAD) {
    return {
      frase: `La factura lo trae por unidad: ${lecturas.porUnidad.cuenta}`,
      detalle: `El bulto queda en ${pesos(lecturas.porUnidad.costoPorBulto)}.`,
      elegida: lecturas.porUnidad,
      avisoDivision: lecturas.porUnidad.divideJusto
        ? null
        : `Ojo: ${limpio(cantidad)} no se divide justo por ${limpio(factorPack)}. ` +
          `Puede que el bulto no sea de ${limpio(factorPack)}, o que la cantidad esté mal leída.`,
    };
  }
  if (veredicto?.unidad === UNIDAD.POR_BULTO) {
    return {
      frase: `La factura lo trae por bulto: ${lecturas.porBulto.cuenta}`,
      detalle: `El bulto queda en ${pesos(lecturas.porBulto.costoPorBulto)}.`,
      elegida: lecturas.porBulto,
      avisoDivision: null,
    };
  }
  return null;
}

const pesos = (v) =>
  "$" + Number(v ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const limpio = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
};

function formatearBultos(n) {
  const v = Number(n);
  if (Number.isInteger(v)) return `${v} ${v === 1 ? "bulto" : "bultos"}`;
  return `${v.toFixed(2)} bultos`;
}

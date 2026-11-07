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

import {
  armadoQueDiceElPapel,
  unidadesQueDiceElRenglon,
  unidadesQueDiceLaDescripcion,
} from "@/lib/compras-proveedor/contenidoDelBulto";
import { cantidadPorCajaEnNombre } from "@/lib/proveedores/listas/lectura/numeroDeLista";

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

/** Lo que se dice cuando ninguna lectura gana clara y se pregunta en Corregir. */
export const TEXTO_ELEGIR_LECTURA =
  "Ninguna lectura gana clara: la que menos se aparta de tu costo no le saca el triple a la siguiente. Elegí en qué viene.";

/**
 * CUÁNTAS TRAE CADA UNO DE LO QUE FACTURA EL RENGLÓN, SEGÚN EL PAPEL, o null.
 * El armado ("473MLX6X4" → 6) y si no, la cantidad del nombre ("X 6",
 * "XCAJA 20", "x 24"; un peso no cuenta: `cantidadPorCajaEnNombre`).
 */
export function cantidadPorPackDelPapel(descripcion) {
  const n = armadoQueDiceElPapel(descripcion)?.porPack ?? cantidadPorCajaEnNombre(descripcion);
  return Number.isInteger(n) && n > 1 ? n : null;
}

// Mismo default que `VARIACION_POR_DEFECTO` (`decisionDeCostoSugerida.js`):
// no se importa de ahí para no arrastrar ese módulo a la deducción.
const VARIACION_SIN_RECETA_PCT = 10;

/**
 * EN QUÉ FACTURA EL PROVEEDOR: GANA LA LECTURA QUE DEJA MENOS DIFERENCIA
 * CONTRA SU COSTO (Emanuel, 2026-11-07).
 *
 * El factor de la ficha es casi siempre cierto; lo que no se sabe es en qué
 * factura el proveedor. Las lecturas son pocas y con nombre: por unidad, por el
 * bulto de la ficha y por la cantidad por pack que dice el papel. Nunca un
 * entero cualquiera: "COLON SELECTO TINTO DULCE", 1 a $ 44.543,90 contra
 * $ 6.666,67 la unidad, daba 6,68 ≈ 7 y frenaba, y no existe un pack de 7.
 *
 * Cada lectura da un precio por unidad del papel —precio ÷ k— y su diferencia
 * contra el costo por unidad. Gana la de menor diferencia si (a) es la única
 * dentro de la variación del proveedor, o (b) la segunda deja por lo menos el
 * TRIPLE. Si no, no hay ganadora y se pregunta.
 *
 * @param precioPorFacturado  lo que cobra el papel por cada uno de lo facturado
 * @param costoPorUnidad      el costo de una unidad de la ficha
 * @param candidatos          los k de las lecturas, sin repetir
 * @returns `{ lecturas: [{ unidadesPorFacturada, papelPorUnidad, diferenciaPct }], ganadora }`,
 *          ordenadas de menor a mayor diferencia; `ganadora` null si no es clara.
 */
export function elegirLectura({ precioPorFacturado, costoPorUnidad, candidatos = [], variacionPct = null } = {}) {
  const precio = Number(precioPorFacturado);
  const costo = Number(costoPorUnidad);
  if (!(precio > 0) || !(costo > 0)) return { lecturas: [], ganadora: null };
  const ks = [...new Set(candidatos.map(Number))].filter((k) => Number.isInteger(k) && k >= 1);
  const lecturas = ks
    .map((k) => {
      const papelPorUnidad = precio / k;
      return { unidadesPorFacturada: k, papelPorUnidad, diferenciaPct: ((papelPorUnidad - costo) / costo) * 100 };
    })
    .sort((a, b) => Math.abs(a.diferenciaPct) - Math.abs(b.diferenciaPct));
  const variacion = Number.isFinite(Number(variacionPct)) && variacionPct !== null ? Number(variacionPct) : VARIACION_SIN_RECETA_PCT;
  const [primera, segunda] = lecturas;
  if (!primera) return { lecturas, ganadora: null };
  const d1 = Math.abs(primera.diferenciaPct);
  const d2 = segunda ? Math.abs(segunda.diferenciaPct) : Infinity;
  const unicaDentro = d1 <= variacion && d2 > variacion;
  const triple = d2 >= 3 * d1;
  return { lecturas, ganadora: unicaDentro || triple ? primera : null, variacion };
}

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
export function deducirUnidad({
  costoAnteriorFinal,
  precioFacturaFinal,
  factorPack,
  descripcion = null,
  unidadesGuardadas = null,
  // Lo que el renglón dice que trae (`enQueViene`): confirma, no decide solo.
  enQueViene = null,
  // ── EL PACK QUE PROPUSO LA IA (Emanuel, 2026-11-07) ──────────────────
  //
  // Solo llega si la propuesta ya cerró con los números (`propuestaIa.js`) y
  // apunta al producto vinculado. Acá entra como lo ya confirmado: decide
  // SOLO si el precio lo explica. Nunca fuerza una lectura.
  packPropuesto = null,
  // La variación normal del proveedor, el mismo umbral que decide "Coincide".
  variacionPct = null,
  // ── LA REGLA DE LA MENOR DIFERENCIA (Emanuel, 2026-11-07) ─────────────
  //
  // Para el renglón del papel en la recepción: lecturas con nombre (unidad,
  // bulto de la ficha, pack del papel) y gana la de menor diferencia contra el
  // costo por unidad (`elegirLectura`). La pide `analizarPrecioDeLinea`.
  menorDiferencia = false,
} = {}) {
  const costo = Number(costoAnteriorFinal);
  const precio = Number(precioFacturaFinal);
  const factor = Number(factorPack);

  if (!Number.isFinite(costo) || costo <= 0 || !Number.isFinite(precio) || precio <= 0) {
    return sinDatos("Falta el costo anterior o el precio de la factura.");
  }
  if (!Number.isFinite(factor) || factor <= 1) {
    // ── SALVO QUE EL RENGLÓN DIGA CUÁNTAS TRAE LO FACTURADO ─────────────
    //
    // Super Mario (2026-11-05): mayonesa en sachet, que el ERP tiene POR
    // UNIDAD a $668,86, y el papel factura 5 BULTOS de 40 —UxB impreso en su
    // columna—. Tal cual, el precio de lo facturado es 40 veces el de la
    // unidad. Si el precio tal cual explica el número, manda: el lector pudo
    // haber dado ya las unidades, y multiplicar de nuevo sería inventar.
    if (aCambioPct(1, costo / precio) > CAMBIO_PLAUSIBLE_PCT) {
      const delRenglon = leerConLoQueDiceElRenglon({
        cociente: costo / precio, factor: 1, enQueViene, descripcion, unidadesGuardadas, packPropuesto, elImpresoManda: true,
      });
      if (delRenglon) return delRenglon;
    }
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

  const base = {
    cociente,
    factorPack: factor,
    cambioImplicado: { porBulto: cambioSiBulto, porUnidad: cambioSiUnidad },
    /** Las lecturas que el precio explica, para poder decir cada resultado. */
    posibles: posibles.map((h) => h.unidadesPorFacturada),
  };
  // ── LAS LECTURAS CON NOMBRE, Y GANA LA DE MENOR DIFERENCIA ─────────────
  //
  // Por unidad, por el bulto de la ficha y por lo que dice el papel ("X 6",
  // "473MLX6X4"). Emanuel, 2026-11-07: nunca un entero cualquiera —el pack de 8
  // que nadie imprimió, o el 7 del Colon tinto dulce—. Ver `elegirLectura`.
  //
  // Solo para el renglón del papel en la recepción (`menorDiferencia`, lo pide
  // `analizarPrecioDeLinea`). El cierre y la importación preguntan otra cosa
  // —en qué escala está un precio ya guardado— y siguen con su regla.
  const packDelPapel = cantidadPorPackDelPapel(descripcion);
  const eleccion = menorDiferencia
    ? elegirLectura({
        precioPorFacturado: precio,
        costoPorUnidad: costo / factor,
        candidatos: [1, factor, packDelPapel].filter((k) => Number.isInteger(k) && k >= 1),
        variacionPct,
      })
    : null;
  if (eleccion) {
    base.posibles = eleccion.lecturas.map((l) => l.unidadesPorFacturada);
    base.lecturasCandidatas = eleccion.lecturas;
  }

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

  // Ninguna parte del bulto explica el precio: antes de la regla, lo que el
  // renglón dice que trae lo facturado si no es una parte del bulto —el UxB
  // impreso, lo ya confirmado, la propuesta de la IA— y el precio lo confirma.
  if (!posibles.length) {
    const delRenglon = leerConLoQueDiceElRenglon({
      cociente, factor, enQueViene, descripcion, unidadesGuardadas, packPropuesto, elImpresoManda: false,
    });
    if (delRenglon) return delRenglon;
    // Sin la regla de la menor diferencia: ninguna lectura lo explica, se pregunta.
    if (!eleccion) {
      return {
        ...preguntar(
          `Ninguna de las dos lecturas explica el precio: por bulto haría falta un cambio de ` +
            `${cambioSiBulto.toFixed(0)} % y por unidad uno de ${cambioSiUnidad.toFixed(0)} %` +
            (hipotesis.length > 2 ? `, y tampoco un pack intermedio del bulto de ${factor}` : "") +
            `. Puede ser un precio muy viejo, o un producto distinto.`
        ),
        texto: "Ninguna lectura explica el precio: no se puede saber en qué viene. Revisá la cantidad.",
      };
    }
  }

  // LO YA CONFIRMADO, si el precio lo sigue explicando. Un pack guardado que
  // el precio de hoy no explica no se fuerza: se vuelve a deducir.
  const guardada = posibles.find((h) => h.unidadesPorFacturada === Number(unidadesGuardadas));
  if (guardada) {
    return elegir(guardada, `Ya se confirmó que este proveedor lo trae de a ${guardada.unidadesPorFacturada}.`, "GUARDADA");
  }
  // Y el pack que propuso la IA, con la misma condición: que el precio lo explique.
  const propuesto = posibles.find((h) => h.unidadesPorFacturada === Number(packPropuesto));
  if (propuesto) {
    return elegir(propuesto, `La IA leyó que viene de a ${propuesto.unidadesPorFacturada} y el precio lo confirma.`, "PROPUESTA_IA");
  }

  // ── LO QUE DICE EL RENGLÓN, si el precio lo explica ───────────────────
  //
  // `enQueViene`: el lector lo vio en el papel guiado por la explicación del
  // proveedor —la de Mauro dice que la cantidad viene siempre en unidades—.
  // Va antes que la regla de las dos de siempre porque resuelve justo donde
  // esa regla pregunta: cuando unidad y bulto explican el precio a la vez. Lo
  // que el precio no explica no se fuerza (Mauro #298, 2026-10-26).
  const delRenglon = posibles.find(
    (h) => h.unidadesPorFacturada === unidadesQueDiceElRenglon(enQueViene)
  );
  if (delRenglon) {
    return elegir(
      delRenglon,
      `El papel dice que viene ${String(enQueViene).trim()} y el precio lo confirma.`,
      "CONFIRMADA_POR_EL_PAPEL"
    );
  }

  // ── GANA LA LECTURA QUE DEJA MENOS DIFERENCIA (Emanuel, 2026-11-07) ────
  //
  // Reemplaza a la regla de "las dos de siempre" y a los packs intermedios
  // que nadie imprimió: con la ganadora clara se elige, sin ella se pregunta.
  const decirLectura = (l) =>
    `${
      l.unidadesPorFacturada === 1
        ? "por unidad"
        : l.unidadesPorFacturada === factor
          ? `por el bulto de ${factor}`
          : `por el pack de ${l.unidadesPorFacturada} del papel`
    } ` +
    `(${l.diferenciaPct >= 0 ? "+" : "−"}${Math.abs(l.diferenciaPct).toFixed(1).replace(".", ",")} %)`;
  if (eleccion) {
    if (eleccion.ganadora) {
      const k = eleccion.ganadora.unidadesPorFacturada;
      const otras = eleccion.lecturas.filter((l) => l !== eleccion.ganadora);
      return elegir(
        { unidad: unidadDe(k, factor), unidadesPorFacturada: k },
        `Gana la lectura que deja menos diferencia contra tu costo: ${decirLectura(eleccion.ganadora)}` +
          (otras.length ? `; ${otras.map(decirLectura).join(", ")}.` : "."),
        k === packDelPapel && k !== factor && k !== 1 ? "CONFIRMADA_POR_EL_PAPEL" : "PRECIO"
      );
    }
    return {
      ...preguntar(`Ninguna lectura gana clara: ${eleccion.lecturas.map(decirLectura).join(", ")}. Elegí en qué viene.`),
      texto: TEXTO_ELEGIR_LECTURA,
    };
  }

  // ── SIN LA REGLA DE LA MENOR DIFERENCIA: LA DE SIEMPRE ────────────────
  //
  // Para el cierre y la importación, que preguntan en qué escala está un
  // precio ya guardado. Las dos de siempre con su regla de siempre; los packs
  // intermedios solo cuando ni la unidad ni el bulto explican el precio.
  const intermedios = posibles.filter((h) => h.unidad === UNIDAD.POR_PRESENTACION);
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
    return preguntar(
      `Más de una lectura explica el precio: de a ${posibles.map((h) => h.unidadesPorFacturada).join(", de a ")} ` +
        `unidades por lo facturado, en un bulto de ${factor}.`
    );
  }

  const [unica] = posibles;
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

/**
 * LO FACTURADO TRAE k UNIDADES DEL ERP, Y k NO ES UNA PARTE DEL BULTO.
 *
 * Es la pregunta de siempre —si lo facturado trae k unidades, el precio de la
 * factura tiene que parecerse al costo del bulto dividido f ÷ k— con un k que
 * no sale de los divisores del bulto sino del renglón:
 *
 *   · el UxB impreso o lo que el lector dijo (`enQueViene`, "bulto de 40");
 *   · lo confirmado en el vínculo del proveedor (`unidadesGuardadas`);
 *   · lo que dice la descripción ("20X118G", "(83u)", "473MLX6X4").
 *
 * Con `elImpresoManda` —un producto sin bulto cuyo precio tal cual no explica
 * el papel— el impreso se usa aunque el precio no termine de confirmarlo: es lo
 * que el papel dice en su columna, y si después el precio salta, la tarjeta lo
 * frena como salto de precio con la cantidad bien. Lo demás entra solo si el
 * precio lo confirma con el umbral de siempre, y si lo confirma uno solo: dos
 * lecturas que explican el número no se deciden.
 *
 * Devuelve un veredicto POR_PRESENTACION con `unidadesPorFacturada` k, o null
 * si el renglón no aporta nada.
 */
function leerConLoQueDiceElRenglon({ cociente, factor, enQueViene, descripcion, unidadesGuardadas, packPropuesto = null, elImpresoManda }) {
  const f = Number(factor);
  const nuevo = (k) => Number.isInteger(k) && k > 1 && k !== f && !(f > 1 && f % k === 0);
  const cambioCon = (k) => aCambioPct(f / k, cociente);
  const plausible = (k) => cambioCon(k) <= CAMBIO_PLAUSIBLE_PCT;
  const veredicto = (k, porque, origen) => ({
    unidad: UNIDAD.POR_PRESENTACION,
    unidadesPorFacturada: k,
    requiereDecision: false,
    origen,
    porque,
    texto:
      f > 1 && k < f
        ? TEXTO_UNIDAD[UNIDAD.POR_PRESENTACION]
        : `La factura cobra un bulto que trae ${k} unidades. El precio de la unidad sale de dividir por ${k}.`,
    cociente,
    factorPack: f,
    cambioImplicado: { porBulto: aCambioPct(1, cociente), porUnidad: f > 1 ? aCambioPct(f, cociente) : null },
    posibles: [k],
  });

  const impreso = unidadesQueDiceElRenglon(enQueViene);
  // Mandar no es dividir a ciegas: el impreso tiene que acercar el precio al
  // del ERP. Un papel que cobra MENOS que la unidad del ERP no se divide más.
  const acerca = (k) => cambioCon(k) < aCambioPct(1, cociente);
  if (nuevo(impreso) && (plausible(impreso) || (elImpresoManda && acerca(impreso)))) {
    return veredicto(
      impreso,
      `El papel dice que viene ${String(enQueViene).trim()}: ${impreso} unidades por lo facturado` +
        (plausible(impreso) ? `, y el precio lo confirma (${cambioCon(impreso).toFixed(1)} % contra el ERP).` : `.`),
      "DEL_PAPEL"
    );
  }

  const candidatos = [...new Set([Number(unidadesGuardadas), ...unidadesQueDiceLaDescripcion(descripcion)])].filter(
    (k) => nuevo(k) && plausible(k)
  );
  // El pack de la IA solo entra si nada del renglón lo resolvió: así no puede
  // volver ambiguo lo que hoy se decide solo.
  if (candidatos.length === 0 && nuevo(Number(packPropuesto)) && plausible(Number(packPropuesto))) {
    const k = Number(packPropuesto);
    return veredicto(
      k,
      `La IA leyó ${k} por lo facturado y el precio lo confirma (${cambioCon(k).toFixed(1)} % contra el ERP).`,
      "PROPUESTA_IA"
    );
  }
  if (candidatos.length !== 1) return null;
  const [k] = candidatos;
  return veredicto(
    k,
    `El renglón dice ${k} por lo facturado y el precio lo confirma (${cambioCon(k).toFixed(1)} % contra el ERP).`,
    Number(unidadesGuardadas) === k ? "GUARDADA" : "CONFIRMADA_POR_EL_PAPEL"
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
  const crudo = Number(factorPack);
  // Un producto sin bulto tiene lecturas solo si lo facturado trae varias de
  // sus unidades —el bulto de 40 del sachet de Super Mario—: su "bulto" es la
  // unidad.
  const traeVarias = Number.isFinite(Number(unidadesPorFacturada)) && Number(unidadesPorFacturada) > 1;
  const n = Number.isFinite(crudo) && crudo > 1 ? crudo : traeVarias ? 1 : crudo;
  if (!Number.isFinite(c) || !Number.isFinite(p) || !Number.isFinite(n) || n < 1 || (n === 1 && !traeVarias)) return null;

  // ── UN PACK INTERMEDIO: k unidades por lo facturado, f ÷ k packs por bulto ─
  //
  // 8 packs de 6 en una plancha de 24 son 8 × 6 ÷ 24 = 2 planchas, y la plancha
  // cuesta lo que el pack por los 4 packs que trae.
  const deUnPack = (k) => {
    const packsPorBulto = n / k;
    const bultos = (c * k) / n;
    // Sin bulto en el ERP, lo que entra son unidades sueltas: "5 bultos de 40
    // = 200 unidades", no "200 bultos de 1".
    if (n === 1) {
      // Acá se DIVIDE —el precio de lo facturado por las unidades que trae—,
      // así que se redondea al centavo: $26.849,07 ÷ 40 = $671,23, que es lo
      // que da el renglón entero ÷ 200.
      const costoDeLaUnidad = Math.round(p * packsPorBulto * 100) / 100;
      return {
        unidad: UNIDAD.POR_PRESENTACION,
        unidadesPorFacturada: k,
        packsPorBulto,
        bultos,
        costoPorBulto: costoDeLaUnidad,
        divideJusto: Number.isInteger(bultos),
        texto: `Es por bulto de ${limpio(k)}: ${limpio(bultos)} unidades a ${pesos(costoDeLaUnidad)} cada una`,
        cuenta: `${limpio(c)} ${c === 1 ? "bulto" : "bultos"} de ${limpio(k)} = ${limpio(bultos)} unidades`,
        // Lo que dice la factura, con lo que trae cada uno: ver abajo.
        loQueDiceLaFactura: `${limpio(c)} ${c === 1 ? "bulto" : "bultos"} de ${limpio(k)} = ${limpio(bultos)} unidades`,
      };
    }
    return {
      unidad: UNIDAD.POR_PRESENTACION,
      unidadesPorFacturada: k,
      packsPorBulto,
      bultos,
      costoPorBulto: p * packsPorBulto,
      divideJusto: Number.isInteger(bultos),
      texto: `Es por pack de ${limpio(k)}: ${formatearBultos(bultos)} de ${limpio(n)} a ${pesos(p * packsPorBulto)} cada uno`,
      cuenta: `${limpio(c)} ${c === 1 ? "pack" : "packs"} = ${formatearBultos(bultos)} de ${limpio(n)}`,
      // ── LO QUE DICE LA FACTURA, CON EL PACK (Emanuel, 2026-11-07) ──────
      //
      // Colombres, "7UP LATA X 6": Corregir decía "La factura dice 2" —los
      // bultos de 24 en que entra— y la factura dice 8, packs de 6. Se dice lo
      // que factura y en qué entra: "8 packs de 6 = 2 bultos de 24".
      loQueDiceLaFactura: `${limpio(c)} ${c === 1 ? "pack" : "packs"} de ${limpio(k)} = ${formatearBultos(bultos)} de ${limpio(n)}`,
    };
  };
  // Una presentación que no es la unidad ni el bulto del ERP: una parte del
  // bulto, o —desde el UxB de Super Mario— un bulto del papel más grande.
  const esIntermedio = (k) => Number.isFinite(Number(k)) && Number(k) > 1 && Number(k) !== n;
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
  // ── SI LAS UNIDADES NO COMPLETAN PACKS, UNA FRASE SIMPLE ───────────────
  //
  // Pablo #337 (2026-10-26): la hoja decía "Pablo lo trae por pack de 3: 5
  // packs = 2.50 bultos de 6. Ojo: 5 packs de 3 no completan bultos enteros de
  // 6 —nadie compra 2.50 bultos—…", y no se entendía. Emanuel: cuántas
  // unidades dice el papel, que no completan packs, y que se cargue lo que
  // entró. Un solo tamaño de pack, el del producto.
  const laQueQueda =
    veredicto?.unidad === UNIDAD.POR_PRESENTACION
      ? lecturas.porPresentacion
      : veredicto?.unidad === UNIDAD.POR_UNIDAD
        ? lecturas.porUnidad
        : null;
  if (laQueQueda && !laQueQueda.divideJusto) {
    const unidades = Number(cantidad) * (Number(laQueQueda.unidadesPorFacturada) || 1);
    return {
      frase: `El papel dice ${limpio(unidades)} unidades. No completan packs de ${limpio(factorPack)}: cargá cuántas entraron.`,
      detalle: null,
      elegida: laQueQueda,
      noCompletanPacks: true,
    };
  }
  if (veredicto?.unidad === UNIDAD.POR_PRESENTACION && lecturas.porPresentacion) {
    const l = lecturas.porPresentacion;
    // Un producto sin bulto: "Super Mario lo trae por bulto de 40: 5 bultos
    // de 40 = 200 unidades. La unidad queda en $671,23."
    if (!(Number(factorPack) > 1)) {
      return {
        frase: `${quien} lo trae por bulto de ${limpio(l.unidadesPorFacturada)}: ${l.cuenta}`,
        detalle: `La unidad queda en ${pesos(l.costoPorBulto)}.`,
        elegida: l,
      };
    }
    return {
      frase: `${quien} lo trae por pack de ${limpio(l.unidadesPorFacturada)}: ${l.cuenta}`,
      detalle: `El bulto de ${limpio(factorPack)} queda en ${pesos(l.costoPorBulto)}.`,
      elegida: l,
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
    };
  }

  if (veredicto?.unidad === UNIDAD.POR_UNIDAD) {
    return {
      frase: `La factura lo trae por unidad: ${lecturas.porUnidad.cuenta}`,
      detalle: `El bulto queda en ${pesos(lecturas.porUnidad.costoPorBulto)}.`,
      elegida: lecturas.porUnidad,
    };
  }
  if (veredicto?.unidad === UNIDAD.POR_BULTO) {
    return {
      frase: `La factura lo trae por bulto: ${lecturas.porBulto.cuenta}`,
      detalle: `El bulto queda en ${pesos(lecturas.porBulto.costoPorBulto)}.`,
      elegida: lecturas.porBulto,
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

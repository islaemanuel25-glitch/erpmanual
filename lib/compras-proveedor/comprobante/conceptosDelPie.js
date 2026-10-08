// LO QUE EL PAPEL IMPRIME ENTRE EL SUBTOTAL Y EL TOTAL.
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// Arcor, comprobante 17 del pedido 245. Veinte renglones que suman $412.877,48
// sin IVA; el papel dice $511.968,28. Con el IVA del 21 % —$86.704,30— quedan
// **$12.386,34 sin explicar**, que son la percepción de IVA impresa al pie.
//
// No fue un error de lectura. El esquema de salida pedía las percepciones SOLO
// si alguien las había cargado a mano en la receta estructurada del proveedor, y
// la de Arcor las tiene vacías — aunque su explicación en castellano las nombra
// con nombre y apellido: "PERC. IVA 5329 y PER. IIBB". **Al modelo nunca se le
// preguntó por ellas.**
//
// ── LA REGLA, DE EMANUEL ──────────────────────────────────────────────────
//
// El control del total es, y no depende de ninguna alícuota configurada:
//
//     suma de los renglones − descuentos del pie + cada concepto impreso = total
//
// Los campos de IVA y percepciones de la receta quedan como RESPALDO, para el
// papel que no trae el pie desglosado. Lo impreso manda sobre lo configurado,
// que es la misma regla que ya gobierna los subtotales de cada renglón.
//
// ── POR QUÉ UNA LISTA LIBRE Y NO UN ENUM ──────────────────────────────────
//
// Porque no hay forma de conocer todos los conceptos: IVA 21, IVA 10,5,
// percepción de IVA, percepción de IIBB de cada provincia, retenciones,
// impuestos internos, redondeos. Un enum haría que el que falta entre con el
// nombre equivocado o se caiga en silencio. El nombre impreso alcanza.
//
// Módulo puro: sin React, sin Prisma y sin red.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const aCentavos = (v) => Math.round((num(v) ?? 0) * 100);

/** Un concepto del pie, ya normalizado. */
function normalizar(c) {
  const importe = num(c?.importe);
  if (importe === null) return null;
  const nombre = String(c?.nombre ?? "").trim();
  if (!nombre) return null;
  // Un importe negativo impreso ya dice que resta; la marca es la otra forma.
  const resta = c?.resta === true || importe < 0;
  return { nombre, importe: Math.abs(importe), resta, centavos: Math.abs(aCentavos(importe)) };
}

/**
 * ¿ESTE CONCEPTO ES EL IVA?
 *
 * Se mira el nombre impreso, y con cuidado: "PERC. IVA 5329" también dice IVA y
 * NO es el IVA — es una percepción. La diferencia importa porque el IVA ya está
 * en el precio final de cada renglón por la alícuota de la receta, y sumarlo
 * dos veces duplicaría el impuesto en el costo.
 */
export function esElIva(nombre) {
  const t = String(nombre ?? "").toLowerCase();
  if (!/\biva\b|i\.v\.a/.test(t)) return false;
  return !/perc|retenc|ret\.|percep/.test(t);
}

/**
 * ¿ESTE CONCEPTO ES EL IMPUESTO INTERNO?
 *
 * ── EL DEFECTO QUE ESTO CIERRA, Y ES EL HERMANO DEL DEL IVA ─────────────
 *
 * El impuesto interno YA ENTRA en la cuenta por las LÍNEAS: cada renglón trae
 * el suyo y el control los suma. Si además se lo toma del pie como si fuera una
 * percepción, el mismo dinero se cuenta DOS VECES: el comprobante no cierra por
 * exactamente el interno, y —peor— esa plata se reparte entre los renglones
 * como percepción y engorda el costo.
 *
 * Medido sobre el papel de TDC del pedido #247: el pie imprime
 * "IMP. INT. 10.890,53" y las líneas traen esos mismos 10.890,53. Sin esta
 * separación, la primera línea quedaba con un costo de 2.483,23 en vez de
 * 2.396,45 — 86,78 de impuesto que nadie pagó dos veces.
 *
 * Es el mismo cuidado que `esElIva`: se mira el nombre y se descarta lo que
 * diga "percepción" o "retención", que son otra cosa aunque nombren el mismo
 * impuesto.
 */
export function esElInternoDelPie(nombre) {
  const t = String(nombre ?? "").toLowerCase();
  if (!/\binterno?s?\b|imp\.?\s*int|i\.i\b/.test(t)) return false;
  return !/perc|retenc|ret\.|percep/.test(t);
}

/**
 * ¿ESTE CONCEPTO ES UNA BASE —UN NETO, UN SUBTOTAL— Y NO UN CARGO?
 *
 * ── EL DEFECTO QUE ESTO CIERRA, Y ES EL TERCERO DE LA FAMILIA ───────────
 *
 * DYSSA imprime al pie "Neto 10,50% 46.359,60" y "Neto 21,00% 433.427,46".
 * Son la SUMA DE LOS PRODUCTOS de cada alícuota: la base sobre la que se
 * calculan el IVA y las percepciones. Tomados como un concepto más, caían en
 * `otros` y se sumaban como si fueran una percepción: el comprobante "no
 * cerraba por $479.787,05", que es exactamente Neto 10,5 + Neto 21, o sea los
 * productos contados dos veces. Y peor: esa plata se repartía entre los
 * renglones como percepción y duplicaba el costo.
 *
 * Es la misma forma que el IVA y el interno: algo que ya está contado por las
 * líneas no se vuelve a sumar desde el pie. Una base nunca es un cargo; sirve
 * para CONTROLAR contra la suma de los productos de su alícuota.
 *
 * Se descarta lo que diga percepción o retención —"Perc. IIBB s/neto" es un
 * cargo aunque nombre el neto— y lo que sea IVA.
 */
export function esBaseDelPie(nombre) {
  const t = String(nombre ?? "").toLowerCase();
  if (!/\bneto\b|sub\s*-?\s*total|base\s+imponible|\bgravado\b/.test(t)) return false;
  if (esElIva(nombre)) return false;
  return !/perc|retenc|ret\.|percep/.test(t);
}

/**
 * ¿ESTE CONCEPTO ES UNA PERCEPCIÓN DE IVA?
 *
 * Importa porque se reparte distinto: una percepción de IVA es un porcentaje
 * del IVA de cada renglón —RG 5329 cobra 3 % sobre el grupo del 21 y 1,5 %
 * sobre el del 10,5—, así que se reparte en proporción al IVA y no al neto. Con
 * una sola alícuota da lo mismo; con dos, repartirla por neto le cargaría a la
 * harina el doble de lo que le toca.
 *
 * "RG 5329" sola también lo es: es el régimen de percepción de IVA y hay papeles
 * que lo imprimen sin la palabra.
 */
export function esPercepcionDeIva(nombre) {
  const t = String(nombre ?? "").toLowerCase();
  if (/\b5329\b/.test(t)) return true;
  if (!/\biva\b|i\.v\.a/.test(t)) return false;
  return /perc|percep|\bper\b|per\./.test(t);
}

/**
 * La alícuota que nombra un concepto del pie, o `null`.
 *
 * "Neto 10,50%" → 10.5, "IVA 21%" → 21, "Neto gravado" → null. Se lee del nombre
 * impreso porque es el único lugar donde el papel la dice.
 */
export function alicuotaDelNombre(nombre) {
  const m = String(nombre ?? "").match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Los conceptos del pie, separados en lo que suma y lo que resta. */
export function conceptosDelPie(pie) {
  const crudos = Array.isArray(pie?.conceptos) ? pie.conceptos : [];
  const lista = crudos.map(normalizar).filter(Boolean);

  const suman = lista.filter((c) => !c.resta);
  const restan = lista.filter((c) => c.resta);

  const iva = suman.filter((c) => esElIva(c.nombre));
  // El interno sale de `otros` por el mismo motivo que el IVA: ya está contado
  // por las líneas, y contarlo otra vez lo duplica en el total Y en el costo.
  const interno = suman.filter((c) => !esElIva(c.nombre) && esElInternoDelPie(c.nombre));
  // Y las bases, por el mismo motivo un escalón más abajo: SON las líneas.
  const bases = suman
    .filter((c) => !esElIva(c.nombre) && !esElInternoDelPie(c.nombre) && esBaseDelPie(c.nombre))
    .map((c) => ({ ...c, alicuotaPct: alicuotaDelNombre(c.nombre) }));
  const otros = suman
    .filter((c) => !esElIva(c.nombre) && !esElInternoDelPie(c.nombre) && !esBaseDelPie(c.nombre))
    .map((c) => ({ ...c, deIva: esPercepcionDeIva(c.nombre) }));

  return {
    /** Vacío = el papel no trajo el pie desglosado y manda la receta. */
    hay: lista.length > 0,
    // `lista` es lo que el papel IMPRIME, para poder nombrarlo; lo que se suma
    // sale de `iva`, `interno` y `otros`. Las bases no suman nunca.
    lista,
    iva: iva.map((c) => ({ ...c, alicuotaPct: alicuotaDelNombre(c.nombre) })),
    /** El impuesto interno tal como lo imprime el pie. NO es una percepción. */
    interno,
    internoCentavos: interno.reduce((a, c) => a + c.centavos, 0),
    /** Netos y subtotales impresos: bases para controlar, NUNCA un cargo. */
    bases,
    /** Percepciones y cualquier otro cargo. `deIva` dice cómo se reparte. */
    otros,
    ivaCentavos: iva.reduce((a, c) => a + c.centavos, 0),
    /** Percepciones, IIBB, internos y cualquier otro que sume. */
    otrosCentavos: otros.reduce((a, c) => a + c.centavos, 0),
    descuentosCentavos: restan.reduce((a, c) => a + c.centavos, 0),
  };
}

/**
 * LO QUE SE LE DICE A LA PERSONA CUANDO NO CIERRA.
 *
 * Nombra la MISMA cuenta que hizo el control. Hasta hoy el cartel decía "los
 * productos suman X y el papel dice Y" sobre una diferencia calculada con el
 * IVA y las percepciones adentro: dos cuentas distintas en el mismo cartel, y
 * la resta que la persona hacía de cabeza no daba nunca.
 */
export function textoDeLaCuentaDelPie({ suma, conceptos, total, moneda = (v) => `$${v}` } = {}) {
  const partes = [`los productos suman ${moneda(suma)}`];
  // Una base no se nombra como "más": no se suma. Quien llama con lo que el
  // control sumó ya no las trae; esto cubre al que llame con lo impreso.
  for (const c of (conceptos?.lista ?? []).filter((x) => !esBaseDelPie(x.nombre))) {
    partes.push(`${c.resta ? "menos" : "más"} ${c.nombre} ${moneda(c.importe)}`);
  }
  return `${partes.join(", ")} — y el papel dice ${moneda(total)}.`;
}

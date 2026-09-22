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

/** Los conceptos del pie, separados en lo que suma y lo que resta. */
export function conceptosDelPie(pie) {
  const crudos = Array.isArray(pie?.conceptos) ? pie.conceptos : [];
  const lista = crudos.map(normalizar).filter(Boolean);

  const suman = lista.filter((c) => !c.resta);
  const restan = lista.filter((c) => c.resta);

  const iva = suman.filter((c) => esElIva(c.nombre));
  const otros = suman.filter((c) => !esElIva(c.nombre));

  return {
    /** Vacío = el papel no trajo el pie desglosado y manda la receta. */
    hay: lista.length > 0,
    lista,
    iva,
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
  for (const c of conceptos?.lista ?? []) {
    partes.push(`${c.resta ? "menos" : "más"} ${c.nombre} ${moneda(c.importe)}`);
  }
  return `${partes.join(", ")} — y el papel dice ${moneda(total)}.`;
}

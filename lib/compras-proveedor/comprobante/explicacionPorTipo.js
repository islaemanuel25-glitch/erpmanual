// UNA EXPLICACIÓN CONFIRMADA POR TIPO DE COMPROBANTE.
//
// ── EL CASO (CCU, 2026-10-10) ─────────────────────────────────────────────
//
// CCU a veces le factura a Emanuel como Responsable Inscripto —factura A, con
// el IVA y las percepciones discriminados— y a veces a un sujeto no
// categorizado —factura B, con el precio con IVA incluido, el "IVA contenido"
// informativo y una percepción de IVA del 10,5 % al pie—. Son dos papeles
// distintos del mismo proveedor, y la explicación de uno lee mal el otro.
//
// Regla de Emanuel (agosto 2026): un comprobante distinto del mismo proveedor
// NO reescribe la receta aprendida. Así que el proveedor guarda una explicación
// confirmada POR TIPO: la de la A no pisa la de la B, y una B que llega sin
// explicación propia la explica el modelo grande y queda pendiente PARA LA B.
//
// El tipo es la letra impresa en el recuadro del comprobante. Lo que no es una
// factura con letra —un remito, una planilla de pedido, el "X" de Secco— es
// "sin factura", y tiene su propia explicación.
//
// Módulo puro: sin Prisma, sin React y sin red.

/** Los tipos de papel que pueden tener explicación propia. */
export const TIPO_DE_PAPEL = Object.freeze({
  A: "A",
  B: "B",
  C: "C",
  M: "M",
  E: "E",
  SIN_FACTURA: "SIN_FACTURA",
});

/** Cómo se nombra cada tipo en pantalla. */
export const ROTULO_DEL_TIPO = Object.freeze({
  A: "Factura A",
  B: "Factura B",
  C: "Factura C",
  M: "Factura M",
  E: "Factura E",
  SIN_FACTURA: "Sin factura (remito, planilla)",
});

const LETRAS = Object.freeze(["A", "B", "C", "M", "E"]);

/**
 * El tipo de papel a partir de la letra leída —o de un tipo ya guardado—. Lo
 * que no es una letra de factura es "sin factura".
 */
export function tipoDePapel(letra) {
  const t = String(letra ?? "").trim().toUpperCase();
  return LETRAS.includes(t) ? t : TIPO_DE_PAPEL.SIN_FACTURA;
}

/** Cómo se nombra un tipo en pantalla. */
export function rotuloDelTipo(tipo) {
  return ROTULO_DEL_TIPO[tipoDePapel(tipo)];
}

/**
 * Las explicaciones confirmadas del proveedor, limpias: `[{ tipoComprobante,
 * explicacion, version }]`, sin las vacías.
 */
export function explicacionesConfirmadas(filas = []) {
  return (Array.isArray(filas) ? filas : [])
    .map((f) => ({
      tipoComprobante: tipoDePapel(f?.tipoComprobante),
      explicacion: String(f?.explicacion ?? "").trim(),
      version: Number.isFinite(Number(f?.version)) ? Number(f.version) : null,
    }))
    .filter((f) => f.explicacion);
}

/**
 * LO QUE LA LISTA DE PROVEEDORES DICE DE CADA UNO, EN UNA FRASE.
 *
 * Qué tipos de papel tiene explicados y cuáles esperan confirmación. Sin
 * ninguno, que el primero que llegue lo explica el lector grande: no es una
 * tarea pendiente de la persona.
 *
 * @param confirmadas  `[{ tipoComprobante }]`
 * @param pendientes   `[{ tipoComprobante }]`
 */
export function resumenDeExplicaciones({ confirmadas = [], pendientes = [] } = {}) {
  const nombres = (filas) => filas.map((f) => rotuloDelTipo(f.tipoComprobante)).join(", ");
  const partes = [];
  if (confirmadas.length) partes.push(`Explicada: ${nombres(confirmadas)}.`);
  if (pendientes.length) partes.push(`Para confirmar: ${nombres(pendientes)}.`);
  if (!partes.length) {
    return "Todavía sin explicación: el primer papel que llegue lo explica el lector grande.";
  }
  return partes.join(" ");
}

/**
 * LA EXPLICACIÓN DEL TIPO QUE TRAE ESTE PAPEL, si está confirmada.
 *
 * @param explicaciones  las de `explicacionesConfirmadas`
 * @param letra          la letra leída del papel (o null)
 * @returns `{ tipoComprobante, explicacion, version }` o null
 */
export function explicacionDelTipo(explicaciones = [], letra = null) {
  const tipo = tipoDePapel(letra);
  return (Array.isArray(explicaciones) ? explicaciones : []).find((e) => e.tipoComprobante === tipo) ?? null;
}

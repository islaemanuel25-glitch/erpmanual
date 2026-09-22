// QUÉ VIENE MARCADO CUANDO LOS DOS PRECIOS NO COINCIDEN.
//
// ── LAS REGLAS, DE EMANUEL ────────────────────────────────────────────────
//
// La hoja SIEMPRE pregunta. Lo que cambia es qué viene marcado de entrada, y
// eso no es un detalle: lo marcado es lo que se guarda si alguien toca
// "Revisado y seguir" sin mirar.
//
//   1. DENTRO DE LA VARIACIÓN DEL PROVEEDOR → viene marcado **el más alto de
//      los dos**. Si el más alto es el tuyo, "Dejar el que tenía"; si es el del
//      papel, "Aceptar el precio nuevo". Hasta hoy venía marcado "aceptar"
//      siempre, aunque el precio del papel fuera MÁS BARATO: el que no miraba
//      se bajaba el costo solo.
//
//   2. FUERA DE LA VARIACIÓN, para arriba o para abajo → **no viene marcado
//      nada**. La hoja lo dice en castellano y "Revisado y seguir" no avanza
//      hasta que la persona elija. Si elige, se respeta: el que mira el papel
//      sabe más que cualquier regla.
//
//   3. SI LA DIFERENCIA SE EXPLICA POR EL FACTOR DEL BULTO → no es un precio,
//      es una escala equivocada, y se dice así. No se ofrece como opción.
//
// ── POR QUÉ LA VARIACIÓN ES DEL PROVEEDOR ─────────────────────────────────
//
// Porque un 9 % es normal en uno que actualiza todos los meses y es una señal
// de lectura mal hecha en uno que no movió un precio en medio año. Vive en su
// receta —`variacionNormalPct`, 10 % por defecto— y no en una constante del
// sistema.
//
// ── EN QUÉ UNIDAD SE COMPARAN LOS DOS PRECIOS ─────────────────────────────
//
// En la del DEPÓSITO, que es la misma en la que los compara la tarjeta. Este
// módulo no convierte: recibe los dos números ya en esa unidad. Convertir acá
// sería el segundo criterio de escala de siempre.
//
// Módulo puro: sin React, sin Prisma y sin red.

/** El porcentaje que se usa cuando el proveedor no tiene uno cargado. */
export const VARIACION_POR_DEFECTO = 10;

/** Qué puede venir marcado. */
export const MARCA = Object.freeze({
  ACEPTA: "ACEPTA_FACTURA",
  DEJA: "DEJA_EL_MIO",
});

/** En qué situación está la diferencia. */
export const SITUACION = Object.freeze({
  /** Los dos precios son el mismo: no hay nada que decidir. */
  IGUALES: "IGUALES",
  /** Dentro de la variación normal del proveedor. */
  NORMAL: "NORMAL",
  /** Más grande que la variación normal, para arriba o para abajo. */
  FUERA: "FUERA",
  /** La diferencia es el factor del bulto: no es un precio. */
  ESCALA: "ESCALA",
  /** Falta alguno de los dos números: no se afirma nada. */
  SIN_DATOS: "SIN_DATOS",
});

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Cuánto se tolera que el cociente se aparte del factor y siga siendo "escala". */
const CERCA_DEL_FACTOR = 0.02;

/**
 * ¿LA DIFERENCIA ES EL FACTOR DEL BULTO?
 *
 * Uno de los dos precios es el otro multiplicado —o dividido— por el tamaño del
 * bulto. El caso real: la Hamburguesa Paty del 242, con el costo del bulto de
 * 30 escrito donde iba el de la unidad.
 */
export function esErrorDeEscala({ papel, tuyo, factorPack } = {}) {
  const a = num(papel);
  const b = num(tuyo);
  const f = num(factorPack);
  if (a === null || b === null || f === null || f <= 1 || a <= 0 || b <= 0) return false;
  const cociente = a > b ? a / b : b / a;
  return Math.abs(cociente - f) / f <= CERCA_DEL_FACTOR;
}

/**
 * QUÉ VIENE MARCADO, Y POR QUÉ.
 *
 * @param papel        lo que cobra el papel, en la unidad del depósito
 * @param tuyo         tu costo de hoy, en la misma unidad
 * @param variacionPct la variación normal de ESTE proveedor
 * @param factorPack   cuántas unidades trae un bulto
 *
 * @returns `{ situacion, marcado, diferenciaPct, elMasAlto, exigeElegir }`
 */
export function decisionDeCostoSugerida({
  papel,
  tuyo,
  variacionPct = VARIACION_POR_DEFECTO,
  factorPack = null,
} = {}) {
  const a = num(papel);
  const b = num(tuyo);

  if (a === null || b === null || a <= 0 || b <= 0) {
    return { situacion: SITUACION.SIN_DATOS, marcado: null, diferenciaPct: null, elMasAlto: null, exigeElegir: false };
  }

  // La escala se mira ANTES que el porcentaje: un cociente de 30 también es
  // "fuera de la variación", y decirlo así sería verdad y no serviría de nada.
  if (esErrorDeEscala({ papel: a, tuyo: b, factorPack })) {
    return {
      situacion: SITUACION.ESCALA,
      marcado: null,
      diferenciaPct: ((a - b) / b) * 100,
      elMasAlto: a > b ? "papel" : "tuyo",
      exigeElegir: true,
      factorPack: num(factorPack),
    };
  }

  const diferenciaPct = ((a - b) / b) * 100;
  if (a === b) {
    return { situacion: SITUACION.IGUALES, marcado: null, diferenciaPct: 0, elMasAlto: null, exigeElegir: false };
  }

  const limite = Math.abs(num(variacionPct) ?? VARIACION_POR_DEFECTO);
  const elMasAlto = a > b ? "papel" : "tuyo";

  if (Math.abs(diferenciaPct) > limite) {
    // ── STOP ────────────────────────────────────────────────────────────
    // Nada marcado y no se avanza hasta que alguien elija.
    return { situacion: SITUACION.FUERA, marcado: null, diferenciaPct, elMasAlto, exigeElegir: true };
  }

  // ── DENTRO: VIENE MARCADO EL MÁS ALTO ─────────────────────────────────
  //
  // No es prudencia contable: es que el error caro es quedarse con un costo
  // más bajo del real, porque eso infla la ganancia de todo lo que se venda
  // hasta que alguien lo note.
  return {
    situacion: SITUACION.NORMAL,
    marcado: elMasAlto === "papel" ? MARCA.ACEPTA : MARCA.DEJA,
    diferenciaPct,
    elMasAlto,
    exigeElegir: false,
  };
}

/** El porcentaje como se escribe: "25 %", "−14 %". */
function pct(v) {
  const n = Math.abs(Number(v));
  const texto = n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10).replace(".", ",");
  return `${texto} %`;
}

/**
 * LO QUE LA HOJA DICE CUANDO HAY QUE FRENAR.
 *
 * Nombra al proveedor, los dos importes y el porcentaje, y dice qué mirar. No
 * dice "revisá": dice QUÉ revisar, que es lo que permite resolverlo sin volver
 * a preguntar.
 */
export function textoDeLaDiferencia(r, { proveedor = "Este proveedor", moneda = (v) => `$${v}`, papel, tuyo } = {}) {
  if (!r || !r.exigeElegir) return null;

  if (r.situacion === SITUACION.ESCALA) {
    return (
      `${proveedor} cobra ${moneda(papel)} y tu precio es ${moneda(tuyo)}: es ${r.factorPack} veces, ` +
      `justo lo que trae el bulto. Eso no es un precio distinto, es un precio en otra unidad. ` +
      `Revisá si el papel cobra por bulto o por unidad antes de elegir.`
    );
  }
  return (
    `${proveedor} cobra ${moneda(papel)} y tu precio es ${moneda(tuyo)}: un ${pct(r.diferenciaPct)} de ` +
    `diferencia no es normal para ${proveedor}. Revisá la cantidad y el producto antes de elegir.`
  );
}

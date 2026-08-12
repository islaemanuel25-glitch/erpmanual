// lib/compras-proveedor/comprobante/recetaEnCriollo.js
//
// CÓMO SE LE PREGUNTA A UNA PERSONA CÓMO VIENE ARMADA UNA FACTURA.
//
// La receta tiene siete campos y todos están en el idioma del que la programó:
// `ivaPorLinea`, `ivaIncluyeInternoEnLaBase`, `percepcionesEnCosto`. Quien la va
// a cargar es Emanuel, desde el celular, con la factura en la otra mano.
//
// ── LA REGLA DE LOS TEXTOS ─────────────────────────────────────────────────
//
// Cada opción dice QUÉ SE VE EN EL PAPEL, no cómo se llama el campo. "El IVA
// viene en cada renglón" es una cosa que se puede mirar y contestar; "IVA por
// línea" obliga a traducir primero.
//
// Y donde ayuda va el EJEMPLO REAL, con los tres proveedores que ya se leyeron:
// DYSSA lo trae por renglón, DAS al pie, Mauro ya adentro del precio. Un ejemplo
// concreto contesta la pregunta más rápido que cualquier explicación, porque la
// respuesta es "como el de DYSSA" y no un razonamiento sobre alícuotas.
//
// Los ejemplos son de comprobantes que existen y se leyeron, no inventados para
// que la explicación quede linda.

/** Los tres proveedores que ya pasaron por el lector, para poder nombrarlos. */
export const EJEMPLOS = Object.freeze({
  DYSSA: "DYSSA",
  DAS: "DAS",
  MAURO: "Mauro",
});

/**
 * Las preguntas, en el orden en que conviene contestarlas.
 *
 * El orden no es decorativo: la primera decide si las siguientes tienen sentido.
 * Si el precio ya trae el IVA adentro, la alícuota no se pregunta, porque no hay
 * ninguna que aplicar.
 */
export const PREGUNTAS = Object.freeze([
  {
    campo: "dondeVieneElIva",
    titulo: "¿Dónde viene el IVA?",
    ayuda: "Mirá una línea cualquiera de la factura y fijate si al lado del precio dice IVA.",
    opciones: [
      {
        valor: "POR_RENGLON",
        texto: "En cada renglón",
        detalle: "Cada producto trae su propio IVA al lado del precio.",
        ejemplo: `Así viene la de ${EJEMPLOS.DYSSA}.`,
      },
      {
        valor: "AL_PIE",
        texto: "Todo junto al final",
        detalle: "Las líneas van sin IVA y abajo de todo aparece el IVA del comprobante entero.",
        ejemplo: `Así viene la de ${EJEMPLOS.DAS}.`,
      },
      {
        valor: "YA_INCLUIDO",
        texto: "Ya está adentro del precio",
        detalle:
          "No hay ninguna columna ni renglón de IVA: el precio que ves es el precio final. " +
          "Es lo normal cuando el producto tiene precio de venta fijo.",
        ejemplo: `Así viene la de ${EJEMPLOS.MAURO}, que son cigarrillos.`,
      },
    ],
  },
  {
    campo: "alicuotaIvaPct",
    titulo: "¿Qué porcentaje de IVA?",
    ayuda: "El que figura en la factura. Casi siempre 21, a veces 10,5 en alimentos.",
    // No se pregunta si el precio ya lo trae adentro: no hay alícuota que aplicar.
    soloSi: (r) => r.dondeVieneElIva !== "YA_INCLUIDO",
    tipo: "numero",
    sugerencias: [21, 10.5, 27],
  },
  {
    campo: "tieneImpuestoInterno",
    titulo: "¿Cobra impuesto interno?",
    ayuda:
      "Es una columna aparte, además del IVA. Si no la ves en el papel, es que no. " +
      "No la marques por las dudas: se le pediría al lector un número que no existe, " +
      "y un casillero vacío es una invitación a llenarlo.",
    opciones: [
      { valor: false, texto: "No", detalle: "Es lo más común." },
      {
        valor: true,
        texto: "Sí, una columna aparte",
        detalle: "Se suma al costo, igual que el IVA.",
        ejemplo: `Así viene la de ${EJEMPLOS.DYSSA}.`,
      },
    ],
  },
  {
    campo: "ivaIncluyeInternoEnLaBase",
    titulo: "¿El IVA se calcula sobre el interno también?",
    ayuda:
      "Solo cambia la cuenta si hay impuesto interno. Si no sabés, dejalo en No: " +
      "es lo que hace la factura de DYSSA, medido, y si estuviera al revés el " +
      "comprobante no cerraría y te lo va a decir.",
    soloSi: (r) => r.tieneImpuestoInterno === true,
    opciones: [
      { valor: false, texto: "No, solo sobre el precio", detalle: `Así es la de ${EJEMPLOS.DYSSA}.` },
      { valor: true, texto: "Sí, sobre el precio más el interno", detalle: "" },
    ],
  },
  {
    campo: "percepciones",
    titulo: "Percepciones",
    ayuda:
      "Son los renglones del final que dicen «percepción» y un porcentaje: IIBB, IVA, " +
      "según la provincia. Agregá uno por cada uno que veas en el papel.",
    tipo: "lista",
  },
  {
    campo: "percepcionesEnCosto",
    titulo: "¿Las percepciones entran en el costo?",
    ayuda:
      "Decisión tomada: sí, entran. Así el costo refleja lo que de verdad sale de la caja. " +
      "Lo que se resigna es que son recuperables, o sea que el precio de venta las " +
      "termina incluyendo. Se cambia solo si sabés lo que estás haciendo.",
    soloSi: (r) => Array.isArray(r.percepciones) && r.percepciones.length > 0,
    opciones: [
      { valor: true, texto: "Sí, adentro del costo", detalle: "Es lo que está decidido." },
      { valor: false, texto: "No, aparte", detalle: "El costo queda más bajo de lo que se pagó." },
    ],
  },
  {
    campo: "facturaPor",
    titulo: "¿Cómo cobra la cantidad?",
    ayuda:
      "Si la factura dice «12» y son 12 paquetes sueltos, es por unidad. Si dice «12» " +
      "y son 12 cajones, es por bulto. Ante la duda dejalo en unidad: el sistema igual " +
      "lo deduce comparando el precio contra el costo que ya tenés, y te pregunta " +
      "cuando no puede decidir.",
    opciones: [
      { valor: "UNIDAD", texto: "Por unidad suelta", detalle: "" },
      { valor: "BULTO", texto: "Por bulto o cajón", detalle: "" },
    ],
  },
]);

/**
 * De la fila de la base a las respuestas de la pantalla.
 *
 * La traducción vive acá y no en la pantalla: si estuviera allá, la pantalla de
 * alta y la de edición terminarían con dos criterios distintos para lo mismo.
 */
export function aPreguntas(fila) {
  const f = fila || {};
  const alicuota = Number(f.alicuotaIvaPct);
  // EL CERO ES UNA RESPUESTA, no un campo vacío: alícuota 0 significa que el
  // precio ya trae el IVA adentro, que es justo el caso de Mauro. Tratarlo como
  // ausente lo mandaría al default de 21 y le sumaría un impuesto que no existe.
  const sinIva = Number.isFinite(alicuota) && alicuota === 0;

  return {
    dondeVieneElIva: sinIva ? "YA_INCLUIDO" : f.ivaPorLinea ? "POR_RENGLON" : "AL_PIE",
    alicuotaIvaPct: Number.isFinite(alicuota) ? alicuota : 21,
    tieneImpuestoInterno: f.tieneImpuestoInterno === true,
    ivaIncluyeInternoEnLaBase: f.ivaIncluyeInternoEnLaBase === true,
    percepciones: Array.isArray(f.percepciones) ? f.percepciones : [],
    percepcionesEnCosto: f.percepcionesEnCosto !== false,
    facturaPor: f.facturaPor === "BULTO" ? "BULTO" : "UNIDAD",
  };
}

/** Y de vuelta, a los campos que entiende la base. */
export function aReceta(respuestas) {
  const r = respuestas || {};
  const yaIncluido = r.dondeVieneElIva === "YA_INCLUIDO";
  const alicuota = Number(r.alicuotaIvaPct);

  return {
    ivaPorLinea: r.dondeVieneElIva === "POR_RENGLON",
    // "Ya incluido" se guarda como alícuota 0, que es lo que hace que el neto de
    // la línea SEA el final. No es un valor centinela raro: es literalmente
    // cuánto IVA hay que agregarle al precio impreso, y son cero pesos.
    alicuotaIvaPct: yaIncluido ? 0 : Number.isFinite(alicuota) ? alicuota : 21,
    tieneImpuestoInterno: r.tieneImpuestoInterno === true,
    // Sin interno la pregunta no se hizo, y guardar lo que hubiera quedado de
    // antes escribiría una respuesta que nadie dio.
    ivaIncluyeInternoEnLaBase: r.tieneImpuestoInterno === true && r.ivaIncluyeInternoEnLaBase === true,
    percepciones: (Array.isArray(r.percepciones) ? r.percepciones : [])
      .map((p) => ({ nombre: String(p?.nombre ?? "").trim(), pct: Number(p?.pct) }))
      .filter((p) => p.nombre && Number.isFinite(p.pct) && p.pct > 0),
    percepcionesEnCosto: r.percepcionesEnCosto !== false,
    facturaPor: r.facturaPor === "BULTO" ? "BULTO" : "UNIDAD",
  };
}

/** Las preguntas que corresponde mostrar según lo contestado hasta ahora. */
export function preguntasVisibles(respuestas) {
  return PREGUNTAS.filter((p) => !p.soloSi || p.soloSi(respuestas || {}));
}

/**
 * Un resumen de la receta en una línea, para la lista de proveedores.
 *
 * Sirve para ver de un vistazo cuáles están cargadas y cómo, sin abrir una por
 * una desde el celular.
 */
export function resumenEnCriollo(fila) {
  if (!fila) return "Sin receta: se lee con la genérica, 21 % al pie.";
  const r = aPreguntas(fila);
  const partes = [];
  if (r.dondeVieneElIva === "YA_INCLUIDO") partes.push("el precio ya trae el IVA");
  else if (r.dondeVieneElIva === "POR_RENGLON") partes.push(`IVA ${r.alicuotaIvaPct} % en cada renglón`);
  else partes.push(`IVA ${r.alicuotaIvaPct} % al pie`);
  if (r.tieneImpuestoInterno) partes.push("con impuesto interno");
  if (r.percepciones.length) {
    partes.push(`${r.percepciones.length} percepción${r.percepciones.length === 1 ? "" : "es"}`);
  }
  if (r.facturaPor === "BULTO") partes.push("cobra por bulto");
  return partes.join(", ") + ".";
}

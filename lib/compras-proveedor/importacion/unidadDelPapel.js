// QUÉ SIGNIFICA LA CANTIDAD DEL PAPEL, Y CÓMO SE GUARDA EL PEDIDO.
//
// ── SON DOS PREGUNTAS Y HASTA HOY HABÍA UN SOLO SELECTOR ───────────────────
//
// "Unidad de pedido" mezclaba:
//
//   1. en qué unidad está expresada la cantidad DEL DOCUMENTO;
//   2. en qué unidad se va a GUARDAR la línea del pedido.
//
// Mezclarlas hace que corregir la lectura del papel se vea igual que elegir
// cómo guardar, y las dos cosas se pisan. El caso real:
//
//   papel: cantidad 10, precio $5.050, total del renglón $50.500
//   ERP:   bulto x10
//
// El sistema interpretaba "10 bultos" y, al tocar el selector para pasarlo a
// unidades, hacía 10 × 10 = 100 unidades. Esa conversión sería correcta SI
// realmente fueran 10 bultos. No lo son: el papel decía 10 unidades, y la
// prueba está en su propio subtotal —10 × 5.050 = 50.500—.
//
// ── TODO SE RECALCULA DESDE UNA BASE, NUNCA ENCADENANDO ───────────────────
//
// La cantidad del papel, su precio, su subtotal y la unidad interpretada son
// INMUTABLES. De ellos sale una `cantidadBaseUnidades`, y cada representación se
// calcula desde esa base. Convertir el valor mostrado una y otra vez acumula
// redondeos y, peor, acumula el error de una interpretación equivocada.
//
// ── LO QUE ESTE MÓDULO NO HACE ────────────────────────────────────────────
//
// No decide impuestos ni porcentajes. No escribe. Es aritmética y evidencia.

/** Qué resolvió la unidad del papel. El orden es la prioridad. */
export const ORIGEN_UNIDAD_PAPEL = Object.freeze({
  RECETA: "RECETA",
  PRESENTACION_CONFIRMADA: "PRESENTACION_CONFIRMADA",
  DOCUMENTO: "DOCUMENTO",
  EVIDENCIA_PRECIO: "EVIDENCIA_PRECIO",
  PREGUNTA: "PREGUNTA",
});

export const TEXTO_ORIGEN_UNIDAD_PAPEL = Object.freeze({
  [ORIGEN_UNIDAD_PAPEL.RECETA]: "Lo dice la receta de este formato",
  [ORIGEN_UNIDAD_PAPEL.PRESENTACION_CONFIRMADA]: "Presentación confirmada para este producto",
  [ORIGEN_UNIDAD_PAPEL.DOCUMENTO]: "Lo dice el documento",
  [ORIGEN_UNIDAD_PAPEL.EVIDENCIA_PRECIO]: "Sugerido por el precio del renglón",
  [ORIGEN_UNIDAD_PAPEL.PREGUNTA]: "Hay que confirmarlo",
});

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const unidadValida = (u) => (u === "UNIDAD" || u === "BULTO" ? u : null);

/**
 * ¿Qué escala del papel explica mejor el subtotal impreso?
 *
 * ── EL PRECIO ES EVIDENCIA, NO EL FACTOR ──────────────────────────────────
 *
 * Se compara el precio impreso contra el costo vigente por unidad y contra el
 * costo por bulto, y se dice cuál queda más cerca. NUNCA se guarda
 * `precioSistema ÷ precioPapel` como si fuera un factor: los precios cambian
 * todas las semanas y el factor no. El factor permanente son las unidades por
 * presentación del proveedor y las unidades por bulto del ERP.
 *
 * Devuelve `null` cuando no hay con qué comparar. Null y no una corazonada.
 */
export function evidenciaPorPrecio({ precioPapel, costoUnidadErp, costoBultoErp } = {}) {
  const p = num(precioPapel);
  const porUnidad = num(costoUnidadErp);
  const porBulto = num(costoBultoErp);
  if (p === null || p <= 0) return null;
  if (porUnidad === null && porBulto === null) return null;

  // Distancia relativa: cuánto se aparta el precio del papel de cada referencia,
  // en proporción. Se usa proporción y no diferencia porque un producto de mil
  // pesos y otro de cien mil no se pueden comparar con la misma regla.
  const separacion = (referencia) => {
    if (referencia === null || referencia <= 0) return null;
    return Math.abs(Math.log(p / referencia));
  };
  const dUnidad = separacion(porUnidad);
  const dBulto = separacion(porBulto);

  if (dUnidad === null) return { unidad: "BULTO", separacion: dBulto, alternativa: null };
  if (dBulto === null) return { unidad: "UNIDAD", separacion: dUnidad, alternativa: null };

  const gana = dUnidad <= dBulto ? "UNIDAD" : "BULTO";
  const mejor = Math.min(dUnidad, dBulto);
  const peor = Math.max(dUnidad, dBulto);
  return {
    unidad: gana,
    separacion: mejor,
    alternativa: peor,
    // Cuánto mejor explica la ganadora. Sin margen no hay evidencia: dos
    // referencias igual de lejos no dicen nada.
    margen: peor - mejor,
  };
}

/** Con menos margen que esto, el precio no distingue una escala de la otra. */
export const MARGEN_EVIDENCIA = 0.5;

/**
 * RESUELVE QUÉ SIGNIFICA LA CANTIDAD DEL PAPEL.
 *
 * La prioridad no es negociable y está escrita en este orden:
 *
 *   1. receta confirmada del formato;
 *   2. presentación confirmada para ese proveedor y producto;
 *   3. unidad explícita en el documento;
 *   4. sugerencia por el precio;
 *   5. preguntar.
 *
 * ── EL BULTO DEL PRODUCTO NUNCA ES EL DEFAULT ─────────────────────────────
 *
 * No aparece en la lista, y esa ausencia es la regla. Que el ERP compre por
 * bulto no dice NADA sobre cómo cotiza el proveedor, y usarlo como default es lo
 * que convirtió 10 unidades en 10 bultos. Si no hay ninguna de las cuatro
 * primeras, se pregunta.
 */
export function resolverUnidadDelPapel({
  unidadDocumento = null,
  unidadReceta = null,
  presentacionConfirmada = null,
  precioPapel = null,
  costoUnidadErp = null,
  costoBultoErp = null,
} = {}) {
  const deLaReceta = unidadValida(unidadReceta);
  if (deLaReceta) {
    return { unidad: deLaReceta, origen: ORIGEN_UNIDAD_PAPEL.RECETA, confirmada: true, evidencia: null };
  }

  const deLaPresentacion = unidadValida(presentacionConfirmada);
  if (deLaPresentacion) {
    return {
      unidad: deLaPresentacion,
      origen: ORIGEN_UNIDAD_PAPEL.PRESENTACION_CONFIRMADA,
      confirmada: true,
      evidencia: null,
    };
  }

  const delDocumento = unidadValida(unidadDocumento);
  if (delDocumento) {
    return { unidad: delDocumento, origen: ORIGEN_UNIDAD_PAPEL.DOCUMENTO, confirmada: true, evidencia: null };
  }

  const evidencia = evidenciaPorPrecio({ precioPapel, costoUnidadErp, costoBultoErp });
  if (evidencia && (evidencia.margen === undefined || evidencia.margen >= MARGEN_EVIDENCIA)) {
    return {
      // Se PROPONE, y `confirmada` queda en false: una evidencia de precio no es
      // una decisión humana y no puede guardarse como si lo fuera.
      unidad: evidencia.unidad,
      origen: ORIGEN_UNIDAD_PAPEL.EVIDENCIA_PRECIO,
      confirmada: false,
      evidencia,
    };
  }

  return { unidad: null, origen: ORIGEN_UNIDAD_PAPEL.PREGUNTA, confirmada: false, evidencia };
}

/**
 * La cantidad del papel llevada a UNIDADES SUELTAS. Es la base de todo.
 *
 * Devuelve null cuando falta saber qué significa la cantidad: sin eso no hay
 * base, y calcular igual sería inventar la escala.
 */
export function cantidadBaseEnUnidades({ cantidadPapel, unidadPapel, unidadesPorBultoErp } = {}) {
  const cant = num(cantidadPapel);
  const unidad = unidadValida(unidadPapel);
  if (cant === null || cant <= 0 || !unidad) return null;
  if (unidad === "UNIDAD") return cant;
  const factor = Math.max(1, Math.floor(num(unidadesPorBultoErp) || 1));
  return cant * factor;
}

/**
 * CÓMO QUEDA LA LÍNEA SI SE GUARDA EN `unidadPedido`.
 *
 * Siempre desde la base, nunca desde lo que se está mostrando. El subtotal se
 * conserva por construcción: la cantidad y el precio se derivan del mismo par
 * original.
 *
 * @returns `{ cantidad, unidad, precio, subtotal }`, o `{ requiereConfirmacion }`
 *   cuando pasar a bulto no da entero. No se redondea solo: pedir un bulto de
 *   más es pedirle otra cosa al proveedor.
 */
export function representarPedido({
  cantidadBaseUnidades,
  subtotalPapel,
  unidadPedido,
  unidadesPorBultoErp,
} = {}) {
  const base = num(cantidadBaseUnidades);
  const sub = num(subtotalPapel);
  const destino = unidadValida(unidadPedido) || "UNIDAD";
  if (base === null || base <= 0) return null;

  if (destino === "UNIDAD") {
    return {
      cantidad: base,
      unidad: "UNIDAD",
      precio: sub === null ? null : redondearCentavo(sub / base),
      subtotal: sub,
      requiereConfirmacion: false,
    };
  }

  const factor = Math.max(1, Math.floor(num(unidadesPorBultoErp) || 1));
  if (base % factor !== 0) {
    return {
      cantidad: null,
      unidad: "BULTO",
      precio: null,
      subtotal: sub,
      requiereConfirmacion: true,
      unidades: base,
      bultos: Math.ceil(base / factor),
      factor,
    };
  }
  const bultos = base / factor;
  return {
    cantidad: bultos,
    unidad: "BULTO",
    precio: sub === null ? null : redondearCentavo(sub / bultos),
    subtotal: sub,
    requiereConfirmacion: false,
  };
}

/** Al centavo, que es la unidad en la que el papel está expresado. */
function redondearCentavo(valor) {
  const n = num(valor);
  return n === null ? null : Math.round(n * 100) / 100;
}

/**
 * El texto de la pregunta, cuando hay que hacerla.
 *
 * Se arma acá y no en la pantalla para que la pregunta diga SIEMPRE el número
 * que trae el papel. Una pregunta genérica —"¿unidades o bultos?"— obliga a
 * quien la contesta a ir a buscar el dato que se le está preguntando.
 */
export function preguntaDeUnidad({ cantidadPapel, unidadesPorBultoErp } = {}) {
  const cant = num(cantidadPapel);
  if (cant === null) return null;
  const factor = Math.max(1, Math.floor(num(unidadesPorBultoErp) || 1));
  return {
    titulo: `La factura dice ${cant}. ¿Está expresado en?`,
    opciones: [
      { unidad: "UNIDAD", texto: `${cant} ${cant === 1 ? "unidad" : "unidades"}` },
      { unidad: "BULTO", texto: `${cant} ${cant === 1 ? "bulto" : "bultos"}`, equivale: cant * factor },
    ],
  };
}

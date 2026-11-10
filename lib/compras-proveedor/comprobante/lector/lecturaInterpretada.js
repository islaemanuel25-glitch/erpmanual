// lib/compras-proveedor/comprobante/lector/lecturaInterpretada.js
//
// EL PAPEL LO INTERPRETA EL MODELO. EL CÓDIGO CONTROLA LA CUENTA.
//
// ── POR QUÉ (Emanuel, 2026-10-10: "seguimos de parche en parche") ─────────
//
// Cada proveedor nuevo rompió una regla de formato escrita para el anterior:
// los netos del pie sumados como cargos (#153), los packs intermedios (#155),
// los kilos de peso variable (#162), Secco con el IVA adentro del precio (#163).
// Y #163 no alcanzó en producción: Flash leyó los diez renglones de Secco BIEN
// —sumaban el total impreso— y el código les sumó un 21 % que no existe porque
// la receta genérica decía "IVA al pie". El modelo grande tampoco cerró: el
// esquema lo obligaba a separar "precio sin impuestos" de "total con IVA" en un
// papel que no discrimina IVA, y puso el número en el casillero equivocado.
//
// El problema no era el modelo: lo obligábamos a contestar dentro de un menú de
// formatos y el costo lo decidían reglas de formato en el código.
//
// ── EL DISEÑO NUEVO ───────────────────────────────────────────────────────
//
// El modelo devuelve el papel YA INTERPRETADO: por renglón, lo que el papel
// dice —código, descripción, cantidad, en qué viene, importe impreso— y el
// COSTO FINAL DEL RENGLÓN, con todo lo que le corresponde según ESE papel
// (IVA, percepciones, internos, bonificaciones, descuentos). Más una
// explicación en criollo de cómo lo leyó, que es la receta del proveedor.
//
// El código controla tres cosas y nada más sobre el formato:
//   · la suma de los costos finales tiene que dar el total impreso, con la
//     tolerancia del redondeo del proveedor —el pie es el juez—;
//   · cada renglón de mercadería trae cantidad y un costo final no negativo;
//   · el conteo de renglones vistos contra transcriptos, como siempre.
// Las reglas de NEGOCIO —macheo, packs, kilos, comparación contra el ERP,
// bonificados, envases— se aplican después sobre el costo final de cada
// renglón y no cambian.
//
// Módulo puro: sin red y sin base.

import { aCentavos, TOLERANCIA_TOTAL_CENTAVOS } from "../impuestos.js";
import { rotuloDelTipo } from "../explicacionPorTipo.js";
import { renglonesQueNoCierran, textoDeRenglonesQueNoCierran } from "./renglonesQueNoCierran.js";

/** Qué es cada renglón. Lo dice el modelo mirando el papel. */
export const TIPO_RENGLON = Object.freeze({
  MERCADERIA: "MERCADERIA",
  /** Botellas de cambio, cajones, cargos simbólicos: suman al papel y no son producto. */
  ENVASE: "ENVASE",
  /**
   * Flete, servicio logístico, envío: suma al papel, no es producto, y SU COSTO
   * SE REPARTE entre la mercadería (`cargos.js`). Regla de Emanuel del
   * 2026-10-08: el costo lleva todo lo de la boleta. CCU #257, «300016 Servicio
   * Logístico».
   */
  CARGO: "CARGO",
  /**
   * Un descuento o una bonificación del proveedor escrito como renglón, con
   * importe negativo: no es producto, no entra al stock y no pide costo. SU
   * COSTO (negativo) SE REPARTE entre los productos que nombra, o entre todos
   * si no nombra ninguno (`descuentosDelPapel` en `cargos.js`). SL22-5181,
   * 2026-11-10: «417 Desc x 24u Pegamentos 2 × −5.000,00».
   */
  DESCUENTO: "DESCUENTO",
});

/**
 * El tipo que el modelo dio, o MERCADERIA si dio otra cosa o nada.
 *
 * ── UN IMPORTE NEGATIVO ES UN DESCUENTO, LO DIGA O NO EL LECTOR ───────────
 *
 * Regla de Emanuel (2026-11-10): un renglón con importe negativo es un
 * descuento, no un producto. El remito SL22-5181 se leyó antes de que el lector
 * conociera el tipo, con «Desc x 24u Pegamentos» como MERCADERIA a −$10.000, y
 * frenaba el papel entero con "le falta el costo final". Vale para lo leído y
 * para lo guardado (`subtotalImpreso`, `costoFinalRenglon`).
 */
export function tipoDelRenglon(linea) {
  const t = linea?.tipoRenglon ?? linea?.tipo ?? null;
  if (t === TIPO_RENGLON.DESCUENTO) return t;
  const importe = num(linea?.subtotalImpreso ?? linea?.importeImpreso);
  const costo = num(linea?.costoFinalRenglon ?? linea?.costoFinal);
  if ((importe !== null && importe < 0) || (costo !== null && costo < 0)) return TIPO_RENGLON.DESCUENTO;
  return t === TIPO_RENGLON.ENVASE || t === TIPO_RENGLON.CARGO ? t : TIPO_RENGLON.MERCADERIA;
}

/**
 * A QUÉ RENGLONES APLICA UN DESCUENTO, como lo dijo el lector o como quedó
 * guardado: una lista de códigos o descripciones, sin vacíos ni repetidos. Null
 * si no nombra ninguno, que es "a todos".
 */
export function aQuienAplica(valor) {
  if (!Array.isArray(valor)) return null;
  const limpios = [...new Set(valor.map((v) => String(v ?? "").trim()).filter(Boolean))];
  return limpios.length ? limpios : null;
}

/**
 * LA TOLERANCIA DEL TOTAL: el redondeo del proveedor, proporcional a los renglones.
 *
 * Cada costo final de renglón llega redondeado al centavo, y el proveedor
 * redondea además los impuestos de su pie sobre la suma: con muchos renglones
 * esos centavos se acumulan. Un centavo por renglón, y nunca menos que la de
 * siempre. El pie sigue siendo el juez: un dígito mal leído mueve pesos, no
 * centavos.
 */
export function toleranciaDelTotalCentavos(renglones) {
  const n = Number(renglones);
  return Math.max(TOLERANCIA_TOTAL_CENTAVOS, Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0);
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * EN UN PAPEL SIN IMPUESTOS, EL COSTO QUE EL LECTOR NO DIO ES EL IMPORTE.
 *
 * ── EL CASO (Mauro #298, 2026-10-26) ──────────────────────────────────────
 *
 * Las dos hojas del catálogo se leyeron bien —cantidad, precio de la unidad e
 * importe de los 19 productos— y el modelo no puso el `costoFinal` de ninguno:
 * el papel no lo imprime, y la instrucción le dice que lo que no está impreso
 * lo deje afuera. Con los 19 costos vacíos la cuenta no se podía hacer, la hoja
 * de Philips quedaba "mal leída" en vez de "sin total", la unión con la de
 * Lucky no se probaba nunca y la escala unidad contra pack no se deducía.
 *
 * Emanuel, sobre el papel: "no tiene impuestos: el importe de cada producto ya
 * es el costo final". Sin nada impreso que sumarle, lo que se paga por el
 * renglón es su importe.
 *
 * ── EL CRITERIO ES SI EL PAPEL TRAE IMPUESTOS, NO SU LETRA ────────────────
 *
 * Hasta el 2026-10-26 valía solo para el papel SIN FACTURA. Pero hay facturas
 * que no discriminan nada —la B, la C, la de consumidor final con IVA incluido;
 * CCU a veces factura así— y con esa regla quedaban con el costo vacío y "no
 * cierra", igual que Mauro. Regla de Emanuel: si el papel no muestra impuestos
 * aparte, ni por producto ni al pie, el importe es el costo final, sea A, B, C
 * o sin factura (`papelSinImpuestosImpresos`). Si los muestra, el costo sigue
 * siendo neto + IVA + percepciones + interno, como siempre.
 *
 * Solo completa lo que FALTA, y solo con un importe mayor que cero: un costo que
 * el modelo dio manda, y un importe en cero es una fila que no se mandó, no un
 * regalo. Si el pie trae algo que no es de ningún renglón —un descuento—, la
 * suma deja de dar el total y la puerta lo dice, como con cualquier lectura.
 * Y si el lector no leyó un IVA que estaba, la suma de los netos no da el total
 * impreso y la puerta tampoco deja pasar nada.
 *
 * @param linea        con `costoFinal` y `subtotalImpreso` (el importe)
 * @param sinImpuestos lo que dice `papelSinImpuestosImpresos` del papel entero
 * @returns el costo a completar, o null si no corresponde
 */
export function costoQueFaltaDelImporte(linea, sinImpuestos) {
  if (sinImpuestos !== true) return null;
  if (num(linea?.costoFinal) !== null) return null;
  const importe = num(linea?.subtotalImpreso);
  return importe !== null && importe > 0 ? importe : null;
}

/**
 * ¿EL PAPEL NO MUESTRA NINGÚN IMPUESTO APARTE? Ni por producto ni al pie.
 *
 * Mira lo que el papel imprime y se leyó: la alícuota de IVA o el interno de
 * cada producto —DYSSA—, y al pie el IVA, el interno, las percepciones y los
 * conceptos que suman —DAS lleva el IVA solo al pie—. Y la pregunta aparte que
 * se le hace al lector, `discriminaImpuestos`: si dijo que sí, el papel los
 * trae aunque no se hayan leído. Un descuento del pie no es un impuesto.
 *
 * Y una sola letra cuenta como prueba: la factura A discrimina el IVA siempre,
 * por ley. Lo guardado no conserva `discriminaImpuestos`, y una A con el IVA mal
 * leído no puede pasar por papel sin impuestos y costear al neto. La B, la C y
 * el papel sin letra se deciden por lo impreso.
 *
 * @param lectura la normalizada o la rearmada de lo guardado
 * @param letra   la del papel; en uno guardado sin cerrar no está en la identidad
 *                y la trae `recetaUsada.tipoComprobante`
 */
export function papelSinImpuestosImpresos(lectura, letra = lectura?.identidad?.tipo) {
  if (lectura?.discriminaImpuestos === true) return false;
  if (String(letra ?? lectura?.identidad?.tipo ?? "").trim().toUpperCase() === "A") return false;
  const positivo = (v) => (num(v) ?? 0) > 0;
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  if (lineas.some((l) => positivo(l?.alicuotaIva) || positivo(l?.internoUnitario))) return false;
  const pie = lectura?.pie ?? {};
  if (positivo(pie.iva) || positivo(pie.interno)) return false;
  if ((pie.percepciones ?? []).some((p) => positivo(p?.importe))) return false;
  if ((pie.conceptos ?? []).some((c) => c?.resta !== true && positivo(c?.importe))) return false;
  // ── LO QUE EL LECTOR REPARTIÓ TAMBIÉN ES PRUEBA ───────────────────────
  //
  // Arcor #362: el lector repartió el IVA y la percepción del pie en el costo
  // de cada renglón —la cuenta cerró contra el total— pero ni el pie ni
  // `discriminaImpuestos` quedaron guardados. En un papel sin impuestos el
  // costo de cada renglón es su importe; si los costos suman más que los
  // importes, algo del pie se sumó, y eso es un impuesto impreso.
  const conLosDos = lineas.filter((l) => num(l?.costoFinal) !== null && num(l?.subtotalImpreso) !== null);
  const repartido = conLosDos.reduce((s, l) => s + aCentavos(l.costoFinal) - aCentavos(l.subtotalImpreso), 0);
  if (repartido > toleranciaDelTotalCentavos(conLosDos.length)) return false;
  return true;
}

/**
 * ¿ESTA FILA ES UNA QUE NO SE MANDÓ? Importe en cero y sin cantidad.
 *
 * El lector las transcribe en su lugar para no correr las de abajo (ver "CADA
 * FILA ES UNA UNIDAD" en las instrucciones), y el sistema las descarta: no son
 * mercadería que llegó. Un renglón bonificado entero no es esto —trae su
 * cantidad—, y se queda.
 */
export function esFilaQueNoSeMando(linea) {
  const importe = num(linea?.subtotalImpreso ?? linea?.importeImpreso);
  const cantidad = num(linea?.cantidad);
  return importe === 0 && !(cantidad > 0);
}

/**
 * LA CUENTA DEL PAPEL: LA SUMA DE LOS COSTOS FINALES CONTRA EL TOTAL IMPRESO.
 *
 * Los envases y los cargos suman: están impresos y el proveedor los cobra. Lo que no hace
 * esta función es decidir nada de formato: no sabe qué es IVA ni qué es
 * percepción, y no le hace falta.
 *
 * @param lectura  la normalizada, con `costoFinal` y `tipo` en cada renglón
 * @returns `{ hayTotal, cierra, sumaCentavos, totalDeclaradoCentavos,
 *            diferenciaCentavos, toleranciaCentavos, invalidos, lineas }`
 */
export function verificarLecturaInterpretada(lectura) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const invalidos = [];
  const deCadaUna = lineas.map((l, i) => {
    const tipo = tipoDelRenglon(l);
    const costo = num(l?.costoFinal);
    const cantidad = num(l?.cantidad);
    // Un descuento tiene costo negativo y es lo que es; cualquier otro renglón
    // con costo negativo es uno mal leído.
    if (costo === null || (costo < 0 && tipo !== TIPO_RENGLON.DESCUENTO)) {
      invalidos.push({ indice: i, linea: i + 1, nombre: l?.descripcion ?? null, porque: "SIN_COSTO_FINAL" });
    } else if (tipo === TIPO_RENGLON.MERCADERIA && !(cantidad > 0)) {
      invalidos.push({ indice: i, linea: i + 1, nombre: l?.descripcion ?? null, porque: "SIN_CANTIDAD" });
    }
    return { indice: i, tipo, cantidad, costoFinalCentavos: costo === null ? null : aCentavos(costo) };
  });

  const sumaCentavos = deCadaUna.reduce((a, l) => a + (l.costoFinalCentavos ?? 0), 0);
  const total = num(lectura?.pie?.total);
  // CERO CUENTA COMO AUSENTE: medido con la planilla de Mauro, un modelo que no
  // encuentra total pone 0, y un 0 tomado por total haría de la diferencia el
  // comprobante entero. Y el booleano manda sobre el número: si dice que no
  // VE un total impreso, el número no salió del papel.
  const hayTotal = total !== null && total > 0 && lectura?.hayTotalImpreso !== false;
  const totalDeclaradoCentavos = hayTotal ? aCentavos(total) : null;
  const diferenciaCentavos = hayTotal ? sumaCentavos - totalDeclaradoCentavos : null;
  const toleranciaCentavos = toleranciaDelTotalCentavos(lineas.length);
  const cierra =
    hayTotal && lineas.length > 0 && invalidos.length === 0 && Math.abs(diferenciaCentavos) <= toleranciaCentavos;

  return {
    interpretada: true,
    hayTotal,
    cierra,
    sumaCentavos,
    totalDeclaradoCentavos,
    totalCalculadoCentavos: sumaCentavos,
    diferenciaCentavos,
    toleranciaCentavos,
    invalidos,
    lineas: deCadaUna,
  };
}

/**
 * ¿ESTE CONCEPTO DEL PIE ES UNA PERCEPCIÓN O UN IMPUESTO?
 *
 * Por el nombre, escrito como venga: «Percepciones = 34839.57», «Percep.»,
 * «Perc. IIBB», «PERC IVA», «Percepción Ing. Brutos», «Imp. Interno», «IIBB».
 * Ningún proveedor en particular: es la palabra, no el papel.
 */
export function esPercepcionOImpuesto(nombre) {
  const n = String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!n.trim()) return false;
  return (
    /\bperc/.test(n) ||
    /\biibb\b|\bi\.\s?i\.\s?b\.?\s?b\b|ing(resos|r)?\.?\s*brut/.test(n) ||
    /\bimp(uesto|uestos|\.)?\s*(int|munic|prov)/.test(n) ||
    /\btasa\b|\bsellos?\b/.test(n)
  );
}

/**
 * LO QUE EL PIE COBRA Y EL LECTOR NO REPARTIÓ, REPARTIDO.
 *
 * ── EL CASO (OLIMAR, remito «Pre-Venta(P)», 2026-11-02) ───────────────────
 *
 * El pie trae «(Percepciones = 34839.57)» entre paréntesis, en un renglón
 * suelto antes de «TOTAL Remito: 683391.62». El lector dio el costo de los
 * nueve productos sin la percepción —suman 648.552,06— y la recepción dijo "no
 * cierra por $34.839,56". Sumada, cierra a un centavo.
 *
 * La regla de Emanuel no cambia: el costo lleva TODO —neto, IVA,
 * percepciones, interno—. Lo que cambia es que el sistema ya no depende de que
 * el modelo se acuerde de repartir lo que él mismo copió del pie.
 *
 * ── CUÁNDO, Y SOLO CUÁNDO ─────────────────────────────────────────────────
 *
 * Si la suma de los costos YA da el total, el lector repartió y no se toca
 * nada: sumarlo otra vez sería cobrar la percepción dos veces. Se reparte solo
 * si lo que falta para el total es, con la tolerancia del redondeo, lo que el
 * pie cobra: primero todos sus conceptos con signo —percepciones, impuestos,
 * redondeos, menos los descuentos—, y si eso no da, solo las percepciones e
 * impuestos (`esPercepcionOImpuesto`). Si no coincide con ninguno de los dos,
 * no se adivina: la puerta sigue diciendo que no cierra.
 *
 * ── CÓMO ──────────────────────────────────────────────────────────────────
 *
 * Igual que los cargos (`cargos.js`): en centavos, entre los renglones de
 * mercadería con costo, en proporción a su costo, con el resto al de mayor
 * costo. Se reparte el importe IMPRESO, no la diferencia: el centavo de
 * redondeo del proveedor queda como diferencia, dentro de la tolerancia.
 *
 * @param lectura  normalizada o rearmada de lo guardado, con `pie` y `lineas`
 * @returns `{ lineas, repartidoCentavos, conceptos }` — las mismas líneas si no
 *          corresponde, con `repartidoCentavos` en 0
 */
export function repartirLoDelPieQueFalta(lectura) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const nada = { lineas, repartidoCentavos: 0, conceptos: [] };
  const total = num(lectura?.pie?.total);
  if (total === null || total <= 0 || lectura?.hayTotalImpreso === false || !lineas.length) return nada;
  if (lineas.some((l) => num(l?.costoFinal) === null)) return nada;

  const pie = lectura?.pie ?? {};
  const delPie = [
    ...(Array.isArray(pie.conceptos) ? pie.conceptos : []).map((c) => ({
      nombre: c?.nombre ?? null,
      centavos: aCentavos(Math.abs(num(c?.importe) ?? 0)) * (c?.resta === true || num(c?.importe) < 0 ? -1 : 1),
    })),
    ...(Array.isArray(pie.percepciones) ? pie.percepciones : []).map((p) => ({
      nombre: p?.nombre ?? "Percepción",
      centavos: aCentavos(num(p?.importe) ?? 0),
    })),
  ].filter((c) => c.centavos !== 0);
  if (!delPie.length) return nada;

  const suma = lineas.reduce((a, l) => a + aCentavos(l.costoFinal), 0);
  const falta = aCentavos(total) - suma;
  const tolerancia = toleranciaDelTotalCentavos(lineas.length);
  if (Math.abs(falta) <= tolerancia) return nada;

  const sumar = (cs) => cs.reduce((a, c) => a + c.centavos, 0);
  const percepciones = delPie.filter((c) => c.centavos > 0 && esPercepcionOImpuesto(c.nombre));
  const elegidos = [delPie, percepciones].find((cs) => cs.length && Math.abs(falta - sumar(cs)) <= tolerancia);
  if (!elegidos) return nada;
  const aRepartir = sumar(elegidos);

  const mercaderia = lineas
    .map((l, i) => ({ i, costo: aCentavos(l.costoFinal), tipo: tipoDelRenglon(l) }))
    .filter((l) => l.tipo === TIPO_RENGLON.MERCADERIA && l.costo > 0);
  const base = mercaderia.reduce((a, l) => a + l.costo, 0);
  if (base === 0) return nada;

  const partes = new Map();
  let repartido = 0;
  for (const l of mercaderia) {
    const parte = Math.round((aRepartir * l.costo) / base);
    partes.set(l.i, parte);
    repartido += parte;
  }
  const mayor = mercaderia.reduce((m, l) => (l.costo > m.costo ? l : m), mercaderia[0]);
  partes.set(mayor.i, partes.get(mayor.i) + (aRepartir - repartido));

  return {
    lineas: lineas.map((l, i) =>
      partes.has(i) ? { ...l, costoFinal: (aCentavos(l.costoFinal) + partes.get(i)) / 100 } : l
    ),
    repartidoCentavos: aRepartir,
    conceptos: elegidos.map((c) => c.nombre),
  };
}

/** Cuánto puede alejarse el costo del modelo del que sale del importe: 2 %, y nunca menos de un peso. */
const DESVIO_MAXIMO_DEL_MODELO = 0.02;
const DESVIO_MINIMO_CENTAVOS = 100;

/** Un concepto del pie que es la base y no algo que se cobra: «Neto gravado», «Subtotal». */
const esBaseDelPie = (nombre) =>
  /\b(neto|subtotal|sub-total|gravad)/i.test(
    String(nombre ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
  );

/**
 * EL COSTO DE CADA RENGLÓN SALE DE SU IMPORTE IMPRESO, NO DE LA CUENTA DEL MODELO.
 *
 * ── EL CASO (Ayala Gauna / Kangoo, 2026-11-05) ────────────────────────────
 *
 * Releído con el lector grande, el papel trajo sus 14 renglones y sus 14
 * TOTAL impresos, que suman el neto del pie. El pie cierra solo: neto
 * 413.877,79 + IVA 21 % 86.914,34 + RG 5329 3 % 12.416,33. O sea que el costo
 * de cada fila es su TOTAL impreso × 1,24. El modelo, en cambio, dio costos que
 * no respetaban eso —el OREO 63.818,20 donde corresponde 63.873,45— y la suma
 * quedó "no cierra por $443,97". El importe estaba bien leído: lo que estaba
 * mal era el costo que el modelo armó encima.
 *
 * Regla vigente: el subtotal de la línea SE LEE, NO SE RECALCULA. La cuenta de
 * cada fila (`renglonesQueNoCierran`) es un control para encontrar filas mal
 * leídas; nunca la fuente del importe.
 *
 * ── CUÁNDO, Y SOLO CUÁNDO ─────────────────────────────────────────────────
 *
 * Todas juntas, y si falta una no se toca nada y la puerta sigue diciendo que
 * no cierra:
 *   · la suma de los costos del modelo NO da el total impreso;
 *   · todos los renglones son mercadería y traen su importe impreso —ni
 *     envases ni cargos, que pueden llevar otra cuenta—;
 *   · ningún renglón trae impuesto interno y todos la misma alícuota de IVA, o
 *     ninguna: con alícuotas distintas (DYSSA) un mismo factor para todos
 *     estaría mal;
 *   · los importes explican el pie: su suma da el neto leído, o sumada al IVA,
 *     al interno y a lo que el pie cobra da el total;
 *   · el costo que dio el modelo para cada renglón está a menos de un 2 % del
 *     que sale del importe. Si uno se aleja más, no es un redondeo: es una
 *     fila mal leída o con otra cuenta, y eso lo decide una persona.
 *
 * ── CÓMO ──────────────────────────────────────────────────────────────────
 *
 * El total impreso se reparte entre los renglones en proporción a su importe,
 * en centavos, y cada centavo que sobra del redondeo va al renglón al que más
 * le faltaba: cada costo es su importe por el factor del pie, redondeado, y la
 * suma da el total al centavo.
 *
 * @param lectura  normalizada o rearmada de lo guardado, con `pie` y `lineas`
 * @returns `{ lineas, corregidos }` — las mismas líneas y 0 si no corresponde
 */
export function costosDesdeLosImportesImpresos(lectura) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const nada = { lineas, corregidos: 0 };
  const total = num(lectura?.pie?.total);
  if (total === null || total <= 0 || lectura?.hayTotalImpreso === false || !lineas.length) return nada;
  if (verificarLecturaInterpretada(lectura).cierra) return nada;

  const importes = lineas.map((l) => num(l?.subtotalImpreso));
  const todasMercaderiaConImporte = lineas.every(
    (l, i) => tipoDelRenglon(l) === TIPO_RENGLON.MERCADERIA && importes[i] !== null && importes[i] >= 0 && l?.subtotalDespejado !== true
  );
  if (!todasMercaderiaConImporte) return nada;
  if (lineas.some((l) => (num(l?.internoUnitario) ?? 0) > 0 || (num(l?.internoImpreso) ?? 0) > 0)) return nada;
  const alicuotas = new Set(lineas.map((l) => num(l?.alicuotaIva)).filter((a) => a !== null && a > 0));
  if (alicuotas.size > 1) return nada;

  const importesCentavos = importes.map(aCentavos);
  const base = importesCentavos.reduce((a, c) => a + c, 0);
  const totalCentavos = aCentavos(total);
  if (base <= 0 || totalCentavos < base) return nada;

  const tolerancia = toleranciaDelTotalCentavos(lineas.length);
  const pie = lectura?.pie ?? {};
  const neto = num(pie.neto);
  const daElNeto = neto !== null && neto > 0 && Math.abs(aCentavos(neto) - base) <= tolerancia;
  const cobra =
    aCentavos(num(pie.iva) ?? 0) +
    aCentavos(num(pie.interno) ?? 0) +
    (Array.isArray(pie.percepciones) ? pie.percepciones : []).reduce((a, p) => a + aCentavos(num(p?.importe) ?? 0), 0) +
    (Array.isArray(pie.conceptos) ? pie.conceptos : [])
      .filter((c) => !esBaseDelPie(c?.nombre))
      .reduce((a, c) => a + aCentavos(Math.abs(num(c?.importe) ?? 0)) * (c?.resta === true || num(c?.importe) < 0 ? -1 : 1), 0);
  const daElTotal = cobra > 0 && Math.abs(base + cobra - totalCentavos) <= tolerancia;
  if (!daElNeto && !daElTotal) return nada;

  // El reparto por el resto mayor: cada renglón recibe su parte entera y los
  // centavos que sobran van a los de mayor resto, uno por uno.
  const exactos = importesCentavos.map((c) => (c * totalCentavos) / base);
  const costos = exactos.map(Math.floor);
  const sobran = totalCentavos - costos.reduce((a, c) => a + c, 0);
  exactos
    .map((e, i) => ({ i, resto: e - Math.floor(e) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i)
    .slice(0, sobran)
    .forEach(({ i }) => (costos[i] += 1));

  const delModeloLejos = lineas.some((l, i) => {
    const delModelo = num(l?.costoFinal);
    if (delModelo === null) return false;
    const desvio = Math.abs(aCentavos(delModelo) - costos[i]);
    return desvio > Math.max(DESVIO_MINIMO_CENTAVOS, costos[i] * DESVIO_MAXIMO_DEL_MODELO);
  });
  if (delModeloLejos) return nada;

  let corregidos = 0;
  const nuevas = lineas.map((l, i) => {
    const costo = costos[i] / 100;
    if (num(l?.costoFinal) !== null && aCentavos(l.costoFinal) === costos[i]) return l;
    corregidos += 1;
    return { ...l, costoFinal: costo };
  });
  return corregidos ? { lineas: nuevas, corregidos } : nada;
}

/**
 * ¿EL LECTOR VIO MÁS PRODUCTOS DE LOS QUE TRANSCRIBIÓ?
 *
 * Es el conteo contra el papel: `lineasEnElPapel` —lo que dice ver— contra lo
 * transcripto. UNA sola pregunta para la puerta, la escalada, el reintento de
 * la lectura y la pantalla de la explicación: eran cuatro comparaciones
 * escritas cada una a su manera.
 *
 * ── CON UN TOTAL IMPRESO QUE CIERRA AL CENTAVO, NO FALTA NADA ─────────────
 *
 * Un producto con importe que no se transcribió deja la suma corta contra el
 * total, así que si cierra, lo que el lector contó de más son productos con
 * importe en cero: no se mandaron y no son esperados. Es el catálogo de Mauro
 * #298 (2026-10-26): la hoja de Lucky trae 4 con importe y el lector contó las
 * 24 filas impresas, y avisaba "transcribió 4" sobre una hoja completa. Sin
 * total —o sin cerrar— no hay con qué saberlo, y el aviso sigue.
 *
 * @returns `{ declaradas, transcriptas, faltan }` o null
 */
export function renglonesQueFaltan(lectura, verificacion = verificarLecturaInterpretada(lectura)) {
  if (verificacion?.hayTotal && verificacion?.cierra) return null;
  const declaradas = Number(lectura?.lineasEnElPapel);
  const transcriptas = Array.isArray(lectura?.lineas) ? lectura.lineas.length : 0;
  if (lectura?.lineasEnElPapel == null || !Number.isFinite(declaradas) || declaradas <= transcriptas) return null;
  return { declaradas, transcriptas, faltan: declaradas - transcriptas };
}

/**
 * Por qué no cierra, dicho como el resto de los carteles: el renglón al que le
 * falta un dato, o por cuánto no da la suma y qué renglones mirar.
 *
 * @param renglones  OPCIONAL, los de `renglonesQueNoCierran`: dónde mirar
 */
export function porqueNoCierraInterpretada(v, { moneda = (x) => `$${x}`, renglones = [] } = {}) {
  if (v?.invalidos?.length) {
    const uno = v.invalidos[0];
    const nombre = uno.nombre ? `«${uno.nombre}»` : `número ${uno.linea}`;
    const falta = uno.porque === "SIN_CANTIDAD" ? "la cantidad" : "el costo final";
    const otros = v.invalidos.length > 1 ? ` (y ${v.invalidos.length - 1} más)` : "";
    return `Al producto ${nombre}${otros} le falta ${falta}. No se propone ningún costo desde este comprobante.`;
  }
  const nombres = (Array.isArray(renglones) ? renglones : []).map((r) => r?.descripcion).filter(Boolean);
  const donde = nombres.length
    ? ` Mirá ${nombres.map((n) => `«${n}»`).join(", ")}: su cantidad por su precio no da su importe.`
    : "";
  return (
    `No cierra por ${moneda(Math.abs(v.diferenciaCentavos ?? 0) / 100)}: los costos de los productos suman ` +
    `${moneda(v.sumaCentavos / 100)} y el papel dice ${moneda(v.totalDeclaradoCentavos / 100)}.${donde} ` +
    "No se propone ningún costo desde este comprobante."
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE SE LE PIDE AL MODELO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * EL ESQUEMA: EL PAPEL INTERPRETADO. El mismo para Flash y para el modelo grande.
 *
 * Ningún campo obliga a separar neto de final: el modelo informa lo que el
 * papel dice y el costo final que resulta. Lo que puede faltar en el papel es
 * opcional —un campo obligatorio es una orden de inventar—; obligatoria es la
 * descripción, que siempre está impresa, y la explicación, que no se deriva de
 * ningún otro dato.
 */
export function esquemaInterpretado() {
  return {
    type: "object",
    properties: {
      identidad: {
        type: "object",
        properties: {
          tipo: { type: "string" },
          puntoVenta: { type: "string" },
          numero: { type: "string" },
          fecha: { type: "string" },
          cuit: { type: "string" },
          // El CAE de la AFIP: único por comprobante, así que defiende contra
          // la misma factura subida dos veces aunque el número no se vea.
          cae: { type: "string" },
        },
      },
      lineas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            codigoProveedor: { type: "string" },
            descripcion: { type: "string" },
            cantidad: { type: "number" },
            enQueViene: { type: "string" },
            // El UxB impreso en su columna (Super Mario, 2026-11-05). Opcional:
            // un papel sin esa columna no la trae, y obligarlo sería pedir que
            // la invente.
            unidadesPorBulto: { type: "number", nullable: true },
            precioImpreso: { type: "number", nullable: true },
            // La bonificación del renglón en %, si la imprime (Ayala Gauna,
            // 2026-11-05: columna BONIF %). Sin ella no se puede comprobar que
            // cantidad × precio dé el importe de la fila
            // (`renglonesQueNoCierran`). Opcional: no se inventa.
            bonificacion: { type: "number", nullable: true },
            importeImpreso: { type: "number", nullable: true },
            kilos: { type: "number", nullable: true },
            costoFinal: { type: "number" },
            tipo: { type: "string", enum: Object.values(TIPO_RENGLON) },
            // A qué renglones del papel aplica un DESCUENTO, por su código o su
            // descripción (SL22-5181: «Pegamentos» → La Gotita y La Gotita
            // Gel). Opcional: un descuento que no nombra a nadie va afuera.
            aplicaA: { type: "array", items: { type: "string" }, nullable: true },
          },
          required: ["descripcion"],
        },
      },
      // ── LOS IMPORTES DEL PIE, COPIADOS COMO ESTÁN ─────────────────────────
      //
      // Arcor #362 (2026-10-28): el esquema pedía solo el total, así que el IVA
      // y la PERC. IVA del pie —impresos, y repartidos bien en cada costo— no
      // quedaban guardados en ningún lado, y la recepción decía "este papel no
      // trae impuestos". Se piden aparte, con la forma que `normalizarLectura`
      // ya conoce. Todos opcionales: lo que el papel no trae queda afuera.
      pie: {
        type: "object",
        properties: {
          total: { type: "number" },
          neto: { type: "number", nullable: true },
          iva: { type: "number", nullable: true },
          interno: { type: "number", nullable: true },
          conceptos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                importe: { type: "number" },
                resta: { type: "boolean" },
              },
            },
          },
        },
      },
      lineasEnElPapel: { type: "integer" },
      hayTotalImpreso: { type: "boolean" },
      // Si el papel muestra IVA o percepciones como importes aparte. Un sí o un
      // no que no se deriva de ningún otro dato: sin letra leída, es lo único
      // que separa un papel en negro de una factura cuya letra no se vio
      // (`tipoParaLaReceta`, Coca-Cola #259).
      //
      // OPCIONAL a propósito, aunque se pregunte siempre: `respuestaCompleta`
      // trata como cortada a la respuesta que no trae un obligatorio, y perder
      // la lectura entera por una pregunta de clasificación sería peor que el
      // defecto. Sin respuesta, un papel sin letra no recibe receta: es el
      // lado seguro.
      discriminaImpuestos: { type: "boolean" },
      explicacion: { type: "string" },
      // Solo se pregunta cuando el modelo grande lee guiado por la explicación
      // confirmada. OPCIONAL a propósito: sin respuesta se propone como antes.
      explicacionSirve: { type: "boolean" },
    },
    required: ["identidad", "lineas", "pie", "lineasEnElPapel", "hayTotalImpreso", "explicacion"],
  };
}

/** Por qué se llama al modelo grande, dicho para él. */
const POR_QUE_SE_TE_PIDE = Object.freeze({
  FALTAN_RENGLONES: "otro lector transcribió menos renglones de los que dice ver en el papel",
  NO_CIERRA: "con lo que leyó otro lector, los costos de los renglones no suman el total del papel",
  SIN_RECETA:
    "todavía no hay una explicación confirmada de cómo viene este tipo de papel de este proveedor",
  FLASH_SIN_RESPUESTA: "otro lector no terminó de leerlo en el tiempo que tenía",
  RENGLONES_QUE_NO_CIERRAN:
    "en lo que leyó otro lector hay renglones cuya cantidad por su precio no da el importe de su propia fila",
});

/**
 * LAS INSTRUCCIONES. Leer el papel entero, calcular el costo final de cada
 * renglón y comprobar que la suma dé el total, como lo haría una persona.
 *
 * @param explicacion    la del tipo de este papel, confirmada; o null (la usa el
 *                       modelo grande, que ya sabe de qué tipo es el papel)
 * @param explicaciones  las confirmadas del proveedor, una por tipo:
 *                       `[{ tipoComprobante, explicacion }]` (la usa Flash, que
 *                       todavía no leyó la letra)
 * @param referencia   la lectura de otro lector, si la hay (solo al escalar)
 * @param motivo       por qué se escala, una clave de `ESCALADA`
 */
export function instruccionesInterpretadas({
  explicacion = null,
  explicaciones = null,
  proveedorNombre = null,
  paginas = 1,
  referencia = null,
  motivo = null,
} = {}) {
  const partes = [];
  const texto = String(explicacion ?? "").trim();
  const porTipo = (Array.isArray(explicaciones) ? explicaciones : []).filter((e) => String(e?.explicacion ?? "").trim());
  if (porTipo.length) {
    // ── UNA POR TIPO DE COMPROBANTE (`explicacionPorTipo.js`) ─────────────
    //
    // El mismo proveedor puede mandar una factura A y una B armadas distinto.
    // Van todas, cada una con su tipo, y el modelo usa la del tipo que trae el
    // papel. Si el papel es de un tipo sin explicación, lo lee como está: el
    // código se da cuenta por la letra leída y llama al modelo grande.
    partes.push(
      "Así vienen los papeles de este proveedor, explicados y confirmados por quien recibe la " +
        "mercadería, uno por tipo de comprobante:\n\n" +
        porTipo
          .map((e) => `<<<EXPLICACIÓN ${rotuloDelTipo(e.tipoComprobante)}\n${String(e.explicacion).trim()}\nEXPLICACIÓN>>>`)
          .join("\n\n") +
        "\n\nUsá SOLO la del tipo que trae este papel —mirá la letra del recuadro—. Si el papel es de " +
        "otro tipo, no uses ninguna: leelo como está. Y si este papel en particular dice otra cosa " +
        "que su explicación, manda el papel: leelo como está y decilo en tu explicación."
    );
  } else if (texto) {
    partes.push(
      "Así viene el papel de este proveedor, explicado y confirmado por quien recibe la mercadería:\n\n" +
        `<<<EXPLICACIÓN\n${texto}\nEXPLICACIÓN>>>\n\n` +
        "Usala como guía. Si este papel en particular dice otra cosa, manda el papel: leelo como " +
        "está y decilo en tu explicación."
    );
    // ── ¿LA EXPLICACIÓN CONFIRMADA SIGUE SIRVIENDO? UNA PREGUNTA APARTE ───
    //
    // El caso de Emanuel (2026-10-21): el mismo proveedor y el mismo tipo de
    // papel a veces traen una percepción del 3 % —solo cuando la compra pasa
    // un importe— y a veces no. Un papel sin ella no es un papel armado de otra
    // forma, y no tiene que proponer una receta nueva. Distinguirlo comparando
    // textos es imposible —el grande nunca escribe la misma frase—, así que se
    // pregunta, con un sí o un no que no se puede sacar de ningún otro dato
    // (regla 2 de CLAUDE.md: lo que puede faltar se pregunta aparte).
    partes.push(
      "OTRA PREGUNTA APARTE, mirando el papel y la explicación de arriba: `explicacionSirve` es " +
        "true si esa explicación describe bien cómo está armado ESTE papel, aunque este papel " +
        "traiga o no traiga algún cargo del pie que se cobra solo a veces —por ejemplo una " +
        "percepción que aparece recién a partir de cierto importe—. Es false si este papel está " +
        "armado de otra forma: el precio trae el IVA y la explicación dice que se suma al pie, las " +
        "columnas son otras, la cantidad se cuenta distinto."
    );
  }
  const porque = POR_QUE_SE_TE_PIDE[motivo];
  if (porque) partes.push(`Se te pide porque ${porque}. Lo que vale es lo que ves en el papel.`);
  if (referencia) {
    const { lineas = [], pie = {}, lineasEnElPapel = null, hayTotalImpreso = null } = referencia;
    partes.push(
      "Esto leyó el otro lector. Usalo SOLO COMO REFERENCIA: puede faltar algún renglón o haber " +
        "un número mal leído.\n\n<<<LECTURA\n" +
        JSON.stringify({ lineas, pie, lineasEnElPapel, hayTotalImpreso }) +
        "\nLECTURA>>>"
    );
    // Las filas de esa lectura que no cierran su propia cuenta, con nombre y
    // números: es lo que hay que volver a mirar (Ayala Gauna, 2026-11-05).
    const aRevisar = textoDeRenglonesQueNoCierran(renglonesQueNoCierran(referencia));
    if (aRevisar) partes.push(aRevisar);
  }

  partes.push(
    "Sos una persona que conoce las facturas argentinas y tiene que cargar este comprobante de " +
      "compra" +
      (proveedorNombre ? ` del proveedor ${proveedorNombre}` : "") +
      ". Leé el papel ENTERO —renglones, columnas y pie— y decí, por cada renglón, cuánto cuesta " +
      "de verdad lo que se compró."
  );
  if (Number(paginas) > 1) {
    partes.push(
      `Te paso ${paginas} imágenes del MISMO comprobante, en orden. Devolvé un solo resultado con ` +
        "todos los renglones de todas las imágenes y un solo pie. Un renglón cortado entre dos " +
        "fotos es uno solo."
    );
  }
  partes.push(
    "Por cada renglón de mercadería o de envase devolvé:\n" +
      "  codigoProveedor  el código del artículo, si lo trae\n" +
      "  descripcion      el texto del renglón tal como está impreso\n" +
      "  cantidad         la cantidad tal como está impresa\n" +
      "  enQueViene       en qué viene esa cantidad, como lo dice el papel: «unidad», «pack de 6»,\n" +
      "                   «bulto de 24», «kg», o lo que diga\n" +
      "  unidadesPorBulto si el papel imprime una columna de unidades por bulto —«UxB», «U x B»,\n" +
      "                   «x», «Unid. x Bulto»— y la cantidad de ESTE renglón está en bultos, el\n" +
      "                   número de esa columna, aunque la explicación de este proveedor no lo\n" +
      "                   nombre. Si el renglón trae los bultos en cero o vacíos y la cantidad en\n" +
      "                   la columna de unidades, dejalo afuera: esa cantidad ya son unidades\n" +
      "  precioImpreso    el precio unitario tal como está impreso, si lo trae\n" +
      "  bonificacion     el porcentaje de bonificación o descuento impreso EN ESE RENGLÓN —columna\n" +
      "                   «BONIF %», «DTO», «Desc.»—, si lo trae; un renglón sin bonificación, afuera\n" +
      "  importeImpreso   el importe del renglón tal como está impreso, si lo trae\n" +
      "  kilos            si el renglón trae piezas Y además los kilos que pesaron, los kilos\n" +
      "  costoFinal       LO QUE CUESTA EL RENGLÓN ENTERO, con todo lo que le corresponde según\n" +
      "                   ESTE papel: su IVA, su parte de las percepciones y de los impuestos del\n" +
      "                   pie, su impuesto interno, y descontadas sus bonificaciones y su parte de\n" +
      "                   los descuentos. Si el precio ya trae el IVA, no se lo vuelvas a sumar.\n" +
      "                   Lo que el pie cobra para todo el papel se reparte entre los renglones en\n" +
      "                   proporción a su importe. Un renglón regalado, bonificado entero, cuesta 0.\n" +
      "                   Va SOLO lo que está impreso en este papel: un impuesto o una percepción\n" +
      "                   que la explicación nombra pero que este papel no trae, no se suma.\n" +
      "  tipo             MERCADERIA; ENVASE si es un envase, una botella de cambio, un cajón o\n" +
      "                   un cargo simbólico que no es mercadería para vender —un producto de\n" +
      "                   regalo facturado a un precio simbólico, como 1,362, es MERCADERIA—; CARGO si es un\n" +
      "                   flete, un servicio logístico, un envío o cualquier cargo del proveedor\n" +
      "                   que no es mercadería. Un CARGO lleva su costoFinal como cualquier\n" +
      "                   renglón: NO lo repartas vos entre los demás, el sistema lo reparte.\n" +
      "                   DESCUENTO si el renglón es un descuento o una bonificación con importe\n" +
      "                   negativo («Desc x 24u Pegamentos  2  -5.000,00»): lleva su importe y su\n" +
      "                   costoFinal NEGATIVOS, con su parte de lo del pie como cualquier renglón,\n" +
      "                   y NO lo descuentes vos del costoFinal de los demás: el sistema lo reparte.\n" +
      "  aplicaA          solo en un DESCUENTO: a qué renglones de ESTE papel aplica, por su\n" +
      "                   código, o por su descripción si no tienen código. «Pegamentos» son los\n" +
      "                   pegamentos del papel. Si el descuento no nombra a qué aplica, afuera."
  );
  // ── CADA FILA ES UNA UNIDAD (Mauro #298, 2026-10-26) ───────────────────
  //
  // El catálogo de Mauro trae filas en $0 —lo que no se mandó— mezcladas con
  // las que sí. Flash y el modelo grande salteaban la fila en $0 y, en el bloque
  // M.CRAFTED, le dejaban su NOMBRE a los números de la fila de abajo: cinco
  // productos con los números del vecino y la suma cerrando igual, porque los
  // importes solo se movieron de lugar. Medido en `LlamadaLector` 95 y 96.
  partes.push(
    "CADA FILA DE LA TABLA ES UNA UNIDAD: el nombre, la cantidad, el precio de la unidad y el " +
      "importe de un renglón salen de LA MISMA FILA impresa, leída de izquierda a derecha. Nunca " +
      "le pongas a un nombre los números de la fila de arriba o de abajo. Devolvé siempre el " +
      "importeImpreso de cada fila, aunque se pueda calcular.\n" +
      "En cada fila, antes de contestar, comprobá que cantidad × precio × (1 − bonificación) dé el " +
      "importe impreso de ESA fila, al centavo salvo redondeo. Si no da, tomaste un número de otra " +
      "fila o te salteaste una: volvé a mirarla. Dos renglones seguidos con precios casi iguales son " +
      "DOS renglones. Si la foto está girada o el papel apaisado, las filas siguen siendo las del " +
      "papel: seguí cada fila de punta a punta.\n" +
      "En un catálogo o una planilla, una fila con el importe en cero o vacío NO SE MANDÓ, pero " +
      "transcribila igual EN SU LUGAR, con su descripción, importeImpreso 0 y sin cantidad: es lo " +
      "que mantiene a las filas de abajo con sus propios números. El sistema la descarta."
  );
  partes.push(
    "LA CUENTA: la suma de los costoFinal de todos los renglones tiene que dar el TOTAL impreso del " +
      "papel, al centavo salvo redondeo. Hacé esa cuenta antes de contestar. Si no te da, volvé a " +
      "mirar el papel: un renglón salteado, un número mal leído o algo del pie que no repartiste."
  );
  partes.push(
    "NO son renglones, aunque estén en la tabla con importe: «TRANSPORTE», «VAN», «VIENEN», «SUMA " +
      "Y SIGUE», «SUBTOTAL DE LA HOJA» y cualquier acarreo de una hoja a la siguiente."
  );
  partes.push(
    "Lo que no se lee o no está en el papel, dejalo afuera. No pongas cero ni un valor aproximado " +
      "en lo que es una transcripción: un cero se confunde con un importe real."
  );
  partes.push(
    "En `pie.total` va el total impreso. OTRA TAREA APARTE, MIRANDO EL PAPEL: `hayTotalImpreso` es " +
      "true solo si VES un total impreso. Si es una planilla o un remito sin total, poné false y " +
      "dejá afuera `pie.total`: no lo completes sumando, porque la suma es justamente lo que se " +
      "compara contra él."
  );
  partes.push(
    "Y en `pie`, copiá además los importes que el pie imprime, tal como están: `neto` el subtotal " +
      "o neto gravado, `iva` el IVA (si hay varias alícuotas, la suma), `interno` los impuestos " +
      "internos, y en `conceptos` cada percepción, retención, descuento o redondeo, con su nombre " +
      "como está impreso y su importe; `resta` true si descuenta. Solo lo que está impreso: lo que " +
      "el pie no trae, o trae en cero, dejalo afuera.\n" +
      "Una percepción puede estar escrita de CUALQUIER forma: «Percepciones = 1234.56», «Percep.», " +
      "«Perc. IIBB», «PERC IVA», «Percepción Ing. Brutos», «P.IIBB», a veces ENTRE PARÉNTESIS o sola " +
      "en un renglón justo antes del total, en un remito o en una factura. Es un importe del pie " +
      "igual: va en `conceptos` con su nombre y su importe, y se reparte en el costoFinal de los " +
      "renglones como cualquier percepción."
  );
  partes.push(
    "Y ANTES de mirar lo que transcribiste, contá cuántos renglones con cantidad tiene impresa la " +
      "tabla —incluidos los que no se leen bien— y ponelo en `lineasEnElPapel`. En un catálogo o " +
      "planilla, las filas con el importe vacío o en cero no se mandaron: transcribilas en su lugar " +
      "como se dijo arriba, pero no las cuentes acá. No lo saques de contar los que devolviste: si " +
      "te salteaste uno, este número tiene que ser mayor."
  );
  partes.push(
    "Por último, `explicacion`: en castellano y en pocas frases, cómo viene armado ESTE papel para " +
      "que otra persona lo cargue igual la próxima vez. Qué columna es qué, si el precio trae el IVA " +
      "o se suma al pie, qué hay en el pie y cómo lo repartiste, si hay bonificaciones, kilos, " +
      "envases. Si un cargo del pie puede no venir siempre —una percepción que depende del " +
      "importe—, decí que se suma cuando viene impreso, no que viene siempre. Es la receta de " +
      "este proveedor: escribila como se la explicarías a una persona."
  );
  partes.push(
    "OTRA PREGUNTA APARTE, MIRANDO EL PAPEL: `discriminaImpuestos` es true si el papel muestra el " +
      "IVA o alguna percepción como un importe aparte —en el pie o en una columna—, y false si no " +
      "muestra ninguno: un remito, un presupuesto o un ticket donde el precio ya es lo que se paga."
  );
  partes.push(
    "En `identidad`: el tipo es la LETRA del comprobante (A, B, C, M) tal como está impresa en el " +
      "recuadro; si el papel no es una factura con letra —un remito, una planilla—, dejalo afuera. " +
      "Una factura que discrimina IVA o percepciones TIENE letra: buscala en el recuadro del medio, " +
      "arriba, antes de dejarla afuera. " +
      "El punto de venta y el número salen SOLO del número de comprobante, el que el papel rotula " +
      "como «Nro.», «Comprobante», «Factura N°» o similar: nunca del CUIT, del número de Ingresos " +
      "Brutos (IIBB), del código o número de cliente, del CAE, de un número de pedido ni de ningún " +
      "otro número del encabezado. Si el número de comprobante no está a la vista, dejá afuera el " +
      "punto de venta y el número: no los deduzcas. La fecha en formato AAAA-MM-DD, el CUIT solo si " +
      "se lee con claridad, y el CAE (los 14 dígitos que el papel rotula como CAE o C.A.E.) si está " +
      "impreso."
  );
  return partes.join("\n\n");
}

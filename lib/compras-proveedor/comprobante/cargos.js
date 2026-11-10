// LOS CARGOS DEL PROVEEDOR VAN ADENTRO DEL COSTO DE LA MERCADERÍA.
//
// ── EL CASO (CCU #257, 2026-10-10) ────────────────────────────────────────
//
// "300016 Servicio Logístico · CU 1 · 1.436,27 · Pr.Un.Fin 1.780,32". No es
// mercadería: no se vende, no tiene producto en el catálogo y no entra al
// stock. Pero es plata que sale por esa compra, y la regla de Emanuel del
// 2026-10-08 es que el costo lleva TODO lo de la boleta. Así que el costo final
// del cargo se REPARTE entre los renglones de mercadería, en proporción a su
// costo final.
//
// ── Y LOS ENVASES NO ──────────────────────────────────────────────────────
//
// Las botellas de cambio de Secco a $0,025 siguen como en #163: suman al papel
// y no tocan ningún costo (`envase.js`). Un envase es un cargo simbólico que se
// devuelve; un flete es un gasto de la compra.
//
// ── CÓMO SE REPARTE ───────────────────────────────────────────────────────
//
// En centavos y por renglón, con el resto de redondeo al renglón de mayor costo
// —el mismo criterio que tenía el reparto del pie—: así la suma de las partes
// es exactamente el cargo y el papel sigue cerrando contra su total. Un
// renglón bonificado (costo cero) no carga nada: no hay proporción de cero.
//
// Módulo puro: sin Prisma, sin React y sin red.

import { aCentavos } from "./impuestos.js";
import { TIPO_RENGLON, aQuienAplica, tipoDelRenglon } from "./lector/lecturaInterpretada.js";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** El costo final de un renglón —leído o guardado— en centavos, o null. */
const costoCentavos = (l) => {
  const c = num(l?.costoFinalRenglon ?? l?.costoFinal);
  return c === null ? null : aCentavos(c);
};

/** ¿Este renglón es un cargo del proveedor? Lo dice el modelo en su tipo. */
export function esRenglonDeCargo(linea) {
  return tipoDelRenglon(linea) === TIPO_RENGLON.CARGO;
}

/** ¿Este renglón es un descuento? Lo dice el modelo, o su importe negativo. */
export function esRenglonDeDescuento(linea) {
  return tipoDelRenglon(linea) === TIPO_RENGLON.DESCUENTO;
}

/** El importe impreso de un renglón en centavos, o null. */
const importeCentavos = (l) => {
  const c = num(l?.subtotalImpreso ?? l?.importeImpreso);
  return c === null ? null : aCentavos(c);
};

/**
 * REPARTE UNOS CENTAVOS ENTRE RENGLONES, EN PROPORCIÓN A SU PESO.
 *
 * La cuenta de los cargos y de los descuentos, una sola: en centavos, con el
 * resto de redondeo al renglón de mayor peso, así la suma de las partes es
 * exactamente lo repartido.
 *
 * @param centavos   lo que se reparte (negativo para un descuento)
 * @param renglones  `[{ orden, peso }]`, con peso mayor que cero
 * @param porOrden   Map donde se SUMA la parte de cada renglón
 */
function repartir(centavos, renglones, porOrden) {
  const base = renglones.reduce((a, l) => a + l.peso, 0);
  if (centavos === 0 || base === 0) return;
  let repartido = 0;
  for (const l of renglones) {
    const parte = Math.round((centavos * l.peso) / base);
    porOrden.set(l.orden, (porOrden.get(l.orden) ?? 0) + parte);
    repartido += parte;
  }
  const mayor = renglones.reduce((m, l) => (l.peso > m.peso ? l : m), renglones[0]);
  porOrden.set(mayor.orden, porOrden.get(mayor.orden) + (centavos - repartido));
}

/** Un código o una descripción, para comparar sin mayúsculas, tildes ni espacios de más. */
const clave = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * LO QUE LE TOCA A CADA RENGLÓN DE MERCADERÍA DE LOS DESCUENTOS DE SU PAPEL.
 *
 * ── EL CASO (SL22-5181, 2026-11-10) ───────────────────────────────────────
 *
 * «417 Desc x 24u Pegamentos 2 × −5.000,00»: no es un producto, es un
 * descuento sobre los pegamentos del papel —La Gotita y La Gotita Gel—. Regla
 * de Emanuel: el descuento baja el costo de los productos que nombra, en
 * proporción a su importe; si no nombra ninguno, el de todos los renglones del
 * papel. Se reparte su costo final —el importe con su parte de las
 * percepciones, como dio el lector—, así el papel sigue cerrando contra su
 * total.
 *
 * A quién nombra lo dijo el lector mirando el papel (`aplicaA`, o
 * `descuentoAplicaA` en lo guardado), por código o por descripción. Si ninguno
 * de los nombrados es mercadería de este papel, va a todos: un descuento no se
 * pierde por un nombre mal copiado.
 *
 * @param lineas  todos los renglones del comprobante
 * @returns Map por `orden` → `{ centavos, nombres }`: lo que le toca (negativo)
 *          y de qué descuentos. Vacío si el papel no trae descuentos.
 */
export function descuentosDelPapel(lineas = []) {
  const todas = Array.isArray(lineas) ? lineas : [];
  const porOrden = new Map();
  const descuentos = todas.filter(esRenglonDeDescuento);
  if (!descuentos.length) return porOrden;

  const mercaderia = todas
    .map((l, i) => ({
      orden: l?.orden ?? i + 1,
      codigo: clave(l?.codigoProveedor),
      descripcion: clave(l?.descripcion ?? l?.textoCrudo),
      peso: importeCentavos(l) ?? costoCentavos(l),
      tipo: tipoDelRenglon(l),
    }))
    .filter((l) => l.tipo === TIPO_RENGLON.MERCADERIA && l.peso !== null && l.peso > 0);
  if (!mercaderia.length) return porOrden;

  for (const d of descuentos) {
    const centavos = costoCentavos(d) ?? importeCentavos(d);
    if (!centavos) continue;
    const nombrados = (aQuienAplica(d?.aplicaA ?? d?.descuentoAplicaA) ?? []).map(clave);
    const aplica = mercaderia.filter((l) => nombrados.some((n) => n === l.codigo || n === l.descripcion));
    const partes = new Map();
    repartir(centavos, aplica.length ? aplica : mercaderia, partes);
    const nombre = d?.descripcion ?? d?.textoCrudo ?? "Descuento";
    for (const [orden, parte] of partes) {
      const previo = porOrden.get(orden) ?? { centavos: 0, nombres: [] };
      porOrden.set(orden, { centavos: previo.centavos + parte, nombres: [...previo.nombres, nombre] });
    }
  }
  return porOrden;
}

/**
 * LO QUE LE TOCA A CADA RENGLÓN DE MERCADERÍA DE LOS CARGOS DE SU PAPEL.
 *
 * ── SE LE PASA EL COMPROBANTE ENTERO ──────────────────────────────────────
 *
 * La proporción es sobre el costo de TODA la mercadería del papel: con la mitad
 * de los renglones, a cada uno le tocaría el doble. Quien analiza una sola
 * línea —`aceptar-precio`— igual tiene que traer todas.
 *
 * @param lineas  todos los renglones del comprobante, con `orden`,
 *                `costoFinalRenglon` (o `costoFinal`) y `tipoRenglon` (o `tipo`)
 * @returns Map por `orden` → centavos de cargo de ese renglón. Vacío si el
 *          papel no trae cargos o no tiene mercadería con costo.
 */
export function cargosDelPapel(lineas = []) {
  const todas = Array.isArray(lineas) ? lineas : [];
  const totalCargos = todas
    .filter(esRenglonDeCargo)
    .reduce((a, l) => a + (costoCentavos(l) ?? 0), 0);
  const porOrden = new Map();
  if (totalCargos === 0) return porOrden;

  const mercaderia = todas
    .map((l, i) => ({ orden: l?.orden ?? i + 1, peso: costoCentavos(l), tipo: tipoDelRenglon(l) }))
    .filter((l) => l.tipo === TIPO_RENGLON.MERCADERIA && l.peso !== null && l.peso > 0);
  // El resto de redondeo, al de mayor costo: la suma es exactamente el cargo.
  repartir(totalCargos, mercaderia, porOrden);
  return porOrden;
}

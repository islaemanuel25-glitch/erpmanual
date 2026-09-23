// LO QUE LE TOCA A CADA RENGLÓN DE LOS CONCEPTOS DEL PIE.
//
// ── LA DECISIÓN, QUE ES DE AGOSTO Y NO SE VUELVE A DISCUTIR ───────────────
//
// El costo de un producto es lo que de verdad sale de la caja por él: el neto
// con el IVA, las percepciones, el IIBB y los internos adentro. Quedó decidido
// el 2026-08-11 en `8a9a5f81`, con las dos caras escritas: lo que gana —el
// costo refleja lo que se paga— y lo que resigna —las percepciones son
// recuperables contra la propia obligación fiscal, así que al meterlas en el
// costo el precio de venta las incluye—.
//
// El reparto es EN PROPORCIÓN AL NETO DE CADA RENGLÓN, dentro de su factura, y
// el resto de redondeo va al renglón de mayor neto. No es una elección de
// estilo: es el único reparto que hace que la suma de los renglones cierre
// contra el pie, y si el resto se dejara caer el comprobante "no cerraría" por
// un defecto nuestro y no del proveedor.
//
// ── POR QUÉ ESTE MÓDULO EXISTE, SI EL MOTOR YA ESTABA ─────────────────────
//
// El motor estaba y funciona: `verificarComprobante` calcula el reparto y deja
// en cada renglón su `percepcionLineaCentavos`. Lo que faltaba era que alguien
// lo LEYERA. Medido el 2026-09-23 contra producción:
//
//   · la tarjeta del pedido 246 muestra "Papel $48.532,05 / pack" sobre un
//     bulto de 21, o sea $2.311,05 por unidad, que es el neto por 1,21 — el
//     final con la percepción es $2.368,35;
//   · la ganancia dice "Factura de esos 9: $340.275,12" y el papel factura
//     $348.711,61: la diferencia son exactamente los $8.436,58 de la
//     percepción impresa.
//
// `analizarPrecioDeLinea` nació en `df90262e` —doce horas después de la
// decisión— llamando directo a `finalUnitarioSinPercepcionesCentavos`, y desde
// entonces el precio de cada producto viaja sin los conceptos del pie. No se
// perdió en una tanda: nunca se conectó. El motor de agosto quedó alimentando
// solo al control del total.
//
// ── POR QUÉ SE DEVUELVE UN FACTOR Y NO UN IMPORTE POR UNIDAD ──────────────
//
// Porque la UNIDAD del costo la decide el producto, no el papel: un renglón de
// salame se factura por piezas y se costea por kilo. Un importe "por unidad"
// calculado acá estaría en la unidad del papel y río abajo se sumaría a un
// precio que está en otra.
//
// El factor —cuánto agrega la percepción sobre el neto— no tiene unidad, así
// que sirve igual para los dos casos. Y no es el mismo para todos los
// renglones: el de mayor neto carga el resto de redondeo, y eso queda adentro
// de SU factor.
//
// Módulo puro: sin React, sin Prisma y sin red.

import { verificarComprobante } from "./impuestos";
import { lecturaDesdeLoGuardado } from "./lecturaGuardada";

/** Lo que hace falta traer del comprobante para poder repartir su pie. */
export const QUE_TRAER_PARA_REPARTIR = Object.freeze({
  netoLeido: true,
  ivaLeido: true,
  internoLeido: true,
  totalLeido: true,
  conceptosDelPieLeidos: true,
  recetaUsada: true,
});

/**
 * EL REPARTO DEL PIE DE UNA FACTURA, RENGLÓN POR RENGLÓN.
 *
 * ── SE LE PASA LA FACTURA ENTERA, Y ESO ES LO IMPORTANTE ──────────────────
 *
 * El reparto es proporcional al neto de cada renglón SOBRE EL NETO DE SU
 * FACTURA. Con la mitad de los renglones, el mismo importe del pie se reparte
 * entre menos y a cada uno le toca de más. Por eso quien llame tiene que traer
 * TODAS las líneas del comprobante, aunque esté analizando una sola.
 *
 * Y por eso también el reparto se hace ANTES de concatenar los renglones de
 * varias facturas: cada factura tiene su propio pie y su propio neto, y una
 * percepción del 3 % en una no es la del 2,5 % de la otra.
 *
 * @param comprobante con `lineas` —TODAS— y los campos del pie
 * @returns Map por `orden` de línea → `{ factorSobreNeto, percepcionLineaCentavos,
 *          subtotalCentavos }`. Vacío si el papel no trae conceptos que repartir.
 */
export function repartoDelPie(comprobante) {
  const porOrden = new Map();
  if (!comprobante) return porOrden;

  const lectura = lecturaDesdeLoGuardado(comprobante);
  const lineas = lectura.lineas ?? [];
  if (!lineas.length) return porOrden;

  // El MISMO motor que controla el total. No hay una segunda cuenta: si algún
  // día cambia el criterio del reparto, cambia en un solo lugar y las dos cosas
  // —lo que cierra y lo que cuesta— siguen diciendo lo mismo.
  const v = verificarComprobante({
    lineas,
    pie: lectura.pie,
    receta: comprobante.recetaUsada ?? null,
  });

  (v.lineas ?? []).forEach((l, i) => {
    const orden = lineas[i]?.orden ?? i + 1;
    const sub = l.subtotalCentavos || 0;
    const parte = l.percepcionLineaCentavos || 0;
    porOrden.set(orden, {
      subtotalCentavos: sub,
      percepcionLineaCentavos: parte,
      // Sin neto no hay proporción posible: un renglón en cero no puede cargar
      // percepción, y dividir daría infinito.
      factorSobreNeto: sub > 0 ? parte / sub : 0,
    });
  });

  return porOrden;
}

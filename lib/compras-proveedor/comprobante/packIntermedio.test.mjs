// CUANDO EL PROVEEDOR FACTURA UN PACK QUE ES UNA PARTE DEL BULTO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/packIntermedio.test.mjs
//
// ── EL CASO, DE PRODUCCIÓN ────────────────────────────────────────────────
//
// Recepción de DYSSA #253. El papel dice "(P) GANCIA CERO 473MLX6X4", cantidad
// 8, y DYSSA cobra POR PACK DE 6 latas: $11.775,10 el pack, final con todo. En
// el catálogo el producto es la plancha de 24 a $48.000. La hoja decía "El
// precio bajó 75,5 %", no ofrecía aceptar, y "Entra al stock 8 unidades".
//
// La deducción solo probaba dos lecturas —unidad suelta o bulto— y el cociente
// 48.000 ÷ 11.775,10 = 4,08 no se parece a ninguna. Lo correcto: 8 packs de 6
// son 2 planchas, y la plancha sale 4 × 11.775,10 = 47.100,40, −1,9 %.
//
// Los renglones salen de la boleta real, como la da la lectura interpretada
// (`lecturaInterpretada.fixture.json`), por el camino de la lectura —contrato y
// puerta—, no escritos a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizarLectura } from "@/lib/compras-proveedor/comprobante/lector/contrato";
import { pasarPorLaPuerta } from "@/lib/compras-proveedor/comprobante/lector/puerta";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { unidadesGuardadasDeLaLinea } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import {
  deducirUnidad,
  divisoresDelBulto,
  explicarVeredicto,
  lecturasPosibles,
  UNIDAD,
} from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";
import { cantidadEnEscalaDelPedido } from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { decisionDeCostoSugerida, SITUACION } from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import { laCantidadCuadraConElPrecio } from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";
import { armadoQueDiceElPapel } from "@/lib/compras-proveedor/contenidoDelBulto";

/**
 * La boleta de DYSSA #153 como la devuelve la lectura interpretada (#165):
 * cada renglón con su costo final, todo adentro. Es la misma respuesta que usa
 * `escaladaAlModeloGrande.test.mjs`.
 */
const CRUDA = JSON.parse(fs.readFileSync(new URL("./lecturaInterpretada.fixture.json", import.meta.url), "utf8")).dyssa;
const RECETA_DYSSA = { interpretada: true, explicacion: CRUDA.explicacionFlash, tipoComprobante: "A" };

/** La boleta como queda guardada: el mismo mapeo de columnas que la ruta de leer. */
function boletaGuardada() {
  const lectura = normalizarLectura(CRUDA, { interpretada: true });
  const r = pasarPorLaPuerta({ lectura, receta: RECETA_DYSSA });
  assert.equal(r.cierra, true, r.porque);
  return {
    ...r.aGuardar,
    proveedor: { id: 1, nombre: "Dyssa" },
    lineas: lectura.lineas.map((l, i) => ({
      orden: i + 1,
      textoCrudo: l.descripcion,
      codigoProveedor: l.codigoProveedor,
      cantidad: l.cantidad,
      netoUnitario: l.netoUnitario,
      subtotalImpreso: l.subtotalImpreso,
      internoUnitario: l.internoUnitario,
      bonificacionPct: l.bonificacion ?? null,
      ivaPct: l.alicuotaIva ?? null,
      costoFinalRenglon: l.costoFinal ?? null,
      enQueViene: l.enQueViene ?? null,
      tipoRenglon: l.tipo ?? null,
    })),
  };
}

const GANCIA = 5;
const PRONTO = 4;
const PLANCHA_GANCIA = { id: 70, precio_costo: 48000, factor_pack: 24, unidad_medida: "pack" };

/** El análisis de un renglón de la boleta, contra un producto del catálogo. */
function analizar(orden, producto, extra = {}) {
  const c = boletaGuardada();
  const linea = { ...c.lineas.find((l) => l.orden === orden), ...extra.linea };
  return {
    linea,
    a: analizarPrecioDeLinea({
      linea,
      producto,
      proveedor: c.proveedor,
      unidadesGuardadas: extra.unidadesGuardadas ?? null,
    }),
  };
}

test("GANCIA: 8 packs de 6 son 2 planchas de 24 a $47.100,40, un −1,9 % normal", () => {
  const { a } = analizar(GANCIA, PLANCHA_GANCIA);
  assert.equal(a.precioFinal, 11775.1, "el pack, final con todo");
  assert.equal(a.unidad.unidad, UNIDAD.POR_PRESENTACION);
  assert.equal(a.unidad.unidadesPorFacturada, 6);
  assert.equal(a.unidad.requiereDecision, false);
  assert.equal(a.precioAEscribir, 47100.4, "4 packs por plancha");
  assert.equal(cantidadEnEscalaDelPedido({ cantidad: 8, unidad: a.unidad }), 2);
  assert.ok(Math.abs(a.clasificacion.diferenciaPct - -1.875) < 0.01, `difiere ${a.clasificacion.diferenciaPct}`);
  const sugerida = decisionDeCostoSugerida({ papel: a.precioAEscribir, tuyo: 48000, variacionPct: 10, factorPack: 24 });
  assert.equal(sugerida.situacion, SITUACION.NORMAL, "no es un salto de precio");
  assert.equal(a.unidad.explicacion.frase, "Dyssa lo trae por pack de 6: 8 packs = 2 bultos de 24");
  assert.doesNotMatch(a.unidad.explicacion.frase, /4[,.]08/, "el cociente no se dice");
});

// ── EN LA RECEPCIÓN, LOS PACKS QUE NADIE IMPRIMIÓ NO SON LECTURAS ──────────
//
// Hasta el 2026-11-07 el 6 y el 8 —divisores de la plancha de 24— eran
// lecturas del renglón y se preguntaba entre los dos. La regla de Emanuel de
// ese día —única desde entonces para Corregir, el cierre y la importación—:
// las lecturas son por unidad, por el bulto de la ficha y por lo que dice el
// papel; "nunca un entero cualquiera". Sin el armado del texto ni
// `enQueViene`, gana el bulto (−75,5 %, contra +488,8 % por unidad) y es un
// salto de precio. El pack de 6 llega por el papel, por lo ya confirmado en el
// vínculo (abajo) o por la propuesta de la IA, que cierra con los números
// (`propuestaIa.js`).
test("GANCIA, CONTRAPRUEBA: sin el armado del papel, el 6 y el 8 ya no son lecturas; gana el bulto y es un salto", () => {
  const { a } = analizar(GANCIA, PLANCHA_GANCIA, { linea: { textoCrudo: "GANCIA SIN ALCOHOL", enQueViene: null } });
  assert.equal(a.unidad.unidad, UNIDAD.POR_BULTO);
  assert.deepEqual(a.unidad.posibles, [24, 1], "solo la unidad y el bulto de la ficha");
  assert.match(a.unidad.porque, /por el bulto de 24 \(−75,5 %\); por unidad \(\+488,8 %\)/);
});

test("PRONTO BIT: 4 packs de 6 son UNA plancha de 24", () => {
  const { a } = analizar(PRONTO, { id: 71, precio_costo: 52000, factor_pack: 24, unidad_medida: "pack" });
  assert.equal(a.precioFinal, 13190.5);
  assert.equal(a.unidad.unidadesPorFacturada, 6);
  assert.equal(a.precioAEscribir, 52762);
  assert.equal(cantidadEnEscalaDelPedido({ cantidad: 4, unidad: a.unidad }), 1);
});

test("POR UNIDAD SUELTA Y POR BULTO ENTERO DAN LO MISMO QUE ANTES", () => {
  // El Amargo de la misma boleta: 36 botellas a $4.023,07, bulto de 12.
  const porUnidad = analizar(1, { id: 72, precio_costo: 47000, factor_pack: 12, unidad_medida: "pack" }).a;
  assert.equal(porUnidad.unidad.unidad, UNIDAD.POR_UNIDAD);
  // Al centavo: 12 × 4.023,07 en coma flotante da 48.276,840000000004, igual
  // que con el código de antes, que tampoco redondeaba.
  assert.equal(Math.round(porUnidad.precioAEscribir * 100), 4827684, "12 × 4.023,07");
  assert.equal(cantidadEnEscalaDelPedido({ cantidad: 36, unidad: porUnidad.unidad }), 3);
  // Y el mismo renglón contra un producto que se costea por botella suelta
  // dentro de un bulto de 12, a un precio parecido: por bulto, tal cual.
  const porBulto = analizar(1, { id: 73, precio_costo: 4000, factor_pack: 12, unidad_medida: "unidad" }).a;
  assert.equal(porBulto.unidad.unidad, UNIDAD.POR_BULTO);
  assert.equal(porBulto.precioAEscribir, 4023.07);
});

test("EL PACK DE 2 SIGUE PREGUNTANDO; UNA SUBA POR UNIDAD SE DECIDE SI LE SACA EL TRIPLE AL BULTO", () => {
  // ── ESTE CANDADO CAMBIÓ DE REGLA (2026-11-07) ──────────────────────────
  //
  // Desde la regla única de la menor diferencia, que usan también el cierre y
  // la importación, ningún pack que nadie imprimió entra como lectura.
  const r = deducirUnidad({ costoAnteriorFinal: 1500, precioFacturaFinal: 1000, factorPack: 2 });
  assert.equal(r.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.match(r.porque, /bulto de 2/);
  // Una suba del 25 % por unidad en un bulto de 12: por el bulto −89,6 %, más
  // del triple. Se decide sola.
  const suba = deducirUnidad({ costoAnteriorFinal: 12000, precioFacturaFinal: 1250, factorPack: 12 });
  assert.equal(suba.unidad, UNIDAD.POR_UNIDAD);
  // Con el 30 % el bulto queda a −89,2 %: 2,97 veces, no llega al triple, y se
  // pregunta. (Con la regla vieja, el 35 % de "las dos de siempre" la decidía.)
  const treinta = deducirUnidad({ costoAnteriorFinal: 12000, precioFacturaFinal: 1300, factorPack: 12 });
  assert.equal(treinta.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
});

test("UNA CONVERSIÓN GUARDADA SE APLICA SOLA EN LA BOLETA SIGUIENTE", () => {
  // La boleta siguiente trae el renglón sin el armado en el texto: sola,
  // preguntaría (ver la contraprueba de arriba). Con el vínculo guardado, no.
  const contexto = {
    datos: {
      codigosProveedor: [
        { codigoInterno: "500014792", productoBaseId: PLANCHA_GANCIA.id, unidadesPorPresentacion: 6 },
        // El pack de OTRO producto con el mismo código no dice nada de éste.
        { codigoInterno: "500014792", productoBaseId: 999, unidadesPorPresentacion: 8 },
      ],
    },
  };
  const linea = { codigoProveedor: "500014792", textoCrudo: "GANCIA SIN ALCOHOL" };
  const guardadas = unidadesGuardadasDeLaLinea({ linea, productoBaseId: PLANCHA_GANCIA.id, contexto });
  assert.equal(guardadas, 6);
  const { a } = analizar(GANCIA, PLANCHA_GANCIA, { linea, unidadesGuardadas: guardadas });
  assert.equal(a.unidad.unidad, UNIDAD.POR_PRESENTACION);
  assert.equal(a.unidad.origen, "GUARDADA");
  assert.equal(a.precioAEscribir, 47100.4);
  // Y una guardada que el precio de hoy NO explica no se fuerza.
  const forzada = deducirUnidad({ costoAnteriorFinal: 48000, precioFacturaFinal: 11775.1, factorPack: 24, unidadesGuardadas: 2 });
  assert.notEqual(forzada.origen, "GUARDADA");
});

test("5 PACKS NO COMPLETAN PLANCHAS: se avisa y no se redondea", () => {
  // Sobre la deducción y no sobre un renglón inventado: el pack al mismo precio
  // final que el de la boleta, y 5 en vez de 8.
  const veredicto = deducirUnidad({
    costoAnteriorFinal: 48000, precioFacturaFinal: 11775.1, factorPack: 24, descripcion: "(P) GANCIA CERO 473MLX6X4",
  });
  assert.equal(veredicto.unidadesPorFacturada, 6);
  const lecturas = lecturasPosibles({ cantidad: 5, precioFinal: 11775.1, factorPack: 24, unidadesPorFacturada: 6 });
  assert.equal(cantidadEnEscalaDelPedido({ cantidad: 5, unidad: { ...veredicto, lecturas } }), 1.25);
  const e = explicarVeredicto({ veredicto, cantidad: 5, precioFinal: 11775.1, factorPack: 24, proveedor: "Dyssa" });
  // Una frase simple, con un solo tamaño de pack (Emanuel, 2026-10-26, Pablo
  // #337): antes decía "5 packs de 6 no completan bultos enteros de 24 —nadie
  // compra 1.25 bultos—", y no se entendía.
  assert.equal(e.frase, "El papel dice 30 unidades. No completan packs de 24: cargá cuántas entraron.");
  assert.equal(e.noCompletanPacks, true);
});

test("EL CIERRE ACEPTA LAS 48 LATAS DEL GANCIA, y sigue acusando una escala que no es ninguna", () => {
  const base = { subtotal: 70109.06, cantidad: 8, factorPack: 24 };
  assert.equal(laCantidadCuadraConElPrecio({ ...base, fisicas: 48 }).cuadra, true, "8 packs de 6");
  assert.equal(laCantidadCuadraConElPrecio({ ...base, fisicas: 8 }).cuadra, true, "como siempre: lo mismo que el papel");
  assert.equal(laCantidadCuadraConElPrecio({ ...base, fisicas: 40 }).cuadra, false, "40 no es ningún pack de 24");
});

test("EL ARMADO DEL PAPEL: tamaño de una unidad, y después cuántas por nivel", () => {
  assert.deepEqual(armadoQueDiceElPapel("(P) GANCIA CERO 473MLX6X4"), { porPack: 6, packs: 4, total: 24 });
  assert.deepEqual(armadoQueDiceElPapel("AMARGO OBRERO 19 950MLX12"), { porPack: null, packs: null, total: 12 });
  assert.deepEqual(armadoQueDiceElPapel("HIGIENOL PH HS FRESH 30MTX4X12"), { porPack: 4, packs: 12, total: 48 });
  assert.deepEqual(armadoQueDiceElPapel("BLANCAFLOR HARINA LEUDANTE 1000GRX15"), { porPack: null, packs: null, total: 15 });
  // Sin unidad de medida adelante no se sabe qué es cada número.
  assert.equal(armadoQueDiceElPapel("SUSSEX RC CLASICO MAS BLANCO 50X3X10"), null);
  assert.equal(armadoQueDiceElPapel("MOGUL. OSITOS 12X30G"), null);
  assert.deepEqual(divisoresDelBulto(24), [1, 2, 3, 4, 6, 8, 12, 24]);
});

test("UN PACK QUE NADIE IMPRIMIÓ NO SE ELIGE; EL QUE DICE EL PAPEL ES UNA LECTURA MÁS", () => {
  // ── ESTE CANDADO CAMBIÓ DE REGLA (2026-11-07) ──────────────────────────
  //
  // Afirmaba que el precio elegía solo un pack de 2 del bulto de 20 —que nadie
  // imprimió— y que un "X5" en el papel lo contradecía. Con la regla única las
  // lecturas son por unidad, el bulto y lo que dice el papel, nunca un divisor
  // cualquiera (Colon tinto dulce: no existe un pack de 7).
  const args = { costoAnteriorFinal: 10000, precioFacturaFinal: 1000, factorPack: 20 };
  // Por unidad +100 %, por el bulto −90 %: ninguna gana, se pregunta.
  const sinTexto = deducirUnidad(args);
  assert.equal(sinTexto.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.deepEqual(sinTexto.lecturasCandidatas.map((l) => l.unidadesPorFacturada).sort((a, b) => a - b), [1, 20]);
  // El "X5" del papel entra como lectura: −60 %, y tampoco gana clara.
  const conTexto = deducirUnidad({ ...args, descripcion: "X 473MLX5X4" });
  assert.equal(conTexto.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.ok(conTexto.lecturasCandidatas.some((l) => l.unidadesPorFacturada === 5));
  // Y cuando el pack del papel explica el precio, gana él.
  const gana = deducirUnidad({ ...args, precioFacturaFinal: 2500, descripcion: "X 473MLX5X4" });
  assert.equal(gana.unidadesPorFacturada, 5);
  assert.equal(gana.origen, "CONFIRMADA_POR_EL_PAPEL");
});

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

test("GANCIA, CONTRAPRUEBA: sin el armado del papel, el 6 y el 8 explican el precio y se PREGUNTA con los dos resultados", () => {
  const { a } = analizar(GANCIA, PLANCHA_GANCIA, { linea: { textoCrudo: "GANCIA SIN ALCOHOL" } });
  assert.equal(a.unidad.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.deepEqual(a.unidad.posibles, [6, 8]);
  assert.match(a.unidad.explicacion.frase, /pack de 6: 2 bultos de 24 a \$47\.100,40/);
  assert.match(a.unidad.explicacion.frase, /pack de 8/);
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

test("EL PACK DE 2 SIGUE PREGUNTANDO, y su franja no se movió", () => {
  const r = deducirUnidad({ costoAnteriorFinal: 1500, precioFacturaFinal: 1000, factorPack: 2 });
  assert.equal(r.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.match(r.porque, /bulto de 2/);
  // Y la suba del 30 % por unidad en un bulto de 12 se sigue decidiendo sola,
  // aunque el pack de 2 también caiga adentro del umbral: los packs intermedios
  // solo entran cuando ni la unidad ni el bulto explican el precio.
  const suba = deducirUnidad({ costoAnteriorFinal: 12000, precioFacturaFinal: 1300, factorPack: 12 });
  assert.equal(suba.unidad, UNIDAD.POR_UNIDAD);
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
  assert.match(e.avisoDivision, /no completan bultos enteros de 24/);
  assert.match(e.avisoDivision, /nadie compra 1\.25 bultos/);
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

test("EL PAPEL QUE CONTRADICE AL PRECIO HACE PREGUNTAR", () => {
  // Bulto de 20: el precio deja un solo pack —de 2, cociente 10; el de 4 queda
  // a un 50 %— y el papel dice 5 por pack.
  const args = { costoAnteriorFinal: 10000, precioFacturaFinal: 1000, factorPack: 20 };
  assert.deepEqual(deducirUnidad(args).posibles, [2]);
  const r = deducirUnidad({ ...args, descripcion: "X 473MLX5X4" });
  assert.equal(r.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.match(r.porque, /no coinciden/);
  // Sin el texto, ese único pack se elige.
  assert.equal(deducirUnidad(args).unidadesPorFacturada, 2);
});

// LA IA ENTIENDE LOS RENGLONES DUDOSOS, Y LOS NÚMEROS LA VERIFICAN.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/propuestaIa.test.mjs
//
// ── LA TANDA (Emanuel, 2026-11-07) ───────────────────────────────────────────
//
// Una sola consulta por recepción, solo con los renglones dudosos —sin
// vincular, o vinculados con números que no cierran—, con hasta 8 candidatos
// del motor a la vista. La propuesta se verifica con los números: con el
// producto y el pack propuestos, el precio por unidad del papel tiene que caer
// dentro de la variación del proveedor. Si no, se descarta en silencio. Nunca
// vincula sola: aparece PRIMERA en "Qué producto es", y la elige una persona.
//
// LA IA SIEMPRE SIMULADA: `pedirJsonImpl` es un doble. La red a la IA está
// prohibida en las pruebas (`IA_PROHIBIR_RED`, `salidaEstructurada.js`).
//
// Las filas salen por el camino de la pantalla: `analizarPrecioDeLinea` y
// `filasDeConciliacion`. Los renglones son los de los casos reales (Marlboro
// Fuxi de Mauro, 7UP X 6 y Schneider de Colombres, Brahma que coincide); las
// fichas, con la forma de `cargarContexto`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { cuantoEntroAlAbrir } from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { UNIDAD } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";
import {
  ROTULO_PROPUESTA_IA,
  esRenglonDudoso,
  propuestaParaLaPantalla,
  resultadoDeLaEleccion,
  validarRespuestaIa,
  verificarPropuesta,
} from "@/lib/compras-proveedor/comprobante/propuestaIa";
import { consultarYGuardar, pedidoDeLaRecepcion } from "@/lib/compras-proveedor/comprobante/razonarRenglones";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs.readFileSync(path.join(RAIZ, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── LAS FICHAS, con la forma de `cargarContexto` (`datosPorBase`) ──────────
const ficha = (id, nombre, precio_costo, factor_pack) => ({
  id, nombre, precio_costo, factor_pack, unidad_medida: "pack", modoCompraProveedor: "BULTO",
  modoVentaDeposito: null, pesoReferenciaKg: null, pesoEsFijo: false, pesoPromedioKg: null,
});
const SEVEN_UP = ficha(900, "SEVEN UP LATA 354ML x24", 24000, 24);
const MARLBORO_COMUN = ficha(10, "marlboro 20 comun", 50000, 10);
const SCHNEIDER = ficha(50, "SCHNEIDER 710 X24", 52000, 24);
const LATA_361 = ficha(361, "361 LATA X24", 24500, 24);
const BRAHMA = ficha(77, "BRAHMA 473 X24", 39800, 24);
const FICHAS = [SEVEN_UP, MARLBORO_COMUN, SCHNEIDER, LATA_361, BRAHMA];
const CONTEXTO = {
  datosPorBase: new Map(FICHAS.map((f) => [f.id, f])),
  catalogoNormalizado: FICHAS.map((f) => ({ productoBaseId: f.id, nombre: f.nombre })),
  datos: { productos: FICHAS.map((f) => ({ productoBaseId: f.id, nombre: f.nombre, codigosBarra: [] })), codigosProveedor: [] },
};

/** Un renglón sin vincular, como llega a la hoja. */
function sinVincular({ id, texto, cantidad, unitario, candidatos = [] }) {
  const linea = { orden: id, textoCrudo: texto, cantidad, netoUnitario: unitario, subtotalImpreso: cantidad * unitario, costoFinalRenglon: cantidad * unitario, enQueViene: null };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 80, estado: "CARGADO", lineas: [{ ...linea, id, productoLocalId: null, pedidoDetalleId: null, precio: null, unidad: null, candidatos, origen: candidatos.length ? "UNIVERSO_PROVEEDOR" : "SIN_CANDIDATOS" }] }],
    detalles: [],
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

/** Un renglón vinculado, por el camino de la conciliación. */
function vinculado({ id, texto, cantidad, unitario, producto, packPropuesto = null }) {
  const linea = { orden: id, textoCrudo: texto, cantidad, netoUnitario: unitario, subtotalImpreso: cantidad * unitario, costoFinalRenglon: cantidad * unitario, enQueViene: null };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Colombres" }, packPropuesto });
  const det = { id: 7000 + id, cantidad, unidad: "BULTO", precioCosto: producto.precio_costo, costoMaestroHoy: producto.precio_costo, productoBaseId: producto.id, factorPack: producto.factor_pack, cantidadRecibida: null };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 80, estado: "CARGADO", lineas: [{ ...linea, id, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

const SIETE = () => sinVincular({ id: 1, texto: "3838299291 - 7UP LATA X 6", cantidad: 8, unitario: 5900 });
const FUXI = () => sinVincular({ id: 2, texto: "MARLBORO 20 XL FUXI UVA", cantidad: 10, unitario: 6200 });
const SCHNEIDER_PAPEL = () => sinVincular({ id: 3, texto: "2737378282828 - SCHNEIDER 710 cc x 24", cantidad: 5, unitario: 52500 });
const BRAHMA_QUE_CIERRA = () => vinculado({ id: 4, texto: "35567776655 - Brahma 473 cc x 24", cantidad: 3, unitario: 39800, producto: BRAHMA });

/** La IA simulada: devuelve lo que se le pide y anota con qué la llamaron. */
function iaSimulada(renglones) {
  const llamadas = [];
  const impl = async (pedido) => {
    llamadas.push(pedido);
    return { ok: true, datos: { renglones }, modelo: "simulada", consumo: { tokensEntrada: 0, tokensSalida: 0 } };
  };
  return { impl, llamadas };
}

const hoja = (f) =>
  renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {}, onVincular() {} }))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

/** La fila como la ve la hoja después de consultar: con la propuesta guardada. */
const conPropuesta = (f, guardada, fichaPropuesta) => ({ ...f, propuestaIa: { ...guardada, ficha: fichaPropuesta } });

test("SOLO SE CONSULTAN LOS DUDOSOS: un renglón vinculado que cierra no va a la IA", async () => {
  const brahma = BRAHMA_QUE_CIERRA();
  assert.equal(esRenglonDudoso(brahma), false, "Brahma coincide");
  assert.equal(esRenglonDudoso(SIETE()), true, "sin vincular");
  const { impl, llamadas } = iaSimulada([]);
  const r = await consultarYGuardar({ grupoId: 1, filas: [brahma], contexto: CONTEXTO, pedirJsonImpl: impl, guardar: async () => assert.fail("no hay nada que guardar") });
  assert.deepEqual(r, { ok: true, consultados: 0 });
  assert.equal(llamadas.length, 0, "se consultó a la IA por un renglón que cierra");
});

test("UNA SOLA LLAMADA CON TODOS LOS DUDOSOS JUNTOS, Y CADA UNO CON SUS CANDIDATOS (HASTA 8)", async () => {
  const { impl, llamadas } = iaSimulada([]);
  await consultarYGuardar({ grupoId: 1, filas: [SIETE(), FUXI(), SCHNEIDER_PAPEL(), BRAHMA_QUE_CIERRA()], contexto: CONTEXTO, pedirJsonImpl: impl, guardar: async () => {} });
  assert.equal(llamadas.length, 1);
  const { renglones } = pedidoDeLaRecepcion({ filas: [SIETE(), FUXI(), SCHNEIDER_PAPEL()], contexto: CONTEXTO });
  assert.deepEqual(renglones.map((r) => r.lineaId), [1, 2, 3]);
  for (const r of renglones) assert.ok(r.candidatos.length > 0 && r.candidatos.length <= 8);
  const schneider = renglones.find((r) => r.lineaId === 3);
  assert.ok(schneider.candidatos.some((c) => c.id === 50), "Schneider está entre los candidatos");
  assert.deepEqual(
    Object.keys(schneider.candidatos[0]).sort(),
    ["codigos", "comoViene", "costoPorUnidad", "factorPack", "id", "nombre", "ultimoPrecioPagado"]
  );
  assert.equal(schneider.descripcion, "2737378282828 - SCHNEIDER 710 cc x 24");
  assert.equal(schneider.total, 262500);
  // Lo que se le pide es JSON estructurado, por la puerta única.
  assert.ok(llamadas[0].esquema?.properties?.renglones, "sin esquema de salida");
  assert.match(llamadas[0].instrucciones, /SCHNEIDER 710 cc x 24/);
});

test("7UP X 6: PROPONE SEVEN UP x24 CON PACK 6, CIERRA (−1,7 %), Y APARECE PRIMERA CON SU CUENTA", async () => {
  const guardadas = [];
  const { impl } = iaSimulada([{ lineaId: 1, productoBaseId: 900, unidadesPorPack: 6, motivo: "7UP es Seven Up; X 6 es el pack de 6." }]);
  const r = await consultarYGuardar({ grupoId: 1, filas: [SIETE()], contexto: CONTEXTO, pedirJsonImpl: impl, guardar: async (d) => guardadas.push(...d), variacionNormalPct: 10 });
  assert.equal(r.validas, 1);
  assert.equal(guardadas[0].valida, true);
  assert.equal(guardadas[0].variacionPct, -1.67);
  const f = conPropuesta(SIETE(), guardadas[0], SEVEN_UP);
  const p = propuestaParaLaPantalla({ guardada: f.propuestaIa, fila: f, ficha: SEVEN_UP, variacionNormalPct: 10 });
  assert.equal(p.cuenta, "8 packs de 6 · $983,33 la unidad · tu costo $1.000,00");
  const h = hoja(f);
  const enLaHoja = h.indexOf(`${ROTULO_PROPUESTA_IA} · SEVEN UP LATA 354ML x24`);
  assert.ok(enLaHoja >= 0, "la propuesta no está en «Qué producto es»");
  assert.match(h, /8 packs de 6 · \$983,33 la unidad · tu costo \$1\.000,00/);
  assert.ok(enLaHoja < h.indexOf("Buscar"), "la propuesta tiene que ir primera");
});

test("MARLBORO FUXI UVA: SI PROPONE «marlboro 20 comun» Y EL PRECIO NO CIERRA, SE DESCARTA EN SILENCIO", async () => {
  const guardadas = [];
  const { impl } = iaSimulada([{ lineaId: 2, productoBaseId: 10, unidadesPorPack: 1, motivo: "Marlboro 20" }]);
  await consultarYGuardar({ grupoId: 1, filas: [FUXI()], contexto: CONTEXTO, pedirJsonImpl: impl, guardar: async (d) => guardadas.push(...d), variacionNormalPct: 10 });
  // Se guarda para medir, pero descartada: 6.200 contra 5.000 la unidad, +24 %.
  assert.equal(guardadas[0].valida, false);
  assert.equal(guardadas[0].variacionPct, 24);
  const f = conPropuesta(FUXI(), guardadas[0], MARLBORO_COMUN);
  assert.equal(propuestaParaLaPantalla({ guardada: f.propuestaIa, fila: f, ficha: MARLBORO_COMUN, variacionNormalPct: 10 }), null);
  assert.doesNotMatch(hoja(f), new RegExp(ROTULO_PROPUESTA_IA), "una propuesta que no cierra no se ofrece");
});

test("SCHNEIDER: SI ESTÁ ENTRE LOS CANDIDATOS, LA PROPONE Y CIERRA (2.187,50 contra 2.166,67)", async () => {
  const guardadas = [];
  const { impl } = iaSimulada([{ lineaId: 3, productoBaseId: 50, unidadesPorPack: 24, motivo: "Schneider 710 de a 24." }]);
  await consultarYGuardar({ grupoId: 1, filas: [SCHNEIDER_PAPEL()], contexto: CONTEXTO, pedirJsonImpl: impl, guardar: async (d) => guardadas.push(...d), variacionNormalPct: 10 });
  assert.equal(guardadas[0].productoBaseId, 50);
  assert.equal(guardadas[0].valida, true);
  // Y si propusiera 361, con la misma cuenta, no cerraría: +114 %.
  assert.equal(verificarPropuesta({ fila: SCHNEIDER_PAPEL(), ficha: LATA_361, unidadesPorPack: 24, variacionNormalPct: 10 }).valida, false);
});

test("UN ID QUE NO ES UN CANDIDATO DE ESE RENGLÓN SE TOMA COMO «NINGUNO»", () => {
  const { renglones } = pedidoDeLaRecepcion({ filas: [SIETE()], contexto: CONTEXTO });
  const v = validarRespuestaIa({ renglones: [{ lineaId: 1, productoBaseId: 99999, unidadesPorPack: 6, motivo: "x" }, { lineaId: 55, productoBaseId: 900, unidadesPorPack: 6, motivo: "no se preguntó" }] }, renglones);
  assert.equal(v.get(1).productoBaseId, null);
  assert.equal(v.has(55), false);
});

test("SI LA IA FALLA —ERROR, TIEMPO AGOTADO O JSON QUE NO SIRVE—, TODO SIGUE COMO HOY", async () => {
  for (const impl of [
    async () => ({ ok: false, motivo: "TARDO_DEMASIADO" }),
    async () => ({ ok: false, motivo: "RESPUESTA_ILEGIBLE" }),
    async () => {
      throw new Error("se cortó la red");
    },
    async () => ({ ok: true, datos: { cualquierCosa: true } }),
  ]) {
    let guardo = false;
    const r = await consultarYGuardar({ grupoId: 1, filas: [SIETE()], contexto: CONTEXTO, pedirJsonImpl: impl, guardar: async (d) => (guardo = d.length > 0) });
    assert.equal(guardo, false, "con la IA caída no se guarda nada");
    assert.ok(r.ok === false || r.validas === 0);
  }
  // Y la hoja de un renglón sin propuesta es la de siempre: sin rótulo, sin cartel.
  const h = hoja(SIETE());
  assert.doesNotMatch(h, new RegExp(ROTULO_PROPUESTA_IA));
  assert.doesNotMatch(h, /IA/);
});

test("EL PACK DE UNA PROPUESTA QUE CIERRA SE USA EN «CUÁNTO ENTRÓ», Y DICE DE DÓNDE SALE", () => {
  // "7UP LATA" sin el X 6: el precio deja dos packs —de 6 y de 8— y sin la IA no se sabe.
  const sinIa = vinculado({ id: 5, texto: "7UP LATA", cantidad: 8, unitario: 5900, producto: SEVEN_UP });
  assert.equal(sinIa.unidad.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.equal(esRenglonDudoso(sinIa), true, "pack sin deducir: se consulta");
  const conIa = vinculado({ id: 5, texto: "7UP LATA", cantidad: 8, unitario: 5900, producto: SEVEN_UP, packPropuesto: 6 });
  assert.equal(conIa.unidad.unidad, UNIDAD.POR_PRESENTACION);
  assert.equal(conIa.unidad.unidadesPorFacturada, 6);
  assert.equal(conIa.unidad.origen, "PROPUESTA_IA");
  assert.equal(cuantoEntroAlAbrir(conIa).completos, 2);
  assert.match(hoja(conIa), /la factura dice 8 packs de 6 = 2 bultos de 24/i);
  // Un pack que el precio no explica no se fuerza.
  const forzado = vinculado({ id: 5, texto: "7UP LATA", cantidad: 8, unitario: 5900, producto: SEVEN_UP, packPropuesto: 12 });
  assert.equal(forzado.unidad.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
});

test("LO QUE HACE LA PERSONA SE ANOTA: CONFIRMADA SI ELIGE LO PROPUESTO, OTRO SI NO", () => {
  assert.equal(resultadoDeLaEleccion({ productoBaseId: 900 }, 900), "CONFIRMADA");
  assert.equal(resultadoDeLaEleccion({ productoBaseId: 900 }, 901), "OTRO");
  assert.equal(resultadoDeLaEleccion({ productoBaseId: null }, 901), "OTRO");
  assert.equal(resultadoDeLaEleccion(null, 901), null);
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/vincular/route.js");
  assert.match(ruta, /resultadoDeLaEleccion\(propuestaIa, productoBaseId\)/);
  assert.match(ruta, /tx\.propuestaIaRenglon\.update\(/);
});

test("SE CONSULTA AL TERMINAR DE LEER, SIN HACER ESPERAR A LA PANTALLA, POR LA PUERTA ÚNICA DE LA IA", () => {
  const leer = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(leer, /void razonarRenglonesDudosos\(prisma, \{/);
  assert.doesNotMatch(leer, /await razonarRenglonesDudosos/);
  const razonar = codigoDe("lib/compras-proveedor/comprobante/razonarRenglones.js");
  assert.match(razonar, /import \{ pedirJson \} from "@\/lib\/ia\/salidaEstructurada";/);
  assert.doesNotMatch(razonar, /generativelanguage|GEMINI_API_KEY/, "otra llamada a Gemini al lado de la puerta única");
});

test("NUNCA VINCULA SOLA: la propuesta solo se ofrece; el vínculo lo hace el toque, por `elegir`", () => {
  const h = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(h, /onClick=\{\(\) => elegir\(propuesta\.productoBaseId\)\}/);
  const razonar = codigoDe("lib/compras-proveedor/comprobante/razonarRenglones.js");
  assert.doesNotMatch(razonar, /comprobanteLinea\.update|productoLocalId:/, "la consulta no puede vincular");
});

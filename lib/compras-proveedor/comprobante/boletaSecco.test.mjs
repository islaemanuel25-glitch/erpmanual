// LA BOLETA DE SECCO: PRECIO CON IVA INCLUIDO, BONIFICACIÓN POR RENGLÓN Y
// ENVASES A CENTAVOS. Tiene que cerrar.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/boletaSecco.test.mjs
//
// ── EL CASO (Emanuel, producción, 2026-10-10) ────────────────────────────
//
// Recepción "Secco #256 · Llegó sin pedido". Secco no tiene receta. La
// pantalla decía "Lo leyó también el lector grande y tampoco cierra. Ninguna
// línea trajo cantidad y precio." sobre un papel cuyos diez renglones suman el
// total al centavo.
//
// ── LA CAUSA, REPRODUCIDA ACÁ ────────────────────────────────────────────
//
// El esquema del modelo grande ofrece `totalImpreso` —"el importe FINAL del
// renglón, ya con IVA adentro"— y la columna del papel se llama Total. Un papel
// que no discrimina IVA no tiene otro importe, así que va ahí, y `netoUnitario`
// y `subtotalImpreso` —descriptos "sin impuestos"— quedan vacíos. Cada renglón
// queda con la cantidad sola y la puerta contesta exactamente el texto de
// producción. Las otras dos sospechas se descartan ejecutando: la tolerancia
// por renglón ya aceptaba estos diez, y "IVA ya incluido" ya existía y cierra.
//
// La respuesta cruda del modelo grande en producción no se guarda en ningún
// lado, así que la forma de Google de acá es la que REPRODUCE el texto, no una
// copia de aquella. Se dice para que nadie la lea como volcada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { crearLectorGemini, armarInterpretes } from "./lector/gemini.js";
import { leerConCadena } from "./lector/cadena.js";
import { pasarPorLaPuerta, verificarCoherenciaDeLineas } from "./lector/puerta.js";
import { normalizarLectura } from "./lector/contrato.js";
import {
  escalarAlModeloGrande,
  ESCALADA,
  recetaDeLaPropuesta,
  verificarLaInterpretacion,
  losRenglonesArmanElTotal,
} from "./lector/escalada.js";
import { repartoDelPie } from "./repartoDelPie.js";
import { analizarPrecioDeLinea } from "./precioDeLinea.js";
import { analizarLineas } from "./analisisDeComprobante.js";
import { filasDeConciliacion } from "./filasDeConciliacion.js";
import { esRenglonDeEnvase } from "./envase.js";
import { verificarComprobante } from "./impuestos.js";
import {
  ESTADO_LINEA,
  FILTRO,
  estadoDeLinea,
  pasaFiltro,
  pideRevision,
  rotuloDelEstado,
} from "../estadoDeLineaFacturada.js";
import { resumenDelCierre, recibidosDelCierre } from "../cierreDeRecepcion.js";
import { loQueHayQueSembrar } from "../pedidoDesdeFactura.js";
import { gananciaDelDeposito } from "../gananciaDelDeposito.js";

const { _origen, ...PAPEL } = JSON.parse(
  fs.readFileSync(new URL("./boletaSecco.fixture.json", import.meta.url), "utf8")
);
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];
const PIE = PAPEL.pie;
const comunes = { identidad: { fecha: "2026-10-09" }, lineasEnElPapel: 10, hayTotalImpreso: true, pie: PIE };

/** Lo que devuelve Flash con el esquema de todos los días: el Total, como importe. */
const FLASH = {
  ...comunes,
  lineas: PAPEL.lineas.map((l) => ({
    codigoProveedor: l.codigoProveedor, cantidad: l.cantidad, descripcion: l.descripcion,
    netoUnitario: l.precio, bonificacion: l.bonificacion ?? 0, subtotalImpreso: l.total,
  })),
};
const SIN_IVA = { dondeVieneElIva: "YA_INCLUIDO", percepciones: [] };
/** El modelo grande con el importe en `totalImpreso`: reproduce el texto de producción. */
const PRO_EN_TOTAL = {
  ...comunes,
  lineas: PAPEL.lineas.map((l) => ({
    codigoProveedor: l.codigoProveedor, cantidad: l.cantidad, descripcion: l.descripcion,
    bonificacion: l.bonificacion ?? 0, internoImpreso: 0, totalImpreso: l.total,
  })),
  recetaPropuesta: SIN_IVA,
};
/** Y el que lee como pide el prompt nuevo: precio y subtotal donde van. */
const PRO_BIEN = { ...FLASH, recetaPropuesta: SIN_IVA };

const respuestaDeGoogle = (json) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(json) }] } }],
    usageMetadata: { promptTokenCount: 2400, candidatesTokenCount: 1800, thoughtsTokenCount: 900 },
  }),
});

async function leer(pro) {
  const lector = crearLectorGemini({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => respuestaDeGoogle(FLASH) });
  const resultado = await leerConCadena({ cadena: { titular: { ok: true, lector }, respaldo: null }, archivos: FOTO, receta: null });
  const interpretes = armarInterpretes({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => respuestaDeGoogle(pro) });
  const escalada = await escalarAlModeloGrande({
    resultado, receta: null, esGenerica: true, interpretes, archivos: FOTO, proveedorNombre: "Secco",
  });
  return { resultado, escalada };
}

/** El comprobante como lo guarda la ruta de leer, con el mapeo de columnas de siempre. */
function guardado(escalada) {
  const p = pasarPorLaPuerta({ lectura: escalada.lectura, receta: escalada.receta });
  return {
    ...p.aGuardar,
    recetaUsada: escalada.receta,
    proveedor: { id: 9, nombre: "Secco" },
    lineas: escalada.lectura.lineas.map((l, i) => ({
      id: 700 + i, orden: i + 1, textoCrudo: l.descripcion, codigoProveedor: l.codigoProveedor,
      cantidad: l.cantidad, netoUnitario: l.netoUnitario, subtotalImpreso: l.subtotalImpreso,
      subtotalCorregido: null, internoUnitario: l.internoUnitario, pesoKg: l.peso ?? null,
      bonificacionPct: l.bonificacion ?? null, ivaPct: l.alicuotaIva ?? null,
      productoLocalId: null, pedidoDetalleId: null, unidadElegida: null,
    })),
  };
}

// ── LA CAUSA ─────────────────────────────────────────────────────────────

test("FLASH, SIN RECETA, LE SUMA UN 21 % QUE NO EXISTE: no cierra y escala", async () => {
  const { resultado, escalada } = await leer(PRO_BIEN);
  const puerta = pasarPorLaPuerta({ lectura: resultado.lectura, receta: null });
  assert.equal(puerta.cierra, false);
  // "No cierra por $193.732,11": el 21 % de la suma.
  assert.equal(puerta.diferenciaCentavos, 19373211);
  assert.equal(escalada.motivo, ESCALADA.NO_CIERRA);
});

test("CAUSA: con el importe en `totalImpreso` la puerta dice el texto de producción", () => {
  const { recetaPropuesta, ...cruda } = PRO_EN_TOTAL;
  const lectura = normalizarLectura(cruda);
  const { receta } = recetaDeLaPropuesta(recetaPropuesta, lectura);
  const v = verificarLaInterpretacion({ lectura, receta });
  assert.equal(v.cierra, false);
  assert.equal(v.porque, "Ninguna línea trajo cantidad y precio.");
});

// ── EL ARREGLO ───────────────────────────────────────────────────────────

for (const [nombre, pro] of [["con el importe en totalImpreso", PRO_EN_TOTAL], ["leída como pide el prompt", PRO_BIEN]]) {
  test(`CIERRA A 922.533,84 CON IVA INCLUIDO, ${nombre}, y la receta queda para confirmar`, async () => {
    const { escalada } = await leer(pro);
    assert.equal(escalada.cerro, true, escalada.texto);
    assert.equal(Number(escalada.receta.alicuotaIvaPct), 0);
    assert.deepEqual(escalada.receta.percepciones, []);
    // Secco no tiene receta: lo que cerró queda pendiente en Recetas de facturas.
    assert.equal(escalada.propuesta?.dondeVieneElIva, "YA_INCLUIDO");
    const puerta = pasarPorLaPuerta({ lectura: escalada.lectura, receta: escalada.receta });
    assert.equal(puerta.cierra, true);
    assert.equal(puerta.diferenciaCentavos, 0);
    assert.equal(losRenglonesArmanElTotal(puerta.verificacion).diferenciaCentavos, 0);
  });
}

test("CON OTRA RECETA, LA MISMA RESPUESTA NO CIERRA: el arreglo es del IVA incluido", async () => {
  const { escalada } = await leer({ ...PRO_EN_TOTAL, recetaPropuesta: { dondeVieneElIva: "AL_PIE", alicuotaIvaPct: 21, percepciones: [] } });
  assert.equal(escalada.cerro, false);
});

test("COSTO DEL SECCO LIMA LIMÓN: 93.961,90 ÷ 10 = 9.396,19 por pack, ya final", async () => {
  const { escalada } = await leer(PRO_EN_TOTAL);
  const c = guardado(escalada);
  const reparto = repartoDelPie(c);
  const a = analizarPrecioDeLinea({
    linea: c.lineas[0],
    producto: { id: 1, nombre: "Secco Lima Limón 3 L x 6", factor_pack: 1, precio_costo: 9000, unidad_medida: "unidad" },
    receta: c.recetaUsada,
    percepcionDeLaLinea: reparto.get(1),
  });
  assert.equal(a.precioFinal, 9396.19);
});

// ── LOS ENVASES ──────────────────────────────────────────────────────────

/** Secco recién llegado: sin vínculos ni productos, con la forma de `cargarContexto`. */
const contexto = {
  datos: {
    codigosProveedor: [], productos: [], lecturasRecordadas: new Map(), productosQueNoSeCambian: new Set(),
  },
  catalogo: [], catalogoNormalizado: [], nombrePorBase: new Map(), datosPorBase: new Map(), decisionPorBase: new Map(),
};

test("LOS DOS ENVASES NO PIDEN PRODUCTO, NO ENTRAN AL STOCK NI TOCAN COSTO", async () => {
  const { escalada } = await leer(PRO_EN_TOTAL);
  const c = guardado(escalada);
  const analizadas = analizarLineas({ comprobante: c, contexto, detallesPlanos: [] });
  const envases = analizadas.filter((l) => l.envase === true);
  assert.deepEqual(envases.map((l) => l.codigoProveedor), ["795", "114"]);
  for (const l of envases) {
    assert.equal(l.productoBaseId, null);
    assert.equal(l.precio, null, "un envase no propone costo");
    assert.deepEqual(l.candidatos, []);
  }

  const { grupos } = filasDeConciliacion({ comprobantes: [{ ...c, lineas: analizadas }], detalles: [] });
  const filas = grupos.flatMap((g) => g.filas);
  const [botella] = filas.filter((f) => f.envase);
  assert.equal(estadoDeLinea(botella), ESTADO_LINEA.ENVASE);
  assert.equal(rotuloDelEstado(botella), "Envase");
  assert.equal(pideRevision(botella), false);
  assert.equal(pasaFiltro(botella, FILTRO.REVISAR), false);
  assert.equal(pasaFiltro(botella, FILTRO.SIN_VINCULAR), false);

  // El cierre no los cuenta ni los manda: sin línea de pedido no hay stock.
  const resumen = resumenDelCierre({ filas });
  assert.equal(resumen.renglones, 8);
  assert.equal(resumen.sinVincular, 8, "los ocho productos, no las botellas");
  assert.equal(Object.keys(recibidosDelCierre({ filas })).length, 0);
  // "Llegó sin pedido": no se siembran y no figuran como sin producto.
  assert.equal(loQueHayQueSembrar({ filas: analizadas }).sinProducto, 8);
  assert.equal(gananciaDelDeposito(filas).total, 8);
});

test("ENVASE ES UN CARGO SIMBÓLICO: menos de un peso, y no cero", () => {
  assert.equal(esRenglonDeEnvase({ cantidad: 6, netoUnitario: 0.025, subtotalImpreso: 0.15 }), true);
  // Sin precio impreso, el que se despeja: 0,44 ÷ 18.
  assert.equal(esRenglonDeEnvase({ cantidad: 18, subtotalImpreso: 0.44 }), true);
  // CONTRAPRUEBAS: un peso y medio es mercadería; cero es un regalo, no un envase.
  assert.equal(esRenglonDeEnvase({ cantidad: 6, netoUnitario: 1.5, subtotalImpreso: 9 }), false);
  assert.equal(esRenglonDeEnvase({ cantidad: 6, netoUnitario: 0, subtotalImpreso: 0 }), false);
  assert.equal(esRenglonDeEnvase({ cantidad: 6 }), false);
});

// ── LA TOLERANCIA POR RENGLÓN ────────────────────────────────────────────

test("LA TOLERANCIA ACEPTA 175.485,82 CONTRA 175.485,84 Y RECHAZA UN PRECIO MAL LEÍDO", () => {
  const lineas = normalizarLectura(FLASH).lineas;
  assert.deepEqual(verificarCoherenciaDeLineas(lineas).incoherentes, []);
  // Con el precio entero —como multiplica el proveedor— el Baggio da a dos
  // centavos. Redondeando antes el precio a centavos daba 22: esto lo prueba.
  const baggio = lineas[6];
  assert.deepEqual(verificarCoherenciaDeLineas([baggio], 2).incoherentes, []);

  const mal = lineas.map((l, i) => (i === 6 ? { ...l, netoUnitario: 1642.382 } : l));
  const r = verificarCoherenciaDeLineas(mal).incoherentes;
  assert.equal(r.length, 1);
  assert.equal(r[0].linea, 7);
});

// ── EL DESCUENTO GLOBAL DEL PIE ──────────────────────────────────────────

test("DESCUENTO GLOBAL EN CERO NO CAMBIA NADA", () => {
  const { recetaPropuesta, ...cruda } = PRO_BIEN;
  const lectura = normalizarLectura(cruda);
  const { receta } = recetaDeLaPropuesta(recetaPropuesta, lectura);
  const con = verificarComprobante({ lineas: lectura.lineas, pie: lectura.pie, receta });
  const sin = verificarComprobante({ lineas: lectura.lineas, pie: { ...lectura.pie, conceptos: [] }, receta });
  assert.deepEqual(con.lineas.map((l) => l.finalUnitarioCentavos), sin.lineas.map((l) => l.finalUnitarioCentavos));
});

test("UNO DISTINTO DE CERO SE REPARTE POR IMPORTE, Y LOS COSTOS ARMAN EL TOTAL", () => {
  const { recetaPropuesta, ...cruda } = PRO_BIEN;
  const conDescuento = normalizarLectura({
    ...cruda,
    pie: { total: 912533.84, conceptos: [{ nombre: "DESCUENTO GLOBAL", importe: 10000, resta: true }] },
  });
  const { receta } = recetaDeLaPropuesta(recetaPropuesta, conDescuento);
  const v = verificarLaInterpretacion({ lectura: conDescuento, receta });
  assert.equal(v.cierra, true, v.porque);
  const lineas = v.puerta.verificacion.lineas;
  const repartido = lineas.reduce((a, l) => a + l.percepcionLineaCentavos, 0);
  assert.equal(repartido, -1000000, "el descuento entero, ni un centavo más");
  // Proporcional: el Lima Limón es el 10,19 % del papel.
  assert.ok(Math.abs(lineas[0].percepcionLineaCentavos - Math.round((-1000000 * 9396190) / 92253384)) <= 1);
  // Y su costo baja en esa parte: (93.961,90 − 1.018,52) ÷ 10.
  assert.equal(lineas[0].finalUnitarioCentavos, Math.round((9396190 + lineas[0].percepcionLineaCentavos) / 10));
});

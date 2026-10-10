// LA BOLETA DE SECCO: PRECIO CON IVA INCLUIDO, BONIFICACIÓN POR RENGLÓN Y
// ENVASES A CENTAVOS. Tiene que cerrar, sin receta previa.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/boletaSecco.test.mjs
//
// ── EL CASO (Emanuel, producción, 2026-10-10) ────────────────────────────
//
// Recepción "Secco #256 · Llegó sin pedido", comprobante 23. Flash leyó los
// diez renglones BIEN —suman el total al centavo— y la receta genérica les
// sumó un 21 % que no existe: "No cierra por $193.732,11". El grande tampoco
// cerró: el esquema lo obligaba a separar "sin impuestos" de "con IVA" en un
// papel que no discrimina IVA.
//
// ── LO QUE CAMBIÓ ────────────────────────────────────────────────────────
//
// El modelo devuelve el COSTO FINAL de cada renglón y el código solo controla
// que la suma dé el total. Secco no tiene receta: lee el grande, cierra, y su
// explicación queda pendiente en Recetas de facturas.
//
// Las respuestas son las de `lecturaInterpretada.fixture.json`, con la forma
// que devuelve el lector; NO están medidas contra el modelo (ver su `_origen`).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { crearLectorGemini, armarInterpretes } from "./lector/gemini.js";
import { leerConCadena } from "./lector/cadena.js";
import { pasarPorLaPuerta, verificarCoherenciaDeLineas, ESTADO } from "./lector/puerta.js";
import { normalizarLectura } from "./lector/contrato.js";
import { escalarAlModeloGrande, ESCALADA } from "./lector/escalada.js";
import { verificarLecturaInterpretada } from "./lector/lecturaInterpretada.js";
import { analizarPrecioDeLinea } from "./precioDeLinea.js";
import { analizarLineas } from "./analisisDeComprobante.js";
import { filasDeConciliacion } from "./filasDeConciliacion.js";
import { esRenglonDeEnvase } from "./envase.js";
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

const { secco: SECCO } = JSON.parse(
  fs.readFileSync(new URL("./lecturaInterpretada.fixture.json", import.meta.url), "utf8")
);
const { _origen, ...PAPEL } = JSON.parse(
  fs.readFileSync(new URL("./boletaSecco.fixture.json", import.meta.url), "utf8")
);
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];

/** Lo que contesta el grande sobre Secco, sin receta. */
const PRO = {
  identidad: SECCO.identidad, lineasEnElPapel: SECCO.lineasEnElPapel, hayTotalImpreso: SECCO.hayTotalImpreso,
  pie: SECCO.pie, lineas: SECCO.lineas, explicacion: SECCO.explicacionPro,
};

const respuestaDeGoogle = (json) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(json) }] } }],
    usageMetadata: { promptTokenCount: 2400, candidatesTokenCount: 1800, thoughtsTokenCount: 900 },
  }),
});

/** Secco sin receta: como hace la ruta, no lee Flash y lee el grande. */
async function leer(pro = PRO) {
  const interpretes = armarInterpretes({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => respuestaDeGoogle(pro) });
  const resultado = { ok: false, motivo: null, lector: null, intentos: [], usoRespaldo: false, porQuePaso: null };
  return escalarAlModeloGrande({
    resultado, receta: null, sinExplicacion: true, interpretes, archivos: FOTO, proveedorNombre: "Secco",
  });
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
      costoFinalRenglon: l.costoFinal ?? null, enQueViene: l.enQueViene ?? null, tipoRenglon: l.tipo ?? null,
      productoLocalId: null, pedidoDetalleId: null, unidadElegida: null,
    })),
  };
}

// ── CIERRA SIN RECETA ────────────────────────────────────────────────────

test("SECCO SIN RECETA: lee el grande y CIERRA a 922.533,84, sin sumarle ningún 21 %", async () => {
  const escalada = await leer();
  assert.equal(escalada.motivo, ESCALADA.SIN_RECETA);
  assert.equal(escalada.cerro, true, escalada.texto);
  const puerta = pasarPorLaPuerta({ lectura: escalada.lectura, receta: escalada.receta });
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.diferenciaCentavos, 0);
  assert.equal(puerta.aGuardar.totalLeido, 922533.84);
});

test("Y SU EXPLICACIÓN QUEDA PENDIENTE para confirmar en Recetas de facturas", async () => {
  const escalada = await leer();
  assert.deepEqual(escalada.propuesta, { explicacion: SECCO.explicacionPro });
  assert.match(escalada.texto, /para confirmar en Recetas de facturas/);
  // Y la lectura la guarda con el comprobante.
  const puerta = pasarPorLaPuerta({ lectura: escalada.lectura, receta: escalada.receta });
  assert.equal(puerta.aGuardar.explicacionLeida, SECCO.explicacionPro);
});

test("COSTO DEL SECCO LIMA LIMÓN: 93.961,90 ÷ 10 = 9.396,19 por pack, ya final", async () => {
  const c = guardado(await leer());
  const a = analizarPrecioDeLinea({
    linea: c.lineas[0],
    producto: { id: 1, nombre: "Secco Lima Limón 3 L x 6", factor_pack: 1, precio_costo: 9000, unidad_medida: "unidad" },
    receta: c.recetaUsada,
  });
  assert.equal(a.precioFinal, 9396.19);
});

test("LOS COSTOS FINALES DE LA RESPUESTA SON LOS TOTAL DEL PAPEL, renglón por renglón", () => {
  // La respuesta del fixture se armó con el papel transcripto: si alguien
  // cambia uno de los dos, este candado lo dice.
  assert.deepEqual(SECCO.lineas.map((l) => l.costoFinal), PAPEL.lineas.map((l) => l.total));
  assert.equal(SECCO.pie.total, PAPEL.pie.total);
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
  const c = guardado(await leer());
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

  const resumen = resumenDelCierre({ filas });
  assert.equal(resumen.renglones, 8);
  assert.equal(resumen.sinVincular, 8, "los ocho productos, no las botellas");
  assert.equal(Object.keys(recibidosDelCierre({ filas })).length, 0);
  assert.equal(loQueHayQueSembrar({ filas: analizadas }).sinProducto, 8);
  assert.equal(gananciaDelDeposito(filas).total, 8);
});

test("EN LA LECTURA INTERPRETADA, QUÉ ES ENVASE LO DICE EL MODELO, NO EL PRECIO", () => {
  assert.equal(esRenglonDeEnvase({ tipoRenglon: "ENVASE", cantidad: 6, netoUnitario: 1500 }), true);
  assert.equal(esRenglonDeEnvase({ tipoRenglon: "MERCADERIA", cantidad: 6, netoUnitario: 0.025 }), false);
  // Las lecturas de antes no traen tipo: siguen con la regla del precio.
  assert.equal(esRenglonDeEnvase({ cantidad: 6, netoUnitario: 0.025, subtotalImpreso: 0.15 }), true);
  assert.equal(esRenglonDeEnvase({ cantidad: 18, subtotalImpreso: 0.44 }), true);
  assert.equal(esRenglonDeEnvase({ cantidad: 6, netoUnitario: 1.5, subtotalImpreso: 9 }), false);
  assert.equal(esRenglonDeEnvase({ cantidad: 6, netoUnitario: 0, subtotalImpreso: 0 }), false);
  assert.equal(esRenglonDeEnvase({ cantidad: 6 }), false);
});

test("LOS ENVASES SUMAN AL PAPEL: sin sus 59 centavos, la suma no da el total", () => {
  const lectura = normalizarLectura(PRO, { interpretada: true });
  assert.equal(verificarLecturaInterpretada(lectura).diferenciaCentavos, 0);
  const sinEnvases = { ...lectura, lineas: lectura.lineas.filter((l) => l.tipo !== "ENVASE") };
  assert.equal(verificarLecturaInterpretada(sinEnvases).diferenciaCentavos, -59);
});

// ── EL DESCUENTO GLOBAL DEL PIE ──────────────────────────────────────────

test("UN DESCUENTO GLOBAL VA ADENTRO DE LOS COSTOS FINALES: si el modelo no lo reparte, no cierra", () => {
  // Con 10.000 de descuento el papel dice 912.533,84. Lo reparte el modelo,
  // que lee el papel; el código solo mira que la suma dé.
  const total = 912533.84;
  const sinRepartir = normalizarLectura({ ...PRO, pie: { total } }, { interpretada: true });
  const v = verificarLecturaInterpretada(sinRepartir);
  assert.equal(v.cierra, false);
  assert.equal(v.diferenciaCentavos, 1000000);

  // Repartido por importe —el Lima Limón carga el 10,19 %— y el resto al mayor.
  const suma = PRO.lineas.reduce((a, l) => a + Math.round(l.costoFinal * 100), 0);
  let repartido = 0;
  const lineas = PRO.lineas.map((l) => {
    const parte = Math.round((1000000 * Math.round(l.costoFinal * 100)) / suma);
    repartido += parte;
    return { ...l, costoFinal: (Math.round(l.costoFinal * 100) - parte) / 100 };
  });
  const mayor = lineas.reduce((m, l, i) => (l.costoFinal > lineas[m].costoFinal ? i : m), 0);
  lineas[mayor] = { ...lineas[mayor], costoFinal: Math.round(lineas[mayor].costoFinal * 100 - (1000000 - repartido)) / 100 };
  const repartida = normalizarLectura({ ...PRO, pie: { total }, lineas }, { interpretada: true });
  assert.equal(verificarLecturaInterpretada(repartida).cierra, true);
});

// ── LAS LECTURAS DE ANTES ────────────────────────────────────────────────

test("LA TOLERANCIA POR RENGLÓN DE LAS LECTURAS DE ANTES SIGUE: acepta 175.485,82 y rechaza un precio mal leído", () => {
  // Las lecturas guardadas antes de esta tanda se siguen verificando con su
  // regla hasta que se borre el código de formato (segunda tanda).
  const lineas = normalizarLectura({
    lineasEnElPapel: 10, hayTotalImpreso: true, pie: PAPEL.pie,
    lineas: PAPEL.lineas.map((l) => ({
      codigoProveedor: l.codigoProveedor, cantidad: l.cantidad, descripcion: l.descripcion,
      netoUnitario: l.precio, bonificacion: l.bonificacion ?? 0, subtotalImpreso: l.total,
    })),
  }).lineas;
  assert.deepEqual(verificarCoherenciaDeLineas(lineas).incoherentes, []);
  const mal = lineas.map((l, i) => (i === 6 ? { ...l, netoUnitario: 1642.382 } : l));
  const r = verificarCoherenciaDeLineas(mal).incoherentes;
  assert.equal(r.length, 1);
  assert.equal(r[0].linea, 7);
});

test("FLASH CON LA EXPLICACIÓN CONFIRMADA LEE SECCO Y CIERRA, sin llamar al grande", async () => {
  const flash = { ...PRO, explicacion: SECCO.explicacionFlash };
  const lector = crearLectorGemini({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => respuestaDeGoogle(flash) });
  const receta = { explicacion: SECCO.explicacionFlash };
  const resultado = await leerConCadena({ cadena: { titular: { ok: true, lector }, respaldo: null }, archivos: FOTO, receta });
  let llamadas = 0;
  const interpretes = armarInterpretes({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => { llamadas += 1; return respuestaDeGoogle(PRO); } });
  const escalada = await escalarAlModeloGrande({ resultado, receta, recetaVersion: 1, interpretes, archivos: FOTO });
  assert.equal(escalada.motivo, null);
  assert.equal(llamadas, 0);
  const puerta = pasarPorLaPuerta({ lectura: resultado.lectura, receta: { interpretada: true, ...receta }, recetaVersion: 1 });
  assert.equal(puerta.estado, ESTADO.CARGADO);
});

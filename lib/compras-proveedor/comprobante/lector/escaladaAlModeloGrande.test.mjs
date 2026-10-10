// EL PAPEL LO INTERPRETA EL MODELO; LA CUENTA LA CONTROLA EL CÓDIGO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/escaladaAlModeloGrande.test.mjs
//
// ── LO QUE SE PIDIÓ (Emanuel, 2026-10-10) ─────────────────────────────────
//
// Dejar de interpretar el papel con reglas de formato. El modelo devuelve cada
// renglón con su COSTO FINAL —todo adentro según ESE papel— y una explicación
// en criollo; el código controla que la suma dé el total impreso, que la
// mercadería traiga cantidad y costo, y el conteo de renglones.
//
//   · Proveedor con explicación confirmada → lee Flash, guiado por ella.
//   · Sin explicación, Flash que no cierra, que trae de menos o que no
//     contestó → el grande, una vez (titular, y el respaldo si no contestó).
//   · La explicación del grande en una lectura que cierra queda como receta
//     pendiente en Recetas de facturas.
//
// ── DE DÓNDE SALEN LOS DATOS ──────────────────────────────────────────────
//
// Los papeles son los de `lecturaInterpretada.fixture.json` —DYSSA de #153,
// Das #255, Secco #256— y la planilla de Mauro de `sinTotal.test.mjs`. Cada
// uno con dos respuestas: Flash con la explicación confirmada, y el grande sin
// receta, que es el camino de verdad de un proveedor nuevo. NO son respuestas
// medidas: desde la nube no hay clave. Lo que se prueba es qué hace el código
// con ellas. Viajan con la forma de `generateContent` por los lectores de
// verdad, `crearLectorGemini` y `armarInterpretes`, con un `fetch` de mentira.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { crearLectorGemini, armarInterpretes, esAliasMovil, verificarModelosPro } from "./gemini.js";
import { leerConCadena, MOTIVOS_QUE_PASAN_EN_LA_ESCALADA } from "./cadena.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { MOTIVO_LECTURA } from "./contrato.js";
import { esquemaInterpretado } from "./lecturaInterpretada.js";
import { escalarAlModeloGrande, motivoDeEscalada, ESCALADA } from "./escalada.js";
import { analizarPrecioDeLinea } from "../precioDeLinea.js";
import { tipoDePapel } from "../explicacionPorTipo.js";
import { lecturaDesdeLoGuardado } from "../lecturaGuardada.js";
import { decisionDeCostoSugerida, SITUACION } from "../../decisionDeCostoSugerida.js";
import { papelQueNoCierra } from "../../cierreDeRecepcion.js";

const { _origen, ...PAPELES } = JSON.parse(
  fs.readFileSync(new URL("../lecturaInterpretada.fixture.json", import.meta.url), "utf8")
);
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];
const ENV = { GEMINI_API_KEY: "x" };
const TITULAR = "gemini-3.1-pro-preview";
const RESPALDO = "gemini-2.5-pro";

/** Los nueve costos de #153, en el orden del papel. `null` = bonificado. */
const COSTO_ESPERADO = [4023.07, 1739.84, 1539.13, 13190.5, 11775.1, 1784.84, 13358.21, 13358.21, null];

/** La respuesta del modelo para un papel: Flash o el grande, por su explicación. */
function respuesta(papel, quien, cambios = {}) {
  const p = PAPELES[papel];
  return {
    identidad: p.identidad,
    lineasEnElPapel: p.lineasEnElPapel,
    hayTotalImpreso: p.hayTotalImpreso,
    pie: p.pie,
    lineas: p.lineas,
    explicacion: quien === "pro" ? p.explicacionPro : p.explicacionFlash,
    ...cambios,
  };
}

/** Mauro: las 21 líneas con cantidad de la planilla real, sin total. */
function mauro(quien) {
  const fuente = fs.readFileSync(new URL("./sinTotal.test.mjs", import.meta.url), "utf8");
  const lineas = [...fuente.matchAll(/\[(\d+), (\d+), (\d+), "([^"]+)"\]/g)].map(([, c, n, s, d]) => ({
    descripcion: d, cantidad: Number(c), precioImpreso: Number(n), importeImpreso: Number(s),
    costoFinal: Number(s), tipo: "MERCADERIA",
  }));
  return {
    identidad: {}, lineas, pie: { total: null }, lineasEnElPapel: lineas.length, hayTotalImpreso: false,
    explicacion: quien === "pro" ? PAPELES.mauro.explicacionPro : PAPELES.mauro.explicacionFlash,
  };
}

/** Una respuesta de `generateContent` con este JSON adentro. */
const respuestaDeGoogle = (json, { finishReason = "STOP", pensamiento = false } = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [
      {
        finishReason,
        content: {
          parts: [...(pensamiento ? [{ text: "mirando el pie…", thought: true }] : []), { text: JSON.stringify(json) }],
        },
      },
    ],
    usageMetadata: { promptTokenCount: 2400, candidatesTokenCount: 1800, thoughtsTokenCount: 900 },
  }),
});

/** Flash: un lector de verdad sobre una respuesta fija, contando lo que se le pidió. */
function flashQueContesta(json) {
  const pedidos = [];
  const lector = crearLectorGemini({
    env: ENV,
    fetchImpl: async (_url, init) => {
      pedidos.push(JSON.parse(init.body));
      return respuestaDeGoogle(json);
    },
  });
  const leer = (receta) =>
    leerConCadena({ cadena: { titular: { ok: true, lector }, respaldo: null }, archivos: FOTO, receta });
  leer.pedidos = pedidos;
  return leer;
}

/** El grande —titular y respaldo, como los arma la ruta—, contando las llamadas. */
function modeloGrande(responder, env = ENV) {
  const llamadas = [];
  const interpretes = armarInterpretes({
    env,
    fetchImpl: async (url, init) => {
      const modelo = String(url).split("/models/")[1].split(":")[0];
      llamadas.push({ url, modelo, cuerpo: JSON.parse(init.body) });
      return responder(modelo);
    },
  });
  return { interpretes, llamadas };
}

/**
 * LO QUE HACE LA RUTA DE LEER, PASO POR PASO: quién lee, si escala, con qué
 * lectura se queda y con qué receta pasa por la puerta.
 */
async function leer({ flash, explicaciones = [], grande }) {
  const sinExplicacion = explicaciones.length === 0;
  const hayGrande = [grande.interpretes.titular, grande.interpretes.respaldo].some((i) => i?.disponible?.().ok === true);
  let resultado =
    sinExplicacion && hayGrande
      ? { ok: false, motivo: null, lector: null, intentos: [], usoRespaldo: false, porQuePaso: null }
      : await flash({ interpretada: true, explicaciones });
  const escalada = await escalarAlModeloGrande({
    resultado, explicaciones, sinExplicacion: sinExplicacion && hayGrande,
    interpretes: grande.interpretes, archivos: FOTO, proveedorNombre: "Proveedor",
  });
  let recetaDeLaLectura = escalada.recetaDeFlash;
  let versionDeLaLectura = escalada.versionDeFlash;
  if (escalada.cerro || (escalada.lectura && resultado.ok !== true)) {
    resultado = { ...resultado, ok: true, motivo: null, lectura: escalada.lectura };
    recetaDeLaLectura = escalada.receta;
    versionDeLaLectura = escalada.recetaVersion;
  }
  const lectura = resultado.ok ? resultado.lectura : null;
  const puerta = lectura ? pasarPorLaPuerta({ lectura, receta: recetaDeLaLectura, recetaVersion: versionDeLaLectura }) : null;
  return { resultado, escalada, puerta, lectura };
}

/** El comprobante como lo guarda la ruta de leer: el mismo mapeo de columnas. */
function guardado(puerta, lectura) {
  return {
    ...puerta.aGuardar,
    explicacionLeida: puerta.aGuardar.explicacionLeida ?? null,
    lineas: lectura.lineas.map((l, i) => ({
      orden: i + 1, textoCrudo: l.descripcion, codigoProveedor: l.codigoProveedor ?? null,
      cantidad: l.cantidad, netoUnitario: l.netoUnitario, subtotalImpreso: l.subtotalImpreso ?? null,
      subtotalCorregido: null, internoUnitario: l.internoUnitario ?? null, pesoKg: l.peso ?? null,
      bonificacionPct: l.bonificacion ?? null, ivaPct: l.alicuotaIva ?? null,
      costoFinalRenglon: l.costoFinal ?? null, enQueViene: l.enQueViene ?? null, tipoRenglon: l.tipo ?? null,
    })),
  };
}

/** El costo que propone la recepción por renglón, desde lo guardado. */
function costos(puerta, lectura, producto = { precio_costo: 1000, factor_pack: 1, unidad_medida: "UNIDAD" }) {
  const c = guardado(puerta, lectura);
  return c.lineas.map((l) => {
    const a = analizarPrecioDeLinea({ linea: l, producto, receta: c.recetaUsada });
    return a.bonificado ? null : a.precioFinal;
  });
}

/**
 * La explicación confirmada del papel, guardada PARA SU TIPO —la letra que
 * trae—, como la devuelve `explicacionesConfirmadas`.
 */
const CON_EXPLICACION = (papel, version = 1) => [
  {
    tipoComprobante: tipoDePapel(PAPELES[papel].identidad?.tipo),
    explicacion: PAPELES[papel].explicacionFlash,
    version,
  },
];

// ══════════════════════════════════════════════════════════════════════════
// DYSSA
// ══════════════════════════════════════════════════════════════════════════

test("DYSSA CON SU EXPLICACIÓN: lee Flash, cierra en 633.686,40 y da los nueve costos de #153", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro")));
  const flash = flashQueContesta(respuesta("dyssa", "flash"));
  const { escalada, puerta, lectura } = await leer({ flash, explicaciones: CON_EXPLICACION("dyssa", 4), grande });
  assert.equal(grande.llamadas.length, 0, "con explicación y cerrando, el grande no se llama");
  assert.equal(escalada.motivo, null);
  assert.equal(puerta.estado, ESTADO.CARGADO, puerta.porque);
  assert.equal(puerta.aGuardar.totalLeido, 633686.4);
  assert.equal(Math.abs(puerta.diferenciaCentavos), 1, "el centavo de redondeo del proveedor");
  assert.equal(puerta.aGuardar.recetaVersion, 4);
  assert.deepEqual(costos(puerta, lectura), COSTO_ESPERADO);
  // Flash va guiado por la explicación, marcada como en #157.
  const pedido = flash.pedidos[0].contents[0].parts.find((p) => p.text)?.text ?? "";
  // Cada explicación con el rótulo de su tipo de papel.
  assert.match(pedido, /<<<EXPLICACIÓN Factura A\n[\s\S]*Factura A de Dyssa[\s\S]*\nEXPLICACIÓN>>>/);
});

test("DYSSA SIN RECETA: lee el grande, una vez, cierra, da los mismos nueve y deja la explicación pendiente", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro"), { pensamiento: true }));
  const flash = flashQueContesta(respuesta("dyssa", "flash"));
  const { escalada, puerta, lectura } = await leer({ flash, explicaciones: [], grande });
  assert.equal(flash.pedidos.length, 0, "sin explicación Flash no lee: no hay con qué guiarlo");
  assert.equal(escalada.motivo, ESCALADA.SIN_RECETA);
  assert.equal(grande.llamadas.length, 1);
  assert.equal(escalada.cerro, true, escalada.porque);
  assert.equal(puerta.estado, ESTADO.CARGADO, puerta.porque);
  assert.deepEqual(costos(puerta, lectura), COSTO_ESPERADO);
  // Pendiente PARA SU TIPO: la letra que trae el papel.
  assert.deepEqual(escalada.propuesta, { explicacion: PAPELES.dyssa.explicacionPro, tipoComprobante: "A" });
  assert.equal(escalada.recetaVersion, null, "lo que propone no es la versión confirmada");
  assert.match(escalada.texto, /para confirmar en Recetas de facturas/);
});

test("DYSSA: EL DR. LEMON BONIFICADO NO PISA EL COSTO, y Gancia y Pronto pasan a planchas de 24", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro")));
  const { puerta, lectura } = await leer({ flash: flashQueContesta(respuesta("dyssa", "flash")), explicaciones: CON_EXPLICACION("dyssa"), grande });
  const c = guardado(puerta, lectura);
  const lemon = analizarPrecioDeLinea({
    linea: c.lineas[8], producto: { precio_costo: 2500, factor_pack: 1, unidad_medida: "UNIDAD" }, receta: c.recetaUsada,
  });
  assert.equal(lemon.bonificado, true);
  assert.equal(lemon.precioAEscribir, null, "un cero le rompería el margen");
  assert.equal(lemon.costoAnterior, 2500);

  // Las mismas reglas de negocio de #155, sobre el costo final del renglón.
  const proveedor = { id: 1, nombre: "Dyssa" };
  const gancia = analizarPrecioDeLinea({
    linea: c.lineas[4], producto: { id: 70, precio_costo: 48000, factor_pack: 24, unidad_medida: "pack" },
    receta: c.recetaUsada, proveedor,
  });
  assert.equal(gancia.precioFinal, 11775.1);
  assert.equal(gancia.unidad.unidadesPorFacturada, 6);
  assert.equal(gancia.precioAEscribir, 47100.4, "4 packs de 6 por plancha de 24");
  const pronto = analizarPrecioDeLinea({
    linea: c.lineas[3], producto: { id: 71, precio_costo: 52000, factor_pack: 24, unidad_medida: "pack" },
    receta: c.recetaUsada, proveedor,
  });
  assert.equal(pronto.precioFinal, 13190.5);
  assert.equal(pronto.precioAEscribir, 52762);
});

// ══════════════════════════════════════════════════════════════════════════
// DAS #255: FIAMBRE POR KILO
// ══════════════════════════════════════════════════════════════════════════

const SALAME = { id: 9101, precio_costo: 11000, factor_pack: 1, unidad_medida: "kg", modoVentaDeposito: "PESO", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 1.8, pesoEsFijo: false };
const LA_VERONA = { id: 9102, precio_costo: 9000, factor_pack: 1, unidad_medida: "kg", modoVentaDeposito: "PESO", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4, pesoEsFijo: false };
const MORTADELA = { id: 9103, precio_costo: 40000, factor_pack: 1, unidad_medida: "kg", modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5, pesoEsFijo: true };

for (const quien of ["flash", "pro"]) {
  test(`DAS (${quien === "flash" ? "con explicación" : "sin receta, lee el grande"}): cierra; salame 11.626,08 y barra 9.813,42 el kilo; mortadela por pieza`, async () => {
    const grande = modeloGrande(() => respuestaDeGoogle(respuesta("das", "pro")));
    const flash = flashQueContesta(respuesta("das", "flash"));
    const { puerta, lectura } = await leer({ flash, explicaciones: quien === "flash" ? CON_EXPLICACION("das") : [], grande });
    assert.equal(grande.llamadas.length, quien === "flash" ? 0 : 1);
    assert.equal(puerta.estado, ESTADO.CARGADO, puerta.porque);
    assert.equal(puerta.diferenciaCentavos, 0);
    const c = guardado(puerta, lectura);
    const [salame, verona, mortadela] = [SALAME, LA_VERONA, MORTADELA].map((producto, i) =>
      analizarPrecioDeLinea({ linea: c.lineas[i], producto, receta: c.recetaUsada })
    );
    assert.equal(salame.precioFinal, 11626.08);
    assert.equal(salame.porKilo, true, "10,94 son kilos, no unidades");
    assert.equal(verona.precioFinal, 9813.42);
    assert.equal(mortadela.precioFinal, 39680, "6 piezas: 238.080 ÷ 6");
  });
}

// ══════════════════════════════════════════════════════════════════════════
// MAURO: SIN TOTAL
// ══════════════════════════════════════════════════════════════════════════

for (const quien of ["flash", "pro"]) {
  test(`MAURO (${quien === "flash" ? "con explicación" : "sin receta"}): SIN_TOTAL y no propone ningún costo`, async () => {
    const grande = modeloGrande(() => respuestaDeGoogle(mauro("pro")));
    const flash = flashQueContesta(mauro("flash"));
    const { escalada, puerta } = await leer({ flash, explicaciones: quien === "flash" ? CON_EXPLICACION("mauro") : [], grande });
    assert.equal(puerta.estado, ESTADO.SIN_TOTAL);
    assert.equal(puerta.proponeCostos, false);
    assert.equal(puerta.aGuardar.lineasTranscriptas, 21);
    // Con explicación, un papel sin total no escala: no hay contra qué verificar.
    assert.equal(grande.llamadas.length, quien === "flash" ? 0 : 1);
    assert.equal(escalada.cerro, false);
    assert.equal(escalada.propuesta, undefined, "sin cuenta que cierre no se aprende receta");
  });
}

// ══════════════════════════════════════════════════════════════════════════
// LA PALABRA DEL MODELO NO VALE: LA CUENTA LA HACE EL CÓDIGO
// ══════════════════════════════════════════════════════════════════════════

/** DYSSA con el costo de un renglón inflado: los costos ya no suman el total. */
const dyssaQueNoSuma = (quien) =>
  respuesta("dyssa", quien, {
    lineas: PAPELES.dyssa.lineas.map((l, i) => (i === 2 ? { ...l, costoFinal: 139286.84 } : l)),
  });

test("COSTOS QUE NO SUMAN EL TOTAL → 'no cierra', cero costos propuestos, sin receta pendiente, y se recibe igual", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(dyssaQueNoSuma("pro")));
  const { escalada, puerta } = await leer({ flash: flashQueContesta(dyssaQueNoSuma("flash")), explicaciones: [], grande });
  assert.equal(grande.llamadas.length, 1);
  assert.equal(escalada.cerro, false);
  assert.equal(escalada.propuesta, undefined, "una lectura que no cierra no enseña receta");
  assert.equal(puerta.estado, ESTADO.MAL_LEIDO);
  assert.equal(puerta.proponeCostos, false);
  assert.equal(puerta.diferenciaCentavos, 1000000 - 1, "diez mil pesos de más, menos el centavo del proveedor");
  assert.match(puerta.porque, /suman \$643\.686,39 y el papel dice \$633\.686,40/);
  // Se recibe igual: la mercadería entra y los costos no se tocan (#164).
  const noCierra = papelQueNoCierra([{ estado: puerta.estado, diferenciaCentavos: puerta.diferenciaCentavos }]);
  assert.equal(noCierra.noCierra, true);
  assert.match(noCierra.motivo, /no cerraba por \$9\.999,99[\s\S]*los costos quedaron como estaban/);
});

test("CON EXPLICACIÓN Y FLASH QUE NO CIERRA → el grande una vez; si él cierra, manda su lectura", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro")));
  const flash = flashQueContesta(dyssaQueNoSuma("flash"));
  const { escalada, puerta, lectura } = await leer({ flash, explicaciones: CON_EXPLICACION("dyssa", 4), grande });
  assert.equal(escalada.motivo, ESCALADA.NO_CIERRA);
  assert.equal(grande.llamadas.length, 1);
  assert.equal(escalada.cerro, true);
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.deepEqual(costos(puerta, lectura), COSTO_ESPERADO);
  // La explicación del grande difiere de la confirmada: queda para confirmar.
  assert.deepEqual(escalada.propuesta, { explicacion: PAPELES.dyssa.explicacionPro, tipoComprobante: "A" });
  // El pedido al grande lleva la explicación y la transcripción de Flash como referencia.
  const pedido = grande.llamadas[0].cuerpo.contents[0].parts.find((p) => p.text).text;
  assert.match(pedido, /<<<EXPLICACIÓN\n[\s\S]*\nEXPLICACIÓN>>>/);
  assert.match(pedido, /<<<LECTURA\n[\s\S]+\nLECTURA>>>/);
  assert.match(pedido, /SOLO COMO REFERENCIA/);
});

test("CON EXPLICACIÓN Y FLASH CORTO (1 de 9) → escala por renglones faltantes", async () => {
  const corta = respuesta("dyssa", "flash", { lineas: PAPELES.dyssa.lineas.slice(0, 1) });
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro")));
  const { escalada, lectura } = await leer({ flash: flashQueContesta(corta), explicaciones: CON_EXPLICACION("dyssa"), grande });
  assert.equal(escalada.motivo, ESCALADA.FALTAN_RENGLONES);
  assert.equal(escalada.cerro, true);
  assert.equal(lectura.lineas.length, 9);
});

test("UN RENGLÓN CON EL COSTO DE OTRO —misma suma, reparto cruzado— lo atrapa la variación contra el ERP", async () => {
  // El Sussex y el Higienol con los costos de renglón cambiados: la suma es la
  // misma, así que el papel CIERRA. Lo que lo delata es la comparación de cada
  // producto contra su costo en el ERP, la regla de negocio de siempre.
  const cruzada = respuesta("dyssa", "flash", {
    lineas: PAPELES.dyssa.lineas.map((l, i) =>
      i === 1 ? { ...l, costoFinal: PAPELES.dyssa.lineas[2].costoFinal }
        : i === 2 ? { ...l, costoFinal: PAPELES.dyssa.lineas[1].costoFinal }
          : l
    ),
  });
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro")));
  const { puerta, lectura } = await leer({ flash: flashQueContesta(cruzada), explicaciones: CON_EXPLICACION("dyssa"), grande });
  assert.equal(puerta.cierra, true, "la suma no lo puede ver");
  const c = guardado(puerta, lectura);
  // El costo de cada uno en el ERP: el de #153, el que el papel tendría que dar.
  const erp = { 1: 1739.84, 2: 1539.13 };
  for (const i of [1, 2]) {
    const a = analizarPrecioDeLinea({
      linea: c.lineas[i], producto: { precio_costo: erp[i], factor_pack: 1, unidad_medida: "UNIDAD" }, receta: c.recetaUsada,
    });
    const s = decisionDeCostoSugerida({ papel: a.precioAEscribir, tuyo: erp[i], variacionPct: 10, factorPack: 1 });
    assert.notEqual(s.situacion, SITUACION.NORMAL, `el renglón ${i + 1} tiene que pedir que lo miren`);
    assert.equal(s.exigeElegir, true, "y no viene marcado: alguien elige");
  }
  // CONTRAPRUEBA: con los costos en su lugar, los dos coinciden con el ERP y
  // no piden que nadie elija.
  const { puerta: bien, lectura: lb } = await leer({
    flash: flashQueContesta(respuesta("dyssa", "flash")), explicaciones: CON_EXPLICACION("dyssa"), grande,
  });
  const cb = guardado(bien, lb);
  for (const i of [1, 2]) {
    const a = analizarPrecioDeLinea({
      linea: cb.lineas[i], producto: { precio_costo: erp[i], factor_pack: 1, unidad_medida: "UNIDAD" }, receta: cb.recetaUsada,
    });
    const s = decisionDeCostoSugerida({ papel: a.precioAEscribir, tuyo: erp[i], variacionPct: 10, factorPack: 1 });
    assert.equal(s.situacion, SITUACION.IGUALES);
    assert.equal(s.exigeElegir, false);
  }
});

test("UN RENGLÓN DE MERCADERÍA SIN COSTO NO SE ARMA CON REGLAS DE FORMATO", async () => {
  // Es exactamente el defecto de Secco #256: sin el costo del modelo, la
  // receta genérica le sumaba un 21 % que el papel ya traía.
  const sinCosto = respuesta("secco", "flash", {
    lineas: PAPELES.secco.lineas.map((l, i) => (i === 0 ? { ...l, costoFinal: null } : l)),
  });
  const grande = modeloGrande(() => respuestaDeGoogle(sinCosto));
  const { puerta, lectura } = await leer({ flash: flashQueContesta(sinCosto), explicaciones: CON_EXPLICACION("secco"), grande });
  assert.equal(puerta.cierra, false);
  assert.equal(puerta.proponeCostos, false);
  const c = guardado(puerta, lectura);
  const a = analizarPrecioDeLinea({ linea: c.lineas[0], producto: { precio_costo: 9000, factor_pack: 1, unidad_medida: "unidad" }, receta: c.recetaUsada });
  assert.equal(a.precioFinal, null, "nada de 9.396,19 × 1,21");
  assert.equal(a.sinCostoDelPapel, true);
});

test("LO GUARDADO SE REARMA COMO INTERPRETADO Y LA PUERTA DA LO MISMO: corregir a mano no cambia de criterio", async () => {
  // El grande caído: queda la lectura de Flash que no cierra, como en producción.
  const caido = modeloGrande(() => ({ ok: false, status: 503, text: async () => "" }));
  const { puerta, lectura } = await leer({ flash: flashQueContesta(dyssaQueNoSuma("flash")), explicaciones: CON_EXPLICACION("dyssa"), grande: caido });
  assert.equal(puerta.estado, ESTADO.MAL_LEIDO);
  const rearmada = lecturaDesdeLoGuardado(guardado(puerta, lectura));
  assert.equal(rearmada.interpretada, true);
  const otra = pasarPorLaPuerta({ lectura: rearmada, receta: puerta.aGuardar.recetaUsada });
  assert.equal(otra.estado, ESTADO.MAL_LEIDO);
  assert.equal(otra.diferenciaCentavos, puerta.diferenciaCentavos);
});

test("SI FLASH NO LEYÓ —cuota, caído, cortada— el grande no entra: no hubo lectura que no alcance", () => {
  for (const motivo of [MOTIVO_LECTURA.CUOTA_AGOTADA, MOTIVO_LECTURA.SERVICIO_CAIDO, MOTIVO_LECTURA.LECTURA_CORTADA]) {
    assert.equal(motivoDeEscalada({ resultado: { ok: false, motivo }, puerta: null }), null);
  }
  assert.equal(
    motivoDeEscalada({ resultado: { ok: false, motivo: MOTIVO_LECTURA.TARDO_DEMASIADO }, puerta: null }),
    ESCALADA.FLASH_SIN_RESPUESTA
  );
});

// ══════════════════════════════════════════════════════════════════════════
// EL TITULAR, Y EL RESPALDO SOLO SI EL TITULAR NO PUDO CONTESTAR
// ══════════════════════════════════════════════════════════════════════════

const error = (status, mensaje) => () => ({
  ok: false, status, text: async () => JSON.stringify({ error: { message: mensaje } }),
});
const vencida = () => { const e = new Error("tarde"); e.name = "TimeoutError"; throw e; };

/** DYSSA sin receta, con titular y respaldo contestando lo suyo. */
async function conTitularQue(titular, respaldo = () => respuestaDeGoogle(respuesta("dyssa", "pro"))) {
  const grande = modeloGrande((modelo) => (modelo === TITULAR ? titular() : respaldo()));
  const r = await leer({ flash: flashQueContesta(respuesta("dyssa", "flash")), explicaciones: [], grande });
  return { ...r, grande };
}

test("TITULAR CON 404 —el preview dado de baja— → el respaldo lee, cierra, y queda anotado quién respondió", async () => {
  const { escalada, puerta, lectura, grande } = await conTitularQue(error(404, "models/gemini-3.1-pro-preview is not found"));
  assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR, RESPALDO]);
  assert.deepEqual(
    escalada.llamadas.map((l) => [l.lector, l.ok, l.motivo, l.escalada]),
    [
      [TITULAR, false, MOTIVO_LECTURA.MODELO_NO_EXISTE, ESCALADA.SIN_RECETA],
      [RESPALDO, true, null, ESCALADA.SIN_RECETA],
    ]
  );
  assert.equal(escalada.cerro, true);
  assert.equal(escalada.modelo, RESPALDO, "la propuesta la dejó el respaldo");
  assert.deepEqual(costos(puerta, lectura), COSTO_ESPERADO);
});

test("TITULAR CON CUOTA AGOTADA, CAÍDO, VENCIDO O QUE NO ACEPTA EL FORMATO → el respaldo", async () => {
  for (const [titular, motivo] of [
    [error(429, "Quota exceeded for metric generate_content_free_tier_requests"), MOTIVO_LECTURA.CUOTA_AGOTADA],
    [error(503, "high demand"), MOTIVO_LECTURA.SERVICIO_CAIDO],
    [vencida, MOTIVO_LECTURA.TARDO_DEMASIADO],
    [error(400, "Unsupported MIME type: image/jpeg"), MOTIVO_LECTURA.PEDIDO_RECHAZADO],
  ]) {
    const { escalada, grande } = await conTitularQue(titular);
    assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR, RESPALDO], motivo);
    assert.equal(escalada.llamadas[0].motivo, motivo);
    assert.equal(escalada.cerro, true, motivo);
  }
});

test("RESPUESTA ILEGIBLE O CORTADA DEL TITULAR → NO pasa al respaldo, y sin lectura no hay nada que guardar", async () => {
  for (const [titular, motivo] of [
    [() => ({ ok: true, status: 200, json: async () => { throw new Error("no es JSON"); } }), MOTIVO_LECTURA.RESPUESTA_ILEGIBLE],
    [() => respuestaDeGoogle(respuesta("dyssa", "pro"), { finishReason: "MAX_TOKENS" }), MOTIVO_LECTURA.LECTURA_CORTADA],
  ]) {
    const { escalada, puerta, grande } = await conTitularQue(titular);
    assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR], motivo);
    assert.equal(escalada.llamadas[0].motivo, motivo);
    assert.equal(escalada.cerro, false);
    assert.match(escalada.texto, /No se pudo interpretar el papel/);
    assert.match(escalada.texto, /Volver a leer puede servir/);
    assert.equal(puerta, null, "sin explicación no leyó Flash: no hay lectura");
  }
  assert.ok(!MOTIVOS_QUE_PASAN_EN_LA_ESCALADA.includes(MOTIVO_LECTURA.RESPUESTA_ILEGIBLE));
  assert.ok(!MOTIVOS_QUE_PASAN_EN_LA_ESCALADA.includes(MOTIVO_LECTURA.LECTURA_CORTADA));
});

test("UNA LECTURA DEL TITULAR QUE NO CIERRA TAMPOCO PASA: el respaldo no se llama", async () => {
  const { escalada, grande } = await conTitularQue(() => respuestaDeGoogle(dyssaQueNoSuma("pro")));
  assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR]);
  assert.equal(escalada.cerro, false);
});

test("SI EL GRANDE NO TERMINA DESPUÉS DE UN FLASH CORTO, LA LECTURA DE FLASH NO SE PIERDE", async () => {
  const corta = respuesta("dyssa", "flash", { lineas: PAPELES.dyssa.lineas.slice(0, 1) });
  const grande = modeloGrande(vencida);
  const { escalada, puerta, lectura } = await leer({ flash: flashQueContesta(corta), explicaciones: CON_EXPLICACION("dyssa"), grande });
  assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR, RESPALDO]);
  assert.deepEqual(escalada.llamadas.map((l) => l.motivo), [MOTIVO_LECTURA.TARDO_DEMASIADO, MOTIVO_LECTURA.TARDO_DEMASIADO]);
  assert.equal(escalada.cerro, false);
  assert.equal(lectura.lineas.length, 1, "es la lectura de Flash");
  assert.equal(puerta.estado, ESTADO.MAL_LEIDO);
  assert.match(escalada.texto, /tardó más de lo que se lo espera/);
});

test("LA LLAMADA QUE SALIÓ BIEN TAMBIÉN SE ANOTA, con su modelo, su caso y lo que contestó", async () => {
  const pro = respuesta("dyssa", "pro");
  const grande = modeloGrande(() => respuestaDeGoogle(pro));
  const { escalada } = await leer({ flash: flashQueContesta(respuesta("dyssa", "flash")), explicaciones: [], grande });
  const [{ duracionMs, tokens, respuestaCruda, ...llamada }] = escalada.llamadas;
  assert.deepEqual(llamada, { lector: TITULAR, ok: true, motivo: null, detalle: null, escalada: ESCALADA.SIN_RECETA });
  assert.equal(respuestaCruda, JSON.stringify(pro));
  assert.ok(Number.isInteger(duracionMs) && duracionMs >= 0);
  assert.equal(escalada.modelo, TITULAR);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS MODELOS
// ══════════════════════════════════════════════════════════════════════════

test("LOS DOS NOMBRES EXACTOS, MEDIDOS CONTRA LA API EL 2026-10-09", async () => {
  const { MODELO_PRO, MODELO_PRO_RESPALDO } = await import("./gemini.js");
  assert.equal(MODELO_PRO, TITULAR);
  assert.equal(MODELO_PRO_RESPALDO, RESPALDO);
});

test("SIN CLAVE DEL GRANDE, SIN EXPLICACIÓN LEE FLASH SOLO, y no se llama a nadie más", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro")), {});
  const flash = flashQueContesta(respuesta("dyssa", "flash"));
  const { escalada, puerta } = await leer({ flash, explicaciones: [], grande });
  assert.equal(flash.pedidos.length, 1, "sin grande, Flash lee aunque no tenga guía");
  assert.equal(escalada.llamo, false);
  assert.equal(grande.llamadas.length, 0);
  assert.equal(puerta.estado, ESTADO.CARGADO);
});

test("UN ALIAS MÓVIL NO SE USA, NI DE TITULAR NI DE RESPALDO", async () => {
  assert.equal(esAliasMovil("gemini-pro-latest"), true);
  assert.equal(esAliasMovil(TITULAR), false);
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro")), {
    GEMINI_API_KEY: "x", GEMINI_MODELO_PRO: "gemini-pro-latest", GEMINI_MODELO_PRO_RESPALDO: "gemini-2.5-pro-latest",
  });
  assert.equal(grande.interpretes.titular.disponible().ok, false);
  assert.equal(grande.interpretes.respaldo.disponible().ok, false);
  await leer({ flash: flashQueContesta(respuesta("dyssa", "flash")), explicaciones: [], grande });
  assert.equal(grande.llamadas.length, 0);
});

test("EL ARRANQUE VERIFICA LOS DOS, Y SI EL TITULAR YA NO EXISTE LO DICE Y NOMBRA AL RESPALDO", async () => {
  const preguntados = [];
  const avisos = await verificarModelosPro({
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async (url) => {
      preguntados.push(String(url).split("/models/")[1]);
      return { ok: !String(url).endsWith(TITULAR), status: String(url).endsWith(TITULAR) ? 404 : 200 };
    },
  });
  assert.deepEqual(preguntados, [TITULAR, RESPALDO]);
  assert.equal(avisos[0].grave, true);
  assert.match(avisos[0].texto, /TITULAR YA NO EXISTE: gemini-3\.1-pro-preview/);
});

test("FLASH Y EL GRANDE PIDEN LA MISMA SALIDA ESTRUCTURADA: la lectura interpretada", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(respuesta("dyssa", "pro")));
  const flash = flashQueContesta(dyssaQueNoSuma("flash"));
  await leer({ flash, explicaciones: CON_EXPLICACION("dyssa"), grande });
  assert.match(grande.llamadas[0].url, /\/gemini-3\.1-pro-preview:generateContent$/);
  assert.deepEqual(grande.llamadas[0].cuerpo.generationConfig.responseSchema, esquemaInterpretado());
  assert.deepEqual(flash.pedidos[0].generationConfig.responseSchema, esquemaInterpretado());
  assert.equal(grande.llamadas[0].cuerpo.generationConfig.maxOutputTokens, undefined);
});

test("EL ESQUEMA NO OBLIGA A INVENTAR: lo que puede faltar es opcional, y el total se pregunta aparte", () => {
  const e = esquemaInterpretado();
  const renglon = e.properties.lineas.items;
  // Hasta el costo final: si el modelo no lo puede decir, que lo deje vacío y
  // no lo invente. Un renglón de mercadería sin costo deja el papel sin cerrar
  // —lo prueba «UN RENGLÓN DE MERCADERÍA SIN COSTO…»—.
  for (const campo of ["precioImpreso", "importeImpreso", "kilos", "codigoProveedor", "enQueViene", "costoFinal"]) {
    assert.ok(!renglon.required.includes(campo), `${campo} puede no estar en el papel`);
  }
  assert.ok(renglon.properties.costoFinal, "el costo final es lo que se pide");
  assert.deepEqual(renglon.properties.tipo.enum, ["MERCADERIA", "ENVASE", "CARGO"]);
  // El total puede faltar; si el papel lo trae se contesta con un sí o un no.
  assert.ok(!e.properties.pie.required?.includes("total"));
  assert.ok(e.required.includes("hayTotalImpreso"));
  assert.ok(e.required.includes("explicacion"));
});

// ══════════════════════════════════════════════════════════════════════════
// LA RUTA Y LA PANTALLA. Se leen sin comentarios: un candado que busca texto
// encuentra la prosa (regla 5 de CLAUDE.md).
// ══════════════════════════════════════════════════════════════════════════

const codigoDe = (ruta) =>
  fs
    .readFileSync(new URL(`../../../../${ruta}`, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("LA RUTA DE LEER: sin explicación lee el grande, escala una vez y guarda el costo final de cada renglón", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.equal((ruta.match(/await escalarAlModeloGrande\(/g) || []).length, 1, "una sola escalada por pedido");
  assert.match(ruta, /const sinExplicacion = explicaciones\.length === 0/);
  assert.match(ruta, /sinExplicacion && hayGrande\s*\?\s*\{ ok: false, motivo: null/);
  assert.match(ruta, /sinExplicacion: sinExplicacion && hayGrande/);
  // Flash lee con TODAS las confirmadas, cada una con su tipo.
  assert.match(ruta, /const receta = \{ interpretada: true, explicaciones \}/);
  assert.match(ruta, /let recetaDeLaLectura = escalada\.recetaDeFlash/);
  assert.match(ruta, /if \(escalada\.cerro \|\| \(escalada\.lectura && resultado\.ok !== true\)\)/);
  assert.match(ruta, /archivos: paraLeer/, "las mismas fotos achicadas");
  assert.match(ruta, /costoFinalRenglon: l\.costoFinal \?\? null/);
  assert.match(ruta, /tipoRenglon: l\.tipo \?\? null/);
  assert.match(ruta, /\.\.\.escalada\.llamadas,/);
  assert.match(ruta, /if \(escalada\.cerro && escalada\.propuesta\)/);
  assert.match(ruta, /recetaPropuestaProveedor\.upsert\(/);
  // La pendiente es la DE SU TIPO: la clave lleva el tipo de papel.
  assert.match(ruta, /grupoId_proveedorId_tipoComprobante: \{ grupoId, proveedorId: comprobante\.proveedorId, tipoComprobante \}/);
  assert.doesNotMatch(ruta, /recetaProveedor\.(upsert|create|update)\(/, "la ruta de leer no confirma recetas");
  assert.doesNotMatch(ruta, /explicacionPorTipo\.(upsert|create|update)\(/, "ni explicaciones");
});

test("CONFIRMAR LA PROPUESTA GUARDA LA EXPLICACIÓN DE SU TIPO, sube la versión y borra la propuesta en la misma transacción", () => {
  const ruta = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  const bloque = ruta.slice(ruta.indexOf("if (body?.confirmarPropuesta === true)"));
  assert.ok(bloque.length > 100, "desapareció la confirmación");
  assert.match(bloque, /where: \{ grupoId_proveedorId_tipoComprobante: \{ grupoId, proveedorId, tipoComprobante \} \}/);
  assert.match(bloque, /const explicacionAGuardar = explicacion \|\| explicacionPropuesta\(pendiente\?\.respuestas\)/);
  assert.match(bloque, /version: \{ increment: 1 \}/);
  assert.match(
    bloque,
    /prisma\.\$transaction\(async \(tx\) => \{[\s\S]*tx\.explicacionPorTipo\.upsert\(\{\s*where: \{ grupoId_proveedorId_tipoComprobante: \{ grupoId, proveedorId, tipoComprobante \} \}[\s\S]*tx\.recetaPropuestaProveedor\.delete/
  );
  assert.match(ruta, /const tipoComprobante = tipoDePapel\(body\?\.tipoComprobante\)/);
});

test("LA PANTALLA DE RECETAS ABRE CADA TIPO CON SU PROPUESTA, LA MUESTRA EN «ASÍ LO ENTENDIÓ» Y GUARDAR LA CONFIRMA", () => {
  const p = codigoDe("components/compras-proveedor/ExplicacionDelPapel.jsx");
  assert.match(p, /const p = prop\[t\] \?\? null;/);
  assert.match(p, /setLectura\(p\.lectura\);\s*setExplicacion\(p\.explicacion\)/);
  assert.match(p, /setExplicacion\(conf\[t\]\?\.explicacion \?\? ""\)/, "sin propuesta, la confirmada DE ESA solapa");
  assert.match(p, /\.\.\.\(propuesta \? \{ confirmarPropuesta: true \} : \{\}\)/);
  assert.match(p, /\{propuesta && \(\s*<p[^>]*>\{TEXTO_PROPUESTA\}<\/p>/);
});

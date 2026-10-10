// CUANDO FLASH NO ALCANZA, ENTRA EL MODELO GRANDE, Y LA CUENTA LA HACE EL CÓDIGO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/escaladaAlModeloGrande.test.mjs
//
// ── LO QUE SE PIDIÓ (Emanuel, 2026-10-08/09) ──────────────────────────────
//
// Que ningún cliente tenga que configurar ni explicar proveedor por
// proveedor: el modelo grande interpreta la boleta, el sistema propone la
// receta, una persona la confirma una vez y queda aprendida.
//
// ── DE DÓNDE SALEN LOS DATOS ──────────────────────────────────────────────
//
// · La boleta es la de DYSSA de #153 (`boletaDyssa.fixture.json`), la que
//   transcribió Emanuel, con la forma que devuelve el lector.
// · La lectura corta de Flash es ESA MISMA con un renglón de nueve: la forma
//   que tuvo la #253.
// · La receta esperada se lee del SQL de la migración 20261008120000, la que
//   corre en producción, y los nueve costos son los que dio Emanuel en #153.
// · La propuesta del modelo grande (`recetaPropuestaDyssa.fixture.json`) NO
//   está medida: desde la nube no hay clave para llamarlo. Lo dice su
//   `_origen`. Lo que estos candados prueban es qué hace el código con ella.
// · Las respuestas viajan con la forma de `generateContent` —candidato,
//   `finishReason`, partes, `usageMetadata`— por los lectores de verdad,
//   `crearLectorGemini` y `crearInterpreteGemini`, con un `fetch` de mentira.
// · Mauro es la planilla de 21 renglones de `sinTotal.test.mjs`, que es el
//   papel real sin total.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { crearLectorGemini, armarInterpretes, esAliasMovil, verificarModelosPro } from "./gemini.js";
import { leerConCadena, MOTIVOS_QUE_PASAN_EN_LA_ESCALADA } from "./cadena.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { MOTIVO_LECTURA } from "./contrato.js";
import { esquemaDeInterpretacion } from "./promptDesdeReceta.js";
import { escalarAlModeloGrande, motivoDeEscalada, ESCALADA } from "./escalada.js";
import { recetaDelProveedor } from "./recetaDelProveedor.js";
import { aReceta } from "../recetaEnCriollo.js";
import { repartoDelPie } from "../repartoDelPie.js";
import { analizarPrecioDeLinea } from "../precioDeLinea.js";

const { _origen, ...BOLETA } = JSON.parse(
  fs.readFileSync(new URL("../boletaDyssa.fixture.json", import.meta.url), "utf8")
);
const { recetaPropuesta: PROPUESTA_DYSSA } = JSON.parse(
  fs.readFileSync(new URL("../recetaPropuestaDyssa.fixture.json", import.meta.url), "utf8")
);
const SQL = fs.readFileSync(
  new URL("../../../../prisma/migrations/20261008120000_receta_dyssa_iva_por_renglon/migration.sql", import.meta.url),
  "utf8"
);
/** La receta de DYSSA tal como la escribe la migración que corre en producción. */
const RECETA_DE_LA_MIGRACION = {
  ivaPorLinea: true, alicuotaIvaPct: 21, tieneImpuestoInterno: true, ivaIncluyeInternoEnLaBase: false,
  percepciones: JSON.parse(SQL.match(/'(\[\{"nombre".*?\}\])'::jsonb/)[1]),
  percepcionesEnCosto: true, facturaPor: "UNIDAD",
};
/** Los nueve costos de #153, en el orden del papel. `null` = bonificado. */
const COSTO_ESPERADO = [4023.07, 1739.84, 1539.13, 13190.5, 11775.1, 1784.84, 13358.21, 13358.21, null];

const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];
// Sin pisar los modelos: los candados corren con los nombres que van a producción.
const ENV = { GEMINI_API_KEY: "x" };
const TITULAR = "gemini-3.1-pro-preview";
const RESPALDO = "gemini-2.5-pro";

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

/** La cadena de Flash, con un lector de verdad sobre una respuesta fija. */
function flashQueContesta(json) {
  const lector = crearLectorGemini({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => respuestaDeGoogle(json) });
  return () => leerConCadena({ cadena: { titular: { ok: true, lector }, respaldo: null }, archivos: FOTO, receta: null });
}

/**
 * El modelo grande —titular y respaldo, como los arma la ruta—, contando
 * cuántas veces lo llaman, a cuál, y qué se le pidió. `responder` recibe el
 * nombre del modelo, para que el titular y el respaldo puedan contestar distinto.
 */
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

/** Lee con Flash y escala si hace falta: lo mismo que hace la ruta. */
async function leer({ flash, receta, recetaVersion = null, esGenerica = false, grande }) {
  const resultado = await flash();
  const escalada = await escalarAlModeloGrande({
    resultado, receta, recetaVersion, esGenerica, interpretes: grande.interpretes, archivos: FOTO, proveedorNombre: "Dyssa",
  });
  const lectura = escalada.cerro ? escalada.lectura : resultado.lectura;
  const recetaUsada = escalada.cerro ? escalada.receta : receta;
  const puerta = pasarPorLaPuerta({ lectura, receta: recetaUsada, recetaVersion: escalada.cerro ? escalada.recetaVersion : recetaVersion });
  return { resultado, escalada, puerta, lectura };
}

/** Los costos de la recepción, desde lo que la ruta guarda: el camino de #153. */
function costosDeLaRecepcion(puerta, lectura) {
  const c = {
    ...puerta.aGuardar,
    lineas: lectura.lineas.map((l, i) => ({
      orden: i + 1, textoCrudo: l.descripcion, codigoProveedor: l.codigoProveedor,
      cantidad: l.cantidad, netoUnitario: l.netoUnitario, subtotalImpreso: l.subtotalImpreso,
      internoUnitario: l.internoUnitario, pesoKg: l.peso ?? null,
      bonificacionPct: l.bonificacion ?? null, ivaPct: l.alicuotaIva ?? null,
    })),
  };
  const reparto = repartoDelPie(c);
  return c.lineas.map((l) => {
    const a = analizarPrecioDeLinea({
      linea: l,
      producto: { precio_costo: 1000, factor_pack: 1, unidad_medida: "UNIDAD" },
      receta: c.recetaUsada,
      percepcionDeLaLinea: reparto.get(l.orden),
    });
    return a.bonificado ? null : a.precioFinal;
  });
}

/** Lo que decide el costo, sin los nombres: los de la migración no son los impresos. */
const loQueDecide = (r) => ({
  ivaPorLinea: r.ivaPorLinea, alicuotaIvaPct: Number(r.alicuotaIvaPct),
  tieneImpuestoInterno: r.tieneImpuestoInterno, ivaIncluyeInternoEnLaBase: r.ivaIncluyeInternoEnLaBase,
  percepcionesEnCosto: r.percepcionesEnCosto, facturaPor: r.facturaPor,
  percepciones: r.percepciones.map((p) => [p.pct, p.alicuotaPct ?? null]).sort((a, b) => a[0] - b[0]),
});

const FLASH_CORTA = { ...BOLETA, lineas: BOLETA.lineas.slice(0, 1) };
const PRO_DYSSA = { ...BOLETA, recetaPropuesta: PROPUESTA_DYSSA };

// ══════════════════════════════════════════════════════════════════════════
// DYSSA: FLASH TRAE 1 DE 9, ENTRA EL GRANDE, Y EL SISTEMA APRENDE LA RECETA
// ══════════════════════════════════════════════════════════════════════════

test("DYSSA, PRIMERA BOLETA: 1 de 9 → escala → 9 renglones → cierra en 633.686,40 → los nueve costos de #153", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA, { pensamiento: true }));
  const { receta } = recetaDelProveedor(null);
  const { escalada, puerta, lectura } = await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });

  assert.equal(escalada.motivo, ESCALADA.FALTAN_RENGLONES, "la lectura corta es el caso (a)");
  assert.equal(grande.llamadas.length, 1, "una sola llamada al modelo grande");
  assert.equal(escalada.cerro, true, escalada.porque);
  assert.equal(lectura.lineas.length, 9, "la lectura del grande reemplaza a la de Flash");
  assert.equal(puerta.estado, ESTADO.CARGADO, puerta.porque);
  assert.equal(puerta.aGuardar.totalLeido, 633686.4);
  assert.equal(puerta.proponeCostos, true);
  assert.deepEqual(costosDeLaRecepcion(puerta, lectura), COSTO_ESPERADO);
});

test("DYSSA: LA RECETA QUE QUEDA PENDIENTE ES LA DE LA MIGRACIÓN 20261008120000", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA));
  const { receta } = recetaDelProveedor(null);
  const { escalada } = await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });

  assert.ok(escalada.propuesta, "no quedó ninguna receta para confirmar");
  // Se guarda como RESPUESTAS —la forma de la pantalla— y se confirma con
  // `aReceta`, la misma traducción que usa una persona.
  const confirmada = aReceta(escalada.propuesta);
  assert.deepEqual(loQueDecide(confirmada), loQueDecide(RECETA_DE_LA_MIGRACION));
  // Los porcentajes los sacó el código dividiendo, no el modelo: 3, 1,5 y 3,5.
  assert.deepEqual(
    confirmada.percepciones.map((p) => p.pct).sort((a, b) => a - b),
    [1.5, 3, 3.5]
  );
  // Los nombres son los impresos en el papel, no los que escribió la migración.
  assert.deepEqual(confirmada.percepciones.map((p) => p.nombre).sort(), ["Percepción IIBB", "Percepción IVA", "Percepción IVA"]);
  // Y el texto lo dice: está para confirmar.
  assert.match(escalada.texto, /para confirmar en Recetas de facturas/);
});

test("DYSSA CON SU RECETA YA CONFIRMADA: el grande lee los 9 y no deja nada pendiente", async () => {
  // Es el caso de producción hoy: la migración ya corrió. Proponer lo mismo
  // que está confirmado no enseña nada y pediría confirmar dos veces.
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA));
  const { escalada, puerta, lectura } = await leer({
    flash: flashQueContesta(FLASH_CORTA), receta: RECETA_DE_LA_MIGRACION, recetaVersion: 3, grande,
  });
  assert.equal(escalada.cerro, true);
  assert.equal(escalada.propuesta, null);
  assert.equal(escalada.recetaVersion, 3, "se lee con la receta confirmada y su versión");
  assert.deepEqual(costosDeLaRecepcion(puerta, lectura), COSTO_ESPERADO);
});

// ══════════════════════════════════════════════════════════════════════════
// LA PALABRA DEL GRANDE NO VALE
// ══════════════════════════════════════════════════════════════════════════

test("EL GRANDE PROPONE UNA RECETA QUE NO CIERRA → 'no cierra', cero costos, sin receta pendiente", async () => {
  // "El IVA va sobre el precio más el interno". El PIE cierra igual —el papel
  // imprime cada IVA—, pero los costos de los renglones arman $639.465,81
  // sobre un papel de $633.686,40. Es la tercera cuenta, la de la receta.
  const mala = { ...BOLETA, recetaPropuesta: { ...PROPUESTA_DYSSA, ivaIncluyeInternoEnLaBase: true } };
  const grande = modeloGrande(() => respuestaDeGoogle(mala));
  const { receta } = recetaDelProveedor(null);
  const { escalada, puerta } = await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });

  assert.equal(grande.llamadas.length, 1);
  assert.equal(escalada.cerro, false);
  assert.equal(escalada.propuesta, undefined, "una receta que no cierra no se propone");
  assert.equal(puerta.estado, ESTADO.MAL_LEIDO, "queda lo de Flash, como antes");
  assert.equal(puerta.proponeCostos, false);
  assert.match(escalada.texto, /tampoco cierra/);
});

test("CONTRAPRUEBA: con un renglón mal transcripto por el grande, tampoco", async () => {
  const lineas = BOLETA.lineas.map((l, i) => (i === 2 ? { ...l, subtotalImpreso: 110401.44 } : l));
  const grande = modeloGrande(() => respuestaDeGoogle({ ...PRO_DYSSA, lineas }));
  const { receta } = recetaDelProveedor(null);
  const { escalada, puerta } = await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });
  assert.equal(escalada.cerro, false);
  assert.equal(puerta.proponeCostos, false);
});

// ══════════════════════════════════════════════════════════════════════════
// CUÁNDO NO ENTRA
// ══════════════════════════════════════════════════════════════════════════

test("LA BOLETA QUE CIERRA CON LA RECETA DE FLASH: el grande no se llama", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA));
  const { escalada, puerta } = await leer({
    flash: flashQueContesta(BOLETA), receta: RECETA_DE_LA_MIGRACION, recetaVersion: 3, grande,
  });
  assert.equal(escalada.motivo, null);
  assert.equal(grande.llamadas.length, 0);
  assert.equal(puerta.estado, ESTADO.CARGADO);
});

test("MAURO, SIN TOTAL: SIN_TOTAL y el grande no se llama, aunque no tenga receta", async () => {
  // Las 21 líneas con cantidad de la planilla real (`sinTotal.test.mjs`).
  const fuente = fs.readFileSync(new URL("./sinTotal.test.mjs", import.meta.url), "utf8");
  const filas = [...fuente.matchAll(/\[(\d+), (\d+), (\d+), "([^"]+)"\]/g)].map(([, c, n, s, d]) => ({
    cantidad: Number(c), netoUnitario: Number(n), subtotalImpreso: Number(s), descripcion: d, bonificacion: 0,
  }));
  assert.equal(filas.length, 21);
  const mauro = { identidad: {}, lineas: filas, pie: {}, lineasEnElPapel: 21, hayTotalImpreso: false };

  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA));
  const { receta } = recetaDelProveedor(null);
  const { escalada, puerta } = await leer({ flash: flashQueContesta(mauro), receta, esGenerica: true, grande });
  assert.equal(puerta.estado, ESTADO.SIN_TOTAL);
  assert.equal(escalada.motivo, null);
  assert.equal(grande.llamadas.length, 0);
});

test("SI FLASH NO LEYÓ —cuota, caído, cortada— el grande no entra: no hubo lectura que no alcance", () => {
  for (const motivo of [MOTIVO_LECTURA.CUOTA_AGOTADA, MOTIVO_LECTURA.SERVICIO_CAIDO, MOTIVO_LECTURA.LECTURA_CORTADA]) {
    assert.equal(motivoDeEscalada({ resultado: { ok: false, motivo }, puerta: null, esGenerica: true }), null);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// SIN RECETA NI EXPLICACIÓN
// ══════════════════════════════════════════════════════════════════════════

test("PROVEEDOR SIN RECETA NI EXPLICACIÓN: escala, y con una respuesta que cierra deja receta pendiente", async () => {
  // Flash lee los nueve con la genérica y el pie cierra: el caso (c) igual
  // entra, porque nadie confirmó cómo factura este proveedor.
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA));
  const { receta, esGenerica } = recetaDelProveedor(null);
  assert.equal(esGenerica, true);
  const { escalada } = await leer({ flash: flashQueContesta(BOLETA), receta, esGenerica, grande });

  assert.equal(escalada.motivo, ESCALADA.SIN_RECETA);
  assert.equal(grande.llamadas.length, 1);
  assert.equal(escalada.cerro, true);
  assert.ok(escalada.propuesta);
  // Sin explicación, el pedido no trae ninguna: el grande interpreta solo.
  const pedido = grande.llamadas[0].cuerpo.contents[0].parts[0].text;
  assert.doesNotMatch(pedido, /<<<EXPLICACIÓN/);
  // Y la transcripción de Flash va como REFERENCIA, con principio y fin.
  assert.match(pedido, /<<<TRANSCRIPCIÓN\n[\s\S]+\nTRANSCRIPCIÓN>>>/);
  assert.match(pedido, /SOLO COMO REFERENCIA/);
});

test("CON EXPLICACIÓN, VA MARCADA COMO EN #157", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA));
  const receta = { ...RECETA_DE_LA_MIGRACION, explicacion: "La harina va al 10,5." };
  await leer({ flash: flashQueContesta(FLASH_CORTA), receta, recetaVersion: 3, grande });
  const pedido = grande.llamadas[0].cuerpo.contents[0].parts[0].text;
  assert.match(pedido, /<<<EXPLICACIÓN\nLa harina va al 10,5\.\nEXPLICACIÓN>>>/);
});

// ══════════════════════════════════════════════════════════════════════════
// EL TITULAR, Y EL RESPALDO SOLO SI EL TITULAR NO PUDO CONTESTAR
// ══════════════════════════════════════════════════════════════════════════

const error = (status, mensaje) => () => ({
  ok: false, status, text: async () => JSON.stringify({ error: { message: mensaje } }),
});
const vencida = () => { const e = new Error("tarde"); e.name = "TimeoutError"; throw e; };

/** Lee la boleta corta de DYSSA sin receta, con titular y respaldo contestando lo suyo. */
async function conTitularQue(titular, respaldo = () => respuestaDeGoogle(PRO_DYSSA)) {
  const grande = modeloGrande((modelo) => (modelo === TITULAR ? titular() : respaldo()));
  const { receta } = recetaDelProveedor(null);
  const r = await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });
  return { ...r, grande };
}

test("TITULAR CON 404 —el preview dado de baja— → el respaldo lee, cierra, y queda anotado quién respondió", async () => {
  const { escalada, puerta, lectura, grande } = await conTitularQue(error(404, "models/gemini-3.1-pro-preview is not found"));
  assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR, RESPALDO]);
  assert.deepEqual(
    escalada.llamadas.map((l) => [l.lector, l.ok, l.motivo, l.escalada]),
    [
      [TITULAR, false, MOTIVO_LECTURA.MODELO_NO_EXISTE, ESCALADA.FALTAN_RENGLONES],
      [RESPALDO, true, null, ESCALADA.FALTAN_RENGLONES],
    ]
  );
  assert.equal(escalada.cerro, true);
  assert.equal(escalada.modelo, RESPALDO, "la propuesta la dejó el respaldo");
  assert.deepEqual(costosDeLaRecepcion(puerta, lectura), COSTO_ESPERADO);
});

test("TITULAR CON CUOTA AGOTADA → el respaldo", async () => {
  const { escalada, grande } = await conTitularQue(
    error(429, "Quota exceeded for metric generate_content_free_tier_requests")
  );
  assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR, RESPALDO]);
  assert.equal(escalada.llamadas[0].motivo, MOTIVO_LECTURA.CUOTA_AGOTADA);
  assert.equal(escalada.cerro, true);
});

test("TITULAR CAÍDO, VENCIDO O QUE NO ACEPTA EL FORMATO → el respaldo", async () => {
  for (const [titular, motivo] of [
    [error(503, "high demand"), MOTIVO_LECTURA.SERVICIO_CAIDO],
    [vencida, MOTIVO_LECTURA.TARDO_DEMASIADO],
    // El 400 con que la API dice que no acepta lo que se le mandó: que el 3.1
    // tome fotos no está medido.
    [error(400, "Unsupported MIME type: image/jpeg"), MOTIVO_LECTURA.PEDIDO_RECHAZADO],
  ]) {
    const { escalada, grande } = await conTitularQue(titular);
    assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR, RESPALDO], motivo);
    assert.equal(escalada.llamadas[0].motivo, motivo);
    assert.equal(escalada.cerro, true, motivo);
  }
});

test("RESPUESTA ILEGIBLE O CORTADA DEL TITULAR → NO pasa al respaldo", async () => {
  // Contestó, mal. Probar con otro hasta que alguno diga algo es lo que la
  // cadena existe para no hacer.
  for (const [titular, motivo] of [
    [() => ({ ok: true, status: 200, json: async () => { throw new Error("no es JSON"); } }), MOTIVO_LECTURA.RESPUESTA_ILEGIBLE],
    [() => respuestaDeGoogle(PRO_DYSSA, { finishReason: "MAX_TOKENS" }), MOTIVO_LECTURA.LECTURA_CORTADA],
  ]) {
    const { escalada, puerta, grande } = await conTitularQue(titular);
    assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR], motivo);
    assert.equal(escalada.llamadas[0].motivo, motivo);
    assert.equal(escalada.cerro, false);
    assert.match(escalada.texto, /No se pudo interpretar el papel/);
    assert.match(escalada.texto, /Volver a leer puede servir/);
    assert.equal(puerta.proponeCostos, false, "queda lo de Flash");
  }
  assert.ok(!MOTIVOS_QUE_PASAN_EN_LA_ESCALADA.includes(MOTIVO_LECTURA.RESPUESTA_ILEGIBLE));
  assert.ok(!MOTIVOS_QUE_PASAN_EN_LA_ESCALADA.includes(MOTIVO_LECTURA.LECTURA_CORTADA));
});

test("UNA LECTURA DEL TITULAR QUE NO CIERRA TAMPOCO PASA: el respaldo no se llama", async () => {
  const mala = { ...BOLETA, recetaPropuesta: { ...PROPUESTA_DYSSA, ivaIncluyeInternoEnLaBase: true } };
  const { escalada, grande } = await conTitularQue(() => respuestaDeGoogle(mala));
  assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR]);
  assert.equal(escalada.cerro, false);
});

test("SI EL GRANDE NO TERMINA —titular y respaldo vencen su espera— LA LECTURA DE FLASH NO SE PIERDE", async () => {
  // Lo que la ruta guarda cuando la escalada no cerró es lo de Flash, con su
  // estado: la boleta corta queda MAL_LEIDO con su renglón, no "sin leer".
  const { escalada, puerta, lectura, grande } = await conTitularQue(vencida, vencida);
  assert.deepEqual(grande.llamadas.map((l) => l.modelo), [TITULAR, RESPALDO]);
  assert.deepEqual(escalada.llamadas.map((l) => l.motivo), [MOTIVO_LECTURA.TARDO_DEMASIADO, MOTIVO_LECTURA.TARDO_DEMASIADO]);
  assert.equal(escalada.cerro, false);
  assert.equal(lectura.lineas.length, 1, "es la lectura de Flash");
  assert.equal(puerta.estado, ESTADO.MAL_LEIDO);
  assert.equal(puerta.aGuardar.lineasTranscriptas, 1);
  assert.match(escalada.texto, /No se pudo interpretar el papel con el lector grande: tardó más de lo que se lo espera/);
  assert.match(escalada.texto, /Volver a leer puede servir/);
  // Y la ruta guarda ESA lectura: solo la reemplaza la del grande si cerró.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(ruta, /if \(escalada\.cerro\) \{\s*resultado = \{ \.\.\.resultado, ok: true, motivo: null, lectura: escalada\.lectura \};/);
});

test("SI LOS DOS FALLAN, DOS LLAMADAS Y NI UNA MÁS, y el texto dice que releer puede servir", async () => {
  const { escalada, grande } = await conTitularQue(error(503, "high demand"), error(503, "high demand"));
  assert.equal(grande.llamadas.length, 2);
  assert.equal(escalada.cerro, false);
  assert.match(escalada.texto, /Volver a leer puede servir/);
});

test("LA LLAMADA QUE SALIÓ BIEN TAMBIÉN SE ANOTA, con su modelo y su caso", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA));
  const { receta } = recetaDelProveedor(null);
  const { escalada } = await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });
  // `tokens` lo cubre su propio candado: acá, que se anota el resto.
  const [{ duracionMs, tokens, respuestaCruda, ...llamada }] = escalada.llamadas;
  assert.deepEqual(llamada, { lector: TITULAR, ok: true, motivo: null, detalle: null, escalada: ESCALADA.FALTAN_RENGLONES });
  // Y lo que contestó, tal cual: sin esto Secco #256 quedó sin diagnóstico.
  assert.equal(respuestaCruda, JSON.stringify(PRO_DYSSA));
  assert.ok(Number.isInteger(duracionMs) && duracionMs >= 0, "la llamada anota cuánto tardó");
  assert.equal(escalada.modelo, TITULAR);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS MODELOS
// ══════════════════════════════════════════════════════════════════════════

test("LOS DOS NOMBRES EXACTOS, MEDIDOS CONTRA LA API EL 2026-10-09", async () => {
  const { MODELO_PRO, MODELO_PRO_RESPALDO } = await import("./gemini.js");
  assert.equal(MODELO_PRO, "gemini-3.1-pro-preview");
  assert.equal(MODELO_PRO_RESPALDO, "gemini-2.5-pro");
  // Ninguno de los descartados: generan imágenes, voz, música o investigan.
  for (const descartado of [
    "gemini-2.5-pro-preview-tts", "gemini-3.1-pro-preview-customtools", "gemini-3-pro-image",
    "gemini-3-pro-image-preview", "nano-banana-pro-preview", "lyria-3-pro-preview",
    "deep-research-pro-preview-12-2025",
  ]) {
    assert.notEqual(MODELO_PRO, descartado);
    assert.notEqual(MODELO_PRO_RESPALDO, descartado);
  }
});

test("SIN CLAVE NO SE LLAMA A NADA y la lectura es la de antes", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA), {});
  const { receta } = recetaDelProveedor(null);
  const { escalada } = await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });
  assert.equal(escalada.motivo, ESCALADA.FALTAN_RENGLONES, "el caso existe");
  assert.equal(escalada.llamo, false, "pero no hay a quién llamar");
  assert.equal(grande.llamadas.length, 0);
});

test("UN ALIAS MÓVIL NO SE USA, NI DE TITULAR NI DE RESPALDO", async () => {
  assert.equal(esAliasMovil("gemini-pro-latest"), true);
  assert.equal(esAliasMovil(TITULAR), false);
  assert.equal(esAliasMovil(RESPALDO), false);
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA), {
    GEMINI_API_KEY: "x", GEMINI_MODELO_PRO: "gemini-pro-latest", GEMINI_MODELO_PRO_RESPALDO: "gemini-2.5-pro-latest",
  });
  assert.equal(grande.interpretes.titular.disponible().ok, false);
  assert.equal(grande.interpretes.respaldo.disponible().ok, false);
  const { receta } = recetaDelProveedor(null);
  await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });
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
  assert.match(avisos[0].texto, /pasa a su respaldo, gemini-2\.5-pro/);
  assert.equal(avisos[1].texto, "modelo de lectura verificado: gemini-2.5-pro (el respaldo del grande, para cuando Flash no alcanza)");
  // Con los dos vigentes, los dos se nombran como verificados.
  const bien = await verificarModelosPro({ env: { GEMINI_API_KEY: "x" }, fetchImpl: async () => ({ ok: true, status: 200 }) });
  assert.deepEqual(bien.map((a) => a.grave), [false, false]);
  assert.match(bien[0].texto, /^modelo de lectura verificado: gemini-3\.1-pro-preview/);
});

test("EL GRANDE SE LLAMA POR SU NOMBRE Y CON LA SALIDA ESTRUCTURADA DE LA INTERPRETACIÓN", async () => {
  const grande = modeloGrande(() => respuestaDeGoogle(PRO_DYSSA));
  const { receta } = recetaDelProveedor(null);
  await leer({ flash: flashQueContesta(FLASH_CORTA), receta, esGenerica: true, grande });
  assert.match(grande.llamadas[0].url, /\/gemini-3\.1-pro-preview:generateContent$/);
  const { generationConfig } = grande.llamadas[0].cuerpo;
  assert.equal(generationConfig.responseMimeType, "application/json");
  assert.deepEqual(generationConfig.responseSchema, esquemaDeInterpretacion());
  // Sin tope de salida bajo: no se le pone ninguno.
  assert.equal(generationConfig.maxOutputTokens, undefined);
});

test("EL ESQUEMA NO OBLIGA A INVENTAR: el porcentaje no se pide y lo derivable es opcional", () => {
  const e = esquemaDeInterpretacion();
  assert.ok(e.required.includes("recetaPropuesta"));
  const p = e.properties.recetaPropuesta;
  assert.deepEqual(p.required, ["dondeVieneElIva", "percepciones"]);
  assert.deepEqual(p.properties.dondeVieneElIva.enum, ["POR_RENGLON", "AL_PIE", "YA_INCLUIDO"]);
  assert.equal(p.properties.percepciones.items.properties.pct, undefined, "el porcentaje es una cuenta");
  assert.ok(!p.required.includes("tieneImpuestoInterno"), "se deriva de los internos transcriptos");
  // La lectura trae todos los campos que la receta puede encender.
  assert.ok(e.properties.lineas.items.properties.alicuotaIva);
  assert.ok(e.properties.lineas.items.properties.internoImpreso);
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

test("LA RUTA DE LEER ESCALA UNA VEZ, ANOTA LA LLAMADA CON SU CASO Y LEE CON LA RECETA QUE CERRÓ", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.equal((ruta.match(/await escalarAlModeloGrande\(/g) || []).length, 1, "una sola escalada por pedido");
  assert.match(ruta, /interpretes: armarInterpretes\(\)/);
  assert.match(ruta, /archivos: paraLeer/, "las mismas fotos achicadas que leyó Flash");
  // Las llamadas del grande —titular y respaldo— entran a la bitácora, con su
  // modelo y su caso; la propuesta guarda cuál respondió.
  assert.match(ruta, /\.\.\.escalada\.llamadas,/);
  assert.match(ruta, /modelo: escalada\.modelo \?\? ""/);
  assert.match(ruta, /escalada: i\.escalada \?\? null/);
  // La puerta corre con la receta con que se LEYÓ.
  assert.match(ruta, /receta: recetaDeLaLectura,\s*recetaVersion: versionDeLaLectura/);
  // La propuesta queda pendiente solo si cerró, y en su tabla.
  assert.match(ruta, /if \(escalada\.cerro && escalada\.propuesta\)/);
  assert.match(ruta, /recetaPropuestaProveedor\.upsert\(/);
  assert.doesNotMatch(ruta, /recetaProveedor\.(upsert|create|update)\(/, "la ruta de leer no confirma recetas");
  // Y la pantalla recibe la frase.
  assert.match(ruta, /texto: escalada\.texto/);
});

test("CONFIRMAR LA PROPUESTA: aReceta, la versión sube, y la propuesta se borra en la misma transacción", () => {
  const ruta = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  const bloque = ruta.slice(ruta.indexOf("if (body?.confirmarPropuesta === true)"), ruta.indexOf("const variacionCruda"));
  assert.ok(bloque.length > 100, "desapareció la confirmación");
  assert.match(bloque, /const receta = aReceta\(pendiente\.respuestas\)/);
  assert.match(bloque, /version: \{ increment: 1 \}/);
  assert.match(bloque, /version: 1/);
  assert.match(bloque, /prisma\.\$transaction\(async \(tx\) => \{[\s\S]*tx\.recetaProveedor\.upsert[\s\S]*tx\.recetaPropuestaProveedor\.delete/);
  // El GET la devuelve con su lectura, para dibujarla sin otra consulta.
  assert.match(ruta, /receta: aReceta\(pendiente\.respuestas\)/);
  assert.match(ruta, /interpretaSinExplicacion: Object\.values\(armarInterpretes\(\)\)\.some\(\(i\) => i\.disponible\(\)\.ok === true\)/);
});

test("LA PANTALLA DE RECETAS MUESTRA LA PROPUESTA EN «ASÍ LO ENTENDIÓ» Y GUARDAR LA CONFIRMA", () => {
  const p = codigoDe("components/compras-proveedor/ExplicacionDelPapel.jsx");
  assert.match(p, /setLectura\(d\.propuesta\.lectura\)/);
  assert.match(p, /setReceta\(d\.propuesta\.receta\)/);
  assert.match(p, /\.\.\.\(propuesta \? \{ confirmarPropuesta: true \} : \{\}\)/);
  assert.match(p, /\{propuesta && \(\s*<p[^>]*>\{TEXTO_PROPUESTA\}<\/p>/);
  // Descartarla en pantalla hace que guardar ya no la confirme.
  assert.match(p, /setCorrecciones\(\{\}\);\s*setPropuesta\(null\);/);
});

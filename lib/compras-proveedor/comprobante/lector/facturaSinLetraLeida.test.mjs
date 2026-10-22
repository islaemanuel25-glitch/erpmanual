// UNA FACTURA CUYA LETRA NO SE LEYÓ NO ES UN PAPEL "SIN FACTURA".
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/facturaSinLetraLeida.test.mjs
//
// ── EL CASO (Coca-Cola #259, 2026-10-22) ──────────────────────────────────
//
// La receta propuesta de Coca-Cola quedó titulada "Cómo viene la sin factura
// (remito, planilla)" con un texto que describe IVA, internos y "PERCEP. Y
// OTROS" al pie. El lector no leyó la letra, y `tipoDePapel` manda a "sin
// factura" todo lo que no trae una: confirmarla la habría guardado como la
// receta del papel en negro de Coca-Cola.
//
// Decisión de Emanuel: con IVA o percepciones discriminados el papel NO es
// "sin factura", y una letra no leída no cae ahí por defecto. Sin letra hace
// falta además que el lector conteste, aparte, que el papel NO discrimina
// impuestos. Si no, el tipo no se sabe: el papel se lee igual —su costo es lo
// impreso— pero no se propone ni se usa ninguna receta.
//
// ── DE DÓNDE SALEN LOS PAPELES ────────────────────────────────────────────
//
// La factura A de DAS de `lecturaInterpretada.fixture.json` —IVA 21 % y
// percepción al pie, como la de Coca-Cola— con la identidad SIN la letra, que
// es exactamente lo que devolvió el lector sobre el papel de Coca-Cola. Y la
// "X" de Secco, que es el papel sin factura de verdad. Las respuestas pasan por
// el intérprete de Gemini de verdad, con el `fetch` simulado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { armarInterpretes } from "./gemini.js";
import { escalarAlModeloGrande, ESCALADA } from "./escalada.js";
import { normalizarLectura } from "./contrato.js";
import { esquemaInterpretado, instruccionesInterpretadas } from "./lecturaInterpretada.js";
import { tipoParaLaReceta, TIPO_DE_PAPEL } from "../explicacionPorTipo.js";

const { das, secco } = JSON.parse(
  fs.readFileSync(new URL("../lecturaInterpretada.fixture.json", import.meta.url), "utf8")
);
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];
const ENV = { GEMINI_API_KEY: "x" };

/** La factura de DAS como la leyó el lector en Coca-Cola: sin la letra. */
function facturaSinLetra(extra = {}) {
  return {
    identidad: {}, lineasEnElPapel: das.lineasEnElPapel, hayTotalImpreso: true,
    discriminaImpuestos: true, pie: das.pie, lineas: das.lineas, explicacion: das.explicacionPro, ...extra,
  };
}

const flash = (cruda) => ({ ok: true, lectura: normalizarLectura(cruda, { interpretada: true }) });

const respuestaDeGoogle = (json) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(json) }] } }],
    usageMetadata: { promptTokenCount: 2400, candidatesTokenCount: 1800 },
  }),
});

function grandeQueContesta(json) {
  const pedidos = [];
  const interpretes = armarInterpretes({
    env: ENV,
    fetchImpl: async (_url, init) => {
      pedidos.push(JSON.parse(init.body));
      return respuestaDeGoogle(json);
    },
  });
  return { interpretes, pedidos };
}

// ══════════════════════════════════════════════════════════════════════════
// QUÉ TIPO TIENE UN PAPEL
// ══════════════════════════════════════════════════════════════════════════

test("CON LETRA LEÍDA, EL TIPO ES LA LETRA", () => {
  assert.equal(tipoParaLaReceta({ identidad: { tipo: "A" }, discriminaImpuestos: true }), "A");
  assert.equal(tipoParaLaReceta({ identidad: { tipo: "b" } }), "B");
});

test("SIN LETRA Y CON IVA O PERCEPCIONES APARTE, EL TIPO NO SE SABE: NO ES «SIN FACTURA»", () => {
  assert.equal(tipoParaLaReceta({ identidad: {}, discriminaImpuestos: true }), null);
});

test("SIN LETRA Y SIN RESPUESTA, TAMPOCO: UNA LETRA NO LEÍDA NO CAE EN «SIN FACTURA» POR DEFECTO", () => {
  assert.equal(tipoParaLaReceta({ identidad: {} }), null);
  assert.equal(tipoParaLaReceta({ identidad: {}, discriminaImpuestos: null }), null);
  assert.equal(tipoParaLaReceta(null), null);
});

test("SIN LETRA Y SIN IMPUESTOS APARTE, ES «SIN FACTURA»: el FALSE es una respuesta, no un vacío", () => {
  assert.equal(tipoParaLaReceta({ identidad: {}, discriminaImpuestos: false }), TIPO_DE_PAPEL.SIN_FACTURA);
  // La "X" de Secco no es una letra de factura: cuenta como sin letra.
  assert.equal(tipoParaLaReceta({ identidad: { tipo: "X" }, discriminaImpuestos: false }), TIPO_DE_PAPEL.SIN_FACTURA);
  assert.equal(tipoParaLaReceta({ identidad: { tipo: "X" }, discriminaImpuestos: true }), null);
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE HACE LA ESCALADA CON ELLO
// ══════════════════════════════════════════════════════════════════════════

test("COCA-COLA: SIN RECETA, EL GRANDE LEE LA FACTURA SIN VER LA LETRA → cierra, pero NO propone receta", async () => {
  const grande = grandeQueContesta(facturaSinLetra());
  const r = await escalarAlModeloGrande({
    resultado: { ok: false, motivo: null }, explicaciones: [], sinExplicacion: true,
    interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.equal(r.motivo, ESCALADA.SIN_RECETA);
  // La lectura queda y cierra: la mercadería se recibe con lo impreso.
  assert.equal(r.cerro, true);
  assert.equal(r.lectura.lineas.length, 3);
  // Pero no se guarda como la receta de ningún tipo.
  assert.equal(r.propuesta, null, "una factura sin letra leída quedó propuesta como «sin factura»");
  assert.equal(r.receta.tipoComprobante, null);
  assert.match(r.texto, /No se vio la letra de la factura/);
  assert.ok(!/Recetas de facturas/.test(r.texto));
});

test("CONTRAPRUEBA: CON LA LETRA LEÍDA, LA MISMA FACTURA SÍ SE PROPONE, PARA SU LETRA", async () => {
  const grande = grandeQueContesta(facturaSinLetra({ identidad: { tipo: "A" } }));
  const r = await escalarAlModeloGrande({
    resultado: { ok: false, motivo: null }, explicaciones: [], sinExplicacion: true,
    interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.deepEqual(r.propuesta, { explicacion: das.explicacionPro, tipoComprobante: "A" });
});

test("EL PAPEL EN NEGRO DE VERDAD —Secco— SIGUE PROPONIENDO SU RECETA «SIN FACTURA»", async () => {
  const grande = grandeQueContesta({
    identidad: secco.identidad, lineasEnElPapel: secco.lineasEnElPapel, hayTotalImpreso: true,
    discriminaImpuestos: false, pie: secco.pie, lineas: secco.lineas, explicacion: secco.explicacionPro,
  });
  const r = await escalarAlModeloGrande({
    resultado: { ok: false, motivo: null }, explicaciones: [], sinExplicacion: true,
    interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.equal(r.propuesta?.tipoComprobante, TIPO_DE_PAPEL.SIN_FACTURA);
});

test("CON LA RECETA «SIN FACTURA» CONFIRMADA, UNA FACTURA SIN LETRA NO SE LEE CON ELLA", async () => {
  // Flash leyó la factura sin ver la letra. Antes, el tipo caía en "sin
  // factura" y se juzgaba con la receta del papel en negro.
  const confirmadas = [{ tipoComprobante: "SIN_FACTURA", explicacion: "Remito: el precio es lo que se paga.", version: 2 }];
  const grande = grandeQueContesta(facturaSinLetra());
  const r = await escalarAlModeloGrande({
    resultado: flash(facturaSinLetra()), explicaciones: confirmadas, interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.equal(r.recetaDeFlash.explicacion, null, "la factura se leyó con la receta del papel sin factura");
  assert.equal(r.recetaDeFlash.tipoComprobante, null);
  assert.equal(r.versionDeFlash, null);
  // Escala como sin receta —el grande puede ver la letra—, y si tampoco la ve,
  // no propone nada ni toca la confirmada.
  assert.equal(r.motivo, ESCALADA.SIN_RECETA);
  assert.equal(r.propuesta, null);
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE SE LE PIDE AL MODELO
// ══════════════════════════════════════════════════════════════════════════

test("LA PREGUNTA VA APARTE Y OPCIONAL: sin respuesta no se pierde la lectura", async () => {
  const esquema = esquemaInterpretado();
  assert.deepEqual(esquema.properties.discriminaImpuestos, { type: "boolean" });
  // Obligatoria, una respuesta sin ella se trataría como cortada y se perdería
  // la lectura entera por una pregunta de clasificación.
  assert.ok(!esquema.required.includes("discriminaImpuestos"));
  for (const texto of [instruccionesInterpretadas({}), instruccionesInterpretadas({ explicacion: "x" })]) {
    assert.match(texto, /`discriminaImpuestos` es true si el papel muestra el IVA o alguna percepción/);
    assert.match(texto, /Una factura que discrimina IVA o percepciones TIENE letra/);
  }
  // Y la respuesta llega a la lectura: true, false o null, nunca false por omisión.
  assert.equal(normalizarLectura({ discriminaImpuestos: false }).discriminaImpuestos, false);
  assert.equal(normalizarLectura({}).discriminaImpuestos, null);
  const sinRespuesta = await grandeQueContesta(facturaSinLetra({ discriminaImpuestos: undefined }))
    .interpretes.titular.interpretar({ archivos: FOTO });
  assert.equal(sinRespuesta.ok, true, "una respuesta sin la pregunta nueva se dio por cortada");
});

// ══════════════════════════════════════════════════════════════════════════
// LA QUE YA ESTABA PENDIENTE EN PRODUCCIÓN SE DESCARTA
// ══════════════════════════════════════════════════════════════════════════

test("LA MIGRACIÓN BORRA SOLO LA PROPUESTA «SIN FACTURA» DE COCA-COLA QUE NOMBRA PERCEPCIONES", () => {
  // Ejercida contra Postgres con tres propuestas —la de Coca-Cola "sin
  // factura", la A de Coca-Cola y la "sin factura" de Secco—: borró solo la
  // primera, y la segunda corrida no encontró nada. Acá se afirma la forma, que
  // es lo que una edición posterior podría aflojar.
  const sql = fs
    .readFileSync(
      new URL(
        "../../../../prisma/migrations/20261022120000_descartar_propuesta_coca_cola_sin_factura/migration.sql",
        import.meta.url
      ),
      "utf8"
    )
    .replace(/--[^\n]*/g, "");
  // Una sola sentencia, y es sobre propuestas: ninguna receta confirmada.
  assert.equal((sql.match(/;/g) || []).length, 1);
  assert.match(sql, /DELETE FROM "RecetaPropuestaProveedor"/);
  assert.ok(!/ExplicacionPorTipo|UPDATE|DROP/i.test(sql));
  assert.match(sql, /p\.nombre ILIKE '%coca%'/);
  assert.match(sql, /rp\."tipoComprobante" = 'SIN_FACTURA'/);
  assert.match(sql, /rp\.respuestas ->> 'explicacion' ILIKE '%percep%'/);
  // Y el próximo despliegue sabe que la trae.
  const pendientes = fs.readFileSync(
    new URL("../../../../docs/deploy/MIGRACIONES-SIN-APLICAR.md", import.meta.url),
    "utf8"
  );
  assert.match(pendientes, /20261022120000_descartar_propuesta_coca_cola_sin_factura/);
});

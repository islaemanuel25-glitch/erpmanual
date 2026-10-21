// UNA PERCEPCIÓN QUE SOLO VIENE A PARTIR DE CIERTO IMPORTE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/percepcionQueDependeDelImporte.test.mjs
//
// ── EL CASO (Emanuel, 2026-10-21) ─────────────────────────────────────────
//
// Un proveedor cobra siempre IIBB, pero otra percepción del 3 % solo cuando la
// compra pasa un límite. El mismo proveedor y el mismo tipo de papel a veces la
// traen y a veces no. Lo decidido: al costo va lo impreso en ESE papel; uno sin
// el 3 % no se marca mal leído, no propone una receta nueva y no pisa la
// confirmada.
//
// ── LO QUE ESTABA MAL, MEDIDO CON UNA SONDA ANTES DE TOCAR ────────────────
//
// Si Flash sumaba el 3 % que el papel no trae —la explicación confirmada lo
// nombra—, la cuenta no cerraba, el grande leía bien y cerraba, y como su
// explicación nunca es la misma frase que la confirmada, quedaba una receta
// NUEVA propuesta para la factura A. Confirmarla habría pisado la buena. Ahora
// el grande contesta aparte si la confirmada sigue sirviendo
// (`explicacionSirve`), y si dice que sí no se propone nada.
//
// ── DE DÓNDE SALEN LOS PAPELES ────────────────────────────────────────────
//
// La factura A de DAS de `lecturaInterpretada.fixture.json`, que es exactamente
// este caso: IVA 21 % y PERCEP. IVA 3 % al pie, con la forma de
// `esquemaInterpretado`. La versión SIN el 3 % se arma de ella —el mismo papel
// con el pie en neto × 1,21— porque en el repo no hay un papel real de DAS por
// debajo del límite. Las respuestas pasan por el intérprete de Gemini de
// verdad, con el `fetch` simulado: así se prueba también que la respuesta del
// modelo llega hasta la escalada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { armarInterpretes } from "./gemini.js";
import { escalarAlModeloGrande, ESCALADA } from "./escalada.js";
import { normalizarLectura } from "./contrato.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { esquemaInterpretado, instruccionesInterpretadas } from "./lecturaInterpretada.js";
import { aCentavos } from "../impuestos.js";

const { das } = JSON.parse(fs.readFileSync(new URL("../lecturaInterpretada.fixture.json", import.meta.url), "utf8"));
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];
const ENV = { GEMINI_API_KEY: "x" };

/** La de la factura A de DAS, confirmada: nombra el 3 % porque su papel lo traía. */
const CONFIRMADAS = [{ tipoComprobante: "A", explicacion: das.explicacionPro, version: 4 }];

const redondo = (v) => Math.round(v * 100) / 100;

/** El papel de DAS CON la percepción, tal como está en el fixture. */
function conPercepcion(extra = {}) {
  return {
    identidad: das.identidad, lineasEnElPapel: das.lineasEnElPapel, hayTotalImpreso: true,
    pie: das.pie, lineas: das.lineas, explicacion: das.explicacionPro, ...extra,
  };
}

/**
 * El mismo papel SIN la percepción: cada renglón es su neto con el IVA, y el
 * total impreso, la suma de eso. `factor` es lo que el LECTOR multiplicó: 1,21
 * si leyó bien, 1,24 si sumó el 3 % que este papel no trae.
 */
function sinPercepcion({ factor = 1.21, explicacion = "sin el 3 %", ...extra } = {}) {
  const lineas = das.lineas.map((l) => ({ ...l, costoFinal: redondo(l.importeImpreso * factor) }));
  const total = redondo(das.lineas.reduce((a, l) => a + redondo(l.importeImpreso * 1.21), 0));
  return {
    identidad: das.identidad, lineasEnElPapel: das.lineasEnElPapel, hayTotalImpreso: true,
    pie: { total }, lineas, explicacion, ...extra,
  };
}

/** Lo que devolvió Flash: una lectura ya normalizada. */
const flash = (cruda) => ({ ok: true, lectura: normalizarLectura(cruda, { interpretada: true }) });

/** Una respuesta de `generateContent` con este JSON adentro. */
const respuestaDeGoogle = (json) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(json) }] } }],
    usageMetadata: { promptTokenCount: 2400, candidatesTokenCount: 1800 },
  }),
});

/** El grande de verdad —el de la ruta—, contestando siempre lo mismo. */
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

const sumaCentavos = (lectura) => lectura.lineas.reduce((a, l) => a + aCentavos(l.costoFinal), 0);

// ══════════════════════════════════════════════════════════════════════════
// LO QUE YA ANDABA: FLASH LEE LO IMPRESO
// ══════════════════════════════════════════════════════════════════════════

test("SIN EL 3 % Y LEÍDO COMO ESTÁ: cierra, el costo no lleva la percepción, y no llama a nadie", async () => {
  const grande = grandeQueContesta(conPercepcion());
  const r = await escalarAlModeloGrande({
    resultado: flash(sinPercepcion()), explicaciones: CONFIRMADAS, interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.equal(r.motivo, null);
  assert.equal(r.llamo, false);
  assert.equal(grande.pedidos.length, 0);
  const lectura = flash(sinPercepcion()).lectura;
  const puerta = pasarPorLaPuerta({ lectura, receta: r.recetaDeFlash, recetaVersion: r.versionDeFlash });
  assert.equal(puerta.estado, ESTADO.CARGADO, "un papel sin el 3 % quedó mal leído");
  // La mortadela: 192.000 de neto con el 21 %, y nada más.
  assert.equal(lectura.lineas[2].costoFinal, 232320);
  // Y se lee con la receta confirmada, su versión.
  assert.equal(r.versionDeFlash, 4);
});

test("CON EL 3 % IMPRESO: cierra y el costo SÍ la lleva", async () => {
  const grande = grandeQueContesta(conPercepcion());
  const r = await escalarAlModeloGrande({
    resultado: flash(conPercepcion()), explicaciones: CONFIRMADAS, interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.equal(r.llamo, false);
  const lectura = flash(conPercepcion()).lectura;
  assert.equal(pasarPorLaPuerta({ lectura, receta: r.recetaDeFlash }).estado, ESTADO.CARGADO);
  assert.equal(lectura.lineas[2].costoFinal, 238080, "la mortadela perdió la percepción");
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE ESTABA MAL: FLASH SUMA EL 3 % QUE NO VIENE
// ══════════════════════════════════════════════════════════════════════════

test("FLASH SUMA EL 3 % QUE EL PAPEL NO TRAE: el grande lo lee como está, cierra, y NO propone receta", async () => {
  const grande = grandeQueContesta(
    sinPercepcion({
      explicacion: "Factura A de Das: IVA 21 % al pie; este papel no trae la percepción del 3 %.",
      explicacionSirve: true,
    })
  );
  const r = await escalarAlModeloGrande({
    resultado: flash(sinPercepcion({ factor: 1.24 })),
    explicaciones: CONFIRMADAS,
    interpretes: grande.interpretes,
    archivos: FOTO,
  });
  assert.equal(r.motivo, ESCALADA.NO_CIERRA);
  assert.equal(r.cerro, true, "un papel sin el 3 % quedó mal leído");
  assert.equal(r.propuesta, null, "un papel sin el 3 % propuso una receta nueva");
  // Lo que queda es la lectura del grande: lo impreso, sin la percepción.
  assert.equal(sumaCentavos(r.lectura), aCentavos(sinPercepcion().pie.total));
  assert.equal(r.lectura.lineas[2].costoFinal, 232320);
  // Y se lee con la versión confirmada, que no se tocó.
  assert.equal(r.recetaVersion, 4);
  assert.equal(CONFIRMADAS[0].explicacion, das.explicacionPro);
  // El texto no manda a confirmar nada.
  assert.ok(!/Recetas de facturas/.test(r.texto), r.texto);
});

test("CONTRAPRUEBA: SI EL GRANDE DICE QUE EL PAPEL ESTÁ ARMADO DE OTRA FORMA, SÍ PROPONE", async () => {
  // Es la forma alternativa de la decisión del 2026-10-08: no se apagó.
  // FALSE es una respuesta, no un vacío: no se confunde con "no contestó".
  const grande = grandeQueContesta(
    sinPercepcion({ explicacion: "Ahora el precio de DAS trae el IVA adentro.", explicacionSirve: false })
  );
  const r = await escalarAlModeloGrande({
    resultado: flash(sinPercepcion({ factor: 1.24 })), explicaciones: CONFIRMADAS, interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.equal(r.cerro, true);
  assert.deepEqual(r.propuesta, { explicacion: "Ahora el precio de DAS trae el IVA adentro.", tipoComprobante: "A" });
});

test("SI EL GRANDE NO CONTESTA LA PREGUNTA, SE PROPONE COMO SIEMPRE: el silencio no esconde un papel nuevo", async () => {
  const grande = grandeQueContesta(sinPercepcion({ explicacion: "Otra forma." }));
  const r = await escalarAlModeloGrande({
    resultado: flash(sinPercepcion({ factor: 1.24 })), explicaciones: CONFIRMADAS, interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.equal(r.propuesta?.tipoComprobante, "A");
});

test("EL «SIRVE» SOLO CUENTA SOBRE LA CONFIRMADA CON LA QUE LEYÓ: sin receta, propone igual", async () => {
  // Proveedor sin ninguna explicación: el grande leyó sin guía, así que su
  // «sirve» no habla de nada confirmado.
  const grande = grandeQueContesta(sinPercepcion({ explicacion: "La primera de DAS.", explicacionSirve: true }));
  const r = await escalarAlModeloGrande({
    resultado: { ok: false, motivo: null }, explicaciones: [], sinExplicacion: true,
    interpretes: grande.interpretes, archivos: FOTO,
  });
  assert.equal(r.motivo, ESCALADA.SIN_RECETA);
  assert.deepEqual(r.propuesta, { explicacion: "La primera de DAS.", tipoComprobante: "A" });
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE SE LE PIDE AL MODELO
// ══════════════════════════════════════════════════════════════════════════

test("LA PREGUNTA VA APARTE, OPCIONAL, Y SOLO CUANDO HAY UNA CONFIRMADA DE GUÍA", async () => {
  const esquema = esquemaInterpretado();
  assert.deepEqual(esquema.properties.explicacionSirve, { type: "boolean" });
  assert.ok(!esquema.required.includes("explicacionSirve"), "obligatoria sería una orden de inventar");

  const guiado = instruccionesInterpretadas({ explicacion: das.explicacionPro, motivo: "NO_CIERRA" });
  assert.match(guiado, /`explicacionSirve`/);
  const sinGuia = instruccionesInterpretadas({ motivo: "SIN_RECETA" });
  assert.ok(!/explicacionSirve/.test(sinGuia), "se preguntó por una explicación que no se le dio");
  // Flash, con las de todos los tipos, tampoco: su respuesta no se usa.
  const deFlash = instruccionesInterpretadas({ explicaciones: CONFIRMADAS });
  assert.ok(!/explicacionSirve/.test(deFlash));

  // A todos: al costo va lo impreso, y la explicación no promete lo que es a veces.
  for (const texto of [guiado, sinGuia, deFlash]) {
    assert.match(texto, /Va SOLO lo que está impreso en este papel/);
    assert.match(texto, /se suma cuando viene impreso, no que viene siempre/);
  }

  // Y lo que contestó el modelo llega a la escalada por el intérprete de verdad.
  const grande = grandeQueContesta(sinPercepcion({ explicacionSirve: true }));
  const pro = await grande.interpretes.titular.interpretar({ archivos: FOTO, receta: { explicacion: das.explicacionPro } });
  assert.equal(pro.propuesta.explicacionSirve, true);
  const sinRespuesta = await grandeQueContesta(sinPercepcion()).interpretes.titular.interpretar({ archivos: FOTO });
  assert.equal(sinRespuesta.propuesta.explicacionSirve, null);
});

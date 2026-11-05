// LA FOTO SE ENDEREZA SOLA ANTES DE LEERLA, Y EL GIRO A MANO MANDA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/orientacionDeLaFoto.test.mjs
//
// Emanuel, 2026-11-05: la factura de Terrabusi (pedido #509) llegó apaisada y
// el lector se comió un renglón hasta que la giró a mano. No quiere girar a
// mano: antes de leer, se pregunta al modelo más barato para dónde corre el
// texto (`orientacion.js`, `crearDetectorDeOrientacion`).
//
// ── CÓMO SE PRUEBA SIN LLAMAR A LA IA ─────────────────────────────────────
//
// Con imágenes de verdad y sharp de verdad. El "papel" es blanco con una franja
// negra arriba, el encabezado. Se lo gira como llegaría del celular y el
// detector de mentira MIRA LA MINIATURA QUE RECIBE —dónde quedó la franja— y
// contesta lo que contestaría el modelo: cuántos grados horarios la ponen
// arriba. Después se manda la foto a leer con ese giro y se comprueba que la
// franja quedó ARRIBA. Así se ejerce la convención entera —qué miniatura se
// manda, en qué sentido es el giro y que la lectura lo aplica—, que es lo que
// un detector de mentira que contesta un número fijo no probaría.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";

import { giroParaLeer, orientarTodas, ORIGEN_DEL_GIRO, LADO_MINIATURA } from "./orientacion.js";
import { achicarParaLeer } from "./achicarFoto.js";
import { crearDetectorDeOrientacion, MODELO_ORIENTACION, ESQUEMA_ORIENTACION } from "./gemini.js";

const ANCHO = 600;
const ALTO = 900;

/** Un papel parado, con el encabezado negro arriba, girado `grados` en sentido horario. */
async function papelGirado(grados) {
  const franja = await sharp({ create: { width: ANCHO, height: 120, channels: 3, background: "#000" } }).png().toBuffer();
  const derecho = await sharp({ create: { width: ANCHO, height: ALTO, channels: 3, background: "#fff" } })
    .composite([{ input: franja, top: 0, left: 0 }])
    .jpeg()
    .toBuffer();
  return grados ? sharp(derecho).rotate(grados).jpeg().toBuffer() : derecho;
}

/** De qué lado de la imagen está la franja negra. */
async function ladoDeLaFranja(bytes) {
  const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const media = (x0, y0, x1, y1) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += data[y * w + x]; n++; }
    return s / n;
  };
  const borde = Math.max(2, Math.floor(Math.min(w, h) * 0.05));
  const lados = {
    arriba: media(0, 0, w, borde),
    abajo: media(0, h - borde, w, h),
    izquierda: media(0, 0, borde, h),
    derecha: media(w - borde, 0, w, h),
  };
  return Object.entries(lados).sort((a, b) => a[1] - b[1])[0][0];
}

/** El "modelo": mira la miniatura y dice cuántos grados horarios ponen la franja arriba. */
function detectorQueMira() {
  const recibidas = [];
  const detectar = async (miniatura) => {
    recibidas.push(miniatura);
    const lado = await ladoDeLaFranja(miniatura.bytes);
    const giro = { arriba: 0, derecha: 270, abajo: 180, izquierda: 90 }[lado];
    return { ok: true, giro, lector: MODELO_ORIENTACION, escalada: "ORIENTACION" };
  };
  return { detectar, recibidas };
}

const foto = async (grados, extra = {}) => ({ bytes: await papelGirado(grados), mime: "image/jpeg", orden: 1, giroGrados: null, ...extra });

for (const [nombre, grados, esperado] of [
  ["DE COSTADO", 270, 90],
  ["AL REVÉS", 180, 180],
  ["DERECHA", 0, 0],
]) {
  test(`UNA FOTO ${nombre}: se detecta ${esperado}°, se guarda, y viaja al lector derecha`, async () => {
    const d = detectorQueMira();
    const archivo = await foto(grados);
    const r = await giroParaLeer({ archivo, sharp, detectar: d.detectar });
    assert.equal(r.giro, esperado);
    assert.equal(r.origen, ORIGEN_DEL_GIRO.DETECTADO);
    assert.equal(r.guardar, true, "se guarda en giroGrados, como «Girar»: no se vuelve a preguntar");
    // Se preguntó con una miniatura, no con la foto entera.
    assert.equal(d.recibidas.length, 1);
    const meta = await sharp(d.recibidas[0].bytes).metadata();
    assert.ok(Math.max(meta.width, meta.height) <= LADO_MINIATURA);
    // Y la foto que se manda a leer, con ese giro, tiene el encabezado arriba.
    const leida = await achicarParaLeer({ ...archivo, giroGrados: r.giro }, sharp);
    assert.equal(await ladoDeLaFranja(leida.bytes), "arriba");
  });
}

test("EL GIRO A MANO LE GANA AL DETECTADO: no se pregunta y se lee con el suyo", async () => {
  const d = detectorQueMira();
  // Emanuel la dejó en 0 a mano sobre una foto que el detector vería de costado.
  const aMano = await giroParaLeer({ archivo: await foto(270, { giroGrados: 0 }), sharp, detectar: d.detectar });
  assert.equal(aMano.giro, 0);
  assert.equal(aMano.origen, ORIGEN_DEL_GIRO.GUARDADO);
  assert.equal(aMano.guardar, false);
  assert.equal(d.recibidas.length, 0, "no se gasta una llamada");
  const otra = await giroParaLeer({ archivo: await foto(180, { giroGrados: 90 }), sharp, detectar: d.detectar });
  assert.equal(otra.giro, 90);
  // Y la ruta guarda lo detectado solo si la columna sigue vacía: un «Girar»
  // que llegó mientras tanto no se pisa.
  const ruta = fs
    .readFileSync(new URL("../../../../app/api/compras-proveedor/comprobantes/leer/[id]/route.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.match(ruta, /where: \{ comprobanteId: comprobante\.id, orden, giroGrados: null \},\s*data: \{ giroGrados: giro \}/);
  assert.match(ruta, /giroGrados: f\.giroGrados \?\? null/);
});

test("SI LA PREGUNTA FALLA, SE LEE COMO ESTÁ Y SE VUELVE A INTENTAR LA PRÓXIMA", async () => {
  const sinCuota = async () => ({ ok: false, motivo: "CUOTA_AGOTADA", lector: MODELO_ORIENTACION, escalada: "ORIENTACION" });
  const r = await giroParaLeer({ archivo: await foto(270), sharp, detectar: sinCuota });
  assert.equal(r.giro, 0);
  assert.equal(r.origen, ORIGEN_DEL_GIRO.SIN_DETECTAR);
  assert.equal(r.guardar, false, "la columna queda vacía");
  assert.equal(r.llamada.motivo, "CUOTA_AGOTADA", "y la llamada va a la bitácora igual");
  // Un PDF no se pregunta.
  const pdf = await giroParaLeer({ archivo: { bytes: Buffer.from("%PDF"), mime: "application/pdf", orden: 1, giroGrados: null }, sharp, detectar: sinCuota });
  assert.equal(pdf.origen, ORIGEN_DEL_GIRO.NO_ES_IMAGEN);
});

test("VARIAS HOJAS: cada una con lo suyo, y solo se guarda lo detectado ahora", async () => {
  const d = detectorQueMira();
  const o = await orientarTodas(
    [await foto(270, { orden: 1 }), await foto(0, { orden: 2, giroGrados: 180 }), await foto(180, { orden: 3 })],
    { sharp, detectar: d.detectar }
  );
  assert.deepEqual(o.fotos.map((f) => f.giroGrados), [90, 180, 180]);
  assert.deepEqual(o.aGuardar, [{ orden: 1, giro: 90 }, { orden: 3, giro: 180 }]);
  assert.equal(o.llamadas.length, 2, "una por foto que nadie había mirado");
});

test("LA PREGUNTA ES UNA SOLA, BARATA: el modelo liviano, una miniatura y cuatro respuestas posibles", async () => {
  const pedidos = [];
  const fetchImpl = async (url, opciones) => {
    pedidos.push({ url, cuerpo: JSON.parse(opciones.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"giro":"90"}' }] } }], usageMetadata: {} }),
    };
  };
  const detector = crearDetectorDeOrientacion({ env: { GEMINI_API_KEY: "x" }, fetchImpl });
  const r = await detector.detectar({ bytes: Buffer.from("foto"), mime: "image/jpeg" });
  assert.equal(r.ok, true);
  assert.equal(r.giro, 90);
  assert.equal(r.escalada, "ORIENTACION");
  assert.equal(pedidos.length, 1);
  assert.match(pedidos[0].url, new RegExp(`/${MODELO_ORIENTACION}:generateContent$`));
  assert.equal(MODELO_ORIENTACION, "gemini-3.1-flash-lite");
  const partes = pedidos[0].cuerpo.contents[0].parts;
  assert.equal(partes.filter((p) => p.inline_data).length, 1, "una sola imagen");
  assert.deepEqual(pedidos[0].cuerpo.generationConfig.responseSchema, ESQUEMA_ORIENTACION);
  assert.equal(pedidos[0].cuerpo.generationConfig.thinkingConfig, undefined, "sin razonamiento");
  // Una respuesta fuera de las cuatro no sirve.
  const raro = crearDetectorDeOrientacion({
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"giro":"45"}' }] } }] }) }),
  });
  assert.equal((await raro.detectar({ bytes: Buffer.from("foto"), mime: "image/jpeg" })).ok, false);
});

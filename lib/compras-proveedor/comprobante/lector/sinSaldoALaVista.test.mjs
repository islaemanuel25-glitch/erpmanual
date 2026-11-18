// SIN SALDO EN EL LECTOR DE FOTOS: LA PANTALLA LO DICE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/sinSaldoALaVista.test.mjs
//
// El caso (2026-11-18): se terminó el saldo prepago de Gemini y Google contestó
// 402 con el cuerpo de abajo —medido: es la llamada 262 de `LlamadaLector`, la
// única guardada con ese cuerpo—. Pedido de Emanuel: que la recepción diga
// claro "No se pudo leer: el lector de fotos no tiene saldo".
//
// Lo que se encontró al revisar el camino: la recepción ya mostraba el motivo,
// pero el 402 se reconocía como "sin saldo" solo porque "prepayment" contiene
// "payment"; la escalada le agregaba "Volver a leer puede servir", que no es
// cierto sin saldo; y la relectura de Recetas seguía de largo y terminaba en
// "Guardada" en verde. Cada candado de abajo es uno de esos tramos.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { crearLectorGemini, armarInterpretes, motivoPorEstado } from "./gemini.js";
import { leerConCadena } from "./cadena.js";
import { escalarAlModeloGrande, textoDeLaEscalada } from "./escalada.js";
import { MOTIVO_LECTURA, estadoDeLaFalla, queHacerLectura } from "./contrato.js";
import { pedirLaLectura } from "../leerConTurno.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const AVISO = "No se pudo leer: el lector de fotos no tiene saldo";
// El mensaje que guardó la llamada 262. El campo `status` del cuerpo no se
// guardó y no se inventa.
const MENSAJE_402 =
  "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. Learn more at https://ai.google.dev/gemini-api/docs/billing#prepay.";
const sinSaldo = async () => ({
  ok: false,
  status: 402,
  text: async () => JSON.stringify({ error: { code: 402, message: MENSAJE_402 } }),
});
const FOTO = [{ mime: "image/jpeg", bytes: Buffer.from("x") }];

test("el 402 es sin saldo, con el cuerpo medido y con cualquier otro", () => {
  assert.equal(motivoPorEstado(402, `402 ${MENSAJE_402}`), MOTIVO_LECTURA.SIN_SALDO);
  // Contraprueba del agujero: sin "payment" en el cuerpo, antes caía en cuota agotada.
  assert.equal(motivoPorEstado(402, "402 Your credits are depleted."), MOTIVO_LECTURA.SIN_SALDO);
  assert.equal(motivoPorEstado(402, ""), MOTIVO_LECTURA.SIN_SALDO);
  // El 429 sigue mirando el cuerpo: esperar o pagar no es lo mismo.
  assert.equal(motivoPorEstado(429, "429 Resource has been exhausted."), MOTIVO_LECTURA.CUOTA_AGOTADA);
});

test("el camino de la ruta: Flash y el grande sin saldo dan el aviso, sin «volver a leer»", async () => {
  const lector = crearLectorGemini({ env: { GEMINI_API_KEY: "x" }, fetchImpl: sinSaldo });
  const resultado = await leerConCadena({ cadena: { titular: { ok: true, lector }, respaldo: null }, archivos: FOTO, receta: null });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, MOTIVO_LECTURA.SIN_SALDO);
  const escalada = await escalarAlModeloGrande({
    resultado,
    explicaciones: [],
    sinExplicacion: false,
    interpretes: armarInterpretes({ env: { GEMINI_API_KEY: "x" }, fetchImpl: sinSaldo }),
    archivos: FOTO,
  });
  // Lo que arma la ruta de leer cuando la lectura no salió.
  const error = [queHacerLectura(resultado.motivo), escalada.texto].filter(Boolean).join(" ");
  assert.ok(error.startsWith(AVISO), error);
  assert.doesNotMatch(error, /Volver a leer puede servir/);
  assert.equal(estadoDeLaFalla(resultado.motivo), 402);

  // Sin explicación confirmada —Arcor, el pedido 473— lee solo el grande, y el
  // motivo de la falla es el suyo (la rama `resultado.motivo == null` de la ruta).
  const sinFlash = { ok: false, motivo: null, lector: null, intentos: [], usoRespaldo: false, porQuePaso: null };
  const soloGrande = await escalarAlModeloGrande({
    resultado: sinFlash,
    explicaciones: [],
    sinExplicacion: true,
    interpretes: armarInterpretes({ env: { GEMINI_API_KEY: "x" }, fetchImpl: sinSaldo }),
    archivos: FOTO,
  });
  assert.equal(soloGrande.llamo, true);
  const motivo = soloGrande.llamadas.at(-1)?.motivo;
  assert.equal(motivo, MOTIVO_LECTURA.SIN_SALDO);
  const errorSoloGrande = [queHacerLectura(motivo), soloGrande.texto].filter(Boolean).join(" ");
  assert.ok(errorSoloGrande.startsWith(AVISO), errorSoloGrande);
  assert.doesNotMatch(errorSoloGrande, /Volver a leer puede servir/);
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(ruta, /error: \[queHacerLectura\(resultado\.motivo\), escalada\.texto\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(ruta, /\{ status: estadoDeLaFalla\(resultado\.motivo\) \}/);
});

test("la escalada sigue ofreciendo releer en lo que sí se arregla releyendo", () => {
  assert.match(textoDeLaEscalada({ llamo: true, cerro: false, motivoFalla: MOTIVO_LECTURA.SERVICIO_CAIDO }), /Volver a leer puede servir/);
  assert.equal(
    textoDeLaEscalada({ llamo: true, cerro: false, motivoFalla: MOTIVO_LECTURA.SIN_SALDO }),
    "No se pudo interpretar el papel con el lector grande: no tiene saldo."
  );
});

test("el turno devuelve el 402 con el aviso, y el panel de recepción lo muestra", async () => {
  const cuerpo = { ok: false, motivo: MOTIVO_LECTURA.SIN_SALDO, error: queHacerLectura(MOTIVO_LECTURA.SIN_SALDO) };
  const pedidos = [];
  const fetchImpl = async (url, init) => {
    pedidos.push(init?.method ?? "GET");
    if (init?.method === "POST") return { ok: true, status: 200, json: async () => ({ ok: true, leyendo: true, turno: "57" }) };
    return { ok: false, status: 402, json: async () => cuerpo };
  };
  const { respuesta, cuerpo: d } = await pedirLaLectura({ comprobanteId: 57, origen: "BOTON", fetchImpl, dormir: async () => {} });
  assert.deepEqual(pedidos, ["POST", "GET"]);
  assert.equal(respuesta.status, 402);
  assert.ok(d.error.startsWith(AVISO));
  // El panel de la recepción: ante un estado de error usa el texto del servidor.
  const panel = codigoDe("components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /if \(d\?\.queHacer \|\| d\?\.error\) return \{ tipo: "error", texto: d\.queHacer \|\| d\.error \};/);
  assert.match(panel, /const fallo = await mensajeDeRespuesta\(r, OPERACION\.LECTURA, d\);\s*if \(fallo\) \{\s*setMensaje\(fallo\);/);
  // Y «Volver a leer» de Corregir, igual.
  assert.match(codigoDe("components/compras-proveedor/CorregirComprobante.jsx"), /if \(!d\?\.ok\) \{\s*setMensaje\(\{ tipo: "error", texto: d\?\.error \|\|/);
});

test("la relectura de Recetas frena sin saldo, como sin cuota", () => {
  const recetas = codigoDe("components/compras-proveedor/ExplicacionDelPapel.jsx");
  assert.match(recetas, /else if \(json\?\.motivo === "CUOTA_AGOTADA" \|\| json\?\.motivo === "SIN_SALDO"\) \{\s*cortado = json\?\.error;\s*break;/);
});

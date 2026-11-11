// UN PAPEL SIN TOTAL NO SE VERIFICA CON LA SUMA DE LO LEÍDO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/mauro590.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-11 ~7:56, pedido Mauro #590) ────────────────
//
// Una planilla de GLOBO ROJO de 31 renglones, sin total impreso, con tildes y
// resaltador encima de las cantidades. Flash transcribió UNO —diciendo ver
// 30— y la pantalla dijo "✓ sin total", "Sin total impreso: verificada con la
// suma de los productos" y "Leído y verificado: 1 producto". La suma de lo que
// leyó el mismo lector se compara contra sí misma: da bien siempre.
//
// Lo que decidió Emanuel, y lo que este candado ata:
//   · sin total impreso nunca dice "verificado" ni lleva tilde;
//   · el control independiente es el conteo de renglones, y sin total lee el
//     lector grande (`motivoDeEscalada`);
//   · la pantalla dice cuántos se leyeron y, con «Hoja 1», que puede haber más
//     hojas (`textoDelPapelSinTotal`, `hayMasHojasProbables`).
//
// `mauro590.fixture.json` trae las respuestas CRUDAS de los dos lectores sobre
// la foto real, releída con este código: Flash, 1 renglón; el grande, 31.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import F from "./mauro590.fixture.json" with { type: "json" };
import { normalizarLectura } from "./lector/contrato.js";
import { pasarPorLaPuerta, ESTADO } from "./lector/puerta.js";
import { ESCALADA, escalarAlModeloGrande, motivoDeEscalada } from "./lector/escalada.js";
import { hayMasHojasProbables } from "./lector/lecturaInterpretada.js";
import { chipDeFactura, comoSeDice, textoDelPapelSinTotal } from "./pantalla.js";

const leida = (cruda, modelo) => normalizarLectura(JSON.parse(cruda), { interpretada: true, modelo });
const FLASH = leida(F.flash, "gemini-3.6-flash");
const GRANDE = leida(F.grande, "gemini-3.1-pro-preview");
const suma = (l) => l.lineas.reduce((a, x) => a + Math.round(Number(x.subtotalImpreso) * 100), 0) / 100;

// Sin comentarios: un candado que busca texto encuentra la prosa (regla 5).
const codigoDe = (ruta) =>
  fs.readFileSync(new URL(ruta, import.meta.url), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("FLASH: 1 RENGLÓN DE 31, SIN TOTAL — FALTAN RENGLONES Y LEE EL GRANDE", () => {
  assert.equal(FLASH.lineas.length, 1);
  assert.equal(FLASH.lineasEnElPapel, 31);
  const puerta = pasarPorLaPuerta({ lectura: FLASH });
  assert.equal(puerta.estado, ESTADO.SIN_TOTAL, "el booleano manda: no hay total impreso aunque mande un número");
  assert.deepEqual(puerta.faltanLineas, { declaradas: 31, transcriptas: 1, faltan: 30 });
  assert.equal(motivoDeEscalada({ resultado: { ok: true, lectura: FLASH }, puerta }), ESCALADA.FALTAN_RENGLONES);
});

test("EL LECTOR GRANDE: LOS 31 RENGLONES Y $4.844.300", () => {
  assert.equal(GRANDE.lineas.length, 31);
  assert.equal(GRANDE.lineas[0].descripcion, "CHESTERFIELD 10");
  assert.equal(GRANDE.lineas.at(-1).descripcion, "PHILIPS MORRIS CONV 10");
  assert.equal(suma(GRANDE), 4844300);
  const puerta = pasarPorLaPuerta({ lectura: GRANDE });
  assert.equal(puerta.estado, ESTADO.SIN_TOTAL);
  assert.equal(puerta.faltanLineas, null);
});

test("SIN TOTAL LEE EL GRANDE SIEMPRE, Y QUEDA SU LECTURA SIN DECIR QUE CIERRA", async () => {
  // Aunque Flash hubiera traído todo: sin total no hay suma que lo controle.
  assert.equal(motivoDeEscalada({ resultado: { ok: true, lectura: GRANDE }, puerta: pasarPorLaPuerta({ lectura: GRANDE }) }), ESCALADA.SIN_TOTAL);
  const interprete = { nombre: "grande", disponible: () => ({ ok: true }), interpretar: async () => ({ ok: true, lectura: GRANDE }) };
  const e = await escalarAlModeloGrande({ resultado: { ok: true, lectura: FLASH }, interpretes: { titular: interprete }, archivos: [] });
  assert.equal(e.llamo, true);
  assert.equal(e.lectura.lineas.length, 31);
  assert.doesNotMatch(e.texto, /cierra|verific/i);
  // Solo quién leyó: "no trae total" lo dice el aviso de al lado, y repetido
  // salía dos veces seguidas en el recuadro (2026-11-11).
  assert.equal(e.texto, "Lo leyó el lector grande.");
});

test("SIN TOTAL IMPRESO NUNCA DICE «VERIFICADO» NI LLEVA TILDE", () => {
  const s = comoSeDice("SIN_TOTAL");
  assert.doesNotMatch(`${s.titulo} ${s.detalle}`, /verific/i);
  assert.notEqual(s.tono, "ok");
  assert.doesNotMatch(chipDeFactura("SIN_TOTAL").texto, /✓/);
  assert.equal(
    textoDelPapelSinTotal({ leidos: 1, vistos: 31 }),
    "Este papel no trae total: revisá que estén todos los productos, se leyeron 1 producto. El lector vio 31 en la tabla: faltan 30."
  );
  assert.equal(
    textoDelPapelSinTotal({ leidos: 31, vistos: 31 }),
    "Este papel no trae total: revisá que estén todos los productos, se leyeron 31 productos."
  );
  // Las tres pantallas dicen eso y no "verificado".
  const panel = codigoDe("../../../components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /const sinTotal = d\.estado === "SIN_TOTAL";/);
  assert.match(panel, /texto: sinTotal\s*\?\s*textoDelPapelSinTotal\(/);
  const lista = codigoDe("../../../components/compras-proveedor/ListaDeLaFactura.jsx");
  assert.doesNotMatch(lista, /verificada con la suma/);
  assert.match(lista, /comprobante\?\.estado === "SIN_TOTAL"\s*\?\s*textoDelPapelSinTotal\(/);
});

test("«HOJA 1» SIN TOTAL: PUEDE HABER MÁS HOJAS, Y SE OFRECE LA SIGUIENTE", () => {
  for (const sí of ["Hoja 1", "HOJA 1", "Página 1 de 3", "1/2", "Pág. 2 de 4"]) assert.equal(hayMasHojasProbables(sí), true, sí);
  for (const no of [null, "", "1 de 1", "Hoja 2 de 2", "Original"]) assert.equal(hayMasHojasProbables(no), false, String(no));
  assert.match(textoDelPapelSinTotal({ leidos: 31, vistos: 31, hojaImpresa: "Hoja 1" }), /El papel dice «Hoja 1»: puede haber más hojas\. Sacale foto a la siguiente y agregala\.$/);
  const panel = codigoDe("../../../components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /c\.estado === "SIN_TOTAL" && hayMasHojasProbables\(c\.hojaImpresa\)/);
  assert.match(panel, /\+ Agregar la hoja siguiente/);
});

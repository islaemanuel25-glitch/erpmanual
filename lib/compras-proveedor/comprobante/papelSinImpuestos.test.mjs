// UN PAPEL SIN IMPUESTOS IMPRESOS SE COSTEA CON EL IMPORTE, SEA CUAL SEA SU LETRA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/papelSinImpuestos.test.mjs
//
// Regla de Emanuel (2026-10-26): si el papel no muestra impuestos aparte —ni por
// producto ni al pie—, el importe de cada producto ya es el costo final, sea
// factura A, B, C o sin factura. Si los muestra, sigue como siempre: neto + IVA
// + percepciones + interno. El caso de la factura B, con las 19 filas reales de
// Mauro #298, está en `mauro298.test.mjs`, que es donde viven esas filas.
//
// Los papeles de acá son los de `lecturaInterpretada.fixture.json`, tal como
// los contestó el lector: DYSSA y DAS (factura A, con impuestos), Secco (sin
// factura, sin impuestos).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizarLectura } from "./lector/contrato.js";
import { pasarPorLaPuerta } from "./lector/puerta.js";
import { papelSinImpuestosImpresos, costoQueFaltaDelImporte } from "./lector/lecturaInterpretada.js";
import { papelGuardadoSinImpuestos } from "./lecturaGuardada.js";
import { avisoDeImpuestos, AVISO_SIN_IMPUESTOS } from "./pantalla.js";

const { _origen, ...PAPELES } = JSON.parse(
  fs.readFileSync(new URL("./lecturaInterpretada.fixture.json", import.meta.url), "utf8")
);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const leer = (p, cambios = {}) => normalizarLectura({ ...p, ...cambios }, { interpretada: true });

test("DAS Y DYSSA TRAEN IMPUESTOS: sus costos siguen siendo los del lector, y cierran igual", () => {
  for (const nombre of ["das", "dyssa"]) {
    const lectura = leer(PAPELES[nombre]);
    assert.equal(papelSinImpuestosImpresos(lectura), false, nombre);
    assert.deepEqual(lectura.lineas.map((l) => l.costoFinal), PAPELES[nombre].lineas.map((l) => l.costoFinal ?? null), nombre);
    assert.equal(pasarPorLaPuerta({ lectura, receta: {} }).cierra, true, nombre);
  }
});

test("DYSSA SIN EL COSTO DE UN PRODUCTO: el importe es neto y NO se toma como costo", () => {
  const lectura = leer(PAPELES.dyssa, {
    lineas: PAPELES.dyssa.lineas.map((l, i) => (i === 0 ? { ...l, costoFinal: null } : l)),
  });
  assert.equal(lectura.lineas[0].costoFinal, null);
  assert.equal(pasarPorLaPuerta({ lectura, receta: {} }).cierra, false);
});

test("LO IMPRESO DECIDE AUNQUE EL LECTOR NO CONTESTE: IVA por producto, al pie, percepción o interno", () => {
  const base = { lineas: [{ cantidad: 1, importeImpreso: 100 }], pie: {} };
  assert.equal(papelSinImpuestosImpresos(base), true);
  assert.equal(papelSinImpuestosImpresos({ ...base, lineas: [{ alicuotaIva: 21 }] }), false, "IVA por producto (DYSSA)");
  assert.equal(papelSinImpuestosImpresos({ ...base, lineas: [{ internoUnitario: 12 }] }), false, "interno por producto");
  assert.equal(papelSinImpuestosImpresos({ ...base, pie: { iva: 21 } }), false, "IVA al pie (DAS)");
  assert.equal(papelSinImpuestosImpresos({ ...base, pie: { interno: 5 } }), false);
  assert.equal(papelSinImpuestosImpresos({ ...base, pie: { conceptos: [{ nombre: "PERC. IIBB", importe: 30 }] } }), false);
  // Un descuento del pie no es un impuesto.
  assert.equal(papelSinImpuestosImpresos({ ...base, pie: { conceptos: [{ nombre: "DESC.", importe: 30, resta: true }] } }), true);
  // La pregunta aparte al lector, si dijo que sí, manda.
  assert.equal(papelSinImpuestosImpresos({ ...base, discriminaImpuestos: true }), false);
});

test("SECCO, SIN FACTURA Y SIN IMPUESTOS, SIGUE IGUAL: el importe es el costo", () => {
  const lectura = leer(PAPELES.secco, {
    lineas: PAPELES.secco.lineas.map((l, i) => (i === 0 ? { ...l, costoFinal: null } : l)),
  });
  assert.equal(papelSinImpuestosImpresos(lectura), true);
  assert.equal(lectura.lineas[0].costoFinal, PAPELES.secco.lineas[0].importeImpreso);
});

test("LO YA GUARDADO: una A no pasa por papel sin impuestos aunque el IVA no se haya leído", () => {
  const sinIva = { lineas: [{ orden: 1, textoCrudo: "X", cantidad: 1, netoUnitario: 100, subtotalImpreso: 100, ivaPct: null }] };
  assert.equal(papelGuardadoSinImpuestos({ ...sinIva, recetaUsada: { tipoComprobante: "A" } }), false);
  // CONTRAPRUEBA: la misma fila de una B o de un papel sin factura sí.
  assert.equal(papelGuardadoSinImpuestos({ ...sinIva, recetaUsada: { tipoComprobante: "B" } }), true);
  assert.equal(papelGuardadoSinImpuestos({ ...sinIva, recetaUsada: { tipoComprobante: "SIN_FACTURA" } }), true);
  assert.equal(papelGuardadoSinImpuestos({ ...sinIva, ivaLeido: "2100.00" }), false, "con el IVA del pie guardado");
  assert.equal(costoQueFaltaDelImporte({ costoFinal: null, subtotalImpreso: 100 }, false), null);
});

const SIN_IMPUESTOS = { recetaUsada: { tipoComprobante: "B" }, lineas: [{ ivaPct: null, internoUnitario: 0 }] };
const CON_IVA_AL_PIE = { tipo: "A", ivaLeido: "21000.00", lineas: [{ ivaPct: null, internoUnitario: 0 }] };

test("EL AVISO: este papel no trae impuestos y el proveedor suele traerlos, una frase", () => {
  assert.equal(avisoDeImpuestos({ papel: SIN_IMPUESTOS, anteriores: [CON_IVA_AL_PIE, CON_IVA_AL_PIE, SIN_IMPUESTOS] }), AVISO_SIN_IMPUESTOS);
  assert.match(AVISO_SIN_IMPUESTOS, /productos?/);
  assert.doesNotMatch(AVISO_SIN_IMPUESTOS, /líneas?|renglon/i);
  // CONTRAPRUEBAS: un proveedor que suele mandarlos así, sin historia, o un papel con impuestos.
  assert.equal(avisoDeImpuestos({ papel: SIN_IMPUESTOS, anteriores: [SIN_IMPUESTOS, SIN_IMPUESTOS, CON_IVA_AL_PIE] }), null);
  assert.equal(avisoDeImpuestos({ papel: SIN_IMPUESTOS, anteriores: [] }), null);
  assert.equal(avisoDeImpuestos({ papel: CON_IVA_AL_PIE, anteriores: [CON_IVA_AL_PIE] }), null);
});

test("EL AVISO SALE DE LA CONCILIACIÓN Y SE DIBUJA EN EL RENGLÓN DE ESTADO DEL PAPEL", () => {
  const conc = codigoDe("app/api/compras-proveedor/conciliacion/[pedidoId]/route.js");
  assert.match(conc, /avisoDeImpuestos: avisoDeImpuestos\(\{ papel: porId\.get\(g\.comprobante\.id\), anteriores \}\)/);
  assert.match(conc, /OR: \[\{ pedidoId: null \}, \{ pedidoId: \{ not: pedidoId \} \}\]/, "contra otras compras, no esta");
  const lista = codigoDe("components/compras-proveedor/ListaDeLaFactura.jsx");
  assert.match(lista, /\{avisoDeImpuestos && <p className="text-sm2 sunmi-text-warning break-words">\{avisoDeImpuestos\}<\/p>\}/);
  const p = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.match(p, /g\?\.comprobante\?\.avisoDeImpuestos/);
  // La receta aprendida no se reescribe: se guarda y se confirma POR TIPO de papel.
  const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  assert.match(schema, /model ExplicacionPorTipo \{[\s\S]*@@unique\(\[grupoId, proveedorId, tipoComprobante\]\)/);
});

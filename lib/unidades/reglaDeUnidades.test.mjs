// LA REGLA ÚNICA DE UNIDADES, TANDA 1: EL CIERRE DE RECEPCIÓN PREGUNTA ACÁ.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/reglaDeUnidades.test.mjs
//
// ── DE DÓNDE SALEN LOS CASOS ───────────────────────────────────────────────
//
//   · $21.000 contra el pack de 12 a $38.400: el caso del relevamiento del
//     2026-11-04, corrido con las funciones reales. La recepción la leía como
//     pack de 2; el cierre, con su 50 % propio, como el costo del bulto.
//   · El durazno del pedido 491 (Nutrisur), con los números leídos de
//     producción ese día: pack de 12 a $38.400, papel 12 a $3.272,60 final,
//     $39.271,16 el renglón.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { comoViene, escalaDelCosto } from "./reglaDeUnidades.js";
import * as costoMaestro from "../compras-proveedor/costoMaestro.js";
import { deducirUnidad, UNIDAD } from "../compras-proveedor/comprobante/unidadPorPrecio.js";
import { decisionDeCostoSugerida } from "../compras-proveedor/decisionDeCostoSugerida.js";

const { costoLineaAMaestro } = costoMaestro;
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PACK12 = { factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const COSTO_HOY = 38400;

/** Lo que haría el cierre con una línea: preguntar la escala y convertir. */
function cierre({ costo, unidad }) {
  const escala = escalaDelCosto({ costo, unidad, base: PACK12, costoActual: COSTO_HOY });
  if (escala.requiereDecision) return { pregunta: true, maestro: null };
  return {
    pregunta: false,
    maestro: costoLineaAMaestro({ precioCosto: costo, unidad: escala.unidad, factorPack: 12, modoCompraProveedor: "BULTO", unidadMedida: "pack" }),
  };
}

test("$21.000 POR UNIDAD CONTRA EL PACK DE 12 A $38.400: NO SE ESCRIBE SOLO", () => {
  // ── ESTE CANDADO CAMBIÓ DE REGLA, NO DE EXIGENCIA (2026-11-07) ─────────
  //
  // Con la regla única de la menor diferencia: por la unidad (×12 = $252.000)
  // +556 %, por el bulto ($21.000) −45 %. 556 le saca más del triple a 45: es
  // el bulto, y el número queda como está —nunca $252.000—. Lo que se exige
  // sigue igual: −45 % está fuera de la variación del proveedor, así que el
  // freno de variación del cierre no lo escribe sin que alguien lo acepte.
  const r = cierre({ costo: 21000, unidad: "UNIDAD" });
  assert.equal(r.pregunta, false);
  assert.equal(r.maestro, 21000);

  const ruta = codigoDe("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.match(ruta, /escribeCosto && sugerida\.exigeElegir && !aceptada/);
  // Y cuando ninguna lectura gana clara, el cierre frena: dice qué pasa y qué
  // hacer, y una línea que alguien decidió no tocar pasa sin escribir nada.
  assert.match(ruta, /if \(escala\.requiereDecision && !costosExcluidos\.has\(det\.id\)\) \{/);
  const i = ruta.indexOf("es el costo de la ");
  assert.ok(i > 0, "el freno dejó de decir qué no se sabe");
  assert.match(ruta.slice(Math.max(0, i - 400), i), /throw new ErrorParaLaPersona\(/);
  assert.match(ruta.slice(i, i + 400), /Abrí Corregir/);
});

test("EL 50 % PROPIO DEL CIERRE YA NO EXISTE", () => {
  assert.equal("MISMA_ESCALA" in costoMaestro, false);
  assert.ok(!/MISMA_ESCALA|costoActual/.test(codigoDe("lib/compras-proveedor/costoMaestro.js")));
});

test("DURAZNO #491: LA RECEPCIÓN SIGUE LEYENDO 12 UNIDADES Y EL CIERRE ESCRIBE EL +2,3 % ACEPTADO", () => {
  // La recepción, con el decisor de siempre: 12 unidades, un pack.
  const papel = deducirUnidad({ costoAnteriorFinal: COSTO_HOY, precioFacturaFinal: 39271.16 / 12, factorPack: 12 });
  assert.equal(papel.unidad, UNIDAD.POR_UNIDAD);
  assert.equal(papel.requiereDecision, false);

  // Aceptado en Corregir, la línea queda en 1 BULTO a $39.271,20: se escribe.
  assert.deepEqual(cierre({ costo: 39271.2, unidad: "BULTO" }), { pregunta: false, maestro: 39271.2 });
  // Y si la línea tuviera el precio de la unidad del papel, la regla lo sabe.
  assert.deepEqual(cierre({ costo: 3272.6, unidad: "UNIDAD" }), { pregunta: false, maestro: 39271.2 });
  // +2,3 %: adentro de la variación normal, el cierre no pide elegir de nuevo.
  const s = decisionDeCostoSugerida({ papel: 39271.2, tuyo: COSTO_HOY, variacionPct: 10, factorPack: 12 });
  assert.equal(Math.round(s.diferenciaPct * 10) / 10, 2.3);
  assert.equal(s.exigeElegir, false);
});

test("CONTRAPRUEBA: UN PRECIO NORMAL SE ESCRIBE COMO SIEMPRE", () => {
  // $3.300 la unidad de un pack de 12: $39.600 el bulto, +3,1 %.
  assert.deepEqual(cierre({ costo: 3300, unidad: "UNIDAD" }), { pregunta: false, maestro: 39600 });
  // Una línea por bulto no tiene nada que decidir.
  assert.deepEqual(cierre({ costo: 40000, unidad: "BULTO" }), { pregunta: false, maestro: 40000 });
  // Sin costo de hoy —el primer ingreso de un producto nuevo— es lo que dice ser.
  assert.equal(escalaDelCosto({ costo: 3300, unidad: "UNIDAD", base: PACK12, costoActual: 0 }).unidad, "UNIDAD");
});

test("EL DECISOR ES EL DE LA RECEPCIÓN: CONTESTA LO MISMO QUE deducirUnidad", () => {
  // De $500 a $600.000, cada precio: unidad o bulto cuando deducirUnidad lo
  // dice, y pregunta en todo lo demás. Ningún umbral propio.
  for (let costo = 500; costo <= 600000; costo = Math.round(costo * 1.07)) {
    const d = deducirUnidad({ costoAnteriorFinal: COSTO_HOY, precioFacturaFinal: costo, factorPack: 12 });
    const e = escalaDelCosto({ costo, unidad: "UNIDAD", base: PACK12, costoActual: COSTO_HOY });
    const esperado = d.unidad === UNIDAD.POR_UNIDAD ? "UNIDAD" : d.unidad === UNIDAD.POR_BULTO ? "BULTO" : null;
    assert.equal(e.unidad, esperado, `$${costo}`);
    assert.equal(e.requiereDecision, esperado === null, `$${costo}`);
  }
});

test("LA FICHA: SOLO UN PACK TIENE BULTO POR EL QUE MULTIPLICAR UN COSTO", () => {
  assert.deepEqual(comoViene(PACK12), { naturaleza: "PACK", factor: 12 });
  assert.deepEqual(comoViene({ factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" }), { naturaleza: "UNIDAD", factor: 1 });
  assert.deepEqual(comoViene({ factor_pack: null, unidad_medida: "kg", modoCompraProveedor: "BULTO" }), { naturaleza: "KG", factor: 1 });
  // Compra por UNIDAD con un pack cargado: guarda su costo por kilo, como
  // siempre en compras. Stock multiplicaba por 12; para el costo, no hay bulto.
  assert.deepEqual(comoViene({ factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "UNIDAD" }), { naturaleza: "FIAMBRE", factor: 1 });
});

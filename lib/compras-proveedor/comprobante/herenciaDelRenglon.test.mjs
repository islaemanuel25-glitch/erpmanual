// LO QUE SE CONTROLÓ NO SE PIERDE AL VOLVER A LEER EL PAPEL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/herenciaDelRenglon.test.mjs
//
// ── EL CASO, MEDIDO CONTRA PRODUCCIÓN EL 2026-09-22 ───────────────────────
//
// Comprobante 13 del pedido 242: `intentosLectura` en **4**, o sea que sus
// renglones se borraron y se crearon de nuevo cuatro veces. Cada vez se
// perdieron el vínculo al producto, la marca de revisado y la elección de
// unidad de los once renglones. Los textos de acá son los del papel real.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  herenciaDeLosRenglones,
  tieneAlgoQueHeredar,
  LO_QUE_SE_HEREDA,
} from "@/lib/compras-proveedor/comprobante/herenciaDelRenglon";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Tres renglones del papel de Paty, ya controlados. */
const ANTES = [
  {
    orden: 1,
    textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-",
    productoLocalId: 6211,
    pedidoDetalleId: 2812,
    unidadElegida: "POR_BULTO",
    revisadoEnRecepcion: true,
    revisadoEnRecepcionPorId: 3,
    revisadoEnRecepcionAt: new Date("2026-09-22T02:20:00Z"),
    costoEscrito: false,
    costoFinalUnitario: null,
    costoPrevioAplicacion: null,
    precioPedidoPrevio: null,
  },
  {
    orden: 2,
    textoCrudo: "TREMS MANTECA X100 GS 60",
    productoLocalId: 6090,
    pedidoDetalleId: 2813,
    unidadElegida: null,
    revisadoEnRecepcion: true,
    revisadoEnRecepcionPorId: 3,
    revisadoEnRecepcionAt: new Date("2026-09-22T02:21:00Z"),
    costoEscrito: false,
  },
  // Uno que nadie tocó: no tiene nada que heredar y no cuenta como pérdida.
  { orden: 3, textoCrudo: "TREMS QUESO RALL 40GR X20 6", productoLocalId: null, pedidoDetalleId: null, revisadoEnRecepcion: false },
];

const nuevo = (orden, textoCrudo) => ({ orden, textoCrudo });

test("LA MISMA LECTURA OTRA VEZ: NO SE PIERDE NADA", () => {
  const nuevos = ANTES.map((v) => nuevo(v.orden, v.textoCrudo));
  const { conHerencia, heredados, sinHeredar } = herenciaDeLosRenglones({ viejos: ANTES, nuevos });

  assert.equal(sinHeredar.length, 0, "se perdió algo releyendo el mismo papel");
  assert.equal(heredados.length, 2, "solo heredan los dos que alguien había tocado");

  const papas = conHerencia[0];
  assert.equal(papas.productoLocalId, 6211);
  assert.equal(papas.pedidoDetalleId, 2812);
  assert.equal(papas.unidadElegida, "POR_BULTO");
  assert.equal(papas.revisadoEnRecepcion, true);
  assert.equal(papas.revisadoEnRecepcionPorId, 3, "se perdió quién lo controló");
  assert.ok(papas.revisadoEnRecepcionAt instanceof Date, "se perdió cuándo lo controló");

  // Y el que nadie tocó queda tal cual, sin campos inventados.
  assert.deepEqual(conHerencia[2], { orden: 3, textoCrudo: "TREMS QUESO RALL 40GR X20 6" });
});

test("SI EL RENGLÓN DICE OTRA COSA, NO HEREDA — Y SE SABE CUÁL", () => {
  // La lectura nueva entendió otro producto en el renglón 1. Arrastrar un "ya
  // lo controlé" sobre un renglón que dice otra cosa es peor que pedir que lo
  // miren: nadie se enteraría de que cambió.
  const nuevos = [nuevo(1, "OTRA COSA DISTINTA"), nuevo(2, "TREMS MANTECA X100 GS 60")];
  const { conHerencia, sinHeredar } = herenciaDeLosRenglones({ viejos: ANTES, nuevos });

  assert.equal(conHerencia[0].productoLocalId, undefined, "heredó sobre un renglón que cambió de texto");
  assert.equal(conHerencia[0].revisadoEnRecepcion, undefined, "quedó marcado como controlado sin que nadie lo mire");
  assert.equal(conHerencia[1].productoLocalId, 6090, "el que no cambió tiene que heredar igual");

  const perdido = sinHeredar.find((x) => x.orden === 1);
  assert.ok(perdido, "no se avisa de lo que quedó sin heredar");
  assert.equal(perdido.antes, "BUTLER C. TRAD 9MM X2,5KG -6-");
  assert.equal(perdido.ahora, "OTRA COSA DISTINTA");
  assert.match(perdido.porque, /dice otra cosa/);
});

test("SI EL RENGLÓN CAMBIÓ DE NÚMERO, TAMPOCO HEREDA", () => {
  // Mismo texto, otro número de renglón: la lectura los corrió de lugar.
  const nuevos = [nuevo(1, "TREMS MANTECA X100 GS 60"), nuevo(2, "BUTLER C. TRAD 9MM X2,5KG -6-")];
  const { conHerencia, heredados, sinHeredar } = herenciaDeLosRenglones({ viejos: ANTES, nuevos });
  assert.equal(heredados.length, 0);
  assert.equal(conHerencia[0].productoLocalId, undefined);
  assert.equal(conHerencia[1].productoLocalId, undefined);
  assert.equal(sinHeredar.length, 2, "los dos que tenían algo quedaron sin heredar y hay que decirlo");
});

test("UN RENGLÓN QUE LA LECTURA NUEVA YA NO TRAE SE INFORMA IGUAL", () => {
  // No aparece recorriendo los nuevos —no existe— y es justamente el que más
  // importa: había trabajo hecho y ahora no hay dónde ponerlo.
  const { sinHeredar } = herenciaDeLosRenglones({
    viejos: ANTES,
    nuevos: [nuevo(1, "BUTLER C. TRAD 9MM X2,5KG -6-")],
  });
  const ido = sinHeredar.find((x) => x.orden === 2);
  assert.ok(ido, "el renglón que desapareció no se informó");
  assert.equal(ido.ahora, null);
  assert.match(ido.porque, /no trae ese renglón/);
  // Y el renglón 3, que nadie había tocado, no ensucia la lista.
  assert.ok(!sinHeredar.some((x) => x.orden === 3));
});

test("NO HEREDA LOS NÚMEROS DE LA LECTURA VIEJA", () => {
  // La clase de diferencia y el porcentaje describen el papel COMO SE LEYÓ
  // antes. Pasarlos a una lectura nueva sería mostrar el veredicto de una sobre
  // los números de la otra.
  assert.ok(!LO_QUE_SE_HEREDA.includes("claseDiferencia"));
  assert.ok(!LO_QUE_SE_HEREDA.includes("diferenciaPct"));
  assert.ok(!LO_QUE_SE_HEREDA.includes("cantidad"));
  assert.ok(!LO_QUE_SE_HEREDA.includes("netoUnitario"));
  assert.ok(!LO_QUE_SE_HEREDA.includes("subtotalImpreso"));
  // Y sí hereda las cinco cosas que decidió una persona.
  for (const c of ["productoLocalId", "pedidoDetalleId", "unidadElegida", "revisadoEnRecepcion", "costoEscrito"]) {
    assert.ok(LO_QUE_SE_HEREDA.includes(c), `no hereda ${c}`);
  }
});

test("UN RENGLÓN SIN TOCAR NO CUENTA COMO TRABAJO PERDIDO", () => {
  assert.equal(tieneAlgoQueHeredar(null), false);
  assert.equal(tieneAlgoQueHeredar({ orden: 1, textoCrudo: "x" }), false);
  assert.equal(tieneAlgoQueHeredar({ productoLocalId: 1 }), true);
  assert.equal(tieneAlgoQueHeredar({ revisadoEnRecepcion: true }), true);
  assert.equal(tieneAlgoQueHeredar({ unidadElegida: "POR_BULTO" }), true);
});

// ── Y LA RELECTURA LA USA, QUE ES DONDE ESTABA EL DEFECTO ─────────────────

test("LA RUTA DE LECTURA FOTOGRAFÍA ANTES DE BORRAR Y HEREDA AL CREAR", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  // El orden importa: leer los viejos DESPUÉS del deleteMany devolvería vacío.
  const iLee = ruta.indexOf("const renglonesDeAntes");
  const iBorra = ruta.indexOf("comprobanteLinea.deleteMany");
  const iCrea = ruta.indexOf("comprobanteLinea.createMany");
  assert.ok(iLee > 0, "no se fotografían los renglones de antes");
  assert.ok(iLee < iBorra, "se leen los renglones viejos después de borrarlos: siempre da vacío");
  assert.ok(iBorra < iCrea);
  assert.match(ruta, /herenciaDeLosRenglones\(\{/);
  assert.match(ruta, /\.\.\.herencia\.conHerencia\[i\]/);
  // Y lo heredado va PRIMERO en el objeto, para que los campos del papel nuevo
  // —cantidad, importes, texto— lo pisen. Al revés, una lectura nueva mostraría
  // los números de la vieja.
  const bloque = ruta.slice(iCrea, iCrea + 900);
  const iHerencia = bloque.indexOf("...herencia.conHerencia[i]");
  const iTexto = bloque.indexOf("textoCrudo: l.descripcion");
  assert.ok(iHerencia > 0, "la creación no aplica la herencia");
  assert.ok(iTexto > 0 && iHerencia < iTexto, "lo heredado pisaría lo que dice el papel nuevo");
});

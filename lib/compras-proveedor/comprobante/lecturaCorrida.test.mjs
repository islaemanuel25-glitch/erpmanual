// POSIBLE LECTURA CORRIDA, CONTRA LA LISTA DEL PROVEEDOR.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lecturaCorrida.test.mjs
//
// Los dos papeles reales (leídos de producción el 2026-11-18 y 19):
//
//   · La factura 00614085 de Dab (comprobante 104, pedido 672): la lectura le
//     corrió los CÓDIGOS a los Gigante. Volver a leerla con Gemini dio lo mismo.
//   · El pedido 473 de Arcor (comprobante 57): le corrió los NOMBRES desde el
//     3313 —la lectura guardada antes de la corrección del 2026-11-18—.
//
// Y un código compartido de verdad: dos renglones de UNA misma lista con el
// mismo código y otra variante. En producción no hay ninguno (medido el
// 2026-11-19 sobre todas las listas guardadas y todos los papeles): el caso es
// de prueba y queda dicho.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lecturaCorrida, nombreQueContradiceLaLista, MINIMO_RENGLONES_CORRIDOS, TEXTO_LECTURA_CORRIDA } from "./lecturaCorrida.js";
import { armarListaGuardada, nombreDeLaListaParaElCodigo } from "./listaGuardada.js";
import { analizarLineas } from "./analisisDeComprobante.js";
import { compartidoEnUnMismoDocumento, codigoCompartidoDeVerdad } from "@/lib/proveedores/identidad/codigoCompartido";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── DAB: la lista 15 y la factura 00614085 ───────────────────────────────

const fila = (id, codigo, descripcionProveedor, precioConIva, unidadesPorBulto = 15) => ({
  id, codigoCrudo: codigo, codigoNormalizado: codigo, descripcionProveedor, precioConIva, unidadesPorBulto, productoBaseId: null,
  codigoBarraProveedor: null, costoMaestroPropuesto: null, costoUnitarioCalculado: null,
});
const LISTA_DAB = armarListaGuardada({
  cabecera: { id: 15, recargoPct: "0", impuestoAdicionalPct: "0" },
  filas: [
    fila(17923, "2530", "GIGANTE LIMPIADOR LIMON 900CC", "1115.28"),
    fila(17924, "2531", "GIGANTE LIMPIADOR MARINA 900CC", "1115.28"),
    fila(17921, "2532", "GIGANTE LIMPIADOR CITRONELA 900CC", "1193.48"),
    fila(17954, "2533", "GIGANTE LAVANDINA ORIGINAL 1LT", "895.97"),
    fila(17922, "6086", "GIGANTE LIMPIADOR LAVANDA", "1163.77"),
  ],
});
const renglon = (orden, codigoProveedor, textoCrudo) => ({ orden, codigoProveedor, textoCrudo, tipoRenglon: "MERCADERIA" });
// Los renglones 5 a 8 y 18 como los guardó la lectura (y como volvió a leerlos Gemini).
const DAB_LEIDO = [
  renglon(5, "002530", "GIGANTE LIMPIADOR CITRONELA 900CC"),
  renglon(6, "006086", "GIGANTE LIMPIADOR LAVANDA"),
  renglon(7, "002531", "GIGANTE LIMPIADOR LIMON 900CC"),
  renglon(8, "002533", "GIGANTE LIMPIADOR MARINA 900CC"),
  renglon(18, "002533", "GIGANTE LAVANDINA ORIGINAL 1LT"),
];
// Y como dice el papel.
const DAB_PAPEL = [
  renglon(5, "002532", "GIGANTE LIMPIADOR CITRONELA 900CC"),
  renglon(6, "006086", "GIGANTE LIMPIADOR LAVANDA"),
  renglon(7, "002530", "GIGANTE LIMPIADOR LIMON 900CC"),
  renglon(8, "002531", "GIGANTE LIMPIADOR MARINA 900CC"),
  renglon(18, "002533", "GIGANTE LAVANDINA ORIGINAL 1LT"),
];

test("Dab 00614085: la lectura guardada es posible lectura corrida, el papel no", () => {
  assert.equal(nombreDeLaListaParaElCodigo(LISTA_DAB, "002532"), "GIGANTE LIMPIADOR CITRONELA 900CC", "en la lista, el 2532 es el Citronela");
  const leido = lecturaCorrida({ lineas: DAB_LEIDO, listaGuardada: LISTA_DAB });
  assert.equal(leido.corrida, true);
  assert.deepEqual(leido.renglones.map((r) => r.orden), [5, 7, 8]);
  assert.equal(leido.renglones[0].deLaLista, "GIGANTE LIMPIADOR LIMON 900CC");
  const papel = lecturaCorrida({ lineas: DAB_PAPEL, listaGuardada: LISTA_DAB });
  assert.equal(papel.corrida, false);
  assert.deepEqual(papel.renglones, []);
});

// ── ARCOR: el pedido 473, antes de la corrección ─────────────────────────

const LISTA_ARCOR = armarListaGuardada({
  cabecera: { id: 6, recargoPct: "5", impuestoAdicionalPct: "0" },
  filas: [
    fila(5540, "3312", "NUEVO TATIN SIMPLE NEGRO 56X33G", "405.820206", 56),
    fila(5541, "3313", "NUEVO TATIN SIMPLE BLANCO X33GR.", "405.820206", 56),
    fila(5559, "3750", "ALFAJOR BYN 3.0 NEG. X 73.5G.", "1373.545415", 21),
    fila(5542, "4053", "TATIN TRIPLE BLANCO", "811.639928", 21),
    fila(5543, "4056", "TATIN TRIPLE NEGRO", "811.639928", 21),
  ],
});
const A473_LEIDO = [
  renglon(7, "3312", "NUEVO TATIN SIMPLE NEGRO 56X33G"),
  renglon(8, "3313", "ALFAJOR BYN 3.0 NEG. X 73.5G."),
  renglon(9, "3750", "TATIN TRIPLE BLANCO"),
  renglon(10, "4053", "TATIN TRIPLE NEGRO"),
  renglon(11, "6596", "ALF. COFLER BLOCK X60G"),
];
const A473_PAPEL = [
  renglon(7, "3312", "NUEVO TATIN SIMPLE NEGRO 56X33G"),
  renglon(8, "3313", "NUEVO TATIN SIMPLE BLANCO X33GR."),
  renglon(9, "3750", "ALFAJOR BYN 3.0 NEG. X 73.5G."),
  renglon(10, "4053", "TATIN TRIPLE BLANCO"),
  renglon(11, "4056", "TATIN TRIPLE NEGRO"),
  renglon(12, "6596", "ALF. COFLER BLOCK X60G"),
];

test("pedido 473: la lectura corrida se ve contra la lista, y la corregida no", () => {
  const leido = lecturaCorrida({ lineas: A473_LEIDO, listaGuardada: LISTA_ARCOR });
  assert.equal(leido.corrida, true);
  assert.deepEqual(leido.renglones.map((r) => r.orden), [8, 9, 10]);
  assert.equal(lecturaCorrida({ lineas: A473_PAPEL, listaGuardada: LISTA_ARCOR }).corrida, false);
});

test("un renglón solo no alcanza, callar no contradice, y sin lista no hay con qué", () => {
  assert.equal(MINIMO_RENGLONES_CORRIDOS, 2);
  const uno = lecturaCorrida({ lineas: [DAB_LEIDO[0], ...DAB_PAPEL.slice(1)], listaGuardada: LISTA_DAB });
  assert.equal(uno.renglones.length, 1);
  assert.equal(uno.corrida, false);
  // La lista de Dab corta los nombres: "DON SATUR MAGDALENA…" no contradice.
  assert.equal(nombreQueContradiceLaLista("DON SATUR MAGDALENA VAINILLA 200", "DON SATUR MAGDALENA…"), false);
  assert.equal(nombreQueContradiceLaLista("GIGANTE LIMPIADOR MARINA 900CC", "GIGANTE LAVANDINA ORIGINAL 1LT"), true, "otro gramaje");
  assert.equal(lecturaCorrida({ lineas: DAB_LEIDO, listaGuardada: null }).corrida, false);
});

test("en un papel corrido ningún renglón se vincula solo: queda para revisar", () => {
  const P_LIMON = 9102;
  const contexto = {
    datos: { codigosProveedor: [{ id: 1, productoBaseId: P_LIMON, codigoInterno: "2530", descripcionProveedor: null, activo: true }], productos: [{ productoBaseId: P_LIMON, nombre: "GIGANTE LIMPIADOR LIMON 900CC" }], lecturasRecordadas: new Map() },
    listaGuardada: LISTA_DAB,
    catalogo: [], catalogoNormalizado: [], nombrePorBase: new Map([[P_LIMON, "GIGANTE LIMPIADOR LIMON 900CC"]]), datosPorBase: new Map(), decisionPorBase: new Map(),
  };
  const lineas = (renglones) =>
    renglones.map((r) => ({ ...r, cantidad: 1, netoUnitario: 1115.28, subtotalImpreso: 16729.2, costoFinalRenglon: 16729.2, enQueViene: "bulto de 15", productoLocalId: null, pedidoDetalleId: null }));
  const corrido = analizarLineas({ comprobante: { id: 104, proveedor: { id: 14 }, lineas: lineas(DAB_LEIDO) }, contexto });
  const citronelaLeido = corrido.find((l) => l.orden === 5);
  assert.equal(citronelaLeido.posibleLecturaCorrida, true);
  assert.equal(citronelaLeido.productoBaseId, null, "el 002530 leído no se ata solo al Limón");
  assert.equal(citronelaLeido.requiereDecision, true);
  assert.ok(citronelaLeido.problema.startsWith(TEXTO_LECTURA_CORRIDA));
  assert.match(citronelaLeido.problema, /En la lista, el 002530 es «GIGANTE LIMPIADOR LIMON 900CC»/);
  // Con el papel corregido, el Limón (002530) se vincula solo por su código.
  const bien = analizarLineas({ comprobante: { id: 104, proveedor: { id: 14 }, lineas: lineas(DAB_PAPEL) }, contexto });
  assert.equal(bien.find((l) => l.orden === 7).productoBaseId, P_LIMON);
  assert.equal(bien.find((l) => l.orden === 7).posibleLecturaCorrida, false);
});

test("la lectura se relee una vez si salió corrida, antes de guardar y vincular", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  const desde = ruta.indexOf("let lecturaCorridaDescartada");
  assert.ok(desde > 0, "la ruta dejó de mirar la lectura corrida");
  assert.ok(desde < ruta.indexOf("prisma.$transaction"), "mira después de guardar");
  assert.match(ruta, /corridaDeLaLectura = lecturaCorrida\(\{ lineas: resultado\.lectura\.lineas, listaGuardada: listaDelProveedor \}\);\s*if \(corridaDeLaLectura\.corrida\) \{/);
  assert.match(ruta, /if \(!corridaDeLaOtra\.corrida && \(v\.cierra \|\| !v\.hayTotal\)\) \{/);
  assert.match(ruta, /posibleLecturaCorrida: corridaDeLaLectura\.corrida,/);
  // La vinculación contra el pedido no toca los renglones de un papel corrido.
  const pedido = codigoDe("lib/compras-proveedor/comprobante/vincularContraElPedido.js");
  assert.match(pedido, /for \(const l of sinVincular\.filter\(\(x\) => !corridos\.has\(x\.comprobanteId\)\)\)/);
  assert.match(codigoDe("components/comprobantes/PanelComprobantes.jsx"), /texto: d\.posibleLecturaCorrida\s*\?\s*d\.avisoLecturaCorrida/);
});

// ── CÓDIGO COMPARTIDO DE VERDAD: DOS RENGLONES DE UNA MISMA LISTA ────────

/** Un prisma de mentira con las filas de las listas y los renglones de los papeles. */
const prismaCon = ({ filas = [], lineas = [] }) => ({
  importacionListaFila: { findMany: async () => filas },
  comprobanteLinea: { findMany: async () => lineas },
});

test("compartido de verdad: la misma lista repite el código con otro aroma", async () => {
  const compartida = prismaCon({
    filas: [
      { importacionId: 15, codigoNormalizado: "2530", descripcionProveedor: "GIGANTE LIMPIADOR LIMON 900CC" },
      { importacionId: 15, codigoNormalizado: "2530", descripcionProveedor: "GIGANTE LIMPIADOR CITRONELA 900CC" },
    ],
  });
  assert.equal(await codigoCompartidoDeVerdad(compartida, { grupoId: 1, proveedorId: 14, codigo: "002530" }), true);
  // La lista de verdad de Dab y el papel leído corrido: NO es compartido.
  const dab = prismaCon({
    filas: [{ importacionId: 15, codigoNormalizado: "2530", descripcionProveedor: "GIGANTE LIMPIADOR LIMON 900CC" }],
    lineas: [{ comprobanteId: 104, codigoProveedor: "002530", textoCrudo: "GIGANTE LIMPIADOR CITRONELA 900CC" }],
  });
  assert.equal(await codigoCompartidoDeVerdad(dab, { grupoId: 1, proveedorId: 14, codigo: "002530" }), false);
  // Dos renglones de un MISMO papel con otro aroma sí cuentan… salvo que ese
  // papel esté corrido: la lectura corrida de Dab dejó el 2533 dos veces.
  const papel = prismaCon({
    lineas: [
      { comprobanteId: 200, codigoProveedor: "002533", textoCrudo: "GIGANTE LIMPIADOR MARINA 900CC" },
      { comprobanteId: 200, codigoProveedor: "002533", textoCrudo: "GIGANTE LIMPIADOR LAVANDA" },
    ],
  });
  assert.equal(await codigoCompartidoDeVerdad(papel, { grupoId: 1, proveedorId: 14, codigo: "2533" }), true);
  assert.equal(await codigoCompartidoDeVerdad(papel, { grupoId: 1, proveedorId: 14, codigo: "2533", esPapelCorrido: async () => true }), false);
  assert.equal(compartidoEnUnMismoDocumento([["GIGANTE LIMPIADOR LIMON 900CC"], ["GIGANTE LIMPIADOR CITRONELA 900CC"]]), false);
  // Las dos rutas que guardan el vínculo preguntan esto, con los papeles corridos afuera.
  for (const rel of ["app/api/compras-proveedor/comprobantes/vincular/route.js", "app/api/compras-proveedor/recepcion/correccion/route.js"]) {
    assert.match(codigoDe(rel), /esPapelCorrido: \(comprobanteId\) => papelCorrido\(prisma, \{ grupoId, comprobanteId \}\),/, rel);
  }
});

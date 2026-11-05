// CADA RENGLÓN SALE CON SU CANTIDAD, SU PRECIO Y SU IMPORTE, DE LA MISMA FILA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/ayalaGaunaRenglones.test.mjs
//
// ── EL CASO, DE PRODUCCIÓN (Emanuel, 2026-11-05) ─────────────────────────
//
// Ayala Gauna / Kangoo, 14 renglones, columnas CODIGO, DESCRIPCION, CANTIDAD,
// P.UNIT., BONIF %, TOTAL; total del pie 513.208,47. La foto vino apaisada.
// El lector devolvió 13: se comió "ALF MK MOUSSE BCO TRIPLE" y corrió los
// importes —el OREO quedó con el del TITA y el TITA con el del OREO o el MK—.
// La pantalla dijo "No cierra por $57.289,97" y nada más.
//
// ── LAS DOS CAUSAS QUE SON CÓDIGO ─────────────────────────────────────────
//
// 1. El giro que se elige en el visor («Girar») se guardaba y solo lo usaba la
//    pantalla: la foto viajaba al lector de costado (`achicarParaLeer`).
// 2. Nada miraba cada fila: la puerta mira la suma del papel. Ahora
//    `renglonesQueNoCierran` hace la cuenta de cada renglón —cantidad × precio
//    × (1 − bonificación) contra su importe— y un renglón que no cierra manda a
//    volver a leer con el lector grande, que recibe esas filas por nombre.
//
// Los cuatro renglones son los del papel, al centavo. Su costo final: el del
// TITA (13.213,72) y el del OREO (24.965,53) los dio Emanuel; el del MK sale
// con la misma proporción que el TITA, y el renglón de $0,01 queda en $0,01.
// El pie es la suma de esos cuatro: los otros diez renglones del papel no
// están en el caso.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizarLectura } from "./contrato.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { escalarAlModeloGrande, ESCALADA } from "./escalada.js";
import { instruccionesInterpretadas } from "./lecturaInterpretada.js";
import { renglonesQueNoCierran } from "./renglonesQueNoCierran.js";
import { achicarParaLeer, giroElegido } from "./achicarFoto.js";

const PROPORCION = 13213.72 / 10965.74;
const alCentavo = (n) => Math.round(n * 100) / 100;
const OREO = { codigoProveedor: "028541", descripcion: "ALF OREO TRIPLE X 56G", cantidad: 18, precioImpreso: 1278.91, bonificacion: 10, importeImpreso: 20718.28, costoFinal: 24965.53, tipo: "MERCADERIA" };
const TITA = { codigoProveedor: "548514", descripcion: "ALF TITA SIMPLE X 36G", cantidad: 20, precioImpreso: 609.21, bonificacion: 10, importeImpreso: 10965.74, costoFinal: 13213.72, tipo: "MERCADERIA" };
const MK = { codigoProveedor: "786527", descripcion: "ALF MK MOUSSE BCO TRIPLE", cantidad: 18, precioImpreso: 1278.9, bonificacion: 10, importeImpreso: 20718.18, costoFinal: alCentavo(20718.18 * PROPORCION), tipo: "MERCADERIA" };
const URANO = { codigoProveedor: "001197", descripcion: "PLAN URANO PUNTERA GALLETAS", cantidad: 1, precioImpreso: 0.01, importeImpreso: 0.01, costoFinal: 0.01, tipo: "MERCADERIA" };
const TOTAL = alCentavo([OREO, TITA, MK, URANO].reduce((s, l) => s + l.costoFinal, 0));

const papel = (lineas, extra = {}) =>
  normalizarLectura(
    {
      identidad: { tipo: "A", puntoVenta: "0003", numero: "00012345", fecha: "2026-11-05" },
      lineas,
      pie: { total: TOTAL },
      hayTotalImpreso: true,
      lineasEnElPapel: lineas.length,
      explicacion: "Ayala Gauna: CANTIDAD, P.UNIT., BONIF % y TOTAL por renglón; IVA y percepción al pie.",
      ...extra,
    },
    { interpretada: true }
  );

const BIEN = papel([OREO, TITA, MK, URANO]);
// Lo que devolvió el lector: sin el MK y con los importes corridos.
const CORRIDA = papel([
  { ...OREO, importeImpreso: 10965.74, costoFinal: 13213.72 },
  { ...TITA, importeImpreso: 20718.18, costoFinal: 24965.53 },
  URANO,
]);

const EXPLICACIONES = [{ tipoComprobante: "A", explicacion: "Ayala Gauna: precio con bonificación, IVA al pie.", version: 1 }];

/** Un lector grande de mentira: anota qué se le pidió y devuelve lo que se le diga. */
function grandeQueDevuelve(lectura) {
  const pedidos = [];
  return {
    pedidos,
    interpretes: {
      titular: {
        nombre: "grande",
        disponible: () => ({ ok: true }),
        interpretar: async (args) => {
          pedidos.push(args);
          return { ok: true, lectura, propuesta: { explicacion: lectura.explicacion } };
        },
      },
    },
  };
}

test("LOS CUATRO RENGLONES DEL PAPEL CIERRAN CADA UNO SU CUENTA", () => {
  assert.equal(BIEN.lineas.length, 4);
  assert.deepEqual(renglonesQueNoCierran(BIEN), []);
  // Los dos de precio casi igual son dos renglones distintos, cada uno con lo suyo.
  assert.deepEqual(
    BIEN.lineas.map((l) => [l.descripcion, l.cantidad, l.netoUnitario, l.bonificacion, l.subtotalImpreso]),
    [
      ["ALF OREO TRIPLE X 56G", 18, 1278.91, 10, 20718.28],
      ["ALF TITA SIMPLE X 36G", 20, 609.21, 10, 10965.74],
      ["ALF MK MOUSSE BCO TRIPLE", 18, 1278.9, 10, 20718.18],
      ["PLAN URANO PUNTERA GALLETAS", 1, 0.01, null, 0.01],
    ]
  );
  const p = pasarPorLaPuerta({ lectura: BIEN, receta: { interpretada: true } });
  assert.equal(p.estado, ESTADO.CARGADO);
  assert.deepEqual(p.lineasIncoherentes, []);
});

test("LA LECTURA CORRIDA: el OREO y el TITA no cierran su fila, y se marcan", () => {
  const malos = renglonesQueNoCierran(CORRIDA);
  assert.deepEqual(malos.map((r) => r.descripcion), ["ALF OREO TRIPLE X 56G", "ALF TITA SIMPLE X 36G"]);
  assert.equal(malos[0].esperado, 20718.34, "18 × 1.278,91 × 0,9");
  assert.equal(malos[0].importe, 10965.74, "el importe del TITA");
  const p = pasarPorLaPuerta({ lectura: CORRIDA, receta: { interpretada: true } });
  assert.equal(p.estado, ESTADO.MAL_LEIDO, "y además la suma no cierra, como pasó");
  assert.equal(p.lineasIncoherentes.length, 2);
});

test("SE VUELVE A LEER ANTES DE ENTREGAR: el grande recibe las filas por nombre y entrega los cuatro", async () => {
  const grande = grandeQueDevuelve(BIEN);
  const e = await escalarAlModeloGrande({
    resultado: { ok: true, lectura: CORRIDA },
    explicaciones: EXPLICACIONES,
    interpretes: grande.interpretes,
    archivos: [],
    proveedorNombre: "Ayala Gauna",
  });
  assert.equal(e.motivo, ESCALADA.RENGLONES_QUE_NO_CIERRAN, "antes: NO_CIERRA, sin decir qué filas");
  assert.equal(grande.pedidos.length, 1);
  const prompt = instruccionesInterpretadas({ referencia: grande.pedidos[0].referencia, motivo: grande.pedidos[0].motivo });
  assert.match(prompt, /«ALF OREO TRIPLE X 56G»: 18 × 1278\.91 × \(1 − 10 %\) da 20718\.34 y el importe leído es 10965\.74/);
  assert.match(prompt, /«ALF TITA SIMPLE X 36G»/);
  assert.match(prompt, /puede faltar un renglón entre ellas/);
  assert.equal(e.cerro, true);
  assert.equal(e.lectura.lineas.length, 4);
  assert.deepEqual(renglonesQueNoCierran(e.lectura), []);
});

test("AUNQUE LA SUMA CIERRE: dos importes cruzados también se vuelven a leer", async () => {
  // Los costos finales en su lugar —la suma cierra— y los importes impresos del
  // OREO y el TITA cruzados: la cuenta de la fila lo delata.
  const cruzada = papel([{ ...OREO, importeImpreso: 10965.74 }, { ...TITA, importeImpreso: 20718.28 }, MK, URANO]);
  assert.equal(pasarPorLaPuerta({ lectura: cruzada, receta: { interpretada: true } }).cierra, true);
  const grande = grandeQueDevuelve(BIEN);
  const e = await escalarAlModeloGrande({ resultado: { ok: true, lectura: cruzada }, explicaciones: EXPLICACIONES, interpretes: grande.interpretes });
  assert.equal(e.motivo, ESCALADA.RENGLONES_QUE_NO_CIERRAN);
  assert.equal(e.cerro, true);
});

test("CONTRAPRUEBA: un papel que se lee bien se lee igual que hoy, sin volver a leer", async () => {
  const grande = grandeQueDevuelve(BIEN);
  const e = await escalarAlModeloGrande({ resultado: { ok: true, lectura: BIEN }, explicaciones: EXPLICACIONES, interpretes: grande.interpretes });
  assert.equal(e.motivo, null);
  assert.equal(e.llamo, false);
  assert.equal(grande.pedidos.length, 0, "no se llama al grande");
  // Y un descuento que el lector no anotó —las lecturas de antes no traen la
  // bonificación— no es un renglón corrido: el mismo papel sin la columna.
  const sinBonif = papel([OREO, TITA, MK, URANO].map(({ bonificacion, ...r }) => r));
  assert.deepEqual(renglonesQueNoCierran(sinBonif), []);
  // Y la boleta real de DYSSA #153, como la devolvió el lector: el Gancia trae
  // su 10 % de descuento sin anotar y es el único renglón así. Se lee igual que
  // hoy: cierra, ningún renglón marcado y sin llamar al grande.
  const dyssa = normalizarLectura(
    JSON.parse(fs.readFileSync(new URL("../lecturaInterpretada.fixture.json", import.meta.url), "utf8")).dyssa,
    { interpretada: true }
  );
  assert.deepEqual(renglonesQueNoCierran(dyssa), []);
  const otro = grandeQueDevuelve(BIEN);
  const conDyssa = await escalarAlModeloGrande({
    resultado: { ok: true, lectura: dyssa },
    explicaciones: [{ tipoComprobante: dyssa.identidad?.tipo ?? "A", explicacion: "DYSSA", version: 1 }],
    interpretes: otro.interpretes,
  });
  assert.equal(conDyssa.motivo, null);
  assert.equal(otro.pedidos.length, 0);
});

// ── EL GIRO DEL VISOR VIAJA AL LECTOR ─────────────────────────────────────

function sharpQueAnota({ salida = 400 } = {}) {
  const giros = [];
  const api = {
    rotate(...a) { giros.push(a); return api; },
    metadata: async () => ({ width: 4032, height: 3024 }),
    resize() { return api; },
    jpeg() { return api; },
    toBuffer: async () => ({ data: Buffer.alloc(salida), info: { width: 3000, height: 2250 } }),
  };
  const fabrica = () => api;
  fabrica.giros = giros;
  return fabrica;
}

test("LA FOTO ENDEREZADA CON «GIRAR» VIAJA ENDEREZADA: primero el EXIF, después el giro elegido", async () => {
  const sharp = sharpQueAnota();
  await achicarParaLeer({ bytes: Buffer.alloc(5_000_000), mime: "image/jpeg", orden: 1, giroGrados: 90 }, sharp);
  assert.deepEqual(sharp.giros, [[], [90]]);
  const sinGiro = sharpQueAnota();
  await achicarParaLeer({ bytes: Buffer.alloc(5_000_000), mime: "image/jpeg", orden: 1, giroGrados: 0 }, sinGiro);
  assert.deepEqual(sinGiro.giros, [[]], "sin giro elegido, como siempre");
  assert.equal(giroElegido(450), 90);
  assert.equal(giroElegido("x"), 0);
});

test("CON GIRO, AUNQUE NO ACHIQUE, VIAJA LA GIRADA Y NO LA ORIGINAL DE COSTADO", async () => {
  const sharp = sharpQueAnota({ salida: 900_000 });
  const r = await achicarParaLeer({ bytes: Buffer.alloc(200_000), mime: "image/jpeg", orden: 1, giroGrados: 270 }, sharp);
  assert.equal(r.bytes.length, 900_000, "la girada, aunque pese más");
  assert.equal(r.achicado.hubo, true);
});

test("LAS DOS RUTAS QUE LEEN LA FOTO LE PASAN EL GIRO ELEGIDO", () => {
  const sinComentarios = (p) =>
    fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const leer = sinComentarios("../../../../app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(leer, /select: \{ orden: true, ubicacion: true, mime: true, nombre: true, giroGrados: true \}/);
  assert.match(leer, /giroGrados: f\.giroGrados \?\? 0/);
  const explicacion = sinComentarios("../../../../app/api/compras-proveedor/recetas/explicacion/route.js");
  assert.match(explicacion, /select: \{ ubicacion: true, mime: true, orden: true, giroGrados: true \}/);
  assert.match(explicacion, /giroGrados: a\.giroGrados \?\? 0/);
});

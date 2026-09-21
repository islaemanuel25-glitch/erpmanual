// CORREGIR UN PAPEL QUE NO CERRÓ, CON LOS DOS PAPELES REALES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lecturaGuardada.test.mjs
//
// ── EL CAMINO QUE SE EJERCE ───────────────────────────────────────────────
//
// Es el de la recepción, entero y sin base: lo que quedó GUARDADO de una
// lectura se rearma, alguien elige el número que dice el papel, y se vuelve a
// pasar por LA MISMA PUERTA que usó la lectura original. Lo único que este
// archivo no puede ejercer es el `update` de Prisma; todo lo que decide el
// estado está acá.
//
// ── LOS FIXTURES NO ESTÁN ESCRITOS A MANO ─────────────────────────────────
//
// Son las filas como las escribe `leer/[id]/route.js` a partir de la lectura
// medida de Paty (`sonda-explicacion-papel.mjs`, cd05b779) — con `pesoKg` y
// `bonificacionPct`, que es lo que la columna guarda, y no `peso` y
// `bonificacion`, que es como se llaman en la lectura. Esa traducción es
// justamente lo que este archivo defiende: si se rompe, los kilos desaparecen
// al corregir y tres renglones de Paty pasan a valer cuatro veces su costo.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lecturaDesdeLoGuardado,
  conLosSubtotalesCorregidos,
  ordenesQueNoExisten,
} from "@/lib/compras-proveedor/comprobante/lecturaGuardada";
import { pasarPorLaPuerta, ESTADO } from "@/lib/compras-proveedor/comprobante/lector/puerta";

/** La receta de Paty, medida: sin IVA discriminado y sin percepciones. */
const RECETA_PATY = {
  ivaPorLinea: false,
  alicuotaIvaPct: 0,
  tieneImpuestoInterno: false,
  ivaIncluyeInternoEnLaBase: false,
  percepciones: [],
  percepcionesEnCosto: true,
};

/** Un renglón como lo guarda la ruta de lectura. */
const fila = (orden, textoCrudo, cantidad, netoUnitario, subtotalImpreso, pesoKg, bonificacionPct) => ({
  id: orden * 10,
  orden,
  textoCrudo,
  codigoProveedor: null,
  cantidad,
  netoUnitario,
  subtotalImpreso,
  internoUnitario: null,
  pesoKg,
  bonificacionPct,
});

/** El comprobante de Paty tal como quedó en la base: MAL_LEIDO por el yogur. */
const COMPROBANTE_DE_PATY = {
  id: 501,
  estado: ESTADO.MAL_LEIDO,
  pedidoId: 242,
  proveedorId: 6,
  modeloLectura: "gemini-3.6-flash",
  recetaUsada: RECETA_PATY,
  lineasEnElPapel: 11,
  netoLeido: 861376.07,
  ivaLeido: null,
  internoLeido: null,
  totalLeido: 861376.07,
  lineas: [
    fila(1, "BUTLER C. TRAD 9MM X2,5KG -6-", 12, 18991.95, 97998.47, null, 57),
    fila(2, "TREM3 MANTECA X100 GS 60", 60, 1984.23, 90481.03, null, 24),
    fila(3, "TREM3 QUESO RALL 40GR X20 6", 6, 25565.43, 122714.07, null, 20),
    fila(4, "PATY CLASICO FLOW X80GR X2 30", 90, 4113.57, 185110.67, null, 50),
    // EL MAL LEÍDO: el papel dice 46.886,55 y el modelo leyó 46.896,56.
    fila(5, "TREM3 YOG VAINILLA X 900ML 10", 30, 2442.01, 46896.56, null, 36),
    fila(6, "TREM3 YOG FRUTILLA X 900ML 10", 40, 2442.01, 62515.42, null, 36),
    fila(7, "TREM3 Q.UNT CLASICO X180GR -12-", 12, 2502.4, 21020.17, null, 30),
    fila(8, "TREM3 Q.UNT SALAME X180GR -12-", 12, 2502.4, 21020.17, null, 30),
    fila(9, "FOX SAL BAST CHACAR GRUESO X2U 1", 2, 22627, 47245.18, 2.9, 28),
    fila(10, "FOX SAL PIC FINO X 4U 1", 3, 24889.7, 37633.23, 2.1, 28),
    fila(11, "TREM3 QUESO DANBO (AMARILLO) -1-", 3, 16694.69, 128751.11, 11.685, 34),
  ],
};

/** El de Mauro: sin kilos, sin descuento y sin total impreso. */
const COMPROBANTE_DE_MAURO = {
  id: 232,
  estado: ESTADO.SIN_TOTAL,
  pedidoId: 232,
  proveedorId: 3,
  modeloLectura: "gemini-3.6-flash",
  recetaUsada: {},
  lineasEnElPapel: 2,
  netoLeido: null,
  ivaLeido: null,
  internoLeido: null,
  totalLeido: null,
  lineas: [
    fila(1, "PHILIPS MORRIS 10", 80, 3460.32, 276825.6, null, null),
    fila(2, "M.CRAFTED 20 BOX RED", 2, 40500, 81000, null, null),
  ],
};

/** Lo que dice el papel de Paty en el renglón del yogur. */
const LO_QUE_DICE_EL_PAPEL = 46886.55;

// ── LO QUE SE REARMA ──────────────────────────────────────────────────────

test("LOS KILOS Y EL DESCUENTO SOBREVIVEN A LA IDA Y VUELTA", () => {
  const lectura = lecturaDesdeLoGuardado(COMPROBANTE_DE_PATY);
  const danbo = lectura.lineas[10];
  // La columna se llama `pesoKg` y la lectura `peso`. Ese renombre es el que
  // tiene que seguir andando: sin kilos, el danbo pasa de $11.018,49 el kilo a
  // $42.917,04 la pieza.
  assert.equal(danbo.peso, 11.685);
  assert.equal(danbo.bonificacion, 34);
  assert.equal(danbo.descripcion, "TREM3 QUESO DANBO (AMARILLO) -1-");
  assert.equal(danbo.orden, 11);
  assert.equal(lectura.pie.total, 861376.07);
  assert.equal(lectura.hayTotalImpreso, true);
});

test("UN PAPEL SIN TOTAL SE REARMA SIN INVENTARLE UNO", () => {
  const lectura = lecturaDesdeLoGuardado(COMPROBANTE_DE_MAURO);
  assert.equal(lectura.pie.total, null);
  // NULL, NO CERO. Un cero acá haría que la diferencia fuera el comprobante
  // entero y el estado dijera "mal leído" sobre una lectura que puede estar
  // perfecta. Es el mismo cero falsy que ya mordió cuatro veces en el módulo.
  assert.notEqual(lectura.pie.total, 0);
  assert.equal(lectura.hayTotalImpreso, false);
  assert.equal(lectura.lineas[0].peso, null);
  assert.equal(lectura.lineas[0].bonificacion, null);
});

// ── LO QUE PASA AL CORREGIR ───────────────────────────────────────────────

test("EL PAPEL DE PATY NO CIERRA, Y CIERRA CUANDO SE ARREGLA EL YOGUR", () => {
  const original = lecturaDesdeLoGuardado(COMPROBANTE_DE_PATY);
  const antes = pasarPorLaPuerta({ lectura: original, receta: RECETA_PATY });
  assert.equal(antes.estado, ESTADO.MAL_LEIDO);
  assert.equal(antes.cierra, false);
  assert.equal(antes.proponeCostos, false);
  // Y señala UN solo renglón: el quinto.
  assert.equal(antes.lineasIncoherentes.length, 1);
  assert.equal(antes.lineasIncoherentes[0].indice, 4);

  const corregida = conLosSubtotalesCorregidos(original, { 5: LO_QUE_DICE_EL_PAPEL });
  const despues = pasarPorLaPuerta({ lectura: corregida, receta: RECETA_PATY });
  assert.equal(despues.estado, ESTADO.CARGADO);
  assert.equal(despues.cierra, true);
  // Y recién ahí se puede proponer un costo, que es todo el punto.
  assert.equal(despues.proponeCostos, true);
});

test("CORREGIR CON UN NÚMERO QUE TAMPOCO ES DEJA EL PAPEL MAL_LEIDO", () => {
  // No se corrige para que cierre: se corrige para que diga lo que dice el
  // papel. Si el número elegido no es, sigue sin cerrar y se ve.
  const original = lecturaDesdeLoGuardado(COMPROBANTE_DE_PATY);
  const mal = conLosSubtotalesCorregidos(original, { 5: 40000 });
  const puerta = pasarPorLaPuerta({ lectura: mal, receta: RECETA_PATY });
  assert.equal(puerta.estado, ESTADO.MAL_LEIDO);
  assert.equal(puerta.cierra, false);
});

test("CORREGIR NO TOCA NINGÚN OTRO RENGLÓN", () => {
  const original = lecturaDesdeLoGuardado(COMPROBANTE_DE_PATY);
  const corregida = conLosSubtotalesCorregidos(original, { 5: LO_QUE_DICE_EL_PAPEL });
  assert.equal(corregida.lineas[4].subtotalImpreso, LO_QUE_DICE_EL_PAPEL);
  for (let i = 0; i < original.lineas.length; i++) {
    if (i === 4) continue;
    assert.equal(corregida.lineas[i].subtotalImpreso, original.lineas[i].subtotalImpreso);
  }
  // Y no muta la original: hace falta para poder decir qué se cambió.
  assert.equal(original.lineas[4].subtotalImpreso, 46896.56);
  // Los kilos del renglón corregido tampoco se pierden por el camino.
  const conKilos = conLosSubtotalesCorregidos(original, { 11: 128751.11 });
  assert.equal(conKilos.lineas[10].peso, 11.685);
});

test("UNA CORRECCIÓN SOBRE UN RENGLÓN QUE NO EXISTE SE RECHAZA", () => {
  const lectura = lecturaDesdeLoGuardado(COMPROBANTE_DE_PATY);
  assert.deepEqual(ordenesQueNoExisten(lectura, { 5: 1 }), []);
  assert.deepEqual(ordenesQueNoExisten(lectura, { 99: 1 }), [99]);
});

test("EL PAPEL DE MAURO SIGUE SIENDO RECIBIBLE: SIN TOTAL NO ES MAL LEÍDO", () => {
  // El caso que no hay que romper. Mauro no trae total, así que no hay contra
  // qué verificar, y eso NO es haber leído mal.
  const puerta = pasarPorLaPuerta({
    lectura: lecturaDesdeLoGuardado(COMPROBANTE_DE_MAURO),
    receta: {},
  });
  assert.equal(puerta.estado, ESTADO.SIN_TOTAL);
  assert.equal(puerta.diferenciaCentavos, null);
  // Y sus dos renglones dan su cuenta, que es lo único verificable sin pie.
  assert.equal(puerta.lineasIncoherentes.length, 0);
});

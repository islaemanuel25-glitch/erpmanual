// CANDADO: LAS TRANSFERENCIAS DE "¿POR QUÉ CAMBIÓ?" SUMAN LA CATEGORÍA, AL CENTAVO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/transferenciasDelValor.test.mjs
//
// La categoría Transferencias se muestra como UNA fila por transferencia. Acá se
// afirma, por el camino real —`valorizarCadena` → `totalesDelValor` →
// `efectosDeLasPartes` → `agruparPorDocumento`—, que esas filas suman
// EXACTAMENTE la categoría del resumen, que una transferencia enviada ayer y
// recibida hoy está hoy, que el signo sale del cambio físico de ESTA ubicación
// y que el tránsito no entra. Las filas del libro tienen la forma que devuelve
// `sqlMovimientosDeCategoria` (cantidades en texto, día argentino).

import { test } from "node:test";
import assert from "node:assert/strict";

import { CATEGORIA, DIRECCION, agruparPorDocumento, origenesDeLaCategoria } from "./explicacionDelValor.js";
import { aMilesimas } from "./stockDiario.js";
import { cantidadesDeLaCadena, costoCongeladoPorDia, totalesDelValor, valorizarCadena } from "./valorDelStock.js";
import * as servidor from "./valorDelStockServer.js";

const D1 = "2026-09-29";
const D2 = "2026-09-30";
let version = 0;
const vBase = (productoBaseId, precioCosto, x = {}) => ({ version: String(++version), productoBaseId, tipo: "CAMBIO", dia: "2026-09-01", precioCosto: String(precioCosto), unidadMedida: "unidad", factorPack: null, pesoReferenciaKg: null, pesoEsFijo: false, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", esCombo: false, ...x });
const vUbic = (productoLocalId, productoBaseId) => ({ version: String(++version), productoLocalId, productoBaseId, tipo: "PUNTO_CERO", dia: "2026-09-01", precioCosto: null, esDeposito: false });
const ENVIO = "TRANSFERENCIA_ENVIO";
const RECEPCION = "TRANSFERENCIA_RECEPCION";
const CANCELACION = "TRANSFERENCIA_CANCELACION";

/**
 * Una ubicación con sus cadenas y sus movimientos, valorizada como la valoriza
 * el servidor. Cada movimiento: [id, día, origen, referencia, delta en unidades].
 * De ahí salen, igual que en la base: los cierres, los grupos de
 * `sqlEfectosPorOrigen` y las filas de `sqlMovimientosDeCategoria`.
 */
function ubicacion(dias, cadenas) {
  const filas = [];
  const valorizadas = cadenas.map(({ pl, abre, base }) => {
    const movs = cadenas.find((c) => c.pl === pl).movs.filter(([, dia]) => dias.includes(dia));
    let q = abre;
    const cierres = [];
    const efectos = new Map();
    for (const [id, dia, origen, ref, delta] of movs) {
      const anterior = q;
      q = Math.round((q + delta) * 1000) / 1000;
      filas.push({ id, productoLocalId: pl, dia, origen, origenRef: ref, cantidadAnterior: String(anterior), cantidadPosterior: String(q) });
      cierres.push({ productoLocalId: pl, dia, tipo: "CAMBIO", cantidadPosterior: String(q) });
      if (delta === 0) continue;
      const direccion = delta > 0 ? DIRECCION.ENTRADA : DIRECCION.SALIDA;
      if (!efectos.has(dia)) efectos.set(dia, []);
      const grupo = efectos.get(dia).find((x) => x.origen === origen && x.direccion === direccion);
      if (grupo) {
        grupo.delta += aMilesimas(String(delta));
        grupo.movimientos += 1;
      } else efectos.get(dia).push({ origen, direccion, delta: aMilesimas(String(delta)), movimientos: 1 });
    }
    const { cantidadAlAbrir, cierres: mapa } = cantidadesDeLaCadena({ alAbrir: { tipo: "CAMBIO", cantidadPosterior: String(abre) }, cierres });
    const costoDelDia = costoCongeladoPorDia({ ubicaciones: [vUbic(pl, pl)], basesPorId: new Map([[pl, [base]]]) });
    return { productoLocalId: pl, valor: valorizarCadena({ dias, cantidadAlAbrir, cierres: mapa, costoDelDia, efectosPorDia: efectos }) };
  });
  const v = { cadenas: valorizadas, totales: totalesDelValor(valorizadas, dias, { conExplicacion: true }) };
  // Las filas de la categoría, como las trae la consulta: solo las que cambiaron cantidad.
  const deLaCategoria = filas.filter((f) => origenesDeLaCategoria(CATEGORIA.TRANSFERENCIAS).includes(f.origen) && f.cantidadAnterior !== f.cantidadPosterior);
  return { v, filas: deLaCategoria };
}

const transferencias = ({ v, filas }) => {
  const efectoDe = servidor.efectosDeLasPartes(v, filas);
  return agruparPorDocumento(filas.map((f) => ({ origen: f.origen, origenRef: f.origenRef, efecto: efectoDe(f).efecto })));
};
const categoria = (v) => v.totales.explicacion.categorias.find((c) => c.categoria === CATEGORIA.TRANSFERENCIAS).neto;
const suma = (gs) => gs.reduce((s, g) => s + g.neto, 0);

// Un local DESTINO de varias transferencias, que además envía una y recibe una
// cancelación. Pack x7 a $1.000: la unidad vale $142,857…, los redondeos de a
// uno no suman solos. La otra cadena, a $33,33.
const CADENAS = [
  {
    pl: 7,
    abre: 20,
    base: vBase(7, "1000.00", { unidadMedida: "pack", factorPack: 7 }),
    movs: [
      [101, D2, RECEPCION, "319", 1], // enviada el 29, recibida el 30
      [102, D2, RECEPCION, "327", 1],
      [103, D2, "VENTA", "9001", -2],
      [104, D2, RECEPCION, "328", 1],
    ],
  },
  {
    pl: 8,
    abre: 50,
    base: vBase(8, "33.33"),
    movs: [
      [205, D1, ENVIO, "318", -2], // el día anterior, esta ubicación envió
      [201, D2, RECEPCION, "319", 5],
      [202, D2, RECEPCION, "327", 4],
      [203, D2, ENVIO, "330", -6], // envía 6…
      [204, D2, RECEPCION, "330", 1], // …el destino recibió 5: le vuelve 1
      [206, D2, RECEPCION, "329", 0], // solo liberó tránsito: no cambia la cantidad
      [207, D2, CANCELACION, "331", 2], // se canceló una enviada: vuelve al stock
    ],
  },
];

test("5. Σ transferencias = categoría Transferencias, al centavo, aunque cada movimiento redondee distinto", () => {
  const e = ubicacion([D2], CADENAS);
  const gs = transferencias(e);
  assert.equal(suma(gs), categoria(e.v), "las transferencias no suman la categoría");
  assert.equal(e.v.totales.explicacion.cuadra, true);
  // El caso no es trivial: redondeadas de a una, las recepciones del pack no dan su parte.
  const unaPorUna = [101, 102, 104].reduce((s) => s + Math.round((1000 * (100000 / 7)) / 1000), 0);
  const parte = e.v.cadenas[0].valor.partesPorDia.get(D2).partes.find((p) => p.origen === RECEPCION).centavos;
  assert.notEqual(unaPorUna, parte, "el caso no produce residuo: no prueba el reparto");
});

test("2-4. varias transferencias en el mismo día: una fila cada una, con todos sus productos, en orden", () => {
  const gs = transferencias(ubicacion([D2], CADENAS));
  assert.deepEqual(gs.map((g) => g.id), [319, 327, 328, 330, 331], "la 329 solo movió tránsito; la 318 es de otro día");
  const t319 = gs.find((g) => g.id === 319);
  assert.equal(t319.movimientos, 2, "la #319 trajo dos productos");
  assert.deepEqual(t319.origenes, [RECEPCION]);
  assert.ok(t319.neto > 0);
});

test("6. una transferencia que esta ubicación ENVIÓ resta, y su diferencia de recepción vuelve con su signo", () => {
  const t330 = transferencias(ubicacion([D2], CADENAS)).find((g) => g.id === 330);
  assert.deepEqual(t330.origenes.sort(), [ENVIO, RECEPCION].sort());
  assert.equal(t330.salidas, -19998, "−6 u a $33,33");
  assert.equal(t330.entradas, 3333, "+1 u devuelta");
  assert.equal(t330.neto, -16665);
  const cancelada = transferencias(ubicacion([D2], CADENAS)).find((g) => g.id === 331);
  assert.equal(cancelada.neto, 6666, "la cancelación devuelve al stock");
});

test("7. el tránsito puro no tiene impacto: la consulta trae solo lo que cambió cantidad", () => {
  const sql = servidor.sqlMovimientosDeCategoria({ localId: 1, desde: D1, hasta: D2, origenes: ["X"] }).sql;
  assert.match(sql, /coalesce\(m\."cantidadPosterior", 0\) <> coalesce\(m\."cantidadAnterior", 0\)/);
  assert.doesNotMatch(sql, /enTransito/);
  assert.doesNotMatch(sql, /LIMIT/, "sin límite: la agrupación necesita TODAS las filas de la categoría");
  assert.match(servidor.sqlMovimientosDeCategoria({ localId: 1, desde: D1, hasta: D2, origenes: ["X"], limite: 50, desplazamiento: 100 }).sql, /LIMIT \? OFFSET \?/, "el detalle paginado sigue igual");
  assert.ok(!transferencias(ubicacion([D2], CADENAS)).some((g) => g.id === 329));
});

test("3, 16. enviada el día anterior y recibida hoy: en el período de dos días están las dos, y siguen sumando la categoría", () => {
  const dos = ubicacion([D1, D2], CADENAS);
  const gs = transferencias(dos);
  assert.deepEqual(gs.map((g) => g.id), [318, 319, 327, 328, 330, 331]);
  assert.equal(gs.find((g) => g.id === 318).neto, -6666);
  assert.equal(suma(gs), categoria(dos.v));
  // El día solo: la del 29 no está, y la del 30 sí, aunque se haya enviado el 29.
  assert.ok(!transferencias(ubicacion([D2], CADENAS)).some((g) => g.id === 318));
});

test("un movimiento de una cadena sin costo no suma: se cuenta aparte, como en el resumen", () => {
  const sinCosto = [{ pl: 9, abre: 3, base: vBase(9, "0"), movs: [[301, D2, RECEPCION, "319", 2]] }, ...CADENAS];
  const e = ubicacion([D2], sinCosto);
  const gs = transferencias(e);
  assert.equal(gs.find((g) => g.id === 319).sinCosto, 1);
  assert.equal(suma(gs), categoria(e.v), "lo sin costo se coló en la suma");
});

test("una referencia que no es un id va al grupo sin documento, al final", () => {
  const gs = agruparPorDocumento([
    { origen: RECEPCION, origenRef: "12", efecto: 100 },
    { origen: RECEPCION, origenRef: null, efecto: -5 },
    { origen: RECEPCION, origenRef: "abc", efecto: 7 },
    { origen: ENVIO, origenRef: "3", efecto: 0 },
  ]);
  assert.deepEqual(gs.map((g) => [g.id, g.neto, g.movimientos]), [[3, 0, 1], [12, 100, 1], [null, 2, 2]]);
});

test("14. no hay N+1: las cabeceras de TODAS las transferencias van en una consulta", () => {
  const sql = servidor.sqlCabecerasDeTransferencias({ ids: [319, 327, 328] }).sql;
  assert.match(sql, /WHERE t\."id" = ANY\(\?::int\[\]\)/);
  assert.match(sql, /"libro_stock_dia"\(t\."fechaEnvio"\)/, "el día de envío, con el reloj del libro");
  assert.match(sql, /"libro_stock_dia"\(t\."fechaRecepcion"\)/);
  const fuente = servidor.transferenciasDelValor.toString();
  assert.equal((fuente.match(/\$queryRaw/g) || []).length, 2, "una consulta para los movimientos y otra para las cabeceras");
  assert.doesNotMatch(fuente, /for \(|\.map\(async/, "una consulta por transferencia");
});

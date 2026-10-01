// LA CUENTA DE UN LOCAL EN UN PERÍODO, EN SUS DOS CRITERIOS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/cuentaDelPeriodo.test.mjs
//
// `cuentaDelPeriodo` es la única función que decide qué transferencias entran en
// un período y cuánto valen. La usan la pantalla de un local en Transferencias y
// el "Pago a depósito" de Finanzas. Acá se afirma el criterio de RECEPCIÓN —el de
// Finanzas— caso por caso, y que el de ENVÍO sigue dando lo que daba.
//
// ── LA FORMA DEL FIXTURE ES LA DEL `select` ────────────────────────────────
//
// Las filas tienen exactamente las claves de `SELECT_TRANSFERENCIA_DE_LA_CUENTA`,
// y hay un candado (P0) que lo exige leyendo la constante: el defecto que este
// repo tiene anotado como el que más se repite es un candado montado sobre una
// forma que el endpoint nunca manda. Los importes y cantidades van como cadenas
// decimales, que es como los da un `Decimal` de Prisma al pasarlo a número.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  cuentaDelLocal,
  cuentaDelPeriodo,
  importeDeLaTransferenciaCentavos,
} from "@/lib/transferencias/bloquesPorLocal";
import { importeRecibidoDeDetalleCentavos } from "@/lib/transferencias/agregadosPeriodo";
import { CRITERIO_CUENTA } from "@/lib/transferencias/criterioDeCuenta";
import {
  SELECT_TRANSFERENCIA_DE_LA_CUENTA,
  leerCuentaPorRecepcion,
  primeraRecepcion,
  resumenDePagoADeposito,
  whereDeRecepcion,
} from "@/lib/transferencias/cuentaDelPeriodoServer";

const { RECEPCION, ENVIO } = CRITERIO_CUENTA;

// Semana de domingo a sábado. A = 13→19, B = 20→26.
const SEMANA_A = Object.freeze({ desde: "2026-09-13", hasta: "2026-09-19" });
const SEMANA_B = Object.freeze({ desde: "2026-09-20", hasta: "2026-09-26" });

const BASE = Object.freeze({
  precio_costo: "23333.33",
  unidad_medida: "cajon",
  factor_pack: 8,
  nombre: "COCA COLA 2L",
  pesoEsFijo: false,
  pesoReferenciaKg: null,
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "UNIDAD",
});

/** 4 CAJÓN x8 —32 físicas— a $23.333,33 el cajón. `recibido` en cajones. */
const linea = (recibido) => ({
  cantidad: "32.000",
  recibido: recibido == null ? null : String(recibido),
  recibidoUnidadesSueltas: null,
  precioCosto: "23333.33",
  unidadEnviada: "UNIDAD",
  presentacionEnvio: "CAJON",
  cantidadPresentada: "4.000",
  factorPresentacion: 8,
  sueltasEnviadas: "0.000",
  pesoPiezaKg: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: recibido != null,
  productoId: 70,
  // El costo vivo del producto del destino es OTRO a propósito: si alguna cuenta
  // lo leyera en vez del congelado en la línea, el número cambiaría.
  producto: { precio_costo: "99999.99", nombre: "COCA COLA 2L", base: BASE },
});

const DEPOSITO = Object.freeze({ id: 1, nombre: "Depósito", es_deposito: true });

/** Una fila como la devuelve `SELECT_TRANSFERENCIA_DE_LA_CUENTA`. */
function fila({ id, estado, envio, recepcion = null, destinoId = 4, recibido = 4, origen = DEPOSITO }) {
  return {
    id,
    estado,
    fechaEnvio: envio ? new Date(envio) : null,
    fechaRecepcion: recepcion ? new Date(recepcion) : null,
    createdAt: new Date(envio || "2026-09-01T12:00:00.000Z"),
    destinoId,
    origen,
    destino: { id: destinoId, nombre: `Local ${destinoId}` },
    detalle: [linea(recibido)],
  };
}

const COMPLETA = 93333.32; // 4 cajones recibidos de 4
const CON_FALTANTE = 69999.99; // 3 cajones recibidos de 4

// ── 0 · EL FIXTURE ES LA FORMA REAL ─────────────────────────────────────────

test("P0 · el fixture tiene todas las claves del `select` compartido, y ninguna más", () => {
  const f = fila({ id: 1, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z" });
  assert.deepEqual(Object.keys(f).sort(), Object.keys(SELECT_TRANSFERENCIA_DE_LA_CUENTA).sort());
  assert.deepEqual(
    Object.keys(f.detalle[0]).sort(),
    Object.keys(SELECT_TRANSFERENCIA_DE_LA_CUENTA.detalle.select).sort()
  );
  assert.deepEqual(
    Object.keys(f.detalle[0].producto.base).sort(),
    Object.keys(SELECT_TRANSFERENCIA_DE_LA_CUENTA.detalle.select.producto.select.base.select).sort()
  );
  assert.equal(SELECT_TRANSFERENCIA_DE_LA_CUENTA.fechaRecepcion, true, "sin fechaRecepcion no hay criterio de recepción");
});

// ── 1 · QUÉ ENTRA EN EL PAGO A DEPÓSITO ─────────────────────────────────────

test("P1 · solo `Recibida` entra en el total", () => {
  const ts = [
    fila({ id: 1, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z" }),
    fila({ id: 2, estado: "Enviada", envio: "2026-09-14T12:00:00.000Z", recibido: null }),
    fila({ id: 3, estado: "Recibiendo", envio: "2026-09-14T12:00:00.000Z", recibido: 2 }),
    fila({ id: 4, estado: "Cancelada", envio: "2026-09-14T12:00:00.000Z", recibido: null }),
  ];
  const c = cuentaDelPeriodo({ transferencias: ts, rango: SEMANA_A, criterio: RECEPCION });
  assert.deepEqual(c.transferencias.map((t) => t.id), [1]);
  assert.equal(c.cantidad, 1);
  assert.equal(c.aPagar, COMPLETA);
});

test("P1b · manda el ESTADO: una fecha de recepción sin `Recibida` no entra", () => {
  // ── ESTA COMBINACIÓN NO OCURRE HOY, Y EL CANDADO LO DICE ─────────────────
  //
  // `fechaRecepcion` la escribe solo `confirmar-recepcion`, en la misma
  // transacción que pone `Recibida`, así que en la base las dos van juntas. La
  // contraprueba mostró que P1 queda verde aunque se acepte `Recibiendo`: la
  // fecha nula ya la deja afuera. Este caso existe para que la regla "solo
  // Recibida" se afirme por sí misma y no de rebote, si mañana otro camino
  // escribe la fecha sin cerrar la recepción.
  const ts = ["Recibiendo", "Enviada", "Cancelada"].map((estado, i) => ({
    ...fila({ id: 200 + i, estado, envio: "2026-09-14T12:00:00.000Z" }),
    fechaRecepcion: new Date("2026-09-15T12:00:00.000Z"),
  }));
  const c = cuentaDelPeriodo({ transferencias: ts, rango: SEMANA_A, criterio: RECEPCION });
  assert.equal(c.cantidad, 0);
  assert.equal(c.aPagar, 0);
});

test("P2 · cae por `fechaRecepcion`, no por `fechaEnvio`", () => {
  const enviadaEnARecibidaEnB = fila({
    id: 10,
    estado: "Recibida",
    envio: "2026-09-18T12:00:00.000Z",
    recepcion: "2026-09-21T12:00:00.000Z",
  });
  const enviadaAntesRecibidaEnA = fila({
    id: 11,
    estado: "Recibida",
    envio: "2026-09-10T12:00:00.000Z",
    recepcion: "2026-09-14T12:00:00.000Z",
  });
  const c = cuentaDelPeriodo({ transferencias: [enviadaEnARecibidaEnB, enviadaAntesRecibidaEnA], rango: SEMANA_A, criterio: RECEPCION });
  assert.deepEqual(c.transferencias.map((t) => t.id), [11], "entró por la fecha de envío");
});

test("P3 · una `Enviada` no descuenta: va a pendientes", () => {
  const c = cuentaDelPeriodo({
    transferencias: [fila({ id: 20, estado: "Enviada", envio: "2026-09-14T12:00:00.000Z", recibido: null })],
    rango: SEMANA_A,
    criterio: RECEPCION,
  });
  assert.equal(c.aPagar, 0);
  assert.equal(c.cantidad, 0);
  assert.equal(c.pendientes.cantidad, 1);
  assert.equal(c.pendientes.importe, COMPLETA, "sin contar, la pendiente vale lo enviado");
});

test("P4 · una `Recibiendo` no descuenta aunque ya tenga líneas contadas", () => {
  const c = cuentaDelPeriodo({
    transferencias: [fila({ id: 21, estado: "Recibiendo", envio: "2026-09-14T12:00:00.000Z", recibido: 3 })],
    rango: SEMANA_A,
    criterio: RECEPCION,
  });
  assert.equal(c.aPagar, 0);
  assert.equal(c.pendientes.cantidad, 1);
  assert.equal(c.pendientes.importe, CON_FALTANTE, "la pendiente se valoriza con la misma puerta");
});

test("P5 · `Cancelada` y `Cancelando` no entran en ninguna de las dos listas", () => {
  const c = cuentaDelPeriodo({
    transferencias: [
      fila({ id: 30, estado: "Cancelada", envio: "2026-09-14T12:00:00.000Z", recibido: null }),
      fila({ id: 31, estado: "Cancelando", envio: "2026-09-14T12:00:00.000Z", recibido: null }),
    ],
    rango: SEMANA_A,
    criterio: RECEPCION,
  });
  assert.equal(c.cantidad, 0);
  assert.equal(c.aPagar, 0);
  assert.equal(c.pendientes.cantidad, 0);
  assert.equal(c.pendientes.importe, 0);
});

test("P6 · enviada en la semana A y recibida en la B: no está en A, está en B", () => {
  const t = fila({ id: 40, estado: "Recibida", envio: "2026-09-18T12:00:00.000Z", recepcion: "2026-09-22T12:00:00.000Z" });
  const enA = cuentaDelPeriodo({ transferencias: [t], rango: SEMANA_A, criterio: RECEPCION });
  const enB = cuentaDelPeriodo({ transferencias: [t], rango: SEMANA_B, criterio: RECEPCION });
  assert.equal(enA.cantidad, 0);
  assert.equal(enA.aPagar, 0);
  assert.equal(enA.pendientes.cantidad, 0, "ya está recibida: no puede seguir pendiente en A");
  assert.equal(enB.cantidad, 1);
  assert.equal(enB.aPagar, COMPLETA);
});

test("P6b · el día es el ARGENTINO: recibida el sábado a las 22 cae en ese sábado", () => {
  // 2026-09-20T01:00Z es el sábado 19 a las 22:00 en Argentina. Por el día UTC
  // caería en la semana B.
  const t = fila({ id: 41, estado: "Recibida", envio: "2026-09-19T12:00:00.000Z", recepcion: "2026-09-20T01:00:00.000Z" });
  assert.equal(cuentaDelPeriodo({ transferencias: [t], rango: SEMANA_A, criterio: RECEPCION }).cantidad, 1);
  assert.equal(cuentaDelPeriodo({ transferencias: [t], rango: SEMANA_B, criterio: RECEPCION }).cantidad, 0);
});

// ── 2 · CUÁNTO VALE ─────────────────────────────────────────────────────────

test("P7 · el importe es `importeRecibidoDeDetalleCentavos`, con el costo CONGELADO", () => {
  const t = fila({ id: 50, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z" });
  const esperado = importeRecibidoDeDetalleCentavos(t.detalle, { origenEsDeposito: true });
  assert.equal(importeDeLaTransferenciaCentavos(t), esperado);
  assert.equal(cuentaDelPeriodo({ transferencias: [t], rango: SEMANA_A, criterio: RECEPCION }).aPagar, esperado / 100);
  // El costo vivo del producto es 99.999,99: si se leyera, no daría 93.333,32.
  assert.equal(esperado, 9333332);

  // Y la función de la cuenta llama a esa puerta y no a otra: leído del fuente.
  const src = readFileSync("lib/transferencias/bloquesPorLocal.js", "utf8").replace(/\/\/[^\n]*/g, "");
  const cuerpo = src.slice(src.indexOf("export function importeDeLaTransferenciaCentavos"));
  assert.match(cuerpo.slice(0, 400), /importeRecibidoDeDetalleCentavos\(/);
  assert.doesNotMatch(src, /importeEnviadoDeLinea|importeDeDetalleCentavos/, "la cuenta usa el importe ENVIADO");
});

test("P8 · una diferencia de recepción cambia el importe: se paga lo recibido", () => {
  const completa = fila({ id: 60, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z", recibido: 4 });
  const conFaltante = fila({ id: 61, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z", recibido: 3 });
  const nada = fila({ id: 62, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z", recibido: 0 });
  const c = cuentaDelPeriodo({ transferencias: [completa, conFaltante, nada], rango: SEMANA_A, criterio: RECEPCION });
  assert.equal(c.cantidad, 3);
  // 93.333,32 + 69.999,99 + 0 — el cero contado vale cero, no lo enviado.
  assert.equal(c.aPagar, 163333.31);
});

// ── 3 · DE QUIÉN ────────────────────────────────────────────────────────────

test("P14 · el local A no recibe transferencias del local B", () => {
  const deA = fila({ id: 70, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z", destinoId: 4 });
  const deB = fila({ id: 71, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z", destinoId: 5 });
  const pendienteDeB = fila({ id: 72, estado: "Enviada", envio: "2026-09-14T12:00:00.000Z", destinoId: 5, recibido: null });
  const c = cuentaDelPeriodo({ transferencias: [deA, deB, pendienteDeB], rango: SEMANA_A, criterio: RECEPCION, destinoId: 4 });
  assert.deepEqual(c.transferencias.map((t) => t.id), [70]);
  assert.equal(c.pendientes.cantidad, 0);

  // Y la consulta pide el destino: la base ya no trae las de otro local.
  const w = whereDeRecepcion({ destinoId: 4, rango: SEMANA_A });
  assert.equal(w.destinoId, 4);
});

test("P14b · solo lo que salió de un depósito: el depósito no se paga a sí mismo", () => {
  const deOtroLocal = fila({
    id: 80,
    estado: "Recibida",
    envio: "2026-09-14T12:00:00.000Z",
    recepcion: "2026-09-15T12:00:00.000Z",
    origen: { id: 9, nombre: "Otro local", es_deposito: false },
  });
  const c = cuentaDelPeriodo({ transferencias: [deOtroLocal], rango: SEMANA_A, criterio: RECEPCION });
  assert.equal(c.cantidad, 0);
  assert.deepEqual(whereDeRecepcion({ destinoId: 4, rango: SEMANA_A }).origen, { es_deposito: true });
});

// ── 4 · LAS PENDIENTES SE INFORMAN Y NO SUMAN ───────────────────────────────

test("P18 · las pendientes se informan aparte y NO están en el total", () => {
  const ts = [
    fila({ id: 90, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z" }),
    fila({ id: 91, estado: "Enviada", envio: "2026-09-16T12:00:00.000Z", recibido: null }),
    // Pendiente vieja, de antes del período: sigue sin confirmar y se muestra.
    fila({ id: 92, estado: "Enviada", envio: "2026-08-30T12:00:00.000Z", recibido: null }),
    // Enviada DESPUÉS del período: no había salido todavía, no es de este período.
    fila({ id: 93, estado: "Enviada", envio: "2026-09-22T12:00:00.000Z", recibido: null }),
  ];
  const c = cuentaDelPeriodo({ transferencias: ts, rango: SEMANA_A, criterio: RECEPCION });
  assert.equal(c.aPagar, COMPLETA, "una pendiente se sumó al total");
  assert.deepEqual(c.pendientes.transferencias.map((t) => t.id).sort(), [91, 92]);
  assert.equal(c.pendientes.importe, 2 * COMPLETA);
  assert.equal(c.sinRecibir, 0, "el total de este criterio está cerrado por definición");
});

// ── 5 · EL CRITERIO DE ENVÍO SIGUE COMO ESTABA ──────────────────────────────

test("P20 · ENVÍO: todo lo no cancelado del período por fecha de envío, y TODO suma", () => {
  const ts = [
    fila({ id: 100, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-22T12:00:00.000Z" }),
    fila({ id: 101, estado: "Enviada", envio: "2026-09-15T12:00:00.000Z", recibido: null }),
    fila({ id: 102, estado: "Cancelada", envio: "2026-09-15T12:00:00.000Z", recibido: null }),
  ];
  const c = cuentaDelPeriodo({ transferencias: ts, rango: SEMANA_A, criterio: ENVIO });
  assert.deepEqual(c.transferencias.map((t) => t.id).sort(), [100, 101]);
  assert.equal(c.aPagar, 2 * COMPLETA, "la cuenta de envío suma también lo que falta recibir");
  assert.equal(c.sinRecibir, 1);
  assert.equal(c.pendientes, null);
  // Un criterio desconocido es el de siempre.
  assert.deepEqual(cuentaDelPeriodo({ transferencias: ts, rango: SEMANA_A, criterio: "OTRO" }).aPagar, c.aPagar);
});

test("P21 · `cuentaDelLocal` ya no tiene cuenta propia: da lo mismo que la canónica", () => {
  const ts = [
    fila({ id: 110, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z", recibido: 3 }),
    fila({ id: 111, estado: "Recibiendo", envio: "2026-09-15T12:00:00.000Z", recibido: 2 }),
  ];
  const semanas = new Map([[4, [{ id: 1, localId: 4, diaDeCorte: 0, vigenteDesde: null }]]]);
  const vieja = cuentaDelLocal({ transferencias: ts, semanas, localId: 4, hoy: "2026-09-16" });
  const canonica = cuentaDelPeriodo({ transferencias: ts, rango: vieja.rango, criterio: ENVIO });
  assert.equal(vieja.aPagar, canonica.aPagar);
  assert.equal(vieja.sinRecibir, canonica.sinRecibir);
});

// ── 6 · LA CONSULTA ─────────────────────────────────────────────────────────

test("P30 · el `where` de recepción: Recibida por fechaRecepcion, pendientes sin piso", () => {
  const w = whereDeRecepcion({ destinoId: "4", rango: SEMANA_A });
  assert.equal(w.destinoId, 4);
  const [recibidas, pendientes] = w.OR;
  assert.equal(recibidas.estado, "Recibida");
  assert.ok(recibidas.fechaRecepcion.gte instanceof Date && recibidas.fechaRecepcion.lte instanceof Date);
  // Las puntas son las del día argentino: 00:00 del 13 y 23:59:59.999 del 19.
  assert.equal(recibidas.fechaRecepcion.gte.toISOString(), "2026-09-13T03:00:00.000Z");
  assert.equal(recibidas.fechaRecepcion.lte.toISOString(), "2026-09-20T02:59:59.999Z");
  assert.ok(!("fechaEnvio" in recibidas), "las recibidas no se filtran por envío");
  assert.deepEqual(pendientes.estado, { in: ["Enviada", "Recibiendo"] });
  assert.ok(!JSON.stringify(pendientes).includes("gte"), "las pendientes no tienen piso");
});

/** Un cliente falso que devuelve las filas tal cual y anota lo que le pidieron. */
function baseFalsa(filas) {
  const pedidos = [];
  return {
    pedidos,
    transferencia: {
      findMany: async (args) => {
        pedidos.push(args);
        return filas;
      },
      findFirst: async (args) => {
        pedidos.push(args);
        return filas.find((f) => f.fechaRecepcion) || null;
      },
    },
  };
}

test("P17 · Finanzas y Transferencias reciben el MISMO total: es la misma lectura", async () => {
  const filas = [
    fila({ id: 120, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-15T12:00:00.000Z" }),
    fila({ id: 121, estado: "Recibida", envio: "2026-09-14T12:00:00.000Z", recepcion: "2026-09-16T12:00:00.000Z", recibido: 3 }),
    fila({ id: 122, estado: "Recibiendo", envio: "2026-09-16T12:00:00.000Z", recibido: 1 }),
  ];
  const paraTransferencias = await leerCuentaPorRecepcion(baseFalsa(filas), { destinoId: 4, rango: SEMANA_A });
  const db = baseFalsa(filas);
  const paraFinanzas = await resumenDePagoADeposito(db, { destinoId: 4, rango: SEMANA_A });

  assert.equal(paraFinanzas.total, paraTransferencias.aPagar);
  assert.equal(paraFinanzas.cantidadTransferencias, paraTransferencias.cantidad);
  assert.equal(paraFinanzas.pendientes.total, paraTransferencias.pendientes.importe);
  assert.equal(paraFinanzas.pendientes.cantidadTransferencias, paraTransferencias.pendientes.cantidad);
  assert.equal(paraFinanzas.total, 163333.31);
  // Y la consulta usa el `select` compartido, sin recortes.
  assert.equal(db.pedidos[0].select, SELECT_TRANSFERENCIA_DE_LA_CUENTA);
  // Finanzas recibe números, no filas.
  assert.ok(!("transferencias" in paraFinanzas));
});

test("P31 · la primera recepción es el tope hacia atrás, en día argentino", async () => {
  const db = baseFalsa([fila({ id: 130, estado: "Recibida", envio: "2026-09-19T12:00:00.000Z", recepcion: "2026-09-20T01:00:00.000Z" })]);
  assert.equal(await primeraRecepcion(db, { destinoId: 4 }), "2026-09-19");
  assert.equal(db.pedidos[0].where.estado, "Recibida");
  assert.equal(await primeraRecepcion(baseFalsa([]), { destinoId: 4 }), null);
});

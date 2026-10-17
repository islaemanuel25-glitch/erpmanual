// CANDADOS DE "PAGAR" DESDE EL POS, DE LOS PAGOS CLASIFICADOS Y DEL SIGNO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/pagarDesdeElPos.test.mjs
//
// El comportamiento contra la base —cada tipo en su módulo, un solo retiro,
// cargar la compra sin volver a descontar— lo ejerce
// scripts/pruebas-db/pagarDesdeElPos.mjs con los handlers reales. Acá van las
// reglas puras y la FORMA de lo que no se puede ejercer sin la base.
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// Las cajas, ventas y movimientos son los de `filasReales.fixture.json`, la
// salida del lector real. Esas filas son anteriores a la columna `tipoEgreso`:
// la traen ausente, que el lector de hoy devuelve como `null`. Los casos con
// tipo copian una fila REAL y le ponen la columna, que es exactamente la forma
// que trae un movimiento escrito por "Pagar".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MARCA_EGRESO,
  TIPO_EGRESO,
  TIPOS_EGRESO,
  marcaDeTipo,
  restaEnLaGanancia,
  sePuedeClasificar,
  tipoDeEgreso,
} from "@/lib/caja/tipoEgreso.js";
import { CLASE_MOVIMIENTO } from "@/lib/finanzas/movimientosDeCaja.js";
import { resultadoDelTurno, resumenDeCaja, sueldosYGastos } from "@/lib/turnosYCierres/lecturaTurnosYCierres.js";
import { pagoDelCierreEnPantalla, planDelPagoInicial } from "@/lib/compras-proveedor/pagoDelCierre.js";
import { loYaPagadoAlRecibir, whereComprasPorCargar } from "@/lib/compras-proveedor/compraPorCargar.js";
import { ComprobanteZ } from "@/components/turnos-y-cierres/DetalleDeCaja.jsx";

const F = JSON.parse(readFileSync("lib/turnosYCierres/filasReales.fixture.json", "utf8"));
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const fuente = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const caja2 = F.cajas.find((c) => c.id === 2);
const ventas2 = F.ventas.filter((v) => v.turnoId === 2);
const movs2 = F.movimientos.filter((m) => m.turnoId === 2);
// Una fila REAL de pago desde la caja, como molde de los movimientos de "Pagar".
const molde = movs2.find((m) => m.clase === CLASE_MOVIMIENTO.PAGO_GASTO);
const delPos = (id, tipoEgreso, monto) => ({
  ...molde,
  id,
  clase: CLASE_MOVIMIENTO.MANUAL,
  gastoConcepto: null,
  gastoCategoria: null,
  motivo: "Pago desde el POS",
  monto: String(monto),
  tipoEgreso,
});

// ── LAS MARCAS ───────────────────────────────────────────────────────────

test("T1 · sueldo y gasto restan; proveedor y depósito son mercadería; el dueño no es gasto; sin tipo no resta", () => {
  assert.deepEqual(TIPOS_EGRESO.map((t) => [t, marcaDeTipo(t), restaEnLaGanancia(t)]), [
    ["PROVEEDOR", MARCA_EGRESO.MERCADERIA, false],
    ["SUELDO", MARCA_EGRESO.RESTA, true],
    ["GASTO", MARCA_EGRESO.RESTA, true],
    ["AL_DEPOSITO", MARCA_EGRESO.MERCADERIA, false],
    ["RETIRO_DUENO", MARCA_EGRESO.DEL_DUENO, false],
  ]);
  assert.equal(marcaDeTipo(null), MARCA_EGRESO.SIN_CLASIFICAR);
  assert.equal(restaEnLaGanancia(null), false, "un egreso sin clasificar se trató como gasto");
});

test("T2 · el tipo: la columna manda; sin ella, el pago lo dice por su vínculo; un manual sin tipo no se adivina", () => {
  assert.equal(tipoDeEgreso(molde), TIPO_EGRESO.GASTO, "un PagoGasto de Insumos es Gasto");
  assert.equal(tipoDeEgreso({ ...molde, gastoCategoria: "Sueldos" }), TIPO_EGRESO.SUELDO);
  assert.equal(tipoDeEgreso({ ...molde, clase: CLASE_MOVIMIENTO.PAGO_PROVEEDOR }), TIPO_EGRESO.PROVEEDOR);
  assert.equal(tipoDeEgreso(delPos(1, null, 10)), null, "un retiro manual sin tipo se clasificó solo");
  assert.equal(tipoDeEgreso(delPos(1, "RETIRO_DUENO", 10)), TIPO_EGRESO.RETIRO_DUENO);
  // Arqueo y cierre no son pagos: no tienen tipo aunque alguien se lo ponga.
  const arqueo = movs2.find((m) => m.clase === CLASE_MOVIMIENTO.RECAUDACION);
  assert.equal(tipoDeEgreso({ ...arqueo, tipoEgreso: "GASTO" }), null);
  // Solo un manual se clasifica a mano.
  assert.equal(sePuedeClasificar(delPos(1, null, 10)), true);
  assert.equal(sePuedeClasificar(molde), false, "se ofreció reclasificar un pago de Finanzas");
  assert.equal(sePuedeClasificar(arqueo), false);
});

// ── EL RESULTADO DEL TURNO ───────────────────────────────────────────────

test("T3 · resultado = neto − costo − (sueldos + gastos): proveedor, depósito, dueño y sin clasificar NO restan", () => {
  const extras = [
    delPos(9001, "PROVEEDOR", 38800),
    delPos(9002, "AL_DEPOSITO", 20000),
    delPos(9003, "RETIRO_DUENO", 5000),
    delPos(9004, null, 700),
    delPos(9005, "SUELDO", 35000),
  ];
  assert.equal(sueldosYGastos([...movs2, ...extras]), 3000 + 35000, "contó algo que no es sueldo ni gasto");
  const r = resumenDeCaja({ caja: caja2, ventas: ventas2, movimientos: [...movs2, ...extras] });
  const neto = ventas2.reduce((s, v) => s + Number(v.netoRecibido), 0);
  const costo = ventas2.reduce((s, v) => s + Number(v.costoTotal), 0);
  assert.equal(r.metricas.sueldosYGastos, 38000);
  // Desde el 2026-10-17 el resultado también resta el faltante de la caja: los
  // pagos de arriba salieron del cajón y bajaron el esperado de la caja 2.
  assert.equal(
    r.metricas.resultado,
    Math.round((neto - costo - 38000 - r.metricas.faltantes + r.metricas.sobrantes) * 100) / 100
  );
  assert.equal(resultadoDelTurno({ neto: 100, costo: 30.5, sueldosYGastos: 20.25 }), 49.25);
  // La plata, en cambio, resta todo.
  assert.equal(r.efectivo.pagosDesdeCaja, 3000 + 38800 + 20000 + 5000 + 700 + 35000);
});

test("T4 · el esperado de la caja es IDÉNTICO con tipo y sin tipo, para cada tipo", () => {
  const extras = [delPos(9001, null, 38800), delPos(9002, null, 1500)];
  const sinTipo = resumenDeCaja({ caja: caja2, ventas: ventas2, movimientos: [...movs2, ...extras] });
  for (const t of [...TIPOS_EGRESO, null]) {
    const conTipo = resumenDeCaja({
      caja: caja2,
      ventas: ventas2,
      movimientos: [...movs2.map((m) => ({ ...m, tipoEgreso: t })), ...extras.map((m) => ({ ...m, tipoEgreso: t }))],
    });
    assert.deepEqual(conTipo.efectivo, sinTipo.efectivo, `el tipo ${t} movió la cuenta del efectivo`);
    assert.equal(conTipo.diferencia, sinTipo.diferencia, `el tipo ${t} movió la diferencia`);
  }
  // Y el de la fila real, sin la columna, es el que ya guardó el cierre.
  const real = resumenDeCaja({ caja: caja2, ventas: ventas2, movimientos: movs2 });
  assert.equal(real.efectivo.teniaQueHaber, Number(caja2.montoEsperadoEfectivo));
});

// ── CARGAR LA COMPRA POR CARGAR ──────────────────────────────────────────

test("T6 · lo pagado desde la caja cuenta: 'Pagada' ya cubierta no saca plata otra vez", () => {
  const total = 3880000;
  assert.deepEqual(
    planDelPagoInicial({ estado: "PAGADA", totalCentavos: total, yaPagadoCentavos: total, pago: { medio: "EFECTIVO", turnoId: 7 } }),
    { pagoInicial: null },
    "volvió a pagar lo que ya salió de la caja"
  );
  // Con saldo, "Pagada" paga lo que FALTA, no el total.
  assert.deepEqual(
    planDelPagoInicial({ estado: "PAGADA", totalCentavos: 500000, yaPagadoCentavos: 100000, pago: { medio: "EFECTIVO", turnoId: 7 } }),
    { pagoInicial: { monto: 4000, medio: "EFECTIVO", turnoId: 7 } }
  );
  assert.ok(planDelPagoInicial({ estado: "PARCIAL", totalCentavos: 500000, yaPagadoCentavos: 100000, pago: { monto: "4000", medio: "OTRO" } }).error);
  // Pagado de más no se cierra.
  const deMas = pagoDelCierreEnPantalla({ totales: [], totalEscrito: "300", totalConfirmado: true, estado: "PAGADA", yaPagadoCentavos: 38800 * 100 });
  assert.equal(deMas.listo, false);
  assert.match(deMas.error, /ya se pagaron \$38\.800,00/);
  // Sin compra por cargar, todo igual que siempre.
  assert.deepEqual(
    planDelPagoInicial({ estado: "PAGADA", totalCentavos: 1000, pago: { medio: "EFECTIVO", turnoId: 7 } }),
    { pagoInicial: { monto: 10, medio: "EFECTIVO", turnoId: 7 } }
  );
  assert.deepEqual(loYaPagadoAlRecibir({ totalCentavos: 1000, pagos: [{ monto: "4" }, { monto: 6 }] }), { yaPagadoCentavos: 1000, saldoCentavos: 0, excede: false });
});

test("T7 · la ruta de recibir pasa lo ya pagado al plan y completa la cuenta en vez de crear otra", () => {
  const src = fuente("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.match(src, /planDelPagoInicial\(\{[^}]*yaPagadoCentavos,/s, "el plan no sabe lo pagado desde la caja");
  assert.match(src, /completarCuentaPrevia: Boolean\(cuentaPrevia\)/);
  const finanzas = fuente("lib/finanzas/pagosProveedoresServer.js");
  assert.match(finanzas, /if \(existente && !args\.completarCuentaPrevia\) throw new ErrorPagoProveedor\(ERROR_CUENTA_YA_EXISTE, 409\);/);
  // Lo por cargar es lo que tiene un pago de tipo Proveedor y no se recibió.
  const w = whereComprasPorCargar({ grupoId: 1, localId: 2 });
  assert.equal(w.estado, "ENVIADO");
  assert.equal(w.creadoEnLocalId, 2);
  assert.deepEqual(w.cuentaPorPagar, { pagos: { some: { cajaMovimiento: { tipoEgreso: "PROVEEDOR" } } } });
});

// ── UN SOLO CAMINO DE EGRESO ─────────────────────────────────────────────

test("T8 · 'Pagar' no escribe un egreso propio: cada tipo entra por la puerta que ya existe", () => {
  const src = fuente("lib/caja/pagarDesdeElPosServer.js");
  assert.doesNotMatch(src, /cajaMovimiento\.create/, "Pagar escribe su propio retiro al lado de resolverSalidaDelPago");
  assert.match(src, /crearCuentaPorPagarDesdeCompra\(tx,/);
  assert.match(src, /crearGasto\(tx,/);
  assert.match(src, /resolverSalidaDelPago\(tx,/);
  // Y el único lugar que crea el retiro de un pago le pone el tipo.
  const salida = fuente("lib/finanzas/salidaDelPago.js");
  assert.equal((salida.match(/tx\.cajaMovimiento\.create\(/g) || []).length, 1);
  assert.match(salida, /tipoEgreso: esTipoEgreso\(args\.tipoEgreso\) \? args\.tipoEgreso : null/);
  // La ruta valida el turno con el lock tomado, como Caja +/−.
  const ruta = fuente("app/api/pos-ventas/pagar/route.js");
  const tx = ruta.slice(ruta.indexOf("await prisma.$transaction("));
  const pos = (s) => tx.indexOf(s);
  const orden = [pos("await bloquearTurno(tx, turnoId);"), pos("rechazoDelTurno(vigente,"), pos("pagarDesdeElPos(tx,")];
  assert.ok(orden.every((p) => p > 0) && orden[0] < orden[1] && orden[1] < orden[2], JSON.stringify(orden));
  assert.match(ruta, /requirePerm\(req, PERMISO\)/);
  assert.match(ruta, /const PERMISO = "pos\.usar";/);
});

// ── EL Z ─────────────────────────────────────────────────────────────────

test("T9 · el Z en pantalla muestra 'Ventas en efectivo' entre el cambio inicial y los pagos", () => {
  const c = { ...resumenDeCaja({ caja: caja2, ventas: ventas2, movimientos: movs2 }), fechaOperativa: caja2.fechaOperativa };
  const t = texto(renderToStaticMarkup(React.createElement(ComprobanteZ, { datos: { local: { nombre: "Local 1" }, caja: c }, onReimprimir: () => {} })));
  assert.match(t, /Cambio inicial \$20\.000,00 Ventas en efectivo \+\$180\.500,00 Pagos desde la caja −\$3\.000,00 Arqueos \(2\) −\$115\.000,00 Tenía que haber \$82\.500,00/);
  // El papel: lib/monedaSigno.test.mjs.
});

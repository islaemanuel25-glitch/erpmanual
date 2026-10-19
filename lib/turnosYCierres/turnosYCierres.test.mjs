// CANDADOS DE "TURNOS Y CIERRES".
//
//   node --import ./scripts/alias-loader.mjs --test lib/turnosYCierres/turnosYCierres.test.mjs
//
// ── DE DÓNDE SALE EL FIXTURE ───────────────────────────────────────────────
//
// `filasReales.fixture.json` NO se escribió a mano: es la salida de
// `filasDeTurnosYCierres` —el mismo lector que usa la ruta— contra la base de
// la sesión de desarrollo, con los datos de `erpazul-fixtures-dev`. Por eso
// los montos vienen como texto (Decimal serializado) y las fechas como ISO, que
// es lo que llega de verdad. Tiene: una caja con sobra de $0,01 y un pago
// mixto, una con falta de $1.500 y un gasto pagado desde la caja, una cerrada
// sin diferencia, una ABIERTA, una caja vieja sin turno asignado, una venta
// fiada por caja, y dos ventas sin caja (la anulada sin caja ya no está: la
// dejó afuera la consulta).
//
// Lo que se ejerce es la función; lo que se lee del fuente, sin comentarios, es
// solo lo que no se puede ejercer sin React montado o sin la base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { calcularDiferencia, calcularEfectivoEsperado } from "@/lib/caja/efectivoEsperado.js";
import { paraElEsperado, CLASE_MOVIMIENTO } from "@/lib/finanzas/movimientosDeCaja.js";
import { ALCANCE, alcanceDeCajas, puedeVerCajaDelModulo, whereCajasDelAlcance } from "@/lib/turnosYCierres/alcance.js";
import {
  RESULTADO_CAJA,
  armarMisCajas,
  armarTurnosYCierres,
  arqueosDeCaja,
  efectivoDelCajon,
  grupoEnPestana,
  horarioDeVentas,
  listaDeVentasDeLaCaja,
  pieDeVentasDeLaCaja,
  pagosDesdeCaja,
  resultadoDelTurno,
  resumenDeCaja,
  resumenDeGrupo,
  resumenVentasSinCaja,
} from "@/lib/turnosYCierres/lecturaTurnosYCierres.js";
import {
  filasDeTurnosYCierres,
  historialDelMes,
  leerMisCajas,
  personaDeCaja,
  whereVentasSinCaja,
} from "@/lib/turnosYCierres/lecturaTurnosYCierresServer.js";
import { cajasSuperpuestas, diferenciasDelGrupo } from "@/lib/turnosYCierres/pantallaTurnosYCierres.js";
import PantallaTurnosYCierres, { PersonaDelTurno } from "@/components/turnos-y-cierres/PantallaTurnosYCierres.jsx";
import DetalleDeCaja, { EfectivoDeLaCaja, MovimientosDeCaja, VentasDeCaja } from "@/components/turnos-y-cierres/DetalleDeCaja.jsx";
import { HorarioDeVentasDeLaCaja } from "@/components/turnos-y-cierres/PantallaTurnosYCierres.jsx";
import { urlDeLaVenta, urlDeVentas } from "@/lib/turnosYCierres/pantallaTurnosYCierres.js";
import { ESTADO_TURNO } from "@/lib/caja/cierreRelevo.js";
import { parseContextoTesoreria } from "@/lib/tesoreria/contextoTesoreria";

const F = JSON.parse(readFileSync("lib/turnosYCierres/filasReales.fixture.json", "utf8"));
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const fuente = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const nada = () => {};

const cajaDe = (id) => F.cajas.find((c) => c.id === id);
const ventasDe = (id) => F.ventas.filter((v) => v.turnoId === id);
const movsDe = (id) => F.movimientos.filter((m) => m.turnoId === id);
const resumenDe = (id, { ventas = ventasDe(id), movimientos = movsDe(id) } = {}) =>
  resumenDeCaja({ caja: cajaDe(id), ventas, movimientos });
const lectura = () => ({
  ...armarTurnosYCierres({ localId: F.localId, cajas: F.cajas, ventas: F.ventas, movimientos: F.movimientos, turnosDelLocal: F.turnosDelLocal }),
  ventasSinCaja: resumenVentasSinCaja(F.ventasSinCaja),
});

/** Una base de mentira que anota qué se le pidió y contesta con el fixture. */
function baseQueAnota({ cajas = F.cajas } = {}) {
  const pedidos = {};
  const anotar = (modelo, filas) => ({
    findMany: async (args) => {
      (pedidos[modelo] ||= []).push(args);
      return typeof filas === "function" ? filas(args) : filas;
    },
  });
  return {
    pedidos,
    db: {
      turno: anotar("turno", cajas),
      turnoOperativo: anotar("turnoOperativo", F.turnosDelLocal),
      venta: anotar("venta", (args) => (args.where?.turnoId === null ? F.ventasSinCaja : F.ventas)),
      cajaMovimiento: anotar("cajaMovimiento", F.movimientos.map(({ clase, proveedorNombre, gastoConcepto, gastoCategoria, ...m }) => m)),
      arqueoCaja: anotar("arqueoCaja", []),
      pagoProveedor: anotar("pagoProveedor", []),
      pagoGasto: anotar("pagoGasto", []),
      // El fixture es de antes del consumo del personal: no tiene consumos.
      consumoPersonal: anotar("consumoPersonal", []),
    },
  };
}

// ── F0 · EL FIXTURE TIENE LO QUE LOS CANDADOS NECESITAN ─────────────────

test("F0 · el fixture tiene los casos: falta, sobra, abierta, sin turno, fiado, pago mixto y ventas sin caja", () => {
  const r = lectura();
  const cajas = r.grupos.flatMap((g) => g.cajas);
  for (const res of [RESULTADO_CAJA.FALTA, RESULTADO_CAJA.SOBRA, RESULTADO_CAJA.ABIERTA, RESULTADO_CAJA.SIN_DIFERENCIA]) {
    assert.ok(cajas.some((c) => c.resultado === res), `falta una caja ${res}`);
  }
  assert.ok(r.grupos.some((g) => g.sinTurno), "falta la caja sin turno asignado");
  assert.ok(F.ventas.some((v) => v.esFiado), "falta una venta fiada");
  assert.ok(F.ventas.some((v) => v.pagos.length > 1), "falta un pago mixto");
  assert.ok(F.ventasSinCaja.length >= 1, "faltan ventas sin caja");
  assert.ok(F.movimientos.some((m) => m.clase === CLASE_MOVIMIENTO.PAGO_GASTO), "falta un pago desde la caja");
});

// ── A · EL CAJERO NO VE CAJAS AJENAS ─────────────────────────────────────

test("A1 · quién ve qué: pos.usar solo lo suyo; reportes.ver, tesoreria.ver, Admin y dueño el local", () => {
  assert.equal(alcanceDeCajas({ permisos: ["pos.usar", "clientes.crear"] }), ALCANCE.PROPIAS);
  assert.equal(alcanceDeCajas({ permisos: ["pos.usar", "reportes.ver"] }), ALCANCE.LOCAL);
  assert.equal(alcanceDeCajas({ permisos: ["tesoreria.ver"] }), ALCANCE.LOCAL);
  assert.equal(alcanceDeCajas({ esAdmin: true, permisos: ["*"] }), ALCANCE.LOCAL);
  assert.equal(alcanceDeCajas({ permisos: ["pos.usar"] }, { esDueno: true }), ALCANCE.LOCAL);
  assert.equal(alcanceDeCajas({ permisos: ["clientes.ver"] }), null);
  // turnos.ver_todos abre el local, igual que en el módulo viejo (2026-10-13).
  assert.equal(alcanceDeCajas({ permisos: ["pos.usar", "turnos.ver_todos"] }), ALCANCE.LOCAL);
  assert.equal(alcanceDeCajas({ permisos: ["turnos.ver_todos"] }), ALCANCE.LOCAL);
});

test("A2 · la condición del cajero es la de caja propia: su cuenta sin operador, o su operador", () => {
  assert.deepEqual(whereCajasDelAlcance({ localId: 2, alcance: ALCANCE.PROPIAS, identidad: { usuarioId: 2, operadorId: null } }), {
    localId: 2,
    vendedorId: 2,
    operadorId: null,
  });
  assert.deepEqual(whereCajasDelAlcance({ localId: 2, alcance: ALCANCE.PROPIAS, identidad: { usuarioId: 2, operadorId: 9 } }), {
    localId: 2,
    operadorId: 9,
  });
  assert.deepEqual(whereCajasDelAlcance({ localId: 2, alcance: ALCANCE.LOCAL, identidad: null }), { localId: 2 });
});

test("A3 · sobre las cajas reales: la cajera ve las suyas y ninguna de otra persona", () => {
  const damaris = cajaDe(2).vendedorId;
  const identidad = { usuarioId: damaris, operadorId: null };
  const visibles = F.cajas.filter((c) => puedeVerCajaDelModulo(c, { localId: F.localId, alcance: ALCANCE.PROPIAS, identidad }));
  assert.ok(visibles.length >= 2, "la cajera tendría que ver al menos dos cajas suyas");
  assert.ok(visibles.every((c) => c.vendedorId === damaris), "la cajera ve una caja ajena");
  assert.ok(F.cajas.some((c) => c.vendedorId !== damaris), "el fixture no tiene cajas ajenas: el candado no prueba nada");
  // Con PIN de un operador, la caja de la CUENTA sin operador ya no es suya.
  assert.equal(puedeVerCajaDelModulo(cajaDe(2), { localId: F.localId, alcance: ALCANCE.PROPIAS, identidad: { usuarioId: damaris, operadorId: 9 } }), false);
  // Otro local, nunca.
  assert.equal(puedeVerCajaDelModulo(cajaDe(2), { localId: 99, alcance: ALCANCE.LOCAL, identidad }), false);
});

test("A4 · los lectores PIDEN a la base solo las cajas del cajero (ejercido, no leído)", async () => {
  const identidad = { usuarioId: cajaDe(2).vendedorId, operadorId: null };
  const a = baseQueAnota();
  await filasDeTurnosYCierres(a.db, { localId: 2, fechaInicio: new Date("2026-10-12T03:00:00Z"), fechaFin: new Date("2026-10-13T02:59:59Z"), alcance: ALCANCE.PROPIAS, identidad });
  assert.equal(a.pedidos.turno[0].where.vendedorId, identidad.usuarioId);
  assert.equal(a.pedidos.turno[0].where.operadorId, null);
  assert.equal(a.pedidos.turno[0].where.localId, 2);

  const b = baseQueAnota({ cajas: [] });
  await leerMisCajas(b.db, { localId: 2, alcance: ALCANCE.PROPIAS, identidad });
  assert.equal(b.pedidos.turno[0].where.vendedorId, identidad.usuarioId);
  assert.equal(b.pedidos.turno[0].where.operadorId, null);
});

// A5 CAMBIÓ DE LUGAR EL 2026-10-19: el control vivía en la ruta del detalle y
// se mudó a `cajaDelModulo`, que comparten el detalle y la ruta de las ventas
// de la caja. Se afirma en los dos lados: que la función compruebe local y
// operador ANTES de devolver la caja, y que cada ruta no conteste nada antes.
test("A5 · el detalle y las ventas de una caja comprueban el alcance antes de contestar", () => {
  const acceso = fuente("lib/turnosYCierres/cajaDelModuloServer.js");
  const ok = acceso.indexOf("return { ok: true, leida");
  assert.ok(ok > 0, "cajaDelModulo no devuelve la caja");
  const delLocal = acceso.indexOf("leida.caja.localId !== localId");
  assert.ok(delLocal > 0 && delLocal < ok, "no compara el local de la caja con el de la sesión antes de devolverla");
  assert.match(acceso.slice(delLocal, ok), /status: 404/, "una caja de otro local no da 404");
  const control = acceso.indexOf("puedeVerCajaDelModulo(");
  assert.ok(control > 0 && control < ok, "no comprueba de quién es la caja antes de devolverla");
  for (const r of ["app/api/turnos-y-cierres/cajas/[id]/route.js", "app/api/turnos-y-cierres/cajas/[id]/ventas/route.js"]) {
    const ruta = fuente(r);
    const pide = ruta.indexOf("cajaDelModulo(req, prisma");
    assert.ok(pide > 0, `${r} no pasa por cajaDelModulo`);
    assert.ok(pide < ruta.indexOf("if (!acceso.ok)") && ruta.indexOf("if (!acceso.ok)") < ruta.indexOf("ok: true"), `${r} contesta antes de comprobar`);
    assert.doesNotMatch(ruta, /prisma\.(venta|turno)\./, `${r} lee la base por fuera del alcance`);
  }
  // Las ventas se piden con el id de la caja YA resuelta, no con el del pedido.
  assert.match(fuente("app/api/turnos-y-cierres/cajas/[id]/ventas/route.js"), /leerVentasDeLaCaja\(prisma, leida\.caja\.id\)/);
  // Y la lista del cajero no lleva período ni otras cajas: su vista es MIS_CAJAS.
  assert.match(fuente("app/api/turnos-y-cierres/route.js"), /alcance === ALCANCE\.PROPIAS[\s\S]*leerMisCajas/);
});

// ── B · EL ESPERADO SALE DE calcularEfectivoEsperado ─────────────────────

test("B1 · lo que tenía que haber es calcularEfectivoEsperado sobre todo menos el retiro de cierre", () => {
  for (const caja of F.cajas) {
    const r = resumenDe(caja.id);
    const oficial = calcularEfectivoEsperado({ montoInicial: caja.montoInicial, ventas: ventasDe(caja.id), movimientos: paraElEsperado(movsDe(caja.id)) });
    assert.equal(r.efectivo.teniaQueHaber, oficial.efectivoEsperado, `caja #${caja.id}`);
    assert.equal(r.efectivo.ventasEfectivo, oficial.ventasEfectivo, `caja #${caja.id}`);
    // Una caja cerrada: coincide con el que guardó su cierre.
    if (caja.montoEsperadoEfectivo != null) assert.equal(r.efectivo.teniaQueHaber, Number(caja.montoEsperadoEfectivo), `caja #${caja.id}`);
  }
  // El retiro de cierre de la caja 1 (102.000,01) no se descuenta.
  assert.equal(resumenDe(1).efectivo.teniaQueHaber, 122000);
});

test("B2 · la diferencia es lo contado contra ese esperado, y nunca la guardada", () => {
  for (const caja of F.cajas.filter((c) => c.cierre)) {
    const r = resumenDe(caja.id);
    assert.equal(r.diferencia, calcularDiferencia(caja.montoRealEfectivo, r.efectivo.teniaQueHaber), `caja #${caja.id}`);
  }
  // Si la guardada mintiera, gana la calculada.
  const mentira = resumenDeCaja({ caja: { ...cajaDe(2), diferenciaEfectivo: "999" }, ventas: ventasDe(2), movimientos: movsDe(2) });
  assert.equal(mentira.diferencia, -1500);
  assert.equal(mentira.coincideConGuardada, false);
  assert.equal(resumenDe(2).resultado, RESULTADO_CAJA.FALTA);
  assert.equal(resumenDe(1).resultado, RESULTADO_CAJA.SOBRA);
});

test("B3 · el desglose del esperado cierra exacto: cambio + efectivo + ingresos − pagos − arqueos", () => {
  for (const caja of F.cajas) {
    const e = resumenDe(caja.id).efectivo;
    const c = (n) => Math.round(n * 100);
    assert.equal(c(e.cambioInicial) + c(e.ventasEfectivo) + c(e.ingresos) - c(e.pagosDesdeCaja) - c(e.retiradoArqueos), c(e.teniaQueHaber), `caja #${caja.id}`);
  }
  assert.equal(resumenDe(2).efectivo.pagosDesdeCaja, 3000, "el gasto pagado desde la caja");
  assert.equal(resumenDe(2).efectivo.retiradoArqueos, 115000);
});

// ── R · EL RESULTADO DEL TURNO Y LOS PAGOS DESDE LA CAJA ─────────────────

test("R1 · pagos desde la caja: todo egreso de efectivo menos los arqueos y el retiro de cierre", () => {
  const movs = movsDe(2);
  assert.ok(movs.some((m) => m.clase === CLASE_MOVIMIENTO.RECAUDACION) && movs.some((m) => m.clase === CLASE_MOVIMIENTO.CIERRE), "el fixture no tiene arqueo y cierre: el candado no prueba nada");
  assert.equal(pagosDesdeCaja(movs), 3000, "contó un arqueo o el cierre como pago");
  // Un Caja − manual (sueldo, insumos) SÍ es un pago desde la caja.
  const manual = { ...movs.find((m) => m.clase === CLASE_MOVIMIENTO.PAGO_GASTO), id: 9001, clase: CLASE_MOVIMIENTO.MANUAL, monto: "2500", motivo: "Sueldo" };
  assert.equal(pagosDesdeCaja([...movs, manual]), 5500);
  // Un INGRESO no resta.
  assert.equal(pagosDesdeCaja([...movs, { ...manual, id: 9002, tipo: "INGRESO" }]), 3000);
});

// R2 CAMBIÓ DE CONTRATO EL 2026-10-15, Y NO ES UN AFLOJE. Antes el resultado
// restaba TODOS los pagos desde la caja; la regla de Emanuel es que solo restan
// sueldos y gastos (proveedor y depósito son mercadería, el dueño no es gasto,
// sin clasificar no resta). En el fixture el único pago es un gasto de $3.000,
// así que el número no cambia: lo que cambia es de qué columna sale. Los casos
// que distinguen —un proveedor que no resta— están en
// lib/caja/pagarDesdeElPos.test.mjs, T3.
// R2 CAMBIÓ DE CONTRATO EL 2026-10-17 (regla de Emanuel): el resultado también
// resta los faltantes de caja y suma los sobrantes, cada uno por su caja.
test("R2 · resultado = neto − costo − sueldos y gastos − consumo − faltantes + sobrantes", () => {
  const c2 = resumenDe(2);
  const ventas = ventasDe(2);
  const neto = ventas.reduce((s, v) => s + Number(v.netoRecibido), 0);
  const costo = ventas.reduce((s, v) => s + Number(v.costoTotal), 0);
  const comisiones = ventas.reduce((s, v) => s + Number(v.comisionBancaria), 0);
  const ganancia = ventas.reduce((s, v) => s + Number(v.gananciaNeta), 0);
  assert.equal(c2.metricas.costo, costo);
  assert.equal(c2.metricas.comisiones, comisiones);
  assert.equal(c2.metricas.ganancia, ganancia);
  assert.equal(c2.metricas.sueldosYGastos, 3000, "el gasto Pan es un gasto: resta");
  // La caja 2 cerró con falta de $1.500: resta.
  assert.equal(c2.metricas.faltantes, 1500);
  assert.equal(c2.metricas.sobrantes, 0);
  assert.equal(c2.metricas.resultado, Math.round((neto - costo - 3000 - 1500) * 100) / 100);
  assert.equal(resultadoDelTurno({ neto: 100, costo: 30.5, sueldosYGastos: 20.25 }), 49.25);
  assert.equal(resultadoDelTurno({ neto: 100, costo: 30, faltantes: 10, sobrantes: 2.5 }), 62.5, "falta resta y sobra suma");
  // La caja 1 sobró $0,01: suma. La abierta (6) no aporta: no se contó.
  assert.equal(resumenDe(1).metricas.sobrantes, 0.01);
  assert.equal(resumenDe(6).metricas.faltantes + resumenDe(6).metricas.sobrantes, 0);
  // El turno suma sus cajas, y su resultado se arma con la MISMA fórmula.
  const r = lectura();
  for (const g of r.grupos) {
    const suma = (f) => Math.round(g.cajas.reduce((s, c) => s + f(c) * 100, 0)) / 100;
    assert.equal(
      g.resultado,
      resultadoDelTurno({
        neto: suma((c) => c.metricas.neto),
        costo: g.costo,
        sueldosYGastos: g.sueldosYGastos,
        consumoPersonal: g.consumoPersonal,
        faltantes: suma((c) => c.metricas.faltantes),
        sobrantes: suma((c) => c.metricas.sobrantes),
      }),
      g.titulo
    );
    assert.equal(g.sueldosYGastos, suma((c) => c.metricas.sueldosYGastos), g.titulo);
    assert.equal(g.pagosDesdeCaja, suma((c) => c.metricas.pagosDesdeCaja), g.titulo);
  }
  const manana = r.grupos.find((g) => g.titulo === "Turno Mañana");
  assert.equal(manana.resultado, c2.metricas.resultado);
});

test("R3 · una comisión que todavía no se conoce no se muestra como $0", () => {
  // La misma venta del fixture, con la comisión pendiente: es la forma que
  // trae la base para una venta cobrada con un medio sin configurar.
  const ventas = ventasDe(2).map((v) => (v.pagos.some((p) => p.medio === "CREDITO") ? { ...v, comisionPendiente: true } : v));
  const c = resumenDe(2, { ventas });
  const credito = c.cobrado.medios.find((m) => m.medio === "CREDITO");
  assert.equal(credito.comisionConocida, false, "una comisión pendiente se marcó como conocida");
  assert.equal(c.cobrado.medios.find((m) => m.medio === "MERCADOPAGO").comisionConocida, true, "marcó pendiente un medio que no lo está");
  assert.equal(c.cobrado.comisionesConocidas, false);
  const html = renderToStaticMarkup(React.createElement(DetalleDeCaja, { datos: { local: { nombre: "Local 1" }, caja: { ...c, fechaOperativa: cajaDe(2).fechaOperativa }, arqueos: [] }, onVerMovimientos: nada }));
  const medio = html.split("data-medio=").find((tramo) => tramo.startsWith('"CREDITO"')) ?? "";
  assert.ok(medio, "no se dibujó el crédito");
  assert.match(texto(medio), /Comisión sin calcular/);
  assert.doesNotMatch(texto(medio), /−\$0,00/, "la comisión desconocida salió como $0");
  // Con todo exacto, la comisión se muestra con su signo.
  const exacta = texto(renderToStaticMarkup(React.createElement(DetalleDeCaja, { datos: { local: { nombre: "Local 1" }, caja: { ...resumenDe(2), fechaOperativa: cajaDe(2).fechaOperativa }, arqueos: [] }, onVerMovimientos: nada })));
  assert.doesNotMatch(exacta, /Comisión sin calcular/);
});

test("B4 · la lectura no escribe una fórmula propia del esperado", () => {
  const src = fuente("lib/turnosYCierres/lecturaTurnosYCierres.js");
  assert.match(src, /calcularEfectivoEsperado\(\{ montoInicial: caja\.montoInicial, ventas, movimientos: delCajon \}\)/);
  assert.doesNotMatch(src, /montoInicial\)?\s*\+/, "suma el fondo a mano");
  for (const f of ["components/turnos-y-cierres/PantallaTurnosYCierres.jsx", "components/turnos-y-cierres/DetalleDeCaja.jsx"]) {
    assert.doesNotMatch(fuente(f), /fondoInicial\s*\+|teniaQueHaber\s*[-+]|ventasEfectivo\s*[-+]/, `${f} recalcula plata`);
  }
});

// ── C · EL FIADO NO SUMA ─────────────────────────────────────────────────

test("C1 · el fiado va aparte: no entra al cobrado, ni al digital, ni a lo que tenía que haber", () => {
  const con = resumenDe(1);
  const fiadas = ventasDe(1).filter((v) => v.esFiado);
  assert.ok(fiadas.length, "la caja 1 tiene que tener una venta fiada");
  const sin = resumenDe(1, { ventas: ventasDe(1).filter((v) => !v.esFiado) });
  assert.equal(con.cobrado.fiado, fiadas.reduce((s, v) => s + Number(v.total), 0));
  assert.equal(sin.cobrado.fiado, 0);
  for (const campo of ["efectivo", "digital", "total"]) assert.equal(con.cobrado[campo], sin.cobrado[campo], `el fiado sumó a ${campo}`);
  assert.equal(con.efectivo.teniaQueHaber, sin.efectivo.teniaQueHaber, "el fiado sumó al esperado");
  assert.ok(!con.cobrado.porMedio.some((m) => m.medio === "FIADO"), "el fiado apareció como medio cobrado");
  assert.equal(con.cobrado.total, con.cobrado.efectivo + con.cobrado.digital);
});

test("C2 · el pago mixto reparte: solo su porción en efectivo entra al cajón", () => {
  const mixta = ventasDe(1).find((v) => v.pagos.length > 1);
  const sinMixta = resumenDe(1, { ventas: ventasDe(1).filter((v) => v !== mixta) });
  const efectivoDeLaMixta = mixta.pagos.filter((p) => p.medio === "EFECTIVO").reduce((s, p) => s + Number(p.monto), 0);
  assert.equal(resumenDe(1).efectivo.ventasEfectivo - sinMixta.efectivo.ventasEfectivo, efectivoDeLaMixta);
});

// ── D · LAS VENTAS SIN CAJA EXCLUYEN ANULADAS E INTERNAS ─────────────────

test("D1 · el aviso de ventas sin caja pide solo ventas comerciales sin turno", () => {
  const w = whereVentasSinCaja({ localId: 2, fechaInicio: new Date(0), fechaFin: new Date(1) });
  assert.equal(w.turnoId, null);
  assert.equal(w.localId, 2);
  assert.deepEqual(w.anuladaEn, null, "deja entrar anuladas");
  assert.deepEqual(w.transferencia, { is: null }, "deja entrar internas");
});

test("D2 · y es ESA condición la que llega a la base (ejercido)", async () => {
  const a = baseQueAnota();
  await filasDeTurnosYCierres(a.db, { localId: 2, fechaInicio: new Date("2026-10-12T03:00:00Z"), fechaFin: new Date("2026-10-13T02:59:59Z"), alcance: ALCANCE.LOCAL });
  const pedido = a.pedidos.venta.find((p) => p.where?.turnoId === null);
  assert.ok(pedido, "no se pidieron las ventas sin caja");
  assert.equal(pedido.where.anuladaEn, null);
  assert.deepEqual(pedido.where.transferencia, { is: null });
  // Las de las cajas también son comerciales: el mismo criterio que el cierre.
  const deCajas = a.pedidos.venta.find((p) => p.where?.turnoId?.in);
  assert.equal(deCajas.where.anuladaEn, null);
  assert.deepEqual(deCajas.where.transferencia, { is: null });
});

test("D3 · cuántas y cuánto, sobre las filas reales", () => {
  const s = resumenVentasSinCaja(F.ventasSinCaja);
  assert.equal(s.cantidad, F.ventasSinCaja.length);
  assert.equal(s.total, 14300);
});

// ── E · LAS DIFERENCIAS NO SE SUMAN ──────────────────────────────────────

test("E1 · un turno cuenta cuántas faltan y cuántas sobran; no tiene un importe de diferencia", () => {
  const falta = resumenDe(2);
  const sobra = resumenDe(1);
  const g = resumenDeGrupo({ clave: "x", etiqueta: "Mezcla", dia: "2026-10-12", sinTurno: false, turnoOperativoId: 1 }, [falta, sobra]);
  assert.equal(g.diferencias.faltan, 1);
  assert.equal(g.diferencias.sobran, 1);
  assert.deepEqual(Object.keys(g).filter((k) => /diferencia/i.test(k)), ["diferencias"]);
  assert.equal(diferenciasDelGrupo(g).texto, "1 falta · 1 sobra");
});

// Los arqueos de la caja 2 del fixture, con la forma de `SELECT_ARQUEO`: los dos
// retiros son los dos RECAUDACION de sus movimientos (60.000 y 55.000, a la
// misma hora) y el FINAL contó los 81.000 de `montoRealEfectivo`.
const ARQUEOS_CAJA_2 = [
  { id: 1, turnoId: 2, tipo: "PARCIAL", fechaHora: "2026-10-12T16:00:00Z", efectivoContado: "100", efectivoRetirado: "60000", diferencia: "0" },
  { id: 2, turnoId: 2, tipo: "PARCIAL", fechaHora: "2026-10-12T18:00:00Z", efectivoContado: "100", efectivoRetirado: "55000", diferencia: "-1500" },
  { id: 3, turnoId: 2, tipo: "FINAL", fechaHora: "2026-10-12T19:00:00Z", efectivoContado: "81000", efectivoRetirado: null, diferencia: "-1500" },
];
const cajaConArqueos = (id, arqueos) => resumenDeCaja({ caja: cajaDe(id), ventas: ventasDe(id), movimientos: movsDe(id), arqueos });

// E2 SUMÓ EL TRAMO EL 2026-10-18: la acumulada se sigue guardando y leyendo
// tal cual; el tramo es la resta contra el arqueo anterior.
test("E2 · cada arqueo trae la acumulada tal cual se guardó y la diferencia de su tramo", () => {
  const arqueos = arqueosDeCaja(ARQUEOS_CAJA_2);
  assert.deepEqual(arqueos.map((a) => a.diferencia), [0, -1500, -1500]);
  assert.deepEqual(arqueos.map((a) => a.tramo), [0, -1500, 0]);
  assert.deepEqual(arqueos.map((a) => `${a.tipo} ${a.accion} ${a.monto}`), ["Arqueo Retiró 60000", "Arqueo Retiró 55000", "Cierre Contó 81000"]);
  // Sin acumulada guardada en un corte, ni ese tramo ni el siguiente se conocen.
  const conHueco = arqueosDeCaja([{ ...ARQUEOS_CAJA_2[0] }, { ...ARQUEOS_CAJA_2[1], diferencia: null }, { ...ARQUEOS_CAJA_2[2] }]);
  assert.deepEqual(conHueco.map((a) => a.tramo), [0, null, null]);
});

// ── V · LAS VENTAS DE CADA CAJA, A LA VISTA ──────────────────────────────
//
// La #951 (Belen, Mini unidas, dom 18/10) estuvo abierta de 00:06 a 16:05 y el
// primer retiro fue a las 10:14 con 34.500 de falta: para saber si se vendió de
// madrugada hacía falta ver sus ventas, y el reporte no dice qué caja vendió.

// Las ventas de la caja 2 del fixture con su `fecha`. El fixture de filas reales
// es ANTERIOR a que `SELECT_VENTA` pidiera la fecha, así que acá se le pone una
// a cada una, explícita y dentro del horario de la caja (08:02 a 16:00), y
// desordenadas a propósito.
const HORAS_CAJA_2 = ["2026-10-12T16:00:00Z", "2026-10-12T11:15:00Z", "2026-10-12T18:40:00Z", "2026-10-12T13:30:00Z"];
const VENTAS_CAJA_2_CON_HORA = ventasDe(2).map((v, i) => ({ ...v, fecha: HORAS_CAJA_2[i] }));

test("V1 · cuándo vendió: primera y última venta y cuántos tickets; sin ventas lo dice y no ofrece el enlace", () => {
  assert.equal(VENTAS_CAJA_2_CON_HORA.length, 4, "el caso no tiene las cuatro ventas de la caja 2");
  const h = horarioDeVentas(VENTAS_CAJA_2_CON_HORA);
  assert.deepEqual(h, { cantidad: 4, primera: "2026-10-12T11:15:00.000Z", ultima: "2026-10-12T18:40:00.000Z" });
  // La cantidad es la de la tarjeta: las mismas ventas comerciales.
  assert.equal(h.cantidad, resumenDe(2).metricas.tickets);
  const conVentas = renderToStaticMarkup(React.createElement(HorarioDeVentasDeLaCaja, { c: { id: 2, horarioDeVentas: h }, onVerVentas: nada }));
  assert.equal(texto(conVentas), "Primera venta 08:15 · Última venta 15:40 4 tickets · Ver ventas de esta caja ›");
  assert.match(conVentas, /data-horario-de-ventas[^>]* class="[^"]*sunmi-btn-warning-soft/, "no es el recuadro ámbar del kit");
  assert.match(conVentas, /class="[^"]*sunmi-text-accent[^"]*">4 tickets · Ver ventas/, "el enlace no va en color de acción");

  const vacia = horarioDeVentas([]);
  assert.deepEqual(vacia, { cantidad: 0, primera: null, ultima: null });
  const sinVentas = renderToStaticMarkup(React.createElement(HorarioDeVentasDeLaCaja, { c: { id: 9, horarioDeVentas: vacia }, onVerVentas: nada }));
  assert.equal(texto(sinVentas), "Sin ventas");
  assert.doesNotMatch(sinVentas, /<button/, "una caja sin ventas ofrece el enlace");
  // Y la caja la trae armada desde el resumen, con las ventas que tenga.
  assert.deepEqual(resumenDeCaja({ caja: cajaDe(2), ventas: VENTAS_CAJA_2_CON_HORA, movimientos: movsDe(2) }).horarioDeVentas, h);
});

// Ventas con la forma de `SELECT_VENTA_DE_LA_LISTA`, desordenadas: una normal,
// una anulada, una interna (generó transferencia) y una con pago mixto.
const LISTA_CRUDA = [
  { id: 13, numero: 503, fecha: "2026-10-18T13:02:00Z", total: "8000", formaPago: "EFECTIVO", esFiado: false, anuladaEn: null, pagos: [{ medio: "EFECTIVO", monto: "5000" }, { medio: "MERCADOPAGO", monto: "3000" }], transferencia: null },
  { id: 10, numero: 500, fecha: "2026-10-18T03:20:00Z", total: "1500", formaPago: "EFECTIVO", esFiado: false, anuladaEn: null, pagos: [{ medio: "EFECTIVO", monto: "1500" }], transferencia: null },
  { id: 12, numero: 502, fecha: "2026-10-18T10:00:00Z", total: "90000", formaPago: "EFECTIVO", esFiado: false, anuladaEn: null, pagos: [{ medio: "EFECTIVO", monto: "90000" }], transferencia: { id: 464 } },
  { id: 11, numero: 501, fecha: "2026-10-18T05:45:00Z", total: "2300", formaPago: "MERCADOPAGO", esFiado: false, anuladaEn: "2026-10-18T05:50:00Z", pagos: [{ medio: "MERCADOPAGO", monto: "2300" }], transferencia: null },
];

test("V2 · la lista: todas en orden de hora, anuladas tachadas e internas marcadas, y cada una abre su detalle", () => {
  const lista = listaDeVentasDeLaCaja(LISTA_CRUDA);
  assert.deepEqual(
    lista.map((v) => [v.numero, v.medio, v.total, v.anulada, v.interna]),
    [[500, "Efectivo", 1500, false, false], [501, "Mercado Pago", 2300, true, false], [502, "Efectivo", 90000, false, true], [503, "Efectivo + Mercado Pago", 8000, false, false]]
  );
  const caja = { ...resumenDe(2), fechaOperativa: cajaDe(2).fechaOperativa };
  const html = renderToStaticMarkup(React.createElement(VentasDeCaja, { datos: { local: { nombre: "Local 1" }, caja, ventas: lista, pie: pieDeVentasDeLaCaja(caja) }, onVerVenta: nada }));
  const t = texto(html);
  assert.match(t, /^Ventas de la Caja #2 · Damaris Cerrada Local 1 · Turno Mañana · Lun 12\/10 · 08:02 a 16:00 VENTAS /);
  assert.match(t, /VENTAS 00:20 · Ticket #500 Efectivo \$1\.500,00 02:45 · Ticket #501 Mercado Pago Anulada \$2\.300,00 07:00 · Ticket #502 Efectivo Interna \$90\.000,00 10:02 · Ticket #503 Efectivo \+ Mercado Pago \$8\.000,00 TOTAL DE LA CAJA/);
  // La anulada, tachada en el número y en el total; las otras, no.
  const fila = (id) => html.slice(html.indexOf(`data-venta="${id}"`)).split("</button>")[0];
  assert.equal((fila(11).match(/line-through/g) || []).length, 2, "la anulada no va tachada");
  for (const id of [10, 12, 13]) assert.doesNotMatch(fila(id), /line-through/, `la venta ${id} salió tachada`);
  assert.match(fila(11), /data-anulada=""/);
  assert.match(fila(12), /data-interna=""/);
  // Cada renglón es un botón al detalle que ya existe.
  assert.equal((html.match(/<button[^>]*data-venta=/g) || []).length, 4);
  assert.equal(urlDeLaVenta(13), "/modulos/reportes-ventas/13");
  assert.equal(urlDeVentas(951, "u=dia"), "/modulos/turnos-y-cierres/cajas/951/ventas?u=dia");
});

test("V3 · el pie coincide con la tarjeta: «Ventas en efectivo» y cada medio, sin anuladas ni internas", () => {
  const c = { ...resumenDe(2), cajon: cajaConArqueos(2, ARQUEOS_CAJA_2).cajon };
  const pie = pieDeVentasDeLaCaja(c);
  const del = (medio) => pie.medios.find((m) => m.medio === medio)?.monto;
  // El efectivo del pie es "Ventas en efectivo" de la tarjeta, número por número.
  assert.equal(del("EFECTIVO"), c.cajon.entro.ventasEfectivo);
  assert.equal(del("EFECTIVO"), 180500);
  // Y cada medio electrónico, el "Cobrado" de su bloque en la tarjeta.
  for (const m of c.cobrado.medios.filter((x) => !x.esFiado && x.medio !== "EFECTIVO")) assert.equal(del(m.medio), m.monto, m.medio);
  assert.equal(pie.tickets, c.metricas.tickets);
  // Dibujado: lo que la tarjeta dice y lo que el pie dice, lado a lado.
  const tarjeta = texto(renderToStaticMarkup(React.createElement(PersonaDelTurno, { c, abierta: true, onAlternar: nada, onVerCaja: nada })));
  const lista = texto(renderToStaticMarkup(React.createElement(VentasDeCaja, { datos: { local: {}, caja: { ...c, fechaOperativa: null }, ventas: [], pie }, onVerVenta: nada })));
  assert.match(tarjeta, /Ventas en efectivo \$180\.500,00/);
  assert.match(lista, /TOTAL DE LA CAJA Tickets 4 Efectivo \$180\.500,00 Crédito \$42\.300,00 Mercado Pago \$61\.200,00 Fiado \$4\.500,00/);
  assert.match(tarjeta, /MERCADO PAGO Cobrado \$61\.200,00/);
});

test("V4 · el listado pide la fecha de cada venta, que es de donde salen la primera y la última", async () => {
  const { db, pedidos } = baseQueAnota();
  await filasDeTurnosYCierres(db, { localId: F.localId, fechaInicio: new Date("2026-10-12T03:00:00Z"), fechaFin: new Date("2026-10-13T02:59:59Z"), alcance: ALCANCE.LOCAL, identidad: {} });
  const deCajas = pedidos.venta.find((p) => p.where?.turnoId?.in);
  assert.equal(deCajas.select.fecha, true, "SELECT_VENTA no pide la fecha");
});

// ── E3 · EL CIERRE ES UN ARQUEO MÁS: LA CAJA #951 ────────────────────────
//
// Caja #951 · Belen · Mini unidas · dom 18/10 · 00:06 a 16:05. Cambio 23.500,
// ventas en efectivo 415.300, sin pagos. Retiró 69.000 (10:14), 82.000 (12:05)
// y 123.000 (14:10); el cierre contó 135.100 (16:05). Las acumuladas guardadas:
// −34.500, −24.800, −29.700 y −29.700, que la pantalla mostraba en cada renglón
// como si hubiera faltado plata en todos los retiros.
const CAJA_951 = {
  efectivo: {
    cambioInicial: 23500, ventasEfectivo: 415300, ingresos: 0, pagosDesdeCaja: 0,
    retiradoArqueos: 274000, teniaQueHaber: 164800, contado: 135100,
  },
  // La forma de `SELECT_ARQUEO`; horas en Argentina (UTC−3).
  arqueos: [
    { id: 1, turnoId: 951, tipo: "PARCIAL", fechaHora: "2026-10-18T13:14:00Z", efectivoContado: "92500", efectivoRetirado: "69000", diferencia: "-34500" },
    { id: 2, turnoId: 951, tipo: "PARCIAL", fechaHora: "2026-10-18T15:05:00Z", efectivoContado: "91700", efectivoRetirado: "82000", diferencia: "-24800" },
    { id: 3, turnoId: 951, tipo: "FINAL", fechaHora: "2026-10-18T19:05:00Z", efectivoContado: "135100", efectivoRetirado: null, diferencia: "-29700" },
    { id: 4, turnoId: 951, tipo: "PARCIAL", fechaHora: "2026-10-18T17:10:00Z", efectivoContado: "118100", efectivoRetirado: "123000", diferencia: "-29700" },
  ],
  diferencia: -29700,
};

test("E3 · #951: tramos 34.500 falta, 9.700 sobra, 4.900 falta y sin diferencia; entró 438.800, salió 409.100, falta 29.700", () => {
  const cajon = efectivoDelCajon({ efectivo: CAJA_951.efectivo, arqueos: arqueosDeCaja(CAJA_951.arqueos), cerrada: true, diferencia: CAJA_951.diferencia });
  assert.equal(cajon.entro.total, 438800);
  assert.equal(cajon.salio.total, 409100);
  // En orden de hora, con el cierre último aunque la base los mande desordenados.
  assert.deepEqual(
    cajon.salio.retiros.map((r) => [r.rotulo, r.monto, r.tramo]),
    [["Retiro", 69000, -34500], ["Retiro", 82000, 9700], ["Retiro", 123000, -4900], ["Cierre", 135100, 0]]
  );
  // La diferencia es la de la caja, y entró − salió da exactamente eso.
  assert.equal(cajon.diferencia, -29700);
  assert.equal(cajon.salio.total - cajon.entro.total, cajon.diferencia);
  // Y la suma de los tramos es la acumulada final: nada se perdió en la resta.
  assert.equal(cajon.salio.retiros.reduce((s, r) => s + r.tramo, 0), -29700);

  const c = { estado: ESTADO_TURNO.CERRADO, resultado: RESULTADO_CAJA.FALTA, diferencia: -29700, cajon };
  const html = renderToStaticMarkup(React.createElement(EfectivoDeLaCaja, { c }));
  const t = texto(html);
  assert.equal(
    t,
    "EFECTIVO DE LA CAJA ENTRÓ AL CAJÓN Cambio inicial $23.500,00 Ventas en efectivo $415.300,00 Entró $438.800,00 " +
      "SALIÓ DEL CAJÓN 10:14 · Retiro Falta $34.500,00 $69.000,00 12:05 · Retiro Sobra $9.700,00 $82.000,00 " +
      "14:10 · Retiro Falta $4.900,00 $123.000,00 16:05 · Cierre Sin diferencia $135.100,00 Salió $409.100,00 " +
      "DIFERENCIA DE LA CAJA Falta $29.700,00 Entró $438.800,00 − salió $409.100,00"
  );
  // Sin pagos, sin el renglón; sin signo menos en lo que sale; sin lo viejo.
  assert.doesNotMatch(t, /Pagos desde la caja|−\$[1-9]|Retirado en arqueos|Tenía que haber|Contado al cerrar/);
  // Rojo la falta, ámbar la sobra, gris sin diferencia; el recuadro en rojo.
  const tramos = [...html.matchAll(/<div class="text-xs2 (sunmi-text-\w+)">(Falta|Sobra|Sin diferencia)/g)].map((m) => `${m[2]} ${m[1]}`);
  assert.deepEqual(tramos, ["Falta sunmi-text-danger", "Sobra sunmi-text-warning", "Falta sunmi-text-danger", "Sin diferencia sunmi-text-muted"]);
  assert.match(html, /data-recuadro="danger"/);
});

test("E3b · con pagos, el renglón aparece; abierta, sin cierre y «Caja abierta»", () => {
  const conPagos = efectivoDelCajon({ efectivo: { ...CAJA_951.efectivo, pagosDesdeCaja: 5000, contado: 130100 }, arqueos: arqueosDeCaja(CAJA_951.arqueos), cerrada: true, diferencia: -29700 });
  assert.equal(conPagos.salio.total, 409100);
  const c = { estado: ESTADO_TURNO.CERRADO, resultado: RESULTADO_CAJA.FALTA, diferencia: -29700, cajon: conPagos };
  assert.match(texto(renderToStaticMarkup(React.createElement(EfectivoDeLaCaja, { c }))), /SALIÓ DEL CAJÓN Pagos desde la caja \$5\.000,00 10:14 · Retiro/);

  const parciales = CAJA_951.arqueos.filter((a) => a.tipo !== "FINAL");
  const abierta = efectivoDelCajon({ efectivo: { ...CAJA_951.efectivo, contado: null }, arqueos: arqueosDeCaja(parciales), cerrada: false, diferencia: null });
  assert.deepEqual(abierta.salio.retiros.map((r) => r.rotulo), ["Retiro", "Retiro", "Retiro"]);
  assert.equal(abierta.diferencia, null);
  const ta = texto(renderToStaticMarkup(React.createElement(EfectivoDeLaCaja, { c: { estado: ESTADO_TURNO.ABIERTO, resultado: RESULTADO_CAJA.ABIERTA, diferencia: null, cajon: abierta } })));
  assert.match(ta, /14:10 · Retiro Falta \$4\.900,00 \$123\.000,00 Salió \$274\.000,00 Caja abierta$/);
  assert.doesNotMatch(ta, /Cierre|DIFERENCIA DE LA CAJA/);
});

test("E3c · la lista suma lo que dice «Salió»: conteos sin retiro no suman, y lo retirado sin arqueo se ve", () => {
  // Una caja vieja sin arqueos: el cierre igual está, sin tramo; los retiros
  // del cajón sin arqueo van en su renglón.
  const sin = cajaConArqueos(2, []).cajon;
  assert.deepEqual(sin.salio.retiros.map((r) => [r.rotulo, r.monto, r.tramo]), [["Retiros sin arqueo", 115000, null], ["Cierre", 81000, null]]);
  // Un conteo sin retiro: se ve con su tramo, no es una salida.
  const conteo = { id: 9, turnoId: 2, tipo: "PARCIAL", fechaHora: "2026-10-12T17:00:00Z", efectivoContado: "50000", efectivoRetirado: null, diferencia: "-500" };
  const c = cajaConArqueos(2, [...ARQUEOS_CAJA_2, conteo]).cajon;
  assert.deepEqual(c.salio.retiros.map((r) => [r.rotulo, r.esConteo, r.tramo]), [["Retiro", false, 0], ["Conteo", true, -500], ["Retiro", false, -1000], ["Cierre", false, 0]]);
  for (const k of [sin, c]) {
    const suma = k.salio.pagosDesdeCaja + k.salio.retiros.filter((r) => !r.esConteo).reduce((s, r) => s + r.monto, 0);
    assert.equal(suma, k.salio.total);
  }
});

// ── G · LA PANTALLA ──────────────────────────────────────────────────────

const ctx = parseContextoTesoreria({});
const datosLocal = () => ({ ok: true, vista: "LOCAL", local: { id: 2, nombre: "Local 1" }, periodo: { descripcion: { titulo: "Lunes 12 de octubre" } }, ...lectura() });
const pantalla = (datos, extra = {}) =>
  renderToStaticMarkup(
    React.createElement(PantallaTurnosYCierres, {
      datos, ctx, hoy: "2026-10-12", onCambiarPestana: nada, onCambiarUnidad: nada, onElegirRango: nada,
      onAtras: nada, onAdelante: nada, onReintentar: nada, onVerCaja: nada, ...extra,
    })
  );

test("G1 · plegados: un turno por tarjeta, el aviso de ventas sin caja y las pestañas del local", () => {
  const html = pantalla(datosLocal());
  const t = texto(html);
  assert.match(t, /2 ventas sin caja asignada \$14\.300,00 Ver ›/);
  assert.match(t, /Todos Noche Mañana Tarde Sin turno/);
  assert.match(t, /Turno Noche 00:06 a 08:02 · 1 caja · 6 tickets/);
  assert.match(t, /Turno Tarde desde 16:00 · 2 cajas · 3 tickets/);
  // Desde el 2026-10-17 el chip "Diferencias de caja" y "Cómo se cobró" se
  // fueron: las diferencias van por caja en "Quién trabajó" y en el desglose.
  assert.doesNotMatch(t, /Diferencias de caja|CÓMO SE COBRÓ/, "volvió el chip o la barra del turno");
  assert.ok(html.indexOf("Sin turno asignado") > html.lastIndexOf("Turno Tarde"), "sin turno no quedó al final");
  assert.doesNotMatch(t, /Bruto|LO QUE SALIÓ/, "plegado mostró el detalle de las cajas");
  // Plegado: quién trabajó y el resultado, sin el desglose.
  assert.match(t, /QUIÉN TRABAJÓ[\s\S]*RESULTADO DEL TURNO/);
  assert.doesNotMatch(t, /LO QUE SE COBRÓ|PLATA QUE SALIÓ/, "plegado mostró el desglose del turno");
  // La grilla Tickets / Vendido se fue.
  assert.doesNotMatch(t, /Tickets \d+ Vendido/, "volvió la grilla vieja");
});

// G1b CAMBIÓ DE CONTRATO EL 2026-10-17: el desglose arranca por LO QUE SE
// COBRÓ —un renglón por medio, Mercado Pago y Crédito separados— y termina en
// el resultado, con las diferencias de caja una por caja y con nombre.
test("G1b · desplegado: de lo cobrado al resultado, con el faltante de caja por nombre", () => {
  const d = datosLocal();
  const g = d.grupos.find((x) => x.titulo === "Turno Mañana");
  const t = texto(pantalla({ ...d, grupos: [g] }, { abiertosIniciales: [g.clave] }));
  const c = (n) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\./g, "\\.");
  assert.match(t, new RegExp(`RESULTADO DEL TURNO \\$${c(g.resultado)}`));
  assert.match(
    t,
    new RegExp(
      `LO QUE SE COBRÓ Efectivo \\$180\\.500,00 Crédito \\$42\\.300,00 Mercado Pago \\$61\\.200,00 Fiado \\$4\\.500,00 ` +
        `Comisiones −\\$${c(g.comisiones)} Total cobrado \\$${c(g.neto)} Costo de la mercadería −\\$${c(g.costo)} ` +
        `Ganancia de las ventas \\$${c(g.ganancia)} Sueldos y gastos −\\$3\\.000,00 Consumo del personal \\$0,00 ` +
        `Faltante de caja · Damaris −\\$1\\.500,00 Resultado del turno \\$${c(g.resultado)}`
    )
  );
  // La cuenta cierra: lo cobrado por los medios menos las comisiones es el
  // total, y el total menos el costo es la ganancia.
  const medios = g.medios.reduce((s, m) => s + Math.round(m.monto * 100), 0);
  assert.equal(medios - Math.round(g.comisiones * 100), Math.round(g.neto * 100));
  assert.equal(Math.round(g.neto * 100) - Math.round(g.costo * 100), Math.round(g.ganancia * 100));
  assert.doesNotMatch(t, /Total vendido/, "volvió el total vendido");
  // P5 · la plata que salió, pago por pago, con su tipo y su marca, DESPUÉS del resultado.
  assert.match(t, /Resultado del turno [^ ]+ PLATA QUE SALIÓ DE LA CAJA Gasto Pan Resta \$3\.000,00/);
  assert.doesNotMatch(t, /sin clasificar/, "el fixture no tiene egresos sin tipo y apareció el aviso");
});

test("G1c · sobrante y faltante de dos cajas van por separado, nunca netos", () => {
  const d = datosLocal();
  const noche = d.grupos.find((x) => x.titulo === "Turno Noche");
  const manana = d.grupos.find((x) => x.titulo === "Turno Mañana");
  // El MISMO turno con las cajas de los dos: una sobra y una falta.
  const g = { ...manana, cajas: [...noche.cajas, ...manana.cajas] };
  const t = texto(pantalla({ ...d, grupos: [g] }, { abiertosIniciales: [g.clave] }));
  assert.match(t, /Sobrante de caja · \S+ \+\$0,01 Faltante de caja · Damaris −\$1\.500,00/);
});

test("G2 · una pestaña de turno muestra solo ese turno", () => {
  const d = datosLocal();
  const tarde = d.pestanas.find((p) => p.texto === "Tarde").valor;
  const t = texto(pantalla(d, { pestana: tarde }));
  assert.match(t, /Turno Tarde/);
  assert.doesNotMatch(t, /Turno Noche|Turno Mañana|Sin turno asignado/);
  assert.ok(d.grupos.filter((g) => grupoEnPestana(g, "sin-turno")).every((g) => g.sinTurno));
});

// G3 CAMBIÓ DE CONTRATO EL 2026-10-15: la caja desplegada dentro del turno
// dejó la grilla Bruto/Neto/Ganancia/Tickets y el "Digital" repetido, y se ve
// como el detalle V2 · B —la MISMA pieza, `EfectivoDeLaCaja` y
// `CobradoEnLaCaja`—. Lo que salió de la caja pasó a la tarjeta del turno.
// G3 CAMBIÓ DE CONTRATO EL 2026-10-17 (Figma "OPCIÓN B", 415:483): las cajas
// dejaron el pie de la tarjeta del turno y pasaron a "QUIÉN TRABAJÓ", arriba
// del resultado y visibles también con el turno plegado. Cada una despliega
// adentro de su tarjetita la MISMA caja V2 · B de antes.
test("G3 · quién trabajó: arriba del resultado, también plegado, una tarjetita por caja", () => {
  const d = datosLocal();
  const g = d.grupos.find((x) => x.titulo === "Turno Mañana");
  const html = pantalla({ ...d, grupos: [g] });
  const t = texto(html);
  // Desde el 2026-10-19 el horario de la caja dice "abierta HH:MM a HH:MM".
  assert.match(t, /Turno Mañana .*· \d+ tickets? ˅ QUIÉN TRABAJÓ Damaris Caja #2 · abierta 08:02 a 16:00 Falta \$1\.500,00 Ver caja › .*RESULTADO DEL TURNO/);
  assert.equal((html.match(/data-caja="/g) || []).length, g.cajas.length, "una tarjetita por caja");
  assert.doesNotMatch(t, /EFECTIVO DE LA CAJA|COBRADO EN LA CAJA/, "plegada mostró el detalle de la caja");
  assert.ok(html.indexOf("data-quien-trabajo") < html.indexOf("RESULTADO DEL TURNO"), "quién trabajó no quedó arriba");
});

// G3b CAMBIÓ DE CONTRATO EL 2026-10-17: la caja desplegada se achicó al
// efectivo y un bloque por medio electrónico con lo cobrado y su comisión.
// Y OTRA VEZ EL 2026-10-18: el efectivo pasó a ser LA ÚNICA LECTURA DEL
// CAJÓN —entró, salió con cada retiro y su tramo, el cierre último— y volvió el
// recuadro de la diferencia, ahora al pie, con la cuenta "entró − salió". Se
// fueron "Retirado en arqueos", "Tenía que haber" y "Contado al cerrar", y los
// montos perdieron el signo. La caja es la 2 del fixture con sus arqueos.
test("G3b · desplegada: la lectura del cajón y un bloque por medio electrónico, con el botón al detalle al pie", () => {
  const d = datosLocal();
  const delFixture = d.grupos.find((g) => g.titulo === "Turno Mañana").cajas[0];
  const c = { ...delFixture, cajon: cajaConArqueos(2, ARQUEOS_CAJA_2).cajon, horarioDeVentas: horarioDeVentas(VENTAS_CAJA_2_CON_HORA) };
  const html = renderToStaticMarkup(React.createElement(PersonaDelTurno, { c, abierta: true, onAlternar: nada, onVerCaja: nada }));
  const t = texto(html);
  // Desde el 2026-10-19: "abierta HH:MM a HH:MM" y, arriba del efectivo, cuándo vendió.
  assert.match(
    t,
    /^Damaris Caja #2 · abierta 08:02 a 16:00 Falta \$1\.500,00 Ocultar caja Primera venta 08:15 · Última venta 15:40 4 tickets · Ver ventas de esta caja › EFECTIVO DE LA CAJA ENTRÓ AL CAJÓN Cambio inicial \$20\.000,00 Ventas en efectivo \$180\.500,00 Entró \$200\.500,00 SALIÓ DEL CAJÓN Pagos desde la caja \$3\.000,00 13:00 · Retiro Sin diferencia \$60\.000,00 15:00 · Retiro Falta \$1\.500,00 \$55\.000,00 16:00 · Cierre Sin diferencia \$81\.000,00 Salió \$199\.000,00 DIFERENCIA DE LA CAJA Falta \$1\.500,00 Entró \$200\.500,00 − salió \$199\.000,00 CRÉDITO Cobrado \$42\.300,00 Comisión −\$1\.692,00 MERCADO PAGO Cobrado \$61\.200,00 Comisión −\$2\.448,00 Ver detalle y Z ›$/
  );
  // El recuadro dice LO MISMO que la cabecera del trabajador.
  assert.equal((t.match(/Falta \$1\.500,00/g) || []).length, 3, "cabecera, tramo y recuadro");
  assert.doesNotMatch(t, /Retirado en arqueos|Tenía que haber|Contado al cerrar|Total cobrado|Neto|Fiado/, "volvió algo que se sacó del despliegue");
  assert.doesNotMatch(html, /data-barra-medios/, "volvió la barra");
  assert.match(html, /^<div data-caja="2" data-abierta=""[^>]*border-2 sunmi-border-accent/, "abierta sin su borde de acento");
  // Plegada, nada del detalle.
  const plegada = texto(renderToStaticMarkup(React.createElement(PersonaDelTurno, { c, onAlternar: nada, onVerCaja: nada })));
  assert.match(plegada, /^Damaris Caja #2 · abierta 08:02 a 16:00 Falta \$1\.500,00 Ver caja ›$/);
});

test("H1 · el historial del mes pide las cajas CERRADAS del mes de esas personas, y cuenta con la diferencia calculada", async () => {
  const { db, pedidos } = baseQueAnota();
  const cerradas = F.cajas.filter((c) => c.cierre);
  db.turno = { findMany: async (args) => ((pedidos.turno ||= []).push(args), cerradas) };
  const h = await historialDelMes(db, { localId: F.localId, alcance: ALCANCE.LOCAL, identidad: {}, cajas: F.cajas, hoy: "2026-10-13" });
  const where = JSON.stringify(pedidos.turno[0].where);
  assert.match(where, /"cierre":\{"not":null\}/, "pidió cajas sin cerrar");
  assert.match(where, /"fechaOperativa":\{"gte":"2026-10-01/, "no pidió desde el día 1 del mes");
  // Damaris (caja 2) faltó; la caja 1 sobró; la 3 cuadró y no cuenta.
  const de = (id) => h.get(personaDeCaja(F.cajas.find((c) => c.id === id)));
  assert.equal(de(2).faltas, 1);
  assert.equal(de(1).sobras, 1);
  const total = [...h.values()].reduce((s, x) => s + x.faltas + x.sobras, 0);
  assert.equal(total, cerradas.map((c) => resumenDe(c.id).resultado).filter((r) => r === RESULTADO_CAJA.FALTA || r === RESULTADO_CAJA.SOBRA).length);
});

test("G3e · el historial del mes: lo que da cero no se dice; rojo con faltas, naranja con solo sobras", () => {
  const c = datosLocal().grupos.find((g) => g.titulo === "Turno Mañana").cajas[0];
  const con = (h) => renderToStaticMarkup(React.createElement(PersonaDelTurno, { c: { ...c, historialDelMes: h }, onAlternar: nada, onVerCaja: nada }));
  assert.match(texto(con({ faltas: 2, sobras: 1 })), /Caja #2 · abierta 08:02 a 16:00 Este mes: 2 faltas · 1 sobra Falta/);
  assert.match(con({ faltas: 1, sobras: 0 }), /data-historial-del-mes="[^"]*" class="[^"]*sunmi-text-danger">Este mes: 1 falta</);
  assert.match(con({ faltas: 0, sobras: 3 }), /data-historial-del-mes="[^"]*" class="[^"]*sunmi-text-warning">Este mes: 3 sobras</);
  assert.doesNotMatch(con({ faltas: 0, sobras: 0 }), /data-historial-del-mes/);
  assert.doesNotMatch(con(undefined), /data-historial-del-mes/);
});

test("G3f · cajas abiertas a la vez: la pastilla con la franja real, solo si hubo", () => {
  const caja = (apertura, cierre) => ({ apertura, cierre });
  // El caso del 17/10: Roxana 00:07–08:08 y Alexis 00:12–01:55.
  const dos = [caja("2026-10-17T03:07:00Z", "2026-10-17T11:08:00Z"), caja("2026-10-17T03:12:00Z", "2026-10-17T04:55:00Z")];
  assert.deepEqual(cajasSuperpuestas(dos), { texto: "⚠ 2 cajas abiertas a la vez · 00:12–01:55", tono: "warning" });
  // Una cierra cuando la otra abre: no estuvieron a la vez.
  assert.equal(cajasSuperpuestas([caja("2026-10-17T03:00:00Z", "2026-10-17T11:00:00Z"), caja("2026-10-17T11:00:00Z", "2026-10-17T19:00:00Z")]), null);
  assert.equal(cajasSuperpuestas([dos[0]]), null);
  // Las dos siguen abiertas: desde cuándo.
  assert.equal(
    cajasSuperpuestas([caja("2026-10-17T03:07:00Z", null), caja("2026-10-17T03:12:00Z", null)], new Date("2026-10-17T05:00:00Z")).texto,
    "⚠ 2 cajas abiertas a la vez · desde 00:12"
  );
  // En la tarjeta, debajo del renglón del turno; el fixture no tiene superpuestas en la mañana.
  const d = datosLocal();
  const tarde = d.grupos.find((g) => g.titulo === "Turno Tarde");
  const html = pantalla({ ...d, grupos: [tarde] });
  const esperado = cajasSuperpuestas(tarde.cajas);
  if (esperado) assert.ok(html.indexOf("data-cajas-superpuestas") < html.indexOf("data-quien-trabajo"));
  assert.doesNotMatch(pantalla({ ...d, grupos: [d.grupos.find((g) => g.titulo === "Turno Mañana")] }), /data-cajas-superpuestas/);
});

test("G3c · cómo cerró cada caja: sobra, falta, cuadra o abierta, con el importe sin signo", () => {
  const d = datosLocal();
  const t = texto(pantalla(d));
  assert.match(t, /Caja #1 · abierta \d\d:\d\d a \d\d:\d\d Sobra \$0,01 Ver caja ›/);
  assert.match(t, /Caja #3 · abierta \d\d:\d\d a \d\d:\d\d Cuadra Ver caja ›/);
  assert.match(t, /Caja #6 · abierta desde \d\d:\d\d Abierta Ver caja ›/);
});

test("G3d · un pago sin clasificar dice «Sin clasificar» una sola vez: el chip", () => {
  const manual = { ...F.movimientos.find((m) => m.id === 3), id: 99, motivo: "Verdulería", gastoConcepto: null, gastoCategoria: null, clase: CLASE_MOVIMIENTO.MANUAL, tipoEgreso: null };
  const l = armarTurnosYCierres({ localId: F.localId, cajas: F.cajas, ventas: F.ventas, movimientos: [...F.movimientos, manual], turnosDelLocal: F.turnosDelLocal });
  const g = l.grupos.find((x) => x.titulo === "Turno Mañana");
  const pago = g.pagos.find((p) => p.id === 99);
  assert.equal(pago.tipoEgreso ?? null, null, "el caso no es un pago sin tipo");
  const html = pantalla({ ...datosLocal(), grupos: [g] }, { abiertosIniciales: [g.clave] });
  assert.ok(html.includes('data-pago="99"'), "el pago no se dibujó");
  const fila = texto(html.slice(html.indexOf('data-pago="99"')).split("</div>")[0]);
  assert.equal((fila.match(/Sin clasificar/g) || []).length, 1, fila);
});

test("G4 · el cajero ve «Mis cajas»: la abierta con su esperado de ahora y las anteriores con su diferencia", () => {
  const damaris = cajaDe(2).vendedorId;
  const propias = F.cajas.filter((c) => c.vendedorId === damaris);
  const mis = armarMisCajas({ cajas: propias, ventas: F.ventas, movimientos: F.movimientos, hoy: "2026-10-13" });
  const t = texto(pantalla({ ok: true, vista: "MIS_CAJAS", local: { nombre: "Local 1" }, quien: "Damaris", ...mis }));
  assert.match(t, /^Damaris · Local 1 HOY Damaris Abierta Caja #6 · desde 16:05 Ver › Efectivo esperado ahora \$96\.400,00/);
  assert.match(t, /ANTERIORES Lun 12\/10 Cerrada Caja #2 · 08:02 a 16:00 Ver y Z › Diferencia de caja −\$1\.500,00 · Falta/);
  assert.doesNotMatch(t, /Mariangel|Caja #1\b|Caja #3\b/, "el cajero ve una caja ajena");
  assert.doesNotMatch(t, /Todos|Semana/, "el cajero recibió el selector o las pestañas del local");
});

// G5 CAMBIÓ DE CONTRATO EL 2026-10-18: el detalle usa la MISMA lectura del
// cajón que la tarjeta —la pieza es una—; el recuadro de la diferencia pasó al
// pie de esa lectura. El botón dejó de decir "Arqueos": los arqueos ya están acá.
test("G5 · el detalle: la misma lectura del cajón y lo cobrado con sus comisiones", () => {
  const caja = { ...cajaConArqueos(2, ARQUEOS_CAJA_2), fechaOperativa: cajaDe(2).fechaOperativa };
  const html = renderToStaticMarkup(React.createElement(DetalleDeCaja, { datos: { local: { nombre: "Local 1" }, caja, arqueos: [] }, onVerMovimientos: nada }));
  const t = texto(html);
  assert.match(t, /^Caja #2 · Damaris Cerrada Local 1 · Turno Mañana · Lun 12\/10 · 08:02 a 16:00/);
  const tarjeta = texto(renderToStaticMarkup(React.createElement(EfectivoDeLaCaja, { c: caja })));
  assert.ok(t.includes(tarjeta), "el detalle no dibuja la misma lectura que la tarjeta");
  assert.match(t, /DIFERENCIA DE LA CAJA Falta \$1\.500,00 Entró \$200\.500,00 − salió \$199\.000,00 COBRADO EN LA CAJA/);
  assert.match(html, /data-recuadro="danger"/, "una falta no va en rojo");
  // V2 · B: la leyenda con el porcentaje bajo la barra, y la comisión de cada
  // medio como su propio renglón, restada (cambió el 2026-10-15).
  assert.match(t, /COBRADO EN LA CAJA Efectivo 64 % Crédito 15 % Mercado Pago 21 % Efectivo \$180\.500,00 Crédito \$42\.300,00 Comisión Crédito −\$1\.692,00 Mercado Pago \$61\.200,00 Comisión Mercado Pago −\$2\.448,00/);
  assert.match(t, /Total cobrado \$284\.000,00 Neto después de comisiones \$279\.860,00 Fiado \$4\.500,00 Pagos y Z ›$/);
  assert.doesNotMatch(t, /Fondo inicial|ARQUEOS Y CIERRE|Retirado en arqueos|Tenía que haber/);
  // Sin diferencia en gris (ya no verde: "Sin diferencia" no es un logro, es
  // cero); naranja sobra.
  assert.match(renderToStaticMarkup(React.createElement(DetalleDeCaja, { datos: { local: {}, caja: { ...resumenDe(3), fechaOperativa: null }, arqueos: [] }, onVerMovimientos: nada })), /data-recuadro="muted"/);
  assert.match(renderToStaticMarkup(React.createElement(DetalleDeCaja, { datos: { local: {}, caja: { ...resumenDe(1), fechaOperativa: null }, arqueos: [] }, onVerMovimientos: nada })), /data-recuadro="warning"/);
});

// G5b CAMBIÓ DE CONTRATO EL 2026-10-18: la lista "Arqueos y cierre" se fue de
// esta pantalla —es la segunda lectura de la caja que había, con la acumulada
// en cada renglón—. Los arqueos están en la tarjeta, con su tramo. Quedan los
// pagos y el botón al Z, aunque el servidor siga mandando los arqueos.
test("G5b · «Pagos y Z»: los pagos y el botón al Z, sin la lista de arqueos", () => {
  const caja = { ...cajaConArqueos(2, ARQUEOS_CAJA_2), fechaOperativa: cajaDe(2).fechaOperativa };
  const arqueos = arqueosDeCaja(ARQUEOS_CAJA_2);
  const html = renderToStaticMarkup(React.createElement(MovimientosDeCaja, { datos: { local: { nombre: "Local 1" }, caja, arqueos }, onVerZ: nada }));
  const t = texto(html);
  assert.match(t, /^Caja #2 · Damaris Cerrada Local 1 · Turno Mañana · Lun 12\/10 · 08:02 a 16:00 PAGOS DESDE LA CAJA Gasto · Pan 12:10 \$3\.000,00 Ver comprobante Z$/);
  assert.doesNotMatch(t, /ARQUEOS Y CIERRE|Retiró|Contó|Sin diferencia/);
  assert.doesNotMatch(html, /data-arqueo=|data-retiro=/);
});

test("G6 · sin colores fijos: todo sale de los tokens del tema", () => {
  for (const f of ["PantallaTurnosYCierres.jsx", "PiezasTurnosYCierres.jsx", "DetalleDeCaja.jsx"]) {
    const src = fuente(`components/turnos-y-cierres/${f}`);
    assert.doesNotMatch(src, /\b(text|bg|border|from|to|ring)-(amber|red|green|emerald|slate|cyan|sky|rose|yellow|gray|zinc|white|black|orange)(-\d|\b)/, f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgb\(|\[\d+px\]/, f);
  }
});

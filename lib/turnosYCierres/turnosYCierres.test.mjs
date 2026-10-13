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
  grupoEnPestana,
  resumenDeCaja,
  resumenDeGrupo,
  resumenVentasSinCaja,
} from "@/lib/turnosYCierres/lecturaTurnosYCierres.js";
import { filasDeTurnosYCierres, leerMisCajas, whereVentasSinCaja } from "@/lib/turnosYCierres/lecturaTurnosYCierresServer.js";
import { diferenciasDelGrupo } from "@/lib/turnosYCierres/pantallaTurnosYCierres.js";
import PantallaTurnosYCierres from "@/components/turnos-y-cierres/PantallaTurnosYCierres.jsx";
import DetalleDeCaja from "@/components/turnos-y-cierres/DetalleDeCaja.jsx";
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
  // turnos.ver_todos NO abre el local en este módulo: no está en lo pedido.
  assert.equal(alcanceDeCajas({ permisos: ["pos.usar", "turnos.ver_todos"] }), ALCANCE.PROPIAS);
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

test("A5 · el detalle de una caja comprueba el alcance antes de contestar", () => {
  const ruta = fuente("app/api/turnos-y-cierres/cajas/[id]/route.js");
  const control = ruta.indexOf("puedeVerCajaDelModulo(");
  assert.ok(control > 0, "el detalle no comprueba de quién es la caja");
  assert.ok(control < ruta.indexOf("NextResponse.json({\n      ok: true"), "contesta la caja antes de comprobar");
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

test("B3 · el desglose del esperado cierra exacto: fondo + efectivo + ingresos − salidas − arqueos", () => {
  for (const caja of F.cajas) {
    const e = resumenDe(caja.id).efectivo;
    const c = (n) => Math.round(n * 100);
    assert.equal(c(e.fondoInicial) + c(e.ventasEfectivo) + c(e.ingresos) - c(e.salidasEfectivo) - c(e.retiradoArqueos), c(e.teniaQueHaber), `caja #${caja.id}`);
  }
  assert.equal(resumenDe(2).efectivo.salidasEfectivo, 3000, "el gasto pagado desde la caja");
  assert.equal(resumenDe(2).efectivo.retiradoArqueos, 115000);
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

test("E2 · la diferencia de cada arqueo es la acumulada, tal cual se guardó", () => {
  const arqueos = arqueosDeCaja([
    { id: 1, tipo: "PARCIAL", fechaHora: "2026-10-12T16:00:00Z", efectivoContado: "100", efectivoRetirado: "60000", diferencia: "0" },
    { id: 2, tipo: "PARCIAL", fechaHora: "2026-10-12T18:00:00Z", efectivoContado: "100", efectivoRetirado: "55000", diferencia: "-1500" },
    { id: 3, tipo: "FINAL", fechaHora: "2026-10-12T19:00:00Z", efectivoContado: "81000", efectivoRetirado: null, diferencia: "-1500" },
  ]);
  assert.deepEqual(arqueos.map((a) => a.diferencia), [0, -1500, -1500]);
  assert.deepEqual(arqueos.map((a) => `${a.tipo} ${a.accion} ${a.monto}`), ["Arqueo Retiró 60000", "Arqueo Retiró 55000", "Cierre Contó 81000"]);
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
  assert.match(t, /Turno Noche 00:06 a 08:02 · 1 caja/);
  assert.match(t, /Turno Tarde desde 16:00 · 2 cajas · 1 abierta/);
  assert.match(t, /Turno Mañana[\s\S]*Diferencias de caja 1 falta/);
  assert.match(t, /Turno Noche[\s\S]*Diferencias de caja 1 sobra/);
  assert.ok(html.indexOf("Sin turno asignado") > html.lastIndexOf("Turno Tarde"), "sin turno no quedó al final");
  assert.doesNotMatch(t, /Bruto|LO QUE SALIÓ/, "plegado mostró el detalle de las cajas");
});

test("G2 · una pestaña de turno muestra solo ese turno", () => {
  const d = datosLocal();
  const tarde = d.pestanas.find((p) => p.texto === "Tarde").valor;
  const t = texto(pantalla(d, { pestana: tarde }));
  assert.match(t, /Turno Tarde/);
  assert.doesNotMatch(t, /Turno Noche|Turno Mañana|Sin turno asignado/);
  assert.ok(d.grupos.filter((g) => grupoEnPestana(g, "sin-turno")).every((g) => g.sinTurno));
});

test("G3 · desplegado: la caja con sus cifras, lo cobrado con el fiado aparte y lo que salió sin signo", () => {
  const d = datosLocal();
  const manana = d.grupos.find((g) => g.titulo === "Turno Mañana").clave;
  const t = texto(pantalla(d, { abiertosIniciales: [manana] }));
  assert.match(t, /Damaris · Caja #2 Cerrada 08:02 a 16:00 −\$1\.500,00 · Falta/);
  assert.match(t, /COBRADO Efectivo \$180\.500,00 Digital \$103\.500,00 Crédito \$42\.300,00 Mercado Pago \$61\.200,00 Fiado \$4\.500,00/);
  assert.match(t, /LO QUE SALIÓ DE LA CAJA Pago Pan 12:10 \$3\.000,00 Arqueo Retiro de recaudación 13:00 \$60\.000,00/);
  assert.match(t, /Cierre Entregado al cerrar 16:00 \$61\.000,00 Ver detalle y Z ›/);
  assert.doesNotMatch(t, /LO QUE SALIÓ DE LA CAJA[^V]*−\$/, "una salida lleva signo menos");
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

test("G5 · el detalle: la diferencia grande, el desglose que cierra y los arqueos con su acumulada", () => {
  const caja = { ...resumenDe(2), fechaOperativa: cajaDe(2).fechaOperativa };
  const arqueos = arqueosDeCaja([
    { id: 3, tipo: "PARCIAL", fechaHora: "2026-10-12T16:00:00Z", efectivoContado: "1", efectivoRetirado: "60000", diferencia: "0" },
    { id: 5, tipo: "FINAL", fechaHora: "2026-10-12T19:00:00Z", efectivoContado: "81000", efectivoRetirado: null, diferencia: "-1500" },
  ]);
  const t = texto(renderToStaticMarkup(React.createElement(DetalleDeCaja, { datos: { local: { nombre: "Local 1" }, caja, arqueos }, onVerZ: nada })));
  assert.match(t, /^Caja #2 · Damaris Cerrada Local 1 · Turno Mañana · Lun 12\/10 · 08:02 a 16:00/);
  assert.match(t, /DIFERENCIA DE CAJA −\$1\.500,00 · Falta Fondo inicial \$20\.000,00 Ventas en efectivo \+\$180\.500,00 Salidas de efectivo −\$3\.000,00 Retirado en arqueos −\$115\.000,00 Tenía que haber \$82\.500,00 Contado al cerrar \$81\.000,00/);
  assert.match(t, /Total cobrado \$284\.000,00 Fiado \$4\.500,00/);
  assert.match(t, /ARQUEOS Y CIERRE 13:00 · Arqueo Retiró \$60\.000,00 Sin diferencia 16:00 · Cierre Contó \$81\.000,00 −\$1\.500,00 · Falta/);
  assert.match(t, /SALIDAS DE EFECTIVO Gasto · Pan 12:10 \$3\.000,00 Ver comprobante Z/);
});

test("G6 · sin colores fijos: todo sale de los tokens del tema", () => {
  for (const f of ["PantallaTurnosYCierres.jsx", "PiezasTurnosYCierres.jsx", "DetalleDeCaja.jsx"]) {
    const src = fuente(`components/turnos-y-cierres/${f}`);
    assert.doesNotMatch(src, /\b(text|bg|border|from|to|ring)-(amber|red|green|emerald|slate|cyan|sky|rose|yellow|gray|zinc|white|black|orange)(-\d|\b)/, f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgb\(|\[\d+px\]/, f);
  }
});

// EL "PAGO A DEPÓSITO" DEL RESUMEN DE FINANZAS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/pagoADeposito.test.mjs
//
// El número es de Transferencias (`cuentaDelPeriodo.test.mjs` afirma cómo se
// cuenta). Acá se afirma lo que es de Finanzas:
//
//   · que no hay una segunda valorización en ningún archivo de Finanzas;
//   · que ni la caja, ni la venta interna, ni el motivo de un retiro lo
//     alimentan, y que el resumen no lo resta de nada;
//   · que para el depósito no aplica;
//   · que el "Ver" abre Transferencias en el mismo local, período y criterio, y
//     solo con su permiso;
//   · que el período de los dos módulos es el mismo;
//   · y que la pantalla dibuja las pendientes como lo que son.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CRITERIO_PAGO_A_DEPOSITO,
  PERMISO_VER_TRANSFERENCIAS,
  armarPagoADeposito,
  enlaceDePagoADeposito,
} from "@/lib/finanzas/pagoADeposito";
import { resumenDelPeriodo } from "@/lib/finanzas/resumenFinanciero";
import { CLASE_MOVIMIENTO, clasificarMovimientos, soloManuales, soloRecaudacion } from "@/lib/finanzas/movimientosDeCaja";
import { rangoFinanciero, DESPLAZAMIENTO_MINIMO } from "@/lib/finanzas/periodoFinanciero";
import { CRITERIO_CUENTA } from "@/lib/transferencias/criterioDeCuenta";
import { RUTA_CUENTA, RUTA_LOCAL, VISTA_CUENTA, parseContextoDelTablero } from "@/lib/transferencias/contextoDelTablero";
import { UNIDADES, rangoDesplazado } from "@/lib/transferencias/periodoDePago";
import { corteDeUbicacion, rangoSemanalDeUbicacion } from "@/lib/semanaOperativa/semanaOperativa";
import ResumenDelPeriodo from "@/components/finanzas/ResumenDelPeriodo.jsx";

/** El texto de un archivo sin comentarios: un candado que busca en prosa no afirma nada. */
const codigo = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/[^\n]*/g, "");

/** Lo que `resumenDePagoADeposito` devuelve: la forma real. */
const CUENTA = Object.freeze({
  criterio: CRITERIO_CUENTA.RECEPCION,
  total: 485300,
  cantidadTransferencias: 7,
  pendientes: Object.freeze({ total: 126400, cantidadTransferencias: 3 }),
});

// ── 1 · EL CONTRATO ─────────────────────────────────────────────────────────

test("F1 · el contrato: lo que calculó Transferencias, tal cual, con su criterio", () => {
  const p = armarPagoADeposito({ esDeposito: false, cuenta: CUENTA, verDetalle: "/x", verPendientes: "/p" });
  assert.deepEqual(p, {
    aplica: true,
    criterio: CRITERIO_CUENTA.RECEPCION,
    total: 485300,
    cantidadTransferencias: 7,
    // Las pendientes llevan su enlace al detalle cuando hay alguna. Acá son 3.
    pendientes: { total: 126400, cantidadTransferencias: 3, verPendientes: "/p" },
    verDetalle: "/x",
  });
  // Sin pendientes, el enlace es null aunque se lo pase: no hay a dónde ir.
  const sinPend = armarPagoADeposito({
    esDeposito: false,
    cuenta: { ...CUENTA, pendientes: { total: 0, cantidadTransferencias: 0 } },
    verDetalle: "/x",
    verPendientes: "/p",
  });
  assert.equal(sinPend.pendientes.verPendientes, null);
  assert.equal(CRITERIO_PAGO_A_DEPOSITO, CRITERIO_CUENTA.RECEPCION);
});

test("F15 · para el depósito NO APLICA, y los números van en null, no en cero", () => {
  const p = armarPagoADeposito({ esDeposito: true, cuenta: CUENTA, verDetalle: "/x" });
  assert.equal(p.aplica, false);
  assert.equal(p.total, null);
  assert.equal(p.cantidadTransferencias, null);
  assert.equal(p.pendientes, null);
  assert.equal(p.verDetalle, null, "un enlace al pago de sí mismo no tiene a dónde llevar");

  // Y la ruta lo decide por el local CONSULTADO, no por quién mira, y sin
  // consultar nada para el depósito.
  const ruta = codigo("app/api/finanzas/tablero/route.js");
  assert.match(ruta, /const consultadoEsDeposito = Boolean\(locales\.find\(\(l\) => l\.localId === localId\)\?\.esDeposito\)/);
  assert.match(ruta, /consultadoEsDeposito\s*\?\s*null\s*:\s*await resumenDePagoADeposito\(prisma, \{ destinoId: localId, rango \}\)/);
});

test("F18 · las pendientes viajan APARTE y no están en el total", () => {
  const p = armarPagoADeposito({ esDeposito: false, cuenta: CUENTA });
  assert.equal(p.total, 485300, "una pendiente se sumó al pago");
  assert.equal(p.pendientes.total, 126400);
});

// ── 2 · NI UNA SEGUNDA VALORIZACIÓN, NI OTRA FUENTE ─────────────────────────

/** Todos los archivos de Finanzas, trackeados o no (regla 10 de CLAUDE.md). */
function archivosDeFinanzas() {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "lib/finanzas", "app/api/finanzas", "components/finanzas", "app/modulos/finanzas"],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !f.endsWith(".test.mjs"));
}

test("F9 · ningún archivo de Finanzas valoriza transferencias ni las consulta", () => {
  const prohibidos = [
    /valorizarDetalle/,
    /valorizarLineaDelRemito/,
    /resolverCostoTransferencia/,
    /importeRecibidoDe/,
    /importeEnviadoDe/,
    /importeDeDetalle/,
    /transferenciaDetalle/,
    /transferencia\.findMany/,
    /transferencia\.findFirst/,
    /cuentaDelPeriodo\(/,
  ];
  const archivos = archivosDeFinanzas();
  assert.ok(archivos.length > 20, `se enumeraron muy pocos archivos: ${archivos.length}`);
  const hallados = [];
  for (const f of archivos) {
    const src = codigo(f);
    for (const p of prohibidos) if (p.test(src)) hallados.push(`${f} → ${p}`);
  }
  assert.deepEqual(hallados, [], "Finanzas tiene una cuenta de transferencias propia:\n  " + hallados.join("\n  "));
  // Y la única puerta que usa es la de Transferencias.
  assert.match(codigo("app/api/finanzas/tablero/route.js"), /from "@\/lib\/transferencias\/cuentaDelPeriodoServer"/);
});

test("F10/F11 · la cuenta de recepción no lee caja, ni ventas, ni pagos, ni los Libros", () => {
  for (const f of ["lib/transferencias/cuentaDelPeriodoServer.js", "lib/finanzas/pagoADeposito.js"]) {
    const src = codigo(f);
    for (const p of [/cajaMovimiento/i, /\bventa\b|venta\.|ventaPago/i, /pagoProveedor|pagoGasto/i, /movimientoStock|costoBaseVersion|costoUbicacionVersion/i, /motivo/]) {
      assert.doesNotMatch(src, p, `${f} lee ${p}: el pago a depósito sale solo de la transferencia`);
    }
  }
});

test("F10/F11 · en la ruta, el pago a depósito no se arma con ventas ni con movimientos", () => {
  const ruta = codigo("app/api/finanzas/tablero/route.js");
  const desde = ruta.indexOf("const consultadoEsDeposito");
  const hasta = ruta.indexOf("const resumen = resumenDelPeriodo(");
  assert.ok(desde > 0 && hasta > desde, "no se encontró el bloque del pago a depósito");
  const bloque = ruta.slice(desde, hasta);
  for (const p of [/\bventas\b/, /movimientos/, /clasificados/, /arqueo/i, /retiro/i]) {
    assert.doesNotMatch(bloque, p, `el pago a depósito se arma con ${p}`);
  }
  // Y la venta interna sigue afuera de las ventas, por el filtro de siempre.
  assert.match(ruta, /whereVentaComercial\(\{\s*localId,\s*fecha:/);
});

// ── 3 · LA CAJA NO VUELVE A PAGAR LA MERCADERÍA ─────────────────────────────

test("F12/F13 · ni la recaudación ni un retiro manual tocan el pago a depósito, y el motivo no decide", () => {
  const movimientos = [
    { id: 1, tipo: "RETIRO", monto: "300000.00", motivo: "Retiro de recaudación" },
    // Un retiro manual con el texto que más tentaría a "reconocerlo".
    { id: 2, tipo: "RETIRO", monto: "485300.00", motivo: "Pago a depósito transferencia" },
  ];
  const clasificados = clasificarMovimientos(movimientos, { idsDeRecaudacion: new Set([1]) });
  assert.equal(clasificados[0].clase, CLASE_MOVIMIENTO.RECAUDACION);
  assert.equal(clasificados[1].clase, CLASE_MOVIMIENTO.MANUAL, "el motivo decidió la clase");

  const pago = armarPagoADeposito({ esDeposito: false, cuenta: CUENTA });
  const r = resumenDelPeriodo({
    ventas: [],
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
    pagoADeposito: pago,
  });
  // El pago viaja idéntico: ningún movimiento lo cambió.
  assert.deepEqual(r.pagoADeposito, pago);
  // Y cada retiro queda en su renglón de caja, sin restarse contra el pago.
  assert.equal(r.caja.retiros, 485300);
  assert.equal(r.caja.retirosDeRecaudacion, 300000);
  // No hay un "resto" que reste el pago, la recaudación o los manuales.
  for (const prohibido of ["resto", "restante", "flujo", "flujoComercial", "disponible", "saldo"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(r, prohibido), false, `el resumen expone "${prohibido}"`);
  }
});

test("F12b · `resumenDelPeriodo` no recalcula el pago a depósito: lo pasa tal cual", () => {
  const src = codigo("lib/finanzas/resumenFinanciero.js");
  assert.match(src, /\n\s*pagoADeposito,\n/, "el resumen no pasa el pago tal cual");
  assert.doesNotMatch(src, /pagoADeposito\.(total|pendientes)/, "el resumen opera con el pago");
  // Sin pago, el resumen sigue como antes: los consumidores actuales no cambian.
  assert.equal(resumenDelPeriodo({}).pagoADeposito, null);
});

// ── 4 · EL "VER" ────────────────────────────────────────────────────────────

test("F16 · el Ver desde el depósito abre la cuenta de ESE local con unidad, desplazamiento y criterio", () => {
  const url = enlaceDePagoADeposito({ puedeVerTransferencias: true, unidad: UNIDADES.MES, desplazamiento: -2, localDelEnlace: 4 });
  assert.ok(url.startsWith(`${RUTA_LOCAL}/4?`), url);
  const ctx = parseContextoDelTablero(new URLSearchParams(url.split("?")[1]));
  assert.deepEqual(ctx, { unidad: UNIDADES.MES, desp: -2, local: null, criterio: CRITERIO_CUENTA.RECEPCION, vista: VISTA_CUENTA });
});

test("F16b · el Ver desde el local abre SU cuenta, y el período en curso viaja escrito", () => {
  // Finanzas abre en 0 y Transferencias en −1: el 0 tiene que escribirse.
  const url = enlaceDePagoADeposito({ puedeVerTransferencias: true, unidad: UNIDADES.SEMANA, desplazamiento: 0, localDelEnlace: null });
  assert.equal(url, `${RUTA_CUENTA}?desp=0&criterio=RECEPCION`);
  // Y el −1 de Finanzas viaja como ausencia, que allá es −1.
  const cerrado = enlaceDePagoADeposito({ puedeVerTransferencias: true, unidad: UNIDADES.SEMANA, desplazamiento: -1 });
  assert.equal(parseContextoDelTablero(new URLSearchParams(cerrado.split("?")[1])).desp, -1);
});

test("F16c · sin `transferencias.ver` no hay enlace, pero el importe sigue viajando", () => {
  assert.equal(enlaceDePagoADeposito({ puedeVerTransferencias: false, unidad: UNIDADES.SEMANA, desplazamiento: 0 }), null);
  const p = armarPagoADeposito({ esDeposito: false, cuenta: CUENTA, verDetalle: null });
  assert.equal(p.total, 485300);
  assert.equal(p.verDetalle, null);
  assert.equal(PERMISO_VER_TRANSFERENCIAS, "transferencias.ver");

  // La ruta pide el permiso de Transferencias SOLO para el enlace: el resumen
  // sigue exigiendo `finanzas.ver` y nada más.
  const ruta = codigo("app/api/finanzas/tablero/route.js");
  assert.match(ruta, /puedeVerTransferencias: checkPerm\(session, PERMISO_VER_TRANSFERENCIAS\)\.ok/);
  assert.match(ruta, /checkPerm\(session, "finanzas\.ver"\)/);
  assert.doesNotMatch(ruta, /checkPerm\(session, PERMISO_VER_TRANSFERENCIAS\);/, "el permiso de Transferencias corta el resumen");
  // Y el enlace al depósito sale solo cuando quien mira es el depósito.
  assert.match(ruta, /localDelEnlace: esDeposito \? localId : null/);
});

// ── 5 · EL MISMO PERÍODO EN LOS DOS MÓDULOS ─────────────────────────────────

test("F17 · para la misma unidad, desplazamiento y local, Finanzas y Transferencias miden el MISMO rango", () => {
  // Es la cuenta que hace la ruta de Transferencias con su local: el corte de la
  // ubicación y, en semana, la semana de su historia.
  const comoTransferencias = ({ unidad, desplazamiento, vigencias, hoy }) =>
    rangoDesplazado({
      unidad,
      diaDeCorte: corteDeUbicacion(vigencias, hoy).diaDeCorte,
      hoy,
      desplazamiento,
      rangoDeFecha: unidad === UNIDADES.SEMANA ? rangoSemanalDeUbicacion(vigencias) : null,
    });
  const VIGENCIAS = [
    [],
    [{ diaDeCorte: 3, vigenteDesde: null }],
    // Un local que cambió de corte: la semana de la transición es larga.
    [
      { diaDeCorte: 0, vigenteDesde: null },
      { diaDeCorte: 3, vigenteDesde: "2026-09-23" },
    ],
  ];
  let casos = 0;
  for (const vigencias of VIGENCIAS) {
    for (const unidad of Object.values(UNIDADES)) {
      for (const desplazamiento of [0, -1, -2, -5]) {
        for (const hoy of ["2026-09-16", "2026-09-27", "2026-10-01"]) {
          assert.deepEqual(
            rangoFinanciero({ unidad, desplazamiento, vigencias, hoy }),
            comoTransferencias({ unidad, desplazamiento, vigencias, hoy }),
            `${unidad} ${desplazamiento} ${hoy} ${JSON.stringify(vigencias)}`
          );
          casos += 1;
        }
      }
    }
  }
  assert.equal(casos, 108);
  assert.equal(DESPLAZAMIENTO_MINIMO, -120, "el tope de Finanzas cambió: el de Transferencias es −120");
});

test("F17b · las dos rutas leen la cuenta de recepción con la misma función y su propio rango", () => {
  const transferencias = codigo("app/api/transferencias/tablero/route.js");
  assert.match(transferencias, /leerCuentaPorRecepcion\(prisma, \{ destinoId: localPedido, rango: periodoMirado \}\)/);
  assert.match(transferencias, /rangoDesplazado\(\{ unidad, diaDeCorte: corteDelLocal, hoy, desplazamiento, rangoDeFecha \}\)/);
  const servidor = codigo("lib/transferencias/cuentaDelPeriodoServer.js");
  const resumen = servidor.slice(servidor.indexOf("export async function resumenDePagoADeposito"));
  assert.match(resumen.slice(0, 300), /leerCuentaPorRecepcion\(db, \{ destinoId, rango \}\)/);
  const finanzas = codigo("app/api/finanzas/tablero/route.js");
  assert.match(finanzas, /const rango = rangoFinanciero\(\{ unidad, desplazamiento, vigencias \}\)/);
});

// ── 6 · LA PANTALLA ─────────────────────────────────────────────────────────

const html = (resumen) =>
  renderToStaticMarkup(
    React.createElement(ResumenDelPeriodo, {
      resumen: { ...resumenDelPeriodo({ ventas: [] }), ...resumen },
      descripcion: null,
    })
  );

test("F18b · la pantalla dibuja el pago y las pendientes ATENUADAS, con su nota", () => {
  const salida = html({ pagoADeposito: armarPagoADeposito({ esDeposito: false, cuenta: CUENTA, verDetalle: "/modulos/transferencias/cuenta?desp=0&criterio=RECEPCION" }) });
  assert.ok(salida.includes("PAGO A DEPÓSITO"));
  assert.ok(salida.includes("Pago a depósito"));
  assert.ok(salida.includes("7 transferencias recibidas en el período"));
  assert.ok(salida.includes("Pendiente de recepción"));
  // Y dice de CUÁNDO es: estado de hoy de lo que salió hasta el cierre, no una
  // foto de aquel período.
  assert.ok(
    salida.includes(
      "3 transferencias · Salieron hasta el cierre del período y hoy siguen sin confirmar. Se informa y no se descuenta."
    )
  );
  // El renglón de las pendientes va con el tono atenuado, no con el de un importe.
  const desdePendiente = salida.slice(salida.indexOf("Pendiente de recepción") - 200);
  assert.match(desdePendiente.slice(0, 700), /sunmi-text-muted[^"]*">Pendiente de recepción/);
  assert.match(desdePendiente.slice(0, 900), /font-medium tabular-nums sunmi-text-muted/);
  // Y el Ver lleva al módulo real.
  assert.ok(salida.includes('href="/modulos/transferencias/cuenta?desp=0&amp;criterio=RECEPCION"'));
});

test("F16d · sin enlace no se dibuja el Ver, y el importe sigue", () => {
  const salida = html({ pagoADeposito: armarPagoADeposito({ esDeposito: false, cuenta: CUENTA, verDetalle: null }) });
  assert.ok(salida.includes("Pago a depósito"));
  assert.ok(!salida.includes("/modulos/transferencias"), "dibujó una puerta a un módulo que no puede abrir");
  assert.ok(!salida.includes("Ver ›"));
});

test("F15b · para el depósito el bloque no existe: ni en cero", () => {
  const salida = html({ pagoADeposito: armarPagoADeposito({ esDeposito: true }) });
  assert.ok(!salida.includes("PAGO A DEPÓSITO"));
  assert.ok(!salida.includes("Pendiente de recepción"));
  // Y sin el campo —un consumidor viejo—, tampoco.
  assert.ok(!html({ pagoADeposito: undefined }).includes("PAGO A DEPÓSITO"));
});

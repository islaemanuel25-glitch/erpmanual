// CANDADO: LA LISTA DE PAGOS A PROVEEDORES, CON LA ESTRUCTURA DE TRANSFERENCIAS.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/pagos/listaCuentasPorPagar.test.mjs
//
// Dónde cae cada cuenta está probado en `lib/finanzas/calendarioDePagos.test.mjs`.
// Acá se afirma que llega a la pantalla, y que la pantalla está armada con las
// MISMAS piezas que Transferencias —no con unas parecidas al lado—, incluidas
// las dos que se sacaron de allá.
//
// ── LA CUENTA NO SE ESCRIBE A MANO ────────────────────────────────────────
//
// Importes y estado salen de `estadoDeCuenta`, que es lo que usa
// `serializarCuenta`; los nombres de los campos, del mismo molde que el candado
// de la librería comprueba contra el fuente de la ruta.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FilaCuentaPorPagar from "./FilaCuentaPorPagar.jsx";
import ResumenDeCuentasPorPagar from "./ResumenDeCuentasPorPagar.jsx";
import {
  FILTRO_CUENTAS,
  ROTULO_ESTADO_CUENTA,
  diaEnQueSeSaldo,
  estadoDeCuenta,
} from "@/lib/finanzas/pagosProveedores";
import { calendarioDeCuentas, descripcionDePagos } from "@/lib/finanzas/calendarioDePagos";

const html = (el) => renderToStaticMarkup(el);
const HOY = "2026-09-16";

/** El código sin comentarios: un candado que busca texto no tiene que encontrar prosa. */
function codigo(ruta) {
  return fs
    .readFileSync(new URL(ruta, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\}/g, "")
    .replace(/\/\/[^\n]*/g, "");
}

function cuenta({ total, pagos = [], vence = null }) {
  const e = estadoDeCuenta({ total, pagos });
  return {
    id: 11,
    pedidoProveedorId: 248,
    proveedor: { id: 7, nombre: "Als" },
    factura: "0001-00012345",
    localGasto: { id: 2, nombre: "Local Centro" },
    ...e,
    rotuloEstado: ROTULO_ESTADO_CUENTA[e.estado],
    vencimientoProveedor: vence,
    createdAt: new Date("2026-09-14T10:00:00-03:00").toISOString(),
    saldadaEl: diaEnQueSeSaldo({ total, pagos }),
  };
}

const fila = (c, filtro, extra = {}) =>
  html(React.createElement(FilaCuentaPorPagar, { cuenta: c, filtro, hoy: HOY, onAbrir: () => {}, ...extra }));

// ── LA FILA ───────────────────────────────────────────────────────────────

test("la fila: «Compra #248 · Als», estado y vencimiento, y UNA cifra a la derecha", () => {
  const c = cuenta({ total: 485300, pagos: [{ id: 1, monto: 300000, fecha: new Date() }], vence: "2026-09-18" });
  const s = fila(c, FILTRO_CUENTAS.PENDIENTES);
  assert.ok(s.includes(">Compra #248<"));
  assert.ok(s.includes(">· Als<"), "el proveedor es de la fila");
  assert.ok(s.includes(">Parcial · Vence 18/09/2026<"));
  assert.ok(s.includes(">$185.300,00<"), "en Pendientes la cifra es el saldo");
  assert.ok(!s.includes("$485.300,00") && !s.includes("$300.000,00"), "volvieron a amontonarse los importes");
  assert.ok(s.includes(">Ver ›<"));
  assert.ok(!s.includes("Local Centro"), "con una sola ubicación no se repite");
});

test("en Pagados y en Todos la cifra es el total", () => {
  const pagada = cuenta({ total: 30500, pagos: [{ id: 1, monto: 30500, fecha: new Date("2026-09-15T10:00:00-03:00") }] });
  assert.ok(fila(pagada, FILTRO_CUENTAS.PAGADAS).includes(">$30.500,00<"));
  const parcial = cuenta({ total: 1000, pagos: [{ id: 1, monto: 400, fecha: new Date() }] });
  assert.ok(fila(parcial, FILTRO_CUENTAS.TODAS).includes(">$1.000,00<"));
});

// ── EN PAGADOS, UNA CUENTA SALDADA DICE "PAGADA" Y NADA MÁS ──────────────
//
// Antes este candado afirmaba "Pagada · Vence Sin fecha": un vencimiento sobre
// una deuda que ya no existe. Se cambió a propósito el 2026-09-24, y solo en
// Pagados: Pendientes y Todos siguen mostrando el vencimiento.

/** La línea de abajo de la fila, entera: la que va después del número de compra. */
const lineaDeEstado = (html) => html.match(/<div class="text-sm2 sunmi-text-(?:muted|warning)">([^<]*)<\/div>/)[1];

test("en Pagados, una cuenta saldada dice solo «Pagada», tenga o no vencimiento", () => {
  const pagos = [{ id: 1, monto: 30500, fecha: new Date("2026-09-15T10:00:00-03:00") }];
  for (const vence of [null, "2026-09-10", "2026-10-15"]) {
    const s = fila(cuenta({ total: 30500, pagos, vence }), FILTRO_CUENTAS.PAGADAS);
    assert.equal(lineaDeEstado(s), "Pagada", `con vencimiento ${vence}`);
    assert.doesNotMatch(s, /Vence|Venció|Sin fecha|Sin vencimiento/, `con vencimiento ${vence}`);
  }
});

test("Pendientes y Todos siguen diciendo el vencimiento, como antes", () => {
  const pendiente = cuenta({ total: 100, vence: "2026-09-18" });
  assert.equal(lineaDeEstado(fila(pendiente, FILTRO_CUENTAS.PENDIENTES)), "Pendiente · Vence 18/09/2026");
  const sinFecha = cuenta({ total: 100 });
  assert.equal(lineaDeEstado(fila(sinFecha, FILTRO_CUENTAS.PENDIENTES)), "Pendiente · Vence Sin fecha");
  // En Todos no se tocó nada, tampoco para una pagada.
  const pagada = cuenta({ total: 100, pagos: [{ id: 1, monto: 100, fecha: new Date("2026-09-15T10:00:00-03:00") }] });
  assert.equal(lineaDeEstado(fila(pagada, FILTRO_CUENTAS.TODAS)), "Pagada · Vence Sin fecha");
});

test("una vencida lo dice en tono de aviso", () => {
  const s = fila(cuenta({ total: 100, vence: "2026-09-10" }), FILTRO_CUENTAS.PENDIENTES);
  assert.match(s, /class="text-sm2 sunmi-text-warning">Pendiente · Venció 10\/09\/2026</);
});

test("con varias ubicaciones, la fila dice de cuál es el gasto", () => {
  const s = fila(cuenta({ total: 100 }), FILTRO_CUENTAS.PENDIENTES, { variasUbicaciones: true });
  assert.ok(s.includes(">· Local Centro<"));
});

test("la fila entera es el botón, como una transferencia recibida", () => {
  const s = fila(cuenta({ total: 100 }), FILTRO_CUENTAS.PENDIENTES);
  assert.ok(s.startsWith("<button"), "la fila no es tocable entera");
  assert.equal((s.match(/<button/g) || []).length, 1, "dos destinos en la misma fila");
  assert.ok(s.includes('aria-label="Abrir la cuenta de Als, compra #248"'));
});

// ── EL RESUMEN ────────────────────────────────────────────────────────────

function resumen(cuentas, filtro) {
  const descripcion = descripcionDePagos({ unidad: "SEMANA", desplazamiento: 0, filtro, hoy: HOY });
  const calendario = calendarioDeCuentas({ cuentas, filtro, rango: descripcion.rango, hoy: HOY });
  return html(React.createElement(ResumenDeCuentasPorPagar, { filtro, descripcion, calendario }));
}

test("el resumen de Pendientes suma lo que vence en el período y avisa las vencidas aparte", () => {
  const s = resumen(
    [cuenta({ total: 1000, vence: "2026-09-18" }), cuenta({ total: 250, vence: "2026-09-01" })],
    FILTRO_CUENTAS.PENDIENTES
  );
  assert.ok(s.includes(">Vence en el período<"));
  assert.ok(s.includes(">$1.000,00<"), "la vencida no es del período y no suma");
  assert.ok(s.includes("Semana en curso"));
  assert.ok(s.includes("1 cuenta vencida por $250,00."));
  assert.ok(s.includes("border-1.5 sunmi-border-warning"), "el aviso enciende el borde");
});

test("sin vencidas no hay aviso ni borde de aviso; sin nada en el período, lo dice", () => {
  const s = resumen([], FILTRO_CUENTAS.PENDIENTES);
  assert.ok(s.includes(">$0,00<"));
  assert.ok(s.includes("No vence ninguna cuenta en este período."));
  assert.ok(!s.includes("sunmi-border-warning"));
});

test("el resumen de Pagados suma lo que se terminó de pagar en el período", () => {
  const pagada = cuenta({ total: 30500, pagos: [{ id: 1, monto: 30500, fecha: new Date("2026-09-15T10:00:00-03:00") }] });
  const s = resumen([pagada], FILTRO_CUENTAS.PAGADAS);
  assert.ok(s.includes(">Pagado en el período<"));
  assert.ok(s.includes(">$30.500,00<"));
});

// ── LA PANTALLA ───────────────────────────────────────────────────────────

test("la lista usa las mismas piezas que Transferencias, en el mismo orden", () => {
  const src = codigo("./ListaCuentasPorPagar.jsx");
  const orden = [
    "<ChipsDePeriodo",
    "<NavegadorDePeriodo",
    "<SunmiSelectorDeOpciones",
    "<ResumenDeCuentasPorPagar",
    "<SunmiInput",
    "<DiaConBanda",
  ].map((pieza) => {
    const i = src.indexOf(pieza);
    assert.ok(i > -1, `falta ${pieza}`);
    return i;
  });
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, "las piezas no están en el orden de Transferencias");
  assert.ok(!src.includes("cuentasPorProveedor"), "volvió la agrupación por proveedor");
  assert.ok(src.includes("deshabilitadas={CHIPS_APAGADOS}"), "«Otro» tiene que estar apagado como en Finanzas");
  // Vencidas arriba, los días, Sin fecha abajo.
  assert.match(src, /\[visibles\.vencidas, \.\.\.visibles\.dias, visibles\.sinFecha\]/);
  // El buscador solo con filas, como en Transferencias.
  assert.match(src, /hayFilas && \(\s*<SunmiInput/);
});

test("la fila y el resumen están hechos con las piezas sacadas de Transferencias", () => {
  assert.ok(codigo("./FilaCuentaPorPagar.jsx").includes("<FilaConImporte"));
  assert.ok(codigo("./ResumenDeCuentasPorPagar.jsx").includes("<ResumenConImporte"));
  // Y Transferencias sigue dibujando con ellas: si una se copiara de vuelta
  // adentro, las dos pantallas se separarían en silencio.
  assert.ok(codigo("../../transferencias/DiaDeTransferencias.jsx").includes("<FilaConImporte"));
  assert.ok(codigo("../../transferencias/CuentaDelPeriodoCerrado.jsx").includes("<ResumenConImporte"));
});

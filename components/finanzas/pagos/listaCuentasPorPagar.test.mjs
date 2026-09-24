// CANDADO: LA LISTA DE PAGOS A PROVEEDORES, CON EL PATRÓN DE TRANSFERENCIAS.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/pagos/listaCuentasPorPagar.test.mjs
//
// Las sumas y los grupos están probados en `lib/finanzas/pagosProveedores.test.mjs`.
// Acá se afirma que llegan a la pantalla: qué dice una fila, qué dice el bloque
// de arriba, y que la lista está armada con las piezas de transferencias y no
// con unas parecidas al lado.
//
// ── LA CUENTA NO SE ESCRIBE A MANO ────────────────────────────────────────
//
// Los importes y el estado salen de `estadoDeCuenta`, que es lo que usa
// `serializarCuenta`; los nombres de los campos, del mismo molde que el candado
// de la librería comprueba contra el fuente de la ruta. Una cuenta "Parcial"
// con un saldo que la regla no daría no puede existir en este archivo.

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
  estadoDeCuenta,
  resumenDeCuentas,
} from "@/lib/finanzas/pagosProveedores";

const html = (el) => renderToStaticMarkup(el);

/** El código sin comentarios: un candado que busca texto no tiene que encontrar prosa. */
function codigo(ruta) {
  return fs
    .readFileSync(new URL(ruta, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\}/g, "")
    .replace(/\/\/[^\n]*/g, "");
}

function cuenta({ total, pagos = [], factura = null, vence = null }) {
  const e = estadoDeCuenta({ total, pagos });
  return {
    id: 11,
    pedidoProveedorId: 245,
    proveedor: { id: 7, nombre: "Proveedor A" },
    factura,
    localGasto: { id: 2, nombre: "Local Centro" },
    ...e,
    rotuloEstado: ROTULO_ESTADO_CUENTA[e.estado],
    vencimientoProveedor: vence,
  };
}

test("la fila dice compra, factura, estado, vencimiento, ubicación, total, pagado y saldo", () => {
  const c = cuenta({ total: 485300, pagos: [{ monto: 300000 }], factura: "0001-00012345", vence: "2026-10-15" });
  const s = html(React.createElement(FilaCuentaPorPagar, { cuenta: c }));
  assert.ok(s.includes(">Compra #245<"), "falta la compra");
  assert.ok(s.includes("Factura 0001-00012345"), "falta la factura");
  assert.ok(s.includes(">Parcial<"), "falta el estado en palabras");
  assert.ok(s.includes("Vence 15/10/2026"), "el vencimiento no es el día de la base");
  assert.ok(s.includes(">Local Centro<"), "falta la ubicación del gasto");
  assert.ok(s.includes("Total $485.300,00 · Pagado $300.000,00"), "faltan total y pagado");
  assert.ok(s.includes(">$185.300,00<"), "falta el saldo");
  assert.ok(s.includes(">Ver ›<"), "falta la señal de que la fila se abre");
});

test("la fila entera es el botón, como la transferencia recibida", () => {
  const s = html(React.createElement(FilaCuentaPorPagar, { cuenta: cuenta({ total: 100 }) }));
  assert.ok(s.startsWith("<button"), "la fila no es tocable entera");
  assert.equal((s.match(/<button/g) || []).length, 1, "dos destinos en la misma fila");
  assert.ok(s.includes('aria-label="Abrir la cuenta de Proveedor A, compra #245"'));
});

test("sin factura ni vencimiento, la fila no inventa ninguno", () => {
  const s = html(React.createElement(FilaCuentaPorPagar, { cuenta: cuenta({ total: 100 }) }));
  assert.ok(!s.includes("Factura"), "dibujó una factura que no hay");
  assert.ok(s.includes("Vence Sin fecha"), "el vencimiento ausente tiene que decirlo");
  assert.ok(s.includes(">Pendiente<"));
});

test("el bloque de arriba: saldo en Pendientes, lo pagado en Pagados", () => {
  const cuentas = [cuenta({ total: 485300, pagos: [{ monto: 300000 }] })];
  const pend = html(
    React.createElement(ResumenDeCuentasPorPagar, {
      filtro: FILTRO_CUENTAS.PENDIENTES,
      resumen: resumenDeCuentas(cuentas),
    }),
  );
  assert.ok(pend.includes(">Saldo pendiente<"));
  assert.ok(pend.includes(">$185.300,00<"));
  assert.ok(pend.includes("1 cuenta · 1 proveedor"));

  const pagada = [cuenta({ total: 1000, pagos: [{ monto: 1000 }] })];
  const pag = html(
    React.createElement(ResumenDeCuentasPorPagar, {
      filtro: FILTRO_CUENTAS.PAGADAS,
      resumen: resumenDeCuentas(pagada),
    }),
  );
  assert.ok(pag.includes(">Pagado<"));
  assert.ok(pag.includes(">$1.000,00<"), "en Pagados el número grande tiene que ser lo pagado");
});

test("sin cuentas, el bloque dice por qué está en cero", () => {
  const s = html(
    React.createElement(ResumenDeCuentasPorPagar, {
      filtro: FILTRO_CUENTAS.PENDIENTES,
      resumen: resumenDeCuentas([]),
      textoVacio: "No hay cuentas con saldo pendiente.",
    }),
  );
  assert.ok(s.includes(">$0,00<"));
  assert.ok(s.includes("No hay cuentas con saldo pendiente."));
});

test("la lista está armada con las piezas de transferencias, no con unas parecidas", () => {
  const src = codigo("./ListaCuentasPorPagar.jsx");
  assert.ok(src.includes("<SunmiSelectorDeOpciones"), "el filtro no es el selector de los chips de período");
  assert.ok(!src.includes("SunmiSolapas"), "volvieron las solapas");
  assert.ok(src.includes("<DiaConBanda"), "los grupos no usan la banda de transferencias");
  assert.ok(src.includes("cuentasPorProveedor("), "los grupos no salen de la librería");
  assert.ok(src.includes("resumenDeCuentas("), "el resumen no sale de la librería");
  // El buscador solo con filas, como en transferencias.
  assert.match(src, /cuentas\.length > 0 && \(\s*<SunmiInput/);
});

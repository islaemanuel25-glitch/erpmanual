// LA PANTALLA DE UN LOCAL EN EL CRITERIO DE RECEPCIÓN — LO QUE ABRE EL "VER".
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/cuentaPorRecepcion.test.mjs
//
// El "Ver" del Pago a depósito de Finanzas abre la cuenta del local con
// `criterio=RECEPCION`. Esta pantalla tiene que mostrar el MISMO número que
// Finanzas, las transferencias que lo forman agrupadas por el día en que se
// confirmaron, y las pendientes aparte, sin que parezcan parte del total.
//
// Las filas de `periodo` tienen la forma que la ruta manda (`resumir`), y el
// último candado lo comprueba leyendo la ruta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CuentaDelPeriodoCerrado from "./CuentaDelPeriodoCerrado.jsx";
import { diasDeTransferencias } from "@/lib/transferencias/diasDeTransferencias";
import { descripcionDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import { CRITERIO_CUENTA, fechaDeRecepcion } from "@/lib/transferencias/criterioDeCuenta";

const html = (el) => renderToStaticMarkup(el);
const money = (n) => `$ ${Number(n || 0).toFixed(2)}`;

const descripcion = descripcionDelPeriodo({
  unidad: UNIDADES.SEMANA,
  diaDeCorte: 0,
  hoy: "2026-09-23",
  desplazamiento: -1,
});

/** Una fila como la manda `resumir` en la ruta del tablero. */
const filaDeLaRuta = (id, envio, recepcion) => ({
  id,
  estado: "Recibida",
  fechaEnvio: envio,
  fechaRecepcion: recepcion,
  createdAt: envio,
  recibida: true,
  cantidadItems: 1,
  itemsRevisables: 1,
  itemsRevisados: 1,
  lineasConDiferencia: 0,
  importe: 93333.32,
});

test("R1 · por recepción: el rótulo es Pago a depósito, el importe es lo recibido y no hay aviso de total abierto", () => {
  const salida = html(
    React.createElement(CuentaDelPeriodoCerrado, {
      periodo: {
        criterio: CRITERIO_CUENTA.RECEPCION,
        cantidad: 7,
        aPagar: 485300,
        sinRecibir: 0,
        pendientes: { cantidad: 3, importe: 126400 },
        descripcion,
      },
      money,
    })
  );
  assert.ok(salida.includes("Pago a depósito"));
  assert.ok(salida.includes("$ 485300.00"));
  assert.ok(salida.includes("7 transferencias recibidas"));
  assert.ok(!salida.includes("sunmi-border-warning"), "un total que solo suma lo recibido no está abierto");
  // Las pendientes, atenuadas y con su nota.
  assert.match(salida, /sunmi-text-muted">Pendiente de recepción/);
  assert.match(salida, /tabular-nums sunmi-text-muted">\$ 126400\.00/);
  // La nota dice de CUÁNDO es el dato: estado de hoy, no foto del período.
  assert.ok(
    salida.includes(
      "3 transferencias · Salieron hasta el cierre del período y hoy siguen sin confirmar. Se informa y no se descuenta."
    )
  );
});

test("R2 · por recepción sin movimiento: la frase dice que no se confirmó nada, no que no se envió", () => {
  const salida = html(
    React.createElement(CuentaDelPeriodoCerrado, {
      periodo: {
        criterio: CRITERIO_CUENTA.RECEPCION,
        cantidad: 0,
        aPagar: 0,
        sinRecibir: 0,
        pendientes: { cantidad: 2, importe: 1000 },
        descripcion,
      },
      money,
    })
  );
  assert.ok(salida.includes("No confirmó ninguna recepción en ese período."));
  assert.ok(!salida.includes("No se le envió nada"));
  assert.ok(salida.includes("2 transferencias · Salieron hasta el cierre del período y hoy siguen sin confirmar"));
});

test("R3 · la cuenta de siempre no cambió: sin criterio no hay pendientes ni rótulo nuevo", () => {
  const salida = html(
    React.createElement(CuentaDelPeriodoCerrado, {
      periodo: { cantidad: 2, aPagar: 1000, sinRecibir: 1, descripcion },
      money,
    })
  );
  assert.ok(!salida.includes("Pago a depósito"));
  assert.ok(!salida.includes("Pendiente de recepción"));
  assert.ok(salida.includes(descripcion.rotuloDelImporte));
  assert.ok(salida.includes("sunmi-border-warning"), "con una sin recibir el total sigue abierto");
});

test("R4 · por recepción los días son los de la confirmación, no los del envío", () => {
  // Enviada el viernes 18 (semana anterior), confirmada el martes 22.
  const t = filaDeLaRuta(5, "2026-09-18T15:00:00.000Z", "2026-09-22T15:00:00.000Z");
  const porEnvio = diasDeTransferencias([t]);
  const porRecepcion = diasDeTransferencias([t], { fechaDe: fechaDeRecepcion });
  assert.equal(porEnvio[0].clave, "2026-09-18");
  assert.equal(porRecepcion[0].clave, "2026-09-22");
  assert.equal(porRecepcion[0].importe, 93333.32);
});

test("R5 · la ruta manda lo que esta pantalla lee en el criterio de recepción", () => {
  const ruta = readFileSync("app/api/transferencias/tablero/route.js", "utf8").replace(/\/\/[^\n]*/g, "");
  for (const campo of ["criterio", "pendientes", "fechaRecepcion", "aPagar", "cantidad", "sinRecibir", "descripcion"]) {
    assert.ok(new RegExp(`\\b${campo}\\b`).test(ruta), `la ruta no manda '${campo}'`);
  }
  // Y la pantalla agrupa las RECONOCIDAS por recepción solo en ese criterio. Las
  // pendientes no se confirmaron, así que se agrupan por envío —el default— y por
  // eso la condición pide además que NO sea la vista de pendientes.
  const pantalla = readFileSync("components/transferencias/CuentaDeUnLocal.jsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  assert.match(pantalla, /!esPendientes && periodo\?\.criterio === CRITERIO_CUENTA\.RECEPCION/);
  assert.match(pantalla, /\{ fechaDe: fechaDeRecepcion \}/);
});

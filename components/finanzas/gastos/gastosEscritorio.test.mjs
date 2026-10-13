// CANDADO: GASTOS EN ESCRITORIO — LA TABLA Y LA FRANJA DE TOTALES.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/gastos/gastosEscritorio.test.mjs
//
// El celular está en `gastosMobile.test.mjs`. Acá, lo que dibuja el molde de
// Finanzas desde `md` (Figma EVJ2KvVCrY0oVSowfboymQ, 378:1583).
//
// ── DE DÓNDE SALEN LOS DATOS ─────────────────────────────────────────────
//
// Los gastos tienen la forma de `serializarGasto` —la misma que usa
// `gastosMobile.test.mjs`, con el estado que calcula `estadoDeCuenta`— y los
// grupos de la tabla salen de `calendarioDeGastos`, la función que usa la
// pantalla. Nada de grupos escritos a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TablaGastos from "./TablaGastos.jsx";
import { totalesDeGastos } from "./ResumenDeGastos.jsx";
import { FILTRO_CUENTAS, estadoDeCuenta } from "@/lib/finanzas/pagosProveedores";
import { VACIO_DE_LA_LISTA, calendarioDeGastos } from "@/lib/finanzas/calendarioDeGastos";

const HOY = "2026-09-29";

/** Con la forma de `serializarGasto`: importes y estado de `estadoDeCuenta`. */
function gasto({ id = 31, total = 45800, pagado = 0, vencimiento = null, fecha = "2026-09-29", concepto = "Internet Fibra" } = {}) {
  return {
    id,
    concepto,
    categoria: { id: 1, nombre: "Servicios", activa: true },
    local: { id: 2, nombre: "Casiano Casas" },
    beneficiario: "Telecom Argentina",
    comprobanteNumero: "FC 0004-2841",
    fecha,
    vencimiento,
    fechaPrevistaPago: null,
    ...estadoDeCuenta({ total, pagos: pagado ? [{ monto: pagado }] : [] }),
  };
}

function gruposDe(cal) {
  return [cal.anteriores, ...cal.dias].filter(Boolean);
}

const tabla = (props) =>
  renderToStaticMarkup(
    React.createElement(TablaGastos, { filtro: FILTRO_CUENTAS.PENDIENTES, hoy: HOY, onAbrir: () => {}, ...props })
  );
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("la tabla: encabezados, una fila por día con su cuenta y una fila por gasto", () => {
  const cal = calendarioDeGastos({
    gastos: [gasto({ pagado: 20000, vencimiento: "2026-09-20" }), gasto({ id: 32, concepto: "Luz", total: 12000, vencimiento: "2026-10-05" })],
    anteriores: [gasto({ id: 99, concepto: "Alquiler agosto", total: 96400, fecha: "2026-08-20" })],
    filtro: FILTRO_CUENTAS.PENDIENTES,
  });
  const html = tabla({ grupos: gruposDe(cal) });
  const t = texto(html);

  for (const h of ["Concepto", "Beneficiario", "Categoría", "Estado", "Vence", "Saldo"]) {
    assert.match(html, new RegExp(`<th[^>]*>${h}</th>`), `falta la columna ${h}`);
  }
  // Las filas de grupo: fondo suave, título a la izquierda, "N gastos · $" a la derecha.
  const grupos = html.match(/<tr[^>]*sunmi-surface-soft[^>]*>[\s\S]*?<\/tr>/g) || [];
  assert.equal(grupos.length, 2, "un grupo de anteriores y uno del día");
  assert.match(texto(grupos[0]), /^Anteriores con saldo .*1 gasto · \$96\.400,00$/);
  assert.match(texto(grupos[1]), /2 gastos · \$37\.800,00$/);
  // Una fila por gasto, con el saldo en Pendientes.
  assert.equal((t.match(/Ver ›/g) || []).length, 3);
  assert.match(t, /Internet Fibra Telecom Argentina Servicios Parcial Venció 20\/09\/2026 \$25\.800,00 Ver ›/);
  assert.match(t, /Luz Telecom Argentina Servicios Pendiente 05\/10\/2026 \$12\.000,00 Ver ›/);
});

test("vencido en rojo, parcial en advertencia, sin vencimiento una raya", () => {
  const cal = calendarioDeGastos({ gastos: [gasto({ pagado: 20000, vencimiento: "2026-09-20" }), gasto({ id: 33 })], filtro: FILTRO_CUENTAS.PENDIENTES });
  const html = tabla({ grupos: gruposDe(cal) });
  assert.match(html, /<span class="sunmi-text-danger">Venció 20\/09\/2026<\/span>/);
  assert.match(html, /<span class="sunmi-text-warning">Parcial<\/span>/);
  assert.match(html, /<span class="sunmi-text-muted">—<\/span>/);
});

test("un período sin gastos es UNA fila con el mensaje del celular, no un hueco", () => {
  const vacia = tabla({ grupos: [], vacio: VACIO_DE_LA_LISTA.PERIODO });
  assert.equal((vacia.match(/<tr/g) || []).length, 2, "el encabezado y una sola fila");
  assert.match(texto(vacia), /No hay gastos con saldo en este período\./);
  assert.match(texto(tabla({ grupos: [], vacio: VACIO_DE_LA_LISTA.PERIODO, filtro: FILTRO_CUENTAS.PAGADAS })), /No hay gastos pagados en este período\./);
  assert.match(texto(tabla({ grupos: [], vacio: VACIO_DE_LA_LISTA.BUSQUEDA })), /Ningún gasto coincide con la búsqueda\./);
});

test("los totales: el saldo del período y el de anteriores, que nunca se suman", () => {
  const cal = calendarioDeGastos({
    gastos: [gasto({ total: 1000 })],
    anteriores: [gasto({ id: 99, total: 96400, fecha: "2026-08-20" })],
    filtro: FILTRO_CUENTAS.PENDIENTES,
  });
  const [periodo, anteriores] = totalesDeGastos({ filtro: FILTRO_CUENTAS.PENDIENTES, calendario: cal });
  assert.deepEqual(
    { rotulo: periodo.rotulo, valor: periodo.valor, nota: periodo.nota },
    { rotulo: "Saldo de gastos del período", valor: "$1.000,00", nota: "1 gasto" }
  );
  assert.deepEqual(
    { rotulo: anteriores.rotulo, valor: anteriores.valor, nota: anteriores.nota, tono: anteriores.tono },
    { rotulo: "Saldo de períodos anteriores", valor: "$96.400,00", nota: "1 gasto", tono: "advertencia" }
  );
  // Sin saldo anterior la parte sigue: $0,00, sin color de advertencia.
  const [, sinAnteriores] = totalesDeGastos({ filtro: FILTRO_CUENTAS.PENDIENTES, calendario: calendarioDeGastos({ filtro: FILTRO_CUENTAS.PENDIENTES }) });
  assert.equal(sinAnteriores.valor, "$0,00");
  assert.equal(sinAnteriores.tono, undefined);
});

// CANDADO: EL CALENDARIO DE GASTOS Y LO QUE LA LISTA LE PIDE A LA API.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/calendarioDeGastos.test.mjs
//
// Lo que la API hace con estos pedidos —el estado en SQL, la página, el
// alcance— lo ejerce `scripts/pruebas-db/gastosApi.mjs`. Acá se afirma lo que
// decide la pantalla: qué se pide, dónde cae cada gasto, que un gasto no se
// repita, que la lista avise cuando no está entera, y que el contexto sobreviva
// a entrar a un gasto y volver.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GASTOS_POR_CONSULTA,
  ROTULO_ESTADO_GASTO,
  calendarioDeGastos,
  consultaDeAnteriores,
  consultaDelPeriodo,
  gastoCoincideConBusqueda,
  respuestaIncompleta,
  rotuloDeGastos,
} from "@/lib/finanzas/calendarioDeGastos";
import { FILTRO_CUENTAS, estadoDeCuenta } from "@/lib/finanzas/pagosProveedores";
import { totalDelPeriodo } from "@/lib/finanzas/calendarioDePagos";
import { PAGE_SIZE_MAX } from "@/lib/turnos/filtrosListado";
import {
  RUTA_GASTOS,
  parseContextoGastos,
  serializarContextoGastos,
  urlDeGasto,
  urlDeGastos,
} from "@/lib/finanzas/contextoFinanzas";

const RANGO = { desde: "2026-09-27", hasta: "2026-10-03" };
const leer = (qs) => Object.fromEntries(new URLSearchParams(qs));

/** Un gasto con la forma de `serializarGasto`: los importes salen de `estadoDeCuenta`. */
function gasto(id, { fecha, total = 1000, pagado = 0, concepto = "Luz", beneficiario = null, comprobanteNumero = null } = {}) {
  return { id, fecha, concepto, beneficiario, comprobanteNumero, ...estadoDeCuenta({ total, pagos: pagado ? [{ monto: pagado }] : [] }) };
}

// ── LAS CONSULTAS ───────────────────────────────────────────────────────

test("el período se pide por la FECHA DEL GASTO: fechaDesde y fechaHasta son el rango del período", () => {
  const q = leer(consultaDelPeriodo({ filtro: FILTRO_CUENTAS.PENDIENTES, rango: RANGO, categoriaId: 4 }));
  assert.deepEqual(q, { estado: "PENDIENTES", fechaDesde: "2026-09-27", fechaHasta: "2026-10-03", categoriaId: "4", pageSize: "200" });
  // Nada de vencimientos: la API filtra `fecha`, y la pantalla le pide eso.
  assert.ok(!Object.keys(q).some((k) => /venc|prevista/i.test(k)));
});

test("se pide el máximo que acepta la API, no el default", () => {
  assert.equal(GASTOS_POR_CONSULTA, PAGE_SIZE_MAX);
  assert.equal(GASTOS_POR_CONSULTA, 200);
});

test("Anteriores con saldo: solo en Pendientes, con fechaHasta el día ANTES del comienzo del período", () => {
  const q = leer(consultaDeAnteriores({ filtro: FILTRO_CUENTAS.PENDIENTES, rango: RANGO, categoriaId: 4 }));
  assert.deepEqual(q, { estado: "PENDIENTES", fechaHasta: "2026-09-26", categoriaId: "4", pageSize: "200" });
  assert.equal(q.fechaDesde, undefined, "los anteriores no tienen piso");
  assert.equal(consultaDeAnteriores({ filtro: FILTRO_CUENTAS.PAGADAS, rango: RANGO }), null);
  assert.equal(consultaDeAnteriores({ filtro: FILTRO_CUENTAS.TODAS, rango: RANGO }), null);
  // El borde de mes: el día antes del 1 es el último del mes anterior.
  assert.equal(leer(consultaDeAnteriores({ filtro: FILTRO_CUENTAS.PENDIENTES, rango: { desde: "2026-10-01", hasta: "2026-10-31" } })).fechaHasta, "2026-09-30");
});

test("la lista está incompleta cuando el total dice que hay más de los que llegaron", () => {
  assert.equal(respuestaIncompleta({ gastos: new Array(200).fill({}), paginacion: { total: 201 } }), true);
  assert.equal(respuestaIncompleta({ gastos: new Array(200).fill({}), paginacion: { total: 200 } }), false);
  assert.equal(respuestaIncompleta({ gastos: [], paginacion: { total: 0 } }), false);
  assert.equal(respuestaIncompleta(null), false);
});

// ── EL CALENDARIO ───────────────────────────────────────────────────────

test("cada gasto cae en el día de su fecha, del más reciente al más viejo", () => {
  const c = calendarioDeGastos({
    gastos: [gasto(1, { fecha: "2026-09-29" }), gasto(2, { fecha: "2026-09-28" }), gasto(3, { fecha: "2026-09-29" })],
    filtro: FILTRO_CUENTAS.TODAS,
  });
  assert.deepEqual(c.dias.map((d) => [d.clave, d.gastos.map((g) => g.id)]), [["2026-09-29", [1, 3]], ["2026-09-28", [2]]]);
  assert.equal(c.dias[0].titulo, "Martes 29");
  assert.equal(c.anteriores, null);
});

test("Pendientes incluye los parciales, y la cifra es el saldo; en Pagados y en Todos es el total", () => {
  const parcial = gasto(1, { fecha: "2026-09-29", total: 45800, pagado: 20000 });
  assert.equal(parcial.estado, "PARCIAL");
  assert.equal(calendarioDeGastos({ gastos: [parcial], filtro: FILTRO_CUENTAS.PENDIENTES }).dias[0].importe, 25800);
  assert.equal(calendarioDeGastos({ gastos: [parcial], filtro: FILTRO_CUENTAS.TODAS }).dias[0].importe, 45800);
});

test("Anteriores con saldo va en su banda y no suma en el total del período", () => {
  const c = calendarioDeGastos({
    gastos: [gasto(1, { fecha: "2026-09-29", total: 1000 })],
    anteriores: [gasto(9, { fecha: "2026-08-20", total: 36400 }), gasto(8, { fecha: "2026-09-10", total: 60000, pagado: 1000 })],
    filtro: FILTRO_CUENTAS.PENDIENTES,
  });
  assert.equal(c.anteriores.titulo, "Anteriores con saldo");
  assert.deepEqual(c.anteriores.gastos.map((g) => g.id), [9, 8]);
  assert.equal(c.anteriores.importe, 36400 + 59000);
  assert.deepEqual(totalDelPeriodo(c), { cantidad: 1, importe: 1000 });
});

test("un gasto que llega en las dos consultas está en UN solo lugar: el período", () => {
  const repetido = gasto(5, { fecha: "2026-09-29" });
  const c = calendarioDeGastos({ gastos: [repetido, repetido], anteriores: [repetido, gasto(6, { fecha: "2026-09-01" })], filtro: FILTRO_CUENTAS.PENDIENTES });
  const ids = [...c.dias.flatMap((d) => d.gastos), ...(c.anteriores?.gastos || [])].map((g) => g.id);
  assert.deepEqual(ids.sort(), [5, 6]);
  assert.deepEqual(c.anteriores.gastos.map((g) => g.id), [6]);
});

// ── TEXTOS Y BÚSQUEDA ───────────────────────────────────────────────────

test("el estado de un gasto se dice en masculino, y los grupos cuentan gastos", () => {
  assert.deepEqual(ROTULO_ESTADO_GASTO, { PENDIENTE: "Pendiente", PARCIAL: "Parcial", PAGADA: "Pagado" });
  assert.equal(rotuloDeGastos(1), "1 gasto");
  assert.equal(rotuloDeGastos(3), "3 gastos");
});

test("la búsqueda mira concepto, beneficiario y comprobante, sin acentos ni mayúsculas", () => {
  const g = gasto(1, { fecha: "2026-09-29", concepto: "Reparación heladera", beneficiario: "Frío Sur", comprobanteNumero: "FC 0004-2841" });
  for (const t of ["REPARACION", "frio", "0004-2841", ""]) assert.equal(gastoCoincideConBusqueda(g, t), true, t);
  assert.equal(gastoCoincideConBusqueda(g, "alquiler"), false);
});

// ── EL CONTEXTO EN LA URL ───────────────────────────────────────────────

test("pestaña, período y categoría sobreviven a entrar a un gasto y volver", () => {
  const ctx = { estado: FILTRO_CUENTAS.TODAS, unidad: "MES", desp: -2, cat: 4 };
  const alGasto = urlDeGasto(31, ctx);
  assert.equal(alGasto, `${RUTA_GASTOS}/31?estado=TODAS&unidad=MES&desp=-2&cat=4`);
  // El detalle lee la query y arma la vuelta con lo mismo.
  const vuelta = urlDeGastos(parseContextoGastos(new URL(`http://x${alGasto}`).searchParams));
  assert.equal(vuelta, `${RUTA_GASTOS}?estado=TODAS&unidad=MES&desp=-2&cat=4`);
});

test("lo que coincide con el default no se escribe, y una categoría basura se descarta", () => {
  assert.equal(urlDeGastos(parseContextoGastos({})), RUTA_GASTOS);
  assert.deepEqual(parseContextoGastos({}), { estado: "PENDIENTES", unidad: "SEMANA", desp: 0, cat: null });
  assert.equal(serializarContextoGastos({ cat: "abc" }), "");
  assert.equal(serializarContextoGastos({ cat: "-3" }), "");
});

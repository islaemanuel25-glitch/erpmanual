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
  VACIO_DE_LA_LISTA,
  busquedaEnElServidor,
  claveDeBusqueda,
  consultaDeAnteriores,
  consultaDelPeriodo,
  gastoCoincideConBusqueda,
  gastosDeLaLista,
  respuestaIncompleta,
  rotuloDeGastos,
  vacioDeLaLista,
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

// ── LA BÚSQUEDA CONTRA EL TOPE DE 200 ───────────────────────────────────
//
// Con la forma de la respuesta del GET: `gastos` es la página y `paginacion.
// total` lo que hay en la base con esos filtros. 201 gastos en el período: la
// API manda los 200 más nuevos, y el que se busca es el 201.

const CONTEXTO = { filtro: FILTRO_CUENTAS.PENDIENTES, rango: RANGO, categoriaId: 4 };
const doscientos = Array.from({ length: 200 }, (_, i) => gasto(1000 + i, { fecha: "2026-10-01", concepto: `Varios ${i}` }));
const perdido = gasto(7, { fecha: "2026-09-27", concepto: "Reparación de la persiana" });
const respuesta = (gastos, total = gastos.length) => ({ ok: true, gastos, paginacion: { total } });
const PERIODO_INCOMPLETO = respuesta(doscientos, 201);
const SIN_ANTERIORES = respuesta([]);

test("la búsqueda viaja como q en las DOS consultas, con la misma pestaña, rango y categoría", () => {
  const p = leer(consultaDelPeriodo({ ...CONTEXTO, q: "  persiana " }));
  assert.deepEqual(p, { estado: "PENDIENTES", fechaDesde: "2026-09-27", fechaHasta: "2026-10-03", categoriaId: "4", q: "persiana", pageSize: "200" });
  const a = leer(consultaDeAnteriores({ ...CONTEXTO, q: "persiana" }));
  assert.deepEqual(a, { estado: "PENDIENTES", fechaHasta: "2026-09-26", categoriaId: "4", q: "persiana", pageSize: "200" });
  // Vacía, o solo espacios, no viaja.
  assert.equal(leer(consultaDelPeriodo({ ...CONTEXTO, q: "   " })).q, undefined);
  assert.equal(leer(consultaDeAnteriores(CONTEXTO)).q, undefined);
});

test("EL FALSO NEGATIVO EXISTE: buscar en los 200 cargados no encuentra al 201", () => {
  // Lo que hacía la pantalla antes: filtrar lo cargado. Esta afirmación es la
  // que confirma el caso; si alguna vez dejara de ser cierta, el tope cambió.
  assert.equal(PERIODO_INCOMPLETO.gastos.filter((g) => gastoCoincideConBusqueda(g, "persiana")).length, 0);
  assert.equal(busquedaEnElServidor({ periodo: PERIODO_INCOMPLETO, anteriores: SIN_ANTERIORES }), true);
});

test("con lo cargado incompleto, la búsqueda espera al servidor y NO dice 'ninguno' mientras tanto", () => {
  const l = gastosDeLaLista({ periodo: PERIODO_INCOMPLETO, anteriores: SIN_ANTERIORES, busqueda: "persiana", contexto: CONTEXTO });
  assert.equal(l.enElServidor, true);
  assert.equal(l.esperando, true);
  assert.equal(vacioDeLaLista({ busqueda: "persiana", hayFilas: true, grupos: [], esperando: l.esperando }), null);
});

test("una coincidencia fuera de los primeros 200 aparece con la respuesta del servidor", () => {
  const resultado = { clave: claveDeBusqueda(CONTEXTO, "persiana"), periodo: respuesta([perdido]), anteriores: SIN_ANTERIORES };
  const l = gastosDeLaLista({ periodo: PERIODO_INCOMPLETO, anteriores: SIN_ANTERIORES, busqueda: " persiana", contexto: CONTEXTO, resultado });
  assert.equal(l.esperando, false);
  assert.deepEqual(l.gastos.map((g) => g.id), [7]);
  assert.equal(l.incompleta, false, "el resultado de la búsqueda está entero, aunque lo cargado no");
  const cal = calendarioDeGastos({ gastos: l.gastos, anteriores: l.anteriores, filtro: CONTEXTO.filtro });
  assert.equal(cal.dias[0].gastos[0].concepto, "Reparación de la persiana");
});

test("una respuesta de OTRA consulta no se muestra: término, pestaña, período o categoría distintos", () => {
  const base = { periodo: PERIODO_INCOMPLETO, anteriores: SIN_ANTERIORES, busqueda: "persiana", contexto: CONTEXTO };
  const de = (ctx, termino) => ({ clave: claveDeBusqueda(ctx, termino), periodo: respuesta([perdido]), anteriores: SIN_ANTERIORES });
  for (const [nombre, resultado] of [
    ["otro término", de(CONTEXTO, "persian")],
    ["otra pestaña", de({ ...CONTEXTO, filtro: FILTRO_CUENTAS.TODAS }, "persiana")],
    ["otro período", de({ ...CONTEXTO, rango: { desde: "2026-09-20", hasta: "2026-09-26" } }, "persiana")],
    ["otra categoría", de({ ...CONTEXTO, categoriaId: 5 }, "persiana")],
  ]) {
    const l = gastosDeLaLista({ ...base, resultado });
    assert.equal(l.esperando, true, nombre);
    assert.deepEqual(l.gastos, [], nombre);
  }
});

test("Anteriores con saldo sigue con búsqueda, en el servidor y en la pantalla, sin repetir ids", () => {
  const viejo = gasto(3, { fecha: "2026-09-10", concepto: "Persiana del depósito", total: 5000 });
  // En el servidor: la búsqueda trae lo suyo en las dos consultas. Un id que
  // viniera en las dos —no pasa por construcción— igual queda una vez.
  const resultado = { clave: claveDeBusqueda(CONTEXTO, "persiana"), periodo: respuesta([perdido]), anteriores: respuesta([viejo, perdido]) };
  const l = gastosDeLaLista({ periodo: PERIODO_INCOMPLETO, anteriores: SIN_ANTERIORES, busqueda: "persiana", contexto: CONTEXTO, resultado });
  const cal = calendarioDeGastos({ gastos: l.gastos, anteriores: l.anteriores, filtro: CONTEXTO.filtro });
  assert.equal(cal.anteriores.titulo, "Anteriores con saldo");
  assert.deepEqual(cal.anteriores.gastos.map((g) => g.id), [3]);
  const ids = [...cal.anteriores.gastos, ...cal.dias.flatMap((d) => d.gastos)].map((g) => g.id);
  assert.deepEqual(ids.sort(), [3, 7]);

  // En la pantalla, con lo cargado entero: se filtran las dos listas.
  const completo = gastosDeLaLista({
    periodo: respuesta([perdido, gasto(8, { fecha: "2026-09-28", concepto: "Luz" })]),
    anteriores: respuesta([viejo, gasto(4, { fecha: "2026-09-11", concepto: "Agua" })]),
    busqueda: "PERSIANA",
    contexto: CONTEXTO,
  });
  assert.equal(completo.enElServidor, false);
  assert.deepEqual([completo.gastos.map((g) => g.id), completo.anteriores.map((g) => g.id)], [[7], [3]]);
});

test("con lo cargado entero se busca en la pantalla, al instante y sin pedir nada", () => {
  const l = gastosDeLaLista({ periodo: respuesta(doscientos, 200), anteriores: SIN_ANTERIORES, busqueda: "varios 19", contexto: CONTEXTO });
  assert.equal(l.enElServidor, false);
  assert.equal(l.esperando, false);
  assert.deepEqual(l.gastos.map((g) => g.id).sort(), [1019, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199]);
  // Y los anteriores también cuentan para decidir: si ELLOS están cortados, va al servidor.
  assert.equal(busquedaEnElServidor({ periodo: respuesta([]), anteriores: respuesta(doscientos, 250) }), true);
});

test("sin búsqueda la lista es lo cargado, y avisa si está cortado", () => {
  const l = gastosDeLaLista({ periodo: PERIODO_INCOMPLETO, anteriores: SIN_ANTERIORES, busqueda: "  ", contexto: CONTEXTO });
  assert.equal(l.gastos.length, 200);
  assert.equal(l.incompleta, true);
  assert.equal(l.enElServidor, false);
});

// ── LOS DOS VACÍOS ──────────────────────────────────────────────────────

test("período sin gastos → el vacío del período; búsqueda sin coincidencias → el de la búsqueda", () => {
  const P = VACIO_DE_LA_LISTA.PERIODO;
  const B = VACIO_DE_LA_LISTA.BUSQUEDA;
  assert.equal(vacioDeLaLista({ busqueda: "", hayFilas: false, grupos: [] }), P);
  // Un término que quedó escrito cuando el período se vació sigue siendo el
  // vacío del período: el buscador ni se dibuja.
  assert.equal(vacioDeLaLista({ busqueda: "luz", hayFilas: false, grupos: [] }), P);
  assert.equal(vacioDeLaLista({ busqueda: "luz", hayFilas: true, grupos: [] }), B);
  assert.equal(vacioDeLaLista({ busqueda: "luz", hayFilas: true, grupos: [{}] }), null);
  assert.equal(vacioDeLaLista({ busqueda: "", hayFilas: true, grupos: [{}] }), null);
  // Esperando o con error no hay vacío: no se sabe todavía.
  assert.equal(vacioDeLaLista({ busqueda: "luz", hayFilas: true, grupos: [], esperando: true }), null);
  assert.equal(vacioDeLaLista({ busqueda: "luz", hayFilas: true, grupos: [], error: "x" }), null);
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
  // El default de la unidad es DÍA desde el 2026-10-01, compartido por las
  // cuatro pantallas de Finanzas y definido una sola vez en periodoFinanciero.
  assert.deepEqual(parseContextoGastos({}), { estado: "PENDIENTES", unidad: "DIA", desp: 0, cat: null });
  assert.equal(serializarContextoGastos({ cat: "abc" }), "");
  assert.equal(serializarContextoGastos({ cat: "-3" }), "");
});

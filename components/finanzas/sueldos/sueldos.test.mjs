// CANDADOS DE FINANZAS → SUELDOS.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/sueldos/sueldos.test.mjs
//
// El comportamiento contra la base —la regla del sueldo en las tres puertas,
// el POS y Finanzas en un solo historial, Gastos sin sueldos, el Resumen igual,
// el relleno y la asignación— lo ejerce scripts/pruebas-db/sueldos.mjs con los
// handlers reales. Acá van las reglas puras, la pantalla dibujada y la FORMA
// de lo que no se puede ejercer sin la base.
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// `lecturaReal.fixture.json` es la respuesta REAL de `GET /api/finanzas/sueldos`
// que escribe aquel guion (`ESCRIBIR_FIXTURE_SUELDOS=1`): un pago desde la caja
// y uno desde Finanzas del mismo empleado, un aguinaldo, una empleada activa
// sin pagos y tres sueldos viejos sin empleado —uno pagado y dos no—. No se
// escribió a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PantallaSueldos from "@/components/finanzas/sueldos/PantallaSueldos.jsx";
import { cuerpoDelPagoDeSueldo, faltaAlgoDelPagoDeSueldo } from "@/components/finanzas/sueldos/FormularioPagarSueldo.jsx";
import {
  MODALIDADES_SUELDO,
  OPCIONES_MODALIDAD_SUELDO,
  conceptoDeSueldo,
  origenDelPago,
  resumenDeSueldos,
  textoDePagosDelEmpleado,
} from "@/lib/finanzas/sueldos.js";
import {
  VISTA_SUELDOS,
  consultaDeSueldos,
  parseContextoSueldos,
  serializarContextoSueldos,
} from "@/lib/finanzas/contextoSueldos.js";

const real = JSON.parse(readFileSync("components/finanzas/sueldos/lecturaReal.fixture.json", "utf8"));
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const fuente = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const nada = () => {};
const dibujar = (ctx, datos = real) =>
  texto(
    renderToStaticMarkup(
      React.createElement(PantallaSueldos, {
        datos,
        ctx: { ...parseContextoSueldos({}), ...ctx },
        hoy: "2026-10-19",
        onCambiarUnidad: nada,
        onElegirRango: nada,
        onAtras: nada,
        onAdelante: nada,
        onIr: nada,
        onVolver: nada,
      })
    )
  );
const carlos = real.empleados.find((e) => e.nombre.endsWith("-Carlos"));
const eva = real.empleados.find((e) => e.nombre.endsWith("-Eva"));

// ── LA REGLA, EN LA CAPA QUE ESCRIBE ─────────────────────────────────────

test("un sueldo exige empleado del local y modalidad en crearGasto, la puerta del POS y de Finanzas", () => {
  const g = fuente("lib/finanzas/gastosServer.js");
  const crear = g.slice(g.indexOf("export async function crearGasto"), g.indexOf("export async function exigirEmpleadoDelSueldo"));
  assert.match(crear, /categoria\.nombre === CATEGORIA_SUELDOS\s*\?\s*await exigirEmpleadoDelSueldo\(tx, \{ empleadoId: args\.empleadoId, modalidad: args\.modalidadSueldo, localId \}\)/);
  // El beneficiario y el concepto los pone el empleado, no la persona.
  assert.match(crear, /beneficiario: sueldo \? leerTextoOError\(sueldo\.nombre\)/);
  assert.match(crear, /leerConcepto\(sueldo \? conceptoDeSueldo\(sueldo\) : args\.concepto\)/);
  const exigir = g.slice(g.indexOf("export async function exigirEmpleadoDelSueldo"));
  assert.match(exigir, /if \(deOtroLocal\) throw new ErrorGasto\(ERROR_EMPLEADO_DE_OTRO_LOCAL\);/, "el de otro local es 400");
  assert.match(exigir, /if \(!esModalidadSueldo\(modalidad\)\) throw new ErrorGasto\(ERROR_MODALIDAD_SUELDO\);/);
  // El POS y Sueldos no validan por su cuenta: llaman a crearGasto.
  const pos = fuente("lib/caja/pagarDesdeElPosServer.js");
  assert.doesNotMatch(pos, /empleadoActivoDelLocal/, "el POS volvió a validar el empleado por su lado");
  assert.match(pos, /modalidadSueldo = body\.modalidad;/);
  const ruta = fuente("app/api/finanzas/sueldos/route.js");
  assert.match(ruta, /crearGasto\(tx, \{/);
  assert.doesNotMatch(ruta, /empleadoActivoDelLocal|gasto\.create|pagoGasto\.create/);
});

test("Gastos no lista sueldos y el Resumen los sigue sumando: el filtro va solo en el listado", () => {
  const g = fuente("lib/finanzas/gastosServer.js");
  const listar = g.slice(g.indexOf("export async function listarGastos"), g.indexOf("export async function totalEconomicoDeGastos"));
  const total = g.slice(g.indexOf("export async function totalEconomicoDeGastos"), g.indexOf("export function categoriasDeGasto"));
  assert.match(listar, /filtros: \{ \.\.\.filtros, sinSueldos: true \}/);
  assert.doesNotMatch(total, /sinSueldos/, "el total del Resumen dejó de contar los sueldos");
  assert.match(g, /if \(filtros\.sinSueldos\) \{/);
  // Y el catálogo del alta de Gastos no ofrece Sueldos.
  assert.match(fuente("app/api/finanzas/gastos/categorias/route.js"), /categoriasDeGasto\(prisma, \{ sinSueldos: true \}\)/);
});

test("la migración agrega la columna nula y rellena solo los prefijos del POS en Sueldos", () => {
  const sql = readFileSync("prisma/migrations/20261019200000_gasto_modalidad_sueldo/migration.sql", "utf8");
  assert.match(sql, /CREATE TYPE "ModalidadSueldo" AS ENUM \('SUELDO', 'ADELANTO', 'AGUINALDO', 'VACACIONES'\);/);
  assert.match(sql, /ALTER TABLE "Gasto" ADD COLUMN "modalidadSueldo" "ModalidadSueldo";/);
  assert.doesNotMatch(sql, /NOT NULL|DROP |DELETE /);
  const relleno = sql.slice(sql.indexOf("UPDATE"));
  assert.match(relleno, /c\."nombre" = 'Sueldos'/);
  assert.match(relleno, /g\."modalidadSueldo" IS NULL/);
  // El prefijo es EXACTAMENTE el que escribía el POS.
  assert.equal(conceptoDeSueldo({ modalidad: "SUELDO", nombre: "Ana" }), "Sueldo · Ana");
  assert.equal(conceptoDeSueldo({ modalidad: "ADELANTO", nombre: "Ana" }), "Adelanto · Ana");
  assert.match(relleno, /LIKE 'Sueldo · %' THEN 'SUELDO'/);
  assert.match(relleno, /LIKE 'Adelanto · %'/);
});

test("el POS ofrece las cuatro modalidades, de la misma lista que Finanzas", () => {
  assert.deepEqual(MODALIDADES_SUELDO, ["SUELDO", "ADELANTO", "AGUINALDO", "VACACIONES"]);
  assert.deepEqual(OPCIONES_MODALIDAD_SUELDO.map((o) => o.texto), ["Sueldo", "Adelanto", "Aguinaldo", "Vacaciones"]);
  const modal = fuente("components/pos-ventas/ModalPagar.jsx");
  assert.match(modal, /opciones=\{OPCIONES_MODALIDAD_SUELDO\}/);
  assert.doesNotMatch(modal, /\{ valor: "ADELANTO"/, "el POS volvió a tener su propia lista");
});

// ── LA CUENTA ────────────────────────────────────────────────────────────

test("desde la caja es el pago con turno; desde Finanzas, el resto", () => {
  assert.deepEqual(origenDelPago({ turnoId: 7, medio: "EFECTIVO" }), { desdeLaCaja: true, rotulo: "Caja #7 · efectivo" });
  assert.deepEqual(origenDelPago({ turnoId: null, medio: "MERCADO_PAGO" }), { desdeLaCaja: false, rotulo: "Finanzas · mercado pago" });
});

test("la lectura real cierra: el total es caja más Finanzas, y es la suma de los renglones", () => {
  assert.equal(real.total, real.desdeLaCaja + real.desdeFinanzas);
  const renglones = real.empleados.reduce((a, e) => a + e.total, 0) + (real.sinEmpleado?.total || 0);
  assert.equal(real.total, renglones);
  // Volver a contar los mismos sueldos da lo mismo: la cuenta es pura.
  assert.ok(carlos.pagos.some((p) => p.desdeLaCaja) && carlos.pagos.some((p) => !p.desdeLaCaja), "Carlos no tiene un pago de cada lado");
});

test("un empleado activo sin pagos tiene su renglón; uno de baja aparece solo si cobró", () => {
  assert.deepEqual([eva.cantidadPagos, eva.total, eva.ultimo], [0, 0, null]);
  assert.equal(textoDePagosDelEmpleado(eva), "Sin pagos este período");
  assert.equal(textoDePagosDelEmpleado(carlos), "2 pagos · último 19/10");
  const r = resumenDeSueldos({
    empleados: [{ id: 1, nombre: "Ana" }],
    sueldos: [
      { id: 9, fecha: "2026-10-05", empleadoId: 2, empleado: { id: 2, nombre: "Beto", activo: false }, modalidadSueldo: "SUELDO", total: 100, pagos: [{ id: 3, monto: 100, medio: "TRANSFERENCIA", turnoId: null }] },
    ],
  });
  assert.deepEqual(r.empleados.map((e) => [e.nombre, e.activo, e.total]), [["Ana", true, 0], ["Beto", false, 100]]);
  // En centavos: 0,1 + 0,2 es 0,3.
  const c = resumenDeSueldos({ sueldos: [{ id: 1, fecha: "2026-10-01", empleadoId: null, total: 0.3, pagos: [{ id: 1, monto: 0.1, medio: "OTRO" }, { id: 2, monto: 0.2, medio: "OTRO" }] }] });
  assert.equal(c.total, 0.3);
});

test("un sueldo sin empleado dice su importe y lo pagado, sin que uno pise al otro", () => {
  const impagos = real.sinEmpleado.sueldos.filter((s) => s.pagos.length === 0);
  assert.ok(impagos.length > 0, "el fixture perdió el sueldo viejo sin pagar");
  for (const s of impagos) assert.deepEqual([s.total > 0, s.pagado], [true, 0], s.concepto);
});

// ── LA PANTALLA, DIBUJADA ────────────────────────────────────────────────

test("Sueldos: el local, el total del período con caja y Finanzas, todos los empleados y Pagar sueldo", () => {
  const t = dibujar({});
  assert.match(t, new RegExp(`^Sueldos ${real.local.nombre}`));
  assert.match(t, /PAGADO EN EL PERÍODO \$291\.000,00 Desde la caja \$40\.000,00 Desde Finanzas \$251\.000,00/);
  assert.match(t, new RegExp(`${carlos.nombre} 2 pagos · último 19/10 \\$280\\.000,00 ›`));
  assert.match(t, new RegExp(`${eva.nombre} Sin pagos este período \\$0,00 ›`));
  assert.match(t, /Sin empleado asignado 3 sueldos para completar \$1\.000,00 ›/);
  assert.match(t, /Pagar sueldo$/);
  // El selector de fechas estándar, abierto en el mes.
  assert.match(t, /Día Semana Mes Otro/);
  assert.match(t, /Octubre · en curso/);
});

test("sin permiso de pagar no se ofrece el botón, y sin sueldos viejos no hay renglón de sin empleado", () => {
  const t = dibujar({}, { ...real, puedePagar: false, sinEmpleado: null });
  assert.doesNotMatch(t, /Pagar sueldo|Sin empleado asignado/);
});

test("el historial de un empleado: su tarjeta del período con cada pago y el total", () => {
  const t = dibujar({ vista: VISTA_SUELDOS.EMPLEADO, empleado: carlos.id });
  const esperado = carlos.pagos.map((p) => `${p.titulo} ${p.origen} \\$${p.monto.toLocaleString("es-AR")},00`).join(" ");
  assert.match(t, new RegExp(`${carlos.nombre.toUpperCase()} · ESTE PERÍODO ${esperado.replace(/\./g, "\\.")} Total \\$280\\.000,00`));
  assert.match(t, /Caja #\d+ · efectivo/);
  assert.match(t, /Finanzas · transferencia/);
});

test("los sueldos sin empleado, cada uno con Asignar empleado", () => {
  const t = dibujar({ vista: VISTA_SUELDOS.SIN_EMPLEADO });
  assert.equal((t.match(/Asignar empleado/g) || []).length, real.sinEmpleado.sueldos.length + 0);
  assert.match(t, /Pago a Ana por la semana \$1\.000,00/);
});

test("Pagar sueldo: empleado de la lista, tipo, monto, fecha, de dónde sale y nota; con el elegido, su tarjeta", () => {
  const t = dibujar({ vista: VISTA_SUELDOS.PAGAR, empleado: carlos.id });
  for (const rotulo of ["Empleado", "Tipo", "Sueldo Adelanto Aguinaldo Vacaciones", "Monto", "Fecha", "Medio de pago", "De dónde sale el dinero", "Nota (opcional)", "Registrar pago"]) {
    assert.ok(t.includes(rotulo), `falta ${rotulo}`);
  }
  assert.match(t, new RegExp(`${carlos.nombre.toUpperCase()} · ESTE PERÍODO`));
  // Sin elegido, no hay tarjeta.
  assert.doesNotMatch(dibujar({ vista: VISTA_SUELDOS.PAGAR }), /· ESTE PERÍODO/);
});

test("el pedido de pago lleva lo que acepta la ruta, con la clave del intento", () => {
  const form = { empleadoId: "4", modalidad: "AGUINALDO", monto: "1.000,50", fecha: "2026-10-19", medio: "EFECTIVO", turnoId: "8", nota: "  " };
  assert.deepEqual(cuerpoDelPagoDeSueldo(form, "k1"), {
    empleadoId: 4, modalidadSueldo: "AGUINALDO", monto: "1.000,50", fecha: "2026-10-19", medio: "EFECTIVO", turnoId: 8, nota: null, idempotencyKey: "k1",
  });
  assert.equal(cuerpoDelPagoDeSueldo({ ...form, medio: "TRANSFERENCIA" }, "k").turnoId, null);
  assert.equal(faltaAlgoDelPagoDeSueldo({ ...form, empleadoId: "" }), true);
  assert.equal(faltaAlgoDelPagoDeSueldo({ ...form, turnoId: "" }), true, "en efectivo falta el turno");
  assert.equal(faltaAlgoDelPagoDeSueldo(form), false);
  // La clave es la del alta de gastos, no una propia.
  assert.match(fuente("components/finanzas/sueldos/FormularioPagarSueldo.jsx"), /nuevaClaveDeGasto\(/);
});

// ── EL CONTEXTO EN LA URL ────────────────────────────────────────────────

test("Sueldos abre en el mes en curso y no lo escribe; la vista y el empleado viajan", () => {
  assert.deepEqual(parseContextoSueldos({}), { unidad: "MES", desp: 0, desde: null, hasta: null, vista: "resumen", empleado: null });
  assert.equal(serializarContextoSueldos({}), "");
  assert.equal(serializarContextoSueldos({ unidad: "DIA", desp: -2 }), "unidad=DIA&desp=-2");
  assert.equal(serializarContextoSueldos({ desp: -1, vista: "empleado", empleado: 5 }), "desp=-1&vista=empleado&empleado=5");
  assert.equal(parseContextoSueldos({ vista: "empleado" }).vista, "resumen", "un historial sin empleado no es una vista");
  assert.equal(parseContextoSueldos({ vista: "pagar", empleado: "5" }).empleado, 5);
  assert.equal(parseContextoSueldos({ vista: "sin-empleado", empleado: "5" }).empleado, null);
  assert.equal(consultaDeSueldos({}), "unidad=MES&desplazamiento=0");
  assert.equal(consultaDeSueldos({ unidad: "OTRO", desde: "2026-10-01" }), null, "«Otro» sin las dos fechas no pide");
  assert.equal(consultaDeSueldos({ unidad: "OTRO", desde: "2026-10-01", hasta: "2026-10-10" }), "unidad=OTRO&desde=2026-10-01&hasta=2026-10-10");
});

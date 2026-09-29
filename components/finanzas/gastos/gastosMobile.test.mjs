// CANDADO: GASTOS MÓVIL, ARMADO CON LAS PIEZAS DE PAGOS A PROVEEDORES.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/gastos/gastosMobile.test.mjs
//
// Dónde cae cada gasto y qué se le pide a la API está en
// `lib/finanzas/calendarioDeGastos.test.mjs`; lo que la API hace, en
// `scripts/pruebas-db/gastosApi.mjs`. Acá se afirma lo que dibuja la pantalla
// —renderizando las piezas de verdad— y lo que manda al crear.
//
// Todo lo que lee código lo lee SIN COMENTARIOS (regla 5 de CLAUDE.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FilaGasto from "./FilaGasto.jsx";
import ResumenDeGastos from "./ResumenDeGastos.jsx";
import DetalleGasto from "./DetalleGasto.jsx";
import { PAGO_AL_CREAR, cuerpoDelNuevoGasto, faltaAlgoDelNuevoGasto } from "./ModalNuevoGasto.jsx";
import { FILTRO_CUENTAS, estadoDeCuenta } from "@/lib/finanzas/pagosProveedores";
import { calendarioDeGastos } from "@/lib/finanzas/calendarioDeGastos";
import { descripcionDePagos } from "@/lib/finanzas/calendarioDePagos";
import { CATEGORIAS_INICIALES } from "@/lib/finanzas/gastos";

const html = (el) => renderToStaticMarkup(el);
const HOY = "2026-09-29";
const codigo = (ruta) =>
  fs.readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Con la forma de `serializarGasto`: importes y estado de `estadoDeCuenta`. */
function gasto({ total = 45800, pagado = 0, vencimiento = null, beneficiario = "Telecom Argentina", fecha = "2026-09-29" } = {}) {
  return {
    id: 31,
    concepto: "Internet Fibra",
    categoria: { id: 1, nombre: "Servicios", activa: true },
    local: { id: 2, nombre: "Casiano Casas" },
    beneficiario,
    comprobanteNumero: "FC 0004-2841",
    fecha,
    vencimiento,
    fechaPrevistaPago: null,
    ...estadoDeCuenta({ total, pagos: pagado ? [{ monto: pagado }] : [] }),
  };
}
const fila = (g, filtro, extra = {}) => html(React.createElement(FilaGasto, { gasto: g, filtro, hoy: HOY, onAbrir: () => {}, ...extra }));

// ── LA FILA ─────────────────────────────────────────────────────────────

test("la fila: concepto, beneficiario, categoría, estado y vencimiento, y UNA cifra sin rótulo", () => {
  const s = fila(gasto({ pagado: 20000, vencimiento: "2026-10-05" }), FILTRO_CUENTAS.PENDIENTES);
  assert.ok(s.includes(">Internet Fibra<"));
  assert.ok(s.includes(">· Telecom Argentina<"));
  assert.ok(s.includes(">Servicios · Parcial · Vence 05/10/2026<"), s);
  assert.ok(s.includes(">$25.800,00<"), "en Pendientes la cifra es el saldo");
  assert.ok(!s.includes("$45.800,00") && !/Saldo/.test(s), "la fila no lleva el total ni la palabra Saldo");
  assert.ok(s.includes(">Ver ›<"));
  assert.ok(!s.includes("Casiano Casas"), "con una sola ubicación no se repite");
});

test("vencido va en aviso; sin vencimiento lo dice; pagado dice solo Pagado; varias ubicaciones nombra el local", () => {
  assert.match(fila(gasto({ vencimiento: "2026-09-20" }), FILTRO_CUENTAS.PENDIENTES), /sunmi-text-warning">Servicios · Pendiente · Venció 20\/09\/2026</);
  assert.ok(fila(gasto(), FILTRO_CUENTAS.PENDIENTES).includes(">Servicios · Pendiente · Sin vencimiento<"));
  const pagado = fila(gasto({ pagado: 45800, vencimiento: "2026-09-20" }), FILTRO_CUENTAS.PAGADAS);
  assert.ok(pagado.includes(">Servicios · Pagado<") && pagado.includes(">$45.800,00<"), pagado);
  assert.ok(fila(gasto(), FILTRO_CUENTAS.TODAS, { variasUbicaciones: true }).includes(">· Casiano Casas<"));
});

// ── EL RESUMEN ──────────────────────────────────────────────────────────

const resumen = (filtro, cal) =>
  html(React.createElement(ResumenDeGastos, { filtro, descripcion: descripcionDePagos({ unidad: "SEMANA", desplazamiento: 0, filtro, hoy: HOY }), calendario: cal }));

test("el resumen habla de gastos DEL PERÍODO, nunca de lo pagado en el período", () => {
  const cal = calendarioDeGastos({ gastos: [gasto({ pagado: 20000 })], filtro: FILTRO_CUENTAS.PENDIENTES });
  assert.ok(resumen(FILTRO_CUENTAS.PENDIENTES, cal).includes(">Saldo de gastos del período<"));
  assert.ok(resumen(FILTRO_CUENTAS.PAGADAS, calendarioDeGastos({ filtro: FILTRO_CUENTAS.PAGADAS })).includes(">Gastos pagados del período<"));
  assert.ok(resumen(FILTRO_CUENTAS.TODAS, calendarioDeGastos({ filtro: FILTRO_CUENTAS.TODAS })).includes(">Gastos del período<"));
  for (const f of Object.values(FILTRO_CUENTAS)) assert.ok(!/Pagado en el período/.test(resumen(f, calendarioDeGastos({ filtro: f }))), f);
});

test("los anteriores con saldo encienden el aviso y NO se suman al número del período", () => {
  const cal = calendarioDeGastos({ gastos: [gasto({ total: 1000 })], anteriores: [{ ...gasto({ total: 96400, fecha: "2026-08-20" }), id: 99 }], filtro: FILTRO_CUENTAS.PENDIENTES });
  const s = resumen(FILTRO_CUENTAS.PENDIENTES, cal);
  assert.ok(s.includes(">$1.000,00<"), "el número es solo el del período");
  assert.ok(s.includes("1 gasto con saldo de períodos anteriores por $96.400,00."), s);
  assert.ok(s.includes("sunmi-border-warning"));
});

test("un período vacío lo dice, sin aviso", () => {
  const s = resumen(FILTRO_CUENTAS.PENDIENTES, calendarioDeGastos({ filtro: FILTRO_CUENTAS.PENDIENTES }));
  assert.ok(s.includes(">$0,00<") && s.includes("No hay gastos con saldo en este período."));
});

// ── EL DETALLE ──────────────────────────────────────────────────────────

const pago = { id: 7, monto: 20000, fecha: "2026-09-29T13:42:00.000Z", medio: "EFECTIVO", rotuloMedio: "Efectivo", origen: { id: 2, nombre: "Casiano Casas" }, usuario: { id: 1, nombre: "Emanuel" }, turnoId: 633, nota: null };
const detalle = (extra) =>
  html(React.createElement(DetalleGasto, { datos: { gasto: gasto({ pagado: 20000, vencimiento: "2026-10-05" }), pagos: [pago], medios: [], ...extra }, onCambio: () => {} }));

test("el detalle muestra importes, datos y pagos, y con puedePagar ofrece Registrar pago", () => {
  const s = detalle({ puedeEscribir: true, puedePagar: true });
  for (const t of [">Internet Fibra<", ">Parcial<", ">$45.800,00<", ">$20.000,00<", ">$25.800,00<", ">Telecom Argentina<", ">FC 0004-2841<", ">05/10/2026<", ">PAGOS<", ">Efectivo<", "turno #633", ">Registrar pago<"]) {
    assert.ok(s.includes(t), t);
  }
});

test("con el permiso pero sin operar la ubicación, no hay botón y se explica por qué, sin tono de error", () => {
  const s = detalle({ puedeEscribir: true, puedePagar: false });
  assert.ok(!s.includes(">Registrar pago<"));
  assert.ok(s.includes("Este gasto lo paga Casiano Casas: para registrar un pago hay que estar operando en esa ubicación."));
  assert.ok(!/sunmi-text-danger|sunmi-border-danger/.test(s), "no es un error");
  // Y quien solo ve, no ve el botón ni la explicación de un permiso que no tiene.
  assert.ok(!detalle({ puedeEscribir: false, puedePagar: false }).includes("Registrar pago"));
});

test("no hay editar, eliminar ni anular: ni en el detalle ni en la lista", () => {
  const s = detalle({ puedeEscribir: true, puedePagar: true });
  assert.doesNotMatch(s, /Editar|Eliminar|Anular|Borrar/i);
  for (const f of ["components/finanzas/gastos/DetalleGasto.jsx", "components/finanzas/gastos/ListaGastos.jsx"]) {
    assert.doesNotMatch(codigo(f), /method:\s*"(PATCH|PUT|DELETE)"/, f);
  }
});

// ── CREAR ───────────────────────────────────────────────────────────────

const form = (extra = {}) => ({
  categoriaId: "1", concepto: "Internet Fibra", total: "45.800,00", fecha: "2026-09-29", beneficiario: "", comprobante: "", vencimiento: "",
  pago: PAGO_AL_CREAR.PENDIENTE, monto: "", medio: "TRANSFERENCIA", turnoId: "", fechaPago: "2026-09-29", ...extra,
});

test("el alta no manda la ubicación: la pone el servidor", () => {
  const c = cuerpoDelNuevoGasto(form(), "clave-1");
  assert.ok(!("localId" in c) && !("grupoId" in c) && !("localOrigenId" in (c.pagoInicial || {})));
  assert.deepEqual(Object.keys(c).sort(), ["beneficiario", "categoriaId", "comprobanteNumero", "concepto", "fecha", "idempotencyKey", "pagoInicial", "total", "vencimiento"]);
  assert.equal(c.pagoInicial, null, "queda pendiente: sin pago inicial");
});

test("pagar ahora va EN EL MISMO pedido del alta, y puede ser parcial", () => {
  const c = cuerpoDelNuevoGasto(form({ pago: PAGO_AL_CREAR.AHORA, monto: "20.000,00", medio: "EFECTIVO", turnoId: "633" }), "clave-1");
  assert.deepEqual(c.pagoInicial, { monto: "20.000,00", medio: "EFECTIVO", turnoId: 633, fecha: null });
  assert.equal(c.idempotencyKey, "clave-1");
  assert.equal(faltaAlgoDelNuevoGasto(form({ pago: PAGO_AL_CREAR.AHORA, monto: "20.000,00", medio: "EFECTIVO", turnoId: "633" })), false, "un pago parcial se acepta");
  // Y el formulario hace UN solo POST, a la ruta del alta.
  const fuente = codigo("components/finanzas/gastos/ModalNuevoGasto.jsx");
  assert.equal((fuente.match(/fetch\(/g) || []).length, 1);
  assert.match(fuente, /fetch\("\/api\/finanzas\/gastos", \{\s*method: "POST"/);
});

test("el efectivo necesita turno; los otros medios mandan medio y fecha, y ninguna cuenta", () => {
  assert.equal(faltaAlgoDelNuevoGasto(form({ pago: PAGO_AL_CREAR.AHORA, monto: "100", medio: "EFECTIVO", turnoId: "" })), true);
  for (const medio of ["TRANSFERENCIA", "MERCADO_PAGO", "OTRO"]) {
    const c = cuerpoDelNuevoGasto(form({ pago: PAGO_AL_CREAR.AHORA, monto: "100", medio, turnoId: "633", fechaPago: "2026-09-28" }), "k");
    assert.deepEqual(c.pagoInicial, { monto: "100", medio, turnoId: null, fecha: "2026-09-28" }, medio);
    assert.equal(faltaAlgoDelNuevoGasto(form({ pago: PAGO_AL_CREAR.AHORA, monto: "100", medio })), false, medio);
  }
});

test("la clave del intento nace al abrir y se conserva en cada reintento", () => {
  const fuente = codigo("components/finanzas/gastos/ModalNuevoGasto.jsx");
  assert.match(fuente, /useEffect\(\(\) => \{\s*if \(!abierto\) return;\s*claveRef\.current = nuevaClaveDeGasto\(/);
  assert.match(fuente, /cuerpoDelNuevoGasto\(form, claveRef\.current\)/);
});

// ── LA PANTALLA ─────────────────────────────────────────────────────────

// TODAS las piezas de la pantalla, enumeradas y no escritas a mano: una lista
// escrita a mano dejó afuera a la fila y al resumen, y un color fijo en la fila
// pasó el candado. Con lo no trackeado incluido (regla 10).
const PANTALLA = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "components/finanzas/gastos", "app/modulos/finanzas/gastos"],
  { encoding: "utf8" }
)
  .split("\n")
  .filter((f) => f.endsWith(".jsx"));

test("solo usa las rutas de Gastos que existen —y la de turnos a través de CamposDeOrigenDelPago—", () => {
  const rutas = PANTALLA.flatMap((f) => [...codigo(f).matchAll(/["`](\/api\/[^"`?$]+)/g)].map((m) => m[1]));
  assert.deepEqual([...new Set(rutas)].sort(), ["/api/finanzas/gastos", "/api/finanzas/gastos/", "/api/finanzas/gastos/categorias"]);
  assert.ok(fs.existsSync("app/api/finanzas/gastos/route.js") && fs.existsSync("app/api/finanzas/gastos/categorias/route.js"));
});

test("las categorías salen de la API: ninguna pieza de la pantalla las escribe", () => {
  for (const f of PANTALLA) {
    const fuente = codigo(f);
    assert.doesNotMatch(fuente, /CATEGORIAS_INICIALES/, f);
    for (const nombre of CATEGORIAS_INICIALES) assert.ok(!fuente.includes(`"${nombre}"`), `${f} escribe "${nombre}"`);
  }
});

test("Nuevo gasto aparece solo con puedeCrear, y la ubicación del alta es la que manda el servidor", () => {
  const lista = codigo("components/finanzas/gastos/ListaGastos.jsx");
  assert.match(lista, /\{datos\.puedeCrear && \(\s*<SunmiButton/);
  assert.match(lista, /\{datos\?\.puedeCrear && \(\s*<ModalNuevoGasto/);
  assert.match(lista, /ubicacion=\{datos\.ubicacionOperada\}/);
});

test("la pantalla no escribe colores ni medidas mágicas nuevas", () => {
  // Las dos páginas y las cinco piezas de `components/finanzas/gastos`.
  assert.ok(PANTALLA.length >= 7, `la enumeración trajo ${PANTALLA.length} piezas`);
  for (const f of PANTALLA) {
    const fuente = codigo(f);
    assert.doesNotMatch(fuente, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(|style=\{\{/, f);
    assert.doesNotMatch(fuente, /\b(text|bg|border)-(red|amber|green|slate|cyan|blue|yellow|orange|gray|zinc)-\d{2,3}\b/, f);
    assert.doesNotMatch(fuente, /\b[a-z-]+-\[[^\]]+\]/, `${f} tiene una medida entre corchetes`);
  }
});

test("Pagos a proveedores sigue mandando a su ruta y con su subtítulo cuando no se le pasa nada", () => {
  const modal = codigo("components/finanzas/pagos/ModalRegistrarPago.jsx");
  assert.match(modal, /fetch\(urlPago \|\| `\/api\/finanzas\/pagos-proveedores\/\$\{cuenta\.id\}\/pagos`/);
  assert.match(modal, /origen=\{origen \|\| cuenta\?\.localGasto \|\| null\}/);
  assert.match(modal, /claveRef\.current = cuenta \? nuevaClaveDePago\(cuenta\.id\) : null;/);
  // Y el detalle de una cuenta no le pasa ninguna de las props nuevas.
  assert.doesNotMatch(codigo("components/finanzas/pagos/DetalleCuentaPorPagar.jsx"), /urlPago=|subtitulo=|origen=/);
});

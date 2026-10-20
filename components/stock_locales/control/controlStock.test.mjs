// CANDADOS DEL CONTROL DE STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/control/controlStock.test.mjs
//
// El comportamiento contra la base —el primero fija y el siguiente suma,
// corregir y borrar, terminar con los vendidos aparte, el Libro y la bitácora,
// los permisos y el PIN— lo ejerce scripts/pruebas-db/controlStock.mjs con los
// handlers reales. Acá van las reglas puras, la pantalla dibujada y dónde se
// engancha el módulo (menú y roles).
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// `lecturaReal.fixture.json` son las respuestas REALES de las rutas del control
// que escribe aquel guion (`ESCRIBIR_FIXTURE_CONTROL=1`): un control abierto con
// dos personas contando, un producto con el aviso de "ya contado", la vista de
// terminar con un vendido y dos que quedan en cero, y el estado después de
// terminar. No se escribió a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PantallaControlStock, { ConfirmarTerminar } from "@/components/stock_locales/control/PantallaControlStock.jsx";
import { PERMISOS_FUERA_DEL_OPERADOR, permisosEfectivos } from "@/lib/rbac/permisosDelOperador.js";
import { checkPerm } from "@/lib/authorize.js";
import {
  VISTA_CONTROL,
  avisoYaContado,
  haceCuanto,
  mismaPersona,
  partirNoContados,
  porcentajeDeAvance,
  stockTrasConteo,
  stockTrasCorreccion,
  textoCantidad,
  validarCantidadContada,
} from "@/lib/stock/control/controlStock.js";
import {
  PERMISO_CONTAR_CONTROL,
  PERMISO_GESTIONAR_CONTROL,
  RUTA_CONTROL_STOCK,
  permisosDelControl,
} from "@/lib/stock/control/rutasControlStock.js";
import { construirMenuVisible } from "@/lib/menu/menuVisible";
import { getGrupoConfig } from "@/lib/empresa-config";
import { PERMISSION_REGISTRY } from "@/lib/rbac/registry.js";
import { DEFAULT_PERMISOS_SISTEMA, CAJERO, ENCARGADO, DUENO_LOCAL } from "@/lib/rbac/systemRoles.js";

const real = JSON.parse(readFileSync("components/stock_locales/control/lecturaReal.fixture.json", "utf8"));
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const nada = () => {};
const base = {
  cargando: false,
  error: null,
  ocupado: false,
  aviso: null,
  escaneado: null,
  cantidad: "",
  vueltas: 0,
  editando: null,
  terminar: null,
  recargar: nada,
  abrir: nada,
  irAContar: nada,
  irATerminar: nada,
  volverAlInicio: nada,
  elegirProducto: nada,
  setCantidad: nada,
  guardar: nada,
  empezarAEditar: nada,
  cambiarEdicion: nada,
  cancelarEdicion: nada,
  corregir: nada,
  confirmarTerminar: nada,
};
const dibujar = (c, { gestionar = true, contar = true } = {}) =>
  texto(renderToStaticMarkup(React.createElement(PantallaControlStock, { c: { ...base, ...c }, puedeGestionar: gestionar, puedeContar: contar })));

// ── LAS REGLAS ─────────────────────────────────────────────────────────────

test("el primer conteo fija el stock en lo contado; los siguientes suman", () => {
  assert.deepEqual(stockTrasConteo({ actual: 5, cantidad: 3, esPrimero: true }), { nuevo: 3, ajuste: -2 });
  assert.deepEqual(stockTrasConteo({ actual: -15, cantidad: 0, esPrimero: true }), { nuevo: 0, ajuste: 15 });
  assert.deepEqual(stockTrasConteo({ actual: 3, cantidad: 4, esPrimero: false }), { nuevo: 7, ajuste: 4 });
  // Lo vendido entre dos conteos no se pisa: el segundo suma sobre lo que hay.
  assert.deepEqual(stockTrasConteo({ actual: 2, cantidad: 4, esPrimero: false }), { nuevo: 6, ajuste: 4 });
});

test("corregir o borrar mueve por la diferencia, con el piso del ajuste manual", () => {
  assert.deepEqual(stockTrasCorreccion({ actual: 7, anterior: 3, nueva: 5 }), { nuevo: 9, ajuste: 2 });
  assert.deepEqual(stockTrasCorreccion({ actual: 1.25, anterior: 1.25, nueva: 0 }), { nuevo: 0, ajuste: -1.25 });
  assert.deepEqual(stockTrasCorreccion({ actual: 1, anterior: 4, nueva: 0, allowNegativeStock: false }), { nuevo: 0, ajuste: -1 });
  assert.deepEqual(stockTrasCorreccion({ actual: 1, anterior: 4, nueva: 0, allowNegativeStock: true }), { nuevo: -3, ajuste: -4 });
  assert.deepEqual(stockTrasCorreccion({ actual: 7, anterior: 3, nueva: 3 }), { nuevo: 7, ajuste: 0 });
});

test("la cantidad: cero vale, negativa no, y las piezas son enteras", () => {
  assert.equal(validarCantidadContada(0, "UNIDAD").ok, true);
  assert.equal(validarCantidadContada(-1, "UNIDAD").ok, false);
  assert.equal(validarCantidadContada("", "UNIDAD").ok, false);
  assert.equal(validarCantidadContada(1.5, "PIEZA").ok, false);
  assert.equal(validarCantidadContada(1.25, "KG").cantidad, 1.25);
});

test("la misma persona: el mismo operador, o sin operador la misma cuenta", () => {
  assert.equal(mismaPersona({ operadorId: 4, usuarioId: 1 }, { operadorId: 4, usuarioId: 2 }), true);
  // La cuenta compartida con dos operadoras distintas son dos personas.
  assert.equal(mismaPersona({ operadorId: 4, usuarioId: 1 }, { operadorId: 5, usuarioId: 1 }), false);
  assert.equal(mismaPersona({ operadorId: null, usuarioId: 1 }, { operadorId: null, usuarioId: 1 }), true);
  assert.equal(mismaPersona({ operadorId: null, usuarioId: 1 }, { operadorId: 4, usuarioId: 1 }), false);
});

test("el aviso nombra a los demás con lo suyo, y no a uno mismo", () => {
  const conteos = [
    { operadorId: null, usuarioId: 1, contadoPor: "Emanuel", cantidad: 3 },
    { operadorId: 4, usuarioId: 2, contadoPor: "Ana", cantidad: 2 },
    { operadorId: 4, usuarioId: 2, contadoPor: "Ana", cantidad: 1 },
  ];
  assert.equal(avisoYaContado(conteos, { operadorId: 9, usuarioId: 2 }, "UNIDAD"), "Ya contado por Emanuel: 3 un y Ana: 3 un · Lo tuyo se suma");
  assert.equal(avisoYaContado(conteos, { operadorId: 4, usuarioId: 2 }, "UNIDAD"), "Ya contado por Emanuel: 3 un · Lo tuyo se suma");
  assert.equal(avisoYaContado(conteos.slice(0, 1), { operadorId: null, usuarioId: 1 }, "UNIDAD"), null);
  assert.equal(avisoYaContado([{ operadorId: 4, usuarioId: 2, contadoPor: "Ana", cantidad: 1.25 }], { usuarioId: 1 }, "KG"), "Ya contado por Ana: 1,25 kg · Lo tuyo se suma");
});

test("terminar parte en vendidos y los que quedan en cero, y el avance sale del mismo universo", () => {
  const ventas = new Map([[2, { vendio: true, vendidas: 2 }], [3, { vendio: false, vendidas: -1 }]]);
  const { vendidos, aCero } = partirNoContados([{ productoLocalId: 1, stock: 4 }, { productoLocalId: 2, stock: 10 }, { productoLocalId: 3, stock: 1 }], ventas);
  assert.deepEqual(vendidos.map((p) => [p.productoLocalId, p.vendidas]), [[2, 2]]);
  // Solo una anulación, sin venta: no "se vendió".
  assert.deepEqual(aCero.map((p) => p.productoLocalId), [1, 3]);
  assert.equal(porcentajeDeAvance(3, 3), 50);
  assert.equal(porcentajeDeAvance(2, 1), 66, "truncado: no redondea hacia arriba");
  assert.equal(porcentajeDeAvance(0, 0), null);
});

test("los textos: el menos tipográfico, la coma decimal, y el tiempo sin negativos", () => {
  assert.equal(textoCantidad(-15, "UNIDAD"), "−15 un");
  assert.equal(textoCantidad(1.25, "KG"), "1,25 kg");
  const t = Date.parse("2026-10-20T10:00:00Z");
  assert.equal(haceCuanto(t, t + 5 * 60000), "hace 5 min");
  assert.equal(haceCuanto(t, t + 3 * 3600000), "hace 3 h");
  assert.equal(haceCuanto(t, t - 60000), "hace 0 min");
});

// ── LA PANTALLA, CON LA FORMA REAL ─────────────────────────────────────────

test("C1: control abierto con su avance, quién cuenta, Contar y Terminar", () => {
  const html = dibujar({ estado: real.abierto, vista: VISTA_CONTROL.INICIO });
  assert.match(html, /^STOCK · CONTROL Control de stock Mini el 7/);
  assert.match(html, /CONTROL ABIERTO · DESDE [A-ZÁÉÍÓÚ]+ \d\d\/\d\d \d\d:\d\d 3 productos contados/);
  assert.match(html, /Sin contar 3/);
  assert.match(html, /QUIÉN ESTÁ CONTANDO Ana último escaneo hace \d+ min 2 productos Emanuel último escaneo hace \d+ min 2 productos/);
  assert.match(html, /Contar Terminar control$/);
  const soloContar = dibujar({ estado: real.abierto, vista: VISTA_CONTROL.INICIO }, { gestionar: false });
  assert.doesNotMatch(soloContar, /Terminar control/, "sin gestionar no se ofrece terminar");
});

test("C0: sin control, Empezar solo con gestionar, y el último terminado", () => {
  const html = dibujar({ estado: real.terminado, vista: VISTA_CONTROL.INICIO });
  assert.match(html, /Empezar control ÚLTIMO CONTROL .* Lo cerró Emanuel 2 en 0/);
  assert.doesNotMatch(dibujar({ estado: real.terminado, vista: VISTA_CONTROL.INICIO }, { gestionar: false }), /Empezar control/);
});

test("C2: el escaneado con el aviso y su unidad, y lo que contó esta persona", () => {
  const escaneado = { ...real.productoConAviso.producto, aviso: real.productoConAviso.aviso };
  const html = dibujar({ estado: real.abierto, vista: VISTA_CONTROL.CONTAR, escaneado, cantidad: "1" });
  assert.match(html, /^CONTROL DE STOCK · CONTAR ‹ Contar Mini el 7 · contando: Ana/);
  assert.match(html, /ESCANEADO Coca 2L 7790000000001 Ya contado por Emanuel: 3 un · Lo tuyo se suma Cantidad − \+ un Guardar 1 un/);
  assert.match(html, /LO QUE CONTASTE Sin fila 2 un hace \d+ min Coca 2L 4 un hace \d+ min/);
  assert.match(renderToStaticMarkup(React.createElement(PantallaControlStock, { c: { ...base, estado: real.abierto, vista: VISTA_CONTROL.CONTAR }, puedeGestionar: true, puedeContar: true })), /placeholder="Escaneá o buscá un producto"/);
});

test("C3: los que nadie contó, los vendidos aparte, y el botón dice cuántos quedan en 0", () => {
  const html = dibujar({ estado: real.abierto, vista: VISTA_CONTROL.TERMINAR, terminar: real.terminar });
  assert.match(html, /NADIE LOS CONTÓ Y EL SISTEMA DICE QUE HAY 3 productos Quedan en 0 2 Se vendieron durante el control 1/);
  assert.match(html, /SE VENDIERON DURANTE EL CONTROL Yerba 1kg vendidas 2 · sistema 10 un Contar/);
  assert.match(html, /QUEDAN EN 0 Fideos 4 un → 0 Galletas −15 un → 0/);
  assert.match(html, /Poner 2 en 0 y terminar$/);
  assert.doesNotMatch(html, /Vas a poner/, "la confirmación arranca cerrada");
});

test("C3: el botón abre la confirmación y solo 'Poner en 0' llama al servidor", () => {
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const src = sinComentarios(readFileSync("components/stock_locales/control/PantallaControlStock.jsx", "utf8"));
  const boton = src.slice(src.lastIndexOf("<BotonTesoreria", src.indexOf("en 0 y terminar")), src.indexOf("en 0 y terminar"));
  assert.match(boton, /onClick=\{\(\) => setConfirmando\(true\)\}/, "el botón de abajo tiene que abrir, no terminar");
  assert.equal((src.match(/c\.confirmarTerminar\(/g) || []).length, 1, "un solo lugar llama al servidor");
  assert.match(src, /const alConfirmar = async \(\) => \{\s*await c\.confirmarTerminar\(\);/);
  assert.match(src, /onConfirmar=\{alConfirmar\}/);
  // Y el hook no deja mandar dos.
  const hook = sinComentarios(readFileSync("components/stock_locales/control/useControlStock.js", "utf8"));
  assert.match(hook, /if \(!terminar \|\| terminando\.current\) return;\s*terminando\.current = true;/);
});

test("la confirmación: el texto, Cancelar y Poner en 0, y deshabilitado mientras procesa", () => {
  const abierta = (ocupado) =>
    renderToStaticMarkup(React.createElement(ConfirmarTerminar, { abierto: true, cantidad: 2, ocupado, onCancelar: nada, onConfirmar: nada }));
  // La hoja de confirmación del kit: el texto, y los dos botones grandes.
  assert.match(texto(abierta(false)), /Terminar control .*Vas a poner 2 productos en 0 y terminar el control Poner en 0 Cancelar/);
  assert.match(readFileSync("components/stock_locales/control/PantallaControlStock.jsx", "utf8"), /<SunmiHojaDeConfirmacion\b/);
  const boton = (html, rotulo) => html.match(new RegExp(`<button[^>]*>${rotulo}</button>`))?.[0] || "";
  assert.doesNotMatch(boton(abierta(false), "Poner en 0"), /disabled/);
  assert.match(boton(abierta(true), "Poner en 0"), /disabled/, "procesando, no se puede mandar dos veces");
  assert.equal(renderToStaticMarkup(React.createElement(ConfirmarTerminar, { abierto: false, cantidad: 2, ocupado: false, onCancelar: nada, onConfirmar: nada })), "");
});

// ── DÓNDE SE ENGANCHA ──────────────────────────────────────────────────────

test("los dos permisos existen, los tienen el dueño y el encargado, y no el cajero", () => {
  for (const p of [PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL]) {
    assert.ok(PERMISSION_REGISTRY.some((r) => r.code === p && r.group === "stock"), p);
    assert.ok(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL].includes(p), `DUEÑO_LOCAL sin ${p}`);
    assert.ok(DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes(p), `ENCARGADO sin ${p}`);
    assert.ok(!DEFAULT_PERMISOS_SISTEMA[CAJERO].includes(p), `CAJERO con ${p}`);
  }
});

test("con PIN activo se cuenta pero no se empieza ni se termina: también el Admin", () => {
  // La resta es la de Finanzas: la misma función en la sesión y en `/api/me`.
  assert.ok(PERMISOS_FUERA_DEL_OPERADOR.includes(PERMISO_GESTIONAR_CONTROL));
  assert.ok(!PERMISOS_FUERA_DEL_OPERADOR.includes(PERMISO_CONTAR_CONTROL));
  const cuenta = DEFAULT_PERMISOS_SISTEMA[ENCARGADO];
  assert.deepEqual(permisosDelControl({ permisos: permisosEfectivos(cuenta, false), operadorActivo: false }), { puedeGestionar: true, puedeContar: true });
  assert.deepEqual(permisosDelControl({ permisos: permisosEfectivos(cuenta, true), operadorActivo: true }), { puedeGestionar: false, puedeContar: true });
  assert.deepEqual(permisosDelControl({ permisos: ["*"], operadorActivo: true }), { puedeGestionar: false, puedeContar: true });
  assert.deepEqual(permisosDelControl({ permisos: ["*"], operadorActivo: false }), { puedeGestionar: true, puedeContar: true });
  // En el servidor: checkPerm con la sesión del operador, Admin incluido.
  const sesion = (permisos, operadorActivo) => ({ permisos: permisosEfectivos(permisos, operadorActivo), esAdmin: permisos.includes("*"), operadorActivo });
  assert.equal(checkPerm(sesion(["*"], true), PERMISO_GESTIONAR_CONTROL).ok, false);
  assert.equal(checkPerm(sesion(["*"], true), PERMISO_CONTAR_CONTROL).ok, true);
  assert.equal(checkPerm(sesion(cuenta, true), PERMISO_GESTIONAR_CONTROL).ok, false);
  assert.equal(checkPerm(sesion(cuenta, false), PERMISO_GESTIONAR_CONTROL).ok, true);
});

test("abrir y terminar pasan por la puerta que niega al operador; la página usa la misma regla", () => {
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const leer = (r) => sinComentarios(readFileSync(r, "utf8"));
  // Y la persona es la cuenta: un encargado sin PIN gestiona (con PIN ya se rechazó).
  assert.match(leer("app/api/stock_locales/control/abrir/route.js"), /autorizarControl\(req, PERMISO_GESTIONAR_CONTROL, \{ persona: "cuenta" \}\)/);
  const terminar = leer("app/api/stock_locales/control/terminar/route.js");
  assert.equal((terminar.match(/autorizarControl\(req, PERMISO_GESTIONAR_CONTROL, \{[^}]*persona: "cuenta" \}\)/g) || []).length, 2, "GET y POST");
  const servidor = leer("lib/stock/control/controlStockServer.js");
  assert.match(servidor, /scope\.session\.operadorActivo && pedidos\.every\(\(p\) => p === PERMISO_GESTIONAR_CONTROL\)/);
  assert.match(leer("app/modulos/stock_locales/control/page.jsx"), /permisosDelControl\(perfil\)/);
});

test("el menú: Stock → Control de stock, después de Stock Locales, con cualquiera de los dos", () => {
  const perfil = (permisos) => ({ id: 1, permisos, esAdmin: permisos.includes("*") });
  const stock = (permisos) => construirMenuVisible(perfil(permisos), getGrupoConfig()).find((g) => g.key === "stock");
  const hrefs = (g) => (g?.items || []).map((i) => i.href);
  const dueno = hrefs(stock(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL]));
  assert.equal(dueno[dueno.indexOf("/modulos/stock_locales") + 1], RUTA_CONTROL_STOCK);
  assert.ok(hrefs(stock(["stock.ver", PERMISO_CONTAR_CONTROL])).includes(RUTA_CONTROL_STOCK));
  assert.ok(hrefs(stock(DEFAULT_PERMISOS_SISTEMA[ENCARGADO])).includes(RUTA_CONTROL_STOCK));
  assert.ok(!hrefs(stock(DEFAULT_PERMISOS_SISTEMA[CAJERO].concat("stock.ver"))).includes(RUTA_CONTROL_STOCK));
});

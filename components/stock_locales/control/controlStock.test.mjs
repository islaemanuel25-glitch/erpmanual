// CANDADOS DEL CONTROL DE STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/control/controlStock.test.mjs
//
// El comportamiento contra la base —el campo fija el total, cambiarlo mueve por
// la diferencia y borrarlo deshace el ajuste; la lista con sus chips y el
// lector; el depósito en unidades; terminar con los vendidos aparte; el Libro y
// la bitácora; los permisos y el PIN— lo ejerce scripts/pruebas-db/controlStock.mjs
// con los handlers reales. Acá van las reglas puras, la pantalla dibujada y
// dónde se engancha el módulo (menú y roles).
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// `lecturaReal.fixture.json` son las respuestas REALES de las rutas del control
// que escribe aquel guion (`ESCRIBIR_FIXTURE_CONTROL=1`): la lista de sin contar
// y la de contados de un local, la del depósito con un pack, la coca vista por
// otra persona después de que la contaron, la vista de terminar, el estado
// después de terminar y el de un control recién abierto. No se escribió a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PantallaControlStock, { ConfirmarTerminar } from "@/components/stock_locales/control/PantallaControlStock.jsx";
import TarjetaConteo, { ESTADO_FILA, ResumenDeLaFila } from "@/components/stock_locales/control/TarjetaConteo.jsx";
import { PERMISOS_FUERA_DEL_OPERADOR, permisosEfectivos } from "@/lib/rbac/permisosDelOperador.js";
import { checkPerm } from "@/lib/authorize.js";
import {
  FILTRO_CONTROL,
  MODO_CASILLEROS,
  VISTA_CONTROL,
  ajusteNetoDelConteo,
  casillerosDe,
  casillerosDesdeTotal,
  leerNumero,
  partirNoContados,
  porcentajeDeAvance,
  stockTrasDeshacer,
  stockTrasFijarTotal,
  textoCantidad,
  totalDeCasilleros,
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
const sinComentarios = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const fuente = (r) => sinComentarios(readFileSync(r, "utf8"));
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const nada = () => {};

// El estado de la pantalla con un control abierto: el del fixture, con la lista
// de contados del local.
const conLista = (lista, estado = real.abierto) => ({
  vista: VISTA_CONTROL.INICIO,
  estado: { ...estado, control: { ...estado.control, ...lista.resumen } },
  lista: { items: lista.items, total: lista.total, totalPages: lista.totalPages },
});
const base = {
  cargando: false,
  error: null,
  ocupado: false,
  aviso: null,
  filtro: FILTRO_CONTROL.SIN_CONTAR,
  q: "",
  page: 1,
  lista: { items: [], total: 0, totalPages: 1 },
  cargandoLista: false,
  fijado: null,
  foco: 0,
  buscadorRef: { current: null },
  terminar: null,
  recargar: nada,
  abrir: nada,
  setFiltro: nada,
  buscar: nada,
  setPage: nada,
  escanear: nada,
  irAContar: nada,
  guardarTotal: async () => true,
  alBuscador: nada,
  irATerminar: nada,
  volverAlInicio: nada,
  confirmarTerminar: nada,
};
const html = (c, { gestionar = true } = {}) =>
  renderToStaticMarkup(React.createElement(PantallaControlStock, { c: { ...base, ...c }, puedeGestionar: gestionar }));
const dibujar = (c, opciones) => texto(html(c, opciones));

// ── LAS REGLAS ─────────────────────────────────────────────────────────────

test("el campo es el total: el primero fija, cambiarlo mueve por la diferencia sobre lo que hay", () => {
  assert.deepEqual(stockTrasFijarTotal({ actual: 5, totalAnterior: null, total: 3 }), { nuevo: 3, ajuste: -2 });
  assert.deepEqual(stockTrasFijarTotal({ actual: -15, totalAnterior: null, total: 0 }), { nuevo: 0, ajuste: 15 });
  // Otra persona cambia el total de 3 a 7: el stock sube 4, no se suma lo suyo.
  assert.deepEqual(stockTrasFijarTotal({ actual: 3, totalAnterior: 3, total: 7 }), { nuevo: 7, ajuste: 4 });
  // Se vendió 1 en el medio (7 → 6) y el total baja a 5: se baja 2 sobre los 6.
  assert.deepEqual(stockTrasFijarTotal({ actual: 6, totalAnterior: 7, total: 5 }), { nuevo: 4, ajuste: -2 });
  assert.deepEqual(stockTrasFijarTotal({ actual: 1, totalAnterior: 4, total: 0, allowNegativeStock: false }), { nuevo: 0, ajuste: -1 });
  assert.deepEqual(stockTrasFijarTotal({ actual: 1, totalAnterior: 4, total: 0, allowNegativeStock: true }), { nuevo: -3, ajuste: -4 });
});

test("borrar el campo deshace lo que el control ajustó, y lo vendido sigue descontado", () => {
  const auditorias = [
    { accion: "CONTROL_CONTEO", cantidadAnterior: 5, cantidadNueva: 3 },
    { accion: "CONTROL_CORRECCION", cantidadAnterior: 3, cantidadNueva: 7 },
    { accion: "CONTROL_CORRECCION", cantidadAnterior: 6, cantidadNueva: 4 },
    // El terminar no es un ajuste de conteo: no se deshace.
    { accion: "CONTROL_PUESTO_EN_CERO", cantidadAnterior: 9, cantidadNueva: 0 },
  ];
  assert.equal(ajusteNetoDelConteo(auditorias), 0);
  // Había 5, se vendió 1, y el control no le dejó nada: queda en 4.
  assert.deepEqual(stockTrasDeshacer({ actual: 4, ajusteNeto: 0 }), { nuevo: 4, ajuste: 0 });
  // Había 5, se contaron 3 (−2) y se vendió 1 (2): borrar devuelve los 2 → 4.
  assert.deepEqual(stockTrasDeshacer({ actual: 2, ajusteNeto: -2 }), { nuevo: 4, ajuste: 2 });
});

test("la cantidad: cero vale, negativa no, y las piezas son enteras", () => {
  assert.equal(validarCantidadContada(0, "UNIDAD").ok, true);
  assert.equal(validarCantidadContada(-1, "UNIDAD").ok, false);
  assert.equal(validarCantidadContada(1.5, "PIEZA").ok, false);
  assert.equal(validarCantidadContada(1.25, "KG").cantidad, 1.25);
});

test("los casilleros: uno en la unidad del local, bultos y sueltas en el depósito, como lo lee Stock", () => {
  const local = real.listaContados.items;
  const coca = local.find((i) => i.nombre === "Coca 2L");
  const queso = local.find((i) => i.nombre === "Queso por kg");
  assert.deepEqual(casillerosDe(coca, false), { modo: MODO_CASILLEROS.SIMPLE, unidadFisica: "UNIDAD", unidad: "un", decimales: false });
  assert.deepEqual(casillerosDe(queso, false), { modo: MODO_CASILLEROS.SIMPLE, unidadFisica: "KG", unidad: "kg", decimales: true });
  const agua = real.listaDeposito.items.find((i) => i.nombre === "Agua x6");
  assert.deepEqual(casillerosDe(agua, true), { modo: MODO_CASILLEROS.DESGLOSE, factorPack: 6, unidadFisica: "UNIDAD" });
  // El mismo pack en un LOCAL no se desglosa: Stock lo lee en unidades.
  assert.equal(casillerosDe(agua, false).modo, MODO_CASILLEROS.SIMPLE);
  // El fiambre de peso fijo en el depósito, en piezas.
  const fiambre = { unidadMedida: "kg", modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 0.4, modoCompraProveedor: "UNIDAD", factorPack: 1 };
  assert.equal(casillerosDe(fiambre, true).unidad, "pzs");
});

test("el total de los casilleros: bultos × factor + sueltas, la coma decimal, y vacío vuelve a sin contar", () => {
  const pack = { modo: MODO_CASILLEROS.DESGLOSE, factorPack: 6 };
  assert.deepEqual(totalDeCasilleros({ bultos: "4", sueltas: "3" }, pack), { total: 27 });
  assert.deepEqual(totalDeCasilleros({ bultos: "4", sueltas: "" }, pack), { total: 24 });
  assert.deepEqual(totalDeCasilleros({ bultos: "", sueltas: "" }, pack), { vacio: true });
  assert.deepEqual(totalDeCasilleros({ bultos: "1,5", sueltas: "" }, pack), { invalido: true });
  assert.deepEqual(casillerosDesdeTotal(27, pack), { bultos: "4", sueltas: "3" });
  const kg = { modo: MODO_CASILLEROS.SIMPLE, decimales: true };
  assert.deepEqual(totalDeCasilleros({ valor: "1,25" }, kg), { total: 1.25 });
  assert.deepEqual(casillerosDesdeTotal(1.25, kg), { valor: "1,25" });
  const un = { modo: MODO_CASILLEROS.SIMPLE, decimales: false };
  assert.deepEqual(totalDeCasilleros({ valor: "2,5" }, un), { invalido: true });
  assert.deepEqual(totalDeCasilleros({ valor: "-1" }, un), { invalido: true });
  assert.deepEqual(totalDeCasilleros({ valor: "  " }, un), { vacio: true });
  assert.equal(leerNumero("abc"), Number.NaN);
});

test("terminar parte en vendidos y los que quedan en cero, y el avance sale del mismo universo", () => {
  const ventas = new Map([[2, { vendio: true, vendidas: 2 }], [3, { vendio: false, vendidas: -1 }]]);
  const { vendidos, aCero } = partirNoContados([{ productoLocalId: 1, stock: 4 }, { productoLocalId: 2, stock: 10 }, { productoLocalId: 3, stock: 1 }], ventas);
  assert.deepEqual(vendidos.map((p) => [p.productoLocalId, p.vendidas]), [[2, 2]]);
  assert.deepEqual(aCero.map((p) => p.productoLocalId), [1, 3]);
  assert.equal(porcentajeDeAvance(3, 3), 50);
  assert.equal(porcentajeDeAvance(2, 1), 66, "truncado: no redondea hacia arriba");
  assert.equal(porcentajeDeAvance(0, 0), null);
  assert.equal(textoCantidad(-15, "UNIDAD"), "−15 un");
});

// ── LA PANTALLA, CON LA FORMA REAL ─────────────────────────────────────────

test("control abierto: encabezado, avance, buscador, chips y la lista; sin 'Quién está contando' ni 'Guardar'", () => {
  const t = dibujar({ ...conLista(real.listaSinContar) });
  assert.match(t, /^STOCK · CONTROL Control de stock Mini el 7 · abierto desde [a-záéíóú]+ \d\d\/\d\d /);
  const { contados, sinContar } = real.listaSinContar.resumen;
  assert.match(t, new RegExp(`${contados} contados de ${contados + sinContar}`));
  assert.match(html({ ...conLista(real.listaSinContar) }), /placeholder="Escaneá o buscá un producto"/);
  assert.match(t, new RegExp(`Todos Sin contar · ${sinContar} Contados · ${contados}`));
  assert.match(t, /Fideos .*STOCK · Unidad 4 .*Sin contar/);
  assert.match(t, /Terminar control$/);
  assert.doesNotMatch(t, /QUIÉN ESTÁ CONTANDO|ESCANEADO|Guardar|Ajustar|Límites/);
  assert.doesNotMatch(dibujar({ ...conLista(real.listaSinContar) }, { gestionar: false }), /Terminar control/);
});

test("el chip activo por defecto es Sin contar", () => {
  const h = html({ ...conLista(real.listaSinContar) });
  const chip = h.match(/<button[^>]*aria-pressed="true"[^>]*>([\s\S]*?)<\/button>/)?.[1] || "";
  assert.match(texto(chip), /^Sin contar ·/);
});

test("una tarjeta contada: la de Stock arriba, '✓ Contado' con quién y la hora, y el campo en positivo con el total", () => {
  const coca = real.cocaContadaPorOtro.item;
  const h = renderToStaticMarkup(React.createElement(TarjetaConteo, { item: coca, esDeposito: false, onGuardar: nada }));
  const t = texto(h);
  // Lo de arriba es exactamente lo de Stock, mín y máx incluidos.
  assert.match(t, /^Coca 2L Coca-Cola FEMSA mín Sin ajustar · máx Sin ajustar STOCK · Unidad 3 uds 7790000000001 ✓ Contado Emanuel · \d\d:\d\d un$/);
  assert.match(h, /data-fila-conteo="contado"/);
  assert.match(h, /<input[^>]*class="[^"]*sunmi-state-success[^"]*"[^>]*value="3"/);
});

test("una tarjeta sin contar: 'Sin contar' y el campo vacío", () => {
  const fideos = real.listaSinContar.items.find((i) => i.nombre === "Fideos");
  const h = renderToStaticMarkup(React.createElement(TarjetaConteo, { item: fideos, esDeposito: false, onGuardar: nada }));
  assert.match(h, /data-fila-conteo="sin_contar"/);
  assert.match(texto(h), /Sin contar un$/);
  assert.match(h, /<input[^>]*value=""/);
});

test("en el depósito, un pack: el stock como Stock ('6 bultos + 4 uds') y dos casilleros", () => {
  const agua = real.listaDeposito.items.find((i) => i.nombre === "Agua x6");
  const h = renderToStaticMarkup(React.createElement(TarjetaConteo, { item: agua, esDeposito: true, onGuardar: nada }));
  const t = texto(h);
  assert.match(t, /STOCK · Pack x6 6 bultos \+ 4 uds/);
  assert.match(t, /bultos .*sueltas/);
  assert.equal((h.match(/<input/g) || []).length, 2);
  assert.match(h, /aria-label="Bultos contados"/);
  assert.match(h, /aria-label="Sueltas contadas"/);
});

test("los rótulos de la fila: escribiendo dice el total en unidades, y si falla 'No se guardó'", () => {
  const r = (estado, extra = {}) => texto(renderToStaticMarkup(React.createElement(ResumenDeLaFila, { estado, ...extra })));
  assert.equal(r(ESTADO_FILA.ESCRIBIENDO, { igualA: "27 un" }), "Contado = 27 un");
  assert.equal(r(ESTADO_FILA.ERROR), "No se guardó");
  assert.equal(r(ESTADO_FILA.SIN_CONTAR), "Sin contar");
});

test("la tarjeta es la de Stock: sin Ajustar ni Límites, el lector con la regla de la caja, y se guarda sin botón", () => {
  const src = fuente("components/stock_locales/control/TarjetaConteo.jsx");
  assert.match(src, /<TarjetaStockMovil\b[\s\S]*filaDeAbajo=\{fila\}/);
  assert.match(src, /esLecturaDeEscaner\(ms, r\.texto\)/, "el lector se reconoce como en la caja");
  assert.match(src, /onBlur=\{alSalir\}/, "se guarda al salir del campo");
  assert.doesNotMatch(src, /<SunmiButton|<button/, "no hay botón Guardar");
  const tarjeta = fuente("components/stock_locales/TarjetaStockMovil.jsx");
  assert.match(tarjeta, /filaDeAbajo \? \(\s*filaDeAbajo\s*\) : puedeAjustar/, "con la fila del conteo no van Ajustar ni Límites");
});

test("C0: sin control, Empezar solo con gestionar, y el último terminado", () => {
  const t = dibujar({ estado: real.terminado, vista: VISTA_CONTROL.INICIO });
  assert.match(t, /Empezar control ÚLTIMO CONTROL .* Lo cerró Emanuel 2 en 0/);
  assert.doesNotMatch(dibujar({ estado: real.terminado, vista: VISTA_CONTROL.INICIO }, { gestionar: false }), /Empezar control/);
});

test("C3: los que nadie contó, los vendidos aparte, y el botón dice cuántos quedan en 0", () => {
  const t = dibujar({ estado: real.abierto, vista: VISTA_CONTROL.TERMINAR, terminar: real.terminar });
  assert.match(t, /NADIE LOS CONTÓ Y EL SISTEMA DICE QUE HAY 3 productos Quedan en 0 2 Se vendieron durante el control 1/);
  assert.match(t, /SE VENDIERON DURANTE EL CONTROL Yerba 1kg vendidas 2 · sistema 10 un Contar/);
  assert.match(t, /QUEDAN EN 0 Fideos 4 un → 0 Galletas −15 un → 0/);
  assert.match(t, /Poner 2 en 0 y terminar$/);
  assert.doesNotMatch(t, /Vas a poner/, "la confirmación arranca cerrada");
});

test("C3: el botón abre la confirmación y solo 'Poner en 0' llama al servidor", () => {
  const src = fuente("components/stock_locales/control/PantallaControlStock.jsx");
  const boton = src.slice(src.lastIndexOf("<BotonTesoreria", src.indexOf("en 0 y terminar")), src.indexOf("en 0 y terminar"));
  assert.match(boton, /onClick=\{\(\) => setConfirmando\(true\)\}/, "el botón de abajo tiene que abrir, no terminar");
  assert.equal((src.match(/c\.confirmarTerminar\(/g) || []).length, 1, "un solo lugar llama al servidor");
  assert.match(src, /const alConfirmar = async \(\) => \{\s*await c\.confirmarTerminar\(\);/);
  assert.match(src, /onConfirmar=\{alConfirmar\}/);
  const hook = fuente("components/stock_locales/control/useControlStock.js");
  assert.match(hook, /if \(!terminar \|\| terminando\.current\) return;\s*terminando\.current = true;/);
});

test("la confirmación: el texto, Cancelar y Poner en 0, y deshabilitado mientras procesa", () => {
  const abierta = (ocupado) =>
    renderToStaticMarkup(React.createElement(ConfirmarTerminar, { abierto: true, cantidad: 2, ocupado, onCancelar: nada, onConfirmar: nada }));
  assert.match(texto(abierta(false)), /Terminar control .*Vas a poner 2 productos en 0 y terminar el control Poner en 0 Cancelar/);
  assert.match(readFileSync("components/stock_locales/control/PantallaControlStock.jsx", "utf8"), /<SunmiHojaDeConfirmacion\b/);
  const boton = (h, rotulo) => h.match(new RegExp(`<button[^>]*>${rotulo}</button>`))?.[0] || "";
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
  assert.ok(PERMISOS_FUERA_DEL_OPERADOR.includes(PERMISO_GESTIONAR_CONTROL));
  assert.ok(!PERMISOS_FUERA_DEL_OPERADOR.includes(PERMISO_CONTAR_CONTROL));
  const cuenta = DEFAULT_PERMISOS_SISTEMA[ENCARGADO];
  assert.deepEqual(permisosDelControl({ permisos: permisosEfectivos(cuenta, false), operadorActivo: false }), { puedeGestionar: true, puedeContar: true });
  assert.deepEqual(permisosDelControl({ permisos: permisosEfectivos(cuenta, true), operadorActivo: true }), { puedeGestionar: false, puedeContar: true });
  assert.deepEqual(permisosDelControl({ permisos: ["*"], operadorActivo: true }), { puedeGestionar: false, puedeContar: true });
  const sesion = (permisos, operadorActivo) => ({ permisos: permisosEfectivos(permisos, operadorActivo), esAdmin: permisos.includes("*"), operadorActivo });
  assert.equal(checkPerm(sesion(["*"], true), PERMISO_GESTIONAR_CONTROL).ok, false);
  assert.equal(checkPerm(sesion(["*"], true), PERMISO_CONTAR_CONTROL).ok, true);
  assert.equal(checkPerm(sesion(cuenta, false), PERMISO_GESTIONAR_CONTROL).ok, true);
});

test("abrir y terminar pasan por la puerta que niega al operador; la página usa la misma regla", () => {
  assert.match(fuente("app/api/stock_locales/control/abrir/route.js"), /autorizarControl\(req, PERMISO_GESTIONAR_CONTROL, \{ persona: "cuenta" \}\)/);
  const terminar = fuente("app/api/stock_locales/control/terminar/route.js");
  assert.equal((terminar.match(/autorizarControl\(req, PERMISO_GESTIONAR_CONTROL, \{[^}]*persona: "cuenta" \}\)/g) || []).length, 2, "GET y POST");
  assert.match(fuente("lib/stock/control/controlStockServer.js"), /scope\.session\.operadorActivo && pedidos\.every\(\(p\) => p === PERMISO_GESTIONAR_CONTROL\)/);
  assert.match(fuente("app/modulos/stock_locales/control/page.jsx"), /permisosDelControl\(perfil\)/);
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

test("las rutas de la versión anterior se fueron: no hay 'sumar' ni 'corregir lo propio'", () => {
  const archivos = ["app/api/stock_locales/control/producto/route.js", "app/api/stock_locales/control/conteos/[id]/route.js"];
  for (const a of archivos) assert.throws(() => readFileSync(a), `${a} tendría que no existir`);
  const conteos = fuente("app/api/stock_locales/control/conteos/route.js");
  assert.match(conteos, /export async function PUT\(/);
  assert.doesNotMatch(conteos, /export async function (POST|PATCH|DELETE)\(/);
});

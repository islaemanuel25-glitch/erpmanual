// CANDADOS DEL CONTROL DE STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/control/controlStock.test.mjs
//
// El comportamiento contra la base —el campo fija el total, cambiarlo mueve por
// la diferencia y borrarlo deshace el ajuste; "Está bien"; la lista de Stock
// Locales con sus chips y el lector; el depósito en unidades y su plata por
// bulto; terminar con los vendidos aparte; las diferencias vivas y congeladas;
// el Libro y la bitácora; los permisos y el PIN— lo ejerce
// scripts/pruebas-db/controlStock.mjs con los handlers reales. Acá van las reglas
// puras, la pantalla dibujada y dónde se engancha el módulo (menú y roles).
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// `lecturaReal.fixture.json` son las respuestas REALES de las rutas que escribe
// aquel guion (`ESCRIBIR_FIXTURE_CONTROL=1`): el listado de Stock con el chip
// —sin contar, contados, con diferencia, el del depósito—, la coca vista por
// otra persona, la vista de terminar, el estado después de terminar y el de uno
// recién abierto, y los informes de diferencias —abierto, sin plata, congelado y
// del depósito—. No se escribió a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PantallaControlStock, { ConfirmarTerminar, InformeDeDiferencias, StockQueNoCoincide } from "@/components/stock_locales/control/PantallaControlStock.jsx";
import TarjetaConteo, { ESTADO_FILA, EncabezadoDeLaFila } from "@/components/stock_locales/control/TarjetaConteo.jsx";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad.jsx";
import { NumeroBloqueValor } from "@/components/sunmi/SunmiProductoCard.jsx";
import { PERMISOS_FUERA_DEL_OPERADOR, permisosEfectivos } from "@/lib/rbac/permisosDelOperador.js";
import { checkPerm } from "@/lib/authorize.js";
import {
  FILTRO_CONTROL,
  MODO_CASILLEROS,
  VISTA_CONTROL,
  DECISION_NO_CONTADOS,
  esDecisionNoContados,
  textoQuedaronComoEstaban,
  ajusteNetoDelConteo,
  casillerosDe,
  casillerosDesdeTotal,
  diferenciaDe,
  leerNumero,
  ordenarDiferencias,
  partirNoContados,
  porcentajeDeAvance,
  revisionDelProducto,
  stockTrasDeshacer,
  stockTrasFijarTotal,
  textoCantidad,
  textoDeLaDiferencia,
  totalDeCasilleros,
  totalesDeDiferencias,
  validarCantidadContada,
} from "@/lib/stock/control/controlStock.js";
import { valorDeLaDiferencia } from "@/lib/stock/control/valorDeLaDiferencia.js";
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
const texto = (html) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const nada = () => {};

// El estado de la pantalla con un control abierto: el del fixture, con un
// listado de Stock pedido con el chip.
const conLista = (lista, estado = real.abierto) => ({
  vista: VISTA_CONTROL.INICIO,
  estado,
  items: lista.items,
  totalPages: lista.totalPages,
  totalItems: lista.total,
  contadores: lista.resumenControl,
});
const base = {
  cargando: false,
  error: null,
  ocupado: false,
  aviso: null,
  chip: FILTRO_CONTROL.TODOS,
  page: 1,
  items: [],
  totalPages: 1,
  totalItems: 0,
  cargandoLista: false,
  errorLista: "",
  contadores: null,
  fijado: null,
  foco: 0,
  buscadorRef: { current: null },
  terminar: null,
  diferencias: null,
  recargar: nada,
  abrir: nada,
  alCambiarFiltros: nada,
  alLimpiar: nada,
  setChip: nada,
  setPage: nada,
  escanear: nada,
  escanearDesdeLaCantidad: nada,
  irAContar: nada,
  guardarTotal: async () => true,
  alBuscador: nada,
  irATerminar: nada,
  verDiferencias: nada,
  volverAlInicio: nada,
  confirmarTerminar: nada,
};
const html = (c, { gestionar = true } = {}) =>
  renderToStaticMarkup(React.createElement(PantallaControlStock, { c: { ...base, ...c }, puedeGestionar: gestionar }));
const dibujar = (c, opciones) => texto(html(c, opciones));
const tarjeta = (item, esDeposito = false) => renderToStaticMarkup(React.createElement(TarjetaConteo, { item, esDeposito, onGuardar: nada }));
const de = (lista, nombre) => lista.items.find((i) => i.nombre === nombre);

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
  assert.deepEqual(stockTrasDeshacer({ actual: 4, ajusteNeto: 0 }), { nuevo: 4, ajuste: 0 });
  assert.deepEqual(stockTrasDeshacer({ actual: 2, ajusteNeto: -2 }), { nuevo: 4, ajuste: 2 });
});

test("la cantidad: cero vale, negativa no, y las piezas son enteras", () => {
  assert.equal(validarCantidadContada(0, "UNIDAD").ok, true);
  assert.equal(validarCantidadContada(-1, "UNIDAD").ok, false);
  assert.equal(validarCantidadContada(1.5, "PIEZA").ok, false);
  assert.equal(validarCantidadContada(1.25, "KG").cantidad, 1.25);
});

test("los casilleros: uno en la unidad del local, bultos y sueltas en el depósito, como lo lee Stock", () => {
  const coca = de(real.listaContados, "Coca 2L");
  const queso = de(real.listaContados, "Queso por kg");
  assert.deepEqual(casillerosDe(coca, false), { modo: MODO_CASILLEROS.SIMPLE, unidadFisica: "UNIDAD", unidad: "un", decimales: false });
  assert.deepEqual(casillerosDe(queso, false), { modo: MODO_CASILLEROS.SIMPLE, unidadFisica: "KG", unidad: "kg", decimales: true });
  const agua = de(real.listaDeposito, "Agua x6");
  assert.deepEqual(casillerosDe(agua, true), { modo: MODO_CASILLEROS.DESGLOSE, factorPack: 6, unidadFisica: "UNIDAD" });
  // El mismo pack en un LOCAL no se desglosa: Stock lo lee en unidades.
  assert.equal(casillerosDe(agua, false).modo, MODO_CASILLEROS.SIMPLE);
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
  assert.deepEqual(totalDeCasilleros({ valor: "1," }, kg), { total: 1 }, "la coma a medio escribir vale el entero");
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

test("la diferencia es contado − sistema, y se dice Faltan, Sobran o Sin diferencia", () => {
  assert.equal(diferenciaDe({ sistema: 4, contado: 2 }), -2);
  assert.equal(diferenciaDe({ sistema: -15, contado: 0 }), 15, "un negativo puesto en 0 es sobrante");
  assert.deepEqual(textoDeLaDiferencia(-2, "UNIDAD"), { texto: "Faltan 2 un", tono: "danger" });
  assert.deepEqual(textoDeLaDiferencia(1.25, "KG"), { texto: "Sobran 1,25 kg", tono: "warning" });
  assert.deepEqual(textoDeLaDiferencia(0, "UNIDAD"), { texto: "Sin diferencia", tono: "success" });
  // La forma real: cada conteo que llega con el listado ya trae su diferencia.
  for (const i of real.listaContados.items) assert.equal(i.conteo.diferencia, diferenciaDe({ sistema: i.conteo.sistema, contado: i.conteo.total }), i.nombre);
});

test("el informe: primero los faltantes por la plata que falta, después los sobrantes; los totales solo suman pesos", () => {
  const congelado = real.diferenciasCongeladas;
  const revueltas = [...congelado.filas].reverse();
  assert.deepEqual(ordenarDiferencias(revueltas).map((f) => f.nombre), congelado.filas.map((f) => f.nombre));
  assert.deepEqual(congelado.filas.map((f) => f.nombre), ["Fideos", "Coca 2L", "Queso por kg", "Galletas", "Sin fila"]);
  assert.deepEqual(totalesDeDiferencias(congelado.filas), congelado.totales);
  // Sin costo no vale cero: no suma y se cuenta aparte.
  assert.deepEqual(totalesDeDiferencias([{ diferencia: -2, importe: null }, { diferencia: 3, importe: 300 }, { diferencia: 0, importe: 0 }]), {
    faltante: 0,
    sobrante: 300,
    productos: 2,
    sinCosto: 1,
  });
  const sinImporte = ordenarDiferencias([{ nombre: "B", diferencia: -1, importe: null }, { nombre: "A", diferencia: -1, importe: -10 }]);
  assert.deepEqual(sinImporte.map((f) => f.nombre), ["A", "B"], "los sin costo van al final de su grupo");
});

test("la plata de una diferencia: las mismas funciones y la misma escala que Valor del stock", () => {
  // Un pack de 6 con el costo por bulto: $6.000 el pack, $1.000 la unidad física.
  const pack = { unidad_medida: "pack", factor_pack: 6, precio_costo: 6000 };
  assert.deepEqual(valorDeLaDiferencia({ diferencia: -2, base: pack, costoLocal: 6000, esDeposito: true }), { costoUnitario: 1000, importe: -2000 });
  const kg = { unidad_medida: "kg", factor_pack: 1, precio_costo: 8000 };
  assert.deepEqual(valorDeLaDiferencia({ diferencia: 0.25, base: kg, costoLocal: null, esDeposito: false }), { costoUnitario: 8000, importe: 2000 });
  assert.deepEqual(valorDeLaDiferencia({ diferencia: -1, base: { ...kg, precio_costo: 0 }, costoLocal: 0, esDeposito: false }), { costoUnitario: null, importe: null });
  const src = fuente("lib/stock/control/valorDeLaDiferencia.js");
  assert.match(src, /from "\.\.\/\.\.\/conversiones\/costoPorUnidadFisica\.js"/);
  assert.match(src, /from "\.\.\/libro\/valorDelStock\.js"/);
  assert.match(fuente("lib/stock/libro/valorDelStock.js"), /costoPorUnidadFisica/, "Valor del stock usa la misma conversión");
  // El depósito real: 600 el pack de 6 son 100 la unidad.
  assert.equal(real.diferenciasDeposito.filas[0].costoUnitario, 100);
});

// ── LAS PIEZAS DEL KIT QUE SE TOCARON ──────────────────────────────────────

test("el número del stock: entero en una línea, salvo que la pantalla pida que baje de renglón", () => {
  const n = (className) => renderToStaticMarkup(React.createElement(NumeroBloqueValor, { className }, "4 bultos"));
  assert.match(n(""), /class="[^"]*whitespace-nowrap/);
  assert.match(n("sunmi-text-danger"), /class="[^"]*whitespace-nowrap/);
  assert.doesNotMatch(n("whitespace-normal"), /whitespace-nowrap/, "la pantalla declaró el eje y la pieza cede");
});

/** El input de un `SunmiCampoCantidad`: la pieza no tiene estado, se recorre su árbol. */
function inputDe(props) {
  const buscar = (el) => {
    if (!el || typeof el !== "object") return null;
    if (el.props?.onChange) return el;
    for (const h of [].concat(el.props?.children ?? [])) {
      const r = buscar(h);
      if (r) return r;
    }
    return null;
  };
  return buscar(SunmiCampoCantidad(props));
}

test("la cantidad del kit: el kilo con coma se queda como se escribió, y sin la prop sigue como en la caja", () => {
  const escrito = [];
  const kg = { valor: "", onCambiar: (v) => escrito.push(v), etiqueta: "Contado", minimo: 0, decimales: 3, tipo: "text", conservaLoEscrito: true };
  const input = inputDe(kg);
  for (const v of ["1,", "1,2", "1,250", "1,2505", "abc"]) input.props.onChange({ target: { value: v } });
  assert.deepEqual(escrito, ["1,", "1,2", "1,250"], "lo que no es un número a medio escribir no entra");
  const caja = [];
  inputDe({ ...kg, conservaLoEscrito: false, onCambiar: (v) => caja.push(v) }).props.onChange({ target: { value: "1,5" } });
  assert.deepEqual(caja, ["1.5"], "la caja sigue pasando la coma a punto");
});

// ── LA PANTALLA, CON LA FORMA REAL ─────────────────────────────────────────

// Lo que se ve y se toca de la parte de arriba —la cabecera, el buscador, los
// filtros, la categoría, el "⋯" y la barra de abajo— está en
// tarjetaConteo.toque.test.mjs, montado en un DOM. Acá, el cableado.

test("control abierto: armado con las piezas de recibir transferencia, y sin lo de Stock Locales", () => {
  const pantalla = fuente("components/stock_locales/control/PantallaControlStock.jsx");
  assert.match(pantalla, /<SunmiPantallaDeTrabajo\b/);
  assert.match(pantalla, /<SunmiFiltroEstado\b/);
  assert.match(pantalla, /<SunmiCampoBusquedaVoz\b[\s\S]*placeholder=\{PLACEHOLDER_BUSCADOR\}/);
  assert.match(pantalla, /import \{ PLACEHOLDER_BUSCADOR, TITULO_MAS_ACCIONES \} from "@\/components\/transferencias\/RecepcionMovil"/, "los textos de transferencias, no copias");
  assert.doesNotMatch(pantalla, /<FiltrosStock\b|<SunmiChipsFiltro\b|BarraDeAvance|etiqueta="STOCK · CONTROL"/);
  const t = dibujar(conLista(real.listaSinContar));
  assert.doesNotMatch(t, /QUIÉN ESTÁ CONTANDO|Guardar|Ajustar|Límites|Más filtros|Limpiar/);
});

test("el chip de entrada es Sin contar", () => {
  const src = fuente("components/stock_locales/control/useControlStock.js");
  assert.match(src, /const \[chip, setChipCrudo\] = useState\(FILTRO_CONTROL\.SIN_CONTAR\)/);
});

test("la lista es la de Stock Locales: useStockData con el chip en `control`, y el universo de la misma función", () => {
  const hook = fuente("components/stock_locales/control/useControlStock.js");
  assert.match(hook, /useStockData\(\{/);
  assert.match(hook, /\{ \.\.\.filtros, control: chip, \.\.\.\(filtros\.q && filtros\.q === ultimaLectura \? \{ lectura: true \} : \{\}\) \}/);
  assert.doesNotMatch(hook, /\/control\/productos\?\$\{qs\}/, "ya no hay una lista propia del control");
  assert.match(fuente("hooks/useStockData.js"), /if \(filtro\.control\) params\.set\("control", filtro\.control\)/);
  // El listado y el control piden el universo a la MISMA función.
  assert.equal((fuente("app/api/stock_locales/listar/route.js").match(/whereUniversoStock\(localId, (false|true)\)/g) || []).length, 2);
  assert.match(fuente("lib/stock/control/controlStockServer.js"), /whereUniversoStock\(localId, esDeposito\)/);
  // FiltrosStock vuelve a ser solo de Stock Locales: sin lo que le había agregado el control.
  assert.doesNotMatch(fuente("components/stock_locales/FiltrosStock.jsx"), /onEscanear|textoDesdeAfuera/);
});

test("el lector: el código queda en el buscador y el listado lo resuelve como la caja", () => {
  const hook = fuente("components/stock_locales/control/useControlStock.js");
  assert.match(hook, /const escanear = useCallback\(\(codigo\) => \{\s*const t = String\(codigo\)\.trim\(\);\s*setUltimaLectura\(t\);\s*setTexto\(t\);/);
  const listar = fuente("app/api/stock_locales/listar/route.js");
  assert.equal((listar.match(/rankearComoLaCaja\(/g) || []).length, 1, "el texto, con la búsqueda de la caja");
  assert.match(fuente("app/api/pos-ventas/buscar-producto/route.js"), /rankings = rankearComoLaCaja\(candidatos, q\);/, "la caja usa la misma");
});

test("la categoría cuenta sobre el universo del control", () => {
  const n = real.listaSinContar.resumenControl;
  assert.ok(Array.isArray(n.categorias), "el resumen trae las categorías");
  assert.deepEqual(n.categorias.map((c) => [c.nombre, c.cantidad]), [["Bebidas", 1]]);
});

test("salir con cantidades sin aceptar usa el aviso que salió del editor de correcciones", () => {
  const editor = fuente("components/reportes-ventas/EditorVentaCorreccion.jsx");
  assert.match(editor, /useAvisoAlSalir\(\{/);
  assert.doesNotMatch(editor, /addEventListener\("(beforeunload|popstate)"/, "sin la copia de antes");
  assert.match(fuente("components/stock_locales/control/PantallaControlStock.jsx"), /useAvisoAlSalir\(\{\s*activo: c\.sinAceptar > 0,\s*interceptarEnlaces: true,/);
});

test("una tarjeta contada: '✓ Contado · quién · hora', Sistema · Contado · Faltan, y el campo sigue editable", () => {
  const coca = de(real.listaContados, "Coca 2L");
  const h = renderToStaticMarkup(React.createElement(TarjetaConteo, { item: coca, esDeposito: false, proveedorNombre: "Coca-Cola FEMSA", onGuardar: nada }));
  const t = texto(h);
  assert.match(t, /^Coca 2L Coca-Cola FEMSA mín Sin ajustar · máx Sin ajustar STOCK · Unidad 2 uds 7790000000001 ✓ Contado · Emanuel · \d\d:\d\d /);
  assert.match(t, /Sistema 4 · Contado 2 · Faltan 2 un$/);
  assert.match(h, /data-fila-conteo="contado"/);
  assert.match(h, /<input[^>]*class="[^"]*sunmi-state-success[^"]*"[^>]*value="2"/);
  assert.doesNotMatch(h, /<input[^>]* disabled=""/);
  assert.doesNotMatch(t, /Está bien/);
  assert.match(h, /<span class="font-semibold sunmi-text-danger">Faltan 2 un<\/span>/);
});

test("Sobran en advertencia y Sin diferencia en positivo", () => {
  assert.match(tarjeta(de(real.listaContados, "Sin fila")), /<span class="font-semibold sunmi-text-warning">Sobran 2 un<\/span>/);
  assert.match(tarjeta(de(real.listaContados, "Aceite 900")), /<span class="font-semibold sunmi-text-success">Sin diferencia<\/span>/);
});

test("una tarjeta sin contar: 'Está bien', y la caja vacía teñida para verse contra la tarjeta", () => {
  const h = tarjeta(de(real.listaSinContar, "Fideos"));
  assert.match(h, /data-fila-conteo="sin_contar"/);
  assert.match(texto(h), /Sin contar Está bien − \+ un$/);
  assert.match(h, /<input[^>]*class="[^"]*sunmi-state-warning[^"]*"[^>]*value=""/);
  assert.match(h, /<span class="min-w-0 rounded-lg flex-1 [^"]*border sunmi-divider">/, "con el marco de recibir transferencias, a lo ancho");
});

test("los campos grandes: − y + de 44 × 44, el número grande y del mismo alto, a lo ancho de la fila", () => {
  const h = tarjeta(de(real.listaSinContar, "Fideos"));
  const botones = h.match(/<button type="button" class="[^"]*pos-control[^"]*"/g) || [];
  assert.equal(botones.length, 2);
  for (const b of botones) assert.match(b, / min-w-toque min-h-toque /, "el token de toque, 44 px escritos en px");
  assert.match(h, /<input[^>]*class="[^"]*min-h-toque text-xl2 font-semibold/, "el campo del alto de los botones, con el número grande");
  assert.match(h, /<div class="flex w-full items-center gap-1">/, "la pieza toma el ancho de la fila");
  assert.match(h, /<button[^>]*class="[^"]*min-h-toque[^"]*"[^>]*>Está bien<\/button>/, "'Está bien' del alto de los campos");
  assert.doesNotMatch(fuente("components/stock_locales/control/TarjetaConteo.jsx"), /tamano=\{desglose|claseMarco=/, "el tamaño lo pone el kit, no la pantalla");
});

test("el tamaño grande es una opción del kit: los otros dos quedan letra por letra", () => {
  const boton = (tamano) => renderToStaticMarkup(React.createElement(SunmiCampoCantidad, { valor: "1", onCambiar: nada, etiqueta: "X", tamano })).match(/<button[^>]*>/)[0];
  assert.match(boton("normal"), /class="flex items-center justify-center w-9 h-9 rounded pos-control text-sm font-bold transition-colors select-none shrink-0"/);
  assert.match(boton("compacto"), /class="flex items-center justify-center w-7 h-7 rounded pos-control text-sm font-bold transition-colors select-none shrink-0"/);
  assert.match(boton("grande"), /class="flex items-center justify-center min-w-toque min-h-toque rounded pos-control text-lg font-bold transition-colors select-none shrink-0"/);
  const sinAncho = renderToStaticMarkup(React.createElement(SunmiCampoCantidad, { valor: "1", onCambiar: nada, etiqueta: "X" }));
  assert.match(sinAncho, /^<div class="flex items-center gap-1">/);
  assert.doesNotMatch(sinAncho, /flex-1|min-h-toque|text-xl2/);
});

test("con el sistema en negativo no hay 'Está bien': hay que poner lo que hay", () => {
  const galletas = de(real.listaSinContar, "Galletas");
  assert.equal(galletas.stock, -15);
  assert.doesNotMatch(texto(tarjeta(galletas)), /Está bien/);
  assert.match(fuente("lib/stock/control/controlStockServer.js"), /TEXTO_ESTA_BIEN_NEGATIVO/);
});

test("el kilo: campo de texto con coma y tres decimales", () => {
  const h = tarjeta(de(real.listaContados, "Queso por kg"));
  assert.match(h, /<input[^>]*type="text"[^>]*inputMode="decimal"[^>]*value="1,25"/);
  assert.match(texto(h), /Faltan 1,25 kg$/);
});

test("en el depósito, un pack: el stock en dos renglones, '= 40 un' debajo y dos casilleros", () => {
  const agua = de(real.listaDeposito, "Agua x6");
  const h = tarjeta(agua, true);
  const t = texto(h);
  assert.match(t, /STOCK · Pack x6 6 bultos 4 uds = 40 un/);
  // Los casos largos y el ancho están en components/stock_locales/tarjetaStockDesglose.dom.test.mjs.
  assert.match(h, /<span data-renglon-stock="" class="block">6 bultos<\/span><span data-renglon-stock="" class="block">4 uds<\/span>/, "un renglón por parte, sin +");
  assert.match(t, /bultos .*sueltas/);
  assert.equal((h.match(/<input/g) || []).length, 2);
  assert.match(h, /aria-label="Bultos contados"/);
  assert.match(h, /aria-label="Sueltas contadas"/);
  // En 360 px la fila tiene ~304 px: la mitad cada grupo, 44 + 44 de botones y
  // la caja del número con lo que sobra. La caja tiene `min-w-0` y crece con
  // `flex-1`; los botones son `shrink-0`: si no entra, se achica la caja.
  assert.match(h, /<div class="grid grid-cols-2 gap-2">/, "uno al lado del otro, la mitad cada uno");
  assert.equal((h.match(/rounded-lg flex-1 /g) || []).length, 2);
  assert.equal((h.match(/ min-w-toque min-h-toque [^"]* shrink-0"/g) || []).length, 4, "los cuatro botones de 44, sin achicarse");
});

test("los rótulos de la fila", () => {
  const r = (estado, conteo = null) => texto(renderToStaticMarkup(React.createElement(EncabezadoDeLaFila, { estado, conteo })));
  assert.equal(r(ESTADO_FILA.ERROR), "No se guardó");
  assert.equal(r(ESTADO_FILA.SIN_CONTAR), "Sin contar");
  assert.equal(r(ESTADO_FILA.ESCRIBIENDO), "Contado");
  assert.match(r(ESTADO_FILA.CONTADO, de(real.listaContados, "Coca 2L").conteo), /^✓ Contado · Emanuel · \d\d:\d\d$/);
});

test("la tarjeta es la de Stock, la cantidad es la del kit, y NADA se guarda solo", () => {
  const src = fuente("components/stock_locales/control/TarjetaConteo.jsx");
  assert.match(src, /<TarjetaStockMovil\b[\s\S]*filaDeAbajo=\{fila\}/);
  assert.match(src, /<SunmiCampoCantidad\b[\s\S]*minimo=\{0\}/);
  assert.match(src, /esLecturaDeEscaner\(ms, r\.texto\)/, "el lector se reconoce como en la caja");
  assert.doesNotMatch(src, /onBlur=|setTimeout\(|onClickCapture/, "ni al salir del campo, ni a los 1,5 s de − o +");
  assert.equal((src.match(/guardar\(/g) || []).length, 3, "la definición, Enter y Aceptar: nada más guarda");
  assert.match(src, /onGuardar\?\.\(item\.id, \{ estaBien: true \}\)/);
  assert.doesNotMatch(src, /<button/, "los botones son del kit");
  const tarjetaStock = fuente("components/stock_locales/TarjetaStockMovil.jsx");
  assert.match(tarjetaStock, /filaDeAbajo \? \(\s*filaDeAbajo\s*\) : puedeAjustar/, "con la fila del conteo no van Ajustar ni Límites");
});

test("C0: sin control, Empezar solo con gestionar, y el historial con sus diferencias", () => {
  const t = dibujar({ estado: real.terminado, vista: VISTA_CONTROL.INICIO });
  assert.match(t, /Empezar control CONTROLES TERMINADOS .* Lo cerró Emanuel 2 en 0 Ver diferencias ›/);
  assert.doesNotMatch(dibujar({ estado: real.terminado, vista: VISTA_CONTROL.INICIO }, { gestionar: false }), /Empezar control/);
  assert.match(fuente("components/stock_locales/control/PantallaControlStock.jsx"), /onClick=\{\(\) => c\.verDiferencias\(h\.id\)\}/);
});

test("C3: los que nadie contó, los vendidos aparte, y el botón es 'Terminar control'", () => {
  const t = dibujar({ estado: real.abierto, vista: VISTA_CONTROL.TERMINAR, terminar: real.terminar });
  assert.match(t, /NADIE LOS CONTÓ Y EL SISTEMA DICE QUE HAY 3 productos Quedan en 0 2 Se vendieron durante el control 1/);
  assert.match(t, /SE VENDIERON DURANTE EL CONTROL Yerba 1kg vendidas 2 · sistema 10 un Contar/);
  assert.match(t, /QUEDAN EN 0 Fideos 4 un → 0 Galletas −15 un → 0/);
  assert.match(t, /Terminar control$/);
  assert.doesNotMatch(t, /Dejarlos como están/, "la confirmación arranca cerrada");
});

test("C3: el botón abre la confirmación, la elección viaja al servidor, y después se abre el informe", () => {
  // Lo que se toca está en tarjetaConteo.toque.test.mjs; acá, el cableado.
  const src = fuente("components/stock_locales/control/PantallaControlStock.jsx");
  assert.equal((src.match(/c\.confirmarTerminar\(/g) || []).length, 1, "un solo lugar llama al servidor");
  assert.match(src, /const alConfirmar = async \(decision\) => \{\s*await c\.confirmarTerminar\(decision\);/);
  const hook = fuente("components/stock_locales/control/useControlStock.js");
  assert.match(hook, /if \(!terminar \|\| terminando\.current\) return;\s*terminando\.current = true;/);
  assert.match(hook, /JSON\.stringify\(\{ productos: terminar\.aCero\.map\(\(p\) => p\.productoLocalId\), decision \}\)/);
  assert.match(hook, /verDiferencias\(r\.controlId\);\s*\}, \[/, "terminado, se abre su informe");
  assert.match(fuente("app/api/stock_locales/control/terminar/route.js"), /decision: body\.decision/);
});

test("la confirmación: los tres botones, deshabilitados mientras procesa, y la de siempre sin no contados", () => {
  const hoja = (props) =>
    renderToStaticMarkup(React.createElement(ConfirmarTerminar, { abierto: true, aCero: 2, sinContar: 3, ocupado: false, onCancelar: nada, onDecidir: nada, ...props }));
  assert.match(
    texto(hoja()),
    /Terminar control .*Quedaron 3 productos sin contar con stock distinto de 0 .*Los vendidos durante el control no se tocan Poner 2 en 0 y terminar Dejarlos como están y terminar Cancelar/
  );
  const boton = (h, rotulo) => h.match(new RegExp(`<button[^>]*>${rotulo}</button>`))?.[0] || "";
  for (const r of ["Poner 2 en 0 y terminar", "Dejarlos como están y terminar", "Cancelar"]) {
    assert.doesNotMatch(boton(hoja(), r), /disabled/, r);
    assert.match(boton(hoja({ ocupado: true }), r), /disabled/, `procesando, ${r} no se puede tocar`);
  }
  assert.match(texto(hoja({ aCero: 0, sinContar: 0 })), /Terminar control .*Vas a terminar el control Terminar Cancelar$/);
  assert.doesNotMatch(texto(hoja({ aCero: 0, sinContar: 0 })), /Dejarlos|en 0/);
  assert.equal(renderToStaticMarkup(React.createElement(ConfirmarTerminar, { abierto: false, aCero: 2, sinContar: 3, ocupado: false, onCancelar: nada, onDecidir: nada })), "");
});

test("terminar exige la elección, y queda escrita en el control", () => {
  assert.deepEqual(Object.values(DECISION_NO_CONTADOS), ["EN_CERO", "COMO_ESTABAN"]);
  assert.equal(esDecisionNoContados(undefined), false);
  assert.equal(esDecisionNoContados("EN_CERO"), true);
  const server = fuente("lib/stock/control/controlStockServer.js");
  assert.match(server, /if \(!esDecisionNoContados\(decision\)\) throw new RechazoDelControl\(400, TEXTO_FALTA_DECISION\);/);
  assert.match(server, /noContadosDecision: decision,/);
  assert.equal(textoQuedaronComoEstaban(7), "7 productos no se contaron y quedaron como estaban");
  assert.equal(textoQuedaronComoEstaban(1), "1 producto no se contó y quedó como estaba");
});

// ── LAS DIFERENCIAS ────────────────────────────────────────────────────────

test("diferencias de un terminado: Faltante y Sobrante en grande, cuántos, y la lista en su orden", () => {
  const h = html({ estado: real.terminado, vista: VISTA_CONTROL.DIFERENCIAS, diferencias: real.diferenciasCongeladas });
  const t = texto(h);
  assert.match(t, /^CONTROL DE STOCK · DIFERENCIAS ‹ Diferencias del control Mini el 7 · terminado [a-záéíóú]+ \d\d\/\d\d \d\d:\d\d /);
  assert.match(t, /FALTANTE \$ \$4\.350,00 SOBRANTE \$ \$10\.200,00 5 productos con diferencia/);
  assert.match(h, /class="text-xl3 font-semibold tabular-nums sunmi-text-danger">\$4\.350,00/);
  assert.match(h, /class="text-xl3 font-semibold tabular-nums sunmi-text-warning">\$10\.200,00/);
  assert.match(
    t,
    /PRODUCTOS CON DIFERENCIA Fideos Sistema 4 · Contado 0 · puesto en 0 Faltan 4 un −\$2\.400,00 Coca 2L .*Faltan 2 un −\$1\.200,00 Queso por kg .*Faltan 1,25 kg −\$750,00 Galletas Sistema −15 · Contado 0 · puesto en 0 Sobran 15 un \$9\.000,00 Sin fila .*Sobran 2 un \$1\.200,00$/
  );
});

test("diferencias sin costos.ver: las cantidades, sin un solo peso", () => {
  const t = texto(renderToStaticMarkup(React.createElement(InformeDeDiferencias, { d: real.diferenciasSinPlata })));
  assert.doesNotMatch(t, /FALTANTE|SOBRANTE|\$/);
  assert.match(t, /3 productos con diferencia La plata la ve quien puede ver costos\./);
  assert.match(t, /Coca 2L Sistema 4 · Contado 2 Faltan 2 un/);
  assert.match(fuente("app/api/stock_locales/control/diferencias/route.js"), /checkPerm\(a\.session, PERMISO_PLATA_DE_LAS_DIFERENCIAS\)\.ok/);
});

test("'Ver diferencias' en el abierto lleva al informe del abierto, que dice que no terminó", () => {
  const t = dibujar({ estado: real.abierto, vista: VISTA_CONTROL.DIFERENCIAS, diferencias: real.diferenciasAbierto });
  assert.match(t, /Mini el 7 · abierto desde [a-záéíóú]+ \d\d\/\d\d, sin terminar/);
  assert.match(t, /FALTANTE \$ \$1\.950,00 SOBRANTE \$ \$1\.200,00 3 productos con diferencia/);
});

// ── LA REVISIÓN: EL STOCK CONTRA LO CONTADO MÁS LO QUE PASÓ DESPUÉS ───────

// Con la forma de los `select` de `datosDeRevision`: bitácora y Libro.
const auditoria = (accion, cantidadAnterior, cantidadNueva, creadoEn) => ({ accion, cantidadAnterior, cantidadNueva, creadoEn });
const movimiento = (id, origen, origenRef, cantidadAnterior, cantidadPosterior, instante) => ({ id, origen, origenRef, cantidadAnterior, cantidadPosterior, instante });
const T = (s) => `2026-10-20T12:${s}.000Z`;

test("la revisión: debería = lo contado + lo que no es del control después del conteo", () => {
  // La lata: 1 bulto contado sobre 0 y después una venta de 1.
  const sana = revisionDelProducto({
    controlId: 7,
    contado: 24,
    auditorias: [auditoria("CONTROL_CONTEO", 0, 24, T("33:00"))],
    movimientos: [
      movimiento(10, "AJUSTE_POR_CONTROL", "7", 0, 24, T("33:00")),
      movimiento(11, "VENTA", "55", 24, 23, T("40:00")),
    ],
    actual: 23,
  });
  assert.deepEqual([sana.anclaMovimientoId, sana.posteriores, sana.deberia, sana.ajuste, sana.corregir], [10, -1, 23, 0, false]);
  // Una transferencia de 2 bultos después de contar: el −24 es lo que pasó, no un error.
  const transferida = revisionDelProducto({
    controlId: 7,
    contado: 24,
    auditorias: [auditoria("CONTROL_CONTEO", 0, 24, T("33:00"))],
    movimientos: [movimiento(10, "AJUSTE_POR_CONTROL", "7", 0, 24, T("33:00")), movimiento(12, "TRANSFERENCIA_ENVIO", "900", 24, -24, T("50:00"))],
    actual: -24,
  });
  assert.deepEqual([transferida.deberia, transferida.corregir, transferida.movimientosPosteriores[0].origen], [-24, false, "TRANSFERENCIA_ENVIO"]);
  // El control movió al revés: la bitácora y el Libro dicen 0 → −24.
  const alReves = revisionDelProducto({
    controlId: 7,
    contado: 24,
    auditorias: [auditoria("CONTROL_CONTEO", 0, -24, T("33:00"))],
    movimientos: [movimiento(10, "AJUSTE_POR_CONTROL", "7", 0, -24, T("33:00"))],
    actual: -24,
  });
  assert.deepEqual([alReves.deberia, alReves.ajuste, alReves.corregir], [24, 48, true]);
  // Una corrección después no es "lo que pasó después": es el mismo conteo.
  const corregida = revisionDelProducto({
    controlId: 7,
    contado: 5,
    auditorias: [auditoria("CONTROL_CONTEO", 5, 3, T("10:00")), auditoria("CONTROL_CORRECCION", 2, 4, T("20:00"))],
    movimientos: [
      movimiento(1, "AJUSTE_POR_CONTROL", "7", 5, 3, T("10:00")),
      movimiento(2, "VENTA", "1", 3, 2, T("15:00")),
      movimiento(3, "AJUSTE_POR_CONTROL", "7", 2, 4, T("20:00")),
    ],
    actual: 4,
  });
  assert.deepEqual([corregida.deberia, corregida.corregir], [4, false]);
  // Lo vendido ANTES de contar ya está adentro de lo contado: no se suma.
  const vendidaAntes = revisionDelProducto({
    controlId: 7,
    contado: 24,
    auditorias: [auditoria("CONTROL_CONTEO", 20, 24, T("33:00"))],
    movimientos: [movimiento(9, "VENTA", "54", 24, 20, T("20:00")), movimiento(10, "AJUSTE_POR_CONTROL", "7", 20, 24, T("33:00"))],
    actual: 24,
  });
  assert.deepEqual([vendidaAntes.posteriores, vendidaAntes.deberia, vendidaAntes.corregir], [0, 24, false]);
  // Lo de OTRO control no es de éste.
  const otro = revisionDelProducto({
    controlId: 7,
    contado: 24,
    auditorias: [auditoria("CONTROL_CONTEO", 0, 24, T("33:00"))],
    movimientos: [movimiento(10, "AJUSTE_POR_CONTROL", "7", 0, 24, T("33:00")), movimiento(11, "AJUSTE_POR_CONTROL", "3", 24, 20, T("34:00"))],
    actual: 20,
  });
  assert.equal(otro.deberia, 20);
  // Sin contar, o borrado, no hay nada que revisar.
  assert.equal(revisionDelProducto({ controlId: 7, contado: null, auditorias: [], movimientos: [], actual: 0 }), null);
});

test("'El stock no coincide': lo que trae la revisión real, con Corregir, solo los que no dan", () => {
  const r = real.revisionConUnoRoto;
  const t = texto(renderToStaticMarkup(React.createElement(StockQueNoCoincide, { c: { revision: r, ocupado: false, corregirProducto: nada } })));
  assert.equal(r.aCorregir, 1);
  assert.match(t, /^EL STOCK NO COINCIDE CON LO CONTADO Lata al revés x24 contado 24 · después 0 · debería 24 un · hay −24 un Corregir$/);
  const sinNada = { ...r, productos: r.productos.filter((p) => !p.corregir), aCorregir: 0 };
  assert.equal(renderToStaticMarkup(React.createElement(StockQueNoCoincide, { c: { revision: sinNada, ocupado: false, corregirProducto: nada } })), "");
  const pantalla = fuente("components/stock_locales/control/PantallaControlStock.jsx");
  assert.match(pantalla, /\{puedeGestionar \? <StockQueNoCoincide c=\{c\} \/> : null\}/, "solo quien gestiona");
  const ruta = fuente("app/api/stock_locales/control/revision/route.js");
  assert.equal((ruta.match(/autorizarControl\(req, PERMISO_GESTIONAR_CONTROL, \{[^}]*persona: "cuenta" \}\)/g) || []).length, 2, "GET y POST, de la cuenta sin PIN");
});

test("la tarjeta y el listado leen la fila de stock DEL local, la que el control escribe", () => {
  assert.match(fuente("lib/stock/control/controlStockServer.js"), /stock: \{\s*where: \{ localId \},\s*take: 1,/);
  assert.equal((fuente("app/api/stock_locales/listar/route.js").match(/stock: \{\s*where: \{ localId \},\s*take: 1,/g) || []).length, 2, "las dos ramas");
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

// CANDADOS DEL CONTROL DE STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/control/controlStock.test.mjs
//
// El comportamiento contra la base —cada conteo se mide contra el stock vivo y
// deja el stock en lo contado, también al volver a contarlo, y borrarlo deshace
// los ajustes; "Está bien"; la lista de Stock Locales con sus chips y el
// lector; el depósito en unidades y su plata por bulto; terminar con los
// vendidos aparte y sin volver a aplicar lo contado; las diferencias vivas y
// congeladas; el Libro y la bitácora; la reconstrucción de los conteos
// anteriores, con su script; los permisos y el PIN— lo ejerce
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
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";

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
  diferenciaDelConteo,
  MOTIVO_NO_RECONSTRUIBLE,
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
// El router de Next montado, como en la app: el Volver de las diferencias es un
// `SunmiBackButton`, que lo pide aunque vuelva con `onVolver`.
const html = (c, { gestionar = true } = {}) =>
  renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: {} },
      React.createElement(PantallaControlStock, { c: { ...base, ...c }, puedeGestionar: gestionar })
    )
  );
const dibujar = (c, opciones) => texto(html(c, opciones));
const tarjeta = (item, esDeposito = false) => renderToStaticMarkup(React.createElement(TarjetaConteo, { item, esDeposito, onGuardar: nada }));
const de = (lista, nombre) => lista.items.find((i) => i.nombre === nombre);

// ── LAS REGLAS ─────────────────────────────────────────────────────────────

test("aceptar un conteo deja el stock en lo contado, contra el stock VIVO: el primero y los recuentos", () => {
  // El SWIFT: al abrir 23, se vendieron 4 y hay 19 vivos; se cuentan 21.
  assert.deepEqual(stockTrasFijarTotal({ actual: 19, total: 21 }), { nuevo: 21, ajuste: 2 });
  assert.deepEqual(stockTrasFijarTotal({ actual: -15, total: 0 }), { nuevo: 0, ajuste: 15 });
  // Un recuento: se vendió 1 después del conteo (21 → 20) y se cuentan 20. No
  // hay "total anterior" que restar: coincide con lo vivo y no mueve nada.
  assert.deepEqual(stockTrasFijarTotal({ actual: 20, total: 20 }), { nuevo: 20, ajuste: 0 });
  // El mismo número que el conteo anterior, con una venta en el medio: el
  // recuento lo vuelve a dejar en lo contado.
  assert.deepEqual(stockTrasFijarTotal({ actual: 6, total: 7 }), { nuevo: 7, ajuste: 1 });
  assert.equal(stockTrasFijarTotal.length, 1, "un solo argumento, sin totalAnterior");
  assert.doesNotMatch(fuente("lib/stock/control/controlStock.js"), /totalAnterior/, "nada mide contra el total anterior");
});

test("la diferencia de un producto es la suma de sus ajustes, y borrar los deshace", () => {
  const auditorias = [
    { accion: "CONTROL_CONTEO", cantidadAnterior: 5, cantidadNueva: 3 },
    { accion: "CONTROL_RECUENTO", cantidadAnterior: 3, cantidadNueva: 7 },
    { accion: "CONTROL_CORRECCION", cantidadAnterior: 6, cantidadNueva: 4 },
    { accion: "CONTROL_CORRECCION_REVISION", cantidadAnterior: 4, cantidadNueva: 5 },
    // El terminar no es un ajuste de conteo: no se deshace ni suma.
    { accion: "CONTROL_PUESTO_EN_CERO", cantidadAnterior: 9, cantidadNueva: 0 },
  ];
  assert.equal(ajusteNetoDelConteo(auditorias), 1);
  assert.deepEqual(diferenciaDelConteo({ contado: 5, auditorias }), { diferencia: 1, sistema: 4 }, "el sistema es contado − diferencia");
  // Un solo conteo: el sistema es exactamente el stock vivo al contar.
  assert.deepEqual(diferenciaDelConteo({ contado: 21, auditorias: [{ accion: "CONTROL_CONTEO", cantidadAnterior: 19, cantidadNueva: 21 }] }), { diferencia: 2, sistema: 19 });
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

test("la diferencia es contado − sistema, y se dice Faltan en rojo, Sobran en verde o Coincide", () => {
  assert.equal(diferenciaDe({ sistema: 4, contado: 2 }), -2);
  assert.equal(diferenciaDe({ sistema: -15, contado: 0 }), 15, "un negativo puesto en 0 es sobrante");
  assert.deepEqual(textoDeLaDiferencia(-2, "UNIDAD"), { texto: "Faltan 2 un", tono: "danger" });
  assert.deepEqual(textoDeLaDiferencia(1.25, "KG"), { texto: "Sobran 1,25 kg", tono: "success" });
  assert.deepEqual(textoDeLaDiferencia(0, "UNIDAD"), { texto: "Coincide", tono: "success" });
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
  assert.match(t, /^Coca 2L Coca-Cola FEMSA Sin mín\/máx STOCK · Unidad 2 uds 7790000000001 ✓ Contado · Emanuel · \d\d:\d\d /);
  assert.match(t, /Sistema 4 · Contado 2 · Faltan 2 un$/);
  assert.match(h, /data-fila-conteo="contado"/);
  assert.match(h, /<input[^>]*class="[^"]*sunmi-state-success[^"]*"[^>]*value="2"/);
  assert.doesNotMatch(h, /<input[^>]* disabled=""/);
  assert.doesNotMatch(t, /Está bien/);
  assert.match(h, /<span class="font-semibold sunmi-text-danger">Faltan 2 un<\/span>/);
});

test("Sobran en verde y Coincide", () => {
  assert.match(tarjeta(de(real.listaContados, "Sin fila")), /<span class="font-semibold sunmi-text-success">Sobran 2 un<\/span>/);
  assert.match(tarjeta(de(real.listaContados, "Aceite 900")), /<span class="font-semibold sunmi-text-success">Coincide<\/span>/);
});

test("el SWIFT: la tarjeta dice el stock vivo arriba y Sistema = stock al contar, no el de apertura", () => {
  // La respuesta real: al abrir 23, vendidos 4, contados 21.
  const t = texto(tarjeta(real.conteoDelSwift.item));
  assert.match(t, /STOCK · Unidad 21 uds/, "arriba, el stock vivo: ya es lo contado");
  assert.match(t, /Sistema 19 · Contado 21 · Sobran 2 un$/);
  assert.doesNotMatch(t, /Sistema 23/);
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

test("diferencias de un terminado: la cabecera del control, Faltante y Sobrante en su renglón, cuántos, y la lista en su orden", () => {
  const h = html({ estado: real.terminado, vista: VISTA_CONTROL.DIFERENCIAS, diferencias: real.diferenciasCongeladas });
  const t = texto(h);
  // El shell ya dice "Control de stock": ni la etiqueta ni el título grande.
  assert.doesNotMatch(t, /CONTROL DE STOCK · DIFERENCIAS|Diferencias del control|‹/);
  assert.match(t, /^Diferencias Terminado Volver Mini el 7 · desde [a-záéíóú]+ \d\d\/\d\d /);
  assert.match(t, /Faltante \$4\.350,00 Sobrante \$10\.200,00 5 productos con diferencia/);
  assert.match(h, /tabular-nums sunmi-text-danger">\$4\.350,00/);
  assert.match(h, /tabular-nums sunmi-text-warning">\$10\.200,00/);
  assert.match(
    t,
    /PRODUCTOS CON DIFERENCIA Fideos Sistema 4 · Contado 0 · puesto en 0 Faltan 4 un −\$2\.400,00 Coca 2L .*Faltan 2 un −\$1\.200,00 Queso por kg .*Faltan 1,25 kg −\$750,00 Galletas Sistema −15 · Contado 0 · puesto en 0 Sobran 15 un \$9\.000,00 Sin fila .*Sobran 2 un \$1\.200,00$/
  );
});

test("diferencias sin costos.ver: las cantidades, sin un solo peso", () => {
  const t = texto(renderToStaticMarkup(React.createElement(InformeDeDiferencias, { d: real.diferenciasSinPlata })));
  assert.doesNotMatch(t, /Faltante|Sobrante|FALTANTE|SOBRANTE|\$/);
  assert.match(t, /3 productos con diferencia La plata la ve quien puede ver costos\./);
  assert.match(t, /Coca 2L Sistema 4 · Contado 2 Faltan 2 un/);
  assert.match(fuente("app/api/stock_locales/control/diferencias/route.js"), /checkPerm\(a\.session, PERMISO_PLATA_DE_LAS_DIFERENCIAS\)\.ok/);
});

test("'Ver diferencias' en el abierto lleva al informe del abierto, con el chip 'Abierto'", () => {
  const t = dibujar({ estado: real.abierto, vista: VISTA_CONTROL.DIFERENCIAS, diferencias: real.diferenciasAbierto });
  assert.match(t, /^Diferencias Abierto Volver Mini el 7 · desde [a-záéíóú]+ \d\d\/\d\d /);
  assert.match(t, /Faltante \$1\.950,00 Sobrante \$1\.200,00 3 productos con diferencia/);
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
  // Un cambio de total de la versión anterior (CONTROL_CORRECCION, que movía
  // por la diferencia de totales: 3 → 5 subió 2 sobre los 2 vivos) es un
  // RECUENTO: el 5 se contó con 2 en el sistema y ahí tenía que quedar.
  const corregida = revisionDelProducto({
    controlId: 7,
    contado: 5,
    desde: T("20:00"),
    auditorias: [auditoria("CONTROL_CONTEO", 5, 3, T("10:00")), auditoria("CONTROL_CORRECCION", 2, 4, T("20:00"))],
    movimientos: [
      movimiento(1, "AJUSTE_POR_CONTROL", "7", 5, 3, T("10:00")),
      movimiento(2, "VENTA", "1", 3, 2, T("15:00")),
      movimiento(3, "AJUSTE_POR_CONTROL", "7", 2, 4, T("20:00")),
    ],
    actual: 4,
  });
  assert.deepEqual([corregida.anclaMovimientoId, corregida.deberia, corregida.ajuste, corregida.corregir], [3, 5, 1, true]);
  // La reconstrucción: al abrir 5, la venta de 1 antes del recuento → el
  // sistema al contar es 4, y la diferencia que tiene que quedar es +1.
  assert.deepEqual([corregida.sistemaAlContar, corregida.diferencia, corregida.reconstruible], [4, 1, true]);
  // Corregida, la próxima revisión sigue anclada en el conteo y no la toma por
  // uno: CONTROL_CORRECCION_REVISION, aunque sea en el mismo segundo.
  const yaCorregida = revisionDelProducto({
    controlId: 7,
    contado: 5,
    desde: T("20:00"),
    auditorias: [
      auditoria("CONTROL_CONTEO", 5, 3, T("10:00")),
      auditoria("CONTROL_CORRECCION", 2, 4, T("20:00")),
      auditoria("CONTROL_CORRECCION_REVISION", 4, 5, T("20:01")),
    ],
    movimientos: [
      movimiento(1, "AJUSTE_POR_CONTROL", "7", 5, 3, T("10:00")),
      movimiento(2, "VENTA", "1", 3, 2, T("15:00")),
      movimiento(3, "AJUSTE_POR_CONTROL", "7", 2, 4, T("20:00")),
      movimiento(4, "AJUSTE_POR_CONTROL", "7", 4, 5, T("20:01")),
      movimiento(5, "VENTA", "2", 5, 3, T("30:00")),
    ],
    actual: 3,
  });
  assert.deepEqual([yaCorregida.anclaMovimientoId, yaCorregida.deberia, yaCorregida.corregir, yaCorregida.sistemaAlContar, yaCorregida.reconstruible], [3, 3, false, 4, true]);
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

test("la reconstrucción no inventa: si el Libro no alcanza, dice por qué y no es reconstruible", () => {
  const base = { controlId: 7, contado: 8, desde: T("10:00") };
  // La bitácora dice 6 → 4 y el Libro 6 → 3: el conteo no está en el Libro.
  const sinMovimiento = revisionDelProducto({
    ...base,
    auditorias: [auditoria("CONTROL_CONTEO", 6, 4, T("10:00"))],
    movimientos: [movimiento(1, "AJUSTE_POR_CONTROL", "7", 6, 3, T("10:00"))],
    actual: 3,
  });
  assert.deepEqual([sinMovimiento.reconstruible, sinMovimiento.motivoNoReconstruible], [false, MOTIVO_NO_RECONSTRUIBLE.SIN_MOVIMIENTO_DEL_CONTEO]);
  // El Libro salta de 8 a 9 sin un movimiento que lo explique.
  const noEncadena = revisionDelProducto({
    ...base,
    auditorias: [auditoria("CONTROL_CONTEO", 10, 8, T("10:00"))],
    movimientos: [movimiento(1, "AJUSTE_POR_CONTROL", "7", 10, 8, T("10:00")), movimiento(2, "VENTA", "1", 9, 7, T("11:00"))],
    actual: 7,
  });
  assert.deepEqual([noEncadena.reconstruible, noEncadena.motivoNoReconstruible], [false, MOTIVO_NO_RECONSTRUIBLE.LIBRO_NO_CIERRA]);
  // El stock de hoy no es el último del Libro.
  const noLlegaAHoy = revisionDelProducto({
    ...base,
    auditorias: [auditoria("CONTROL_CONTEO", 10, 8, T("10:00"))],
    movimientos: [movimiento(1, "AJUSTE_POR_CONTROL", "7", 10, 8, T("10:00"))],
    actual: 5,
  });
  assert.equal(noLlegaAHoy.motivoNoReconstruible, MOTIVO_NO_RECONSTRUIBLE.LIBRO_NO_CIERRA);
  // El control movió en el Libro algo que su bitácora no tiene.
  const difieren = revisionDelProducto({
    ...base,
    auditorias: [auditoria("CONTROL_CONTEO", 10, 8, T("10:00"))],
    movimientos: [movimiento(1, "AJUSTE_POR_CONTROL", "7", 10, 8, T("10:00")), movimiento(2, "AJUSTE_POR_CONTROL", "7", 8, 6, T("12:00"))],
    actual: 6,
  });
  assert.equal(difieren.motivoNoReconstruible, MOTIVO_NO_RECONSTRUIBLE.BITACORA_Y_LIBRO_DIFIEREN);
});

test("'El stock no coincide': lo que trae la revisión real, con Corregir, solo los que no dan", () => {
  const r = real.revisionConUnoRoto;
  const t = texto(renderToStaticMarkup(React.createElement(StockQueNoCoincide, { c: { revision: r, ocupado: false, corregirProducto: nada } })));
  assert.equal(r.aCorregir, 1);
  assert.match(t, /^EL STOCK NO COINCIDE CON LO CONTADO Lata al revés x24 contado 24 · después 0 · debería 24 un · hay −24 un Corregir$/);
  // Sin nada para corregir el recuadro NO desaparece: dice que revisó y que
  // coincide. Desaparecer se veía igual que una revisión caída.
  const sinNada = { ...r, productos: r.productos.filter((p) => !p.corregir), aCorregir: 0 };
  const alDia = texto(renderToStaticMarkup(React.createElement(StockQueNoCoincide, { c: { revision: sinNada, ocupado: false, corregirProducto: nada } })));
  assert.equal(alDia, `REVISIÓN DE LO CONTADO Revisé ${sinNada.productos.length} contados: el stock coincide con lo contado, no hay nada para corregir.`);
  const pantalla = fuente("components/stock_locales/control/PantallaControlStock.jsx");
  assert.match(pantalla, /\{puedeGestionar \? <StockQueNoCoincide c=\{c\} \/> : null\}/, "solo quien gestiona");
  const ruta = fuente("app/api/stock_locales/control/revision/route.js");
  assert.equal((ruta.match(/autorizarControl\(req, PERMISO_GESTIONAR_CONTROL, \{[^}]*persona: "cuenta" \}\)/g) || []).length, 2, "GET y POST, de la cuenta sin PIN");
});

test("el recuadro de la revisión carga SIEMPRE: revisando, el error con su motivo, o al día", () => {
  const dibujarRevision = (revision) => texto(renderToStaticMarkup(React.createElement(StockQueNoCoincide, { c: { revision, ocupado: false, corregirProducto: nada } })));
  assert.equal(dibujarRevision(null), "REVISIÓN DE LO CONTADO Revisando el stock de lo contado…");
  const caida = renderToStaticMarkup(React.createElement(StockQueNoCoincide, { c: { revision: { error: "El servidor contestó 500." }, ocupado: false } }));
  assert.equal(texto(caida), "REVISIÓN DE LO CONTADO No se pudo revisar lo contado: El servidor contestó 500.");
  assert.match(caida, /sunmi-text-danger/);
  assert.equal(dibujarRevision({ ok: true, productos: [], aCorregir: 0 }), "REVISIÓN DE LO CONTADO Todavía no hay nada contado para revisar.");
  // El hook no descarta un pedido que falla: lo guarda como error.
  const hook = fuente("components/stock_locales/control/useControlStock.js");
  assert.match(hook, /setRevision\(r\.ok \? r : \{ error: r\.error \|\| "No se pudo revisar lo contado\." \}\)/);
  assert.doesNotMatch(hook, /setRevision\(r\.ok \? r : null\)/);
});

test("un producto que revienta al revisarse va a 'no se corrige' con el motivo; los demás se revisan igual", async () => {
  // La defensa se ejerce: una base mínima en memoria, con la forma de los
  // `select` de `reconstruccionDeConteos.js`, donde la fila de stock de UN
  // producto no se puede leer como número. No es un caso de producción
  // conocido: es la contraprueba de que uno solo no tira abajo el recuadro.
  const { revisarProductosContados, ESTADO_RECONSTRUCCION } = await import("@/lib/stock/control/reconstruccionDeConteos.js");
  const T0 = new Date("2026-10-20T12:00:00.000Z");
  const conteo = (productoLocalId, cantidad) => ({ id: productoLocalId, productoLocalId, cantidad, contadoPor: "Ana", creadoEn: T0, sistemaAlContar: null });
  const audit = (productoLocalId, a, n) => ({ productoLocalId, accion: "CONTROL_CONTEO", cantidadAnterior: a, cantidadNueva: n, createdAt: T0 });
  const malo = { valueOf() { throw new Error("cantidad ilegible"); } };
  const db = {
    conteoControlStock: { findMany: async () => [conteo(1, 5), conteo(2, 3)] },
    auditoriaStock: { findMany: async () => [audit(1, 5, 5), audit(2, 3, 3)] },
    movimientoStock: { findMany: async () => [] },
    stockLocal: { findMany: async () => [{ localId: 9, productoId: 1, cantidad: 5 }, { localId: 9, productoId: 2, cantidad: malo }] },
  };
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.join(" "));
  let r;
  try {
    r = await revisarProductosContados(db, { id: 7, localId: 9, abiertoEn: T0 });
  } finally {
    console.error = original;
  }
  const de = (id) => r.find((p) => p.productoLocalId === id);
  assert.equal(de(1).estado, ESTADO_RECONSTRUCCION.MARCADO, "el sano se revisa");
  assert.equal(de(2).estado, ESTADO_RECONSTRUCCION.NO_RECONSTRUIBLE);
  assert.equal(de(2).revision.motivoNoReconstruible, `${MOTIVO_NO_RECONSTRUIBLE.NO_SE_PUDO_REVISAR} cantidad ilegible`);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /CONTROL DE STOCK · revisar el producto #2 del control #7:.*cantidad ilegible/, "y el motivo real va al log");
});

test("el listado devuelve con `return await`: una falla al armar la respuesta pasa por su catch y su log", () => {
  const ruta = fuente("app/api/stock_locales/listar/route.js");
  assert.equal((ruta.match(/return responder\(/g) || []).length, 0, "un `return responder(` sin await saca el rechazo del try");
  assert.ok((ruta.match(/return await responder\(/g) || []).length >= 9);
  assert.match(ruta, /console\.error\(`❌ ERROR STOCK LISTAR \$\{new URL\(req\.url\)\.search\}:`, err\);/);
});

test("la revisión antes de reconstruir: 'Corregir todos', los que se corrigen y los que no, con su motivo", () => {
  // La respuesta real del modo prueba en la pantalla (sección 12 del guion).
  const r = real.revisionAntesDeReconstruir;
  const pedidos = [];
  const c = { revision: r, ocupado: false, corregirProducto: (id) => pedidos.push(id), corregirTodos: () => pedidos.push("todos") };
  const h = renderToStaticMarkup(React.createElement(StockQueNoCoincide, { c }));
  const t = texto(h);
  assert.match(t, /^EL STOCK NO COINCIDE CON LO CONTADO Corregir todos \(2\) /);
  assert.match(t, /Té x25 · no se corrige: Tiene varios conteos vigentes que se sumaban/);
  assert.match(t, /Mate cocido · no se corrige: El Libro no tiene el movimiento que dejó el conteo/);
  assert.match(t, /Arroz 1kg contado 8 · después −1 · debería 7 un · hay 4 un Corregir/);
  assert.match(t, /Harina 000 contado 5 · después 0 · debería 5 un · hay 3 un Corregir/);
  assert.equal((t.match(/Corregir(?! todos)/g) || []).length, 2, "Corregir solo en los que el Libro explica");
  const ruta = fuente("app/api/stock_locales/control/revision/route.js");
  assert.match(ruta, /body\.todos === true\s*\?\s*await corregirTodos\(/, "'Corregir todos' va por la misma ruta, a la reconstrucción");
  assert.match(fuente("lib/stock/control/controlStockServer.js"), /reconstruirConteos\(prisma, \{ controlId: control\.id, aplicar: true,/);
});

test("el script de reconstrucción: modo prueba por defecto en LECTURA, y escribe solo con --aplicar en ESCRITURA", () => {
  const s = fuente("scripts/control-stock-reconstruir.mjs");
  assert.match(s, /^import \{ crearClientePrisma, ESCRITURA, LECTURA \} from "\.\/lib\/clientePrisma\.mjs";/m, "la fábrica, primero");
  assert.match(s, /crearClientePrisma\(\{ nivel: aplicar \? ESCRITURA : LECTURA \}\)/);
  assert.match(s, /const aplicar = args\.includes\("--aplicar"\);/);
  assert.match(s, /reconstruirConteos\(prisma, \{/, "la misma función que la ruta");
  assert.doesNotMatch(s, /new PrismaClient/);
  // Y la función no construye cliente ni importa con alias: corre igual desde el script.
  const lib = fuente("lib/stock/control/reconstruccionDeConteos.js");
  assert.doesNotMatch(lib, /from "@\//);
  assert.doesNotMatch(lib, /PrismaClient|lib\/prisma/);
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

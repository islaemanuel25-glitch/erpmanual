// Candados del estado de filtros que no reduce el universo.
//
// Lo que defienden: que "limpiar los filtros" limpie EXACTAMENTE al universo que
// la card cuenta. Un filtro que quede afuera de la limpieza hace que el total del
// listado no cierre contra el número de la card, que es el criterio aprobado del
// issue #2.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  filtrosNeutros,
  CLAVES_DE_FILTRO,
  mismosFiltros,
  hayFiltrosPuestos,
  cumpleElInvariante,
  normalizarEstadoDeUrl,
} from "./filtrosCatalogo.js";

const leer = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("G1. los neutros son los DEFAULTS, no cadenas vacías", () => {
  // Es el error fácil: vaciar todo y dar por limpio. `estado` vacío no es
  // "activos" y `tipo` vacío no es "todos", así que el listado traería otra cosa
  // que la card y los números no cerrarían.
  const n = filtrosNeutros();
  assert.equal(n.estado, "activos");
  assert.equal(n.tipo, "todos");
  assert.equal(n.search, "");
  assert.equal(n.categoria, "");
  assert.equal(n.proveedor, "");
  assert.equal(n.area, "");
});

test("G2. LOS NEUTROS CUBREN TODOS LOS FILTROS QUE LA PANTALLA MANDA", () => {
  // ── EL CANDADO QUE IMPORTA ──────────────────────────────────────────────
  //
  // Si mañana se agrega un filtro al listado y no se agrega acá, `alternarControl`
  // lo dejaría puesto al activar un control y el total volvería a no cerrar contra
  // la card. Y no se vería: la pantalla seguiría andando.
  //
  // Se compara contra las claves que `fetchProductos` le manda al servidor,
  // leyendo el archivo. Los comentarios se sacan antes de mirar.
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));
  const bloque = fuente.slice(
    fuente.indexOf("const params = new URLSearchParams({"),
    fuente.indexOf("const res = await fetch(`/api/productos/listar")
  );
  assert.ok(bloque.length > 0, "se movió el armado de la query: reanclar este candado");

  // Cada `filtros.X` que viaja al servidor tiene que estar entre los neutros.
  const usados = [...bloque.matchAll(/filtros\.([a-zA-Z]+)/g)].map((m) => m[1]);
  assert.ok(usados.length > 0, "el bloque no nombra ningún filtro: el ancla está mal");
  const faltan = [...new Set(usados)].filter((k) => !CLAVES_DE_FILTRO.includes(k));
  assert.deepEqual(
    faltan,
    [],
    `estos filtros viajan al servidor y no están en filtrosNeutros: ${faltan.join(", ")}`
  );
});

test("G3. mismosFiltros compara clave por clave, no por orden", () => {
  const a = { search: "", categoria: "", proveedor: "", area: "", estado: "activos", tipo: "todos" };
  const b = { tipo: "todos", estado: "activos", area: "", proveedor: "", categoria: "", search: "" };
  assert.equal(mismosFiltros(a, b), true, "el orden de las claves no puede decidir");
  assert.equal(mismosFiltros(a, { ...a, proveedor: "7" }), false);
});

test("G4. un campo ausente cuenta como vacío, no como distinto", () => {
  // La pantalla puede mandar un objeto sin alguna clave; tratarlo como distinto
  // haría que "limpiar" nunca se detecte como limpio y el filtro se reponga solo.
  const parcial = { estado: "activos", tipo: "todos" };
  assert.equal(mismosFiltros(parcial, filtrosNeutros()), true);
});

test("G5. hayFiltrosPuestos detecta CADA filtro, uno por uno", () => {
  assert.equal(hayFiltrosPuestos(filtrosNeutros()), false);
  const noNeutro = {
    search: "aceite",
    categoria: "3",
    proveedor: "7",
    area: "2",
    estado: "inactivos",
    tipo: "combos",
  };
  for (const k of CLAVES_DE_FILTRO) {
    assert.equal(
      hayFiltrosPuestos({ ...filtrosNeutros(), [k]: noNeutro[k] }),
      true,
      `un ${k} puesto tiene que contar como filtro`
    );
  }
});

test("G6. LA PANTALLA LIMPIA CON ESTA FUNCIÓN, y no con un objeto escrito al lado", () => {
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));
  const i = fuente.indexOf("const alternarControl");
  assert.notEqual(i, -1, "se fue `alternarControl`: reanclar este candado, no borrarlo");
  const bloque = fuente.slice(i, fuente.indexOf("};", i));
  assert.match(bloque, /setFiltros\(filtrosNeutros\(\)\)/, "dejó de limpiar con la función");
  assert.match(bloque, /hayFiltrosPuestos\(/, "dejó de preguntar con la función");
  assert.match(bloque, /mismosFiltros\(/, "dejó de comprobar antes de reponer");
});

// ── EL INVARIANTE: CON UN CONTROL ACTIVO, LOS FILTROS ESTÁN EN SU DEFAULT ──

test("G7. el invariante contesta lo que dice contestar", () => {
  const neutros = filtrosNeutros();
  const conBusqueda = { ...neutros, search: "aceite" };

  assert.equal(cumpleElInvariante({ control: null, filtros: conBusqueda }), true,
    "sin control, cualquier filtro está permitido");
  assert.equal(cumpleElInvariante({ control: "sin-regla", filtros: neutros }), true);
  assert.equal(cumpleElInvariante({ control: "sin-regla", filtros: conBusqueda }), false,
    "con control y una búsqueda puesta, la card y el listado no pueden coincidir");
});

test("G8-url. UNA URL CON CONTROL Y FILTROS SE NORMALIZA, y gana el control", () => {
  // ── EL CAMINO QUE NO PASA POR NINGÚN MANEJADOR ──────────────────────────
  //
  // `?control=sin-regla&q=aceite` rompía el criterio del issue sin que nadie
  // tocara nada: bastaba con recargar la página o abrir un enlace compartido. El
  // estado inicial leía el control y los filtros por separado y nunca los miraba
  // juntos.
  const conAmbos = {
    control: "sin-regla",
    filtros: { ...filtrosNeutros(), search: "aceite", proveedor: "7" },
  };
  const salida = normalizarEstadoDeUrl(conAmbos);

  assert.equal(salida.control, "sin-regla", "el control se conserva: es lo que el enlace promete");
  assert.equal(hayFiltrosPuestos(salida.filtros), false, "los filtros se fueron");
  assert.equal(cumpleElInvariante(salida), true);
});

test("G9-url. sin control, la URL pasa tal cual", () => {
  // La contraprueba de G8-url: si la normalización limpiara siempre, un enlace
  // con una búsqueda y sin control perdería la búsqueda, y G8-url pasaría igual.
  const soloFiltros = {
    control: null,
    filtros: { ...filtrosNeutros(), search: "aceite" },
  };
  const salida = normalizarEstadoDeUrl(soloFiltros);
  assert.equal(salida.control, null);
  assert.equal(salida.filtros.search, "aceite", "sin control, los filtros no se tocan");
});

test("G10-url. con control y filtros ya neutros, no se reemplaza el objeto", () => {
  // Detalle que importa en React: devolver un objeto nuevo cuando nada cambió
  // dispara un render y, con él, un pedido al servidor. Se comprueba por
  // identidad.
  const filtros = filtrosNeutros();
  const salida = normalizarEstadoDeUrl({ control: "sin-regla", filtros });
  assert.equal(salida.filtros, filtros, "devolvió un objeto nuevo sin necesidad");
});

test("G11-pantalla. LA PANTALLA NORMALIZA AL ENTRAR y apaga el control al filtrar", () => {
  // Los dos caminos que faltaban, fijados en el código. Sin esto, el invariante
  // sería una función que nadie llama.
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));

  assert.match(
    fuente,
    /normalizarEstadoDeUrl\(\s*\{[\s\S]{0,200}?controlDeLaUrl\(searchParams\)/,
    "el estado inicial dejó de normalizarse contra los filtros de la URL"
  );

  const i = fuente.indexOf("const aplicarFiltros");
  assert.notEqual(i, -1, "se fue `aplicarFiltros`: reanclar este candado, no borrarlo");
  const bloque = fuente.slice(i, fuente.indexOf("};", i));
  assert.match(bloque, /setControl\(null\)/, "cambiar un filtro dejó de apagar el control");

  // Y NADIE MÁS ESCRIBE FILTROS POR SU CUENTA. Es la contraprueba de lo
  // anterior: `aplicarFiltros` puede estar perfecto y un `setFiltros` suelto en
  // otro lado vuelve a abrir el agujero. Los únicos permitidos son los tres de
  // `alternarControl` y `aplicarFiltros`.
  const escrituras = [...fuente.matchAll(/setFiltros\(/g)].length;
  assert.equal(
    escrituras,
    3,
    `hay ${escrituras} llamadas a setFiltros y tendrían que ser 3: las dos de alternarControl y la de aplicarFiltros`
  );
});

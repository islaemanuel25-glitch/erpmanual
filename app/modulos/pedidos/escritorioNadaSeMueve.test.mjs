// EN LA COMPUTADORA DE PEDIDO AL DEPÓSITO NADA SE MUEVE AL CARGAR CANTIDADES.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/escritorioNadaSeMueve.test.mjs
//
// El defecto (Emanuel, en producción, sobre 74a1c6e): con ningún producto
// cargado la columna CANTIDAD estaba en un lugar; al cargar el primero
// aparecía "Sacar del pedido" y la columna entera —encabezado y campos— se
// corría a la izquierda. El ancho de las columnas lo decidía el contenido.
//
// La regla: nada se mueve ni cambia de tamaño por cargar, sacar o cambiar
// cantidades —columnas, encabezados, el campo, los − / +, el alto de los
// renglones—.
//
// ── CÓMO SE MIDE SIN NAVEGADOR ────────────────────────────────────────────
//
// La orden prohíbe abrir uno, y jsdom no tiene motor de layout: no hay
// `getBoundingClientRect` que diga algo. Lo que hay es que con
// `table-layout: fixed` el reparto NO depende del contenido —es lo que la
// regla pide—, y está escrito: cada columna mide lo que declara la celda de la
// primera fila (el encabezado), y las que no declaran se reparten el resto
// (CSS 2.1 §17.5.2.1). `medirColumna` hace esa cuenta con lo que la tabla
// tiene en el DOM, con el `rem` de 14 px de `app/globals.css` y el
// `box-sizing: border-box` del preflight de Tailwind (el ancho incluye el
// padding).
//
// Si la tabla no es `table-fixed`, el ancho lo decide el contenido y NO SE
// PUEDE MEDIR sin un navegador: `medirColumna` lo dice y el candado da rojo.
// Esa es la contraprueba que pidió la orden —volver al ancho automático—, y es
// rojo por el motivo correcto: lo que se exige es que el ancho esté DECLARADO.
//
// Lo que no es la columna —el alto del renglón y la caja del campo— se afirma
// con la huella de cada renglón: qué elementos tiene cada celda y con qué
// clases, sin las que solo cambian color o peso. Si al cargar aparece o
// desaparece un elemento, o uno cambia de medida, la huella cambia.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { real, montar, desmontarTodo, tocar, teclear, asentar, act, escritorio } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const montarE = (r) => montar({ ...r, ancho: "escritorio" });
const tabla = () => escritorio().querySelector("table");
const boton = (t) => [...escritorio().querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(t)) ?? null;
const renglon = (nombre) =>
  [...tabla().querySelectorAll("tbody tr")].find((tr) => tr.querySelector("[data-nombre-producto]")?.textContent === nombre);

// ── LA MEDICIÓN ───────────────────────────────────────────────────────────

/** `app/globals.css` fija `font-size: 14px` sobre el `html`. Se lee, no se supone. */
const REM = (() => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\bhtml\b[^{]*\{[^}]*font-size:\s*14px/, "cambió el rem del proyecto: rehacer la cuenta");
  return 14;
})();

/** Un ancho de la escala de Tailwind (`w-36` = 9rem), en px. `null` si no declara. */
function anchoDeclarado(el) {
  const w = [...el.classList].map((c) => /^w-(\d+(?:\.5)?)$/.exec(c)).find(Boolean);
  return w ? (Number(w[1]) / 4) * REM : null;
}

/**
 * Posición y ancho de la columna `i`, en px, en una tabla de `anchoTabla`.
 * Con `table-fixed`: la cuenta de CSS 2.1. Sin él, tira: el ancho lo decide
 * el contenido.
 */
function medirColumna(t, i, anchoTabla = 1300) {
  const clases = [...t.classList];
  if (!clases.includes("table-fixed") || clases.includes("table-auto")) {
    throw new Error(`la tabla no es table-fixed (${t.className}): el ancho de las columnas lo decide el contenido y no se puede medir`);
  }
  const ths = [...t.querySelectorAll("thead tr:first-child th")];
  const declarados = ths.map(anchoDeclarado);
  const libres = declarados.filter((w) => w == null).length;
  const resto = anchoTabla - declarados.reduce((s, w) => s + (w ?? 0), 0);
  const anchos = declarados.map((w) => w ?? resto / libres);
  return { izquierda: anchos.slice(0, i).reduce((s, w) => s + w, 0), ancho: anchos[i] };
}

const indiceDe = (titulo) => [...tabla().querySelectorAll("thead th")].findIndex((th) => th.textContent.trim() === titulo);

/** La columna CANTIDAD: el encabezado, y la celda de un renglón. */
function medirCantidad(nombre) {
  const i = indiceDe("Cantidad");
  assert.ok(i >= 0, "no está la columna Cantidad");
  const tr = renglon(nombre);
  assert.ok(tr, `no está el renglón de ${nombre}`);
  const celdas = tr.querySelectorAll("td");
  // En una tabla fija la celda del renglón mide lo que su columna: tiene que
  // haber una celda por encabezado, sin `colSpan` ni ancho propio que mienta.
  assert.equal(celdas.length, tabla().querySelectorAll("thead th").length);
  assert.equal(celdas[i].colSpan, 1);
  assert.equal(anchoDeclarado(celdas[i]), null, "la celda declara un ancho distinto del de su columna");
  return { encabezado: medirColumna(tabla(), i), renglon: medirColumna(tabla(), i) };
}

// Lo que cambia color o peso, no tamaño. `font-bold`/`font-normal` en el
// nombre sí cambiarían el ancho del texto: por eso el nombre lleva su copia
// invisible en negrita, que es la que va en la huella.
const SOLO_COLOR_O_ESTADO = new Set(["font-bold", "font-normal", "invisible", "sunmi-surface", "sunmi-border-accent"]);

/** Qué elementos tiene cada celda y con qué clases de tamaño. */
function huella(tr) {
  return [...tr.querySelectorAll("td")].map((td) =>
    [td, ...td.querySelectorAll("*")]
      .map((el) => `${el.tagName}.${[...el.classList].filter((c) => !SOLO_COLOR_O_ESTADO.has(c)).sort().join(".")}`)
      .join(" ")
  );
}

async function escribir(nombre, texto) {
  const campo = renglon(nombre).querySelector(`input[aria-label="Cantidad de ${nombre}"]`);
  await act(async () => campo.focus());
  await teclear(campo, texto);
  await act(async () => campo.blur());
  await asentar();
}

// ── LOS CASOS ─────────────────────────────────────────────────────────────

test("las cuatro columnas fijas declaran su ancho y PRODUCTO toma el resto", async () => {
  await montarE({ inicio: real.carritoVacio });
  const ths = [...tabla().querySelectorAll("thead th")];
  assert.deepEqual(
    ths.map((th) => [th.textContent.trim(), anchoDeclarado(th)]),
    [["Producto", null], ["Categoría", 168], ["Se pide por", 126], ["Cantidad", 126], ["", 168]]
  );
  assert.match(tabla().className, /\btable-fixed\b/);
  assert.doesNotMatch(tabla().className, /\btable-auto\b/, "quedaron los dos layouts: decide la hoja");
});

test("cargar el primero, ir a 3 cifras y sacarlo: la columna CANTIDAD no se mueve ni cambia de ancho", async () => {
  await montarE({ inicio: real.carritoVacio });
  assert.ok(!tabla().querySelector("[data-lugar-sacar]:not(.invisible)"), "el caso tiene que arrancar con 0 cargados");
  const antes = medirCantidad("Yerba 1kg");
  const huellaAntes = huella(renglon("Yerba 1kg"));
  const otroAntes = huella(renglon("Coca 2L"));

  await tocar(renglon("Yerba 1kg").querySelector('button[aria-label^="Sumar uno"]'));
  assert.ok(renglon("Yerba 1kg").querySelector("[data-lugar-sacar]:not(.invisible)"), "cargado, no apareció Sacar");
  assert.deepEqual(medirCantidad("Yerba 1kg"), antes, "al cargar el primero se movió la columna");
  assert.deepEqual(huella(renglon("Yerba 1kg")), huellaAntes, "al cargar cambió lo que ocupa el renglón");
  assert.deepEqual(huella(renglon("Coca 2L")), otroAntes, "al cargar otro cambió un renglón sin cargar");

  // No empieza con el 1 que había: con `minimoComoGuia` la primera tecla
  // reemplaza, y "123" sobre un 1 quedaría en 23.
  await escribir("Yerba 1kg", "456");
  assert.equal(renglon("Yerba 1kg").querySelector("input").value, "456");
  assert.deepEqual(medirCantidad("Yerba 1kg"), antes, "con 3 cifras se movió la columna");
  assert.deepEqual(huella(renglon("Yerba 1kg")), huellaAntes, "con 3 cifras cambió el campo");

  await tocar(renglon("Yerba 1kg").querySelector("[data-lugar-sacar]"));
  assert.ok(!renglon("Yerba 1kg").querySelector("[data-lugar-sacar]:not(.invisible)"));
  assert.deepEqual(medirCantidad("Yerba 1kg"), antes, "al sacarlo se movió la columna");
  assert.deepEqual(huella(renglon("Yerba 1kg")), huellaAntes);
});

test("el borde de cargado solo cambia el color: la regla del kit declara border-color y nada más", () => {
  const css = readFileSync("styles/sunmi.css", "utf8");
  const regla = /\.sunmi-border-accent\s*\{([^}]*)\}/.exec(css);
  assert.ok(regla, "no está la regla");
  assert.deepEqual(
    regla[1].split(";").map((d) => d.trim().split(":")[0].trim()).filter(Boolean),
    ["border-color"],
    "el borde de cargado declara algo más que el color: puede sumar tamaño"
  );
});

test("Lo que pedí: sacar uno no mueve la columna CANTIDAD de los que quedan", async () => {
  await montarE({ inicio: real.carritoBorrador });
  await tocar(boton("Lo que pedí"));
  const antes = medirCantidad("Agua x6");
  const huellaAntes = huella(renglon("Agua x6"));
  await tocar(renglon("Coca 2L").querySelector("[data-lugar-sacar]"));
  assert.ok(!renglon("Coca 2L"), "la coca sigue en Lo que pedí");
  assert.deepEqual(medirCantidad("Agua x6"), antes);
  assert.deepEqual(huella(renglon("Agua x6")), huellaAntes);
});

test("con Ver fotos y en el modo sumar, tampoco: la foto va adentro de PRODUCTO y la marca tiene su renglón", async () => {
  try { localStorage.setItem("pedidos_ver_fotos", "1"); } catch {}
  await montarE({ inicio: { ...real.carritoPendiente, cuerpo: { ...real.carritoPendiente.cuerpo, pendiente: { ...real.carritoPendiente.cuerpo.pendiente, solicitadoAt: new Date().toISOString() } } } });
  assert.ok(renglon("Yerba 1kg").querySelector("[data-tarjeta-foto], [data-tarjeta-inicial]"), "Ver fotos no está prendido");
  assert.equal(tabla().querySelectorAll("thead th").length, 5, "Ver fotos agregó una columna");
  const antes = medirCantidad("Yerba 1kg");
  const huellaAntes = huella(renglon("Yerba 1kg"));
  await tocar(renglon("Yerba 1kg").querySelector('button[aria-label^="Sumar uno"]'));
  assert.equal(renglon("Yerba 1kg").querySelector("[data-marca-cambio]")?.textContent, "nuevo, sin confirmar");
  assert.deepEqual(medirCantidad("Yerba 1kg"), antes);
  assert.deepEqual(huella(renglon("Yerba 1kg")), huellaAntes, "la marca del modo sumar agrandó el renglón");
});

test("CONTRAPRUEBA de la medición: una tabla con ancho automático no se puede medir, y una fija sí", () => {
  const t = document.createElement("table");
  t.innerHTML = '<thead><tr><th></th><th class="w-36"></th></tr></thead>';
  t.className = "w-full table-auto";
  assert.throws(() => medirColumna(t, 1), /lo decide el contenido/);
  t.className = "w-full table-auto table-fixed";
  assert.throws(() => medirColumna(t, 1), /lo decide el contenido/, "con los dos layouts decide la hoja: no vale");
  t.className = "w-full table-fixed";
  assert.deepEqual(medirColumna(t, 1, 1000), { izquierda: 874, ancho: 126 });
});

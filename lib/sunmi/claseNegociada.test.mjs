// EL DEFAULT DE LA PIEZA CEDE ANTE LO QUE PIDE LA PANTALLA.
//
// Las cadenas de acá no están inventadas: son las siete que hoy existen en el
// repo, cuatro en `TablaCatalogo` y tres en `ListaConciliacion`. Si la pieza no
// sirve para las siete tal como están, la pieza está mal.

import test from "node:test";
import assert from "node:assert/strict";

import {
  declaraTamanoDeLetra,
  declaraColorDeTexto,
  componerClaseTexto,
} from "@/lib/sunmi/claseNegociada";

// Las siete, copiadas de donde están escritas hoy.
const CATALOGO = [
  "text-[9.5px] sunmi-text-muted truncate max-w-[9rem] md:max-w-[22rem]",
  "text-[9.5px] sunmi-text-muted",
  "text-[9.5px] sunmi-text-muted",
  "text-[9.5px] sunmi-text-muted",
];
const COMPROBANTES = [
  "text-xs2 truncate sunmi-text-accent",
  "text-xs2 sunmi-text-warning",
  "text-xs2 sunmi-text-muted",
];

// ── QUÉ CUENTA COMO TAMAÑO ─────────────────────────────────────────────────

test("un tamaño arbitrario y un token del kit cuentan los dos", () => {
  assert.equal(declaraTamanoDeLetra("text-[9.5px]"), true);
  assert.equal(declaraTamanoDeLetra("text-xs2"), true);
  assert.equal(declaraTamanoDeLetra("!text-sm2"), true, "el ! no cambia la familia");
});

test("LA ALINEACIÓN NO ES UN TAMAÑO", () => {
  // Son propiedades CSS distintas: no hay pelea que ganar, y si contara, una
  // celda alineada a la derecha se quedaría sin el tamaño de la pieza.
  for (const t of ["text-right", "text-left", "text-center", "text-justify"]) {
    assert.equal(declaraTamanoDeLetra(t), false, t);
  }
});

test("un color del tema no cuenta como tamaño, ni al revés", () => {
  assert.equal(declaraTamanoDeLetra("sunmi-text-muted"), false);
  assert.equal(declaraColorDeTexto("text-xs2"), false);
  assert.equal(declaraColorDeTexto("sunmi-text-warning"), true);
});

test("sin className no se declara nada", () => {
  for (const v of ["", null, undefined, 7]) {
    assert.equal(declaraTamanoDeLetra(v), false);
    assert.equal(declaraColorDeTexto(v), false);
  }
});

// ── LO QUE SE PUEDE MIRAR: LA CADENA QUE SALE ──────────────────────────────

test("sin nada pedido, la pieza pone su tamaño y su color", () => {
  const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido: "" });
  assert.equal(c, "text-xs2 sunmi-text-muted");
});

test("EL CATÁLOGO CONSERVA SUS 9.5px: la pieza no pone el suyo", () => {
  // Es la prueba de que la pantalla de origen queda idéntica. Si apareciera
  // `text-xs2` al lado, ganaría cualquiera de las dos según la hoja de estilos.
  for (const pedido of CATALOGO) {
    const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido });
    assert.equal(c.includes("text-xs2"), false, c);
    assert.equal(c.includes("text-[9.5px]"), true, c);
  }
});

test("NUNCA DOS DE LA MISMA FAMILIA en la cadena que sale", () => {
  // El defecto original: `w-full` y `w-[46px]` juntos, y decidía Tailwind.
  for (const pedido of [...CATALOGO, ...COMPROBANTES]) {
    const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido });
    const tam = c.split(" ").filter((t) => declaraTamanoDeLetra(t));
    const col = c.split(" ").filter((t) => declaraColorDeTexto(t));
    assert.equal(tam.length, 1, `tamaños en "${c}"`);
    assert.equal(col.length, 1, `colores en "${c}"`);
  }
});

test("un color propio pisa al del kit y el tamaño sigue viniendo de la pieza", () => {
  // Es el caso de comprobantes cuando el precio difiere: ámbar, tamaño del kit.
  const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido: "sunmi-text-warning" });
  assert.equal(c, "text-xs2 sunmi-text-warning");
});

test("lo que no es de ninguna familia se agrega sin sacar nada", () => {
  const c = componerClaseTexto({ tamano: "text-xs2", color: "sunmi-text-muted", pedido: "truncate" });
  assert.equal(c, "text-xs2 sunmi-text-muted truncate");
});

test("la base va primero y no cede nunca", () => {
  const c = componerClaseTexto({ base: "block", tamano: "text-xs2", color: "sunmi-text-muted", pedido: "text-sm2" });
  assert.match(c, /^block /);
  assert.equal(c.includes("text-xs2"), false);
});

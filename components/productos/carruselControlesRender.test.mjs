import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";

import CarruselControles, {
  POR_PAGINA,
  TINTE_ACTIVO_PCT,
  ACENTO_ACTIVO,
  enPaginas,
} from "@/components/productos/CarruselControles";
import { CONTROLES } from "@/lib/productos/controlesCalidad";

const render = (props) =>
  renderToStaticMarkup(createElement(CarruselControles, props));
const conCantidad = (n) => CONTROLES.map((c) => ({ ...c, cantidad: n }));

test("G1. en cero y con conteo completo, la card dice que está sana", () => {
  const html = render({ controles: conCantidad(0) });
  assert.match(html, /al día/);
  assert.match(html, /sin pendientes/);
  assert.doesNotMatch(html, /\+30 días/);
  assert.match(html, /var\(--success-fg\)/);
});

test("G2. con problemas, muestra el problema y no el copy sano", () => {
  const html = render({ controles: conCantidad(7) });
  assert.match(html, /\+30 días/);
  assert.doesNotMatch(html, /al día/);
  assert.doesNotMatch(html, /sin pendientes/);
  assert.match(html, /var\(--warning-fg\)/);
  assert.match(html, /var\(--danger-fg\)/);
});

test("G3. un conteo parcial no se muestra como sano", () => {
  const html = render({ controles: conCantidad(0), truncado: true, techo: 5000 });
  assert.doesNotMatch(html, /al día/);
  assert.doesNotMatch(html, /sin pendientes/);
  assert.doesNotMatch(html, /var\(--success-fg\)/);
  assert.match(html, /\+0/);
  assert.match(html, /Conteo parcial/);
  assert.match(html, /5\.000/);
});

test("G4. con conteo parcial y problemas tampoco se afirma un total", () => {
  const html = render({ controles: conCantidad(42), truncado: true, techo: 5000 });
  assert.match(html, /\+42/);
  assert.match(html, /Conteo parcial/);
});

test("G5. sin truncar no aparece ni el aviso ni el '+'", () => {
  const html = render({ controles: conCantidad(42) });
  assert.doesNotMatch(html, /Conteo parcial/);
  assert.doesNotMatch(html, /\+42/);
});

test("G6. las cuatro cards se dibujan aunque estén todas en cero", () => {
  const html = render({ controles: conCantidad(0) });
  for (const c of CONTROLES) assert.ok(html.includes(c.titulo), `falta la card de ${c.titulo}`);
});

test("G7. mientras no llegaron controles no se afirma salud", () => {
  assert.equal(render({ controles: [], cargando: true }), "");
});

test("G8. no hay colores escritos a mano", () => {
  const html = render({ controles: conCantidad(3), truncado: true, techo: 5000 });
  assert.deepEqual(html.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  assert.deepEqual(html.match(/rgba?\([^)]*\)/g) || [], []);
});

test("G9. la sonda mide la misma mezcla de contraste que el componente", () => {
  const html = render({ controles: conCantidad(3) });
  const sonda = fs.readFileSync(path.join(process.cwd(), "scripts", "sonda-controles-tokens.mjs"), "utf8");
  const mezclas = [...html.matchAll(/color-mix\(in srgb, var\(--[a-z-]+\) (\d+)%, var\(--app-fg\)\)/g)];
  assert.ok(mezclas.length > 0);
  const proporciones = [...new Set(mezclas.map((m) => m[1]))];
  assert.equal(proporciones.length, 1);
  const enLaSonda = sonda.match(/var\(\$\{token\}\) (\d+)%, var\(--app-fg\)/);
  assert.ok(enLaSonda);
  assert.equal(enLaSonda[1], proporciones[0]);
});

test("G10. vuelve la estructura 2x2 de cuatro cards por página", () => {
  assert.equal(POR_PAGINA, 4);
  assert.equal(enPaginas(CONTROLES).length, 1);
  const html = render({ controles: conCantidad(7) });
  assert.match(html, /grid-cols-2 grid-rows-2/);
  assert.doesNotMatch(html, /width:43%/);
});

test("G11. al tocar una card se enciende solo con el acento del theme", () => {
  const html = render({ controles: conCantidad(7), activo: CONTROLES[0].id });
  const fondoEsperado = `color-mix(in srgb, ${ACENTO_ACTIVO} ${TINTE_ACTIVO_PCT}%, var(--card-bg))`;
  assert.equal((html.match(new RegExp(fondoEsperado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
  assert.equal((html.match(/ring-2/g) || []).length, 1);
  assert.equal((html.match(/border-color:var\(--pos-accent\)/g) || []).length, 1);
  assert.equal((html.match(/--tw-ring-color:var\(--pos-accent\)/g) || []).length, 1);
  assert.equal((html.match(/background:var\(--card-bg\)/g) || []).length, CONTROLES.length - 1);
  assert.doesNotMatch(html, />Tocá para quitar</);
});

test("G12. sin control activo ninguna card queda teñida", () => {
  const html = render({ controles: conCantidad(7) });
  assert.doesNotMatch(html, /color-mix\(in srgb, var\(--pos-accent\) 12%, var\(--card-bg\)\)/);
  assert.doesNotMatch(html, /ring-2/);
});

test("G13. la semántica de salud no sale de tokens del POS", () => {
  const html = render({ controles: conCantidad(3), truncado: true, techo: 5000 });
  for (const prohibido of ["--pos-success", "--pos-warning", "--pos-danger"]) {
    assert.doesNotMatch(html, new RegExp(prohibido.replace(/-/g, "\\-")));
  }
});

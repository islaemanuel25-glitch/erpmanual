// Candados de lo que el carrusel DIBUJA, renderizándolo de verdad.
//
// ── POR QUÉ RENDERIZAR Y NO LEER EL ARCHIVO ────────────────────────────────
//
// Las dos afirmaciones de acá son sobre lo que se ve, y un candado que busque
// texto en el JSX las contestaría mal: encontraría la palabra "al día" escrita en
// el componente aunque la rama que la dibuja no corra nunca. Es exactamente el
// caso del `Escape` que dio verde con la comprobación sacada porque la palabra
// estaba en un comentario.
//
// Es la misma técnica que ya usan los seis candados de render de caja:
// `renderToStaticMarkup` sobre el componente real.
//
// ── EL CASO DEL CONTEO PARCIAL NO SE PUEDE EJERCER CON DATOS ──────────────
//
// El techo del servidor son 5.000 productos y la base de desarrollo tiene 1.790,
// así que la sonda del navegador NO puede llegar a ese estado sin fabricar 3.210
// productos — y fabricar datos para que un caso aparezca es justo lo que este
// proyecto no hace. Acá el estado se pasa como prop, que es la forma honesta de
// ejercerlo: no se inventa un catálogo, se ejerce el componente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import CarruselControles from "@/components/productos/CarruselControles";
import { CONTROLES } from "@/lib/productos/controlesCalidad";

const render = (props) => renderToStaticMarkup(createElement(CarruselControles, props));

/** Los cuatro controles con la cantidad que se les pase. */
const conCantidad = (n) => CONTROLES.map((c) => ({ ...c, cantidad: n }));

test("G1. en cero y con el conteo completo, la card dice que está sana", () => {
  const html = render({ controles: conCantidad(0) });
  // El texto sano del dominio, no el del problema.
  assert.match(html, /al día/, "falta el copy de estado sano de Precios");
  assert.match(html, /sin pendientes/, "falta el copy de estado sano de los otros");
  assert.doesNotMatch(html, /\+30 días/, "sigue mostrando el nombre del problema sobre un 0");
  assert.match(html, /var\(--success-fg\)/, "el 0 sano no está en verde");
});

test("G2. con problemas, la card dice el problema y NO el copy sano", () => {
  const html = render({ controles: conCantidad(7) });
  assert.match(html, /\+30 días/);
  assert.doesNotMatch(html, /al día/);
  assert.doesNotMatch(html, /sin pendientes/);
  assert.match(html, /var\(--warning-fg\)/);
  assert.match(html, /var\(--danger-fg\)/);
});

test("G3. UN CONTEO PARCIAL NO SE PUEDE MOSTRAR COMO SANO", () => {
  // ── EL CANDADO QUE PIDIÓ LA REVISIÓN ────────────────────────────────────
  //
  // Los endpoints ya devolvían `truncado` y la pantalla lo tiraba. Con el techo
  // alcanzado, un 0 no significa "no hay ninguno": significa "no lo sé, miré una
  // parte". Pintarlo de verde con un tilde es la pantalla afirmando salud sobre
  // datos que no tiene.
  const html = render({ controles: conCantidad(0), truncado: true, techo: 5000 });

  assert.doesNotMatch(html, /al día/, "un 0 parcial NO puede decir que está al día");
  assert.doesNotMatch(html, /sin pendientes/, "un 0 parcial NO puede decir que no hay pendientes");
  assert.doesNotMatch(html, /var\(--success-fg\)/, "un 0 parcial NO puede ir en verde");
  assert.match(html, /\+0/, "el número parcial tiene que llevar el signo de 'al menos'");
  assert.match(html, /Conteo parcial/, "no avisa que el cálculo fue parcial");
  assert.match(html, /5\.000/, "no dice sobre cuántos se contó");
});

test("G4. con conteo parcial y problemas, tampoco se afirma un total", () => {
  const html = render({ controles: conCantidad(42), truncado: true, techo: 5000 });
  assert.match(html, /\+42/, "el número parcial lleva '+' aunque no sea cero");
  assert.match(html, /Conteo parcial/);
});

test("G5. sin truncar, no aparece ni el aviso ni el '+'", () => {
  // La contraprueba de G3 y G4: si el aviso saliera siempre, los dos pasarían en
  // verde sin que el flag hiciera nada.
  const html = render({ controles: conCantidad(42) });
  assert.doesNotMatch(html, /Conteo parcial/);
  assert.doesNotMatch(html, /\+42/);
});

test("G6. las cuatro cards se dibujan aunque estén todas en cero", () => {
  const html = render({ controles: conCantidad(0) });
  for (const c of CONTROLES) {
    assert.ok(html.includes(c.titulo), `falta la card de ${c.titulo}`);
  }
});

test("G7. mientras carga no se afirma nada sobre la salud", () => {
  // Sin conteo todavía, la lista viene vacía y el bloque no se dibuja. Lo que NO
  // puede pasar es que dibuje cuatro ceros verdes antes de saber.
  assert.equal(render({ controles: [], cargando: true }), "");
});

test("G8. NO hay ni un color escrito a mano: todo sale de tokens", () => {
  // Se mira el HTML dibujado y no el archivo, así que un hex en un comentario no
  // cuenta y uno en un `style` sí.
  const html = render({ controles: conCantidad(3), truncado: true, techo: 5000 });
  const hexes = html.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hexes, [], `colores escritos a mano: ${hexes.join(", ")}`);
  const rgb = html.match(/rgba?\([^)]*\)/g) || [];
  assert.deepEqual(rgb, [], `colores escritos a mano: ${rgb.join(", ")}`);
});

test("G9. la semántica de salud NO sale de los tokens del POS", () => {
  // El guardrail de la revisión: `--pos-success/warning/danger` pertenecen al tema
  // paralelo del POS, y esto es el catálogo. El acento y el gris neutro sí pueden
  // seguir siendo del POS — no son semántica de salud — así que se prohíben los
  // tres por nombre y no cualquier `--pos-`.
  const html = render({ controles: conCantidad(3), truncado: true, techo: 5000 });
  for (const prohibido of ["--pos-success", "--pos-warning", "--pos-danger"]) {
    assert.doesNotMatch(
      html,
      new RegExp(prohibido.replace(/-/g, "\\-")),
      `${prohibido} volvió a decidir la salud del catálogo`
    );
  }
});

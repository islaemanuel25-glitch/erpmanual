// CANDADO: EL AVISO COMPACTO, DIBUJADO DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiAviso.test.mjs
//
// La pieza salió del "Tip" de la portada de Configuración POS para que Cobros
// pudiera usar el mismo bloque. Lo que se cuida acá es que no traiga una paleta
// propia: si alguien le mete un color literal, el aviso deja de seguir el theme
// y las dos pantallas empiezan a verse distinto en los temas claros.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";

const Icono = (props) => createElement("svg", props);

const dibujar = (props = {}) =>
  renderToStaticMarkup(
    createElement(SunmiAviso, { icon: Icono, titulo: "Tip", ...props }, "El cuerpo del aviso.")
  );

test("dibuja el rótulo, el cuerpo y el icono", () => {
  const html = dibujar();
  assert.ok(html.includes("Tip"));
  assert.ok(html.includes("El cuerpo del aviso."));
  assert.match(html, /<svg/);
});

test("sin icono y sin título sigue dibujando el cuerpo", () => {
  const html = dibujar({ icon: null, titulo: null });
  assert.ok(html.includes("El cuerpo del aviso."));
  assert.equal(html.includes("<svg"), false);
});

test("los colores salen del kit, no de una paleta propia", () => {
  const html = dibujar();
  assert.match(html, /sunmi-btn-accent-soft/);
  assert.match(html, /sunmi-badge-accent/);
  assert.match(html, /sunmi-text-accent/);
  assert.match(html, /sunmi-text-muted/);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/, "un color literal en el aviso");
  assert.doesNotMatch(
    html,
    /(bg|text|border)-(slate|amber|orange|red|green|emerald|gray)-[0-9]/,
    "una clase de color cruda de Tailwind"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// EL TONO
// ══════════════════════════════════════════════════════════════════════════
//
// Existe porque un aviso de que algo salió bien y uno de que algo falló no se
// distinguen con el tono de acento, y las pantallas lo resolvían escribiendo
// `bg-green-500/10 text-green-400` a mano — color crudo, sin theme.

test("SIN TONO SE VE IGUAL QUE SIEMPRE: es la compatibilidad hacia atrás", () => {
  // No alcanza con decirlo en un comentario. Se compara el markup del default
  // contra el de `tono="neutral"` y tienen que ser el MISMO string: si algún día
  // el default cambia de familia, esto se pone rojo antes de que se vea en una
  // pantalla que nadie tocó.
  assert.equal(dibujar(), dibujar({ tono: "neutral" }));
});

test("cada tono usa las TRES familias del kit que le corresponden", () => {
  const esperado = {
    neutral: ["sunmi-btn-accent-soft", "sunmi-badge-accent", "sunmi-text-accent"],
    success: ["sunmi-btn-success-soft", "sunmi-badge-success", "sunmi-text-success"],
    danger: ["sunmi-btn-danger-soft", "sunmi-badge-danger", "sunmi-text-danger"],
    warning: ["sunmi-btn-warning-soft", "sunmi-badge-warning", "sunmi-text-warning"],
  };

  for (const [tono, clases] of Object.entries(esperado)) {
    const html = dibujar({ tono });
    for (const clase of clases) {
      assert.match(html, new RegExp(clase), `${tono} no aplicó ${clase}`);
    }
  }
});

test("SUCCESS Y DANGER SE DISTINGUEN DE VERDAD, no solo de nombre", () => {
  // Es lo que la pantalla necesitaba y lo único que justifica la prop: si los
  // dos dibujaran lo mismo, el aviso de "guardado" y el de "falló" serían
  // indistinguibles y la prop sería decorativa.
  const ok = dibujar({ tono: "success" });
  const mal = dibujar({ tono: "danger" });

  assert.notEqual(ok, mal);
  assert.equal(ok.includes("danger"), false, "el tono success no puede traer nada de danger");
  assert.equal(mal.includes("success"), false, "el tono danger no puede traer nada de success");
});

test("NINGÚN TONO INTRODUCE UN COLOR LITERAL", () => {
  // La razón de ser de la prop es dejar de escribir colores a mano. Un tono que
  // trajera un hex haría exactamente lo que vino a evitar.
  for (const tono of ["neutral", "success", "danger", "warning"]) {
    const html = dibujar({ tono });
    assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/, `${tono} trae un color literal`);
    assert.doesNotMatch(html, /rgba?\(|hsla?\(/, `${tono} trae un color en rgb/hsl`);
    assert.doesNotMatch(
      html,
      /(bg|text|border)-(slate|amber|orange|red|green|emerald|gray)-[0-9]/,
      `${tono} trae una clase de color cruda de Tailwind`
    );
  }
});

test("un tono que no existe cae en neutral y no en una caja sin fondo", () => {
  // Una caja sin clase de fondo se lee como un defecto de maquetado, no como un
  // valor mal escrito, y por eso el que lo mire va a buscar el problema en el
  // lugar equivocado.
  assert.equal(dibujar({ tono: "inventado" }), dibujar({ tono: "neutral" }));
});

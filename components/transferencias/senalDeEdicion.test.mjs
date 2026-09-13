// LA FILA EN EDICIÓN NO SE DISTINGUE POR EL COLOR, Y ACÁ ESTÁ MEDIDO POR QUÉ.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/senalDeEdicion.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA ─────────────────────────────────────────────
//
// La primera versión de la pantalla de corte marcaba la fila EN EDICIÓN con el
// borde en `accent` y la relación SIN CONFIGURAR con el borde en `warning`. Dos
// estados distintos, dos variables de tema distintas, y parecía suficiente.
//
// No lo es, y no es una impresión: se mide leyendo `app/globals.css`. En
// **sunmiSand** `--pos-accent` y `--pos-warning` son EL MISMO hexadecimal. No
// parecidos: el mismo. Los dos estados quedaban idénticos, y en otros seis
// temas la distancia perceptual entre ambos es menor a 20 —los cuatro ámbar de
// `#fbbf24` contra `#f59e0b`, y `sunmiLight` y `ambarCaja` de `#d97706` contra
// `#b45309`—.
//
// ── POR QUÉ LA MEDICIÓN VIVE EN EL CANDADO Y NO EN UN INFORME ──────────────
//
// Porque un informe se escribe una vez y los temas se siguen agregando. Esto
// vuelve a medir en cada corrida, así que el día que alguien sume el tema
// quince con su propio par de amarillos, la afirmación sigue valiendo sin que
// nadie tenga que acordarse.
//
// ── EL INVARIANTE ─────────────────────────────────────────────────────────
//
// La señal es el ESTILO del borde —punteado mientras se edita, sólido en los
// otros dos estados—. `border-style` no sale de ninguna variable de tema, así
// que vale igual en los catorce. El color `accent` se conserva encima porque en
// los siete temas donde SÍ se distingue ayuda, pero la diferencia no cuelga de
// él: eso es lo que estos candados afirman.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FilaCorteDeSemana from "./FilaCorteDeSemana.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ── LA MEDICIÓN ────────────────────────────────────────────────────────────

/** Los bloques `html[data-theme="X"] { … }` de la hoja global, con su cuerpo. */
function temasDeLaHoja() {
  const src = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
  const temas = [];
  const re = /html\[data-theme="([A-Za-z0-9]+)"\][^{]*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let profundidad = 1;
    while (i < src.length && profundidad > 0) {
      if (src[i] === "{") profundidad++;
      else if (src[i] === "}") profundidad--;
      i++;
    }
    temas.push({ nombre: m[1], cuerpo: src.slice(m.index + m[0].length, i) });
  }
  return temas;
}

const hexDe = (cuerpo, variable) => {
  const m = new RegExp(`${variable}:\\s*(#[0-9A-Fa-f]{6})`).exec(cuerpo);
  return m ? m[1].toLowerCase() : null;
};

/** sRGB → Lab (D65), para poder comparar colores como los ve un ojo y no como bytes. */
function aLab(hex) {
  const n = hex.replace("#", "");
  const canal = (i) => {
    const u = parseInt(n.slice(i, i + 2), 16) / 255;
    return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [canal(0), canal(2), canal(4)];
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const distancia = (a, b) => {
  const [l1, a1, b1] = aLab(a);
  const [l2, a2, b2] = aLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};

test("MEDICIÓN · hay al menos un tema donde accent y warning no se pueden distinguir", () => {
  const temas = temasDeLaHoja().filter(
    (t) => hexDe(t.cuerpo, "--pos-accent") && hexDe(t.cuerpo, "--pos-warning")
  );

  // Que sean catorce no es decorativo: si mañana son quince, esta afirmación
  // mide el nuevo también, y si son trece alguien sacó uno y conviene saberlo.
  assert.ok(temas.length >= 14, `se esperaban 14 temas con los dos tokens, hay ${temas.length}`);

  const medidos = temas
    .map((t) => ({
      nombre: t.nombre,
      accent: hexDe(t.cuerpo, "--pos-accent"),
      warning: hexDe(t.cuerpo, "--pos-warning"),
      delta: distancia(hexDe(t.cuerpo, "--pos-accent"), hexDe(t.cuerpo, "--pos-warning")),
    }))
    .sort((a, b) => a.delta - b.delta);

  const peor = medidos[0];
  assert.ok(
    peor.delta < 20,
    `si NINGÚN tema tiene los dos tonos cerca, hay que volver a leer si la señal ` +
      `no cromática sigue haciendo falta. Hoy el más parecido es ${peor.nombre} ` +
      `con ΔE ${peor.delta.toFixed(2)}.`
  );

  // Y el caso que obligó al cambio: los dos tonos IDÉNTICOS en algún tema.
  const identicos = medidos.filter((m) => m.accent === m.warning);
  assert.ok(
    identicos.length >= 1,
    "ya no hay ningún tema con accent y warning en el mismo hexadecimal: " +
      "vale releer esta decisión, aunque siete temas siguen abajo de ΔE 20."
  );
});

// ── EL INVARIANTE ──────────────────────────────────────────────────────────

const RELACION = {
  localId: 2,
  localNombre: "mini el 7",
  depositoNombre: "depo",
  diaDeCorte: 1,
  sinConfigurar: false,
  rango: { desde: "2026-09-14", hasta: "2026-09-20" },
};

const marcoDe = (props) => {
  const html = renderToStaticMarkup(React.createElement(FilaCorteDeSemana, props));
  // La clase del `section`, que es el marco de la fila: el primer class= del render.
  const m = /class="([^"]*)"/.exec(html);
  return m ? m[1].split(/\s+/) : [];
};

/** Lo que queda de la clase del marco sacándole TODO lo que es color. */
const firmaSinColor = (clases) =>
  clases.filter((c) => c.startsWith("border")).filter((c) => !/^sunmi-border/.test(c)).sort().join(" ");

test("los tres estados se distinguen SIN mirar un solo color", () => {
  const editando = marcoDe({ relacion: RELACION, editando: true, diaElegido: 2 });
  const sinConfigurar = marcoDe({ relacion: { ...RELACION, sinConfigurar: true } });
  const quieta = marcoDe({ relacion: RELACION });

  const firmas = {
    editando: firmaSinColor(editando),
    sinConfigurar: firmaSinColor(sinConfigurar),
    quieta: firmaSinColor(quieta),
  };

  // Ninguna vacía: una firma vacía significaría que el estado no declara nada
  // que no sea color, que es exactamente el defecto.
  for (const [estado, firma] of Object.entries(firmas)) {
    assert.notEqual(firma, "", `el estado «${estado}» no tiene ninguna marca que no sea color`);
  }

  assert.notEqual(firmas.editando, firmas.sinConfigurar, "editando y sin configurar se ven igual sin color");
  assert.notEqual(firmas.editando, firmas.quieta, "editando y la fila quieta se ven igual sin color");
  assert.notEqual(firmas.sinConfigurar, firmas.quieta, "sin configurar y la fila quieta se ven igual sin color");
});

test("la señal de edición es el borde PUNTEADO, y los otros dos son sólidos", () => {
  const editando = marcoDe({ relacion: RELACION, editando: true, diaElegido: 2 });
  assert.ok(editando.includes("border-dashed"), "la fila en edición no lleva el borde punteado");
  assert.ok(!editando.includes("border-solid"), "la fila en edición declara sólido y punteado a la vez");

  for (const props of [{ relacion: { ...RELACION, sinConfigurar: true } }, { relacion: RELACION }]) {
    const clases = marcoDe(props);
    assert.ok(clases.includes("border-solid"), "una fila que no se está editando tiene que ser sólida");
    assert.ok(!clases.includes("border-dashed"), "solo la edición puede ser punteada");
  }
});

test("CONTRAPRUEBA · la marca de «sin configurar» NO se pierde mientras se edita esa fila", () => {
  // El borde pasa a decir "estoy editando", así que el hecho de que la relación
  // no tenga acuerdo tiene que seguir dicho en otro lado — la píldora. Sin esto,
  // entrar a editar borraría la única marca de que ese domingo no lo eligió nadie.
  const html = renderToStaticMarkup(
    React.createElement(FilaCorteDeSemana, {
      relacion: { ...RELACION, sinConfigurar: true },
      editando: true,
      diaElegido: 0,
    })
  );
  assert.ok(html.includes("Sin configurar"), "editando se perdió la marca de la relación sin acuerdo");
});

test("sin permiso para configurar, la fila se LEE: no ofrece un botón que el servidor rechaza", () => {
  const conPermiso = renderToStaticMarkup(
    React.createElement(FilaCorteDeSemana, { relacion: RELACION, puedeEditar: true })
  );
  const sinPermiso = renderToStaticMarkup(
    React.createElement(FilaCorteDeSemana, { relacion: RELACION, puedeEditar: false })
  );

  assert.ok(conPermiso.includes("Cambiar"), "con permiso tiene que poder cambiarlo");
  assert.ok(!sinPermiso.includes("Cambiar"), "sin permiso no se ofrece un botón que va a dar 403");
  // Y lo que sí se sigue viendo: qué día arranca y qué semana está en curso.
  assert.ok(sinPermiso.includes("Arranca"), "sin permiso igual se tiene que poder LEER el corte");
  assert.ok(sinPermiso.includes("14/09 al 20/09"), "sin permiso igual se ve la semana en curso");
});

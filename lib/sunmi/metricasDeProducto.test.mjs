// LAS SIETE MÉTRICAS DE LA TARJETA DE PRODUCTO SON UN CONTRATO, NO NÚMEROS.
//
// ── QUÉ PROTEGE ESTE CANDADO ──────────────────────────────────────────────
//
// Los siete valores estaban escritos a mano en el JSX —`gap-[9px]`,
// `min-h-[51.5px]`, `w-[202px]`, `text-[9px]`, `text-[25px]`, `w-[44px] h-[44px]`
// y otro `h-[44px]`— y el trinquete los contaba como deuda, con razón: un número
// suelto en una cadena de clases no dice qué decide ni permite cambiarlo en un
// solo lugar.
//
// Figma los formalizó como contrato —archivo fYqIEZxHRb6yx6pIUrUG2h, nodo 12:2—
// con EXACTAMENTE los valores que la tarjeta ya mostraba.
//
// ── POR QUÉ NO SE AJUSTARON A LA ESCALA, QUE ERA LA TENTACIÓN ─────────────
//
// Ninguno cae en la escala de espaciado del sistema, que es de 3,5 px por unidad
// —raíz de 14 px— y solo da equivalencia en un escalón exacto: 9 px son 2,571
// unidades, 51,5 son 14,714, 44 son 12,571 y 202 no tiene escalón cerca. La
// escala tipográfica tiene tres tokens, 10, 11 y 14 px, y ni 9 ni 25 están.
//
// O sea que la única forma de "usar un token existente" habría sido MOVER el
// valor —9→8,75, 51,5→49, 44→42, 9 px de texto→10— y eso es cambiar el diseño
// para callar al contador. Es exactamente lo que esta tanda no hace.
//
// ── LO QUE ESTE CANDADO NO VE ─────────────────────────────────────────────
//
// No mide píxeles: eso es el navegador, y lo hace `scripts/sonda-tarjeta-producto.mjs`
// junto con la medición de esta tanda. Acá se afirma que el número vive UNA vez,
// con su valor, y que el JSX nombra la intención en vez de repetir la cifra.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CSS = fs.readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8");
const TARJETA = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiProductoCard.jsx"), "utf8");
const LISTA = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiListaProductoCards.jsx"), "utf8");

/** Los siete, con el valor aprobado. Si alguno cambia, cambió el diseño. */
const CONTRATO = {
  "--sunmi-product-list-gap": "9px",
  "--sunmi-product-value-min-height": "51.5px",
  "--sunmi-product-value-width": "202px",
  "--sunmi-product-value-label-font-size": "9px",
  "--sunmi-product-value-number-font-size": "25px",
  "--sunmi-product-thumbnail-size": "44px",
  "--sunmi-product-action-height": "44px",
};

test("los siete tokens existen y valen EXACTAMENTE lo aprobado en Figma", () => {
  for (const [token, valor] of Object.entries(CONTRATO)) {
    const m = CSS.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
    assert.ok(m, `falta el token ${token}`);
    assert.equal(
      m[1].trim(),
      valor,
      `${token} dejó de valer ${valor}. Si el diseño cambió, se cambia en Figma y se actualiza acá a propósito; ` +
        `si se ajustó a un escalón de la escala para que el contador callara, eso movió píxeles.`
    );
  }
});

test("el número solo aparece en la definición del token, nunca en una regla", () => {
  // ── LO QUE ESTA AFIRMACIÓN NO PUEDE SER ─────────────────────────────────
  //
  // La primera versión decía "cada número vive una sola vez" y contaba el valor
  // en toda la hoja. Estaba mal por dos motivos, y el segundo importa más:
  //
  //   · `999px` contiene `9px` como subcadena, así que contaba de más;
  //   · y sobre todo, DOS TOKENS DISTINTOS PUEDEN VALER LO MISMO. `9px` es el
  //     gap de la lista Y el cuerpo del rótulo; `44px` es la miniatura Y el alto
  //     de acción. Son decisiones separadas que hoy coinciden, que es
  //     exactamente lo que afirma el candado de más abajo. Prohibir la
  //     repetición del número prohibiría el diseño.
  //
  // Lo que sí vale es que el número no aparezca en el CUERPO de una regla: ahí
  // es donde volvería a ser una medida mágica dispersa.
  const cuerpos = [...CSS.matchAll(/\.sunmi-product-[a-z-]+\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(cuerpos.length >= 6, "no se encontraron las reglas .sunmi-product-*");
  for (const cuerpo of cuerpos) {
    assert.doesNotMatch(
      cuerpo,
      /:\s*[0-9.]+(px|rem|em)/,
      `una regla .sunmi-product-* escribe un número en vez de leer su token:\n${cuerpo.trim()}`
    );
  }
});

test("las clases semánticas existen y consumen el token, no el número", () => {
  const clases = {
    ".sunmi-product-list": ["--sunmi-product-list-gap"],
    ".sunmi-product-value-block": ["--sunmi-product-value-width", "--sunmi-product-value-min-height"],
    ".sunmi-product-value-label": ["--sunmi-product-value-label-font-size"],
    ".sunmi-product-value-number": ["--sunmi-product-value-number-font-size"],
    ".sunmi-product-thumbnail": ["--sunmi-product-thumbnail-size"],
    ".sunmi-product-card-action": ["--sunmi-product-action-height"],
  };
  for (const [clase, tokens] of Object.entries(clases)) {
    const bloque = CSS.match(new RegExp(`\\${clase}\\s*\\{([^}]*)\\}`));
    assert.ok(bloque, `falta la clase ${clase}`);
    for (const t of tokens) {
      assert.match(bloque[1], new RegExp(`var\\(${t}\\)`), `${clase} no usa ${t}`);
    }
  }
});

test("la miniatura gobierna LOS DOS EJES con un solo token", () => {
  // Es un cuadrado por contrato. Si mañana alguien le pone dos tokens distintos,
  // dejó de serlo y hay que decidirlo en Figma, no en una hoja de estilos.
  const bloque = CSS.match(/\.sunmi-product-thumbnail\s*\{([^}]*)\}/)[1];
  assert.match(bloque, /width:\s*var\(--sunmi-product-thumbnail-size\)/);
  assert.match(bloque, /height:\s*var\(--sunmi-product-thumbnail-size\)/);
});

test("la altura de acción y el lado de la miniatura son tokens DISTINTOS", () => {
  // Hoy los dos valen 44 px y la tentación es unirlos. Son decisiones distintas
  // —el tamaño de una imagen y el alto de un área táctil— y no tienen por qué
  // moverse juntas. Unirlas por coincidencia numérica ata dos cosas que el
  // diseño puede querer separar.
  assert.notEqual("--sunmi-product-thumbnail-size", "--sunmi-product-action-height");
  assert.match(CSS, /--sunmi-product-thumbnail-size:/);
  assert.match(CSS, /--sunmi-product-action-height:/);
  const accion = CSS.match(/\.sunmi-product-card-action\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(
    accion,
    /--sunmi-product-thumbnail-size/,
    "el área de acción pasó a colgar del token de la miniatura: son decisiones distintas"
  );
});

test("el JSX ya no conoce ninguno de los siete números", () => {
  const prohibidas = [
    /gap-\[9px\]/,
    /min-h-\[51\.5px\]/,
    /w-\[202px\]/,
    /text-\[9px\]/,
    /text-\[25px\]/,
    /w-\[44px\]/,
    /h-\[44px\]/,
  ];
  for (const p of prohibidas) {
    assert.doesNotMatch(TARJETA, p, `volvió ${p} a SunmiProductoCard`);
    assert.doesNotMatch(LISTA, p, `volvió ${p} a SunmiListaProductoCards`);
  }
});

test("y el JSX consume las clases semánticas", () => {
  for (const c of [
    "sunmi-product-value-block",
    "sunmi-product-value-label",
    "sunmi-product-value-number",
    "sunmi-product-thumbnail",
    "sunmi-product-card-action",
  ]) {
    assert.ok(TARJETA.includes(c), `SunmiProductoCard dejó de usar ${c}`);
  }
  assert.ok(LISTA.includes("sunmi-product-list"), "SunmiListaProductoCards dejó de usar sunmi-product-list");
});

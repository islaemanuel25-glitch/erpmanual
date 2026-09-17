// Candados de qué eje desplaza el envoltorio de SunmiTable.
//
// Lo que defienden: que la tabla de Productos deje de tener scroll vertical
// propio —para que el único de la pantalla sea el de la página— SIN que se mueva
// ninguna de las tablas que ya existen.
//
// La decisión se sacó del JSX a `scrollDeLaTabla` para poder ejercerla acá: un
// ternario adentro de un atributo solo se puede comprobar abriendo la pantalla,
// y las dos cadenas que produce —la del envoltorio y la del `thead`— se pueden
// contradecir sin que nada se rompa ni se vea.
//
//   node --test lib/sunmi/scrollDeLaTabla.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scrollDeLaTabla } from "./claseNegociada.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── LO QUE YA EXISTE NO SE MUEVE ──────────────────────────────────────────

test("T1. SIN NADA, la cadena es EXACTAMENTE la de siempre", () => {
  // Se afirma la cadena completa y no que "contenga": contener no distingue de
  // haber sumado una cuarta clase. Son las 57 tablas que no piden nada.
  assert.deepEqual(scrollDeLaTabla(), {
    envoltorio: "overflow-x-auto shrink-0",
    pegajoso: false,
  });
  assert.deepEqual(scrollDeLaTabla({}), {
    envoltorio: "overflow-x-auto shrink-0",
    pegajoso: false,
  });
});

test("T2. CON `stickyHeader` SOLO, sigue siendo exactamente lo de siempre", () => {
  // Es el modo de `TablaCatalogo`, que esta tanda NO toca. Si esta cadena se
  // moviera, esa pantalla perdería su tope de alto o su encabezado fijo.
  assert.deepEqual(scrollDeLaTabla({ stickyHeader: true }), {
    envoltorio: "overflow-auto max-h-[70dvh]",
    pegajoso: true,
  });
  // Y el tope de alto sigue siendo configurable por quien lo pida.
  assert.equal(
    scrollDeLaTabla({ stickyHeader: true, maxHeightClass: "max-h-[400px]" }).envoltorio,
    "overflow-auto max-h-[400px]"
  );
});

// ── EL MODO NUEVO ─────────────────────────────────────────────────────────

test("T3. CON `altoLibre` NO HAY TOPE DE ALTO NI SCROLL VERTICAL PROPIO", () => {
  const r = scrollDeLaTabla({ stickyHeader: true, altoLibre: true });
  assert.equal(r.envoltorio, "overflow-x-auto shrink-0");
  // Las dos formas de recuperar el scroll interno, nombradas para que el candado
  // no dependa de la cadena entera: un `max-h-` o un `overflow-auto` de los dos
  // ejes. Es la contraprueba que el pedido nombra.
  assert.doesNotMatch(r.envoltorio, /max-h-/, "volvió el tope de alto");
  assert.doesNotMatch(r.envoltorio, /(^|\s)overflow-auto(\s|$)/, "volvió el overflow de los dos ejes");
  // Y el horizontal SIGUE: sin esto las columnas que no entran quedan cortadas.
  assert.match(r.envoltorio, /overflow-x-auto/, "se perdió el desplazamiento lateral");
});

test("T4. `altoLibre` MANDA sobre `stickyHeader`, y el encabezado deja de pegarse", () => {
  // No es una omisión: el envoltorio conserva overflow-x, así que sería el ámbito
  // de lo pegajoso, y quedaría pegado a algo que ya no se desplaza. Declararlo
  // igual no rompería nada y mentiría en el CSS.
  assert.equal(scrollDeLaTabla({ stickyHeader: true, altoLibre: true }).pegajoso, false);
  assert.equal(scrollDeLaTabla({ altoLibre: true }).pegajoso, false);
  // Con alto libre las dos combinaciones dan la MISMA cadena: pedir alto libre es
  // pedir lo que hace el default.
  assert.deepEqual(
    scrollDeLaTabla({ stickyHeader: true, altoLibre: true }),
    scrollDeLaTabla({ altoLibre: true })
  );
});

test("T5. las dos cadenas NO SE PUEDEN CONTRADECIR", () => {
  // La invariante que motiva que sea una sola función: el encabezado se declara
  // pegajoso si y solo si el envoltorio se desplaza vertical.
  for (const sticky of [true, false]) {
    for (const libre of [true, false]) {
      const r = scrollDeLaTabla({ stickyHeader: sticky, altoLibre: libre });
      const desplazaVertical = /(^|\s)overflow-auto(\s|$)/.test(r.envoltorio);
      assert.equal(
        r.pegajoso,
        desplazaVertical,
        `sticky=${sticky} altoLibre=${libre}: el thead y el envoltorio no dicen lo mismo`
      );
    }
  }
});

// ── EL CABLEADO ───────────────────────────────────────────────────────────

test("T6. SunmiTable USA la decisión en vez de repetir el ternario en el JSX", () => {
  const tabla = sinComentarios(leer("components/sunmi/SunmiTable.jsx"));
  assert.ok(tabla.includes("SunmiTable"), "no se está leyendo la tabla del kit");
  assert.match(tabla, /scrollDeLaTabla\(/, "el kit dejó de usar la decisión del dominio");
  assert.match(tabla, /altoLibre = false/, "la prop nueva dejó de venir apagada por defecto");
  // Y las cadenas no vuelven a estar escritas a mano en el JSX: si estuvieran,
  // cambiar la decisión no las tocaría.
  assert.doesNotMatch(
    tabla,
    /className=\{stickyHeader \?/,
    "el ternario volvió al atributo, donde no se puede ejercer"
  );
});

test("T7. LA TABLA DE PRODUCTOS PIDE ALTO LIBRE, y sigue con su id", () => {
  const productos = sinComentarios(leer("components/productos/SunmiTablaProductos.jsx"));
  assert.ok(productos.includes("SunmiTablaProductos"), "no se está leyendo la tabla de productos");
  assert.match(productos, /altoLibre/, "productos volvió a tener su scroll vertical propio");
  // El envoltorio conserva el id: sigue existiendo para el desplazamiento
  // lateral, y es por donde la sonda comprueba que ya no desplaza vertical.
  assert.match(productos, /scrollId="productos-scroll"/);
});

test("T8. CONTRAPRUEBA de T6 y T7: el analizador ve lo que busca", () => {
  // Un `doesNotMatch` con la expresión mal escrita pasa en verde sobre nada.
  assert.match("className={stickyHeader ? `overflow-auto ${m}` : `x`}", /className=\{stickyHeader \?/);
  assert.match("<SunmiTable altoLibre scrollId=\"productos-scroll\">", /altoLibre/);
  assert.match('scrollId="productos-scroll"', /scrollId="productos-scroll"/);
  // Y los comentarios no cuentan, que es la trampa que este repo ya pisó tres veces.
  assert.equal(sinComentarios("// altoLibre en prosa\nconst x=1;").includes("altoLibre"), false);
});

test("T9. NINGUNA OTRA TABLA PIDE ALTO LIBRE todavía", () => {
  // ── SE ENUMERA, NO SE NOMBRA ────────────────────────────────────────────
  //
  // Este candado nombraba UN archivo —`TablaCatalogo.jsx`— y eso lo volvía dos
  // cosas frágiles a la vez: no veía una tabla nueva que pidiera alto libre, y
  // el día que ese archivo se borró se puso en rojo por un ENOENT, que no es lo
  // que afirma. Pasó: la tabla se fue con la pantalla vieja del detalle de
  // listas.
  //
  // Ahora recorre el repo, y con `--cached --others --exclude-standard` para
  // que un componente recién escrito y sin commitear entre en la cuenta. Sin
  // esas banderas el candado queda verde hoy y rojo en la tanda siguiente,
  // cuando el archivo ya está commiteado y desplegado.
  const enumerados = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "*.jsx"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean);
  assert.ok(enumerados.length > 50, "la enumeración quedó vacía y el candado no miraría nada");

  const pidenAltoLibre = enumerados.filter((p) => {
    const src = sinComentarios(fs.readFileSync(path.join(RAIZ, p), "utf8"));
    // El propio kit define la prop: no es un consumidor.
    if (p.startsWith("components/sunmi/")) return false;
    return /\baltoLibre\b/.test(src);
  });
  // La única que lo pide hoy es la tabla de Productos, que es la pantalla para
  // la que se hizo y la que miden T6 y T7. La afirmación es la IGUALDAD, no una
  // ausencia: así el candado se pone rojo tanto si aparece una segunda —hay que
  // medirla— como si la de Productos deja de pedirlo, que querría decir que T6 y
  // T7 se quedaron sin sujeto.
  assert.deepEqual(
    pidenAltoLibre,
    ["components/productos/SunmiTablaProductos.jsx"],
    `cambió quién pide alto libre: ${pidenAltoLibre.join(", ") || "ninguna"}`
  );
});

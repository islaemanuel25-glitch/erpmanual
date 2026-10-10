// CANDADO: UNA TRANSCRIPCIÓN CORTA SE REINTENTA Y SE DICE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/transcripcionCorta.test.mjs
//
// ── EL DEFECTO, CON SU RASTRO ────────────────────────────────────────────
//
// El 2026-09-23 Emanuel tocó "Volver a leer el papel" TRES VECES en dos
// minutos sobre el #247. El botón pasaba a "Leyendo el papel…", volvía, y la
// pantalla quedaba exactamente igual: cero renglones y el mismo cartel.
//
// El rastro en `LlamadaLector` para el comprobante 20 dice que las tres
// corrieron —15:37:29 TARDO_DEMASIADO, 15:38:09 ok, 15:39:46 ok— contra una app
// que había arrancado a las 15:32 con el código nuevo. O sea que el botón SÍ
// leía; lo que volvía era una lectura corta.
//
// Y el comprobante lo dice con dos números: `lineasEnElPapel` 12,
// `lineasTranscriptas` 1. El modelo VIO doce renglones y transcribió uno.
//
// ── NO ES UN DEFECTO DEL CAMINO, Y ESO SE MIDIÓ ──────────────────────────
//
// La misma foto, el mismo prompt y el mismo modelo devolvieron 12 renglones en
// una corrida y 1 en otra. Los dos caminos achican igual —el log dice
// "0/1 fotos, 149 KB → 149 KB": la foto ya es chica— y los dos mandan la misma
// receta con la misma explicación, porque la ruta la lee entera. Es
// variabilidad del modelo.
//
// El sistema YA lo detectaba y marcaba MAL_LEIDO. Lo que faltaba era insistir
// una vez, y decirlo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { comoLoEntendio, textoDelResultado } from "./pruebaDeExplicacion.js";
import { normalizarLectura } from "./lector/contrato.js";
import { pasarPorLaPuerta } from "./lector/puerta.js";

const moneda = (v) =>
  `$${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const RUTA_LECTURA = "app/api/compras-proveedor/comprobantes/leer/[id]/route.js";
const PANTALLA = "components/compras-proveedor/CorregirComprobante.jsx";

/** Lo que volvió de verdad el 2026-09-23 a las 15:39: uno de doce. */
const LECTURA_CORTA = normalizarLectura({
  lineas: [
    // Con el costo final de la lectura interpretada (#165): la columna Total.
    { descripcion: "DADA ART MALBEC 6X750", cantidad: 18, subtotalImpreso: 68487.1, totalImpreso: 82869.39, internoImpreso: 0, bonificacion: 14, costoFinal: 82869.39 },
  ],
  pie: {
    iva: 78551.89,
    interno: 10890.53,
    total: 463499.07,
    conceptos: [
      { nombre: "IVA", importe: 78551.89 },
      { nombre: "IMP. INT.", importe: 10890.53 },
    ],
  },
  lineasEnElPapel: 12,
}, { interpretada: true });

// ══════════════════════════════════════════════════════════════════════════
// LA PANTALLA DICE EL CONTEO
// ══════════════════════════════════════════════════════════════════════════

test("T1 · el cartel dice CUÁNTOS vio y cuántos transcribió", () => {
  // Decía "no se pudo transcribir ningún renglón" con UNO transcripto y DOCE
  // declarados. Las dos frases eran falsas a la vez.
  const r = comoLoEntendio({ lectura: LECTURA_CORTA, receta: { alicuotaIvaPct: 21 } });
  const t = textoDelResultado(r, { moneda });

  assert.equal(r.renglonesEnElPapel, 12);
  assert.equal(r.faltanRenglones, true);
  assert.equal(t.titulo, "La lista quedó incompleta");
  assert.match(t.detalle, /dice ver 12 renglones y transcribió 1/);
  assert.ok(
    !/no se pudo transcribir ningún renglón/i.test(t.detalle),
    "volvió la frase que dice cero cuando hay uno"
  );
});

test("T2 · con CERO transcriptos el título sigue siendo el de siempre", () => {
  // El caso nuevo no se come al viejo: sin ningún renglón, el problema puede
  // ser la foto o la explicación, y el título lo dice así.
  const r = comoLoEntendio({
    lectura: normalizarLectura({ lineas: [], pie: { total: 463499.07 }, lineasEnElPapel: 12 }),
    receta: {},
  });
  const t = textoDelResultado(r, { moneda });
  assert.equal(t.titulo, "No se leyeron los productos");
  assert.match(t.detalle, /dice ver 12 renglones y transcribió 0/);
});

test("T3 · y una lectura COMPLETA no dispara ninguno de los dos carteles", () => {
  // La contraprueba: si el cartel apareciera siempre, T1 y T2 no probarían nada.
  const completa = normalizarLectura({
    lineas: [
      // Con el costo final de la lectura interpretada (#165): la columna Total.
      { descripcion: "A", cantidad: 18, subtotalImpreso: 68487.1, totalImpreso: 82869.39, internoImpreso: 0, costoFinal: 82869.39 },
      { descripcion: "B", cantidad: 48, subtotalImpreso: 88973.12, totalImpreso: 115029.54, internoImpreso: 7372.07, costoFinal: 115029.54 },
    ],
    pie: {
      iva: 33066.64,
      interno: 7372.07,
      total: 197898.93,
      conceptos: [
        { nombre: "IVA", importe: 33066.64 },
        { nombre: "IMP. INT.", importe: 7372.07 },
      ],
    },
    lineasEnElPapel: 2,
  });
  const r = comoLoEntendio({ lectura: completa, receta: { alicuotaIvaPct: 21 } });
  const t = textoDelResultado(r, { moneda });
  assert.equal(r.faltanRenglones, false);
  assert.match(t.titulo, /El papel cierra en/);
});

test("T4 · sin conteo declarado no se inventa uno", () => {
  // `lineasEnElPapel` puede no venir. Ahí no se puede decir "vio N": se dice lo
  // que se sabe, que es cuántos llegaron.
  const r = comoLoEntendio({
    lectura: normalizarLectura({ lineas: [], pie: { total: 1000 } }),
    receta: {},
  });
  const t = textoDelResultado(r, { moneda });
  assert.equal(r.renglonesEnElPapel, null);
  assert.equal(r.faltanRenglones, false);
  assert.match(t.detalle, /No se pudo transcribir ningún renglón/);
  assert.ok(!/dice ver/.test(t.detalle), "inventó un conteo que el lector no dio");
});

test("T5 · y la puerta la sigue marcando MAL_LEIDO", () => {
  // El control de conteo ya existía y no se toca: lo que se agrega es decirlo.
  const p = pasarPorLaPuerta({ lectura: LECTURA_CORTA, receta: { alicuotaIvaPct: 21 }, recetaVersion: 1 });
  assert.equal(p.cierra, false);
  assert.deepEqual(p.faltanLineas, { declaradas: 12, transcriptas: 1, faltan: 11 });
});

// ══════════════════════════════════════════════════════════════════════════
// LA RUTA INSISTE UNA VEZ
// ══════════════════════════════════════════════════════════════════════════

test("T6 · la ruta reintenta cuando el modelo transcribió de menos, si no entró el modelo grande", () => {
  // Desde el 2026-10-09 una lectura corta es el caso (a) de la escalada: el que
  // vuelve a mirar el papel es el modelo grande. El reintento de Flash queda
  // para cuando el grande no está, y no se suman los dos: serían tres llamadas.
  const ruta = sinComentarios(RUTA_LECTURA);
  assert.match(ruta, /const quedoCorta = /, "desapareció la pregunta de si quedó corta");
  assert.match(ruta, /if \(!escalada\.llamo && quedoCorta\(resultado\)\)/, "no se reintenta, o se reintenta además del grande");
  assert.ok(
    ruta.indexOf("await escalarAlModeloGrande(") < ruta.indexOf("if (!escalada.llamo && quedoCorta"),
    "el reintento tiene que saber si ya entró el grande"
  );
  // Y SOLO en ese caso: un reintento incondicional duplicaría el gasto de cada
  // lectura buena.
  const bloque = ruta.slice(ruta.indexOf("const quedoCorta"), ruta.indexOf("CADA LLAMADA QUEDA REGISTRADA"));
  assert.equal(
    (bloque.match(/await pedirle\(\)/g) || []).length,
    1,
    "hay más de un reintento, o el reintento no está adentro de la condición"
  );
});

test("T7 · se queda la lectura que trajo MÁS renglones, no la última", () => {
  // Una lectura peor no puede pisar a una mejor solo por ser la última.
  const ruta = sinComentarios(RUTA_LECTURA);
  assert.match(ruta, /cuantasTrajo\(reintento\) > cuantasTrajo\(resultado\)/);
});

test("T8 · y las llamadas del reintento también se registran", () => {
  // Gastaron cuota igual. Contar solo las de la que ganó mostraría más lecturas
  // disponibles de las que quedan.
  const ruta = sinComentarios(RUTA_LECTURA);
  assert.match(ruta, /reintento && reintento !== resultado && Array\.isArray\(reintento\.intentos\)/);
});

test("T9 · el conteo viaja en la respuesta de la ruta", () => {
  // Sin esto la pantalla no puede distinguir "leyó bien" de "volvió a traer uno
  // de doce": las dos son `ok: true`.
  const ruta = sinComentarios(RUTA_LECTURA);
  assert.match(ruta, /lineasEnElPapel: puerta\.aGuardar\?\.lineasEnElPapel/);
  assert.match(ruta, /lineasTranscriptas: puerta\.aGuardar\?\.lineasTranscriptas/);
});

// ══════════════════════════════════════════════════════════════════════════
// EL BOTÓN NUNCA TERMINA EN SILENCIO
// ══════════════════════════════════════════════════════════════════════════

test("T10 · los TRES desenlaces del botón tienen su frase", () => {
  const src = sinComentarios(PANTALLA);
  // La que no arrancó.
  assert.match(src, /No se pudo volver a leer el papel/);
  // La que volvió corta, con los dos números.
  assert.match(src, /dice ver \$\{dice\} renglones y transcribió \$\{trajo\}/);
  // Y la que salió bien: sin esta, una lectura buena se ve igual que un botón
  // que no hace nada.
  assert.match(src, /Se volvió a leer el papel\./);
});

test("T11 · y ninguna rama sale sin avisar", () => {
  const src = sinComentarios(PANTALLA);
  const releer = src.slice(src.indexOf("const releer = async"), src.indexOf("finally"));
  // Todo camino que termina pasa por `setMensaje`. Si alguien agrega un `return`
  // mudo, este candado se pone rojo.
  const returns = (releer.match(/\breturn\b/g) || []).length;
  const avisos = (releer.match(/setMensaje\(/g) || []).length;
  assert.ok(
    avisos >= returns,
    `hay ${returns} salidas y ${avisos} avisos: alguna rama termina en silencio`
  );
});

test("T12 · el botón sigue esperando el turno", () => {
  // El POST contesta enseguida y la lectura sigue en segundo plano: sin la
  // espera, el mensaje se escribiría antes de que la lectura terminara.
  const src = sinComentarios(PANTALLA);
  assert.match(src, /await pedirLaLectura\(/);
  assert.ok(
    !/fetch\(`\/api\/compras-proveedor\/comprobantes\/leer/.test(src),
    "volvió el fetch suelto que saltea la espera del turno"
  );
});

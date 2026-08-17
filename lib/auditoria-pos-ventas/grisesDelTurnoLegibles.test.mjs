// LOS GRISES DE TEXTO DE LA TARJETA DEL TURNO TIENEN QUE LEERSE SOBRE LOS TRES
// FONDOS QUE LA TARJETA TIENE DE VERDAD.
//
// Archivo vigilado: app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx
//
// ── EL MOTIVO ───────────────────────────────────────────────────────────────
//
// Eran `text-gray-400` en catorce lugares. Medido sobre los elementos reales de
// la pantalla, con seis ventas cargadas, había 25 textos abajo del mínimo de
// 4,5:1 — y no eran solo rótulos: las columnas de comisión y de costo son plata,
// y se leían a 2,54:1.
//
// ── POR QUÉ ESTE CANDADO MIDE Y NO COMPARA CONTRA UNA LISTA ─────────────────
//
// Porque el número depende del FONDO, y esta tarjeta tiene tres: el blanco de la
// tarjeta, el gray-50 del hover de las filas y el gray-100 del recuadro de caja.
// El que manda es el más oscuro de los que el texto puede pisar — y ahí estuvo
// la trampa: `gray-500` da 4,83 sobre blanco y pasa, pero da 4,39 sobre el
// gray-100 y no llega. Un candado que mirara solo el blanco habría dado verde
// con gray-500 adentro del recuadro.
//
// Así que se calcula el contraste de verdad, con la fórmula de WCAG.
//
// ── Y POR QUÉ VA POR ZONA Y NO CONTRA LOS TRES A LA VEZ ─────────────────────
//
// La primera versión medía cada tono contra los tres fondos. Se puso roja
// nombrando los cuatro `text-gray-500` de la pantalla —el subtítulo, el título
// de la tabla, el encabezado y la columna del número— y estaba EXAGERANDO:
// ninguno de esos cuatro vive adentro del recuadro, así que nunca pisan el
// gray-100. Sobre el fondo que sí pueden pisar dan 4,83 y 4,63, y pasan.
//
// Un candado que exige cambiar algo que no tiene ningún defecto medido no es más
// estricto: está midiendo mal. Se parte en dos zonas, cada una con el fondo más
// oscuro que de verdad puede tocar:
//
//   adentro del recuadro de caja  → gray-100  (el más oscuro de la tarjeta)
//   en el resto de la tarjeta     → gray-50   (el hover de las filas)
//
// Con eso gray-400 sigue fallando en las dos zonas —2,31 y 2,43—, gray-500 pasa
// afuera y falla adentro, y gray-600 pasa en las dos. Que es exactamente lo que
// el navegador mide sobre los elementos reales.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ARCHIVO = path.join(
  process.cwd(),
  "app", "modulos", "auditoria-pos-ventas", "turnos", "[id]", "page.jsx"
);

/** Comentarios afuera. El archivo vigilado NOMBRA los grises al explicarse. */
export function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// La paleta de grises de Tailwind, solo los tonos que el archivo puede nombrar.
// Escritos acá porque el candado tiene que poder calcular sin depender de que
// alguien mantenga una tabla de contrastes a mano.
export const GRISES = {
  "gray-50": [249, 250, 251],
  "gray-100": [243, 244, 246],
  "gray-200": [229, 231, 235],
  "gray-300": [209, 213, 219],
  "gray-400": [156, 163, 175],
  "gray-500": [107, 114, 128],
  "gray-600": [75, 85, 99],
  "gray-700": [55, 65, 81],
  "gray-800": [31, 41, 55],
  "gray-900": [17, 24, 39],
};

/**
 * El fondo MÁS OSCURO que el texto de cada zona puede pisar.
 *
 * Los tres fondos de la tarjeta se midieron en el navegador: blanco, el gray-50
 * del hover de las filas y el gray-100 del recuadro. Acá se guarda, por zona, el
 * peor caso — que es el único que hace falta comprobar.
 */
export const PEOR_FONDO = {
  recuadro: { nombre: "gray-100 del recuadro de caja", rgb: GRISES["gray-100"] },
  tarjeta: { nombre: "gray-50 del hover de las filas", rgb: GRISES["gray-50"] },
};

export const MINIMO = 4.5;

function canal(v) {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
export function luminancia([r, g, b]) {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
export function contraste(a, b) {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const tonos = (texto) =>
  [...new Set([...texto.matchAll(/\btext-(gray-\d{2,3})\b/g)].map((m) => m[1]))].sort();

/**
 * El JSX del recuadro de caja, aislado por conteo de `<div>`.
 *
 * Se ancla en la condición que lo monta y cuenta apertura y cierre hasta volver a
 * profundidad cero. No se ancla en el color: si se anclara ahí, cambiar el color
 * esconderÍa el recuadro y el candado pasaría en verde sin mirar nada.
 *
 * Devuelve null si no lo encuentra, y el test lo trata como ROJO.
 */
export const ANCLA_RECUADRO =
  "turno.montoEsperadoEfectivo != null || turno.montoRealEfectivo != null";

export function bloqueDelRecuadro(fuente) {
  const limpio = sinComentarios(fuente);
  // EL ANCLA VA CON EL `||`, y no es adorno: `turno.montoEsperadoEfectivo != null`
  // solo aparece DOS veces —la condición que monta el recuadro y la del campo de
  // adentro—. Anclado en la corta, un reordenamiento puede hacer que agarre la de
  // adentro y aísle un bloque de tres líneas; ahí los grises del recuadro caen en
  // la zona floja y gray-500 pasaría. Lo encontró la contraprueba de más abajo.
  const ancla = limpio.indexOf(ANCLA_RECUADRO);
  if (ancla < 0) return null;
  const ini = limpio.indexOf("<div", ancla);
  if (ini < 0) return null;
  let i = ini, prof = 0;
  for (;;) {
    const abre = limpio.indexOf("<div", i);
    const cierra = limpio.indexOf("</div>", i);
    if (cierra < 0) return null;
    if (abre >= 0 && abre < cierra) { prof++; i = abre + 4; continue; }
    prof--;
    i = cierra + 6;
    if (prof === 0) return limpio.slice(ini, i);
  }
}

/** Los grises de TEXTO que el archivo declara, sin repetir, por zona. */
export function grisesDeTextoDeclarados(fuente) {
  const limpio = sinComentarios(fuente);
  const bloque = bloqueDelRecuadro(fuente);
  const fuera = bloque ? limpio.replace(bloque, " ") : limpio;
  return { recuadro: tonos(bloque || ""), tarjeta: tonos(fuera), todos: tonos(limpio) };
}

/** Los que no llegan al mínimo contra el peor fondo de SU zona. */
export function grisesQueNoSeLeen(fuente) {
  const porZona = grisesDeTextoDeclarados(fuente);
  const malos = [];
  for (const zona of ["recuadro", "tarjeta"]) {
    const { nombre, rgb: fondo } = PEOR_FONDO[zona];
    for (const tono of porZona[zona]) {
      const rgb = GRISES[tono];
      if (!rgb) continue; // los que no están en la tabla los ataja su propio test
      const r = contraste(rgb, fondo);
      if (r < MINIMO) malos.push({ zona, tono, fondo: nombre, ratio: Number(r.toFixed(2)) });
    }
  }
  return malos;
}

const FUENTE = fs.readFileSync(ARCHIVO, "utf8");

// ── Que el candado esté mirando algo ────────────────────────────────────────

test("el recuadro de caja se puede aislar, y las dos zonas tienen grises", () => {
  // Falla CERRADO por los dos lados: sin bloque no hay zona "recuadro" y el
  // candado estaría midiendo todo con el fondo equivocado; sin grises, no está
  // afirmando nada sobre nada.
  assert.notEqual(bloqueDelRecuadro(FUENTE), null, "no se pudo aislar el bloque del recuadro de caja");
  const z = grisesDeTextoDeclarados(FUENTE);
  assert.ok(z.recuadro.length > 0, "el recuadro no declara ningún text-gray-*");
  assert.ok(z.tarjeta.length > 0, "el resto de la tarjeta no declara ningún text-gray-*");
});

test("todos los grises que declara están en la tabla de la paleta", () => {
  const fuera = grisesDeTextoDeclarados(FUENTE).todos.filter((t) => !GRISES[t]);
  assert.deepEqual(
    fuera,
    [],
    `estos tonos no están en la tabla y por lo tanto NO se midieron: ${fuera.join(", ")}.\n` +
      "      Agregalos a GRISES con su rgb o el candado los está salteando en silencio."
  );
});

// ── La afirmación ───────────────────────────────────────────────────────────

test("TODO GRIS DE TEXTO LLEGA A 4,5:1 CONTRA EL PEOR FONDO DE SU ZONA", () => {
  const malos = grisesQueNoSeLeen(FUENTE);
  assert.deepEqual(
    malos,
    [],
    "app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx — hay grises de texto que no se leen:\n" +
      malos.map((m) => `        [${m.zona}] text-${m.tono} sobre el ${m.fondo}: ${m.ratio}:1`).join("\n") +
      "\n      Esa tarjeta es un documento imprimible y cada zona tiene su fondo más oscuro:\n" +
      "      el recuadro de caja es gray-100, el resto es el gray-50 del hover.\n" +
      "      Ojo con gray-500: pasa afuera (4,63) y NO pasa adentro del recuadro (4,39)."
  );
});

test("adentro del recuadro el tono es gray-600, y no por casualidad", () => {
  // Se afirma el tono elegido con su motivo medido al lado, para que cambiarlo
  // sea una decisión y no un descuido.
  const z = grisesDeTextoDeclarados(FUENTE);
  assert.deepEqual(z.recuadro, ["gray-600"]);
  const fondo = PEOR_FONDO.recuadro.rgb;
  assert.ok(contraste(GRISES["gray-500"], fondo) < MINIMO, "gray-500 tendría que NO llegar adentro");
  assert.ok(contraste(GRISES["gray-600"], fondo) >= MINIMO, "gray-600 tendría que llegar adentro");
});

test("los cuatro gray-500 de afuera pasan, y por eso no se tocaron", () => {
  // Están medidos y no tienen defecto: 4,63 contra el peor fondo que pueden
  // pisar. Queda escrito acá para que nadie los "arregle" sin medir, y para que
  // si alguno se muda al recuadro este candado se ponga rojo.
  const z = grisesDeTextoDeclarados(FUENTE);
  assert.ok(z.tarjeta.includes("gray-500"), "desaparecieron los gray-500 de la tarjeta");
  const r = contraste(GRISES["gray-500"], PEOR_FONDO.tarjeta.rgb);
  assert.ok(r >= MINIMO, `gray-500 afuera da ${r.toFixed(2)}, y tendría que pasar`);
  assert.equal(Number(r.toFixed(2)), 4.63);
});

// ── CONTRAPRUEBA ────────────────────────────────────────────────────────────
//
// Se rompe sobre la fuente YA SIN COMENTARIOS. El archivo vigilado nombra
// gray-400, gray-500 y gray-600 en su explicación, así que un replace sobre el
// texto crudo cambiaría el comentario y no el código: el candado lo estriparía y
// quedaría verde. Ya pasó una vez con el candado hermano de este directorio.
const LIMPIO = sinComentarios(FUENTE);

test("CONTRAPRUEBA · con gray-400 de vuelta, falla en LAS DOS zonas", () => {
  const roto = LIMPIO.replaceAll("text-gray-600", "text-gray-400");
  assert.notEqual(roto, LIMPIO, "la sustitución no aplicó: la contraprueba no probó nada");
  const malos = grisesQueNoSeLeen(roto);
  assert.deepEqual(
    malos.map((m) => `${m.zona}:${m.tono}:${m.ratio}`),
    ["recuadro:gray-400:2.31", "tarjeta:gray-400:2.43"]
  );
});

test("CONTRAPRUEBA · y con gray-500, que es el que engaña, falla SOLO adentro", () => {
  // Este es el que importa. gray-500 pasa sobre blanco, así que un candado que
  // midiera todo contra el blanco daría VERDE acá — un falso verde, que es el
  // peor final. Y uno que midiera todo contra el gray-100 lo marcaría también
  // afuera, donde no hay defecto. Tiene que dar exactamente uno.
  const roto = LIMPIO.replaceAll("text-gray-600", "text-gray-500");
  assert.notEqual(roto, LIMPIO, "la sustitución no aplicó: la contraprueba no probó nada");
  const malos = grisesQueNoSeLeen(roto);
  assert.equal(malos.length, 1, "falla SOLO adentro del recuadro");
  assert.equal(malos[0].zona, "recuadro");
  assert.equal(malos[0].ratio, 4.39);
});

test("el ancla del recuadro es ÚNICA en el archivo", () => {
  // Si apareciera dos veces, `indexOf` podría agarrar la otra y aislar el bloque
  // equivocado sin decir nada. La versión corta del ancla aparecía dos veces y
  // por eso se cambió por la que lleva el `||`.
  const limpio = sinComentarios(FUENTE);
  const veces = limpio.split(ANCLA_RECUADRO).length - 1;
  assert.equal(veces, 1, `el ancla aparece ${veces} veces y tiene que aparecer una sola`);
});

test("CONTRAPRUEBA · sin el ancla no se aísla nada, y se ve", () => {
  // Sin bloque, los grises de adentro caerían en la zona floja y gray-500
  // pasaría. Se comprueba que el aislador es lo que sostiene la afirmación, y no
  // que la afirmación se cumple por casualidad.
  const roto = LIMPIO.replace(ANCLA_RECUADRO, "turno.otraCosa != null");
  assert.notEqual(roto, LIMPIO, "la sustitución no aplicó: la contraprueba no probó nada");
  assert.equal(bloqueDelRecuadro(roto), null);
  assert.deepEqual(grisesDeTextoDeclarados(roto).recuadro, []);
  // Y la consecuencia: con el recuadro invisible, meter gray-500 dejaría de dar rojo.
  const flojo = roto.replaceAll("text-gray-600", "text-gray-500");
  assert.deepEqual(grisesQueNoSeLeen(flojo), [], "sin ancla el candado se afloja, y eso es lo que se está midiendo");
});

test("CONTRAPRUEBA · el detector no se conforma con los grises del comentario", () => {
  // El comentario del archivo nombra gray-400 y gray-500 para explicar por qué
  // no sirven. Si el candado leyera el texto crudo estaría rojo por su propia
  // documentación, y el arreglo se vería igual que el defecto.
  assert.ok(FUENTE.includes("gray-400"), "la explicación de por qué no sirve gray-400 se perdió");
  assert.ok(FUENTE.includes("gray-500"), "la explicación de por qué no sirve gray-500 se perdió");
  assert.deepEqual(grisesQueNoSeLeen(FUENTE), []);
});

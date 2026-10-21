// LA RECETA PROPUESTA SE CONFIRMA DESDE LA RECEPCIÓN, CON EL MISMO BLOQUE.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/propuestaEnLaRecepcion.test.mjs
//
// Pedido de Emanuel (2026-10-21): no ir a Recetas de facturas para decir "está
// bien". Lo que se afirma:
//
//   · con una propuesta pendiente para el papel que llegó, se ofrece;
//   · sin propuesta, no se ofrece nada;
//   · con la receta de ese tipo ya confirmada, tampoco — no se pisa desde acá;
//   · el bloque es UNO, el mismo en las dos pantallas, y guarda por la MISMA
//     ruta, sin una ruta nueva.
//
// ── DE DÓNDE SALE LA LECTURA ──────────────────────────────────────────────
//
// La propuesta viaja con la lectura con la que cerró, que es la que devolvió
// el lector grande ya normalizada (`escalada.js` → `leer/[id]/route.js`). Acá
// se arma igual: la respuesta de Secco de `lecturaInterpretada.fixture.json`
// —con la forma de `esquemaInterpretado`— pasada por `normalizarLectura`.
// Secco es el caso real de un proveedor sin receta que leyó el grande (#256).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PropuestaDeReceta, { TEXTO_PROPUESTA, sePuedeGuardarLaExplicacion } from "./PropuestaDeReceta.jsx";
import { normalizarLectura } from "../../lib/compras-proveedor/comprobante/lector/contrato.js";
import { comoLoEntendio } from "../../lib/compras-proveedor/comprobante/pruebaDeExplicacion.js";
import {
  propuestasParaLaRecepcion,
  TIPO_DE_PAPEL,
} from "../../lib/compras-proveedor/comprobante/explicacionPorTipo.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const textoDe = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
// Sin comentarios: un candado que mira código no puede encontrar la prosa
// (regla 5 de CLAUDE.md, las tres veces).
const codigoDe = (rel) =>
  textoDe(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const aLaVista = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const PROPUESTA = "components/compras-proveedor/PropuestaDeReceta.jsx";
const EN_LA_RECEPCION = "components/compras-proveedor/PropuestaEnLaRecepcion.jsx";
const EXPLICACION = "components/compras-proveedor/ExplicacionDelPapel.jsx";
const RECEPCION = "app/modulos/compras-proveedor/[id]/page.jsx";

const { secco } = JSON.parse(textoDe("lib/compras-proveedor/comprobante/lecturaInterpretada.fixture.json"));

/** La lectura de Secco como la guarda la propuesta. */
function lecturaDeSecco() {
  return normalizarLectura(
    {
      identidad: secco.identidad,
      lineasEnElPapel: secco.lineasEnElPapel,
      hayTotalImpreso: secco.hayTotalImpreso,
      pie: secco.pie,
      lineas: secco.lineas,
      explicacion: secco.explicacionPro,
    },
    { interpretada: true }
  );
}

/** La propuesta como la manda el GET de `recetas/explicacion`. */
function propuestaDeSecco() {
  return {
    // Secco imprime "X": no es una factura con letra, es "sin factura".
    tipoComprobante: TIPO_DE_PAPEL.SIN_FACTURA,
    explicacion: secco.explicacionPro,
    lectura: lecturaDeSecco(),
    comprobanteId: 22,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// QUÉ SE OFRECE
// ══════════════════════════════════════════════════════════════════════════

test("CON UNA PROPUESTA PENDIENTE PARA EL PAPEL QUE LLEGÓ, SE OFRECE", () => {
  const r = propuestasParaLaRecepcion({
    propuestas: [propuestaDeSecco()],
    explicaciones: [],
    // La letra que guardó el comprobante de Secco.
    tiposDelPedido: ["X"],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].tipoComprobante, TIPO_DE_PAPEL.SIN_FACTURA);
});

test("UN REMITO SIN LETRA ES «SIN FACTURA», NO «SIN TIPO»", () => {
  // La letra de un remito llega en null. Tomarla por ausente dejaría afuera
  // justo los papeles que más llegan sin receta (Mauro, Secco).
  const r = propuestasParaLaRecepcion({
    propuestas: [propuestaDeSecco()],
    explicaciones: [],
    tiposDelPedido: [null],
  });
  assert.equal(r.length, 1);
});

test("SIN PROPUESTA, NO SE OFRECE NADA", () => {
  assert.deepEqual(propuestasParaLaRecepcion({ propuestas: [], explicaciones: [], tiposDelPedido: ["X"] }), []);
  // Y sin argumentos tampoco explota: la recepción la llama antes de tener datos.
  assert.deepEqual(propuestasParaLaRecepcion(), []);
});

test("CON LA RECETA DE ESE TIPO YA CONFIRMADA, NO SE OFRECE: NO SE PISA DESDE ACÁ", () => {
  // Una propuesta al lado de una confirmada del mismo tipo es una forma
  // alternativa, y confirmarla REEMPLAZA a la confirmada. Eso se decide en
  // Recetas de facturas, mirando las dos.
  const r = propuestasParaLaRecepcion({
    propuestas: [propuestaDeSecco()],
    explicaciones: [{ tipoComprobante: "SIN_FACTURA", explicacion: "La de Secco, confirmada.", version: 1 }],
    tiposDelPedido: ["X"],
  });
  assert.deepEqual(r, []);
});

test("UNA CONFIRMADA DE OTRO TIPO NO ESCONDE LA PROPUESTA DE ÉSTE", () => {
  // CCU: la A confirmada no dice nada sobre cómo viene la B.
  const r = propuestasParaLaRecepcion({
    propuestas: [{ ...propuestaDeSecco(), tipoComprobante: "B" }],
    explicaciones: [{ tipoComprobante: "A", explicacion: "La A de CCU.", version: 2 }],
    tiposDelPedido: ["B"],
  });
  assert.equal(r.length, 1);
});

test("UNA PROPUESTA DE OTRO TIPO DE PAPEL NO SE OFRECE", () => {
  // Llegó una factura A y la propuesta pendiente es de la B: confirmarla acá
  // sería decir "está bien" sobre un papel que no se está mirando.
  const r = propuestasParaLaRecepcion({
    propuestas: [{ ...propuestaDeSecco(), tipoComprobante: "B" }],
    explicaciones: [],
    tiposDelPedido: ["A"],
  });
  assert.deepEqual(r, []);
});

test("CONTRAPRUEBA: EL FILTRO DE LA CONFIRMADA ESTÁ EN EL CÓDIGO QUE CORRE", () => {
  // Sin esta línea, el candado de arriba es el único que lo sostiene; con ella
  // se ve que la condición existe y no está en un comentario.
  const c = codigoDe("lib/compras-proveedor/comprobante/explicacionPorTipo.js");
  assert.match(c, /return llegaron\.has\(tipo\) && !confirmados\.has\(tipo\);/);
});

// ══════════════════════════════════════════════════════════════════════════
// QUÉ SE DIBUJA
// ══════════════════════════════════════════════════════════════════════════

test("EL BLOQUE DIBUJA LA PROPUESTA CON «ESTÁ BIEN, GUARDAR» HABILITADO", () => {
  const p = propuestaDeSecco();
  const resultado = comoLoEntendio({ lectura: p.lectura });
  // La lectura de Secco cierra: es la condición para que haya propuesta.
  assert.equal(resultado.cierra, true);
  const sePuedeGuardar = sePuedeGuardarLaExplicacion({ resultado, explicacion: p.explicacion });
  assert.equal(sePuedeGuardar, true);
  const html = renderToStaticMarkup(
    React.createElement(PropuestaDeReceta, {
      resultado, propuesta: true, sePuedeGuardar, onGuardar: () => {}, onCorregir: () => {},
    })
  );
  const vista = aLaVista(html);
  assert.ok(vista.includes(TEXTO_PROPUESTA), "no dice que la armó el sistema");
  assert.ok(vista.includes("Está bien, guardar"));
  assert.ok(vista.includes("Algo está mal: corregir la explicación"));
  assert.ok(vista.includes("SECCO LIMA LIMON"), "no muestra cómo leyó el papel");
  // Habilitado: ningún botón de guardar viene apagado.
  assert.ok(!/<button[^>]*disabled[^>]*>[^<]*Está bien, guardar/.test(html), "el botón vino apagado");
});

test("SIN PROPUESTA, EL BLOQUE NO DICE QUE LA ARMÓ EL SISTEMA", () => {
  // Es el caso de «Probar» en Recetas de facturas: el mismo bloque, sin el
  // texto de la propuesta.
  const resultado = comoLoEntendio({ lectura: lecturaDeSecco() });
  const html = renderToStaticMarkup(
    React.createElement(PropuestaDeReceta, {
      resultado, propuesta: false, sePuedeGuardar: true, onGuardar: () => {}, onCorregir: () => {},
    })
  );
  assert.ok(!aLaVista(html).includes(TEXTO_PROPUESTA));
});

test("EL BLOQUE ES UNO SOLO, USADO EN RECETAS DE FACTURAS Y EN LA RECEPCIÓN", () => {
  for (const pantalla of [EXPLICACION, EN_LA_RECEPCION]) {
    const c = codigoDe(pantalla);
    assert.match(
      c,
      /import PropuestaDeReceta, \{[\s\S]*?\} from "@\/components\/compras-proveedor\/PropuestaDeReceta"/,
      `${pantalla} no usa el bloque compartido`
    );
    assert.match(c, /<PropuestaDeReceta/);
    assert.match(c, /<TarjetaDeLaExplicacion/);
    assert.match(c, /<MensajeDeLaReceta/);
  }
  // Y NADIE MÁS TIENE EL BOTÓN: el texto vive en un solo archivo de todo el
  // repo. Enumerado con `git grep --untracked`, que ve lo recién escrito.
  const salida = execSync(
    'git grep -l --untracked "Está bien, guardar" -- "app/**/*.jsx" "components/**/*.jsx" || true',
    { cwd: RAIZ, encoding: "utf8" }
  );
  const conElBoton = salida
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    // Solo cuenta donde está en el código, no en la prosa.
    .filter((f) => codigoDe(f).includes("Está bien, guardar"));
  assert.deepEqual(conElBoton, [PROPUESTA], "hay una copia del botón de confirmar fuera del bloque");
});

// ══════════════════════════════════════════════════════════════════════════
// CÓMO GUARDA, Y DÓNDE SE DIBUJA
// ══════════════════════════════════════════════════════════════════════════

test("LA RECEPCIÓN CONFIRMA POR EL MISMO CAMINO QUE RECETAS DE FACTURAS", () => {
  const c = codigoDe(EN_LA_RECEPCION);
  // El guardado de la receta, no uno propio: ni un POST suelto ni otra ruta.
  assert.match(c, /import \{ useGuardarLaExplicacion \} from "@\/components\/compras-proveedor\/ExplicacionDelPapel"/);
  assert.ok(!/method:\s*"POST"/.test(c), "la recepción armó su propio POST");
  assert.match(c, /confirmarPropuesta: true/);
  // Lo que ofrece sale de la regla probada arriba, no de un filtro al lado.
  assert.match(c, /propuestasParaLaRecepcion\(\{/);
  // La lectura sale de la ruta que ya existía, la misma que usa la receta.
  assert.match(c, /\/api\/compras-proveedor\/recetas\/explicacion\?proveedorId=/);
  // Y los papeles del pedido no se releen al confirmar.
  assert.match(c, /exceptuar: comprobantes\.map\(\(c\) => c\?\.id\)/);
  // El hook es el que guardaba en la receta: la misma ruta, y relee en serie.
  const h = codigoDe(EXPLICACION);
  assert.match(h, /export function useGuardarLaExplicacion\(/);
  assert.match(h, /fetch\("\/api\/compras-proveedor\/recetas\/explicacion", \{\s*method: "POST"/);
  assert.match(h, /\.filter\(\(id\) => !exceptuar\.includes\(id\)\)/);
});

test("NO HAY UNA RUTA NUEVA: EL PERMISO LO REVALIDA LA DE SIEMPRE", () => {
  const ruta = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  // Guardar o confirmar pide recibir, del lado del servidor.
  assert.match(ruta, /export async function POST[\s\S]{0,400}?checkPerm\(session, "compras\.recibir"\)/);
  assert.match(ruta, /body\?\.confirmarPropuesta === true/);
  const rutas = execSync('git ls-files --cached --others --exclude-standard "app/api/compras-proveedor/recetas/**"', {
    cwd: RAIZ,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(rutas, [
    "app/api/compras-proveedor/recetas/explicacion/route.js",
    "app/api/compras-proveedor/recetas/guardar/route.js",
    "app/api/compras-proveedor/recetas/listar/route.js",
    "app/api/compras-proveedor/recetas/obtener/route.js",
  ]);
});

test("LA RECEPCIÓN LO DIBUJA RECIBIENDO, ARRIBA DE LOS PRODUCTOS DEL PAPEL", () => {
  const p = codigoDe(RECEPCION);
  const bloque = p.indexOf("<PropuestaEnLaRecepcion");
  const lista = p.indexOf("<ListaDeLaFactura");
  assert.ok(bloque > 0, "la recepción no monta la propuesta");
  assert.ok(bloque < lista, "la propuesta quedó debajo de los productos");
  // Colgado de la recepción con papel —no de la rama de consulta, que no
  // corre recibiendo: el defecto del bloque de corrección del #242—.
  assert.match(p, /\{esRecepcion && !sinPapel && \(\s*<PropuestaEnLaRecepcion/);
  const ramaVieja = p.indexOf("{!esRecepcion && !sinPedidoPrevio && (");
  assert.ok(ramaVieja > 0, "se perdió la rama de consulta; revisá este candado");
  assert.ok(bloque < ramaVieja, "la propuesta quedó adentro de la rama que no corre recibiendo");
  // Con los comprobantes del pedido, de donde sale el tipo que llegó.
  assert.match(p, /comprobantes=\{\(conciliacion\?\.grupos \|\| \[\]\)/);
  // Y el tipo viaja desde la conciliación: es la letra guardada.
  assert.match(codigoDe("lib/compras-proveedor/comprobante/filasDeConciliacion.js"), /letra: c\.tipo \?\? null/);
});

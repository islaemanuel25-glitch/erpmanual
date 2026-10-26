// EN LA PANTALLA DE RECIBIR SE DICE "PRODUCTOS", NUNCA "LÍNEAS" NI "RENGLONES".
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/textosDeRecibir.test.mjs
//
// Emanuel, 2026-10-26, sobre el pedido de Mauro #298: la pantalla decía
// "Comprobante borrado, con sus 15 líneas y su foto" y "Los costos de los
// renglones suman…". Quien recibe mira productos, no renglones de una tabla.
//
// Los archivos son los que llevan texto a la pantalla de recibir, relevados el
// mismo día siguiendo los imports de `app/modulos/compras-proveedor/[id]/page.jsx`
// y los mensajes de las rutas que llama. Se miran SOLO los textos entre comillas,
// sin comentarios (CLAUDE.md, regla 5: un candado que busca texto encuentra los
// comentarios) y sin las interpolaciones `${…}`, que son nombres de variables.
// Los prompts que se le mandan al modelo no están en la lista: ahí "renglón" es
// la palabra para la IA, no para la persona.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const ARCHIVOS = [
  "app/modulos/compras-proveedor/[id]/page.jsx",
  "app/api/compras-proveedor/comprobantes/marcar-revisada/route.js",
  "lib/compras-proveedor/comprobante/cobertura.js",
  "components/comprobantes/PanelComprobantes.jsx",
  "components/compras-proveedor/CorregirComprobante.jsx",
  "app/api/compras-proveedor/comprobantes/borrar/[id]/route.js",
  "app/api/compras-proveedor/comprobantes/aceptar-precio/route.js",
  "app/api/compras-proveedor/recepcion/correccion/route.js",
  "app/api/compras-proveedor/comprobantes/vincular/route.js",
  "app/api/compras-proveedor/recibir/[id]/route.js",
  "lib/compras-proveedor/estadoDeLineaFacturada.js",
  "lib/compras-proveedor/comprobante/resolverLineaDelPapel.js",
  "lib/compras-proveedor/comprobante/aceptarPrecio.js",
  "lib/compras-proveedor/comprobante/pruebaDeExplicacion.js",
  "lib/compras-proveedor/comprobante/lector/puerta.js",
  "lib/compras-proveedor/comprobante/pantalla.js",
  "lib/compras-proveedor/comprobante/borrado.js",
  "lib/compras-proveedor/comprobante/correccionManual.js",
];

/**
 * Los textos entre comillas de un fuente, sin comentarios, sin interpolaciones
 * y sin lo que va al log del servidor (`console.*`), que no lo ve nadie en la
 * pantalla. Una interpolación con otra plantilla adentro corta la de afuera:
 * lo que queda desde el `${` hasta el corte es código y también se saca.
 */
export function textosDe(fuente) {
  const sinComentarios = fuente
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1")
    .replace(/console\.[a-z]+\([^\n]*/g, "");
  const textos = [];
  for (const m of sinComentarios.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    textos.push((m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*(\}|$)/g, ""));
  }
  return textos;
}

const PROHIBIDAS = /(^|[^a-záéíóúñ])(l[ií]neas?|rengl[oó]n|renglones)([^a-záéíóúñ]|$)/i;

test("NINGÚN TEXTO DE LA PANTALLA DE RECIBIR DICE «LÍNEA» NI «RENGLÓN»", () => {
  const encontrados = [];
  for (const rel of ARCHIVOS) {
    const fuente = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    for (const t of textosDe(fuente)) if (PROHIBIDAS.test(t)) encontrados.push(`${rel}: ${t.trim()}`);
  }
  assert.deepEqual(encontrados, []);
});

test("CONTRAPRUEBA: el lector de textos encuentra la palabra en un texto y no en un comentario", () => {
  const fuente = [
    "// los renglones del papel",
    "const a = `Comprobante borrado, con sus ${n} líneas y su foto.`;",
    'const b = "Los costos de los productos suman";',
    "/* la línea del pedido */",
  ].join("\n");
  const malos = textosDe(fuente).filter((t) => PROHIBIDAS.test(t));
  assert.equal(malos.length, 1);
  assert.match(malos[0], /líneas y su foto/);
  assert.equal(textosDe("const x = `${lineas}`;").filter((t) => PROHIBIDAS.test(t)).length, 0, "una variable no es texto");
});

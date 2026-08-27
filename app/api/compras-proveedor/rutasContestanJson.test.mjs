// LAS RUTAS DEL IMPORTADOR CONTESTAN JSON TAMBIÉN CUANDO FALLAN.
//
// ── POR QUÉ ES UN CANDADO Y NO UNA COSTUMBRE ──────────────────────────────
//
// El 2026-08-27 la pantalla mostró `Unexpected token '<', "<!DOCTYPE "...`. Del
// lado del cliente eso ya está atajado —`lib/red/leerJson.js` lo convierte en un
// mensaje que dice qué falló y con qué código—, pero atajarlo no es lo mismo que
// no producirlo: una ruta que conteste una página sigue siendo una ruta rota, y
// el cliente solo puede informarlo mejor.
//
// Acá se afirma el otro lado: que ningún camino de salida de estas rutas
// devuelva algo que no sea JSON. Incluido el `catch`, que es el que más fácil se
// olvida porque casi nunca corre.
//
// ── Y SE MIRA EL CÓDIGO, NO LOS COMENTARIOS ───────────────────────────────
//
// Estos archivos NOMBRAN `<!DOCTYPE` y "página" en su prosa, justamente porque
// explican este defecto. Sin sacar los comentarios, el candado se pondría rojo
// por la explicación de lo que defiende.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const RAIZ = path.resolve(import.meta.dirname, "../../..");

// Las rutas que la pantalla del importador llama. Se listan a mano y no se
// descubren solas a propósito: si mañana la pantalla llama a una más, este
// candado tiene que quedar viejo de forma visible y no ampliarse en silencio.
const RUTAS = [
  "app/api/compras-proveedor/importar/analizar/route.js",
  "app/api/compras-proveedor/importar/transcribir/route.js",
  "app/api/compras-proveedor/importar/ordenar-candidatos/route.js",
  "app/api/compras-proveedor/recetas-lectura/interpretar/route.js",
  "app/api/compras-proveedor/recetas-lectura/guardar/route.js",
  "app/api/compras-proveedor/recetas-lectura/listar/route.js",
];

function soloCodigo(rel) {
  return readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

test("TODA salida de estas rutas es NextResponse.json — ninguna es otra cosa", () => {
  for (const rel of RUTAS) {
    const codigo = soloCodigo(rel);
    const retornos = [...codigo.matchAll(/return\s+([A-Za-z_$][\w$.]*)/g)].map((m) => m[1]);
    assert.ok(retornos.length > 0, `${rel}: no se encontró ningún return, el candado no está mirando nada`);
    for (const r of retornos) {
      assert.equal(r, "NextResponse.json", `${rel}: devuelve \`${r}\`, que puede no ser JSON`);
    }
    // Y ninguna arma una respuesta cruda, que es la otra forma de mandar HTML.
    assert.doesNotMatch(codigo, /new Response\(/, `${rel}: arma una Response a mano`);
    assert.doesNotMatch(codigo, /NextResponse\.redirect/, `${rel}: redirige, y un fetch de datos seguiría al HTML`);
  }
});

test("CADA ruta tiene su catch, y ese catch contesta JSON", () => {
  for (const rel of RUTAS) {
    const codigo = soloCodigo(rel);
    assert.match(codigo, /catch\s*\(/, `${rel}: no tiene catch, así que una excepción sale como página de error`);

    // Lo que hay entre `catch (` y el final del archivo tiene que contener una
    // respuesta JSON. Sin esto un catch podría loguear y no devolver nada, que
    // en Next termina también en una página.
    const desde = codigo.indexOf("catch (");
    const cola = codigo.slice(desde);
    assert.match(cola, /NextResponse\.json/, `${rel}: el catch no devuelve JSON`);
  }
});

test("el catch NO expone el error crudo al cliente", () => {
  // Un `err.message` de Prisma nombra columnas y tablas; uno de fetch nombra
  // hosts internos. Se registra en el servidor y se contesta un texto escrito.
  for (const rel of RUTAS) {
    const codigo = soloCodigo(rel);
    const desde = codigo.indexOf("catch (");
    if (desde < 0) continue;
    const cola = codigo.slice(desde);
    assert.doesNotMatch(
      cola,
      /error:\s*(err|error|e)\??\.(message|stack)/,
      `${rel}: el catch manda el error interno a la pantalla`
    );
  }
});

test("los errores dicen QUÉ pasó, no 'Error interno'", () => {
  // Es la regla vieja del módulo: un mensaje mudo obliga a mirar los logs del
  // servidor para saber qué hacer, y quien está delante de la pantalla no puede.
  for (const rel of RUTAS) {
    const codigo = soloCodigo(rel);
    assert.doesNotMatch(codigo, /"Error interno"/, `${rel}: contesta "Error interno"`);
  }
});

test("NINGUNA ruta de IA contesta 502 — un 5xx del origen lo puede reemplazar un proxy", () => {
  // ── DE DÓNDE SALIÓ ──────────────────────────────────────────────────────
  //
  // El 2026-08-27, después del primer arreglo, la pantalla informó «el servidor
  // contestó una página en vez de datos (código 502)». La ruta de interpretar
  // devolvía 502 con JSON cuando el proveedor fallaba, y lo que llegó al
  // navegador empezaba con `<`: alguien entre el origen y el navegador —nginx o
  // Cloudflare— reemplazó el cuerpo.
  //
  // Y el 502 además era falso: la aplicación no es un gateway roto. Que el
  // proveedor esté sin cuota o sobrecargado es un RESULTADO de la vista previa.
  // Va con 200 y `ok:false`, que la pantalla ya sabe leer.
  for (const rel of RUTAS) {
    const codigo = soloCodigo(rel);
    assert.doesNotMatch(
      codigo,
      /status:\s*502/,
      `${rel}: contesta 502, y un 5xx del origen es lo que un proxy reemplaza por una página`
    );
  }
});

test("las rutas de IA llevan traza con requestId, de entrada y de salida", () => {
  // Sin esto, un pedido que falla por el camino previsto no deja ni una línea, y
  // la ausencia de log no distingue "no llegó al handler" de "llegó y salió por
  // la puerta de al lado". Esa ambigüedad dejó el diagnóstico a medias dos veces.
  for (const rel of ["app/api/compras-proveedor/recetas-lectura/interpretar/route.js",
                     "app/api/compras-proveedor/importar/transcribir/route.js"]) {
    const codigo = soloCodigo(rel);
    assert.match(codigo, /crearTraza\(/, `${rel}: no abre traza`);
    assert.match(codigo, /traza\.fin\(/, `${rel}: no cierra traza`);
    assert.match(codigo, /CABECERA_REQUEST_ID/, `${rel}: no devuelve el identificador en el encabezado`);

    // Y TODA salida tiene que cerrarla. Un `return` sin `traza.fin` deja un
    // pedido con línea de entrada y sin línea de salida, que se lee como "se
    // colgó adentro del handler" — un diagnóstico falso.
    const returns = (codigo.match(/return\s+NextResponse\.json/g) || []).length;
    const fines = (codigo.match(/traza\.fin\(/g) || []).length;
    assert.equal(fines, returns, `${rel}: ${returns} salidas y ${fines} cierres de traza`);
  }
});

test("transcribir NO escribe: no toca prisma ni ningún create/update", () => {
  // Es la ruta nueva, y la promesa de "ver cómo quedaría sin comprometerse"
  // depende de que no escriba. Se afirma sobre el archivo, igual que en
  // interpretar.
  const codigo = soloCodigo("app/api/compras-proveedor/importar/transcribir/route.js");
  for (const prohibido of ["prisma", ".create(", ".update(", ".upsert(", ".delete(", "$transaction"]) {
    assert.ok(!codigo.includes(prohibido), `transcribir usa ${prohibido}: eso escribiría`);
  }
});

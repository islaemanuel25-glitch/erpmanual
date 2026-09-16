// QUE EL LECTOR DE PDF SIGA LLEGANDO AL SERVIDOR.
//
// ── POR QUÉ ESTE CANDADO MIRA UN ARCHIVO DE CONFIGURACIÓN ───────────────────
//
// Porque ahí es donde ocurre el problema, y ningún otro candado puede verlo. Los
// del módulo de lectura corren en Node con `node --test`, donde
// `import("pdfjs-dist/legacy/build/pdf.mjs")` resuelve perfecto y el worker está
// al lado en `node_modules`. El build de Next también pasa en verde. La falla
// aparece recién cuando el empaquetador se lleva el módulo y deja al worker
// afuera, y ahí el mensaje que llega a la pantalla es "el archivo no se pudo
// abrir, puede estar dañado o protegido" sobre un PDF que está perfecto.
//
// Pasó las dos veces: en desarrollo, la primera vez que se llamó al endpoint de
// verdad; y en el build de producción, donde `.next/standalone` quedaba con
// `pdf.mjs` y sin `pdf.worker.mjs`.
//
// Es el caso que el CLAUDE.md describe como "un candado puede estar mirando el
// lugar equivocado": el defecto no está en el módulo de lectura, así que el
// candado tampoco.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../../..");
const CONFIG = fs.readFileSync(path.join(RAIZ, "next.config.mjs"), "utf8");

/** El fuente sin comentarios: un candado que mira código no mira la prosa. */
const CODIGO = CONFIG.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("pdfjs-dist queda fuera del empaquetado del servidor", () => {
  assert.match(
    CODIGO,
    /serverExternalPackages\s*:\s*\[[^\]]*["']pdfjs-dist["']/,
    "sin esto, el lector de PDF no encuentra su worker y toda lista en PDF se informa como archivo dañado"
  );
});

test("el worker de pdfjs se copia al paquete de producción", () => {
  assert.match(
    CODIGO,
    /outputFileTracingIncludes/,
    "falta el trazado explícito del worker"
  );
  assert.match(
    CODIGO,
    /pdf\.worker\.mjs/,
    "el worker de pdfjs tiene que estar nombrado: el trazador no lo encuentra solo porque su importación es dinámica"
  );
});

test("el worker existe donde la configuración dice que está", () => {
  // CONTRAPRUEBA DE LA RUTA: el renglón de configuración puede nombrar un archivo
  // que no existe —una versión de pdfjs que lo movió de lugar— y el build seguiría
  // pasando en verde, copiando nada.
  const ruta = CODIGO.match(/["']\.\/(node_modules\/pdfjs-dist\/[^"']+pdf\.worker\.mjs)["']/);
  assert.ok(ruta, "la ruta del worker tiene que estar escrita entera, para poder comprobarla");
  assert.equal(
    fs.existsSync(path.join(RAIZ, ruta[1])),
    true,
    `la configuración nombra ${ruta[1]} y ese archivo no existe`
  );
});

test("el paquete está en dependencies y no en devDependencies", () => {
  // En devDependencies, la imagen de producción se construye sin él y el módulo
  // de lectura desaparece entero en el VPS.
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  assert.ok(pkg.dependencies?.["pdfjs-dist"], "pdfjs-dist tiene que estar en dependencies");
  assert.equal(pkg.devDependencies?.["pdfjs-dist"], undefined);
});

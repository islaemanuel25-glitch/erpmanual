// NINGÚN ARCHIVO USA UN IDENTIFICADOR QUE NO IMPORTA NI DEFINE.
//
// ── POR QUÉ ESTE CANDADO, Y NO OTRO INTENTO ────────────────────────────────
//
// El gate ya existía: `eslint.undef.config.mjs` con la regla `no-undef`, y el
// comentario de su encabezado cuenta el caso que lo hizo nacer —
// `ArqueosDelTurno.jsx` usaba `etiquetaRegistro` sin importarlo, compiló, pasó
// el lint general y reventó en producción—.
//
// **Y volvió a pasar igual.** `PanelComprobantes.jsx` usaba `queHacerHttp` y
// `SIN_RESPUESTA` sin importarlos: cualquier subida o lectura que fallara entraba
// al catch y tiraba ReferenceError en vez de mostrar el mensaje, en el módulo que
// más se usa.
//
// El gate lo veía. Corrido a mano, salía en rojo con las cinco líneas exactas.
// Lo que fallaba era otra cosa: **vive en un `npm run` que nadie corre**. La
// suite estaba en verde con el gate en rojo, y eso es peor que no tenerlo,
// porque el verde de la suite se lee como que está todo bien.
//
// Es el caso de "un candado puede estar mirando el lugar equivocado" con una
// vuelta más: éste miraba el lugar correcto, pero desde afuera del camino que se
// recorre. Por eso el arreglo no es otra regla: es que la regla que ya existe
// corra CON LA SUITE.
//
// ── QUÉ CUBRE ──────────────────────────────────────────────────────────────
//
// Todo el código de aplicación: app, components, lib y hooks. Es el alcance del
// config, y está explicado ahí por qué `scripts/generador/` queda afuera.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ESLINT = path.join(RAIZ, "node_modules", "eslint", "bin", "eslint.js");
const CONFIG = path.join(RAIZ, "eslint.undef.config.mjs");

/** Corre el gate sobre lo que se le pase y devuelve lo que informó. */
function correrGate(objetivos) {
  const r = spawnSync(
    process.execPath,
    [ESLINT, ...objetivos, "--config", CONFIG, "--no-inline-config", "--format", "json"],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (r.error) throw r.error;
  const salida = (r.stdout || "").trim();
  if (!salida) throw new Error(`el gate no informó nada. stderr: ${r.stderr}`);
  return JSON.parse(salida);
}

test("EL GATE ATRAPA UN IDENTIFICADOR QUE NO EXISTE", () => {
  // Primero se ejerce el caso que lo activa. Sin esto no se sabe si el candado
  // prueba algo: un gate que no encuentra nada y un gate que no mira nada dan
  // exactamente el mismo verde. Ya pasó con la rama de `subtotalImpreso`, que
  // estaba escrita y era inalcanzable.
  // La carpeta va DENTRO del repo a propósito: eslint no aplica su config a un
  // archivo de afuera de la raíz —lo informa como ignorado, con `ruleId` en
  // null— y el candado estaría midiendo eso en vez del `no-undef`.
  const carpeta = fs.mkdtempSync(path.join(RAIZ, ".gate-undef-"));
  const archivo = path.join(carpeta, "roto.jsx");
  fs.writeFileSync(
    archivo,
    "export default function X() {\n  return <div>{noExisteEnNingunLado()}</div>;\n}\n"
  );
  try {
    const informe = correrGate([archivo]);
    const errores = informe.flatMap((f) => f.messages);
    assert.equal(errores.length, 1, JSON.stringify(errores));
    assert.equal(errores[0].ruleId, "no-undef");
    assert.match(errores[0].message, /noExisteEnNingunLado/);
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test("NINGÚN ARCHIVO DE LA APLICACIÓN USA UN IDENTIFICADOR SIN DEFINIR", () => {
  const informe = correrGate(["app", "components", "lib", "hooks"]);

  // Que haya mirado algo. Un patrón de archivos que no matchea nada devuelve
  // cero errores y parece un verde.
  assert.ok(
    informe.length > 500,
    `el gate solo miró ${informe.length} archivos: revisá el alcance antes de creerle al verde`
  );

  const rotos = informe
    .filter((f) => f.messages.length > 0)
    .map((f) => {
      const rel = path.relative(RAIZ, f.filePath).replace(/\\/g, "/");
      const cuales = f.messages.map((m) => `${m.line}:${m.column} ${m.message}`).join("; ");
      return `${rel} — ${cuales}`;
    });

  assert.deepEqual(
    rotos,
    [],
    `hay identificadores que no se importan ni se definen. Compilan, y explotan ` +
      `en el navegador cuando se recorre esa línea:\n  ${rotos.join("\n  ")}`
  );
});

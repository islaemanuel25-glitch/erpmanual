// CANDADO: EL TRINQUETE DISTINGUE UN VEREDICTO DE UN CHOQUE.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/hookTrinquete.test.mjs
//
// ── EL DEFECTO QUE FIJA ─────────────────────────────────────────────────────
//
// El contador sale con código 1 cuando el hardcodeo subió. Node TAMBIÉN sale con
// 1 cuando el script se cae solo. El hook miraba únicamente el código, así que
// un contador que reventaba antes de contar nada producía el aviso "este cambio
// hizo subir el conteo por encima de la línea de base".
//
// No es teórico: se vio el 2026-09-04. `lib/hardcodeo/contador` era ESM en un
// archivo `.js` y el `package.json` no declara `"type": "module"`, así que en
// Node 18 el import explotaba con `Named export 'ETIQUETAS' not found`. Cada
// edición de un `.jsx` disparaba una falsa alarma, y —lo que importa— durante
// toda esa sesión el trinquete no midió nada mientras parecía estar midiendo.
//
// Esa causa se arregló el 2026-09-07 renombrando el módulo a `.mjs`, y la cuida
// `scripts/hardcodeoArranca.test.mjs`. Este candado sigue igual: lo que afirma
// no es que el contador cargue, sino que el hook DISTINGA un veredicto de un
// choque — y un choque puede venir de cualquier lado.
//
// Un aviso que no separa "conté y subió" de "no pude contar" no se puede creer
// en ninguna de las dos direcciones: la falsa alarma hace que se lo empiece a
// ignorar, y a partir de ahí un aumento de verdad tampoco se mira.
//
// ── CÓMO SE PRUEBA ──────────────────────────────────────────────────────────
//
// Se corre el hook de verdad, con un contador FALSO inyectado por variable de
// entorno, en los cuatro desenlaces posibles. Ejercer el caso que la defensa
// activa es la única forma de saber que la defensa se alcanza: en este repo ya
// hubo una rama defensiva escrita, correcta y jamás ejecutada.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

// La marca se IMPORTA, no se copia: era la tercera escritura a mano de la misma
// cadena, y por eso cambiar el texto del trinquete rompía el hook en silencio.
import { MARCA_VEREDICTO as MARCA } from "@/lib/hardcodeo/contador.mjs";

// `fileURLToPath(import.meta.url)` y no `import.meta.dirname`: el segundo existe
// desde Node 20.11 y este candado tiene que poder correr también en el intérprete
// viejo, porque el defecto que fija aparece justamente ahí.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(RAIZ, "scripts", "hook-trinquete-hardcodeo.mjs");

// Un archivo que al hook le importa: solo mira app/ y components/ con .jsx.
const ARCHIVO = path.join(RAIZ, "components", "pos-ventas", "FormaPago.jsx");

/**
 * Corre el hook con un contador falso que imprime lo que se le diga y sale con
 * el código que se le diga. Se escribe en un directorio temporal: el repo no se
 * ensucia para que una prueba pueda correr.
 */
function correrHook({ stdout = "", stderr = "", codigo = 0 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trinquete-"));
  const falso = path.join(dir, "contador-falso.mjs");
  fs.writeFileSync(
    falso,
    `process.stdout.write(${JSON.stringify(stdout)});\n` +
      `process.stderr.write(${JSON.stringify(stderr)});\n` +
      `process.exit(${Number(codigo)});\n`
  );

  try {
    const r = spawnSync(
      process.execPath,
      [HOOK],
      {
        input: JSON.stringify({ tool_input: { file_path: ARCHIVO } }),
        encoding: "utf8",
        env: { ...process.env, ERPAZUL_CONTADOR_HARDCODEO: falso },
      }
    );
    const salida = (r.stdout || "").trim();
    return salida ? JSON.parse(salida).hookSpecificOutput.additionalContext : null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ══════════════════════════════════════════════════════════════════════════

test("el contador se cae con código 1: el hook dice que NO pudo revisar", () => {
  // Éste es el caso exacto que se rompía. La salida de un choque de Node: sin
  // stdout, con una excepción en stderr, y código 1 — el mismo código que un
  // aumento de verdad.
  const aviso = correrHook({
    stderr: "SyntaxError: Named export 'ETIQUETAS' not found.\n    at ModuleJob._instantiate",
    codigo: 1,
  });

  assert.ok(aviso, "un contador roto que calla se confunde con uno que no encontró nada");
  assert.match(aviso, /no pudo correr/, "tiene que decir que no pudo correr");
  assert.doesNotMatch(
    aviso,
    /hizo subir el conteo/,
    "NO puede acusar de un aumento que nunca se midió"
  );
  assert.match(aviso, /ETIQUETAS/, "y tiene que mostrar el motivo real, no esconderlo");
});

test("el contador cuenta y el hardcodeo subió: el hook lo dice", () => {
  // La contraprueba del caso anterior. Si esto no pasara, el arreglo habría
  // apagado el trinquete en vez de arreglarlo: un candado que nunca acusa se ve
  // igual que uno que funciona.
  const aviso = correrHook({
    stderr: `${MARCA}\n\n  Colores fijos: 10 → 12  (+2)\n`,
    codigo: 1,
  });

  assert.ok(aviso);
  assert.match(aviso, /hizo subir el conteo/);
  assert.match(aviso, /Colores fijos: 10 → 12/, "el detalle del aumento tiene que llegar");
  assert.match(aviso, /FormaPago\.jsx/, "y qué archivo se tocó");
});

test("el hardcodeo no subió: el hook se queda callado", () => {
  assert.equal(correrHook({ codigo: 0 }), null, "sin novedad no se interrumpe a nadie");
});

test("el contador aborta con otro código: tampoco acusa un aumento", () => {
  // Por ejemplo, sin línea de base sellada. No hay veredicto, así que no se
  // puede afirmar nada sobre el conteo.
  const aviso = correrHook({ stderr: "No hay línea de base.", codigo: 2 });
  assert.match(aviso, /no pudo correr/);
  assert.doesNotMatch(aviso, /hizo subir el conteo/);
});

test("un archivo que no es .jsx de app/ o components/ no dispara nada", () => {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: path.join(RAIZ, "lib", "ofertas", "precio.js") } }),
    encoding: "utf8",
  });
  assert.equal((r.stdout || "").trim(), "", "el trinquete mira pantallas, no el kit");
});

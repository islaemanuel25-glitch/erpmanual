// EL HOOK NO PUEDE ACUSAR A UNA EDICIÓN DE LO QUE YA ESTABA COMMITEADO.
//
// ── QUÉ DEFECTO CIERRA ────────────────────────────────────────────────────
//
// `--trinquete --archivo X` existe para el hook que corre después de cada
// edición. Hasta esta corrección hacía esto:
//
//   1. comparaba el inventario ACTUAL contra la línea base HISTÓRICA;
//   2. filtraba esas altas por `a.archivo === X`.
//
// Y el hook informaba: "esta edición de X introdujo hardcodeo que no estaba en
// la línea de base". **Eso no se seguía de la medición.** Una ocurrencia que
// entró en un commit anterior y sigue pendiente vuelve a aparecer en el paso 2
// cada vez que alguien toca CUALQUIER otra línea del mismo archivo.
//
// Reproducido antes de arreglarlo: línea base sin `text-[13px]`, `HEAD` con el
// `text-[13px]` ya adentro, y una edición que solo cambia `hola` por `chau`. El
// trinquete salía con 1 y el hook culpaba a esa edición.
//
// No es teórico: quedan 15 altas pendientes en 13 lugares. El primero que
// editara uno de esos trece archivos se comía la acusación.
//
// ── EL CONTRATO NUEVO ─────────────────────────────────────────────────────
//
// Con `--archivo` la referencia deja de ser la línea base y pasa a ser **el
// mismo archivo en `HEAD`**. Lo que está commiteado será deuda —y el trinquete
// GLOBAL la sigue informando— pero no la trajo quien está editando ahora.
//
// El modo global no cambia: sin la bandera se compara contra la línea base
// histórica exactamente como antes. Eso también se afirma acá, porque un
// arreglo que se lleve puesto el trinquete del repo sería peor que el defecto.

import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(RAIZ, "scripts/hardcodeo.mjs");

/** Un repo de juguete con un archivo ya COMMITEADO. */
function repoConHead(contenidoCommiteado, ruta = "components/sunmi/a.jsx") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trinquete-atribucion-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q", ".");
  fs.mkdirSync(path.join(dir, path.dirname(ruta)), { recursive: true });
  fs.writeFileSync(path.join(dir, ruta), contenidoCommiteado);
  g("add", "-A");
  g("-c", "user.email=a@b", "-c", "user.name=x", "commit", "-qm", "estado commiteado");
  return { dir, ruta, escribir: (t) => fs.writeFileSync(path.join(dir, ruta), t) };
}

/**
 * Una línea base que NO conoce el archivo del juguete: así la deuda vieja del
 * archivo también es "alta contra la base", que es justo la trampa que hacía
 * fallar la atribución.
 */
function baseVacia(dir) {
  const archivo = path.join(dir, "base.json");
  fs.writeFileSync(
    archivo,
    JSON.stringify({
      generada: "2026-01-01 00:00",
      commit: "0".repeat(40),
      total: { color: 0, medida: 0, modal: 0, crudo: 0, celda: 0, "kit-pisado": 0, "tema-paralelo": 0 },
      porPantalla: {},
      inventario: {},
    }) + "\n"
  );
  return archivo;
}

const correr = (dir, base, args) =>
  spawnSync(process.execPath, [SCRIPT, "--trinquete", ...args], {
    cwd: RAIZ,
    encoding: "utf8",
    env: { ...process.env, HARDCODEO_RAIZ: dir, HARDCODEO_LINEA_BASE: base },
    maxBuffer: 64 * 1024 * 1024,
  });

const CON_DEUDA = 'export default function A(){\n  return <div className="text-[13px]">hola</div>;\n}\n';

test("A · deuda ya presente en HEAD + edición inocente: NO se acusa a la edición", () => {
  const { dir, ruta, escribir } = repoConHead(CON_DEUDA);
  const base = baseVacia(dir);
  // La "edición" cambia texto y nada más. El `text-[13px]` no lo tocó nadie.
  escribir(CON_DEUDA.replace("hola", "chau"));

  const r = correr(dir, base, ["--archivo", ruta]);
  assert.equal(
    r.status,
    0,
    "acusó a una edición que no introdujo nada: la ocurrencia ya estaba commiteada.\n" + r.stderr
  );
  assert.doesNotMatch(r.stderr, /text-\[13px\]/, "no puede nombrar una ocurrencia que ya estaba en HEAD");
});

test("B · alta REALMENTE nueva en el árbol de trabajo respecto de HEAD: rojo", () => {
  const { dir, ruta, escribir } = repoConHead(CON_DEUDA);
  const base = baseVacia(dir);
  escribir(CON_DEUDA.replace('text-[13px]', 'text-[13px] text-[21px]'));

  const r = correr(dir, base, ["--archivo", ruta]);
  assert.equal(r.status, 1, "una ocurrencia nueva de verdad tiene que poner rojo");
  assert.match(r.stderr, /text-\[21px\]/, "tiene que nombrar la que SÍ trajo el cambio");
  assert.doesNotMatch(r.stderr, /text-\[13px\]/, "y no la que ya estaba");
});

test("C · deuda nueva en OTRO archivo no contamina el aviso de éste", () => {
  const { dir, ruta } = repoConHead(CON_DEUDA);
  const base = baseVacia(dir);
  fs.writeFileSync(
    path.join(dir, "components/sunmi/c.jsx"),
    'export default function C(){\n  return <div className="text-[33px]">otro</div>;\n}\n'
  );

  const r = correr(dir, base, ["--archivo", ruta]);
  assert.equal(r.status, 0, "la deuda de otro archivo no es de éste");
  assert.doesNotMatch(r.stderr + r.stdout, /text-\[33px\]/);
});

test("D · sin la bandera, el modo global sigue comparando contra la línea base", () => {
  const { dir } = repoConHead(CON_DEUDA);
  const base = baseVacia(dir);
  // La base no tiene nada, así que TODO el árbol es alta. Con `--archivo` el
  // mismo escenario da verde; sin la bandera tiene que dar rojo, o el arreglo se
  // habría llevado puesto el trinquete del repo.
  const r = correr(dir, base, []);
  assert.equal(r.status, 1, "el trinquete global no puede haber cambiado de contrato");
  assert.match(r.stderr, /text-\[13px\]/, "el global sí informa la deuda pendiente");
});

test("E · archivo que no existe en HEAD: sus altas reales SÍ se detectan", () => {
  const { dir } = repoConHead(CON_DEUDA);
  const base = baseVacia(dir);
  const nuevo = "components/sunmi/nuevo.jsx";
  fs.writeFileSync(
    path.join(dir, nuevo),
    'export default function N(){\n  return <div className="text-[33px]">nuevo</div>;\n}\n'
  );

  const r = correr(dir, base, ["--archivo", nuevo]);
  assert.equal(r.status, 1, "un archivo nuevo con deuda adentro no puede pasar en silencio");
  assert.match(r.stderr, /text-\[33px\]/);
});

test("F · cambios que solo ELIMINAN deuda: silencio", () => {
  const { dir, ruta, escribir } = repoConHead(CON_DEUDA);
  const base = baseVacia(dir);
  escribir("export default function A(){\n  return <div>chau</div>;\n}\n");

  const r = correr(dir, base, ["--archivo", ruta]);
  assert.equal(r.status, 0, "sacar deuda no puede poner rojo");
});

test("y el mensaje dice contra QUÉ se comparó, no una frase que no se midió", () => {
  const { dir, ruta, escribir } = repoConHead(CON_DEUDA);
  const base = baseVacia(dir);
  escribir(CON_DEUDA.replace('text-[13px]', 'text-[13px] text-[21px]'));
  const r = correr(dir, base, ["--archivo", ruta]);
  // La frase vieja afirmaba algo que la medición no sostenía.
  assert.doesNotMatch(
    r.stderr,
    /esta edición de .* introdujo/,
    "volvió la frase que atribuía a la edición lo que solo se comparó contra la base"
  );
});

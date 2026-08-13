// NINGÚN ANDAMIO ENTRA AL REPO.
//
// ── POR QUÉ ES UN CANDADO Y NO UN CUIDADO ──────────────────────────────────
//
// Para fotografiar un componente aislado se monta una ruta descartable —
// `app/andamio-carrito/`, y van a venir más, porque el resto de las pantallas
// piden lo mismo—. Esa ruta es una PÁGINA DE LA APLICACIÓN: si entra al repo se
// construye y se despliega, con datos de mentira, en producción.
//
// Hasta acá eso lo sostenía acordarse de no commitearlo. Un hábito no sobrevive
// a la próxima sesión, y este repo ya tiene la cuenta de lo que cuestan los
// hábitos: el comentario que esquivaba al contador, el `git add -A`, el clon sin
// identidad. Con esto el andamio se puede usar sin cuidarlo.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("NO HAY NINGÚN ANDAMIO TRACKEADO EN app/", () => {
  // `git ls-files` lista lo TRACKEADO, que es exactamente la pregunta: un
  // andamio sin trackear en el árbol está bien y es lo normal mientras dura una
  // migración. Lo que no puede pasar es que quede commiteado.
  const trackeados = execSync("git ls-files app", { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => /^app\/andamio-/.test(l));

  assert.deepEqual(
    trackeados,
    [],
    "hay un andamio commiteado: es una ruta de la aplicación y se desplegaría con datos de mentira.\n  " +
      trackeados.join("\n  ")
  );
});

test("EL CANDADO SABE MIRAR: encuentra las rutas que sí están", () => {
  // Un `git ls-files` mal escrito devuelve vacío y parece un verde. Se comprueba
  // que el comando enumera de verdad antes de creerle al cero.
  const todas = execSync("git ls-files app", { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  assert.ok(todas.length > 100, `solo enumeró ${todas.length} archivos de app/: revisá el comando`);
  assert.ok(
    todas.some((l) => l.endsWith("page.jsx")),
    "no aparece ninguna página: el enumerado no está mirando lo que cree"
  );
});

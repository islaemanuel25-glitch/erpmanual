// EL AVISO DE MIGRACIONES PENDIENTES TIENE QUE SEGUIR SIENDO ALCANZABLE.
//
// `docs/deploy/MIGRACIONES-SIN-APLICAR.md` es donde el paso 0 de `/deploy` se
// entera de que la tanda trae migraciones ANTES de sacar el backup. Todo su
// valor está en que alguien lo LEA en ese momento, y eso depende de dos punteros
// —el skill y el checklist— que no los ejercita nadie.
//
// Un puntero roto no rompe nada: el despliegue sigue andando y el clasificador
// del paso 4 igual encuentra la migración. Lo que se pierde es enterarse
// temprano, que es justamente lo que el archivo existe para dar. Es la forma
// exacta de un candado que mira el lugar equivocado — anda todo, y la defensa no
// está.
//
// Esto NO afirma que la lista esté al día: eso no se puede saber sin preguntarle
// a producción. Afirma que el camino hasta ella no se cortó.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const ARCHIVO = "docs/deploy/MIGRACIONES-SIN-APLICAR.md";

test("el archivo de migraciones sin aplicar existe", () => {
  assert.ok(
    fs.existsSync(path.join(RAIZ, ARCHIVO)),
    `${ARCHIVO} no está: el paso 0 de /deploy apunta a un archivo que no existe`
  );
});

test("el paso 0 de /deploy lo nombra, y el enlace resuelve", () => {
  const skill = fs.readFileSync(
    path.join(RAIZ, ".claude/skills/deploy/SKILL.md"), "utf8"
  );
  assert.match(
    skill, /MIGRACIONES-SIN-APLICAR\.md/,
    "el skill de deploy dejó de nombrar el archivo: nadie lo va a leer antes del backup"
  );

  // El enlace es relativo y el skill vive tres niveles abajo de la raíz. Se
  // resuelve de verdad en vez de comparar la cadena: un `../` de más se lee
  // igual de bien y apunta a la nada.
  const enlace = skill.match(/\]\(([^)]*MIGRACIONES-SIN-APLICAR\.md)\)/);
  assert.ok(enlace, "el archivo se nombra pero no hay enlace que lleve hasta él");
  const destino = path.resolve(RAIZ, ".claude/skills/deploy", enlace[1]);
  assert.ok(
    fs.existsSync(destino),
    `el enlace del skill no resuelve: ${enlace[1]}`
  );
});

test("y el checklist de release también lleva hasta él", () => {
  const checklist = fs.readFileSync(
    path.join(RAIZ, "docs/RELEASE-CHECKLIST.md"), "utf8"
  );
  const enlace = checklist.match(/\]\(([^)]*MIGRACIONES-SIN-APLICAR\.md)\)/);
  assert.ok(enlace, "el checklist no enlaza el archivo de migraciones pendientes");
  const destino = path.resolve(RAIZ, "docs", enlace[1]);
  assert.ok(
    fs.existsSync(destino),
    `el enlace del checklist no resuelve: ${enlace[1]}`
  );
});

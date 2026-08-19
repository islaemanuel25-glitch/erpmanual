// EL AVISO DE TANDAS FRENADAS TIENE QUE SEGUIR SIENDO ALCANZABLE.
//
// `docs/deploy/TANDAS-BLOQUEADAS.md` es donde el paso 0 de `/deploy` se entera de
// que un commit del rango NO tiene que salir. Todo su valor está en que alguien
// lo LEA en ese momento, y eso depende de dos punteros —el skill y el checklist—
// que no los ejercita nadie.
//
// Un puntero roto no rompe nada: el despliegue sigue andando, el paso 0 sigue
// dando luz verde y los cinco valores del paso 5 siguen coincidiendo. Lo que se
// pierde es lo único que este archivo aporta, que es la INTENCIÓN — y se pierde
// en silencio. Es la forma exacta de un candado que mira el lugar equivocado:
// anda todo, y la defensa no está.
//
// Y acá pesa más que en el de migraciones, porque no hay red debajo: al
// clasificador del paso 4 una migración no se le escapa, pero **no existe ningún
// mecanismo que detecte una tanda frenada.** Si el puntero se rompe, lo único
// que queda es que alguien se acuerde — que es exactamente lo que pasó el
// 2026-08-19 y el motivo por el que este archivo se escribió.
//
// Esto NO afirma que la lista esté al día: eso no se puede saber sin preguntarle
// a Emanuel qué está aprobado. Afirma que el camino hasta ella no se cortó.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const ARCHIVO = "docs/deploy/TANDAS-BLOQUEADAS.md";

test("el archivo de tandas bloqueadas existe", () => {
  assert.ok(
    fs.existsSync(path.join(RAIZ, ARCHIVO)),
    `${ARCHIVO} no está: el paso 0 de /deploy apunta a un archivo que no existe`
  );
});

test("el paso 0 de /deploy lo nombra, y el enlace resuelve", () => {
  const skill = fs.readFileSync(path.join(RAIZ, ".claude/skills/deploy/SKILL.md"), "utf8");
  assert.match(
    skill,
    /TANDAS-BLOQUEADAS\.md/,
    "el skill de deploy dejó de nombrar el archivo: nadie lo va a leer antes de desplegar"
  );

  // El enlace es relativo y el skill vive tres niveles abajo de la raíz. Se
  // resuelve de verdad en vez de comparar la cadena: un `../` de más se lee igual
  // de bien y apunta a la nada.
  const enlace = skill.match(/\]\(([^)]*TANDAS-BLOQUEADAS\.md)\)/);
  assert.ok(enlace, "el archivo se nombra pero no hay enlace que lleve hasta él");
  const destino = path.resolve(RAIZ, ".claude/skills/deploy", enlace[1]);
  assert.ok(fs.existsSync(destino), `el enlace del skill no resuelve: ${enlace[1]}`);
});

test("y el checklist de release también lleva hasta él", () => {
  const checklist = fs.readFileSync(path.join(RAIZ, "docs/RELEASE-CHECKLIST.md"), "utf8");
  const enlace = checklist.match(/\]\(([^)]*TANDAS-BLOQUEADAS\.md)\)/);
  assert.ok(enlace, "el checklist no enlaza el archivo de tandas bloqueadas");
  const destino = path.resolve(RAIZ, "docs", enlace[1]);
  assert.ok(fs.existsSync(destino), `el enlace del checklist no resuelve: ${enlace[1]}`);
});

test("la sección que vale aunque la lista esté vacía sigue estando", () => {
  // "Empujado no es desplegado" es lo que hace que este archivo sirva incluso sin
  // ningún bloqueo vigente. Si alguien lo vacía entero por estar sin entradas, el
  // archivo queda sin lo único que aporta siempre.
  const doc = fs.readFileSync(path.join(RAIZ, ARCHIVO), "utf8");
  assert.match(doc, /EMPUJADO NO ES DESPLEGADO/i, "se fue la sección que explica por qué el paso 0 no alcanza");
  assert.match(doc, /Bloqueos vigentes/i, "se fue la sección donde se anotan los bloqueos");
});

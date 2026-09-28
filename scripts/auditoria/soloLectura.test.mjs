// LOS SCRIPTS DE `scripts/auditoria/` NO ESCRIBEN. NUNCA.
//
// ── POR QUÉ HACE FALTA AFIRMARLO ───────────────────────────────────────────
//
// Porque son los únicos scripts del repo pensados para correr CONTRA
// PRODUCCIÓN. La fábrica de Prisma ya impide que un nivel de escritura apunte a
// un host que no sea local, así que el daño directo está atajado — pero el nivel
// lo pide el script, y nada impedía que mañana alguien le pusiera ESCRITURA a
// uno de éstos "para arreglar de paso los dos costos que encontró".
//
// Ese "de paso" es exactamente lo que este candado prohíbe. Una auditoría que
// además corrige deja de ser una auditoría: no se puede correr sin miedo, y el
// paso de `/deploy` que la ejecuta pasa a ser un paso que modifica producción.
//
// ── QUÉ MIRA, Y POR QUÉ ASÍ ────────────────────────────────────────────────
//
// El texto del fuente, con los comentarios SACADOS ANTES de mirar: estos
// archivos explican en prosa qué es lo que no hacen —"NO ESCRIBE NADA", "ni un
// solo `update`"— y sin sacarlos el candado encontraría esas palabras y se
// pondría en rojo por leer la explicación. Es el falso positivo que este repo ya
// pisó tres veces.
//
// Se enumera la carpeta en vez de nombrar archivos, y con
// `--cached --others --exclude-standard`: un script de auditoría recién escrito
// y sin commitear tiene que entrar en la cuenta, que es justo cuando se lo está
// escribiendo.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test scripts/auditoria/soloLectura.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(import.meta.dirname, "../..");

const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function scriptsDeAuditoria() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "scripts/auditoria"],
    { cwd: RAIZ, encoding: "utf8" }
  );
  return salida
    .split("\n")
    .filter((p) => p.endsWith(".mjs") && !p.endsWith(".test.mjs"));
}

/** Las llamadas de Prisma que escriben. Son todas las que existen. */
const ESCRITURAS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "executeRaw",
  "executeRawUnsafe",
  // Con el `$`, que es como los llama Prisma. Sin estas dos, un
  // `db.$executeRawUnsafe("UPDATE …")` pasaba en verde: las de arriba buscan
  // `.executeRaw(` y el `$` en el medio hacía que no coincidieran nunca. Lo
  // encontró la contraprueba de `scripts/pruebas-db/auditoriaKgPorPieza.mjs`,
  // donde la huella de las tablas sí vio la escritura.
  "$executeRaw",
  "$executeRawUnsafe",
  "$transaction",
];

test("la enumeración encuentra los scripts de auditoría", () => {
  // CONTRA LA ENUMERACIÓN VACÍA: sin esto, el día que la carpeta se renombre
  // este archivo quedaría verde recorriendo una lista de cero.
  const scripts = scriptsDeAuditoria();
  assert.ok(scripts.length > 0, "no se encontró ningún script en scripts/auditoria/");
});

test("NINGÚN script de auditoría llama a algo que escriba", () => {
  for (const ruta of scriptsDeAuditoria()) {
    const fuente = sinComentarios(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));
    for (const metodo of ESCRITURAS) {
      const re = new RegExp(`\\.\\s*${metodo.replace("$", "\\$")}\\s*\\(`);
      assert.ok(
        !re.test(fuente),
        `${ruta} llama a \`.${metodo}(\`. Los scripts de auditoría corren contra ` +
          `PRODUCCIÓN: no pueden escribir. Si hay algo que corregir, se corrige ` +
          `desde la aplicación o con una migración.`
      );
    }
  }
});

test("TODOS piden el cliente en nivel LECTURA", () => {
  // Es la otra mitad: sin llamadas de escritura pero con nivel ESCRITURA, el
  // script seguiría siendo inofensivo hoy y una línea nueva bastaría mañana.
  // Además LECTURA es el único nivel que la fábrica deja apuntar a un host
  // remoto, así que pedir otro también rompería el uso previsto.
  for (const ruta of scriptsDeAuditoria()) {
    const fuente = sinComentarios(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));
    assert.match(
      fuente,
      /crearClientePrisma\(\s*\{\s*nivel:\s*LECTURA/,
      `${ruta} no pide el cliente con \`nivel: LECTURA\`.`
    );
    assert.ok(
      !/\bESCRITURA\b|\bDESTRUCTIVO\b/.test(fuente),
      `${ruta} nombra un nivel que puede escribir.`
    );
  }
});

test("CONTRAPRUEBA: el analizador ve las escrituras y no ve los comentarios", () => {
  // Un `assert.ok(!re.test(...))` con la expresión mal escrita pasa en verde
  // sobre cualquier cosa. Acá se comprueba que encuentra lo que busca...
  const malo = "await db.productoBase.update({ where: { id } });";
  assert.ok(/\.\s*update\s*\(/.test(sinComentarios(malo)));
  assert.ok(/\.\s*\$transaction\s*\(/.test(sinComentarios("await db.$transaction([])")));
  // Y las escrituras crudas con su nombre real, que es el agujero que tuvo.
  for (const metodo of ["$executeRaw", "$executeRawUnsafe"]) {
    const re = new RegExp(`\\.\\s*${metodo.replace("$", "\\$")}\\s*\\(`);
    assert.ok(re.test(`await db.${metodo}('UPDATE "Local" SET "nombre" = "nombre"');`), `no ve ${metodo}`);
  }
  // ...y que la prosa NO cuenta, que es la trampa de este repo: los tres
  // archivos de auditoría explican en comentarios que no hacen un `update`.
  assert.equal(sinComentarios("// no hace ningún update(\nconst x = 1;").includes("update("), false);
});

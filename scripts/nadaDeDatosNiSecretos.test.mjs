// NI DATOS DE LA BASE NI SECRETOS ENTRAN AL REPOSITORIO.
//
// ── DE DÓNDE SALE ESTE CANDADO ─────────────────────────────────────────────
//
// De un incidente, no de una buena práctica. El repositorio estuvo PÚBLICO
// desde el 23/11/2025 hasta el 17/09/2026, y en su PRIMER COMMIT entró
// `pgdata/`: el directorio de datos de PostgreSQL entero, 71,5 MB, con los
// datos de las tablas del negocio, un hash SCRAM del rol de la base y 34 hashes
// bcrypt de las contraseñas de los usuarios. Se sacó del árbol recién en
// febrero, y sigue en el historial —eso se limpia aparte, ver
// `docs/seguridad/limpieza-historial.md`—.
//
// Nadie lo notó durante diez meses. Eso es lo que este archivo existe para
// cambiar.
//
// ── POR QUÉ NO ALCANZA CON EL `.gitignore` ─────────────────────────────────
//
// Porque el `.gitignore` NO DESINDEXA lo que ya está adentro. Un archivo
// trackeado sigue trackeado aunque una regla lo nombre, y sus cambios se siguen
// commiteando sin una sola advertencia. Fue exactamente lo que pasó: `pgdata/`
// entró en noviembre, la regla que lo ignora se agregó en febrero, y entre esas
// dos fechas hubo veinte commits que lo llevaban.
//
// Así que este candado NO mira el `.gitignore`: mira LO QUE ESTÁ TRACKEADO, que
// es la única pregunta que importa. Y mira aparte que las reglas existan, que es
// lo que evita que el próximo archivo entre.
//
// ── CÓMO ENUMERA, Y POR QUÉ ASÍ ────────────────────────────────────────────
//
// `git ls-files --cached --others --exclude-standard`, que es la regla del repo:
// `--cached` es lo trackeado y `--others --exclude-standard` es lo que está en
// la carpeta sin ignorar. Sin la segunda mitad, un volcado recién escrito y
// todavía sin commitear daría VERDE hoy y rojo en la tanda siguiente —cuando ya
// está commiteado y ya se empujó—, que es la peor forma del problema.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test scripts/nadaDeDatosNiSecretos.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(import.meta.dirname, "..");

/**
 * Todo lo que el repo tiene HOY: trackeado más lo no ignorado.
 *
 * Las banderas no son opcionales — ver el encabezado.
 */
function loQueElRepoTiene() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return salida.split("\n").filter(Boolean);
}

/**
 * LO QUE NO PUEDE ESTAR, con su motivo y sus excepciones.
 *
 * Cada entrada dice POR QUÉ, porque un candado que solo prohíbe termina
 * desactivado por el primero que necesita la excepción y no entiende el riesgo.
 */
const PROHIBIDO = [
  {
    nombre: "el directorio de datos de PostgreSQL",
    prueba: (p) => p === "pgdata" || p.startsWith("pgdata/"),
    porque:
      "`pgdata/` es la base entera: datos de las tablas y hashes de contraseña. " +
      "Es lo que estuvo público diez meses.",
    excepciones: [],
  },
  {
    nombre: "volcados y respaldos de la base",
    prueba: (p) => /\.(sql|dump|bak|backup)$/i.test(p),
    porque:
      "Un `.sql` o un `.dump` suelto es un volcado: trae filas reales. Las " +
      "migraciones de Prisma son la excepción, y son DDL, no datos.",
    excepciones: [
      // Las migraciones son DDL versionado: son el cambio de esquema, no filas.
      (p) => p.startsWith("prisma/migrations/"),
      (p) => p.startsWith("tests/migraciones/"),
      // Scripts de mantenimiento: SQL escrito a mano, sin datos adentro. Van
      // nombrados uno por uno y no por carpeta, para que agregar otro obligue a
      // mirarlo.
      (p) => p === "scripts/limpieza-turnos-abandonados.sql",
      // El diagnóstico y el precheck de la recuperación de libro_stock: SQL de
      // SOLO LECTURA (transacción READ ONLY que termina en ROLLBACK) que lee
      // catálogos y `_prisma_migrations`. No trae una sola fila de datos.
      (p) => p === "scripts/deploy/diagnostico-recuperacion-libro-stock.sql",
      (p) => p === "scripts/deploy/precheck-libro-stock.sql",
    ],
  },
  {
    nombre: "archivos de variables de entorno",
    prueba: (p) => path.basename(p).startsWith(".env"),
    porque:
      "Un `.env` trae la contraseña de la base, la frase de los backups y las " +
      "claves de las APIs. El ejemplo se versiona; el de verdad no.",
    excepciones: [(p) => /\.example$/i.test(p)],
  },
  {
    nombre: "claves y certificados",
    prueba: (p) => /\.(pem|key|p12|pfx|jks|keystore)$/i.test(p) || /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/.test(p),
    porque: "Una clave privada en el repo es una clave quemada.",
    excepciones: [],
  },
];

const permitido = (regla, ruta) => regla.excepciones.some((e) => e(ruta));

test("LA ENUMERACIÓN ENCUENTRA EL REPO", () => {
  // CONTRA LA ENUMERACIÓN VACÍA: si `git ls-files` dejara de contestar, todo lo
  // de abajo daría verde recorriendo una lista de cero. Ya pasó en este repo con
  // otros censos.
  const todo = loQueElRepoTiene();
  assert.ok(todo.length > 500, `la enumeración devolvió ${todo.length} archivos`);
  assert.ok(todo.includes("package.json"), "no aparece package.json: la enumeración no es del repo");
});

test("NO HAY DATOS DE LA BASE NI SECRETOS, NI TRACKEADOS NI SIN IGNORAR", () => {
  const todo = loQueElRepoTiene();
  const hallazgos = [];

  for (const ruta of todo) {
    for (const regla of PROHIBIDO) {
      if (!regla.prueba(ruta)) continue;
      if (permitido(regla, ruta)) continue;
      hallazgos.push(`  ${ruta}\n      → ${regla.nombre}. ${regla.porque}`);
    }
  }

  assert.deepEqual(
    hallazgos,
    [],
    "Entró al repositorio algo que no puede estar:\n" +
      hallazgos.join("\n") +
      "\n\n  Si es un archivo de trabajo, agregalo al .gitignore y sacalo del índice " +
      "con `git rm --cached <ruta>`. Si creés que es una excepción legítima, " +
      "agregala a PROHIBIDO en este archivo, con su motivo escrito."
  );
});

test("LAS REGLAS DEL .gitignore ESTÁN, para que el PRÓXIMO no entre", () => {
  // La otra mitad. El censo de arriba dice que hoy no hay nada; esto dice que
  // mañana git lo va a frenar solo, sin depender de que alguien mire.
  const gi = fs.readFileSync(path.join(RAIZ, ".gitignore"), "utf8");
  const lineas = gi.split("\n").map((l) => l.trim());

  for (const regla of ["pgdata/", "*.sql", "*.dump", "*.backup", ".env*"]) {
    assert.ok(lineas.includes(regla), `falta la regla \`${regla}\` en .gitignore`);
  }
});

test("Y LAS MIGRACIONES SIGUEN SIENDO VISIBLES, que es la mitad que se olvida", () => {
  // ── EL DAÑO QUE ESTE CANDADO ATAJA ──────────────────────────────────────
  //
  // `*.sql` ignora también `prisma/migrations/**/migration.sql`. Si las
  // negaciones se cayeran, la PRÓXIMA migración que alguien escriba no
  // aparecería en `git status`: se commitearía la tanda sin ella y el
  // despliegue correría contra una base sin la columna.
  //
  // Y no se vería hasta la migración siguiente, porque el `.gitignore` no
  // desindexa las que ya están trackeadas. Por eso se prueba con una RUTA
  // NUEVA, que es el caso que falla.
  const nueva = "prisma/migrations/29990101000000_candado/migration.sql";
  const ignorada = (ruta) => {
    try {
      execFileSync("git", ["check-ignore", "-q", "--no-index", ruta], { cwd: RAIZ });
      return true;
    } catch {
      return false;
    }
  };

  assert.equal(ignorada(nueva), false, `una migración NUEVA quedaría ignorada: ${nueva}`);
  assert.equal(ignorada("tests/migraciones/29990101000000_x/migration.sql"), false);

  // CONTRAPRUEBA: el chequeo distingue de verdad. Si `check-ignore` contestara
  // que no a todo, los dos asserts de arriba pasarían sin probar nada.
  assert.equal(ignorada("volcado-de-la-base.sql"), true, "un .sql suelto TIENE que ignorarse");
  assert.equal(ignorada(".env.produccion"), true, "un .env TIENE que ignorarse");
  assert.equal(ignorada(".env.example"), false, "el ejemplo NO se ignora: es lo que se versiona");
});

test("pgdata NO volvió al repo — el archivo que originó todo esto", () => {
  // Redundante con el censo a propósito: es el caso concreto, con nombre, y un
  // candado que lo nombra es el que alguien lee cuando vuelve a pasar.
  //
  // Usa la MISMA enumeración que el censo, y no un `--cached` a secas, por dos
  // razones. La primera es la regla del repo —enumerar sin ver lo no commiteado
  // da verde sin haber mirado— y hay un candado que la hace valer. La segunda es
  // que `--cached` ya está adentro de esa enumeración: un archivo trackeado Y
  // ADEMÁS ignorado, que es exactamente lo que pasó entre febrero y septiembre,
  // aparece igual. No se pierde nada y se gana ver el que todavía no se commiteó.
  const hay = loQueElRepoTiene().filter((p) => p === "pgdata" || p.startsWith("pgdata/"));
  assert.deepEqual(hay.slice(0, 5), [], `pgdata/ volvió al repo (${hay.length} archivos)`);
});

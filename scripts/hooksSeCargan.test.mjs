// UN HOOK QUE NO PUEDE CARGARSE NO AVISA: EL COMANDO PASA IGUAL.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/hooksSeCargan.test.mjs
//
// ── EL DEFECTO QUE ESTE CANDADO CIERRA, CON SU FECHA ──────────────────────
//
// El 2026-09-15 se desplegó a producción con la guardia de migraciones MUERTA,
// y nadie se enteró hasta buscarlo a propósito después del despliegue.
//
// `scripts/hook-guardia-migraciones.mjs` importaba
// `lib/deploy/guardiaMigraciones.js`. Ese archivo tiene sintaxis de módulo ES y
// se llamaba `.js`; como este `package.json` no declara `"type": "module"`, un
// `.js` es CommonJS. Node 20 lo disimula —reparsea como ESM y sigue— pero
// **node 18 no**, y el node del sistema del VPS es 18.
//
// O sea que la guardia andaba en la CI y en el entorno de pruebas, y estaba
// muerta justo en la máquina desde la que se despliega. El hook salía con código
// 1 antes de tener una opinión, y un PreToolUse que sale con 1 no bloquea nada.
//
// **Falló ABIERTA.** Es la peor forma: el control se lee como presente, no tarda
// más, no deja rastro, y el que despliega cree que algo lo está mirando.
//
// El hermano que sí andaba lo prueba: `hook-trinquete-hardcodeo.mjs` importa
// `contador.mjs` y carga con los dos nodes. La diferencia era la extensión.
//
// ── POR QUÉ NO ALCANZA CON CORRER EL HOOK Y VER QUE ANDA ──────────────────
//
// Porque la suite corre con node 20, donde el defecto NO se reproduce. Un
// candado que solo ejecutara el hook habría estado en verde todo el tiempo,
// mientras el VPS quedaba sin guardia: la forma del entorno de prueba no es la
// del entorno real, que es el defecto que `CLAUDE.md` marca como el que más se
// repite.
//
// Por eso lo que se afirma acá es la CAUSA y no el síntoma: que ningún hook
// alcance, siguiendo sus imports, un `.js` con sintaxis de módulo ES. Eso se
// mide leyendo archivos y da lo mismo con qué node corra la suite.
//
// Y arriba de eso van las dos afirmaciones de comportamiento: que los hooks
// declarados carguen con el node de HOY, y que la guardia DENIEGUE cuando su
// módulo no se puede cargar — que es el arreglo de fondo, porque la próxima vez
// no va a ser una extensión.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const SETTINGS = path.join(RAIZ, ".claude", "settings.json");

/**
 * Los hooks se LEEN de la configuración, no se escriben acá.
 *
 * Una lista a mano se desactualiza el día que alguien registra el tercero, y ese
 * tercero sería justamente el que nadie está mirando. La fuente de verdad es el
 * archivo que Claude Code lee.
 */
function hooksDeclarados() {
  const cfg = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  const salida = [];
  for (const [evento, grupos] of Object.entries(cfg.hooks ?? {})) {
    for (const grupo of grupos ?? []) {
      for (const h of grupo.hooks ?? []) {
        // La ruta puede ir suelta (`node scripts/x.mjs`) o colgada de la raíz del
        // proyecto (`"$CLAUDE_PROJECT_DIR/scripts/x.mjs"`), que es como va la guardia
        // de migraciones desde el 2026-10-08.
        const m = /(?:^|\s|["']?\$\{?CLAUDE_PROJECT_DIR\}?\/)((?:scripts|\.claude)\/[\w./-]+\.mjs)/.exec(String(h.command ?? ""));
        if (m) salida.push({ evento, comando: h.command, ruta: m[1] });
      }
    }
  }
  return salida;
}

/** Los especificadores relativos que un archivo importa. */
function importsRelativos(contenido) {
  const out = [];
  const re = /(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g;
  let m;
  while ((m = re.exec(contenido)) !== null) out.push(m[1]);
  return out;
}

/**
 * ¿Este archivo dice CommonJS por su extensión y módulo ES por su contenido?
 *
 * Es la firma exacta del defecto. Un `.js` que de verdad es CommonJS
 * —`module.exports`— carga bien con los dos nodes y no tiene nada de malo: lo que
 * rompe es la contradicción entre el nombre y el adentro.
 */
function mienteLaExtension(archivo) {
  if (!archivo.endsWith(".js")) return false;
  const texto = fs.readFileSync(archivo, "utf8");
  // Los comentarios se sacan antes de mirar: un candado que busca texto encuentra
  // la prosa, y eso ya dio tres falsos en este repo — uno de ellos verde.
  const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return /^\s*export\s/m.test(codigo) || /^\s*import\s[\s\S]{0,200}?\sfrom\s/m.test(codigo);
}

/** Todo lo que un hook alcanza siguiendo sus imports relativos. */
function alcanzaDesde(entrada) {
  const vistos = new Set();
  const pila = [entrada];
  const alcanzados = [];
  while (pila.length) {
    const actual = pila.pop();
    if (vistos.has(actual) || !fs.existsSync(actual)) continue;
    vistos.add(actual);
    alcanzados.push(actual);
    const contenido = fs.readFileSync(actual, "utf8");
    for (const spec of importsRelativos(contenido)) {
      pila.push(path.resolve(path.dirname(actual), spec));
    }
  }
  return alcanzados;
}

// ── 1 · LA PREMISA, QUE SI CAMBIA DA VUELTA TODO LO DEMÁS ────────────────

test("H1 · este paquete NO declara type module, así que un .js es CommonJS", () => {
  // Todo lo que afirma este archivo cuelga de esto. Si alguien agrega
  // `"type": "module"`, la regla se invierte —los `.js` pasan a ser ESM— y estos
  // candados quedarían afirmando sobre un mundo que ya no existe. Mejor que se
  // ponga rojo y alguien lea, a que sigan verdes sin querer decir nada.
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  assert.equal(
    pkg.type,
    undefined,
    "cambió el tipo de módulo del paquete: revisar si este candado sigue diciendo la verdad"
  );
});

// ── 2 · LA CAUSA, MEDIDA SIN DEPENDER DEL NODE QUE CORRA ─────────────────

test("H2 · ningún hook alcanza un .js con sintaxis de módulo ES", () => {
  const hooks = hooksDeclarados();
  assert.ok(hooks.length > 0, "no se encontró ningún hook declarado: la lectura de settings.json se rompió");
  // Y la guardia tiene que estar entre los que se leyeron: si el patrón de
  // arriba deja de reconocer su forma, este candado seguiría verde sin mirarla.
  assert.ok(
    hooks.some((h) => h.ruta === "scripts/hook-guardia-migraciones.mjs"),
    `la guardia de migraciones no está entre los hooks leídos: ${JSON.stringify(hooks.map((h) => h.ruta))}`
  );

  const culpables = [];
  for (const hook of hooks) {
    const entrada = path.join(RAIZ, hook.ruta);
    assert.ok(fs.existsSync(entrada), `el hook declarado no existe en el disco: ${hook.ruta}`);
    for (const archivo of alcanzaDesde(entrada)) {
      if (mienteLaExtension(archivo)) {
        culpables.push(`${hook.ruta} → ${path.relative(RAIZ, archivo)}`);
      }
    }
  }

  assert.deepEqual(
    culpables,
    [],
    "un hook llega a un .js con sintaxis de módulo ES: con node 18 no carga y el comando pasa igual. " +
      "Renombralo a .mjs, como se hizo con lib/deploy/guardiaMigraciones.mjs"
  );
});

test("H3 · y el detector de verdad detecta", () => {
  // La contraprueba. Sin esto, H2 podría estar en verde porque la función no
  // encuentra nada nunca — que es exactamente el candado que acompaña en vez de
  // afirmar.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-detector-"));
  const malo = path.join(dir, "malo.js");
  const bueno = path.join(dir, "bueno.js");
  const disfrazado = path.join(dir, "disfrazado.js");

  fs.writeFileSync(malo, "export const x = 1;\n");
  fs.writeFileSync(bueno, "module.exports = { x: 1 };\n");
  // Un `.js` honesto cuyo COMENTARIO habla de exports no puede dar positivo.
  fs.writeFileSync(disfrazado, "// export const x = 1 vivía acá\nmodule.exports = { x: 2 };\n");

  assert.equal(mienteLaExtension(malo), true, "no detectó el caso que rompió la guardia");
  assert.equal(mienteLaExtension(bueno), false, "marcó un CommonJS legítimo");
  assert.equal(mienteLaExtension(disfrazado), false, "se comió un comentario como si fuera código");

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── 3 · Y QUE CARGUEN DE VERDAD, CON EL NODE DE HOY ──────────────────────

test("H4 · cada hook declarado carga y contesta, no se cae", () => {
  for (const hook of hooksDeclarados()) {
    const r = spawnSync(process.execPath, [path.join(RAIZ, hook.ruta)], {
      input: JSON.stringify({ tool_name: "Read", tool_input: {} }),
      encoding: "utf8",
      cwd: RAIZ,
      timeout: 60_000,
    });
    const err = String(r.stderr ?? "");
    assert.ok(
      !/SyntaxError|Cannot find|not found|ERR_MODULE/.test(err),
      `${hook.ruta} no pudo cargarse: ${err.split("\n").slice(0, 3).join(" | ")}`
    );
    assert.equal(r.status, 0, `${hook.ruta} salió con ${r.status}: ${err.split("\n")[0]}`);
  }
});

// ── 4 · Y SI IGUAL NO CARGA, QUE FRENE EN VEZ DE DEJAR PASAR ─────────────

test("H5 · la guardia DENIEGA cuando su módulo no se puede cargar", () => {
  // El arreglo de fondo, y el que importa para la próxima vez: la causa de 2026
  // fue una extensión, la que venga no va a serlo. Acá se rompe el módulo a
  // propósito y se comprueba que la guardia contesta "no pude comprobar" en vez
  // de no contestar nada.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardia-rota-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "lib", "deploy"), { recursive: true });
  fs.copyFileSync(
    path.join(RAIZ, "scripts", "hook-guardia-migraciones.mjs"),
    path.join(dir, "scripts", "hook-guardia-migraciones.mjs")
  );
  fs.writeFileSync(path.join(dir, "lib", "deploy", "guardiaMigraciones.mjs"), "esto no es válido {{{\n");

  const preguntar = (comando) => {
    const r = spawnSync(process.execPath, [path.join(dir, "scripts", "hook-guardia-migraciones.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: comando } }),
      encoding: "utf8",
      cwd: dir,
      timeout: 60_000,
    });
    return JSON.parse(String(r.stdout || "{}"));
  };

  const peligroso = preguntar(["pri", "sma db pu", "sh"].join(""));
  assert.equal(
    peligroso.hookSpecificOutput?.permissionDecision,
    "deny",
    "la guardia rota dejó pasar un comando de prisma: volvió a fallar ABIERTA"
  );
  assert.match(
    peligroso.hookSpecificOutput?.permissionDecisionReason ?? "",
    /NO SE PUDO CARGAR/,
    "denegó, pero no por el motivo que corresponde"
  );

  // Y la otra mitad: que la guardia rota no deje el repo sin poder correr nada.
  // Si bloqueara todo, se desactivaría en el primer minuto y volveríamos al
  // principio — una guardia que estorba siempre se termina apagando.
  const inofensivo = preguntar("ls -la");
  assert.equal(
    inofensivo.hookSpecificOutput?.permissionDecision,
    "allow",
    "la guardia rota bloqueó un comando que no le compete"
  );
  assert.match(
    inofensivo.hookSpecificOutput?.permissionDecisionReason ?? "",
    /NO SE PUDO CARGAR/,
    "dejó pasar sin decir que no había comprobado nada"
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

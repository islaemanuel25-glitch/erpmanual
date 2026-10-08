// LA GUARDIA DE MIGRACIONES: QUÉ REPOSITORIO CONSULTA Y QUÉ COPIA CORRE.
//
//   node --test scripts/guardiaRutasYEjecucion.test.mjs
//
// Dos defectos que aparecieron al querer activar el PR #151 en el VPS, el
// 2026-10-08, y que ninguno de los candados anteriores podía ver porque los dos
// viven ENTRE piezas:
//
// A · EL CLASIFICADOR CONSULTABA EL CLON EQUIVOCADO. Corría git sobre el árbol
//     donde vive el script —en el VPS, el clon de trabajo de Claude Code— y no
//     sobre /srv/produccion/erpazul. Un clon atrasado no tenía el SHA que
//     atiende: INDETERMINADO con el SHA válido. Y el destino era el HEAD de ese
//     clon, que no es lo que se despliega.
//
// B · EL HOOK SE RESOLVÍA CONTRA EL DIRECTORIO ACTUAL. `node scripts/…` en
//     settings.json corre en el directorio actual de la sesión, que se mueve con
//     cada `cd`. Comprobado con Claude Code 2.1.293: después de un `cd`, el hook
//     corrió en el directorio nuevo; con el archivo ausente, node salió con 1 y
//     el comando CORRIÓ IGUAL. Un PreToolUse solo bloquea con 2.
//
// Los candados de abajo usan repositorios git temporales y el comando LITERAL de
// .claude/settings.json corrido con `sh -c`, que es como lo corre Claude Code en
// Linux. No tocan ninguna base, no corren docker y no salen de /tmp.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planDeResolucion, shaDelAppImage, shaDeLaImagenAMigrar, SALIDA } from "./clasificar-migraciones.mjs";
import { decidirPorComando } from "../lib/deploy/guardiaMigraciones.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const CLASIFICADOR = path.join(AQUI, "clasificar-migraciones.mjs");

const ADITIVA = "ALTER TABLE \"Producto\" ADD COLUMN \"nota\" TEXT;\n";
const DESTRUCTIVA = "ALTER TABLE \"Producto\" DROP COLUMN \"nota\";\n";

// ── Andamios ───────────────────────────────────────────────────────────────

const temporal = (prefijo) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefijo)));

function git(repo, ...args) {
  const r = spawnSync("git", ["-C", repo, "-c", "user.name=prueba", "-c", "user.email=prueba@ejemplo", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Un repo git nuevo con un primer commit con ese nombre de paquete. */
function repoNuevo(prefijo, nombre = "erpmanual") {
  const repo = temporal(prefijo);
  git(repo, "init", "-q");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: nombre }));
  fs.mkdirSync(path.join(repo, "prisma", "migrations", "20260101000000_base"), { recursive: true });
  fs.writeFileSync(path.join(repo, "prisma", "migrations", "20260101000000_base", "migration.sql"), "CREATE TABLE \"Producto\" (id INT);\n");
  git(repo, "add", "-A");
  // El prefijo en el mensaje hace que dos repos "iguales" no compartan el SHA
  // del primer commit: con el mismo contenido y el mismo segundo, git les daría
  // el mismo, y el clon "sin historia común" la tendría.
  git(repo, "commit", "-q", "-m", `base ${prefijo}`);
  return repo;
}

/** Agrega una migración y commitea. Devuelve el SHA. */
function conMigracion(repo, nombre, sql) {
  fs.mkdirSync(path.join(repo, "prisma", "migrations", nombre), { recursive: true });
  fs.writeFileSync(path.join(repo, "prisma", "migrations", nombre, "migration.sql"), sql);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", nombre);
  return git(repo, "rev-parse", "HEAD");
}

/**
 * Producción: A es lo que atiende, B el release nuevo con una migración.
 * Y un clon de desarrollo con OTRA historia, que no tiene ni A ni B: el clon
 * atrasado del que corre Claude Code. El clasificador vive en el clon.
 */
function escenario(sqlDelRelease = DESTRUCTIVA) {
  const prod = repoNuevo("prod-erp-");
  const A = git(prod, "rev-parse", "HEAD");
  const B = conMigracion(prod, "20261008000000_release", sqlDelRelease);
  const clon = repoNuevo("clon-dev-");
  fs.mkdirSync(path.join(clon, "scripts"), { recursive: true });
  fs.copyFileSync(CLASIFICADOR, path.join(clon, "scripts", "clasificar-migraciones.mjs"));
  const clasificar = (args, cwd = clon) =>
    spawnSync(process.execPath, [path.join(clon, "scripts", "clasificar-migraciones.mjs"), ...args], { cwd, encoding: "utf8", timeout: 60_000 });
  const borrar = () => [prod, clon].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  return { prod, clon, A, B, clasificar, borrar };
}

// ── PROBLEMA A · El repositorio que se consulta ───────────────────────────

test("CASO 1/3 · desde un clon atrasado, sin decir el repositorio, el SHA de producción no está: INDETERMINADO, nombrando el clon", () => {
  const e = escenario();
  try {
    const r = e.clasificar(["--desde", e.A]);
    assert.equal(r.status, SALIDA.INDETERMINADO, r.stdout + r.stderr);
    assert.match(r.stderr, /no existe en/);
    assert.ok(r.stderr.includes(e.clon), "el motivo no dice en qué repositorio buscó");
  } finally {
    e.borrar();
  }
});

test("CASO 2/4 · con el repositorio de producción dicho, el SHA que atiende SÍ está y se clasifica ahí, se corra desde donde se corra", () => {
  const e = escenario();
  try {
    for (const cwd of [e.clon, "/", os.tmpdir(), e.prod]) {
      const r = e.clasificar(["--desde", e.A, "--repo", e.prod], cwd);
      assert.equal(r.status, SALIDA.MARCADO, `cwd ${cwd}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /20261008000000_release/);
      assert.ok(r.stdout.includes(e.prod), "la salida no dice qué repositorio consultó");
    }
  } finally {
    e.borrar();
  }
});

test("CASO 5 · el destino nuevo, todavía no desplegado, se lee DEL COMMIT: ni el árbol en otro commit ni un cambio sin commitear lo esconden", () => {
  const e = escenario(DESTRUCTIVA);
  try {
    // El checkout de producción quedó en A (el paso 1 no se hizo, o se volvió):
    // pidiendo el destino B a mano, la migración de B se ve igual.
    git(e.prod, "checkout", "-q", e.A);
    let r = e.clasificar(["--desde", e.A, "--hasta", e.B, "--repo", e.prod]);
    assert.equal(r.status, SALIDA.MARCADO, r.stdout + r.stderr);

    // Y con el árbol en B pero la migración "arreglada" sin commitear, lo que se
    // clasifica es lo que trae el commit —lo que trae la imagen—, no el disco.
    git(e.prod, "checkout", "-q", e.B);
    fs.writeFileSync(path.join(e.prod, "prisma", "migrations", "20261008000000_release", "migration.sql"), ADITIVA);
    r = e.clasificar(["--desde", e.A, "--repo", e.prod]);
    assert.equal(r.status, SALIDA.MARCADO, "clasificó el árbol de trabajo en vez del commit destino");
  } finally {
    e.borrar();
  }
});

test("CASO 5 bis · un release aditivo sale con 0, y un rango degenerado con 2", () => {
  const e = escenario(ADITIVA);
  try {
    assert.equal(e.clasificar(["--desde", e.A, "--repo", e.prod]).status, SALIDA.LIMPIO);
    const r = e.clasificar(["--desde", e.B, "--repo", e.prod]);
    assert.equal(r.status, SALIDA.INDETERMINADO);
    assert.match(r.stderr, /degenerado/);
  } finally {
    e.borrar();
  }
});

// ── EL REPOSITORIO DE PRODUCCIÓN, SE CORRA DESDE DONDE SE CORRA ────────────
//
// Los tres que pidió la tanda del 2026-10-08, con el clasificador corriendo
// desde un clon atrasado (otra historia, sin ningún SHA de producción) y
// consultando el repositorio de producción. En el servidor ese repositorio lo
// elige `planDeResolucion` (CASO 20); acá se dice con `--repo`, que es la misma
// variable del plan.

test("PRODUCCIÓN · SHA presente: se clasifica en el repo de producción aunque el clon no lo tenga", () => {
  const e = escenario(ADITIVA);
  try {
    // Contraprueba del escenario: el clon de verdad no tiene el SHA.
    assert.notEqual(spawnSync("git", ["-C", e.clon, "cat-file", "-e", `${e.A}^{commit}`]).status, 0);
    for (const cwd of [e.clon, "/"]) {
      const r = e.clasificar(["--desde", e.A, "--hasta", e.B, "--repo", e.prod], cwd);
      assert.equal(r.status, SALIDA.LIMPIO, `cwd ${cwd}: ${r.stdout}${r.stderr}`);
      assert.ok(r.stdout.includes(e.prod), "no dice que consultó producción");
    }
  } finally {
    e.borrar();
  }
});

test("PRODUCCIÓN · SHA ausente: frena con 2, dice qué pasó y qué hacer, y nunca imprime un rango", () => {
  const e = escenario(ADITIVA);
  try {
    const ausente = "0123456789abcdef0123456789abcdef01234567";
    const r = e.clasificar(["--desde", ausente, "--hasta", e.B, "--repo", e.prod]);
    assert.equal(r.status, SALIDA.INDETERMINADO, r.stdout + r.stderr);
    assert.ok(r.stderr.includes(`(${ausente}) no existe en ${e.prod}`), r.stderr);
    assert.match(r.stderr, /Qué hacer:/);
    assert.match(r.stderr, /No se autoriza a mano/);
    // Lo que nunca puede salir: un rango vacío que se lea como "pasó".
    assert.doesNotMatch(r.stdout, /Archivos a mirar|Sin coincidencias/);
  } finally {
    e.borrar();
  }
});

test("PRODUCCIÓN · el texto del SHA ausente, en el servidor, manda al paso 1 y no a la autorización", async () => {
  const { textoDeShaAusente } = await import("./clasificar-migraciones.mjs");
  const t = textoDeShaAusente({ repo: "/srv/produccion/erpazul", ref: "25172fe", rol: "origen" });
  assert.match(t, /git -C \/srv\/produccion\/erpazul fetch origin/);
  assert.doesNotMatch(t, /DEPLOY_MIGRACION_AUTORIZADA/);
});

test("PRODUCCIÓN · rango con UNA migración: la lista, la clasifica, y una destructiva frena", () => {
  for (const [sql, salida, etiqueta] of [
    [ADITIVA, SALIDA.LIMPIO, "aditiva"],
    [DESTRUCTIVA, SALIDA.MARCADO, "NO ADITIVA"],
  ]) {
    const e = escenario(sql);
    try {
      const r = e.clasificar(["--desde", e.A, "--hasta", e.B, "--repo", e.prod]);
      assert.equal(r.status, salida, r.stdout + r.stderr);
      assert.match(r.stdout, /Archivos a mirar: 1\n/);
      assert.match(r.stdout, new RegExp(`${etiqueta}\\s+prisma/migrations/20261008000000_release/migration.sql`));
    } finally {
      e.borrar();
    }
  }
});

test("PRODUCCIÓN · la migración que sigue, la receta de Dyssa, no marca nada", async () => {
  // Es la próxima a desplegar y tiene que pasar sin autorización manual. Su
  // `DO UPDATE SET` no empieza renglón, así que el patrón de UPDATE no la toca.
  const { clasificarSql } = await import("./clasificar-migraciones.mjs");
  const sql = fs.readFileSync(path.join(RAIZ, "prisma", "migrations", "20261008120000_receta_dyssa_iva_por_renglon", "migration.sql"), "utf8");
  assert.deepEqual(clasificarSql(sql), []);
});

test("CASO 10 · repositorio inexistente, relativo o que no es la raíz: INDETERMINADO, nunca se busca otro", () => {
  const e = escenario();
  try {
    for (const [repo, motivo] of [
      ["/no/existe/erpazul", /no existe/],
      ["prod-relativo", /ruta absoluta/],
      [path.join(e.prod, "prisma"), /no es la raíz/],
      [os.tmpdir(), /no es un repositorio git|no es la raíz/],
    ]) {
      const r = e.clasificar(["--desde", e.A, "--repo", repo]);
      assert.equal(r.status, SALIDA.INDETERMINADO, `${repo}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, motivo, repo);
    }
  } finally {
    e.borrar();
  }
});

test("CASO 11 · un repositorio que no es el del ERP (Azul Chat) no se clasifica, aunque tenga prisma/migrations", () => {
  const e = escenario();
  const azul = repoNuevo("azul-chat-", "azul-chat");
  try {
    const sha = git(azul, "rev-parse", "HEAD");
    const r = e.clasificar(["--desde", sha, "--repo", azul]);
    assert.equal(r.status, SALIDA.INDETERMINADO, r.stdout + r.stderr);
    assert.match(r.stderr, /no es del repo del ERP/);
  } finally {
    e.borrar();
    fs.rmSync(azul, { recursive: true, force: true });
  }
});

test("CASO 20 · nube y VPS: en el servidor `--vps` consulta /srv/produccion/erpazul y el destino es APP_IMAGE; fuera, este árbol y su HEAD", () => {
  const base = { raiz: "/home/x/clon", dirDespliegue: "/srv/produccion/erpazul" };
  assert.deepEqual(planDeResolucion({ ...base, modoVps: true, enVps: true }), {
    repo: "/srv/produccion/erpazul",
    origen: { tipo: "imagen-que-atiende" },
    destino: { tipo: "app-image", dir: "/srv/produccion/erpazul" },
  });
  assert.deepEqual(planDeResolucion({ ...base, modoVps: true, enVps: false }), {
    repo: "/home/x/clon",
    origen: { tipo: "imagen-que-atiende" },
    destino: { tipo: "head" },
  });
  // CAMBIÓ el 2026-10-08, por decisión de Emanuel: en el servidor el repositorio
  // es SIEMPRE el de producción, también en el modo manual. Antes este renglón
  // afirmaba lo contrario —con `--desde` se consultaba el clon— y fue lo que
  // dejó al deploy sin rango con el clon de trabajo atrasado. El destino del
  // modo manual sigue siendo el HEAD (o `--hasta`), no APP_IMAGE.
  assert.deepEqual(planDeResolucion({ ...base, modoVps: false, enVps: true, desde: "a" }), {
    repo: "/srv/produccion/erpazul",
    origen: { tipo: "explicito", valor: "a" },
    destino: { tipo: "head" },
  });
  // Lo explícito manda.
  const explicito = planDeResolucion({ ...base, modoVps: true, enVps: true, repo: "/otro", desde: "a", hasta: "b" });
  assert.deepEqual(explicito, { repo: "/otro", origen: { tipo: "explicito", valor: "a" }, destino: { tipo: "explicito", valor: "b" } });
});

test("CASO 5 ter · APP_IMAGE: un SHA de 40, una sola línea, y sin repetir nada más del .env", () => {
  const dir = temporal("despliegue-");
  const sha = "3ce5a15c69b140ded2fbeb2f2ce52925a1ad0b38";
  const escribir = (t) => fs.writeFileSync(path.join(dir, ".env"), t);
  try {
    for (const linea of [`APP_IMAGE=ghcr.io/islaemanuel25-glitch/erpmanual:${sha}`, `APP_IMAGE="ghcr.io/x/y:${sha}"`, `export APP_IMAGE = 'ghcr.io/x/y:${sha.toUpperCase()}'`]) {
      escribir(`POSTGRES_PASSWORD=SECRETO-NO-SE-IMPRIME\n${linea}\nOTRA=1\n`);
      assert.equal(shaDelAppImage(dir), sha, linea);
    }
    for (const malo of [
      "POSTGRES_PASSWORD=SECRETO-NO-SE-IMPRIME\n",
      "POSTGRES_PASSWORD=SECRETO-NO-SE-IMPRIME\nAPP_IMAGE=ghcr.io/x/y:latest\n",
      `POSTGRES_PASSWORD=SECRETO-NO-SE-IMPRIME\nAPP_IMAGE=ghcr.io/x/y:${sha}\nAPP_IMAGE=ghcr.io/x/y:${sha}\n`,
      "POSTGRES_PASSWORD=SECRETO-NO-SE-IMPRIME\nAPP_IMAGE=SECRETO-NO-SE-IMPRIME\n",
    ]) {
      escribir(malo);
      assert.throws(
        () => shaDelAppImage(dir),
        (e) => !String(e.message).includes("SECRETO-NO-SE-IMPRIME"),
        `con ${JSON.stringify(malo)} no frenó, o repitió el contenido del .env`
      );
    }
    fs.rmSync(path.join(dir, ".env"));
    assert.throws(() => shaDelAppImage(dir), /no se pudo leer/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── PROBLEMA B · Qué copia de la guardia corre ────────────────────────────

/** El comando de la guardia tal como está en .claude/settings.json. */
function comandoDeLaGuardia(settings = path.join(RAIZ, ".claude", "settings.json")) {
  const cfg = JSON.parse(fs.readFileSync(settings, "utf8"));
  const comandos = (cfg.hooks?.PreToolUse ?? [])
    .filter((g) => g.matcher === "Bash")
    .flatMap((g) => g.hooks ?? [])
    .map((h) => String(h.command ?? ""))
    .filter((c) => c.includes("hook-guardia-migraciones.mjs"));
  assert.equal(comandos.length, 1, "tiene que haber exactamente un hook de la guardia sobre Bash");
  return comandos[0];
}

/**
 * Un proyecto temporal con la guardia real y un clasificador FALSO que deja
 * marca y sale con lo que se le pida. `sin` saca archivos para simular una
 * instalación rota.
 */
function proyecto({ sin = [], clasificador = null } = {}) {
  const dir = temporal("proyecto-guardia-");
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "lib", "deploy"), { recursive: true });
  fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
  fs.copyFileSync(path.join(AQUI, "hook-guardia-migraciones.mjs"), path.join(dir, "scripts", "hook-guardia-migraciones.mjs"));
  for (const f of fs.readdirSync(path.join(RAIZ, "lib", "deploy"))) {
    if (f.endsWith(".mjs") && !f.endsWith(".test.mjs")) fs.copyFileSync(path.join(RAIZ, "lib", "deploy", f), path.join(dir, "lib", "deploy", f));
  }
  const marca = path.join(dir, "clasificador-llamado");
  fs.writeFileSync(
    path.join(dir, "scripts", "clasificar-migraciones.mjs"),
    clasificador ??
      `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marca)}, "1");\n` +
        `if (process.env.SALIDA_FALSA === "1") console.log("FRENO: 1 migración(es) marcada(s).");\n` +
        `process.exit(Number(process.env.SALIDA_FALSA ?? 0));\n`
  );
  for (const f of sin) fs.rmSync(path.join(dir, f), { force: true });

  /** Corre el comando de settings.json con `sh -c`, como Claude Code. */
  const preguntar = (command, { cwd = dir, salida = 0, proyectoDir = dir, comando = comandoDeLaGuardia(), crudo = null, entorno = {} } = {}) => {
    if (fs.existsSync(marca)) fs.rmSync(marca);
    const env = { ...process.env, SALIDA_FALSA: String(salida), ...entorno };
    if (proyectoDir === null) delete env.CLAUDE_PROJECT_DIR;
    else env.CLAUDE_PROJECT_DIR = proyectoDir;
    const r = spawnSync("sh", ["-c", comando], {
      // `crudo` manda el evento tal cual, para probar eventos mal formados.
      input: crudo ?? JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }),
      encoding: "utf8",
      cwd,
      env,
      timeout: 60_000,
    });
    let json = {};
    try {
      json = JSON.parse(String(r.stdout || "{}"));
    } catch {
      json = {};
    }
    const h = json.hookSpecificOutput ?? {};
    return {
      codigo: r.status,
      decision: h.permissionDecision ?? null,
      razon: h.permissionDecisionReason ?? "",
      aviso: json.systemMessage ?? "",
      stderr: String(r.stderr ?? ""),
      clasifico: fs.existsSync(marca),
    };
  };
  /** ¿Claude Code dejaría correr el comando? Bloquea un `exit 2` o un `deny`. */
  const bloquea = (r) => r.codigo === 2 || r.decision === "deny";
  return { dir, preguntar, bloquea, borrar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const ERP = "ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate deploy'";
const AZUL = "cd /srv/produccion/azul-chat && docker compose -f docker-compose.prod.yml run --rm --no-deps azul-chat-app prisma migrate deploy";
const DB_PUSH = ["npx prisma db", "push"].join(" ");

test("CASO 6 · el comando de settings.json usa la guardia del PROYECTO, desde cualquier directorio actual", () => {
  const p = proyecto();
  // Una copia vieja en otro directorio, que deja pasar todo: lo que pasaba al
  // hacer `cd` a otro checkout con la ruta relativa.
  const vieja = temporal("copia-vieja-");
  fs.mkdirSync(path.join(vieja, "scripts"));
  fs.writeFileSync(
    path.join(vieja, "scripts", "hook-guardia-migraciones.mjs"),
    `process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:"COPIA VIEJA"}}));\n`
  );
  try {
    for (const cwd of [p.dir, path.join(p.dir, "sub"), vieja, "/", os.tmpdir()]) {
      const r = p.preguntar(DB_PUSH, { cwd });
      assert.equal(r.decision, "deny", `desde ${cwd}: ${JSON.stringify(r)}`);
      assert.doesNotMatch(r.razon, /COPIA VIEJA/, `desde ${cwd} corrió la copia del directorio actual`);
    }
    // La forma vieja del comando, para que se vea el defecto que se cierra:
    // desde la copia vieja la usa, y desde otro lado no encuentra nada y pasa.
    const relativo = "node scripts/hook-guardia-migraciones.mjs";
    const desdeVieja = p.preguntar(DB_PUSH, { cwd: vieja, comando: relativo });
    assert.equal(desdeVieja.decision, "allow");
    assert.match(desdeVieja.razon, /COPIA VIEJA/);
    const desdeOtro = p.preguntar(DB_PUSH, { cwd: "/", comando: relativo });
    assert.equal(p.bloquea(desdeOtro), false, "con la ruta relativa, desde otro directorio, el comando pasaba");
  } finally {
    p.borrar();
    fs.rmSync(vieja, { recursive: true, force: true });
  }
});

test("CASO 7 · sin el archivo del hook (o sin CLAUDE_PROJECT_DIR): lo que nombra prisma se FRENA con 2, lo demás pasa avisando", () => {
  const p = proyecto({ sin: ["scripts/hook-guardia-migraciones.mjs"] });
  try {
    for (const proyectoDir of [p.dir, null]) {
      for (const cmd of [ERP, AZUL, DB_PUSH, "npx prisma migrate deploy"]) {
        const r = p.preguntar(cmd, { proyectoDir });
        assert.equal(r.codigo, 2, `${cmd} con CLAUDE_PROJECT_DIR=${proyectoDir}: ${JSON.stringify(r)}`);
        assert.match(r.stderr, /FRENADO: la guardia de migraciones no pudo correr/);
      }
      const ls = p.preguntar("ls -la", { proyectoDir });
      assert.equal(ls.codigo, 0);
      assert.equal(p.bloquea(ls), false);
      assert.match(ls.aviso, /GUARDIA DE MIGRACIONES ROTA/, "dejó pasar sin decir que la guardia no corrió");
    }
  } finally {
    p.borrar();
  }
});

test("CASO 8 · el hook mismo roto (sintaxis) frena con 2; su módulo roto frena con deny", () => {
  const p = proyecto();
  try {
    fs.writeFileSync(path.join(p.dir, "lib", "deploy", "guardiaMigraciones.mjs"), "esto no es válido {{{\n");
    let r = p.preguntar(ERP);
    assert.equal(r.decision, "deny");
    assert.match(r.razon, /NO SE PUDO CARGAR/);
    assert.equal(r.clasifico, false);

    fs.writeFileSync(path.join(p.dir, "scripts", "hook-guardia-migraciones.mjs"), "import { x } from './no-existe.mjs';\n");
    r = p.preguntar(ERP);
    assert.equal(r.codigo, 2, JSON.stringify(r));
    assert.equal(p.bloquea(p.preguntar("echo hola")), false);
  } finally {
    p.borrar();
  }
});

test("CASO 9 · sin clasificador, o con uno que se cae, se frena diciendo el motivo real (no 'migración marcada')", () => {
  const sinArchivo = proyecto({ sin: ["scripts/clasificar-migraciones.mjs"] });
  const caido = proyecto({ clasificador: "throw new Error('roto');\n" });
  const muerto = proyecto({ clasificador: "process.kill(process.pid, 'SIGKILL');\n" });
  try {
    let r = sinArchivo.preguntar(ERP);
    assert.equal(r.decision, "deny");
    assert.match(r.razon, /no existe el clasificador/);
    for (const p of [caido, muerto]) {
      r = p.preguntar(ERP);
      assert.equal(r.decision, "deny", JSON.stringify(r));
      assert.match(r.razon, /no terminó bien/);
      assert.doesNotMatch(r.razon, /hay al menos una migración que rompería/);
    }
  } finally {
    [sinArchivo, caido, muerto].forEach((p) => p.borrar());
  }
});

test("una copia de la guardia que no es la del proyecto de la sesión no decide sobre prisma", () => {
  const p = proyecto();
  const otro = temporal("otro-proyecto-");
  try {
    const comando = `node "${path.join(p.dir, "scripts", "hook-guardia-migraciones.mjs")}"`;
    const r = p.preguntar(ERP, { proyectoDir: otro, comando, salida: 0 });
    assert.equal(r.decision, "deny");
    assert.match(r.razon, /no es la del proyecto/);
    assert.equal(r.clasifico, false);
    assert.equal(p.preguntar("ls", { proyectoDir: otro, comando }).decision, "allow");
  } finally {
    p.borrar();
    fs.rmSync(otro, { recursive: true, force: true });
  }
});

test("CASOS 12 a 17 · por el comando de settings.json, la decisión del PR #151 sigue entera", () => {
  const p = proyecto();
  try {
    // 12: Azul Chat canónico pasa sin preguntarle al clasificador del ERP.
    let r = p.preguntar(AZUL, { salida: 2 });
    assert.equal(r.decision, "allow");
    assert.equal(r.clasifico, false);
    // 13: parecido y peligroso, frenado aunque el clasificador diga 0, y con autorización.
    for (const c of [AZUL.replace("--no-deps", "--no-deps -v=../erpazul/prisma:/app/prisma"), `DEPLOY_MIGRACION_AUTORIZADA=1 ${AZUL} --schema=x`]) {
      r = p.preguntar(c, { salida: 0 });
      assert.equal(r.decision, "deny", c);
      assert.equal(r.clasifico, false, c);
    }
    // 14: ERP con el clasificador en 0, pasa diciendo qué guardia corrió.
    r = p.preguntar(ERP, { salida: 0 });
    assert.equal(r.decision, "allow");
    assert.equal(r.clasifico, true);
    assert.match(r.razon, /Guardia efectiva: /);
    // 15: ERP INDETERMINADO, y marcado: frena.
    for (const salida of [1, 2]) {
      r = p.preguntar(ERP, { salida });
      assert.equal(r.decision, "deny", `salida ${salida}`);
    }
    assert.match(p.preguntar(ERP, { salida: 1 }).razon, /rompería/);
    assert.match(p.preguntar(ERP, { salida: 2 }).razon, /no pudo determinar/);
    // 16: autorización válida pasa sin clasificar; una inválida no autoriza.
    r = p.preguntar(`DEPLOY_MIGRACION_AUTORIZADA=1 ${ERP}`, { salida: 2 });
    assert.equal(r.decision, "allow");
    assert.equal(r.clasifico, false);
    r = p.preguntar(`DEPLOY_MIGRACION_AUTORIZADA=1x ${ERP}`, { salida: 2 });
    assert.equal(r.decision, "deny");
    // 17: dos proyectos en el mismo comando.
    r = p.preguntar(`${AZUL} && ${ERP}`, { salida: 0 });
    assert.equal(r.decision, "deny");
    assert.equal(r.clasifico, false);
  } finally {
    p.borrar();
  }
});

test("CASO 18 · LÍMITE CONOCIDO: un `migrate deploy` escondido no lo ve la guardia (texto), y por eso está escrito", () => {
  // No es un candado de que esto esté bien: es el registro de que NO está
  // cubierto. Si algún día la guardia lo frena, este candado se pone rojo y hay
  // que reescribirlo afirmando el freno. Está en el skill `/deploy`, "Esa
  // guardia NO hace obligatorio el chequeo", punto 5.
  const p = proyecto();
  try {
    const r = p.preguntar("docker compose -f docker-compose.prod.yml run --rm app prisma migrate $(echo deploy)", { salida: 2 });
    assert.equal(r.decision, "allow");
    assert.equal(r.clasifico, false);
  } finally {
    p.borrar();
  }
});

// ── LA SEGUNDA REVISIÓN DEL ENVOLTORIO — 2026-10-08 ───────────────────────
//
// El evento real de Claude Code 2.1.293 está comprobado: JSON de una línea con
// `tool_name`, `tool_input.command` (string), `cwd`, `session_id` y otros; las
// comillas y las barras invertidas van escapadas y las letras nunca. Lo de
// abajo prueba cada forma de evento y cada forma de fallar del hook, por el
// comando literal de settings.json. Criterio: lo que no se pudo interpretar no
// recibe una autorización para algo de prisma, y "frena" es `exit 2` o un
// `deny`; un aviso no cuenta.

/** Un evento de Bash como lo manda Claude Code. */
const eventoReal = (command, extra = {}) =>
  JSON.stringify({ session_id: "s", transcript_path: "/t.jsonl", cwd: "/x", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command, description: "d" }, tool_use_id: "u", ...extra });

/** Reemplaza el hook del proyecto por otro contenido. */
const conHook = (p, codigo) => fs.writeFileSync(path.join(p.dir, "scripts", "hook-guardia-migraciones.mjs"), codigo);

test("ENVOLTORIO A/B/C · un comando normal pasa; migrate deploy va al clasificador y db push se frena", () => {
  const p = proyecto();
  try {
    let r = p.preguntar("", { crudo: eventoReal("ls -la") });
    assert.equal(r.codigo, 0);
    assert.equal(r.decision, "allow");
    r = p.preguntar("", { crudo: eventoReal("npx prisma migrate deploy"), salida: 2 });
    assert.equal(r.decision, "deny");
    assert.equal(r.clasifico, true);
    r = p.preguntar("", { crudo: eventoReal(DB_PUSH) });
    assert.equal(r.decision, "deny");
  } finally {
    p.borrar();
  }
});

test("ENVOLTORIO D/H/I/J · un evento ininterpretable que nombra prisma se FRENA; si no la nombra, pasa diciendo que no miró", () => {
  const p = proyecto();
  try {
    for (const [nombre, crudo] of [
      ["D JSON roto", `{"tool_name":"Bash","tool_input":{"command":"npx prisma migrate deploy"`],
      ["H sin tool_input", `{"tool_name":"Bash","command":"npx prisma migrate deploy"}`],
      ["I sin command", `{"tool_name":"Bash","tool_input":{"description":"npx prisma db push"}}`],
      ["J command que no es texto", `{"tool_name":"Bash","tool_input":{"command":["npx","prisma","migrate","deploy"]}}`],
      ["J command número", `{"tool_name":"Bash","tool_input":{"command":7},"x":"prisma"}`],
      ["sin tool_name", `{"tool_input":{"command":"npx prisma db push"}}`],
      ["evento que no es objeto", `"npx prisma migrate deploy"`],
      ["null", "null prisma"],
    ]) {
      const r = p.preguntar("", { crudo, salida: 0 });
      assert.equal(p.bloquea(r), true, `${nombre}: ${JSON.stringify(r)}`);
      assert.equal(r.clasifico, false, nombre);
      assert.match(r.razon, /no pudo interpretar|no se pudo/, nombre);
    }
    for (const crudo of [`{"tool_name":"Bash","tool_input":{"command":"ls"`, `{"tool_name":"Bash"}`, "null"]) {
      const r = p.preguntar("", { crudo });
      assert.equal(r.decision, "allow", crudo);
      assert.match(r.razon, /no se comprobó nada/, crudo);
    }
  } finally {
    p.borrar();
  }
});

test("ENVOLTORIO E/F/G · escapes, comillas, barras y saltos de línea: el hook decodifica el JSON y frena igual", () => {
  const p = proyecto();
  try {
    for (const crudo of [
      // E: escapes Unicode. Claude Code no los usa para letras, pero si llegan, JSON.parse los decodifica.
      `{"tool_name":"Bash","tool_input":{"command":"npx pri\\u0073ma db push"}}`,
      `{"tool_name":"Bash","tool_input":{"command":"npx \\u0070risma db \\u0070ush"}}`,
      // F: comillas y barras invertidas alrededor.
      eventoReal(`echo "a\\b" 'c"d' && ${DB_PUSH}`),
      // G: saltos de línea, escapados como los manda Claude Code.
      eventoReal(`ls\n${DB_PUSH}\necho fin`),
      eventoReal(`ls\r\n  ${DB_PUSH}`),
    ]) {
      const r = p.preguntar("", { crudo });
      assert.equal(r.decision, "deny", crudo);
    }
  } finally {
    p.borrar();
  }
});

test("ENVOLTORIO E-LÍMITE · con el hook caído, la red de último recurso busca el TEXTO crudo: un escape \\u la esquiva", () => {
  // Registrado, no cubierto. Claude Code 2.1.293 no escapa letras (comprobado),
  // así que hoy el evento real trae "prisma" literal; pero la red no decodifica
  // JSON —es `grep` sobre lo que llega— y no se va a escribir un parser en sh.
  const p = proyecto({ sin: ["scripts/hook-guardia-migraciones.mjs"] });
  try {
    assert.equal(p.preguntar("", { crudo: eventoReal(DB_PUSH) }).codigo, 2);
    const escapado = p.preguntar("", { crudo: `{"tool_name":"Bash","tool_input":{"command":"npx pri\\u0073ma db push"}}` });
    assert.equal(p.bloquea(escapado), false);
    assert.match(escapado.aviso, /GUARDIA DE MIGRACIONES ROTA/);
  } finally {
    p.borrar();
  }
});

test("ENVOLTORIO K/L/N/O · hook ausente, que sale con 1, que no importa, o que sale con 0 SIN DECISIÓN: lo de prisma se frena con 2", () => {
  for (const [nombre, preparar] of [
    ["K ausente", (p) => fs.rmSync(path.join(p.dir, "scripts", "hook-guardia-migraciones.mjs"))],
    ["L sale con 1", (p) => conHook(p, "process.exit(1);\n")],
    ["L se cae", (p) => conHook(p, "throw new Error('roto');\n")],
    ["N no importa", (p) => conHook(p, "import './no-existe.mjs';\n")],
    ["O texto que no es JSON", (p) => conHook(p, "process.stdout.write('no es json');\n")],
    ["O JSON sin decisión", (p) => conHook(p, "process.stdout.write('{}');\n")],
    ["O decisión con salida 1", (p) => conHook(p, `process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:"allow"}}));process.exit(1);\n`)],
    ["O vacío", (p) => conHook(p, "")],
  ]) {
    const p = proyecto();
    try {
      preparar(p);
      const r = p.preguntar("", { crudo: eventoReal("npx prisma migrate deploy") });
      assert.equal(r.codigo, 2, `${nombre}: ${JSON.stringify(r)}`);
      assert.match(r.stderr, /FRENADO: la guardia de migraciones no pudo correr/, nombre);
      const ls = p.preguntar("", { crudo: eventoReal("ls") });
      assert.equal(p.bloquea(ls), false, nombre);
      assert.match(ls.aviso, /GUARDIA DE MIGRACIONES ROTA/, nombre);
    } finally {
      p.borrar();
    }
  }
});

test("ENVOLTORIO M · un hook que sale con 2 frena siempre, nombre o no prisma", () => {
  const p = proyecto();
  try {
    conHook(p, "process.stderr.write('frenado por el hook');\nprocess.exit(2);\n");
    for (const c of ["ls", "npx prisma migrate deploy"]) {
      const r = p.preguntar("", { crudo: eventoReal(c) });
      assert.equal(r.codigo, 2, c);
      assert.match(r.stderr, /frenado por el hook/);
    }
  } finally {
    p.borrar();
  }
});

test("ENVOLTORIO P · un clasificador colgado se corta ANTES del timeout del hook, y frena", () => {
  const p = proyecto({ clasificador: "setTimeout(() => {}, 60_000);\n" });
  try {
    const t = Date.now();
    const r = p.preguntar("", { crudo: eventoReal(ERP), entorno: { GUARDIA_TIEMPO_CLASIFICADOR_MS: "1500" } });
    assert.equal(r.decision, "deny", JSON.stringify(r));
    assert.match(r.razon, /no terminó bien/);
    assert.ok(Date.now() - t < 20_000, "el corte no respetó el tiempo pedido");
    // La variable solo puede ACHICAR el tiempo: un valor enorme o basura no lo estira.
    const fuente = fs.readFileSync(path.join(AQUI, "hook-guardia-migraciones.mjs"), "utf8").replace(/\/\/[^\n]*/g, "");
    assert.match(fuente, /Math\.min\(pedido, TIEMPO_CLASIFICADOR_MS\)/);
  } finally {
    p.borrar();
  }
});

test("ENVOLTORIO P · el presupuesto interno entra holgado en el timeout del hook (un timeout DEJA PASAR)", () => {
  const fuente = fs.readFileSync(path.join(AQUI, "hook-guardia-migraciones.mjs"), "utf8").replace(/\/\/[^\n]*/g, "");
  const ms = (nombre) => Number(new RegExp(`const ${nombre} = ([\\d_]+);`).exec(fuente)?.[1]?.replace(/_/g, ""));
  const clasificador = ms("TIEMPO_CLASIFICADOR_MS");
  const git = ms("TIEMPO_GIT_IDENTIDAD_MS");
  assert.ok(clasificador > 0 && git > 0, "no se encontraron los tiempos del hook");
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, ".claude", "settings.json"), "utf8"));
  const hook = cfg.hooks.PreToolUse.flatMap((g) => g.hooks).find((h) => h.command.includes("hook-guardia-migraciones.mjs"));
  assert.ok(hook.timeout * 1000 >= clasificador + 2 * git + 30_000, `timeout ${hook.timeout}s contra ${clasificador + 2 * git} ms internos`);
});

test("ENVOLTORIO Q/R · comandos concatenados y sustituciones que dejan el texto a la vista se frenan", () => {
  const p = proyecto();
  try {
    for (const c of [`ls && ${DB_PUSH}`, `true; ${DB_PUSH}`, `ls | ${DB_PUSH}`, `$(${DB_PUSH})`, `\`${DB_PUSH}\``, `echo $(${DB_PUSH})`]) {
      assert.equal(p.preguntar("", { crudo: eventoReal(c) }).decision, "deny", c);
    }
    for (const c of ["ls && npx prisma migrate deploy", "true; docker compose run --rm app prisma migrate deploy"]) {
      const r = p.preguntar("", { crudo: eventoReal(c), salida: 2 });
      assert.equal(r.decision, "deny", c);
      assert.equal(r.clasifico, true, c);
    }
  } finally {
    p.borrar();
  }
});

test("ENVOLTORIO S · LÍMITE: lo que invoca prisma sin que el texto lo diga NO lo ve la guardia, funcione o no", () => {
  // Registrado, no cubierto: es el límite estructural de un hook que lee el
  // texto del comando. Está en el skill `/deploy`, "Esa guardia NO hace
  // obligatorio el chequeo". Si alguno empieza a frenarse, se reescribe esto
  // afirmando el freno.
  const p = proyecto();
  try {
    for (const c of [
      // (Con `migrate deploy` a la vista sí frena aunque prisma esté escondido:
      // el texto que importa es ése. Acá están escondidos los dos.)
      "npx pri\"\"sma migrate dep\"\"loy",
      "npx $'\\x70risma' migrate $'\\x64eploy'",
      "p=pri; npx ${p}sma migrate dep''loy",
      "sh ./migrar.sh",
      "npm run migrar",
    ]) {
      const r = p.preguntar("", { crudo: eventoReal(c), salida: 2 });
      assert.equal(p.bloquea(r), false, `${c}: ahora se frena, reescribir este candado`);
    }
  } finally {
    p.borrar();
  }
});

// ── LA IMAGEN QUE MIGRA — 2026-10-08 ──────────────────────────────────────
//
// Lo que se puede afirmar y lo que no. El clasificador mira el COMMIT cuyo SHA
// está en la etiqueta de APP_IMAGE. El contenedor de `migrate deploy` corre la
// IMAGEN que esa etiqueta nombra en el docker del VPS. Que esa imagen se haya
// construido desde ese commit lo afirma la CI (APP_BUILD_ID y la etiqueta OCI
// `revision`), pero una etiqueta no es un digest: se puede volver a apuntar, y
// el build local de emergencia la pisa. Eso no se comprueba acá (no hay docker
// de producción) y está en el skill `/deploy` como límite.

test("IMAGEN A/C/P · APP_IMAGE con el SHA nuevo: es el destino, sin variable en el entorno", () => {
  const dir = temporal("despliegue-");
  const nuevo = "b".repeat(40);
  try {
    fs.writeFileSync(path.join(dir, ".env"), `X=1\nAPP_IMAGE=ghcr.io/islaemanuel25-glitch/erpmanual:${nuevo}\n`);
    assert.equal(shaDeLaImagenAMigrar(dir, {}), nuevo);
    assert.equal(shaDeLaImagenAMigrar(dir, { APP_IMAGE: `ghcr.io/islaemanuel25-glitch/erpmanual:${nuevo}` }), nuevo, "coincidiendo, el entorno no molesta");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("IMAGEN G · APP_IMAGE del ENTORNO distinta, vacía o sin SHA: INDETERMINADO (compose usaría esa, no la del .env)", () => {
  const dir = temporal("despliegue-");
  try {
    fs.writeFileSync(path.join(dir, ".env"), `APP_IMAGE=ghcr.io/x/y:${"b".repeat(40)}\n`);
    for (const valor of [`ghcr.io/x/y:${"a".repeat(40)}`, "", "erpazul-app", "ghcr.io/x/y:latest"]) {
      assert.throws(() => shaDeLaImagenAMigrar(dir, { APP_IMAGE: valor }), /definida en el entorno y no coincide/, JSON.stringify(valor));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("IMAGEN B/O · APP_IMAGE todavía en el SHA que atiende es rango degenerado: frena; el pre-chequeo dice el destino a mano", () => {
  const e = escenario();
  try {
    const r = e.clasificar(["--desde", e.A, "--hasta", e.A, "--repo", e.prod]);
    assert.equal(r.status, SALIDA.INDETERMINADO);
    // O: antes del paso 2, en el servidor, el destino explícito manda sobre APP_IMAGE.
    const plan = planDeResolucion({ modoVps: true, enVps: true, hasta: e.B, raiz: "/c", dirDespliegue: "/srv/produccion/erpazul" });
    assert.deepEqual(plan.destino, { tipo: "explicito", valor: e.B });
  } finally {
    e.borrar();
  }
});

test("IMAGEN J/K · el SHA de la imagen no está en el repositorio, o es un commit que no es del ERP: INDETERMINADO", () => {
  const e = escenario();
  try {
    let r = e.clasificar(["--desde", e.A, "--hasta", "c".repeat(40), "--repo", e.prod]);
    assert.equal(r.status, SALIDA.INDETERMINADO);
    assert.match(r.stderr, /SHA de destino \(c{40}\) no existe en/);
    fs.writeFileSync(path.join(e.prod, "package.json"), JSON.stringify({ name: "otro-proyecto" }));
    git(e.prod, "commit", "-q", "-am", "otro");
    r = e.clasificar(["--desde", e.A, "--repo", e.prod]);
    assert.equal(r.status, SALIDA.INDETERMINADO);
    assert.match(r.stderr, /destino .* no es del repo del ERP/);
  } finally {
    e.borrar();
  }
});

test("IMAGEN H · LÍMITE: un comando que cambia la imagen o las migraciones en la misma línea sigue yendo al clasificador", () => {
  // Registrado, no cubierto. El clasificador mira la imagen del .env; estas
  // variantes migran con otra imagen u otras migraciones y la guardia las manda
  // igual a clasificar, que con 0 las dejaría pasar. Cerrarlo exige exigir la
  // forma exacta del runbook también para el ERP —como el PR #151 hizo con Azul
  // Chat—, y eso cambia lo que hoy recibe lo DESCONOCIDO: está pedido como
  // decisión, no implementado.
  for (const c of [
    "cd /srv/produccion/erpazul && APP_IMAGE=ghcr.io/x/y:" + "c".repeat(40) + " docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate deploy",
    ERP.replace("--no-deps", "--no-deps -v /tmp/otras:/app/prisma/migrations"),
    ERP.replace("docker compose", "docker compose --env-file /tmp/otro.env"),
    "docker run --rm ghcr.io/islaemanuel25-glitch/erpmanual:" + "c".repeat(40) + " prisma migrate deploy",
  ]) {
    assert.equal(decidirPorComando(c).accion, "clasificar", `${c}: ahora se decide distinto, reescribir este candado`);
  }
});

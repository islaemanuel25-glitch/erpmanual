// Candados de la frontera ERP / Azul Chat en la guardia de migraciones.
//
// El 2026-10-07 se desplegó Azul Chat desde una sesión de este repo y la guardia
// del ERP mandó su `migrate deploy` al clasificador del ERP, que calculó el rango
// del ERP (25172fe, imagen que atendía y HEAD a la vez) y salió INDETERMINADO.
// Hubo que autorizar a mano. Estos candados fijan la frontera nueva —qué es del
// ERP, qué es de Azul Chat, qué es desconocido y qué es ambiguo— y que la
// protección del ERP no perdió nada en el camino.
//
// Tres niveles: la identificación pura (proyectoDelComando.mjs), la decisión de
// la guardia (guardiaMigraciones.mjs) y el HOOK de verdad, corrido como proceso
// con un clasificador falso que deja una marca si lo llaman. El último es el que
// prueba "no se intentó resolver el SHA del ERP": no lo afirma leyendo código,
// lo mira pasar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { identificarProyecto, PROYECTO, PROYECTOS_DEL_VPS } from "./proyectoDelComando.mjs";
import { decidirPorComando } from "./guardiaMigraciones.mjs";
import { esCheckoutDelErp } from "../../scripts/clasificar-migraciones.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** El paso 4 del skill `/deploy` del ERP, tal cual. */
const ERP = "ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate deploy'";
/** El paso 3 del runbook de Azul Chat (docs/DEPLOY.md de ese repo), con su directorio y por ssh. */
const AZUL = "ssh vps-erp 'cd /srv/produccion/azul-chat && docker compose -f docker-compose.prod.yml run --rm --no-deps azul-chat-app prisma migrate deploy'";
/** El mismo paso corrido EN el VPS, desde el directorio del proyecto (el `cd` quedó de un comando anterior). */
const AZUL_SIN_CD = "docker compose -f docker-compose.prod.yml run --rm --no-deps azul-chat-app prisma migrate deploy";
const AUT = "DEPLOY_MIGRACION_AUTORIZADA=1";

// ── La identificación ──────────────────────────────────────────────────────

test("los dos proyectos del VPS, con firmas distintas", () => {
  assert.deepEqual(
    PROYECTOS_DEL_VPS.map((p) => [p.id, p.directorio, p.servicio]),
    [
      ["ERP", "/srv/produccion/erpazul", "app"],
      ["AZUL_CHAT", "/srv/produccion/azul-chat", "azul-chat-app"],
    ]
  );
});

test("E/J. Azul Chat se identifica por DOS señales que coinciden: directorio y servicio", () => {
  assert.equal(identificarProyecto(AZUL).proyecto, PROYECTO.AZUL_CHAT);
  assert.equal(identificarProyecto(AZUL_SIN_CD, { cwd: "/srv/produccion/azul-chat" }).proyecto, PROYECTO.AZUL_CHAT);
  assert.equal(
    identificarProyecto("cd /srv/produccion/azul-chat && docker compose -f /srv/produccion/azul-chat/docker-compose.prod.yml run --rm azul-chat-app prisma migrate deploy").proyecto,
    PROYECTO.AZUL_CHAT
  );
  // J: una sola señal no alcanza, y el nombre de una carpeta suelta no es una señal.
  for (const solo of [
    "cd azul-chat && npx prisma migrate deploy",
    "cd ~/azul-chat && docker compose run --rm app prisma migrate deploy",
    "cd /srv/produccion/azul-chat && npx prisma migrate deploy",
    "docker compose run --rm azul-chat-app prisma migrate deploy",
    "cd /srv/produccion/azul-chat-viejo && docker compose run --rm azul-chat-app prisma migrate deploy",
    "cd /home/x/srv/produccion/azul-chat2 && docker compose run --rm azul-chat-app prisma migrate deploy",
  ]) {
    assert.equal(identificarProyecto(solo).proyecto, PROYECTO.DESCONOCIDO, solo);
  }
  // El directorio de trabajo no cuenta si el comando va por ssh: corre en otra máquina.
  assert.equal(identificarProyecto(`ssh vps-erp '${AZUL_SIN_CD}'`, { cwd: "/srv/produccion/azul-chat" }).proyecto, PROYECTO.DESCONOCIDO);
  assert.equal(identificarProyecto(AZUL_SIN_CD, { cwd: "/srv/produccion/azul-chat-viejo" }).proyecto, PROYECTO.DESCONOCIDO);
});

test("el ERP se identifica igual, con sus dos señales", () => {
  assert.equal(identificarProyecto(ERP).proyecto, PROYECTO.ERP);
  assert.equal(
    identificarProyecto("docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate deploy", { cwd: "/srv/produccion/erpazul" }).proyecto,
    PROYECTO.ERP
  );
});

test("I. una identidad mezclada o contradictoria es AMBIGUA, no del proyecto que convenga", () => {
  for (const mezcla of [
    // directorio de uno, servicio del otro
    AZUL.replace("azul-chat-app", "app"),
    ERP.replace(" app ", " azul-chat-app "),
    // los dos directorios
    "cd /srv/produccion/azul-chat && docker compose -f /srv/produccion/erpazul/docker-compose.prod.yml run --rm azul-chat-app prisma migrate deploy",
    "cd /srv/produccion/erpazul; cd /srv/produccion/azul-chat && docker compose run --rm azul-chat-app prisma migrate deploy",
    // dos migraciones en la misma línea: la de Azul Chat no puede llevar a la del ERP de la mano
    `${AZUL} && ${ERP}`,
    `${AZUL}\n${ERP}`,
  ]) {
    assert.equal(identificarProyecto(mezcla).proyecto, PROYECTO.AMBIGUO, mezcla);
  }
  // El directorio de trabajo de Azul Chat no convierte en Azul Chat un comando que nombra el del ERP.
  assert.equal(identificarProyecto(ERP.replace("ssh vps-erp '", "").replace(/'$/, ""), { cwd: "/srv/produccion/azul-chat" }).proyecto, PROYECTO.ERP);
});

// ── La decisión de la guardia ──────────────────────────────────────────────

test("A. el ERP sigue yendo al clasificador, como siempre, ahora diciendo el proyecto", () => {
  const r = decidirPorComando(ERP);
  assert.equal(r.accion, "clasificar");
  assert.equal(r.proyecto, PROYECTO.ERP);
  assert.match(r.nota, /ERP Azul/);
  // Y el clasificador reconoce el checkout del ERP como propio.
  assert.equal(esCheckoutDelErp(RAIZ), true);
});

test("D. la autorización manual en el ERP: mismo alcance que antes", () => {
  const r = decidirPorComando(`${AUT} ${ERP}`);
  assert.equal(r.accion, "allow");
  assert.match(r.aviso, /autorizaci/i);
  assert.match(r.razon, /no clasific/i);
  // No habilita un rechazado, ni lo ambiguo.
  assert.equal(decidirPorComando(`${AUT} npx prisma db push`).accion, "deny");
  assert.equal(decidirPorComando(`${AUT} ${AZUL.replace("azul-chat-app", "app")}`).accion, "deny");
});

test("H. lo DESCONOCIDO no se asume de Azul Chat: recibe la guardia del ERP entera", () => {
  for (const cmd of ["npx prisma migrate deploy", "docker compose run --rm api prisma migrate deploy", "cd /srv/produccion/azul-chat && npx prisma migrate deploy"]) {
    const r = decidirPorComando(cmd);
    assert.equal(r.accion, "clasificar", cmd);
    assert.equal(r.proyecto, PROYECTO.DESCONOCIDO, cmd);
    assert.match(r.nota, /no identificado/i, cmd);
  }
  assert.equal(decidirPorComando(`${AUT} npx prisma migrate deploy`).accion, "allow", "y la autorización manual vale como antes");
});

test("E/F/G. Azul Chat no va al clasificador del ERP, ni necesita la autorización manual", () => {
  for (const [cmd, ctx] of [
    [AZUL, {}],
    [AZUL_SIN_CD, { cwd: "/srv/produccion/azul-chat" }],
  ]) {
    const r = decidirPorComando(cmd, ctx);
    assert.equal(r.accion, "allow", cmd);
    assert.equal(r.proyecto, PROYECTO.AZUL_CHAT);
    assert.match(r.aviso, /AZUL CHAT/);
    assert.match(r.razon, /no la clasifica/i);
    assert.match(r.rastro, /AZUL CHAT/, "pasa, pero deja rastro en la bitácora");
  }
});

test("los rechazos siguen valiendo para Azul Chat: nada de db push, reset, execute ni resolve", () => {
  for (const sub of ["db push", "migrate reset --force", "db execute --stdin", "migrate resolve --applied x"]) {
    const cmd = AZUL.replace("migrate deploy", sub);
    assert.equal(decidirPorComando(cmd).accion, "deny", cmd);
  }
});

test("I. lo AMBIGUO se rechaza, con o sin autorización manual", () => {
  for (const cmd of [AZUL.replace("azul-chat-app", "app"), `${AZUL} && ${ERP}`]) {
    for (const c of [cmd, `${AUT} ${cmd}`]) {
      const r = decidirPorComando(c);
      assert.equal(r.accion, "deny", c);
      assert.match(r.razon, /no se puede saber de qué proyecto/);
    }
  }
});

test("K. la autorización no se activa con valores parecidos ni con variables parecidas", () => {
  for (const falsa of [
    "DEPLOY_MIGRACION_AUTORIZADA=0",
    "DEPLOY_MIGRACION_AUTORIZADA=10",
    "DEPLOY_MIGRACION_AUTORIZADA=01",
    "DEPLOY_MIGRACION_AUTORIZADA=1.5",
    "DEPLOY_MIGRACION_AUTORIZADA=1-si",
    "DEPLOY_MIGRACION_AUTORIZADA=1/",
    "DEPLOY_MIGRACION_AUTORIZADA=true",
    "DEPLOY_MIGRACION_AUTORIZADA=yes",
    "DEPLOY_MIGRACION_AUTORIZADA=",
    "deploy_migracion_autorizada=1",
    "XDEPLOY_MIGRACION_AUTORIZADA=1",
    "DEPLOY_MIGRACION_AUTORIZADA_2=1",
    "DEPLOY_MIGRACION_AUTORIZAD=1",
    "MIGRACION_AUTORIZADA=1",
  ]) {
    assert.equal(decidirPorComando(`${falsa} ${ERP}`).accion, "clasificar", falsa);
  }
  // Las formas que valían siguen valiendo.
  for (const buena of [`${AUT} ${ERP}`, `DEPLOY_MIGRACION_AUTORIZADA = 1 ${ERP}`, `ssh vps-erp '${AUT} docker compose run --rm app prisma migrate deploy'`]) {
    assert.equal(decidirPorComando(buena).accion, "allow", buena);
  }
});

test("L. ni la razón, ni el aviso, ni la nota repiten lo que trae la línea (una URL con clave, por ejemplo)", () => {
  const secreto = "DATABASE_URL=postgres://usuario:CLAVE-SECRETA@db:5432/x";
  for (const cmd of [`${secreto} ${AZUL}`, `${secreto} ${ERP}`, `${secreto} ${AUT} ${ERP}`, `${secreto} ${AZUL.replace("azul-chat-app", "app")}`, `${secreto} npx prisma migrate deploy`]) {
    const r = decidirPorComando(cmd);
    for (const campo of [r.razon, r.aviso, r.nota]) {
      assert.ok(!String(campo ?? "").includes("CLAVE-SECRETA"), `${cmd}: un campo repite la clave`);
    }
  }
});

// ── El clasificador, fuera del repo del ERP ────────────────────────────────

test("E/F. el clasificador no compara un SHA del ERP en un árbol que no es el ERP: INDETERMINADO, diciendo por qué", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "no-es-erp-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(dir, "prisma", "migrations"), { recursive: true });
    fs.copyFileSync(path.join(RAIZ, "scripts", "clasificar-migraciones.mjs"), path.join(dir, "scripts", "clasificar-migraciones.mjs"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "azul-chat" }));
    assert.equal(esCheckoutDelErp(dir), false);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts", "clasificar-migraciones.mjs"), "--desde", "25172fe06babd900344686dafc56c824838ec57a"], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no es el repo del ERP/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── El hook de verdad, con un clasificador que deja marca ─────────────────

/**
 * Una copia del hook y de lib/deploy en un directorio temporal, con un
 * clasificador FALSO que escribe una marca si lo llaman y sale con el código
 * que se le pida. Es el hook real: lo único que cambia es a quién le pregunta.
 */
function arnes() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardia-proyecto-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "lib", "deploy"), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, "scripts", "hook-guardia-migraciones.mjs"), path.join(dir, "scripts", "hook-guardia-migraciones.mjs"));
  for (const f of fs.readdirSync(path.join(RAIZ, "lib", "deploy"))) {
    if (f.endsWith(".mjs") && !f.endsWith(".test.mjs")) fs.copyFileSync(path.join(RAIZ, "lib", "deploy", f), path.join(dir, "lib", "deploy", f));
  }
  const marca = path.join(dir, "clasificador-llamado");
  fs.writeFileSync(
    path.join(dir, "scripts", "clasificar-migraciones.mjs"),
    `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marca)}, process.argv.slice(2).join(" "));\n` +
      `console.log("clasificador falso");\nprocess.exit(Number(process.env.SALIDA_FALSA ?? 0));\n`
  );
  const preguntar = (command, { cwd = null, salida = 0 } = {}) => {
    if (fs.existsSync(marca)) fs.rmSync(marca);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts", "hook-guardia-migraciones.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, ...(cwd ? { cwd } : {}) }),
      encoding: "utf8",
      cwd: dir,
      timeout: 60_000,
      env: { ...process.env, SALIDA_FALSA: String(salida) },
    });
    const h = JSON.parse(String(r.stdout || "{}")).hookSpecificOutput ?? {};
    return { decision: h.permissionDecision, razon: h.permissionDecisionReason ?? "", clasifico: fs.existsSync(marca) };
  };
  return { preguntar, borrar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("A/B/C. en el ERP el hook consulta al clasificador y obedece: 0 pasa, 1 frena, 2 frena", () => {
  const { preguntar, borrar } = arnes();
  try {
    const limpio = preguntar(ERP, { salida: 0 });
    assert.equal(limpio.clasifico, true);
    assert.equal(limpio.decision, "allow");
    assert.match(limpio.razon, /ERP Azul/);
    const marcada = preguntar(ERP, { salida: 1 });
    assert.equal(marcada.decision, "deny");
    assert.match(marcada.razon, /rompería/);
    const indeterminado = preguntar(ERP, { salida: 2 });
    assert.equal(indeterminado.decision, "deny");
    assert.match(indeterminado.razon, /no pudo determinar/);
    // B: y sin autorización no hay forma de pasar una marcada.
    assert.equal(preguntar(`${AUT}x ${ERP}`, { salida: 1 }).decision, "deny");
  } finally {
    borrar();
  }
});

test("EL INCIDENTE DEL 2026-10-07: la migración de Azul Chat ya no pasa por el clasificador del ERP", () => {
  // Azul Chat: PRE a3ae37087dd90bc3a9de4ddb705158b08227cb1e, objetivo
  // 3d8b849bf840bd7eea803055461726c6d736d0bd, migración
  // 20261007120000_eventos_ingesta_y_lectura. ERP atendiendo en
  // 25172fe06babd900344686dafc56c824838ec57a. El clasificador del ERP —acá, uno
  // falso que sale INDETERMINADO como salió ese día— no se consulta.
  const { preguntar, borrar } = arnes();
  try {
    for (const [cmd, cwd] of [
      [AZUL, null],
      [AZUL_SIN_CD, "/srv/produccion/azul-chat"],
    ]) {
      const r = preguntar(cmd, { cwd, salida: 2 });
      assert.equal(r.clasifico, false, "se le preguntó al clasificador del ERP por una migración de Azul Chat");
      assert.equal(r.decision, "allow");
      assert.match(r.razon, /Azul Chat/);
    }
    // Y lo mismo escrito sin señales suficientes SÍ va al clasificador (y con este, frena).
    const sinSenales = preguntar(AZUL_SIN_CD, { salida: 2 });
    assert.equal(sinSenales.clasifico, true);
    assert.equal(sinSenales.decision, "deny");
  } finally {
    borrar();
  }
});

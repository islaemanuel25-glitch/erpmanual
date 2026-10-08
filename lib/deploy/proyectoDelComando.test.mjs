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

test("E/J. Azul Chat se identifica solo por la forma EXACTA del runbook; una señal suelta no exime, bloquea", () => {
  assert.equal(identificarProyecto(AZUL).proyecto, PROYECTO.AZUL_CHAT);
  assert.equal(identificarProyecto(AZUL_SIN_CD, { cwd: "/srv/produccion/azul-chat" }).proyecto, PROYECTO.AZUL_CHAT);
  assert.equal(
    identificarProyecto("cd /srv/produccion/azul-chat && docker compose -f /srv/produccion/azul-chat/docker-compose.prod.yml run --rm azul-chat-app prisma migrate deploy").proyecto,
    PROYECTO.AZUL_CHAT
  );
  // Con alguna señal de Azul Chat —su directorio, su servicio, la sesión parada
  // en su directorio— y sin la forma canónica: AMBIGUO, no DESCONOCIDO. No se
  // manda al clasificador del ERP, que podría salir con 0.
  for (const [solo, ctx] of [
    ["cd /srv/produccion/azul-chat && npx prisma migrate deploy", {}],
    ["docker compose run --rm azul-chat-app prisma migrate deploy", {}],
    ["cd /srv/produccion/azul-chat-viejo && docker compose run --rm azul-chat-app prisma migrate deploy", {}],
    ["cd /home/x/srv/produccion/azul-chat2 && docker compose run --rm azul-chat-app prisma migrate deploy", {}],
    [`ssh vps-erp '${AZUL_SIN_CD}'`, { cwd: "/srv/produccion/azul-chat" }],
    [AZUL_SIN_CD, { cwd: "/srv/produccion/azul-chat-viejo" }],
    [AZUL_SIN_CD, { cwd: "/srv/produccion/azul-chat/prisma" }],
    ["npx prisma migrate deploy", { cwd: "/srv/produccion/azul-chat" }],
    // Una carpeta `azul-chat` cualquiera también es señal: se bloquea, no se exime.
    ["cd azul-chat && npx prisma migrate deploy", {}],
    ["cd ~/azul-chat && docker compose run --rm app prisma migrate deploy", {}],
    ["npx prisma migrate deploy", { cwd: "/home/user/azul-chat" }],
    // Y con comillas metidas en el nombre del servicio.
    [`docker compose run --rm azul-chat-ap""p prisma migrate deploy`, {}],
    [`docker compose run --rm azul""-chat-app prisma migrate deploy`, {}],
  ]) {
    assert.equal(identificarProyecto(solo, ctx).proyecto, PROYECTO.AMBIGUO, `${solo} ${JSON.stringify(ctx)}`);
  }
  // Sin ninguna señal de Azul Chat: DESCONOCIDO, guardia del ERP.
  for (const [solo, ctx] of [
    ["cd ~/otro && npx prisma migrate deploy", {}],
    ["npx prisma migrate deploy", { cwd: "/home/user/erpmanual" }],
  ]) {
    assert.equal(identificarProyecto(solo, ctx).proyecto, PROYECTO.DESCONOCIDO, solo);
  }
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
  for (const cmd of ["npx prisma migrate deploy", "docker compose run --rm api prisma migrate deploy"]) {
    const r = decidirPorComando(cmd);
    assert.equal(r.accion, "clasificar", cmd);
    assert.equal(r.proyecto, PROYECTO.DESCONOCIDO, cmd);
    assert.match(r.nota, /no identificado/i, cmd);
  }
  assert.equal(decidirPorComando(`${AUT} npx prisma migrate deploy`).accion, "allow", "y la autorización manual vale como antes");
  // Con el directorio de Azul Chat ya no es desconocido: se rechaza.
  assert.equal(decidirPorComando("cd /srv/produccion/azul-chat && npx prisma migrate deploy").accion, "deny");
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
    // Y lo mismo sin la sesión parada en el directorio NO es la forma canónica:
    // tiene el servicio de Azul Chat, así que se rechaza sin preguntarle al
    // clasificador del ERP —que, con salida 0, lo habría dejado pasar—.
    for (const salida of [0, 2]) {
      const sinCwd = preguntar(AZUL_SIN_CD, { salida });
      assert.equal(sinCwd.clasifico, false, `salida ${salida}`);
      assert.equal(sinCwd.decision, "deny", `salida ${salida}`);
    }
  } finally {
    borrar();
  }
});

// ── Las evasiones de la revisión del PR #151 ──────────────────────────────
//
// La primera versión eximía todo comando con el directorio y el servicio de
// Azul Chat, con cualquier cosa alrededor. Cada variante de abajo conservaba
// la exención y cambiaba qué corre, contra qué base o con qué migraciones.
// Ahora la exención es igualdad contra la forma canónica, y toda variante con
// señales de Azul Chat se RECHAZA —no se manda al clasificador del ERP—,
// también con la autorización manual.

/** La forma canónica con `cd`, sin ssh. */
const AZUL_CD = "cd /srv/produccion/azul-chat && docker compose -f docker-compose.prod.yml run --rm --no-deps azul-chat-app prisma migrate deploy";
const CWD_AZUL = { cwd: "/srv/produccion/azul-chat" };

/** La misma variante en las tres envolturas: con `cd`, por ssh y desde el directorio. */
const enLasTres = (cambiar) => [[cambiar(AZUL_CD), {}], [cambiar(AZUL), {}], [cambiar(AZUL_SIN_CD), CWD_AZUL]];
/** Una opción de `run` agregada después de las del runbook. */
const conOpcion = (op) => enLasTres((c) => c.replace("run --rm --no-deps", `run --rm --no-deps ${op}`));
/** Lo que va después de `deploy` (o `deploy'` por ssh). */
const despuesDeDeploy = (extra) => enLasTres((c) => c.replace("prisma migrate deploy", `prisma migrate deploy${extra}`));
/** El archivo de Compose cambiado. */
const conCompose = (f) => enLasTres((c) => c.replace("-f docker-compose.prod.yml", `-f ${f}`));

/** Rechazado, sin autorización y con ella, y nunca identificado como Azul Chat. */
function rechazada([cmd, ctx], etiqueta) {
  assert.notEqual(identificarProyecto(cmd, ctx).proyecto, PROYECTO.AZUL_CHAT, `${etiqueta}: exime ${cmd}`);
  for (const c of [cmd, `${AUT} ${cmd}`]) {
    const r = decidirPorComando(c, ctx);
    assert.equal(r.accion, "deny", `${etiqueta}: ${c} ${JSON.stringify(ctx)} → ${r.accion}`);
  }
}

test("Evasión A. el comando canónico de Azul Chat pasa, en sus tres envolturas y con -T", () => {
  for (const [cmd, ctx] of [
    [AZUL_CD, {}],
    [AZUL, {}],
    [AZUL_SIN_CD, CWD_AZUL],
    [`${AZUL_SIN_CD}`, { cwd: "/srv/produccion/azul-chat/" }],
    [AZUL_CD.replace("--rm --no-deps", "--rm -T --no-deps"), {}],
    [AZUL_CD.replace("--rm --no-deps", "--no-deps --rm"), {}],
    [AZUL_CD.replace("--rm --no-deps", "--rm"), {}],
    [AZUL_CD.replace(" --rm --no-deps", ""), {}],
    [AZUL.replace("-f docker-compose.prod.yml", "-f /srv/produccion/azul-chat/docker-compose.prod.yml"), {}],
  ]) {
    assert.equal(identificarProyecto(cmd, ctx).proyecto, PROYECTO.AZUL_CHAT, cmd);
    assert.equal(decidirPorComando(cmd, ctx).accion, "allow", cmd);
  }
});

test("Evasión B. un volumen (-v, --volume, pegado o con =) no conserva la exención", () => {
  for (const op of ["-v=../erpazul/prisma:/app/prisma", "-v ../erpazul/prisma:/app/prisma", "-v../erpazul/prisma:/app/prisma", "--volume=/srv/produccion/erpazul/prisma:/app/prisma", "--volume ./prisma:/app/prisma"]) {
    for (const v of conOpcion(op)) rechazada(v, `B ${op}`);
  }
});

test("Evasión C. otro entrypoint no conserva la exención", () => {
  for (const op of ["--entrypoint=sh", "--entrypoint sh", "--entrypoint=/bin/sh"]) {
    for (const v of conOpcion(op)) rechazada(v, `C ${op}`);
  }
});

test("Evasión D. --env con DATABASE_URL no conserva la exención", () => {
  for (const op of ["--env=DATABASE_URL=postgres://u@erpazul_db:5432/erpazul", "--env DATABASE_URL=postgres://u@erpazul_db:5432/erpazul", "--env DATABASE_URL"]) {
    for (const v of conOpcion(op)) rechazada(v, `D ${op}`);
  }
});

test("Evasión E. -e pegado al valor no conserva la exención", () => {
  for (const op of ["-eDATABASE_URL=postgres://u@erpazul_db:5432/erpazul", "-eDATABASE_URL"]) {
    for (const v of conOpcion(op)) rechazada(v, `E ${op}`);
  }
});

test("Evasión F. -e separado no conserva la exención", () => {
  for (const op of ["-e DATABASE_URL=postgres://u@erpazul_db:5432/erpazul", "-e DATABASE_URL"]) {
    for (const v of conOpcion(op)) rechazada(v, `F ${op}`);
  }
});

test("Evasión F2. ninguna otra opción de run, ni abreviada, ni repetida, ni con valor", () => {
  for (const op of [
    "--env-file ../erpazul/.env.prod", "--env-file=../erpazul/.env.prod",
    "-w /app/../x", "--workdir=/tmp", "-u root", "--user=root",
    "--name x", "--service-ports", "-p 5432:5432", "--publish=1:1", "--build", "--pull always", "-d", "--detach",
    "--label a=b", "-l a=b", "--use-aliases", "--cap-add ALL", "-i", "-t", "-Tv x", "-Te", "--quiet-pull",
    "--rm=false", "--no-deps=false", "-T=false", "--rm", "--no-deps", "-T -T", "-rm", "--r", "--no-dep", "-",
  ]) {
    for (const v of conOpcion(op)) rechazada(v, `F2 ${op}`);
  }
  // Opciones GLOBALES de compose, antes de `run`: otro proyecto, otro directorio, otro archivo más.
  for (const global of ["-p erpazul", "--project-name=erpazul", "--project-directory ../erpazul", "--env-file ../erpazul/.env.prod", "-f ../erpazul/docker-compose.prod.yml", "--profile x", "--file=x.yml"]) {
    for (const v of enLasTres((c) => c.replace(" run ", ` ${global} run `))) rechazada(v, `F2 global ${global}`);
  }
});

test("Evasión G. nada después de `migrate deploy`: ni --schema, ni --config, ni otra cosa", () => {
  for (const extra of [" --schema=../erpazul/prisma/schema.prisma", " --schema ../erpazul/prisma/schema.prisma", " --config=x.ts", " --help", " x", " -- --schema=x", "\t--schema=x"]) {
    for (const v of despuesDeDeploy(extra)) rechazada(v, `G ${JSON.stringify(extra)}`);
  }
});

test("Evasión H. un compose relativo que sale del directorio no conserva la exención", () => {
  for (const f of [
    "../erpazul/docker-compose.prod.yml", "./../erpazul/docker-compose.prod.yml", "../azul-chat/docker-compose.prod.yml",
    "./docker-compose.prod.yml", "docker-compose.prod.yml/../../erpazul/docker-compose.prod.yml",
    "/srv/produccion/azul-chat/../erpazul/docker-compose.prod.yml", "/srv/produccion/azul-chat/./docker-compose.prod.yml",
    "docker-compose.dev.yml", "docker-compose.prod.yml.bak", "docker-compose.prod.y?l", "docker-compose.prod.yml,x.yml",
  ]) {
    for (const v of conCompose(f)) rechazada(v, `H ${f}`);
  }
  for (const forma of ["--file=docker-compose.prod.yml", "-fdocker-compose.prod.yml", "--file docker-compose.prod.yml"]) {
    for (const v of enLasTres((c) => c.replace("-f docker-compose.prod.yml", forma))) rechazada(v, `H ${forma}`);
  }
  // Sin -f: Compose buscaría el archivo por defecto, que no es el del runbook.
  for (const v of enLasTres((c) => c.replace(" -f docker-compose.prod.yml", ""))) rechazada(v, "H sin -f");
});

test("Evasión I. un compose absoluto fuera de /srv/produccion/azul-chat no conserva la exención", () => {
  for (const f of ["/srv/produccion/erpazul/docker-compose.prod.yml", "/tmp/docker-compose.prod.yml", "/srv/produccion/azul-chat-viejo/docker-compose.prod.yml", "~/docker-compose.prod.yml", "/srv/produccion/azul-chat/sub/docker-compose.prod.yml"]) {
    for (const v of conCompose(f)) rechazada(v, `I ${f}`);
  }
});

test("Evasión J. argumentos o palabras de más en el núcleo no conservan la exención", () => {
  for (const cambiar of [
    (c) => c.replace("azul-chat-app prisma migrate deploy", "azul-chat-app sh -c \"prisma migrate deploy\""),
    (c) => c.replace("azul-chat-app prisma", "azul-chat-app npx prisma"),
    (c) => c.replace("azul-chat-app prisma", "azul-chat-app prisma@5"),
    (c) => c.replace("azul-chat-app prisma", "azul-chat-app env DATABASE_URL=x prisma"),
    (c) => c.replace("azul-chat-app", "azul-chat-db"),
    (c) => c.replace("azul-chat-app", "azul-chat-app2"),
    (c) => c.replace("azul-chat-app", "app"),
    (c) => c.replace("docker compose", "docker-compose"),
    (c) => c.replace("docker compose", "docker --context prod compose"),
    (c) => c.replace("docker compose", "docker -H tcp://otro:2375 compose"),
    (c) => c.replace("run", "exec"),
  ]) {
    for (const v of enLasTres(cambiar)) rechazada(v, `J ${v[0]}`);
  }
});

test("Evasión K. variables adelante, afuera o adentro del ssh, no conservan la exención", () => {
  for (const pre of ["DATABASE_URL=postgres://u@erpazul_db:5432/erpazul", "COMPOSE_FILE=../erpazul/docker-compose.prod.yml", "COMPOSE_PROJECT_NAME=erpazul", "DOCKER_HOST=tcp://otro:2375", "X=1", "env DATABASE_URL=x", "export X=1;"]) {
    rechazada([`${pre} ${AZUL_CD}`, {}], `K ${pre}`);
    rechazada([`${pre} ${AZUL}`, {}], `K ${pre}`);
    rechazada([`${pre} ${AZUL_SIN_CD}`, CWD_AZUL], `K ${pre}`);
    rechazada([AZUL.replace("'cd ", `'${pre} cd `), {}], `K adentro ${pre}`);
    rechazada([AZUL_CD.replace("&& docker", `&& ${pre} docker`), {}], `K después del cd ${pre}`);
  }
});

test("Evasión L. comandos concatenados no conservan la exención", () => {
  for (const [antes, despues] of [
    ["", "; ls"], ["", " && ls"], ["", " || true"], ["", " | cat"], ["", " &"], ["", "\nls"], ["", ";"],
    ["ls && ", ""], ["ls; ", ""], ["true || ", ""], ["cat x | ", ""],
  ]) {
    rechazada([`${antes}${AZUL_CD}${despues}`, {}], `L ${antes}|${despues}`);
    rechazada([`${antes}${AZUL}${despues}`, {}], `L ${antes}|${despues}`);
    rechazada([`${antes}${AZUL_SIN_CD}${despues}`, CWD_AZUL], `L ${antes}|${despues}`);
  }
  // Adentro de la misma envoltura: otro cd, otro comando antes o después.
  for (const v of [
    AZUL_CD.replace("&& docker", "&& cd ../erpazul && docker"),
    AZUL.replace("'cd ", "'ls; cd "),
    AZUL.replace("deploy'", "deploy; ls'"),
    AZUL.replace("deploy'", "deploy' ; ls"),
    AZUL_CD.replace(" && ", " ; "),
    AZUL_CD.replace(" && ", " || "),
    AZUL_CD.replace(" && ", " & "),
    AZUL_CD.replace(" && ", "\n"),
  ]) {
    rechazada([v, {}], `L ${v}`);
  }
});

test("Evasión M. sintaxis de shell ambigua no conserva la exención", () => {
  for (const v of [
    `${AZUL_CD} > /tmp/x`, `${AZUL_CD} 2>&1`, `${AZUL_CD} < /dev/null`,
    // (Esconder el texto `migrate deploy` mismo esquiva la guardia entera, la del
    // ERP incluida: es el límite de envoltorios del skill `/deploy`, no la exención.)
    AZUL_CD.replace("azul-chat-app", "$(echo azul-chat-app)"), AZUL_CD.replace("azul-chat-app", "`echo azul-chat-app`"),
    AZUL_CD.replace("cd /srv/produccion/azul-chat", "cd $(echo /srv/produccion/azul-chat)"),
    AZUL_CD.replace("docker-compose.prod.yml", "$F"), AZUL_CD.replace("docker-compose.prod.yml", "${F}"),
    "$C run --rm --no-deps azul-chat-app prisma migrate deploy",
    "cd /srv/produccion/azul-chat && $C run --rm --no-deps azul-chat-app prisma migrate deploy",
    AZUL.replace(/'/g, "\""),
    AZUL_CD.replace("docker compose", "\"docker\" compose"),
    AZUL_CD.replace("docker compose", "'docker compose'"),
    AZUL_CD.replace("docker compose", "\\docker compose"),
    AZUL_CD.replace("docker compose", "doc\\ker compose"),
    AZUL_CD.replace("docker compose", "sudo docker compose"),
    AZUL_CD.replace("docker compose", "command docker compose"),
    AZUL_CD.replace("cd /srv/produccion/azul-chat", "cd \"/srv/produccion/azul-chat\""),
    AZUL_CD.replace("cd /srv/produccion/azul-chat", "cd /srv/produccion/azul-chat/"),
    AZUL_CD.replace("cd /srv/produccion/azul-chat", "cd ~/../../srv/produccion/azul-chat"),
    AZUL_CD.replace("cd /srv/produccion/azul-chat", "pushd /srv/produccion/azul-chat"),
    AZUL_CD.replace(" run ", "  run "), AZUL_CD.replace(" run ", "\trun "), AZUL_CD.replace(" run ", " \\\nrun "),
    `bash -c '${AZUL_CD}'`, `sh -c "${AZUL_CD}"`, `eval '${AZUL_CD}'`, `(${AZUL_CD})`, `{ ${AZUL_CD}; }`,
    AZUL.replace("ssh vps-erp", "ssh -o ProxyCommand=x vps-erp"),
    AZUL.replace("ssh vps-erp", "ssh otro-host"),
    AZUL.replace("ssh vps-erp", "ssh root@vps-erp"),
    AZUL.replace("ssh vps-erp '", "ssh vps-erp -- '"),
    AZUL.replace("ssh vps-erp '", "ssh vps-erp bash -c '"),
  ]) {
    rechazada([v, {}], `M ${v}`);
    rechazada([v, CWD_AZUL], `M ${v}`);
  }
});

test("Evasión N. el ERP legítimo sigue protegido: va al clasificador y obedece", () => {
  const r = decidirPorComando(ERP);
  assert.equal(r.accion, "clasificar");
  assert.equal(r.proyecto, PROYECTO.ERP);
  assert.equal(decidirPorComando("docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate deploy", { cwd: "/srv/produccion/erpazul" }).accion, "clasificar");
  // Las opciones peligrosas sobre el ERP no lo eximen de nada: siguen en el clasificador.
  assert.equal(decidirPorComando(ERP.replace("--no-deps", "--no-deps -v=/x:/app/prisma")).accion, "clasificar");
});

test("Evasión O/P/Q. el hook: INDETERMINADO del ERP frena; la autorización no pasa una variante de Azul Chat; la canónica no consulta al clasificador", () => {
  const { preguntar, borrar } = arnes();
  try {
    // O: el ERP con el clasificador en INDETERMINADO sigue frenado.
    const indeterminado = preguntar(ERP, { salida: 2 });
    assert.equal(indeterminado.clasifico, true);
    assert.equal(indeterminado.decision, "deny");
    // P: la autorización manual no habilita una variante peligrosa o ambigua de
    // Azul Chat, y tampoco la manda al clasificador —aunque este diga 0—.
    for (const v of [
      AZUL_CD.replace("run --rm --no-deps", "run --rm --no-deps -v=../erpazul/prisma:/app/prisma"),
      AZUL_CD.replace("run --rm --no-deps", "run --rm --no-deps --entrypoint=sh"),
      AZUL_CD.replace("prisma migrate deploy", "prisma migrate deploy --schema=../erpazul/prisma/schema.prisma"),
      AZUL_CD.replace("-f docker-compose.prod.yml", "-f ../erpazul/docker-compose.prod.yml"),
      `DATABASE_URL=x ${AZUL_CD}`,
      `${AZUL_CD}; ls`,
      "$C run --rm --no-deps azul-chat-app prisma migrate deploy",
    ]) {
      for (const c of [v, `${AUT} ${v}`]) {
        const r = preguntar(c, { salida: 0 });
        assert.equal(r.decision, "deny", c);
        assert.equal(r.clasifico, false, `${c}: se le preguntó al clasificador del ERP`);
      }
    }
    // Q: la canónica pasa sin consultar al clasificador del ERP, aunque este frene.
    for (const [cmd, cwd] of [[AZUL_CD, null], [AZUL, null], [AZUL_SIN_CD, "/srv/produccion/azul-chat"]]) {
      const r = preguntar(cmd, { cwd, salida: 1 });
      assert.equal(r.clasifico, false, cmd);
      assert.equal(r.decision, "allow", cmd);
    }
  } finally {
    borrar();
  }
});

test("Evasión R. las prohibiciones generales siguen valiendo, también en la forma canónica de Azul Chat", () => {
  for (const sub of ["db push", "db push --accept-data-loss", "migrate reset --force", "db execute --stdin", "migrate resolve --applied x"]) {
    for (const base of [AZUL_CD, AZUL, ERP]) {
      for (const c of [base.replace("migrate deploy", sub), `${AUT} ${base.replace("migrate deploy", sub)}`]) {
        assert.equal(decidirPorComando(c).accion, "deny", c);
      }
    }
    assert.equal(decidirPorComando(AZUL_SIN_CD.replace("migrate deploy", sub), CWD_AZUL).accion, "deny");
  }
});

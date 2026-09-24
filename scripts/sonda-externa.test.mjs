// CANDADO: LA SONDA EXTERNA QUE `/deploy` DISPARA EN GITHUB ACTIONS.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/sonda-externa.test.mjs
//
// Lo que la sonda MIDE está en `scripts/sonda-cascada.mjs` y no se toca. Acá se
// afirma lo que hay alrededor: que el cliente solo dice VERDE cuando el log real
// lo dice, que el workflow y el cliente hablan el mismo idioma, que el token no
// se filtra, y que `/deploy` la corre en los dos lugares donde tiene que frenar.
//
// ── EL LOG NO SE ESCRIBIÓ A MANO ──────────────────────────────────────────
//
// `sondaExterna.log-real.fixture.json` es el log de una corrida real del
// workflow, traído de GitHub y recortado sin tocar las líneas. Incluye lo que un
// fixture escrito a mano no habría tenido: el BOM, la marca de tiempo de cada
// línea, y el script que GitHub repite en el log antes de correrlo —con las
// marcas adentro de un `echo`—, que es justamente lo que el veredicto no tiene
// que contar.
//
// GitHub se simula con un servidor HTTP en localhost que contesta con la forma
// de su API; el cliente corre entero contra él, con el `fetch` de verdad.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  MARCAS,
  WORKFLOW,
  leerOpciones,
  leerToken,
  limpiarLog,
  principal,
  sinToken,
  tituloDeLaCorrida,
  veredictoDelLog,
} from "./sonda-externa.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const leer = (ruta) => fs.readFileSync(path.join(RAIZ, ruta), "utf8");
const REAL = JSON.parse(leer("scripts/sondaExterna.log-real.fixture.json"));
const LOG_REAL = REAL.lineas.join("\n");
const SHA = REAL.sha;
const OTRO_SHA = "0".repeat(40);
const TOKEN = "github_pat_DE_MENTIRA_0123456789";

/** El `.yml` sin comentarios: un candado que busca texto no tiene que encontrar prosa. */
const workflow = () =>
  leer(".github/workflows/sonda-cascada.yml")
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

// ── LAS OPCIONES ──────────────────────────────────────────────────────────

test("sin fase o sin SHA completo no corre: el SHA corto se rechaza", () => {
  assert.match(leerOpciones(["node", "x", "--sha-esperado", SHA]).error, /--fase/);
  assert.match(leerOpciones(["node", "x", "--fase", "pre"]).error, /SHA COMPLETO/);
  assert.match(leerOpciones(["node", "x", "--fase", "pre", "--sha-esperado", SHA.slice(0, 8)]).error, /SHA COMPLETO/);
  assert.match(leerOpciones(["node", "x", "--fase", "durante", "--sha-esperado", SHA]).error, /--fase/);
  const o = leerOpciones(["node", "x", "--fase", "post", "--sha-esperado", SHA]);
  assert.equal(o.fase, "post");
  assert.equal(o.repo, "islaemanuel25-glitch/erpmanual");
  assert.equal(o.ref, "main");
  assert.equal(o.api, "https://api.github.com");
});

// ── EL LOG REAL ───────────────────────────────────────────────────────────

test("el log real da VERDE para su fase y su SHA, y muestra el bloque de la sonda", () => {
  const v = veredictoDelLog(LOG_REAL, { fase: REAL.fase, shaEsperado: SHA });
  assert.deepEqual(v.faltas, []);
  assert.equal(v.verde, true);
  assert.equal(v.antes, SHA);
  assert.equal(v.despues, SHA);
  assert.equal(v.bloque[0], "sonda de cascada — https://operix.cloud/login");
  assert.equal(v.bloque.at(-1), "  se están aplicando.");
  assert.ok(v.bloque.includes(MARCAS.verdeDeLaSonda));
});

test("el mismo log NO sirve para otra fase ni para otro SHA", () => {
  assert.equal(veredictoDelLog(LOG_REAL, { fase: "pre", shaEsperado: SHA }).verde, false);
  const otro = veredictoDelLog(LOG_REAL, { fase: REAL.fase, shaEsperado: OTRO_SHA });
  assert.equal(otro.verde, false);
  assert.match(otro.faltas.join(" "), /antes de medir/);
  assert.match(otro.faltas.join(" "), /después de medir/);
});

test("cada línea exigida, sacada de a una, lo pone en ROJO", () => {
  const exigidas = [
    MARCAS.verdeDeLaSonda,
    MARCAS.resultado,
    `${MARCAS.shaAntes} ${SHA}`,
    `${MARCAS.shaDespues} ${SHA}`,
    `${MARCAS.fase} ${REAL.fase}`,
  ];
  for (const exigida of exigidas) {
    const sin = REAL.lineas.filter((l) => !l.endsWith(` ${exigida}`)).join("\n");
    assert.notEqual(sin, LOG_REAL, `la línea «${exigida}» no está en el log real`);
    assert.equal(veredictoDelLog(sin, { fase: REAL.fase, shaEsperado: SHA }).verde, false, exigida);
  }
});

test("el script que GitHub repite en el log NO cuenta: solo el eco de lo que se ejecutó", () => {
  // Se dejan solo las líneas con código de color: el script repetido, con las
  // marcas adentro de un `echo`. Si el veredicto buscara "contiene" en vez de
  // "es", esto daría verde sin que nada haya corrido.
  const soloElScript = REAL.lineas.filter((l) => l.includes("\u001b[36;1m")).join("\n");
  assert.ok(soloElScript.includes(MARCAS.resultado), "el recorte ya no tiene las marcas adentro del script");
  assert.equal(veredictoDelLog(soloElScript, { fase: REAL.fase, shaEsperado: SHA }).verde, false);
});

test("un ROJO en cualquier línea gana, aunque el resto esté", () => {
  const conRojo = `${LOG_REAL}\n2026-09-24T15:41:24.0000000Z ROJO · producción cambió mientras se medía`;
  const v = veredictoDelLog(conRojo, { fase: REAL.fase, shaEsperado: SHA });
  assert.equal(v.verde, false);
  assert.match(v.faltas.join(" "), /producción cambió/);
});

test("la marca de tiempo y el BOM se sacan", () => {
  const l = limpiarLog(LOG_REAL);
  assert.equal(l[0], "Current runner version: '2.337.0'");
  assert.ok(l.includes(`${MARCAS.shaAntes} ${SHA}`));
});

// ── EL WORKFLOW Y EL CLIENTE HABLAN EL MISMO IDIOMA ───────────────────────

test("el título de la corrida sale igual del cliente y del workflow", () => {
  const yml = workflow();
  const linea = yml.split("\n").find((l) => l.startsWith("run-name:"));
  assert.equal(
    linea,
    "run-name: sonda ${{ inputs.fase || 'autoprueba' }} ${{ inputs.sha_esperado || 'sin-sha' }} ${{ inputs.correlacion || github.run_id }}"
  );
  assert.equal(
    tituloDeLaCorrida({ fase: "pre", shaEsperado: SHA, correlacion: "sonda-pre-abc123def456" }),
    `sonda pre ${SHA} sonda-pre-abc123def456`
  );
  assert.ok(fs.existsSync(path.join(RAIZ, ".github/workflows", WORKFLOW)));
});

test("el workflow imprime las marcas que el cliente exige, y la sonda la línea VERDE", () => {
  const yml = workflow();
  assert.ok(yml.includes(`echo "${MARCAS.fase} $FASE"`));
  assert.ok(yml.includes(`echo "${MARCAS.shaAntes} \${sha:-ninguno}"`));
  assert.ok(yml.includes(`echo "${MARCAS.shaDespues} \${sha:-ninguno}"`));
  assert.ok(yml.includes(`echo "${MARCAS.resultado}"`));
  const sonda = leer("scripts/sonda-cascada.mjs").replace(/\/\/[^\n]*/g, "");
  assert.ok(sonda.includes(`console.log("${MARCAS.verdeDeLaSonda}")`));
});

test("el workflow no usa secretos, no apaga el sandbox, no toca TLS y no instala nada", () => {
  const yml = workflow();
  assert.match(yml, /^permissions:\n {2}contents: read$/m);
  assert.doesNotMatch(yml, /secrets\./);
  assert.doesNotMatch(yml, /no-sandbox/);
  assert.doesNotMatch(yml, /ignore-certificate|NODE_TLS_REJECT_UNAUTHORIZED|curl[^\n]* -k\b|--insecure/);
  assert.doesNotMatch(yml, /npm (ci|install)|npx /);
  assert.match(yml, /BASE: https:\/\/operix\.cloud/);
  // Con `shell: bash` Actions pone pipefail: sin él el `| tee` se come el ROJO.
  assert.match(yml, /defaults:\n {2}run:\n {4}shell: bash/);
  assert.match(yml, /node scripts\/sonda-cascada\.mjs --base "\$BASE" --edge "\$NAVEGADOR" \| tee/);
});

test("los inputs entran por env y se validan: nunca se escriben adentro de un run", () => {
  const lineas = workflow().split("\n").filter((l) => l.includes("${{ inputs."));
  assert.ok(lineas.length >= 4);
  for (const l of lineas) {
    assert.match(l, /^(run-name:| {6}[A-Z_]+: \$\{\{ inputs\.[a-z_]+ \}\}$)/, `input interpolado fuera de env: ${l}`);
  }
  const yml = workflow();
  assert.ok(yml.includes('[[ "$SHA_ESPERADO" =~ ^[0-9a-f]{40}$ ]]'));
  assert.ok(yml.includes('[[ "$FASE" =~ ^(pre|post)$ ]]'));
  assert.ok(yml.includes('[[ "$CORRELACION" =~ ^[a-z0-9-]{8,64}$ ]]'));
});

// ── EL TOKEN ──────────────────────────────────────────────────────────────

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sonda-externa-"));
after(() => fs.rmSync(DIR, { recursive: true, force: true }));

function archivoToken(nombre, contenido, modo) {
  const ruta = path.join(DIR, nombre);
  fs.writeFileSync(ruta, contenido);
  fs.chmodSync(ruta, modo);
  return ruta;
}

test("el token: la variable gana, el archivo tiene que ser 600, vacío o ausente es error", () => {
  const bueno = archivoToken("bueno", `${TOKEN}\n`, 0o600);
  assert.equal(leerToken({ env: {}, archivo: bueno }).token, TOKEN);
  assert.equal(leerToken({ env: { SONDA_GITHUB_TOKEN: "otro" }, archivo: bueno }).token, "otro");
  assert.match(leerToken({ env: {}, archivo: path.join(DIR, "no-existe") }).error, /SONDA-EXTERNA\.md/);
  assert.match(leerToken({ env: {}, archivo: archivoToken("abierto", TOKEN, 0o644) }).error, /chmod 600/);
  assert.match(leerToken({ env: {}, archivo: archivoToken("vacio", "\n", 0o600) }).error, /vacío/);
});

test("el token se tapa si apareciera en un texto", () => {
  assert.equal(sinToken(`Bad credentials ${TOKEN}`, TOKEN), "Bad credentials ***");
});

// ── EL CLIENTE ENTERO, CONTRA UN GITHUB DE MENTIRA ────────────────────────

/**
 * El log real, con la línea de fase de una corrida disparada. Es el único cambio,
 * y es la línea EJECUTADA —la que va después de la marca de tiempo—, no la del
 * script repetido, que también la nombra adentro de un `echo`.
 */
const logDeFase = (fase) => LOG_REAL.replace(/(Z )SONDA-EXTERNA FASE autoprueba$/m, `$1${MARCAS.fase} ${fase}`);

function githubDeMentira(config) {
  const pedidos = [];
  let consultas = 0;
  const servidor = http.createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      pedidos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization, cuerpo });
      const json = (status, obj) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(obj === undefined ? "" : JSON.stringify(obj));
      };
      const u = req.url;
      const titulo = () => {
        const i = JSON.parse(pedidos.find((p) => p.metodo === "POST").cuerpo).inputs;
        return config.tituloDeLaCorrida ?? tituloDeLaCorrida({ fase: i.fase, shaEsperado: i.sha_esperado, correlacion: i.correlacion });
      };
      if (req.method === "POST" && u.endsWith(`/actions/workflows/${WORKFLOW}/dispatches`)) {
        if (config.disparo === 204) return json(204);
        if (config.disparo !== 200) return json(config.disparo, { message: config.mensaje });
        return json(200, { workflow_run_id: 77, html_url: "https://github.test/runs/77" });
      }
      if (u.includes(`/actions/workflows/${WORKFLOW}/runs`)) {
        return json(200, { workflow_runs: [{ id: 5, display_title: "otra" }, { id: 77, display_title: titulo(), html_url: "https://github.test/runs/77" }] });
      }
      if (u.endsWith("/actions/runs/77")) {
        consultas++;
        const estados = config.estados || ["queued", "in_progress", "completed"];
        const status = estados[Math.min(consultas - 1, estados.length - 1)];
        return json(200, { id: 77, status, conclusion: status === "completed" ? config.conclusion : null, display_title: titulo(), html_url: "https://github.test/runs/77" });
      }
      if (u.includes("/actions/runs/77/jobs")) return json(200, { jobs: [{ id: 900, name: "sonda" }] });
      if (u.endsWith("/actions/jobs/900/logs")) {
        res.writeHead(302, { Location: `http://127.0.0.1:${servidor.address().port}/almacenamiento/log-firmado?sig=x` });
        return res.end();
      }
      if (u.startsWith("/almacenamiento/")) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end(config.log);
      }
      json(404, { message: "Not Found" });
    });
  });
  return new Promise((r) =>
    servidor.listen(0, "127.0.0.1", () => r({ servidor, pedidos, api: `http://127.0.0.1:${servidor.address().port}` }))
  );
}

async function correr(config, { fase = "pre", sha = SHA, extra = [], env = {} } = {}) {
  const g = await githubDeMentira({ disparo: 200, conclusion: "success", log: logDeFase(fase), ...config });
  const salida = [];
  try {
    const codigo = await principal(
      ["node", "sonda-externa.mjs", "--fase", fase, "--sha-esperado", sha, "--intervalo", "0.001", ...extra],
      { SONDA_GITHUB_API: g.api, SONDA_GITHUB_TOKEN: TOKEN, ...env },
      { escribir: (l) => salida.push(l), dormir: async () => {}, correlacion: "sonda-pre-abc123def456" }
    );
    return { codigo, texto: salida.join("\n"), pedidos: g.pedidos };
  } finally {
    g.servidor.close();
  }
}

test("de punta a punta: dispara, espera, lee el log real y da VERDE con 0", async () => {
  const r = await correr({});
  assert.equal(r.codigo, 0, r.texto);
  assert.match(r.texto, /^VERDE · sonda externa PRE: producción sirve 47d07bbc/m);
  assert.match(r.texto, /estado: queued\nestado: in_progress\nestado: completed/);
  assert.ok(r.texto.includes("sonda de cascada — https://operix.cloud/login"), "no mostró lo que midió");
  const disparo = JSON.parse(r.pedidos[0].cuerpo);
  assert.deepEqual(disparo.inputs, { fase: "pre", sha_esperado: SHA, correlacion: "sonda-pre-abc123def456" });
  assert.equal(disparo.ref, "main");
});

test("el token va a la API y NUNCA al almacenamiento del log, ni a la pantalla", async () => {
  const r = await correr({});
  for (const p of r.pedidos) {
    if (p.url.startsWith("/almacenamiento/")) assert.equal(p.auth, undefined, "le mandó el token al almacenamiento");
    else assert.equal(p.auth, `Bearer ${TOKEN}`);
  }
  assert.ok(r.pedidos.some((p) => p.url.startsWith("/almacenamiento/")), "no siguió la redirección del log");
  assert.ok(!r.texto.includes(TOKEN));
});

test("si GitHub no devuelve el id, encuentra la corrida por su título", async () => {
  const r = await correr({ disparo: 204 });
  assert.equal(r.codigo, 0, r.texto);
  assert.ok(r.pedidos.some((p) => p.url.includes("/runs?event=workflow_dispatch")));
});

test("POST: el mismo log con fase pre no sirve para una POST", async () => {
  const r = await correr({ log: logDeFase("pre") }, { fase: "post" });
  assert.equal(r.codigo, 1);
  assert.match(r.texto, /^ROJO · sonda externa POST: la corrida no es de la fase post/m);
});

test("ROJO si producción sirve otro SHA que el esperado", async () => {
  const r = await correr({}, { sha: OTRO_SHA });
  assert.equal(r.codigo, 1);
  assert.match(r.texto, /^ROJO · .*antes de medir, producción servía 47d07bbc/m);
});

test("ROJO si el job no terminó en success, aunque el log diga VERDE", async () => {
  const r = await correr({ conclusion: "failure" });
  assert.equal(r.codigo, 1);
  assert.match(r.texto, /la corrida terminó en failure/);
});

test("ROJO si la corrida no termina a tiempo", async () => {
  const r = await correr({ estados: ["queued"] }, { extra: ["--espera-maxima", "0.05"] });
  assert.equal(r.codigo, 1);
  assert.match(r.texto, /no terminó en 0\.05 s \(último estado: queued\)/);
});

test("ROJO si la corrida que aparece no es la que se disparó", async () => {
  const r = await correr({ tituloDeLaCorrida: "sonda pre otra-cosa" });
  assert.equal(r.codigo, 1);
  assert.match(r.texto, /no es la que se disparó/);
});

test("ROJO con el motivo si GitHub rechaza el token, y el token no se imprime", async () => {
  const r = await correr({ disparo: 401, mensaje: `Bad credentials ${TOKEN}` });
  assert.equal(r.codigo, 1);
  assert.match(r.texto, /\(401\): el token no sirve/);
  assert.ok(!r.texto.includes(TOKEN));
  assert.match(r.texto, /Bad credentials \*\*\*/);
});

test("ROJO si GitHub no contesta", async () => {
  const salida = [];
  const codigo = await principal(
    ["node", "x", "--fase", "pre", "--sha-esperado", SHA],
    { SONDA_GITHUB_API: "http://127.0.0.1:1", SONDA_GITHUB_TOKEN: TOKEN },
    { escribir: (l) => salida.push(l), dormir: async () => {} }
  );
  assert.equal(codigo, 1);
  assert.match(salida.join("\n"), /^ROJO · sonda externa PRE: no se pudo hablar con GitHub/m);
});

test("sin token es ROJO y no se dispara nada", async () => {
  const r = await correr({}, { env: { SONDA_GITHUB_TOKEN: "" }, extra: ["--token-archivo", path.join(DIR, "no-existe")] });
  assert.equal(r.codigo, 1);
  assert.match(r.texto, /^ROJO · NO SE PUEDE MEDIR: no hay token/m);
  assert.equal(r.pedidos.length, 0);
});

test("corre como lo corre /deploy: el fuente por stdin, con el fetch de verdad", async () => {
  const g = await githubDeMentira({ disparo: 200, conclusion: "success", log: logDeFase("pre") });
  try {
    const hijo = spawn(
      process.execPath,
      ["--input-type=module", "-", "--fase", "pre", "--sha-esperado", SHA, "--intervalo", "0.01"],
      { env: { PATH: process.env.PATH, HOME: DIR, SONDA_GITHUB_API: g.api, SONDA_GITHUB_TOKEN: TOKEN } }
    );
    let texto = "";
    hijo.stdout.on("data", (c) => (texto += c));
    hijo.stderr.on("data", (c) => (texto += c));
    hijo.stdin.end(leer("scripts/sonda-externa.mjs"));
    const codigo = await new Promise((r) => hijo.on("close", r));
    assert.equal(codigo, 0, texto);
    assert.match(texto, /^VERDE · sonda externa PRE/m);
    assert.ok(!texto.includes(TOKEN));
  } finally {
    g.servidor.close();
  }
});

// ── /deploy LA CORRE, Y FRENA ─────────────────────────────────────────────

const SKILL = leer(".claude/skills/deploy/SKILL.md");
const seccion = (desde, hasta) => {
  const i = SKILL.indexOf(desde);
  const j = SKILL.indexOf(hasta, i + 1);
  assert.ok(i > -1 && j > i, `no se encontró la sección «${desde}»`);
  return SKILL.slice(i, j);
};
const COMANDO = "git show origin/main:scripts/sonda-externa.mjs | \\\n  node --input-type=module - ";

test("la PRE está en el paso 0, después del fetch, antes del backup, y frena", () => {
  const paso0 = seccion("## PASO 0", "## Paso 1 — Backup validado");
  const pre = paso0.indexOf(`${COMANDO}--fase pre --sha-esperado "$DESPLEGADO"`);
  assert.ok(pre > -1, "el paso 0 no corre la sonda PRE");
  assert.ok(paso0.indexOf("git fetch origin\n") < pre, "la PRE tiene que ir después del git fetch");
  assert.match(paso0.slice(pre), /Cualquier código distinto de 0 FRENA/);
  assert.match(paso0.slice(pre), /FRENO: la sonda PRE no dio VERDE/);
});

test("la POST está en el paso 5 y sin VERDE el despliegue no se cierra", () => {
  const paso5 = seccion("## Paso 5 — Verificación de cierre", "## Trampas ya conocidas");
  assert.ok(paso5.includes(`${COMANDO}--fase post --sha-esperado <SHA_COMPLETO>`), "el paso 5 no corre la sonda POST");
  assert.match(paso5, /Solo con 0 el despliegue se da por cerrado/);
  assert.match(paso5, /Si da ROJO, el despliegue NO está cerrado/);
});

test("el enlace a la documentación del token resuelve", () => {
  const enlace = SKILL.match(/\]\((\.\.\/\.\.\/\.\.\/docs\/deploy\/SONDA-EXTERNA\.md)\)/);
  assert.ok(enlace, "el skill no enlaza docs/deploy/SONDA-EXTERNA.md");
  assert.ok(fs.existsSync(path.resolve(RAIZ, ".claude/skills/deploy", enlace[1])));
});

test("las guardias de siempre siguen en el procedimiento", () => {
  for (const guardia of [
    "## Las ocho reglas duras",
    "## EL TOPE DE CORTE: 30 SEGUNDOS",
    "### Las dos frenadas, y hay que decir CUÁL de las dos es",
    "TANDAS-BLOQUEADAS.md",
    "MIGRACIONES-SIN-APLICAR.md",
    "## Paso 1 — Backup validado",
    "## Paso 2 — Registrar la referencia de rollback",
    "node scripts/clasificar-migraciones.mjs --vps",
    "### El código de salida de `migrate deploy` NO alcanza",
    "### Los cuatro comandos bloqueados — no los desbloquees sin leer esto",
    "Los cinco valores tienen que dar el **mismo\nSHA completo**",
    "## Rollback sin compilar",
  ]) {
    assert.ok(SKILL.includes(guardia), `se fue del procedimiento: ${guardia}`);
  }
});

// Candados del hook de la guardia de migraciones.
//
// ── POR QUÉ ESTE ARCHIVO NACIÓ DESPUÉS QUE EL DEFECTO ───────────────────────
//
// La DECISIÓN de la guardia tenía candados desde el principio, y son buenos.
// El HOOK no tenía ninguno, y ahí estaba el agujero: el 2026-09-10 el proceso
// moría con un SyntaxError al importar `guardiaMigraciones.js` bajo el Node 18
// del VPS, escribía cero bytes, y sin decisión el `migrate deploy` de producción
// pasaba. Los candados de la decisión seguían todos en verde — probaban una
// función que nunca llegaba a ejecutarse.
//
// Es el caso de CLAUDE.md, regla 2: "los candados prueban piezas, la pantalla
// prueba el camino, y los defectos viven entre las piezas". Acá la pieza estaba
// probada y el camino no.
//
// Por eso todo lo de este archivo EJECUTA el hook como proceso, con el mismo
// payload que le llega de verdad, en vez de importarlo.
//
// Correr con: node --test scripts/hook-guardia-migraciones.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const HOOK = path.join(AQUI, "hook-guardia-migraciones.mjs");

/**
 * EL EVENTO REAL, TEXTUAL.
 *
 * `/deploy` no es un evento propio: es un skill que se expande a una serie de
 * llamadas Bash. La que abre la ventana —y la única que esta guardia tiene que
 * atrapar— es ésta, con el comando entero en `tool_input.command`.
 *
 * Está copiado del despliegue de `f63c0928` a propósito. Un payload inventado
 * probaría que el hook entiende un payload inventado.
 */
const COMANDO_DEL_DEPLOY =
  "docker compose -f /srv/produccion/erpazul/docker-compose.prod.yml " +
  "run --rm -T --no-deps app prisma migrate deploy";

const EVENTO_DEPLOY = {
  session_id: "sim",
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: COMANDO_DEL_DEPLOY, description: "Aplicar migraciones" },
};

/**
 * Un árbol descartable con el hook, la decisión y un clasificador de mentira.
 *
 * El clasificador de verdad sale a buscar el contenedor que atiende, así que
 * usarlo acá ataría los candados a que haya Docker —o ssh— en la máquina que
 * corre la suite. El stub deja elegir el código de salida y el texto, que es lo
 * único que el hook mira.
 */
function arbolConStub({ status, salida = "", romperDecision = false }) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "guardia-"));
  fs.mkdirSync(path.join(raiz, "scripts"));
  fs.mkdirSync(path.join(raiz, "lib", "deploy"), { recursive: true });

  fs.copyFileSync(HOOK, path.join(raiz, "scripts", "hook-guardia-migraciones.mjs"));

  const decision = path.join(ROOT, "lib", "deploy", "guardiaMigraciones.mjs");
  fs.writeFileSync(
    path.join(raiz, "lib", "deploy", "guardiaMigraciones.mjs"),
    romperDecision
      ? "esto no es JavaScript válido {{{"
      : fs.readFileSync(decision, "utf8")
  );

  // El stub ANOTA con qué argumentos lo llamaron. Sin eso, "el hook usa el modo
  // canónico" solo se podría comprobar buscando texto en el archivo, y un
  // candado de texto no ve una constante que cambió de valor.
  fs.writeFileSync(
    path.join(raiz, "scripts", "clasificar-migraciones.mjs"),
    [
      "// stub de candado: no mira nada, anota cómo lo llamaron y contesta",
      'import fs from "node:fs";',
      `fs.writeFileSync(${JSON.stringify(path.join(raiz, "argv.json"))}, JSON.stringify(process.argv.slice(2)));`,
      `process.stdout.write(${JSON.stringify(salida)});`,
      `process.exit(${Number(status)});`,
      "",
    ].join("\n")
  );

  return raiz;
}

/** Con qué argumentos llamó el hook al clasificador, o null si no lo llamó. */
function argvDelClasificador(raiz) {
  const f = path.join(raiz, "argv.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}

/** Corre el hook de un árbol dado con un evento, y devuelve su respuesta. */
function correrHook(raiz, evento) {
  const r = spawnSync(
    process.execPath,
    [path.join(raiz, "scripts", "hook-guardia-migraciones.mjs")],
    { input: JSON.stringify(evento), encoding: "utf8" }
  );
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = null;
  }
  return { ...r, json };
}

function decisionDe(respuesta) {
  return respuesta.json?.hookSpecificOutput?.permissionDecision ?? null;
}

function razonDe(respuesta) {
  return respuesta.json?.hookSpecificOutput?.permissionDecisionReason ?? "";
}

const limpiar = (raiz) => fs.rmSync(raiz, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// 9 · LA GUARDIA RECIBE EL EVENTO REAL DEL DEPLOY Y CONTESTA
// ---------------------------------------------------------------------------

test("EL HOOK CONTESTA AL EVENTO REAL DEL DEPLOY, Y CONTESTA ALGO VÁLIDO", () => {
  const raiz = arbolConStub({ status: 0, salida: "Archivos a mirar: 0\nSin coincidencias." });
  const r = correrHook(raiz, EVENTO_DEPLOY);

  // Que salga con 0 y no escriba nada es EXACTAMENTE el modo en que esta
  // guardia estuvo apagada: Claude Code, sin decisión, deja pasar.
  assert.notEqual(r.stdout.trim(), "", "el hook no escribió una decisión");
  assert.ok(r.json, `la salida no es JSON: ${r.stdout.slice(0, 200)}`);
  assert.equal(r.json.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.ok(["allow", "deny"].includes(decisionDe(r)));
  limpiar(raiz);
});

test("el hook no se cuelga esperando un stdin que no llega más", () => {
  // Si el proceso quedara esperando, el despliegue se frenaría por timeout y el
  // motivo no aparecería en ningún lado.
  const raiz = arbolConStub({ status: 0, salida: "ok" });
  const r = correrHook(raiz, EVENTO_DEPLOY);
  assert.equal(r.status, 0);
  assert.equal(r.signal, null);
  limpiar(raiz);
});

// ---------------------------------------------------------------------------
// Los códigos del clasificador, vistos desde el hook de punta a punta
// ---------------------------------------------------------------------------

test("clasificador en 0: pasa, y la razón trae lo que el clasificador dijo", () => {
  const raiz = arbolConStub({ status: 0, salida: "Archivos a mirar: 1\n  aditiva   x/migration.sql" });
  const r = correrHook(raiz, EVENTO_DEPLOY);
  assert.equal(decisionDe(r), "allow");
  assert.match(razonDe(r), /aditiva/);
  limpiar(raiz);
});

test("clasificador en 1: FRENA, y no hay forma de leerlo como un permiso", () => {
  const raiz = arbolConStub({ status: 1, salida: "FRENO: 1 migración(es) marcada(s)." });
  const r = correrHook(raiz, EVENTO_DEPLOY);
  assert.equal(decisionDe(r), "deny");
  assert.match(razonDe(r), /rompería a la versión/);
  limpiar(raiz);
});

test("clasificador en 2 por SHA irresoluble: FRENA y manda a la ruta explícita", () => {
  const raiz = arbolConStub({
    status: 2,
    salida: "no se pudo establecer qué SHA está atendiendo, ni acá ni por ssh.",
  });
  const r = correrHook(raiz, EVENTO_DEPLOY);
  assert.equal(decisionDe(r), "deny");
  assert.match(razonDe(r), /--desde <SHA_QUE_ESTÁ_ATENDIENDO>/);
  limpiar(raiz);
});

test("clasificador en 2 por rango degenerado: FRENA diciendo que ya está desplegado", () => {
  // No es lo mismo que no poder resolver el SHA, y mandarlo a revisar ssh sería
  // mandarlo a arreglar algo que no está roto.
  const raiz = arbolConStub({
    status: 2,
    salida: "el rango es degenerado: la base y el extremo son el mismo commit (f63c09286971).",
  });
  const r = correrHook(raiz, EVENTO_DEPLOY);
  assert.equal(decisionDe(r), "deny");
  assert.match(razonDe(r), /YA está desplegado/i);
  limpiar(raiz);
});

// ---------------------------------------------------------------------------
// 11 · LA GUARDIA ROTA FRENA. NO DESAPARECE.
// ---------------------------------------------------------------------------

test("SI LA DECISIÓN NO SE PUEDE CARGAR, EL HOOK DENIEGA", () => {
  // Éste es el defecto del 2026-09-10 reproducido: el módulo de la decisión no
  // carga. Antes el proceso moría sin escribir nada y el comando pasaba.
  const raiz = arbolConStub({ status: 0, salida: "ok", romperDecision: true });
  const r = correrHook(raiz, EVENTO_DEPLOY);

  assert.ok(r.json, "un hook que no contesta es un hook apagado");
  assert.equal(decisionDe(r), "deny");
  assert.match(razonDe(r), /no pudo cargarse/);
  limpiar(raiz);
});

test("y si el módulo de la decisión directamente no está, también deniega", () => {
  const raiz = arbolConStub({ status: 0, salida: "ok" });
  fs.rmSync(path.join(raiz, "lib", "deploy", "guardiaMigraciones.mjs"));
  const r = correrHook(raiz, EVENTO_DEPLOY);
  assert.equal(decisionDe(r), "deny");
  assert.match(razonDe(r), /no pudo cargarse/);
  limpiar(raiz);
});

// ---------------------------------------------------------------------------
// Lo que NO es asunto de la guardia sigue pasando sin ruido
// ---------------------------------------------------------------------------

test("un comando cualquiera pasa sin frenar nada", () => {
  const raiz = arbolConStub({ status: 1, salida: "el clasificador ni tendría que correr" });
  const r = correrHook(raiz, { tool_name: "Bash", tool_input: { command: "git status" } });
  assert.equal(decisionDe(r), "allow");
  limpiar(raiz);
});

test("una herramienta que no es Bash pasa sin mirar nada", () => {
  const raiz = arbolConStub({ status: 1, salida: "no corresponde" });
  const r = correrHook(raiz, { tool_name: "Read", tool_input: { file_path: "/x" } });
  assert.equal(decisionDe(r), "allow");
  limpiar(raiz);
});

test("db push se rechaza sin llegar siquiera al clasificador", () => {
  const raiz = arbolConStub({ status: 0, salida: "si esto se lee, el rechazo llegó tarde" });
  const r = correrHook(raiz, { tool_name: "Bash", tool_input: { command: "npx prisma db push" } });
  assert.equal(decisionDe(r), "deny");
  assert.match(razonDe(r), /SIN AUTORIZACIÓN POSIBLE/);
  limpiar(raiz);
});

// ---------------------------------------------------------------------------
// 10 · EL MODO CON EL QUE LLAMA AL CLASIFICADOR
// ---------------------------------------------------------------------------

test("EL HOOK LLAMA AL CLASIFICADOR EN EL MODO CANÓNICO, NO EN --vps", () => {
  // `--vps` fuerza la vía remota. Corrido DENTRO del servidor —que es como se
  // desplegó f63c0928— el alias no resuelve, el clasificador sale con 2 y la
  // guardia deniega todos los despliegues hechos desde ahí. El modo canónico
  // resuelve solo dónde está parado.
  //
  // Se mira lo que el hook HIZO y no lo que dice su código: una constante que
  // cambió de valor no la ve ningún candado de texto.
  const raiz = arbolConStub({ status: 0, salida: "ok" });
  correrHook(raiz, EVENTO_DEPLOY);

  const argv = argvDelClasificador(raiz);
  assert.ok(argv, "el hook no llamó al clasificador");
  assert.ok(argv.includes("--desplegado"), `lo llamó con ${JSON.stringify(argv)}`);
  assert.ok(
    !argv.includes("--vps"),
    "volvió a depender obligatoriamente de la vía remota, que dentro del VPS no resuelve"
  );
  limpiar(raiz);
});

test("y ante un comando que no es migrate deploy, ni siquiera lo llama", () => {
  // Correr el clasificador de más no es gratis: sale a buscar el contenedor que
  // atiende en cada comando de la sesión.
  const raiz = arbolConStub({ status: 0, salida: "ok" });
  correrHook(raiz, { tool_name: "Bash", tool_input: { command: "ls -la" } });
  assert.equal(argvDelClasificador(raiz), null);
  limpiar(raiz);
});

// ---------------------------------------------------------------------------
// EL CANDADO QUE HABRÍA ATRAPADO EL APAGÓN
// ---------------------------------------------------------------------------

test("TODA LA CADENA DE LA GUARDIA ES .mjs MIENTRAS EL REPO NO SEA type:module", () => {
  // El apagón no fue una regla mal escrita: fue una extensión de archivo. Un
  // `.js` con sintaxis ESM, en un repo sin `"type": "module"`, es CommonJS para
  // Node — y sólo 20.19+/22.7+ detectan la sintaxis y lo salvan. En el Node 18
  // del VPS lanza SyntaxError al importarlo, antes de ejecutar nada.
  //
  // Mientras el package.json no diga lo contrario, la cadena entera tiene que
  // ser ESM explícito. Si algún día el repo pasa a `"type": "module"`, este
  // candado deja de tener sentido y hay que borrarlo A PROPÓSITO, no aflojarlo.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.notEqual(
    pkg.type,
    "module",
    "el repo pasó a type:module: revisar este candado en vez de dejarlo pasar"
  );

  const vistos = new Set();
  const pendientes = [HOOK, path.join(AQUI, "clasificar-migraciones.mjs")];
  const malos = [];

  while (pendientes.length) {
    const archivo = pendientes.pop();
    if (vistos.has(archivo)) continue;
    vistos.add(archivo);

    // Los comentarios de estos archivos NOMBRAN el `.js` viejo para contar qué
    // pasó. Un candado que mire texto crudo lo tomaría por código: es el error
    // que ya se cometió tres veces en este repo.
    const src = fs
      .readFileSync(archivo, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");

    for (const m of src.matchAll(/(?:^|\s)(?:import|export)[^;]*?from\s+["'](\.[^"']+)["']/g)) {
      const especificador = m[1];
      const resuelto = path.resolve(path.dirname(archivo), especificador);
      if (!especificador.endsWith(".mjs")) {
        malos.push(`${path.relative(ROOT, archivo)} → ${especificador}`);
        continue;
      }
      if (fs.existsSync(resuelto)) pendientes.push(resuelto);
    }
  }

  assert.deepEqual(
    malos,
    [],
    "la cadena de la guardia volvió a importar algo que no es .mjs:\n  " + malos.join("\n  ")
  );
});

test("y el hook no importa nada de forma estática que no sea de node", () => {
  // La segunda mitad de la misma defensa: aunque toda la cadena sea .mjs, un
  // import estático de algo que falle al cargar vuelve a matar el proceso antes
  // de que pueda contestar. Lo que necesita para decidir se carga adentro de un
  // try/catch.
  const src = fs
    .readFileSync(HOOK, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const estaticos = [...src.matchAll(/(?:^|\s)import[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  for (const e of estaticos) {
    assert.ok(
      e.startsWith("node:"),
      `el hook volvió a importar ${e} de forma estática: si eso no carga, no contesta y el comando pasa`
    );
  }
});

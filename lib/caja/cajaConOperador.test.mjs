// CANDADO: TODA CAJA ES DE UN OPERADOR CON PIN, Y SOLO ÉL LA OPERA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/cajaConOperador.test.mjs
//
// La regla de negocio (2026-10-14): cada caja pertenece a un operador; las
// diferencias de efectivo son individuales y no se compensan entre operadores.
//
// El agujero que esto cierra: una cuenta que no pedía PIN —el dueño, un Admin,
// o un local con `exigirOperador = false`— abría una caja SIN operador, y todos
// los que usaban esa cuenta la compartían. En Mini unidas, las cajas 836 a 872
// se abrieron así con la cuenta de Estefi; con esa misma cuenta se hicieron
// retiros y se cerró la 881 de Belén con un retiro de $46.900.
//
// ROJO si:
//   · se puede abrir una caja (o vender, o reservar el cambio de apertura) sin
//     un operador identificado con PIN — con cualquier cuenta;
//   · alguien que no es el operador de la caja hace un retiro, o un cierre que
//     no es forzado;
//   · el forzado deja de exigir Admin o dueño, o se vuelve un camino para
//     retirar.
//
// Lo que se lee del código se lee SIN COMENTARIOS (CLAUDE.md, regla 5: un
// candado que busca texto encuentra la prosa y da verde por ella).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { puedeResolverCorte, puedeForzarCierre } from "@/lib/caja/cierreRelevo";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** El código, sin comentarios de bloque ni de línea (respeta los `://`). */
function codigo(rel) {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** El cuerpo de una función exportada, hasta la próxima exportación. */
function funcion(rel, nombre) {
  const src = codigo(rel);
  const desde = src.search(new RegExp(`export (async )?function ${nombre}\\b`));
  assert.ok(desde >= 0, `${rel} ya no exporta ${nombre}`);
  const resto = src.slice(desde + 1);
  const hasta = resto.search(/\nexport /);
  return hasta < 0 ? resto : resto.slice(0, hasta);
}

// ── 1. ABRIR CAJA EXIGE OPERADOR CON PIN, A TODOS ─────────────────────────

test("la puerta de la caja no tiene exenciones: ni Admin, ni dueño, ni local sin operario", () => {
  const puerta = funcion("lib/operador.js", "requireOperadorDeCaja");
  assert.match(puerta, /requireOperador\(req, \{ localId \}\)/, "la puerta de la caja tiene que exigir el PIN");
  for (const exencion of ["puedeOperarSinOperador", "getExigirOperador", "esAdmin", "esDuenoLocal"]) {
    assert.ok(!puerta.includes(exencion), `la puerta de la caja volvió a mirar «${exencion}»: eso es una exención`);
  }
});

test("operar una caja es siempre con PIN y nunca sobre la de otro", () => {
  const operar = funcion("lib/caja/identidadCajaServer.js", "identidadParaOperar");
  assert.match(operar, /requireOperadorDeCaja\(req, \{ localId \}\)/);
  assert.match(operar, /puedeIntervenir:\s*false/, "operar con intervención es operar la caja de otro");
  assert.ok(!/requireOperadorSegunConfig|puedeOperarSinOperador/.test(operar));
});

/** Todas las rutas del POS, también las recién escritas sin commitear. */
function rutasDelPos() {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app/api/pos-ventas/**/route.js"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

test("ninguna ruta del POS usa las puertas con exención", () => {
  const rutas = rutasDelPos();
  assert.ok(rutas.length > 20, `se enumeraron ${rutas.length} rutas del POS: la enumeración está mal`);
  const conExencion = rutas.filter((r) => /requireOperadorSegunConfig|requireOperadorSalvoDueno/.test(codigo(r)));
  assert.deepEqual(conExencion, [], "estas rutas del POS dejan operar una caja sin PIN");
});

test("abrir, vender y reservar el cambio de apertura pasan por la puerta de la caja", () => {
  const conPuerta = [
    "app/api/pos-ventas/turnos/abrir/route.js",
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
    "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
    "app/api/pos-ventas/cambios-pendientes/reservar/route.js",
    "app/api/pos-ventas/crear/route.js",
    "app/api/pos-ventas/retiros/iniciar/route.js",
    "app/api/pos-ventas/cierres/iniciar/route.js",
  ];
  for (const r of conPuerta) {
    assert.match(codigo(r), /requireOperadorDeCaja\(req, \{ localId \}\)|identidadParaOperar\(/, `${r} no exige el PIN`);
  }
});

// ── 2. RETIROS Y CIERRES: SOLO EL OPERADOR DE ESA CAJA ────────────────────

const OP_BELEN = 7;
const OP_ESTEFI = 9;
const cajaDeBelen = { id: 881, operadorId: OP_BELEN, vendedorId: 3 };
const cajaSinOperador = { id: 850, operadorId: null, vendedorId: 3 };

test("confirmar o cancelar un corte: el operador de la caja, por su PIN o por la llave", () => {
  assert.equal(puedeResolverCorte(cajaDeBelen, { operadorDelPin: OP_BELEN }), true);
  assert.equal(puedeResolverCorte(cajaDeBelen, { operadorDeLaLlave: OP_BELEN }), true);
  // El caso de la 881: otra persona, con la cuenta que sea.
  assert.equal(puedeResolverCorte(cajaDeBelen, { operadorDelPin: OP_ESTEFI }), false);
  assert.equal(puedeResolverCorte(cajaDeBelen, { operadorDeLaLlave: OP_ESTEFI }), false);
  assert.equal(puedeResolverCorte(cajaDeBelen, {}), false);
  // Una caja sin operador no tiene dueño que se identifique.
  assert.equal(puedeResolverCorte(cajaSinOperador, { operadorDelPin: OP_ESTEFI }), false);
});

test("un Admin o el dueño NO confirman el corte de otro si no es forzado", () => {
  for (const accion of ["confirmar", undefined]) {
    assert.equal(puedeResolverCorte(cajaDeBelen, { puedeForzar: true, forzado: false, accion }), false);
  }
  // Forzado sí: es la única excepción.
  assert.equal(puedeResolverCorte(cajaDeBelen, { puedeForzar: true, forzado: true }), true);
  // Y la marca de forzado sola no abre nada sin quien pueda forzar.
  assert.equal(puedeResolverCorte(cajaDeBelen, { puedeForzar: false, forzado: true, operadorDelPin: OP_ESTEFI }), false);
});

test("forzar: solo quien puede, y nunca sobre la caja propia", () => {
  assert.equal(puedeForzarCierre(cajaDeBelen, { operadorDelPin: OP_ESTEFI, puedeForzar: true }), true);
  assert.equal(puedeForzarCierre(cajaDeBelen, { operadorDelPin: null, puedeForzar: true }), true);
  assert.equal(puedeForzarCierre(cajaSinOperador, { operadorDelPin: null, puedeForzar: true }), true);
  assert.equal(puedeForzarCierre(cajaDeBelen, { operadorDelPin: OP_BELEN, puedeForzar: true }), false);
  for (const valor of [false, undefined, "true", 1]) {
    assert.equal(puedeForzarCierre(cajaDeBelen, { operadorDelPin: OP_ESTEFI, puedeForzar: valor }), false);
  }
});

test("confirmar y cancelar cierres y retiros piden identidad antes de tocar nada", () => {
  for (const r of [
    "app/api/pos-ventas/cierres/[token]/confirmar/route.js",
    "app/api/pos-ventas/cierres/[token]/cancelar/route.js",
    "app/api/pos-ventas/retiros/[token]/confirmar/route.js",
    "app/api/pos-ventas/retiros/[token]/cancelar/route.js",
  ]) {
    const src = codigo(r);
    const tipo = r.includes("/cierres/") ? "cierre" : "retiro";
    const control = src.indexOf("autorizarResolucionDeCorte(");
    const escritura = src.indexOf("prisma.$transaction(");
    assert.ok(control > 0, `${r} no pregunta quién pide`);
    assert.ok(escritura > control, `${r} escribe antes de preguntar quién pide`);
    assert.match(src.slice(control, control + 300), new RegExp(`tipo: "${tipo}"`));
    assert.match(src.slice(control, control + 300), /if \(!autorizado\.ok\)/);
  }
});

test("un retiro no tiene camino forzado", () => {
  const autorizar = funcion("lib/caja/llaveDeCorte.js", "autorizarResolucionDeCorte");
  assert.match(autorizar, /forzado:\s*tipo === "cierre" && forzado === true/);
  for (const r of ["app/api/pos-ventas/retiros/[token]/confirmar/route.js", "app/api/pos-ventas/retiros/iniciar/route.js"]) {
    assert.ok(!/forzado/.test(codigo(r)), `${r} habla de forzado: un retiro no se fuerza`);
  }
});

test("iniciar el cierre normal es solo sobre la caja propia; el forzado exige Admin o dueño", () => {
  const src = codigo("app/api/pos-ventas/cierres/iniciar/route.js");
  assert.ok(!/puedeIntervenir:\s*puedeOperarSinOperador/.test(src), "el cierre normal volvió a intervenir cajas ajenas");
  assert.match(src, /puedeIntervenir:\s*false/);
  const forzado = src.indexOf("if (forzado) {");
  assert.ok(forzado > 0, "el forzado tiene que ser un camino explícito");
  assert.match(src.slice(forzado, forzado + 200), /if \(!puedeOperarSinOperador\(session, \{ localId \}\)\)/);
  // La llave del conteo es del operador: un forzado no la recibe.
  assert.match(src, /if \(!forzado\) \{\s*entregarLlaveDeCorte\(/);
});

test("el forzado queda registrado y la caja sigue siendo del operador original", () => {
  const iniciar = codigo("app/api/pos-ventas/cierres/iniciar/route.js");
  assert.match(iniciar, /forzadoPorUsuarioId: forzado \? session\.id : null/);
  assert.match(iniciar, /iniciadoPorOperadorId: forzado \? null : gateOp\.operadorId/);
  const confirmar = codigo("app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  assert.match(confirmar, /cierreForzadoPorId: filaCierre\.forzadoPorUsuarioId \?\? null/);
  // Confirmar nunca reescribe de quién es la caja.
  assert.ok(!/operadorId:\s*session/.test(confirmar));
  const update = confirmar.slice(confirmar.indexOf("tx.turno.updateMany("), confirmar.indexOf("if (count === 0)"));
  assert.ok(!/\boperadorId\b/.test(update), "el cierre no puede cambiar el operador de la caja");
});

// ── 3. EL POS PIDE EL PIN TAMBIÉN A QUIEN ENTRA SIN PIN ───────────────────

test("cuando una caja pide PIN, el cartel aparece también para Admin y dueño", () => {
  const ctx = codigo("app/context/OperadorContext.jsx");
  const m = ctx.match(/const mostrarModal = ([^;]+);/);
  assert.ok(m, "el contexto dejó de derivar cuándo se muestra el cartel");
  assert.match(m[1], /pinPedido/, "el pedido de una caja tiene que mostrar el cartel");
  assert.ok(!/^!exento &&/.test(m[1].trim()), "la exención no puede tapar el pedido de una caja");
  assert.match(funcion("app/context/OperadorContext.jsx", "OperadorProvider"), /setPinPedido\(true\)/);
});

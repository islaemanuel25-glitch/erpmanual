// CANDADO: TODA CAJA TIENE UN DUEÑO, Y SOLO ÉL LA OPERA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/cajaConOperador.test.mjs
//
// La regla de negocio (2026-10-14): cada caja pertenece a una persona; las
// diferencias de efectivo son individuales y no se compensan entre operadores.
//
// El agujero que esto cierra: una cuenta compartida que no pedía PIN abría una
// caja SIN operador, y todos los que usaban esa cuenta la compartían. En Mini
// unidas, las cajas 836 a 872 se abrieron así con la cuenta de Estefi; con esa
// misma cuenta se hicieron retiros y se cerró la 881 de Belén con un retiro de
// $46.900.
//
// La forma que quedó, con la segunda regla de Emanuel del mismo día:
//   · el dueño del local y el Admin abren y venden SIN PIN: su cuenta hace de
//     operador y la caja (`operaLaCuenta`) es solo de esa cuenta;
//   · cualquier otra cuenta —cajero, y también en un local con
//     `exigirOperador = false`— necesita operador con PIN;
//   · el dueño y el Admin pueden RETIRAR de la caja de otro: queda quién lo
//     hizo (`intervenidoPorUsuarioId`) y el retiro sigue siendo de esa caja;
//   · y pueden FORZAR su cierre, marcado y a nombre del operador original.
//
// ROJO si:
//   · un cajero abre o vende sin PIN;
//   · la caja sin PIN del dueño o Admin queda a nombre de otro, o la usa otro;
//   · un cajero retira o cierra una caja ajena;
//   · el retiro del dueño en caja ajena no registra quién lo hizo, o le cambia
//     el dueño a la diferencia.
//
// Lo que se lee del código se lee SIN COMENTARIOS (CLAUDE.md, regla 5: un
// candado que busca texto encuentra la prosa y da verde por ella).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  puedeResolverCorte,
  puedeForzarCierre,
  esCajaPropia,
  whereCajaPropia,
  puedeActuarSobreCaja,
} from "@/lib/caja/cierreRelevo";

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

// Las identidades del caso. La cuenta 3 es la compartida del mostrador; la 50
// es la del dueño. Belén y Estefi son operadoras con PIN.
const CUENTA_MOSTRADOR = 3;
const CUENTA_DUENO = 50;
const OP_BELEN = 7;
const OP_ESTEFI = 9;
const cajaDeBelen = { id: 881, operadorId: OP_BELEN, vendedorId: CUENTA_MOSTRADOR };
const cajaDelDueno = { id: 900, operadorId: null, vendedorId: CUENTA_DUENO, operaLaCuenta: true };
const cajaDeCuentaVieja = { id: 850, operadorId: null, vendedorId: CUENTA_MOSTRADOR, operaLaCuenta: null };
const duenoSinPin = { usuarioId: CUENTA_DUENO, operadorId: null, cuentaOpera: true };

// ── 1. ABRIR Y VENDER: PIN, O LA CUENTA DEL DUEÑO O ADMIN ─────────────────

test("la puerta de la caja: sin PIN pasa SOLO el dueño o el Admin, nunca por la config del local", () => {
  const puerta = funcion("lib/operador.js", "requireOperadorDeCaja");
  assert.match(puerta, /requireOperador\(req, \{ localId \}\)/, "la puerta tiene que mirar el PIN primero");
  assert.match(
    puerta,
    /if \(puedeOperarSinOperador\(session, \{ localId \}\)\) return \{ ok: true, operadorId: null, cuentaOpera: true \};/,
    "sin PIN, solo el dueño o el Admin, y como cuenta que opera"
  );
  for (const exencion of ["getExigirOperador", "requireOperadorSegunConfig"]) {
    assert.ok(!puerta.includes(exencion), `la puerta de la caja volvió a mirar «${exencion}»: eso exime al cajero`);
  }
  // El PIN manda: si hay uno, la caja es la de ese operador, también en la cuenta del dueño.
  assert.ok(puerta.indexOf("requireOperador(req") < puerta.indexOf("puedeOperarSinOperador("));
});

test("la exención de rol no incluye a cajeros ni locales sin operario obligatorio", async () => {
  const { puedeOperarSinOperador } = await import("@/lib/operador-exencion");
  assert.equal(puedeOperarSinOperador({ esAdmin: true }, { localId: 1 }), true);
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: true, localId: 1 }, { localId: 1 }), true);
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: true, localId: 1 }, { localId: 2 }), false, "dueño en local ajeno");
  assert.equal(puedeOperarSinOperador({ permisos: ["pos.usar"], localId: 1 }, { localId: 1 }), false, "cajero");
  assert.equal(puedeOperarSinOperador({ permisos: ["pos.usar"], localId: 1, exigirOperador: false }, { localId: 1 }), false);
});

test("operar una caja nunca interviene la de otro, y la cuenta que opera viaja en la identidad", () => {
  const operar = funcion("lib/caja/identidadCajaServer.js", "identidadParaOperar");
  assert.match(operar, /requireOperadorDeCaja\(req, session, \{ localId \}\)/);
  assert.match(operar, /cuentaOpera: gate\.cuentaOpera/);
  assert.match(operar, /puedeIntervenir:\s*false/, "operar con intervención es operar la caja de otro");
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

test("ninguna ruta del POS usa las puertas que eximen por la configuración del local", () => {
  const rutas = rutasDelPos();
  assert.ok(rutas.length > 20, `se enumeraron ${rutas.length} rutas del POS: la enumeración está mal`);
  const conExencion = rutas.filter((r) => /requireOperadorSegunConfig|requireOperadorSalvoDueno/.test(codigo(r)));
  assert.deepEqual(conExencion, [], "estas rutas del POS dejan operar una caja sin PIN a un cajero");
});

test("abrir, vender y reservar el cambio pasan por la puerta de la caja", () => {
  for (const r of [
    "app/api/pos-ventas/turnos/abrir/route.js",
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
    "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
    "app/api/pos-ventas/cambios-pendientes/reservar/route.js",
    "app/api/pos-ventas/crear/route.js",
    "app/api/pos-ventas/retiros/iniciar/route.js",
    "app/api/pos-ventas/cierres/iniciar/route.js",
  ]) {
    assert.match(codigo(r), /requireOperadorDeCaja\(req, session, \{ localId \}\)|identidadParaOperar\(/, `${r} no pasa por la puerta`);
  }
});

// ── 2. LA CAJA SIN PIN DEL DUEÑO ES SOLO DE SU CUENTA ─────────────────────

test("la caja que abre el dueño sin PIN queda a nombre de SU cuenta, marcada", () => {
  for (const r of [
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
    "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
  ]) {
    const src = codigo(r);
    const crea = src.slice(src.indexOf("tx.turno.create("), src.indexOf("tx.turno.create(") + 400);
    assert.match(crea, /vendedorId: session\.id,/, `${r}: la caja no queda a nombre de la cuenta que la abre`);
    assert.match(crea, /\.\.\.\(gateOp\.cuentaOpera \? \{ operaLaCuenta: true \} : \{\}\)/, `${r}: la caja de la cuenta no queda marcada`);
  }
  const abrir = codigo("app/api/pos-ventas/turnos/abrir/route.js");
  const crea = abrir.slice(abrir.indexOf("prisma.turno.create("), abrir.indexOf("prisma.turno.create(") + 400);
  assert.match(crea, /vendedorId: session\.id,/);
  assert.match(crea, /\.\.\.\(identidad\.cuentaOpera \? \{ operaLaCuenta: true \} : \{\}\)/);
});

test("la caja del dueño es solo de su cuenta sin PIN: ni otra cuenta, ni un PIN, ni la caja de cuenta vieja", () => {
  assert.equal(esCajaPropia(cajaDelDueno, duenoSinPin), true);
  assert.deepEqual(whereCajaPropia(duenoSinPin), { vendedorId: CUENTA_DUENO, operadorId: null, operaLaCuenta: true });
  // Otra cuenta, aunque también sea de las que operan sin PIN.
  assert.equal(esCajaPropia(cajaDelDueno, { usuarioId: CUENTA_MOSTRADOR, operadorId: null, cuentaOpera: true }), false);
  // Alguien que hace PIN en la cuenta del dueño opera SU caja, no la del dueño.
  assert.equal(esCajaPropia(cajaDelDueno, { usuarioId: CUENTA_DUENO, operadorId: OP_ESTEFI }), false);
  // La caja de cuenta vieja no es de nadie que opere hoy.
  assert.equal(esCajaPropia(cajaDeCuentaVieja, { usuarioId: CUENTA_MOSTRADOR, operadorId: null, cuentaOpera: true }), false);
  // Y el dueño no opera la de Belén.
  assert.equal(puedeActuarSobreCaja(cajaDeBelen, { ...duenoSinPin, puedeIntervenir: false }), false);
});

test("vender: la condición de la caja lleva la cuenta que opera", () => {
  const crear = codigo("app/api/pos-ventas/crear/route.js");
  const usos = crear.match(/whereCajaPropia\(\{[^}]*\}\)/g) || [];
  assert.ok(usos.length >= 2, "la venta dejó de mirar de quién es la caja");
  for (const u of usos) assert.match(u, /cuentaOpera/, `la venta busca la caja sin la cuenta que opera: ${u}`);
});

test("el corte de la caja del dueño lo termina su cuenta, no otra persona en el mismo navegador", () => {
  assert.equal(puedeResolverCorte(cajaDelDueno, { usuarioId: CUENTA_DUENO }), true);
  assert.equal(puedeResolverCorte(cajaDelDueno, { cuentaDeLaLlave: CUENTA_DUENO, operadorDelPin: OP_ESTEFI }), true);
  assert.equal(puedeResolverCorte(cajaDelDueno, { usuarioId: CUENTA_DUENO, operadorDelPin: OP_ESTEFI }), false,
    "con un PIN de otro activo, quien pide es esa persona");
  assert.equal(puedeResolverCorte(cajaDelDueno, { usuarioId: CUENTA_MOSTRADOR }), false);
  assert.equal(puedeResolverCorte(cajaDeCuentaVieja, { usuarioId: CUENTA_MOSTRADOR }), false,
    "la caja de cuenta vieja solo se resuelve forzando");
});

// ── 3. UN CAJERO NO RETIRA NI CIERRA UNA CAJA AJENA ───────────────────────

test("confirmar o cancelar un corte: el operador de la caja, por su PIN o por la llave", () => {
  assert.equal(puedeResolverCorte(cajaDeBelen, { operadorDelPin: OP_BELEN }), true);
  assert.equal(puedeResolverCorte(cajaDeBelen, { operadorDeLaLlave: OP_BELEN }), true);
  // El caso de la 881: otra persona, con la cuenta que sea.
  assert.equal(puedeResolverCorte(cajaDeBelen, { operadorDelPin: OP_ESTEFI, usuarioId: CUENTA_MOSTRADOR }), false);
  assert.equal(puedeResolverCorte(cajaDeBelen, { operadorDeLaLlave: OP_ESTEFI }), false);
  assert.equal(puedeResolverCorte(cajaDeBelen, {}), false);
  // La marca de forzado o intervenido sola no abre nada sin quien pueda forzar.
  assert.equal(puedeResolverCorte(cajaDeBelen, { puedeForzar: false, forzado: true, operadorDelPin: OP_ESTEFI }), false);
});

test("un Admin o el dueño NO terminan el corte normal de otro: solo el forzado o el intervenido", () => {
  assert.equal(puedeResolverCorte(cajaDeBelen, { puedeForzar: true, forzado: false }), false);
  assert.equal(puedeResolverCorte(cajaDeBelen, { puedeForzar: true, forzado: true }), true);
});

test("forzar: solo quien puede, y nunca sobre la caja propia", () => {
  assert.equal(puedeForzarCierre(cajaDeBelen, { operadorDelPin: OP_ESTEFI, puedeForzar: true }), true);
  assert.equal(puedeForzarCierre(cajaDeBelen, { usuarioId: CUENTA_DUENO, puedeForzar: true }), true);
  assert.equal(puedeForzarCierre(cajaDeCuentaVieja, { usuarioId: CUENTA_DUENO, puedeForzar: true }), true);
  assert.equal(puedeForzarCierre(cajaDeBelen, { operadorDelPin: OP_BELEN, puedeForzar: true }), false);
  assert.equal(puedeForzarCierre(cajaDelDueno, { usuarioId: CUENTA_DUENO, puedeForzar: true }), false, "la propia se cierra normal");
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
    const llamada = src.slice(control, control + 400);
    assert.match(llamada, new RegExp(`tipo: "${tipo}"`));
    // La única marca que abre el camino de Admin o dueño es la del propio corte.
    const marca = tipo === "cierre" ? /forzado: cierre\.forzadoPorUsuarioId != null/ : /forzado: retiro\.intervenidoPorUsuarioId != null/;
    assert.match(llamada, marca, `${r}: la excepción no sale de la marca del corte`);
    assert.match(llamada, /if \(!autorizado\.ok\)/);
  }
});

test("iniciar el cierre normal es solo sobre la caja propia; el forzado exige Admin o dueño", () => {
  const src = codigo("app/api/pos-ventas/cierres/iniciar/route.js");
  assert.ok(!/puedeIntervenir:\s*puedeOperarSinOperador/.test(src), "el cierre normal volvió a intervenir cajas ajenas");
  assert.match(src, /puedeIntervenir:\s*false/);
  const forzado = src.indexOf("if (forzado) {");
  assert.ok(forzado > 0, "el forzado tiene que ser un camino explícito");
  assert.match(src.slice(forzado, forzado + 200), /if \(!puedeOperarSinOperador\(session, \{ localId \}\)\)/);
  assert.match(src, /if \(!forzado\) \{\s*entregarLlaveDeCorte\(/, "la llave es del dueño de la caja, no de quien fuerza");
});

test("el retiro en caja ajena: solo intervención del Admin o el dueño, y arqueo y movimiento no la abren", () => {
  const ctx = funcion("lib/caja/arqueoServer.js", "contextoArqueo");
  assert.match(ctx, /permitirIntervencion = false/, "la intervención tiene que estar apagada por defecto");
  assert.match(ctx, /intervenido = exigirAbierto && permitirIntervencion && puedeOperarSinOperador\(session, \{ localId \}\);/);
  // Solo el inicio del retiro la pide.
  const conIntervencion = rutasDelPos().filter((r) => /permitirIntervencion:\s*true/.test(codigo(r)));
  assert.deepEqual(conIntervencion, ["app/api/pos-ventas/retiros/iniciar/route.js"]);
});

// ── 4. EL RETIRO DEL DUEÑO EN CAJA AJENA: QUIÉN, Y LA DIFERENCIA DE LA CAJA ─

test("el retiro intervenido registra quién lo hizo y no se atribuye a otro operador", () => {
  const src = codigo("app/api/pos-ventas/retiros/iniciar/route.js");
  assert.match(src, /intervenidoPorUsuarioId: intervenido \? session\.id : null/, "el retiro en caja ajena no dice quién lo hizo");
  assert.match(src, /iniciadoPorOperadorId: intervenido \? null :/, "el retiro en caja ajena se atribuye a quien lo hizo");
  assert.match(src, /if \(!intervenido\) \{\s*entregarLlaveDeCorte\(/);
});

test("la diferencia del retiro sigue siendo de la caja: el arqueo cae al operador del turno", () => {
  const src = codigo("app/api/pos-ventas/retiros/[token]/confirmar/route.js");
  assert.match(src, /operadorId: retiro\.iniciadoPorOperadorId \?\? vigente\.operadorId \?\? null/);
  assert.match(src, /usuarioId: vigente\.vendedorId/, "el arqueo dejó de ser de la caja");
  assert.ok(!/turno\.update(Many)?\([^)]*operadorId/.test(src), "confirmar un retiro no puede cambiar el dueño de la caja");
});

test("el forzado queda registrado y la caja sigue siendo del operador original", () => {
  const iniciar = codigo("app/api/pos-ventas/cierres/iniciar/route.js");
  assert.match(iniciar, /forzadoPorUsuarioId: forzado \? session\.id : null/);
  assert.match(iniciar, /iniciadoPorOperadorId: forzado \? null : gateOp\.operadorId/);
  const confirmar = codigo("app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  assert.match(confirmar, /cierreForzadoPorId: filaCierre\.forzadoPorUsuarioId \?\? null/);
  const update = confirmar.slice(confirmar.indexOf("tx.turno.updateMany("), confirmar.indexOf("if (count === 0)"));
  assert.ok(!/\boperadorId\b/.test(update), "el cierre no puede cambiar el operador de la caja");
});

// ── 5. EL POS PIDE EL PIN A QUIEN LO NECESITA ─────────────────────────────

test("cuando una caja pide PIN, el cartel aparece aunque la cuenta entre sin PIN al sistema", () => {
  const ctx = codigo("app/context/OperadorContext.jsx");
  const m = ctx.match(/const mostrarModal = ([^;]+);/);
  assert.ok(m, "el contexto dejó de derivar cuándo se muestra el cartel");
  assert.match(m[1], /pinPedido/, "el pedido de una caja tiene que mostrar el cartel");
  assert.ok(!/^!exento &&/.test(m[1].trim()), "la exención no puede tapar el pedido de una caja");
});

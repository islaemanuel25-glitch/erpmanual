// Candados de "cerrar la caja cierra la sesión de PIN".
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// La #951 de Mini unidas (dom 18/10) se abrió a las 00:06 a nombre de Belen,
// vendió de 00:06 a 00:12 y no volvió a vender hasta las 08:32. La sesión de PIN
// es una cookie firmada de 8 horas que el cierre no invalidaba en el servidor:
// solo la borraba la pestaña del POS si le llegaba la señal. Con la cookie viva,
// `requireOperadorDeCaja` abría una caja NUEVA a su nombre sin PIN.
//
// ── LO QUE SE AFIRMA, CON LAS FUNCIONES REALES ─────────────────────────────
//
// `lib/prisma.js` usa `global.prisma` fuera de producción: acá es una base en
// memoria con un solo operador, así que corren `requireOperadorDeCaja`,
// `invalidarSesionDeOperador`, `/api/operador/me` y `verificarVoucherOperador`
// tal cual las usan las rutas. Las rutas de cierre se afirman leyendo su fuente
// (que invaliden adentro de la transacción y limpien la cookie al contestar).
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test lib/operadorSesionTrasCierre.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.AUTH_SECRET ||= "candado-sesion-operador";

// La base en memoria: el operador A del local 2.
const OPERADOR_A = { id: 7, nombre: "Belen", activo: true, localId: 2, sesionInvalidadaEn: null };
const filas = new Map([[OPERADOR_A.id, { ...OPERADOR_A }]]);
const proyectar = (fila, select) => (fila ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]])) : null);
globalThis.prisma = {
  operadorLocal: {
    findUnique: async ({ where, select }) => proyectar(filas.get(where.id), select),
    updateMany: async ({ where, data }) => {
      const f = filas.get(where.id);
      if (!f) return { count: 0 };
      Object.assign(f, data);
      return { count: 1 };
    },
  },
};

const {
  firmarTokenOperador, firmarVoucherOperador, verificarVoucherOperador,
  requireOperadorDeCaja, invalidarSesionDeOperador, limpiarCookieDeOperadorCerrado, OperadorCookie,
} = await import("@/lib/operador");
const { sesionDeOperadorVigente, emitidoEnDelToken } = await import("@/lib/operador-sesion");
const { GET: me } = await import("../app/api/operador/me/route.js");
const { NextResponse } = await import("next/server");

const RAIZ = process.cwd();
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const fuente = (r) => sinComentarios(fs.readFileSync(path.join(RAIZ, r), "utf8"));

/** Lo que hace `/api/operador/login` al validar el PIN: token y voucher. */
function ponerPin() {
  const datos = { operadorId: OPERADOR_A.id, nombre: OPERADOR_A.nombre, localId: OPERADOR_A.localId };
  return { token: firmarTokenOperador(datos), voucher: firmarVoucherOperador({ operadorId: OPERADOR_A.id, localId: OPERADOR_A.localId }) };
}
const pedidoCon = (token) => new Request("http://x/api/pos-ventas/crear", { headers: { cookie: `${OperadorCookie.nombre}=${token}` } });
// Un cajero: sin PIN no tiene caja. Es el rol de Belen.
const CAJERO = { id: 50, esAdmin: false, esDuenoLocal: false, localId: 2, permisos: ["pos.usar"] };
const puertaDeLaCaja = (token) => requireOperadorDeCaja(pedidoCon(token), CAJERO, { localId: 2 });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test("1. A pone PIN, abre y vende sin volver a ponerlo; la cierra; con la cookie vieja no abre ni vende; con PIN nuevo sí", async () => {
  filas.get(OPERADOR_A.id).sesionInvalidadaEn = null;
  const primera = ponerPin();

  // Abre su caja con el PIN, y mientras está abierta vende sin volver a ponerlo.
  for (let i = 0; i < 3; i++) {
    const r = await puertaDeLaCaja(primera.token);
    assert.equal(r.ok, true, `la venta ${i + 1} con la caja abierta pidió PIN`);
    assert.equal(r.operadorId, OPERADOR_A.id);
  }

  // Cierra la caja: lo que hacen las tres rutas de cierre adentro de su transacción.
  await esperar(2);
  await invalidarSesionDeOperador(globalThis.prisma, OPERADOR_A.id, new Date());

  // Con la cookie vieja —otro dispositivo, o la pestaña sin la señal— no hay
  // operador: 428, que es lo que hace que el POS pida el PIN. No abre caja ni vende.
  const vieja = await puertaDeLaCaja(primera.token);
  assert.equal(vieja.ok, false, "la cookie de antes del cierre siguió abriendo cajas");
  assert.equal(vieja.status, 428);
  assert.equal(vieja.needsOperador, true);

  // Y el POS, al preguntar quién está, ve "sin operador" y la cookie se borra.
  const resMe = await me(pedidoCon(primera.token));
  const cuerpo = await resMe.json();
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.operador, null);
  assert.equal(cuerpo.voucher, undefined, "se firmó un voucher para una sesión cerrada");
  assert.match(resMe.headers.get("set-cookie") || "", new RegExp(`${OperadorCookie.nombre}=;.*Max-Age=0`, "i"));

  // A pone el PIN de nuevo: abre su caja.
  await esperar(2);
  const segunda = ponerPin();
  const nueva = await puertaDeLaCaja(segunda.token);
  assert.equal(nueva.ok, true, "el PIN puesto después del cierre no abrió caja");
  assert.equal(nueva.operadorId, OPERADOR_A.id);
  // La de antes sigue sin valer, aunque haya una sesión nueva.
  assert.equal((await puertaDeLaCaja(primera.token)).ok, false);
});

test("2. la venta offline con el voucher de antes del cierre se sigue atribuyendo a A", async () => {
  filas.get(OPERADOR_A.id).sesionInvalidadaEn = null;
  const { voucher } = ponerPin();
  await esperar(2);
  await invalidarSesionDeOperador(globalThis.prisma, OPERADOR_A.id, new Date());
  // El voucher no pasa por la sesión: prueba que A estuvo activo, y eso no cambia.
  assert.equal(verificarVoucherOperador(voucher, 2), OPERADOR_A.id);
  assert.equal(verificarVoucherOperador(voucher, 3), null, "el voucher sirvió en otro local");
});

test("3. la regla pura: vale si nunca se cerró o si se emitió después; un token sin instante no vale", () => {
  const corte = new Date("2026-10-18T19:05:00.000Z");
  assert.equal(sesionDeOperadorVigente({ emitidoEn: corte.getTime() - 1, sesionInvalidadaEn: null }), true);
  assert.equal(sesionDeOperadorVigente({ emitidoEn: corte.getTime() - 1, sesionInvalidadaEn: corte }), false);
  assert.equal(sesionDeOperadorVigente({ emitidoEn: corte.getTime(), sesionInvalidadaEn: corte }), false);
  assert.equal(sesionDeOperadorVigente({ emitidoEn: corte.getTime() + 1, sesionInvalidadaEn: corte }), true);
  assert.equal(sesionDeOperadorVigente({ emitidoEn: null, sesionInvalidadaEn: corte }), false);
  // Los tokens de antes de esta regla no traen `emitidoEn`: se toma su `iat`, en segundos.
  assert.equal(emitidoEnDelToken({ iat: 1760814000 }), 1760814000000);
  assert.equal(emitidoEnDelToken({ emitidoEn: 1760814000123, iat: 1760814000 }), 1760814000123);
});

test("4. el navegador que cerró queda sin ese operador; si ahí hay otro identificado, no se toca", async () => {
  filas.get(OPERADOR_A.id).sesionInvalidadaEn = null;
  const { token } = ponerPin();
  const deA = NextResponse.json({ ok: true });
  limpiarCookieDeOperadorCerrado(pedidoCon(token), deA, OPERADOR_A.id);
  assert.match(deA.headers.get("set-cookie") || "", new RegExp(`${OperadorCookie.nombre}=;.*Max-Age=0`, "i"));
  const deOtro = NextResponse.json({ ok: true });
  limpiarCookieDeOperadorCerrado(pedidoCon(token), deOtro, 99);
  assert.equal(deOtro.headers.get("set-cookie"), null, "se borró la sesión de otro operador");
});

test("5. los tres cierres invalidan la sesión adentro de su transacción y limpian la cookie al contestar", async () => {
  const RUTAS = [
    "app/api/pos-ventas/turnos/cerrar/route.js",
    "app/api/pos-ventas/cierres/[token]/confirmar/route.js",
    "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js",
  ];
  for (const r of RUTAS) {
    // Que la ruta CARGUE: leer la fuente no ve un `const` declarado dos veces,
    // y la primera versión de este cambio lo tenía en dos de las tres.
    const mod = await import(path.join(RAIZ, r));
    assert.equal(typeof mod.POST, "function", `${r}: no exporta POST`);
    const src = fuente(r);
    const cierra = src.search(/tx\.turno\.updateMany\(\{[\s\S]*?cierre: ahora/);
    const invalida = src.indexOf("await invalidarSesionDeOperador(tx, turno.operadorId, ahora)");
    assert.ok(cierra > 0, `${r}: no encontré el cierre`);
    assert.ok(invalida > cierra, `${r}: no invalida la sesión después de cerrar, con el mismo tx`);
    // Adentro de la transacción: después de que se abre y antes de que se cierre.
    const abre = src.lastIndexOf("$transaction(", invalida);
    const cierraTx = src.slice(invalida).search(/\},\s*(LIMITES_TRANSACCION_DEL_LOCAL|OPCIONES_TX)\)/);
    assert.ok(abre > 0 && abre < invalida && cierraTx > 0, `${r}: invalida fuera de la transacción`);
    assert.match(src, /limpiarCookieDeOperadorCerrado\(req, respuesta, /, `${r}: no limpia la cookie al contestar`);
    assert.match(src, /return respuesta;/);
  }
  // Y la puerta mira la vigencia: lo único que lee `requireOperadorDeCaja`.
  const op = fuente("lib/operador.js");
  const delLocal = op.slice(op.indexOf("export async function getOperadorActivoDelLocal"), op.indexOf("export async function requireOperador("));
  assert.match(delLocal, /sesionInvalidadaEn: true/);
  assert.match(delLocal, /sesionDeOperadorVigente\(\{ emitidoEn: op\.emitidoEn, sesionInvalidadaEn: operador\.sesionInvalidadaEn \}\)/);
  // El login firma con `firmarTokenOperador`, que es quien pone `emitidoEn`.
  assert.match(fuente("app/api/operador/login/route.js"), /firmarTokenOperador\(\{/);
  assert.match(op, /emitidoEn: Date\.now\(\)/);
  // El voucher no se tocó: no mira la sesión.
  const voucher = op.slice(op.indexOf("export function verificarVoucherOperador"), op.indexOf("export async function requireOperadorSalvoDueno"));
  assert.doesNotMatch(voucher, /sesion/i);
});

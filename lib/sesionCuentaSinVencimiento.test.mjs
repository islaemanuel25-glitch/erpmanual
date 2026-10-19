// Candados de "la sesión de la cuenta no vence por reloj".
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// El token de la cuenta vencía a las 8 horas: una Sunmi prendida más que eso
// pedía el mail y la contraseña en plena venta. Desde ahora no vence por reloj
// y lo valida el servidor en cada pedido (`proxy.js`): el usuario existe, está
// activo, y la sesión es posterior a su `sesionInvalidadaEn`.
//
// ── LO QUE SE AFIRMA, CON LAS FUNCIONES REALES ─────────────────────────────
//
// `lib/prisma.js` usa `global.prisma` fuera de producción: acá es una base en
// memoria. Corren el `proxy` real, `getUsuarioSession`, `/api/me` y
// `/api/logout` tal cual; el token se firma como lo firma `/api/login`.
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test lib/sesionCuentaSinVencimiento.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

process.env.AUTH_SECRET ||= "candado-sesion-cuenta";

const USUARIO = {
  id: 50, nombre: "Cuenta Mini unidas", email: "mini@x.test", rolId: 3, localId: 2, activo: true, sesionInvalidadaEn: null,
  rol: { nombre: "CAJERO", esSistema: true, permisos: ["pos.usar"] },
  local: { es_deposito: false },
};
const usuarios = new Map();
const reiniciar = () => usuarios.set(USUARIO.id, structuredClone(USUARIO));
reiniciar();
const proyectar = (fila, select) =>
  fila ? Object.fromEntries(Object.keys(select).map((k) => [k, select[k]?.select ? proyectar(fila[k], select[k].select) : fila[k]])) : null;
globalThis.prisma = {
  usuario: { findUnique: async ({ where, select }) => proyectar(usuarios.get(where.id), select) },
  local: { findUnique: async () => ({ es_deposito: false }) },
  configuracionLocal: { findUnique: async () => null },
};

const { SesionCookie, getUsuarioSession, firmarTokenDeSesion, firmarToken } = await import("@/lib/auth");
const { payloadDeSesion } = await import("@/lib/sesionCuenta");
const { proxy } = await import("../proxy.js");
const { GET: me } = await import("../app/api/me/route.js");
const { POST: logout } = await import("../app/api/logout/route.js");
const { NextRequest } = await import("next/server");

const RAIZ = process.cwd();
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const fuente = (r) => sinComentarios(fs.readFileSync(path.join(RAIZ, r), "utf8"));

const NUEVE_HORAS = 9 * 60 * 60 * 1000;
/** Lo que hace `/api/login` al validar la contraseña, con el reloj `ms` atrás. */
function entrarHace(ms) {
  const real = Date.now;
  Date.now = () => real() - ms;
  try {
    return firmarTokenDeSesion(payloadDeSesion(usuarios.get(USUARIO.id)));
  } finally {
    Date.now = real;
  }
}
const pedidoCon = (token, url = "/api/me") =>
  new NextRequest(`http://x${url}`, { headers: token ? { cookie: `${SesionCookie.nombre}=${token}` } : {} });

/** Un pedido como lo atiende el servidor: primero el proxy, después la ruta. */
async function pasarPorElProxy(req) {
  const res = await proxy(req);
  return { req, res, setCookie: res.headers.getSetCookie() };
}
const sesionTrasProxy = async (token) => getUsuarioSession((await pasarPorElProxy(pedidoCon(token))).req);
const meTrasProxy = async (token) => (await me((await pasarPorElProxy(pedidoCon(token))).req)).json();

test("1. con la sesión abierta, pasadas 9 horas las rutas siguen respondiendo sin pedir login", async () => {
  reiniciar();
  const token = entrarHace(NUEVE_HORAS);
  assert.equal(jwt.decode(token).exp, undefined, "el token de la cuenta vence por reloj");
  const { setCookie } = await pasarPorElProxy(pedidoCon(token));
  assert.deepEqual(setCookie, [], "el proxy tocó una sesión que vale");
  const sesion = await sesionTrasProxy(token);
  assert.equal(sesion?.id, USUARIO.id, "a las 9 horas la ruta no ve la sesión");
  const yo = await meTrasProxy(token);
  assert.equal(yo.ok, true);
  assert.equal(yo.user.id, USUARIO.id);
  // La cookie dura lo que guarda un navegador.
  assert.ok(SesionCookie.opciones.maxAge >= 30 * 24 * 60 * 60, "la cookie de la cuenta vence antes que la sesión");
});

test("2. después de cerrar sesión, pide login", async () => {
  reiniciar();
  const res = await logout();
  assert.match(res.headers.getSetCookie().find((l) => l.startsWith(`${SesionCookie.nombre}=`)) || "", /Max-Age=0/i);
  // Sin la cookie, la ruta no ve a nadie: el cliente va al login.
  assert.equal(await sesionTrasProxy(null), null);
  assert.equal((await meTrasProxy(null)).ok, false);
});

test("3. un usuario desactivado queda afuera aunque tenga la cookie", async () => {
  reiniciar();
  const token = entrarHace(60_000);
  usuarios.get(USUARIO.id).activo = false;
  const { req, setCookie } = await pasarPorElProxy(pedidoCon(token));
  assert.equal(getUsuarioSession(req), null, "un usuario desactivado siguió entrando con su cookie");
  assert.equal((await me(req).then((r) => r.json())).ok, false);
  assert.match(setCookie.find((l) => l.startsWith(`${SesionCookie.nombre}=`)) || "", /Max-Age=0/i, "la cookie no se borró");
  // Y uno que ya no existe, igual.
  usuarios.delete(USUARIO.id);
  assert.equal(await sesionTrasProxy(token), null);
});

test("4. con la contraseña cambiada, la sesión vieja queda afuera; la de después del cambio entra", async () => {
  reiniciar();
  const vieja = entrarHace(60_000);
  usuarios.get(USUARIO.id).sesionInvalidadaEn = new Date();
  assert.equal(await sesionTrasProxy(vieja), null, "la sesión de antes del cambio de contraseña siguió entrando");
  await new Promise((r) => setTimeout(r, 2));
  const nueva = entrarHace(0);
  assert.equal((await sesionTrasProxy(nueva))?.id, USUARIO.id);
});

test("5. si cambian los permisos del rol, la foto se renueva sin rejuvenecer la sesión", async () => {
  reiniciar();
  const token = entrarHace(NUEVE_HORAS);
  usuarios.get(USUARIO.id).rol.permisos = ["pos.usar", "caja.retirar"];
  const { req, setCookie } = await pasarPorElProxy(pedidoCon(token));
  assert.deepEqual(getUsuarioSession(req).permisos, ["pos.usar", "caja.retirar"], "el cambio de rol no llegó a la sesión");
  const renovada = setCookie.find((l) => l.startsWith(`${SesionCookie.nombre}=`));
  assert.ok(renovada && !/Max-Age=0/i.test(renovada), "el navegador no recibió la sesión renovada");
  const nuevo = jwt.decode(renovada.split(";")[0].slice(SesionCookie.nombre.length + 1));
  assert.equal(nuevo.emitidoEn, jwt.decode(token).emitidoEn, "renovar la foto rejuveneció la sesión");
  assert.equal(nuevo.exp, undefined);
  // Y un token de antes de esta regla, con `exp` todavía vigente, pasa a no vencer.
  const deAntes = firmarToken(payloadDeSesion(usuarios.get(USUARIO.id)));
  const pasado = (await pasarPorElProxy(pedidoCon(deAntes))).setCookie.find((l) => l.startsWith(`${SesionCookie.nombre}=`));
  assert.equal(jwt.decode(pasado.split(";")[0].slice(SesionCookie.nombre.length + 1)).exp, undefined);
});

test("6. un token de otro tipo no se renueva como sesión; sin cookie el proxy no consulta la base", async () => {
  reiniciar();
  const pin = jwt.sign({ id: USUARIO.id, operadorId: 7, _tipo: "operador" }, process.env.AUTH_SECRET);
  assert.deepEqual((await pasarPorElProxy(pedidoCon(pin))).setCookie, []);
  const real = globalThis.prisma.usuario.findUnique;
  let consultas = 0;
  globalThis.prisma.usuario.findUnique = async (a) => (consultas++, real(a));
  await pasarPorElProxy(pedidoCon(null));
  globalThis.prisma.usuario.findUnique = real;
  assert.equal(consultas, 0);
});

test("7. cambiar la contraseña y desactivar escriben la marca; el login firma sin vencimiento", () => {
  const editar = fuente("app/api/usuarios/editar/[id]/route.js");
  const pass = editar.slice(editar.indexOf("data.passwordHash = await bcrypt.hash("), editar.indexOf("if (body?.rolId"));
  assert.match(pass, /data\.sesionInvalidadaEn = new Date\(\);/, "cambiar la contraseña no corta las sesiones viejas");
  assert.match(editar, /if \(data\.activo === false\) data\.sesionInvalidadaEn = new Date\(\);/);
  for (const r of ["app/api/usuarios/eliminar/[id]/route.js", "app/api/usuarios/eliminarPorEmail/route.js"]) {
    assert.match(fuente(r), /data: \{ activo: false, sesionInvalidadaEn: new Date\(\) \}/, `${r}: desactivar no corta las sesiones`);
  }
  const login = fuente("app/api/login/route.js");
  assert.match(login, /const token = firmarTokenDeSesion\(payload\);/);
  assert.doesNotMatch(login, /firmarToken\(/, "el login volvió a firmar con vencimiento");
  // El vencimiento de los otros tokens no cambió: la llave de corte y el voucher.
  assert.match(fuente("lib/auth.js"), /return jwt\.sign\(payload, process\.env\.AUTH_SECRET, \{ expiresIn: MAX_AGE \}\);/);
});

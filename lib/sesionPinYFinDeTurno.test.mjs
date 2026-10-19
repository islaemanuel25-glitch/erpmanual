// Candados de "la sesión de PIN no vence por reloj" y "terminado el turno, la
// caja se cierra".
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// La sesión de PIN vencía a las 8 horas: un turno largo pedía el PIN a mitad de
// la caja. Y una caja que no se cerró al terminar su turno se siguió usando en
// el turno siguiente (la #951).
//
// ── LO QUE SE AFIRMA, CON LAS FUNCIONES REALES ─────────────────────────────
//
// `lib/prisma.js` usa `global.prisma` fuera de producción: acá es una base en
// memoria, así que corren `requireOperadorDeCaja`, `/api/operador/logout`,
// `estadoDeFinDeTurno` y `verificarVoucherOperador` tal cual las usan las rutas.
// La ruta de venta, la de retiro y las de cierre se afirman leyendo su fuente;
// el camino entero se ejerció contra Postgres (ver el commit).
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test lib/sesionPinYFinDeTurno.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

process.env.AUTH_SECRET ||= "candado-sesion-y-fin-de-turno";

const LOCAL = 2;
const OPERADOR_A = { id: 7, nombre: "Belen", activo: true, localId: LOCAL, sesionInvalidadaEn: null };
const operadores = new Map([[OPERADOR_A.id, { ...OPERADOR_A }]]);
// El catálogo de un local con dos turnos, y las ventas de cada caja.
const CATALOGO = [
  { id: 1, localId: LOCAL, nombre: "Mañana", orden: 1, activo: true, horaInicioReconocimiento: "06:00", horaFinReconocimiento: "10:00" },
  { id: 2, localId: LOCAL, nombre: "Tarde", orden: 2, activo: true, horaInicioReconocimiento: "14:00", horaFinReconocimiento: "18:00" },
];
const ventas = [];
const proyectar = (fila, select) => (fila ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]])) : null);
globalThis.prisma = {
  operadorLocal: {
    findUnique: async ({ where, select }) => proyectar(operadores.get(where.id), select),
    updateMany: async ({ where, data }) => {
      const f = operadores.get(where.id);
      if (!f) return { count: 0 };
      Object.assign(f, data);
      return { count: 1 };
    },
  },
  turnoOperativo: {
    findMany: async ({ where }) => CATALOGO.filter((t) => t.localId === where.localId && (where.activo == null || t.activo === where.activo)),
  },
  venta: {
    count: async ({ where }) => ventas.filter((v) => v.turnoId === where.turnoId && v.fecha >= where.fecha.gte).length,
  },
};

const {
  firmarTokenOperador, firmarVoucherOperador, verificarVoucherOperador,
  requireOperadorDeCaja, invalidarSesionDeOperador, OperadorCookie,
} = await import("@/lib/operador");
const { finDeLaOcurrencia } = await import("@/lib/caja/turnoOperativo");
const { estadoDeFinDeTurno, finDelTurnoDeLaCaja } = await import("@/lib/caja/turnoOperativoServer");
const { POST: logout } = await import("../app/api/operador/logout/route.js");

const RAIZ = process.cwd();
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const fuente = (r) => sinComentarios(fs.readFileSync(path.join(RAIZ, r), "utf8"));

const NUEVE_HORAS = 9 * 60 * 60 * 1000;
/** El PIN puesto hace `ms`: lo que hace `/api/operador/login`, con el reloj atrás. */
function pinPuestoHace(ms) {
  const real = Date.now;
  Date.now = () => real() - ms;
  try {
    const datos = { operadorId: OPERADOR_A.id, nombre: OPERADOR_A.nombre, localId: LOCAL };
    return { token: firmarTokenOperador(datos), voucher: firmarVoucherOperador({ operadorId: OPERADOR_A.id, localId: LOCAL }) };
  } finally {
    Date.now = real;
  }
}
const pedidoCon = (token) =>
  new Request("http://x/api/pos-ventas/crear", { headers: token ? { cookie: `${OperadorCookie.nombre}=${token}` } : {} });
const CAJERO = { id: 50, esAdmin: false, esDuenoLocal: false, localId: LOCAL, permisos: ["pos.usar"] };
const puertaDeLaCaja = (token) => requireOperadorDeCaja(pedidoCon(token), CAJERO, { localId: LOCAL });

// ── A. La sesión de PIN ────────────────────────────────────────────────────

test("A1. con la caja abierta, el operador sigue vendiendo pasadas 9 horas sin que le pida PIN", async () => {
  operadores.get(OPERADOR_A.id).sesionInvalidadaEn = null;
  const { token } = pinPuestoHace(NUEVE_HORAS);
  assert.equal(jwt.decode(token).exp, undefined, "el token de operador vence por reloj");
  for (let i = 0; i < 3; i++) {
    const r = await puertaDeLaCaja(token);
    assert.equal(r.ok, true, `a las 9 horas, la venta ${i + 1} pidió PIN`);
    assert.equal(r.operadorId, OPERADOR_A.id);
  }
  // La cookie no se va antes que la sesión: dura lo que guarda un navegador.
  assert.ok(OperadorCookie.opciones.maxAge >= 30 * 24 * 60 * 60, "la cookie de PIN vence antes que la sesión");
});

test("A2. después de salir (logout) pide PIN; si vuelve a entrar, pone el PIN de nuevo", async () => {
  operadores.get(OPERADOR_A.id).sesionInvalidadaEn = null;
  const res = await logout();
  assert.match(res.headers.get("set-cookie") || "", new RegExp(`${OperadorCookie.nombre}=;.*Max-Age=0`, "i"), "salir no borra la cookie");
  // Sin la cookie no hay operador: 428, que es lo que hace que el POS pida el PIN.
  const sin = await puertaDeLaCaja(null);
  assert.equal(sin.ok, false);
  assert.equal(sin.status, 428);
  assert.equal(sin.needsOperador, true);
  assert.equal((await puertaDeLaCaja(pinPuestoHace(0).token)).ok, true);
});

test("A3. después de cerrar la caja, la sesión vieja da 428 aunque no venza por reloj", async () => {
  operadores.get(OPERADOR_A.id).sesionInvalidadaEn = null;
  const { token, voucher } = pinPuestoHace(NUEVE_HORAS);
  await invalidarSesionDeOperador(globalThis.prisma, OPERADOR_A.id, new Date());
  const vieja = await puertaDeLaCaja(token);
  assert.equal(vieja.ok, false, "la sesión de antes del cierre siguió abriendo cajas");
  assert.equal(vieja.status, 428);
  // La venta offline con el voucher sigue atribuida a quien la cobró.
  assert.equal(verificarVoucherOperador(voucher, LOCAL), OPERADOR_A.id);
});

test("A4. el JWT principal no se tocó: sigue con su vencimiento; el voucher tampoco", () => {
  const auth = fuente("lib/auth.js");
  assert.match(auth, /export function firmarToken\(payload\) \{\s*return jwt\.sign\(payload, process\.env\.AUTH_SECRET, \{ expiresIn: MAX_AGE \}\);/);
  const op = fuente("lib/operador.js");
  const firma = op.slice(op.indexOf("export function firmarTokenOperador"), op.indexOf("export async function invalidarSesionDeOperador"));
  assert.doesNotMatch(firma, /firmarToken\(|expiresIn/, "el token de operador vuelve a vencer por reloj");
  const voucher = op.slice(op.indexOf("export function verificarVoucherOperador"), op.indexOf("export async function requireOperadorSalvoDueno"));
  assert.match(voucher, /verificarTokenIgnorandoVencimiento\(voucher\)/);
});

// ── B. El fin del turno de la caja ─────────────────────────────────────────

test("B1. el turno termina cuando empieza otro; el último, cuando vuelve a empezar el primero", () => {
  assert.deepEqual(finDeLaOcurrencia(CATALOGO, { turnoOperativoId: 1, fechaOperativa: "2026-10-18" }), { fecha: "2026-10-18", minuto: 14 * 60 });
  assert.deepEqual(finDeLaOcurrencia(CATALOGO, { turnoOperativoId: 2, fechaOperativa: "2026-10-18" }), { fecha: "2026-10-19", minuto: 6 * 60 });
  // La fecha llega de la columna DATE como medianoche UTC.
  assert.deepEqual(finDeLaOcurrencia(CATALOGO, { turnoOperativoId: 2, fechaOperativa: new Date("2026-10-18T00:00:00.000Z") }), { fecha: "2026-10-19", minuto: 6 * 60 });
  // Uno solo, que cruza la medianoche: su jornada del 18 empezó el 17 a las 22 y
  // termina cuando vuelve a empezar, el 18 a las 22.
  const noche = [{ id: 9, orden: 1, activo: true, horaInicioReconocimiento: "22:00", horaFinReconocimiento: "02:00" }];
  assert.deepEqual(finDeLaOcurrencia(noche, { turnoOperativoId: 9, fechaOperativa: "2026-10-18" }), { fecha: "2026-10-18", minuto: 22 * 60 });
});

test("B2. una caja sin turno operativo no termina nunca; tampoco una cuyo turno se desactivó", async () => {
  assert.equal(finDeLaOcurrencia(CATALOGO, { turnoOperativoId: null, fechaOperativa: null }), null);
  assert.equal(finDeLaOcurrencia(CATALOGO.map((t) => ({ ...t, activo: t.id !== 1 })), { turnoOperativoId: 1, fechaOperativa: "2026-10-18" }), null);
  const sinTurno = { id: 30, localId: LOCAL, turnoOperativoId: null, fechaOperativa: null };
  ventas.push({ turnoId: 30, fecha: new Date("2030-01-01T00:00:00Z") });
  assert.deepEqual(await estadoDeFinDeTurno(globalThis.prisma, sinTurno, new Date("2030-01-02T00:00:00Z")), { terminado: false, bloqueaVenta: false, fin: null });
});

test("B3. terminado el turno, la venta en curso entra y la siguiente queda bloqueada hasta cerrar", async () => {
  // La caja de la Mañana del 18: termina a las 14:00 de Argentina, 17:00 UTC.
  const caja = { id: 40, localId: LOCAL, turnoOperativoId: 1, fechaOperativa: new Date("2026-10-18T00:00:00.000Z") };
  const fin = await finDelTurnoDeLaCaja(globalThis.prisma, caja);
  assert.equal(fin.toISOString(), "2026-10-18T17:00:00.000Z");
  // Antes del fin, nada.
  assert.deepEqual(await estadoDeFinDeTurno(globalThis.prisma, caja, new Date("2026-10-18T16:59:00Z")), { terminado: false, bloqueaVenta: false, fin });
  // Vendió a las 13:30; terminado el turno, la venta que estaba en curso pasa.
  ventas.push({ turnoId: 40, fecha: new Date("2026-10-18T16:30:00Z") });
  const enCurso = await estadoDeFinDeTurno(globalThis.prisma, caja, new Date("2026-10-18T17:05:00Z"));
  assert.equal(enCurso.terminado, true);
  assert.equal(enCurso.bloqueaVenta, false, "la venta en curso no se pudo terminar");
  // Esa venta entró después del fin: la siguiente se rechaza.
  ventas.push({ turnoId: 40, fecha: new Date("2026-10-18T17:05:00Z") });
  assert.equal((await estadoDeFinDeTurno(globalThis.prisma, caja, new Date("2026-10-18T17:06:00Z"))).bloqueaVenta, true, "terminado el turno se siguió vendiendo");
});

test("B4. la venta da 409 TURNO_TERMINADO con la caja ya validada; retiro y cierre no pasan por el fin de turno", () => {
  const crear = fuente("app/api/pos-ventas/crear/route.js");
  const valida = crear.indexOf("const turnoValido = await prisma.turno.findFirst(");
  const mira = crear.indexOf("const finDeTurno = await estadoDeFinDeTurno(prisma, turnoValido);");
  const formaPago = crear.indexOf("if (!formaPago)");
  assert.ok(valida > 0 && mira > valida && formaPago > mira, "el fin de turno no se mira entre la caja validada y la venta");
  const rechazo = crear.slice(mira, formaPago);
  assert.match(rechazo, /if \(finDeTurno\.bloqueaVenta\)/);
  assert.match(rechazo, /code: CODIGO_RECHAZO_VENTA\.TURNO_TERMINADO/);
  assert.match(rechazo, /\{ status: 409 \}/);
  assert.match(crear, /select: \{ \.\.\.SELECT_FIN_DE_TURNO, apertura: true \}/, "la caja validada no trae su turno operativo");
  for (const r of [
    "app/api/pos-ventas/retiros/iniciar/route.js",
    "app/api/pos-ventas/retiros/registrar/route.js",
    "app/api/pos-ventas/retiros/[token]/confirmar/route.js",
    "app/api/pos-ventas/cierres/iniciar/route.js",
    "app/api/pos-ventas/cierres/[token]/confirmar/route.js",
    "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js",
    "app/api/pos-ventas/turnos/cerrar/route.js",
  ]) {
    assert.doesNotMatch(fuente(r), /estadoDeFinDeTurno|finDelTurnoDeLaCaja|TURNO_TERMINADO/, `${r}: retirar o cerrar quedó atado al fin de turno`);
  }
  // El POS se entera por el turno actual, con la misma regla.
  const actual = fuente("app/api/pos-ventas/turnos/actual/route.js");
  assert.match(actual, /estadoDeFinDeTurno\(prisma, turno\)/);
  assert.match(actual, /finDelTurno: finDeTurno\?\.fin \?\? null/);
});

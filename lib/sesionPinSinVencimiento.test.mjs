// Candados de "la sesión de PIN no vence por reloj", y de que el horario del
// turno operativo NO corta la venta.
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// La sesión de PIN vencía a las 8 horas: un turno largo pedía el PIN a mitad de
// la caja. Eso sigue resuelto (7b4f742).
//
// La misma tanda bloqueaba la venta al terminar el turno operativo de la caja
// (409 TURNO_TERMINADO). Emanuel lo marcó como error: una caja abierta a las
// 07:05 en el turno mañana quedó bloqueada a las 14:00 en punto. El horario del
// turno es un RANGO que dice a qué turno pertenece la caja, no una hora de
// corte; la caja se cierra cuando el operador se va. El bloqueo se sacó entero.
//
// ── LO QUE SE AFIRMA, CON LAS FUNCIONES REALES ─────────────────────────────
//
// `lib/prisma.js` usa `global.prisma` fuera de producción: acá es una base en
// memoria, así que corren `requireOperadorDeCaja`, `/api/operador/logout`,
// `verificarVoucherOperador` y la ruta de venta `/api/pos-ventas/crear` tal cual.
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test lib/sesionPinSinVencimiento.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

process.env.AUTH_SECRET ||= "candado-sesion-pin";

const LOCAL = 2;
const OPERADOR_A = { id: 7, nombre: "Belen", activo: true, localId: LOCAL, sesionInvalidadaEn: null };
const operadores = new Map([[OPERADOR_A.id, { ...OPERADOR_A }]]);
// El catálogo del local: mañana de 06:00 a 10:00, tarde de 14:00 a 18:00.
const CATALOGO = [
  { id: 1, localId: LOCAL, nombre: "Mañana", orden: 1, activo: true, horaInicioReconocimiento: "06:00", horaFinReconocimiento: "10:00" },
  { id: 2, localId: LOCAL, nombre: "Tarde", orden: 2, activo: true, horaInicioReconocimiento: "14:00", horaFinReconocimiento: "18:00" },
];
// La caja de A: abierta hoy, del turno mañana de AYER. Así el "fin" de su turno
// —el comienzo de la tarde— ya pasó, sea la hora que sea cuando corre esto.
const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const CAJA = {
  id: 40, localId: LOCAL, operadorId: OPERADOR_A.id, vendedorId: 50, operaLaCuenta: false,
  apertura: new Date(), cierre: null, cierreEnPreparacionEn: null, anuladoEn: null,
  turnoOperativoId: 1, fechaOperativa: new Date(`${ayer}T00:00:00.000Z`),
};
const proyectar = (fila, select) => (fila ? (select ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]])) : { ...fila }) : null);

// Lo que la ruta de venta lee antes de validar el pago. Todo lo demás contesta
// vacío: si la ruta llega a preguntarlo, es que pasó la caja.
const consultas = [];
const vacio = new Proxy({}, {
  get: (_, metodo) => async () => {
    if (metodo === "count") return 0;
    if (metodo === "findMany") return [];
    return null;
  },
});
const base = {
  operadorLocal: {
    findUnique: async ({ where, select }) => proyectar(operadores.get(where.id), select),
    updateMany: async ({ where, data }) => {
      const f = operadores.get(where.id);
      if (!f) return { count: 0 };
      Object.assign(f, data);
      return { count: 1 };
    },
  },
  grupoLocal: { findFirst: async () => ({ grupoId: 1 }), findUnique: async () => ({ grupoId: 1 }) },
  turno: { findFirst: async ({ select }) => proyectar(CAJA, select) },
  turnoOperativo: { findMany: async () => CATALOGO },
  // Muchas ventas después de las 14:00 de ayer: con el bloqueo, esto era el 409.
  venta: { count: async () => 5, findUnique: async () => null, findFirst: async () => null },
};
globalThis.prisma = new Proxy(base, {
  get: (b, modelo) => {
    if (typeof modelo !== "string" || modelo.startsWith("$")) return b[modelo];
    consultas.push(modelo);
    return b[modelo] ?? vacio;
  },
});

const {
  firmarTokenOperador, firmarVoucherOperador, verificarVoucherOperador,
  requireOperadorDeCaja, invalidarSesionDeOperador, OperadorCookie,
} = await import("@/lib/operador");
const { firmarTokenDeSesion, SesionCookie } = await import("@/lib/auth");
const { POST: logout } = await import("../app/api/operador/logout/route.js");
const { POST: crear } = await import("../app/api/pos-ventas/crear/route.js");

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

test("A4. el token de operador no vence por reloj; el voucher sigue ignorando el vencimiento", () => {
  const auth = fuente("lib/auth.js");
  assert.match(auth, /export function firmarToken\(payload\) \{\s*return jwt\.sign\(payload, process\.env\.AUTH_SECRET, \{ expiresIn: MAX_AGE \}\);/);
  const op = fuente("lib/operador.js");
  const firma = op.slice(op.indexOf("export function firmarTokenOperador"), op.indexOf("export async function invalidarSesionDeOperador"));
  assert.doesNotMatch(firma, /firmarToken\(|expiresIn/, "el token de operador vuelve a vencer por reloj");
  const voucher = op.slice(op.indexOf("export function verificarVoucherOperador"), op.indexOf("export async function requireOperadorSalvoDueno"));
  assert.match(voucher, /verificarTokenIgnorandoVencimiento\(voucher\)/);
});

// ── B. El horario del turno no corta la venta ──────────────────────────────

test("B1. una caja con turno operativo vende pasada la hora de fin de su turno, sin 409", async () => {
  operadores.get(OPERADOR_A.id).sesionInvalidadaEn = null;
  const sesion = firmarTokenDeSesion({ id: CAJERO.id, permisos: CAJERO.permisos, localId: LOCAL });
  const { token: pin } = pinPuestoHace(0);
  // Sin forma de pago, a propósito: la ruta la valida DESPUÉS de todas las
  // validaciones de la caja. Llegar a ese 400 es haber pasado la caja, sin
  // escribir ninguna venta.
  const res = await crear(
    new Request("http://x/api/pos-ventas/crear", {
      method: "POST",
      headers: { cookie: `${SesionCookie.nombre}=${sesion}; ${OperadorCookie.nombre}=${pin}`, "content-type": "application/json" },
      body: JSON.stringify({ turnoId: CAJA.id, items: [] }),
    })
  );
  const cuerpo = await res.json();
  assert.notEqual(res.status, 409, `terminado el turno, la venta dio 409: ${cuerpo.code ?? ""} ${cuerpo.error ?? ""}`);
  assert.notEqual(cuerpo.code, "TURNO_TERMINADO");
  assert.equal(res.status, 400, `la venta no llegó a validar el pago: ${res.status} ${cuerpo.error ?? ""}`);
  assert.equal(cuerpo.error, "Forma de pago requerida");
});

test("B2. no queda rastro del corte por horario en la venta, el POS ni el turno actual", () => {
  const RASTRO = /TURNO_TERMINADO|estadoDeFinDeTurno|finDelTurnoDeLaCaja|finDeLaOcurrencia|MENSAJE_TURNO_TERMINADO|finDelTurno|turnoTerminado/;
  for (const r of [
    "app/api/pos-ventas/crear/route.js",
    "app/api/pos-ventas/turnos/actual/route.js",
    "app/modulos/pos-ventas/page.jsx",
    "lib/caja/turnoOperativo.js",
    "lib/caja/turnoOperativoServer.js",
    "lib/pos-ventas/rechazoVenta.js",
  ]) {
    assert.doesNotMatch(fuente(r), RASTRO, `${r}: volvió el corte de la caja por el horario del turno`);
  }
});

// Candados de "cerrar la sesión de la cuenta borra el operador".
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// Desde que la sesión de PIN no vence por reloj (7b4f742), `/api/logout` borraba
// solo la cookie de la cuenta: quien salía y volvía a entrar seguía identificado
// como el operador anterior sin poner el PIN. Regla (Emanuel): si sale y vuelve
// a entrar, pone el PIN de nuevo. Salir NO cierra la caja: con el PIN, el
// operador vuelve a la suya.
//
// ── LO QUE SE AFIRMA, CON LAS FUNCIONES REALES ─────────────────────────────
//
// Un navegador de mentira guarda las cookies y aplica los `Set-Cookie` de las
// rutas reales —`/api/logout` y `/api/operador/me`—; `lib/prisma.js` usa
// `global.prisma` fuera de producción, acá una base en memoria.
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test lib/logoutCuentaBorraOperador.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.AUTH_SECRET ||= "candado-logout-cuenta";

const LOCAL = 2;
const OPERADOR_A = { id: 7, nombre: "Belen", activo: true, localId: LOCAL, sesionInvalidadaEn: null };
const operadores = new Map([[OPERADOR_A.id, { ...OPERADOR_A }]]);
// La caja de A, abierta. Salir de la cuenta no la toca.
const CAJA_DE_A = { id: 959, localId: LOCAL, operadorId: OPERADOR_A.id, vendedorId: 50, cierre: null, cierreEnPreparacionEn: null, anuladoEn: null };
const proyectar = (fila, select) => (fila ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]])) : null);
globalThis.prisma = {
  operadorLocal: {
    findUnique: async ({ where, select }) => proyectar(operadores.get(where.id), select),
    updateMany: async () => ({ count: 0 }),
  },
};

const { firmarToken, SesionCookie } = await import("@/lib/auth");
const { firmarTokenOperador, requireOperadorDeCaja, OperadorCookie } = await import("@/lib/operador");
const { esCajaPropia } = await import("@/lib/caja/cierreRelevo");
const { POST: logoutCuenta } = await import("../app/api/logout/route.js");
const { GET: me } = await import("../app/api/operador/me/route.js");

/** Un navegador: guarda cookies y aplica lo que le contestan. */
function navegador() {
  const frasco = new Map();
  return {
    frasco,
    poner: (nombre, valor) => frasco.set(nombre, valor),
    aplicar(res) {
      for (const linea of res.headers.getSetCookie()) {
        const [par, ...attrs] = linea.split(";");
        const [nombre, ...v] = par.split("=");
        const borrar = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
        if (borrar) frasco.delete(nombre.trim());
        else frasco.set(nombre.trim(), v.join("="));
      }
    },
    pedido: (url) =>
      new Request(`http://x${url}`, {
        headers: { cookie: [...frasco].map(([k, v]) => `${k}=${v}`).join("; ") },
      }),
  };
}
const CAJERO = { id: 50, esAdmin: false, esDuenoLocal: false, localId: LOCAL, permisos: ["pos.usar"] };
const entrarALaCuenta = (nav) => nav.poner(SesionCookie.nombre, firmarToken({ id: CAJERO.id, permisos: CAJERO.permisos, localId: LOCAL }));
const ponerPin = (nav) => nav.poner(OperadorCookie.nombre, firmarTokenOperador({ operadorId: OPERADOR_A.id, nombre: OPERADOR_A.nombre, localId: LOCAL }));

test("1. con operador identificado, el logout de la cuenta devuelve las dos cookies borradas", async () => {
  const nav = navegador();
  entrarALaCuenta(nav);
  ponerPin(nav);
  const res = await logoutCuenta(nav.pedido("/api/logout"));
  const borradas = res.headers.getSetCookie();
  for (const nombre of [SesionCookie.nombre, OperadorCookie.nombre]) {
    const linea = borradas.find((l) => l.startsWith(`${nombre}=`));
    assert.ok(linea, `el logout no borra ${nombre}`);
    assert.match(linea, /Max-Age=0/i, `${nombre} no se borra`);
    // Con las mismas opciones con que se pone: si no, el navegador no la pisa.
    assert.match(linea, /Path=\//i);
    assert.match(linea, /SameSite=lax/i);
    assert.match(linea, /HttpOnly/i);
  }
  nav.aplicar(res);
  assert.equal(nav.frasco.size, 0, "quedó una cookie viva después de salir");
});

test("2. después de volver a entrar a la cuenta, /api/operador/me contesta sin operador; con PIN de nuevo vuelve a su caja abierta", async () => {
  const nav = navegador();
  entrarALaCuenta(nav);
  ponerPin(nav);
  // Antes de salir: A identificado.
  assert.equal((await (await me(nav.pedido("/api/operador/me"))).json()).operador?.operadorId, OPERADOR_A.id);

  nav.aplicar(await logoutCuenta(nav.pedido("/api/logout")));
  entrarALaCuenta(nav);
  const sin = await (await me(nav.pedido("/api/operador/me"))).json();
  assert.equal(sin.ok, false);
  assert.equal(sin.operador, null, "volvió a entrar a la cuenta y el operador siguió identificado sin PIN");
  // Y la caja no se le abre sin PIN: 428, que es lo que hace que el POS lo pida.
  const puerta = await requireOperadorDeCaja(nav.pedido("/api/pos-ventas/crear"), CAJERO, { localId: LOCAL });
  assert.equal(puerta.status, 428);

  // Pone el PIN de nuevo: es A otra vez, y su caja —que salir no cerró— es suya.
  ponerPin(nav);
  const con = await requireOperadorDeCaja(nav.pedido("/api/pos-ventas/crear"), CAJERO, { localId: LOCAL });
  assert.equal(con.ok, true);
  assert.equal(con.operadorId, OPERADOR_A.id);
  assert.equal(CAJA_DE_A.cierre, null);
  assert.equal(esCajaPropia(CAJA_DE_A, { usuarioId: CAJERO.id, operadorId: con.operadorId }), true, "con el PIN no vuelve a su caja");
});

test("3. el cierre de sesión del cliente recarga la página: el estado del operador no sobrevive en memoria ni en almacenamiento", () => {
  const sin = (r) => fs.readFileSync(path.join(process.cwd(), r), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const ctx = sin("app/context/UserContext.jsx");
  const salir = ctx.slice(ctx.indexOf("const logout = async"), ctx.indexOf("return ("));
  assert.match(salir, /fetch\("\/api\/logout"/);
  assert.match(salir, /window\.location\.href = "\/login"/, "salir dejó de recargar: el operador anterior quedaría en memoria");
  // El operador vive solo en el estado de React: nada que recargar no borre.
  assert.doesNotMatch(sin("hooks/useOperadorActivo.js"), /localStorage|sessionStorage|indexedDB/);
});

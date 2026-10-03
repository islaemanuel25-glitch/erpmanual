// EL MOTOR DE SINCRONIZACIÓN DE LA COLA OFFLINE, EJERCIDO ENTERO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/sincronizacionOffline.test.mjs
//
// El servidor de acá es un doble con las reglas que importan para el motor:
// registrar devuelve el estado del cobro, crear escribe la venta y deja el
// cobro SINCRONIZADO, y cada caso puede cambiar la respuesta de crear o cortar
// la red. Las reglas DE VERDAD del servidor las ejerce
// scripts/pruebas-db/cobrosOffline.mjs con el mismo motor contra PostgreSQL.
//
// Las letras son las de los casos del pedido de PR B.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sincronizarCola,
  candadoEntrePestanas,
  cuerpoDeReplay,
  verificarCierreConCola,
  pendientesQueBloqueanCierre,
  mensajeDeSincronizacion,
  estadoParaMostrar,
  ESTADO_LOCAL,
  RESULTADO_SINCRONIZACION as R,
  MOTIVO_CIERRE_BLOQUEADO,
} from "@/lib/pos-ventas/sincronizacionOffline";
import { nombreClienteDeTicket } from "@/lib/pos-ventas/ticketOffline";

const LOCAL = 1;

const venta = (id, { turnoId = 10, operadorId = 7, localId = LOCAL, operadorNombre = "Ana" } = {}) => ({
  clientVentaId: id,
  createdAt: 1,
  localId,
  grupoId: 3,
  userId: 2,
  formaPago: "efectivo",
  subtotal: 100,
  descuento: 0,
  descuentoPorPuntos: 0,
  total: 100,
  clienteId: null,
  operadorId,
  operadorVoucher: `voucher-${operadorId}`,
  operadorNombre,
  turnoId,
  items: [{ productoBaseId: 1, nombre: "P", precio: 100, cantidad: 1 }],
});

/** La cola en memoria, con la misma forma que la del navegador. */
function colaEnMemoria(items, { legible = true } = {}) {
  const c = {
    items: items.map((i) => ({ ...i })),
    escrituras: 0,
    leer: () => (legible ? { ok: true, items: c.items.map((i) => ({ ...i })) } : { ok: false }),
    marcar: (id, sync) => {
      c.escrituras += 1;
      c.items = c.items.map((i) => (i.clientVentaId === id ? { ...i, sync } : i));
      return { ok: true };
    },
    quitar: (id) => {
      c.escrituras += 1;
      c.items = c.items.filter((i) => i.clientVentaId !== id);
      return { ok: true };
    },
    ids: () => c.items.map((i) => i.clientVentaId),
    de: (id) => c.items.find((i) => i.clientVentaId === id),
  };
  return c;
}

/** El servidor: cobros y ventas por id, y un registro de cada llamada. */
function servidor() {
  const s = {
    cobros: new Map(),
    ventas: new Map(),
    llamadas: [],
    red: true,
    /** Para cambiar la respuesta de crear en un caso: (cuerpo) => respuesta | undefined. */
    alCrear: null,
    /** Locales ajenos: un id que ya es de otro local. */
    idsDeOtroLocal: new Set(),
  };
  s.api = {
    registrar: async (item) => {
      s.llamadas.push(["registrar", item.clientVentaId]);
      if (!s.red) return { red: false };
      const id = item.clientVentaId;
      if (s.idsDeOtroLocal.has(id)) {
        return { red: true, status: 200, data: { ok: true, resultados: [{ clientTxnId: id, resultado: "RECHAZADO", codigo: "ID_DE_OTRO_LOCAL" }] } };
      }
      let cobro = s.cobros.get(id);
      let resultado = "YA_REGISTRADO";
      if (!cobro) {
        cobro = { estado: item.turnoId ? "PENDIENTE" : "REQUIERE_REVISION", turnoId: item.turnoId };
        s.cobros.set(id, cobro);
        resultado = "CREADO";
      }
      // Reconciliación: la venta existe en su caja.
      const v = s.ventas.get(id);
      if (cobro.estado === "PENDIENTE" && v && v.turnoId === cobro.turnoId) {
        cobro.estado = "SINCRONIZADA";
        resultado = "RECONCILIADO";
      }
      return { red: true, status: 200, data: { ok: true, resultados: [{ clientTxnId: id, resultado, estado: cobro.estado }] } };
    },
    crear: async (cuerpo) => {
      s.llamadas.push(["crear", cuerpo.clientTxnId, cuerpo]);
      if (!s.red) return { red: false };
      const especial = s.alCrear?.(cuerpo);
      if (especial) return especial;
      return s.escribirVenta(cuerpo);
    },
  };
  s.escribirVenta = (cuerpo) => {
    s.ventas.set(cuerpo.clientTxnId, { turnoId: cuerpo.turnoId });
    const cobro = s.cobros.get(cuerpo.clientTxnId);
    if (cobro && cobro.estado === "PENDIENTE") cobro.estado = "SINCRONIZADA";
    return { red: true, status: 200, data: { ok: true, ventaId: s.ventas.size } };
  };
  s.de = (tipo) => s.llamadas.filter((l) => l[0] === tipo).map((l) => l[1]);
  return s;
}

const correr = (cola, srv, extra = {}) =>
  sincronizarCola({ cola, api: srv.api, localId: LOCAL, operadorActivoId: 7, ahora: () => 123, ...extra });

// ── B. grupoId y contexto: el motor no necesita nada fuera del ítem ──────────

test("B: el pedido de la venta sale entero del ítem: id, turno, voucher, origen offline, líneas sin recalcular", () => {
  const item = venta("b1");
  const cuerpo = cuerpoDeReplay(item, 10);
  assert.deepEqual(cuerpo, {
    clientTxnId: "b1",
    localId: LOCAL,
    clienteId: null,
    turnoId: 10,
    formaPago: "efectivo",
    esFiado: false,
    descuento: 0,
    descuentoPorPuntos: 0,
    puntosCanje: 0,
    origenOffline: true,
    operadorVoucher: "voucher-7",
    items: item.items,
  });
  assert.equal(cuerpo.items, item.items, "las líneas viajan tal cual, sin recalcular precios");
});

// ── C. Reconexión con tres ventas ───────────────────────────────────────────

test("C: tres ventas: cada una se registra ANTES de su venta, en orden, y sale de la cola confirmada", async () => {
  const cola = colaEnMemoria([venta("v1"), venta("v2"), venta("v3")]);
  const srv = servidor();
  const r = await correr(cola, srv);
  assert.equal(r.resultado, R.COMPLETA);
  assert.equal(r.sincronizadas, 3);
  assert.deepEqual(cola.ids(), []);
  assert.deepEqual(
    srv.llamadas.map((l) => `${l[0]}:${l[1]}`),
    ["registrar:v1", "crear:v1", "registrar:v1", "registrar:v2", "crear:v2", "registrar:v2", "registrar:v3", "crear:v3", "registrar:v3"]
  );
  for (const [, , cuerpo] of srv.llamadas.filter((l) => l[0] === "crear")) {
    assert.equal(cuerpo.turnoId, 10, "a la caja donde se cobró");
    assert.equal(cuerpo.origenOffline, true);
  }
});

test("C: una sola venta por vez: crear no arranca hasta que terminó la anterior", async () => {
  const cola = colaEnMemoria([venta("v1"), venta("v2")]);
  const srv = servidor();
  let enVuelo = 0;
  let maximo = 0;
  const crear = srv.api.crear;
  srv.api.crear = async (c) => {
    enVuelo += 1;
    maximo = Math.max(maximo, enVuelo);
    await new Promise((ok) => setTimeout(ok, 5));
    const res = await crear(c);
    enVuelo -= 1;
    return res;
  };
  await correr(cola, srv);
  assert.equal(maximo, 1);
});

// ── D. Se pierde la respuesta ──────────────────────────────────────────────

test("D: la venta se escribió y la respuesta no llegó: queda en la cola, y la próxima la reconcilia sin crear otra", async () => {
  const cola = colaEnMemoria([venta("d1")]);
  const srv = servidor();
  srv.alCrear = (c) => {
    srv.escribirVenta(c);
    return { red: false };
  };
  const r1 = await correr(cola, srv);
  assert.equal(r1.resultado, R.SIN_RED);
  assert.deepEqual(cola.ids(), ["d1"], "sin confirmación no se borra");
  srv.alCrear = null;
  const r2 = await correr(cola, srv);
  assert.equal(r2.resultado, R.COMPLETA);
  assert.equal(r2.sincronizadas, 1);
  assert.deepEqual(cola.ids(), []);
  assert.deepEqual(srv.de("crear"), ["d1"], "la segunda vez no se pidió la venta: el servidor ya la tenía");
  assert.equal(srv.ventas.size, 1);
});

test("D: la respuesta de crear dice ok pero el registro de confirmación no llega: NO se borra", async () => {
  const cola = colaEnMemoria([venta("d2")]);
  const srv = servidor();
  let registros = 0;
  const registrar = srv.api.registrar;
  srv.api.registrar = async (i) => (++registros === 2 ? { red: false } : registrar(i));
  const r = await correr(cola, srv);
  assert.equal(r.resultado, R.SIN_RED);
  assert.deepEqual(cola.ids(), ["d2"]);
});

// ── E. Se corta la red en el medio ─────────────────────────────────────────

test("E: se corta la red en la segunda venta: la primera sale, la segunda y la tercera quedan intactas, mismo id al reintentar", async () => {
  const cola = colaEnMemoria([venta("e1"), venta("e2"), venta("e3")]);
  const srv = servidor();
  srv.alCrear = (c) => (c.clientTxnId === "e2" ? { red: false } : undefined);
  const r1 = await correr(cola, srv);
  assert.equal(r1.resultado, R.SIN_RED);
  assert.deepEqual(cola.ids(), ["e2", "e3"]);
  assert.equal(cola.de("e2").sync, undefined, "un corte de red no marca nada");
  assert.ok(!srv.de("registrar").includes("e3"), "después del corte no se sigue");
  srv.alCrear = null;
  const r2 = await correr(cola, srv);
  assert.equal(r2.resultado, R.COMPLETA);
  assert.deepEqual(cola.ids(), []);
  const ids = srv.llamadas.filter((l) => l[0] === "crear").map((l) => l[2].clientTxnId);
  assert.deepEqual(ids, ["e1", "e2", "e2", "e3"], "el reintento de e2 usa el MISMO clientTxnId");
});

test("E: sin red desde el principio: no se toca nada", async () => {
  const cola = colaEnMemoria([venta("e4")]);
  const srv = servidor();
  srv.red = false;
  const r = await correr(cola, srv);
  assert.equal(r.resultado, R.SIN_RED);
  assert.equal(cola.escrituras, 0);
});

// ── F. 428: falta el PIN ───────────────────────────────────────────────────

test("F: 428 frena, conserva la venta, pide el PIN de quien la cobró y no la da por perdida", async () => {
  const cola = colaEnMemoria([venta("f1"), venta("f2")]);
  const srv = servidor();
  srv.alCrear = () => ({ red: true, status: 428, data: { ok: false, needsOperador: true } });
  const r = await correr(cola, srv);
  assert.equal(r.resultado, R.ESPERA_PIN);
  assert.deepEqual(r.operadorRequerido, { operadorId: 7, nombre: "Ana" });
  assert.deepEqual(cola.ids(), ["f1", "f2"]);
  assert.equal(cola.de("f1").sync.estado, ESTADO_LOCAL.ESPERA_OPERADOR);
  assert.notEqual(cola.de("f1").sync.estado, ESTADO_LOCAL.REVISION);
  assert.ok(!srv.de("registrar").includes("f2"), "frena: no junta más 428");
  // Con el PIN, sigue sola y entra con el mismo id.
  srv.alCrear = null;
  const r2 = await correr(cola, srv);
  assert.equal(r2.resultado, R.COMPLETA);
  assert.deepEqual(cola.ids(), []);
});

test("F: sin operador activo, la venta de otro no se manda: se pide su PIN", async () => {
  const cola = colaEnMemoria([venta("f3", { operadorId: 7 })]);
  const srv = servidor();
  const r = await correr(cola, srv, { operadorActivoId: null });
  assert.equal(r.resultado, R.ESPERA_PIN);
  assert.equal(r.operadorRequerido.operadorId, 7);
  assert.deepEqual(srv.de("crear"), []);
});

// ── G. REQUIERE_REVISION ───────────────────────────────────────────────────

test("G: un rechazo que el servidor manda a revisión queda visible y NO se reintenta nunca más", async () => {
  const cola = colaEnMemoria([venta("g1"), venta("g2")]);
  const srv = servidor();
  srv.alCrear = (c) => {
    if (c.clientTxnId !== "g1") return undefined;
    srv.cobros.get("g1").estado = "REQUIERE_REVISION";
    return { red: true, status: 409, data: { ok: false, code: "TURNO_CERRADO", error: "La caja ya cerró." } };
  };
  const r = await correr(cola, srv);
  assert.equal(r.resultado, R.COMPLETA);
  assert.equal(r.enRevision, 1);
  assert.equal(r.sincronizadas, 1, "la de al lado entra igual");
  assert.deepEqual(cola.ids(), ["g1"]);
  assert.equal(cola.de("g1").sync.estado, ESTADO_LOCAL.REVISION);
  assert.equal(cola.de("g1").sync.codigo, "TURNO_CERRADO");
  for (let i = 0; i < 3; i++) {
    const otra = await correr(cola, srv);
    assert.equal(otra.enRevision, 0, "la que ya estaba en revisión no se vuelve a contar");
    assert.equal(mensajeDeSincronizacion(otra), null, "ni vuelve a avisar en cada sincronización");
  }
  assert.deepEqual(srv.de("crear").filter((id) => id === "g1"), ["g1"], "crear se pidió UNA vez");
  assert.deepEqual(cola.ids(), ["g1"]);
});

test("K: la venta que ya esperaba a su operador no vuelve a avisar en cada sincronización", async () => {
  const cola = colaEnMemoria([venta("k9", { operadorId: 8, operadorNombre: "Beto" })]);
  const srv = servidor();
  const r1 = await correr(cola, srv, { operadorActivoId: 7 });
  assert.equal(r1.esperanOperador, 1);
  const r2 = await correr(cola, srv, { operadorActivoId: 7 });
  assert.equal(r2.esperanOperador, 0);
  assert.equal(mensajeDeSincronizacion(r2), null);
  assert.equal(cola.de("k9").sync.estado, ESTADO_LOCAL.ESPERA_OPERADOR, "sigue esperando");
});

test("G: un rechazo que sigue PENDIENTE queda marcado y se reintenta en la próxima", async () => {
  const cola = colaEnMemoria([venta("g3")]);
  const srv = servidor();
  srv.alCrear = () => ({ red: true, status: 409, data: { ok: false, code: "TURNO_AJENO", error: "Caja de otro." } });
  const r = await correr(cola, srv);
  assert.equal(r.pendientes, 1);
  assert.equal(cola.de("g3").sync.estado, ESTADO_LOCAL.PENDIENTE);
  srv.alCrear = null;
  await correr(cola, srv);
  assert.deepEqual(cola.ids(), []);
});

// ── H. DESCARTADA ──────────────────────────────────────────────────────────

test("H: el encargado la descartó: sale de la cola sin pedir la venta", async () => {
  const cola = colaEnMemoria([{ ...venta("h1"), sync: { estado: ESTADO_LOCAL.REVISION } }]);
  const srv = servidor();
  srv.cobros.set("h1", { estado: "DESCARTADA", turnoId: 10 });
  const r = await correr(cola, srv);
  assert.equal(r.resultado, R.COMPLETA);
  assert.deepEqual(cola.ids(), []);
  assert.deepEqual(srv.de("crear"), []);
});

test("H: una en revisión que el servidor ya reconcilió también sale", async () => {
  const cola = colaEnMemoria([{ ...venta("h2"), sync: { estado: ESTADO_LOCAL.REVISION } }]);
  const srv = servidor();
  srv.cobros.set("h2", { estado: "SINCRONIZADA", turnoId: 10 });
  await correr(cola, srv);
  assert.deepEqual(cola.ids(), []);
  assert.deepEqual(srv.de("crear"), []);
});

// ── I. Otro local ──────────────────────────────────────────────────────────

test("I: las ventas de otro local no se registran, no se mandan y no se borran", async () => {
  const cola = colaEnMemoria([venta("i1", { localId: 2 }), venta("i2")]);
  const srv = servidor();
  await correr(cola, srv);
  assert.deepEqual(cola.ids(), ["i1"]);
  assert.ok(!srv.llamadas.some((l) => l[1] === "i1"));
});

test("I: un id que ya es de otro local: RECHAZADA, queda y no se reintenta", async () => {
  const cola = colaEnMemoria([venta("i3")]);
  const srv = servidor();
  srv.idsDeOtroLocal.add("i3");
  const r = await correr(cola, srv);
  assert.equal(r.rechazadas, 1);
  assert.equal(cola.de("i3").sync.estado, ESTADO_LOCAL.RECHAZADA);
  assert.equal(cola.de("i3").sync.codigo, "ID_DE_OTRO_LOCAL");
  await correr(cola, srv);
  assert.deepEqual(srv.de("registrar"), ["i3"], "rechazada no se vuelve a mandar");
  assert.deepEqual(srv.de("crear"), []);
});

// ── J. El cierre ───────────────────────────────────────────────────────────

test("J: una venta de ESA caja sin sincronizar no deja cerrar; de otra caja, en revisión o rechazada, sí", () => {
  const items = [
    venta("j1", { turnoId: 10 }),
    venta("j2", { turnoId: 11 }),
    { ...venta("j3", { turnoId: 12 }), sync: { estado: ESTADO_LOCAL.REVISION } },
    { ...venta("j4", { turnoId: 12 }), sync: { estado: ESTADO_LOCAL.RECHAZADA } },
    venta("j5", { turnoId: 13, localId: 2 }),
  ];
  const leida = { ok: true, items };
  const r10 = verificarCierreConCola(leida, { localId: LOCAL, turnoId: 10 });
  assert.equal(r10.permitido, false);
  assert.equal(r10.motivo, MOTIVO_CIERRE_BLOQUEADO.SIN_SINCRONIZAR);
  assert.equal(r10.cantidad, 1);
  assert.equal(verificarCierreConCola(leida, { localId: LOCAL, turnoId: 12 }).permitido, true);
  assert.equal(verificarCierreConCola(leida, { localId: LOCAL, turnoId: 99 }).permitido, true);
  assert.equal(verificarCierreConCola(leida, { localId: LOCAL, turnoId: 13 }).permitido, true, "turno 13 es de otro local");
  assert.equal(verificarCierreConCola(leida, { localId: LOCAL, turnoId: 11 }).cantidad, 1);
  // Espera de PIN: también bloquea, y dice de quién.
  const pin = verificarCierreConCola({ ok: true, items: [{ ...venta("j6"), sync: { estado: ESTADO_LOCAL.ESPERA_OPERADOR } }] }, { localId: LOCAL, turnoId: 10 });
  assert.equal(pin.permitido, false);
  assert.match(pin.mensaje, /PIN de Ana/);
});

test("J: sin conexión, con algo de esa caja, no se cierra; una cola ilegible tampoco deja", () => {
  const sin = verificarCierreConCola({ ok: true, items: [venta("j7")] }, { localId: LOCAL, turnoId: 10, sinConexion: true });
  assert.equal(sin.motivo, MOTIVO_CIERRE_BLOQUEADO.SIN_CONEXION);
  assert.match(sin.mensaje, /sin conexión/);
  const ilegible = verificarCierreConCola({ ok: false }, { localId: LOCAL, turnoId: 10 });
  assert.equal(ilegible.permitido, false);
  assert.equal(ilegible.motivo, MOTIVO_CIERRE_BLOQUEADO.COLA_ILEGIBLE);
  // Sin nada de esa caja, sin conexión, se puede.
  assert.equal(verificarCierreConCola({ ok: true, items: [] }, { localId: LOCAL, turnoId: 10, sinConexion: true }).permitido, true);
});

test("J: un ítem ilegible dentro de la cola no se cuenta ni rompe la verificación", () => {
  assert.deepEqual(pendientesQueBloqueanCierre([null, 3, { sin: "id" }, venta("j8")], { localId: LOCAL, turnoId: 10 }).length, 1);
});

// ── K. Varios operadores y varias cajas ────────────────────────────────────

test("K: con Ana activa entran las de Ana en SU caja; la de Beto espera a Beto y nunca se manda a nombre de Ana", async () => {
  const cola = colaEnMemoria([
    venta("k1", { operadorId: 7, turnoId: 10 }),
    venta("k2", { operadorId: 8, turnoId: 11, operadorNombre: "Beto" }),
    venta("k3", { operadorId: 7, turnoId: 10 }),
  ]);
  const srv = servidor();
  const r = await correr(cola, srv, { operadorActivoId: 7 });
  assert.equal(r.resultado, R.COMPLETA);
  assert.equal(r.sincronizadas, 2);
  assert.equal(r.esperanOperador, 1);
  assert.deepEqual(cola.ids(), ["k2"]);
  assert.ok(!srv.de("crear").includes("k2"), "la de Beto no se mandó con el PIN de Ana");
  assert.equal(cola.de("k2").sync.estado, ESTADO_LOCAL.ESPERA_OPERADOR);
  assert.equal(cola.de("k2").turnoId, 11, "no se mudó de caja");
  // La caja de Ana se puede cerrar; la de Beto no.
  const leida = cola.leer();
  assert.equal(verificarCierreConCola(leida, { localId: LOCAL, turnoId: 10 }).permitido, true);
  assert.equal(verificarCierreConCola(leida, { localId: LOCAL, turnoId: 11 }).permitido, false);
  // Entra Beto: la suya entra en la caja 11.
  await correr(cola, srv, { operadorActivoId: 8 });
  assert.deepEqual(cola.ids(), []);
  assert.equal(srv.ventas.get("k2").turnoId, 11);
});

// ── L. El ticket ───────────────────────────────────────────────────────────

test("L: el ticket offline muestra el nombre del cliente objeto, y el texto viejo sigue andando", () => {
  assert.equal(nombreClienteDeTicket({ nombre: "Juan Pérez", documento: "1" }), "Juan Pérez");
  assert.equal(nombreClienteDeTicket("Juan"), "Juan");
  assert.equal(nombreClienteDeTicket(null), null);
  assert.equal(nombreClienteDeTicket({ nombre: "Consumidor Final" }), null);
  assert.equal(nombreClienteDeTicket({ nombre: "  " }), null);
  assert.equal(nombreClienteDeTicket({}), null);
});

// ── Contrapruebas de comportamiento ────────────────────────────────────────

test("contraprueba: dos sincronizaciones a la vez: la segunda vuelve OCUPADA y nada se manda dos veces", async () => {
  const cola = colaEnMemoria([venta("x1"), venta("x2")]);
  const srv = servidor();
  const [a, b] = await Promise.all([correr(cola, srv), correr(cola, srv)]);
  assert.deepEqual([a.resultado, b.resultado].sort(), [R.COMPLETA, R.OCUPADA].sort());
  assert.deepEqual(srv.de("crear"), ["x1", "x2"]);
});

test("contraprueba: el candado entre pestañas ocupado: no corre nada", async () => {
  const navegadorAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const opciones = [];
  Object.defineProperty(globalThis, "navigator", {
    value: { locks: { request: (nombre, op, fn) => { opciones.push(op); return Promise.resolve(fn(null)); } } },
    configurable: true,
  });
  try {
    const cola = colaEnMemoria([venta("x3")]);
    const srv = servidor();
    const r = await correr(cola, srv, { candado: candadoEntrePestanas() });
    assert.equal(r.resultado, R.OCUPADA);
    assert.deepEqual(srv.llamadas, []);
    assert.deepEqual(opciones, [{ ifAvailable: true }], "no espera: si otra pestaña sincroniza, ésta no hace cola");
  } finally {
    if (navegadorAntes) Object.defineProperty(globalThis, "navigator", navegadorAntes);
    else delete globalThis.navigator;
  }
});

test("contraprueba: una cola ilegible no se sincroniza como vacía: no hay ninguna llamada", async () => {
  const cola = colaEnMemoria([venta("x4")], { legible: false });
  const srv = servidor();
  const r = await correr(cola, srv);
  assert.equal(r.resultado, R.COLA_ILEGIBLE);
  assert.deepEqual(srv.llamadas, []);
});

test("contraprueba: crear nunca se pide sin haber registrado antes ese mismo id", async () => {
  const cola = colaEnMemoria([venta("x5"), venta("x6", { operadorId: 8 }), { ...venta("x7"), sync: { estado: ESTADO_LOCAL.REVISION } }]);
  const srv = servidor();
  srv.cobros.set("x7", { estado: "REQUIERE_REVISION", turnoId: 10 });
  await correr(cola, srv);
  srv.llamadas.forEach((l, i) => {
    if (l[0] !== "crear") return;
    assert.deepEqual(srv.llamadas[i - 1].slice(0, 2), ["registrar", l[1]], `crear de ${l[1]} sin registrar justo antes`);
  });
  assert.deepEqual(srv.de("crear"), ["x5"]);
});

test("contraprueba: una respuesta del registro que no se entiende frena sin tocar la cola", async () => {
  const cola = colaEnMemoria([venta("x8")]);
  const srv = servidor();
  srv.api.registrar = async () => ({ red: true, status: 500, data: { ok: false, error: "No se pudieron registrar." } });
  const r = await correr(cola, srv);
  assert.equal(r.resultado, R.ERROR);
  assert.equal(r.mensaje, "No se pudieron registrar.");
  assert.equal(cola.escrituras, 0);
  // Y un estado desconocido también.
  srv.api.registrar = async (i) => ({ red: true, status: 200, data: { ok: true, resultados: [{ clientTxnId: i.clientVentaId, resultado: "CREADO", estado: "RARO" }] } });
  assert.equal((await correr(cola, srv)).resultado, R.ERROR);
  assert.deepEqual(cola.ids(), ["x8"]);
});

// ── Lo que ve el cajero ────────────────────────────────────────────────────

test("los avisos dicen qué pasó y qué falta, sin pedir 'Procesar cola'", () => {
  assert.equal(mensajeDeSincronizacion({ resultado: R.OCUPADA }), null);
  assert.equal(mensajeDeSincronizacion({ resultado: R.COMPLETA, sincronizadas: 0, enRevision: 0, rechazadas: 0, esperanOperador: 0, pendientes: 0 }), null);
  const ok = mensajeDeSincronizacion({ resultado: R.COMPLETA, sincronizadas: 2, enRevision: 0, rechazadas: 0, esperanOperador: 0, pendientes: 0 });
  assert.deepEqual(ok, { tono: "exito", texto: "2 ventas sin conexión sincronizadas." });
  const mixto = mensajeDeSincronizacion({ resultado: R.COMPLETA, sincronizadas: 1, enRevision: 1, rechazadas: 0, esperanOperador: 1, pendientes: 0 });
  assert.equal(mixto.tono, "error");
  assert.match(mixto.texto, /1 venta en revisión/);
  assert.match(mixto.texto, /espera el PIN/);
  assert.match(mensajeDeSincronizacion({ resultado: R.ESPERA_PIN, operadorRequerido: { nombre: "Ana" } }).texto, /PIN de Ana/);
  assert.match(mensajeDeSincronizacion({ resultado: R.SIN_RED }).texto, /se sincronizan solas/);
  for (const r of Object.values(R)) {
    const m = mensajeDeSincronizacion({ resultado: r, sincronizadas: 0, enRevision: 0, rechazadas: 0, esperanOperador: 0, pendientes: 1 });
    assert.doesNotMatch(m?.texto ?? "", /Procesar cola/);
  }
});

test("Pendientes: solo se puede quitar una venta que el servidor ya tiene en revisión", () => {
  const base = venta("p1");
  assert.equal(estadoParaMostrar(base, LOCAL).puedeQuitar, false);
  for (const estado of [ESTADO_LOCAL.PENDIENTE, ESTADO_LOCAL.ESPERA_OPERADOR, ESTADO_LOCAL.RECHAZADA]) {
    assert.equal(estadoParaMostrar({ ...base, sync: { estado } }, LOCAL).puedeQuitar, false, estado);
  }
  assert.equal(estadoParaMostrar({ ...base, sync: { estado: ESTADO_LOCAL.REVISION } }, LOCAL).puedeQuitar, true);
  assert.equal(estadoParaMostrar({ ...base, sync: { estado: ESTADO_LOCAL.REVISION } }, 2).puedeQuitar, false, "de otro local no");
  assert.equal(estadoParaMostrar(null, LOCAL).puedeQuitar, false);
  assert.match(estadoParaMostrar({ ...base, sync: { estado: ESTADO_LOCAL.ESPERA_OPERADOR } }, LOCAL).texto, /PIN de Ana/);
});

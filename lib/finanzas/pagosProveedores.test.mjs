// CANDADO: PAGOS A PROVEEDORES, la regla pura.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/pagosProveedores.test.mjs
//
// Lo que se afirma acá es la aritmética y las validaciones que comparten la
// ruta, la pantalla y —en la tanda siguiente— el cierre de la compra. Lo que
// necesita base (el RETIRO de caja, el alcance real, los permisos contra los
// handlers) está en `scripts/pruebas-db/finanzas.mjs`, contra PostgreSQL.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ERROR_CUENTA_SALDADA,
  ERROR_FECHA_FUTURA,
  ERROR_FECHA_INVALIDA,
  ERROR_MONTO_INVALIDO,
  ERROR_MONTO_MAYOR_AL_SALDO,
  ESTADO_CUENTA,
  FILTRO_CUENTAS,
  MEDIOS_PAGO_PROVEEDOR,
  PERMISO_REGISTRAR_PAGOS,
  aFechaDeBase,
  claveDelPagoInicial,
  cuentaPasaFiltro,
  nuevaClaveDePago,
  desdeFechaDeBase,
  diaLegible,
  estadoDeCuenta,
  filtroDeCuentas,
  cuentaCoincideConBusqueda,
  diaEnQueSeSaldo,
  leerDiaDePago,
  leerFechaOpcional,
  leerImporte,
  medioTocaLaCaja,
  motivoDelRetiroDePago,
  validarMontoDePago,
} from "@/lib/finanzas/pagosProveedores";
import { ubicacionesVisibles } from "@/lib/finanzas/alcanceFinanciero";
import { validarIdempotencyKey } from "@/lib/caja/retiroDinero";
import { PERMISSION_REGISTRY } from "@/lib/rbac/registry";
import { DEFAULT_PERMISOS_SISTEMA } from "@/lib/rbac/systemRoles";
import { readFileSync } from "node:fs";
import { inicioDiaArgentina } from "@/lib/fechas/rangoArgentina";

// ── LA CUENTA DE $485.300, PASO POR PASO ────────────────────────────────

test("compra de $485.300 sin pagos: saldo $485.300, pendiente", () => {
  assert.deepEqual(estadoDeCuenta({ total: "485300.00", pagos: [] }), {
    total: 485300,
    pagado: 0,
    saldo: 485300,
    estado: ESTADO_CUENTA.PENDIENTE,
  });
});

test("pago de $300.000: saldo $185.300, parcial", () => {
  const e = estadoDeCuenta({ total: 485300, pagos: [{ monto: "300000.00" }] });
  assert.equal(e.pagado, 300000);
  assert.equal(e.saldo, 185300);
  assert.equal(e.estado, ESTADO_CUENTA.PARCIAL);
});

test("segundo pago de $100.000: saldo $85.300, sigue parcial", () => {
  const e = estadoDeCuenta({ total: 485300, pagos: [{ monto: 300000 }, { monto: 100000 }] });
  assert.equal(e.saldo, 85300);
  assert.equal(e.estado, ESTADO_CUENTA.PARCIAL);
});

test("pago final: saldo $0, pagada", () => {
  const e = estadoDeCuenta({
    total: 485300,
    pagos: [{ monto: 300000 }, { monto: 100000 }, { monto: 85300 }],
  });
  assert.equal(e.saldo, 0);
  assert.equal(e.estado, ESTADO_CUENTA.PAGADA);
});

test("los centavos no se pierden en coma flotante", () => {
  // 0,1 + 0,2 no es 0,3 en flotante; en centavos sí.
  const e = estadoDeCuenta({ total: 0.3, pagos: [{ monto: 0.1 }, { monto: 0.2 }] });
  assert.equal(e.saldo, 0);
  assert.equal(e.estado, ESTADO_CUENTA.PAGADA);
});

// ── LO QUE NO SE PUEDE PAGAR ────────────────────────────────────────────

test("un pago mayor al saldo se rechaza", () => {
  assert.deepEqual(validarMontoDePago({ monto: 85300.01, saldo: 85300 }), {
    error: ERROR_MONTO_MAYOR_AL_SALDO,
  });
  assert.deepEqual(validarMontoDePago({ monto: 85300, saldo: 85300 }), { centavos: 8530000 });
});

test("un importe cero, negativo o que no es número se rechaza", () => {
  for (const monto of [0, "0", -1, "-100", "", null, undefined, "abc", true, NaN, 0.001]) {
    assert.deepEqual(
      validarMontoDePago({ monto, saldo: 1000 }),
      { error: ERROR_MONTO_INVALIDO },
      `monto ${String(monto)}`
    );
  }
});

test("una cuenta saldada no admite pagos", () => {
  assert.deepEqual(validarMontoDePago({ monto: 1, saldo: 0 }), { error: ERROR_CUENTA_SALDADA });
});

test("el importe escrito a mano se lee como en Argentina", () => {
  assert.deepEqual(leerImporte("185.300,50"), { centavos: 18530050 });
  assert.deepEqual(leerImporte("185.300"), { centavos: 18530000 });
  assert.deepEqual(leerImporte("$ 1.000"), { centavos: 100000 });
  assert.deepEqual(leerImporte("300000"), { centavos: 30000000 });
  // Un número serializado con punto decimal no pierde el punto.
  assert.deepEqual(leerImporte("185300.5"), { centavos: 18530050 });
  assert.deepEqual(leerImporte(185300.5), { centavos: 18530050 });
});

// ── LAS SOLAPAS ─────────────────────────────────────────────────────────

test("Pendientes incluye a las parciales; Pagados solo a las saldadas", () => {
  const { PENDIENTE, PARCIAL, PAGADA } = ESTADO_CUENTA;
  assert.equal(cuentaPasaFiltro(PENDIENTE, FILTRO_CUENTAS.PENDIENTES), true);
  assert.equal(cuentaPasaFiltro(PARCIAL, FILTRO_CUENTAS.PENDIENTES), true);
  assert.equal(cuentaPasaFiltro(PAGADA, FILTRO_CUENTAS.PENDIENTES), false);
  assert.equal(cuentaPasaFiltro(PARCIAL, FILTRO_CUENTAS.PAGADAS), false);
  assert.equal(cuentaPasaFiltro(PAGADA, FILTRO_CUENTAS.PAGADAS), true);
  for (const e of [PENDIENTE, PARCIAL, PAGADA]) {
    assert.equal(cuentaPasaFiltro(e, FILTRO_CUENTAS.TODAS), true);
  }
});

test("una solapa desconocida cae en Pendientes", () => {
  assert.equal(filtroDeCuentas("CUALQUIERA"), FILTRO_CUENTAS.PENDIENTES);
  assert.equal(filtroDeCuentas(null), FILTRO_CUENTAS.PENDIENTES);
  assert.equal(filtroDeCuentas("PAGADAS"), FILTRO_CUENTAS.PAGADAS);
});

// ── LAS DOS FECHAS ──────────────────────────────────────────────────────

test("vencimiento y fecha prevista se leen por separado y null es 'sin fecha'", () => {
  assert.deepEqual(leerFechaOpcional(null), { valor: null });
  assert.deepEqual(leerFechaOpcional(""), { valor: null });
  assert.deepEqual(leerFechaOpcional("2026-10-15"), { valor: "2026-10-15" });
  assert.deepEqual(leerFechaOpcional("2026-02-30"), { error: ERROR_FECHA_INVALIDA });
  assert.deepEqual(leerFechaOpcional("15/10/2026"), { error: ERROR_FECHA_INVALIDA });
});

test("un DATE va y vuelve de la base como el mismo día", () => {
  assert.equal(desdeFechaDeBase(aFechaDeBase("2026-10-15")), "2026-10-15");
  assert.equal(aFechaDeBase(null), null);
  assert.equal(desdeFechaDeBase(null), null);
});

test("el día se muestra sin pasar por la zona horaria", () => {
  // Con `fechaAR` sobre la medianoche UTC saldría el 14.
  assert.equal(diaLegible("2026-10-15"), "15/10/2026");
  assert.equal(diaLegible(null), "Sin fecha");
});

test("el día de un pago no puede ser futuro, y ausente es hoy", () => {
  const hoy = "2026-09-23";
  assert.deepEqual(leerDiaDePago(null, hoy), { valor: hoy });
  assert.deepEqual(leerDiaDePago("2026-09-20", hoy), { valor: "2026-09-20" });
  assert.deepEqual(leerDiaDePago("2026-09-24", hoy), { error: ERROR_FECHA_FUTURA });
});

// ── MEDIOS ──────────────────────────────────────────────────────────────

test("los medios son los cuatro de pago, y solo el efectivo toca la caja", () => {
  assert.deepEqual([...MEDIOS_PAGO_PROVEEDOR], ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "OTRO"]);
  assert.equal(medioTocaLaCaja("EFECTIVO"), true);
  for (const m of ["TRANSFERENCIA", "MERCADO_PAGO", "OTRO"]) assert.equal(medioTocaLaCaja(m), false);
  // Ningún medio de COBRO se cuela.
  for (const m of ["FIADO", "DEBITO", "CREDITO"]) assert.equal(MEDIOS_PAGO_PROVEEDOR.includes(m), false);
});

test("el motivo del retiro es texto para leer, con el proveedor y la compra", () => {
  assert.equal(
    motivoDelRetiroDePago({ proveedorNombre: "Arcor", pedidoProveedorId: 245 }),
    "Pago a proveedor: Arcor (compra #245)"
  );
});

// ── LA CLAVE DEL INTENTO ────────────────────────────────────────────────

test("la clave de un intento es la de la cuenta y cabe en la regla de Caja", () => {
  const clave = nuevaClaveDePago(17, 1700000000000, "abc123");
  assert.equal(clave, `pago-17-${(1700000000000).toString(36)}-abc123`);
  assert.equal(validarIdempotencyKey(clave, { de: "del pago" }).valido, true);
  // Dos aperturas del formulario son dos intentos.
  assert.notEqual(nuevaClaveDePago(17), nuevaClaveDePago(17));
});

test("el pago inicial de una compra tiene UNA clave, derivada de la compra", () => {
  assert.equal(claveDelPagoInicial(245), "compra-245-pago-inicial");
  assert.equal(claveDelPagoInicial(245), claveDelPagoInicial(245));
});

test("sin clave, el pago se rechaza con un mensaje que habla del pago", () => {
  assert.deepEqual(validarIdempotencyKey("", { de: "del pago" }), {
    valido: false,
    error: "Falta la clave de idempotencia del pago.",
  });
  // Y Caja sigue diciendo lo suyo: el default no cambió.
  assert.equal(validarIdempotencyKey(null).error, "Falta la clave de idempotencia del retiro.");
});

// ── ALCANCE ─────────────────────────────────────────────────────────────

test("un local solo ve su ubicación, aunque el grupo tenga otras", () => {
  const localesDelGrupo = [{ localId: 1 }, { localId: 2 }, { localId: 3 }];
  assert.deepEqual(ubicacionesVisibles({ esDeposito: false, localDeLaSesion: 2, localesDelGrupo }), [2]);
  assert.deepEqual(ubicacionesVisibles({ esDeposito: false, localDeLaSesion: null, localesDelGrupo }), []);
});

test("el depósito ve todas las ubicaciones de su grupo, y solo ésas", () => {
  const localesDelGrupo = [{ localId: 1 }, { localId: 2 }];
  assert.deepEqual(ubicacionesVisibles({ esDeposito: true, localDeLaSesion: 1, localesDelGrupo }), [1, 2]);
});

// ── EL PERMISO ──────────────────────────────────────────────────────────

test("el permiso de escribir está en el registro, en el grupo finanzas", () => {
  const p = PERMISSION_REGISTRY.find((x) => x.code === PERMISO_REGISTRAR_PAGOS);
  assert.ok(p, "falta en lib/rbac/registry.js");
  assert.equal(p.group, "finanzas");
  assert.equal(p.deprecated, false);
});

test("el permiso de escribir NO viene con ningún rol de sistema", () => {
  // Contra la enumeración vacía: si la matriz dejara de tener roles, el filtro
  // de abajo daría [] sin haber mirado nada.
  const roles = Object.entries(DEFAULT_PERMISOS_SISTEMA);
  assert.ok(roles.length >= 3, `la matriz trajo ${roles.length} roles`);
  const conElPermiso = roles.filter(([, permisos]) => permisos.includes(PERMISO_REGISTRAR_PAGOS));
  assert.deepEqual(conElPermiso, []);
});

// ── EL DÍA EN QUE UNA CUENTA QUEDÓ SALDADA ──────────────────────────────
//
// Los pagos tienen la forma que devuelve `SELECT_CUENTA` —id, monto, fecha—, y
// la fecha es un instante, como la guarda `registrarPagoProveedor`: el de la
// caja en efectivo o el comienzo del día argentino en los otros medios.

test("saldada el día del pago que llevó el saldo a cero, en hora argentina", () => {
  const pagos = [
    { id: 1, monto: "300000.00", fecha: new Date("2026-09-10T15:00:00-03:00") },
    { id: 2, monto: "185300.00", fecha: new Date("2026-09-12T22:30:00-03:00") },
  ];
  // Las 22:30 del 12 son el 13 en UTC: el día que cuenta es el argentino.
  assert.equal(diaEnQueSeSaldo({ total: "485300.00", pagos }), "2026-09-12");
});

test("mientras deba algo no tiene día de saldada, aunque tenga pagos", () => {
  const pagos = [{ id: 1, monto: 300000, fecha: new Date("2026-09-10T15:00:00-03:00") }];
  assert.equal(diaEnQueSeSaldo({ total: 485300, pagos }), null);
  assert.equal(diaEnQueSeSaldo({ total: 485300, pagos: [] }), null);
});

test("el pago que salda es el último REGISTRADO, aunque tenga fecha anterior", () => {
  // Una transferencia de ayer cargada después del efectivo de hoy: el saldo
  // llegó a cero con ella, y su día es el de ella.
  const pagos = [
    { id: 8, monto: 100, fecha: inicioDiaArgentina("2026-09-15") },
    { id: 7, monto: 900, fecha: new Date("2026-09-16T11:00:00-03:00") },
  ];
  assert.equal(diaEnQueSeSaldo({ total: 1000, pagos }), "2026-09-15");
});

test("saldada y Pagada no pueden discrepar: las dos suman en centavos", () => {
  // 0,1 + 0,2 en coma flotante no llega a 0,3.
  const pagos = [
    { id: 1, monto: 0.1, fecha: new Date("2026-09-10T12:00:00-03:00") },
    { id: 2, monto: 0.2, fecha: new Date("2026-09-11T12:00:00-03:00") },
  ];
  assert.equal(estadoDeCuenta({ total: 0.3, pagos }).estado, ESTADO_CUENTA.PAGADA);
  assert.equal(diaEnQueSeSaldo({ total: 0.3, pagos }), "2026-09-11");
});

// ── EL BUSCADOR ─────────────────────────────────────────────────────────
//
// El fixture tiene la forma de `serializarCuenta`, con los importes sacados de
// `estadoDeCuenta` y no escritos a mano: así no puede existir una cuenta con un
// saldo que la regla no daría. El candado de abajo comprueba contra el fuente
// que los campos que leen la búsqueda y la lista son los que la ruta manda.

function cuentaSerializada({ id, proveedor, pedidoProveedorId, factura = null, total, pagos = [] }) {
  const e = estadoDeCuenta({ total, pagos });
  return { id, pedidoProveedorId, proveedor, factura, ...e };
}

const NUNEZ = { id: 7, nombre: "Distribuidora Núñez" };
const ARCOR = { id: 3, nombre: "Arcor" };
const CUENTAS = [
  cuentaSerializada({ id: 11, proveedor: NUNEZ, pedidoProveedorId: 245, factura: "0001-00012345", total: 485300, pagos: [{ monto: 300000 }] }),
  cuentaSerializada({ id: 10, proveedor: ARCOR, pedidoProveedorId: 240, total: 100000.1 }),
  cuentaSerializada({ id: 9, proveedor: NUNEZ, pedidoProveedorId: 231, total: 0.2 }),
];

test("los campos que leen la búsqueda y la lista son los que manda serializarCuenta", () => {
  const fuente = readFileSync(new URL("./pagosProveedoresServer.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const cuerpo = fuente.slice(fuente.indexOf("export function serializarCuenta"));
  // Los últimos los leen la fila y el calendario de la lista —`FilaCuentaPorPagar`
  // y `calendarioDePagos`—, cuyos candados arman la cuenta con este mismo molde.
  for (const campo of [
    "id:",
    "pedidoProveedorId:",
    "proveedor:",
    "factura:",
    "total,",
    "pagado,",
    "saldo,",
    "estado,",
    "rotuloEstado:",
    "localGasto:",
    "vencimientoProveedor:",
    "createdAt:",
    "saldadaEl:",
  ]) {
    assert.ok(cuerpo.includes(campo), `serializarCuenta ya no manda ${campo}`);
  }
  // Y la consulta trae lo que `diaEnQueSeSaldo` necesita de cada pago.
  assert.match(fuente, /pagos:\s*\{\s*select:\s*\{\s*id:\s*true,\s*monto:\s*true,\s*fecha:\s*true\s*\}/);
});

test("la búsqueda encuentra por proveedor sin acentos, por compra con o sin #, por factura y por cuenta", () => {
  const ids = (texto) => CUENTAS.filter((c) => cuentaCoincideConBusqueda(c, texto)).map((c) => c.id);
  assert.deepEqual(ids(""), [11, 10, 9]);
  assert.deepEqual(ids("   "), [11, 10, 9]);
  assert.deepEqual(ids("nunez"), [11, 9]);
  assert.deepEqual(ids("ARCOR"), [10]);
  assert.deepEqual(ids("#245"), [11]);
  assert.deepEqual(ids("compra 240"), [10]);
  assert.deepEqual(ids("0001-0001"), [11]);
  assert.deepEqual(ids("cuenta 9"), [9]);
  assert.deepEqual(ids("coca"), []);
});

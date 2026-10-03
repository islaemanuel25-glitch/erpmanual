// EL COBRO OFFLINE QUE SE GUARDA: LISTA BLANCA, TOPES Y HASH CANÓNICO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/cobroOffline.test.mjs
//
// Se ejercen las funciones reales de lib/pos-ventas/cobroOffline.js. Que el
// endpoint y `crear` las usen con la base de verdad lo prueba
// scripts/pruebas-db/cobrosOffline.mjs, por los handlers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  sanearCobro,
  hashDePayload,
  horaDeDispositivo,
  totalDeclarado,
  idPositivo,
  textoPersistible,
  CAMPOS_COBRO,
  CAMPOS_LINEA,
  LIMITES_REGISTRO,
  MAXIMO_INT32,
  DECIMAL_TOTAL,
} from "@/lib/pos-ventas/cobroOffline";
import { itemCrearPayload } from "@/lib/pos-ventas/payloadVenta";

const VOUCHER = "eyJhbGciOiJIUzI1NiJ9.voucher-firmado.firma";

/** Un ítem de la cola como lo arma `guardarVentaPendiente`. */
const cobro = (cambios = {}) => ({
  clientVentaId: "c0ffee00-0000-4000-8000-000000000001",
  createdAt: Date.UTC(2026, 9, 3, 12, 0, 0),
  localId: 5,
  grupoId: 2,
  userId: 9,
  formaPago: "efectivo",
  subtotal: 2500,
  descuento: 0,
  descuentoPorPuntos: 0,
  total: 2500,
  clienteId: null,
  operadorId: 7,
  operadorVoucher: VOUCHER,
  turnoId: 10,
  items: [itemCrearPayload({ productoBaseId: 3, nombre: "Yerba", precio: 2500, cantidad: 1 })],
  ...cambios,
});

test("los campos de la línea son exactamente los que arma itemCrearPayload", () => {
  assert.deepEqual([...CAMPOS_LINEA].sort(), Object.keys(itemCrearPayload({})).sort());
});

test("lista blanca: el voucher, un PIN, una cookie o un token no llegan al payload", () => {
  const conCredenciales = cobro({
    pin: "1234",
    cookie: "erpazul_operador_activo=xyz",
    token: "abc",
    sesion: { id: 1 },
    items: [{ ...itemCrearPayload({ productoBaseId: 3, nombre: "Yerba", precio: 2500, cantidad: 1 }), operadorVoucher: VOUCHER, pin: "1234" }],
  });
  const r = sanearCobro(conCredenciales);
  assert.equal(r.ok, true);
  const texto = JSON.stringify(r.payload);
  for (const prohibido of [VOUCHER, "operadorVoucher", "pin", "cookie", "token", "sesion", "grupoId"]) {
    assert.ok(!texto.includes(prohibido), `"${prohibido}" llegó al payload`);
  }
  assert.deepEqual(Object.keys(r.payload).sort(), [...CAMPOS_COBRO, "items"].sort());
  assert.deepEqual(Object.keys(r.payload.items[0]).sort(), [...CAMPOS_LINEA].sort());
});

test("se conserva lo declarado para investigar: turno, cuenta, operador, local, hora", () => {
  const { payload } = sanearCobro(cobro({ turnoId: 999, localId: 5 }));
  assert.equal(payload.turnoId, 999);
  assert.equal(payload.userId, 9);
  assert.equal(payload.operadorId, 7);
  assert.equal(payload.localId, 5);
  assert.equal(payload.createdAt, Date.UTC(2026, 9, 3, 12, 0, 0));
});

// Un objeto en un campo que NO es id no se guarda (queda null). En un campo id
// hace inválido el cobro entero: ver "un id declarado…" más abajo.
test("un objeto metido en un campo simple no se guarda; los textos se recortan", () => {
  const { payload } = sanearCobro(cobro({ descuento: { colado: "x" }, formaPago: "efectivo" + "x".repeat(500) }));
  assert.equal(payload.descuento, null);
  assert.equal(payload.formaPago.length, LIMITES_REGISTRO.largoTexto);
});

test("lo que no es un cobro se rechaza", () => {
  const casos = {
    "no es objeto": null,
    "arreglo": [],
    "sin id": cobro({ clientVentaId: undefined }),
    "id vacío": cobro({ clientVentaId: "  " }),
    "id demasiado largo": cobro({ clientVentaId: "x".repeat(LIMITES_REGISTRO.largoId + 1) }),
    "sin líneas": cobro({ items: [] }),
    "líneas que no son arreglo": cobro({ items: {} }),
    "una línea que no es objeto": cobro({ items: ["x"] }),
    "más de 500 líneas": cobro({ items: Array.from({ length: LIMITES_REGISTRO.lineasPorCobro + 1 }, () => ({ productoBaseId: 1 })) }),
    "total inválido": cobro({ total: "mucho" }),
    "total negativo": cobro({ total: -1 }),
    "sin forma de pago": cobro({ formaPago: "" }),
  };
  for (const [nombre, c] of Object.entries(casos)) {
    assert.equal(sanearCobro(c).ok, false, nombre);
  }
  assert.equal(sanearCobro(cobro({ items: Array.from({ length: LIMITES_REGISTRO.lineasPorCobro }, () => ({ productoBaseId: 1 })) })).ok, true, "500 líneas sí");
});

test("hash canónico: el mismo contenido con las claves en otro orden da el mismo hash", () => {
  const a = sanearCobro(cobro()).payload;
  const desordenado = Object.fromEntries(Object.entries(cobro()).reverse());
  desordenado.items = desordenado.items.map((l) => Object.fromEntries(Object.entries(l).reverse()));
  const b = sanearCobro(desordenado).payload;
  assert.equal(hashDePayload(a), hashDePayload(b));
  assert.match(hashDePayload(a), /^[0-9a-f]{64}$/);
});

test("el hash es del payload SANEADO: el voucher o un campo ajeno no lo cambian", () => {
  const base = hashDePayload(sanearCobro(cobro()).payload);
  assert.equal(hashDePayload(sanearCobro(cobro({ operadorVoucher: "otro" })).payload), base);
  assert.equal(hashDePayload(sanearCobro(cobro({ basura: 1 })).payload), base);
});

test("cualquier cambio de contenido cambia el hash", () => {
  const base = hashDePayload(sanearCobro(cobro()).payload);
  const otros = [
    cobro({ total: 2600 }),
    cobro({ turnoId: 11 }),
    cobro({ items: [itemCrearPayload({ productoBaseId: 3, nombre: "Yerba", precio: 2500, cantidad: 2 })] }),
    cobro({ clienteId: 4 }),
  ];
  for (const c of otros) assert.notEqual(hashDePayload(sanearCobro(c).payload), base);
});

test("la hora del dispositivo solo se guarda si es creíble", () => {
  const ahora = Date.UTC(2026, 9, 3, 12, 0, 0);
  assert.equal(horaDeDispositivo(ahora - 1000, ahora).getTime(), ahora - 1000);
  assert.equal(horaDeDispositivo(Date.UTC(2019, 0, 1), ahora), null, "antes de 2020");
  assert.equal(horaDeDispositivo(ahora + 2 * 24 * 3600 * 1000, ahora), null, "dos días en el futuro");
  assert.equal(horaDeDispositivo("ayer", ahora), null);
  assert.equal(horaDeDispositivo(null, ahora), null);
});

test("el total declarado va con dos decimales", () => {
  assert.equal(totalDeclarado({ total: 2500 }), "2500.00");
  assert.equal(totalDeclarado({ total: 10.005 }), "10.01");
});

// ── Lo que la base puede guardar ────────────────────────────────────────────

test("los límites son los de las columnas reales de CobroOffline", () => {
  const modelo = readFileSync("prisma/schema.prisma", "utf8").match(/^model CobroOffline \{[\s\S]*?^\}/m)?.[0];
  assert.ok(modelo, "no se encontró el modelo CobroOffline");
  assert.match(modelo, new RegExp(`totalDeclarado\\s+Decimal\\s+@db\\.Decimal\\(${DECIMAL_TOTAL.precision},\\s*${DECIMAL_TOTAL.escala}\\)`));
  for (const columna of ["turnoId", "cuentaDeclaradaId", "operadorDeclaradoId"]) {
    assert.match(modelo, new RegExp(`\\b${columna}\\s+Int\\?`), `${columna} dejó de ser Int`);
  }
  assert.equal(MAXIMO_INT32, 2 ** 31 - 1);
});

test("un id solo es id si entra en un int4", () => {
  assert.equal(idPositivo(MAXIMO_INT32), MAXIMO_INT32);
  assert.equal(idPositivo(MAXIMO_INT32 + 1), null);
  assert.equal(idPositivo(String(MAXIMO_INT32 + 1)), null);
});

test("un id declarado es un entero o un texto en decimal llano: sin las coerciones de Number()", () => {
  const validos = [[1, 1], [25, 25], [MAXIMO_INT32, MAXIMO_INT32], ["1", 1], ["25", 25], [String(MAXIMO_INT32), MAXIMO_INT32]];
  for (const [valor, esperado] of validos) assert.equal(idPositivo(valor), esperado, JSON.stringify(valor));
  const invalidos = [
    true, false, "true", "false", "0x7fffffff", "1e3", "1.0", "1.5", "+1", "-1", "01", " 1", "1 ",
    "Infinity", "", " ", 0, -1, 1.5, NaN, Infinity, MAXIMO_INT32 + 1, String(MAXIMO_INT32 + 1),
    "9".repeat(400), [], [1], {}, { id: 1 }, null, undefined,
  ];
  for (const valor of invalidos) assert.equal(idPositivo(valor), null, `${typeof valor} ${JSON.stringify(valor)}`);
});

test("un id declarado que no es id hace INVALIDO el cobro; vacío no", () => {
  for (const campo of ["localId", "userId", "operadorId", "turnoId", "clienteId"]) {
    for (const malo of [true, "true", "0x7fffffff", "1e3", "1.0", 1.5, {}, [], ""]) {
      assert.equal(sanearCobro(cobro({ [campo]: malo })).ok, false, `${campo} = ${JSON.stringify(malo)}`);
    }
  }
  for (const campo of ["operadorId", "turnoId", "clienteId"]) {
    assert.equal(sanearCobro(cobro({ [campo]: null })).ok, true, `${campo} null`);
  }
  assert.equal(sanearCobro(cobro({ turnoId: "10", userId: "9" })).ok, true, "decimal en texto");
});

// ── Textos que PostgreSQL puede guardar ─────────────────────────────────────

const ALTO = "\uD83D";
const BAJO = "\uDE00";

test("textoPersistible: sin NUL y UTF-16 bien formado", () => {
  for (const bueno of ["efectivo", "Ñandú, café ☕", `pareja ${ALTO}${BAJO}`, "日本語", ""]) {
    assert.equal(textoPersistible(bueno), true, JSON.stringify(bueno));
  }
  for (const malo of ["efectivo\u0000", `alto ${ALTO} suelto`, `bajo ${BAJO} suelto`, `${BAJO}${ALTO}`, ALTO]) {
    assert.equal(textoPersistible(malo), false, JSON.stringify(malo));
  }
});

test("un texto que no se puede guardar hace INVALIDO el cobro, en cualquier campo; no se reemplaza", () => {
  const linea = (cambios) => [{ ...itemCrearPayload({ productoBaseId: 3, nombre: "Yerba", precio: 2500, cantidad: 1 }), ...cambios }];
  const malos = {
    "formaPago con NUL": cobro({ formaPago: "efectivo\u0000" }),
    "clientVentaId con NUL": cobro({ clientVentaId: "c0ffee\u0000" }),
    "nombre con NUL": cobro({ items: linea({ nombre: "Yerba\u0000" }) }),
    "nombre con surrogate alto suelto": cobro({ items: linea({ nombre: `Yerba ${ALTO}` }) }),
    "nombre con surrogate bajo suelto": cobro({ items: linea({ nombre: `Yerba ${BAJO}` }) }),
    "modoVentaLinea con NUL": cobro({ items: linea({ modoVentaLinea: "NORMAL\u0000" }) }),
    "NUL más allá del recorte": cobro({ formaPago: `efectivo${"x".repeat(LIMITES_REGISTRO.largoTexto)}\u0000` }),
  };
  for (const [nombre, c] of Object.entries(malos)) assert.equal(sanearCobro(c).ok, false, nombre);

  const bueno = sanearCobro(cobro({ items: linea({ nombre: `Yerba ñandú ☕ ${ALTO}${BAJO}` }) }));
  assert.equal(bueno.ok, true);
  assert.equal(bueno.payload.items[0].nombre, `Yerba ñandú ☕ ${ALTO}${BAJO}`, "el texto válido se guarda tal cual");
});

test("el recorte no parte un par surrogate", () => {
  const largo = LIMITES_REGISTRO.largoTexto;
  // El par queda en las posiciones largo-1 y largo: un slice simple dejaría el
  // alto suelto al final.
  const nombre = "x".repeat(largo - 1) + ALTO + BAJO + "resto";
  const r = sanearCobro(cobro({ items: [{ ...itemCrearPayload({ productoBaseId: 3, nombre, precio: 1, cantidad: 1 }) }] }));
  assert.equal(r.ok, true);
  const guardado = r.payload.items[0].nombre;
  assert.equal(textoPersistible(guardado), true);
  assert.equal(guardado, "x".repeat(largo - 1));
});

test("un id declarado que no entra en un int4: el cobro es INVALIDO, no un 500", () => {
  for (const campo of ["localId", "userId", "operadorId", "turnoId", "clienteId"]) {
    assert.equal(sanearCobro(cobro({ [campo]: MAXIMO_INT32 + 1 })).ok, false, `${campo} número`);
    assert.equal(sanearCobro(cobro({ [campo]: String(MAXIMO_INT32 + 1) })).ok, false, `${campo} texto`);
  }
  assert.equal(sanearCobro(cobro({ userId: MAXIMO_INT32, operadorId: MAXIMO_INT32, turnoId: MAXIMO_INT32, clienteId: MAXIMO_INT32 })).ok, true, "el borde entra");
});

test("Decimal(12,2): bordes del total, comparados sobre el texto que se guarda", () => {
  const entra = (total) => totalDeclarado({ total });
  assert.equal(entra(9999999999.99), "9999999999.99", "el máximo exacto");
  assert.equal(entra(9999999999.994), "9999999999.99", "redondea dentro del rango");
  assert.equal(entra(9999999999.999), null, "redondeado da 10000000000.00: no entra, no se recorta");
  assert.equal(entra(10000000000), null, "once enteros");
  assert.equal(entra(1e21), null, "toFixed en notación exponencial");
  assert.equal(entra(0), "0.00");
  assert.equal(entra(-0), "0.00");
  assert.equal(entra(-0.01), null);
  assert.equal(sanearCobro(cobro({ total: 10000000000 })).ok, false);
  assert.equal(sanearCobro(cobro({ total: 9999999999.99 })).ok, true);
});

// ── El servidor, leído SIN comentarios ──────────────────────────────────────
const sin = (ruta) => readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("registro y crear toman EL MISMO candado, por la misma función", () => {
  const crear = sin("app/api/pos-ventas/crear/route.js");
  const servidor = sin("lib/pos-ventas/cobroOfflineServidor.js");
  assert.match(crear, /await tomarCandadoDelLocal\(tx, localId\);/);
  assert.doesNotMatch(crear, /pg_advisory_xact_lock/, "crear volvió a tomar el candado a mano");
  assert.match(servidor, /await tomarCandadoDelLocal\(tx, ctx\.localId\);/);
});

test("el registro espera el candado con los límites de crear, no con los 5 s del default", () => {
  const servidor = sin("lib/pos-ventas/cobroOfflineServidor.js");
  const iTx = servidor.search(/prisma\.\$transaction\(\s*async\s*\(\s*tx\s*\)\s*=>/);
  const iCandado = servidor.indexOf("await tomarCandadoDelLocal(tx, ctx.localId);");
  const cierre = /\}\s*,\s*LIMITES_TRANSACCION_DEL_LOCAL\s*\)/g;
  cierre.lastIndex = iCandado;
  assert.ok(iTx > 0 && iCandado > iTx && cierre.exec(servidor), "la transacción del registro no declara LIMITES_TRANSACCION_DEL_LOCAL");
});

// LA SINCRONIZACIÓN ES PARTE DE LA VENTA. Movida después del commit, la prueba
// de base sigue en verde (una venta que falla no sincroniza ni adentro ni
// afuera), pero una caída entre el commit y la sincronización deja la venta
// escrita con su cobro PENDIENTE. Lo que se afirma: la llamada recibe el `tx`
// de `crear`, dentro de su callback, después de crear la venta y antes de los
// efectos que todavía pueden revertirla, y no hay otra.
test("crear sincroniza el cobro con el MISMO tx de la venta, antes de que pueda confirmar", () => {
  const crear = sin("app/api/pos-ventas/crear/route.js");
  const posicion = (re, que) => {
    const i = crear.search(re);
    assert.ok(i > 0, `no se encontró ${que}`);
    return i;
  };
  const iTx = posicion(/prisma\.\$transaction\(\s*async\s*\(\s*tx\s*\)\s*=>/, "la transacción de crear");
  const iVenta = posicion(/const\s+nuevaVenta\s*=\s*await\s+tx\.venta\.create\(/, "la creación de la venta");
  const iSync = posicion(/await\s+sincronizarCobroOfflineEnTransaccion\(\s*tx\s*,/, "la sincronización con tx");
  const iStock = posicion(/aplicarConsumoStock\(\s*tx\s*,/, "el consumo de stock");
  const iCierre = posicion(/\}\s*,\s*LIMITES_TRANSACCION_DEL_LOCAL\s*\)/, "el cierre de la transacción");
  assert.ok(iTx < iVenta && iVenta < iSync && iSync < iStock && iStock < iCierre,
    `orden: tx ${iTx}, venta ${iVenta}, sincronización ${iSync}, stock ${iStock}, cierre ${iCierre}`);
  const llamadas = crear.match(/sincronizarCobroOfflineEnTransaccion\(/g) || [];
  assert.equal(llamadas.length, 1, "hay otra llamada a la sincronización");
});

test("el registro sanea antes de calcular el hash, y el voucher se resuelve antes de sanear", () => {
  const servidor = sin("lib/pos-ventas/cobroOfflineServidor.js");
  const sanea = servidor.indexOf("sanearCobro(cobro)");
  const hash = servidor.indexOf("hashDePayload(payload)");
  assert.ok(sanea > 0 && hash > sanea);
  assert.doesNotMatch(servidor, /operadorVoucher/, "el servidor no toca el voucher: le llega verificado");
  const ruta = sin("app/api/pos-ventas/cobros-offline/registrar/route.js");
  assert.match(ruta, /verificarVoucherOperador\(cobro\.operadorVoucher, localId\)/);
});

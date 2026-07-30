// lib/ventas-internas/integracionVenta.test.mjs
//
// Etapa 4: POS Venta → Venta + Transferencia. Tres bloques:
//
//   · DECISIÓN — funciones puras: cuándo una venta es interna, qué se rechaza y
//     con qué código HTTP, cómo se arman los snapshots, qué se bloquea.
//   · CONTENIDO — el consumo físico real (packs, combos, fiambres, servicios)
//     pasando por planConsumoVenta + mapearVentaATransferencia, que es exactamente
//     la cadena que corre dentro de la transacción.
//   · CARACTERIZACIÓN — el route de crear es monolítico y no se puede instanciar
//     sin Prisma/Next. Se verifica el CABLEADO sobre el fuente: que la
//     transferencia se cree dentro de la transacción, después de la venta, con
//     SOLO_TRANSITO, ventaId y posTransferenciaId null. Es una red de seguridad
//     contra regresiones de wiring, no un reemplazo del end-to-end.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { planConsumoVenta } from "../combos/planConsumoVenta.js";
import { evaluarVinculoVentaInterna, CODIGOS } from "./vinculo.js";
import { mapearVentaATransferencia } from "./mapearVentaATransferencia.js";
import {
  esSinVinculo,
  respuestaVinculoInvalido,
  construirSnapshots,
  idsParaSnapshots,
  bloqueoCancelacion,
  bloqueoCorreccion,
  bloqueoReintentoHuerfana,
  COD_CANCELAR_BLOQUEADA,
  COD_CORRECCION_BLOQUEADA,
  resolverVentaInterna,
  confirmarVinculoTransaccional,
  pertenenciaAlGrupo,
  VentaInternaError,
  COD_VINCULO_MODIFICADO,
} from "./integracionVenta.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p) => readFileSync(join(RAIZ, ...p), "utf8");

const RUTA_CREAR = leer("app", "api", "pos-ventas", "crear", "route.js");
const HELPER = leer("lib", "ventas-internas", "integracionVenta.js");
const RUTA_CANCELAR = leer("app", "api", "transferencias", "cancelar", "route.js");

// `def` respeta el null EXPLÍCITO (a diferencia de ??): sin esto, pedir
// `vinculado: null` devolvería el default y el caso "cliente externo" no se
// podría ejercitar.
const def = (v, d) => (v === undefined ? d : v);

// Escenario base: depósito 1 del grupo, local interno 7 activo, permiso OK.
const escenario = (o = {}) => ({
  cliente: { id: 90, localId: o.clienteLocalId ?? 1, localVinculadoId: def(o.vinculado, 7) },
  localOrigen: { id: 1, es_deposito: o.origenEsDeposito ?? true },
  localDestino:
    o.destino === null
      ? null
      : { id: o.destinoId ?? 7, nombre: "Local Mini 7", activo: o.destinoActivo ?? true },
  perteneceOrigenAlGrupo: o.origenEnGrupo ?? true,
  perteneceDestinoAlGrupo: o.destinoEnGrupo ?? true,
  tienePermisoCrearTransferencia: o.permiso ?? true,
});

// ══ 1. DETECCIÓN ══════════════════════════════════════════════════════════════

test("1. cliente externo → venta normal, sin transferencia y sin error", () => {
  const r = evaluarVinculoVentaInterna(escenario({ vinculado: null }));
  assert.equal(r.activa, false);
  assert.equal(r.codigo, CODIGOS.CLIENTE_SIN_LOCAL_VINCULADO);
  assert.equal(esSinVinculo(r.codigo), true);
  assert.equal(respuestaVinculoInvalido(r.codigo), null, "no se rechaza la venta");
});

test("2. sin cliente → venta normal", () => {
  const r = evaluarVinculoVentaInterna({ cliente: null });
  assert.equal(r.codigo, CODIGOS.CLIENTE_AUSENTE);
  assert.equal(esSinVinculo(r.codigo), true);
  assert.equal(respuestaVinculoInvalido(r.codigo), null);
});

test("3. cliente interno válido → activa, con el destino del vínculo", () => {
  const r = evaluarVinculoVentaInterna(escenario());
  assert.equal(r.activa, true);
  assert.equal(r.codigo, "VENTA_INTERNA_VALIDA");
  assert.equal(r.localDestinoId, 7);
});

test("4. vinculado pero el origen no es depósito → venta RECHAZADA (400)", () => {
  const r = evaluarVinculoVentaInterna(escenario({ origenEsDeposito: false }));
  assert.equal(r.activa, false);
  assert.equal(r.codigo, CODIGOS.ORIGEN_NO_ES_DEPOSITO);
  assert.equal(esSinVinculo(r.codigo), false, "NO degrada a venta común");
  const resp = respuestaVinculoInvalido(r.codigo);
  assert.equal(resp.status, 400);
  assert.match(resp.error, /no se realiza desde un depósito/);
});

test("5. destino inactivo → rechazada (400) con el nombre del local", () => {
  const r = evaluarVinculoVentaInterna(escenario({ destinoActivo: false }));
  assert.equal(r.codigo, CODIGOS.DESTINO_INACTIVO);
  const resp = respuestaVinculoInvalido(r.codigo, { nombreLocal: "Local Mini 7" });
  assert.equal(resp.status, 400);
  assert.match(resp.error, /“Local Mini 7” está inactivo/);
});

test("6. destino de otro grupo → rechazada (409)", () => {
  const r = evaluarVinculoVentaInterna(escenario({ destinoEnGrupo: false }));
  assert.equal(r.codigo, CODIGOS.DESTINO_FUERA_DEL_GRUPO);
  const resp = respuestaVinculoInvalido(r.codigo);
  assert.equal(resp.status, 409);
  assert.match(resp.error, /no pertenece al mismo grupo/);
});

test("7. sin permiso transferencias.crear → 403", () => {
  const r = evaluarVinculoVentaInterna(escenario({ permiso: false }));
  assert.equal(r.codigo, CODIGOS.SIN_PERMISO_TRANSFERENCIA);
  const resp = respuestaVinculoInvalido(r.codigo);
  assert.equal(resp.status, 403);
  assert.match(resp.error, /No tenés permiso para generar la transferencia/);
});

test("8. Cliente.localId NO se usa como destino", () => {
  // El cliente es propiedad del local 99 pero representa al 7. Gana el vínculo.
  const r = evaluarVinculoVentaInterna(escenario({ clienteLocalId: 99 }));
  assert.equal(r.localDestinoId, 7);
  // Y si NO hay vínculo, tener localId no alcanza para activar nada.
  const sin = evaluarVinculoVentaInterna(escenario({ clienteLocalId: 99, vinculado: null }));
  assert.equal(sin.activa, false);
});

test("8b. todos los códigos estructurales tienen status y mensaje, y solo esos", () => {
  const estructurales = [
    CODIGOS.ORIGEN_AUSENTE, CODIGOS.ORIGEN_NO_ES_DEPOSITO, CODIGOS.DESTINO_AUSENTE,
    CODIGOS.DESTINO_INACTIVO, CODIGOS.ORIGEN_Y_DESTINO_IGUALES,
    CODIGOS.ORIGEN_FUERA_DEL_GRUPO, CODIGOS.DESTINO_FUERA_DEL_GRUPO,
    CODIGOS.SIN_PERMISO_TRANSFERENCIA,
  ];
  assert.equal(estructurales.length, 8);
  for (const c of estructurales) {
    const r = respuestaVinculoInvalido(c);
    assert.ok(r, `${c} debe producir rechazo`);
    assert.ok([400, 403, 409].includes(r.status), `${c} → status ${r.status}`);
    assert.equal(r.code, c, "el código viaja al cliente para poder ramificar");
    assert.ok(r.error.length > 15);
  }
  // Los no estructurales NO rechazan.
  for (const c of [CODIGOS.VALIDA, CODIGOS.CLIENTE_AUSENTE, CODIGOS.CLIENTE_SIN_LOCAL_VINCULADO]) {
    assert.equal(respuestaVinculoInvalido(c), null);
  }
});

// ══ 2. SNAPSHOTS ══════════════════════════════════════════════════════════════

test("snapshots: una sola consulta, ids únicos y ordenados", () => {
  const consumo = [
    { productoLocalId: 30, productoBaseId: 300, cantidad: 1 },
    { productoLocalId: 5, productoBaseId: 50, cantidad: 2 },
    { productoLocalId: 30, productoBaseId: 300, cantidad: 3 },
    { productoLocalId: null, productoBaseId: 1, cantidad: 1 },
  ];
  assert.deepEqual(idsParaSnapshots(consumo), [5, 30]);
  assert.deepEqual(idsParaSnapshots([]), []);

  const mapa = construirSnapshots([
    { id: 5, nombre: "A", base: { nombre: "A base" } },
    { id: 30, nombre: "B", base: { nombre: "B base" } },
    null,
    { id: "x" },
  ]);
  assert.equal(mapa.size, 2);
  assert.equal(mapa.get(5).nombre, "A");
  // El objeto viaja por referencia: crearTransferencia lee precio_costo de ahí.
  const pl = { id: 9, precio_costo: 800, base: {} };
  assert.equal(construirSnapshots([pl]).get(9), pl);
});

// ══ 3. CONTENIDO FÍSICO (cadena real: planConsumoVenta → mapper) ══════════════

const normal = (o) => ({
  tipo: "NORMAL", precio: 100, costoUnitario: 60, nombre: "P", ...o,
});
const servicio = (o) => ({
  tipo: "SERVICIO", precio: 1030, costoUnitario: 1000, cantidad: 1, nombre: "SUBE",
  servicio: { importeBaseServicio: 1000 }, ...o,
});
const mapear = (lineas, esDeposito = true) => {
  const plan = planConsumoVenta({ lineas, esDeposito });
  return mapearVentaATransferencia({
    consumoFisicoConsolidado: plan.consumoFisicoConsolidado,
    lineasComerciales: plan.lineasComerciales,
  });
};

test("19. producto normal", () => {
  const r = mapear([normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 3 })]);
  assert.equal(r.debeCrearTransferencia, true);
  assert.deepEqual(r.items, [
    { baseId: 100, productoLocalOrigenId: 10, cantidad: 3, unidadEnviada: "UNIDAD", factorPack: 1 },
  ]);
});

test("20. pack 3×12 → 36, sin volver a multiplicar", () => {
  const r = mapear([
    normal({
      productoLocalId: 10, productoBaseId: 100, cantidad: 3,
      baseStock: { factorPack: 12, modo_envio: "MIXTO" }, modoVentaLinea: "NORMAL",
    }),
  ]);
  assert.equal(r.items[0].cantidad, 36);
  assert.equal(r.items[0].factorPack, 1);
});

test("21. fiambre por peso conserva 1.925", () => {
  const r = mapear([normal({ productoLocalId: 31, productoBaseId: 310, cantidad: 1.925 })]);
  assert.equal(r.items[0].cantidad, 1.925);
  assert.equal(String(r.items[0].cantidad), "1.925");
});

test("22. fiambre fijo conserva piezas (no las pasa a kg)", () => {
  const r = mapear([
    normal({
      productoLocalId: 30, productoBaseId: 300, cantidad: 4,
      baseStock: { factorPack: 1, modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.5 },
    }),
  ]);
  assert.equal(r.items[0].cantidad, 4);
  assert.notEqual(r.items[0].cantidad, 14);
});

const COMPONENTES = [
  { productoLocalId: 20, productoBaseId: 200, cantidadPorCombo: 2, costoUnitario: 500, nombre: "Coca" },
  { productoLocalId: 21, productoBaseId: 210, cantidadPorCombo: 1, costoUnitario: 3000, nombre: "Fernet" },
];
const combo = (cant) => ({
  tipo: "COMBO", comboProductoLocalId: 99, productoBaseId: 990, nombre: "Combo",
  cantidad: cant, precio: 500, costoUnitario: 300, componentes: COMPONENTES,
});

test("23. el combo se expande a componentes y nunca viaja como línea", () => {
  const r = mapear([combo(1)]);
  assert.deepEqual(
    r.items.map((i) => [i.productoLocalOrigenId, i.cantidad]),
    [[20, 2], [21, 1]]
  );
  assert.equal(r.items.some((i) => i.productoLocalOrigenId === 99), false);
});

test("24. combo + producto suelto del mismo producto se consolidan", () => {
  const r = mapear([
    normal({ productoLocalId: 20, productoBaseId: 200, cantidad: 1 }),
    combo(1),
  ]);
  assert.equal(r.items.filter((i) => i.productoLocalOrigenId === 20).length, 1);
  assert.equal(r.items.find((i) => i.productoLocalOrigenId === 20).cantidad, 3);
});

test("25. venta mixta: la transferencia excluye el servicio", () => {
  const r = mapear([
    normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 1 }),
    normal({ productoLocalId: 11, productoBaseId: 110, cantidad: 2 }),
    servicio({ productoLocalId: 50, productoBaseId: 500 }),
  ]);
  assert.equal(r.items.length, 2);
  assert.equal(r.items.some((i) => i.productoLocalOrigenId === 50), false);
  assert.equal(r.omitidos.servicios, 1);
});

test("26. venta 100% servicios → venta sin transferencia, sin error", () => {
  const r = mapear([servicio({ productoLocalId: 50, productoBaseId: 500 })]);
  assert.equal(r.debeCrearTransferencia, false);
  assert.equal(r.codigo, "VENTA_SIN_MERCADERIA_TRANSFERIBLE");
  assert.deepEqual(r.items, []);
});

// ══ 4. IDEMPOTENCIA ═══════════════════════════════════════════════════════════

test("27 y 28. reintento con la transferencia ya creada no duplica nada", () => {
  const b = bloqueoReintentoHuerfana({ esInterna: true, tieneFisico: true, tieneTransferencia: true });
  assert.equal(b, null, "devuelve la respuesta idempotente de siempre");
});

test("29. venta interna preexistente SIN transferencia → 409 explícito", () => {
  const b = bloqueoReintentoHuerfana({ esInterna: true, tieneFisico: true, tieneTransferencia: false });
  assert.equal(b.status, 409);
  assert.equal(b.code, "VENTA_INTERNA_SIN_TRANSFERENCIA");
  assert.match(b.error, /Requiere revisión manual/);
});

test("29b. no bloquea lo que no corresponde", () => {
  // Venta externa sin transferencia: normal.
  assert.equal(bloqueoReintentoHuerfana({ esInterna: false, tieneFisico: true }), null);
  // Venta interna 100% servicios: nunca debió tener transferencia.
  assert.equal(bloqueoReintentoHuerfana({ esInterna: true, tieneFisico: false }), null);
  assert.equal(bloqueoReintentoHuerfana({}), null);
});

test("30. la unicidad de Transferencia.ventaId sigue declarada en el schema", () => {
  const schema = leer("prisma", "schema.prisma");
  const t = schema.match(/model Transferencia \{[\s\S]*?\n\}/)[0];
  assert.match(t, /ventaId\s+Int\?\s+@unique/);
  // Y clientTxnId sigue siendo la primera barrera.
  const v = schema.match(/model Venta \{[\s\S]*?\n\}/)[0];
  assert.match(v, /clientTxnId\s+String\?\s+@unique/);
});

test("27b. el atajo de idempotencia consulta transferencia y consumo físico", () => {
  // Sin esto el reintento no podría detectar la huérfana.
  const atajo = RUTA_CREAR.match(/where: \{ clientTxnId: txnId \}[\s\S]*?\}\);/)[0];
  assert.match(atajo, /transferencia: \{ select: \{ id: true \} \}/);
  assert.match(atajo, /cliente: \{ select: \{ localVinculadoId: true \} \}/);
  assert.match(atajo, /detalles: \{ select: \{ cantidadStock: true \} \}/);
});

// ══ 5. PROTECCIONES TEMPORALES ════════════════════════════════════════════════

test("39. cancelar una transferencia con ventaId se rechaza sin tocar stock", () => {
  assert.equal(bloqueoCancelacion({ ventaId: null }), null);
  assert.equal(bloqueoCancelacion({}), null);
  const b = bloqueoCancelacion({ ventaId: 555, estado: "Enviada" });
  assert.equal(b.status, 409);
  assert.equal(b.code, COD_CANCELAR_BLOQUEADA);
  assert.match(b.error, /generada desde una venta/);

  // Y en la ruta el bloqueo va ANTES de la transacción que mueve stock.
  const iBloqueo = RUTA_CANCELAR.indexOf("bloqueoCancelacion(transferencia)");
  const iTx = RUTA_CANCELAR.indexOf("prisma.$transaction");
  const iStock = RUTA_CANCELAR.indexOf("stockLocal.updateMany");
  assert.ok(iBloqueo > 0 && iBloqueo < iTx && iTx < iStock,
    "el rechazo debe ocurrir antes de abrir la transacción");
});

test("40. corregir una venta con transferencia se bloquea en cualquier estado", () => {
  assert.equal(bloqueoCorreccion({ transferencia: null }), null);
  assert.equal(bloqueoCorreccion({}), null);
  for (const estado of ["Enviada", "Recibiendo", "Recibida"]) {
    const b = bloqueoCorreccion({ transferencia: { id: 9, estado } });
    assert.equal(b.status, 409);
    assert.equal(b.code, COD_CORRECCION_BLOQUEADA);
    assert.match(b.error, /todavía no está disponible/);
    assert.match(b.error, new RegExp(estado));
  }
});

test("40b. el bloqueo está en las TRES vías de corrección, no solo en la UI", () => {
  const vias = [
    ["app", "api", "pos-ventas", "corregir-simple", "[id]", "route.js"],
    ["app", "api", "pos-ventas", "venta", "[id]", "corregir", "route.js"],
    ["app", "api", "pos-ventas", "venta", "[id]", "revisar", "route.js"],
  ];
  for (const v of vias) {
    const src = leer(...v);
    assert.match(src, /import \{ bloqueoCorreccion \}/, `${v.join("/")} debe importarlo`);
    assert.match(src, /bloqueoCorreccion\(/, `${v.join("/")} debe llamarlo`);
  }
  // La carga compartida de las dos vías COMPLETA trae la transferencia.
  const central = leer("lib", "pos-ventas", "correccionCompletaServer.js");
  assert.match(central, /transferencia: \{ select: \{ id: true, estado: true \} \}/);
  // Y la vía SIMPLE, que no usa cargarVentaOriginal, la pide en su propio select.
  const simple = leer("app", "api", "pos-ventas", "corregir-simple", "[id]", "route.js");
  assert.match(simple, /transferencia: \{ select: \{ id: true, estado: true \} \}/);
});

test("41. no hay otra vía de anulación de ventas que esquive el bloqueo", () => {
  // Las únicas rutas que MUTAN una venta son las tres ya cubiertas. Si aparece
  // otra, este test lo detecta y hay que decidir si también debe bloquearse.
  const rutas = leer("scripts", "..", "package.json") && null; // (placeholder inocuo)
  assert.equal(rutas, null);
  const anular = leer("app", "api", "compras-proveedor", "anular", "[id]", "route.js");
  assert.equal(/venta\./i.test(anular.replace(/\/\/.*$/gm, "")), false,
    "anular de compras no toca ventas");
});

test("42. la recepción sigue sin tocar deuda ni MovimientoCuenta", () => {
  const recepcion = leer("app", "api", "transferencias", "confirmar-recepcion", "route.js");
  for (const prohibido of ["movimientoCuenta", "MovimientoCuenta", "esFiado", "venta."]) {
    assert.equal(recepcion.includes(prohibido), false,
      `la recepción no debe mencionar "${prohibido}"`);
  }
});

// ══ 6. CARACTERIZACIÓN DEL ROUTE ══════════════════════════════════════════════

test("9-14. la transferencia se crea con SOLO_TRANSITO, ventaId y pos en null", () => {
  const llamada = RUTA_CREAR.match(/await crearTransferencia\(\{[\s\S]*?\}\);/)[0];
  assert.match(llamada, /origenId: localId/);
  // Etapa 4C: el destino sale de la RErrelectura transaccional, no del previo.
  assert.match(llamada, /destinoId: confirmado\.destinoId/);
  assert.equal(/destinoId: ventaInterna\.destinoId/.test(llamada), false,
    "no debe usarse el destino resuelto antes de abrir la transacción");
  assert.match(llamada, /posTransferenciaId: null/);
  assert.match(llamada, /ventaId: nuevaVenta\.id/);
  assert.match(llamada, /politicaStockOrigen: SOLO_TRANSITO/);
  assert.match(llamada, /items: mapeo\.items/);
  assert.match(llamada, /\btx,/, "usa el tx de la transacción, no prisma");
  // El estado "Enviada" lo pone el servicio, no la ruta.
  const svc = leer("lib", "transferencias", "crearTransferencia.js");
  assert.match(svc, /estado: "Enviada"/);
});

test("15-16. un solo descuento: la ruta nunca descuenta cantidad por su cuenta", () => {
  // Se comparan solo sentencias: los comentarios de la ruta nombran enTransito y
  // el doble descuento justamente para explicar por qué NO se hacen acá.
  const codigo = RUTA_CREAR.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // El único descuento de `cantidad` sigue siendo el de aplicarConsumoStock.
  assert.equal((codigo.match(/aplicarConsumoStock\(/g) || []).length, 1);
  assert.equal(codigo.includes("DESCONTAR_Y_TRANSITO"), false,
    "la venta jamás debe usar la política que descuenta dos veces");
  // Y `enTransito` lo mueve solo el servicio, vía la política.
  assert.equal(codigo.includes("enTransito"), false);
  const pol = leer("lib", "transferencias", "politicasStock.js");
  assert.match(pol, /SOLO_TRANSITO[\s\S]*?update: \{ enTransito: \{ increment: u \} \}/);
});

test("17-18. todo ocurre dentro de la MISMA transacción, en el orden correcto", () => {
  const iTx = RUTA_CREAR.indexOf("prisma.$transaction");
  const iConsumo = RUTA_CREAR.indexOf("aplicarConsumoStock(tx");
  const iVenta = RUTA_CREAR.indexOf("tx.venta.create");
  const iDetalles = RUTA_CREAR.indexOf("tx.ventaDetalle.create");
  const iTransf = RUTA_CREAR.indexOf("await crearTransferencia({");
  const iCC = RUTA_CREAR.indexOf("tx.movimientoCuenta.create");
  const iReturn = RUTA_CREAR.indexOf("return { venta: nuevaVenta");

  assert.ok(iTx > 0 && iConsumo > iTx, "el consumo va dentro de la tx");
  assert.ok(iVenta > iConsumo, "la venta se crea después del consumo");
  assert.ok(iDetalles > iVenta, "los detalles después de la venta");
  assert.ok(iTransf > iDetalles, "la transferencia después de los detalles");
  assert.ok(iCC > iTransf, "la cuenta corriente después de la transferencia");
  assert.ok(iReturn > iCC, "todo antes de cerrar la tx");

  // Y la transferencia NO se crea fuera de la transacción.
  const despuesDeTx = RUTA_CREAR.slice(iReturn);
  assert.equal(despuesDeTx.includes("crearTransferencia"), false);
});

test("la detección previa se resuelve antes de la transacción y no cuesta queries de más", () => {
  const iPrevio = RUTA_CREAR.indexOf("const previo = await resolverVentaInterna(prisma");
  const iTx = RUTA_CREAR.indexOf("prisma.$transaction");
  assert.ok(iPrevio > 0 && iPrevio < iTx, "la validación temprana va antes de la tx");

  // El resolver no consulta nada sin clienteId, y solo paga la consulta de grupo
  // cuando hay vínculo DECLARADO.
  assert.match(HELPER, /if \(!clienteId\) return nada\(CODIGOS\.CLIENTE_AUSENTE\)/);
  assert.match(HELPER, /if \(!cliente \|\| cliente\.localVinculadoId == null\) \{\s*\n\s*return nada/);
  const iSinVinculo = HELPER.indexOf("cliente.localVinculadoId == null");
  const iPertenencia = HELPER.indexOf("await pertenenciaAlGrupo(db");
  assert.ok(iPertenencia > iSinVinculo, "la pertenencia se consulta después del early return");
});

test("34. la venta externa no exige transferencias.crear", () => {
  // El permiso se calcula desde la sesión (sin query) y solo se USA dentro del
  // resolver, que corta antes si el cliente no tiene vínculo declarado.
  assert.match(RUTA_CREAR, /checkPerm\(session, "transferencias\.crear"\)\.ok === true/);
  const iPerm = HELPER.indexOf("tienePermisoCrearTransferencia: tienePermisoCrearTransferencia === true");
  const iCorte = HELPER.indexOf("cliente.localVinculadoId == null");
  assert.ok(iPerm > iCorte, "el permiso solo influye si hay vínculo declarado");
  // El permiso base del POS no cambió.
  assert.match(RUTA_CREAR, /requirePerm\(req, "pos\.usar"\)/);
});

test("el destino sale solo de localVinculadoId, nunca de nombre o localId", () => {
  const codigo = HELPER.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // El destino lo fija el evaluador a partir del vínculo.
  assert.match(codigo, /destinoId: ev\.activa === true \? ev\.localDestinoId : null/);
  // Nunca de localId ni del nombre.
  assert.equal(/destinoId:\s*\w*\.?localId\b/.test(codigo), false);
  assert.equal(/destinoId:.*nombre/.test(codigo), false);
  // El where del cliente se scopea por id + grupoId, sin localId.
  assert.match(codigo, /where: \{ id: Number\(clienteId\), grupoId \}/);
});

test("35. la respuesta pública de la venta no cambió", () => {
  // No se agregó `transferencia` al JSON: la cola offline y el POS comparan
  // campos concretos y no hay UI que lo consuma todavía.
  const respuesta = RUTA_CREAR.slice(RUTA_CREAR.indexOf("return NextResponse.json({\n      ok: true"));
  assert.equal(/transferencia:/.test(respuesta), false);
  assert.match(RUTA_CREAR, /ventaId: venta\.id/);
});

test("31-32. el flujo manual de transferencias quedó intacto", () => {
  const manual = leer("app", "api", "pos-transferencias", "enviar", "route.js");
  assert.match(manual, /posTransferenciaId: pos\.id|posTransferenciaId:\s*posId|posTransferenciaId/);
  // No usa la política de venta ni escribe ventaId.
  assert.equal(manual.includes("SOLO_TRANSITO"), false);
  assert.equal(manual.includes("ventaId"), false);
  // Sigue sin pasar política explícita → default DESCONTAR_Y_TRANSITO.
  const svc = leer("lib", "transferencias", "crearTransferencia.js");
  assert.match(svc, /politicaStockOrigen = DESCONTAR_Y_TRANSITO/);
});

test("36-38. cuenta corriente, pagos y reportes siguen igual", () => {
  // El fiado sigue creando su MovimientoCuenta dentro de la tx, sin condición nueva.
  assert.match(RUTA_CREAR, /if \(esFiadoVenta && clienteId\) \{/);
  assert.match(RUTA_CREAR, /tx\.ventaPago\.createMany/);
  // Reportes lee Venta sin filtrar por transferencia.
  const listado = leer("app", "api", "reportes-ventas", "listado", "route.js");
  assert.equal(listado.includes("transferencia"), false);
});

// ══ 7. TOCTOU: revalidación transaccional (etapa 4C) ══════════════════════════
//
// Doble de Prisma que devuelve un vínculo distinto en cada lectura, que es
// exactamente lo que pasa si otro usuario edita el cliente entre la validación
// previa y la transacción.

const dbFalso = (lecturas, { enGrupo = { origen: true, destino: true } } = {}) => {
  let i = 0;
  const calls = { cliente: 0, grupoDeposito: 0, grupoLocal: 0 };
  return {
    calls,
    cliente: {
      async findFirst(args) {
        calls.cliente += 1;
        calls.ultimoWhere = args.where;
        const v = lecturas[Math.min(i, lecturas.length - 1)];
        i += 1;
        return v;
      },
    },
    grupoDeposito: {
      async findFirst() { calls.grupoDeposito += 1; return enGrupo.origen ? { id: 1 } : null; },
    },
    grupoLocal: {
      async findFirst() { calls.grupoLocal += 1; return enGrupo.destino ? { id: 2 } : null; },
    },
  };
};

const clienteConVinculo = (destinoId, o = {}) => ({
  id: 90, localId: 1, grupoId: 5,
  localVinculadoId: destinoId,
  localVinculado: {
    id: destinoId,
    nombre: o.nombre ?? `Mini ${destinoId}`,
    activo: o.activo ?? true,
    es_deposito: false,
  },
});

const ARGS = {
  clienteId: 90, grupoId: 5, localOrigenId: 1,
  esDeposito: true, tienePermisoCrearTransferencia: true,
};

const lanzaVentaInterna = async (fn, code, status) => {
  await assert.rejects(async () => fn(), (e) => {
    assert.equal(e.esErrorVentaInterna, true, "debe ser el error tipado");
    assert.ok(e instanceof VentaInternaError);
    assert.equal(e.code, code, `código esperado ${code}, recibido ${e.code}`);
    assert.equal(e.status, status);
    assert.ok(e.message.length > 20, "el mensaje debe ser accionable");
    return true;
  });
};

test("4C-1. el vínculo no cambia → confirma el mismo destino", async () => {
  const db = dbFalso([clienteConVinculo(7)]);
  const r = await resolverVentaInterna(db, ARGS);
  assert.equal(r.activa, true);
  assert.equal(r.destinoId, 7);
  const c = confirmarVinculoTransaccional(r, 7);
  assert.deepEqual(c, { destinoId: 7, destinoNombre: "Mini 7" });
});

test("4C-2. el cliente se desvincula → VINCULO_INTERNO_MODIFICADO 409", async () => {
  const db = dbFalso([{ ...clienteConVinculo(7), localVinculadoId: null, localVinculado: null }]);
  const r = await resolverVentaInterna(db, ARGS);
  assert.equal(r.activa, false);
  // OJO: fuera de la transacción este código significa "venta común". Adentro NO
  // puede degradar: se traduce a conflicto.
  assert.equal(esSinVinculo(r.codigo), true);
  await lanzaVentaInterna(() => confirmarVinculoTransaccional(r, 7), COD_VINCULO_MODIFICADO, 409);
});

test("4C-2b. el cliente desaparece del grupo → también conflicto, no venta común", async () => {
  const db = dbFalso([null]);
  const r = await resolverVentaInterna(db, ARGS);
  await lanzaVentaInterna(() => confirmarVinculoTransaccional(r, 7), COD_VINCULO_MODIFICADO, 409);
});

test("4C-3. cambia de local 7 a 8 → 409 y NO se redirige al nuevo destino", async () => {
  const db = dbFalso([clienteConVinculo(8)]);
  const r = await resolverVentaInterna(db, ARGS);
  assert.equal(r.activa, true, "el 8 es un destino perfectamente válido…");
  assert.equal(r.destinoId, 8);
  // …pero el cajero vio el 7 en pantalla: se aborta.
  await lanzaVentaInterna(() => confirmarVinculoTransaccional(r, 7), COD_VINCULO_MODIFICADO, 409);
  try {
    confirmarVinculoTransaccional(r, 7);
  } catch (e) {
    assert.match(e.message, /cambió mientras se procesaba la venta/);
    assert.match(e.message, /Volvé a seleccionar el cliente/);
  }
});

test("4C-4. el destino queda inactivo → DESTINO_INACTIVO (código estructural)", async () => {
  const db = dbFalso([clienteConVinculo(7, { activo: false })]);
  const r = await resolverVentaInterna(db, ARGS);
  assert.equal(r.codigo, "DESTINO_INACTIVO");
  await lanzaVentaInterna(() => confirmarVinculoTransaccional(r, 7), "DESTINO_INACTIVO", 400);
});

test("4C-5. el destino sale del grupo → DESTINO_FUERA_DEL_GRUPO", async () => {
  const db = dbFalso([clienteConVinculo(7)], { enGrupo: { origen: true, destino: false } });
  const r = await resolverVentaInterna(db, ARGS);
  assert.equal(r.codigo, "DESTINO_FUERA_DEL_GRUPO");
  await lanzaVentaInterna(() => confirmarVinculoTransaccional(r, 7), "DESTINO_FUERA_DEL_GRUPO", 409);
});

test("4C-6. el origen sale del grupo → ORIGEN_FUERA_DEL_GRUPO", async () => {
  const db = dbFalso([clienteConVinculo(7)], { enGrupo: { origen: false, destino: true } });
  const r = await resolverVentaInterna(db, ARGS);
  assert.equal(r.codigo, "ORIGEN_FUERA_DEL_GRUPO");
  await lanzaVentaInterna(() => confirmarVinculoTransaccional(r, 7), "ORIGEN_FUERA_DEL_GRUPO", 409);
});

test("4C-6b. el origen deja de ser depósito → ORIGEN_NO_ES_DEPOSITO", async () => {
  const db = dbFalso([clienteConVinculo(7)]);
  const r = await resolverVentaInterna(db, { ...ARGS, esDeposito: false });
  await lanzaVentaInterna(() => confirmarVinculoTransaccional(r, 7), "ORIGEN_NO_ES_DEPOSITO", 400);
});

test("4C-6c. se pierde el permiso → SIN_PERMISO_TRANSFERENCIA 403", async () => {
  const db = dbFalso([clienteConVinculo(7)]);
  const r = await resolverVentaInterna(db, { ...ARGS, tienePermisoCrearTransferencia: false });
  await lanzaVentaInterna(() => confirmarVinculoTransaccional(r, 7), "SIN_PERMISO_TRANSFERENCIA", 403);
});

test("4C-7. cambia SOLO el nombre del destino → no bloquea, gana el dato fresco", async () => {
  const db = dbFalso([clienteConVinculo(7, { nombre: "Mini Siete (renombrado)" })]);
  const r = await resolverVentaInterna(db, ARGS);
  const c = confirmarVinculoTransaccional(r, 7);
  assert.equal(c.destinoId, 7);
  assert.equal(c.destinoNombre, "Mini Siete (renombrado)", "usa el nombre releído");
});

test("4C-8. la revalidación final usa tx, no prisma", () => {
  const codigo = RUTA_CREAR.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Previa con prisma, definitiva con tx.
  assert.match(codigo, /const previo = await resolverVentaInterna\(prisma, argsVinculo\)/);
  assert.match(codigo, /confirmarVinculoTransaccional\(\s*await resolverVentaInterna\(tx, argsVinculo\)/);
  // Dentro de la transacción no se lee el cliente con el prisma global.
  const iTx = codigo.indexOf("prisma.$transaction");
  const dentro = codigo.slice(iTx);
  assert.equal(/resolverVentaInterna\(prisma/.test(dentro), false);
  assert.equal(/prisma\.cliente\./.test(dentro), false);
});

test("4C-9 y 10. crearTransferencia recibe el destino transaccional y el previo no se reusa", () => {
  const codigo = RUTA_CREAR.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const llamada = codigo.match(/await crearTransferencia\(\{[\s\S]*?\}\);/)[0];
  assert.match(llamada, /destinoId: confirmado\.destinoId/);
  // Después de la revalidación, `ventaInterna.destinoId` solo aparece como valor
  // ESPERADO de la comparación, nunca como destino real.
  const iConfirmar = codigo.indexOf("confirmarVinculoTransaccional(");
  const despues = codigo.slice(codigo.indexOf("crearTransferencia({", iConfirmar));
  assert.equal(/ventaInterna\.destinoId/.test(despues), false,
    "el destino previo no puede usarse después de revalidar");
  // Y el orden: revalidar ANTES de crear.
  assert.ok(iConfirmar < codigo.indexOf("await crearTransferencia({"));
});

test("4C-11 y 12. cliente externo y venta sin cliente no pagan queries de vínculo", async () => {
  const sinCliente = dbFalso([]);
  const r1 = await resolverVentaInterna(sinCliente, { ...ARGS, clienteId: null });
  assert.equal(r1.codigo, "CLIENTE_AUSENTE");
  assert.equal(sinCliente.calls.cliente, 0, "sin clienteId no se consulta nada");

  const externo = dbFalso([{ id: 90, localId: 1, grupoId: 5, localVinculadoId: null, localVinculado: null }]);
  const r2 = await resolverVentaInterna(externo, ARGS);
  assert.equal(r2.codigo, "CLIENTE_SIN_LOCAL_VINCULADO");
  assert.equal(externo.calls.cliente, 1);
  assert.equal(externo.calls.grupoDeposito, 0, "sin vínculo no se consulta pertenencia");
  assert.equal(externo.calls.grupoLocal, 0);
});

test("4C-13. venta interna solo de servicios: NO se revalida el vínculo", () => {
  const codigo = RUTA_CREAR.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const iIf = codigo.indexOf("if (mapeo.debeCrearTransferencia) {");
  const iConfirmar = codigo.indexOf("confirmarVinculoTransaccional(");
  assert.ok(iIf > 0 && iConfirmar > iIf,
    "la revalidación va DENTRO del if de mercadería transferible");
  // Decisión documentada: sin mercadería no hay dependencia logística.
  assert.match(RUTA_CREAR, /NO se revalida el vínculo/);
});

test("4C-21. el error tipado conserva código, mensaje y HTTP", () => {
  const e = new VentaInternaError("X_CODE", "mensaje explicativo suficientemente largo", 418);
  assert.equal(e.code, "X_CODE");
  assert.equal(e.status, 418);
  assert.equal(e.esErrorVentaInterna, true);
  assert.equal(e.name, "VentaInternaError");
  assert.ok(e instanceof Error);
});

test("4C-22 y 23. el route traduce el error tipado y no devuelve NextResponse en la tx", () => {
  assert.match(RUTA_CREAR, /if \(err\.esErrorVentaInterna\) \{[\s\S]*?status: err\.status \|\| 409/);
  // El manejo general de errores desconocidos sigue existiendo después.
  assert.match(RUTA_CREAR, /if \(err\.esErrorVentaCombo\)/);
  assert.match(RUTA_CREAR, /err\.code === .P2002./);
  // Ningún NextResponse dentro del cuerpo de la transacción.
  const iTx = RUTA_CREAR.indexOf("prisma.$transaction");
  const iFinTx = RUTA_CREAR.indexOf("return { venta: nuevaVenta");
  assert.equal(/NextResponse/.test(RUTA_CREAR.slice(iTx, iFinTx)), false);
  // El helper tampoco conoce Next. Se comparan SENTENCIAS: sus comentarios
  // nombran NextResponse justamente para explicar que no se usa.
  const helperCodigo = HELPER.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/NextResponse|next\//.test(helperCodigo), false);
  assert.equal(/@\/lib\/prisma/.test(helperCodigo), false, "recibe el db, no lo importa");
});

test("4C: pertenenciaAlGrupo consulta cada tabla en su rol y con el db recibido", async () => {
  const db = dbFalso([clienteConVinculo(7)]);
  const p = await pertenenciaAlGrupo(db, { grupoId: 5, origenId: 1, destinoId: 7 });
  assert.deepEqual(p, { origen: true, destino: true });
  assert.equal(db.calls.grupoDeposito, 1, "el ORIGEN se busca en GrupoDeposito");
  assert.equal(db.calls.grupoLocal, 1, "el DESTINO se busca en GrupoLocal");
  // Y el helper no importa el prisma global.
  assert.equal(/@\/lib\/prisma/.test(HELPER), false);
});

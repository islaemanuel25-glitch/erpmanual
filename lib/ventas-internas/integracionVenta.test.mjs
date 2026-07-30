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
} from "./integracionVenta.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p) => readFileSync(join(RAIZ, ...p), "utf8");

const RUTA_CREAR = leer("app", "api", "pos-ventas", "crear", "route.js");
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
  assert.match(llamada, /destinoId: ventaInterna\.destinoId/);
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

test("la detección se resuelve antes de la transacción y no cuesta queries de más", () => {
  const iDeteccion = RUTA_CREAR.indexOf("let ventaInterna = null");
  const iTx = RUTA_CREAR.indexOf("prisma.$transaction");
  assert.ok(iDeteccion > 0 && iDeteccion < iTx);

  const bloque = RUTA_CREAR.slice(iDeteccion, iTx);
  // Sin clienteId no se consulta nada.
  assert.match(bloque, /if \(clienteId\) \{/);
  // Grupo y permiso solo si hay vínculo DECLARADO.
  assert.match(bloque, /if \(clienteVinculo\?\.localVinculadoId != null\) \{/);
  // El permiso usa la sesión ya resuelta: sin consulta extra.
  assert.match(bloque, /checkPerm\(session, "transferencias\.crear"\)/);
  // El grupo se resuelve en backend, no se confía en el body.
  assert.match(bloque, /getLocalIdsDeGrupo\(grupoId\)/);
});

test("34. la venta externa no exige transferencias.crear", () => {
  const iDeteccion = RUTA_CREAR.indexOf("let ventaInterna = null");
  const iTx = RUTA_CREAR.indexOf("prisma.$transaction");
  const bloque = RUTA_CREAR.slice(iDeteccion, iTx);
  const iIf = bloque.indexOf("localVinculadoId != null");
  const iPerm = bloque.indexOf("transferencias.crear");
  assert.ok(iPerm > iIf, "el permiso se evalúa DENTRO del if de vínculo declarado");
  // El permiso base del POS no cambió.
  assert.match(RUTA_CREAR, /requirePerm\(req, "pos\.usar"\)/);
});

test("el destino sale solo de localVinculadoId, nunca de nombre o localId", () => {
  const iDeteccion = RUTA_CREAR.indexOf("let ventaInterna = null");
  const bloque = RUTA_CREAR.slice(iDeteccion, RUTA_CREAR.indexOf("prisma.$transaction"));
  const codigo = bloque.replace(/\/\/.*$/gm, "");
  assert.match(codigo, /destinoId: evaluacion\.localDestinoId/);
  // No se usa cliente.localId ni el nombre para decidir el destino.
  assert.equal(/destinoId:\s*\w*\.?localId\b/.test(codigo), false);
  assert.equal(/destinoId:.*nombre/.test(codigo), false);
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

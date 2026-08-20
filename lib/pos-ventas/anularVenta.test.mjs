// Candados de ANULAR VENTA.
//
// El caso que la motivó es la venta 7726 / remito #97 del 2026-08-19, pero la
// operación es general: cubre las 99 ventas con remito y cualquier venta común
// mal cargada.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  puedeAnular,
  impactoEnArqueo,
  transferenciaFueTocada,
  CODIGOS_ANULAR,
  MOTIVO_MIN_ANULACION,
} from "./anularVenta.js";
import {
  whereVentaComercial,
  soloComercial,
  soloInterna,
  soloNoAnulada,
  evaluarVentaComercial,
  estaAnulada,
  SELECT_MARCA_INTERNA,
} from "../ventas/filtroVentaComercial.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const MOTIVO = "Se cargo al cliente equivocado en el POS.";
const TURNO_ABIERTO = { id: 300 };

const LINEAS_97 = [
  { cantidad: 3.62, recibido: null, unidadEnviada: "UNIDAD" },
  { cantidad: 24, recibido: null, unidadEnviada: "UNIDAD" },
];

const VENTA = {
  id: 7726,
  anuladaEn: null,
  turnoId: 264,
  turno: { id: 264, cierre: null },
  transferencia: { id: 97, estado: "Enviada", detalle: LINEAS_97 },
};

// ── EL CASO ─────────────────────────────────────────────────────────────────

test("1. una venta con remito Enviada y sin recibir se puede anular", () => {
  const v = puedeAnular({ venta: VENTA, turnoAbierto: TURNO_ABIERTO, motivo: MOTIVO });
  assert.equal(v.puede, true);
  assert.equal(v.turnoOriginalId, 264);
  assert.equal(v.turnoDestinoId, 300);
  assert.equal(v.turnoOriginalCerrado, false);
});

test("1b. una venta común, sin remito, también", () => {
  const v = puedeAnular({
    venta: { ...VENTA, transferencia: null },
    turnoAbierto: TURNO_ABIERTO,
    motivo: MOTIVO,
  });
  assert.equal(v.puede, true);
});

// ── EL TURNO CERRADO: LO QUE HACE QUE LA HERRAMIENTA SIRVA ──────────────────

test("2. CON EL TURNO CERRADO se puede, y la diferencia cae en el turno abierto", () => {
  // Ésta es la razón de existir de toda la tanda. Medido el 2026-08-20: 82 de
  // las 99 ventas con remito están en turnos ya cerrados. Exigir turno abierto
  // —como hace la corrección completa— dejaría la herramienta sirviendo para 17.
  const cerrada = { ...VENTA, turno: { id: 264, cierre: new Date("2026-08-19T23:00:00Z") } };
  const v = puedeAnular({
    venta: cerrada,
    turnoAbierto: TURNO_ABIERTO,
    motivo: MOTIVO,
    puedeTurnoCerrado: true,
  });
  assert.equal(v.puede, true);
  assert.equal(v.turnoOriginalCerrado, true);
  assert.equal(v.turnoOriginalId, 264, "el turno original se conserva en el registro");
  assert.equal(v.turnoDestinoId, 300, "pero la diferencia cae en el abierto, no en el cerrado");
  assert.notEqual(v.turnoOriginalId, v.turnoDestinoId);
});

test("2b. y sin el permiso, el turno cerrado bloquea", () => {
  const cerrada = { ...VENTA, turno: { id: 264, cierre: new Date() } };
  const v = puedeAnular({
    venta: cerrada,
    turnoAbierto: TURNO_ABIERTO,
    motivo: MOTIVO,
    puedeTurnoCerrado: false,
  });
  assert.equal(v.codigo, CODIGOS_ANULAR.SIN_PERMISO_TURNO_CERRADO);
});

test("2c. sin NINGÚN turno abierto no se puede: la diferencia no tendría dónde caer", () => {
  const v = puedeAnular({ venta: VENTA, turnoAbierto: null, motivo: MOTIVO });
  assert.equal(v.codigo, CODIGOS_ANULAR.SIN_TURNO_DESTINO);
});

test("2d. NO hay ventana de días: una venta vieja se anula igual", () => {
  // La ventana de 30 días de la corrección se sacó a propósito. El predicado no
  // recibe fecha ni reloj — este candado lo comprueba por la firma: si alguien
  // reintroduce un límite temporal, va a tener que agregar un parámetro y esto
  // se pone rojo.
  const src = fs.readFileSync(path.join(RAIZ, "lib/pos-ventas/anularVenta.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.ok(!/DIAS_LIMITE|ventana|diasTranscurridos|new Date\(\)/.test(src),
    "apareció un límite temporal en la anulación: se sacó a propósito");
});

// ── LO QUE BLOQUEA ──────────────────────────────────────────────────────────

test("3. un remito que no está en Enviada bloquea", () => {
  for (const estado of ["Recibiendo", "Recibida", "Cancelada", "Cancelando"]) {
    const v = puedeAnular({
      venta: { ...VENTA, transferencia: { id: 97, estado, detalle: LINEAS_97 } },
      turnoAbierto: TURNO_ABIERTO,
      motivo: MOTIVO,
    });
    assert.equal(v.codigo, CODIGOS_ANULAR.TRANSFERENCIA_NO_ENVIADA, estado);
  }
});

test("4. una línea recibida bloquea — y 0 recibido YA es una recepción", () => {
  assert.equal(transferenciaFueTocada({ detalle: LINEAS_97 }), false);
  assert.equal(transferenciaFueTocada({ detalle: [{ recibido: 0 }] }), true);
  assert.equal(transferenciaFueTocada({ detalle: [{ recibido: 5 }] }), true);
  assert.equal(transferenciaFueTocada({ detalle: [{ recibido: undefined }] }), false);
  assert.equal(transferenciaFueTocada(null), false);

  const conCero = [{ ...LINEAS_97[0] }, { ...LINEAS_97[1], recibido: 0 }];
  const v = puedeAnular({
    venta: { ...VENTA, transferencia: { id: 97, estado: "Enviada", detalle: conCero } },
    turnoAbierto: TURNO_ABIERTO,
    motivo: MOTIVO,
  });
  assert.equal(v.codigo, CODIGOS_ANULAR.TRANSFERENCIA_CON_RECEPCION);
});

test("5. no se anula dos veces", () => {
  const v = puedeAnular({
    venta: { ...VENTA, anuladaEn: new Date() },
    turnoAbierto: TURNO_ABIERTO,
    motivo: MOTIVO,
  });
  assert.equal(v.codigo, CODIGOS_ANULAR.YA_ANULADA);
  assert.match(v.error, /dos veces/i);
});

test("6. el motivo es obligatorio", () => {
  for (const motivo of ["", "  ", "error", null, 42]) {
    assert.equal(
      puedeAnular({ venta: VENTA, turnoAbierto: TURNO_ABIERTO, motivo }).codigo,
      CODIGOS_ANULAR.MOTIVO_AUSENTE
    );
  }
  const justo = "x".repeat(MOTIVO_MIN_ANULACION);
  assert.equal(puedeAnular({ venta: VENTA, turnoAbierto: TURNO_ABIERTO, motivo: justo }).puede, true);
});

// ── EL IMPACTO EN EL ARQUEO ─────────────────────────────────────────────────

test("7. una venta comercial BAJA el esperado; una interna no lo mueve", () => {
  // La diferencia entre las dos es de cientos de miles de pesos y desde la
  // pantalla se ven iguales. Por eso el número se calcula y se muestra antes de
  // confirmar, en vez de que el cajero lo descubra al cerrar la caja.
  const comercial = {
    transferencia: null,
    anuladaEn: null,
    pagos: [{ medio: "EFECTIVO", monto: 155486.4 }],
  };
  const i = impactoEnArqueo(comercial);
  assert.equal(i.contabaEnArqueo, true);
  assert.equal(i.deltaEsperado, -155486.4);
  assert.deepEqual(i.medios, [{ medio: "EFECTIVO", monto: 155486.4 }]);

  const interna = { ...comercial, transferencia: { id: 97 } };
  const k = impactoEnArqueo(interna);
  assert.equal(k.contabaEnArqueo, false);
  assert.equal(k.deltaEsperado, 0, "una interna no estaba en el esperado: anularla no lo mueve");
  assert.deepEqual(k.medios, []);
});

test("7b. y suma todos los medios de un pago dividido", () => {
  const i = impactoEnArqueo({
    transferencia: null,
    anuladaEn: null,
    pagos: [{ medio: "EFECTIVO", monto: 1000 }, { medio: "DEBITO", monto: 500 }],
  });
  assert.equal(i.deltaEsperado, -1500);
  assert.equal(i.medios.length, 2);
});

// ── EL FILTRO: LOS 17 LUGARES DE UNA SOLA VEZ ───────────────────────────────

test("8. una venta anulada NO cuenta como comercial", () => {
  assert.deepEqual(soloNoAnulada(), { anuladaEn: null });
  assert.deepEqual(soloComercial(), { transferencia: { is: null }, anuladaEn: null });
  assert.deepEqual(whereVentaComercial({ turnoId: 264 }), {
    turnoId: 264,
    transferencia: { is: null },
    anuladaEn: null,
  });
});

test("8b. las internas anuladas tampoco cuentan como internas", () => {
  // Si faltara, las dos mitades no sumarían el total: una interna anulada no
  // estaría en ninguna de las dos listas o estaría en una que no corresponde.
  assert.deepEqual(soloInterna(), { transferencia: { isNot: null }, anuladaEn: null });
});

test("8c. pisar UNA condición no se lleva la otra de arrastre", () => {
  // Es el defecto que casi entra. El atajo original devolvía el `where` del
  // llamador tal cual cuando traía `transferencia`, así que al agregar la
  // anulación ese camino se habría saltado el `anuladaEn: null` sin avisar.
  const soloInternasVivas = whereVentaComercial({ transferencia: { isNot: null } });
  assert.deepEqual(soloInternasVivas, { transferencia: { isNot: null }, anuladaEn: null },
    "pidiendo internas se perdió el filtro de anuladas");

  // Y al revés: quien pida explícitamente ver anuladas, las ve.
  const conAnuladas = whereVentaComercial({ anuladaEn: { not: null } });
  assert.deepEqual(conAnuladas, { anuladaEn: { not: null }, transferencia: { is: null } });
});

test("8d. el evaluador en memoria exige las DOS columnas", () => {
  assert.deepEqual(evaluarVentaComercial({ transferencia: null, anuladaEn: null }),
    { esComercial: true, resoluble: true });
  assert.deepEqual(evaluarVentaComercial({ transferencia: null, anuladaEn: new Date() }),
    { esComercial: false, resoluble: true });
  // Sin `anuladaEn` en el select no se puede saber: NO se asume que está viva.
  assert.deepEqual(evaluarVentaComercial({ transferencia: null }),
    { esComercial: false, resoluble: false });
  assert.ok("anuladaEn" in SELECT_MARCA_INTERNA, "el select mínimo tiene que traer anuladaEn");
});

test("8e. estaAnulada deriva de la fecha, no de un flag", () => {
  assert.equal(estaAnulada({ anuladaEn: new Date() }), true);
  assert.equal(estaAnulada({ anuladaEn: null }), false);
  assert.equal(estaAnulada({}), false);
  assert.equal(estaAnulada(null), false);
});

test("8f. NO existe un booleano `anulada` al lado de la fecha", () => {
  // Dos fuentes de verdad discrepan algún día y ese día no hay forma de saber
  // cuál manda. El estado se deriva de una sola columna.
  const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  const venta = schema.match(/model Venta \{[\s\S]*?\n\}/)[0].replace(/\/\/[^\n]*/g, "");
  assert.match(venta, /anuladaEn\s+DateTime\?/);
  assert.ok(!/\banulada\s+Boolean/.test(venta), "apareció un booleano `anulada` en paralelo a la fecha");
});

// ── LA RUTA ─────────────────────────────────────────────────────────────────

const rutaSrc = () =>
  fs
    .readFileSync(path.join(RAIZ, "app/api/pos-ventas/venta/[id]/anular/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("9. la ruta REUSA el motor de la corrección, no escribe uno nuevo", () => {
  const src = rutaSrc();
  for (const pieza of ["aplicarDeltaStock", "ajustarCuentaCorriente", "ajustarPuntosCorreccion"]) {
    assert.ok(src.includes(pieza), `la ruta dejó de usar ${pieza}: hay un motor nuevo al lado`);
  }
  // Y la reversión del remito sale de la pieza única, no de una cuenta a mano.
  assert.match(src, /reversionStockOrigen/);
  assert.ok(!/enTransito:\s*\{\s*(decrement|increment)/.test(src),
    "apareció una reversión de tránsito escrita a mano: tiene que salir de politicasStock");
});

test("10. la ruta conecta el permiso de turno cerrado, que antes nadie consultaba", () => {
  const src = rutaSrc();
  assert.match(src, /ventas\.corregir_turno_cerrado/,
    "el permiso existe en el catálogo pero la ruta no lo mira: el turno cerrado quedaría bloqueado igual");
  assert.match(src, /ventas\.corregir_completa/);
});

test("11. la anulación es atómica y ordenada", () => {
  const src = rutaSrc();
  assert.match(src, /\$transaction/);
  // La barrera del remito va antes de tocar stock: si perdimos la carrera con
  // una recepción, no se tocó nada.
  //
  // Se buscan las LLAMADAS, no los nombres: escrito con `indexOf("aplicarDeltaStock")`
  // este candado daba rojo sobre una ruta correcta, porque encontraba el import
  // de arriba de todo en vez del uso. Un candado que compara posiciones tiene que
  // mirar el lugar donde la cosa ocurre.
  const posBarrera = src.indexOf('estado: "Enviada"');
  const posStock = src.indexOf("await aplicarDeltaStock(");
  const posMarca = src.indexOf("anuladaEn: new Date()");
  assert.ok(posBarrera > 0 && posStock > 0 && posMarca > 0, "no se encontró alguno de los tres tramos");
  assert.ok(posBarrera > 0 && posBarrera < posStock, "la barrera del remito tiene que ir antes del stock");
  assert.ok(posStock < posMarca, "el stock se devuelve antes de marcar la venta");
  assert.match(src, /lock\.count === 0/);
  assert.match(src, /version: versionBase, anuladaEn: null/,
    "sin `anuladaEn: null` en el where, dos anulaciones concurrentes devuelven el stock dos veces");
});

test("12. la ruta NO borra nada: marca", () => {
  const src = rutaSrc();
  for (const prohibido of ["venta.delete", "ventaDetalle.delete", "ventaPago.delete", "deleteMany"]) {
    assert.ok(!src.includes(prohibido), `la ruta usa ${prohibido}: anular MARCA, no borra`);
  }
});

test("13. el remito NO devuelve la cantidad cuando la venta ya la devuelve", () => {
  // El error que estaría a un renglón de distancia: si la cancelación del remito
  // devolviera `cantidad` Y la anulación de la venta también, el depósito
  // recuperaría la mercadería DOS veces. La política SOLO_TRANSITO es lo que lo
  // evita, y por eso la ruta la deriva en vez de fijarla.
  const src = rutaSrc();
  assert.match(src, /politicaDeLaTransferencia\(t\)/,
    "la política se fijó a mano en vez de derivarse: una transferencia manual se revertiría mal");
});

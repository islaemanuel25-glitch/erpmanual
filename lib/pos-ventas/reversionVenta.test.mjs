// Candados del MOTOR DE REVERSIÓN DE UNA VENTA.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
//
// Estos candados nacieron en `anularVenta.test.mjs`, junto a la ruta que anulaba
// una venta desde Ventas. Esa ruta se retiró el 2026-08-20 —una venta interna se
// corrige desde el REMITO— pero el motor no: lo usa la cancelación de
// transferencias.
//
// Es la segunda vez en dos días que borrar una operación se lleva por delante los
// candados de una pieza que sobrevive. La regla, otra vez: un candado vive con la
// pieza que prueba, no con la pantalla que la estrenó.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  deltaDeDevolucion,
  impactoEnArqueo,
  revertirVenta,
  veredictoAnulacionVentaComun,
  validarMotivoAnulacion,
  ajusteDelCierrePorAnulacion,
  CODIGOS_ANULAR,
} from "./reversionVenta.js";
import { reconstruirConsumoOriginal } from "./motorCorreccion.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

// ── LO QUE HAY QUE DEVOLVER AL STOCK ────────────────────────────────────────

test("1. devuelve exactamente lo que la venta consumió", () => {
  const delta = deltaDeDevolucion([
    { productoLocalId: 7, cantidadStock: 3, componentes: [] },
    { productoLocalId: 9, cantidadStock: 2.5, componentes: [] },
  ]);
  assert.deepEqual(delta, [
    { productoLocalId: 7, delta: 3 },
    { productoLocalId: 9, delta: 2.5 },
  ]);
});

test("1b. un combo devuelve por sus COMPONENTES, no por la línea", () => {
  // La línea del combo no mueve stock: lo mueven sus partes. Devolver por la
  // línea repondría una unidad de un producto que no existe en el inventario.
  const delta = deltaDeDevolucion([
    {
      productoLocalId: 100,
      cantidadStock: 1,
      componentes: [
        { productoLocalId: 7, cantidad: 2 },
        { productoLocalId: 9, cantidad: 1 },
      ],
    },
  ]);
  assert.deepEqual(delta, [
    { productoLocalId: 7, delta: 2 },
    { productoLocalId: 9, delta: 1 },
  ]);
  assert.ok(!delta.some((d) => d.productoLocalId === 100), "el combo en sí no tiene stock");
});

test("1c. un servicio no devuelve nada, y dos líneas del mismo producto se suman", () => {
  // `cantidadStock: null` marca la línea que no mueve stock.
  const conServicio = deltaDeDevolucion([
    { productoLocalId: null, cantidadStock: null, componentes: [] },
    { productoLocalId: 7, cantidadStock: 1, componentes: [] },
    { productoLocalId: 7, cantidadStock: 2, componentes: [] },
  ]);
  assert.deepEqual(conServicio, [{ productoLocalId: 7, delta: 3 }]);
});

test("1d. cantidades cero o inválidas no generan escrituras", () => {
  assert.deepEqual(deltaDeDevolucion([]), []);
  assert.deepEqual(deltaDeDevolucion([{ productoLocalId: 7, cantidadStock: 0, componentes: [] }]), []);
  assert.deepEqual(deltaDeDevolucion([{ productoLocalId: 7, cantidadStock: "x", componentes: [] }]), []);
});

// ── EL IMPACTO EN EL ARQUEO ─────────────────────────────────────────────────

test("2. una venta comercial BAJA el esperado; una interna no lo mueve", () => {
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

  const interna = { ...comercial, transferencia: { id: 97 } };
  const k = impactoEnArqueo(interna);
  assert.equal(k.contabaEnArqueo, false);
  assert.equal(k.deltaEsperado, 0, "una interna no estaba en el esperado: revertirla no lo mueve");
  assert.deepEqual(k.medios, []);
});

test("2b. suma todos los medios de un pago dividido", () => {
  const i = impactoEnArqueo({
    transferencia: null,
    anuladaEn: null,
    pagos: [{ medio: "EFECTIVO", monto: 1000 }, { medio: "DEBITO", monto: 500 }],
  });
  assert.equal(i.deltaEsperado, -1500);
  assert.equal(i.medios.length, 2);
});

// ── EL MOTOR, LEÍDO ─────────────────────────────────────────────────────────

const src = () =>
  fs
    .readFileSync(path.join(RAIZ, "lib/pos-ventas/reversionVenta.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("3. REUSA las piezas de la corrección completa, no escribe otras", () => {
  const s = src();
  for (const pieza of ["aplicarDeltaStock", "ajustarCuentaCorriente", "ajustarPuntosCorreccion"]) {
    assert.ok(s.includes(pieza), `el motor dejó de usar ${pieza}: hay una reimplementación al lado`);
  }
});

test("4. NO borra nada: marca", () => {
  const s = src();
  for (const prohibido of ["venta.delete", "ventaDetalle.delete", "ventaPago.delete", "deleteMany"]) {
    assert.ok(!s.includes(prohibido), `el motor usa ${prohibido}: revertir MARCA, no borra`);
  }
  assert.match(s, /anuladaEn: new Date\(\)/);
});

test("5. NO toca la transferencia, y ésa es la mitad que evita la doble devolución", () => {
  // El motor devuelve `cantidad` al local que vendió. Si además cancelara el
  // remito con su propia reversión, el origen recuperaría la mercadería dos
  // veces. Cancelar el remito es del llamador.
  const s = src();
  assert.ok(!/tx\.transferencia\./.test(s), "el motor escribe sobre la transferencia: eso es del llamador");
  assert.ok(!/reversionStockOrigen/.test(s), "el motor revierte el tránsito: eso es del llamador");
});

test("6. no abre su propia transacción: la recibe", () => {
  // Es lo que permite que la cancelación del remito y la reversión de la venta
  // sean todo o nada. Si el motor abriera la suya, serían dos transacciones y
  // una podría quedar aplicada sin la otra.
  const s = src();
  assert.ok(!/\$transaction/.test(s), "el motor abre su propia transacción: rompe la atomicidad del conjunto");
  assert.match(s, /export async function revertirVenta\(\s*tx,/);
});

test("7. bloqueo optimista Y guardia de doble anulación", () => {
  // Sin `anuladaEn: null` en el where, dos reversiones concurrentes devolverían
  // el stock dos veces.
  const s = src();
  assert.match(s, /version: versionBase, anuladaEn: null/);
  assert.match(s, /upd\.count === 0/);
});

// ── 8 · ANULAR UNA VENTA COMÚN DEL MOSTRADOR ────────────────────────────────
//
// El caso de origen es real: Mini unidas, 2026-10-10 14:48, el POS se tildó y
// registró dos veces el mismo ticket —Consumidor final, 1 "Philips 20 común",
// $5.700 en efectivo, turno abierto—. La forma de la venta es la del SELECT_VENTA
// de `app/api/pos-ventas/venta/[id]/anular/route.js`, campo por campo: los
// decimales llegan de Prisma como Decimal y acá van como texto, que es como
// `Number()` los ve. Los ids son inventados; la forma no.

const MINI_UNIDAS = 5;
const PL_PHILIPS = 4321;

const ventaDuplicada = (cambios = {}) => ({
  id: 9764,
  numero: 9764,
  total: "5700",
  esFiado: false,
  clienteId: null,
  localId: MINI_UNIDAS,
  operadorId: 12,
  turnoId: 880,
  version: 0,
  anuladaEn: null,
  turno: { id: 880, cierre: null, cierreEnPreparacionEn: null, anuladoEn: null },
  transferencia: null,
  // `MedioPago` es un enum en mayúsculas. Hasta el 2026-10-10 esto decía
  // "efectivo": nadie lo miraba por medio y pasaba; el cierre sí lo mira.
  pagos: [{ medio: "EFECTIVO", monto: "5700" }],
  detalles: [
    {
      id: 1,
      nombre: "Philips 20 común",
      esServicio: false,
      productoLocalId: PL_PHILIPS,
      cantidadStock: "1",
      componentes: [],
    },
  ],
  ...cambios,
});

/** Una transacción de Prisma que anota lo que se le escribe. */
function txQueAnota() {
  const stock = [];
  const correcciones = [];
  const cierre = [];
  const anotarCierre = (entidad) => ({
    update: async ({ where, data }) => {
      cierre.push({ entidad, id: where.id, data });
      return {};
    },
  });
  const tx = {
    stock,
    correcciones,
    cierre,
    $queryRaw: async () => [],
    venta: { updateMany: async () => ({ count: 1 }) },
    ventaCorreccion: {
      create: async ({ data }) => {
        correcciones.push(data);
        return { id: 77 };
      },
    },
    turno: anotarCierre("Turno"),
    cierrePreparacion: anotarCierre("CierrePreparacion"),
    arqueoCaja: anotarCierre("ArqueoCaja"),
    stockLocal: {
      updateMany: async ({ where, data }) => {
        stock.push({ localId: where.localId, productoLocalId: where.productoId, incremento: data.cantidad.increment });
        return { count: 1 };
      },
    },
    movimientoCuenta: { create: async () => { throw new Error("una venta de contado no toca la cuenta corriente"); } },
    clientePuntoMovimiento: { create: async () => { throw new Error("consumidor final no tiene puntos"); } },
  };
  return tx;
}

/** Lo que la corrección completa devolvería al revertir esa venta entera. */
function reversionDeLaCorreccionCompleta(venta) {
  const porProducto = new Map();
  for (const d of venta.detalles) {
    const r = reconstruirConsumoOriginal(d);
    assert.equal(r.ambigua, false, "la corrección completa no sabría revertir esta línea");
    for (const c of r.consumo) porProducto.set(c.productoLocalId, (porProducto.get(c.productoLocalId) || 0) + c.cantidad);
  }
  return [...porProducto.entries()].map(([productoLocalId, cantidad]) => ({
    localId: venta.localId,
    productoLocalId,
    incremento: cantidad,
  }));
}

test("8. la venta duplicada de Mini unidas se puede anular, y el botón y la ruta lo saben igual", () => {
  const v = veredictoAnulacionVentaComun(ventaDuplicada());
  assert.equal(v.puede, true, v.error);
  assert.equal(v.turnoId, 880);
});

test("8b. anularla devuelve al stock de MINI UNIDAS lo mismo que revertiría la corrección completa", async () => {
  const venta = ventaDuplicada();
  const tx = txQueAnota();
  const r = await revertirVenta(tx, {
    venta,
    grupoId: 1,
    usuarioId: 1,
    motivo: "Ticket duplicado: el POS se tildó",
    versionEsperada: 0,
  });

  // Exactamente una escritura: +1 Philips, en el local de la venta.
  assert.deepEqual(tx.stock, [{ localId: MINI_UNIDAS, productoLocalId: PL_PHILIPS, incremento: 1 }]);
  // Y es la misma reversión que hace la corrección completa, no una parecida.
  assert.deepEqual(tx.stock, reversionDeLaCorreccionCompleta(venta));
  assert.equal(r.productosDevueltos, 1);
  // Con el turno abierto no hay cierre que tocar, y el ajuste es del mismo turno.
  assert.deepEqual(tx.cierre, []);
  assert.equal(tx.correcciones[0].turnoIdOriginal, 880);
  assert.equal(tx.correcciones[0].turnoIdCorreccion, 880);
});

test("8c. el panel dice que el efectivo esperado baja $5.700", () => {
  const a = impactoEnArqueo(ventaDuplicada());
  assert.equal(a.contabaEnArqueo, true);
  assert.equal(a.deltaEsperado, -5700);
  assert.equal(a.deltaEfectivo, -5700);
  assert.deepEqual(a.medios, [{ medio: "EFECTIVO", monto: 5700 }]);
  // Cobrada con tarjeta, el EFECTIVO esperado no se mueve.
  assert.equal(impactoEnArqueo(ventaDuplicada({ pagos: [{ medio: "DEBITO", monto: "5700" }] })).deltaEfectivo, 0);
});

test("8d. un combo y un servicio también vuelven como los revierte la corrección completa", async () => {
  const venta = ventaDuplicada({
    detalles: [
      { id: 1, nombre: "Combo", esServicio: false, productoLocalId: null, cantidadStock: null,
        componentes: [{ productoLocalId: 11, cantidad: "2" }, { productoLocalId: 12, cantidad: "1.5" }] },
      { id: 2, nombre: "Carga SUBE", esServicio: true, productoLocalId: null, cantidadStock: null, componentes: [] },
      { id: 3, nombre: "Philips 20 común", esServicio: false, productoLocalId: PL_PHILIPS, cantidadStock: "3", componentes: [] },
    ],
  });
  assert.equal(veredictoAnulacionVentaComun(venta).puede, true);
  const tx = txQueAnota();
  await revertirVenta(tx, { venta, grupoId: 1, motivo: "x", versionEsperada: 0 });
  const orden = (a) => [...a].sort((x, y) => x.productoLocalId - y.productoLocalId);
  assert.deepEqual(orden(tx.stock), orden(reversionDeLaCorreccionCompleta(venta)));
});

const TURNO_CERRADO = { id: 880, cierre: new Date("2026-10-10T23:00:00Z"), cierreEnPreparacionEn: new Date("2026-10-10T22:55:00Z"), anuladoEn: null };

test("8e. lo que NO se anula desde Ventas", () => {
  const casos = [
    [ventaDuplicada({ transferencia: { id: 97 } }), CODIGOS_ANULAR.CON_REMITO],
    [ventaDuplicada({ anuladaEn: new Date() }), CODIGOS_ANULAR.YA_ANULADA],
    // Cerrado SIN el permiso de turno cerrado.
    [ventaDuplicada({ turno: TURNO_CERRADO }), CODIGOS_ANULAR.SIN_PERMISO_TURNO_CERRADO],
    // Corte tomado y sin confirmar: su esperado está congelado mientras alguien cuenta.
    [ventaDuplicada({ turno: { id: 880, cierre: null, cierreEnPreparacionEn: new Date(), anuladoEn: null } }), CODIGOS_ANULAR.TURNO_EN_CIERRE],
    [ventaDuplicada({ turno: { ...TURNO_CERRADO, anuladoEn: new Date() } }), CODIGOS_ANULAR.TURNO_ANULADO],
    [ventaDuplicada({ turnoId: null, turno: null }), CODIGOS_ANULAR.SIN_TURNO],
    // Una línea vieja sin consumo congelado: el motor la saltearía en silencio y
    // la mercadería no volvería.
    [ventaDuplicada({ detalles: [{ id: 1, nombre: "Vieja", esServicio: false, productoLocalId: PL_PHILIPS, cantidadStock: null, componentes: [] }] }),
      CODIGOS_ANULAR.CONSUMO_NO_CONGELADO],
    [null, CODIGOS_ANULAR.VENTA_AUSENTE],
  ];
  for (const [venta, codigo] of casos) {
    const v = veredictoAnulacionVentaComun(venta);
    assert.equal(v.puede, false, `se aceptó un caso que debía dar ${codigo}`);
    assert.equal(v.codigo, codigo);
  }
  // Con el permiso, el turno en cierre y el anulado siguen sin poder.
  assert.equal(veredictoAnulacionVentaComun(casos[3][0], { puedeTurnoCerrado: true }).codigo, CODIGOS_ANULAR.TURNO_EN_CIERRE);
  assert.equal(veredictoAnulacionVentaComun(casos[4][0], { puedeTurnoCerrado: true }).codigo, CODIGOS_ANULAR.TURNO_ANULADO);
});

// ── 9 · CON EL TURNO CERRADO: EL AJUSTE VA AL TURNO ORIGINAL, Y A NINGÚN OTRO ─
//
// El caso real: el turno de Estefania se cerró con un faltante de $11.400 —los
// dos tickets duplicados que nunca se cobraron—. La forma de las tres filas es
// la que graba `cierres/[token]/confirmar` con el orden actual (cambio separado
// antes, retiro contado después): el turno lleva esperado, contado y diferencia,
// sin `totalVentasEfectivo`; el corte lleva el retiro esperado; el arqueo FINAL
// lleva el contado total del cajón. Los importes son inventados; la forma no.
// 186.300 esperado, 20.000 de cambio, 154.900 de retiro contado → 174.900
// contados, −11.400.

const cierreDeEstefania = () => ({
  turno: {
    ...TURNO_CERRADO,
    montoEsperadoEfectivo: "186300",
    montoRealEfectivo: "174900",
    diferenciaEfectivo: "-11400",
    totalVentasEfectivo: null,
    totalVentasDigital: null,
    cantidadVentas: 41,
  },
  corte: {
    id: 300, turnoId: 880, estado: "CONFIRMADO",
    efectivoEsperadoCorte: "186300", totalCambio: "20000", efectivoRetiradoEsperado: "166300",
    totalRetiroContado: "154900", totalContado: null, diferencia: "-11400", cantidadVentasCorte: 41,
  },
  arqueoFinal: { id: 500, turnoId: 880, tipo: "FINAL", efectivoEsperado: "186300", efectivoContado: "174900", diferencia: "-11400" },
});

/** Aplica lo anotado por la tx a las filas, como lo haría la base. */
function aplicar(filas, anotado) {
  const por = { Turno: filas.turno, CierrePreparacion: filas.corte, ArqueoCaja: filas.arqueoFinal };
  for (const w of anotado) Object.assign(por[w.entidad], w.data);
}

test("9. con el turno cerrado se puede, con el permiso, y el veredicto lo dice", () => {
  const v = veredictoAnulacionVentaComun(ventaDuplicada({ turno: TURNO_CERRADO }), { puedeTurnoCerrado: true });
  assert.equal(v.puede, true, v.error);
  assert.equal(v.turnoCerrado, true);
  assert.equal(v.turnoId, 880);
});

test("9b. anular los dos duplicados borra el faltante de $11.400, en el turno ORIGINAL y en ningún otro", async () => {
  const filas = cierreDeEstefania();
  const escrituras = [];
  const correcciones = [];

  for (const id of [9764, 9765]) {
    const venta = ventaDuplicada({ id, numero: id, turno: filas.turno });
    const ajuste = ajusteDelCierrePorAnulacion({ venta, ...filas });
    assert.equal(ajuste.ok, true, ajuste.error);
    const tx = txQueAnota();
    await revertirVenta(tx, { venta, grupoId: 1, usuarioId: 1, motivo: "Ticket duplicado", ajusteCierre: ajuste, versionEsperada: 0 });
    escrituras.push(...tx.cierre);
    correcciones.push(...tx.correcciones);
    aplicar(filas, tx.cierre);
  }

  // El faltante desapareció en las tres copias del cierre.
  assert.equal(filas.turno.montoEsperadoEfectivo, 174900);
  assert.equal(filas.turno.diferenciaEfectivo, 0);
  assert.equal(filas.turno.cantidadVentas, 39);
  assert.equal(filas.corte.efectivoEsperadoCorte, 174900);
  assert.equal(filas.corte.efectivoRetiradoEsperado, 154900);
  assert.equal(filas.corte.diferencia, 0);
  assert.equal(filas.arqueoFinal.efectivoEsperado, 174900);
  assert.equal(filas.arqueoFinal.diferencia, 0);

  // Lo que el operador contó no se tocó.
  assert.equal(filas.turno.montoRealEfectivo, "174900");
  assert.equal(filas.corte.totalRetiroContado, "154900");
  assert.equal(filas.corte.totalCambio, "20000");
  assert.equal(filas.arqueoFinal.efectivoContado, "174900");
  for (const w of escrituras) {
    for (const contado of ["montoRealEfectivo", "efectivoContado", "totalRetiroContado", "totalContado", "totalCambio"]) {
      assert.ok(!(contado in w.data), `se escribió ${contado}, que es lo contado`);
    }
  }

  // EN NINGÚN OTRO TURNO: cada escritura es del turno 880, de su corte o de su arqueo.
  assert.deepEqual(
    [...new Set(escrituras.map((w) => `${w.entidad}#${w.id}`))].sort(),
    ["ArqueoCaja#500", "CierrePreparacion#300", "Turno#880"]
  );
  // Y el registro dice el mismo turno en los dos campos, con el rastro del esperado anterior.
  for (const c of correcciones) {
    assert.equal(c.turnoIdOriginal, 880);
    assert.equal(c.turnoIdCorreccion, 880);
    assert.equal(c.turnoCerrado, true);
  }
  assert.equal(correcciones[0].impactoCaja.cierreDelTurnoOriginal.esperadoAntes, 186300);
  assert.equal(correcciones[0].impactoCaja.cierreDelTurnoOriginal.diferenciaAntes, -11400);
  assert.equal(correcciones[1].impactoCaja.cierreDelTurnoOriginal.esperadoAntes, 180600);
  assert.equal(correcciones[1].impactoCaja.cierreDelTurnoOriginal.diferenciaDespues, 0);
});

test("9c. el motor no acepta un ajuste de otro turno, ni anular con el turno cerrado sin ajuste", async () => {
  const filas = cierreDeEstefania();
  const venta = ventaDuplicada({ turno: filas.turno });

  // Un cierre de otro turno: ni el plan lo arma, ni el motor lo escribe.
  const otro = { ...filas.turno, id: 990 };
  assert.equal(ajusteDelCierrePorAnulacion({ venta, turno: otro }).ok, false);
  assert.equal(ajusteDelCierrePorAnulacion({ venta, ...filas, corte: { ...filas.corte, turnoId: 990 } }).ok, false);
  const ajuste = ajusteDelCierrePorAnulacion({ venta, ...filas });
  await assert.rejects(
    revertirVenta(txQueAnota(), { venta, grupoId: 1, motivo: "x", ajusteCierre: { ...ajuste, turnoId: 990 }, versionEsperada: 0 }),
    /AJUSTE_FUERA_DEL_TURNO_ORIGINAL/
  );
  await assert.rejects(
    revertirVenta(txQueAnota(), {
      venta, grupoId: 1, motivo: "x", versionEsperada: 0,
      ajusteCierre: { ...ajuste, filas: [{ ...ajuste.filas[0], id: 990 }] },
    }),
    /AJUSTE_FUERA_DEL_TURNO_ORIGINAL/
  );
  await assert.rejects(
    revertirVenta(txQueAnota(), { venta, grupoId: 1, motivo: "x", versionEsperada: 0 }),
    /FALTA_AJUSTE_DEL_CIERRE/
  );
  // Y el motor ya no tiene forma de recibir otro turno: el parámetro se fue.
  assert.ok(!/turnoDestinoId/.test(src()), "volvió el turno de destino al motor");
});

test("9d. cerrado sin conteo: baja el esperado, la diferencia sigue sin existir", () => {
  const filas = cierreDeEstefania();
  Object.assign(filas.turno, { montoRealEfectivo: null, diferenciaEfectivo: null });
  const venta = ventaDuplicada({ turno: filas.turno });
  const a = ajusteDelCierrePorAnulacion({ venta, turno: filas.turno });
  assert.equal(a.cierre.esperadoDespues, 180600);
  assert.equal(a.cierre.diferenciaDespues, null);
  assert.equal(a.cierre.contado, null);
});

test("9e. una venta con tarjeta no mueve el efectivo esperado del cierre", () => {
  const filas = cierreDeEstefania();
  const venta = ventaDuplicada({ turno: filas.turno, pagos: [{ medio: "DEBITO", monto: "5700" }] });
  const a = ajusteDelCierrePorAnulacion({ venta, ...filas });
  assert.equal(a.efectivoAnulado, 0);
  assert.equal(a.cierre.esperadoDespues, 186300);
  assert.equal(a.cierre.diferenciaDespues, -11400);
});

test("8f. el motivo es obligatorio, sin mínimo inventado", () => {
  assert.equal(validarMotivoAnulacion("   ").ok, false);
  assert.equal(validarMotivoAnulacion(undefined).codigo, CODIGOS_ANULAR.MOTIVO_AUSENTE);
  assert.deepEqual(validarMotivoAnulacion("  duplicado "), { ok: true, motivo: "duplicado" });
});

test("8g. la RUTA pide el permiso de corrección completa, y el de turno cerrado se lo pasa al predicado", () => {
  const ruta = fs
    .readFileSync(path.join(RAIZ, "app/api/pos-ventas/venta/[id]/anular/route.js"), "utf8")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(ruta, /const PERMISO = "ventas\.corregir_completa";/);
  assert.match(ruta, /checkPerm\(session, PERMISO\)/);
  assert.match(ruta, /const PERMISO_TURNO_CERRADO = "ventas\.corregir_turno_cerrado";/);
  assert.match(ruta, /puedeTurnoCerrado = checkPerm\(session, PERMISO_TURNO_CERRADO\)\.ok/);
  // En el POST, adentro de la transacción, con el permiso: no solo en el preview.
  const post = ruta.slice(ruta.indexOf("export async function POST"));
  assert.match(post, /veredictoAnulacionVentaComun\(venta, \{ puedeTurnoCerrado \}\)/);
  // Y el botón se apaga sin esos mismos permisos.
  const detalle = fs
    .readFileSync(path.join(RAIZ, "app/api/reportes-ventas/detalle/[id]/route.js"), "utf8")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(
    detalle,
    /puedeAnular:\s*permiteCompleta &&\s*veredictoAnulacionVentaComun\(venta, \{ puedeTurnoCerrado: permiteTurnoCerrado \}\)\.puede/
  );
});

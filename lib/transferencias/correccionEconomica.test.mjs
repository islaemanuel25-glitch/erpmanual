// LA PLATA DE UNA RECEPCIÓN, CUANDO LA RECEPCIÓN NO COINCIDE CON EL REMITO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/correccionEconomica.test.mjs
//
// ── QUÉ DECIDE ESTE MÓDULO ─────────────────────────────────────────────────
//
// Hasta el 2026-09-11 confirmar una recepción movía el stock y no tocaba la
// plata. Está dicho en el propio `confirmar-recepcion`: *"el ajuste es de
// INVENTARIO, no comercial: si la transferencia nació de una venta interna, esa
// venta sigue facturando lo enviado"*. O sea que el remito quedaba con 156
// unidades en el depósito y 144 en la factura, para siempre.
//
// La decisión de negocio es que después de confirmar, **lo recibido es la verdad
// económica**. El importe original no se borra: queda congelado en la
// `VentaCorreccion`.
//
// ── LO QUE ESTE ARCHIVO PRUEBA, Y LO QUE NO ────────────────────────────────
//
// Acá va la aritmética PURA: cuánto vale lo recibido, cómo se parte en líneas
// comerciales y cómo se reparten los pagos. No hay Prisma. Que el camino real
// escriba todo eso en UNA transacción se prueba en `caminoCorreccionEconomica.test.mjs`.
//
// ── EL CASO QUE LO ORIGINÓ, CON DATOS REALES ───────────────────────────────
//
// Transferencia #198, venta 16836, leídas de producción el 2026-09-11:
//   VentaDetalle 65440 · cantidad 6 · cantidadStock 144 · precio 5.250 · subtotal 31.500
//   TransferenciaDetalle 6698 · snapshot PACK x24 · 6 presentadas
//   recibido hoy: 6 packs + 12 sueltas = 156 unidades físicas
//
// Auditado el mismo día sobre las 196 ventas internas con remito: `precio` y
// `precioCosto` coinciden en las 6.681 líneas, todas tienen exactamente UN pago
// y todas en EFECTIVO, ninguna tiene producto repetido ni combos ni servicios, y
// 147 de 196 tienen el turno original CERRADO. Ese último número es la razón por
// la que este camino no puede exigir turno abierto.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TIPO_CORRECCION_RECEPCION,
  LINEA_AGREGADA_SIN_PRECIO,
  claveIdempotencia,
  lineasCorregidasDeProducto,
  sincronizarPagos,
  planCorreccionEconomica,
} from "./correccionEconomica.js";

// ── LA LÍNEA DE VENTA REAL DE LA 16836 ─────────────────────────────────────
const VD_198 = Object.freeze({
  id: 65440,
  productoBaseId: 2410,
  nombre: "Pancho 24 Als",
  cantidad: 6, // packs, escala comercial
  cantidadStock: 144, // unidades físicas
  precio: 5250, // POR PACK — es el precio COMERCIAL, no el costo
  precioCosto: 5250,
  subtotal: 31500,
});

const corregir = (recibidasFisicas, factor = 24, vd = VD_198) =>
  lineasCorregidasDeProducto({ detalleVenta: vd, factor, recibidasFisicas });

// ═══════════════════════════════════════════════════════════════════════════
// LOS DIEZ CASOS DE DOMINIO
// ═══════════════════════════════════════════════════════════════════════════

test("CASO 1 · exacto: 6 PACK x24 recibidos valen los mismos 31.500", () => {
  const r = corregir(144);
  assert.equal(r.subtotalProducto, 31500);
  assert.equal(r.lineas.length, 1, "sin sueltas no se parte la línea");
  assert.equal(r.lineas[0].cantidad, 6);
  assert.equal(r.lineas[0].cantidadStock, 144);
  assert.equal(r.lineas[0].precio, 5250, "el precio comercial del pack no se toca");
  assert.equal(r.sinCambio, true);
});

test("CASO 2 · sobrante: 6 PACK x24 + 5 sueltas son 32.593,75", () => {
  const r = corregir(149);
  assert.equal(r.subtotalProducto, 32593.75);
  assert.equal(r.lineas.length, 2, "los bultos y las sueltas son dos líneas, no un pack fraccionario");

  const [bultos, sueltas] = r.lineas;
  assert.equal(bultos.cantidad, 6);
  assert.equal(bultos.cantidadStock, 144);
  assert.equal(bultos.subtotal, 31500);

  assert.equal(sueltas.cantidad, 5, "5 unidades, no 0,208 packs");
  assert.equal(sueltas.cantidadStock, 5);
  assert.equal(sueltas.precio, 218.75, "5.250 / 24, derivado del PRECIO y no del costo");
  assert.equal(sueltas.subtotal, 1093.75);

  // Y las dos partes suman el total sin residuo.
  assert.equal(bultos.subtotal + sueltas.subtotal, r.subtotalProducto);
});

test("CASO 3 · la #198 REAL de hoy: 6 PACK x24 + 12 sueltas son 34.125", () => {
  const r = corregir(156);
  assert.equal(r.subtotalProducto, 34125);
  assert.equal(r.lineas[1].cantidad, 12);
  assert.equal(r.lineas[1].subtotal, 2625);
  assert.equal(r.subtotalProducto - VD_198.subtotal, 2625, "la diferencia es +2.625");
});

test("CASO 4 · faltante: 4 PACK x24 valen 21.000", () => {
  const r = corregir(96);
  assert.equal(r.subtotalProducto, 21000);
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].cantidad, 4);
  assert.equal(r.lineas[0].cantidadStock, 96);
  assert.equal(r.subtotalProducto - VD_198.subtotal, -10500);
});

test("CASO 5 · no llegó nada: vale 0 y la línea NO se borra", () => {
  const r = corregir(0);
  assert.equal(r.subtotalProducto, 0);
  assert.equal(r.lineas.length, 1, "borrar la línea perdería que ese producto estaba en el remito");
  assert.equal(r.lineas[0].cantidad, 0);
  assert.equal(r.lineas[0].cantidadStock, 0);
  assert.equal(r.lineas[0].subtotal, 0);
});

test("CASO 6 · CAJÓN x8: la presentación no cambia la cuenta, solo el factor", () => {
  const vd = { ...VD_198, cantidad: 5, cantidadStock: 40, precio: 8000, precioCosto: 8000, subtotal: 40000 };
  // 5 cajones de 8 = 40 unidades a 1.000 la unidad.
  const exacto = lineasCorregidasDeProducto({ detalleVenta: vd, factor: 8, recibidasFisicas: 40 });
  assert.equal(exacto.subtotalProducto, 40000);
  assert.equal(exacto.lineas.length, 1);

  const conSueltas = lineasCorregidasDeProducto({ detalleVenta: vd, factor: 8, recibidasFisicas: 43 });
  assert.equal(conSueltas.subtotalProducto, 43000);
  assert.equal(conSueltas.lineas[0].cantidad, 5);
  assert.equal(conSueltas.lineas[1].cantidad, 3);
  assert.equal(conSueltas.lineas[1].precio, 1000);
});

test("CASO 7 · UNIDAD: factor 1, una sola línea, sin sueltas posibles", () => {
  const vd = { ...VD_198, cantidad: 20, cantidadStock: 20, precio: 150, precioCosto: 150, subtotal: 3000 };
  const r = lineasCorregidasDeProducto({ detalleVenta: vd, factor: 1, recibidasFisicas: 23 });
  assert.equal(r.subtotalProducto, 3450);
  assert.equal(r.lineas.length, 1, "con factor 1 no hay bultos que separar");
  assert.equal(r.lineas[0].cantidad, 23);
  assert.equal(r.lineas[0].cantidadStock, 23);
});

test("CASO 8 · línea histórica sin snapshot: se reconstruye en UNIDAD y no se rompe", () => {
  // Sin snapshot, `escalaDeEnvio` reconstruye y el factor cae en 1. Lo que este
  // candado exige es que eso siga dando un número correcto, no que dé lo mismo
  // que con snapshot: son dos líneas distintas.
  const vd = { ...VD_198, cantidad: 144, cantidadStock: 144, precio: 218.75, precioCosto: 218.75, subtotal: 31500 };
  const r = lineasCorregidasDeProducto({ detalleVenta: vd, factor: 1, recibidasFisicas: 149 });
  assert.equal(r.subtotalProducto, 32593.75);
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].cantidad, 149);
});

test("CASO 9 · KG y PIEZA: cantidad fraccionaria sin residuo binario", () => {
  const vd = { ...VD_198, cantidad: 3.62, cantidadStock: 3.62, precio: 10120, precioCosto: 10120, subtotal: 36634.4 };
  const r = lineasCorregidasDeProducto({ detalleVenta: vd, factor: 1, recibidasFisicas: 4.1 });
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].cantidad, 4.1);
  assert.equal(r.subtotalProducto, 41492, "4,1 × 10.120 tiene que dar exacto");
});

test("CASO 10 · un factor que NO divide exacto: el centavo no se pierde", () => {
  // Precio 1.000 el pack de 3 → 333,3333... por unidad. El punto del candado es
  // que las DOS líneas sumen el total al centavo, no que cada precio unitario sea
  // exacto: eso último es imposible y fingirlo es como se pierde plata.
  const vd = { ...VD_198, cantidad: 1, cantidadStock: 3, precio: 1000, precioCosto: 1000, subtotal: 1000 };
  const r = lineasCorregidasDeProducto({ detalleVenta: vd, factor: 3, recibidasFisicas: 5 });

  assert.equal(r.subtotalProducto, 1666.67, "5 × 333,3333 redondeado UNA vez");
  const [bultos, sueltas] = r.lineas;
  assert.equal(bultos.subtotal, 1000);
  assert.equal(sueltas.subtotal, 666.67, "las sueltas absorben el residuo del redondeo");
  assert.equal(bultos.subtotal + sueltas.subtotal, r.subtotalProducto);

  // Y el precio unitario mostrado se redondea, así que precio × cantidad NO da el
  // subtotal. El subtotal manda, igual que en una línea por importe.
  assert.equal(sueltas.precio, 333.33);
  assert.notEqual(sueltas.precio * sueltas.cantidad, sueltas.subtotal);
});

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE ESTÁ PROHIBIDO REPRESENTAR
// ═══════════════════════════════════════════════════════════════════════════

test("NUNCA un pack fraccionario: 5 sueltas no son 0,208 packs", () => {
  for (const fisicas of [149, 156, 145, 150]) {
    for (const l of corregir(fisicas).lineas) {
      assert.equal(
        Math.round(Number(l.cantidad) * 1000),
        Number(l.cantidad) * 1000,
        `cantidad ${l.cantidad} no entra exacta en Decimal(12,3)`
      );
      assert.ok(
        Number.isInteger(Number(l.cantidad)),
        `cantidad ${l.cantidad} es fraccionaria: 5/24 redondeado pierde mercadería`
      );
    }
  }
});

test("la suma de las líneas SIEMPRE es el total del producto, al centavo", () => {
  for (const fisicas of [0, 1, 5, 23, 96, 144, 149, 156, 167, 1000]) {
    const r = corregir(fisicas);
    const suma = r.lineas.reduce((a, l) => a + l.subtotal, 0);
    assert.equal(Math.round(suma * 100), Math.round(r.subtotalProducto * 100), `físicas=${fisicas}`);
  }
});

test("el dinero sale del PRECIO comercial, no del costo", () => {
  // Auditado: hoy coinciden en las 6.681 líneas internas. Que hoy coincidan no
  // es motivo para leer el que no corresponde — lo que se cobra es `precio`.
  const vd = { ...VD_198, precio: 6000, precioCosto: 5250, subtotal: 36000 };
  const r = lineasCorregidasDeProducto({ detalleVenta: vd, factor: 24, recibidasFisicas: 149 });
  assert.equal(r.lineas[1].precio, 250, "6.000 / 24, no 5.250 / 24");
  assert.equal(r.subtotalProducto, 37250);
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGOS
// ═══════════════════════════════════════════════════════════════════════════

test("PAGOS A · un solo pago: cambia el monto y nada más", () => {
  const r = sincronizarPagos([{ id: 9, medio: "EFECTIVO", monto: 31500, modalidadId: null }], 34125);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 9);
  assert.equal(r[0].medio, "EFECTIVO", "no se inventa un medio nuevo");
  assert.equal(r[0].montoAnterior, 31500);
  assert.equal(r[0].monto, 34125);
});

test("PAGOS B · varios pagos: se conserva la proporción original", () => {
  const r = sincronizarPagos(
    [{ id: 1, medio: "EFECTIVO", monto: 60 }, { id: 2, medio: "DEBITO", monto: 40 }],
    120
  );
  assert.deepEqual(r.map((p) => p.monto), [72, 48]);
});

test("PAGOS B · el residuo de redondeo lo absorbe SOLO el último", () => {
  const r = sincronizarPagos(
    [{ id: 1, medio: "EFECTIVO", monto: 1 }, { id: 2, medio: "DEBITO", monto: 1 }, { id: 3, medio: "CREDITO", monto: 1 }],
    100
  );
  assert.equal(r.reduce((a, p) => a + p.monto, 0), 100, "los pagos tienen que sumar el total exacto");
  assert.deepEqual(r.map((p) => p.monto), [33.33, 33.33, 33.34]);
});

test("PAGOS · la suma es SIEMPRE el total, en todos los repartos", () => {
  const repartos = [[60, 40], [1, 1, 1], [100], [33, 33, 34], [0.01, 99.99], [7, 11, 13]];
  for (const montos of repartos) {
    for (const total of [0, 0.01, 21000, 32593.75, 34125, 1666.67]) {
      const pagos = montos.map((m, i) => ({ id: i + 1, medio: "EFECTIVO", monto: m }));
      const r = sincronizarPagos(pagos, total);
      assert.equal(
        Math.round(r.reduce((a, p) => a + p.monto, 0) * 100),
        Math.round(total * 100),
        `reparto ${montos} contra ${total}`
      );
    }
  }
});

test("PAGOS · un total de 0 deja los pagos en 0, sin borrarlos", () => {
  const r = sincronizarPagos([{ id: 1, medio: "EFECTIVO", monto: 31500 }], 0);
  assert.equal(r.length, 1);
  assert.equal(r[0].monto, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL PLAN COMPLETO
// ═══════════════════════════════════════════════════════════════════════════

const VENTA_16836 = Object.freeze({
  id: 16836,
  numero: 1203,
  total: 31500,
  version: 0,
  turnoId: 370,
  turnoCerrado: false,
  detalles: [VD_198],
  pagos: [{ id: 9, medio: "EFECTIVO", monto: 31500, modalidadId: null }],
});

const plan = (recibidasFisicas, extra = {}) =>
  planCorreccionEconomica({
    venta: { ...VENTA_16836, ...extra },
    transferenciaId: 198,
    recibido: [{ productoBaseId: VD_198.productoBaseId, recibidasFisicas, factor: 24 }],
  });

test("PLAN · el tipo es el nuevo, no COMPLETA", () => {
  assert.equal(TIPO_CORRECCION_RECEPCION, "RECEPCION_TRANSFERENCIA");
  assert.equal(plan(156).tipo, "RECEPCION_TRANSFERENCIA");
});

test("PLAN · la clave de idempotencia sale de la transferencia", () => {
  assert.equal(claveIdempotencia(198), "recepcion-transferencia:198");
  assert.equal(plan(156).idempotencyKey, "recepcion-transferencia:198");
});

test("PLAN · #198 con 12 sueltas: 31.500 → 34.125, diferencia +2.625", () => {
  const p = plan(156);
  assert.equal(p.totalAnterior, 31500);
  assert.equal(p.totalNuevo, 34125);
  assert.equal(p.diferencia, 2625);
  assert.equal(p.pagos[0].monto, 34125, "el pago comercial cierra contra el nuevo total");
});

test("PLAN · faltante 4 packs: 31.500 → 21.000, diferencia -10.500", () => {
  const p = plan(96);
  assert.equal(p.totalNuevo, 21000);
  assert.equal(p.diferencia, -10500);
  assert.equal(p.pagos[0].monto, 21000);
});

test("PLAN · cero recibido: total 0 y diferencia menos el original", () => {
  const p = plan(0);
  assert.equal(p.totalNuevo, 0);
  assert.equal(p.diferencia, -31500);
});

test("PLAN · NI CAJA NI CUENTA CORRIENTE NI STOCK, y explícito", () => {
  const p = plan(156);
  // El stock ya lo movió la recepción. Que esta corrección lo repitiera sería
  // acreditar dos veces las mismas 12 unidades.
  assert.deepEqual(p.impactoStock, [], "la corrección no mueve inventario");
  assert.equal(p.impactoCaja.monto, 0);
  assert.equal(p.impactoCaja.signo, 0);
  assert.deepEqual(p.impactoCaja.cajaMovimientoIds, []);
  assert.deepEqual(p.impactoCaja.movimientoIds, []);
  assert.equal(p.movimientosCuenta.length, 0, "no se inventa deuda entre locales");
});

test("PLAN · el turno original se registra pero NO se exige abierto", () => {
  const cerrado = plan(156, { turnoCerrado: true });
  assert.equal(cerrado.aplica, true, "147 de 196 ventas internas tienen el turno cerrado");
  assert.equal(cerrado.turnoIdOriginal, 370);
  assert.equal(cerrado.turnoCerrado, true);
  assert.equal(cerrado.turnoIdCorreccion, null, "la diferencia no cae en ningún turno");
});

test("PLAN · versionado optimista: antes y después", () => {
  const p = plan(156, { version: 7 });
  assert.equal(p.versionAntes, 7);
  assert.equal(p.versionDespues, 8);
});

test("PLAN · sin diferencia NO se inventa una corrección monetaria", () => {
  // Decisión explícita del CASO 1: si nada cambió, no se escribe una
  // VentaCorreccion. La confirmación de la recepción ya queda registrada en la
  // transferencia, con autor y fecha, y en AuditoriaStock. Una corrección de
  // diferencia cero sería ruido que después hay que explicar en cada auditoría.
  const p = plan(144);
  assert.equal(p.sinCambio, true);
  assert.equal(p.aplica, false, "no se toca la venta si el importe no se movió");
  assert.equal(p.diferencia, 0);
});

test("PLAN · el motivo nombra la transferencia y es estable", () => {
  assert.equal(plan(156).motivo, "Corrección automática por recepción de Transferencia #198");
});

test("PLAN · los snapshots conservan el original y describen el resultado", () => {
  const p = plan(156);
  assert.equal(p.snapshotAntes.transferenciaId, 198);
  assert.equal(p.snapshotAntes.total, 31500);
  assert.equal(p.snapshotAntes.detalles.length, 1);
  assert.equal(p.snapshotAntes.pagos[0].monto, 31500);

  assert.equal(p.snapshotDespues.transferenciaId, 198);
  assert.equal(p.snapshotDespues.total, 34125);
  assert.equal(p.snapshotDespues.detalles.length, 2, "bultos y sueltas");
  assert.equal(p.snapshotDespues.pagos[0].monto, 34125);
  assert.equal(
    p.snapshotDespues.stockAplicadoPor,
    "confirmar-recepcion",
    "tiene que quedar dicho quién movió el inventario, para que nadie lo mueva otra vez"
  );
});

test("PLAN · diffProductos y diffPagos dicen qué cambió", () => {
  const p = plan(156);
  assert.equal(p.diffProductos.length, 1);
  assert.equal(p.diffProductos[0].cantidadAntes, 144, "en unidades FÍSICAS, que es lo comparable");
  assert.equal(p.diffProductos[0].cantidadDespues, 156);
  assert.equal(p.diffPagos[0].montoAntes, 31500);
  assert.equal(p.diffPagos[0].montoDespues, 34125);
});

test("PLAN · una venta sin líneas que casen NO se corrige a ciegas", () => {
  const p = planCorreccionEconomica({
    venta: VENTA_16836,
    transferenciaId: 198,
    recibido: [{ productoBaseId: 999999, recibidasFisicas: 10, factor: 1 }],
  });
  assert.equal(p.aplica, false);
  assert.ok(p.motivoNoAplica, "tiene que decir POR QUÉ no aplica, no devolver un cero mudo");
});

// ═══════════════════════════════════════════════════════════════════════════
// EL PRODUCTO QUE APARECIÓ AL ABRIR LOS BULTOS
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LA EXCEPCIÓN QUE ESTE BLOQUE CIERRA ────────────────────────────────────
//
// La primera versión de este módulo dejaba las líneas AGREGADAS en recepción
// fuera de la corrección: entraban al stock y no al importe. El argumento era
// que un producto que el remito no menciona tampoco está en la venta, así que
// no tiene precio comercial del cual partir.
//
// Era cierto a medias, y la mitad que faltaba es la que importa: la ruta que
// agrega la línea YA congela un precio —`producto.precio_costo` al momento de
// agregarla— justamente para que la escala y el dinero no dependan del catálogo
// del día de confirmar. Ése es el precio, y no hay que buscar ninguno.
//
// La regla principal no admite la excepción: si el stock corregido cambia, el
// importe corregido tiene que representar esa misma mercadería.
//
// ── DOS FUENTES, PORQUE SON DOS COSAS DISTINTAS ────────────────────────────
//
//   línea del remito  → `precio` de su VentaDetalle. Lo que se cobró.
//   línea agregada    → `precioCosto` de su TransferenciaDetalle, congelado al
//                       agregarla. Es lo único congelado que existe para ella.
//
// La observación de que hoy `precio` y `precioCosto` coinciden en el 100 % de
// las 6.681 líneas internas NO se convierte en regla: las originales siguen
// leyendo `precio`.
//
// Auditado el 2026-09-11: hay 7 líneas agregadas en producción y las 7 tienen
// `precioCosto` congelado. Ninguna sin precio.

const agregada = (recibidasFisicas, { factor = 24, precioPresentacion = 5250 } = {}) =>
  lineasCorregidasDeProducto({
    lineaAgregada: { productoBaseId: 7001, nombre: "Producto B", precioPresentacion },
    factor,
    recibidasFisicas,
  });

test("AGREGADA 1 · UNIDAD: 3 unidades a 2.000 valen 6.000", () => {
  const r = agregada(3, { factor: 1, precioPresentacion: 2000 });
  assert.equal(r.subtotalProducto, 6000);
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].cantidad, 3);
  assert.equal(r.lineas[0].cantidadStock, 3);
  assert.equal(r.lineas[0].precio, 2000);
  assert.equal(r.lineas[0].productoBaseId, 7001);
});

test("AGREGADA 2 · PACK: el precio congelado es el del PACK, no el de la unidad", () => {
  const r = agregada(144);
  assert.equal(r.subtotalProducto, 31500, "6 packs de 24 a 5.250 el pack");
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].cantidad, 6);
  assert.equal(r.lineas[0].cantidadStock, 144);
  assert.equal(r.lineas[0].precio, 5250);
});

test("AGREGADA 3 · PACK + sueltas: 6 PACK x24 + 5 dan 32.593,75", () => {
  const r = agregada(149);
  assert.equal(r.subtotalProducto, 32593.75);
  assert.equal(r.lineas.length, 2, "bultos y sueltas por separado, como en una línea del remito");

  const [bultos, sueltas] = r.lineas;
  assert.equal(bultos.cantidad, 6);
  assert.equal(bultos.cantidadStock, 144);
  assert.equal(bultos.subtotal, 31500);
  assert.equal(sueltas.cantidad, 5, "nunca 0,208 packs");
  assert.equal(sueltas.cantidadStock, 5);
  assert.equal(sueltas.precio, 218.75, "5.250 / 24");
  assert.equal(sueltas.subtotal, 1093.75);
  assert.equal(bultos.subtotal + sueltas.subtotal, r.subtotalProducto);
});

test("AGREGADA 4 · CAJÓN x12, el caso real de la #186", () => {
  // Línea 6389 de producción: CAJON, factor 12, precioCosto congelado 33.800.
  const r = agregada(24, { factor: 12, precioPresentacion: 33800 });
  assert.equal(r.subtotalProducto, 67600, "2 cajones de 12 a 33.800 el cajón");
  assert.equal(r.lineas[0].cantidad, 2);
  assert.equal(r.lineas[0].cantidadStock, 24);
});

test("AGREGADA 5 · SIN precio congelado FRENA, no vale cero ni busca el catálogo", () => {
  for (const sinPrecio of [null, undefined, ""]) {
    assert.throws(
      () =>
        lineasCorregidasDeProducto({
          lineaAgregada: { productoBaseId: 7001, nombre: "Producto B", precioPresentacion: sinPrecio },
          factor: 1,
          recibidasFisicas: 3,
        }),
      (e) => e.code === LINEA_AGREGADA_SIN_PRECIO,
      `precioPresentacion=${String(sinPrecio)} tiene que frenar`
    );
  }
});

test("AGREGADA 6 · un precio 0 congelado también frena: cero no es un precio", () => {
  // Valorizar en cero dejaría el stock corregido y el importe no, que es
  // exactamente la excepción que se está cerrando — solo que en silencio.
  assert.throws(
    () =>
      lineasCorregidasDeProducto({
        lineaAgregada: { productoBaseId: 7001, nombre: "B", precioPresentacion: 0 },
        factor: 1,
        recibidasFisicas: 3,
      }),
    (e) => e.code === LINEA_AGREGADA_SIN_PRECIO
  );
});

test("PLAN · el producto agregado entra al total, al diff y al pago", () => {
  const p = planCorreccionEconomica({
    venta: { ...VENTA_16836 },
    transferenciaId: 198,
    recibido: [
      // La línea del remito, recibida exacta.
      { productoBaseId: VD_198.productoBaseId, recibidasFisicas: 144, factor: 24 },
      // Y el producto B que apareció al abrir los bultos.
      {
        productoBaseId: 7001,
        recibidasFisicas: 3,
        factor: 1,
        agregada: true,
        precioPresentacion: 2000,
        nombre: "Producto B",
      },
    ],
  });

  assert.equal(p.aplica, true, "el remito no cambió pero llegó un producto de más");
  assert.equal(p.totalAnterior, 31500);
  assert.equal(p.totalNuevo, 37500, "31.500 + 6.000");
  assert.equal(p.diferencia, 6000);
  assert.equal(p.pagos[0].monto, 37500, "el pago tiene que incluir lo que llegó de más");

  // Está en las líneas corregidas, en el diff y en el snapshot.
  const b = p.lineas.find((l) => l.productoBaseId === 7001);
  assert.ok(b, "el producto agregado no llegó a VentaDetalle");
  assert.equal(b.cantidadStock, 3);
  assert.equal(b.subtotal, 6000);

  const dif = p.diffProductos.find((d) => d.productoBaseId === 7001);
  assert.ok(dif, "el producto agregado no figura en diffProductos");
  assert.equal(dif.cantidadAntes, 0, "no se envió: su cantidad anterior es 0, no null");
  assert.equal(dif.cantidadDespues, 3);
  assert.equal(dif.estado, "MAS");
  assert.equal(dif.agregadaEnRecepcion, true, "tiene que quedar dicho que no venía en el remito");

  assert.ok(p.snapshotDespues.detalles.some((d) => d.productoBaseId === 7001));
});

test("PLAN · SOLO una entrada marcada `agregada` puede no tener VentaDetalle", () => {
  // Un productoBaseId que no casa y que NO viene marcado es un error de armado,
  // no un producto nuevo. Corregir a ciegas ahí sería inventar una venta.
  const p = planCorreccionEconomica({
    venta: VENTA_16836,
    transferenciaId: 198,
    recibido: [{ productoBaseId: 999999, recibidasFisicas: 10, factor: 1 }],
  });
  assert.equal(p.aplica, false);
  assert.ok(p.motivoNoAplica);
});

test("PLAN · un agregado SOLO, sin cambios en el remito, igual corrige", () => {
  const p = planCorreccionEconomica({
    venta: VENTA_16836,
    transferenciaId: 198,
    recibido: [
      { productoBaseId: VD_198.productoBaseId, recibidasFisicas: 144, factor: 24 },
      { productoBaseId: 7001, recibidasFisicas: 1, factor: 1, agregada: true, precioPresentacion: 500, nombre: "B" },
    ],
  });
  assert.equal(p.aplica, true);
  assert.equal(p.diferencia, 500);
});

test("PLAN · una línea sin cantidadStock FRENA en vez de inventar una escala", () => {
  // Un combo o un servicio no tienen consumo físico congelado. La auditoría dio
  // cero de los dos en ventas internas, y justamente por eso no hay con qué
  // probar una conversión: si aparece uno, se frena.
  assert.throws(
    () =>
      planCorreccionEconomica({
        venta: { ...VENTA_16836, detalles: [{ ...VD_198, cantidadStock: null }] },
        transferenciaId: 198,
        recibido: [{ productoBaseId: VD_198.productoBaseId, recibidasFisicas: 156, factor: 24 }],
      }),
    /LINEA_SIN_CONSUMO_FISICO/
  );
});

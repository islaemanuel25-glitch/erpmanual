// Candados del MOTOR COMERCIAL de la venta (ofertas + recargo por medio de pago).
// node --test lib/ofertas/motorVenta.test.mjs
//
// Los casos numerados son los que se pidieron expresamente. Están escritos con
// los MISMOS números y los MISMOS importes del pedido para que se puedan
// comparar de a uno contra la especificación sin traducir nada.
import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularVentaComercial,
  resolverLinea,
  OFERTA_NO_APLICADA,
} from "./motorVenta.js";
import { normalizarYConsolidarPagos, aplicarComisiones, derivarCamposVenta } from "../pos-ventas/pagos.js";

// ── Andamio ──────────────────────────────────────────────────────────────────
// Los datos tienen la forma que tienen en el consumidor real: la línea trae
// `productoLocalId` y `precioNormal`, y las ofertas entran ya resueltas por
// vigencia, indexadas por productoLocalId. Escribirlo de memoria con otra forma
// es el error que ya se pagó dos veces en este repo.

const RECARGOS_CASIANO = { EFECTIVO: 0, DEBITO: 5, CREDITO: 10, MERCADOPAGO: 5 };

function linea(over = {}) {
  return {
    productoLocalId: 1,
    productoBaseId: 10,
    nombre: "Nueve de Oro",
    cantidad: 1,
    precioNormal: 1000,
    esServicio: false,
    subtotalFijado: null,
    ...over,
  };
}

function ofertaEfectivo(precio = 900) {
  return {
    1: {
      ofertaId: 7,
      ofertaNombre: "Semana Nueve de Oro",
      precioOferta: precio,
      condicionPago: "SOLO_EFECTIVO",
    },
  };
}

function ofertaCualquierMedio(precio = 900) {
  return {
    1: {
      ofertaId: 8,
      ofertaNombre: "Semana Galletitas",
      precioOferta: precio,
      condicionPago: "CUALQUIER_MEDIO",
    },
  };
}

// ── CASO 1 ───────────────────────────────────────────────────────────────────
test("caso 1: precio normal $1.000, sin oferta, efectivo → $1.000", () => {
  const r = calcularVentaComercial({
    lineas: [linea()],
    ofertasPorProductoLocal: {},
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.total, 1000);
  assert.equal(r.descuentoPromocional, 0);
  assert.equal(r.recargoPagoImporte, 0);
  assert.equal(r.lineas[0].ofertaAplicada, false);
});

// ── CASO 2 ───────────────────────────────────────────────────────────────────
test("caso 2: oferta efectivo $900, 100 % efectivo → $900", () => {
  const r = calcularVentaComercial({
    lineas: [linea()],
    ofertasPorProductoLocal: ofertaEfectivo(),
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.total, 900);
  assert.equal(r.descuentoPromocional, 100);
  assert.equal(r.lineas[0].ofertaAplicada, true);
  assert.equal(r.lineas[0].ofertaId, 7);
  assert.equal(r.lineas[0].ofertaNombre, "Semana Nueve de Oro");
});

test("caso 2 bis: nueve unidades a $900 → $8.100 (el ejemplo del pedido)", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ cantidad: 9 })],
    ofertasPorProductoLocal: ofertaEfectivo(),
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.total, 8100);
  assert.equal(r.descuentoPromocional, 900);
});

// ── CASO 3 ───────────────────────────────────────────────────────────────────
test("caso 3: oferta efectivo $900 pagada con débito → no aplica, $1.000 + 5 % = $1.050", () => {
  const r = calcularVentaComercial({
    lineas: [linea()],
    ofertasPorProductoLocal: ofertaEfectivo(),
    mediosUsados: ["DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.subtotal, 1000, "vuelve al precio normal");
  assert.equal(r.descuentoPromocional, 0);
  assert.equal(r.totalAntesRecargo, 1000);
  assert.equal(r.recargoPagoPct, 5);
  assert.equal(r.recargoPagoMedio, "DEBITO");
  assert.equal(r.recargoPagoImporte, 50);
  assert.equal(r.total, 1050);
  assert.equal(r.lineas[0].ofertaNoAplicada, OFERTA_NO_APLICADA.REQUIERE_EFECTIVO);
});

test("caso 3 bis: nueve unidades con débito → 9 × $1.000 + 5 % = $9.450", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ cantidad: 9 })],
    ofertasPorProductoLocal: ofertaEfectivo(),
    mediosUsados: ["DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.totalAntesRecargo, 9000);
  assert.equal(r.total, 9450);
});

// ── CASO 4 ───────────────────────────────────────────────────────────────────
test("caso 4: oferta cualquier medio $900 con débito +5 % → base $900, total $945", () => {
  const r = calcularVentaComercial({
    lineas: [linea()],
    ofertasPorProductoLocal: ofertaCualquierMedio(),
    mediosUsados: ["DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.subtotal, 900, "la oferta SÍ aplica");
  assert.equal(r.totalAntesRecargo, 900);
  assert.equal(r.recargoPagoImporte, 45);
  assert.equal(r.total, 945);
  assert.equal(r.lineas[0].ofertaAplicada, true);
});

// ── CASO 5 ───────────────────────────────────────────────────────────────────
test("caso 5: pago mixto efectivo + débito → manda el mayor recargo (5 %) sobre toda la venta", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ precioNormal: 10000 })],
    ofertasPorProductoLocal: {},
    mediosUsados: ["EFECTIVO", "DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.totalAntesRecargo, 10000);
  assert.equal(r.recargoPagoPct, 5);
  assert.equal(r.recargoPagoMedio, "DEBITO");
  assert.equal(r.recargoPagoImporte, 500, "el 5 % se aplica sobre los $10.000, no sobre la mitad");
  assert.equal(r.total, 10500);
});

test("caso 5 bis: efectivo + crédito 10 % + débito 5 % → gana el crédito", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ precioNormal: 10000 })],
    ofertasPorProductoLocal: {},
    mediosUsados: ["EFECTIVO", "DEBITO", "CREDITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.recargoPagoPct, 10);
  assert.equal(r.recargoPagoMedio, "CREDITO");
  assert.equal(r.total, 11000);
});

// ── CASO 6 ───────────────────────────────────────────────────────────────────
test("caso 6: pago mixto con oferta SOLO EFECTIVO → la oferta no aplica", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ precioNormal: 10000 })],
    ofertasPorProductoLocal: {
      1: { ofertaId: 7, ofertaNombre: "Solo efectivo", precioOferta: 9000, condicionPago: "SOLO_EFECTIVO" },
    },
    mediosUsados: ["EFECTIVO", "DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.subtotal, 10000);
  assert.equal(r.descuentoPromocional, 0);
  assert.equal(r.total, 10500, "sin descuento y con el recargo mayor");
  assert.equal(r.hayOfertaSoloEfectivoNoAplicada, true);
});

// ── CASO 7 ───────────────────────────────────────────────────────────────────
test("caso 7: dos ventas independientes no se contaminan entre sí", () => {
  const ofertas = ofertaEfectivo();
  const ventaEfectivo = calcularVentaComercial({
    lineas: [linea({ cantidad: 9 })],
    ofertasPorProductoLocal: ofertas,
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  const ventaDebito = calcularVentaComercial({
    lineas: [linea({ cantidad: 2 })],
    ofertasPorProductoLocal: ofertas,
    mediosUsados: ["DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });

  assert.equal(ventaEfectivo.total, 8100, "9 en efectivo con oferta");
  assert.equal(ventaDebito.total, 2100, "2 en débito sin oferta, con recargo 5 %");
  // La segunda no movió nada de la primera: el objeto de ofertas se compartió.
  assert.equal(ventaEfectivo.lineas[0].ofertaAplicada, true);
  assert.equal(ventaDebito.lineas[0].ofertaAplicada, false);
});

// ── CASO 13 ──────────────────────────────────────────────────────────────────
test("caso 13: la comisión bancaria se calcula aparte y NO es el recargo", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ precioNormal: 10000 })],
    ofertasPorProductoLocal: {},
    mediosUsados: ["DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.total, 10500, "el cliente paga el total con recargo");

  // La comisión bancaria se aplica DESPUÉS, sobre el tender, con su propio %.
  const consolidado = normalizarYConsolidarPagos([{ medio: "DEBITO", monto: r.total }], r.total);
  assert.ok(!consolidado.error, consolidado.error);
  const conComision = aplicarComisiones(consolidado.pagos, { DEBITO: 7 });
  const derivado = derivarCamposVenta(conComision);

  assert.equal(derivado.comisionBancaria, 735, "7 % de 10.500 lo paga el comercio");
  assert.equal(derivado.netoRecibido, 9765);
  // Los tres números son distintos: recargo 500, comisión 735, total 10.500.
  assert.notEqual(r.recargoPagoImporte, derivado.comisionBancaria);
});

// ── CASO 14 ──────────────────────────────────────────────────────────────────
test("caso 14: con recargo, los tenders siguen sumando EXACTAMENTE el total final", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ precioNormal: 10000 })],
    ofertasPorProductoLocal: {},
    mediosUsados: ["EFECTIVO", "DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.total, 10500);

  const ok = normalizarYConsolidarPagos(
    [{ medio: "EFECTIVO", monto: 5250 }, { medio: "DEBITO", monto: 5250 }],
    r.total
  );
  assert.ok(!ok.error, ok.error);

  // Si el POS mandara los pagos por el total SIN recargo, se rechaza.
  const mal = normalizarYConsolidarPagos(
    [{ medio: "EFECTIVO", monto: 5000 }, { medio: "DEBITO", monto: 5000 }],
    r.total
  );
  assert.ok(mal.error, "una venta cuyos pagos suman el total sin recargo no puede pasar");
});

// ── CASO 15 ──────────────────────────────────────────────────────────────────
test("caso 15: un servicio de importe variable no recibe oferta ni entra a la base de descuentos", () => {
  const r = calcularVentaComercial({
    lineas: [
      linea({ productoLocalId: 1, precioNormal: 1000, cantidad: 1 }),
      linea({
        productoLocalId: 2,
        productoBaseId: 20,
        nombre: "Carga celular",
        esServicio: true,
        precioNormal: 5500,
        cantidad: 1,
      }),
    ],
    ofertasPorProductoLocal: {
      ...ofertaCualquierMedio(),
      2: { ofertaId: 9, ofertaNombre: "No debería", precioOferta: 4000, condicionPago: "CUALQUIER_MEDIO" },
    },
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
    descuentos: { automaticoPct: 10 },
    subtotalServicios: 5500,
  });

  const svc = r.lineas[1];
  assert.equal(svc.ofertaAplicada, false, "el servicio no recibe la oferta");
  assert.equal(svc.subtotal, 5500, "y conserva su importe");
  assert.equal(svc.ofertaNoAplicada, OFERTA_NO_APLICADA.SERVICIO);

  // El producto normal sí: $900. Base elegible = 6400 - 5500 = 900.
  assert.equal(r.subtotal, 6400);
  assert.equal(r.baseElegibleDescuento, 900);
  assert.equal(r.descuentoAutomatico, 90, "el 10 % se calcula solo sobre la mercadería");
});

// ── CASO 16 ──────────────────────────────────────────────────────────────────
test("caso 16: una oferta sobre un componente NO cambia el precio del combo", () => {
  // El combo es su propio ProductoLocal (id 50). El componente en oferta es el
  // id 1, que NO está en el carrito como línea propia.
  const r = calcularVentaComercial({
    lineas: [
      linea({ productoLocalId: 50, productoBaseId: 500, nombre: "Combo desayuno", precioNormal: 3000 }),
    ],
    ofertasPorProductoLocal: ofertaCualquierMedio(), // oferta del productoLocal 1
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.subtotal, 3000, "el combo conserva su precio comercial");
  assert.equal(r.descuentoPromocional, 0);
  assert.equal(r.lineas[0].ofertaAplicada, false);
});

test("caso 16 bis: un combo SÍ puede estar ofertado explícitamente", () => {
  const r = calcularVentaComercial({
    lineas: [
      linea({ productoLocalId: 50, productoBaseId: 500, nombre: "Combo desayuno", precioNormal: 3000 }),
    ],
    ofertasPorProductoLocal: {
      50: { ofertaId: 11, ofertaNombre: "Combo en oferta", precioOferta: 2500, condicionPago: "CUALQUIER_MEDIO" },
    },
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.subtotal, 2500);
  assert.equal(r.lineas[0].ofertaAplicada, true);
});

// ── Descuentos existentes y ofertas ──────────────────────────────────────────
test("los descuentos existentes se apilan sobre el precio con oferta", () => {
  const r = calcularVentaComercial({
    lineas: [linea()],
    ofertasPorProductoLocal: ofertaCualquierMedio(),
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
    descuentos: { automaticoPct: 10 },
  });
  assert.equal(r.subtotal, 900);
  assert.equal(r.descuentoAutomatico, 90);
  assert.equal(r.total, 810, "10 % sobre 900, no sobre 1000");
});

test("el recargo se calcula sobre el total YA descontado, no sobre el subtotal", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ precioNormal: 1000 })],
    ofertasPorProductoLocal: {},
    mediosUsados: ["DEBITO"],
    recargosPorMedio: RECARGOS_CASIANO,
    descuentos: { manual: 100 },
  });
  assert.equal(r.totalAntesRecargo, 900);
  assert.equal(r.recargoPagoImporte, 45, "5 % de 900");
  assert.equal(r.total, 945);
});

test("descuento mayor que la mercadería elegible se señala y no se aplica a escondidas", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ esServicio: true, precioNormal: 5000 })],
    ofertasPorProductoLocal: {},
    mediosUsados: ["EFECTIVO"],
    recargosPorMedio: RECARGOS_CASIANO,
    descuentos: { manual: 100 },
    subtotalServicios: 5000,
  });
  assert.equal(r.baseElegibleDescuento, 0);
  assert.equal(r.excedeDescuento, true);
});

// ── Casos de borde de la resolución por línea ────────────────────────────────
test("una línea cargada por importe no recibe oferta, y se dice por qué", () => {
  const res = resolverLinea(
    linea({ subtotalFijado: 2000, cantidad: 2 }),
    { ofertaId: 1, precioOferta: 900, condicionPago: "CUALQUIER_MEDIO" },
    ["EFECTIVO"]
  );
  assert.equal(res.precio, 1000);
  assert.equal(res.motivo, OFERTA_NO_APLICADA.LINEA_POR_IMPORTE);
});

test("una oferta que no baja el precio no se aplica", () => {
  const res = resolverLinea(
    linea(),
    { ofertaId: 1, precioOferta: 1000, condicionPago: "CUALQUIER_MEDIO" },
    ["EFECTIVO"]
  );
  assert.equal(res.precio, 1000);
  assert.equal(res.oferta, null);
});

test("sin medios de pago declarados, ninguna oferta se aplica", () => {
  const r = calcularVentaComercial({
    lineas: [linea()],
    ofertasPorProductoLocal: ofertaCualquierMedio(),
    mediosUsados: [],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.total, 1000);
});

test("FIADO no aporta recargo aunque esté en la venta", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ precioNormal: 10000 })],
    ofertasPorProductoLocal: {},
    mediosUsados: ["FIADO"],
    recargosPorMedio: RECARGOS_CASIANO,
  });
  assert.equal(r.recargoPagoPct, 0);
  assert.equal(r.recargoPagoMedio, null);
  assert.equal(r.total, 10000);
});

test("un local sin recargos configurados no le cobra nada de más al cliente", () => {
  const r = calcularVentaComercial({
    lineas: [linea({ precioNormal: 10000 })],
    ofertasPorProductoLocal: {},
    mediosUsados: ["CREDITO"],
    recargosPorMedio: {},
  });
  assert.equal(r.recargoPagoImporte, 0);
  assert.equal(r.total, 10000);
});

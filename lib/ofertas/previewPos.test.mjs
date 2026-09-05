// CANDADO: EL TOTAL QUE VE EL CAJERO ANTES DE ELEGIR EL MEDIO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ofertas/previewPos.test.mjs
//
// ── QUÉ AFIRMA ──────────────────────────────────────────────────────────────
//
// Que los cuatro importes del panel de cobro son los que corresponden, y que
// salen del MISMO motor que cobra el servidor. Lo segundo se afirma de la única
// forma que prueba algo: calculando el mismo caso con `calcularVentaComercial`
// directo y exigiendo que dé idéntico. Si algún día alguien mete una cuenta
// propia en el preview, esta comparación se rompe.
//
// El caso central es el del pedido, con números redondos a propósito para que un
// error de un peso se vea a simple vista:
//
//   9 × "Nueve de Oro" a $1.000, con oferta SOLO EFECTIVO a $900.
//   Recargos del local: débito 5 %, crédito 10 %, Mercado Pago 5 %.
//
//   Efectivo      $8.100   (9 × 900, sin recargo)
//   Débito        $9.450   (9 × 1.000 = 9.000, +5 %; la oferta se pierde)
//   Crédito       $9.900   (9.000 +10 %)
//   Mercado Pago  $9.450   (9.000 +5 %)

import test from "node:test";
import assert from "node:assert/strict";

import {
  totalesPorMedio,
  totalParaMedios,
  ofertasDelCarrito,
  hayOfertaSoloEfectivoEnCarrito,
  textoOfertaDeLinea,
  MEDIOS_PREVIEW,
} from "@/lib/ofertas/previewPos.js";
import { calcularVentaComercial } from "@/lib/ofertas/motorVenta.js";

const RECARGOS = { EFECTIVO: 0, DEBITO: 5, CREDITO: 10, MERCADOPAGO: 5 };

const OFERTA_EFECTIVO = {
  ofertaId: 7,
  ofertaNombre: "Semana del vino",
  precioOferta: 900,
  condicionPago: "SOLO_EFECTIVO",
};

/** El carrito del ejemplo. */
function carritoDelEjemplo(oferta = OFERTA_EFECTIVO) {
  return [
    {
      productoLocalId: 42,
      productoBaseId: 11,
      nombre: "Nueve de Oro",
      cantidad: 9,
      precio: 1000,
      oferta,
    },
  ];
}

// ══════════════════════════════════════════════════════════════════════════
// LOS CUATRO NÚMEROS
// ══════════════════════════════════════════════════════════════════════════

test("los cuatro botones muestran el total que corresponde a su medio", () => {
  const p = totalesPorMedio({ carrito: carritoDelEjemplo(), recargosPorMedio: RECARGOS });

  assert.equal(p.EFECTIVO.total, 8100, "efectivo: 9 × 900");
  assert.equal(p.DEBITO.total, 9450, "débito: 9.000 + 5 %");
  assert.equal(p.CREDITO.total, 9900, "crédito: 9.000 + 10 %");
  assert.equal(p.MERCADOPAGO.total, 9450, "Mercado Pago: 9.000 + 5 %");
});

test("el preview desglosa por qué cada total es el que es", () => {
  const p = totalesPorMedio({ carrito: carritoDelEjemplo(), recargosPorMedio: RECARGOS });

  // Efectivo: la oferta entra, no hay recargo.
  assert.equal(p.EFECTIVO.descuentoPromocional, 900);
  assert.equal(p.EFECTIVO.recargoPagoImporte, 0);

  // Débito: la oferta NO entra y sí el recargo. Los dos hechos por separado,
  // porque un total correcto por dos errores que se cancelan es un total que se
  // rompe el día que uno de los dos se arregla.
  assert.equal(p.DEBITO.descuentoPromocional, 0);
  assert.equal(p.DEBITO.recargoPagoImporte, 450);
  assert.equal(p.DEBITO.totalAntesRecargo, 9000);
  assert.equal(p.DEBITO.recargoPagoPct, 5);
});

test("el preview NO calcula por su cuenta: da lo mismo que el motor del servidor", () => {
  const carrito = carritoDelEjemplo();

  for (const medio of MEDIOS_PREVIEW) {
    const delPreview = totalesPorMedio({ carrito, recargosPorMedio: RECARGOS })[medio];

    // La misma cuenta, llamando al motor como lo llama `pos-ventas/crear`.
    const delMotor = calcularVentaComercial({
      lineas: [
        {
          productoLocalId: 42,
          productoBaseId: 11,
          nombre: "Nueve de Oro",
          cantidad: 9,
          precioNormal: 1000,
          esServicio: false,
          subtotalFijado: null,
        },
      ],
      ofertasPorProductoLocal: { 42: OFERTA_EFECTIVO },
      mediosUsados: [medio],
      recargosPorMedio: RECARGOS,
      descuentos: {},
      subtotalServicios: 0,
    });

    assert.equal(delPreview.total, delMotor.total, `total de ${medio}`);
    assert.equal(delPreview.recargoPagoImporte, delMotor.recargoPagoImporte, `recargo de ${medio}`);
    assert.equal(
      delPreview.descuentoPromocional,
      delMotor.descuentoPromocional,
      `descuento promocional de ${medio}`
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════
// PAGO COMBINADO
// ══════════════════════════════════════════════════════════════════════════

test("con dos medios manda el recargo MÁS ALTO y se aplica a toda la venta", () => {
  const p = totalesPorMedio({ carrito: carritoDelEjemplo(), recargosPorMedio: RECARGOS });

  // Efectivo (0 %) + crédito (10 %) → gana el 10 %, sobre los $9.000 enteros.
  const r = p.__paraMedios(["efectivo", "credito"]);
  assert.equal(r.recargoPagoPct, 10);
  assert.equal(r.recargoPagoMedio, "CREDITO");
  assert.equal(r.recargoPagoImporte, 900);
  assert.equal(r.total, 9900);
});

test("una oferta de solo efectivo se pierde en cuanto aparece otro medio", () => {
  const p = totalesPorMedio({ carrito: carritoDelEjemplo(), recargosPorMedio: RECARGOS });

  // El caso exacto del pedido: $1.000 de base, débito +5 %, total $1.050.
  const uno = totalParaMedios({
    carrito: [{ productoLocalId: 42, nombre: "x", cantidad: 1, precio: 1000, oferta: OFERTA_EFECTIVO }],
    recargosPorMedio: RECARGOS,
    medios: ["efectivo", "debito"],
  });
  assert.equal(uno.subtotal, 1000, "la oferta no aplica: la base es el precio normal");
  assert.equal(uno.recargoPagoImporte, 50);
  assert.equal(uno.total, 1050);

  // Y el motor lo informa, para que la pantalla pueda decirlo en vez de callarlo.
  assert.equal(p.__paraMedios(["efectivo", "debito"]).hayOfertaSoloEfectivoNoAplicada, true);
});

test("una oferta de CUALQUIER MEDIO sobrevive al pago combinado", () => {
  const carrito = carritoDelEjemplo({ ...OFERTA_EFECTIVO, condicionPago: "CUALQUIER_MEDIO" });
  const r = totalParaMedios({ carrito, recargosPorMedio: RECARGOS, medios: ["efectivo", "debito"] });

  assert.equal(r.subtotal, 8100, "la oferta sigue aplicando");
  assert.equal(r.recargoPagoImporte, 405, "y el recargo del 5 % se calcula sobre el precio con oferta");
  assert.equal(r.total, 8505);
});

// ══════════════════════════════════════════════════════════════════════════
// EL CASO DE TODOS LOS DÍAS: SIN OFERTAS Y SIN RECARGOS
// ══════════════════════════════════════════════════════════════════════════

test("sin ofertas y sin recargos los cuatro medios dan lo mismo", () => {
  // Es la condición que hace que el panel de cobro quede EXACTAMENTE como estaba
  // en la enorme mayoría de las ventas. Si esto se rompe, la pantalla empieza a
  // mostrar cuatro importes iguales donde antes había un solo total grande.
  const carrito = [{ productoLocalId: 1, nombre: "Pan", cantidad: 2, precio: 500, oferta: null }];
  const p = totalesPorMedio({ carrito, recargosPorMedio: { EFECTIVO: 0, DEBITO: 0, CREDITO: 0, MERCADOPAGO: 0 } });

  const totales = MEDIOS_PREVIEW.map((m) => p[m].total);
  assert.deepEqual(totales, [1000, 1000, 1000, 1000]);
});

test("un local sin recargos configurados no inventa ninguno", () => {
  const p = totalesPorMedio({ carrito: carritoDelEjemplo(), recargosPorMedio: {} });
  assert.equal(p.DEBITO.recargoPagoImporte, 0);
  assert.equal(p.DEBITO.total, 9000, "sin recargo, el débito paga el precio normal y nada más");
});

// ══════════════════════════════════════════════════════════════════════════
// DESCUENTOS QUE YA EXISTÍAN
// ══════════════════════════════════════════════════════════════════════════

test("el descuento del cliente se apila sobre la oferta, no la reemplaza", () => {
  const r = totalParaMedios({
    carrito: carritoDelEjemplo(),
    recargosPorMedio: RECARGOS,
    medios: ["efectivo"],
    descuentos: { manual: 810 }, // el 10 % de 8.100
  });
  assert.equal(r.subtotal, 8100);
  assert.equal(r.total, 7290, "8.100 − 810");
});

// ══════════════════════════════════════════════════════════════════════════
// EL MAPA DE OFERTAS
// ══════════════════════════════════════════════════════════════════════════

test("una línea sin productoLocalId no le presta su oferta a las demás", () => {
  // Sin la guarda, dos líneas sin id compartirían la clave `null` en el mapa y
  // el motor —que busca por ese id— le aplicaría la oferta de una a la otra.
  // Es un precio equivocado, no una excepción: nadie se enteraría.
  const carrito = [
    { productoLocalId: null, nombre: "Sin id", cantidad: 1, precio: 1000, oferta: OFERTA_EFECTIVO },
    { productoLocalId: null, nombre: "Otro sin id", cantidad: 1, precio: 2000, oferta: null },
  ];
  assert.deepEqual(ofertasDelCarrito(carrito), {});

  const r = totalParaMedios({ carrito, recargosPorMedio: {}, medios: ["efectivo"] });
  assert.equal(r.total, 3000, "ninguna de las dos recibe la oferta");
});

test("ofertasDelCarrito indexa por productoLocalId", () => {
  const mapa = ofertasDelCarrito(carritoDelEjemplo());
  assert.deepEqual(Object.keys(mapa), ["42"]);
  assert.equal(mapa[42].precioOferta, 900);
  assert.equal(mapa[42].condicionPago, "SOLO_EFECTIVO");
});

// ══════════════════════════════════════════════════════════════════════════
// EL TEXTO DE LA LÍNEA
// ══════════════════════════════════════════════════════════════════════════

test("la línea del carrito dice la condición, no solo el precio", () => {
  const soloEfectivo = textoOfertaDeLinea(carritoDelEjemplo()[0]);
  assert.equal(soloEfectivo.etiqueta, "Oferta efectivo");
  assert.equal(soloEfectivo.precio, 900);
  assert.equal(soloEfectivo.soloEfectivo, true);

  const cualquiera = textoOfertaDeLinea(
    carritoDelEjemplo({ ...OFERTA_EFECTIVO, condicionPago: "CUALQUIER_MEDIO" })[0]
  );
  assert.equal(cualquiera.etiqueta, "Oferta", "sin condición, la etiqueta no la inventa");
  assert.equal(cualquiera.soloEfectivo, false);
});

test("sin oferta no hay etiqueta que dibujar", () => {
  assert.equal(textoOfertaDeLinea({ nombre: "Pan", precio: 500 }), null);
  assert.equal(textoOfertaDeLinea({ oferta: { precioOferta: 0 } }), null);
  assert.equal(textoOfertaDeLinea(null), null);
});

test("hayOfertaSoloEfectivoEnCarrito mira el carrito, no el resultado del motor", () => {
  // Tiene que poder contestarse ANTES de elegir medios: en ese momento no hay
  // ningún cálculo del que derivarlo.
  assert.equal(hayOfertaSoloEfectivoEnCarrito(carritoDelEjemplo()), true);
  assert.equal(
    hayOfertaSoloEfectivoEnCarrito(carritoDelEjemplo({ ...OFERTA_EFECTIVO, condicionPago: "CUALQUIER_MEDIO" })),
    false
  );
  assert.equal(hayOfertaSoloEfectivoEnCarrito([]), false);
});

// ══════════════════════════════════════════════════════════════════════════
// SERVICIOS Y LÍNEAS POR IMPORTE
// ══════════════════════════════════════════════════════════════════════════

test("un servicio de importe variable no recibe oferta", () => {
  const carrito = [
    { productoLocalId: 42, nombre: "Recarga", cantidad: 1, precio: 1000, esServicio: true, oferta: OFERTA_EFECTIVO },
  ];
  const r = totalParaMedios({ carrito, recargosPorMedio: {}, medios: ["efectivo"] });
  assert.equal(r.total, 1000);
  assert.equal(r.lineas[0].ofertaNoAplicada, "SERVICIO", "y se dice por qué, en vez de callarlo");
});

test("una línea de peso cargada por importe conserva el importe que fijó el cajero", () => {
  const carrito = [
    { productoLocalId: 42, nombre: "Queso", cantidad: 0.235, precio: 8500, subtotalFijado: 2000, oferta: OFERTA_EFECTIVO },
  ];
  const r = totalParaMedios({ carrito, recargosPorMedio: {}, medios: ["efectivo"] });
  assert.equal(r.total, 2000, "el importe tecleado manda sobre el peso redondeado");
  assert.equal(r.lineas[0].ofertaNoAplicada, "LINEA_POR_IMPORTE");
});

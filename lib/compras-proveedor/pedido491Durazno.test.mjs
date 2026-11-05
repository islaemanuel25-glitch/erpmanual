// NUTRISUR #491, DURAZNO LATA ALCO: LA LÍNEA SEMBRADA CON EL PRODUCTO MAL CARGADO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/pedido491Durazno.test.mjs
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// De producción, el 2026-11-04, con una consulta de solo lectura (transacción
// READ ONLY con ROLLBACK) corrida por la sesión del servidor:
//
//   · Pedido 491, Nutrisur, ENVIADO, nacido de factura.
//   · Línea del pedido 3481: 12 BULTO a $1.500, nada recibido.
//   · Producto 922: pack de 12, unidad_medida pack, compra por BULTO, $38.400.
//   · Renglón 696 del comprobante 60: "DURAZNOS EN MITADES ALCO X 12 UN 820G",
//     12 a $2.640,637 neto, subtotal $31.687,63, costo final $39.271,16,
//     enQueViene "unidad". Sin correcciones a mano, sin decisiones de precio,
//     sin lectura confirmada, sin receta del proveedor.
//
// La línea se arma con las mismas funciones que la pantalla —`analizarPrecioDeLinea`
// y `filasDeConciliacion`— y el plan con las de la siembra. Nada escrito a
// mano encima.

import { test } from "node:test";
import assert from "node:assert/strict";

import { analizarPrecioDeLinea } from "./comprobante/precioDeLinea.js";
import { filasDeConciliacion } from "./comprobante/filasDeConciliacion.js";
import { renglonesDeLaTarjeta } from "./tarjetaDeRecepcion.js";
import { costoParaUnidad } from "./importacion/merge.js";
import { cantidadParaElPedido, lineaSembradaQueRehacer, loQueHayQueSembrar } from "./pedidoDesdeFactura.js";
import {
  AVISO_ESCALA,
  ESTADO_LINEA,
  estadoDeLinea,
  hayDiferenciaDePrecio,
  motivoSinComparacion,
  porcentajeDelPrecio,
} from "./estadoDeLineaFacturada.js";

const DURAZNO = { precio_costo: 38400, factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const RENGLON_696 = {
  orden: 19, textoCrudo: "DURAZNOS EN MITADES ALCO X 12 UN 820G", codigoProveedor: "1194",
  cantidad: 12, netoUnitario: 2640.637, subtotalImpreso: 31687.63, costoFinalRenglon: 39271.16,
  enQueViene: "unidad", tipoRenglon: "MERCADERIA",
};
// Como está en la base. `costoMaestroHoy` es el que le pone `aplanarDetalles`.
const LINEA_3481 = {
  id: 3481, cantidad: 12, unidad: "BULTO", precioCosto: 1500, cantidadRecibida: null, unidadesFisicas: null,
  kgRecibidos: null, costoMaestroHoy: 38400, productoBaseId: 922, factorPack: 12,
};

/** La fila de la tarjeta, como la arma la conciliación de un pedido nacido de factura. */
function fila(detalle, producto = DURAZNO) {
  const precio = analizarPrecioDeLinea({ linea: RENGLON_696, producto, proveedor: { nombre: "Nutrisur" } });
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 60, estado: "CARGADO", lineas: [{ ...RENGLON_696, id: 696, pedidoDetalleId: 3481, productoLocalId: 922, pedidoDetalle: detalle, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [detalle],
    nacidoDeFactura: true,
  }).grupos[0].filas;
  return { ...f, id: 696, variacionNormalPct: 10 };
}

/** Lo que la siembra haría hoy con la 3481, con la misma cuenta de precio que usa. */
function rehacer(detalle, extra = {}) {
  const f = fila(LINEA_3481);
  const [dictado] = loQueHayQueSembrar({ filas: [f], detalles: [{ id: 3481, productoBaseId: 922 }] }).dictadoDeLasExistentes;
  return lineaSembradaQueRehacer({
    detalle,
    dictado,
    precioEnSuUnidad: costoParaUnidad({ costoMaestro: DURAZNO.precio_costo, unidad: detalle.unidad, producto: DURAZNO }),
    precioDictado: costoParaUnidad({ costoMaestro: DURAZNO.precio_costo, unidad: dictado.unidad, producto: DURAZNO }),
    base: DURAZNO,
    ...extra,
  });
}

test("DE DÓNDE SALIÓ LA 3481: EL PRODUCTO SIN PACK Y A $1.500 DA 12 BULTO A $1.500", () => {
  // Sin pack no hay escala que deducir: la cantidad entra cruda, en BULTO, y
  // el precio es el costo del producto en ese momento.
  const comoEstaba = { precio_costo: 1500, factor_pack: null, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
  const f = fila({ ...LINEA_3481 }, comoEstaba);
  assert.deepEqual(cantidadParaElPedido(f), { cantidad: 12, unidad: "BULTO" });
  assert.equal(costoParaUnidad({ costoMaestro: 1500, unidad: "BULTO", producto: comoEstaba }), 1500);
});

test("LA 3481 COMO ESTÁ: LA TARJETA DE PRODUCCIÓN, CON SU CARTEL", () => {
  const f = fila(LINEA_3481);
  const r = renglonesDeLaTarjeta(f);
  assert.equal(motivoSinComparacion(f), AVISO_ESCALA);
  assert.equal(hayDiferenciaDePrecio(f), false, "tu costo no se toca");
  assert.equal(r.cantidad, "1 PACK x12");
  assert.equal(Math.round(r.papel.importe * 100) / 100, 3272.6);
  assert.equal(r.erp.importe, 3200);
  assert.equal(r.total, 39271.16);
});

test("LA SIEMBRA REHACE LA 3481 COMO 1 BULTO A $38.400, Y LA TARJETA OFRECE EL +2,3 %", () => {
  const nueva = rehacer(LINEA_3481);
  assert.deepEqual(nueva, { cantidad: 1, unidad: "BULTO", precioCosto: 38400 });

  const f = fila({ ...LINEA_3481, ...nueva });
  assert.equal(motivoSinComparacion(f), null, "sin «No se puede saber en qué viene»");
  assert.equal(hayDiferenciaDePrecio(f), true, "se ofrece el cambio de costo");
  assert.equal(Math.round(porcentajeDelPrecio(f) * 10) / 10, 2.3, "la hoja dice «El precio subió 2,3 %»");
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO);
  const r = renglonesDeLaTarjeta(f);
  assert.equal(r.erp.importe, 38400);
  assert.equal(r.erp.unidad, "pack");
  // El mismo signo que la hoja desde el 2026-11-05: el papel sube 2,3 %. Hasta
  // ahí la tarjeta decía "−2,3 %" mientras la hoja decía "subió 2,3 %".
  assert.equal(r.erp.texto, "+2,3 %");
  assert.equal(r.total, 39271.16);
});

test("CONTRAPRUEBA: UN PRECIO DE LA LÍNEA QUE SE PARECE AL DEL ERP NO SE TOCA", () => {
  // $37.000 está a un 3,6 % de los $38.400: es un precio, no una foto vieja.
  assert.equal(rehacer({ ...LINEA_3481, cantidad: 1, precioCosto: 37000 }), null);
});

test("CONTRAPRUEBA: UNA LÍNEA YA CONTADA, O CON UN PRECIO ACEPTADO, NO SE TOCA", () => {
  assert.equal(rehacer({ ...LINEA_3481, cantidadRecibida: 1 }), null, "ya se contó lo recibido");
  assert.equal(rehacer({ ...LINEA_3481, unidadesFisicas: 12 }), null, "ya se contó en unidades");
  assert.equal(rehacer(LINEA_3481, { conPrecioAceptado: true }), null, "ya se aceptó un precio sobre ella");
});

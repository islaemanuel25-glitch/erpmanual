// DURAZNO LATA ALCO, PACK DE 12: EL PRECIO RESUELVE LA ESCALA Y NO HAY CARTEL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/duraznoAlco.test.mjs
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// De la tarjeta que vio Emanuel recibiendo un pedido real (2026-11-04):
// "Factura 1 PACK x12 · el papel dice 12 u", "Papel $3.272,60 / u", "ERP
// $3.200,00 / u", Total $39.271,16, y "No se puede saber en qué viene: revisá
// la cantidad". El producto: pack de 12 a $38.400 en el catálogo.
//
// La línea del pedido es "12 u a $3.200": un pedido por UNIDAD guarda el precio
// de la unidad (`costoParaUnidad`). Eso NO se leyó de la base —la de producción
// no se toca desde acá—: es la única forma de la línea que reproduce la tarjeta
// entera, número por número, y con la línea a $38.400 la tarjeta sale bien.
//
// La fila se arma con las mismas funciones que la pantalla —`analizarPrecioDeLinea`
// y `filasDeConciliacion`— y la línea del pedido con los campos que deja
// `aplanarDetalles`, costo maestro de hoy incluido. Nada escrito a mano encima.

import { test } from "node:test";
import assert from "node:assert/strict";

import { analizarPrecioDeLinea } from "./comprobante/precioDeLinea.js";
import { filasDeConciliacion } from "./comprobante/filasDeConciliacion.js";
import { renglonesDeLaTarjeta } from "./tarjetaDeRecepcion.js";
import {
  AVISO_ESCALA,
  ESTADO_LINEA,
  escalaSinDeducir,
  estadoDeLinea,
  hayDiferenciaDePrecio,
  hayQueDecidirElPrecio,
  motivoSinComparacion,
  porcentajeDelPrecio,
  costoPropioParaDecidir,
} from "./estadoDeLineaFacturada.js";

function fila({ texto, cantidad, neto, importe, producto, detalle }) {
  const linea = { orden: 1, textoCrudo: texto, cantidad, netoUnitario: neto, subtotalImpreso: importe, costoFinalRenglon: importe, enQueViene: "unidad" };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Alco" } });
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 1, estado: "CARGADO", lineas: [{ ...linea, id: 1, pedidoDetalleId: detalle.id, productoLocalId: 1, pedidoDetalle: detalle, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [detalle],
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

const DURAZNO = { precio_costo: 38400, factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const LINEA_DEL_PEDIDO = { id: 1, cantidad: 12, precioCosto: 3200, costoMaestroHoy: 38400, unidad: "UNIDAD", productoBaseId: 1, factorPack: 12, cantidadRecibida: null };

test("DURAZNO: 12 u A $3.272,60 CONTRA 12 u A $3.200 ES UN AUMENTO DEL 2,3 %, NO UN «NO SE PUEDE SABER»", () => {
  const f = fila({ texto: "DURAZNO LATA ALCO", cantidad: 12, neto: 3272.6, importe: 39271.16, producto: DURAZNO, detalle: LINEA_DEL_PEDIDO });

  // La lectura del papel ya era la buena: 12 unidades, un pack.
  assert.equal(f.unidad.unidad, "POR_UNIDAD");
  assert.equal(f.unidad.requiereDecision, false);

  // Lo que frenaba: el pack del papel contra la unidad del pedido.
  assert.equal(escalaSinDeducir(f), false, "decía «No se puede saber en qué viene»");
  assert.equal(motivoSinComparacion(f), null);
  assert.notEqual(motivoSinComparacion(f), AVISO_ESCALA);

  // Se ofrece el cambio, como en cualquier otro producto.
  assert.equal(hayDiferenciaDePrecio(f), true, "el costo quedaba viejo: se recibía a pérdida");
  assert.equal(hayQueDecidirElPrecio(f), true);
  assert.equal(costoPropioParaDecidir(f), 38400, "«Tenías» el pack: 12 × $3.200");
  assert.equal(Math.round(porcentajeDelPrecio(f) * 10) / 10, 2.3, "la hoja dice «El precio subió 2,3 %»");
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO);

  // Y la tarjeta compara pack contra pack, con su porcentaje.
  const r = renglonesDeLaTarjeta(f);
  assert.equal(r.cantidad, "1 PACK x12");
  assert.equal(r.papel.unidad, "pack");
  assert.equal(r.erp.importe, 38400);
  assert.equal(r.erp.unidad, "pack");
  assert.equal(r.erp.texto, "−2,3 %");
  assert.equal(r.total, 39271.16, "el total sigue siendo el del papel");
});

test("CONTRAPRUEBA: CON DOS LECTURAS POSIBLES DEL PAPEL, EL CARTEL SIGUE", () => {
  // Plancha de 24 a $24.000 ($1.000 la unidad), 8 a $6.930: de a 6 sería un
  // +15 % y de a 8 un −13 %. Las dos caen, y elegir una sería adivinar. Misma
  // forma de línea del pedido que el durazno: por UNIDAD, con el precio de la
  // unidad.
  const PLANCHA = { precio_costo: 24000, factor_pack: 24, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
  const f = fila({
    texto: "PLANCHA", cantidad: 8, neto: 6930, importe: 55440, producto: PLANCHA,
    detalle: { id: 1, cantidad: 48, precioCosto: 1000, costoMaestroHoy: 24000, unidad: "UNIDAD", productoBaseId: 2, factorPack: 24, cantidadRecibida: null },
  });
  assert.equal(f.unidad.requiereDecision, true);
  assert.deepEqual(f.unidad.posibles, [6, 8]);
  assert.equal(escalaSinDeducir(f), true);
  assert.equal(motivoSinComparacion(f), AVISO_ESCALA);
  assert.equal(hayDiferenciaDePrecio(f), false, "no propone costo");
  assert.equal(renglonesDeLaTarjeta(f).erp.pct, null, "ningún porcentaje de otra escala");
});

test("CONTRAPRUEBA: SI EL COSTO DEL PEDIDO NO CAE EN NINGUNA ESCALA, EL CARTEL SIGUE", () => {
  // El mismo durazno, con la línea del pedido a $1.000: ni $1.000 ni $12.000
  // el pack explican $39.271. No se elige ninguna.
  const f = fila({
    texto: "DURAZNO LATA ALCO", cantidad: 12, neto: 3272.6, importe: 39271.16, producto: DURAZNO,
    detalle: { ...LINEA_DEL_PEDIDO, precioCosto: 1000 },
  });
  assert.equal(escalaSinDeducir(f), true);
  assert.equal(motivoSinComparacion(f), AVISO_ESCALA);
  assert.equal(hayDiferenciaDePrecio(f), false);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  productoBaseDeLaLinea,
  analizarPrecioDeLinea,
} from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { UNIDAD } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";
import { ACCION_PRECIO } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";
import { CLASE_DIFERENCIA } from "@/lib/compras-proveedor/fronteraCosto";

// LAS CLAVES SON LAS DE `RECETA_POR_DEFECTO`, no unas inventadas. La primera
// versión de este archivo usaba `ivaPct`, que no existe: `normalizarReceta`
// completaba con el 21 % por defecto y siete candados salieron en rojo con los
// números corridos exactamente ese 21 %. La receta se escribe mirando la
// constante, no de memoria.
const RECETA_21 = { alicuotaIvaPct: 21, percepciones: [] };
const RECETA_0 = { alicuotaIvaPct: 0, percepciones: [] };

// ── QUÉ PRODUCTO ES LA LÍNEA ───────────────────────────────────────────────
//
// El primero es el candado del defecto que motivó este módulo: una línea ya
// vinculada perdía su producto porque el producto salía solo de la sugerencia
// automática, y con él perdía precio, unidad y línea del pedido.

test("una línea YA vinculada saca su producto del vínculo, no de la sugerencia", () => {
  const r = productoBaseDeLaLinea({
    linea: { productoLocalId: 77 },
    baseDelLocal: new Map([[77, 900]]),
    sugeridoBaseId: null, // no hay sugerencia: ya está vinculada, no se busca
  });
  assert.equal(r.productoBaseId, 900);
  assert.equal(r.desdeVinculo, true);
});

test("el vínculo hecho a mano le gana a una sugerencia que dice otra cosa", () => {
  const r = productoBaseDeLaLinea({
    linea: { productoLocalId: 77 },
    baseDelLocal: new Map([[77, 900]]),
    sugeridoBaseId: 111,
  });
  assert.equal(r.productoBaseId, 900, "alguien ya decidió: la sugerencia no lo pisa");
});

test("sin vínculo, vale la sugerencia", () => {
  const r = productoBaseDeLaLinea({
    linea: { productoLocalId: null },
    baseDelLocal: new Map(),
    sugeridoBaseId: 111,
  });
  assert.equal(r.productoBaseId, 111);
  assert.equal(r.desdeVinculo, false);
});

test("un vínculo a un producto que no se ve desde acá no se hace pasar por sin vincular", () => {
  const r = productoBaseDeLaLinea({
    linea: { productoLocalId: 77 },
    baseDelLocal: new Map(), // no está en el catálogo visible
    sugeridoBaseId: 111,
  });
  assert.equal(r.productoBaseId, null, "no cae en la sugerencia: el vínculo existe");
  assert.equal(r.desdeVinculo, true, "y se dice que viene de un vínculo");
});

// ── EL ORDEN DE LOS PASOS ──────────────────────────────────────────────────

test("el neto se lleva a final ANTES de comparar: el IVA no es un aumento", () => {
  // Costo del ERP 1210 (final). Factura: neto 1000 → final 1210. Es el MISMO
  // precio. Comparar neto contra final daría una baja del 17 %.
  const r = analizarPrecioDeLinea({
    linea: { cantidad: 1, netoUnitario: 1000, internoUnitario: 0 },
    producto: { precio_costo: 1210, factor_pack: 1 },
    receta: RECETA_21,
    proveedor: null,
  });
  assert.equal(r.precioFinal, 1210);
  assert.equal(r.clasificacion.clase, CLASE_DIFERENCIA.SIN_AVISO, "mismo precio, sin aviso");
  assert.equal(r.decision.accion, ACCION_PRECIO.NINGUNA);
});

test("la unidad se decide ANTES de clasificar: por unidad se escribe el precio del bulto", () => {
  // Costo del bulto 12000, el bulto trae 12, la factura cobra 1000 por unidad.
  // Es el mismo precio. Clasificar sin resolver la unidad daría una baja del 92 %.
  const r = analizarPrecioDeLinea({
    linea: { cantidad: 24, netoUnitario: 1000, internoUnitario: 0 },
    producto: { precio_costo: 12000, factor_pack: 12 },
    receta: RECETA_0,
    proveedor: null,
  });
  assert.equal(r.unidad.unidad, UNIDAD.POR_UNIDAD);
  assert.equal(r.precioAEscribir, 12000, "lo que se escribe es el precio del BULTO");
  assert.equal(r.clasificacion.clase, CLASE_DIFERENCIA.SIN_AVISO);
});

test("por bulto, el precio de la factura entra tal cual", () => {
  const r = analizarPrecioDeLinea({
    linea: { cantidad: 5, netoUnitario: 12000, internoUnitario: 0 },
    producto: { precio_costo: 12000, factor_pack: 12 },
    receta: RECETA_0,
    proveedor: null,
  });
  assert.equal(r.unidad.unidad, UNIDAD.POR_BULTO);
  assert.equal(r.precioAEscribir, 12000);
});

// ── LO QUE SE MUESTRA ES LO QUE SE ESCRIBIRÍA ──────────────────────────────

test("una suba por encima del umbral ofrece aceptar, con el precio ya resuelto por unidad", () => {
  // Bulto de 12 a 12000. La factura cobra 1300 por unidad → 15600 el bulto: +30 %.
  const r = analizarPrecioDeLinea({
    linea: { cantidad: 24, netoUnitario: 1300, internoUnitario: 0 },
    producto: { precio_costo: 12000, factor_pack: 12 },
    receta: RECETA_0,
    proveedor: null,
  });
  assert.equal(r.unidad.unidad, UNIDAD.POR_UNIDAD);
  assert.equal(r.precioAEscribir, 15600);
  assert.equal(r.decision.accion, ACCION_PRECIO.OFRECER);
  assert.ok(r.decision.titulo.startsWith("Subió"), r.decision.titulo);
  assert.equal(r.decision.costoNuevo, 15600, "el número del aviso ES el que se escribiría");
});

test("una baja informa y no ofrece botón", () => {
  const r = analizarPrecioDeLinea({
    linea: { cantidad: 3, netoUnitario: 900, internoUnitario: 0 },
    producto: { precio_costo: 1000, factor_pack: 1 },
    receta: RECETA_0,
    proveedor: null,
  });
  assert.equal(r.decision.accion, ACCION_PRECIO.SOLO_INFORMAR);
  assert.equal(r.decision.ofreceAceptar, false);
});

// EL CASO AMBIGUO ESTÁ MEDIDO, no elegido a ojo. `zonaAmbigua(2)` devuelve
// cociente entre 1,481 y 1,538 — una banda de 3,8 %—, así que costo 1500 con
// precio 1000 (cociente 1,5) cae adentro. La primera versión de estos dos
// candados usaba 1100 y 900, que da cociente 1,22 y decide POR_BULTO sin
// dudar: probaban otra cosa y salían en rojo.
const AMBIGUO = { producto: { precio_costo: 1500, factor_pack: 2 }, neto: 1000 };

test("la elección de una persona manda sobre el cociente", () => {
  const auto = analizarPrecioDeLinea({
    linea: { cantidad: 6, netoUnitario: AMBIGUO.neto, internoUnitario: 0 },
    producto: AMBIGUO.producto,
    receta: RECETA_0,
    proveedor: null,
  });
  assert.equal(auto.unidad.requiereDecision, true, "sin elegir, pregunta");

  const elegida = analizarPrecioDeLinea({
    linea: { cantidad: 6, netoUnitario: AMBIGUO.neto, internoUnitario: 0 },
    producto: AMBIGUO.producto,
    receta: RECETA_0,
    proveedor: null,
    unidadElegida: UNIDAD.POR_UNIDAD,
  });
  assert.equal(elegida.unidad.requiereDecision, false);
  assert.equal(elegida.precioAEscribir, 2000, "1000 × 2");
});

test("una unidad elegida que no es ninguna de las dos no se acepta como elección", () => {
  const r = analizarPrecioDeLinea({
    linea: { cantidad: 6, netoUnitario: AMBIGUO.neto, internoUnitario: 0 },
    producto: AMBIGUO.producto,
    receta: RECETA_0,
    proveedor: null,
    unidadElegida: "CUALQUIER_COSA",
  });
  assert.equal(r.unidad.requiereDecision, true, "sigue preguntando");
});

test("sin producto no hay análisis, y se dice con null en vez de con ceros", () => {
  assert.equal(analizarPrecioDeLinea({ linea: { cantidad: 1, netoUnitario: 100 }, producto: null }), null);
});

test("los umbrales del proveedor gobiernan, no una constante de este módulo", () => {
  const linea = { cantidad: 1, netoUnitario: 1150, internoUnitario: 0 };
  const producto = { precio_costo: 1000, factor_pack: 1 };
  const flojo = analizarPrecioDeLinea({
    linea, producto, receta: RECETA_0,
    proveedor: { umbralRevisarPct: 20 },
  });
  const estricto = analizarPrecioDeLinea({
    linea, producto, receta: RECETA_0,
    proveedor: { umbralRevisarPct: 5 },
  });
  assert.equal(flojo.decision.accion, ACCION_PRECIO.NINGUNA, "15 % no llega a 20");
  assert.equal(estricto.decision.accion, ACCION_PRECIO.OFRECER, "15 % pasa 5");
});

// CAMBIAR DE UNIDAD ES UNA SOLA OPERACIÓN: CANTIDAD Y PRECIO JUNTOS.
//
// ── DE DÓNDE SALIÓ ─────────────────────────────────────────────────────────
//
// De una importación real. El renglón decía:
//
//   PHILIPS MORRIS 10 | cantidad 50 | precio $3.360 | total del renglón $168.000
//
// y el producto del ERP es un bulto de 10. El sistema convertía el PRECIO a
// $33.600 por bulto y dejaba la cantidad en 50, así que calculaba $1.680.000 —
// diez veces lo que dice el papel.
//
// Los dos números son plausibles por separado y por eso el error no se ve
// mirando la pantalla. Lo que lo delata es el SUBTOTAL: cambiar de unidad es
// reexpresar la misma compra, no comprar diez veces más.
//
// Los datos son sintéticos y reproducen esa aritmética. No hay ninguna factura
// real en el repo.

import test from "node:test";
import assert from "node:assert/strict";

import { proponerCantidadPedido } from "./cantidad.js";
import {
  cambiarUnidadDeLinea,
  prepararLineasImportadas,
} from "./prepararLineas.js";
import { ORIGEN_PRECIO } from "./precios.js";

/** Bulto de 10, con el costo maestro POR BULTO como todo pack del ERP. */
const PHILIPS = {
  productoLocalId: 4,
  baseId: 104,
  nombre: "Philips 10",
  codigoInterno: "PH10",
  codigosInternos: ["PH10"],
  aliasesProveedor: [],
  factor_pack: 10,
  modoCompra: "BULTO",
  unidad_medida: "unidad",
  precio_costo: 33600,
};

const RENGLON = Object.freeze({
  codigo: "PH10",
  descripcion: "PHILIPS MORRIS 10",
  cantidad: 50,
  precioUnitario: 3360,
});

const subtotal = (l) => {
  const costo = l.origenPrecio === ORIGEN_PRECIO.PAPEL ? l.precioPapel : l.precioSistema;
  return Math.round((Number(l.cantidadPedido) || 0) * (Number(costo) || 0) * 100) / 100;
};

const preparar = (unidad, extra = {}) =>
  prepararLineasImportadas({
    lineas: [{ ...RENGLON, unidad }],
    productos: [PHILIPS],
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: false,
    ...extra,
  })[0];

// ── LOS DOS RESULTADOS VÁLIDOS, Y EL QUE NUNCA ────────────────────────────

test("50 unidades a $3.360 son $168.000", () => {
  const l = preparar("UNIDAD");
  // 50 unidades de un bulto de 10 son 5 bultos exactos: el motor lo convierte.
  assert.equal(l.cantidadPedido, 5);
  assert.equal(l.unidadPedido, "BULTO");
  assert.equal(l.precioPapel, 33600);
  assert.equal(subtotal(l), 168000);
});

test("EL DEFECTO: 50 BULTOS a $33.600 son $1.680.000 y eso NO puede pasar", () => {
  // Este candado se pone rojo si vuelve el defecto por cualquiera de sus dos
  // caminos. No mira cómo se llegó al número: mira el número.
  for (const unidadDelPapel of ["UNIDAD", "UN", null, ""]) {
    const l = preparar(unidadDelPapel);
    assert.notEqual(
      subtotal(l),
      1680000,
      `con unidad ${JSON.stringify(unidadDelPapel)} el renglón valió diez veces el papel`
    );
    assert.equal(
      subtotal(l),
      168000,
      `con unidad ${JSON.stringify(unidadDelPapel)} el subtotal no es el del papel`
    );
  }
});

test("SIN COLUMNA DE UNIDAD se asume la escala del PRECIO, no el default del producto", () => {
  // ── LA CAUSA DEL SÍNTOMA REPORTADO ──────────────────────────────────────
  //
  // El papel no traía columna de unidad. La cantidad quedaba TAL COMO SE LEYÓ
  // —50— y la unidad se declaraba BULTO, que es el default del producto. El
  // precio sí se llevaba a escala bulto. Los dos lados en escalas distintas.
  const l = preparar(null);
  assert.equal(l.cantidadPedido, 50);
  assert.equal(l.unidadPedido, "UNIDAD", "volvió a asumir BULTO sobre una cantidad leída en unidades");
  assert.equal(l.precioPapel, 3360, "el precio quedó en escala bulto sobre una cantidad en unidades");
  assert.equal(subtotal(l), 168000);
  // Y sigue pidiendo revisión: asumir bien no es lo mismo que saber.
  assert.equal(l.requiereRevision, true);
  assert.match(l.motivoRevision, /no indica la unidad/i);
});

test("SI LA RECETA DICE QUE LA CANTIDAD VIENE EN BULTOS, se respeta", () => {
  // ── EL CONTRATO CAMBIÓ A PROPÓSITO ──────────────────────────────────────
  //
  // Antes esto se declaraba con `facturaPor`. Pero `facturaPor` dice en qué
  // escala está el PRECIO, y eso es otra pregunta que en qué escala está la
  // CANTIDAD. Usar una para contestar la otra es la mezcla que produjo el
  // defecto de "10 unidades" leídas como "10 bultos".
  //
  // El campo de la receta para la cantidad es `cantidadEn`, y gana sobre todo
  // lo demás: es el primer escalón de la prioridad.
  //
  // Las dos declaraciones van juntas y coherentes: si el papel cuenta bultos,
  // su precio impreso es por bulto. Un papel que dijera "50 bultos a $3.360 por
  // UNIDAD, total $168.000" no cerraría consigo mismo —serían 1.680.000— y esa
  // incoherencia es del documento, no del motor.
  const l = prepararLineasImportadas({
    lineas: [{ ...RENGLON, unidad: null }],
    productos: [PHILIPS],
    facturaPor: "BULTO",
    cantidadEn: "BULTO",
    hayColumnaSubtotal: false,
  })[0];
  assert.equal(l.unidadCantidadPapel, "BULTO");
  assert.equal(l.origenUnidadPapel, "RECETA");
  assert.equal(l.unidadPedido, "BULTO");
  assert.equal(l.cantidadPedido, 50);
  assert.equal(l.precioPapel, 3360);
  assert.equal(subtotal(l), 168000);
});

test("LA RECETA LE GANA A LA EVIDENCIA DEL PRECIO", () => {
  // El precio del papel es idéntico al costo por unidad, así que la evidencia
  // diría UNIDAD. La receta dice BULTO y manda: es el primer escalón.
  const l = prepararLineasImportadas({
    lineas: [{ ...RENGLON, unidad: null }],
    productos: [PHILIPS],
    facturaPor: "UNIDAD",
    cantidadEn: "BULTO",
    hayColumnaSubtotal: false,
  })[0];
  assert.equal(l.origenUnidadPapel, "RECETA");
  assert.equal(l.unidadPapelConfirmada, true);
});

test("SIN RECETA, el precio SUGIERE la escala y la línea lo dice", () => {
  // $3.360 es exactamente el costo por unidad del producto —33.600 ÷ 10—, así
  // que la evidencia apunta a UNIDAD. Se propone, no se confirma.
  const l = prepararLineasImportadas({
    lineas: [{ ...RENGLON, unidad: null }],
    productos: [PHILIPS],
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: false,
  })[0];
  assert.equal(l.unidadCantidadPapel, "UNIDAD");
  assert.equal(l.origenUnidadPapel, "EVIDENCIA_PRECIO");
  assert.equal(l.unidadPapelConfirmada, false, "una sugerencia por precio quedó como confirmada");
  assert.equal(subtotal(l), 168000);
});

test("LO INMUTABLE DEL PAPEL VIAJA CON LA LÍNEA", () => {
  const l = prepararLineasImportadas({
    lineas: [{ ...RENGLON, unidad: null, subtotal: 168000 }],
    productos: [PHILIPS],
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  })[0];
  // Los cuatro que no se tocan nunca más. Sin ellos, cada representación
  // tendría que salir de la anterior y los errores se acumularían.
  assert.equal(l.cantidadPapel, 50);
  assert.equal(l.precioPapelOriginal, 3360);
  assert.equal(l.subtotalPapelOriginal, 168000);
  assert.equal(l.unidadCantidadPapel, "UNIDAD");
});

// ── EL TOGGLE DE LA PANTALLA ──────────────────────────────────────────────

test("CAMBIAR A BULTO convierte cantidad Y precio: 50 × 3.360 pasa a 5 × 33.600", () => {
  const enUnidad = { ...preparar(null) };
  assert.equal(enUnidad.cantidadPedido, 50);
  assert.equal(enUnidad.unidadPedido, "UNIDAD");

  const aBulto = cambiarUnidadDeLinea(enUnidad, PHILIPS, {
    unidadDestino: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: false,
  });
  assert.equal(aBulto.cantidadPedido, 5, "la cantidad no se convirtió");
  assert.equal(aBulto.unidadPedido, "BULTO");
  assert.equal(aBulto.precioPapel, 33600);
  assert.equal(subtotal(aBulto), 168000, "el subtotal no sobrevivió a la conversión");
});

test("CONTRAPRUEBA DEL TOGGLE: convertir SOLO el precio da 1.680.000", () => {
  // Es lo que hacía la pantalla. Se reproduce a mano para dejar el número a la
  // vista: si alguien vuelve a mover solo la unidad, esto es lo que sale.
  const enUnidad = preparar(null);
  const soloElPrecio = { ...enUnidad, unidadPedido: "BULTO", precioPapel: 33600 };
  assert.equal(subtotal(soloElPrecio), 1680000);
  // Y la pieza correcta NO da eso.
  const bien = cambiarUnidadDeLinea(enUnidad, PHILIPS, {
    unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: false,
  });
  assert.notEqual(subtotal(bien), subtotal(soloElPrecio));
});

test("IDA Y VUELTA VARIAS VECES conserva el subtotal", () => {
  let l = preparar(null);
  const esperado = subtotal(l);
  assert.equal(esperado, 168000);
  for (let i = 0; i < 4; i++) {
    l = cambiarUnidadDeLinea(l, PHILIPS, { unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: false });
    assert.equal(subtotal(l), esperado, `se perdió el subtotal al pasar a BULTO en la vuelta ${i + 1}`);
    l = cambiarUnidadDeLinea(l, PHILIPS, { unidadDestino: "UNIDAD", facturaPor: "UNIDAD", hayColumnaSubtotal: false });
    assert.equal(subtotal(l), esperado, `se perdió el subtotal al volver a UNIDAD en la vuelta ${i + 1}`);
  }
  assert.equal(l.cantidadPedido, 50);
  assert.equal(l.unidadPedido, "UNIDAD");
});

test("CAMBIAR A LA MISMA UNIDAD no mueve nada", () => {
  const l = preparar(null);
  const igual = cambiarUnidadDeLinea(l, PHILIPS, { unidadDestino: "UNIDAD", facturaPor: "UNIDAD", hayColumnaSubtotal: false });
  assert.equal(igual.cantidadPedido, l.cantidadPedido);
  assert.equal(subtotal(igual), subtotal(l));
});

// ── LO QUE NO DA ENTERO NO SE REDONDEA SOLO ───────────────────────────────

test("47 UNIDADES A BULTOS DE 10 exige confirmación y NO redondea sola", () => {
  const l = { ...preparar(null), cantidadPedido: 47, unidadPedido: "UNIDAD" };
  const r = cambiarUnidadDeLinea(l, PHILIPS, { unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: false });
  assert.equal(r.requiereConfirmacionDeUnidad, true);
  assert.equal(r.conversionPendiente.unidades, 47);
  assert.equal(r.conversionPendiente.bultos, 5);
  assert.equal(r.conversionPendiente.factor, 10);
  // La línea NO cambió de unidad ni de cantidad mientras tanto.
  assert.equal(r.cantidadPedido, 47);
  assert.equal(r.unidadPedido, "UNIDAD");
});

test("CONFIRMADA, la conversión redondea hacia arriba y lo dice", () => {
  const l = { ...preparar(null), cantidadPedido: 47, unidadPedido: "UNIDAD" };
  const r = cambiarUnidadDeLinea(l, PHILIPS, {
    unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: false, redondear: true,
  });
  assert.equal(r.requiereConfirmacionDeUnidad, false);
  assert.equal(r.cantidadPedido, 5);
  assert.equal(r.unidadPedido, "BULTO");
  // Se pide MÁS de lo que decía el papel, y por eso hacía falta confirmarlo.
  assert.equal(subtotal(r), 168000);
});

// ── LA PIEZA DE LA CANTIDAD, SOLA ─────────────────────────────────────────

test("proponerCantidadPedido respeta `cantidadEn` solo cuando el papel calla", () => {
  const conUnidad = proponerCantidadPedido({ cantidad: 50, unidadFuente: "UN", producto: PHILIPS, cantidadEn: "BULTO" });
  assert.equal(conUnidad.unidad, "BULTO");
  assert.equal(conUnidad.cantidad, 5, "el papel decía unidades y se ignoró por la receta");

  const sinUnidad = proponerCantidadPedido({ cantidad: 50, unidadFuente: null, producto: PHILIPS, cantidadEn: "UNIDAD" });
  assert.equal(sinUnidad.unidad, "UNIDAD");
  assert.equal(sinUnidad.cantidad, 50);
  assert.equal(sinUnidad.requiereRevision, true);
});

test("EL FIAMBRE NO ENTRA EN ESTA REGLA: no tiene bultos", () => {
  const fiambre = { factor_pack: 6, modoCompra: "UNIDAD", unidad_medida: "kg", pesoReferenciaKg: 2.5 };
  const r = proponerCantidadPedido({ cantidad: 3, unidadFuente: null, producto: fiambre, cantidadEn: "BULTO" });
  assert.equal(r.unidad, "UNIDAD", "un fiambre terminó en BULTO por una receta que habla de otra cosa");
});

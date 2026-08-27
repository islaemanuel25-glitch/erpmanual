// UNA INTERPRETACIÓN UNIDAD/BULTO NO PUEDE CONVERTIR $50.500 EN CIENTOS DE MILES.
//
// Los candados de `coherenciaDeLinea.test.mjs` prueban la aritmética sola. Éstos
// la prueban DONDE VIVE: atravesando `prepararLineasImportadas` y
// `cambiarUnidadDeLinea`, que son los caminos por los que una línea llega a la
// pantalla. Es la distinción de siempre — los candados prueban piezas, y los
// defectos viven entre las piezas.
//
// Todo sintético. El caso está construido para reproducir la aritmética del
// pedido: cantidad 10, precio $5.050, subtotal $50.500, producto bulto x10.

import test from "node:test";
import assert from "node:assert/strict";

import { COHERENCIA } from "./coherenciaDeLinea.js";
import {
  cambiarUnidadDelPapel,
  cambiarUnidadDeLinea,
  prepararLineasImportadas,
} from "./prepararLineas.js";

/** Bulto de 10. El costo maestro de un pack del ERP va POR BULTO. */
const PRODUCTO = Object.freeze({
  productoLocalId: 7,
  baseId: 707,
  nombre: "Cigarro X 10",
  codigoInterno: "CX10",
  codigosInternos: ["CX10"],
  aliasesProveedor: [],
  factor_pack: 10,
  modoCompra: "BULTO",
  unidad_medida: "unidad",
  precio_costo: 50000,
});

const RENGLON = Object.freeze({
  codigo: "CX10",
  descripcion: "CIGARRO X 10",
  cantidad: 10,
  precioUnitario: 5050,
  subtotal: 50500,
});

const preparar = (extra = {}) =>
  prepararLineasImportadas({
    lineas: [{ ...RENGLON, unidad: extra.unidad ?? null }],
    productos: [PRODUCTO],
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
    ...extra,
  })[0];

/** El importe que la pantalla muestra para la representación del papel. */
const importeDelPapel = (l) =>
  Math.round((Number(l.cantidadSegunElPapel) || 0) * (Number(l.precioPapel) || 0) * 100) / 100;

// ── EL CASO OBLIGATORIO ───────────────────────────────────────────────────

test("10 × $5.050 = $50.500: la línea cierra y no bloquea", () => {
  const l = preparar({ unidad: "UN" });
  assert.equal(l.coherencia.estado, COHERENCIA.CIERRA);
  assert.equal(l.coherencia.bloquea, false);
  assert.equal(importeDelPapel(l), 50500);
});

test("las DOS representaciones válidas dan $50.500, y ninguna otra", () => {
  const enUnidades = preparar({ unidad: "UN" });
  // 10 unidades de un bulto de 10 son 1 bulto exacto: el motor lo lleva ahí.
  assert.equal(enUnidades.unidadPedido, "BULTO");
  assert.equal(enUnidades.cantidadSegunElPapel, 1);
  assert.equal(enUnidades.precioPapel, 50500);
  assert.equal(importeDelPapel(enUnidades), 50500);

  const aUnidad = cambiarUnidadDeLinea(enUnidades, PRODUCTO, {
    unidadDestino: "UNIDAD",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(aUnidad.cantidadPedido, 10);
  assert.equal(aUnidad.precioPapel, 5050);
  assert.equal(importeDelPapel(aUnidad), 50500);
  assert.equal(aUnidad.coherencia.bloquea, false);
});

test("SI SE LEE MAL COMO 10 BULTOS, la línea NO cierra y BLOQUEA", () => {
  // Es la representación inválida del pedido: 10 bultos × $50.500 = $505.000.
  // Antes de este candado, nada la miraba: los dos números son plausibles por
  // separado y el papel decía 10.
  const bien = preparar({ unidad: "UN" });
  const mal = cambiarUnidadDelPapel(bien, PRODUCTO, {
    unidadPapel: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(mal.cantidadBaseUnidades, 100, "la base tiene que haber cambiado con la lectura");
  assert.equal(mal.coherencia.estado, COHERENCIA.NO_CIERRA);
  assert.equal(mal.coherencia.bloquea, true);
  assert.equal(mal.coherencia.importeCalculado, 505000);
  assert.equal(mal.coherencia.subtotal, 50500);
});

test("y al bloquear DICE qué interpretación produjo la diferencia", () => {
  const mal = cambiarUnidadDelPapel(preparar({ unidad: "UN" }), PRODUCTO, {
    unidadPapel: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.match(mal.explicacionCoherencia.comoSeLeyo, /10 bultos de 10/);
  assert.ok(mal.explicacionCoherencia.cuenta.includes("505.000"));
  assert.ok(mal.explicacionCoherencia.cuenta.includes("50.500"));
});

test("y OFRECE las representaciones que sí cierran, sin aplicar ninguna sola", () => {
  const mal = cambiarUnidadDelPapel(preparar({ unidad: "UN" }), PRODUCTO, {
    unidadPapel: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.ok(mal.representacionesValidas.length >= 1);
  // NUNCA se corrige el importe solo: la línea sigue bloqueada y con la lectura
  // equivocada puesta. Corregir el número escondería la interpretación mala.
  assert.equal(mal.coherencia.bloquea, true);
  assert.equal(mal.unidadCantidadPapel, "BULTO");
});

test("corregir la lectura desbloquea, y por el camino de la lectura", () => {
  const mal = cambiarUnidadDelPapel(preparar({ unidad: "UN" }), PRODUCTO, {
    unidadPapel: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  const corregida = cambiarUnidadDelPapel(mal, PRODUCTO, {
    unidadPapel: "UNIDAD",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(corregida.cantidadBaseUnidades, 10);
  assert.equal(corregida.coherencia.bloquea, false);
  assert.equal(importeDelPapel(corregida), 50500);
  // Y queda constando que lo contestó una persona, que es lo que después se
  // puede aprender como presentación del proveedor.
  assert.equal(corregida.unidadPapelConfirmada, true);
});

// ── RECHAZAR 50 BULTOS CUANDO EL DOCUMENTO REPRESENTA 50 UNIDADES ─────────

test("50 bultos donde el papel dice 50 unidades queda bloqueado", () => {
  const linea = { codigo: "CX10", descripcion: "CIGARRO X 10", cantidad: 50, precioUnitario: 3360, subtotal: 168000, unidad: "UN" };
  const bien = prepararLineasImportadas({
    lineas: [linea],
    productos: [{ ...PRODUCTO, precio_costo: 33600 }],
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  })[0];
  assert.equal(bien.coherencia.bloquea, false);
  assert.equal(importeDelPapel(bien), 168000);

  const comoBultos = cambiarUnidadDelPapel(bien, { ...PRODUCTO, precio_costo: 33600 }, {
    unidadPapel: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(comoBultos.coherencia.bloquea, true);
  assert.equal(comoBultos.coherencia.importeCalculado, 1680000);
});

// ── ALTERNAR NO ACUMULA ───────────────────────────────────────────────────

test("ALTERNAR DIEZ VECES devuelve exactamente los mismos números", () => {
  let l = preparar({ unidad: "UN" });
  const primeraVez = {
    cantidad: l.cantidadPedido,
    unidad: l.unidadPedido,
    precio: l.precioPapel,
    base: l.cantidadBaseUnidades,
  };

  for (let vuelta = 1; vuelta <= 10; vuelta += 1) {
    l = cambiarUnidadDeLinea(l, PRODUCTO, { unidadDestino: "UNIDAD", facturaPor: "UNIDAD", hayColumnaSubtotal: true });
    assert.equal(l.cantidadPedido, 10, `vuelta ${vuelta}: la cantidad en unidades se movió`);
    assert.equal(l.precioPapel, 5050, `vuelta ${vuelta}: el precio por unidad se movió`);
    assert.equal(importeDelPapel(l), 50500, `vuelta ${vuelta}: el importe en unidades se movió`);
    assert.equal(l.coherencia.bloquea, false);

    l = cambiarUnidadDeLinea(l, PRODUCTO, { unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: true });
    assert.equal(l.cantidadPedido, 1, `vuelta ${vuelta}: la cantidad en bultos se movió`);
    assert.equal(l.precioPapel, 50500, `vuelta ${vuelta}: el precio por bulto se movió`);
    assert.equal(importeDelPapel(l), 50500, `vuelta ${vuelta}: el importe en bultos se movió`);
    assert.equal(l.coherencia.bloquea, false);
  }

  // Y la base NUNCA cambió: es lo que hace que la vuelta 10 dé lo mismo que la 1.
  assert.equal(l.cantidadBaseUnidades, primeraVez.base);
  assert.equal(l.cantidadPedido, primeraVez.cantidad);
  assert.equal(l.unidadPedido, primeraVez.unidad);
  assert.equal(l.precioPapel, primeraVez.precio);
});

test("REDONDEAR Y VOLVER NO INVENTA UNIDADES", () => {
  // ── EL CASO QUE DISTINGUE DERIVAR DE ENCADENAR ──────────────────────────
  //
  // Mientras las conversiones dan exactas, encadenar desde el valor mostrado y
  // derivar de la base dan lo mismo, así que alternar no prueba nada por sí
  // solo — lo comprobé rompiéndolo a propósito y los candados siguieron verdes.
  //
  // La diferencia aparece cuando una vuelta NO es exacta. 47 unidades
  // redondeadas hacia arriba son 5 bultos; al volver a unidades:
  //
  //   encadenando:  5 × 10 = 50 unidades   ← tres que nadie pidió
  //   desde la base:        47 unidades    ← lo que dice el papel
  //
  // Encadenando, cada vuelta se queda con el redondeo de la anterior.
  const linea = {
    codigo: "CX10",
    descripcion: "CIGARRO X 10",
    cantidad: 47,
    precioUnitario: 1000,
    subtotal: 47000,
    unidad: "UN",
  };
  const productos = [{ ...PRODUCTO, precio_costo: 10000 }];
  const inicial = prepararLineasImportadas({
    lineas: [linea],
    productos,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  })[0];
  assert.equal(inicial.cantidadBaseUnidades, 47);

  const redondeada = cambiarUnidadDeLinea(inicial, productos[0], {
    unidadDestino: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
    redondear: true,
  });
  assert.equal(redondeada.cantidadPedido, 5);
  assert.equal(redondeada.cantidadRedondeadaHaciaArriba, true);

  const devuelta = cambiarUnidadDeLinea(redondeada, productos[0], {
    unidadDestino: "UNIDAD",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(devuelta.cantidadPedido, 47, "volvió con unidades que el papel no traía");
  assert.equal(devuelta.cantidadBaseUnidades, 47, "la base se movió con el redondeo");

  // Y diez vueltas de lo mismo siguen en 47: el redondeo no se acumula.
  let l = devuelta;
  for (let i = 0; i < 10; i += 1) {
    l = cambiarUnidadDeLinea(l, productos[0], { unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: true, redondear: true });
    l = cambiarUnidadDeLinea(l, productos[0], { unidadDestino: "UNIDAD", facturaPor: "UNIDAD", hayColumnaSubtotal: true });
  }
  assert.equal(l.cantidadPedido, 47, "el redondeo se acumuló a lo largo de las vueltas");
});

test("LA CANTIDAD DEL PAPEL SE RECALCULA DE LOS INMUTABLES, NO DE LA BASE", () => {
  // Si el control mirara `cantidadBaseUnidades`, una cantidad tecleada sería su
  // propia referencia y cerraría siempre. Acá se teclea una barbaridad y el
  // control sigue comparando contra lo que dice el papel.
  const l = preparar({ unidad: "UN" });
  const conBaseFalseada = { ...l, cantidadBaseUnidades: 999, cantidadPedido: 999 };
  const recalculada = cambiarUnidadDeLinea(conBaseFalseada, PRODUCTO, {
    unidadDestino: "UNIDAD",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(recalculada.cantidadSegunElPapel, 10, "el control siguió a la base en vez de al papel");
  assert.equal(recalculada.cantidadDifiereDelPapel, true);
});

test("LOS INMUTABLES DEL PAPEL SOBREVIVEN A TODO", () => {
  let l = preparar({ unidad: "UN" });
  const original = {
    cantidadPapel: l.cantidadPapel,
    precioPapelOriginal: l.precioPapelOriginal,
    subtotalPapelOriginal: l.subtotalPapelOriginal,
    textoOriginal: l.textoOriginal,
  };
  assert.equal(original.cantidadPapel, 10);
  assert.equal(original.precioPapelOriginal, 5050);
  assert.equal(original.subtotalPapelOriginal, 50500);
  assert.equal(original.textoOriginal, "CIGARRO X 10");

  for (let i = 0; i < 5; i += 1) {
    l = cambiarUnidadDeLinea(l, PRODUCTO, { unidadDestino: "UNIDAD", facturaPor: "UNIDAD", hayColumnaSubtotal: true });
    l = cambiarUnidadDelPapel(l, PRODUCTO, { unidadPapel: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: true });
    l = cambiarUnidadDelPapel(l, PRODUCTO, { unidadPapel: "UNIDAD", facturaPor: "UNIDAD", hayColumnaSubtotal: true });
    l = cambiarUnidadDeLinea(l, PRODUCTO, { unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: true });
  }
  assert.equal(l.cantidadPapel, original.cantidadPapel);
  assert.equal(l.precioPapelOriginal, original.precioPapelOriginal);
  assert.equal(l.subtotalPapelOriginal, original.subtotalPapelOriginal);
  assert.equal(l.textoOriginal, original.textoOriginal);
});

// ── DE $100 A $1.000.000 NO SE LLEGA ──────────────────────────────────────

test("un renglón de $100 no puede terminar en un millón por ningún camino", () => {
  const barato = {
    codigo: "CX10",
    descripcion: "CIGARRO X 10",
    cantidad: 10,
    precioUnitario: 10,
    subtotal: 100,
    unidad: "UN",
  };
  const productos = [{ ...PRODUCTO, precio_costo: 100 }];
  let l = prepararLineasImportadas({
    lineas: [barato],
    productos,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  })[0];

  // Se ejercen las cuatro combinaciones de lectura del papel y unidad de pedido.
  for (const lectura of ["UNIDAD", "BULTO"]) {
    for (const destino of ["UNIDAD", "BULTO"]) {
      const conLectura = cambiarUnidadDelPapel(l, productos[0], {
        unidadPapel: lectura,
        facturaPor: "UNIDAD",
        hayColumnaSubtotal: true,
      });
      const final = cambiarUnidadDeLinea(conLectura, productos[0], {
        unidadDestino: destino,
        facturaPor: "UNIDAD",
        hayColumnaSubtotal: true,
        redondear: true,
      });
      const importe = importeDelPapel(final);
      // O el renglón sigue valiendo 100, o está bloqueado. Nunca las dos cosas
      // falsas a la vez: un importe inflado que además se puede guardar.
      assert.ok(
        importe === 100 || final.coherencia.bloquea === true,
        `lectura ${lectura} → pedido ${destino} dio ${importe} sin bloquear`
      );
      assert.ok(importe < 1_000_000, `lectura ${lectura} → pedido ${destino} llegó a ${importe}`);
    }
  }
});

// ── LA CANTIDAD PEDIDA A MANO NO ES UNA INCOHERENCIA ──────────────────────

test("pedir 8 donde el papel dice 10 se AVISA, no se bloquea", () => {
  // Son dos hechos distintos: la interpretación del papel y qué se decide pedir.
  // Si esto bloqueara, corregir una cantidad a mano sería imposible en cualquier
  // documento con subtotal impreso.
  const l = preparar({ unidad: "UN" });
  const aUnidad = cambiarUnidadDeLinea(l, PRODUCTO, {
    unidadDestino: "UNIDAD",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  const conMenos = prepararLineasImportadas({
    lineas: [{ ...RENGLON, unidad: "UN" }],
    productos: [PRODUCTO],
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  })[0];
  assert.equal(conMenos.cantidadDifiereDelPapel, false);
  assert.equal(aUnidad.cantidadDifiereDelPapel, false);

  // Y con la cantidad cambiada a mano, se avisa y la línea sigue utilizable.
  const editada = { ...aUnidad, cantidadPedido: 8 };
  const recalculada = cambiarUnidadDeLinea(editada, PRODUCTO, {
    unidadDestino: "UNIDAD",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(recalculada.cantidadSegunElPapel, 10);
  assert.equal(recalculada.coherencia.bloquea, false, "una cantidad decidida a mano no es una lectura mala");
});

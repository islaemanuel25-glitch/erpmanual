// LA ESCALA DE VENTA, Y EL CANDADO QUE ATA LAS DOS COPIAS DE LA REGLA.
//
// El más importante de este archivo es el último bloque, y conviene leer por qué
// antes que el resto.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  modoSalidaDeVenta,
  escalaDeVentaDe,
  seMuestraUnitario,
  escalaQueLaTarjetaSabeMostrar,
  SALIDA_BULTO,
  SALIDA_UNIDAD,
  ESCALA_BULTO,
  ESCALA_UNIDAD,
  ESCALA_KG,
  ESCALA_PIEZA,
  ESCALA_IMPORTE,
} from "./escalaDeVenta.js";
import { cantidadParaStockNormal } from "../pos-ventas/consumoStock.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ══ 1 · LA REGLA, TAL COMO LA TRAJIMOS DEL POS ════════════════════════════

test("un LOCAL vende siempre por unidad, sin mirar nada más", () => {
  // Es el caso que explica 5.410 de las 5.450 filas mal: en un local el POS
  // vende por unidad aunque el producto sea un pack con el precio por bulto.
  for (const modoEnvio of ["SOLO_BULTO", "MIXTO", "SOLO_UNIDAD", null]) {
    for (const unidad of ["unidad", "pack", "cajon", "kg"]) {
      assert.equal(
        modoSalidaDeVenta(false, modoEnvio, unidad), SALIDA_UNIDAD,
        `local con modoEnvio=${modoEnvio} unidad=${unidad} salió por bulto`
      );
    }
  }
});

test("en el DEPÓSITO manda modo_envio", () => {
  assert.equal(modoSalidaDeVenta(true, "SOLO_BULTO", "pack"), SALIDA_BULTO);
  assert.equal(modoSalidaDeVenta(true, "MIXTO", "pack"), SALIDA_BULTO);
  assert.equal(modoSalidaDeVenta(true, "SOLO_UNIDAD", "pack"), SALIDA_UNIDAD);
});

test("y con modo_envio NULO cae al default del POS, no al del mapper", () => {
  // Son 120 productos activos, medidos el 2026-08-19, y en los 120 las dos
  // respuestas difieren: el mapper rellena el hueco con "MIXTO" —que en depósito
  // sale por bulto— y el POS con `defaultModoEnvio`, que para unidad y kg da
  // SOLO_UNIDAD. Si la tarjeta leyera el `modoEnvio` del mapper, volvería a
  // mentir justo en esas filas.
  assert.equal(modoSalidaDeVenta(true, null, "pack"), SALIDA_BULTO);
  assert.equal(modoSalidaDeVenta(true, null, "cajon"), SALIDA_BULTO);
  assert.equal(modoSalidaDeVenta(true, null, "unidad"), SALIDA_UNIDAD);
  assert.equal(modoSalidaDeVenta(true, null, "kg"), SALIDA_UNIDAD);
});

// ══ 2 · LA ESCALA EN PALABRAS ═════════════════════════════════════════════

test("los tres casos que se resuelven ANTES del modo de salida", () => {
  assert.equal(
    escalaDeVentaDe({ modalidad: "IMPORTE_VARIABLE" }, false), ESCALA_IMPORTE,
    "un servicio no tiene escala de venta"
  );

  const fiambre = {
    unidadMedida: "kg", modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 4.5, modoVentaDeposito: "PIEZA",
  };
  assert.equal(escalaDeVentaDe(fiambre, true), ESCALA_PIEZA, "fiambre fijo en depósito va por pieza");
  assert.equal(
    escalaDeVentaDe(fiambre, false), ESCALA_KG,
    "el MISMO producto fuera del depósito se vende por kilo: la escala es de la ubicación, no del producto"
  );

  assert.equal(escalaDeVentaDe({ unidadMedida: "kg" }, true), ESCALA_KG, "kg se vende por peso");
});

test("un pack se ve distinto según dónde estés parado", () => {
  const pack = { unidadMedida: "pack", modoEnvio: "SOLO_BULTO", factorPack: 24 };
  assert.equal(escalaDeVentaDe(pack, true), ESCALA_BULTO);
  assert.equal(escalaDeVentaDe(pack, false), ESCALA_UNIDAD);
});

test("un pack con SOLO_UNIDAD sale por unidad hasta en el depósito", () => {
  // Es el caso que Emanuel describió: entra por pack, sale por unidad.
  const p = { unidadMedida: "pack", modoEnvio: "SOLO_UNIDAD", factorPack: 24 };
  assert.equal(escalaDeVentaDe(p, true), ESCALA_UNIDAD);
});

test("LA EXCEPCIÓN DEL FIAMBRE ESTÁ ACOTADA Y ES LA ÚNICA", () => {
  // La pieza dice la verdad —pieza— y la tarjeta muestra kilo, porque todavía no
  // sabe poner el precio de una pieza. Lo encontró la sonda: rotular "por pieza"
  // sobre un número por kilo es una contradicción a la vista en la misma
  // tarjeta, peor que el error que se está arreglando. Son 35 filas.
  assert.equal(escalaQueLaTarjetaSabeMostrar(ESCALA_PIEZA), ESCALA_KG);

  // Y no toca ninguna otra. Si mañana alguien la usa para tapar otro caso, esto
  // se pone rojo.
  for (const e of [ESCALA_BULTO, ESCALA_UNIDAD, ESCALA_KG, ESCALA_IMPORTE]) {
    assert.equal(escalaQueLaTarjetaSabeMostrar(e), e, `${e} no debería transformarse`);
  }
});

test("y con la excepción aplicada el número NO pasa a unitario", () => {
  // El par que hace coherente a la tarjeta: si se muestra kilo, el número es el
  // de la escala guardada. Pedir el unitario acá dejaría "por kg" sobre otro
  // número.
  assert.equal(seMuestraUnitario(escalaQueLaTarjetaSabeMostrar(ESCALA_PIEZA)), false);
  assert.equal(seMuestraUnitario(ESCALA_UNIDAD), true);
  assert.equal(seMuestraUnitario(ESCALA_BULTO), false);
  assert.equal(seMuestraUnitario(ESCALA_KG), false);
});

// ══ 3 · EL QUE IMPORTA: LA ESCALA DEL PRECIO Y LA DEL STOCK NO SE SEPARAN ══
//
// `cantidadParaStockNormal` (lib/pos-ventas/consumoStock.js:30-34) REPLICA esta
// misma regla a mano, y lo dice en su propio comentario. Son dos copias: una
// decide en qué escala se COBRA y la otra en qué escala se DESCUENTA el stock.
//
// El día que alguien toque una sola, la venta va a cobrar un bulto y descontar
// una unidad —o al revés— y NINGÚN candado lo vería, porque las dos funciones
// pasan sus propias pruebas por separado. Ese defecto no se nota el día que se
// escribe: se nota cuando el stock ya quedó mal.
//
// Este candado no las unifica —eso es otra tanda— pero las ATA: si divergen, se
// pone rojo.

test("ATADURA · el stock se descuenta en la misma escala en que se cobra", () => {
  const FACTOR = 24;
  let comparadas = 0;

  for (const esDeposito of [true, false]) {
    for (const modoEnvio of ["SOLO_BULTO", "MIXTO", "SOLO_UNIDAD", null]) {
      for (const unidad of ["unidad", "pack", "cajon", "kg"]) {
        const salida = modoSalidaDeVenta(esDeposito, modoEnvio, unidad);

        const stock = cantidadParaStockNormal({
          cantidadVenta: 1,
          esDeposito,
          baseStock: { factorPack: FACTOR, modo_envio: modoEnvio, unidad_medida: unidad },
          modoVentaLinea: "NORMAL",
        });

        // Cobrar por bulto significa descontar `factor` unidades de stock;
        // cobrar por unidad significa descontar una.
        const esperado = salida === SALIDA_BULTO && esDeposito ? FACTOR : 1;

        assert.equal(
          stock, esperado,
          `cobra ${salida} y descuenta ${stock} (esDeposito=${esDeposito} ` +
          `modoEnvio=${modoEnvio} unidad=${unidad}): las dos copias de la regla se separaron`
        );
        comparadas++;
      }
    }
  }

  assert.equal(comparadas, 32, "se dejó de recorrer la matriz completa");
});

test("ATADURA · y el comentario que avisa de la copia sigue estando", () => {
  // Si alguien unifica las dos de verdad, este candado se cae y hay que
  // reescribirlo — que es exactamente lo que se quiere que pase. Lo que NO puede
  // pasar es que la copia se quede sin señal de que es una copia.
  const consumo = fs.readFileSync(path.join(RAIZ, "lib/pos-ventas/consumoStock.js"), "utf8");
  assert.match(
    consumo, /replica|misma regla|escalaDeVenta/i,
    "consumoStock.js dejó de avisar que replica la regla de la escala de venta"
  );
});

// ══ 4 · LAS DOS RUTAS LLAMAN A LA MISMA PIEZA ═════════════════════════════

test("ninguna ruta se quedó con su copia privada de la regla", () => {
  for (const ruta of [
    "app/api/pos-ventas/buscar-producto/route.js",
    "app/api/stock_locales/buscar-producto/route.js",
  ]) {
    const src = leer(ruta);
    assert.match(
      src, /modoSalidaDeVenta/,
      `${ruta} no importa la pieza compartida`
    );
    assert.doesNotMatch(
      src, /function\s+calcularModoSalida/,
      `${ruta} volvió a declarar su propia copia de la regla`
    );
  }
});

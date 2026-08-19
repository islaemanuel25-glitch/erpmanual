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
  valorEnLaEscalaDeVenta,
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

// ── LA EXCEPCIÓN DEL FIAMBRE SE FUE, Y ESO ES EL ARREGLO ─────────────────
//
// Acá vivían dos candados sobre `escalaQueLaTarjetaSabeMostrar`, que hacía que
// la tarjeta mostrara "por kg" donde la venta es por pieza. No era un capricho:
// la tarjeta no sabía poner el precio de una pieza, y rotular "por pieza" encima
// de un número por kilo habría sido peor. Eran 35 filas.
//
// Ahora sí sabe —`valorEnLaEscalaDeVenta` multiplica por el peso, igual que el
// POS— así que la excepción se borró y los candados que la defendían ya no
// tienen objeto. Los reemplazan los de abajo.

test("EL COSTO Y LA VENTA SALEN EN LA MISMA ESCALA", () => {
  // Es la regla dura: un costo por bulto al lado de una venta por unidad hace
  // parecer sano lo que está mal. Los dos números pasan por esta función con la
  // MISMA escala, y lo único que difiere es el redondeo.
  const fila = { factor: 24, unidad: "pack" };

  const ventaBulto = valorEnLaEscalaDeVenta({ escala: ESCALA_BULTO, valor: 31900, ...fila });
  const costoBulto = valorEnLaEscalaDeVenta({ escala: ESCALA_BULTO, valor: 24000, ...fila });
  assert.equal(ventaBulto, 31900);
  assert.equal(costoBulto, 24000);

  const ventaUnidad = valorEnLaEscalaDeVenta({ escala: ESCALA_UNIDAD, valor: 31900, ...fila });
  const costoUnidad = valorEnLaEscalaDeVenta({ escala: ESCALA_UNIDAD, valor: 24000, ...fila });
  assert.equal(ventaUnidad, 31900 / 24);
  assert.equal(costoUnidad, 24000 / 24);

  // Y la comparación se conserva en las dos escalas: si la venta le gana al
  // costo por bulto, también le gana por unidad. Eso es lo que hace que el
  // vistazo sirva.
  assert.ok(ventaBulto > costoBulto);
  assert.ok(ventaUnidad > costoUnidad);
});

test("EL REDONDEO NO ES SIMÉTRICO, y el llamador lo decide", () => {
  // La venta lleva redondeo comercial porque es lo que se cobra; el costo no,
  // porque se paga. Si esta función lo decidiera sola habría dos criterios sobre
  // lo mismo escondidos en una rama.
  const con = valorEnLaEscalaDeVenta({
    escala: ESCALA_UNIDAD, valor: 31900, factor: 24, unidad: "pack", redondeo100: true,
  });
  const sin = valorEnLaEscalaDeVenta({
    escala: ESCALA_UNIDAD, valor: 31900, factor: 24, unidad: "pack", redondeo100: false,
  });
  assert.equal(con, 1400);
  assert.equal(sin, 31900 / 24);
});

test("LA PIEZA ES EL KILO POR EL PESO FIJO, y sin redondeo", () => {
  // La misma cuenta que hace el POS en buscar-producto:300. Y sin redondeo,
  // también como el POS, que excluye al fiambre fijo en la línea 317.
  assert.equal(
    valorEnLaEscalaDeVenta({ escala: ESCALA_PIEZA, valor: 1000, pesoReferenciaKg: 6 }),
    6000
  );
  assert.equal(
    valorEnLaEscalaDeVenta({
      escala: ESCALA_PIEZA, valor: 1000, pesoReferenciaKg: 0.265, redondeo100: true,
    }),
    265,
    "el fiambre de pieza fija no lleva redondeo comercial"
  );
  // Sin peso no se inventa un número.
  assert.equal(
    valorEnLaEscalaDeVenta({ escala: ESCALA_PIEZA, valor: 1000, pesoReferenciaKg: null }),
    null
  );
  assert.equal(
    valorEnLaEscalaDeVenta({ escala: ESCALA_PIEZA, valor: null, pesoReferenciaKg: 6 }),
    null
  );
});

test("y `seMuestraUnitario` solo es cierto para la unidad", () => {
  assert.equal(seMuestraUnitario(ESCALA_UNIDAD), true);
  assert.equal(seMuestraUnitario(ESCALA_BULTO), false);
  assert.equal(seMuestraUnitario(ESCALA_KG), false);
  assert.equal(seMuestraUnitario(ESCALA_PIEZA), false, "la pieza tiene su propia cuenta");
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

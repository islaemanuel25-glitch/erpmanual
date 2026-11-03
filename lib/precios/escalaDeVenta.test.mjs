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
import { cantidadParaStockNormal, MODO_SUELTO } from "../pos-ventas/consumoStock.js";
import { motivoParaNoVenderSuelto, MOTIVO_SUELTO } from "../pos-ventas/lineaSuelta.js";
import { unidadesDeStockPorEscalon } from "../conversiones/stock.js";

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
// `cantidadParaStockNormal` (lib/pos-ventas/consumoStock.js) REPLICA esta
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

// ── CON EL TERCER NIVEL DE EMPAQUE, LA PREGUNTA TIENE TRES ESCALONES ──────
//
// Cuántas unidades de stock es un bulto, una unidad o un suelto lo contesta un
// solo lugar: `unidadesDeStockPorEscalon` (lib/conversiones/stock.js). Desde la
// tanda 4 del plan —docs/roadmap/tercer-nivel-empaque.md— la venta descuenta en
// las tres escalas: un BULTO es factor × N, una UNIDAD es N y un SUELTO es 1,
// con N los sueltos por unidad del producto. Hoy ningún producto tiene sueltos
// (N = 1), pero la atadura se recorre también con N = 20 para que la rama exista
// antes de que alguien cargue el dato.
//
// Lo que se cobra en cada escala lo deciden dos piezas: `modoSalidaDeVenta` para
// la línea normal y `motivoParaNoVenderSuelto` para la suelta (solo un local,
// con sueltos y con precio). Lo que se descuenta, `cantidadParaStockNormal`. Los
// tamaños ESPERADOS van escritos acá a mano —factor × N, N, 1— y no se le piden
// al embudo: si el embudo se equivocara, esta atadura lo vería.
//
// La atadura se escribe como una función que DEVUELVE las divergencias en vez
// de afirmar adentro. Así la misma función corre dos veces: con la regla real,
// donde tiene que dar cero, y con una regla rota a propósito, donde tiene que
// dar rojo. Sin la segunda corrida no se sabría si la primera mira algo.

const FACTOR = 24;
const PRECIO_SUELTO = 60;

/**
 * Recorre las 32 combinaciones con N sueltos por unidad y, en cada una, los
 * escalones que se pueden cobrar. Devuelve una línea por cada caso donde lo que
 * se descuenta no es lo que vale el escalón cobrado.
 */
function divergenciasDeLaAtadura({
  sueltos = null,
  salidaDe = modoSalidaDeVenta,
  descuentoDe = cantidadParaStockNormal,
  sueltoPermitido = (args) => motivoParaNoVenderSuelto(args) === null,
} = {}) {
  const divergencias = [];
  let combinaciones = 0;
  let escalonesComparados = 0;
  let sueltosCobrados = 0;

  for (const esDeposito of [true, false]) {
    for (const modoEnvio of ["SOLO_BULTO", "MIXTO", "SOLO_UNIDAD", null]) {
      for (const unidad of ["unidad", "pack", "cajon", "kg"]) {
        combinaciones++;
        const salida = salidaDe(esDeposito, modoEnvio, unidad);
        const baseStock = { factorPack: FACTOR, modo_envio: modoEnvio, unidad_medida: unidad, sueltos_por_unidad: sueltos };

        // Lo que vale cada escalón en unidades de stock, a mano. El kilo no
        // tiene sueltos.
        const n = unidad === "kg" || !(sueltos > 1) ? 1 : sueltos;
        const esperado = { bulto: FACTOR * n, unidad: n, suelto: 1 };

        // La línea normal se cobra en el escalón que decide la regla del POS:
        // bulto en el depósito cuando la salida es por bulto, unidad si no. La
        // unidad suelta del depósito (UNIDAD_REMANENTE) solo existe donde el
        // bulto trae más de una unidad. La línea suelta, donde la regla del
        // suelto la deja.
        const cobros = [
          { modoVentaLinea: "NORMAL", escalon: salida === SALIDA_BULTO && esDeposito ? "bulto" : "unidad" },
        ];
        if (esDeposito && salida === SALIDA_BULTO) {
          cobros.push({ modoVentaLinea: "UNIDAD_REMANENTE", escalon: "unidad" });
        }
        const base = { unidad_medida: unidad, sueltos_por_unidad: sueltos, es_combo: false };
        if (sueltoPermitido({ esDeposito, base, precioVentaSuelto: PRECIO_SUELTO })) {
          cobros.push({ modoVentaLinea: MODO_SUELTO, escalon: "suelto" });
          sueltosCobrados++;
        }

        for (const { modoVentaLinea, escalon } of cobros) {
          escalonesComparados++;
          const descuenta = descuentoDe({ cantidadVenta: 1, esDeposito, baseStock, modoVentaLinea });
          if (descuenta !== esperado[escalon]) {
            divergencias.push(
              `cobra 1 ${escalon} (${salida}, ${modoVentaLinea}) y descuenta ${descuenta} en vez de ` +
              `${esperado[escalon]} — N=${sueltos} esDeposito=${esDeposito} modoEnvio=${modoEnvio} unidad=${unidad}`
            );
          }
        }
      }
    }
  }

  return { divergencias, combinaciones, escalonesComparados, sueltosCobrados };
}

test("ATADURA · el embudo: sin sueltos el bulto es el factor; con 20, factor × 20, 20 y 1", () => {
  assert.deepEqual(unidadesDeStockPorEscalon({ factor_pack: FACTOR }), { bulto: FACTOR, unidad: 1, suelto: 1 });
  assert.deepEqual(
    unidadesDeStockPorEscalon({ factor_pack: FACTOR, sueltos_por_unidad: 20 }),
    { bulto: FACTOR * 20, unidad: 20, suelto: 1 }
  );
});

test("ATADURA · sin sueltos (todos los productos hoy): las 32 de siempre, y ningún suelto se puede cobrar", () => {
  const { divergencias, combinaciones, escalonesComparados, sueltosCobrados } = divergenciasDeLaAtadura();
  assert.deepEqual(divergencias, [], "las dos copias de la regla se separaron");
  assert.equal(combinaciones, 32, "se dejó de recorrer la matriz completa");
  // 32 líneas normales + 10 unidades sueltas de depósito con salida por bulto
  // (SOLO_BULTO y MIXTO en las cuatro unidades de medida, más el null de pack y
  // cajón). Ninguna suelta: sin sueltos por unidad no hay escalón más chico.
  assert.equal(sueltosCobrados, 0, "se dejó vender suelto un producto sin sueltos");
  assert.equal(escalonesComparados, 32 + 10);
});

test("ATADURA · con 20 sueltos: el bulto descuenta factor × 20, la unidad 20 y el suelto 1", () => {
  const { divergencias, combinaciones, escalonesComparados, sueltosCobrados } = divergenciasDeLaAtadura({ sueltos: 20 });
  assert.deepEqual(divergencias, [], "cobro y descuento se separaron en alguna de las tres escalas");
  assert.equal(combinaciones, 32);
  // El suelto se cobra solo en un LOCAL y no en el kilo: 4 modos de envío por
  // 3 unidades de medida (unidad, pack, cajón).
  assert.equal(sueltosCobrados, 12, "el suelto se dejó cobrar donde no corresponde, o se dejó de cobrar donde sí");
  assert.equal(escalonesComparados, 32 + 10 + 12);
});

test("ATADURA · el suelto no se cobra en el depósito, ni sin sueltos, ni sin precio, ni en el kilo", () => {
  const base = { unidad_medida: "pack", sueltos_por_unidad: 20, es_combo: false };
  assert.equal(motivoParaNoVenderSuelto({ esDeposito: false, base, precioVentaSuelto: 60 }), null);
  assert.equal(motivoParaNoVenderSuelto({ esDeposito: true, base, precioVentaSuelto: 60 }), MOTIVO_SUELTO.EN_DEPOSITO);
  assert.equal(motivoParaNoVenderSuelto({ esDeposito: false, base: { ...base, sueltos_por_unidad: null }, precioVentaSuelto: 60 }), MOTIVO_SUELTO.SIN_SUELTOS);
  assert.equal(motivoParaNoVenderSuelto({ esDeposito: false, base, precioVentaSuelto: null }), MOTIVO_SUELTO.SIN_PRECIO);
  assert.equal(motivoParaNoVenderSuelto({ esDeposito: false, base, precioVentaSuelto: 0 }), MOTIVO_SUELTO.SIN_PRECIO);
  assert.equal(motivoParaNoVenderSuelto({ esDeposito: false, base: { ...base, unidad_medida: "kg" }, precioVentaSuelto: 60 }), MOTIVO_SUELTO.NO_ADMITE);
  assert.equal(motivoParaNoVenderSuelto({ esDeposito: false, base: { ...base, es_combo: true }, precioVentaSuelto: 60 }), MOTIVO_SUELTO.NO_ADMITE);
});

test("ATADURA · CONTRAPRUEBA: se pone rojo cuando cobro y descuento divergen, en cualquiera de las tres escalas", () => {
  // 1. Se cobra por unidad donde la regla dice bulto: el descuento sigue
  //    descontando el bulto. Es el defecto que esta atadura existe para ver.
  const cobroRoto = divergenciasDeLaAtadura({
    salidaDe: (esDeposito, modoEnvio, unidad) =>
      modoSalidaDeVenta(esDeposito, modoEnvio, unidad) === SALIDA_BULTO ? SALIDA_UNIDAD : SALIDA_BULTO,
  });
  assert.ok(cobroRoto.divergencias.length > 0, "invertir la escala del cobro no puso rojo la atadura");

  // 2. Al revés: el descuento olvida multiplicar por el bulto.
  const descuentoRoto = divergenciasDeLaAtadura({ descuentoDe: ({ cantidadVenta }) => cantidadVenta });
  assert.ok(descuentoRoto.divergencias.length > 0, "un descuento que nunca multiplica no puso rojo la atadura");

  // 3. El descuento que no se enteró de los sueltos: cobra un atado y descuenta
  //    1 en vez de 20. Es el descuento de antes de esta tanda.
  const sinSueltos = divergenciasDeLaAtadura({
    sueltos: 20,
    descuentoDe: (a) => cantidadParaStockNormal({ ...a, baseStock: { ...a.baseStock, sueltos_por_unidad: null } }),
  });
  assert.ok(sinSueltos.divergencias.length > 0, "un descuento que ignora los sueltos no puso rojo la atadura");

  // 4. El suelto descontado como unidad: cobra un cigarrillo y descuenta 20.
  const sueltoComoUnidad = divergenciasDeLaAtadura({
    sueltos: 20,
    descuentoDe: (a) => cantidadParaStockNormal({ ...a, modoVentaLinea: a.modoVentaLinea === MODO_SUELTO ? "NORMAL" : a.modoVentaLinea }),
  });
  assert.ok(sueltoComoUnidad.divergencias.length > 0, "un suelto que descuenta como unidad no puso rojo la atadura");

  // 5. El suelto cobrado en el depósito: la regla del suelto lo deja pasar y la
  //    cuenta de sueltos cobrados sale de lo que corresponde.
  const sueltoEnDeposito = divergenciasDeLaAtadura({ sueltos: 20, sueltoPermitido: ({ base }) => base.unidad_medida !== "kg" });
  assert.notEqual(sueltoEnDeposito.sueltosCobrados, 12, "un suelto vendido en el depósito no se notó");
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

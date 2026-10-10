// LA HOJA Y LA TARJETA LEEN LA ESCALA DEL MISMO LUGAR.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/laHojaYLaTarjetaMismaEscala.test.mjs
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// Hamburguesa Paty Clásica del pedido 242. La tarjeta decía "Factura 3 PACK
// x30 · el papel dice 90 u" y la hoja de Corregir, abierta desde esa misma
// tarjeta, decía "Unidades 3 · Entra al stock 3 unidades" y pedía el motivo de
// la diferencia. Tres hamburguesas en vez de noventa.
//
// La tarjeta preguntaba por `quedoEnBultos` —el veredicto de la factura, que es
// quien convirtió el número— y la hoja preguntaba por `unidadPedido`. Sobre una
// línea donde esos dos no coinciden, la hoja contradecía a la tarjeta que la
// abrió.
//
// Medido sobre los pedidos abiertos: de once renglones vinculados a una línea
// de pedido, UNO estaba así — éste.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { quedoEnBultos, textoDeLaCantidad } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { laCantidadCuadraConElPrecio } from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const HOJA = "components/compras-proveedor/HojaCorregirLinea.jsx";
const CIERRE = "app/api/compras-proveedor/recibir/[id]/route.js";

/**
 * La fila real de la hamburguesa: la línea del pedido está en UNIDAD con 90, y
 * el veredicto de la factura la convirtió a 3 bultos de 30.
 */
const HAMBURGUESA = {
  producto: "Hamburguesa Paty Clasica x2",
  cantidad: 90,
  // MEDIDO contra producción el 2026-09-22: la conciliación manda 90, no 3. El
  // fixture decía 3 y con eso el candado quedaba verde sin ejercer el defecto,
  // que es justo el que se produce cuando las dos cantidades están en escalas
  // distintas. La forma del dato de prueba tiene que ser la del dato real.
  cantidadPedida: 90,
  unidadPedido: "UNIDAD",
  factorPack: 30,
  porKilo: false,
  subtotal: 185110.67,
  costoFactura: 61703.7,
  costoCatalogo: 61703,
  unidad: { unidad: "POR_BULTO", requiereDecision: false, lecturas: { porBulto: { bultos: 3 } } },
};

/** El queso rallado del mismo papel, que siempre estuvo bien: 6 bultos de 20. */
const QUESO = {
  producto: "Queso Rallado Tremblay",
  cantidad: 6,
  cantidadPedida: 6,
  unidadPedido: "BULTO",
  factorPack: 20,
  porKilo: false,
  subtotal: 122714.07,
  costoFactura: 20452.35,
  costoCatalogo: 20600,
  unidad: { unidad: "POR_BULTO", requiereDecision: false, lecturas: { porBulto: { bultos: 6 } } },
};

/**
 * Lo que la hoja calcula hoy, con la escala ya unificada.
 *
 * `completos` es lo que el campo muestra: la cantidad de la FACTURA llevada a
 * la escala del pedido, que es con lo que la hoja arranca.
 */
const comoLaHoja = (fila, completos) => {
  const vaPorPack = quedoEnBultos(fila) && Number(fila.factorPack) > 1;
  const factor = vaPorPack ? Number(fila.factorPack) || 1 : 1;
  const entraAlStock = Number(completos) * factor;
  // La diferencia se mide en FÍSICAS de los dos lados, que es el arreglo.
  const factorDelPedido = (fila.unidadPedido ?? "BULTO") === "BULTO" ? Number(fila.factorPack) || 1 : 1;
  const pedidaFisica = Number(fila.cantidadPedida) * factorDelPedido;
  return {
    rotulo: vaPorPack ? `Bultos de ${fila.factorPack}` : "Unidades",
    entraAlStock,
    pideMotivo: pedidaFisica !== entraAlStock,
  };
};

test("LA HAMBURGUESA: BULTOS DE 30, Y ENTRAN 90 UNIDADES", () => {
  // El campo arranca en 3, que es la cantidad de la factura en la escala del
  // pedido — lo que la tarjeta muestra como "3 PACK x30".
  const hoja = comoLaHoja(HAMBURGUESA, 3);
  assert.equal(hoja.rotulo, "Bultos de 30", "la hoja volvió a decir «Unidades»");
  assert.equal(hoja.entraAlStock, 90, "volvió a meter 3 unidades al stock en vez de 90");
  // Y la tarjeta dice lo mismo.
  assert.equal(textoDeLaCantidad(HAMBURGUESA), "3 PACK x30");
});

test("Y NO PIDE EL MOTIVO DE UNA DIFERENCIA QUE NO EXISTE", () => {
  // La línea del pedido son 90 UNIDADES y el campo muestra 3 BULTOS de 30.
  // Comparados crudos, 90 contra 3 daba "difiere" y la hoja pedía el motivo.
  // En físicas son los dos 90.
  assert.equal(HAMBURGUESA.cantidadPedida, 90);
  assert.equal(HAMBURGUESA.unidadPedido, "UNIDAD");
  assert.equal(comoLaHoja(HAMBURGUESA, 3).pideMotivo, false, "volvió a pedir el motivo de más");
  // Y cuando la diferencia SÍ existe, lo sigue pidiendo: dos bultos en vez de
  // tres son 60 físicas contra 90.
  assert.equal(comoLaHoja(HAMBURGUESA, 2).pideMotivo, true);
});

test("EL QUESO RALLADO NO SE MUEVE: BULTOS DE 20 Y 120 UNIDADES", () => {
  // El renglón que ya estaba bien. Si el arreglo lo cambiara, sería otro
  // defecto en vez de uno menos.
  const hoja = comoLaHoja(QUESO, 6);
  assert.equal(hoja.rotulo, "Bultos de 20");
  assert.equal(hoja.entraAlStock, 120);
  assert.equal(hoja.pideMotivo, false, "el queso coincide y no tiene por qué pedir motivo");
  assert.equal(textoDeLaCantidad(QUESO), "6 PACK x20");
});

test("Y EL PRECIO LO CONFIRMA: 90 CUADRA, 3 NO", () => {
  const cuadra = (fisicas) =>
    laCantidadCuadraConElPrecio({
      subtotal: HAMBURGUESA.subtotal,
      cantidad: HAMBURGUESA.cantidad,
      fisicas,
    }).cuadra;
  assert.equal(cuadra(comoLaHoja(HAMBURGUESA, 3).entraAlStock), true);
  assert.equal(cuadra(3), false, "la escala vieja tiene que seguir dando que no cuadra");
  // Y el queso también cuadra con lo suyo.
  assert.equal(
    laCantidadCuadraConElPrecio({
      subtotal: QUESO.subtotal,
      cantidad: 120,
      fisicas: comoLaHoja(QUESO, 6).entraAlStock,
    }).cuadra,
    true
  );
});

test("LA HOJA NO TIENE SU PROPIA LECTURA DE LA ESCALA", () => {
  // Es lo que produjo el defecto: dos criterios para la misma pregunta.
  const hoja = codigoDe(HOJA);
  assert.match(hoja, /quedoEnBultos\(fila\)/, "la hoja dejó de usar el predicado compartido");
  assert.ok(
    !/unidadPedido \?\? "BULTO"\) === "BULTO" && Number\(fila\?\.factorPack\)/.test(hoja),
    "la hoja volvió a deducir la escala por su cuenta"
  );
  // Y avisa cuando lo que ofrece no cuadra con el precio del papel.
  assert.match(hoja, /laCantidadCuadraConElPrecio\(/);
  assert.match(hoja, /avisoDeEscala/);
  // Y la diferencia se mide en PIEZAS de los dos lados. No contra lo que entra
  // al stock: en un producto por peso eso son kilos, y comparar kilos contra
  // piezas pediría el motivo de una diferencia que no existe en cada fiambre.
  //
  // Desde el 2026-10-09 lo esperado no se cuenta acá: sale de
  // `unidadesFisicasEsperadas`, la misma que usa la tarjeta, que pasa por la
  // conversión de pack. La cuenta propia de la hoja era la que pedía motivo
  // sobre el Gancia de la #253.
  assert.match(hoja, /unidadesFisicasEsperadas\(fila\)/, "la hoja volvió a contar lo esperado por su cuenta");
  assert.match(hoja, /esperadas !== unidadesContadas/);
});

test("Y EL CIERRE USA LO QUE LA HOJA DIJO, NO SU PROPIA CUENTA", () => {
  // El tercer lugar donde se decidía la escala. Ahora la pantalla manda las
  // unidades físicas y el servidor las comprueba contra el precio antes de
  // escribir stock.
  const cierre = codigoDe(CIERRE);
  assert.match(cierre, /body\.fisicas/);
  assert.match(cierre, /laCantidadCuadraConElPrecio\(/);
  assert.match(cierre, /hayFisicas\s*\n?\s*\?\s*Number\(declaradasFisicas\)/);
  // La deducción vieja sigue como respaldo para una línea que nadie abrió, y
  // eso es a propósito: sacarla dejaría sin stock a las líneas no tocadas.
  //
  // Decía `cantRecibida * (det.unidad === "UNIDAD" ? 1 : factorPack)`, que
  // perdía las sueltas: 2 bultos + 3 sueltas entraban como 24. Desde el arreglo
  // de las sueltas el respaldo son las `contadas` de `unidadesFisicasDe`, con la
  // misma elección de escala por `det.unidad`. El caso vive ejecutado en
  // `scripts/pruebas-db/recepcionCompras.mjs`, sección 1d.
  assert.match(cierre, /hayFisicas \? Number\(declaradasFisicas\) : contadas;/);
  assert.match(cierre, /const contadas = unidadesFisicasDe\(/);
  assert.match(cierre, /det\.unidad !== "UNIDAD" \? "BULTO" : "UNIDAD"/);
  // Y no se acusa a quien declaró una diferencia a propósito.
  assert.match(cierre, /motivoDeclarado/);
});

// ── LOS KILOS DEL PAPEL, EN LA HOJA Y EN LA TARJETA ───────────────────────

/** El salamín picado fino del papel de Paty: 3 piezas y 2,100 kg impresos. */
const SALAMIN = {
  producto: "Salamin Fox Picado Fino",
  cantidad: 3,
  cantidadPedida: 3,
  unidadPedido: "UNIDAD",
  factorPack: null,
  porKilo: true,
  faltanKilos: false,
  peso: 2.1,
  kgRecibidos: null,
  subtotal: 37633.23,
  costoFactura: 17920.59,
  costoCatalogo: 18000,
};

test("LA TARJETA DICE LAS PIEZAS Y LOS KILOS DEL PAPEL", () => {
  // Decía "3 u" y quien la miraba no tenía cómo saber que el papel traía el
  // peso impreso — que es lo que de verdad entra al stock.
  assert.equal(textoDeLaCantidad(SALAMIN), "3 u · 2,1 kg");
  // Los otros dos del mismo papel.
  assert.equal(textoDeLaCantidad({ ...SALAMIN, cantidad: 2, cantidadPedida: 2, peso: 2.9 }), "2 u · 2,9 kg");
  assert.equal(textoDeLaCantidad({ ...SALAMIN, cantidadPedida: 3, peso: 11.685 }), "3 u · 11,685 kg");
});

test("Y LAS PAPAS NO, AUNQUE EL PAPEL TRAIGA SU PESO", () => {
  // El depósito las cuenta por bolsa: sus kilos no significan nada para el
  // stock, y ponerlos al lado invitaría a cargarlos.
  const papas = { ...SALAMIN, producto: "Papas Congeladas", porKilo: false, peso: 30, cantidad: 12, cantidadPedida: 12 };
  assert.equal(textoDeLaCantidad(papas), "12 u");
});

test("LA HOJA PIDE KILOS, PRECARGADOS CON LOS DEL PAPEL", () => {
  const hoja = codigoDe(HOJA);
  // El campo existe y solo para los que el depósito cuenta por peso.
  assert.match(hoja, /const entraEnKilos = fila\?\.porKilo === true;/);
  assert.match(hoja, /\{entraEnKilos && \(/);
  // Precargado con lo pesado antes, y si no con lo que dice el papel. NUNCA
  // con el peso de referencia del producto, que es una estimación.
  assert.match(hoja, /fila\.kgRecibidos != null/);
  assert.match(hoja, /: fila\.peso != null/);
  assert.ok(!/pesoRefKg|pesoReferenciaKg/.test(hoja), "la hoja se llenó con una estimación");
  // Lo que entra al stock son esos kilos, y la franja lo dice en kg.
  assert.match(hoja, /entraEnKilos \? Number\(kilos\) \|\| 0 : unidadesContadas/);
  assert.match(hoja, /formatearKgExacto\(entraAlStock\)/);
  // Y con el formateador del sistema, no con uno escrito al lado: "2,1 kg", con
  // coma, como el resto de los números de la pantalla.
  assert.match(hoja, /import \{ formatearMoneda, formatearKgExacto \} from "@\/lib\/moneda"/);
  // Y viajan al servidor.
  assert.match(hoja, /kgRecibidos: entraEnKilos && kilos !== "" \? Number\(kilos\) : null/);
});

test("EL CIERRE ESCRIBE AL STOCK LOS KILOS QUE MOSTRÓ LA HOJA", () => {
  // La rama de peso del cierre ya prefería `kgRecibidos` sobre el peso de
  // referencia; lo que faltaba era que alguien se lo mandara.
  const cierre = codigoDe(CIERRE);
  assert.match(cierre, /kgRecibidosMap\[det\.id\] !== undefined/);
  assert.match(cierre, /incremento = esFiambreFijoEnUbicacion\(base, destinoEsDeposito\)/);
  // El respaldo por peso de referencia queda para cuando nadie pesó, y se ve
  // que es un respaldo.
  assert.match(cierre, /kgReales = cantRecibida \* pesoRef/);
});

test("Y ENTRA POR EL MISMO PREDICADO QUE USA LA HOJA, NO POR OTRO", () => {
  // ── LA DIVERGENCIA MEDIDA ───────────────────────────────────────────
  //
  // La hoja pide kilos con `elDepositoCuentaPorKilo`; el cierre entraba a la
  // rama de peso solo con `modoCompraProveedor === "UNIDAD"`. No son el mismo
  // conjunto: contra producción, de los 60 productos activos que el depósito
  // cuenta por kilo, 36 se compran por bulto —Trozado, Pechuga, pan, Cebolla—.
  // En esos la hoja mostraba kilos y el cierre escribía unidades.
  const cierre = codigoDe(CIERRE);
  assert.match(cierre, /elDepositoCuentaPorKilo\(base\) && hayKilosDeLaHoja/);
  assert.match(cierre, /import \{[^}]*elDepositoCuentaPorKilo[^}]*\} from "@\/lib\/conversiones\/stock"/);
  // Y solo cuando la hoja mandó kilos de verdad: sin eso, los 36 tienen que
  // seguir entrando como hasta hoy, no caer en un peso de referencia que no
  // tienen cargado.
  assert.match(cierre, /Number\(kilosDeLaHoja\) > 0/);
});

test("EL CARTEL DE PESAR SOLO SALE SI EL PAPEL NO TRAE LOS KILOS", () => {
  // ── LA CAUSA, MEDIDA CONTRA PRODUCCIÓN ──────────────────────────────
  //
  // `netoQueFacturaElProveedor` lee los kilos de `linea.peso ?? linea.pesoKg`.
  // El select de `aceptar-precio` no pedía `pesoKg`, así que llegaba undefined
  // y contestaba `faltanKilos` en TODOS los fiambres — incluidos los tres del
  // 242, que tienen 2,100 / 2,900 / 11,685 kg guardados desde la lectura. De
  // ahí salía el cartel "Pesá la mercadería y cargá los kilos al recibir".
  //
  // Contraprueba corrida contra Postgres de producción el 2026-09-22: con el
  // campo, `faltanKilos` es false en los tres; sacándolo del objeto, true.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(ruta, /pesoKg: true/, "el select volvió a quedarse sin los kilos del papel");
  // Y el cartel sigue existiendo para el caso que sí lo merece.
  const cruda = fs.readFileSync(
    path.join(RAIZ, "app/api/compras-proveedor/comprobantes/aceptar-precio/route.js"),
    "utf8"
  );
  assert.match(cruda, /Pesá la mercadería y cargá los kilos al recibir/);
  assert.match(ruta, /analisis\?\.faltanKilos/);
});

test("Y LA CUENTA DE LOS KILOS ES LA DEL PAPEL, NO LA DEL PESO DE REFERENCIA", () => {
  // El salamín del 242: 3 piezas, 2,100 kg impresos y peso de referencia 0,55.
  // Sin los kilos del papel el cierre habría escrito 3 × 0,55 = 1,65 kg.
  const delPapel = 2.1;
  const porReferencia = 3 * 0.55;
  assert.equal(Math.round(porReferencia * 100) / 100, 1.65);
  assert.notEqual(delPapel, porReferencia);
  // Y el precio por kilo que sale de esos kilos es el medido en producción.
  assert.equal(Math.round((37633.23 / delPapel) * 100) / 100, 17920.59);
});

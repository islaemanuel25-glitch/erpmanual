// LA PLATA DE UN PEDIDO, CON LOS NÚMEROS REALES DEL #242 DE PATY.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/plataDelPedido.test.mjs
//
// ── LOS TRES NÚMEROS QUE SE VEÍAN, Y NINGUNO ERA EL DEL PAPEL ─────────────
//
// El 2026-09-21 la pantalla del celular mostraba, sobre el mismo pedido:
//
//   · la bandeja:  $6.081.881,00  "estimado al pedir"
//   · el pedido:   Factura $549.758,92
//   · el papel:    $861.376,07
//
// Los tres salían de cuentas distintas sobre los mismos renglones. Este archivo
// fija los dos que se podían arreglar con aritmética, con los valores medidos
// contra producción — no escritos a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { totalPedido, subtotalLinea } from "@/lib/compras-proveedor/calculoPedido";
import {
  gananciaDelDeposito,
  motivoFueraDeLaCuenta,
  cuantoSeValoriza,
  textoDeLaCuenta,
} from "@/lib/compras-proveedor/gananciaDelDeposito";

// ── LOS RENGLONES DEL PEDIDO #242, COPIADOS DE PRODUCCIÓN ─────────────────
//
// Medidos el 2026-09-21 con una consulta de solo lectura. Los nombres, las
// cantidades, la unidad de la línea y los datos del producto son los de la
// base; no hay ninguno inventado.
const PEDIDO_242 = [
  { nombre: "Papas Congeladas", cantidad: 12, unidad: "BULTO", costo: 3800, base: { modoCompraProveedor: "UNIDAD", unidad_medida: "kg", factor_pack: null, pesoReferenciaKg: 2.5 } },
  { nombre: "Manteca Tremblay 100g", cantidad: 1, unidad: "BULTO", costo: 90600, base: { modoCompraProveedor: "BULTO", unidad_medida: "pack", factor_pack: 60 } },
  { nombre: "Hamburguesa Paty Clasica x2", cantidad: 90, unidad: "UNIDAD", costo: 61703, base: { modoCompraProveedor: "BULTO", unidad_medida: "pack", factor_pack: 30 } },
  { nombre: "Queso Rallado Tremblay", cantidad: 6, unidad: "BULTO", costo: 20600, base: { modoCompraProveedor: "BULTO", unidad_medida: "pack", factor_pack: 20 } },
  { nombre: "Yogurt Tremblay Vainilla", cantidad: 3, unidad: "BULTO", costo: 15629, base: { modoCompraProveedor: "BULTO", unidad_medida: "pack", factor_pack: 10 } },
  { nombre: "Yogurt Tremblay Frutilla", cantidad: 4, unidad: "BULTO", costo: 15629, base: { modoCompraProveedor: "BULTO", unidad_medida: "pack", factor_pack: 10 } },
  { nombre: "Untable tremblay clasico", cantidad: 12, unidad: "BULTO", costo: 1752, base: { modoCompraProveedor: "BULTO", unidad_medida: "unidad", factor_pack: 1 } },
  { nombre: "Untable tremblay salame", cantidad: 12, unidad: "BULTO", costo: 1752, base: { modoCompraProveedor: "BULTO", unidad_medida: "unidad", factor_pack: 1 } },
  { nombre: "Salametro", cantidad: 2, unidad: "UNIDAD", costo: 16500, base: { modoCompraProveedor: "UNIDAD", unidad_medida: "kg", factor_pack: null, pesoReferenciaKg: 0.55 } },
  { nombre: "Salamin Fox Picado Fino", cantidad: 3, unidad: "UNIDAD", costo: 18000, base: { modoCompraProveedor: "UNIDAD", unidad_medida: "kg", factor_pack: null, pesoReferenciaKg: 0.55 } },
  { nombre: "BARRA TREMBLAY", cantidad: 3, unidad: "UNIDAD", costo: 10120, base: { modoCompraProveedor: "UNIDAD", unidad_medida: "kg", factor_pack: null, pesoReferenciaKg: 4.1 } },
];

const alPeso = (n) => Math.round(Number(n));

test("EL ESTIMADO DE LA BANDEJA SALE DE LA FÓRMULA ÚNICA, NO DE MULTIPLICAR EN CRUDO", () => {
  // Lo que se veía —$6.081.881— era `cantidad × costo` renglón por renglón,
  // sin preguntarle nada al producto. Es lo que hacía `listar/route.js`.
  const enCrudo = PEDIDO_242.reduce((a, l) => a + l.cantidad * l.costo, 0);
  assert.equal(alPeso(enCrudo), 6081881, "cambió el número que se veía en el celular");

  // `totalPedido` valoriza el fiambre por KILO: piezas × peso por pieza × costo
  // por kilo. Los cuatro de fiambre del #242 cambian, y el total también.
  const conLaFormula = totalPedido(PEDIDO_242);
  assert.notEqual(alPeso(conLaFormula), alPeso(enCrudo), "la fórmula no cambió nada: no se está usando");

  // Renglón por renglón, los cuatro que se valorizan por kilo.
  const porKilo = PEDIDO_242.filter((l) => l.base.modoCompraProveedor === "UNIDAD");
  assert.equal(porKilo.length, 4, "cambiaron los cuatro que se pesan");
  for (const l of porKilo) {
    const r = subtotalLinea(l);
    assert.equal(alPeso(r.subtotal), alPeso(l.cantidad * l.base.pesoReferenciaKg * l.costo));
    assert.equal(r.kg, l.cantidad * l.base.pesoReferenciaKg);
  }
  // El danbo: 3 piezas × 4,1 kg × $10.120 = $124.476, contra los $30.360 que
  // daba multiplicar piezas por un costo que está por kilo.
  const danbo = PEDIDO_242.find((l) => l.nombre === "BARRA TREMBLAY");
  assert.equal(alPeso(subtotalLinea(danbo).subtotal), 124476);
  assert.equal(alPeso(danbo.cantidad * danbo.costo), 30360);
});

test("Y EL RENGLÓN QUE SE LLEVA CINCO MILLONES ES UNA ESCALA, NO UN PRECIO", () => {
  // Las hamburguesas: 90 UNIDADES a $61.703, que es el costo del BULTO de 30.
  // Son $5.553.270 de los $6.081.881, o sea el 91 % del número que se veía.
  //
  // Medido contra el catálogo: el producto tiene `precio_costo` 61.703 y
  // `factor_pack` 30, así que el costo se copió del bulto sin convertirlo a la
  // unidad de la línea. Dividido por el pack da $2.056,77 — y el papel de Paty
  // cobra $2.056,79 por unidad. La escala es la explicación, no el precio.
  const burger = PEDIDO_242.find((l) => l.nombre.startsWith("Hamburguesa"));
  assert.equal(burger.unidad, "UNIDAD");
  assert.equal(burger.base.factor_pack, 30);
  assert.equal(alPeso(burger.cantidad * burger.costo), 5553270);
  assert.equal(Math.round((burger.costo / burger.base.factor_pack) * 100) / 100, 2056.77);
  // Lo que el papel cobra por esas 90 unidades.
  assert.equal(Math.round((185110.67 / 90) * 100) / 100, 2056.79);
});

// ── LA CUENTA DEL PEDIDO: LA FACTURA SON LOS 11 PRODUCTOS ─────────────────

/**
 * Las once filas del papel, como las arma `filasDeConciliacion` después de que
 * `netoQueFacturaElProveedor` decide la unidad. Los subtotales y los kilos son
 * los del papel de Paty medido; `costoFactura` es el neto por unidad de compra.
 */
const fila = (nombre, cantidad, peso, subtotal, costoFactura, costoCatalogo, porKilo, faltanKilos) => ({
  nombre, cantidad, peso, subtotal, costoFactura, costoCatalogo, porKilo, faltanKilos,
  productoBaseId: nombre.length, unidad: null,
});

const FILAS_DEL_PAPEL = [
  // El butler: producto por kilo y el papel NO trae los kilos. Es el único que
  // queda afuera, y se pesa al recibir.
  fila("BUTLER", 12, null, 97998.47, null, 3800, true, true),
  fila("MANTECA", 60, null, 90481.03, 1508.017, 1510, false, false),
  fila("QUESO RALL", 6, null, 122714.07, 20452.345, 20600, false, false),
  fila("PATY CLASICO", 90, null, 185110.67, 2056.785, 2056.77, false, false),
  fila("YOG VAINILLA", 30, null, 46896.56, 1563.219, 1562.9, false, false),
  fila("YOG FRUTILLA", 40, null, 62515.42, 1562.885, 1562.9, false, false),
  fila("Q.UNT CLASICO", 12, null, 21020.17, 1751.681, 1752, false, false),
  fila("Q.UNT SALAME", 12, null, 21020.17, 1751.681, 1752, false, false),
  // Los tres por kilo CON los kilos impresos en el papel.
  fila("FOX SAL BAST", 2, 2.9, 47245.18, 16291.441, 16500, true, false),
  fila("FOX SAL PIC", 3, 2.1, 37633.23, 17920.586, 18000, true, false),
  fila("DANBO", 3, 11.685, 128751.11, 11018.495, 10120, true, false),
];

test("UN PRODUCTO POR KILO SE VALORIZA CON LOS KILOS DEL PAPEL", () => {
  const danbo = FILAS_DEL_PAPEL.find((f) => f.nombre === "DANBO");
  assert.equal(cuantoSeValoriza(danbo), 11.685, "se valorizó por piezas y no por kilos");
  // Y kilos × (subtotal ÷ kilos) es el subtotal del papel: la Factura del pie
  // da exactamente lo que el papel cobra, sin una segunda cuenta.
  assert.equal(alPeso(cuantoSeValoriza(danbo) * danbo.costoFactura), alPeso(danbo.subtotal));

  const manteca = FILAS_DEL_PAPEL.find((f) => f.nombre === "MANTECA");
  assert.equal(cuantoSeValoriza(manteca), 60, "un producto por pieza dejó de contarse por piezas");
});

test("SOLO QUEDA AFUERA EL QUE NO TIENE LOS KILOS", () => {
  const afuera = FILAS_DEL_PAPEL.filter((f) => motivoFueraDeLaCuenta(f));
  assert.equal(afuera.length, 1, "volvieron a quedar afuera los cuatro de fiambre");
  assert.equal(afuera[0].nombre, "BUTLER");
  assert.equal(motivoFueraDeLaCuenta(afuera[0]), "SIN_KILOS");
  // Los tres por kilo CON kilos entran, que es el cambio de esta tanda.
  for (const nombre of ["FOX SAL BAST", "FOX SAL PIC", "DANBO"]) {
    const f = FILAS_DEL_PAPEL.find((x) => x.nombre === nombre);
    assert.equal(motivoFueraDeLaCuenta(f), null, `${nombre} quedó afuera de la cuenta`);
  }
});

test("LA FACTURA DEL PEDIDO ES LA SUMA DE LOS SUBTOTALES DEL PAPEL", () => {
  const r = gananciaDelDeposito(FILAS_DEL_PAPEL);
  // Los diez que entran, sumados por el papel. El butler no está porque todavía
  // no se pesó.
  const esperado = FILAS_DEL_PAPEL.filter((f) => !f.faltanKilos).reduce((a, f) => a + f.subtotal, 0);
  assert.equal(alPeso(r.facturado), alPeso(esperado));
  // $763.388: los diez que entran. Es el papel ENTERO —$861.376,07— menos el
  // butler, que son $97.998,47 y todavía no se pesó. Y lleva adentro los $10
  // del yogur mal leído, que es correcto: la Factura dice lo que el papel dice,
  // y arreglar ese renglón es otra acción, con su propio bloque.
  assert.equal(alPeso(r.facturado), 763388, "la Factura dejó de dar la suma del papel");

  // ── Y ACÁ SE VE DE DÓNDE SALÍA EL $549.758,92 DE LA PANTALLA ─────────
  //
  // Es la suma de los OCHO renglones que no se miden en kilos. Los tres que sí
  // —los dos salames y el danbo, $213.629,52 entre los tres— estaban afuera de
  // la cuenta aunque el papel trajera sus kilos impresos, y por eso la Factura
  // mostraba doscientos mil pesos menos de lo que el proveedor cobra.
  const sinLosKilos = FILAS_DEL_PAPEL.filter((f) => !f.faltanKilos && !f.porKilo)
    .reduce((a, f) => a + f.subtotal, 0);
  assert.equal(Math.round(sinLosKilos * 100) / 100, 549758.09);
  assert.equal(alPeso(r.facturado - sinLosKilos), 213629);
  // Y lo que se veía en el celular era $549.758,92: casi doscientos mil menos,
  // porque los tres por kilo con kilos impresos estaban afuera.
  assert.notEqual(alPeso(r.facturado), 549759);
  assert.equal(r.enLaCuenta, 10);
  assert.equal(r.sinKilos, 1);
});

test("Y EL PIE DICE QUÉ FALTA, EN CASTELLANO Y SIN LA PALABRA FIAMBRE", () => {
  const r = gananciaDelDeposito(FILAS_DEL_PAPEL);
  const texto = textoDeLaCuenta(r);
  assert.match(texto, /productos en la cuenta/);
  assert.match(texto, /el papel no trae los kilos/);
  // "4 de fiambre" era falso: el papel traía los kilos de tres de esos cuatro.
  assert.ok(!/fiambre/i.test(texto), "volvió a hablar de fiambre");
  assert.ok(!/^4 |· 4 /.test(texto), "volvió a contar cuatro");
});

test("EL PAPEL DE MAURO NO SE MUEVE: SIN KILOS Y SIN DESCUENTO, TODO IGUAL", () => {
  // La contraprueba. El #232 no tiene ningún producto por kilo, así que nada de
  // esta tanda puede cambiarle un número.
  const MAURO = [
    fila("PHILIPS MORRIS", 80, null, 276825.6, 3460.32, 3500, false, false),
    fila("M.CRAFTED", 2, null, 81000, 40500, 41000, false, false),
  ];
  const r = gananciaDelDeposito(MAURO);
  assert.equal(r.enLaCuenta, 2);
  assert.equal(r.sinKilos, 0);
  assert.equal(alPeso(r.facturado), alPeso(80 * 3460.32 + 2 * 40500));
  assert.equal(cuantoSeValoriza(MAURO[0]), 80);
});

// ── Y LA BANDEJA NO PUEDE PEDIR UNA RELACIÓN QUE NO EXISTE ────────────────

test("EL TOTAL FACTURADO SALE DE UNA CONSULTA APARTE, NO DE UN include", () => {
  // ── ESTO SE DESPLEGÓ ROTO Y HUBO QUE VOLVER ATRÁS ───────────────────
  //
  // La primera versión pedía `comprobantes: { select: ... }` adentro del
  // `findMany` de `PedidoProveedor`. Compiló, la suite quedó en verde con 6771
  // candados, y contra Postgres devolvió "Unknown field `comprobantes` for
  // include statement": ese modelo NO tiene relación de Prisma hacia sus
  // comprobantes, `pedidoId` es un escalar pelado. La bandeja de recepción
  // quedó en "Error interno" en producción hasta el rollback.
  //
  // Es el incidente del 2026-08-12 con `productoLocal`, otra vez y en el mismo
  // módulo. Ni el build ni los candados puros miran los argumentos de Prisma:
  // la única defensa es ejercer la consulta contra la base, y esto es lo que
  // queda escrito para que la próxima persona no lo escriba de nuevo.
  const ruta = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "app/api/compras-proveedor/listar/route.js"
  );
  const codigo = fs.readFileSync(ruta, "utf8");
  const sinComentarios = codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  assert.ok(
    !/comprobantes\s*:/.test(sinComentarios),
    "la bandeja volvió a pedir `comprobantes` como si fuera una relación"
  );
  assert.match(sinComentarios, /comprobanteProveedor\.groupBy/);
  assert.match(sinComentarios, /_sum: \{ totalLeido: true \}/);
  // Y el estimado sale de la fórmula única, no de multiplicar en crudo.
  assert.match(sinComentarios, /totalPedido\(/);
  assert.ok(
    !/\.cantidad\) \|\| 0\) \* costo/.test(sinComentarios),
    "volvió a multiplicar cantidad por costo en crudo"
  );
});

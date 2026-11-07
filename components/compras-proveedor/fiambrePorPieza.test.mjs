// EL FIAMBRE QUE EL DEPÓSITO CUENTA POR PIEZA: SE LEE EN PIEZAS Y SE ESCRIBE
// EN KILOS.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/fiambrePorPieza.test.mjs
//
// ── EL INCIDENTE (2026-11-07, pedido 530) ─────────────────────────────────
//
// La factura de Das traía la Mortadela Paladini POR PIEZA: 3 piezas de 4,5 kg a
// $41.330,09. La hoja comparó pieza contra pieza (+3,3 %), Emanuel aceptó, y el
// cierre guardó $41.330,09 como precio del KILO: el costo pasó de $8.888,89 a
// $41.330,09 y la venta se arrastró ×4,6 en las cinco ubicaciones. El freno de
// ese día (que el cierre no tocara el costo de ningún fiambre por pieza) dejaba
// otro agujero: un fiambre que sube no actualizaba su costo.
//
// ── LAS REGLAS DE EMANUEL QUE ESTO DEFIENDE ────────────────────────────────
//
//   · La ficha manda: su peso por pieza es casi seguro. Lo que no se sabe es en
//     qué cobra el proveedor.
//   · Se prueban las lecturas —por pieza y por kilo— y gana la de MENOR % contra
//     el costo actual; solo se pregunta cuando ninguna gana clara.
//   · En el depósito manda cómo lo maneja el depósito (por pieza).
//   · La hoja dice con el número qué costo queda.
//   · Lo que se escribe se mueve lo mismo que lo que se vio.
//
// Los renglones son los reales de producción (consultados en solo lectura el
// 2026-11-07): comprobante 71 renglón 814 (Mortadela, Das), comprobante 65
// renglón 741 (Papas Congeladas, Paty), comprobante 61 renglón 699 (Minerva,
// Dyssa) y el renglón 747 (Maní con cáscara, Prod Nat). Las fichas, con sus
// campos reales; la variación normal de los tres proveedores es el 10 %.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import { aplanarDetalles } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { preguntaDeLectura } from "@/lib/compras-proveedor/comprobante/preguntaDeLectura";
import { costoMaestroDeLaLectura } from "@/lib/compras-proveedor/lecturaDelCierre";
import { textoDelCostoQueQueda } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { decisionDeCostoSugerida } from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import { hayDiferenciaDePrecio } from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import {
  costoDelCatalogoEnLaUnidadDelDeposito,
  costoDelDepositoEnLaUnidadDelCatalogo,
} from "@/lib/conversiones/stock";

// ── LAS FICHAS, CON SUS CAMPOS DE PRODUCCIÓN ──────────────────────────────

const MORTADELA = {
  id: 2099, nombre: "Mortadela Paladini", unidad_medida: "kg", modoCompraProveedor: "UNIDAD",
  modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 4.5, factor_pack: null, precio_costo: 8888.89,
};
const PAPAS = {
  id: 2105, nombre: "Papas Congeladas", unidad_medida: "kg", modoCompraProveedor: "UNIDAD",
  modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 2.5, factor_pack: null, precio_costo: 3800,
};
const MANI = {
  id: 2224, nombre: "MANI CASCARA 400G", unidad_medida: "kg", modoCompraProveedor: "UNIDAD",
  modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 0.4, factor_pack: null, precio_costo: 12500,
};
const MINERVA = {
  id: 1057, nombre: "MINERVA LIMON 250ML", unidad_medida: "pack", modoCompraProveedor: "BULTO",
  modoVentaDeposito: "PESO", pesoEsFijo: false, pesoReferenciaKg: null, factor_pack: 12, precio_costo: 17799.96,
};

// ── LOS RENGLONES, COMO LOS DEJÓ EL LECTOR ────────────────────────────────

const R_530 = { orden: 3, textoCrudo: "MORTADELA X 4.5 KG", cantidad: 3, subtotalImpreso: 99992.14, costoFinalRenglon: 123990.26 };
const R_PAPAS = { orden: 1, textoCrudo: "PAPAS FRITAS SADIA 4X2500GR", cantidad: 16, subtotalImpreso: 128439.48, costoFinalRenglon: 128439.48 };
const R_MANI = { orden: 2, textoCrudo: "PROD NAT MANI C/ CASCARA BOLSA X 4", cantidad: 8, subtotalImpreso: 18500, costoFinalRenglon: 18500 };
const R_MINERVA = { orden: 1, textoCrudo: "MINERVA LIMON 250MLX12", cantidad: 12, subtotalImpreso: 13960.8, costoFinalRenglon: 17800 };

/** La fila con las funciones de la pantalla: la línea del pedido, el análisis y la conciliación. */
function filaDe({ producto, renglon, unidadPedido = "UNIDAD", unidadElegida, decisionPrecio = null }) {
  const [det] = aplanarDetalles([
    { id: 7001, cantidad: renglon.cantidad, precioCosto: producto.precio_costo, unidad: unidadPedido, cantidadRecibida: renglon.cantidad, producto: { id: 70, baseId: producto.id, base: producto } },
  ]);
  const linea = { ...renglon, unidadElegida };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Proveedor" }, unidadElegida, variacionPct: 10 });
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 71, estado: "CARGADO", lineas: [{ ...linea, id: 814, pedidoDetalleId: 7001, productoLocalId: 70, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { fila: { ...f, variacionNormalPct: 10 }, precio };
}

const pct1 = (n) => Math.round(n * 10) / 10;
const hoja = (f) =>
  renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {} }))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
const sinComentarios = (ruta) =>
  fs
    .readFileSync(new URL(ruta, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ── 1. EL #530: GANA LA PIEZA, Y SE ESCRIBE EL KILO ───────────────────────

test("#530 MORTADELA: GANA LA PIEZA (+3,3 %); LEÍDA POR KILO (+365 %) PIERDE SOLA", () => {
  const { precio } = filaDe({ producto: MORTADELA, renglon: R_530 });
  assert.equal(precio.precioAEscribir, 41330.09, "el precio de una pieza");
  assert.ok(Math.abs(precio.costoAnterior - 40000.01) < 0.01, "contra la pieza del catálogo: 8.888,89 × 4,5");
  assert.equal(precio.unidad.requiereDecision, false);
  assert.equal(precio.unidad.lecturaDelFiambre, "POR_PIEZA");
  assert.deepEqual(
    precio.unidad.lecturasCandidatas.map((l) => [l.lectura, pct1(l.diferenciaPct)]),
    [["POR_PIEZA", 3.3], ["POR_KILO", 365]]
  );
  assert.match(precio.unidad.porque, /por pieza \(\+3,3 %\), por kilo \(\+365,0 %\)/);
});

test("#530 AL CERRAR: SE ESCRIBE $9.184,46 EL KILO, NO $41.330,09", () => {
  const { fila } = filaDe({ producto: MORTADELA, renglon: R_530 });
  const r = costoMaestroDeLaLectura({ filas: [fila], base: MORTADELA, aceptado: (p) => p === 41330.09 });
  assert.equal(r.costoMaestro, 9184.46, "$41.330,09 ÷ 4,5 kg");
  // Lo que se escribe se mueve lo mismo que lo que se vio: la guarda del cierre.
  const visto = fila.costoFactura / fila.costoMaestroHoy;
  const escrito = r.costoMaestro / MORTADELA.precio_costo;
  assert.ok(Math.abs(escrito / visto - 1) <= 0.01, `visto ${visto}, escrito ${escrito}`);
  assert.equal(pct1((escrito - 1) * 100), 3.3);
});

test("#530 AL ACEPTAR: LA LÍNEA DEL PEDIDO GUARDA EL KILO, Y LA IDA Y VUELTA DA LA PIEZA", () => {
  const kilo = costoDelDepositoEnLaUnidadDelCatalogo({ base: MORTADELA, costo: 41330.09 });
  assert.ok(Math.abs(kilo - 9184.4644) < 0.0001);
  // La línea del pedido guarda con 6 decimales: al volver a la pieza da lo mismo
  // que se aceptó, así que la hoja no vuelve a preguntar por dos centavos.
  assert.ok(Math.abs(costoDelCatalogoEnLaUnidadDelDeposito({ base: MORTADELA, costo: kilo }) - 41330.09) < 0.005);
  // Lo que no es de kilos pasa igual, en las dos direcciones.
  assert.equal(costoDelDepositoEnLaUnidadDelCatalogo({ base: MINERVA, costo: 17800 }), 17800);
  // Sin peso por pieza no es un fiambre de pieza fija: el depósito lo cuenta por
  // kilo, y la ida y la vuelta pasan igual —no se multiplica ni se divide por un
  // peso que no está—.
  const sinPeso = { ...MORTADELA, pesoReferenciaKg: null };
  assert.equal(costoDelDepositoEnLaUnidadDelCatalogo({ base: sinPeso, costo: 41330.09 }), 41330.09);
  assert.equal(costoDelCatalogoEnLaUnidadDelDeposito({ base: sinPeso, costo: 41330.09 }), 41330.09);
});

test("LA RUTA DE ACEPTAR ESCRIBE EN LA LÍNEA EL PRECIO EN LA UNIDAD DEL CATÁLOGO, Y DECIDE EN LA MISMA UNIDAD", () => {
  const ruta = sinComentarios("../../app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(ruta, /const enElCatalogo = costoDelDepositoEnLaUnidadDelCatalogo\(\{ base, costo: precioAEscribir \}\)/);
  assert.match(ruta, /costoParaUnidad\(\{ costoMaestro: enElCatalogo, unidad: detalle\.unidad, producto: base \}\)/);
  assert.match(ruta, /precioPropio: costoDelCatalogoEnLaUnidadDelDeposito\(\{ base, costo: detalle\.precioCosto \}\)/);
  assert.doesNotMatch(ruta, /costoParaUnidad\(\{ costoMaestro: precioAEscribir/, "la lectura cruda no va a la línea");
});

// ── 2. EL FIAMBRE QUE SUBE TOMA LA SUBA ───────────────────────────────────

test("LA SUBA DEL #530 ENTRA SOLA, Y LA HOJA DICE CON EL NÚMERO QUÉ QUEDA", () => {
  const { fila } = filaDe({ producto: MORTADELA, renglon: R_530 });
  assert.equal(hayDiferenciaDePrecio(fila), true, "se ofrece Aceptar / Dejar");
  assert.equal(textoDelCostoQueQueda(fila), "Queda $41.330,09 la pieza ($9.184,46 el kilo). El margen se recalcula.");
  const h = hoja(fila);
  assert.match(h, /Queda \$41\.330,09 la pieza \(\$9\.184,46 el kilo\)/);
  assert.match(h, /Tenías \$40\.000,01 \/ pieza/, "se compara en la unidad del depósito");
});

test("SI EL PROVEEDOR LA SUBE 20 %: GANA LA PIEZA, SE ESCRIBE $10.666,67 EL KILO Y PIDE QUE ALGUIEN LO ACEPTE", () => {
  const renglon = { ...R_530, subtotalImpreso: 144000, costoFinalRenglon: 144000 };
  const { fila, precio } = filaDe({ producto: MORTADELA, renglon });
  assert.equal(precio.precioAEscribir, 48000);
  assert.equal(precio.unidad.lecturaDelFiambre, "POR_PIEZA");
  const r = costoMaestroDeLaLectura({ filas: [fila], base: MORTADELA, aceptado: () => true });
  assert.equal(r.costoMaestro, 10666.67);
  // Fuera de la variación del proveedor: el cierre no lo escribe sin aceptarlo.
  assert.equal(decisionDeCostoSugerida({ papel: r.costoMaestro, tuyo: MORTADELA.precio_costo, variacionPct: 10 }).exigeElegir, true);
  assert.equal(textoDelCostoQueQueda(fila), "Queda $48.000,00 la pieza ($10.666,67 el kilo). El margen se recalcula.");
  // Sin aceptar no hay costo que escribir.
  assert.equal(costoMaestroDeLaLectura({ filas: [fila], base: MORTADELA, aceptado: () => false }), null);
});

// ── 3. BOLSA CONTRA BOLSA ─────────────────────────────────────────────────

test("PAPAS CONGELADAS (PATY, RENGLÓN 741): BOLSA CONTRA BOLSA GANA (−15,5 %) Y SE ESCRIBE EL KILO", () => {
  const { fila, precio } = filaDe({ producto: PAPAS, renglon: R_PAPAS });
  assert.equal(precio.precioAEscribir, 8027.47, "la bolsa de 2,5 kg");
  assert.deepEqual(
    precio.unidad.lecturasCandidatas.map((l) => [l.lectura, pct1(l.diferenciaPct)]),
    [["POR_PIEZA", -15.5], ["POR_KILO", 111.2]]
  );
  assert.equal(precio.unidad.requiereDecision, false, "la otra deja más del triple");
  const r = costoMaestroDeLaLectura({ filas: [fila], base: PAPAS, aceptado: () => true });
  assert.equal(r.costoMaestro, 3210.99, "$8.027,47 ÷ 2,5 kg");
});

// ── 4. EL PACK NO CAMBIA ──────────────────────────────────────────────────

test("MINERVA 250 ML × 12 (DYSSA, RENGLÓN 699): POR UNIDAD, SE ESCRIBE EL BULTO, COMO SIEMPRE", () => {
  const { fila, precio } = filaDe({ producto: MINERVA, renglon: R_MINERVA, unidadPedido: "BULTO" });
  assert.equal(precio.unidad.unidad, "POR_UNIDAD");
  assert.equal(precio.unidad.fiambrePorPieza, undefined, "un pack no pasa por la lectura del fiambre");
  assert.ok(Math.abs(precio.precioAEscribir - 17799.96) < 0.01, "12 × $1.483,33");
  const r = costoMaestroDeLaLectura({ filas: [fila], base: MINERVA, aceptado: () => true });
  assert.ok(Math.abs(r.costoMaestro - 17799.96) < 0.01);
  assert.match(textoDelCostoQueQueda(fila), /^Queda \$17\.799,96 \/ (pack|u)\./);
});

// ── 5. CUANDO NINGUNA GANA CLARA, SE PREGUNTA CON LOS NÚMEROS ──────────────

test("MANÍ CON CÁSCARA (RENGLÓN 747): NINGUNA GANA CLARA, SE PREGUNTA POR PIEZA O POR KILO, Y LO ELEGIDO MANDA", () => {
  const { fila, precio } = filaDe({ producto: MANI, renglon: R_MANI });
  assert.equal(precio.unidad.requiereDecision, true, "−53,8 % contra −81,5 %: ni dentro de la variación ni el triple");
  const p = preguntaDeLectura(fila);
  assert.deepEqual(
    p.opciones.map((o) => [o.valor, o.texto, o.cuenta]),
    [
      ["POR_BULTO", "Por pieza", "$2.312,50 la pieza · −53,8 % contra tu costo"],
      ["POR_UNIDAD", "Por kilo", "$925,00 la pieza · −81,5 % contra tu costo"],
    ]
  );
  // Elegido "Por pieza": entra el precio de la bolsa y se escribe el kilo.
  const elegido = filaDe({ producto: MANI, renglon: R_MANI, unidadElegida: "POR_BULTO" });
  assert.equal(elegido.precio.unidad.requiereDecision, false);
  assert.equal(elegido.precio.precioAEscribir, 2312.5);
  assert.equal(costoMaestroDeLaLectura({ filas: [elegido.fila], base: MANI, aceptado: () => true }).costoMaestro, 5781.25);
});

// ── 6. EL FRENO DEL INCIDENTE SE FUE, Y LA GUARDA QUEDÓ ───────────────────

test("EL CIERRE YA NO DEJA AFUERA A LOS FIAMBRES, Y FRENA SI LO ESCRITO NO SE MUEVE COMO LO VISTO", () => {
  const ruta = sinComentarios("../../app/api/compras-proveedor/recibir/[id]/route.js");
  assert.doesNotMatch(ruta, /const esFiambre\b|esFiambre\s*\?\s*false/, "el freno de los 64 productos se sacó");
  assert.match(ruta, /const escribeCosto = fronteraCostoActiva\s*\?\s*decision\.escribe/);
  assert.doesNotMatch(ruta, /FIAMBRE_POR_PIEZA/);
  assert.match(ruta, /const razonVista = visto > 0 && precioVisto > 0 \? precioVisto \/ visto : null;/);
  assert.match(ruta, /Math\.abs\(razonEscrita \/ razonVista - 1\) > 0\.01/);
  assert.match(ruta, /throw new ErrorParaLaPersona\(/);
});

test("EL CIERRE ESCRIBE EL PRECIO DE LA LECTURA LLEVADO A LA UNIDAD DEL CATÁLOGO", () => {
  const modulo = sinComentarios("../../lib/compras-proveedor/lecturaDelCierre.js");
  assert.match(modulo, /const enElCatalogo = costoDelDepositoEnLaUnidadDelCatalogo\(\{ base, costo: precio \}\);/);
  assert.match(modulo, /precioCosto: enElCatalogo,/);
});

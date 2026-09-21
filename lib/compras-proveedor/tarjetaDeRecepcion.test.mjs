// LA TARJETA COMPARA EN LA MISMA UNIDAD, O NO COMPARA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/tarjetaDeRecepcion.test.mjs
//
// ── EL CASO, MEDIDO CONTRA PRODUCCIÓN ─────────────────────────────────────
//
// Papas Congeladas en el #242: el papel cobra $97.998,47 por 12 bolsas, o sea
// $8.166,54 la bolsa. El catálogo guarda $3.800 **por kilo**, y la bolsa pesa
// 2,5 kg. La tarjeta ponía los dos números uno al lado del otro y mostraba
// "+114,9 %", como si el proveedor hubiera aumentado más del doble.
//
// En la misma unidad, la bolsa del catálogo vale $9.500, así que el proveedor
// cobra MENOS: el depósito gana 14,0 %. El signo estaba dado vuelta y la
// magnitud era inventada.
//
// Son 40 productos activos en esa situación y 17 ya pedidos, en 14 pedidos.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renglonesDeLaTarjeta,
  unidadDeComparacion,
  textoDeLaCantidad,
  textoDelPorcentaje,
} from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { costoDelCatalogoEnLaUnidadDelDeposito } from "@/lib/conversiones/stock";

/** El producto real, como está en el catálogo de producción. */
const PAPAS = {
  unidad_medida: "kg",
  modoVentaDeposito: "PIEZA",
  pesoEsFijo: true,
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 2.5,
  precio_costo: 3800,
};

/** La fila del #242, con el costo del ERP YA convertido, como llega hoy. */
const FILA_PAPAS = {
  producto: "Papas Congeladas",
  cantidad: 12,
  cantidadPedida: 12,
  unidadPedido: "BULTO",
  factorPack: null,
  porKilo: false,
  subtotal: 97998.47,
  costoFactura: 97998.47 / 12,
  costoCatalogo: costoDelCatalogoEnLaUnidadDelDeposito({ base: PAPAS, costo: 3800 }),
};

const alCentavo = (n) => Math.round(Number(n) * 100) / 100;

test("EL COSTO DEL ERP LLEGA EN LA UNIDAD DEL DEPÓSITO", () => {
  // 3.800 el kilo × 2,5 kg por bolsa = 9.500 la bolsa.
  assert.equal(costoDelCatalogoEnLaUnidadDelDeposito({ base: PAPAS, costo: 3800 }), 9500);
  // Y un producto que el depósito SÍ cuenta por kilo no se toca.
  const danbo = { unidad_medida: "kg", modoVentaDeposito: "PESO", pesoReferenciaKg: 4.1 };
  assert.equal(costoDelCatalogoEnLaUnidadDelDeposito({ base: danbo, costo: 10120 }), 10120);
  // Ni uno que no se mide en kilos.
  const pack = { unidad_medida: "pack", factor_pack: 30 };
  assert.equal(costoDelCatalogoEnLaUnidadDelDeposito({ base: pack, costo: 61703 }), 61703);
  // Sin peso de referencia el producto NO es de pieza para el ERP —le falta
  // una de las tres condiciones— así que el depósito lo cuenta por kilo y el
  // costo del catálogo ya está en su unidad. No hay nada que convertir.
  const sinPeso = { unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: null };
  assert.equal(costoDelCatalogoEnLaUnidadDelDeposito({ base: sinPeso, costo: 3800 }), 3800);
});

test("LAS PAPAS: EL DEPÓSITO GANA 14 %, NO PIERDE 114,9 %", () => {
  const r = renglonesDeLaTarjeta(FILA_PAPAS);
  assert.equal(alCentavo(r.papel.importe), 8166.54);
  assert.equal(alCentavo(r.erp.importe), 9500);
  // Los dos con la MISMA unidad al lado, que es lo que hace la comparación
  // legible: "$8.166,54 / u" contra "$9.500,00 / u".
  assert.equal(r.papel.unidad, r.erp.unidad);
  // El porcentaje va sobre el ERP: (9.500 − 8.166,54) / 9.500.
  assert.equal(Math.round(r.erp.pct * 10) / 10, 14);
  assert.equal(r.erp.texto, "+14,0 %");
  assert.equal(r.erp.gana, true, "el depósito gana y la tarjeta tiene que decirlo en verde");

  // CONTRAPRUEBA: lo que se veía antes, comparando contra el costo POR KILO.
  const comoSeVeiaAntes = { ...FILA_PAPAS, costoCatalogo: 3800 };
  const viejo = renglonesDeLaTarjeta(comoSeVeiaAntes);
  assert.equal(Math.round(((8166.54 - 3800) / 3800) * 1000) / 10, 114.9);
  assert.equal(viejo.erp.gana, false, "con las escalas mezcladas parecía una pérdida");
});

test("EL PORCENTAJE SE ESCRIBE CON SIGNO Y COMA, Y EN VERDE O NARANJA", () => {
  assert.equal(textoDelPorcentaje(14.04), "+14,0 %");
  assert.equal(textoDelPorcentaje(-3.24), "−3,2 %");
  assert.equal(textoDelPorcentaje(0), "+0,0 %");
  assert.equal(textoDelPorcentaje(null), null);
  // El menos es el SIGNO MENOS de verdad, no un guión de teclado.
  assert.ok(textoDelPorcentaje(-1).startsWith("−"));

  // Naranja cuando el proveedor cobra más que el precio interno.
  const caro = renglonesDeLaTarjeta({ ...FILA_PAPAS, costoFactura: 11000, costoCatalogo: 9500 });
  assert.equal(caro.erp.gana, false);
  assert.match(caro.erp.texto, /^−/);
});

test("SIN ERP COMPARABLE, SOLO LA LÍNEA DEL PAPEL", () => {
  // Un renglón sin vincular no tiene producto, y uno sin costo cargado no tiene
  // contra qué. En los dos casos se muestra el Papel solo: una comparación
  // contra nada es peor que ninguna.
  const sinVincular = { ...FILA_PAPAS, costoCatalogo: null };
  assert.equal(renglonesDeLaTarjeta(sinVincular).erp, null);
  assert.ok(renglonesDeLaTarjeta(sinVincular).papel);

  const sinPrecioDelPapel = { ...FILA_PAPAS, costoFactura: null };
  assert.equal(renglonesDeLaTarjeta(sinPrecioDelPapel).papel, null);
  assert.equal(renglonesDeLaTarjeta(sinPrecioDelPapel).erp, null, "sin papel no hay con qué comparar");
});

test("LA CANTIDAD VA EN LA ESCALA DEL PEDIDO", () => {
  assert.equal(textoDeLaCantidad(FILA_PAPAS), "12 u");

  // ── LA UNIDAD DE LA CANTIDAD NO ES LA DE LOS PRECIOS ────────────────
  //
  // Los dos rótulos falsos que se midieron en el #242 antes de arreglarlo.
  //
  // El Salametro se costea POR KILO —sus precios dicen "/ kg"— y su cantidad
  // son 2 PIEZAS, que pesan 2,9 kg. Decir "2 kg" afirmaba un peso que no es.
  const salametro = {
    cantidad: 2, cantidadPedida: 2, unidadPedido: "UNIDAD", factorPack: null, porKilo: true,
  };
  assert.equal(textoDeLaCantidad(salametro), "2 u");
  assert.equal(unidadDeComparacion(salametro), "kg", "los PRECIOS sí van por kilo");

  // Y la hamburguesa: la cantidad ya viene convertida a 3 bultos por el
  // veredicto, así que el rótulo tiene que decir PACK aunque la línea del
  // pedido esté en UNIDAD.
  const hamburguesa = {
    cantidad: 90, cantidadPedida: 3, unidadPedido: "UNIDAD", factorPack: 30, porKilo: false,
    unidad: { unidad: "POR_BULTO", requiereDecision: false, lecturas: { porBulto: { bultos: 3 } } },
  };
  assert.equal(textoDeLaCantidad(hamburguesa), "3 PACK x30");
  // Un pedido por bulto dice el pack y cuántas trae.
  const enPacks = { ...FILA_PAPAS, cantidad: 90, cantidadPedida: 3, unidadPedido: "BULTO", factorPack: 30, unidad: { unidad: "POR_BULTO", lecturas: { porBulto: { bultos: 3 } }, requiereDecision: false } };
  assert.equal(textoDeLaCantidad(enPacks), "3 PACK x30");
  // Y un producto por kilo se dice en kilos.
  assert.equal(unidadDeComparacion({ porKilo: true }), "kg");
  // "pack" solo cuando el bulto existe de verdad: las papas se piden en BULTO
  // y no tienen factor, así que su unidad es la bolsa y se dice "u".
  assert.equal(unidadDeComparacion({ porKilo: false, unidadPedido: "BULTO", factorPack: 30 }), "pack");
  assert.equal(unidadDeComparacion({ porKilo: false, unidadPedido: "BULTO", factorPack: null }), "u");
  assert.equal(unidadDeComparacion({ porKilo: false, unidadPedido: "UNIDAD" }), "u");
});

test("EL DANBO SIGUE COMPARANDO POR KILO, QUE ES LO QUE NO HAY QUE ROMPER", () => {
  // 128.751,11 ÷ 11,685 kg = 11.018,49 el kilo, contra 10.120 del catálogo, que
  // ya está por kilo. Acá no se convierte nada y el proveedor cobra más.
  const fila = {
    producto: "BARRA TREMBLAY",
    cantidad: 3,
    cantidadPedida: 3,
    unidadPedido: "UNIDAD",
    porKilo: true,
    subtotal: 128751.11,
    costoFactura: 128751.11 / 11.685,
    costoCatalogo: 10120,
  };
  const r = renglonesDeLaTarjeta(fila);
  assert.equal(alCentavo(r.papel.importe), 11018.49);
  assert.equal(r.papel.unidad, "kg");
  assert.equal(r.erp.unidad, "kg");
  assert.equal(r.erp.gana, false, "el proveedor cobra más que el precio interno");
  assert.match(r.erp.texto, /^−8,9 %$/);
});

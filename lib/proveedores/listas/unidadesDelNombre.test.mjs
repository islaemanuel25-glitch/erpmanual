// LAS UNIDADES QUE DICE EL NOMBRE MANDAN SOBRE EL "POR CAJA" DE LA LISTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/unidadesDelNombre.test.mjs
//
// Mr Pop de Arcor (2026-11-18): "Crear con los datos de la lista" propuso pack
// de 10 para "MR POP EXPLOSIVE FRUTILLA 20u x 10", que es una caja de 20 (el 10
// son las cajas del bulto). La regla de Emanuel: "NNu x M" → NN; "NNxGG" con
// gramos → NN; el precio de la lista se toma por esa caja; si el "por caja"
// guardado contradice al nombre, manda el nombre.
//
// Datos reales de producción, leídos el 2026-11-17: los renglones 5442, 5422,
// 5423, 5430, 5431, 5451 y 4749 de la importación 6 de Arcor (recargo 5 %), el
// renglón 1094 del pedido 654 y el renglón del Groomen de la importación 28.

import { test } from "node:test";
import assert from "node:assert/strict";

import { presentacionDeDescripcion, unidadesPorCajasEnNombre, unidadesPorPacksEnNombre } from "./presentacionDescripcion.js";
import { cantidadPorCajaEnNombre } from "./lectura/numeroDeLista.js";
import { bultoDeLaFila, precargaDelAltaDesdeLaLista } from "./altaDesdeLaLista.js";
import {
  PRECIO_ES,
  costoDelAltaDesdeLaLista,
  detalleDelRenglonDeLaLista,
  lecturaRecordadaDelAlta,
  preguntaDelPrecioDeLaLista,
} from "./costoDelAltaDesdeLaLista.js";
import { precargaDelAlta } from "@/lib/compras-proveedor/altaDesdeElPapel";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";

const fila = (id, codigo, descripcion, unidadesPorBulto, precioConIva) => ({
  id, codigoCrudo: codigo, codigoNormalizado: codigo, descripcionProveedor: descripcion,
  codigoBarraProveedor: null, precioConIva, unidadesPorBulto, costoMaestroPropuesto: null, costoUnitarioCalculado: null,
});
const MR_POP = fila(5442, "15117", "MR POP EXPLOSIVE FRUTILLA 20u x 10G", 10, 11601.857036);
const TOP_LINE_MENTA = fila(5422, "14230", "TABL. TOP LINE MENTA 20x6,7G", 24, 7162.658404);
const TOP_LINE_STRONG = fila(5423, "15052", "TABL. TOP LINE STRONG 20X6.7G", 24, 7162.654653);
const TOPLINE7_MANDARINA = fila(5430, "15518", "TOPLINE 7 MANDARINA 16x24g", 20, 12445.359289);
const TOPLINE7_STRAWBERRY = fila(5431, "15519", "TOPLINE 7 STRAWBERRY 16x24g", 20, 12445.359289);
const MENTHO_MIEL = fila(5451, "10131", "MENTHO PLUS MIEL 12u x 29,4g", 12, 5735.761911);
const AZUCAR = fila(4749, "12753", "AZUCAR ARCOR  x 1kg", 10, 1188.616275);
const CUENTA = { recargoPct: 5, impuestoAdicionalPct: 0 };

test("el nombre dice las unidades: 20u x 10 son 20, con o sin gramos, y con o sin espacio", () => {
  assert.equal(presentacionDeDescripcion("MR POP EXPLOSIVE FRUTILLA 20u x 10G").cantidad, 20);
  for (const t of ["MR POP EXPLOSIVE FRUTILLA 20u x 10", "MR POP EXPLOSIVE FRUTILLA 20 u x 10", "MR POP EXPLOSIVE FRUTILLA 20U X 10"]) {
    const p = presentacionDeDescripcion(t);
    assert.equal(p.cantidad, 20, t);
    assert.equal(p.origen, "UNIDADES_POR_CAJAS", t);
    assert.equal(unidadesPorCajasEnNombre(t), 20, t);
  }
  // NNxGG con gramos: el primero.
  assert.equal(presentacionDeDescripcion(TOP_LINE_MENTA.descripcionProveedor).cantidad, 20);
  assert.equal(presentacionDeDescripcion(TOP_LINE_STRONG.descripcionProveedor).cantidad, 20);
  assert.equal(presentacionDeDescripcion("TABL. TOP LINE 7 MANDARINA 16x14g").cantidad, 16);
  assert.equal(presentacionDeDescripcion(TOPLINE7_MANDARINA.descripcionProveedor).cantidad, 16);
  assert.equal(presentacionDeDescripcion(MENTHO_MIEL.descripcionProveedor).cantidad, 12);
  // Con peso atrás no es "cajas por bulto": "20u x 10G" lo lee la forma del peso.
  assert.equal(unidadesPorCajasEnNombre("MR POP EXPLOSIVE FRUTILLA 20u x 10G"), null);
  // Sin la "u" no se sabe cuál es la cantidad: no es esta forma.
  assert.equal(unidadesPorCajasEnNombre("AGUA BAGGIO VIDA MANZANA 6 X 1500"), null);
});

test("el alta desde la lista propone el pack del nombre aunque la lista guarde otro «por caja»", () => {
  assert.equal(bultoDeLaFila(MR_POP), 20, "10 guardado, 20u en el nombre");
  assert.equal(bultoDeLaFila(TOP_LINE_MENTA), 20, "24 guardado, 20x6,7G en el nombre");
  assert.equal(bultoDeLaFila(TOP_LINE_STRONG), 20);
  assert.equal(bultoDeLaFila(TOPLINE7_MANDARINA), 16, "20 guardado, 16x24g en el nombre");
  assert.equal(bultoDeLaFila(TOPLINE7_STRAWBERRY), 16);
  assert.equal(bultoDeLaFila(MENTHO_MIEL), 12, "los dos dicen 12");
  // Sin unidades en el nombre —un envase por peso— queda el guardado.
  assert.equal(bultoDeLaFila(AZUCAR), 10);
  // Solo las dos formas decididas. Renglones reales de la lista 15 de Dab: el
  // 44 de la cerveza es la marca y va con mililitros; "X 50U" no es "NNu x M".
  assert.equal(bultoDeLaFila(fila(7328, "7328", "CERVEZA SMITH 44 X473ML", 6, 1)), 6);
  assert.equal(bultoDeLaFila(fila(4259, "4259", "TUY CLASICO X 50U", 10, 1)), 10);
  assert.equal(bultoDeLaFila(fila(809, "809", "ROLLO COCINA CARTABELLA X 3U", 10, 1)), 10);
  // Y con gramos sí, en cualquier lista: "CHOC FELFORT JACK MAFALDA 20 X 14GR".
  assert.equal(bultoDeLaFila(fila(7550, "7550", "CHOC FELFORT JACK MAFALDA 20 X 14GR", 10, 1)), 20);
  assert.equal(precargaDelAltaDesdeLaLista({ fila: MR_POP, proveedorId: 20 }).factor_pack, 20);
  assert.equal(precargaDelAltaDesdeLaLista({ fila: TOP_LINE_MENTA, proveedorId: 20 }).factor_pack, 20);
});

test("un paquete múltiple que se vende entero (NN menor que 6) se queda con el «por caja» de la lista", () => {
  // Renglones reales: Traviata y Serranas de la lista 6 de Arcor; Neosol y los
  // jabones de la lista 15 de Dab. El 3 es el paquete; la caja es la de la lista.
  assert.equal(bultoDeLaFila(fila(null, "14408", "TRAVIATA 3x108g", 16, 1)), 16);
  assert.equal(bultoDeLaFila(fila(null, "7049", "SERRANAS SANDWICH 3 X 112 GRS", 16, 1)), 16);
  assert.equal(bultoDeLaFila(fila(6307, "6307", "GALLETITAS DULCES NEOSOL 3U X 360GRS", 16, 1)), 16);
  assert.equal(bultoDeLaFila(fila(6306, "6306", "SANDWCHERA NEOSOL 3U X 330GRS", 15, 1)), 15);
  assert.equal(bultoDeLaFila(fila(7379, "7379", "JABON ALGABO CREAM 3 X 80G", 60, 1)), 60);
  assert.equal(bultoDeLaFila(fila(2545, "2545", "JABON KENIA COLOR MIX 3U X 80G", 32, 1)), 32);
  // Desde 6, manda el nombre: POXI-RAN "6U X 23GR" con 20 guardado.
  assert.equal(bultoDeLaFila(fila(7938, "7938", "POXI-RAN SIN TOLUENO 6U X 23GR", 20, 1)), 6);
  // Los de Arcor siguen dando lo mismo.
  assert.deepEqual([MR_POP, TOP_LINE_MENTA, TOP_LINE_STRONG, TOPLINE7_MANDARINA, TOPLINE7_STRAWBERRY, MENTHO_MIEL].map(bultoDeLaFila), [20, 20, 20, 16, 16, 12]);
  // Y el alta de Traviata precarga pack de 16.
  assert.equal(precargaDelAltaDesdeLaLista({ fila: fila(null, "14408", "TRAVIATA 3x108g", 16, 1), proveedorId: 20 }).factor_pack, 16);
});

test("el precio de la lista se toma por la caja del nombre", () => {
  const p = preguntaDelPrecioDeLaLista(MR_POP, CUENTA);
  assert.equal(p.cantidad, 20);
  assert.equal(p.opciones[0].texto, "Por la caja de 20");
  // 11.601,86 + 5 %: la caja de 20; por unidad, × 20.
  assert.equal(costoDelAltaDesdeLaLista({ fila: MR_POP, ...CUENTA, precioEs: PRECIO_ES.CAJA }), 12181.95);
  assert.equal(costoDelAltaDesdeLaLista({ fila: MR_POP, ...CUENTA, precioEs: PRECIO_ES.UNIDAD }), 243639);
  assert.equal(detalleDelRenglonDeLaLista(MR_POP), "Código 15117 · 20 por caja · $ 11.601,86");
  assert.deepEqual(lecturaRecordadaDelAlta({ fila: MR_POP, precioEs: PRECIO_ES.UNIDAD }), { clave: "PACK_20", multiplicador: 20, cantidad: null });
});

test("y el alta desde el papel lee igual el renglón del Mr Pop: 20, no 10", () => {
  assert.equal(cantidadPorCajaEnNombre("MR POP EXPLOSIVE FRUTILLA 20u x 10"), 20);
  assert.equal(cantidadPorCajaEnNombre("GROOMEN 500 DESCARTABLE TIRA 12u X12"), 12);
  // Lo que ya leía no cambia.
  assert.equal(cantidadPorCajaEnNombre("CREMA VERONA XCAJA 20"), 20);
  assert.equal(cantidadPorCajaEnNombre("HELLMANNS MAY LIVIANA DP 24X237G"), 24);
  // El renglón 1094 del pedido 654, como llega a la hoja.
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 97, estado: "CARGADO", lineas: [{
      id: 1094, orden: 1, textoCrudo: "MR POP EXPLOSIVE FRUTILLA 20u x 10", codigoProveedor: "15117", cantidad: 3,
      netoUnitario: 5397.184, subtotalImpreso: 16191.87, costoFinalRenglon: 16191.87, enQueViene: "DI",
      productoLocalId: null, pedidoDetalleId: null, precio: null, unidad: null, candidatos: [], origen: "SIN_CANDIDATOS",
    }] }],
    detalles: [],
  }).grupos[0].filas;
  const p = precargaDelAlta({ fila: f, proveedorId: 20 });
  assert.equal(p.unidad_medida, "pack");
  assert.equal(p.factor_pack, 20);
});

// ── "AxB" SIN PESO NI VOLUMEN, FUERA DE LAS LATAS (2026-11-18) ────────────
//
// Nombres reales de papeles y de las listas guardadas. Con un 1 en el par, el
// otro número es la caja. Con los dos mayores que 1, A×B daba disparates en
// 280 renglones medidos —el segundo es el contenido de cada unidad— y queda la
// regla de siempre. Las latas tienen la suya (`lib/productos/packDeLata.test.mjs`).
test("AxB con un 1: el otro número es la caja, en el papel y en la lista", () => {
  assert.equal(unidadesPorPacksEnNombre("COCA-COLA 500ML BT PET C N 1X12"), 12);
  assert.equal(unidadesPorPacksEnNombre("LAYS JAMON SERRANO 77GX25X1"), 25);
  assert.equal(unidadesPorPacksEnNombre("CIF PANO MULTIUSO ANTIBAC 24X1UN"), 24);
  assert.equal(cantidadPorCajaEnNombre("COCA-COLA 500ML BT PET C N 1X12"), 12);
  assert.equal(cantidadPorCajaEnNombre("Coca-Cola RED RET 2.5L 1x8"), 8);
  assert.equal(bultoDeLaFila(fila(null, "13020", "CIF PANO MULTIUSO ANTIBAC 24X1UN", null, 1)), 24);
});

test("AxB con los dos mayores que 1, fuera de las latas: la regla de siempre", () => {
  for (const t of ["REXONA AP ROLLON MEN V8 12X50", "TOALLA FEMENINA KOTEX ESENCIAL 48X8", "KNORR CDO CARNE EST 80X12 UNID", "MOGUL MAX EXTRE. TUBI. TUTTI 24x25"]) {
    assert.equal(unidadesPorPacksEnNombre(t), null, t);
  }
  assert.equal(cantidadPorCajaEnNombre("MOGUL MAX EXTRE. TUBI. TUTTI 24x25"), 24, "no 600");
  assert.equal(cantidadPorCajaEnNombre("CHEDDAR 18 X 8 FETAS TONADITA"), 8, "no 144");
  assert.equal(bultoDeLaFila(fila(null, "13323", "REXONA AP ROLLON MEN INVISIBLE 12X50", 12, 1)), 12, "no 600");
  // Litros, kilos y un tamaño pegado a una letra no son "AxB".
  assert.equal(unidadesPorPacksEnNombre("CUNNINGTON COLA CLASSIC 4X3LT"), null);
  assert.equal(cantidadPorCajaEnNombre("CUNNINGTON COLA CLASSIC 4X3LT"), 4);
  assert.equal(unidadesPorPacksEnNombre("ARROZ TRIMACER ROJO GRANDE 10X1KILO"), null);
  assert.equal(unidadesPorPacksEnNombre("Kinder Bueno Negro T2 x1"), null);
  // Y el triple sigue siendo el primero.
  assert.equal(unidadesPorPacksEnNombre("MOGUL. BANANITAS 12X12X30G"), null);
});

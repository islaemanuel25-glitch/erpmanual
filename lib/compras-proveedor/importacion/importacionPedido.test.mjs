import test from "node:test";
import assert from "node:assert/strict";

import { proponerCantidadPedido } from "./cantidad.js";
import { extraerFilasExcel } from "./excelFilas.js";
import { sumarCantidadesImportadas, costoParaUnidad, baseDeProducto } from "./merge.js";
import { prepararLineasImportadas } from "./prepararLineas.js";
import { naturalezaLinea, permiteToggleUnidad } from "../calculoPedido.js";

const pack = { factor_pack: 21, modoCompra: "BULTO", unidad_medida: "unidad" };
// Fiambre: se compra por pieza y su costo está por kilo. `factor_pack` existe y
// NO entra en el dinero — es la diferencia con el pack.
const fiambre = { factor_pack: 6, modoCompra: "UNIDAD", unidad_medida: "kg", pesoReferenciaKg: 2.5 };
const porKilo = { factor_pack: 1, modoCompra: "BULTO", unidad_medida: "kg" };

test("convierte unidades a bultos solamente cuando la equivalencia es exacta", () => {
  assert.deepEqual(proponerCantidadPedido({ cantidad: 42, unidadFuente: "UN", producto: pack }), {
    cantidad: 2,
    unidad: "BULTO",
    requiereRevision: false,
    motivo: null,
    equivalencia: "42 un = 2 bultos de 21",
  });
});

test("una equivalencia no exacta se conserva en unidades y exige revisión", () => {
  const resultado = proponerCantidadPedido({ cantidad: 40, unidadFuente: "UN", producto: pack });
  assert.equal(resultado.cantidad, 40);
  assert.equal(resultado.unidad, "UNIDAD");
  assert.equal(resultado.requiereRevision, true);
  assert.match(resultado.motivo, /no equivalen/i);
});

test("DI y una unidad ausente nunca se interpretan automáticamente", () => {
  assert.equal(proponerCantidadPedido({ cantidad: 21, unidadFuente: "DI", producto: pack }).requiereRevision, true);
  assert.equal(proponerCantidadPedido({ cantidad: 21, unidadFuente: null, producto: pack }).requiereRevision, true);
});

test("el Excel genérico encuentra encabezados y conserva código, cantidad y unidad", () => {
  const resultado = extraerFilasExcel([
    ["Pedido de prueba"],
    ["ARTÍCULO", "CANTIDAD", "DESCRIPCIÓN", "PRECIO UNIT."],
    [6596, "42 UN", "ALF. COFLER BLOCK X60G", 909.037],
    ["", "", "TOTAL", 1234],
  ]);
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.documento.lineas, [
    {
      filaOrigen: 3,
      codigo: "6596",
      descripcion: "ALF. COFLER BLOCK X60G",
      cantidad: 42,
      unidad: "UN",
      precioUnitario: 909.037,
    },
  ]);
});

test("solo el código o alias exacto vincula automáticamente", () => {
  const productos = [
    {
      productoLocalId: 7,
      baseId: 70,
      nombre: "Alfajor Cofler Block 60g",
      codigoInterno: "006596",
      codigosInternos: ["006596"],
      aliasesProveedor: [{ codigoInterno: "006596", descripcionProveedor: "ALF COFLER BLOCK" }],
      factor_pack: 21,
      modoCompra: "BULTO",
      unidad_medida: "unidad",
    },
  ];
  const [exacta, parecida] = prepararLineasImportadas({
    productos,
    lineas: [
      { codigo: "006596", descripcion: "texto distinto", cantidad: 42, unidad: "UN" },
      { codigo: null, descripcion: "Alfajor Cofler Block 60 gramos", cantidad: 42, unidad: "UN" },
    ],
  });
  assert.equal(exacta.productoLocalId, "7");
  assert.equal(exacta.confirmada, true);
  assert.equal(exacta.cantidadPedido, 2);
  assert.equal(parecida.productoLocalId, "");
  assert.equal(parecida.confirmada, false);
  assert.deepEqual(parecida.candidatos, [7]);
});

// ── EL CONTRATO DE `sumarCantidadesImportadas` CAMBIÓ A PROPÓSITO ──────────
//
// Antes devolvía solo { cantidad, unidad } y este candado lo afirmaba con un
// deepEqual. Devolver la cantidad sin el costo es lo que dejó pasar el defecto:
// la ruta escribía las dos primeras y el costo se quedaba en la escala vieja.
// Ahora las tres viajan juntas y el candado las mira juntas.
test("al continuar un borrador combina bultos y unidades sin perder cantidad NI escala de costo", () => {
  assert.deepEqual(
    sumarCantidadesImportadas({
      actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2100 },
      importada: { cantidad: 5, unidad: "UNIDAD" },
      factorPack: 21,
      producto: pack,
      costoMaestro: 2100,
    }),
    { cantidad: 47, unidad: "UNIDAD", unidadCambio: true, precioCosto: 100 }
  );
  assert.deepEqual(
    sumarCantidadesImportadas({
      actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2100 },
      importada: { cantidad: 42, unidad: "UNIDAD" },
      factorPack: 21,
      producto: pack,
      costoMaestro: 2100,
    }),
    { cantidad: 4, unidad: "BULTO", unidadCambio: false, precioCosto: 2100 }
  );
});

test("ECONOMÍA 1. 40 UN de un PACK de 21 valen 4.000, no 84.000", () => {
  // El caso que abrió la revisión: 40 no es múltiplo de 21, así que la línea se
  // queda en UNIDAD, y ahí el costo del bulto NO es el costo de la línea.
  const propuesta = proponerCantidadPedido({ cantidad: 40, unidadFuente: "UN", producto: pack });
  assert.equal(propuesta.cantidad, 40);
  assert.equal(propuesta.unidad, "UNIDAD");

  const costo = costoParaUnidad({ costoMaestro: 2100, unidad: propuesta.unidad, producto: pack });
  assert.equal(costo, 100, "el costo unitario de un bulto de 21 a 2.100 es 100");
  assert.equal(propuesta.cantidad * costo, 4000, "40 unidades a 100 son 4.000");
});

test("ECONOMÍA 2. 42 UN exactas son 2 BULTO a 2.100 y valen 4.200", () => {
  const propuesta = proponerCantidadPedido({ cantidad: 42, unidadFuente: "UN", producto: pack });
  assert.equal(propuesta.cantidad, 2);
  assert.equal(propuesta.unidad, "BULTO");

  const costo = costoParaUnidad({ costoMaestro: 2100, unidad: propuesta.unidad, producto: pack });
  assert.equal(costo, 2100, "en BULTO el costo maestro no se toca");
  assert.equal(propuesta.cantidad * costo, 4200);
});

test("ECONOMÍA 3. 2 BULTO existentes + 5 UN importadas son 47 UNIDAD a 100 y valen 4.700", () => {
  const suma = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2100 },
    importada: { cantidad: 5, unidad: "UNIDAD" },
    factorPack: 21,
    producto: pack,
    costoMaestro: 2100,
  });
  assert.equal(suma.cantidad, 47);
  assert.equal(suma.unidad, "UNIDAD");
  assert.equal(suma.precioCosto, 100);
  assert.equal(suma.cantidad * suma.precioCosto, 4700, "47 unidades a 100 son 4.700");

  // Y lo que este candado impide, dicho como número: con el costo del bulto la
  // misma línea valdría veintiún veces más.
  assert.equal(suma.cantidad * 2100, 98700);
});

test("CONTRAPRUEBA. dejar el costo del bulto como unitario tiene que dar rojo", () => {
  // Ésta es la afirmación que separa un candado que defiende de uno que
  // acompaña: se calcula el costo COMO LO HACÍA EL CÓDIGO VIEJO —el maestro sin
  // mirar la unidad— y se comprueba que la comparación contra el correcto falla.
  const costoViejo = 2100; // lo que conservaba la ruta
  const costoCorrecto = costoParaUnidad({ costoMaestro: 2100, unidad: "UNIDAD", producto: pack });
  assert.notEqual(costoViejo, costoCorrecto, "si estos dos son iguales, la conversión no está ocurriendo");
  assert.throws(
    () => assert.equal(47 * costoViejo, 4700),
    "47 × 2.100 no puede dar 4.700: si esto no lanza, el candado no está midiendo nada"
  );
});

test("el fiambre y el kg no cambian de costo con el factor", () => {
  // `factor_pack` no entra en el dinero de estos productos, y por eso el costo
  // maestro es el costo de la línea aunque quede en UNIDAD.
  assert.equal(costoParaUnidad({ costoMaestro: 8000, unidad: "UNIDAD", producto: fiambre }), 8000);
  assert.equal(costoParaUnidad({ costoMaestro: 5400, unidad: "UNIDAD", producto: porKilo }), 5400);
});

test("KG DE FIAMBRE. 10 KG nunca se confirman solos ni se vuelven bultos", () => {
  // ── EL DEFECTO ────────────────────────────────────────────────────────────
  //
  // Devolvía "10 BULTO, requiereRevision: false": diez bultos de un producto que
  // no se compra por bulto, y confirmado sin que nadie lo mirara. El fiambre se
  // pide por PIEZA y los kilos del papel no dicen cuántas piezas son.
  const r = proponerCantidadPedido({ cantidad: 10, unidadFuente: "KG", producto: fiambre });
  assert.equal(r.unidad, "UNIDAD", "un fiambre no se pide en bultos");
  assert.equal(r.requiereRevision, true, "nunca se confirma solo");
  assert.equal(r.cantidad, 10, "se conserva el número leído; no se inventa una equivalencia");
  assert.match(r.motivo, /kilos/i);
  assert.match(r.motivo, /pieza/i);
  // Y que NO haya inventado piezas dividiendo por el peso: 10 / 2,5 = 4 sería
  // exactamente la clase de número plausible que este candado impide.
  assert.notEqual(r.cantidad, 4);
});

test("solo el PACK puede alternar BULTO/UNIDAD", () => {
  // La misma decisión que toma el selector del modal, sobre la pieza compartida.
  assert.equal(permiteToggleUnidad(baseDeProducto(pack)), true);
  assert.equal(permiteToggleUnidad(baseDeProducto(fiambre)), false);
  assert.equal(permiteToggleUnidad(baseDeProducto(porKilo)), false);
  assert.equal(naturalezaLinea(baseDeProducto(fiambre)), "FIAMBRE");
  assert.equal(naturalezaLinea(baseDeProducto(porKilo)), "KG");
});

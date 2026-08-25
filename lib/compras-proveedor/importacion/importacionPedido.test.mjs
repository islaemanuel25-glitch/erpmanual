import test from "node:test";
import assert from "node:assert/strict";

import { proponerCantidadPedido } from "./cantidad.js";
import { extraerFilasExcel } from "./excelFilas.js";
import { sumarCantidadesImportadas } from "./merge.js";
import { prepararLineasImportadas } from "./prepararLineas.js";

const pack = { factor_pack: 21, modoCompra: "BULTO", unidad_medida: "unidad" };

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

test("al continuar un borrador combina bultos y unidades sin perder cantidad", () => {
  assert.deepEqual(
    sumarCantidadesImportadas({
      actual: { cantidad: 2, unidad: "BULTO" },
      importada: { cantidad: 5, unidad: "UNIDAD" },
      factorPack: 21,
    }),
    { cantidad: 47, unidad: "UNIDAD" }
  );
  assert.deepEqual(
    sumarCantidadesImportadas({
      actual: { cantidad: 2, unidad: "BULTO" },
      importada: { cantidad: 42, unidad: "UNIDAD" },
      factorPack: 21,
    }),
    { cantidad: 4, unidad: "BULTO" }
  );
});

// LA RECETA REINTERPRETA EL PAPEL, NO MAQUILLA UNA LECTURA YA COCINADA.
//
// ── QUÉ DEMUESTRAN ESTOS CANDADOS ─────────────────────────────────────────
//
// Que "reanalizar sin volver a leer el archivo" es cierto: se conserva la tabla
// como está —encabezados y celdas— y la receta se aplica sobre ESO. La prueba de
// que no alcanzaba con las líneas ya normalizadas está en el primer bloque: la
// lectura automática confunde una columna Y descarta un renglón, y la
// explicación de una persona recupera las dos cosas.
//
// Fixtures sintéticos, sin ninguna planilla real.

import assert from "node:assert/strict";
import { test } from "node:test";

import { leerExcel } from "./lectorArchivo.js";
import { crudoDesdeFilas, lineasDesdeElCrudo, ORIGEN_CRUDO } from "./documentoCrudo.js";
import { recetaValida } from "./recetaDeLectura.js";
import * as XLSX from "xlsx";

// ── EL PAPEL DEL EJEMPLO DEL PEDIDO ───────────────────────────────────────
//
// La PRIMERA columna es la cantidad enviada. Si está vacía, el producto no fue
// enviado. Y el encabezado NO dice "cantidad": dice "ENVIADO", así que el
// identificador automático de columnas no la reconoce.
//
// Además hay una columna "PEDIDO" —lo que se había pedido— que el identificador
// SÍ reconoce como cantidad. O sea que la lectura automática toma la columna
// equivocada: el caso exacto que la receta tiene que poder corregir.
const FILAS = [
  ["ENVIADO", "ARTICULO", "PEDIDO", "PRECIO", "TOTAL"],
  ["10", "Galletita Sintética", "12", "100", "1000"],
  ["", "Yerba Sintética", "5", "200", ""],
  ["3", "Fideo Sintético", "3", "50", "150"],
];

const aExcel = (filas) => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), "Hoja1");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
};

test("LA LECTURA AUTOMÁTICA SE EQUIVOCA, Y SE EQUIVOCA DE LAS DOS MANERAS", () => {
  const r = leerExcel(aExcel(FILAS));
  assert.equal(r.ok, true);

  // 1. Toma "PEDIDO" como cantidad, que es lo que se pidió y no lo que vino.
  const galletita = r.documento.lineas.find((l) => l.descripcion.includes("Galletita"));
  assert.equal(galletita.cantidad, 12, "no tomó la columna equivocada, así que el caso no se ejerce");

  // 2. La yerba SÍ entra —tiene cantidad en PEDIDO— aunque no haya sido enviada.
  const yerba = r.documento.lineas.find((l) => l.descripcion.includes("Yerba"));
  assert.ok(yerba, "la yerba no está: el fixture no ejerce el caso");
  assert.equal(yerba.cantidad, 5);

  // Y ACÁ ESTÁ EL PUNTO: con solo estas líneas, ninguna receta puede arreglar
  // nada. El 12 y el 5 ya reemplazaron a lo que decía la primera columna, y de
  // la celda vacía de la yerba no queda ni rastro.
  assert.ok(!("celdas" in galletita));
});

test("PERO EL CRUDO VIAJA, Y TIENE LO QUE HACE FALTA", () => {
  const r = leerExcel(aExcel(FILAS));
  const crudo = r.documento.crudo;
  assert.ok(crudo, "el documento no conserva la tabla cruda");
  assert.deepEqual(crudo.encabezados, ["ENVIADO", "ARTICULO", "PEDIDO", "PRECIO", "TOTAL"]);
  assert.equal(crudo.filas.length, 3, "se perdió algún renglón al conservar la tabla");
  // La celda vacía de la yerba está, como cadena vacía. Es un dato.
  assert.equal(crudo.filas[1].celdas[0], "");
  assert.equal(crudo.filas[1].celdas[1], "Yerba Sintética");
});

test("LA EXPLICACIÓN DEL USUARIO CORRIGE LAS DOS COSAS", () => {
  // La receta que saldría de: "La primera columna es la cantidad enviada en
  // unidades. Si está vacía, el producto no fue enviado. Después viene el
  // nombre, el precio unitario y el total del renglón."
  const receta = recetaValida({
    columnas: {
      cantidad: { encabezado: "ENVIADO", posicion: 0 },
      descripcion: { encabezado: "ARTICULO", posicion: 1 },
      precioUnitario: { encabezado: "PRECIO", posicion: 3 },
      subtotal: { encabezado: "TOTAL", posicion: 4 },
    },
    enviado: { criterio: "CANTIDAD_PRESENTE" },
    cantidadEn: "UNIDAD",
    facturaPor: "UNIDAD",
    subtotal: { hayColumna: true },
  });

  const r = leerExcel(aExcel(FILAS));
  const reinterpretado = lineasDesdeElCrudo({ crudo: r.documento.crudo, receta });

  // 1. La cantidad ahora sale de ENVIADO, no de PEDIDO.
  const galletita = reinterpretado.lineas.find((l) => l.descripcion.includes("Galletita"));
  assert.equal(galletita.cantidad, 10, "siguió leyendo la columna equivocada");
  assert.equal(galletita.precioUnitario, 100);
  assert.equal(galletita.subtotal, 1000);

  // 2. La yerba quedó afuera, y se dice POR QUÉ.
  assert.ok(!reinterpretado.lineas.some((l) => l.descripcion.includes("Yerba")));
  const descarte = reinterpretado.descartadas.find((d) => (d.producto || "").includes("Yerba"));
  assert.ok(descarte, "descartó la yerba sin decir por qué");
  assert.match(descarte.porque, /no fue enviado/);

  // 3. Y el resto queda igual.
  assert.equal(reinterpretado.lineas.length, 2);
  assert.equal(reinterpretado.lineas.find((l) => l.descripcion.includes("Fideo")).cantidad, 3);
});

test("SIN CRITERIO DE ENVÍO NO SE DESCARTA NADA POR LA CANTIDAD", () => {
  // Un `null` en el criterio significa que la receta no opina, y no opinar no
  // puede sacar renglones. Si descartara igual, una receta a medio escribir
  // borraría mercadería en silencio.
  const receta = recetaValida({
    columnas: { cantidad: { encabezado: "ENVIADO" }, descripcion: { encabezado: "ARTICULO" } },
  });
  const r = leerExcel(aExcel(FILAS));
  const reinterpretado = lineasDesdeElCrudo({ crudo: r.documento.crudo, receta });
  assert.equal(reinterpretado.lineas.length, 3);
  assert.equal(reinterpretado.descartadas.length, 0);
  // La yerba entra con cantidad null, que es la verdad: la celda está vacía.
  assert.equal(reinterpretado.lineas.find((l) => l.descripcion.includes("Yerba")).cantidad, null);
});

test("EL ENCABEZADO LE GANA A LA POSICIÓN", () => {
  // Sobrevive a que el proveedor agregue una columna al principio; la posición
  // no. Acá la receta dice posición 0 pero encabezado PRECIO, y tiene que leer
  // el precio.
  const receta = recetaValida({
    columnas: {
      descripcion: { encabezado: "ARTICULO" },
      cantidad: { encabezado: "PRECIO", posicion: 0 },
    },
  });
  const r = leerExcel(aExcel(FILAS));
  const reinterpretado = lineasDesdeElCrudo({ crudo: r.documento.crudo, receta });
  assert.equal(reinterpretado.lineas[0].cantidad, 100);
});

test("un encabezado que la receta nombra y no existe cae a la posición", () => {
  const receta = recetaValida({
    columnas: {
      descripcion: { encabezado: "ARTICULO" },
      cantidad: { encabezado: "COLUMNA QUE NO EXISTE", posicion: 0 },
    },
  });
  const r = leerExcel(aExcel(FILAS));
  const reinterpretado = lineasDesdeElCrudo({ crudo: r.documento.crudo, receta });
  assert.equal(reinterpretado.lineas[0].cantidad, 10);
});

test("un campo que la receta no menciona queda vacío, no se adivina", () => {
  const receta = recetaValida({
    columnas: { cantidad: { posicion: 0 }, descripcion: { posicion: 1 } },
  });
  const r = leerExcel(aExcel(FILAS));
  const reinterpretado = lineasDesdeElCrudo({ crudo: r.documento.crudo, receta });
  assert.equal(reinterpretado.lineas[0].precioUnitario, null);
  assert.equal(reinterpretado.lineas[0].subtotal, null);
  // Y se dice que no hay columna de subtotal, que es lo que después impide usar
  // un subtotal que nadie leyó.
  assert.equal(reinterpretado.hayColumnaSubtotal, false);
});

test("COLUMNA_MARCADA saca los que no están marcados", () => {
  const filas = [
    ["ENV", "ARTICULO", "CANT", "PRECIO"],
    ["X", "Uno Sintético", "2", "100"],
    ["", "Dos Sintético", "3", "100"],
    ["NO", "Tres Sintético", "4", "100"],
  ];
  const receta = recetaValida({
    columnas: { cantidad: { encabezado: "CANT" }, descripcion: { encabezado: "ARTICULO" } },
    enviado: { criterio: "COLUMNA_MARCADA", columna: "ENV" },
  });
  const reinterpretado = lineasDesdeElCrudo({
    crudo: crudoDesdeFilas({ origen: ORIGEN_CRUDO.EXCEL, filas, filaEncabezado: 0 }),
    receta,
  });
  assert.deepEqual(reinterpretado.lineas.map((l) => l.descripcion), ["Uno Sintético"]);
  assert.equal(reinterpretado.descartadas.length, 2);
});

test("una fila totalmente vacía no cuenta como renglón descartado", () => {
  const filas = [["CANT", "ARTICULO"], ["1", "Uno"], ["", ""], ["2", "Dos"]];
  const receta = recetaValida({
    columnas: { cantidad: { encabezado: "CANT" }, descripcion: { encabezado: "ARTICULO" } },
    enviado: { criterio: "TODOS" },
  });
  const r = lineasDesdeElCrudo({
    crudo: crudoDesdeFilas({ origen: ORIGEN_CRUDO.EXCEL, filas, filaEncabezado: 0 }),
    receta,
  });
  assert.equal(r.lineas.length, 2);
  assert.equal(r.descartadas.length, 0, "contó una fila en blanco como renglón descartado");
});

test("sin tabla cruda no se inventa una: devuelve null", () => {
  assert.equal(lineasDesdeElCrudo({ crudo: null, receta: recetaValida({}) }), null);
  assert.equal(lineasDesdeElCrudo({ crudo: { encabezados: [], filas: [] } }), null);
});

test("la bonificación de una celda se lee igual que en el lector de Excel", () => {
  const filas = [["CANT", "ART", "DTO"], ["1", "Uno", "0,14"], ["1", "Dos", "14"]];
  const receta = recetaValida({
    columnas: {
      cantidad: { encabezado: "CANT" },
      descripcion: { encabezado: "ART" },
      bonificacionPct: { encabezado: "DTO" },
    },
    enviado: { criterio: "TODOS" },
  });
  const r = lineasDesdeElCrudo({
    crudo: crudoDesdeFilas({ origen: ORIGEN_CRUDO.EXCEL, filas, filaEncabezado: 0 }),
    receta,
  });
  // Las dos formas dan 14, y ninguna arrastra el 14.000000000000002 de la coma
  // flotante — que si viajara, llegaría hasta el cálculo del precio.
  assert.equal(r.lineas[0].bonificacionPct, 14);
  assert.equal(r.lineas[1].bonificacionPct, 14);
});

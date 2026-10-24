// Lo que queda de `vinculacion.js`: cómo se presenta un candidato, los
// contadores, y qué vínculo deja una fila al aplicarse.
//
// Las reglas de qué fila se podía vincular, del conflicto de códigos, del origen
// y de la búsqueda del catálogo se borraron el 2026-10-24 con las rutas
// `filas/[filaId]/vincular` y `productos`, que eran las únicas que las usaban.
// La vinculación a mano de hoy es `guardarCodigoDeLaFila`, y sus candados están
// en `vincularConUnaFila.test.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  presentarCandidato,
  presentacionDe,
  vinculoAPersistirAlAplicar,
} from "./vinculacion.js";
import { guardarCodigoDeLaFila } from "./vincularConUnaFila.js";
import { clavesDeCodigo } from "./normalizarCodigo.js";
import { ESTADO_LINEA } from "./estados.js";
import { contadoresCierran, COLUMNA_CONTADOR } from "./contadores.js";

// ═══ PRESENTACIÓN DEL CANDIDATO ══════════════════════════════════════════════

test("26. el candidato trae todo lo que hace falta para decidir", () => {
  const c = presentarCandidato(
    {
      productoBaseId: 100, nombre: "Ketchup", unidadMedida: "pack", factorPack: 24,
      codigoBarra: "779", creadoEnLocalId: 1,
    },
    { puedeEditarCosto: true }
  );
  assert.equal(c.productoBaseId, 100);
  assert.equal(c.nombre, "Ketchup");
  assert.equal(c.presentacion, "Pack x24");
  assert.equal(c.factorPack, 24);
  assert.equal(c.codigoBarra, "779");
  assert.equal(c.creadoEnLocalId, 1);
  assert.equal(c.puedeEditarCosto, true);
  assert.equal(c.advertencia, null);
});

test("27. si esta ubicación no puede tocar el costo, se ADVIERTE antes", () => {
  const c = presentarCandidato({ productoBaseId: 100, nombre: "X" }, { puedeEditarCosto: false });
  assert.equal(c.puedeEditarCosto, false);
  assert.match(c.advertencia, /no vas a poder aplicarle el costo/);
});

test("28. la presentación se lee en criollo", () => {
  assert.equal(presentacionDe({ unidadMedida: "kg" }), "Kg");
  assert.equal(presentacionDe({ unidadMedida: "pack", factorPack: 12 }), "Pack x12");
  assert.equal(presentacionDe({ unidadMedida: "cajon", factorPack: 6 }), "Cajón x6");
  assert.equal(presentacionDe({ unidadMedida: "unidad" }), "Unidad");
  assert.equal(presentacionDe({ unidadMedida: "pack" }), "Pack");
});

test("29. acepta el vocabulario del schema y el del motor", () => {
  assert.equal(presentacionDe({ unidad_medida: "pack", factor_pack: 12 }), "Pack x12");
});

// ═══ CONTADORES ══════════════════════════════════════════════════════════════

test("30. las columnas contadoras por estado, y la que NO va por estado", () => {
  // Antes eran ocho, una por estado. Ahora son siete: `excluidas` se sacó de acá
  // porque NADA escribe `estado = EXCLUIDO` —la exclusión vive en la marca
  // `excluidaManual`— y contarla por estado daba siempre cero mientras las filas
  // excluidas se contaban bajo su estado original. Se cuenta por la marca, en
  // COLUMNA_POR_MARCA de contadores.js.
  assert.equal(Object.keys(COLUMNA_CONTADOR).length, 7);
  assert.equal(
    COLUMNA_CONTADOR.EXCLUIDO,
    undefined,
    "EXCLUIDO volvió a contarse por estado. Se cuenta por excluidaManual."
  );
  for (const e of Object.keys(ESTADO_LINEA)) {
    if (e === "EXCLUIDO") continue; // sigue en el enum de Postgres, sin columna propia
    assert.ok(COLUMNA_CONTADOR[e], `${e} sin columna`);
  }
});

test("31. contadoresCierran verifica el invariante", () => {
  assert.equal(
    contadoresCierran({
      totalFilas: 10, listoParaActualizar: 4, sinCambios: 2, noMacheadas: 2,
      codigoDuplicado: 0, factorDudoso: 1, excluidas: 0, bloqueadas: 1, errores: 0,
    }),
    true
  );
  assert.equal(contadoresCierran({ totalFilas: 10, listoParaActualizar: 4 }), false);
});

// ═══ GUARDAR EL MACHEO AL APLICAR ═══════════════════════════════════════════
//
// Lo que se protege: que solo se aprenda de lo que se APLICÓ, que no se aprenda
// dos veces lo que ya estaba guardado, y que el literal que se guarda sea el
// mismo que guarda la vinculación a mano — si difirieran, el índice único vería
// dos vínculos donde hay uno.

const aplicada = (over = {}) => ({
  productoBaseId: 100,
  codigoNormalizado: "10301",
  tipoCoincidencia: "SUFIJO_5",
  descripcionProveedor: "KETCHUP DOYP. LC X250G",
  ...over,
});

test("34. una fila macheada por sufijo deja el vínculo: es lo que la próxima lista tendría que volver a adivinar", () => {
  const r = vinculoAPersistirAlAplicar(aplicada());
  assert.equal(r.persistir, true);
  assert.equal(r.codigoInterno, "10301");
});

test("35. el código de barras también se aprende", () => {
  assert.equal(vinculoAPersistirAlAplicar(aplicada({ tipoCoincidencia: "CODIGO_BARRA" })).persistir, true);
});

test("36. lo que YA vino de un vínculo no se vuelve a guardar", () => {
  // Guardarlo otra vez dejaría dos vínculos activos para el mismo producto y un
  // faltante permanente con el código viejo.
  for (const tipo of ["CODIGO_INTERNO", "CODIGO_INTERNO_SIN_CEROS"]) {
    const r = vinculoAPersistirAlAplicar(aplicada({ tipoCoincidencia: tipo }));
    assert.equal(r.persistir, false, tipo);
    assert.equal(r.motivo, "YA_TENIA_VINCULO");
  }
});

test("37. sin producto o sin código no hay nada que aprender", () => {
  assert.equal(vinculoAPersistirAlAplicar(aplicada({ productoBaseId: null })).motivo, "SIN_PRODUCTO");
  assert.equal(vinculoAPersistirAlAplicar(aplicada({ codigoNormalizado: "   " })).motivo, "SIN_CODIGO");
  assert.equal(vinculoAPersistirAlAplicar({}).persistir, false);
});

test("38. una coincidencia ambigua o inexistente no enseña nada", () => {
  for (const tipo of ["AMBIGUA", "NINGUNA", ""]) {
    assert.equal(vinculoAPersistirAlAplicar(aplicada({ tipoCoincidencia: tipo })).persistir, false, tipo);
  }
});

test("39. el literal guardado es el MISMO que usa la vinculación a mano", async () => {
  // El índice único es sobre el texto. Si acá se guardara una forma distinta
  // —con ceros, sin espacios, en otra caja— la próxima lista vería dos vínculos
  // para el mismo código y quedaría ambigua.
  //
  // La vinculación a mano de hoy es `guardarCodigoDeLaFila`, y lo que se compara
  // es lo que manda a la base, no lo que alguien cree que manda. El código de la
  // fila se arma como lo guardan los lectores de listas —`clavesDeCodigo` sobre
  // el crudo—, que es la única forma en que llega a las dos funciones.
  for (const crudo of ["0010301", "16 12", "AB-12"]) {
    const codigoNormalizado = clavesDeCodigo(crudo).normalizado;
    const anotadas = [];
    const tx = { productoCodigoProveedor: { upsert: async (args) => { anotadas.push(args); return { id: 1 }; } } };
    await guardarCodigoDeLaFila(tx, {
      grupoId: 1, proveedorId: 2, productoBaseId: 100,
      fila: { codigoCrudo: crudo, codigoNormalizado, descripcionProveedor: "KETCHUP" },
    });
    const aMano = anotadas[0]?.create?.codigoInterno;
    const alAplicar = vinculoAPersistirAlAplicar(aplicada({ codigoNormalizado })).codigoInterno;
    assert.ok(aMano, `${crudo}: la vinculación a mano no escribió el código`);
    assert.equal(alAplicar, aMano, crudo);
  }
});

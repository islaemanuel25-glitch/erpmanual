// El resumen del macheo: grupos que no se pisan y prioridad garantizada.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GRUPOS_MACHEO,
  GRUPO_MANUAL,
  grupoDeFila,
  resumirMacheo,
} from "@/lib/proveedores/listas/macheo";
import {
  TIPO_COINCIDENCIA,
  indexarCodigosProveedor,
  macheePorCodigo,
} from "@/lib/proveedores/listas/conciliarLista";

const fila = (tipo, extra = {}) => ({
  tipoCoincidencia: tipo,
  productoBaseId: 1,
  vinculadoPorUsuarioId: null,
  ...extra,
});

// ── Cada fila cae en un solo grupo ──────────────────────────────────────────

test("cada tipo de coincidencia tiene su grupo", () => {
  for (const g of GRUPOS_MACHEO) {
    assert.equal(grupoDeFila(fila(g.tipo)), g.id, `tipo ${g.tipo}`);
  }
});

test("una fila vinculada a mano cuenta como manual, no como su tipo", () => {
  const f = fila(TIPO_COINCIDENCIA.SUFIJO_4, { vinculadoPorUsuarioId: 7 });
  assert.equal(grupoDeFila(f), "manual");
});

test("un tipo desconocido cae en sin coincidencia, no se pierde", () => {
  assert.equal(grupoDeFila(fila("ALGO_NUEVO")), "sinCoincidencia");
  assert.equal(grupoDeFila(null), "sinCoincidencia");
});

// ── No hay doble conteo ─────────────────────────────────────────────────────

test("la suma de los grupos es igual al total de filas", () => {
  const filas = [
    fila(TIPO_COINCIDENCIA.CODIGO_INTERNO),
    fila(TIPO_COINCIDENCIA.SUFIJO_5),
    fila(TIPO_COINCIDENCIA.SUFIJO_5),
    fila(TIPO_COINCIDENCIA.SUFIJO_4),
    fila(TIPO_COINCIDENCIA.AMBIGUA, { productoBaseId: null }),
    fila(TIPO_COINCIDENCIA.NINGUNA, { productoBaseId: null }),
  ];
  const r = resumirMacheo(filas);
  assert.equal(r.totalFilas, 6);
  assert.equal(r.suma, 6);
  assert.equal(r.cierra, true);
});

test("ninguna fila aparece en dos grupos", () => {
  const filas = GRUPOS_MACHEO.map((g) => fila(g.tipo));
  const r = resumirMacheo(filas);
  const conFilas = r.grupos.filter((g) => g.filas > 0);
  assert.equal(conFilas.length, GRUPOS_MACHEO.length);
  for (const g of conFilas) assert.equal(g.filas, 1, `${g.id} tiene ${g.filas}`);
  assert.equal(r.suma, filas.length);
});

test("una lista vacía cierra en cero sin romperse", () => {
  const r = resumirMacheo([]);
  assert.equal(r.totalFilas, 0);
  assert.equal(r.cierra, true);
  assert.ok(r.grupos.length > 0);
});

// ── Filas del Excel contra productos del ERP ────────────────────────────────

test("dos filas al mismo producto son dos filas y un solo producto", () => {
  const r = resumirMacheo([
    fila(TIPO_COINCIDENCIA.SUFIJO_5, { productoBaseId: 10 }),
    fila(TIPO_COINCIDENCIA.SUFIJO_5, { productoBaseId: 10 }),
  ]);
  const g = r.grupos.find((x) => x.id === "sufijo5");
  assert.equal(g.filas, 2);
  assert.equal(g.productos, 1);
  assert.equal(r.productosAlcanzados, 1);
});

test("el universo del ERP viaja aparte y no se mezcla con las filas", () => {
  const r = resumirMacheo([fila(TIPO_COINCIDENCIA.CODIGO_INTERNO)], { productosDelProveedor: 375 });
  assert.equal(r.productosDelProveedor, 375);
  assert.equal(r.totalFilas, 1);
});

// ── La prioridad, contra el motor de verdad ─────────────────────────────────
//
// Estas pruebas no miran el resumen: verifican que el MOTOR asigne un único
// tipo y que sea el de mayor precisión. Si esto se rompiera, el resumen contaría
// bien pero contaría lo que no es.

const vinculo = (codigoInterno, productoBaseId) => ({ codigoInterno, productoBaseId, activo: true });
const filaExcel = (codigo) => ({ codigoCrudo: String(codigo), codigoNormalizado: String(codigo) });
const machear = (codigos, codigo) => macheePorCodigo(indexarCodigosProveedor(codigos), filaExcel(codigo));

// Desde 2026-11-18 cada escalón es el código corto ENTERO al final del largo,
// con "10" o "100" delante —el prefijo de Arcor— (ver
// `terminacionColaEntera.test.mjs`). Un mismo código coincide así a lo sumo en
// dos largos: "1001234567" con "01234567" ("10" delante, 8) y con "1234567"
// ("100" delante, 7). Los escalones sueltos van con pares como los de Arcor: la
// lista corta y el vínculo con el prefijo.
test("prioridad: el escalón más largo gana", () => {
  const r = machear([vinculo("01234567", 8), vinculo("1234567", 7)], "1001234567");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_8);
  assert.equal(r.candidatos[0].productoBaseId, 8);
  assert.equal(grupoDeFila({ tipoCoincidencia: r.tipo }), "sufijo8");
});

test("sin el más largo, gana el siguiente", () => {
  const r = machear([vinculo("1234567", 7)], "1001234567");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_7);
  assert.equal(r.candidatos[0].productoBaseId, 7);
});

test("cada escalón, con un par como los de Arcor", () => {
  assert.equal(machear([vinculo("10345678", 6)], "345678").tipo, TIPO_COINCIDENCIA.SUFIJO_6);
  assert.equal(machear([vinculo("1045678", 5)], "45678").tipo, TIPO_COINCIDENCIA.SUFIJO_5);
});

test("el de 4, con 100 delante como el Rocklets mini", () => {
  const r = machear([vinculo("1005678", 4)], "5678");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_4);
});

test("una cola entera con otro prefijo delante no es un escalón", () => {
  const r = machear([vinculo("2345678", 7), vinculo("5678", 4)], "12345678");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.NINGUNA);
});

test("compartir solo la cola no es un escalón", () => {
  const r = machear([vinculo("9992345678", 7), vinculo("6666665678", 4)], "12345678");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.NINGUNA);
});

test("el exacto le gana a todos los sufijos", () => {
  const codigos = [vinculo("12345678", 1), vinculo("9992345678", 7)];
  const r = machear(codigos, "12345678");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(r.candidatos[0].productoBaseId, 1);
});

test("el motor devuelve UN solo tipo por fila", () => {
  // La garantía de fondo del resumen: si el motor devolviera varios criterios,
  // el conteo por grupos dejaría de ser excluyente.
  const r = machear([vinculo("01234567", 8), vinculo("1234567", 7)], "1001234567");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_8);
  const grupos = GRUPOS_MACHEO.filter((g) => g.tipo === r.tipo);
  assert.equal(grupos.length, 1);
});

test("una escalera completa produce un grupo distinto por fila, sin superposición", () => {
  const casos = [
    { codigos: [vinculo("12345678", 1)], codigo: "12345678", esperado: "exactas" },
    { codigos: [vinculo("102345678", 2)], codigo: "2345678", esperado: "sufijo7" },
    { codigos: [vinculo("10345678", 3)], codigo: "345678", esperado: "sufijo6" },
    { codigos: [vinculo("1045678", 4)], codigo: "45678", esperado: "sufijo5" },
    { codigos: [vinculo("1005678", 5)], codigo: "5678", esperado: "sufijo4" },
    { codigos: [], codigo: "12345678", esperado: "sinCoincidencia" },
  ];
  const filas = casos.map((c) => ({
    tipoCoincidencia: machear(c.codigos, c.codigo).tipo,
    productoBaseId: 1,
  }));
  const r = resumirMacheo(filas);
  assert.equal(r.cierra, true);
  for (const c of casos) {
    const g = r.grupos.find((x) => x.id === c.esperado);
    assert.equal(g.filas, 1, `${c.esperado} debería tener 1 y tiene ${g.filas}`);
  }
});

// ── Metadatos para la pantalla ──────────────────────────────────────────────

test("cada grupo trae etiqueta, explicación y a qué vista filtra", () => {
  const r = resumirMacheo([]);
  for (const g of r.grupos) {
    assert.ok(g.etiqueta.length > 0, `${g.id} sin etiqueta`);
    assert.ok(g.detalle.length > 0, `${g.id} sin explicación`);
    assert.ok(g.vista.length > 0, `${g.id} sin vista`);
  }
});

test("los grupos de sufijo declaran cuántos dígitos son", () => {
  const r = resumirMacheo([]);
  for (const n of [8, 7, 6, 5, 4]) {
    const g = r.grupos.find((x) => x.id === `sufijo${n}`);
    assert.equal(g.digitos, n);
  }
});

test("las vinculadas a mano tienen su propio grupo", () => {
  const r = resumirMacheo([fila(TIPO_COINCIDENCIA.SUFIJO_4, { vinculadoPorUsuarioId: 3 })]);
  const g = r.grupos.find((x) => x.id === GRUPO_MANUAL.id);
  assert.equal(g.filas, 1);
  assert.equal(r.grupos.find((x) => x.id === "sufijo4").filas, 0);
});

// ── Progreso por tandas ─────────────────────────────────────────────────────

import { resumirProgreso } from "@/lib/proveedores/listas/macheo";

const fp = (extra = {}) => ({
  aplicada: false, excluidaManual: false, estado: "LISTO_PARA_ACTUALIZAR", ...extra,
});

test("el progreso separa aplicadas de pendientes", () => {
  const r = resumirProgreso([
    fp({ aplicada: true }),
    fp({ aplicada: true }),
    fp(),
    fp({ estado: "FACTOR_DUDOSO" }),
    fp({ estado: "NO_MACHEADO" }),
    fp({ estado: "CODIGO_DUPLICADO" }),
    fp({ excluidaManual: true }),
  ]);
  assert.equal(r.aplicadas, 2);
  assert.equal(r.listasPendientes, 1);
  assert.equal(r.requierenRevision, 1);
  assert.equal(r.sinVincular, 1);
  assert.equal(r.ambiguas, 1);
  assert.equal(r.excluidas, 1);
  assert.equal(r.pendientes, 4);
  assert.equal(r.puedeCerrarse, false);
});

test("una fila aplicada no cuenta como pendiente aunque su estado diga LISTO", () => {
  // Es el caso real: al aplicar, el estado de la fila NO cambia. Si "pendiente"
  // fuera solo el estado, las 101 aplicadas seguirían contándose como listas.
  const r = resumirProgreso([fp({ aplicada: true, estado: "LISTO_PARA_ACTUALIZAR" })]);
  assert.equal(r.aplicadas, 1);
  assert.equal(r.listasPendientes, 0);
  assert.equal(r.pendientes, 0);
  assert.equal(r.puedeCerrarse, true);
});

test("una fila excluida a mano no está pendiente", () => {
  const r = resumirProgreso([fp({ excluidaManual: true, estado: "LISTO_PARA_ACTUALIZAR" })]);
  assert.equal(r.excluidas, 1);
  assert.equal(r.pendientes, 0);
  assert.equal(r.puedeCerrarse, true);
});

test("los estados sin decisión no cuentan como pendientes", () => {
  const r = resumirProgreso([
    fp({ estado: "SIN_CAMBIOS" }),
    fp({ estado: "ERROR" }),
    fp({ estado: "EXCLUIDO" }),
  ]);
  assert.equal(r.pendientes, 0);
  assert.equal(r.puedeCerrarse, true);
});

test("el caso real de la importación 3", () => {
  const filas = [
    ...Array.from({ length: 101 }, () => fp({ aplicada: true })),
    ...Array.from({ length: 190 }, () => fp({ estado: "FACTOR_DUDOSO" })),
    ...Array.from({ length: 625 }, () => fp({ estado: "NO_MACHEADO" })),
    fp({ estado: "CODIGO_DUPLICADO" }),
  ];
  const r = resumirProgreso(filas);
  assert.equal(r.aplicadas, 101);
  assert.equal(r.listasPendientes, 0);
  assert.equal(r.requierenRevision, 190);
  assert.equal(r.sinVincular, 625);
  assert.equal(r.ambiguas, 1);
  assert.equal(r.pendientes, 816);
  assert.equal(r.puedeCerrarse, false, "con 816 pendientes NO puede cerrarse sola");
  assert.equal(filas.length, 917);
});

test("sin pendientes puede cerrarse sola", () => {
  const r = resumirProgreso([fp({ aplicada: true }), fp({ excluidaManual: true })]);
  assert.equal(r.puedeCerrarse, true);
});

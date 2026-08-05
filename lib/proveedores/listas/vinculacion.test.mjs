// Vinculación manual: qué se puede vincular y qué no.
//
// Estas reglas son la mitad de la seguridad de la etapa. Un vínculo equivocado
// no rompe nada hoy: le cambia el costo al producto que no era dentro de tres
// meses, cuando llegue la lista siguiente.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ORIGEN_VINCULO,
  MOTIVO_RECHAZO,
  TEXTO_RECHAZO,
  MIN_BUSQUEDA,
  MAX_RESULTADOS,
  filaVinculable,
  decidirVinculo,
  origenValido,
  resolverOrigen,
  consultaValida,
  ordenarCandidatos,
  presentarCandidato,
  presentacionDe,
} from "./vinculacion.js";
import { ESTADO_LINEA } from "./estados.js";
import { ESTADO_IMPORTACION } from "./persistencia.js";
import { contadoresCierran, COLUMNA_CONTADOR } from "./contadores.js";

const IMP = { id: 1, estado: ESTADO_IMPORTACION.CONCILIADA };
const FILA = {
  id: 10,
  estado: ESTADO_LINEA.NO_MACHEADO,
  productoBaseId: null,
  aplicada: false,
  codigoNormalizado: "10301",
  descripcionProveedor: "KETCHUP",
  sugerenciaProductoBaseId: null,
};

// ═══ QUÉ FILA SE PUEDE VINCULAR ══════════════════════════════════════════════

test("1. una fila NO_MACHEADO de una importación conciliada se puede vincular", () => {
  const r = filaVinculable(FILA, IMP);
  assert.equal(r.ok, true);
  assert.equal(r.codigoNormalizado, "10301");
});

test("2. una importación APLICADA no admite vincular", () => {
  const r = filaVinculable(FILA, { ...IMP, estado: ESTADO_IMPORTACION.APLICADA });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_RECHAZO.IMPORTACION_NO_CONCILIADA);
});

test("3. una importación BORRADOR o DESCARTADA tampoco", () => {
  for (const e of [ESTADO_IMPORTACION.BORRADOR, ESTADO_IMPORTACION.DESCARTADA]) {
    assert.equal(filaVinculable(FILA, { ...IMP, estado: e }).ok, false, e);
  }
});

test("4. una fila YA MACHEADA no se re-vincula desde acá", () => {
  // Cambiar un vínculo existente es otra operación, con otras consecuencias.
  const r = filaVinculable({ ...FILA, productoBaseId: 500 }, IMP);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_RECHAZO.FILA_YA_MACHEADA);
});

test("5. una fila ya APLICADA no se toca", () => {
  const r = filaVinculable({ ...FILA, aplicada: true }, IMP);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_RECHAZO.FILA_APLICADA);
});

test("6. los otros siete estados no son vinculables", () => {
  for (const e of Object.keys(ESTADO_LINEA).filter((x) => x !== "NO_MACHEADO")) {
    const r = filaVinculable({ ...FILA, estado: e }, IMP);
    assert.equal(r.ok, false, e);
    assert.equal(r.motivo, MOTIVO_RECHAZO.FILA_NO_VINCULABLE);
  }
});

test("7. una fila sin código utilizable no se puede vincular", () => {
  for (const c of ["", "   ", null, undefined]) {
    const r = filaVinculable({ ...FILA, codigoNormalizado: c }, IMP);
    assert.equal(r.ok, false, String(c));
    assert.equal(r.motivo, MOTIVO_RECHAZO.CODIGO_INVALIDO);
  }
});

test("8. sin fila o sin importación no se vincula nada", () => {
  assert.equal(filaVinculable(null, IMP).ok, false);
  assert.equal(filaVinculable(FILA, null).ok, false);
});

test("9. cada motivo de rechazo tiene texto", () => {
  for (const m of Object.values(MOTIVO_RECHAZO)) {
    assert.ok(TEXTO_RECHAZO[m]?.length > 10, `${m} sin texto`);
  }
});

// ═══ QUÉ HACER CON UN VÍNCULO EXISTENTE ══════════════════════════════════════

test("10. sin vínculo previo: CREAR", () => {
  assert.deepEqual(decidirVinculo(null, 100), { accion: "CREAR" });
});

test("11. vínculo INACTIVO: REACTIVAR", () => {
  const r = decidirVinculo({ id: 7, productoBaseId: 999, activo: false }, 100);
  assert.equal(r.accion, "REACTIVAR");
  assert.equal(r.vinculoId, 7);
});

test("12. vínculo ACTIVO al MISMO producto: no hay nada que crear", () => {
  const r = decidirVinculo({ id: 7, productoBaseId: 100, activo: true }, 100);
  assert.equal(r.accion, "YA_VINCULADO");
  assert.equal(r.vinculoId, 7);
});

test("13. vínculo ACTIVO a OTRO producto: CONFLICTO, no se reasigna", () => {
  const r = decidirVinculo({ id: 7, productoBaseId: 555, activo: true }, 100);
  assert.equal(r.accion, "CONFLICTO");
  assert.equal(r.productoBaseIdActual, 555);
  assert.equal(r.motivo, MOTIVO_RECHAZO.CODIGO_YA_VINCULADO);
});

test("14. el conflicto informa a qué producto apunta hoy", () => {
  // Sin ese dato el usuario no puede decidir si corregir o dejar como está.
  const r = decidirVinculo({ id: 7, productoBaseId: 555, activo: true }, 100);
  assert.ok(Number.isInteger(r.productoBaseIdActual));
});

// ═══ ORIGEN DE LA DECISIÓN ═══════════════════════════════════════════════════

test("15. los dos orígenes admitidos", () => {
  assert.deepEqual(Object.keys(ORIGEN_VINCULO).sort(), ["BUSQUEDA_MANUAL", "SUGERENCIA_CODIGO_BARRAS"]);
  assert.equal(origenValido("BUSQUEDA_MANUAL"), true);
  assert.equal(origenValido("INVENTADO"), false);
});

test("16. venir de la sugerencia se registra solo si la sugerencia coincide", () => {
  const conSug = { ...FILA, sugerenciaProductoBaseId: 100 };
  assert.equal(
    resolverOrigen("SUGERENCIA_CODIGO_BARRAS", conSug, 100),
    ORIGEN_VINCULO.SUGERENCIA_CODIGO_BARRAS
  );
});

test("17. si el cliente MIENTE sobre el origen, se guarda BUSQUEDA_MANUAL", () => {
  // El origen es auditoría: no puede depender de lo que afirme el navegador.
  const conSug = { ...FILA, sugerenciaProductoBaseId: 100 };
  assert.equal(resolverOrigen("SUGERENCIA_CODIGO_BARRAS", conSug, 999), ORIGEN_VINCULO.BUSQUEDA_MANUAL);
  assert.equal(resolverOrigen("SUGERENCIA_CODIGO_BARRAS", FILA, 100), ORIGEN_VINCULO.BUSQUEDA_MANUAL);
});

test("18. un origen desconocido cae a BUSQUEDA_MANUAL", () => {
  assert.equal(resolverOrigen("LO_QUE_SEA", FILA, 100), ORIGEN_VINCULO.BUSQUEDA_MANUAL);
  assert.equal(resolverOrigen(undefined, FILA, 100), ORIGEN_VINCULO.BUSQUEDA_MANUAL);
});

// ═══ BÚSQUEDA ════════════════════════════════════════════════════════════════

test("19. la búsqueda exige un mínimo de caracteres", () => {
  assert.equal(consultaValida(""), false);
  assert.equal(consultaValida("a"), false);
  assert.equal(consultaValida("az"), true);
  assert.equal(consultaValida("  az  "), true);
  assert.equal(MIN_BUSQUEDA, 2);
});

test("20. hay un techo de resultados", () => {
  assert.equal(MAX_RESULTADOS, 25);
});

test("21. lo exacto va primero: código exacto antes que nombre parcial", () => {
  const items = [
    { productoBaseId: 1, nombre: "Azúcar Arcor x1kg", codigoBarra: "7790580127534" },
    { productoBaseId: 2, nombre: "Otro", codigoBarra: "779" },
  ];
  const r = ordenarCandidatos(items, "779");
  assert.equal(r[0].productoBaseId, 2, "el código exacto tiene que ir primero");
});

test("22. después del código exacto va el nombre exacto", () => {
  const items = [
    { productoBaseId: 1, nombre: "Azúcar molida" },
    { productoBaseId: 2, nombre: "Azúcar" },
  ];
  assert.equal(ordenarCandidatos(items, "Azúcar")[0].productoBaseId, 2);
});

test("23. lo que empieza igual va antes que lo que solo contiene", () => {
  const items = [
    { productoBaseId: 1, nombre: "Gran azúcar" },
    { productoBaseId: 2, nombre: "Azúcar rubia" },
  ];
  assert.equal(ordenarCandidatos(items, "Azúcar")[0].productoBaseId, 2);
});

test("24. dentro del mismo rango, alfabético", () => {
  const items = [
    { productoBaseId: 1, nombre: "Zeta cosa" },
    { productoBaseId: 2, nombre: "Alfa cosa" },
  ];
  assert.equal(ordenarCandidatos(items, "cosa")[0].productoBaseId, 2);
});

test("25. ordenar no muta la lista original", () => {
  const items = [{ productoBaseId: 1, nombre: "B" }, { productoBaseId: 2, nombre: "A" }];
  const copia = JSON.stringify(items);
  ordenarCandidatos(items, "A");
  assert.equal(JSON.stringify(items), copia);
});

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

test("30. las ocho columnas contadoras", () => {
  assert.equal(Object.keys(COLUMNA_CONTADOR).length, 8);
  for (const e of Object.keys(ESTADO_LINEA)) {
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

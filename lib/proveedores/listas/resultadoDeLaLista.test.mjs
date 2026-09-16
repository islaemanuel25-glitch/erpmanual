// En qué grupo de revisión cae cada fila.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MOTIVO_REVISION,
  TEXTO_MOTIVO_REVISION,
  ORDEN_MOTIVOS,
  motivoDeRevision,
  laDejaronComoEsta,
  contarResultado,
  resultadoCierra,
} from "@/lib/proveedores/listas/resultadoDeLaLista";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { MOTIVO_LECTURA } from "@/lib/proveedores/listas/eleccionDeLectura";

// LA FORMA DEL DATO DE PRUEBA ES LA FORMA DEL DATO REAL.
//
// `excluidaManual` es `Boolean @default(false)` en el schema, así que el
// endpoint SIEMPRE la manda y nunca llega en `undefined`. La primera versión de
// este helper no la traía, y por eso el candado de abajo probaba la exclusión
// con `estado: EXCLUIDO` —un estado que está en el enum y que NADA ESCRIBE
// NUNCA—: afirmaba una condición inalcanzable y estaba en verde.
const fila = (estado, extra = {}) => ({
  estado,
  motivo: null,
  costoAnterior: 1000,
  productoBaseId: 7,
  excluidaManual: false,
  ...extra,
});

test("lo que se aplica solo no va a la cola de revisión", () => {
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR)), null);
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.SIN_CAMBIOS)), null);
});

test("«dejar como está» SACA la fila de la cola, y se lee de excluidaManual", () => {
  // EL DEFECTO, ENCONTRADO USANDO LA PANTALLA: "Dejar como está" escribía bien
  // en la base y mostraba su cartel verde, pero la cola seguía diciendo 595. El
  // motivo se preguntaba por `estado === EXCLUIDO`, que nunca ocurre.
  //
  // La fila conserva su estado original —por eso `FACTOR_DUDOSO` acá—: pisarlo
  // perdería el motivo por el que estaba en la cola, y desexcluir, que es
  // reversible, no podría restaurarlo.
  const dejada = fila(ESTADO_LINEA.FACTOR_DUDOSO, { excluidaManual: true });
  assert.equal(motivoDeRevision(dejada), null);
  assert.equal(laDejaronComoEsta(dejada), true);

  // CONTRAPRUEBA: la MISMA fila sin excluir sí va a la cola. Sin esto, el
  // candado de arriba pasaría igual con una función que devuelva null siempre.
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.FACTOR_DUDOSO)), MOTIVO_REVISION.AUMENTO_DISTINTO);
});

test("la decisión de la persona MANDA sobre el veredicto del motor", () => {
  // Una fila que el motor dejó lista y que después alguien excluyó a mano no se
  // aplica. Contarla entre los listos diría que se van a escribir 2 costos
  // cuando se escribe 1.
  const r = contarResultado([
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR),
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { excluidaManual: true }),
  ]);
  assert.equal(r.listos, 1);
  assert.equal(r.dejadas, 1);
  assert.equal(resultadoCierra(r), true);
});

test("los cuatro grupos de la pantalla salen de estados distintos", () => {
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.FACTOR_DUDOSO)), MOTIVO_REVISION.AUMENTO_DISTINTO);
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.NO_MACHEADO, { productoBaseId: null })), MOTIVO_REVISION.SIN_PRODUCTO);
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.CODIGO_DUPLICADO)), MOTIVO_REVISION.REPETIDO);
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.BLOQUEADO)), MOTIVO_REVISION.OTRO);
});

test("sin costo cargado es su propio grupo, y NO 'aumenta distinto'", () => {
  // CONTRAPRUEBA DE LA REGLA: los dos son FACTOR_DUDOSO, así que agrupar por
  // estado los deja juntos. Y son cosas distintas: en uno hay que mirar el
  // precio, en el otro falta el costo del producto. El texto de "aumenta
  // distinto" manda a revisar un aumento que no existe.
  const porMotivo = fila(ESTADO_LINEA.FACTOR_DUDOSO, { motivo: MOTIVO_LECTURA.SIN_COSTO_ACTUAL });
  assert.equal(motivoDeRevision(porMotivo), MOTIVO_REVISION.SIN_COSTO);
});

test("una importación VIEJA sin el motivo nuevo también cae en 'sin costo'", () => {
  // Las guardadas antes del 2026-09-17 tienen FUERA_DE_RANGO con el costo en
  // cero, que es el mismo caso. Agrupar por la etiqueta y no por el dato las
  // dejaría mezcladas con los aumentos raros para siempre.
  const vieja = fila(ESTADO_LINEA.FACTOR_DUDOSO, {
    motivo: MOTIVO_LECTURA.FUERA_DE_RANGO,
    costoAnterior: 0,
  });
  assert.equal(motivoDeRevision(vieja), MOTIVO_REVISION.SIN_COSTO);

  const nula = fila(ESTADO_LINEA.FACTOR_DUDOSO, { motivo: null, costoAnterior: null });
  assert.equal(motivoDeRevision(nula), MOTIVO_REVISION.SIN_COSTO);
});

test("una fila SIN producto y sin costo es 'no está en tu catálogo', no 'sin costo'", () => {
  // El orden importa: sin producto no hay costo que cargar, así que decir "sin
  // costo cargado" mandaría a arreglar la ficha de un producto que no existe.
  const f = fila(ESTADO_LINEA.NO_MACHEADO, { productoBaseId: null, costoAnterior: null });
  assert.equal(motivoDeRevision(f), MOTIVO_REVISION.SIN_PRODUCTO);
});

test("los contadores cierran contra el total", () => {
  const filas = [
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR),
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR),
    fila(ESTADO_LINEA.SIN_CAMBIOS),
    fila(ESTADO_LINEA.FACTOR_DUDOSO, { excluidaManual: true }),
    fila(ESTADO_LINEA.FACTOR_DUDOSO),
    fila(ESTADO_LINEA.FACTOR_DUDOSO, { costoAnterior: 0 }),
    fila(ESTADO_LINEA.NO_MACHEADO, { productoBaseId: null }),
    fila(ESTADO_LINEA.CODIGO_DUPLICADO),
    fila(ESTADO_LINEA.ERROR),
  ];
  const r = contarResultado(filas);
  assert.equal(r.total, 9);
  assert.equal(r.listos, 2);
  assert.equal(r.sinCambio, 1);
  assert.equal(r.dejadas, 1);
  assert.equal(r.paraRevisar, 5);
  assert.deepEqual(r.porMotivo, {
    AUMENTO_DISTINTO: 1, SIN_COSTO: 1, SIN_PRODUCTO: 1, REPETIDO: 1, OTRO: 1,
  });
  assert.equal(resultadoCierra(r), true);
});

test("cada grupo tiene título y una ayuda que dice qué hacer", () => {
  for (const m of ORDEN_MOTIVOS) {
    const t = TEXTO_MOTIVO_REVISION[m];
    assert.ok(t?.titulo, `falta el título de ${m}`);
    const ayuda = t.ayuda({ minPct: 5, maxPct: 8 });
    assert.ok(ayuda.length > 20, `la ayuda de ${m} no explica nada`);
  }
  // La del aumento nombra el rango que el usuario cargó, y no uno inventado.
  assert.match(TEXTO_MOTIVO_REVISION.AUMENTO_DISTINTO.ayuda({ minPct: 5, maxPct: 8 }), /5 %.*8 %/);
  // Y sin rango cargado no inventa un número.
  assert.doesNotMatch(
    TEXTO_MOTIVO_REVISION.AUMENTO_DISTINTO.ayuda({ minPct: null, maxPct: null }),
    /\d/
  );
});

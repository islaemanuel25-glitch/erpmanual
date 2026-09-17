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

test("los grupos de la pantalla salen de estados distintos", () => {
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.FACTOR_DUDOSO)), MOTIVO_REVISION.AUMENTO_DISTINTO);
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.NO_MACHEADO, { productoBaseId: null })), MOTIVO_REVISION.SIN_PRODUCTO);
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.CODIGO_DUPLICADO)), MOTIVO_REVISION.REPETIDO);
  // ── LOS DOS QUE ERAN "OTROS PARA MIRAR" ──────────────────────────────────
  //
  // Caían juntos en una bolsa que decía "Filas que el sistema no pudo
  // procesar", y son dos problemas que no se parecen: uno es un permiso sobre
  // un producto que está perfecto, el otro es una fila del archivo ilegible.
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.BLOQUEADO)), MOTIVO_REVISION.NO_SE_PUEDE_ESCRIBIR);
  assert.equal(motivoDeRevision(fila(ESTADO_LINEA.ERROR)), MOTIVO_REVISION.NO_SE_PUDO_LEER);
});

test("NINGÚN estado del motor cae en la bolsa de 'no sé explicarlo'", () => {
  // ── POR QUÉ ESTE CANDADO Y NO LEER LA FUNCIÓN ────────────────────────────
  //
  // El default de `motivoDeRevision` existe para que un estado nuevo NO se
  // cuente como listo para aplicar. Es el lado seguro, pero también es el lugar
  // donde un estado puede quedarse callado para siempre si nadie lo nombra: la
  // pantalla diría "quedaron en un estado que no sé explicar" y funcionaría.
  //
  // Se recorren LOS OCHO estados de `estados.js` —no una lista escrita acá— así
  // que agregar uno al enum pone este candado en rojo el mismo día.
  for (const estado of Object.values(ESTADO_LINEA)) {
    // SIN_CAMBIOS y EXCLUIDO no van a revisión por definición: el primero no
    // cambió nada y el segundo es la decisión de una persona, que vive en
    // `excluidaManual` y se pregunta antes.
    if (estado === ESTADO_LINEA.SIN_CAMBIOS || estado === ESTADO_LINEA.EXCLUIDO) continue;
    const m = motivoDeRevision(fila(estado, { productoBaseId: estado === ESTADO_LINEA.NO_MACHEADO ? null : 7 }));
    assert.notEqual(
      m,
      MOTIVO_REVISION.SIN_EXPLICACION,
      `el estado ${estado} no tiene un motivo con nombre: la pantalla no va a poder decir qué le pasa`
    );
  }
});

test("un estado que la traducción NO conoce va a revisión, no a los listos", () => {
  // CONTRAPRUEBA DEL DEFAULT, y es el motivo por el que no devuelve `null`:
  // `null` significa "listo para aplicar", así que un estado nuevo entraría a la
  // cuenta de los costos que se escriben sin que nadie lo hubiera mirado.
  const m = motivoDeRevision(fila("ESTADO_QUE_NO_EXISTE_TODAVIA"));
  assert.equal(m, MOTIVO_REVISION.SIN_EXPLICACION);
  const r = contarResultado([fila("ESTADO_QUE_NO_EXISTE_TODAVIA")]);
  assert.equal(r.listos, 0);
  assert.equal(r.paraRevisar, 1);
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
  // "NO ESTÁ EN TU CATÁLOGO" SALIÓ DE LA COLA y tiene su propio número: son
  // productos que el proveedor vende y este cliente no, no trabajo pendiente.
  // En la #5 eran 554 de 595, o sea que la cola decía "595 para revisar" sobre
  // 41 decisiones reales.
  assert.equal(r.paraRevisar, 4);
  assert.equal(r.sinProducto, 1);
  assert.deepEqual(r.porMotivo, {
    AUMENTO_DISTINTO: 1,
    SIN_COSTO: 1,
    SIN_PRODUCTO: 1,
    REPETIDO: 1,
    // La fila en ERROR: antes se contaba bajo `OTRO`, junto con los bloqueos.
    NO_SE_PUDO_LEER: 1,
    NO_SE_PUEDE_ESCRIBIR: 0,
    SIN_EXPLICACION: 0,
  });
  // Y cierra igual: los que no están en el catálogo se suman aparte, no
  // desaparecen. Un resumen que no cierra esconde filas que nadie mira.
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

// ── EL RESUMEN NO PUEDE DECIR UN RANGO QUE NO ES ───────────────────────────

test("una LISTA fuera del rango que nadie eligió vuelve a la cola", () => {
  // EL CASO DE LA #5, contado. El estado se congela al conciliar y
  // `clasificarLinea` no mira el rango, así que la fila quedó
  // LISTO_PARA_ACTUALIZAR con +1.008 % sobre un proveedor de 2 a 15. Contarla
  // entre los listos es lo que hacía que el número grande mintiera — y la
  // habría metido en el "Aplicar los N".
  const filas = [
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { diferenciaPct: 6.5 }),
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { diferenciaPct: 1008.4 }),
  ];
  const r = contarResultado(filas, { minPct: 2, maxPct: 15 });
  assert.equal(r.listos, 1, "la de +1.008 % siguió contando como lista");
  assert.equal(r.paraRevisar, 1);
  assert.equal(r.porMotivo.AUMENTO_DISTINTO, 1);
  assert.equal(resultadoCierra(r), true);
});

test("el rango que informa el resumen es el de los listos, no el configurado", () => {
  const filas = [
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { diferenciaPct: 2.6 }),
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { diferenciaPct: 14.2 }),
    fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { diferenciaPct: 1008.4 }),
  ];
  const r = contarResultado(filas, { minPct: 2, maxPct: 15 });
  assert.deepEqual(r.rangoDeLosListos, { minPct: 2.6, maxPct: 14.2 });
  // CONTRAPRUEBA: el +1.008 % no está en el rango informado PORQUE salió de los
  // listos. Si volviera a contarse, este número volvería a ser el que Emanuel
  // vio en la pantalla.
  assert.notEqual(r.rangoDeLosListos.maxPct, 1008.4);
});

test("lo que una persona eligió fuera de rango SÍ queda listo, y se cuenta aparte", () => {
  // Con la aceptación registrada, la fila se aplica —es su catálogo y su
  // decisión— pero el resumen la separa para poder decirlo en vez de mezclarla
  // con las que sí caen en el rango.
  const elegida = fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, {
    diferenciaPct: 1008.4,
    confirmadoEn: new Date("2026-09-17T10:00:00Z"),
    vinculadoEn: new Date("2026-09-17T09:00:00Z"),
    multiplicadorConfirmado: 12,
    fueraDeRangoAceptadaEn: new Date("2026-09-17T10:00:00Z"),
  });
  const r = contarResultado([elegida], { minPct: 2, maxPct: 15 });
  assert.equal(r.listos, 1);
  assert.equal(r.listosElegidosFueraDeRango, 1);
  assert.equal(r.paraRevisar, 0);
});

test("sin rango cargado no se reclasifica nada", () => {
  // Decir "está afuera" de un criterio que no existe sería un veredicto
  // inventado. Esas filas ya las frena `costoDeLaFila` con SIN_RANGO.
  const filas = [fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { diferenciaPct: 1008.4 })];
  const r = contarResultado(filas, null);
  assert.equal(r.listos, 1);
  assert.equal(r.paraRevisar, 0);
});

test("el rango CONGELADO en la fila le gana al de la cabecera", () => {
  // Es el mismo orden que usa `rangoDeLaFila`: lo que se decidió con la fila
  // manda sobre lo que diga la cabecera hoy. Si no, cambiar el rango del
  // proveedor reescribiría con qué criterio se juzgó una decisión vieja.
  const f = fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, {
    diferenciaPct: 30,
    aumentoEsperadoMinPct: 25,
    aumentoEsperadoMaxPct: 35,
  });
  const r = contarResultado([f], { minPct: 2, maxPct: 15 });
  assert.equal(r.listos, 1, "se juzgó con el rango de la cabecera y no con el suyo");
});

// NINGÚN COSTO FUERA DEL RANGO SE ESCRIBE SIN QUE ALGUIEN LO ELIJA.
//
// ── EL CASO, CON LOS NÚMEROS QUE VIO EMANUEL ───────────────────────────────
//
// La pantalla de resultado de la importación #5 decía:
//
//     112 productos listos · Todos aumentan entre +2,6 % y +1.008,5 %
//
// sobre M Y F, que tiene cargado un rango de 2 a 15 % y un recargo del 5 %. Con
// ese rango ningún producto listo puede aumentar mil por ciento.
//
// ── POR DÓNDE SE ESCAPABA ──────────────────────────────────────────────────
//
// Una fila cae en la cola cuando NINGUNA de sus lecturas entra en el rango. Para
// ésas, `resultadoConfirmacion` solo veta la lectura absurda "mientras haya algo
// creíble" —`if (elegida.absurda && analisis.resultado !== "REVISAR")`—, así que
// justamente ahí la acepta. La pantalla vieja ofrecía esa lectura detrás de un
// botón que decía solo "Usar $11.083,72", sin el porcentaje. Un toque y la fila
// quedaba LISTO_PARA_ACTUALIZAR.
//
// Después nadie la volvía a mirar: `clasificarLinea` no consulta el rango, y
// `revalidarFila` tampoco, porque la rama de la fila confirmada saltea
// `costoDeLaFila` —que era el único lugar donde el rango se comparaba—. Medido
// antes del arreglo: `aplicable: true`, `costoNuevo: 11083.72` sobre un costo de
// 1.000. No se aplicó porque Emanuel no apretó el botón.
//
// ── QUÉ AFIRMAN ESTOS CANDADOS ─────────────────────────────────────────────
//
// Que el rango se verifica sobre el costo QUE SE VA A ESCRIBIR, fila por fila, y
// que la única puerta para pasar es que una persona haya elegido esa lectura.

import test from "node:test";
import assert from "node:assert/strict";

import { revalidarFila, MOTIVO_OMISION, TEXTO_OMISION } from "@/lib/proveedores/listas/aplicacion";
import { quedaFueraDelRango, laEligioUnaPersona } from "@/lib/proveedores/listas/rangoAumento";
import { CONFIG_GENERICA } from "@/lib/proveedores/listas/configuraciones/generico";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";

const RECARGO = 5;
const RANGO = { aumentoEsperadoMinPct: 2, aumentoEsperadoMaxPct: 15 };

const CONTEXTO = { operandoEnLocalId: 1, depositoLocalId: 1, cabecera: RANGO };

// EL PRODUCTO Y LA FILA SON LOS DE LA #5, no un fixture cómodo: un producto que
// se compra por caja de 12 y hoy cuesta 1.000 la caja, y una lista que dice
// 879,66. Leído tal cual da -7,6 %; leído por caja, 879,66 × 1,05 × 12 =
// 11.083,72, o sea +1.008,4 %. Ninguna de las dos cae en 2–15.
const base = {
  id: 1,
  nombre: "PRODUCTO POR CAJA",
  precio_costo: 1000,
  precio_venta: 1800,
  margen: 40,
  redondeo_100: false,
  es_combo: false,
  unidad_medida: "UNIDAD",
  factor_pack: 12,
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  creadoEnLocalId: 1,
};

const VINCULADO = new Date("2026-09-17T09:00:00Z");
const CONFIRMADO = new Date("2026-09-17T10:00:00Z");

const ACEPTADO = new Date("2026-09-17T10:00:01Z");

/** La fila tal como queda después de que alguien tocó "Usar $11.083,72". */
const filaConfirmadaFueraDeRango = (extra = {}) => ({
  id: 77,
  estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  productoBaseId: 1,
  precioConIva: 879.66,
  unidadProveedor: null,
  unidadesPorBulto: 12,
  factorErp: 12,
  costoAnterior: 1000,
  costoMaestroPropuesto: 11083.72,
  diferenciaPct: 1008.4,
  multiplicadorConfirmado: 12,
  confirmadoEn: CONFIRMADO,
  vinculadoEn: VINCULADO,
  aplicada: false,
  excluidaManual: false,
  seleccionada: true,
  ...extra,
});

const revalidar = (fila, contexto = CONTEXTO) =>
  revalidarFila({
    fila,
    base,
    contexto,
    config: { ...CONFIG_GENERICA, impuestoAdicionalPct: null },
    recargoPct: RECARGO,
  });

test("el +1.008 % de la #5 NO se aplica si nadie eligió esa lectura", () => {
  // Misma fila, misma propuesta guardada, sin la confirmación. Es el caso que
  // más importa: lo que el motor dejó listo solo.
  const sinElegir = filaConfirmadaFueraDeRango({
    multiplicadorConfirmado: null,
    confirmadoEn: null,
  });
  const r = revalidar(sinElegir);
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.FUERA_DE_RANGO);
});

test("y el motivo dice qué pasó y qué hacer, no un código", () => {
  const t = TEXTO_OMISION[MOTIVO_OMISION.FUERA_DE_RANGO];
  assert.ok(t.length > 60, "el texto no explica nada");
  assert.match(t, /rango/);
  assert.doesNotMatch(t, /Error interno/i);
});

test("CONFIRMADA NO ALCANZA: la fila de la #5 tal como quedó sigue sin aplicarse", () => {
  // ÉSTE ES EL CANDADO DEL DEFECTO. La fila está confirmada —alguien tocó
  // "Usar $11.083,72"— y antes de este arreglo `revalidarFila` devolvía
  // `aplicable: true` con ese costo sobre un producto de 1.000. Medido.
  //
  // Ahora no alcanza con haber tocado un botón: hace falta que le hayan avisado
  // que ese costo no cae en el rango. Las filas confirmadas antes de este
  // arreglo tienen esa aceptación en NULL, así que vuelven a la cola.
  const r = revalidar(filaConfirmadaFueraDeRango());
  assert.equal(r.aplicable, false, "una confirmación a ciegas volvió a alcanzar");
  assert.equal(r.motivo, MOTIVO_OMISION.FUERA_DE_RANGO);
});

test("lo que una persona eligió SABIENDO que estaba fuera de rango sí se aplica", () => {
  // CONTRAPRUEBA DE LA PUERTA. Si esto también se rechazara, el arreglo no
  // estaría distinguiendo nada: estaría prohibiendo el caso entero, y la
  // decisión de una persona sobre su propio catálogo dejaría de existir. Hay
  // productos donde el costo cargado está mal y la lista tiene razón.
  const r = revalidar(
    filaConfirmadaFueraDeRango({
      fueraDeRangoAceptadaEn: ACEPTADO,
      fueraDeRangoAceptadaPorUsuarioId: 1,
    })
  );
  assert.equal(r.aplicable, true, `la rechazó por: ${r.motivo}`);
  assert.equal(r.costoNuevo, 11083.72);
  // Y sale MARCADA, para que el resumen pueda contarla aparte en vez de
  // mezclarla con las que sí caen en el rango.
  assert.equal(r.fueraDeRango, true);
});

test("una aceptación ANTERIOR a la confirmación no cubre la lectura nueva", () => {
  // Aceptó el aviso sobre una lectura y después cambió de lectura: el aviso
  // viejo no dice nada de la nueva. Sin esto, aceptar una vez dejaría la fila
  // habilitada para cualquier costo posterior.
  const r = revalidar(
    filaConfirmadaFueraDeRango({
      fueraDeRangoAceptadaEn: new Date("2026-09-17T09:30:00Z"),
      fueraDeRangoAceptadaPorUsuarioId: 1,
    })
  );
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.FUERA_DE_RANGO);
});

test("una confirmación VENCIDA no habilita nada", () => {
  // Confirmada ANTES de la última vinculación: eligió una lectura para un
  // producto que la fila ya no tiene. La regla no es nueva —la decide
  // `multiplicadorConfirmadoUsable`— pero acá es la que sostiene la puerta, así
  // que se ejerce desde este lado también.
  const vencida = filaConfirmadaFueraDeRango({
    confirmadoEn: VINCULADO,
    vinculadoEn: CONFIRMADO,
    fueraDeRangoAceptadaEn: ACEPTADO,
  });
  assert.equal(laEligioUnaPersona(vencida), false);
  const r = revalidar(vencida);
  assert.equal(r.aplicable, false);
});

test("lo que cae DENTRO del rango se aplica sin que nadie tenga que elegir", () => {
  // La otra mitad de la contraprueba: sin esto, un arreglo que rechazara todo
  // dejaría estos candados en verde y el módulo inservible.
  const dentro = {
    ...filaConfirmadaFueraDeRango(),
    multiplicadorConfirmado: null,
    confirmadoEn: null,
    unidadesPorBulto: null,
    factorErp: 12,
    precioConIva: 1015,
    costoMaestroPropuesto: 1065.75,
    diferenciaPct: 6.6,
  };
  const r = revalidar({ ...dentro, factorErp: 12 });
  assert.equal(r.aplicable, true, `la rechazó por: ${r.motivo}`);
  assert.equal(r.fueraDeRango, false);
});

test("sin rango cargado el veto NO se inventa un criterio", () => {
  // `quedaFueraDelRango` contesta `false` sin rango, y tiene que ser así: decir
  // "está afuera" de un criterio que no existe sería un veredicto inventado. La
  // fila sin rango ya la frena `costoDeLaFila` con SIN_RANGO, que es el motivo
  // que manda a cargar el rango en vez de a mirar el precio.
  assert.equal(
    quedaFueraDelRango({ costoActual: 1000, costoNuevo: 11083.72, minPct: null, maxPct: null }),
    false
  );
  assert.equal(
    quedaFueraDelRango({ costoActual: 1000, costoNuevo: 11083.72, minPct: 2, maxPct: 15 }),
    true
  );
});

test("un costo que no se mueve no está fuera de rango", () => {
  // Si contara como afuera, toda fila SIN_CAMBIOS caería en la cola y el módulo
  // pediría decidir sobre productos donde no hay nada que decidir.
  assert.equal(
    quedaFueraDelRango({ costoActual: 1000, costoNuevo: 1000, minPct: 2, maxPct: 15 }),
    false
  );
});

test("la baja también está fuera de rango", () => {
  // Un rango de 2 a 15 dice que el proveedor AUMENTA. Un costo que baja un 7,6 %
  // —la otra lectura de la fila de la #5— tampoco es lo esperado, y antes pasaba
  // igual de callado que el +1.008 %.
  assert.equal(
    quedaFueraDelRango({ costoActual: 1000, costoNuevo: 923.64, minPct: 2, maxPct: 15 }),
    true
  );
});

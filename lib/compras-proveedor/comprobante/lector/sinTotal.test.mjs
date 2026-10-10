// EL PAPEL QUE NO TRAE TOTAL NO ES UN PAPEL MAL LEÍDO.
//
// Los datos NO son inventados: son las 21 líneas con cantidad de la planilla de
// Mauro, el único comprobante real que hay en producción, tal como quedaron
// leídas. Ese papel no tiene total, ni neto, ni IVA: es una planilla de pedido.
//
// Lo que estos candados fijan es la distinción que separa tres cosas que antes
// se decían con la misma palabra: la LECTURA falló (MAL_LEIDO), el PAPEL no
// cierra (DIFIERE), y el papel NO TRAE con qué verificar (SIN_TOTAL).
//
// Desde la segunda parte de la lectura interpretada (#165) la lectura llega
// como la da el modelo: cada renglón con su costo final. Los candados de la
// "segunda ecuación" —cantidad × precio contra el importe del renglón— se
// borraron con ella: era una regla de formato y ya no decide nada.

import test from "node:test";
import assert from "node:assert/strict";

import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { normalizarLectura } from "./contrato.js";

// La explicación con la que se leyó: la de los papeles sin factura de Mauro.
const RECETA_MAURO = { interpretada: true, explicacion: "Planilla de Mauro: el precio ya es el final.", tipoComprobante: "SIN_FACTURA" };

// Las 21 líneas CON CANTIDAD del papel real. Las otras 10 filas de la planilla
// están sin cantidad e importe cero, y no son mercadería de este comprobante.
const LINEAS_MAURO = [
  [40, 3360, 134400, "PHILIPS MORRIS 10"],
  [130, 2250, 292500, "PHILIPS SELECT RED KS"],
  [60, 5250, 315000, "PHILIPS MORRIS 20 KS"],
  [20, 5650, 113000, "PHILIPS MORRIS 20 CONV"],
  [20, 5650, 113000, "PHILIPS MORRIS 20 BOX"],
  [50, 3010, 150500, "CHESTERFIELD 10"],
  [30, 3010, 90300, "CHESTERFIELD 10 CONV"],
  [100, 4650, 465000, "CHESTERFIELD 20 KS"],
  [10, 4650, 46500, "CHESTERFIELD 20 CONV KS"],
  [20, 5050, 101000, "CHESTERFIELD 20 CONV BOX"],
  [20, 3700, 74000, "MARLBORO 10"],
  [10, 3700, 37000, "MARLBORO 10 FUSION UVA"],
  [20, 5800, 116000, "MARLBORO 20 KS"],
  [20, 6200, 124000, "MARLBORO 20 BOX"],
  [10, 6200, 62000, "MARLBORO 20 XL FUSION UVA"],
  [60, 4050, 243000, "M.CRAFTED 20 BOX CONV"],
  [20, 4050, 81000, "M.CRAFTED 20 BOX RED"],
  [10, 4050, 40500, "M.CRAFTED 20 BOX CORAL"],
  [20, 4050, 81000, "M.CRAFTED 20 BOX UVA"],
  [200, 3650, 730000, "M.CRAFTED 20 KS RED"],
  [100, 3650, 365000, "M.CRAFTED 20 CONV KS"],
].map(([cantidad, precioImpreso, importeImpreso, descripcion]) => ({
  cantidad, precioImpreso, importeImpreso, descripcion,
  // El precio de la planilla ya es el final: el costo del renglón es su importe.
  costoFinal: importeImpreso,
  tipo: "MERCADERIA",
}));

// Los valores por omisión van con `in` y no con `=`: un `undefined` pasado a
// propósito —"el lector no contestó"— tiene que llegar como tal.
const lectura = (a = {}) =>
  normalizarLectura(
    {
      // Una planilla no tiene identidad fiscal: ni tipo, ni punto de venta, ni número.
      identidad: {},
      lineas: LINEAS_MAURO,
      pie: a.pie,
      lineasEnElPapel: "lineasEnElPapel" in a ? a.lineasEnElPapel : 21,
      hayTotalImpreso: "hayTotalImpreso" in a ? a.hayTotalImpreso : false,
      consumo: { tokensEntrada: 1500, tokensSalida: 400, costoMicroUsd: 0 },
      modelo: "gemini-3.6-flash",
    },
    { interpretada: true }
  );

const puerta = (l) => pasarPorLaPuerta({ lectura: l, receta: RECETA_MAURO, recetaVersion: 1 });

// ── EL PREDICADO ───────────────────────────────────────────────────────────

test("un total en cero cuenta como ausente, que es lo que devuelve el modelo", () => {
  // Un modelo que no encuentra ningún total igual puede poner algo, y pone 0.
  // Medido con este papel. Tomarlo por total haría de la diferencia el
  // comprobante entero.
  const r = puerta(lectura({ pie: { total: 0 }, hayTotalImpreso: null }));
  assert.equal(r.estado, ESTADO.SIN_TOTAL);
  assert.equal(r.diferenciaCentavos, null);
});

// ── EL AGUJERO MÁS GRANDE QUE TUVO EL MÓDULO ───────────────────────────────
//
// `total` era un campo OBLIGATORIO del esquema. Obligado a poner un número
// donde no hay ninguno, el modelo pone el más plausible, y el más plausible es
// la suma de las líneas. Con eso la verificación compara la suma contra sí
// misma: cierra siempre, con cero de diferencia.
//
// MEDIDO el 2026-08-12 sobre la planilla de Mauro: tres corridas seguidas
// devolvieron 3.774.700, exactamente la suma de sus 21 líneas.

test("EL TOTAL CALCULADO NO PASA: el booleano manda sobre el número", () => {
  const r = puerta(lectura({ pie: { total: 3774700 }, hayTotalImpreso: false }));
  assert.equal(r.estado, ESTADO.SIN_TOTAL, "no cierra por un total que el papel no tiene");
  assert.equal(r.proponeCostos, false);
  assert.equal(r.cierra, false);
});

test("sin el booleano, la aritmética sola NO detecta el total inventado", () => {
  // Este candado NO exige que la aritmética lo atrape: documenta que NO PUEDE.
  // Es el motivo por el que hizo falta preguntar aparte, y si algún día alguien
  // saca el booleano pensando que la cuenta alcanza, esto le dice que no.
  const r = puerta(lectura({ pie: { total: 3774700 }, hayTotalImpreso: null }));
  assert.equal(r.cierra, true, "la suma contra sí misma cierra: por eso hace falta el booleano");
});

test("no haber contestado NO es decir que no hay total", () => {
  // El error simétrico: un false por omisión marcaría SIN_TOTAL a comprobantes
  // que sí traen total, y eso frenaría papeles buenos.
  for (const hayTotalImpreso of [null, undefined, true]) {
    const r = puerta(lectura({ pie: { total: 3774700 }, hayTotalImpreso }));
    assert.equal(r.estado, ESTADO.CARGADO, String(hayTotalImpreso));
  }
  assert.equal(puerta(lectura({ pie: { total: 3774700 }, hayTotalImpreso: false })).estado, ESTADO.SIN_TOTAL);
});

// ── LOS DOS NÚMEROS DEL CONTEO, GUARDADOS APARTE ───────────────────────────
//
// `lineasEnElPapel` es el único obligatorio que quedó siendo derivable —de la
// cantidad de líneas—, o sea la forma exacta del agujero del total. Se dejó con
// su defensa en el prompt y con los dos números guardados separados, para
// poder auditarlo con datos. Si nunca difieren, el prompt no está funcionando.

test("se guardan LOS DOS números, y no uno derivado del otro", () => {
  const r = puerta(lectura({ pie: {}, lineasEnElPapel: 21 }));
  assert.equal(r.aGuardar.lineasEnElPapel, 21, "lo que dijo VER");
  assert.equal(r.aGuardar.lineasTranscriptas, 21, "lo que efectivamente trajo");
});

test("cuando difieren, quedan los dos y se puede ver la diferencia", () => {
  const r = puerta(lectura({ pie: {}, lineasEnElPapel: 31 }));
  assert.equal(r.aGuardar.lineasEnElPapel, 31);
  assert.equal(r.aGuardar.lineasTranscriptas, 21);
});

test("si el lector no informó el conteo, eso queda en null y no en la cantidad de líneas", () => {
  // Completarlo con `lineas.length` sería fabricar la coincidencia que estamos
  // tratando de detectar.
  const r = puerta(lectura({ pie: {}, lineasEnElPapel: undefined }));
  assert.equal(r.aGuardar.lineasEnElPapel, null, "no lo dijo");
  assert.equal(r.aGuardar.lineasTranscriptas, 21, "esto sí es un hecho");
});

// ── LA FORMA REAL DEL DATO ─────────────────────────────────────────────────
//
// Sin la obligación de completar el total, el modelo no manda el campo: el pie
// viene sin `total` en absoluto. Ese camino salía por MAL_LEIDO hasta que se
// midió contra el papel real.

test("con el total OMITIDO —como llega de verdad— también es SIN_TOTAL", () => {
  const r = puerta(lectura({ pie: {}, hayTotalImpreso: false }));
  assert.equal(r.estado, ESTADO.SIN_TOTAL, "no MAL_LEIDO: la lectura fue perfecta");
  assert.equal(r.proponeCostos, false);
  assert.equal(r.diferenciaCentavos, null);
  assert.match(r.porque, /no trae total/i);
});

test("si dice que SÍ hay total y no lo trajo, eso sí es una lectura fallada", () => {
  // Un modelo que ve un total y no lo transcribe leyó mal, y taparlo con
  // SIN_TOTAL sería la mentira simétrica.
  assert.equal(puerta(lectura({ pie: {}, hayTotalImpreso: true })).estado, ESTADO.MAL_LEIDO);
});

test("sin contestar el booleano y sin total, sigue siendo MAL_LEIDO", () => {
  // No contestar no habilita nada: ante la duda, el estado que frena.
  assert.equal(puerta(lectura({ pie: {}, hayTotalImpreso: null })).estado, ESTADO.MAL_LEIDO);
});

// ── LA DISTINCIÓN, QUE ES TODO EL PUNTO ────────────────────────────────────

test("la planilla real queda en SIN_TOTAL, no en MAL_LEIDO, y no propone costos", () => {
  const r = puerta(lectura({ pie: {} }));
  assert.equal(r.estado, ESTADO.SIN_TOTAL);
  assert.equal(r.sinTotal, true);
  assert.equal(r.proponeCostos, false);
  assert.equal(r.cierra, false);
  // La diferencia va NULA y no en cero: un cero se leería como que cierra.
  assert.equal(r.diferenciaCentavos, null);
});

test("el texto dice las tres cosas, y no acusa al lector", () => {
  const r = puerta(lectura({ pie: {} }));
  assert.match(r.porque, /no trae total/i, "qué pasó");
  assert.match(r.porque, /no se puede verificar|no hay contra qué comparar/i, "por qué");
  assert.match(r.porque, /no se propone ningún costo/i, "y qué NO va a pasar");
  // No puede decir que se leyó mal: es justo lo que este estado vino a sacar.
  assert.doesNotMatch(r.porque, /mal leíd|se leyó mal|dígito mal leído/i);
  // Pero deja abierta la otra posibilidad, porque desde los números no se
  // distingue "el papel no lo trae" de "el modelo no lo encontró".
  assert.match(r.porque, /volvé a leerlo/i);
});

test("con total, el mismo papel cierra", () => {
  // La suma de los 21 costos es 3.774.700. Con ese total al pie, y el modelo
  // diciendo que lo VE impreso, cierra.
  const r = puerta(lectura({ pie: { total: 3774700 }, hayTotalImpreso: true }));
  assert.equal(r.estado, ESTADO.CARGADO, r.porque ?? "");
  assert.equal(r.cierra, true);
  assert.equal(r.proponeCostos, true);
});

// ── EL CONTEO DE RENGLONES, CON EL CRITERIO CORREGIDO ──────────────────────

test("21 con cantidad contra 21 transcriptas: NINGÚN aviso", () => {
  // Es el caso real. Antes el lector contaba las 31 filas de la grilla y avisaba
  // en rojo que faltaban 10, sobre una transcripción completa.
  const r = puerta(lectura({ pie: {}, lineasEnElPapel: 21 }));
  assert.equal(r.faltanLineas, null, "no falta ninguno");
  assert.equal(r.avisoLineas, null, "y por lo tanto no hay nada que avisar");
});

test("el aviso sigue saliendo cuando de verdad falta un renglón con cantidad", () => {
  // El control no se aflojó: si el lector ve 22 con cantidad y transcribió 21,
  // avisa. Es para lo que existe.
  const r = puerta(lectura({ pie: {}, lineasEnElPapel: 22 }));
  assert.deepEqual(r.faltanLineas, { declaradas: 22, transcriptas: 21, faltan: 1 });
  assert.match(r.avisoLineas, /falta 1/);
});

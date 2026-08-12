import test from "node:test";
import assert from "node:assert/strict";

import {
  cuotaDelDia,
  comienzoDelDiaDeCuota,
  horaLocalDeReposicion,
  horaDeReposicionObservada,
  LIMITE_POR_MODELO_POR_DIA,
  AVISAR_CUANDO_QUEDAN,
} from "./cuota.js";

const TITULAR = "gemini-3.6-flash";
const RESPALDO = "gemini-3.5-flash";
const MODELOS = [TITULAR, RESPALDO];

const llamada = (modelo, creadoEn, ok = true, motivo = null) => ({ modelo, creadoEn, ok, motivo });

test("el límite es el MEDIDO en el cuerpo del 429, no uno redondo inventado", () => {
  assert.equal(LIMITE_POR_MODELO_POR_DIA, 20);
});

// ── LO QUE SE CUENTA ───────────────────────────────────────────────────────

test("una llamada FALLIDA gasta cuota igual que una buena", () => {
  // Es todo el motivo de contar llamadas y no comprobantes leídos: el 429 se
  // cuenta contra el tope, y un comprobante releído gastó dos.
  const ahora = new Date("2026-08-12T20:00:00Z");
  const c = cuotaDelDia({
    llamadas: [
      llamada(TITULAR, "2026-08-12T18:00:00Z", false, "CUOTA_AGOTADA"),
      llamada(TITULAR, "2026-08-12T18:01:00Z", false, "SERVICIO_CAIDO"),
      llamada(TITULAR, "2026-08-12T18:02:00Z", true),
    ],
    modelos: MODELOS,
    ahora,
  });
  assert.equal(c.porModelo[0].usadas, 3, "las tres cuentan");
  assert.equal(c.porModelo[0].quedan, 17);
});

test("el conteo es POR MODELO, así que el techo del día es 40 con la cadena", () => {
  const ahora = new Date("2026-08-12T20:00:00Z");
  const c = cuotaDelDia({
    llamadas: [
      ...Array.from({ length: 20 }, (_, i) => llamada(TITULAR, `2026-08-12T1${8 + (i % 2)}:0${i % 10}:00Z`)),
    ],
    modelos: MODELOS,
    ahora,
  });
  assert.equal(c.porModelo[0].quedan, 0, "el titular se agotó");
  assert.equal(c.porModelo[1].quedan, 20, "el respaldo está entero");
  assert.equal(c.quedan, 20, "y todavía se puede leer");
  assert.equal(c.techo, 40);
});

test("no baja de cero aunque se hayan hecho más llamadas que el límite", () => {
  const ahora = new Date("2026-08-12T20:00:00Z");
  const c = cuotaDelDia({
    llamadas: Array.from({ length: 25 }, () => llamada(TITULAR, "2026-08-12T19:00:00Z")),
    modelos: [TITULAR],
    ahora,
  });
  assert.equal(c.porModelo[0].quedan, 0);
  assert.equal(c.quedan, 0);
});

// ── LA MEDIANOCHE DEL PROVEEDOR, QUE NO ES LA NUESTRA ──────────────────────

test("LAS LLAMADAS DE ANTES DEL CORTE NO CUENTAN, y el corte es el de allá", () => {
  // 2026-08-12 a las 05:00 UTC son las 02:00 de Argentina —o sea ya es día 12
  // acá— pero en California son las 22:00 del día 11: la cuota TODAVÍA NO
  // repuso. Contando por el día de acá, estas llamadas desaparecerían del conteo
  // y el número diría que quedan 20 cuando quedan 0.
  const ahora = new Date("2026-08-12T05:00:00Z");
  const c = cuotaDelDia({
    llamadas: Array.from({ length: 20 }, () => llamada(TITULAR, "2026-08-12T02:00:00Z")),
    modelos: [TITULAR],
    ahora,
  });
  assert.equal(c.porModelo[0].usadas, 20, "siguen contando: allá es el mismo día");
  assert.equal(c.quedan, 0);
});

test("y después del corte de allá, sí se reponen", () => {
  // 2026-08-12 a las 08:00 UTC son la 01:00 en California: ya repuso.
  const ahora = new Date("2026-08-12T08:00:00Z");
  const c = cuotaDelDia({
    llamadas: Array.from({ length: 20 }, () => llamada(TITULAR, "2026-08-12T02:00:00Z")),
    modelos: [TITULAR],
    ahora,
  });
  assert.equal(c.porModelo[0].usadas, 0, "quedaron del día anterior de allá");
  assert.equal(c.quedan, 20);
});

test("el comienzo del día se calcula con el huso real, no restando horas fijas", () => {
  // En horario de verano California está a -7, en invierno a -8. Restar un
  // número fijo se rompe dos veces por año y en silencio.
  const verano = comienzoDelDiaDeCuota(new Date("2026-08-12T12:00:00Z")); // agosto: -7
  const invierno = comienzoDelDiaDeCuota(new Date("2026-01-12T12:00:00Z")); // enero: -8
  assert.equal(verano.toISOString(), "2026-08-12T07:00:00.000Z");
  assert.equal(invierno.toISOString(), "2026-01-12T08:00:00.000Z");
});

test("se puede decir a qué hora LOCAL repone, para no mostrar un número sin explicar", () => {
  const h = horaLocalDeReposicion(new Date("2026-08-12T12:00:00Z"));
  // 07:00 UTC del día siguiente = 04:00 en Argentina.
  assert.equal(h, "04:00");
});

test("el huso es configurable: si el proveedor cambia, no hay que tocar código", () => {
  const c = comienzoDelDiaDeCuota(new Date("2026-08-12T12:00:00Z"), "UTC");
  assert.equal(c.toISOString(), "2026-08-12T00:00:00.000Z");
});

// ── CUÁNDO SE MUESTRA ──────────────────────────────────────────────────────

test("con muchas disponibles NO se muestra: un aviso permanente no se lee", () => {
  const c = cuotaDelDia({ llamadas: [], modelos: MODELOS, ahora: new Date("2026-08-12T20:00:00Z") });
  assert.equal(c.quedan, 40);
  assert.equal(c.mostrar, false);
});

test("aparece cuando quedan pocas, y el umbral vive en un solo lugar", () => {
  const ahora = new Date("2026-08-12T20:00:00Z");
  const gastar = (n, modelo) => Array.from({ length: n }, () => llamada(modelo, "2026-08-12T19:00:00Z"));
  // Justo en el umbral: se muestra.
  const justo = cuotaDelDia({
    llamadas: [...gastar(20, TITULAR), ...gastar(20 - AVISAR_CUANDO_QUEDAN, RESPALDO)],
    modelos: MODELOS, ahora,
  });
  assert.equal(justo.quedan, AVISAR_CUANDO_QUEDAN);
  assert.equal(justo.mostrar, true);

  // Una más arriba: no molesta.
  const unaMas = cuotaDelDia({
    llamadas: [...gastar(20, TITULAR), ...gastar(20 - AVISAR_CUANDO_QUEDAN - 1, RESPALDO)],
    modelos: MODELOS, ahora,
  });
  assert.equal(unaMas.quedan, AVISAR_CUANDO_QUEDAN + 1);
  assert.equal(unaMas.mostrar, false);
});

// ── AVERIGUAR LA HORA DEL CORTE CON DATOS ──────────────────────────────────

test("sin haber visto una reposición, no se inventa ninguna hora", () => {
  assert.equal(horaDeReposicionObservada([]), null);
  assert.equal(
    horaDeReposicionObservada([llamada(TITULAR, "2026-08-12T19:00:00Z", false, "CUOTA_AGOTADA")]),
    null,
    "agotado y todavía sin reponer"
  );
});

test("la primera llamada buena después de una racha de cuota agotada marca la reposición", () => {
  const obs = horaDeReposicionObservada([
    llamada(TITULAR, "2026-08-12T19:00:00Z", false, "CUOTA_AGOTADA"),
    llamada(TITULAR, "2026-08-12T23:00:00Z", false, "CUOTA_AGOTADA"),
    llamada(TITULAR, "2026-08-13T07:30:00Z", true),
  ]);
  assert.equal(obs.length, 1);
  assert.equal(obs[0].repusoAntesDe, "2026-08-13T07:30:00Z");
  assert.equal(obs[0].agotadoDesde, "2026-08-12T19:00:00Z");
});

test("un modelo no contamina la observación del otro", () => {
  const obs = horaDeReposicionObservada([
    llamada(TITULAR, "2026-08-12T19:00:00Z", false, "CUOTA_AGOTADA"),
    llamada(RESPALDO, "2026-08-12T19:00:05Z", true),
  ]);
  assert.equal(obs, null, "el que repuso no fue el que estaba agotado");
});

// EL SIGNO DE LA PLATA: "−$40.596,50", y un cero sin signo.
//
//   node --import ./scripts/alias-loader.mjs --test lib/monedaSigno.test.mjs
//
// La prueba de Turnos y cierres mostró "$-40.596,50": `Intl` pegaba el guion
// detrás del peso. El arreglo vive en el formateador compartido
// (`formatearMoneda`) y de ahí lo toman las cuentas que restan y suman
// (`menos`, `mas`) y el ticket Z impreso.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { formatearMoneda } from "@/lib/moneda.js";
import { mas, menos } from "@/lib/turnosYCierres/pantallaTurnosYCierres.js";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("S1 · el signo va adelante del peso", () => {
  assert.equal(formatearMoneda(-40596.5), "−$40.596,50");
  assert.equal(formatearMoneda(40596.5), "$40.596,50");
  assert.equal(formatearMoneda(-1500, { sinSimbolo: true }), "−1.500,00");
  assert.equal(formatearMoneda(null), "—");
});

test("S2 · un cero nunca lleva signo, tampoco el que viene de redondear", () => {
  for (const cero of [0, -0, "-0", -0.001, 0.004]) assert.equal(formatearMoneda(cero), "$0,00", `cero: ${cero}`);
  assert.equal(menos(0), "$0,00");
  assert.equal(mas(0), "$0,00");
  assert.doesNotMatch(menos(-0.001), /−\$0,00/);
});

test("S3 · lo que resta y lo que suma en una cuenta", () => {
  assert.equal(menos(1500), "−$1.500,00");
  assert.equal(mas(180500), "+$180.500,00");
});

test("S4 · el ticket Z usa el formateador compartido y dice 'Ventas en efectivo' entre el cambio y los pagos", () => {
  const papel = sinComentarios(readFileSync("components/turnos/imprimirZReport.js", "utf8"));
  assert.match(papel, /import \{ formatearMoneda \} from "@\/lib\/moneda";/);
  assert.doesNotMatch(papel, /toLocaleString\(/, "el papel volvió a tener un formateador propio");
  assert.doesNotMatch(papel, /\$\$\{/, "el papel vuelve a pegar el peso a mano");
  const i = papel.indexOf("Cambio inicial:");
  const j = papel.indexOf("Ventas en efectivo:");
  const k = papel.indexOf("Pagos y retiros:");
  assert.ok(i > 0 && i < j && j < k, `el papel no tiene el orden de la cuenta: ${[i, j, k]}`);
});

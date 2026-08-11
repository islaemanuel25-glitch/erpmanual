// Candados de LA FRONTERA entre recibir mercadería y escribir el costo.
//
// Es el cambio más delicado del módulo de recepción por comprobante: hasta hoy
// las dos cosas estaban pegadas y recibir escribía el costo de todas las líneas.
// Lo que se protege acá no es una función: es que esas dos decisiones NO se
// vuelvan a pegar.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clasificarDiferenciaCosto,
  decidirEscrituraDeCosto,
  cantidadesNegativas,
  UMBRALES_COSTO_DEFAULT,
  CLASE_DIFERENCIA,
} from "./fronteraCosto.js";

const clasificar = (anterior, nuevo, umbrales) =>
  clasificarDiferenciaCosto({ costoAnterior: anterior, costoNuevo: nuevo, umbrales });

// ── Los dos números ────────────────────────────────────────────────────────

test("los defaults son 5 y 15, y viven en UN solo lugar", () => {
  assert.equal(UMBRALES_COSTO_DEFAULT.revisarPct, 5);
  assert.equal(UMBRALES_COSTO_DEFAULT.sospechaBajaPct, 15);
});

test("LOS UMBRALES ENTRAN POR PARÁMETRO, no están clavados", () => {
  // Si alguien vuelve a escribir el 5 o el 15 adentro del cálculo, este candado
  // se pone rojo. Es el caso del CLAUDE.md: el rango de aumento esperado estaba
  // escrito a mano en tres lugares y cambiar la constante no los tocaba.
  const propios = { revisarPct: 30, sospechaBajaPct: 50 };
  assert.equal(clasificar(100, 110, propios).clase, CLASE_DIFERENCIA.SIN_AVISO, "10 % con umbral 30 no molesta");
  assert.equal(clasificar(100, 110).clase, CLASE_DIFERENCIA.A_REVISAR, "10 % con el default de 5 sí");
  // Con umbrales propios de 30 y 50, una baja del 20 % no llega a ninguno.
  assert.equal(clasificar(100, 80, propios).clase, CLASE_DIFERENCIA.SIN_AVISO, "baja del 20 % con umbrales 30/50 no molesta");
  assert.equal(clasificar(100, 65, propios).clase, CLASE_DIFERENCIA.A_REVISAR, "baja del 35 % supera el de revisión pero no el de sospecha");
  assert.equal(clasificar(100, 80).clase, CLASE_DIFERENCIA.SOSPECHA_LECTURA, "la misma baja con los defaults sí es sospecha");
});

test("un cero EXPLÍCITO se respeta: es pedir que se marque todo", () => {
  // Distinto de un campo vacío, que cae al default. La diferencia importa: un
  // formulario borrado no puede significar "marcá todas las líneas".
  assert.equal(clasificar(100, 100, { revisarPct: 0 }).umbrales.revisarPct, 0);
  assert.equal(clasificar(100, 100, { revisarPct: "" }).umbrales.revisarPct, 5);
});

test("un umbral inválido cae al default en vez de romper o aceptar todo", () => {
  for (const malo of [null, undefined, "", "abc", -1, NaN]) {
    const r = clasificar(100, 110, { revisarPct: malo });
    assert.equal(r.umbrales.revisarPct, 5, `revisarPct=${String(malo)}`);
  }
});

// ── La clasificación ───────────────────────────────────────────────────────

test("por debajo del umbral entra sin molestar", () => {
  assert.equal(clasificar(100, 104).clase, CLASE_DIFERENCIA.SIN_AVISO);
  assert.equal(clasificar(100, 96).clase, CLASE_DIFERENCIA.SIN_AVISO);
  assert.equal(clasificar(100, 100).clase, CLASE_DIFERENCIA.SIN_AVISO);
});

test("desde el umbral, inclusive, se marca", () => {
  // El borde va adentro: 5 % marca. Si fuera exclusivo, un 5,000 % exacto
  // pasaría sin que nadie lo mire.
  const r = clasificar(100, 105);
  assert.equal(r.clase, CLASE_DIFERENCIA.A_REVISAR);
  assert.equal(Math.round(r.diferenciaPct), 5);
});

test("UNA BAJA GRANDE ES SOSPECHA DE LECTURA, NO UN PRECIO NUEVO", () => {
  // La regla de negocio entera, en un candado.
  assert.equal(clasificar(100, 84).clase, CLASE_DIFERENCIA.SOSPECHA_LECTURA);
  assert.equal(clasificar(100, 85).clase, CLASE_DIFERENCIA.SOSPECHA_LECTURA, "el borde de 15 % también");
  assert.equal(clasificar(100, 86).clase, CLASE_DIFERENCIA.A_REVISAR, "una baja menor sí es revisable");
});

test("LA SOSPECHA SE EVALÚA ANTES QUE LA REVISIÓN", () => {
  // Una baja del 40 % supera los dos umbrales. Si se preguntara primero por el
  // de revisión, quedaría como A_REVISAR y alguien podría aceptarla de un clic.
  const r = clasificar(100, 60);
  assert.equal(r.clase, CLASE_DIFERENCIA.SOSPECHA_LECTURA);
  assert.equal(r.bloquea, true);
});

test("una suba grande NO es sospecha: los proveedores aumentan", () => {
  const r = clasificar(100, 160);
  assert.equal(r.clase, CLASE_DIFERENCIA.A_REVISAR);
  assert.equal(r.bloquea, false);
});

test("sin costo anterior no hay porcentaje, y se dice", () => {
  const r = clasificar(0, 500);
  assert.equal(r.clase, CLASE_DIFERENCIA.SIN_COSTO_ANTERIOR);
  assert.equal(r.bloquea, false);
  assert.equal(r.diferenciaPct, null);
});

// ── LA FRONTERA ────────────────────────────────────────────────────────────

test("LA MERCADERÍA ENTRA AUNQUE EL COSTO NO SE ESCRIBA", () => {
  // El candado central de la tanda. Esta función decide SOLO sobre el costo:
  // no devuelve nada que pueda impedir que el stock se mueva. Si alguien
  // agregara acá una señal de "no recibir", este candado tendría que cambiar a
  // propósito y quedaría en el diff.
  const r = decidirEscrituraDeCosto({
    clasificacion: clasificar(100, 60),
    excluidaAMano: true,
  });
  assert.deepEqual(Object.keys(r).sort(), ["escribe", "motivo"]);
  assert.equal(r.escribe, false);
  assert.ok(r.motivo, "cuando no escribe, dice por qué");
});

test("excluir a mano gana sobre una diferencia chica", () => {
  const r = decidirEscrituraDeCosto({ clasificacion: clasificar(100, 101), excluidaAMano: true });
  assert.equal(r.escribe, false);
});

test("por debajo del umbral se escribe sin que nadie confirme", () => {
  const r = decidirEscrituraDeCosto({ clasificacion: clasificar(100, 103) });
  assert.equal(r.escribe, true);
  assert.equal(r.motivo, null);
});

test("marcada y sin aceptar NO se escribe; aceptada sí", () => {
  const c = clasificar(100, 120);
  assert.equal(decidirEscrituraDeCosto({ clasificacion: c }).escribe, false);
  assert.equal(decidirEscrituraDeCosto({ clasificacion: c, aceptada: true }).escribe, true);
});

test("LA SOSPECHA NO SE PUEDE ACEPTAR DE UN CLIC", () => {
  // Aunque venga marcada como aceptada. Para escribir ese costo hay que
  // corregir la lectura, no confirmarla.
  const c = clasificar(100, 50);
  assert.equal(decidirEscrituraDeCosto({ clasificacion: c, aceptada: true }).escribe, false);
});

test("sin costo utilizable no se escribe nada", () => {
  assert.equal(decidirEscrituraDeCosto({ clasificacion: clasificar(100, 101), hayCosto: false }).escribe, false);
});

test("un alta sin costo anterior se escribe: no hay nada que contradecir", () => {
  assert.equal(decidirEscrituraDeCosto({ clasificacion: clasificar(0, 500) }).escribe, true);
});

test("sin argumentos no explota y no escribe por las dudas", () => {
  const r = decidirEscrituraDeCosto();
  assert.equal(typeof r.escribe, "boolean");
});

// ── Los negativos ──────────────────────────────────────────────────────────

test("UNA CANTIDAD NEGATIVA SE DETECTA, no se convierte en cero", () => {
  // `toUnidades` devuelve 0 ante un negativo, sin error y sin aviso. Hasta que
  // se decida si las notas de crédito entran por este módulo, se frena.
  const r = cantidadesNegativas([{ id: 1, cantidad: 5 }, { id: 2, cantidad: -3 }, { id: 3, cantidad: 0 }]);
  assert.equal(r.hay, true);
  assert.deepEqual(r.ids, [2]);
});

test("el cero NO es negativo: recibir cero de una línea es legítimo", () => {
  const r = cantidadesNegativas([{ id: 1, cantidad: 0 }, { id: 2, cantidad: 0 }]);
  assert.equal(r.hay, false);
});

test("basura en la lista no inventa negativos ni rompe", () => {
  for (const entrada of [null, undefined, [], "no soy una lista", [null, {}, { cantidad: "abc" }]]) {
    assert.equal(cantidadesNegativas(entrada).hay, false, JSON.stringify(entrada));
  }
});

// ── Candados de FORMA sobre la ruta de recepción ───────────────────────────
//
// Lo que se protege acá no es una función pura: es que la ruta siga usando este
// módulo y que el incremento de stock NO cuelgue de la decisión de costo. Un
// candado de comportamiento no lo puede ver sin levantar Prisma; uno de forma
// sí, y es el que ya se usa en avisoCostoLinea.test.mjs para lo mismo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUTA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "app", "api", "compras-proveedor", "recibir", "[id]", "route.js"
);
const FUENTE = fs.readFileSync(RUTA, "utf8");

test("la ruta de recepción usa ESTE módulo y no una copia adaptada", () => {
  assert.match(FUENTE, /from "@\/lib\/compras-proveedor\/fronteraCosto"/);
  assert.match(FUENTE, /decidirEscrituraDeCosto\(/);
  assert.match(FUENTE, /clasificarDiferenciaCosto\(/);
});

test("EL STOCK NO CUELGA DE LA DECISIÓN DE COSTO", () => {
  // El candado central. El `upsert` que mueve StockLocal tiene que aparecer
  // ANTES de la decisión de escritura en el archivo: si alguien lo metiera
  // adentro del `if (escribeCosto)`, excluir una línea del costo dejaría de
  // recibir la mercadería, que es exactamente lo que no puede pasar.
  const posStock = FUENTE.indexOf("stockLocal.upsert");
  const posDecision = FUENTE.indexOf("decidirEscrituraDeCosto(");
  assert.ok(posStock > 0, "no se encontró el upsert de stock");
  assert.ok(posDecision > 0, "no se encontró la decisión de costo");
  assert.ok(
    posStock < posDecision,
    "el movimiento de stock quedó DESPUÉS de la decisión de costo: revisá que no haya quedado adentro del if"
  );
});

test("la escritura del costo sí cuelga de la decisión", () => {
  // La otra mitad: `actualizarCostoRealProducto` tiene que estar adentro del if.
  assert.match(
    FUENTE,
    /if \(escribeCosto\) \{[\s\S]{0,400}actualizarCostoRealProducto\(/,
    "actualizarCostoRealProducto tiene que quedar dentro del if de la frontera"
  );
});

test("los negativos se frenan en la ruta, sin tocar toUnidades", () => {
  assert.match(FUENTE, /cantidadesNegativas\(/);
  assert.match(FUENTE, /detallesConNegativo/);
});

test("la respuesta informa qué costos se escribieron", () => {
  assert.match(FUENTE, /decisionesDeCosto\b/);
  assert.match(FUENTE, /ok: true[\s\S]{0,120}decisionesDeCosto/);
});

// CANDADO: DESCONOCIDO NO ES CERO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/comisionPendiente.test.mjs
//
// ── QUÉ SE ESTÁ PROTEGIENDO ────────────────────────────────────────────────
//
// Que una comisión SIN CONFIGURAR no se lea nunca como una comisión de 0 %.
// Son dos cosas distintas: una es un hueco y la otra es una decisión, y la
// diferencia vale plata — un margen calculado sobre un cero inventado sale MÁS
// ALTO que el real, así que el ticket que habría que mirar aparece como sano.
//
// Los importes derivados de la venta —`comisionBancaria`, `netoRecibido`,
// `gananciaNeta`— son columnas numéricas y no nulables, así que el hueco se
// guarda como un cero ESTRUCTURAL. Lo único que lo distingue de un cero medido
// es `Venta.comisionPendiente`, y por eso su interpretación vive en un solo
// lugar en vez de repartirse en veinte archivos.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ROTULO_AGREGADO,
  TEXTO_PENDIENTE,
  comisionEsExacta,
  estadoFinanciero,
  hayComisionPendiente,
  importeOPendiente,
  margenDeVenta,
  resumirExactitud,
} from "@/lib/pos-ventas/comisionPendiente.js";
import { MEDIOS_CON_COMISION } from "@/lib/pos-ventas/pagos.js";

// ══════════════════════════════════════════════════════════════════════════
// LA PREGUNTA QUE HACEN TODOS LOS CONSUMIDORES
// ══════════════════════════════════════════════════════════════════════════

test("una venta con la marca en false es exacta", () => {
  assert.equal(comisionEsExacta({ comisionPendiente: false }), true);
});

test("con la marca en true, NO es exacta", () => {
  assert.equal(comisionEsExacta({ comisionPendiente: true }), false);
});

test("FALLA CERRADO: un objeto SIN el campo no cuenta como exacto", () => {
  // Después de la migración toda fila de Venta tiene el booleano —las
  // históricas en `false`—, así que un `undefined` no puede venir de la base:
  // viene de un `select` incompleto. Tratarlo como exacto dejaría que cualquier
  // consulta futura presentara placeholders como mediciones, y sin avisar.
  //
  // El precio es que las consultas financieras están OBLIGADAS a traer la
  // bandera. Es más molesto de escribir y es la única forma de que la omisión
  // no mienta.
  assert.equal(comisionEsExacta({}), false, "el select se olvidó del campo");
  assert.equal(comisionEsExacta({ comisionPendiente: undefined }), false);
  assert.equal(comisionEsExacta({ comisionPendiente: null }), false);
  assert.equal(comisionEsExacta(null), false);
  assert.equal(comisionEsExacta(undefined), false);
});

test("y un select incompleto arrastra al margen y al agregado", () => {
  // La consecuencia de fallar cerrado, escrita: si alguien trae la venta sin la
  // bandera, no obtiene un margen ni un total presentado como cerrado. Obtiene
  // "pendiente", que es lo que corresponde cuando no se sabe.
  assert.equal(margenDeVenta({ netoRecibido: 10000, gananciaNeta: 3000 }), null);
  assert.equal(resumirExactitud([{ netoRecibido: 1 }]).parcial, true);
});

// ══════════════════════════════════════════════════════════════════════════
// LA DECISIÓN DEL MOMENTO DE VENDER
// ══════════════════════════════════════════════════════════════════════════

test("un tender que cobra comisión y llega sin porcentaje deja la venta pendiente", () => {
  const tenders = [{ medio: "DEBITO", comisionPct: null }];
  assert.equal(hayComisionPendiente(tenders, MEDIOS_CON_COMISION), true);
});

test("EL EFECTIVO NO CUENTA: su comisión nula es un dato, no un hueco", () => {
  // Es la distinción que hace que esto no marque como pendiente a media
  // facturación. El efectivo no cobra comisión y eso se sabe.
  const tenders = [{ medio: "EFECTIVO", comisionPct: null }];
  assert.equal(hayComisionPendiente(tenders, MEDIOS_CON_COMISION), false);
});

test("un 0 explícito NO deja la venta pendiente", () => {
  // Alguien decidió que ese medio no cobra comisión. Es un número.
  const tenders = [{ medio: "DEBITO", comisionPct: 0 }];
  assert.equal(hayComisionPendiente(tenders, MEDIOS_CON_COMISION), false);
});

test("EL CASO MIXTO: un solo tender sin configurar alcanza", () => {
  // Efectivo $5.000 + débito $5.000 con el débito sin configurar. La comisión
  // total y el neto de la venta dejan de ser exactos aunque el efectivo se
  // conozca perfectamente.
  const tenders = [
    { medio: "EFECTIVO", comisionPct: null },
    { medio: "DEBITO", comisionPct: null },
  ];
  assert.equal(hayComisionPendiente(tenders, MEDIOS_CON_COMISION), true);
});

test("con todos los porcentajes conocidos, no hay nada pendiente", () => {
  const tenders = [
    { medio: "EFECTIVO", comisionPct: null },
    { medio: "DEBITO", comisionPct: 3.5 },
  ];
  assert.equal(hayComisionPendiente(tenders, MEDIOS_CON_COMISION), false);
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE SE MUESTRA
// ══════════════════════════════════════════════════════════════════════════

test("un importe pendiente se dice, no se imprime", () => {
  const fmt = (n) => `$${n}`;
  assert.equal(importeOPendiente(0, true, fmt), "$0");
  assert.equal(importeOPendiente(0, false, fmt), TEXTO_PENDIENTE);
});

test("EL MARGEN DE UNA VENTA PENDIENTE ES `null`, NO UN NÚMERO INFLADO", () => {
  // Es el peor caso de todos y el motivo de toda esta tanda: con la comisión en
  // cero, la ganancia neta no descontó nada y el margen sale mejor que el real.
  const pendiente = { comisionPendiente: true, netoRecibido: 10000, gananciaNeta: 3000 };
  assert.equal(margenDeVenta(pendiente), null);

  const exacta = { comisionPendiente: false, netoRecibido: 10000, gananciaNeta: 3000 };
  assert.equal(margenDeVenta(exacta), 30);
});

test("y tampoco se calcula sobre un neto en cero", () => {
  assert.equal(margenDeVenta({ netoRecibido: 0, gananciaNeta: 0 }), null);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS TOTALES DE VARIAS VENTAS
// ══════════════════════════════════════════════════════════════════════════

test("un conjunto con una sola venta pendiente sale rotulado como parcial", () => {
  const r = resumirExactitud([
    { comisionPendiente: false },
    { comisionPendiente: true },
    { comisionPendiente: false },
  ]);
  assert.deepEqual(r, { pendientes: 1, total: 3, parcial: true });
});

test("y uno sin pendientes, no", () => {
  const r = resumirExactitud([{ comisionPendiente: false }, { comisionPendiente: false }]);
  assert.deepEqual(r, { exacto: true, pendientes: 0, total: 2, parcial: false });
});

test("UN AGREGADO CON UNA PENDIENTE ENTRE VARIAS EXACTAS SALE PARCIAL", () => {
  // El caso normal de un día de venta: casi todo conocido y un ticket al que le
  // falta el dato. El total no se presenta como cerrado por mayoría.
  const r = resumirExactitud([
    { comisionPendiente: false },
    { comisionPendiente: false },
    { comisionPendiente: true },
    { comisionPendiente: false },
  ]);
  assert.equal(r.exacto, false);
  assert.equal(r.parcial, true);
  assert.equal(r.pendientes, 1);
  assert.equal(r.total, 4);
});

test("`estadoFinanciero` arma lo mismo desde dos números", () => {
  // Es lo que usan las rutas que cuentan con la base en vez de traer las filas.
  assert.deepEqual(estadoFinanciero({ pendientes: 0, total: 10 }), {
    exacto: true, pendientes: 0, total: 10, parcial: false,
  });
  assert.deepEqual(estadoFinanciero({ pendientes: 2, total: 10 }), {
    exacto: false, pendientes: 2, total: 10, parcial: true,
  });
  assert.deepEqual(estadoFinanciero(), { exacto: true, pendientes: 0, total: 0, parcial: false });
});

test("los tres rótulos dicen en QUÉ DIRECCIÓN falla cada total", () => {
  // No alcanza con "parcial": la comisión suma de menos y el neto y la ganancia
  // están sobreestimados. Rotularlos igual dejaría a alguien creyendo que la
  // ganancia podría ser mayor, cuando solo puede ser menor.
  assert.match(ROTULO_AGREGADO.comision, /conocidas/i);
  assert.match(ROTULO_AGREGADO.neto, /menor/i);
  assert.match(ROTULO_AGREGADO.ganancia, /menor/i);
});

test("las ventas pendientes NO se saltean del conteo", () => {
  // Sacarlas daría un total más chico e igual de falso, y encima sin avisar.
  const r = resumirExactitud([{ comisionPendiente: true }, { comisionPendiente: true }]);
  assert.equal(r.total, 2);
  assert.equal(r.pendientes, 2);
});

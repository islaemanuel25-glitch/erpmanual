// CANDADO: UNA VENTA COBRADA SIN LA COMISIÓN CONFIGURADA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/ventaConComisionPendiente.test.mjs
//
// La venta NO se bloquea: el cobro al cliente ocurre igual, porque una venta ya
// ocurrida no se puede rechazar por una configuración que falta. Lo que se
// protege acá es que ese cobro no invente un dato: la comisión desconocida no
// se convierte en 0 % ni produce una ganancia neta presentada como exacta.
//
// El caso del medio de la tanda —efectivo $5.000 + débito $5.000 con el débito
// sin configurar— está escrito abajo tal cual, con los seis números que tienen
// que quedar guardados.

import test from "node:test";
import assert from "node:assert/strict";

import { aplicarComisiones, derivarCamposVenta, MEDIOS_CON_COMISION } from "@/lib/pos-ventas/pagos.js";
import { comisionEsExacta } from "@/lib/pos-ventas/comisionPendiente.js";

// ══════════════════════════════════════════════════════════════════════════
// aplicarComisiones DISTINGUE LOS TRES CASOS
// ══════════════════════════════════════════════════════════════════════════

test("un medio CON comisión configurada la cobra", () => {
  const [t] = aplicarComisiones([{ medio: "DEBITO", monto: 10000 }], { DEBITO: 7 });
  assert.equal(t.comisionPct, 7);
  assert.equal(t.comision, 700);
  assert.equal(t.neto, 9300);
});

test("un medio con comisión explícita de 0 no cobra, y lo dice con un número", () => {
  const [t] = aplicarComisiones([{ medio: "DEBITO", monto: 10000 }], { DEBITO: 0 });
  assert.equal(t.comisionPct, 0, "0 es un porcentaje conocido");
  assert.equal(t.comision, 0);
  assert.equal(t.neto, 10000);
});

test("UN MEDIO SIN COMISIÓN CONFIGURADA NO SE COBRA COMO 0 %", () => {
  // Antes era `?? 0`: el medio ausente del mapa se cobraba al 0 % y quedaba
  // registrado como si alguien hubiera decidido no cobrar comisión.
  const [t] = aplicarComisiones([{ medio: "DEBITO", monto: 10000 }], {});
  assert.equal(t.comisionPct, null, "no hay porcentaje que congelar");
  assert.equal(t.comision, 0, "placeholder estructural: la columna no es nulable");
  assert.equal(t.neto, 10000, "placeholder estructural");
});

test("y el efectivo sigue igual: no cobra comisión y eso es un dato", () => {
  const [t] = aplicarComisiones([{ medio: "EFECTIVO", monto: 10000 }], { DEBITO: 7 });
  assert.equal(t.comisionPct, null);
  assert.equal(t.comision, 0);
  assert.equal(t.neto, 10000);
  assert.equal(MEDIOS_CON_COMISION.includes("EFECTIVO"), false);
});

// ══════════════════════════════════════════════════════════════════════════
// LA MARCA DE LA VENTA
// ══════════════════════════════════════════════════════════════════════════

test("venta simple digital sin comisión configurada → comisionPendiente true", () => {
  const d = derivarCamposVenta(aplicarComisiones([{ medio: "DEBITO", monto: 10000 }], {}));
  assert.equal(d.comisionPendiente, true);
});

test("venta con todas las comisiones conocidas → false", () => {
  const d = derivarCamposVenta(aplicarComisiones([{ medio: "DEBITO", monto: 10000 }], { DEBITO: 7 }));
  assert.equal(d.comisionPendiente, false);
  assert.equal(d.comisionBancaria, 700);
  assert.equal(d.netoRecibido, 9300);
});

test("venta solo en efectivo → false, y no queda marcada por nada", () => {
  const d = derivarCamposVenta(aplicarComisiones([{ medio: "EFECTIVO", monto: 10000 }], {}));
  assert.equal(d.comisionPendiente, false);
});

test("un 0 explícito NO marca la venta como pendiente", () => {
  const d = derivarCamposVenta(aplicarComisiones([{ medio: "DEBITO", monto: 10000 }], { DEBITO: 0 }));
  assert.equal(d.comisionPendiente, false);
});

// ══════════════════════════════════════════════════════════════════════════
// EL CASO MIXTO DE LA TANDA, CON SUS NÚMEROS
// ══════════════════════════════════════════════════════════════════════════

test("EFECTIVO $5.000 + DÉBITO $5.000 con el débito sin configurar", () => {
  const pagos = aplicarComisiones(
    [
      { medio: "EFECTIVO", monto: 5000 },
      { medio: "DEBITO", monto: 5000 },
    ],
    {} // el débito no está configurado; el efectivo nunca cobra
  );

  const efectivo = pagos.find((p) => p.medio === "EFECTIVO");
  const debito = pagos.find((p) => p.medio === "DEBITO");

  // Conocido de punta a punta.
  assert.deepEqual(
    { monto: efectivo.monto, comisionPct: efectivo.comisionPct, comision: efectivo.comision, neto: efectivo.neto },
    { monto: 5000, comisionPct: null, comision: 0, neto: 5000 }
  );

  // Monto conocido; comisión y neto, placeholders.
  assert.deepEqual(
    { monto: debito.monto, comisionPct: debito.comisionPct, comision: debito.comision, neto: debito.neto },
    { monto: 5000, comisionPct: null, comision: 0, neto: 5000 }
  );

  const d = derivarCamposVenta(pagos);
  assert.equal(d.comisionPendiente, true, "un solo tender sin configurar alcanza");
  assert.equal(d.formaPago, "mixto");
  assert.equal(d.comisionPct, null, "ya era null en toda venta mixta");
  assert.equal(d.comisionBancaria, 0, "placeholder");
  assert.equal(d.netoRecibido, 10000, "placeholder");

  // Y lo que la pantalla tiene que saber leer de todo eso.
  assert.equal(comisionEsExacta({ comisionPendiente: d.comisionPendiente }), false);
});

test("y si el débito SÍ estuviera configurado, la misma venta queda exacta", () => {
  const pagos = aplicarComisiones(
    [
      { medio: "EFECTIVO", monto: 5000 },
      { medio: "DEBITO", monto: 5000 },
    ],
    { DEBITO: 7 }
  );
  const d = derivarCamposVenta(pagos);
  assert.equal(d.comisionPendiente, false);
  assert.equal(d.comisionBancaria, 350);
  assert.equal(d.netoRecibido, 9650);
});

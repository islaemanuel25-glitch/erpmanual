// Candados del RECARGO COMERCIAL POR MEDIO DE PAGO.
// node --test lib/recargos-pago/recargoPago.test.mjs
//
// El candado que más importa de este archivo es el que comprueba que el recargo
// y la comisión bancaria son DOS números distintos. No es una obviedad: los dos
// son un porcentaje sobre el mismo medio de pago, y el día que alguien los una
// "para no repetir código" los reportes van a mentir en las dos direcciones.
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizarRecargos,
  validarRecargoPct,
  recargoDeVenta,
  importeRecargo,
  esPagoSoloEfectivo,
  avisoPagoCombinado,
  MEDIOS_CON_RECARGO,
  RECARGO_PCT_DEFAULT,
} from "./recargoPago.js";
import { MEDIOS_CON_COMISION } from "../pos-ventas/pagos.js";

// ── La distinción, que es el punto de todo esto ──────────────────────────────
test("recargo y comisión no cubren los mismos medios: el efectivo tiene recargo posible y nunca comisión", () => {
  assert.ok(MEDIOS_CON_RECARGO.includes("EFECTIVO"));
  assert.ok(!MEDIOS_CON_COMISION.includes("EFECTIVO"));
});

test("FIADO no admite recargo comercial", () => {
  assert.ok(!MEDIOS_CON_RECARGO.includes("FIADO"));
  const r = recargoDeVenta(["FIADO"], { FIADO: 20 });
  assert.equal(r.pct, 0);
  assert.equal(r.medio, null);
});

// ── Configuración por local ──────────────────────────────────────────────────
test("un local sin configurar no le cobra recargo a nadie", () => {
  const mapa = normalizarRecargos([]);
  for (const m of MEDIOS_CON_RECARGO) assert.equal(mapa[m], RECARGO_PCT_DEFAULT);
});

test("el ejemplo de Casiano Casas se carga tal cual", () => {
  const mapa = normalizarRecargos([
    { medio: "EFECTIVO", porcentaje: 0 },
    { medio: "DEBITO", porcentaje: 5 },
    { medio: "CREDITO", porcentaje: 10 },
    { medio: "MERCADOPAGO", porcentaje: 5 },
  ]);
  assert.deepEqual(mapa, { EFECTIVO: 0, DEBITO: 5, CREDITO: 10, MERCADOPAGO: 5 });
});

test("otro local puede tener reglas distintas sin afectar al primero", () => {
  const casiano = normalizarRecargos([{ medio: "DEBITO", porcentaje: 5 }]);
  const otro = normalizarRecargos([{ medio: "DEBITO", porcentaje: 12 }]);
  assert.equal(casiano.DEBITO, 5);
  assert.equal(otro.DEBITO, 12);
});

test("un medio desconocido en la configuración se ignora, no se cuela", () => {
  const mapa = normalizarRecargos([{ medio: "CRIPTO", porcentaje: 30 }]);
  assert.equal(mapa.CRIPTO, undefined);
  assert.equal(Object.keys(mapa).length, MEDIOS_CON_RECARGO.length);
});

test("un porcentaje ilegible cae a cero y no rompe el cobro", () => {
  const mapa = normalizarRecargos([{ medio: "DEBITO", porcentaje: "cinco" }]);
  assert.equal(mapa.DEBITO, 0);
});

test("el porcentaje se valida entre 0 y 100", () => {
  assert.equal(validarRecargoPct(5).valido, true);
  assert.equal(validarRecargoPct(0).valido, true);
  assert.equal(validarRecargoPct(-1).valido, false);
  assert.equal(validarRecargoPct(101).valido, false);
  assert.equal(validarRecargoPct("abc").valido, false);
});

// ── La regla del pago mixto ──────────────────────────────────────────────────
test("con un solo medio, el recargo es el de ese medio", () => {
  assert.deepEqual(recargoDeVenta(["DEBITO"], { DEBITO: 5 }), { pct: 5, medio: "DEBITO" });
});

test("con varios medios manda el MAYOR, y se dice cuál fue", () => {
  const r = recargoDeVenta(["EFECTIVO", "DEBITO", "CREDITO"], {
    EFECTIVO: 0,
    DEBITO: 5,
    CREDITO: 10,
  });
  assert.equal(r.pct, 10);
  assert.equal(r.medio, "CREDITO");
});

test("el recargo NO se prorratea por cuánto se pagó con cada medio", () => {
  // Misma venta, dos repartos distintos: el recargo tiene que ser el mismo.
  const a = recargoDeVenta(["EFECTIVO", "DEBITO"], { DEBITO: 5 });
  const b = recargoDeVenta(["DEBITO", "EFECTIVO"], { DEBITO: 5 });
  assert.deepEqual(a, b);
});

test("importe del recargo sobre una base", () => {
  assert.equal(importeRecargo(10000, 5), 500);
  assert.equal(importeRecargo(900, 5), 45);
  assert.equal(importeRecargo(10000, 0), 0);
  assert.equal(importeRecargo(0, 5), 0);
});

test("solo efectivo se contesta con la lista de medios, no con los importes", () => {
  assert.equal(esPagoSoloEfectivo(["EFECTIVO"]), true);
  assert.equal(esPagoSoloEfectivo(["EFECTIVO", "DEBITO"]), false);
  assert.equal(esPagoSoloEfectivo([]), false);
});

// ── El aviso previo a confirmar ──────────────────────────────────────────────
test("con un solo medio no hay nada que avisar", () => {
  assert.equal(avisoPagoCombinado({ mediosUsados: ["EFECTIVO"], recargo: { pct: 0, medio: null } }), null);
});

test("el aviso del pedido, palabra por palabra", () => {
  const texto = avisoPagoCombinado({
    mediosUsados: ["EFECTIVO", "DEBITO"],
    recargo: { pct: 5, medio: "DEBITO" },
    hayOfertaSoloEfectivoEnCarrito: true,
  });
  assert.match(texto, /Pago combinado\./);
  assert.match(texto, /Se aplicará la condición más alta: Débito \+5 %\./);
  assert.match(texto, /Las ofertas exclusivas de efectivo no aplican\./);
});

test("si no hay oferta de efectivo en el carrito, no se menciona", () => {
  const texto = avisoPagoCombinado({
    mediosUsados: ["EFECTIVO", "DEBITO"],
    recargo: { pct: 5, medio: "DEBITO" },
    hayOfertaSoloEfectivoEnCarrito: false,
  });
  assert.ok(!/exclusivas de efectivo/.test(texto));
});

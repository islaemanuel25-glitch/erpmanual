// CANDADOS DE LA CORRECCIÓN DE LAS FILAS SIN MARGEN (2026-10-30).
//
//   node --import ./scripts/alias-loader.mjs --test scripts/correcciones/preciosSinRegla.test.mjs
//
// Los dos que pidió Emanuel: nunca se baja un precio, y el margen de una fila
// que ya gana 30 % o más queda anclado a un entero que conserva su precio.

import { test } from "node:test";
import assert from "node:assert/strict";

import { decidirSinRegla, margenAnclado, ACCION, TIPO, MOTIVO } from "./preciosSinRegla.mjs";

const fila = (extra = {}) => ({ nombre: "GALLETITA X24", costo: 40800, venta: 12000, redondeo100: true, enOfertaVigente: false, ...extra });

test("NUNCA BAJA UN PRECIO: el que gana 30 % o más conserva el suyo, y el resto sube", () => {
  // El ejemplo de producción: bulto de 24 a $40.800 y venta vieja de $12.000.
  const vieja = decidirSinRegla(fila());
  assert.equal(vieja.accion, ACCION.APLICAR);
  assert.equal(vieja.tipo, TIPO.SUBE_A_30);
  assert.equal(vieja.precioNuevo, 53100, "40.800 × 1,30 = 53.040, al 100 de arriba");
  assert.equal(vieja.margenNuevo, 30);
  // Ganando 30 % o más, el precio no se toca, por alto que sea.
  for (const venta of [53040, 53100, 60000, 120000]) {
    const r = decidirSinRegla(fila({ venta }));
    assert.equal(r.precioNuevo, null, `cambió un precio de ${venta}`);
    assert.equal(r.tipo, TIPO.ANCLADO);
  }
  // Un precio fijo decidido a mano por debajo del actual tampoco lo baja.
  const fijo = decidirSinRegla(fila({ costo: 1200, venta: 1800, precioFijo: 1600 }));
  assert.equal(fijo.precioNuevo, null);
  // Y uno por encima, sube a ése.
  assert.equal(decidirSinRegla(fila({ costo: 1200, venta: 500, precioFijo: 1600 })).precioNuevo, 1600);
});

test("MARGEN ANCLADO: el entero de abajo, o el de arriba si con el de abajo el sistema bajaría el precio", () => {
  // $1.000 → $1.450 es 45 % justo: queda 45.
  assert.equal(margenAnclado({ costo: 1000, venta: 1450, redondeo100: false }), 45);
  // $1.000 → $1.455 es 45,5 %: con 45 el sistema daría $1.450, menos. Va 46.
  assert.equal(margenAnclado({ costo: 1000, venta: 1455, redondeo100: false }), 46);
  // Con redondeo: $1.000 → $1.480 es 48 %, y 48 da $1.480 → $1.500. Alcanza, queda 48.
  assert.equal(margenAnclado({ costo: 1000, venta: 1480, redondeo100: true }), 48);
  // $1.000 → $1.530 con redondeo: 53 da $1.530 → $1.600, alcanza: 53.
  assert.equal(margenAnclado({ costo: 1000, venta: 1530, redondeo100: true }), 53);
  // Para cualquier venta que gane 30 % o más, el margen anclado nunca da un
  // precio menor al actual.
  for (const venta of [13001, 14567.89, 19999.99, 33333]) {
    const r = decidirSinRegla(fila({ costo: 10000, venta, redondeo100: false }));
    assert.equal(r.tipo, TIPO.ANCLADO);
    assert.ok(10000 * (1 + r.margenNuevo / 100) >= venta - 0.005, `margen ${r.margenNuevo} bajaría ${venta}`);
    assert.ok(10000 * (1 + (r.margenNuevo - 1) / 100) < venta, `margen ${r.margenNuevo} no es el más chico que alcanza`);
  }
});

test("lo que no se toca: sin costo, promos, excluidas y lo que pasaría de 30 veces", () => {
  assert.equal(decidirSinRegla(fila({ costo: 0 })).motivo, MOTIVO.SIN_COSTO);
  assert.equal(decidirSinRegla(fila({ nombre: "TARTA PROMO" })).motivo, MOTIVO.PROMO);
  assert.equal(decidirSinRegla(fila({ excluida: true })).motivo, MOTIVO.EXCLUIDO);
  assert.equal(decidirSinRegla(fila({ venta: 1000 })).motivo, MOTIVO.TREINTA_VECES);
  // Decidido por Emanuel: a 30 aunque salte.
  assert.equal(decidirSinRegla(fila({ venta: 1000, aTreintaSinTope: true })).precioNuevo, 53100);
});

test("una fila de escala que SÍ tiene margen sube a lo que da el suyo, sin tocarlo, y las 30 veces se miden por unidad", () => {
  // Pack de 56 a $23.862,23 con margen 40 y la venta vieja cargada por unidad, $600.
  const r = decidirSinRegla(fila({ costo: 23862.23, venta: 600, margenPropio: 40, topeSobre: 600 * 56 }));
  assert.equal(r.accion, ACCION.APLICAR);
  assert.equal(r.tipo, TIPO.SUBE_A_SU_MARGEN);
  assert.equal(r.precioNuevo, 33500);
  assert.equal(r.margenNuevo, null, "no se toca el margen de una fila que tiene regla");
  // Sin la referencia por unidad, 33.500 contra 600 serían 55 veces y se listaría.
  assert.equal(decidirSinRegla(fila({ costo: 23862.23, venta: 600, margenPropio: 40 })).motivo, MOTIVO.TREINTA_VECES);
  // Y si ya gana su margen, no se toca: nunca baja.
  assert.equal(decidirSinRegla(fila({ costo: 23862.23, venta: 40000, margenPropio: 40 })).accion, ACCION.NADA);
});

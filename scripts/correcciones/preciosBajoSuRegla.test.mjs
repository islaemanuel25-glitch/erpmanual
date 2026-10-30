// CANDADOS DE LA CORRECCIÓN DE PRECIOS DEL 2026-10-30.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/correcciones/preciosBajoSuRegla.test.mjs
//
// Los tres que pidió Emanuel: nunca se baja un precio, lo que pasa del doble no
// se aplica, y las promos quedan afuera. Los números son de la medición de ese
// día, de producción y de solo lectura.

import { test } from "node:test";
import assert from "node:assert/strict";

import { decidirCorreccion, ACCION, MOTIVO, MARGEN_POR_DEFECTO } from "./preciosBajoSuRegla.mjs";

const fila = (extra = {}) => ({
  nombre: "LAYS CLASICA 85g", costo: 2500, venta: 2300, reglaPrecio: "MARGEN_PORCENTUAL",
  margen: null, recargoFijoUnidad: null, unidadMedida: "unidad", factorPack: 1, redondeo100: true,
  enOfertaVigente: false, ...extra,
});

test("NUNCA BAJA UN PRECIO: si el nuevo no es mayor que el actual, no se toca", () => {
  // Margen 30 sobre $2.500 da $3.300 con el redondeo: un precio actual de
  // $3.300 o más no se toca.
  for (const venta of [3300, 3400, 9000]) {
    const r = decidirCorreccion(fila({ venta }));
    assert.equal(r.accion, ACCION.NADA, `bajaba un precio de ${venta}`);
    assert.equal(r.motivo, MOTIVO.NO_SUBE);
  }
  // Con su propio margen pasa lo mismo: 40 % sobre $1.000 son $1.400.
  assert.equal(decidirCorreccion(fila({ costo: 1000, venta: 1400, margen: 40 })).accion, ACCION.NADA);
  // CONTRAPRUEBA: por debajo, sube.
  const sube = decidirCorreccion(fila());
  assert.equal(sube.accion, ACCION.APLICAR);
  assert.equal(sube.precioNuevo, 3300);
  assert.equal(sube.margenNuevo, MARGEN_POR_DEFECTO, "sin regla se guarda margen 30, redondo");
});

test("TOPE DEL DOBLE: un precio nuevo de más del doble del actual va a la lista", () => {
  // Salame Fela de Minimarket ayala: $14.000 el kilo y $1.700 cargado (100 g).
  const salame = decidirCorreccion(fila({ nombre: "Salame Fela", costo: 14000, venta: 1700, margen: -87.86, unidadMedida: "kg" }));
  assert.equal(salame.accion, ACCION.LISTA);
  assert.equal(salame.motivo, MOTIVO.DOBLE);
  assert.equal(salame.precioNuevo, 18200);
  // Exactamente el doble todavía se aplica; un centavo más ya no. Sin regla, el
  // 30 % sobre $1.000 da $1.300.
  assert.equal(decidirCorreccion(fila({ costo: 1000, venta: 650 })).accion, ACCION.APLICAR);
  const pasa = decidirCorreccion(fila({ costo: 1000, venta: 649.99, redondeo100: false }));
  assert.equal(pasa.accion, ACCION.LISTA);
  assert.equal(pasa.motivo, MOTIVO.DOBLE);
});

test("PROMOS EXCLUIDAS: por nombre o por estar en una oferta vigente", () => {
  for (const nombre of ["DARK PROMO", "TARTA PROMO", "Fanta 500ml X2 OFERTA", "SALCHICA X6 MAS PANES"]) {
    const r = decidirCorreccion(fila({ nombre, costo: 2815, venta: 2800, margen: -1 }));
    assert.equal(r.accion, ACCION.LISTA, nombre);
    assert.equal(r.motivo, MOTIVO.PROMO);
  }
  const enOferta = decidirCorreccion(fila({ nombre: "Milka Blanco 55g", enOfertaVigente: true }));
  assert.equal(enOferta.motivo, MOTIVO.PROMO);
  // CONTRAPRUEBA: el mismo producto sin oferta se corrige.
  assert.equal(decidirCorreccion(fila({ nombre: "Milka Blanco 55g" })).accion, ACCION.APLICAR);
});

test("margen positivo y a pérdida se lista; el monto fijo suma al costo unitario", () => {
  // Grniol de Mini unidas: margen 50 %, $1.416,80 de costo y $400 de venta.
  const grniol = decidirCorreccion(fila({ nombre: "Grniol", costo: 1416.8, venta: 400, margen: 50 }));
  assert.equal(grniol.accion, ACCION.LISTA);
  assert.equal(grniol.motivo, MOTIVO.MARGEN_POSITIVO_A_PERDIDA);
  // Monto fijo de $200 por unidad sobre un pack de 12 a $12.000: $1.000 la
  // unidad + $200 = $1.200, el pack a $14.400. No toca el margen.
  const recargo = decidirCorreccion(fila({
    costo: 12000, venta: 14000, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 200,
    unidadMedida: "pack", factorPack: 12,
  }));
  assert.equal(recargo.accion, ACCION.APLICAR);
  assert.equal(recargo.precioNuevo, 14400);
  assert.equal(recargo.margenNuevo, null);
});

// CANDADOS DE LAS ENTRADAS DE MERCADERÍA CON TERCER NIVEL DE EMPAQUE
// (tanda 5 — docs/roadmap/tercer-nivel-empaque.md).
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/tercerNivelEntradas.test.mjs
//
// Lo que estas piezas prometen con un producto de 10 atados de 20 cigarrillos.
// El camino entero por las rutas, contra Postgres, lo recorre
// `scripts/pruebas-db/tercerNivelEmpaque.mjs`, y el último candado de acá exige
// que el CI lo corra.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { toUnidades } from "../conversiones/stock.js";
import { milesimasFisicas, unidadesFisicasDe, validarDetalleRecepcion, calcularAjusteOrigenUnidades } from "./recepcion.js";
import { detalleParaValidar } from "./recepcionServidor.js";
import { fisicasEnviadasDe } from "./recepcionUI.js";
import { lineasCorregidasDeProducto } from "./correccionEconomica.js";
import { mapearVentaATransferencia } from "../ventas-internas/mapearVentaATransferencia.js";
import { costoUnitarioComponente } from "../combos/costo.js";

const FACTOR = 10;
const N = 20;

// ── EL ENVÍO ──────────────────────────────────────────────────────────────

test("toUnidades: 1 cartón son 200 sueltos y 1 atado 20; sin sueltos, lo de siempre", () => {
  assert.equal(toUnidades({ cantidad: 1, unidad: "BULTO", factorPack: FACTOR, sueltosPorUnidad: N }), 200);
  assert.equal(toUnidades({ cantidad: 1, unidad: "UNIDAD", factorPack: FACTOR, sueltosPorUnidad: N }), 20);
  assert.equal(toUnidades({ cantidad: 1, unidad: "BULTO", factorPack: FACTOR }), 10);
  assert.equal(toUnidades({ cantidad: 1, unidad: "UNIDAD", factorPack: FACTOR, sueltosPorUnidad: null }), 1);
});

// ── LA RECEPCIÓN ──────────────────────────────────────────────────────────

test("milesimasFisicas: el N multiplica el total ya entero, con las sueltas adentro", () => {
  // 2 cartones y 3 atados sueltos: (2 × 10 + 3) × 20 = 460 sueltos.
  assert.equal(unidadesFisicasDe({ cantidad: 2, sueltas: 3, unidad: "BULTO", factorPack: FACTOR, sueltosPorUnidad: N }), 460);
  assert.equal(milesimasFisicas({ cantidad: 2, sueltas: 3, unidad: "BULTO", factorPack: FACTOR }), 23000, "sin N, lo de siempre");
  // Una línea en UNIDAD sigue sin admitir sueltas, con o sin N.
  assert.equal(milesimasFisicas({ cantidad: 2, sueltas: 1, unidad: "UNIDAD", factorPack: FACTOR, sueltosPorUnidad: N }), null);
});

test("validarDetalleRecepcion: lo recibido, lo enviado y el ajuste del origen, en sueltos con el N de la línea", () => {
  const detalle = { cantidad: 1, recibido: 1, unidadEnviada: "BULTO" };
  const completo = validarDetalleRecepcion({ detalle, factorPack: FACTOR, sueltosPorUnidad: N });
  assert.deepEqual([completo.recibidaUnidades, completo.enviadaUnidades, completo.ajusteOrigenUnidades], [200, 200, 0]);

  const faltan = validarDetalleRecepcion({ detalle: { ...detalle, recibido: 0, motivoPrincipal: "Faltante" }, factorPack: FACTOR, sueltosPorUnidad: N });
  assert.equal(faltan.ajusteOrigenUnidades, 200, "lo que no llegó vuelve al origen entero");

  assert.equal(calcularAjusteOrigenUnidades({ enviada: 1, recibida: 0, unidad: "BULTO", factorPack: FACTOR, sueltosPorUnidad: N }), 200);
});

test("la línea manda: detalleParaValidar y fisicasEnviadasDe leen el N CONGELADO, y sin él es 1", () => {
  const linea = { cantidad: 1, unidadEnviada: "BULTO", recibido: 1, sueltosPorUnidadCongelado: N, producto: { base: { unidad_medida: "pack", factor_pack: FACTOR } } };
  assert.equal(detalleParaValidar(linea).sueltosPorUnidad, N);
  assert.equal(detalleParaValidar({ ...linea, sueltosPorUnidadCongelado: null }).sueltosPorUnidad, null);
  assert.equal(fisicasEnviadasDe(linea, { sueltosPorUnidad: linea.sueltosPorUnidadCongelado }), 200);
  // Sin la opción cuenta atados, que es lo que muestra la pantalla.
  assert.equal(fisicasEnviadasDe(linea), 10);
});

// ── LA VENTA INTERNA ──────────────────────────────────────────────────────

const lineaVendida = (cantidadStock, sueltos) => ({
  tipo: "NORMAL", productoLocalId: 11, productoBaseId: 1,
  consumoFisico: { productoLocalId: 11, cantidadStock, sueltosPorUnidadCongelado: sueltos },
});

test("venta interna: 1 cartón vendido (200 sueltos) viaja como 10 atados con N = 20", () => {
  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: [{ productoLocalId: 11, productoBaseId: 1, cantidad: 200 }],
    lineasComerciales: [lineaVendida(200, N)],
  });
  assert.deepEqual(
    [r.items[0].cantidad, r.items[0].unidadEnviada, r.items[0].sueltosPorUnidad],
    [10, "UNIDAD", N]
  );
  // Y lo que la transferencia va a mover es exactamente lo que la venta descontó.
  assert.equal(toUnidades({ cantidad: r.items[0].cantidad, unidad: "UNIDAD", factorPack: 1, sueltosPorUnidad: r.items[0].sueltosPorUnidad }), 200);
});

test("venta interna: si no es múltiplo de N (un combo con 5 sueltos) viaja en unidades de stock, N vacío", () => {
  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: [{ productoLocalId: 11, productoBaseId: 1, cantidad: 205 }],
    lineasComerciales: [lineaVendida(200, N)],
  });
  assert.deepEqual([r.items[0].cantidad, r.items[0].sueltosPorUnidad], [205, null]);
});

// ── LA CORRECCIÓN ECONÓMICA Y EL COMBO ────────────────────────────────────

test("la corrección económica congela el N de la transferencia en las líneas que reescribe", () => {
  const res = lineasCorregidasDeProducto({
    detalleVenta: { id: 1, productoBaseId: 1, cantidad: 1, cantidadStock: 200, subtotal: 12000, precio: 12000, precioCosto: 12000 },
    factor: FACTOR * N,
    recibidasFisicas: 200,
    sueltosPorUnidad: N,
  });
  assert.ok(res.lineas.every((l) => l.sueltosPorUnidadCongelado === N));
  assert.equal(res.lineas[0].cantidad, 1, "1 cartón recibido es 1 cartón");
});

test("un componente de combo cuesta el suelto: el cartón de $12.000 son $60 por unidad de stock", () => {
  const base = { precio_costo: 12000, factor_pack: FACTOR, sueltos_por_unidad: N, unidad_medida: "pack" };
  assert.equal(costoUnitarioComponente({ base, productoLocal: {}, esDeposito: false }), 60);
  assert.equal(costoUnitarioComponente({ base: { ...base, sueltos_por_unidad: null }, productoLocal: {}, esDeposito: false }), 1200);
});

// ── Y QUE EL CAMINO ENTERO SE SIGA CORRIENDO ──────────────────────────────

test("el CI corre la prueba de base del tercer nivel de empaque", () => {
  const ci = readFileSync(".github/workflows/verificacion.yml", "utf8");
  assert.match(ci, /node --import \.\/scripts\/alias-loader\.mjs scripts\/pruebas-db\/tercerNivelEmpaque\.mjs/);
});

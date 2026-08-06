// Confirmar la presentación: la cantidad NO multiplica el precio.
//
// El error que estas pruebas existen para que no vuelva: un display de $5.678
// convertido en $71.545 por multiplicarlo por la cantidad contenida.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BASE_PRECIO,
  RELACION,
  MOTIVO_NO_CONFIRMABLE,
  UNIDADES_MAX,
  basePrecioDeFila,
  puedeConfirmarse,
  unidadesValidas,
  relacionImplicita,
  relacionesPosibles,
  costoDeRelacion,
  costoUnitarioInformativo,
  resultadoConfirmacion,
  respaldoDeRelacion,
} from "@/lib/proveedores/listas/confirmarPresentacion";

const ABIERTA = { estado: "PARCIALMENTE_APLICADA" };

// Fila 167 real: display de jugos, $5.678,25, el ERP guarda el display a $5.010.
const filaDisplay = (extra = {}) => ({
  id: 1, estado: "FACTOR_DUDOSO", aplicada: false, excluidaManual: false,
  productoBaseId: 10, unidadProveedor: "DI", unidadesPorBulto: 12,
  precioConIva: 5678.250248, ...extra,
});

const packJugos = (extra = {}) => ({
  id: 10, nombre: "Jugo Arcor Naranja X Caja", unidad_medida: "pack", factor_pack: 18,
  modoCompraProveedor: "BULTO", precio_costo: 5010, ...extra,
});

// Fila 308 real: Rocklets por unidad, $1.325,28, el ERP guarda el pack de 18.
const filaUnidad = (extra = {}) => ({
  id: 2, estado: "FACTOR_DUDOSO", aplicada: false, excluidaManual: false,
  productoBaseId: 20, unidadProveedor: "UN", unidadesPorBulto: 216,
  precioConIva: 1325.28, ...extra,
});

const packRocklets = (extra = {}) => ({
  id: 20, nombre: "Rocklets 40g", unidad_medida: "pack", factor_pack: 18,
  modoCompraProveedor: "BULTO", precio_costo: 21510, ...extra,
});

// ── La base del precio sale del archivo, no se adivina ──────────────────────

test("la base del precio la dice la columna U.M.", () => {
  assert.equal(basePrecioDeFila({ unidadProveedor: "UN" }), BASE_PRECIO.UNIDAD);
  assert.equal(basePrecioDeFila({ unidadProveedor: "DI" }), BASE_PRECIO.DISPLAY);
  assert.equal(basePrecioDeFila({ unidadProveedor: "BU" }), BASE_PRECIO.BULTO);
});

test("sin unidad comercial no hay base, y sin base no se confirma", () => {
  for (const u of [null, "", "XX", undefined]) {
    assert.equal(basePrecioDeFila({ unidadProveedor: u }), null, String(u));
    const r = puedeConfirmarse(filaDisplay({ unidadProveedor: u }), ABIERTA);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, MOTIVO_NO_CONFIRMABLE.BASE_INDETERMINADA);
  }
});

// ── EL CASO QUE ROMPIÓ: el display no se multiplica ─────────────────────────

test("un display de $5.678 cuesta $5.962, no $71.545", () => {
  const costo = costoDeRelacion({
    precioConIva: 5678.250248, recargoPct: 5,
    relacion: RELACION.MISMA_PRESENTACION, unidades: 12,
  });
  assert.equal(costo, 5962.16);
  assert.notEqual(costo, 71545.95);
});

test("la cantidad contenida NO cambia el costo del display", () => {
  const con12 = costoDeRelacion({ precioConIva: 5678.250248, recargoPct: 5, relacion: RELACION.MISMA_PRESENTACION, unidades: 12 });
  const con18 = costoDeRelacion({ precioConIva: 5678.250248, recargoPct: 5, relacion: RELACION.MISMA_PRESENTACION, unidades: 18 });
  const sinDato = costoDeRelacion({ precioConIva: 5678.250248, recargoPct: 5, relacion: RELACION.MISMA_PRESENTACION });
  assert.equal(con12, 5962.16);
  assert.equal(con18, 5962.16);
  assert.equal(sinDato, 5962.16, "la cantidad ni siquiera hace falta para el costo");
});

test("a una fila de display NO se le ofrece multiplicar", () => {
  const o = relacionesPosibles(filaDisplay(), packJugos());
  assert.deepEqual(o.map((x) => x.relacion), [RELACION.MISMA_PRESENTACION]);
});

test("a una fila de bulto tampoco", () => {
  const o = relacionesPosibles(filaDisplay({ unidadProveedor: "BU" }), packJugos());
  assert.deepEqual(o.map((x) => x.relacion), [RELACION.MISMA_PRESENTACION]);
});

test("multiplicar un display o un bulto no da costo por ningún camino", () => {
  for (const u of ["DI", "BU"]) {
    const r = resultadoConfirmacion({
      fila: filaDisplay({ unidadProveedor: u }), base: packJugos(),
      relacion: RELACION.POR_UNIDAD_SUELTA, unidades: 12,
      recargoPct: 5, umbralVariacionPct: 30,
    });
    assert.equal(r.ok, false, u);
  }
});

// ── El precio POR UNIDAD sí multiplica, y solo ese ──────────────────────────

test("con precio por unidad y un producto que agrupa, se ofrecen las dos relaciones", () => {
  const o = relacionesPosibles(filaUnidad(), packRocklets());
  assert.deepEqual(o.map((x) => x.relacion), [RELACION.MISMA_PRESENTACION, RELACION.POR_UNIDAD_SUELTA]);
});

test("con precio por unidad y un producto suelto, solo la misma presentación", () => {
  const suelto = packRocklets({ unidad_medida: "unidad", factor_pack: null });
  const o = relacionesPosibles(filaUnidad(), suelto);
  assert.deepEqual(o.map((x) => x.relacion), [RELACION.MISMA_PRESENTACION]);
});

test("el pack de Rocklets: $1.325,28 por unidad × 18 = $25.047,79", () => {
  const c = costoDeRelacion({ precioConIva: 1325.28, recargoPct: 5, relacion: RELACION.POR_UNIDAD_SUELTA, unidades: 18 });
  assert.equal(c, 25047.79);
});

test("el UxBU del archivo NO es la cantidad del pack: 216 daría un disparate", () => {
  // 216 son las unidades por bulto. Usarlo como cantidad del pack da $300.573.
  const conPack = costoDeRelacion({ precioConIva: 1325.28, recargoPct: 5, relacion: RELACION.POR_UNIDAD_SUELTA, unidades: 18 });
  const conBulto = costoDeRelacion({ precioConIva: 1325.28, recargoPct: 5, relacion: RELACION.POR_UNIDAD_SUELTA, unidades: 216 });
  assert.equal(conPack, 25047.79);
  assert.equal(conBulto, 300573.5);
  // 12 packs por bulto. La razón no da 12 exacto porque cada costo se redondea
  // a centavos por separado, que es justamente lo que hay que hacer.
  assert.ok(Math.abs(conBulto / conPack - 12) < 0.001, `dio ${conBulto / conPack}`);
});

test("sin cantidad válida, la relación por unidad suelta no da costo", () => {
  for (const u of [null, 0, -3, 1.5, "doce", UNIDADES_MAX + 1]) {
    assert.equal(
      costoDeRelacion({ precioConIva: 100, recargoPct: 5, relacion: RELACION.POR_UNIDAD_SUELTA, unidades: u }),
      null, String(u)
    );
  }
});

test("la cantidad válida es un entero de 1 al tope", () => {
  assert.equal(unidadesValidas(1), true);
  assert.equal(unidadesValidas(UNIDADES_MAX), true);
  assert.equal(unidadesValidas(0), false);
  assert.equal(unidadesValidas(UNIDADES_MAX + 1), false);
  assert.equal(unidadesValidas(2.5), false);
});

// ── La pista: qué relación valía cuando el costo estuvo bien ────────────────

test("el jugo: el costo de hoy equivale a un display, no a doce", () => {
  // 5010 / (5678,25 × 1,05) = 0,84
  const r = relacionImplicita({ costoActual: 5010, precioConIva: 5678.250248, recargoPct: 5 });
  assert.ok(r > 0.7 && r < 1.1, `dio ${r}`);
});

test("Rocklets: el costo de hoy equivale a unas 15 unidades, cerca del pack de 18", () => {
  const r = relacionImplicita({ costoActual: 21510, precioConIva: 1325.28, recargoPct: 5 });
  assert.ok(r > 12 && r < 20, `dio ${r}`);
});

test("MOGUL: el costo de hoy equivale a UNA bolsa, aunque tenga 450 caramelos", () => {
  // El 450 es el contenido de la bolsa, no un armado de venta.
  const r = relacionImplicita({ costoActual: 11601, precioConIva: 11049.39, recargoPct: 5 });
  assert.ok(r > 0.9 && r < 1.1, `dio ${r}`);
});

test("sin costo previo no hay pista, y no se inventa", () => {
  assert.equal(relacionImplicita({ costoActual: 0, precioConIva: 100, recargoPct: 5 }), null);
  assert.equal(relacionImplicita({ costoActual: 100, precioConIva: 0, recargoPct: 5 }), null);
});

// ── El costo unitario es informativo y nunca se guarda ──────────────────────

test("el costo unitario divide, no multiplica", () => {
  assert.equal(costoUnitarioInformativo({ costoTotal: 5962.16, unidades: 12 }), 496.85);
  assert.equal(costoUnitarioInformativo({ costoTotal: 5962.16, unidades: 18 }), 331.23);
});

test("sin cantidad no hay costo unitario", () => {
  assert.equal(costoUnitarioInformativo({ costoTotal: 5962.16, unidades: null }), null);
});

// ── La compuerta ────────────────────────────────────────────────────────────

test("una fila dudosa con producto y base se puede confirmar", () => {
  assert.deepEqual(puedeConfirmarse(filaDisplay(), ABIERTA), { ok: true, motivo: null });
});

test("con la importación cerrada no se confirma nada", () => {
  for (const estado of ["APLICADA", "CANCELADA", "BORRADOR"]) {
    assert.equal(puedeConfirmarse(filaDisplay(), { estado }).motivo, MOTIVO_NO_CONFIRMABLE.IMPORTACION_CERRADA, estado);
  }
});

test("aplicada, excluida o sin producto: no", () => {
  assert.equal(puedeConfirmarse(filaDisplay({ aplicada: true }), ABIERTA).motivo, MOTIVO_NO_CONFIRMABLE.FILA_APLICADA);
  assert.equal(puedeConfirmarse(filaDisplay({ excluidaManual: true }), ABIERTA).motivo, MOTIVO_NO_CONFIRMABLE.EXCLUIDA);
  assert.equal(puedeConfirmarse(filaDisplay({ productoBaseId: null }), ABIERTA).motivo, MOTIVO_NO_CONFIRMABLE.SIN_PRODUCTO);
});

test("solo las dudosas: las demás se resuelven por otro camino", () => {
  for (const estado of ["LISTO_PARA_ACTUALIZAR", "NO_MACHEADO", "CODIGO_DUPLICADO", "SIN_CAMBIOS", "BLOQUEADO"]) {
    assert.equal(puedeConfirmarse(filaDisplay({ estado }), ABIERTA).motivo, MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE, estado);
  }
});

// ── El resultado ────────────────────────────────────────────────────────────

test("la fila 167 confirmada queda lista con el costo del display", () => {
  const r = resultadoConfirmacion({
    fila: filaDisplay(), base: packJugos(), relacion: RELACION.MISMA_PRESENTACION,
    unidades: 12, recargoPct: 5, umbralVariacionPct: 30,
  });
  assert.equal(r.ok, true);
  assert.equal(r.estado, "LISTO_PARA_ACTUALIZAR");
  assert.equal(r.costoNuevo, 5962.16);
  assert.equal(r.costoAnterior, 5010);
  assert.equal(r.unidades, 12, "la cantidad se guarda como dato de la presentación");
  assert.ok(r.diferencia > 0 && r.diferencia < 1000, "un aumento normal, no un salto de miles");
  assert.equal(r.variacionAlta, false, "19 % no supera el umbral de 30 %");
});

test("guardar la cantidad no altera el costo", () => {
  const a = resultadoConfirmacion({ fila: filaDisplay(), base: packJugos(), relacion: RELACION.MISMA_PRESENTACION, unidades: 12, recargoPct: 5, umbralVariacionPct: 30 });
  const b = resultadoConfirmacion({ fila: filaDisplay(), base: packJugos(), relacion: RELACION.MISMA_PRESENTACION, unidades: 18, recargoPct: 5, umbralVariacionPct: 30 });
  assert.equal(a.costoNuevo, b.costoNuevo);
  assert.notEqual(a.unidades, b.unidades);
});

test("si el costo no se mueve, la fila queda SIN_CAMBIOS", () => {
  const r = resultadoConfirmacion({
    fila: filaDisplay(), base: packJugos({ precio_costo: 5962.16 }),
    relacion: RELACION.MISMA_PRESENTACION, unidades: 12, recargoPct: 5, umbralVariacionPct: 30,
  });
  assert.equal(r.estado, "SIN_CAMBIOS");
});

test("el monto del recargo queda registrado", () => {
  const r = resultadoConfirmacion({ fila: filaDisplay(), base: packJugos(), relacion: RELACION.MISMA_PRESENTACION, unidades: 12, recargoPct: 5, umbralVariacionPct: 30 });
  assert.equal(r.precioConRecargo, 5962.16);
  assert.equal(r.montoRecargo, 283.91);
});

// ── El aviso cuando el costo actual no respalda la elección ─────────────────

test("el jugo: decir que el producto es el display está respaldado", () => {
  const imp = relacionImplicita({ costoActual: 5010, precioConIva: 5678.250248, recargoPct: 5 });
  assert.equal(respaldoDeRelacion({ relacion: RELACION.MISMA_PRESENTACION, implicita: imp }), "RESPALDA");
});

test("SERRANITAS: el producto vale 12,7 displays, decir que es UN display no está respaldado", () => {
  const imp = relacionImplicita({ costoActual: 19250, precioConIva: 1444.44, recargoPct: 5 });
  assert.equal(respaldoDeRelacion({ relacion: RELACION.MISMA_PRESENTACION, implicita: imp }), "NO_RESPALDA");
});

test("Rocklets: multiplicar por 18 está respaldado por el costo actual", () => {
  const imp = relacionImplicita({ costoActual: 21510, precioConIva: 1325.28, recargoPct: 5 });
  assert.equal(respaldoDeRelacion({ relacion: RELACION.POR_UNIDAD_SUELTA, implicita: imp, unidades: 18 }), "RESPALDA");
});

test("Rocklets: multiplicar por 216 NO está respaldado", () => {
  const imp = relacionImplicita({ costoActual: 21510, precioConIva: 1325.28, recargoPct: 5 });
  assert.equal(respaldoDeRelacion({ relacion: RELACION.POR_UNIDAD_SUELTA, implicita: imp, unidades: 216 }), "NO_RESPALDA");
});

test("sin costo previo no se opina", () => {
  assert.equal(respaldoDeRelacion({ relacion: RELACION.MISMA_PRESENTACION, implicita: null }), "SIN_DATO");
});

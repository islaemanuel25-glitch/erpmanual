// Confirmar el armado: la salida operativa de las filas que quedaron dudosas.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MOTIVO_NO_CONFIRMABLE,
  FACTOR_MAX,
  puedeConfirmarse,
  factorConfirmadoValido,
  opcionesDeFactor,
  costoConFactor,
  resultadoConfirmacion,
} from "@/lib/proveedores/listas/confirmarArmado";

const ABIERTA = { estado: "PARCIALMENTE_APLICADA" };

const fila = (extra = {}) => ({
  id: 1,
  estado: "FACTOR_DUDOSO",
  aplicada: false,
  excluidaManual: false,
  productoBaseId: 10,
  unidadesPorBulto: 12,
  precioConIva: 100,
  ...extra,
});

const base = (extra = {}) => ({
  id: 10,
  nombre: "Jugo Arcor Naranja X Caja",
  unidad_medida: "pack",
  factor_pack: 18,
  modoCompraProveedor: "BULTO",
  precio_costo: 5010,
  ...extra,
});

// ── La compuerta ────────────────────────────────────────────────────────────

test("una fila dudosa con producto se puede confirmar", () => {
  assert.deepEqual(puedeConfirmarse(fila(), ABIERTA), { ok: true, motivo: null });
});

test("funciona también con la importación conciliada", () => {
  assert.equal(puedeConfirmarse(fila(), { estado: "CONCILIADA" }).ok, true);
});

test("con la importación cerrada no se confirma nada", () => {
  for (const estado of ["APLICADA", "CANCELADA", "BORRADOR"]) {
    const r = puedeConfirmarse(fila(), { estado });
    assert.equal(r.ok, false, estado);
    assert.equal(r.motivo, MOTIVO_NO_CONFIRMABLE.IMPORTACION_CERRADA);
  }
});

test("una fila YA APLICADA no se puede confirmar", () => {
  const r = puedeConfirmarse(fila({ aplicada: true }), ABIERTA);
  assert.equal(r.motivo, MOTIVO_NO_CONFIRMABLE.FILA_APLICADA);
});

test("una fila excluida a mano tampoco", () => {
  const r = puedeConfirmarse(fila({ excluidaManual: true }), ABIERTA);
  assert.equal(r.motivo, MOTIVO_NO_CONFIRMABLE.EXCLUIDA);
});

test("solo las dudosas: las demás se resuelven por otro camino", () => {
  for (const estado of ["LISTO_PARA_ACTUALIZAR", "NO_MACHEADO", "CODIGO_DUPLICADO", "SIN_CAMBIOS", "BLOQUEADO"]) {
    const r = puedeConfirmarse(fila({ estado }), ABIERTA);
    assert.equal(r.ok, false, estado);
    assert.equal(r.motivo, MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE);
  }
});

test("sin producto no hay nada que confirmar", () => {
  const r = puedeConfirmarse(fila({ productoBaseId: null }), ABIERTA);
  assert.equal(r.motivo, MOTIVO_NO_CONFIRMABLE.SIN_PRODUCTO);
});

// ── El factor ───────────────────────────────────────────────────────────────

test("un factor válido es un entero entre 1 y el máximo", () => {
  assert.equal(factorConfirmadoValido(1), true);
  assert.equal(factorConfirmadoValido(18), true);
  assert.equal(factorConfirmadoValido(FACTOR_MAX), true);
  assert.equal(factorConfirmadoValido(0), false);
  assert.equal(factorConfirmadoValido(-2), false);
  assert.equal(factorConfirmadoValido(1.5), false);
  assert.equal(factorConfirmadoValido(FACTOR_MAX + 1), false);
  assert.equal(factorConfirmadoValido("doce"), false);
  assert.equal(factorConfirmadoValido(null), false);
});

test("se ofrecen las dos versiones en conflicto, sin elegir ninguna", () => {
  const o = opcionesDeFactor(fila(), base());
  assert.deepEqual(o.map((x) => x.factor), [12, 18, 1]);
  assert.equal(o[0].origen, "ARCHIVO");
  assert.equal(o[1].origen, "ERP");
  assert.equal(o[2].origen, "SIN_CONVERSION");
  for (const x of o) assert.ok(x.detalle.length > 0, `${x.origen} sin explicación`);
});

test("no se repiten opciones cuando el archivo y el ERP coinciden", () => {
  const o = opcionesDeFactor(fila({ unidadesPorBulto: 18 }), base({ factor_pack: 18 }));
  assert.deepEqual(o.map((x) => x.factor), [18, 1]);
});

test("un factor inválido del archivo no se ofrece", () => {
  const o = opcionesDeFactor(fila({ unidadesPorBulto: 0 }), base());
  assert.deepEqual(o.map((x) => x.factor), [18, 1]);
});

// ── El costo ────────────────────────────────────────────────────────────────

test("el costo multiplica por el factor confirmado, con el recargo primero", () => {
  // 100 × 1,05 = 105 · × 18 = 1890
  assert.equal(costoConFactor({ precioConIva: 100, recargoPct: 5, factor: 18, base: base() }), 1890);
  // Con el otro factor da otro número: por eso hay que elegir.
  assert.equal(costoConFactor({ precioConIva: 100, recargoPct: 5, factor: 12, base: base() }), 1260);
});

test("el redondeo es al final, no en el paso intermedio", () => {
  // 82,22 × 1,05 = 86,331 · × 18 = 1553,958 → 1553,96
  assert.equal(costoConFactor({ precioConIva: 82.22, recargoPct: 5, factor: 18, base: base() }), 1553.96);
});

test("un producto que NO guarda por bulto ignora el factor", () => {
  const suelto = base({ unidad_medida: "unidad", factor_pack: null });
  assert.equal(costoConFactor({ precioConIva: 100, recargoPct: 5, factor: 18, base: suelto }), 105);
});

test("kg y fiambre tampoco multiplican", () => {
  assert.equal(costoConFactor({ precioConIva: 100, recargoPct: 5, factor: 18, base: base({ unidad_medida: "kg" }) }), 105);
  assert.equal(costoConFactor({ precioConIva: 100, recargoPct: 5, factor: 18, base: base({ modoCompraProveedor: "UNIDAD" }) }), 105);
});

test("sin factor válido, un producto de bulto no da costo", () => {
  assert.equal(costoConFactor({ precioConIva: 100, recargoPct: 5, factor: 0, base: base() }), null);
  assert.equal(costoConFactor({ precioConIva: 100, recargoPct: 5, factor: null, base: base() }), null);
});

test("un precio inválido no da costo", () => {
  assert.equal(costoConFactor({ precioConIva: 0, recargoPct: 5, factor: 18, base: base() }), null);
  assert.equal(costoConFactor({ precioConIva: null, recargoPct: 5, factor: 18, base: base() }), null);
});

// ── El resultado ────────────────────────────────────────────────────────────

test("confirmar deja la fila LISTA con su costo y su variación", () => {
  const r = resultadoConfirmacion({
    fila: fila(), base: base(), factor: 18, recargoPct: 5, umbralVariacionPct: 30,
  });
  assert.equal(r.ok, true);
  assert.equal(r.estado, "LISTO_PARA_ACTUALIZAR");
  assert.equal(r.costoNuevo, 1890);
  assert.equal(r.costoAnterior, 5010);
  assert.equal(r.factorAplicado, 18);
  assert.ok(r.diferencia < 0, "el costo baja");
  assert.equal(r.variacionAlta, true, "una baja del 62 % supera el umbral");
});

test("si el costo no cambia, la fila queda SIN_CAMBIOS y no lista", () => {
  // 100 × 1,05 × 18 = 1890, y el producto ya vale 1890.
  const r = resultadoConfirmacion({
    fila: fila(), base: base({ precio_costo: 1890 }), factor: 18, recargoPct: 5, umbralVariacionPct: 30,
  });
  assert.equal(r.estado, "SIN_CAMBIOS");
  assert.equal(r.diferencia, 0);
});

test("el monto del recargo queda registrado", () => {
  const r = resultadoConfirmacion({ fila: fila(), base: base(), factor: 18, recargoPct: 5, umbralVariacionPct: 30 });
  assert.equal(r.precioConRecargo, 105);
  assert.equal(r.montoRecargo, 5);
});

test("con un factor imposible no se confirma", () => {
  const r = resultadoConfirmacion({ fila: fila(), base: base(), factor: 0, recargoPct: 5, umbralVariacionPct: 30 });
  assert.equal(r.ok, false);
  assert.ok(r.motivo.length > 0);
});

test("el caso real de los jugos: dos factores, dos costos muy distintos", () => {
  // Fila 167 de la importación real: UxBU 12 contra factor 18 del ERP.
  const f = fila({ unidadesPorBulto: 12, precioConIva: 300 });
  const b = base({ factor_pack: 18, precio_costo: 5010 });
  const conArchivo = resultadoConfirmacion({ fila: f, base: b, factor: 12, recargoPct: 5, umbralVariacionPct: 30 });
  const conErp = resultadoConfirmacion({ fila: f, base: b, factor: 18, recargoPct: 5, umbralVariacionPct: 30 });
  assert.equal(conArchivo.costoNuevo, 3780);
  assert.equal(conErp.costoNuevo, 5670);
  assert.notEqual(conArchivo.costoNuevo, conErp.costoNuevo);
});

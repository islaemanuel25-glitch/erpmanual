import { test } from "node:test";
import assert from "node:assert/strict";
import { firmaCorreccion, correccionDirty } from "./correccionDirty.js";

// Estado base (post-/editar): 1 línea + 1 pago, sin cliente ni motivo.
// Shape = salida de payloadLineas()/payloadPagos().
function baseEstado() {
  return {
    lineas: [
      { origenDetalleId: 1, productoBaseId: 10, cantidad: 1, precio: 1000, precioCosto: 700, modoVentaLinea: "NORMAL", factorPack: 1, cantidadStock: 1, esServicio: false },
    ],
    pagos: [{ medio: "EFECTIVO", monto: 1000 }],
    cliente: null,
    motivo: "",
  };
}
const F0 = firmaCorreccion(baseEstado());
const dirty = (mut) => { const e = baseEstado(); mut(e); return correccionDirty(F0, e); };

// ── Cambios que DEBEN detectarse ─────────────────────────────────────────────
test("cambiar cantidad → dirty", () => {
  assert.equal(dirty((e) => { e.lineas[0].cantidad = 2; }), true);
});
test("cambiar precio → dirty", () => {
  assert.equal(dirty((e) => { e.lineas[0].precio = 1200; }), true);
});
test("cambiar precioCosto → dirty", () => {
  assert.equal(dirty((e) => { e.lineas[0].precioCosto = 800; }), true);
});
test("Pack → Unidad (modoVentaLinea) → dirty", () => {
  assert.equal(dirty((e) => { e.lineas[0].modoVentaLinea = "UNIDAD_REMANENTE"; }), true);
});
test("cambiar cantidadStock → dirty", () => {
  assert.equal(dirty((e) => { e.lineas[0].cantidadStock = 6; }), true);
});
test("cambiar factorPack → dirty", () => {
  assert.equal(dirty((e) => { e.lineas[0].factorPack = 6; }), true);
});
test("agregar producto → dirty", () => {
  assert.equal(dirty((e) => {
    e.lineas.push({ origenDetalleId: null, productoBaseId: 20, cantidad: 3, precio: 500, precioCosto: 300, modoVentaLinea: "NORMAL", factorPack: 1, cantidadStock: 3, esServicio: false });
  }), true);
});
test("quitar producto → dirty", () => {
  assert.equal(dirty((e) => { e.lineas = []; }), true);
});
test("cambiar pagos (monto) → dirty", () => {
  assert.equal(dirty((e) => { e.pagos = [{ medio: "EFECTIVO", monto: 500 }, { medio: "DEBITO", monto: 500 }]; }), true);
});
test("agregar medio de pago → dirty", () => {
  assert.equal(dirty((e) => { e.pagos = [{ medio: "EFECTIVO", monto: 600 }, { medio: "MERCADOPAGO", monto: 400 }]; }), true);
});
test("quitar medio de pago (cambia el reparto) → dirty", () => {
  const e2 = { ...baseEstado(), pagos: [{ medio: "EFECTIVO", monto: 700 }, { medio: "DEBITO", monto: 300 }] };
  const f2 = firmaCorreccion(e2);
  // Quitar el débito: el efectivo (ajustador) absorbe → vuelve a 1000.
  assert.equal(correccionDirty(f2, baseEstado()), true);
});
test("cambiar cliente → dirty", () => {
  assert.equal(dirty((e) => { e.cliente = { id: 5, nombre: "Juan" }; }), true);
});
test("escribir motivo → dirty", () => {
  assert.equal(dirty((e) => { e.motivo = "Ajuste de precio"; }), true);
});
test("servicio: cambiar importeServicio → dirty", () => {
  const e1 = { ...baseEstado(), lineas: [{ origenDetalleId: 2, productoBaseId: 30, cantidad: 1, precio: 500, modoVentaLinea: "NORMAL", factorPack: 1, cantidadStock: null, esServicio: true, importeServicio: 500 }] };
  const f1 = firmaCorreccion(e1);
  const e2 = JSON.parse(JSON.stringify(e1)); e2.lineas[0].importeServicio = 700; e2.lineas[0].precio = 700;
  assert.equal(correccionDirty(f1, e2), true);
});

// ── Que NO deben marcar dirty ────────────────────────────────────────────────
test("mismo estado exacto → NO dirty", () => {
  assert.equal(correccionDirty(F0, baseEstado()), false);
});
test("volver exactamente al estado inicial (cambiar y revertir) → NO dirty", () => {
  const e = baseEstado(); e.lineas[0].precio = 1200; e.lineas[0].precio = 1000;
  assert.equal(correccionDirty(F0, e), false);
});
test("restaurar producto eliminado (quitar y volver a poner) → NO dirty", () => {
  const e = baseEstado(); e.lineas = []; e.lineas = baseEstado().lineas;
  assert.equal(correccionDirty(F0, e), false);
});
test("orden de líneas distinto → NO dirty (sort estable)", () => {
  const dos = {
    lineas: [
      { origenDetalleId: 1, productoBaseId: 10, cantidad: 1, precio: 1000, precioCosto: 700, modoVentaLinea: "NORMAL", factorPack: 1, cantidadStock: 1, esServicio: false },
      { origenDetalleId: 2, productoBaseId: 20, cantidad: 2, precio: 500, precioCosto: 300, modoVentaLinea: "NORMAL", factorPack: 1, cantidadStock: 2, esServicio: false },
    ],
    pagos: [{ medio: "EFECTIVO", monto: 2000 }], cliente: null, motivo: "",
  };
  const rev = { ...dos, lineas: [dos.lineas[1], dos.lineas[0]] };
  assert.equal(firmaCorreccion(dos), firmaCorreccion(rev));
});
test("orden de pagos distinto → NO dirty (sort estable)", () => {
  const a = { lineas: [], pagos: [{ medio: "EFECTIVO", monto: 600 }, { medio: "DEBITO", monto: 400 }], cliente: null, motivo: "" };
  const b = { lineas: [], pagos: [{ medio: "DEBITO", monto: 400 }, { medio: "EFECTIVO", monto: 600 }], cliente: null, motivo: "" };
  assert.equal(firmaCorreccion(a), firmaCorreccion(b));
});
test("metadatos de UI no funcionales (key, nombre, removed, flags) → NO dirty", () => {
  const e = baseEstado();
  e.lineas[0] = { ...e.lineas[0], key: "l99", nombre: "Coca Cola", presentacion: "u", removed: false, puedeToggle: true, reconstruccion: { estado: "ok" } };
  assert.equal(correccionDirty(F0, e), false);
});
test("importes: 1000 vs 1000.00 → NO dirty (centavos)", () => {
  const e = baseEstado(); e.lineas[0].precio = 1000.0; e.pagos[0].monto = 1000.0;
  assert.equal(correccionDirty(F0, e), false);
});
test("motivo con espacios alrededor → NO dirty (trim)", () => {
  const conEsp = { ...baseEstado(), motivo: "   " };
  assert.equal(correccionDirty(F0, conEsp), false);
});
test("cliente mismo id, distinto nombre → NO dirty", () => {
  const a = { ...baseEstado(), cliente: { id: 7, nombre: "Ana" } };
  const b = { ...baseEstado(), cliente: { id: 7, nombre: "ANA GOMEZ" } };
  assert.equal(firmaCorreccion(a), firmaCorreccion(b));
});

// ── Snapshot / recarga ───────────────────────────────────────────────────────
test("sin snapshot (firmaInicial=null) → NO dirty", () => {
  assert.equal(correccionDirty(null, baseEstado()), false);
});
test("recargar venta: nuevo snapshot del estado recargado → NO dirty", () => {
  // Simula recarga: el estado cambió respecto del original, pero el snapshot se
  // reemplaza por el nuevo estado cargado → dirty=false contra el nuevo baseline.
  const recargado = { ...baseEstado(), lineas: [{ origenDetalleId: 9, productoBaseId: 99, cantidad: 5, precio: 250, precioCosto: 100, modoVentaLinea: "NORMAL", factorPack: 1, cantidadStock: 5, esServicio: false }], pagos: [{ medio: "EFECTIVO", monto: 1250 }] };
  const fNuevo = firmaCorreccion(recargado);
  assert.equal(correccionDirty(fNuevo, recargado), false);
  // Y sí detecta cambios posteriores contra el nuevo baseline.
  const post = JSON.parse(JSON.stringify(recargado)); post.lineas[0].cantidad = 6;
  assert.equal(correccionDirty(fNuevo, post), true);
});

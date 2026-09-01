// CANDADO: POS VENTAS CONTROLA EL STOCK, PERO NO LO EXPONE AL CAJERO.
//
// La disponibilidad sigue viajando por el DTO y limita la venta. Este candado
// solo defiende la frontera visual: búsqueda, carrito y avisos de la pantalla.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const BUSCADOR = leer("components/pos-ventas/BuscadorProductos.jsx");
const CARRITO = leer("components/pos-ventas/CarritoVenta.jsx");
const PANTALLA = leer("app/modulos/pos-ventas/page.jsx");
const EDITOR_COMBO = leer("components/productos/EditorComponentesCombo.jsx");

test("POS1. EL POS APAGA EL STOCK DEL BUSCADOR COMPARTIDO", () => {
  assert.match(BUSCADOR, /mostrarStock = true/);
  assert.match(BUSCADOR, /if \(mostrarStock\)/);
  assert.match(PANTALLA, /<BuscadorProductos[\s\S]*?mostrarStock=\{false\}/);
  assert.match(EDITOR_COMBO, /<BuscadorProductos/);
  assert.doesNotMatch(EDITOR_COMBO, /mostrarStock=\{false\}/);

  // El editor de combos conserva el default; el producto no vendible sigue
  // bloqueado en ambos consumidores, pero sin revelar el motivo en el aviso.
  assert.match(BUSCADOR, /disponibleParaVenta === false/);
  assert.match(BUSCADOR, /Producto no disponible para la venta/);
});

test("POS2. EL CARRITO NO DIBUJA STOCK EN MÓVIL NI EN ESCRITORIO", () => {
  assert.doesNotMatch(
    CARRITO,
    /stockChipText|StockDeposito|mostrarStockDeposito|fromUnidades/
  );
  assert.doesNotMatch(CARRITO, /Stock:|Stock disponible|Sin stock/i);

  // El límite interno de cantidad sigue vigente: ocultar no es dejar de controlar.
  assert.match(CARRITO, /item\.stockMax/);
});

test("POS3. LA PANTALLA NO PUBLICA AVISOS DE STOCK", () => {
  assert.doesNotMatch(
    PANTALLA,
    /producto\.stock|productoKgPendiente\.stock|allowNegativeStockUsed/
  );
  assert.doesNotMatch(PANTALLA, /Stock bajo|stock negativo/i);

  // Solo el rechazo por cantidad se traduce; otros 409 conservan su explicación.
  assert.match(PANTALLA, /No se pudo completar la venta con la cantidad solicitada/);
  assert.match(PANTALLA, /data\?\.limitante/);
  assert.match(PANTALLA, /mensajeErrorVenta\(data,/);
});

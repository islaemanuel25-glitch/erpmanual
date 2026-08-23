// CANDADOS DE STOCK MÓVIL CONSUMIENDO EL KIT DE PRODUCTOS.
//
// Defienden la cadena completa: el endpoint entrega la identificación, el mapper
// conserva esos datos, la adaptación monta la card compartida y la pantalla deja
// la tabla exclusivamente para escritorio.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaStockMovil, {
  cantidadParaTarjeta,
} from "@/components/stock_locales/TarjetaStockMovil";
import { mapStockItemLocal } from "@/lib/stock/mapItem";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const ADAPTADOR = leer("components/stock_locales/TarjetaStockMovil.jsx");
const LISTADO = leer("components/stock_locales/TablaStock.jsx");
const RUTA = leer("app/api/stock_locales/listar/route.js");

const PACK = {
  id: 9,
  nombre: "Gaseosa cola 2 L x24",
  proveedorNombre: "Distribuidora Centro",
  codigoBarra: "7790000000001",
  codigoInterno: "CC-204",
  imagenUrl: "/uploads/cola.webp",
  unidadMedida: "pack",
  factorPack: 24,
  stock: 51,
  stockMin: 24,
  stockMax: 96,
  faltante: false,
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
  modoVentaDeposito: "PESO",
};

test("S1. Stock no escribió otra card: monta núcleo, valor y acciones del kit", () => {
  assert.match(ADAPTADOR, /SunmiProductoCard/);
  assert.match(ADAPTADOR, /BloqueValorTarjeta/);
  assert.match(ADAPTADOR, /AccionTarjeta/);
  assert.match(ADAPTADOR, /MiniaturaProductoTarjeta/);
  assert.doesNotMatch(ADAPTADOR, /SunmiPanel|SunmiCard/);
});

test("S2. la card muestra identificación, stock, límites y las dos acciones reales", () => {
  const html = renderToStaticMarkup(
    createElement(TarjetaStockMovil, {
      producto: PACK,
      esDeposito: true,
      onAjustar: () => {},
      onEditarLimites: () => {},
    })
  );

  for (const dato of [
    PACK.nombre,
    PACK.proveedorNombre,
    PACK.codigoBarra,
    PACK.codigoInterno,
    "2 bultos",
    "3 uds sueltas",
    "Mín. 1 b",
    "Máx. 4 b",
    "Ajustar",
    "Límites",
  ]) {
    assert.match(html, new RegExp(dato.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `falta ${dato}`);
  }
  assert.match(html, /data-tarjeta-foto/);
});

test("S3. la presentación móvil conserva depósito, local y kilos", () => {
  assert.deepEqual(cantidadParaTarjeta(PACK, true), {
    principal: "2 bultos",
    rotulo: "Pack x24 · 3 uds sueltas",
  });

  assert.deepEqual(cantidadParaTarjeta(PACK, false), {
    principal: "51 uds",
    rotulo: "Unidad · Dep. Pack x24",
  });

  const kilos = {
    ...PACK,
    unidadMedida: "kg",
    factorPack: 1,
    stock: 1.25,
    modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 0.25,
  };
  assert.deepEqual(cantidadParaTarjeta(kilos, false), {
    principal: "1.250 kg",
    rotulo: "Kg · ≈ 5 pzs",
  });
});

test("S4. el listado usa cards solo en móvil y conserva la tabla en escritorio", () => {
  assert.match(LISTADO, /<TarjetaStockMovil/);
  assert.match(LISTADO, /<SunmiListaProductoCards/);
  assert.match(LISTADO, /<SunmiPaginador/);
  assert.match(LISTADO, /className="md:hidden mt-1"/);
  assert.match(LISTADO, /className="hidden md:block overflow-x-auto/);
  assert.match(LISTADO, /<table/);
  assert.match(LISTADO, /className="hidden md:block"[\s\S]*?<ColumnPicker/);
});

test("S5. el endpoint entrega la identificación en el mismo pedido del listado", () => {
  assert.match(RUTA, /imagen_url:\s*true/);
  assert.match(RUTA, /proveedor:\s*\{\s*select:\s*\{\s*nombre:\s*true/);
  assert.match(RUTA, /codigosProveedor:\s*\{/);
  assert.doesNotMatch(ADAPTADOR, /fetch\s*\(/);
});

test("S6. el mapper prefiere el código del proveedor principal", () => {
  const base = {
    id: 4,
    nombre: "Producto",
    codigo_barra: "779",
    imagen_url: "/p.webp",
    categoria_id: null,
    proveedor_id: 20,
    area_fisica_id: null,
    unidad_medida: "unidad",
    factor_pack: 1,
    precio_costo: 100,
    precio_venta: 150,
    redondeo_100: false,
    proveedor: { nombre: "Principal" },
    codigosProveedor: [
      { proveedorId: 10, codigoInterno: "SEC" },
      { proveedorId: 20, codigoInterno: "PRI" },
    ],
  };
  const item = mapStockItemLocal(
    { id: 8, localId: 2, precio_costo: null, precio_venta: null, margen: 30 },
    base,
    { cantidad: 5, stockMin: 1, stockMax: 10 }
  );
  assert.equal(item.proveedorNombre, "Principal");
  assert.equal(item.codigoInterno, "PRI");
  assert.equal(item.imagenUrl, "/p.webp");
});


// UNA COMPARACIÓN HECHA Y UN "NO HAY CON QUÉ COMPARAR" NO PUEDEN CONVIVIR.
//
// ── EL DEFECTO QUE TRAJO ESTE ARCHIVO ──────────────────────────────────────
//
// En producción, pedido 232, línea 112 —el papel dice "PHILIPS SELECT RED KS"—:
// la hoja mostraba "El precio bajó 15,0 % · Tenías $26.460,00 · la factura trae
// $22.500,00" con sus dos opciones, y abajo, en rojo, "El producto vinculado no
// tiene costo ni bulto cargados, así que no hay con qué comparar".
//
// Las dos cosas no podían ser ciertas a la vez, y el cartel además nombraba una
// causa falsa: ese producto tiene costo 26.460 y bulto de 10 cargados. Lo que
// pasaba es que la pantalla y el servidor miraban datos distintos — la pantalla
// resolvía el producto con la cascada de vínculo (por ALIAS del proveedor) y el
// servidor leía la columna `productoLocalId`, que estaba vacía.
//
// Los números de los fixtures son los MEDIDOS sobre esa línea, no inventados.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ESTADO_LINEA,
  estadoDeLinea,
  hayQueDecidirElPrecio,
  motivoSinComparacion,
  precioCambio,
  sePuedeCompararElPrecio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** Un candado que mira código saca los comentarios antes de mirar. */
const sinComentarios = (txt) =>
  txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

/**
 * La 112 tal como la devuelve el endpoint: la columna `productoLocalId` vacía
 * —nadie la vinculó a mano— y la línea del pedido resuelta por la cascada.
 */
const FILA_112 = {
  lineaId: 112,
  textoCrudo: "PHILIPS SELECT RED KS",
  producto: "Philips 20 red común",
  productoLocalId: null,
  productoBaseId: 2061,
  pedidoDetalleId: 2577,
  cantidad: 100,
  cantidadPedida: 10,
  unidad: { unidad: "POR_UNIDAD", lecturas: { porUnidad: { bultos: 10 }, porBulto: { bultos: 100 } } },
  costoFactura: 22500,
  costoCatalogo: 26460,
  decisionPrecio: null,
};

test("la línea que la hoja pudo comparar SE PUEDE comparar, y no hay motivo que decir", () => {
  assert.equal(sePuedeCompararElPrecio(FILA_112), true);
  assert.equal(motivoSinComparacion(FILA_112), null);
  assert.equal(precioCambio(FILA_112), true);
  assert.equal(hayQueDecidirElPrecio(FILA_112), true);
  assert.equal(estadoDeLinea(FILA_112), ESTADO_LINEA.PRECIO_DISTINTO);
});

test("LA REGLA: nunca una comparación hecha Y un motivo de que no hay con qué comparar", () => {
  // Es el defecto escrito como candado. Si las dos cosas pueden ser ciertas a
  // la vez para alguna forma de fila, la pantalla vuelve a contradecirse.
  const formas = [
    FILA_112,
    { ...FILA_112, costoFactura: null },
    { ...FILA_112, costoCatalogo: null },
    { ...FILA_112, costoFactura: null, costoCatalogo: null },
    { ...FILA_112, costoFactura: 26460 },
    { ...FILA_112, pedidoDetalleId: null, costoCatalogo: null },
    {},
  ];
  for (const f of formas) {
    const hayComparacion = precioCambio(f) || (sePuedeCompararElPrecio(f) && !precioCambio(f));
    const motivo = motivoSinComparacion(f);
    assert.equal(
      hayComparacion && motivo != null,
      false,
      `esta forma dice las dos cosas a la vez: ${JSON.stringify(f).slice(0, 80)}`
    );
  }
});

test("cuando falta un número, se dice CUÁL falta", () => {
  // "No hay con qué comparar" a secas manda a buscar el problema a cualquier
  // lado. Los tres casos que existen dicen cosas distintas.
  assert.match(
    motivoSinComparacion({ ...FILA_112, costoFactura: null }),
    /qué producto es/,
    "sin producto resuelto"
  );
  assert.match(
    motivoSinComparacion({ ...FILA_112, costoCatalogo: null, pedidoDetalleId: null }),
    /no está en el pedido/,
    "sin línea de pedido"
  );
  assert.match(
    motivoSinComparacion({ ...FILA_112, costoCatalogo: null }),
    /no tiene precio cargado/,
    "con línea de pedido pero sin precio"
  );
});

test("sin ninguno de los dos, el motivo no elige uno solo", () => {
  const m = motivoSinComparacion({ costoFactura: null, costoCatalogo: null });
  assert.match(m, /producto/);
  assert.match(m, /pedido/);
});

// ── LOS DOS LADOS PREGUNTAN LO MISMO ───────────────────────────────────────

test("la hoja y la ruta usan la MISMA función para decidir si hay comparación", () => {
  // Es lo único que impide que vuelvan a divergir: mientras las dos importen
  // esta función, no pueden contestar distinto sobre la misma línea.
  const hoja = sinComentarios(leer("components/compras-proveedor/HojaCorregirLinea.jsx"));
  const ruta = sinComentarios(
    leer("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js")
  );
  assert.match(hoja, /motivoSinComparacion/, "la hoja dejó de usarla");
  assert.match(ruta, /motivoSinComparacion/, "la ruta dejó de usarla");
});

test("EL CARTEL FALSO NO VUELVE, y la ruta resuelve el producto como la pantalla", () => {
  const ruta = sinComentarios(
    leer("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js")
  );
  assert.doesNotMatch(
    ruta,
    /no tiene costo ni bulto cargados/,
    "volvió el cartel que nombraba una causa falsa"
  );
  // Y la resolución sale de la función de la pantalla, no de la columna sola.
  assert.match(ruta, /analizarLineas\(/, "la ruta volvió a resolver el producto por su cuenta");
  assert.doesNotMatch(
    ruta,
    /porProductoLocal\.get\(/,
    "la ruta volvió a leer el producto de la columna `productoLocalId`"
  );
});

test("CONTRAPRUEBA: sobre el código de antes, los dos candados de arriba dan rojo", () => {
  // Sin esto no se sabe si afirman algo. Se reconstruye el fragmento que la
  // ruta tenía y se comprueba que cada patrón lo señala.
  const comoEstaba = `
    const base = porProductoLocal.get(Number(linea.productoLocalId))?.base ?? null;
    if (!analisis) {
      return NextResponse.json({ ok: false,
        error: "El producto vinculado no tiene costo ni bulto cargados, así que no hay con qué comparar." },
        { status: 409 });
    }
  `;
  assert.match(comoEstaba, /no tiene costo ni bulto cargados/);
  assert.match(comoEstaba, /porProductoLocal\.get\(/);
  assert.doesNotMatch(comoEstaba, /motivoSinComparacion/);
});

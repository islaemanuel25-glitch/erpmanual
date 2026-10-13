import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orCodigoBarraProductoLocal,
  orCodigoBarraBaseLocal,
  codigosDeProductoLocal,
  codigosDeItem,
  mismoCodigoGtin,
  variantesGtin,
} from "./busquedaCodigoBarra.js";

// ---------------------------------------------------------------------------
// GTIN con otros ceros a la izquierda (UPC-A de 12 contra EAN-13)
// ---------------------------------------------------------------------------
test("GTIN: UPC-A y EAN-13 del mismo número son el mismo código", () => {
  assert.equal(mismoCodigoGtin("012345678905", "0012345678905"), true);
  assert.equal(mismoCodigoGtin("0012345678905", "00012345678905"), true);
  assert.equal(mismoCodigoGtin("7790895000997", "7790895000997"), true);
  assert.equal(mismoCodigoGtin("012345678905", "1012345678905"), false);
  // Fuera de 12–14 dígitos el cero distingue.
  assert.equal(mismoCodigoGtin("0123", "123"), false);
  assert.equal(mismoCodigoGtin("0779089500099", "779089500099A"), false);
  assert.equal(mismoCodigoGtin("", ""), false);
});

test("GTIN: variantes de 12 a 14 dígitos, y un código no GTIN queda solo", () => {
  assert.deepEqual(variantesGtin("0012345678905").sort(), ["00012345678905", "0012345678905", "012345678905"].sort());
  assert.deepEqual(variantesGtin("7790895000997").sort(), ["07790895000997", "7790895000997"].sort());
  assert.deepEqual(variantesGtin("LOC77"), ["LOC77"]);
  assert.deepEqual(variantesGtin("0123"), ["0123"]);
});

// ---------------------------------------------------------------------------
// orCodigoBarraProductoLocal — OR para queries de ProductoLocal (por localId)
// ---------------------------------------------------------------------------
test("OR ProductoLocal: incluye el propio + los dos globales de la base", () => {
  const or = orCodigoBarraProductoLocal("779");
  assert.deepEqual(or, [
    { codigo_barra_propio: "779" },
    { base: { OR: [{ codigo_barra: "779" }, { codigo_barra_secundario: "779" }] } },
  ]);
});

// ---------------------------------------------------------------------------
// orCodigoBarraBaseLocal — OR para queries de ProductoBase acotadas a un local
// ---------------------------------------------------------------------------
test("OR Base+local: equals por defecto, propio vía locales.some(localId)", () => {
  const or = orCodigoBarraBaseLocal("779", 5);
  assert.deepEqual(or, [
    { codigo_barra: { equals: "779" } },
    { codigo_barra_secundario: { equals: "779" } },
    { locales: { some: { localId: 5, codigo_barra_propio: { equals: "779" } } } },
  ]);
});
test("OR Base+local: contains + mode insensitive", () => {
  const or = orCodigoBarraBaseLocal("le", 3, { op: "contains", mode: "insensitive" });
  assert.deepEqual(or, [
    { codigo_barra: { contains: "le", mode: "insensitive" } },
    { codigo_barra_secundario: { contains: "le", mode: "insensitive" } },
    { locales: { some: { localId: 3, codigo_barra_propio: { contains: "le", mode: "insensitive" } } } },
  ]);
});

// ---------------------------------------------------------------------------
// codigosDeProductoLocal / codigosDeItem — para ranking/getCodigo
// ---------------------------------------------------------------------------
test("codigosDeProductoLocal: propio + globales, filtra vacíos/null", () => {
  assert.deepEqual(
    codigosDeProductoLocal({ codigo_barra_propio: "P1", base: { codigo_barra: "G1", codigo_barra_secundario: null } }),
    ["P1", "G1"]
  );
  assert.deepEqual(
    codigosDeProductoLocal({ codigo_barra_propio: null, base: { codigo_barra: "G1", codigo_barra_secundario: "G2" } }),
    ["G1", "G2"]
  );
  assert.deepEqual(codigosDeProductoLocal({ codigo_barra_propio: null, base: {} }), []);
});
test("codigosDeItem: sobre DTO ya mapeado", () => {
  assert.deepEqual(
    codigosDeItem({ codigoBarraPropio: "P1", codigoBarra: "G1", codigoBarraSecundario: "" }),
    ["P1", "G1"]
  );
});

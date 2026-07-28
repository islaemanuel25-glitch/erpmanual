import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orCodigoBarraProductoLocal,
  orCodigoBarraBaseLocal,
  codigosDeProductoLocal,
  codigosDeItem,
} from "./busquedaCodigoBarra.js";

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

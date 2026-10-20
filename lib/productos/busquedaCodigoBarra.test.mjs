import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orCodigoBarraProductoLocal,
  orCodigoBarraBaseLocal,
  codigosDeProductoLocal,
  codigosDeItem,
  mismoCodigoGtin,
  variantesGtin,
  buscarProductoLocalPorCodigo,
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
// ---------------------------------------------------------------------------
// buscarProductoLocalPorCodigo — el buscador por código del POS, que usa Stock
// ---------------------------------------------------------------------------
// Un cliente falso que evalúa el `where` con las formas que la función manda
// (igualdad, `{ in }`, `OR`, la relación `base`) y registra cada consulta. Que la
// consulta sea válida para Postgres lo prueba `scripts/pruebas-db/stockCodigoPropio.mjs`.
function clienteFalso(filas) {
  const consultas = [];
  const cumple = (fila, where) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return v.some((w) => cumple(fila, w));
      if (k === "base") return fila.base != null && cumple(fila.base, v);
      if (v && typeof v === "object" && "in" in v) return v.in.includes(fila[k]);
      return fila[k] === v;
    });
  return {
    consultas,
    productoLocal: {
      findFirst: async ({ where }) => {
        consultas.push(where);
        return filas.find((f) => cumple(f, where)) ?? null;
      },
    },
  };
}
// La forma de las filas es la de ProductoLocal con su base, como la guarda Prisma.
const base = (id, codigo_barra, codigo_barra_secundario = null) => ({ id, activo: true, codigo_barra, codigo_barra_secundario });
const pl = (id, localId, b, codigo_barra_propio = null) => ({ id, localId, activo: true, codigo_barra_propio, base: b });
const DEL_DEPOSITO = base(1, "7790001000011", "7790001000099");
const OTRO = base(2, "LOCAL-555");
// El del código global va PRIMERO a propósito: una sola consulta con los tres
// códigos en un OR lo devolvería a él, y el candado tiene que verlo.
const FILAS = [
  pl(11, 7, OTRO), // en Mini, un producto cuyo código GLOBAL es el mismo número
  pl(21, 8, OTRO),
  pl(10, 7, DEL_DEPOSITO, "LOCAL-555"), // Mini: código propio sobre un producto del depósito
  pl(20, 8, DEL_DEPOSITO), // Casiano: el mismo producto, sin código propio
];
const buscar = (db, localId, codigo) => buscarProductoLocalPorCodigo(db, { localId, codigo });

test("por código: el propio de un local encuentra el producto del depósito en ESE local", async () => {
  assert.equal((await buscar(clienteFalso(FILAS), 7, "LOCAL-555"))?.id, 10);
});
test("por código: el propio gana sobre un global igual de otro producto, y no sale de su local", async () => {
  // En Mini gana el propio; en Casiano ese número es solo el global del otro.
  assert.equal((await buscar(clienteFalso(FILAS), 7, "LOCAL-555"))?.id, 10);
  assert.equal((await buscar(clienteFalso(FILAS), 8, "LOCAL-555"))?.id, 21);
  // Y sin el otro producto, en Casiano no encuentra nada.
  assert.equal(await buscar(clienteFalso(FILAS.filter((f) => f.base !== OTRO)), 8, "LOCAL-555"), null);
});
test("por código: el principal y el secundario encuentran en cualquier local", async () => {
  for (const localId of [7, 8]) {
    const esperado = localId === 7 ? 10 : 20;
    assert.equal((await buscar(clienteFalso(FILAS), localId, "7790001000011"))?.id, esperado);
    assert.equal((await buscar(clienteFalso(FILAS), localId, "7790001000099"))?.id, esperado);
  }
});
test("por código: el mismo GTIN con otro cero adelante, después del exacto", async () => {
  const db = clienteFalso(FILAS);
  assert.equal((await buscar(db, 8, "07790001000099"))?.id, 20);
  assert.equal(db.consultas.length, 4, "propio exacto, globales exacto, propio y globales con las otras formas");
  assert.deepEqual(db.consultas[2].codigo_barra_propio, { in: ["7790001000099"] });
});
test("por código: cada consulta va acotada al local, activa y con la base activa", async () => {
  const db = clienteFalso(FILAS);
  await buscar(db, 7, "NADA");
  assert.ok(db.consultas.length > 0);
  for (const w of db.consultas) {
    assert.equal(w.localId, 7);
    assert.equal(w.activo, true);
    assert.equal(w.base?.activo, true);
  }
  assert.equal(await buscar(db, 7, "   "), null);
});
test("codigosDeItem: sobre DTO ya mapeado", () => {
  assert.deepEqual(
    codigosDeItem({ codigoBarraPropio: "P1", codigoBarra: "G1", codigoBarraSecundario: "" }),
    ["P1", "G1"]
  );
});

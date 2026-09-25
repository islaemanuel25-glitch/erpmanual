// Candados de LO QUE UNA LÍNEA DE COMPRA SUMÓ AL STOCK, congelado al recibir.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/stockIngresado.test.mjs
//
// Lo que se defiende no es una cuenta: es que la cuenta NO se vuelva a hacer.
// `stockIngresado` tiene que ser el número que el cierre pasó al `increment` del
// stock, escrito una sola vez y por un solo lugar. Los números mismos —que un
// pack de 12 entre como 120, que un fiambre fijo entre en piezas al depósito—
// se prueban contra Postgres en `scripts/pruebas-db/recepcionCompras.mjs`, que
// es donde se ve la fila de verdad.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { unidadFisicaDelIngreso, UNIDAD_FISICA_STOCK } from "./stockIngresado.js";
import { clasificarSql } from "../../scripts/clasificar-migraciones.mjs";

const RAIZ = process.cwd();
const CIERRE = "app/api/compras-proveedor/recibir/[id]/route.js";

/** El código sin comentarios: un candado que busca texto encuentra la prosa. */
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// Productos como los lee el cierre: los campos que usa `esFiambreFijo`.
const FIAMBRE_FIJO = {
  unidad_medida: "kg",
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 0.7,
  modoVentaDeposito: "PIEZA",
};
const FIAMBRE_PESO = { ...FIAMBRE_FIJO, modoVentaDeposito: "PESO" };
const KG_POR_BULTO = { unidad_medida: "kg", modoCompraProveedor: "BULTO", factor_pack: 1 };
const PACK = { unidad_medida: "pack", modoCompraProveedor: "BULTO", factor_pack: 12 };

// ── LA UNIDAD ─────────────────────────────────────────────────────────────

test("LA RAMA QUE NO ES DE PESO SUMA UNIDADES, AUNQUE EL PRODUCTO SEA UN PACK", () => {
  assert.equal(unidadFisicaDelIngreso({ vaPorPeso: false, base: PACK, destinoEsDeposito: true }), "UNIDAD");
});

test("Y TAMBIÉN UNIDADES SI EL PRODUCTO SE MIDE EN KILOS PERO NADIE LOS PESÓ", () => {
  // Es lo que la rama hace hoy: sin kilos de la hoja, un producto por kilo que
  // se compra por bulto entra por la rama de unidades. Se congela lo que pasó,
  // no lo que debería haber pasado.
  assert.equal(unidadFisicaDelIngreso({ vaPorPeso: false, base: KG_POR_BULTO, destinoEsDeposito: true }), "UNIDAD");
});

test("LA RAMA DE PESO SUMA KILOS", () => {
  assert.equal(unidadFisicaDelIngreso({ vaPorPeso: true, base: KG_POR_BULTO, destinoEsDeposito: true }), "KG");
  assert.equal(unidadFisicaDelIngreso({ vaPorPeso: true, base: FIAMBRE_PESO, destinoEsDeposito: true }), "KG");
});

test("EL FIAMBRE FIJO SUMA PIEZAS EN EL DEPÓSITO Y KILOS EN UN LOCAL", () => {
  // El mismo producto, dos unidades: por eso la unidad se congela con la
  // línea y no se le pregunta después al producto.
  assert.equal(unidadFisicaDelIngreso({ vaPorPeso: true, base: FIAMBRE_FIJO, destinoEsDeposito: true }), "PIEZA");
  assert.equal(unidadFisicaDelIngreso({ vaPorPeso: true, base: FIAMBRE_FIJO, destinoEsDeposito: false }), "KG");
});

test("EL ENUM DEL ESQUEMA SON EXACTAMENTE LAS TRES UNIDADES, Y NINGUNA PRESENTACIÓN", () => {
  const esquema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  const bloque = /enum UnidadFisicaStock \{([^}]*)\}/.exec(esquema);
  assert.ok(bloque, "falta el enum UnidadFisicaStock");
  const valores = bloque[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
  assert.deepEqual(valores, Object.values(UNIDAD_FISICA_STOCK));
  assert.ok(!valores.includes("PACK") && !valores.includes("CAJON"));
});

test("LAS DOS COLUMNAS SON NULLABLES, SIN DEFAULT, EN LA LÍNEA DEL PEDIDO", () => {
  const esquema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  const modelo = /model PedidoProveedorDetalle \{([\s\S]*?)\n\}/.exec(esquema)?.[1] ?? "";
  assert.match(modelo, /\n\s*stockIngresado\s+Decimal\?\s+@db\.Decimal\(12, 3\)\s*\n/);
  assert.match(modelo, /\n\s*stockIngresadoUnidad\s+UnidadFisicaStock\?\s*\n/);
  // La escala es la de `StockLocal.cantidad`: con menos decimales, lo
  // congelado no sería lo que sumó.
  assert.match(esquema, /model StockLocal \{[\s\S]*?cantidad\s+Decimal\s+@db\.Decimal\(12, 3\)/);
});

// ── EL CIERRE ESCRIBE EL MISMO NÚMERO QUE SUMA ────────────────────────────

test("EL CIERRE CONGELA LA MISMA VARIABLE QUE PASA AL INCREMENT DEL STOCK", () => {
  const cierre = codigoDe(CIERRE);
  assert.match(cierre, /cantidad:\s*\{\s*increment:\s*incremento\s*\}/);
  assert.match(cierre, /stockIngresado:\s*incremento,/);
  assert.match(cierre, /stockIngresadoUnidad:\s*unidadIngreso,/);
  // Y en ningún otro lugar se le asigna algo que no sea eso o el cero de la
  // línea que no sumó nada.
  const asignaciones = [...cierre.matchAll(/stockIngresado\s*[:=]\s*([^,;\n]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(asignaciones.sort(), ["0", "incremento"]);
});

test("LA UNIDAD SALE DE LA MISMA CONDICIÓN QUE ELIGE LA RAMA", () => {
  const cierre = codigoDe(CIERRE);
  assert.match(
    cierre,
    /const vaPorPeso = modoCompra === "UNIDAD" \|\| \(elDepositoCuentaPorKilo\(base\) && hayKilosDeLaHoja\);/
  );
  assert.match(cierre, /unidadFisicaDelIngreso\(\{ vaPorPeso, base, destinoEsDeposito \}\)/);
  assert.match(cierre, /if \(vaPorPeso\) \{/);
  // La rama de peso elige piezas o kilos con la misma función que la unidad.
  assert.match(cierre, /incremento = esFiambreFijoEnUbicacion\(base, destinoEsDeposito\)\s*\?\s*cantRecibida\s*:\s*kgReales/);
});

test("EL COMBO NO LLEVA NADA, Y EL CERO SÍ LLEVA SU UNIDAD", () => {
  const cierre = codigoDe(CIERRE);
  // El cero se escribe solo si NO es combo.
  assert.match(
    cierre,
    /if \(!esComboBase\(base\)\) \{\s*detCero\.stockIngresado = 0;\s*detCero\.stockIngresadoUnidad = unidadIngreso;\s*\}/
  );
  // Y el combo con cantidad sale del bucle antes de llegar al detalle.
  const combo = cierre.indexOf("if (esComboBase(base)) continue;");
  const congela = cierre.indexOf("stockIngresado: incremento,");
  assert.ok(combo > 0 && congela > combo, "el combo tiene que salir antes de congelar");
});

// ── NADIE MÁS LO ESCRIBE ──────────────────────────────────────────────────

/**
 * TODO lo que escribe en `PedidoProveedorDetalle` fuera de las pruebas, con el
 * motivo por el que no puede tocar lo congelado. Si aparece un escritor nuevo,
 * este censo se pone rojo y obliga a mirarlo: una ruta que acepte el cuerpo del
 * pedido entero podría reescribir el hecho de una compra ya recibida.
 */
const ESCRITORES = {
  "app/api/compras-proveedor/recibir/[id]/route.js": "el único que congela; sale sin escribir si ya está RECIBIDO",
  "app/api/compras-proveedor/crear/route.js": "crea líneas de un pedido nuevo",
  "app/api/compras-proveedor/agregar-item/[id]/route.js": "solo BORRADOR o ENVIADO",
  "app/api/compras-proveedor/eliminar-item/[id]/route.js": "solo BORRADOR o ENVIADO",
  "app/api/compras-proveedor/editar-item/[id]/route.js": "solo BORRADOR",
  "app/api/compras-proveedor/importar/aplicar/[id]/route.js": "solo BORRADOR",
  "app/api/compras-proveedor/recepcion/correccion/route.js": "rechaza un pedido RECIBIDO",
  "app/api/compras-proveedor/comprobantes/aceptar-precio/route.js": "escribe solo precioCosto",
  "app/api/compras-proveedor/comprobantes/vincular/route.js": "escribe solo precioCosto",
  "lib/compras-proveedor/sembrarPedidoDesdeFactura.js": "crea líneas de un pedido nuevo",
  "app/api/admin/reset-operativo/route.js": "borra TODO el operativo; no reescribe una fila",
};

const ESCRIBE_DETALLE = [
  /pedidoProveedorDetalle\.(update|updateMany|upsert|create|createMany|delete|deleteMany)\b/,
  /detalles:\s*\{\s*(create|createMany|update|updateMany|upsert|delete|deleteMany|set)\b/,
  /"PedidoProveedorDetalle"/,
];

function escritoresDelDetalle() {
  const candidatos = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "-i", "-e", "pedidoProveedorDetalle", "-e", "detalles:", "--", "app", "lib"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.mjs"));
  return candidatos.filter((f) => {
    const codigo = codigoDe(f);
    if (!/pedidoProveedor/i.test(codigo)) return false;
    return ESCRIBE_DETALLE.some((re) => re.test(codigo));
  });
}

test("EL CENSO DE LOS QUE ESCRIBEN LA LÍNEA DEL PEDIDO ESTÁ COMPLETO", () => {
  assert.deepEqual(escritoresDelDetalle().sort(), Object.keys(ESCRITORES).sort());
});

test("SOLO EL CIERRE NOMBRA LO CONGELADO; NINGÚN OTRO ESCRITOR LO TOCA", () => {
  for (const f of Object.keys(ESCRITORES)) {
    const codigo = codigoDe(f);
    if (f === CIERRE) {
      assert.match(codigo, /stockIngresado/, f);
      continue;
    }
    assert.doesNotMatch(codigo, /stockIngresado/, `${f} no puede nombrar stockIngresado`);
  }
});

test("NINGÚN ESCRITOR PASA EL CUERPO DEL PEDIDO ENTERO A LA BASE", () => {
  // Con el cuerpo entero en `data`, un cliente podría mandar `stockIngresado`
  // y reescribir el hecho aunque la ruta no lo nombre.
  for (const f of Object.keys(ESCRITORES)) {
    const codigo = codigoDe(f);
    assert.doesNotMatch(codigo, /data:\s*(body|req\.body|await req\.json\(\))\b/, f);
    assert.doesNotMatch(codigo, /data:\s*\{\s*\.\.\.(body|req\.body)\b/, f);
  }
});

test("LOS QUE CORREN SOBRE UN PEDIDO RECIBIDO NO ESCRIBEN MÁS QUE EL PRECIO", () => {
  // aceptar-precio y vincular no miran el estado del pedido: por eso se exige
  // que lo único que escriban en la línea sea `precioCosto`.
  for (const f of [
    "app/api/compras-proveedor/comprobantes/aceptar-precio/route.js",
    "app/api/compras-proveedor/comprobantes/vincular/route.js",
  ]) {
    const codigo = codigoDe(f);
    const datos = [...codigo.matchAll(/pedidoProveedorDetalle\.update\(\{[\s\S]*?data:\s*\{([^}]*)\}/g)].map((m) =>
      m[1].trim()
    );
    assert.ok(datos.length > 0, `${f}: no se encontró la escritura`);
    for (const d of datos) assert.match(d, /^precioCosto:\s*[\w.]+,?$/, `${f}: escribe «${d}»`);
  }
});

test("LOS QUE EDITAN LÍNEAS SIGUEN GUARDADOS POR EL ESTADO DEL PEDIDO", () => {
  assert.match(codigoDe("app/api/compras-proveedor/editar-item/[id]/route.js"), /pedido\.estado !== "BORRADOR"/);
  assert.match(codigoDe("app/api/compras-proveedor/importar/aplicar/[id]/route.js"), /pedido\.estado !== "BORRADOR"/);
  for (const f of ["agregar-item", "eliminar-item"]) {
    assert.match(
      codigoDe(`app/api/compras-proveedor/${f}/[id]/route.js`),
      /!\["BORRADOR", "ENVIADO"\]\.includes\(pedido\.estado\)/,
      f
    );
  }
  assert.match(
    codigoDe("app/api/compras-proveedor/recepcion/correccion/route.js"),
    /detalle\.pedido\.estado === "RECIBIDO"/
  );
  // Y el cierre no vuelve a cerrar: RECIBIDO contesta lo que quedó, antes y
  // después del lock.
  const cierre = codigoDe(CIERRE);
  assert.match(cierre, /if \(pedido\.estado === "RECIBIDO"\) \{\s*return respuestaDelCierre/);
  assert.match(cierre, /if \(vigente\?\.estado !== "ENVIADO"\) throw new CierreYaHecho\(\)/);
});

// ── LA MIGRACIÓN NO TOCA LO QUE YA ESTÁ ───────────────────────────────────

test("LA MIGRACIÓN ES ADITIVA: NI UPDATE, NI DEFAULT, NI NADA QUE RELLENE EL PASADO", () => {
  const carpetas = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "prisma/migrations"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => /stock_ingresado_congelado\/migration\.sql$/.test(f));
  assert.equal(carpetas.length, 1, "tiene que haber exactamente una migración de stock_ingresado_congelado");
  const sql = fs.readFileSync(path.join(RAIZ, carpetas[0]), "utf8");
  assert.deepEqual(clasificarSql(sql), [], "el clasificador de migraciones marcó algo");
  const sinComentarios = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(sinComentarios, /\bUPDATE\b|\bDEFAULT\b|\bINSERT\b|NOT NULL/i);
  assert.match(sinComentarios, /CREATE TYPE "UnidadFisicaStock" AS ENUM \('UNIDAD', 'KG', 'PIEZA'\)/);
});

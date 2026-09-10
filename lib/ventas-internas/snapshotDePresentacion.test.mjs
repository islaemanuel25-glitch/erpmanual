// DÓNDE SE CAPTURA LA PRESENTACIÓN, Y QUÉ PASA CUANDO HAY VARIAS FUENTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ventas-internas/snapshotDePresentacion.test.mjs
//
// La información de cómo se contó lo que salió NO se perdía antes de
// `mapearVentaATransferencia`: se perdía DENTRO, al quedarse solo con el total
// físico consolidado. En `lineasComerciales` —que esa función ya recibía— está
// `modoVentaLinea`, que distingue el pack de la unidad suelta, y `baseStock`, con
// la unidad de medida, el factor y el peso.
//
// Estos candados fijan que se capture de ahí y que la consolidación no invente.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRESENTACION } from "@/lib/productos/presentacionDeProducto";
import { snapshotDeLineas, snapshotsPorProductoLocal } from "./snapshotDePresentacion.js";
import { mapearVentaATransferencia } from "./mapearVentaATransferencia.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Una línea comercial como la devuelve `planConsumoVenta`. */
const linea = (extra = {}) => ({
  tipo: "NORMAL",
  productoLocalId: 7,
  productoBaseId: 70,
  cantidad: 1,
  consumoFisico: { productoLocalId: 7, cantidadStock: 1 },
  baseStock: { factorPack: 1, unidad_medida: "unidad", modoVentaDeposito: "PESO" },
  ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════
// LAS CINCO PRESENTACIONES, CAPTURADAS DESDE LA LÍNEA COMERCIAL
// ═══════════════════════════════════════════════════════════════════════════

test("un cajón se captura como CAJÓN con su factor", () => {
  const s = snapshotDeLineas([
    linea({ cantidad: 6, baseStock: { factorPack: 8, unidad_medida: "cajon" } }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.CAJON);
  assert.equal(s.cantidadPresentada, 6);
  assert.equal(s.factorPresentacion, 8);
  assert.equal(s.sueltasEnviadas, 0);
});

test("un pack se captura como PACK, no como cajón", () => {
  const s = snapshotDeLineas([
    linea({ cantidad: 6, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.PACK);
  assert.equal(s.factorPresentacion, 6);
});

test("un kilo se captura como KG y sin factor", () => {
  const s = snapshotDeLineas([
    linea({ cantidad: 3.25, baseStock: { unidad_medida: "kg", modoVentaDeposito: "PESO" } }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.KG);
  assert.equal(s.cantidadPresentada, 3.25);
  assert.equal(s.factorPresentacion, null);
  assert.equal(s.pesoPiezaKg, null);
});

test("una pieza fija se captura como PIEZA y CONGELA su peso", () => {
  const s = snapshotDeLineas([
    linea({
      cantidad: 2,
      baseStock: {
        unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 4.45,
        modoCompraProveedor: "UNIDAD",
      },
    }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.PIEZA);
  assert.equal(s.cantidadPresentada, 2);
  // Es el número del que sale cuántos KILOS acredita `confirmar-recepcion`.
  assert.equal(s.pesoPiezaKg, 4.45);
});

test("fuera de un depósito no hay piezas: manda lo que el producto es", () => {
  const s = snapshotDeLineas(
    [linea({ cantidad: 2, baseStock: { unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 4.45, modoCompraProveedor: "UNIDAD" } })],
    { esDeposito: false }
  );
  assert.equal(s.presentacionEnvio, PRESENTACION.KG);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSOLIDACIÓN: EL MISMO PRODUCTO CON VARIAS FUENTES
// ═══════════════════════════════════════════════════════════════════════════

test("packs completos y unidades sueltas del MISMO producto no se aplastan", () => {
  // El POS permite vender el mismo producto en dos modos. Consolidado da 29
  // unidades físicas, y de ahí no se puede volver: 29/6 no es entero.
  const s = snapshotDeLineas([
    linea({ cantidad: 4, modoVentaLinea: "NORMAL", baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    linea({ cantidad: 5, modoVentaLinea: "UNIDAD_REMANENTE", baseStock: { factorPack: 6, unidad_medida: "pack" } }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.PACK);
  assert.equal(s.cantidadPresentada, 4, "cuatro bultos completos");
  assert.equal(s.sueltasEnviadas, 5, "y cinco sueltas");
  assert.equal(s.factorPresentacion, 6);
  // La cuenta cierra y es exacta: 4 × 6 + 5 = 29.
  assert.equal(s.cantidadPresentada * s.factorPresentacion + s.sueltasEnviadas, 29);
});

test("dos líneas de packs del mismo producto se SUMAN", () => {
  const s = snapshotDeLineas([
    linea({ cantidad: 2, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    linea({ cantidad: 3, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
  ]);
  assert.equal(s.cantidadPresentada, 5);
  assert.equal(s.sueltasEnviadas, 0);
});

test("si dos líneas describen presentaciones INCOMPATIBLES no se inventa ninguna", () => {
  // No debería poder pasar, y si pasa se prefiere no registrar antes que elegir
  // una al azar. Una línea sin snapshot dice "no se registró", que es la verdad.
  const s = snapshotDeLineas([
    linea({ cantidad: 1, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    linea({ cantidad: 1, baseStock: { factorPack: 8, unidad_medida: "cajon" } }),
  ]);
  assert.equal(s, null);
});

test("agrupa por ProductoLocal y saltea lo que no es mercadería", () => {
  const mapa = snapshotsPorProductoLocal([
    linea({ productoLocalId: 1, cantidad: 6, consumoFisico: { productoLocalId: 1, cantidadStock: 36 }, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    linea({ productoLocalId: 2, cantidad: 3.25, consumoFisico: { productoLocalId: 2, cantidadStock: 3.25 }, baseStock: { unidad_medida: "kg" } }),
    // Un servicio no es mercadería.
    linea({ productoLocalId: 3, tipo: "SERVICIO" }),
    // Un combo viaja expandido en sus componentes, no como línea.
    linea({ productoLocalId: 4, tipo: "COMBO" }),
    // Una línea sin consumo físico no aporta.
    linea({ productoLocalId: 5, consumoFisico: null }),
  ]);

  assert.deepEqual([...mapa.keys()].sort((a, b) => a - b), [1, 2]);
  assert.equal(mapa.get(1).presentacionEnvio, PRESENTACION.PACK);
  assert.equal(mapa.get(2).presentacionEnvio, PRESENTACION.KG);
});

// ═══════════════════════════════════════════════════════════════════════════
// DÓNDE SE ENGANCHA, Y QUÉ NO SE TOCÓ
// ═══════════════════════════════════════════════════════════════════════════

test("el mapper captura la presentación SIN tocar la cantidad física", () => {
  const src = leer("lib/ventas-internas/mapearVentaATransferencia.js");

  // Se engancha donde la información todavía existe: las líneas comerciales.
  assert.match(src, /snapshotsPorProductoLocal\(lineasComerciales/);
  // Y se guarda SOLO si describe la misma mercadería que la línea va a mover.
  // La comparación es en milésimas enteras contra el consolidado, con los
  // helpers canónicos: ver `directo + combo` más abajo.
  assert.match(
    src,
    /aMilesimas\(fisicasDelSnapshot\(presentacion\)\) === c\.milesimas/,
    "el snapshot volvió a guardarse sin comprobar contra el consumo consolidado"
  );
  assert.match(src, /unidadesFisicasDelDescriptor\(descriptorDeEnvio\(presentacion\)\)/);

  // Y la regla física NO cambió: sigue mandando UNIDAD y factor 1, que es lo que
  // mantiene la paridad con el descuento de stock que la venta ya hizo.
  assert.match(src, /unidadEnviada: UNIDAD_ENVIADA/);
  assert.match(src, /factorPack: FACTOR_PACK/);
  assert.match(src, /export const UNIDAD_ENVIADA = "UNIDAD"/);
  assert.match(src, /export const FACTOR_PACK = 1/);
});

test("crearTransferencia persiste el snapshot y no lo inventa", () => {
  const src = leer("lib/transferencias/crearTransferencia.js");
  assert.match(src, /presentacionEnvio: p\.presentacionEnvio/);
  assert.match(src, /cantidadPresentada: p\.cantidadPresentada/);
  assert.match(src, /sueltasEnviadas: p\.sueltasEnviadas \?\? 0/);
  assert.match(src, /factorPresentacion: p\.factorPresentacion \?\? null/);
  assert.match(src, /pesoPiezaKg: p\.pesoPiezaKg \?\? null/);
  // Sin snapshot no se escribe nada: la línea queda con los cinco en null, que
  // es lo mismo que les pasa a las anteriores a la migración.
  assert.match(src, /const p = item\.presentacion \|\| null;/);
  assert.match(src, /\.\.\.\(p\s*\?\s*\{/);
});

test("y el camino manual congela lo que ya sabía", () => {
  const src = leer("app/api/pos-transferencias/enviar/route.js");
  assert.match(src, /function snapshotDeEnvioManual/);
  // Usa la unidad REALMENTE preparada, que este flujo sí registra.
  assert.match(src, /contadoEn: item\.unidadEnviada/);
  assert.match(src, /presentacion: snapshotDeEnvioManual\(item\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CAMINO REAL DEL POS: LO QUE PRISMA NO SELECCIONA, NO EXISTE
// ═══════════════════════════════════════════════════════════════════════════
//
// El candado de la PIEZA de más arriba llama a `snapshotDeLineas` con un objeto
// escrito a mano donde `modoCompraProveedor` está puesto. Por eso pasaba en
// verde mientras el camino real del POS lo tenía en `undefined`: el `select` del
// `findMany` de `ProductoBase` no lo pedía, y `baseStockMap` lo leía igual.
//
// `esProductoFiambre` —la puerta de `esFiambreFijo`— exige ese campo, así que
// daba false SIEMPRE. Un fiambre de pieza fija tiene `unidad_medida = "kg"`, o
// sea que caía en la rama del kilo: "2 PIEZA" se congelaba como "2 KG", y de ese
// número sale cuántos kilos le acredita `confirmar-recepcion` al destino.
//
// Estos candados miran el FUENTE de la ruta, no un objeto de laboratorio.

const RUTA_POS = "app/api/pos-ventas/crear/route.js";

/** El bloque `{...}` que arranca en `desde`, contando llaves. */
function bloqueDesde(src, desde) {
  const inicio = src.indexOf("{", desde);
  let prof = 0;
  for (let i = inicio; i < src.length; i += 1) {
    if (src[i] === "{") prof += 1;
    else if (src[i] === "}") {
      prof -= 1;
      if (prof === 0) return src.slice(inicio, i + 1);
    }
  }
  return "";
}

/** El `select` del `findMany` que alimenta `baseStockMap`, tal como está escrito. */
function selectDeBaseStock() {
  const src = leer(RUTA_POS);
  const anclaje = src.indexOf("const productosBase = await prisma.productoBase.findMany(");
  assert.ok(anclaje > 0, "cambió el nombre de la consulta que alimenta baseStockMap");
  const cuerpo = bloqueDesde(src, anclaje);
  const bloque = bloqueDesde(cuerpo, cuerpo.indexOf("select:"));
  // Sin comentarios: adentro de este select hay prosa que nombra campos.
  return bloque
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Los campos que `baseStockMap` LEE de la fila. */
function camposQueLeeBaseStock() {
  const src = leer(RUTA_POS);
  const anclaje = src.indexOf("baseStockMap[p.id] = ");
  assert.ok(anclaje > 0, "cambió cómo se arma baseStockMap");
  const bloque = bloqueDesde(src, anclaje)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...new Set([...bloque.matchAll(/\bp\.(\w+)/g)].map((m) => m[1]))];
}

test("el POS SELECCIONA todos los campos que después lee para el snapshot", () => {
  const select = selectDeBaseStock();
  const leidos = camposQueLeeBaseStock();

  assert.ok(leidos.length > 0, "no se encontró ningún campo leído");
  for (const campo of leidos) {
    assert.ok(
      new RegExp(`\\b${campo}\\s*:\\s*true`).test(select),
      `baseStockMap lee \`p.${campo}\` y el select del findMany no lo pide: ` +
        "llega undefined y nadie avisa"
    );
  }

  // Y los dos que faltaban, nombrados: si el relevamiento de arriba se rompe,
  // estos siguen afirmando el caso concreto que costó la corrección.
  assert.match(select, /modoCompraProveedor:\s*true/);
  assert.match(select, /pesoEsFijo:\s*true/);
});

test("una PIEZA congela PIEZA y su peso, pasando por lo que el POS realmente trae", () => {
  // Se PROYECTA el producto por el select real, que es lo que Prisma hace: los
  // campos que el select no pide no llegan. Si el select vuelve a quedarse
  // corto, la proyección los pierde y el snapshot sale KG.
  const select = selectDeBaseStock();
  const filaCompleta = {
    id: 70,
    precio_costo: 1000,
    factor_pack: 1,
    categoria_id: 3,
    unidad_medida: "kg",
    modoCompraProveedor: "UNIDAD",
    modoVentaDeposito: "PIEZA",
    pesoReferenciaKg: 3.5,
    pesoEsFijo: null,
    modo_envio: null,
    es_combo: false,
  };
  const p = Object.fromEntries(
    Object.entries(filaCompleta).filter(([k]) => new RegExp(`\\b${k}\\s*:\\s*true`).test(select))
  );

  assert.ok("modoCompraProveedor" in p, "el select no trajo modoCompraProveedor");
  assert.ok("pesoEsFijo" in p, "el select no trajo pesoEsFijo");

  // `baseStock`, armado como lo arma la ruta a partir de esa fila proyectada.
  const baseStock = {
    modoVentaDeposito: p.modoVentaDeposito || "PESO",
    pesoReferenciaKg: Number(p.pesoReferenciaKg || 0),
    modoCompraProveedor: p.modoCompraProveedor || null,
    pesoEsFijo: p.pesoEsFijo ?? null,
    factorPack: Math.max(1, Number(p.factor_pack) || 1),
    unidad_medida: p.unidad_medida || "unidad",
  };

  const s = snapshotDeLineas([linea({ cantidad: 2, productoBaseId: 70, baseStock })]);
  assert.equal(s.presentacionEnvio, PRESENTACION.PIEZA, "el POS volvió a congelar una pieza como kilo");
  assert.equal(s.cantidadPresentada, 2);
  assert.equal(s.pesoPiezaKg, 3.5);
  assert.equal(s.factorPresentacion, null);
});

test("CONTRAPRUEBA: sin la mitad de VENTA, la misma pieza se congela como KG", () => {
  // Si esto dejara de dar KG, el candado de arriba dejaría de probar el defecto
  // que dice probar.
  //
  // LA CONTRAPRUEBA CAMBIÓ DE CAMPO, y el motivo es el punto de la tanda. Antes
  // se quitaba `modoCompraProveedor` —cómo el depósito le COMPRA al proveedor— y
  // eso alcanzaba para que una pieza se leyera como kilo. Que un dato de la
  // relación proveedor→depósito pudiera cambiar en qué cuenta el local que
  // recibe era el defecto, no el candado. Hoy lo que decide es la mitad de
  // venta: `modoVentaDeposito` con su fallback `pesoEsFijo`.
  const sinLaMitadDeVenta = {
    modoVentaDeposito: "PESO",
    pesoReferenciaKg: 3.5,
    pesoEsFijo: null,
    factorPack: 1,
    unidad_medida: "kg",
  };
  const s = snapshotDeLineas([linea({ cantidad: 2, baseStock: sinLaMitadDeVenta })]);
  assert.equal(s.presentacionEnvio, PRESENTACION.KG);
});

test("Y LA COMPRA AL PROVEEDOR YA NO PUEDE CONVERTIR UNA PIEZA EN KILO", () => {
  // Caso G de la tanda, del lado del snapshot: el mismo fiambre de pieza fija,
  // comprado por BULTO en vez de por UNIDAD, tiene que congelarse igual. Antes
  // caía a KG, y con él se perdían las piezas que el destino iba a acreditar.
  const base = {
    modoVentaDeposito: "PIEZA",
    pesoReferenciaKg: 3.5,
    pesoEsFijo: null,
    factorPack: 1,
    unidad_medida: "kg",
  };
  for (const compra of ["UNIDAD", "BULTO", null]) {
    const s = snapshotDeLineas([
      linea({ cantidad: 2, baseStock: { ...base, modoCompraProveedor: compra } }),
    ]);
    assert.equal(s.presentacionEnvio, PRESENTACION.PIEZA, `con compra ${compra}`);
    assert.equal(s.pesoPiezaKg, 3.5, `con compra ${compra}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EL SNAPSHOT TIENE QUE DESCRIBIR LA MERCADERÍA QUE LA LÍNEA VA A MOVER
// ═══════════════════════════════════════════════════════════════════════════

test("directo + componente de combo NO genera un snapshot físicamente falso", () => {
  // 1 Coca vendida directa y 1 combo que lleva 2 Coca. El consumo consolidado es
  // 3, y así se persiste `cantidad`. El combo NO tiene línea comercial propia
  // —viaja expandido en sus componentes— así que el snapshot solo ve la línea
  // directa y diría "1 UNIDAD".
  //
  // Esa línea después se RECIBE en la escala del snapshot: el operador contaría
  // 1 contra un envío de 3, y la recepción informaría un faltante de 2 que nunca
  // faltó. Antes de esta corrección se guardaba igual.
  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: [{ productoLocalId: 7, productoBaseId: 70, cantidad: 3 }],
    lineasComerciales: [
      linea({ productoLocalId: 7, cantidad: 1, consumoFisico: { productoLocalId: 7, cantidadStock: 1 } }),
      { tipo: "COMBO", productoLocalId: 9, cantidad: 1, consumoFisico: null },
    ],
  });

  const item = r.items.find((i) => i.productoLocalOrigenId === 7);
  assert.equal(item.cantidad, 3, "la cantidad física consolidada no se toca");
  assert.equal(
    item.presentacion,
    undefined,
    "se persistió un snapshot que afirma 1 sobre una línea que mueve 3"
  );
});

test("y cuando el snapshot SÍ describe el consolidado, se guarda", () => {
  // El caso normal: 6 packs de 6 son 36 físicas, y el consolidado dice 36.
  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: [{ productoLocalId: 7, productoBaseId: 70, cantidad: 36 }],
    lineasComerciales: [
      linea({
        productoLocalId: 7, cantidad: 6,
        consumoFisico: { productoLocalId: 7, cantidadStock: 36 },
        baseStock: { factorPack: 6, unidad_medida: "pack" },
      }),
    ],
  });
  const item = r.items[0];
  assert.equal(item.cantidad, 36);
  assert.equal(item.presentacion.presentacionEnvio, PRESENTACION.PACK);
  assert.equal(item.presentacion.cantidadPresentada, 6);
  assert.equal(item.presentacion.factorPresentacion, 6);
});

test("un despacho MIXTO cuadra contra el consolidado y se guarda entero", () => {
  // 4 packs de 6 más 5 sueltas: 29. La equivalencia usa las dos mitades, así que
  // la comparación cierra y el snapshot sobrevive.
  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: [{ productoLocalId: 7, productoBaseId: 70, cantidad: 29 }],
    lineasComerciales: [
      linea({ productoLocalId: 7, cantidad: 4, modoVentaLinea: "NORMAL",
        consumoFisico: { productoLocalId: 7, cantidadStock: 24 },
        baseStock: { factorPack: 6, unidad_medida: "pack" } }),
      linea({ productoLocalId: 7, cantidad: 5, modoVentaLinea: "UNIDAD_REMANENTE",
        consumoFisico: { productoLocalId: 7, cantidadStock: 5 },
        baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    ],
  });
  const item = r.items[0];
  assert.equal(item.cantidad, 29);
  assert.equal(item.presentacion.cantidadPresentada, 4);
  assert.equal(item.presentacion.sueltasEnviadas, 5);
});

test("un KG con decimales compara exacto y no se pierde por punto flotante", () => {
  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: [{ productoLocalId: 7, productoBaseId: 70, cantidad: 3.25 }],
    lineasComerciales: [
      linea({ productoLocalId: 7, cantidad: 3.25,
        consumoFisico: { productoLocalId: 7, cantidadStock: 3.25 },
        baseStock: { unidad_medida: "kg" } }),
    ],
  });
  assert.equal(r.items[0].presentacion.presentacionEnvio, PRESENTACION.KG);
  assert.equal(r.items[0].presentacion.cantidadPresentada, 3.25);
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. NINGÚN BACKFILL, Y NINGUNA MIGRACIÓN DE MÁS
// ═══════════════════════════════════════════════════════════════════════════

test("la migración es ADITIVA y no rellena ningún histórico", () => {
  const sql = leer("prisma/migrations/20260909170000_presentacion_envio_snapshot/migration.sql")
    .replace(/^\s*--.*$/gm, "");

  // Lo que tiene que estar.
  assert.match(sql, /CREATE TYPE "PresentacionEnvio"/);
  for (const col of [
    "presentacionEnvio", "cantidadPresentada", "sueltasEnviadas",
    "factorPresentacion", "pesoPiezaKg",
  ]) {
    assert.ok(
      new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`).test(sql),
      `falta la columna ${col}`
    );
  }

  // Lo que NO puede estar. Un backfill acá sería inventar cómo se despachó.
  for (const prohibido of [/\bDROP\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bALTER COLUMN\b/i]) {
    assert.ok(!prohibido.test(sql), `la migración contiene ${prohibido}`);
  }
  // Ninguna columna nueva es obligatoria: los históricos quedan en null.
  assert.ok(!/NOT NULL/i.test(sql), "una columna nueva quedó obligatoria");
});

test("esta tanda agrega UNA migración y ninguna más", () => {
  const dirs = fs
    .readdirSync(path.join(RAIZ, "prisma/migrations"))
    .filter((d) => /^\d/.test(d))
    .sort();
  // El arbol lleva 10: las 8 de antes, la del snapshot de despacho y la de la
  // procedencia de una presentacion adoptada en recepcion. El candado cuenta
  // para que no entre una migracion de contrabando, asi que el numero se
  // actualiza a proposito cuando una tanda agrega la suya.
  assert.equal(dirs.length, 10);
  assert.ok(dirs.includes("20260909170000_presentacion_envio_snapshot"));
  assert.equal(dirs[dirs.length - 1], "20260910120000_presentacion_adoptada_en_recepcion");
});

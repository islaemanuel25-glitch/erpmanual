// PRUEBA DE BASE DE LA AUDITORÍA `scripts/auditoria/kg-por-pieza.mjs`.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/auditoriaKgPorPieza.mjs
//
// La auditoría se corre DE VERDAD —el script, como proceso aparte, con `--json`—
// contra una base descartable sembrada con los casos que tiene que distinguir:
//
//   1. el universo es exactamente el de la regla —kg, PIEZA, peso mayor a cero—,
//      con y sin factor, y lo que no cumple queda afuera;
//   2. cada producto trae su configuración, `esFiambreFijo` y el resultado de
//      `costoPorUnidadFisica` IDÉNTICO al que devuelve la función —la auditoría
//      no recalcula nada—;
//   3. las ubicaciones traen stock y tránsito, y una fila de stock que no existe
//      llega como `null`, no como cero;
//   4. el resumen cuenta bien, y los productos conocidos se destacan solo si
//      aparecen;
//   5. SOLO LECTURA: la huella de cada tabla —md5 de sus filas con su `xmin`—
//      es la misma antes y después de correrla;
//   6. CONTRAPRUEBA del filtro viejo: la auditoría de la #99, corrida sobre la
//      misma base, pierde los productos de pieza sin factor.
//
// Base descartable, borrada al terminar. Nivel ESCRITURA para sembrar: host
// local y NODE_ENV distinto de production. La auditoría la pide en LECTURA.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const { execFileSync } = await import("node:child_process");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { costoPorUnidadFisica, ANOMALIA_COSTO_FISICO: A } = await import(
  "../../lib/conversiones/costoPorUnidadFisica.js"
);

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let pasadas = 0;
const fallas = [];
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${titulo}`);
    return;
  }
  const m = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(m);
  console.log(`  ✗ ${m}`);
}
const json = (x) => JSON.stringify(x);
const igual = (t, o, e) => ok(t, json(o) === json(e), `esperado ${json(e)}, obtenido ${json(o)}`);
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);

const NOMBRE = "erpazul_auditoria_kg_pieza_prueba";
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();

/** Corre un script de auditoría como lo corre quien despliega, y devuelve su JSON. */
function correrAuditoria(script) {
  const salida = execFileSync(
    process.execPath,
    ["--import", "./scripts/alias-loader.mjs", script, "--json"],
    { cwd: RAIZ, env: { ...process.env, DATABASE_URL: urlPrueba }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(salida.slice(salida.indexOf("{")));
}

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  aplicarMigraciones(
    (() => {
      const u = new URL(urlPrueba);
      u.search = "";
      return u.toString();
    })()
  );
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra ─────────────────────────────────────────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Auditoría kg por pieza" } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const local = await c.local.create({ data: { nombre: "Local" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });

  const producto = (nombre, datos) =>
    c.productoBase.create({
      data: { grupoId: grupo.id, nombre, precio_costo: datos.costo, precio_venta: datos.costo * 2, ...datos.base },
    });
  const enUbicacion = async (base, l, stock, extra = {}) => {
    const pl = await c.productoLocal.create({ data: { localId: l.id, baseId: base.id, ...extra } });
    if (stock !== null) {
      await c.stockLocal.create({
        data: { localId: l.id, productoId: pl.id, cantidad: stock.cantidad, enTransito: stock.enTransito ?? 0 },
      });
    }
    return pl;
  };

  // Dentro del universo.
  const mortadela = await producto("Mortadela pieza fija", {
    costo: 10000,
    base: { unidad_medida: "kg", pesoReferenciaKg: 4.5, modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD", pesoEsFijo: true },
  });
  await enUbicacion(mortadela, deposito, { cantidad: 3, enTransito: 2 });
  await enUbicacion(mortadela, local, { cantidad: 10.5 }, { precio_costo: 11000 });

  const chisito = await producto("Chisito bolsa 400g", {
    costo: 5000,
    base: { unidad_medida: "kg", pesoReferenciaKg: 0.4, modoVentaDeposito: "PIEZA", modoCompraProveedor: "BULTO" },
  });
  await enUbicacion(chisito, deposito, { cantidad: 7 });
  await enUbicacion(chisito, local, null); // ProductoLocal SIN fila de stock

  const mani = await producto("MANI CON CASCARA X2KG", {
    costo: 4500,
    base: { unidad_medida: "kg", factor_pack: 2, pesoReferenciaKg: 2, modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD" },
  });
  await enUbicacion(mani, deposito, { cantidad: 0 });
  await enUbicacion(mani, local, { cantidad: 0 });

  // Sin ninguna ubicación: el producto existe y no tiene fila en el depósito.
  const huerfano = await producto("Pieza sin ubicaciones", {
    costo: 800,
    base: { unidad_medida: "kg", pesoReferenciaKg: 1, modoVentaDeposito: "PIEZA", modoCompraProveedor: "BULTO" },
  });

  // Fuera del universo.
  const fuera = [
    await producto("Salame por peso", { costo: 3800, base: { unidad_medida: "kg", pesoReferenciaKg: 3, modoVentaDeposito: "PESO" } }),
    await producto("Pieza sin peso", { costo: 3000, base: { unidad_medida: "kg", pesoReferenciaKg: null, modoVentaDeposito: "PIEZA" } }),
    await producto("Unidad marcada pieza", { costo: 1000, base: { unidad_medida: "unidad", pesoReferenciaKg: 2, modoVentaDeposito: "PIEZA" } }),
    await producto("Gaseosa pack x6", { costo: 12000, base: { unidad_medida: "pack", factor_pack: 6 } }),
  ];
  for (const b of fuera) await enUbicacion(b, deposito, { cantidad: 5 });

  const DENTRO = [mortadela, chisito, mani, huerfano];

  // Huella de cada tabla, con `xmin`: un UPDATE que deja los mismos valores
  // también la cambia. Es la de `stockDiarioApi.mjs`.
  const huella = async () =>
    (
      await c.$queryRaw`
        SELECT table_name AS "tabla",
               (xpath('/row/h/text()', query_to_xml(format(
                 'SELECT md5(coalesce(string_agg(t.xmin::text || %L || t::text, %L ORDER BY t::text), %L)) AS h FROM %I.%I t',
                 ':', ',', '', table_schema, table_name
               ), false, true, '')))[1]::text AS "h"
        FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    )
      .map((f) => `${f.tabla}:${f.h}`)
      .join("\n");

  // ══════════════════════════════════════════════════════════════════════════
  seccion("Correr la auditoría, de verdad y solo leyendo");
  // ══════════════════════════════════════════════════════════════════════════
  const antes = await huella();
  const informe = correrAuditoria("scripts/auditoria/kg-por-pieza.mjs");
  const despues = await huella();
  const tablas = antes.split("\n").length;
  const distintas = antes.split("\n").filter((l, i) => l !== despues.split("\n")[i]);
  ok(`las ${tablas} tablas tienen exactamente las mismas filas después de correrla`, tablas > 50 && distintas.length === 0, distintas.join(" | "));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("1. El universo");
  // ══════════════════════════════════════════════════════════════════════════
  const ids = informe.productos.map((p) => p.productoBaseId);
  igual("son exactamente los cuatro de kg + PIEZA + peso, con y sin factor", ids, DENTRO.map((b) => b.id));
  ok("lo que no cumple queda afuera: por peso, pieza sin peso, no-kg y pack", fuera.every((b) => !ids.includes(b.id)));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("2. Configuración y la función, sin recalcular");
  // ══════════════════════════════════════════════════════════════════════════
  const de = (b) => informe.productos.find((p) => p.productoBaseId === b.id);
  const releer = (b) => c.productoBase.findUnique({ where: { id: b.id } });
  for (const b of DENTRO) {
    const p = de(b);
    const base = await releer(b);
    const esperado = costoPorUnidadFisica({ costoBase: base.precio_costo, producto: base, esDeposito: true });
    igual(`${b.nombre}: el resultado en el depósito es el de costoPorUnidadFisica`, p.enElDeposito, esperado);
  }
  const pMortadela = de(mortadela);
  igual(
    "Mortadela: su configuración, tal cual",
    [pMortadela.pesoReferenciaKg, pMortadela.pesoEsFijo, pMortadela.factorPack, pMortadela.modoCompraProveedor, pMortadela.modoVentaDeposito, pMortadela.costoBase, pMortadela.esFiambreFijo],
    [4.5, true, null, "UNIDAD", "PIEZA", 10000, true]
  );
  igual("Mortadela: $45.000 la pieza, sin anomalías", [pMortadela.enElDeposito.costoPorUnidadFisica, pMortadela.enElDeposito.anomalias], [45000, []]);
  const pChisito = de(chisito);
  igual("Chisito: compra por bulto, esFiambreFijo false", [pChisito.modoCompraProveedor, pChisito.esFiambreFijo], ["BULTO", false]);
  igual(
    "Chisito: $2.000 la pieza, con las dos anomalías",
    [pChisito.enElDeposito.costoPorUnidadFisica, pChisito.enElDeposito.anomalias],
    [2000, [A.PIEZA_COMPRADA_POR_BULTO, A.PIEZA_NO_RECONOCIDA_POR_ESCRITORES]]
  );
  const pMani = de(mani);
  igual("Maní: $9.000 la pieza, con factor 2 advertido", [pMani.enElDeposito.costoPorUnidadFisica, pMani.factorPack, pMani.enElDeposito.anomalias], [9000, 2, [A.KG_CON_FACTOR]]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("3. Ubicaciones, stock y ausencias");
  // ══════════════════════════════════════════════════════════════════════════
  const u = (p, esDeposito) => p.ubicaciones.find((x) => x.esDeposito === esDeposito);
  igual("Mortadela en el depósito: 3 piezas y 2 en tránsito", [u(pMortadela, true).cantidad, u(pMortadela, true).enTransito], [3, 2]);
  igual(
    "Mortadela en el local: 10,5 kg a su costo propio de $11.000 el kg",
    [u(pMortadela, false).cantidad, u(pMortadela, false).costoLocal, u(pMortadela, false).valoracion.unidadFisica, u(pMortadela, false).valoracion.costoPorUnidadFisica],
    [10.5, 11000, "KG", 11000]
  );
  igual(
    "Chisito en el local: la fila de stock no existe y llega como null, no como cero",
    [u(pChisito, false).tieneFilaDeStock, u(pChisito, false).cantidad, u(pChisito, false).enTransito],
    [false, null, null]
  );
  igual("Maní: stock cero se informa como cero", [u(pMani, true).tieneFilaDeStock, u(pMani, true).cantidad], [true, 0]);
  const pHuerfano = de(huerfano);
  igual("Un producto sin ubicaciones: sin fila en el depósito, lista vacía", [pHuerfano.tieneFilaEnElDeposito, pHuerfano.ubicaciones], [false, []]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("4. El resumen y los conocidos");
  // ══════════════════════════════════════════════════════════════════════════
  const r = informe.resumen;
  igual("total", r.total, 4);
  igual("modo de compra: UNIDAD 2, BULTO 2, otro o ausente 0", r.modoCompra, { UNIDAD: 2, BULTO: 2, otroOAusente: 0 });
  igual("con factor > 1: 1 (el maní)", r.conFactorMayorAUno, 1);
  igual("pesoEsFijo: 1 true, 3 false (el default de la columna)", r.pesoEsFijo, { true: 1, false: 3, null: 0 });
  igual("PIEZA_COMPRADA_POR_BULTO: Chisito y la pieza sin ubicaciones", r.piezaCompradaPorBulto, 2);
  igual("PIEZA_NO_RECONOCIDA_POR_ESCRITORES: los mismos dos", r.piezaNoReconocidaPorEscritores, 2);
  igual(
    "stock en el depósito 2, en algún local 1, con tránsito 1, sin fila en el depósito 1",
    [r.conStockEnDeposito, r.conStockEnAlgunLocal, r.conEnTransito, r.sinFilaEnElDeposito],
    [2, 1, 1, 1]
  );
  igual("de los conocidos, solo aparece el maní, porque es el único sembrado", r.conocidos, [
    { conocido: "MANI CON CASCARA", productoBaseId: mani.id, nombre: "MANI CON CASCARA X2KG" },
  ]);
  const nulo = await c.$queryRaw`
    SELECT is_nullable AS "nullable" FROM information_schema.columns
    WHERE table_name = 'ProductoBase' AND column_name = 'modoCompraProveedor'`;
  igual("el modo de compra ausente no se puede sembrar: la columna es NOT NULL", nulo[0]?.nullable, "NO");

  // ══════════════════════════════════════════════════════════════════════════
  seccion("6. Contraprueba: el filtro viejo de la #99 los pierde");
  // ══════════════════════════════════════════════════════════════════════════
  const viejo = correrAuditoria("scripts/auditoria/unidades-y-costos-por-ubicacion.mjs");
  const idsViejos = new Set(viejo.porKiloOFiambreConFactor.casos.map((x) => x.productoBaseId));
  ok("la #99 ve al maní, que tiene factor 2", idsViejos.has(mani.id));
  const perdidos = DENTRO.filter((b) => !idsViejos.has(b.id)).map((b) => b.nombre);
  igual("y pierde los tres de pieza sin factor, que la nueva sí trae", perdidos, [
    "Mortadela pieza fija",
    "Chisito bolsa 400g",
    "Pieza sin ubicaciones",
  ]);
} catch (e) {
  fallas.push(`la prueba se cayó: ${e?.stderr || e?.stack || e}`);
  console.log(`  ✗ la prueba se cayó: ${e?.stderr || e?.stack || e}`);
} finally {
  await c?.$disconnect().catch(() => {});
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}

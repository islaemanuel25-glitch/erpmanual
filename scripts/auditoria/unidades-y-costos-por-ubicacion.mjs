// scripts/auditoria/unidades-y-costos-por-ubicacion.mjs
//
// DOS PREGUNTAS SOBRE EL COSTO, ANTES DE DISEÑAR LA VALORIZACIÓN DEL STOCK DIARIO.
//
// ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
//
// La auditoría de la valorización del Stock Diario (2026-09-28) encontró dos
// cosas que el código permite y que nadie midió contra los datos:
//
//   1. PRODUCTOS POR KILO O FIAMBRE CON `factor_pack > 1`. La recepción de
//      compras guarda el costo de esos productos POR KILO, sin tocar el factor
//      (`lib/compras-proveedor/costoMaestro.js`, `costoLineaAMaestro`). Pero el
//      reporte valorizado, el costo por defecto del POS y los combos DIVIDEN por
//      el factor igual. Si un producto así existe, las dos cuentas no dan lo
//      mismo, y con datos sembrados la diferencia fue de $8.000 contra $40.000.
//      Nadie sabe todavía si existe alguno.
//   2. OVERRIDES DE COSTO POR UBICACIÓN. `propagarCostoALocales` copia el costo
//      del depósito a todos los `ProductoLocal`, pero las listas de proveedor y
//      la actualización masiva conservan un override distinto. Nadie midió
//      cuántos `ProductoLocal.precio_costo` difieren hoy de su `ProductoBase`.
//
// Este script lo mide. NO decide cuál de las dos cuentas es la correcta: las
// muestra lado a lado. Esa decisión se toma después, con estos números.
//
// ── POR QUÉ UN SCRIPT Y NO UNA PANTALLA ────────────────────────────────────
//
// Es una pregunta de una vez, sobre los datos de hoy, y la contesta quien
// despliega. La sesión de nube no se conecta a producción.
//
// ── SOLO LECTURA, Y SE PUEDE COMPROBAR ─────────────────────────────────────
//
// Pide el cliente en nivel LECTURA, el único que la fábrica deja apuntar a un
// host que no sea local. No hay una sola llamada de escritura ni transacciones:
// solo `findMany` y `$queryRaw` con SELECT. El candado
// `scripts/auditoria/soloLectura.test.mjs` lo afirma leyendo el fuente.
//
// ── QUÉ SE REUSA Y QUÉ SE REPRODUCE ────────────────────────────────────────
//
// Las reglas se importan, no se copian: `seMideEnKilos`, `esProductoFiambre` y
// `esFiambreFijo` (`lib/conversiones/stock.js`), y `precioDeLaUbicacion`
// (`lib/precios/precioDeLaUbicacion.js`), que es el costo vigente de la
// ubicación.
//
// Dos cuentas NO existen como función y se reproducen acá, cada una con su
// origen citado: la valorización del reporte, que vive escrita dentro de la
// ruta, y el costo por defecto del POS, que vive dentro de
// `construirLineasComerciales`. Si esas implementaciones cambian, esta
// reproducción queda vieja: es una foto de cómo cuentan hoy.
//
// Uso (lo corre quien despliega, con la URL de producción, que no se imprime):
//   DATABASE_URL="<la de producción>" node --import ./scripts/alias-loader.mjs \
//     scripts/auditoria/unidades-y-costos-por-ubicacion.mjs [--json]

import { crearClientePrisma, LECTURA } from "../lib/clientePrisma.mjs";

import { seMideEnKilos, esProductoFiambre, esFiambreFijo } from "../../lib/conversiones/stock.js";
import { precioDeLaUbicacion } from "../../lib/precios/precioDeLaUbicacion.js";

const COMO_JSON = process.argv.slice(2).includes("--json");

// Los ejemplos de override que se listan: los de mayor diferencia absoluta.
const EJEMPLOS_DE_OVERRIDE = 40;

const numero = (v) => (v === null || v === undefined ? null : Number(v));
const centavos = (n) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

const plata = (v) =>
  Number.isFinite(Number(v)) && v !== null
    ? Number(v).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 })
    : "—";

/**
 * Cómo valoriza HOY el reporte valorizado una unidad de stock.
 *
 * Reproducida de `app/api/reportes-stock/valorizado/route.js`, líneas 106-134:
 * override con `??` (un cero local se respeta), divide por `factor_pack` si es
 * mayor que 1 SIN mirar la unidad de medida, y en el depósito, si es fiambre
 * fijo, multiplica por el peso de referencia porque el stock está en piezas.
 */
function unitarioDelReporteValorizado({ base, pl, esDeposito }) {
  const factor = Math.max(1, Number(base.factor_pack) || 1);
  const costo = Number(pl.precio_costo ?? base.precio_costo) || 0;
  let unitario = factor > 1 ? costo / factor : costo;
  if (esDeposito && esFiambreFijo(base)) {
    const peso = Number(base.pesoReferenciaKg) || 0;
    if (peso > 0) unitario = unitario * peso;
  }
  return unitario;
}

/**
 * El costo unitario que el POS registra en una venta cuando la pantalla no le
 * manda uno.
 *
 * Reproducido de `lib/combos/ventaConsumo.js`, líneas 142-144
 * (`construirLineasComerciales`): `costoBulto / factorPack`, sin mirar la unidad
 * de medida. Cuando la pantalla sí manda `precioCosto`, el POS usa ese y esta
 * cuenta no interviene.
 */
function unitarioDelPosPorDefecto({ base, pl }) {
  const factor = Math.max(1, Number(base.factor_pack) || 1);
  const costo = Number(precioDeLaUbicacion(base.precio_costo, pl.precio_costo)) || 0;
  return costo / factor;
}

/**
 * La unidad de stock valorizada en la escala en que la recepción de compras
 * GUARDA el costo.
 *
 * `costoLineaAMaestro` (`lib/compras-proveedor/costoMaestro.js`, rama de la
 * línea 50) guarda por kilo, sin tocar el factor, todo producto que se mide en
 * kilos o que se compra por unidad pesada. El stock de esos productos está en
 * kilos, salvo el fiambre fijo en el depósito, que está en piezas: ahí la pieza
 * vale el kilo por el peso de referencia. Sin peso no se puede convertir y se
 * devuelve null: lo que no se sabe no se completa.
 */
function unitarioSegunLaEscalaGuardada({ base, pl, esDeposito }) {
  const costo = Number(precioDeLaUbicacion(base.precio_costo, pl.precio_costo)) || 0;
  const porKilo = base.modoCompraProveedor === "UNIDAD" || seMideEnKilos(base);
  if (!porKilo) {
    const factor = Math.max(1, Number(base.factor_pack) || 1);
    return costo / factor;
  }
  if (esDeposito && esFiambreFijo(base)) {
    const peso = Number(base.pesoReferenciaKg) || 0;
    return peso > 0 ? costo * peso : null;
  }
  return costo;
}

async function main() {
  const db = await crearClientePrisma({ nivel: LECTURA });
  try {
    // ── 1. Por kilo o fiambre, con factor_pack > 1 ─────────────────────────
    //
    // La consulta trae un superconjunto con un filtro simple, y la clasificación
    // la hacen los predicados del repo: así "por kilo" y "fiambre" significan
    // acá exactamente lo mismo que en el resto del sistema.
    const candidatos = await db.productoBase.findMany({
      where: {
        factor_pack: { gt: 1 },
        OR: [{ unidad_medida: "kg" }, { modoCompraProveedor: "UNIDAD" }, { pesoReferenciaKg: { gt: 0 } }],
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        nombre: true,
        activo: true,
        es_combo: true,
        grupoId: true,
        unidad_medida: true,
        factor_pack: true,
        modoCompraProveedor: true,
        modoVentaDeposito: true,
        pesoReferenciaKg: true,
        pesoEsFijo: true,
        precio_costo: true,
        locales: {
          orderBy: { localId: "asc" },
          select: {
            id: true,
            localId: true,
            activo: true,
            precio_costo: true,
            local: { select: { nombre: true, es_deposito: true } },
            stock: { select: { cantidad: true, enTransito: true } },
          },
        },
      },
    });

    const casos = [];
    for (const base of candidatos) {
      const clasificacion = {
        seMideEnKilos: seMideEnKilos(base),
        esProductoFiambre: esProductoFiambre(base),
        esFiambreFijo: esFiambreFijo(base),
      };
      if (!clasificacion.seMideEnKilos && !clasificacion.esProductoFiambre) continue;
      for (const pl of base.locales) {
        const esDeposito = pl.local?.es_deposito === true;
        const stock = numero(pl.stock?.[0]?.cantidad) ?? 0;
        const enTransito = numero(pl.stock?.[0]?.enTransito) ?? 0;
        const delReporte = unitarioDelReporteValorizado({ base, pl, esDeposito });
        const delPos = unitarioDelPosPorDefecto({ base, pl });
        const segunEscala = unitarioSegunLaEscalaGuardada({ base, pl, esDeposito });
        casos.push({
          productoBaseId: base.id,
          nombre: base.nombre,
          activo: base.activo,
          esCombo: base.es_combo,
          grupoId: base.grupoId,
          productoLocalId: pl.id,
          productoLocalActivo: pl.activo,
          localId: pl.localId,
          local: pl.local?.nombre ?? null,
          esDeposito,
          unidadMedida: base.unidad_medida,
          modoCompraProveedor: base.modoCompraProveedor,
          modoVentaDeposito: base.modoVentaDeposito,
          pesoEsFijo: base.pesoEsFijo,
          ...clasificacion,
          factorPack: base.factor_pack,
          pesoReferenciaKg: numero(base.pesoReferenciaKg),
          costoBase: numero(base.precio_costo),
          costoLocal: numero(pl.precio_costo),
          costoEfectivo: numero(precioDeLaUbicacion(base.precio_costo, pl.precio_costo)),
          stock,
          enTransito,
          unitarioDelReporteValorizado: centavos(delReporte),
          valorDelReporteValorizado: centavos(stock * delReporte),
          unitarioDelPosPorDefecto: centavos(delPos),
          unitarioSegunLaEscalaGuardada: centavos(segunEscala),
          valorSegunLaEscalaGuardada: segunEscala === null ? null : centavos(stock * segunEscala),
          diferenciaDeValor: segunEscala === null ? null : centavos(stock * segunEscala - stock * delReporte),
        });
      }
    }

    // Contexto: todos los productos con factor > 1, por unidad de medida.
    const factorPorUnidad = await db.$queryRaw`
      SELECT "unidad_medida"::text AS "unidad", count(*)::int AS "productos",
             count(*) FILTER (WHERE "activo")::int AS "activos"
      FROM "ProductoBase" WHERE "factor_pack" > 1 GROUP BY 1 ORDER BY 1`;

    // ── 2. Overrides de costo por ubicación ────────────────────────────────
    //
    // Un override en cero se cuenta aparte: `precioDeLaUbicacion` lo trata como
    // "sin override" —un cero no es un precio—, así que no es un costo distinto.
    // Los combos no tienen stock propio y quedan afuera.
    const porTipoDeUbicacion = await db.$queryRaw`
      SELECT l."es_deposito" AS "esDeposito",
             count(*)::int AS "filas",
             count(*) FILTER (WHERE pl."precio_costo" IS NULL)::int AS "sinOverride",
             count(*) FILTER (WHERE pl."precio_costo" = 0)::int AS "overrideCero",
             count(*) FILTER (WHERE pl."precio_costo" IS NOT NULL AND pl."precio_costo" = pb."precio_costo")::int AS "igualALaBase",
             count(*) FILTER (WHERE pl."precio_costo" IS NOT NULL AND pl."precio_costo" <> 0 AND pl."precio_costo" <> pb."precio_costo")::int AS "distintoDeLaBase",
             count(*) FILTER (WHERE pl."precio_costo" IS NOT NULL AND pl."precio_costo" <> 0 AND pl."precio_costo" <> pb."precio_costo" AND s."cantidad" <> 0)::int AS "distintoConStock",
             count(*) FILTER (WHERE pb."precio_costo" = 0)::int AS "baseEnCero"
      FROM "ProductoLocal" pl
      JOIN "ProductoBase" pb ON pb."id" = pl."baseId"
      JOIN "Local" l ON l."id" = pl."localId"
      LEFT JOIN "StockLocal" s ON s."productoId" = pl."id"
      WHERE pb."es_combo" = false
      GROUP BY 1 ORDER BY 1`;

    const [alcance] = await db.$queryRaw`
      SELECT count(DISTINCT pl."baseId")::int AS "productos", count(DISTINCT pl."localId")::int AS "ubicaciones",
             count(*)::int AS "filas"
      FROM "ProductoLocal" pl JOIN "ProductoBase" pb ON pb."id" = pl."baseId"
      WHERE pb."es_combo" = false AND pl."precio_costo" IS NOT NULL AND pl."precio_costo" <> 0
        AND pl."precio_costo" <> pb."precio_costo"`;

    const ejemplos = await db.$queryRaw`
      SELECT pb."id" AS "productoBaseId", pb."nombre", pb."creadoEnLocalId",
             l."id" AS "localId", l."nombre" AS "local", l."es_deposito" AS "esDeposito",
             pb."precio_costo"::text AS "costoBase", pl."precio_costo"::text AS "costoLocal",
             round(((pl."precio_costo" - pb."precio_costo") / nullif(pb."precio_costo", 0)) * 100, 1)::text AS "diferenciaPct",
             s."cantidad"::text AS "stock", pl."updatedAt" AS "overrideActualizado"
      FROM "ProductoLocal" pl
      JOIN "ProductoBase" pb ON pb."id" = pl."baseId"
      JOIN "Local" l ON l."id" = pl."localId"
      LEFT JOIN "StockLocal" s ON s."productoId" = pl."id"
      WHERE pb."es_combo" = false AND pl."precio_costo" IS NOT NULL AND pl."precio_costo" <> 0
        AND pl."precio_costo" <> pb."precio_costo"
      ORDER BY abs(pl."precio_costo" - pb."precio_costo") DESC, pl."id"
      LIMIT ${EJEMPLOS_DE_OVERRIDE}`;

    const productosDe = (lista) => new Set(lista.map((c) => c.productoBaseId)).size;
    const informe = {
      medidoEn: new Date().toISOString(),
      factorPackMayorAUnoPorUnidad: factorPorUnidad,
      porKiloOFiambreConFactor: {
        productos: productosDe(casos),
        productosPorKilo: productosDe(casos.filter((c) => c.seMideEnKilos)),
        productosFiambre: productosDe(casos.filter((c) => c.esProductoFiambre)),
        filasPorUbicacion: casos.length,
        filasConStock: casos.filter((c) => c.stock !== 0).length,
        filasConDiferenciaDeValor: casos.filter((c) => c.diferenciaDeValor !== null && Math.abs(c.diferenciaDeValor) >= 0.01).length,
        filasSinConversionPosible: casos.filter((c) => c.unitarioSegunLaEscalaGuardada === null).length,
        casos,
      },
      overridesDeCosto: { porTipoDeUbicacion, alcance, ejemplos },
    };

    if (COMO_JSON) {
      process.stdout.write(`${JSON.stringify(informe, null, 2)}\n`);
      return;
    }

    const k = informe.porKiloOFiambreConFactor;
    console.log(`Medido: ${informe.medidoEn}`);
    console.log("");
    console.log("── Productos con factor_pack > 1, por unidad de medida");
    for (const f of factorPorUnidad) console.log(`   ${f.unidad}: ${f.productos} (${f.activos} activos)`);
    console.log("");
    console.log("── Por kilo o fiambre con factor_pack > 1");
    console.log(
      `   ${k.productos} productos (${k.productosPorKilo} por kilo, ${k.productosFiambre} fiambre), ` +
        `${k.filasPorUbicacion} filas por ubicación, ${k.filasConStock} con stock, ` +
        `${k.filasConDiferenciaDeValor} con diferencia de valor, ${k.filasSinConversionPosible} sin conversión posible`
    );
    for (const c of casos) {
      console.log(
        `   #${c.productoBaseId} ${c.nombre} · ${c.local} (${c.esDeposito ? "depósito" : "local"}) · ` +
          `${c.unidadMedida}${c.esFiambreFijo ? ", fiambre fijo" : c.esProductoFiambre ? ", fiambre" : ""} · ` +
          `factor ${c.factorPack} · peso ${c.pesoReferenciaKg ?? "—"} · ` +
          `costo base ${plata(c.costoBase)}, local ${plata(c.costoLocal)}, efectivo ${plata(c.costoEfectivo)} · ` +
          `stock ${c.stock}, en tránsito ${c.enTransito}`
      );
      console.log(
        `      reporte valorizado ${plata(c.unitarioDelReporteValorizado)}/u → ${plata(c.valorDelReporteValorizado)} · ` +
          `escala guardada ${plata(c.unitarioSegunLaEscalaGuardada)}/u → ${plata(c.valorSegunLaEscalaGuardada)} · ` +
          `diferencia ${plata(c.diferenciaDeValor)} · POS por defecto ${plata(c.unitarioDelPosPorDefecto)}/u`
      );
    }
    console.log("");
    console.log("── Overrides de costo por ubicación (sin combos)");
    for (const t of porTipoDeUbicacion) {
      console.log(
        `   ${t.esDeposito ? "Depósito" : "Locales"}: ${t.filas} filas · sin override ${t.sinOverride} · ` +
          `override cero ${t.overrideCero} · igual a la base ${t.igualALaBase} · ` +
          `distinto de la base ${t.distintoDeLaBase} (con stock ${t.distintoConStock}) · base en cero ${t.baseEnCero}`
      );
    }
    console.log(
      `   Distintos de verdad: ${alcance.filas} filas, ${alcance.productos} productos, ${alcance.ubicaciones} ubicaciones`
    );
    if (ejemplos.length) console.log(`   Los ${ejemplos.length} de mayor diferencia:`);
    for (const e of ejemplos) {
      console.log(
        `   #${e.productoBaseId} ${e.nombre} · ${e.local} (${e.esDeposito ? "depósito" : "local"}) · ` +
          `base ${plata(e.costoBase)}, local ${plata(e.costoLocal)} (${e.diferenciaPct ?? "—"} %) · stock ${e.stock ?? "—"}`
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  // El mensaje, no el objeto: un error de conexión puede traer la URL entera.
  console.error(`No se pudo completar la medición: ${err?.code ? `${err.code} ` : ""}${String(err?.message || err).split("\n")[0].replace(/postgres(ql)?:\/\/\S+/gi, "<url>")}`);
  process.exit(1);
});

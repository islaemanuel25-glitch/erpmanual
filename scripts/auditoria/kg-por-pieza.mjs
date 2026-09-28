// scripts/auditoria/kg-por-pieza.mjs
//
// QUÉ PRODUCTOS POR KILO MANEJA EL DEPÓSITO POR PIEZA, Y CÓMO ESTÁN CONFIGURADOS.
//
// ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
//
// `lib/conversiones/costoPorUnidadFisica.js` cuenta por pieza, en el depósito,
// todo producto por kg con venta por PIEZA y peso de referencia mayor a cero,
// sin mirar el modo de compra. Los escritores de hoy —compra, transferencias,
// Productos, `buscar-producto`— deciden con `esFiambreFijo`, que además exige
// compra por unidad. Antes de conectar la función al Stock Diario hay que saber
// cuántos productos reales caen de cada lado.
//
// La medición anterior (`unidades-y-costos-por-ubicacion.mjs`, PR #99) no sirve
// para esto: solo miraba productos con `factor_pack > 1`, y la mayoría de los de
// pieza no tienen factor.
//
// ── QUÉ MIDE ────────────────────────────────────────────────────────────────
//
// El universo es exactamente el que la función cuenta por pieza en el depósito,
// y se decide con el MISMO predicado —`esProductoPorPeso`—, no con una condición
// escrita otra vez acá. La consulta trae un superconjunto simple (por kilo y con
// peso) y el predicado elige.
//
// Por cada producto: su configuración, `esFiambreFijo` según el código de hoy,
// y lo que devuelve `costoPorUnidadFisica` —el valor, la regla y las anomalías—
// tal cual, sin recalcular nada. Por cada ubicación: su costo propio, el stock y
// el tránsito. Una fila de stock que no existe se informa como `null`, no como
// cero: no es lo mismo no tener stock que no tener la fila.
//
// ── SOLO LECTURA, Y SE PUEDE COMPROBAR ─────────────────────────────────────
//
// Pide el cliente en nivel LECTURA. No hay ninguna llamada de escritura ni
// transacciones: un `findMany`. El candado `scripts/auditoria/soloLectura.test.mjs`
// lo afirma leyendo el fuente, y `scripts/pruebas-db/auditoriaKgPorPieza.mjs`
// comprueba contra PostgreSQL que después de correrlo ninguna tabla cambió.
//
// Uso (lo corre quien despliega, con la URL de producción, que no se imprime):
//   DATABASE_URL="<la de producción>" node --import ./scripts/alias-loader.mjs \
//     scripts/auditoria/kg-por-pieza.mjs [--json]

import { crearClientePrisma, LECTURA } from "../lib/clientePrisma.mjs";

import { esFiambreFijo } from "../../lib/conversiones/stock.js";
import { esProductoPorPeso } from "../../lib/pos-ventas/lineaPorImporte.js";
import { ANOMALIA_COSTO_FISICO, costoPorUnidadFisica } from "../../lib/conversiones/costoPorUnidadFisica.js";

const COMO_JSON = process.argv.slice(2).includes("--json");

// Los productos que ya aparecieron en la evidencia histórica
// (`lib/precios/avisoCambioDeEscala.test.mjs`, test 13). NO definen el universo:
// solo se destacan si aparecen en el resultado normal.
const CONOCIDOS = ["MANI CON CASCARA", "PECHUGA REBOZADA SADIA", "GRANIX BALONCITOS", "GRANIX BOCADITO FRUTILLA"];

const numero = (v) => (v === null || v === undefined ? null : Number(v));
const distintoDeCero = (v) => v !== null && v !== 0;

async function main() {
  const db = await crearClientePrisma({ nivel: LECTURA });
  try {
    // El superconjunto: por kilo y con peso. El predicado decide cuáles son.
    const candidatos = await db.productoBase.findMany({
      where: { unidad_medida: "kg", pesoReferenciaKg: { gt: 0 } },
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
            precio_costo: true,
            local: { select: { nombre: true, es_deposito: true } },
            stock: { select: { cantidad: true, enTransito: true } },
          },
        },
      },
    });

    const productos = [];
    for (const base of candidatos) {
      // La regla de pieza, preguntada al predicado que usa la función.
      if (esProductoPorPeso(base, { esDeposito: true })) continue;

      const enElDeposito = costoPorUnidadFisica({ costoBase: base.precio_costo, producto: base, esDeposito: true });
      const ubicaciones = base.locales.map((pl) => {
        const esDeposito = pl.local?.es_deposito === true;
        const fila = pl.stock?.[0] ?? null;
        return {
          localId: pl.localId,
          local: pl.local?.nombre ?? null,
          esDeposito,
          productoLocalId: pl.id,
          costoLocal: numero(pl.precio_costo),
          tieneFilaDeStock: fila !== null,
          cantidad: fila ? numero(fila.cantidad) : null,
          enTransito: fila ? numero(fila.enTransito) : null,
          valoracion: costoPorUnidadFisica({
            costoBase: base.precio_costo,
            costoLocal: pl.precio_costo,
            producto: base,
            esDeposito,
          }),
        };
      });

      const nombreMayus = String(base.nombre ?? "").toUpperCase();
      productos.push({
        productoBaseId: base.id,
        nombre: base.nombre,
        activo: base.activo,
        esCombo: base.es_combo,
        grupoId: base.grupoId,
        unidadMedida: base.unidad_medida,
        pesoReferenciaKg: numero(base.pesoReferenciaKg),
        pesoEsFijo: base.pesoEsFijo ?? null,
        factorPack: base.factor_pack ?? null,
        modoCompraProveedor: base.modoCompraProveedor ?? null,
        modoVentaDeposito: base.modoVentaDeposito ?? null,
        costoBase: numero(base.precio_costo),
        esFiambreFijo: esFiambreFijo(base),
        enElDeposito,
        tieneFilaEnElDeposito: ubicaciones.some((u) => u.esDeposito),
        ubicaciones,
        conocido: CONOCIDOS.find((n) => nombreMayus.includes(n)) ?? null,
      });
    }

    const cuenta = (pred) => productos.filter(pred).length;
    const conAnomalia = (codigo) => (p) => p.enElDeposito.anomalias.includes(codigo);
    const resumen = {
      total: productos.length,
      modoCompra: {
        UNIDAD: cuenta((p) => p.modoCompraProveedor === "UNIDAD"),
        BULTO: cuenta((p) => p.modoCompraProveedor === "BULTO"),
        otroOAusente: cuenta((p) => p.modoCompraProveedor !== "UNIDAD" && p.modoCompraProveedor !== "BULTO"),
      },
      conFactorMayorAUno: cuenta((p) => p.factorPack !== null && p.factorPack > 1),
      pesoEsFijo: {
        true: cuenta((p) => p.pesoEsFijo === true),
        false: cuenta((p) => p.pesoEsFijo === false),
        null: cuenta((p) => p.pesoEsFijo === null),
      },
      piezaCompradaPorBulto: cuenta(conAnomalia(ANOMALIA_COSTO_FISICO.PIEZA_COMPRADA_POR_BULTO)),
      piezaNoReconocidaPorEscritores: cuenta(conAnomalia(ANOMALIA_COSTO_FISICO.PIEZA_NO_RECONOCIDA_POR_ESCRITORES)),
      conStockEnDeposito: cuenta((p) => p.ubicaciones.some((u) => u.esDeposito && distintoDeCero(u.cantidad))),
      conStockEnAlgunLocal: cuenta((p) => p.ubicaciones.some((u) => !u.esDeposito && distintoDeCero(u.cantidad))),
      conEnTransito: cuenta((p) => p.ubicaciones.some((u) => distintoDeCero(u.enTransito))),
      sinFilaEnElDeposito: cuenta((p) => !p.tieneFilaEnElDeposito),
      conocidos: productos
        .filter((p) => p.conocido !== null)
        .map((p) => ({ conocido: p.conocido, productoBaseId: p.productoBaseId, nombre: p.nombre })),
    };

    const informe = { medidoEn: new Date().toISOString(), resumen, productos };

    if (COMO_JSON) {
      process.stdout.write(`${JSON.stringify(informe, null, 2)}\n`);
      return;
    }

    console.log(`Medido: ${informe.medidoEn}`);
    console.log("");
    console.log(`── Por kilo, manejados por PIEZA en el depósito: ${resumen.total}`);
    console.log(
      `   compra UNIDAD ${resumen.modoCompra.UNIDAD} · BULTO ${resumen.modoCompra.BULTO} · otro o ausente ${resumen.modoCompra.otroOAusente}`
    );
    console.log(
      `   con factor > 1: ${resumen.conFactorMayorAUno} · pesoEsFijo true ${resumen.pesoEsFijo.true}, ` +
        `false ${resumen.pesoEsFijo.false}, null ${resumen.pesoEsFijo.null}`
    );
    console.log(
      `   PIEZA_COMPRADA_POR_BULTO ${resumen.piezaCompradaPorBulto} · ` +
        `PIEZA_NO_RECONOCIDA_POR_ESCRITORES ${resumen.piezaNoReconocidaPorEscritores}`
    );
    console.log(
      `   con stock en el depósito ${resumen.conStockEnDeposito} · en algún local ${resumen.conStockEnAlgunLocal} · ` +
        `con tránsito ${resumen.conEnTransito} · sin fila en el depósito ${resumen.sinFilaEnElDeposito}`
    );
    for (const c of resumen.conocidos) console.log(`   conocido: ${c.conocido} → #${c.productoBaseId} ${c.nombre}`);
    for (const p of productos) {
      const v = p.enElDeposito;
      console.log("");
      console.log(
        `#${p.productoBaseId} ${p.nombre}${p.activo ? "" : " (inactivo)"} · peso ${p.pesoReferenciaKg} kg · ` +
          `factor ${p.factorPack ?? "—"} · compra ${p.modoCompraProveedor ?? "—"} · pesoEsFijo ${p.pesoEsFijo ?? "—"} · ` +
          `esFiambreFijo ${p.esFiambreFijo} · costo base ${p.costoBase ?? "—"}`
      );
      console.log(
        `   depósito: ${v.estado} ${v.unidadFisica ?? "—"} a ${v.costoPorUnidadFisica ?? "—"} (${v.regla})` +
          `${v.anomalias.length ? ` · ${v.anomalias.join(", ")}` : ""}`
      );
      for (const u of p.ubicaciones) {
        console.log(
          `   ${u.local} (${u.esDeposito ? "depósito" : "local"}) · costo propio ${u.costoLocal ?? "—"} · ` +
            (u.tieneFilaDeStock ? `stock ${u.cantidad}, en tránsito ${u.enTransito}` : "sin fila de stock") +
            ` · ${u.valoracion.unidadFisica ?? "—"} a ${u.valoracion.costoPorUnidadFisica ?? "—"}`
        );
      }
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

// scripts/preparar-aplicacion-lista.mjs
//
// Deja una importación LISTA PARA APLICAR, sin aplicar nada.
//
// Selecciona únicamente las filas que cumplen TODO a la vez:
//   · estado LISTO_PARA_ACTUALIZAR;
//   · coincidencia EXACTA (código interno) o por SUFIJO de 5 dígitos;
//   · producto asociado a este proveedor en alguna de sus tres relaciones;
//   · costo y presentación revalidados AHORA contra el producto vivo;
//   · no aplicada.
//
// Todo lo demás queda deseleccionado: sufijo de 4, factor dudoso, código
// duplicado, sin vincular, unidades DI, kg y fiambres, y precios no creíbles.
//
// POR QUÉ EL SUFIJO DE 4 QUEDA AFUERA
//
// Cuatro dígitos coinciden por azar con facilidad. En este catálogo la única
// familia en colisión conocida es 14720 / 1014720, pero la auditoría también
// mostró que el único empate real de 4 dígitos —3313— involucraba dos productos
// que no tienen nada que ver entre sí. Con 5 dígitos y el prefijo "10", que es
// una convención real del catálogo de Arcor, la coincidencia es de otra
// naturaleza. Los de 4 se revisan a mano, no se aplican en masa.
//
// NO TOCA NINGÚN COSTO NI PRECIO. Solo mueve el flag `seleccionada`.
//
// Uso:
//   DATABASE_URL=... node --import ./scripts/alias-loader.mjs \
//     scripts/preparar-aplicacion-lista.mjs --id 1 [--escribir]

import { PrismaClient } from "@prisma/client";

import { TIPO_COINCIDENCIA } from "../lib/proveedores/listas/conciliarLista.js";
import { CONFIG_ARCOR } from "../lib/proveedores/listas/configuraciones/arcor.js";
import {
  revalidarFila,
  ventaParaModo,
  textoOmision,
  MODO_PRECIO_VENTA,
} from "../lib/proveedores/listas/aplicacion.js";
import { ESTADO_LINEA } from "../lib/proveedores/listas/estados.js";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const ID = Number(args[args.indexOf("--id") + 1]);
const ESCRIBIR = args.includes("--escribir");
if (!Number.isInteger(ID) || ID <= 0) {
  console.error("Falta --id <importacionId>");
  process.exit(1);
}

/** Los dos únicos tipos de coincidencia que se aceptan para aplicar en masa. */
const TIPOS_ACEPTADOS = new Set([TIPO_COINCIDENCIA.CODIGO_INTERNO, TIPO_COINCIDENCIA.SUFIJO_5]);

const num = (v) => (v === null || v === undefined ? null : Number(v));
const money = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(2));

async function main() {
  const cab = await prisma.importacionListaProveedor.findUnique({
    where: { id: ID },
    include: { proveedor: { select: { id: true, nombre: true } } },
  });
  if (!cab) {
    console.error(`No existe la importación ${ID}.`);
    process.exit(1);
  }
  if (cab.estado === "APLICADA") {
    console.error("La importación ya fue APLICADA. No hay nada que preparar.");
    process.exit(1);
  }

  const proveedorId = cab.proveedorId;
  const depo = await prisma.grupoDeposito.findFirst({
    where: { grupoId: cab.grupoId }, select: { localId: true },
  });
  const contexto = {
    operandoEnLocalId: cab.localOperativoId,
    depositoLocalId: depo?.localId ?? null,
  };
  const recargoPct = Number(cab.recargoPct);

  const filas = await prisma.importacionListaFila.findMany({
    where: { importacionId: ID },
    orderBy: { filaExcel: "asc" },
  });

  const baseIds = [...new Set(filas.map((f) => f.productoBaseId).filter((x) => x !== null))];
  const productos = await prisma.productoBase.findMany({
    where: { id: { in: baseIds } },
    select: {
      id: true, nombre: true, precio_costo: true, precio_venta: true, margen: true,
      redondeo_100: true, es_combo: true, creadoEnLocalId: true,
      unidad_medida: true, factor_pack: true, modoCompraProveedor: true,
      pesoReferenciaKg: true,
      proveedor_id: true, proveedor2_id: true, proveedor3_id: true,
    },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  // Código interno de Arcor de cada producto, para el reporte.
  const vinculos = await prisma.productoCodigoProveedor.findMany({
    where: { grupoId: cab.grupoId, proveedorId, activo: true },
    select: { productoBaseId: true, codigoInterno: true },
  });
  const codigoDe = new Map();
  for (const v of vinculos) {
    if (!codigoDe.has(v.productoBaseId)) codigoDe.set(v.productoBaseId, []);
    codigoDe.get(v.productoBaseId).push(v.codigoInterno);
  }

  const esDelProveedor = (p) =>
    p && (p.proveedor_id === proveedorId || p.proveedor2_id === proveedorId || p.proveedor3_id === proveedorId);

  const seleccionar = [];
  const descartadas = new Map(); // motivo → cantidad
  const reporte = [];

  for (const f of filas) {
    const base = f.productoBaseId === null ? null : porId.get(f.productoBaseId) ?? null;

    const rechazo = (motivo) => {
      descartadas.set(motivo, (descartadas.get(motivo) ?? 0) + 1);
    };

    if (f.aplicada) { rechazo("ya aplicada"); continue; }
    if (f.estado !== ESTADO_LINEA.LISTO_PARA_ACTUALIZAR) { rechazo(`estado ${f.estado}`); continue; }
    if (!TIPOS_ACEPTADOS.has(f.tipoCoincidencia)) { rechazo(`coincidencia ${f.tipoCoincidencia}`); continue; }
    if (!esDelProveedor(base)) { rechazo("producto sin el proveedor asociado"); continue; }

    // Unidad DI: no aplicable por definición. Se comprueba explícitamente aunque
    // el motor ya la haya dejado fuera de LISTO, para que el criterio quede
    // afirmado acá y no dependa de otro archivo.
    if (String(f.unidadProveedor).toUpperCase() === "DI") { rechazo("unidad DI"); continue; }

    // Revalidación real contra el producto vivo: costo, presentación, propiedad,
    // combo, kg/fiambre y precio creíble.
    const v = revalidarFila({ fila: f, base, contexto, config: CONFIG_ARCOR, recargoPct });
    if (!v.aplicable) { rechazo(`revalidación: ${textoOmision(v.motivo)}`); continue; }

    // Precio de venta propuesto, con el modo que se va a usar al aplicar.
    const venta = ventaParaModo({
      modo: MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN,
      costo: v.costoNuevo,
      margenConfigurado: base.margen,
      redondeo100: base.redondeo_100 === true,
    });

    seleccionar.push(f.id);
    reporte.push({
      filaExcel: f.filaExcel,
      productoExcel: f.descripcionProveedor,
      codigoExcel: f.codigoCrudo,
      productoErp: base.nombre,
      codigoArcorErp: (codigoDe.get(base.id) ?? []).join(" / "),
      tipoCoincidencia: f.tipoCoincidencia,
      costoAnterior: v.costoActual,
      precioConIva: num(f.precioConIva),
      recargoPct,
      montoRecargo: num(f.montoRecargo),
      costoPropuesto: v.costoNuevo,
      ventaAnterior: num(base.precio_venta),
      ventaPropuesta: venta.aplica ? venta.precioFinal : num(base.precio_venta),
      ventaCambia: venta.aplica,
    });
  }

  // ── Salida ───────────────────────────────────────────────────────────────
  console.log(`\n=== PREPARAR IMPORTACIÓN ${ID} ===`);
  console.log(`proveedor : ${cab.proveedor.nombre}`);
  console.log(`archivo   : ${cab.archivoNombre}`);
  console.log(`estado    : ${cab.estado}`);
  console.log(`filas     : ${filas.length}`);
  console.log(`modo      : ${ESCRIBIR ? "ESCRIBIR SELECCIÓN" : "SIMULACIÓN"}`);
  console.log(`\nSELECCIONADAS: ${seleccionar.length}`);

  const porTipo = {};
  for (const r of reporte) porTipo[r.tipoCoincidencia] = (porTipo[r.tipoCoincidencia] ?? 0) + 1;
  for (const [t, c] of Object.entries(porTipo)) console.log(`  ${t}: ${c}`);

  console.log("\nNO SELECCIONADAS, por motivo:");
  for (const [m, c] of [...descartadas.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(c).padStart(4)} · ${m}`);
  }

  const sumaCostoAnterior = reporte.reduce((a, r) => a + (r.costoAnterior ?? 0), 0);
  const sumaCostoNuevo = reporte.reduce((a, r) => a + (r.costoPropuesto ?? 0), 0);
  console.log(`\nImpacto en costo de las seleccionadas: ${sumaCostoAnterior.toFixed(2)} → ${sumaCostoNuevo.toFixed(2)}`);
  console.log(`Filas cuyo precio de venta se recalcularía: ${reporte.filter((r) => r.ventaCambia).length}`);

  console.log("\n### REPORTE");
  console.log([
    "filaExcel", "productoExcel", "codigoExcel", "productoErp", "codigoArcorErp",
    "tipoCoincidencia", "costoAnterior", "precioConIva", "recargoPct", "montoRecargo",
    "costoPropuesto", "ventaAnterior", "ventaPropuesta",
  ].join("|"));
  for (const r of reporte) {
    console.log([
      r.filaExcel, r.productoExcel, r.codigoExcel, r.productoErp, r.codigoArcorErp,
      r.tipoCoincidencia, money(r.costoAnterior), money(r.precioConIva), r.recargoPct,
      money(r.montoRecargo), money(r.costoPropuesto), money(r.ventaAnterior), money(r.ventaPropuesta),
    ].join("|"));
  }

  if (!ESCRIBIR) {
    console.log("\nSIMULACIÓN: no se escribió la selección. Agregá --escribir.");
    await prisma.$disconnect();
    return;
  }

  // ── Escritura de la SELECCIÓN, nada más ──────────────────────────────────
  await prisma.$transaction(async (tx) => {
    // Primero se limpia todo: una marca vieja de otra corrida no puede colarse.
    await tx.importacionListaFila.updateMany({
      where: { importacionId: ID },
      data: { seleccionada: false },
    });
    if (seleccionar.length > 0) {
      await tx.importacionListaFila.updateMany({
        where: { id: { in: seleccionar }, importacionId: ID },
        data: { seleccionada: true },
      });
    }
  }, { maxWait: 20000, timeout: 120000 });

  const verificacion = await prisma.importacionListaFila.count({
    where: { importacionId: ID, seleccionada: true },
  });
  console.log(`\nESCRITO: ${verificacion} filas seleccionadas en la base.`);
  console.log("No se modificó ningún costo ni precio de venta.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});

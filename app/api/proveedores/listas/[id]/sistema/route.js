// GET /api/proveedores/listas/[id]/sistema?situacion=...&page=...
//
// EL DETALLE DE CADA MÉTRICA DEL RESUMEN, POR PRODUCTO DEL ERP.
//
// ── POR QUÉ NO ALCANZA CON EL LISTADO DE FILAS ──────────────────────────────
//
// El listado de la grilla recorre el ARCHIVO: una línea por fila del Excel. Acá
// se recorre el CATÁLOGO: una línea por producto del ERP, con las filas que lo
// tocaron colgando debajo. Son dos preguntas distintas y por eso son dos
// endpoints distintos.
//
// La diferencia se ve en los números: 281 filas aplicadas sobre 279 productos.
// Si este endpoint devolviera filas, la lista de "279 actualizados" tendría 281
// renglones y nadie entendería por qué.
//
// SOLO LECTURA. No escribe nada.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { SITUACION_DETALLE } from "@/lib/proveedores/listas/detalleSistema";
import { rangoDeLaFila } from "@/lib/proveedores/listas/vigenciaConfirmacion";

const PAGE_SIZE = 50;
/** Tope del modo reporte. Muy por encima de cualquier universo real. */
const TOPE_REPORTE = 5000;

/** Los campos del producto que el detalle necesita, y ninguno más. */
const CAMPOS_PRODUCTO = {
  id: true,
  nombre: true,
  precio_costo: true,
  updatedAt: true,
  unidad_medida: true,
  factor_pack: true,
  modoCompraProveedor: true,
  proveedor_id: true,
  proveedor2_id: true,
  proveedor3_id: true,
};

/** Los campos de la fila. Los mismos que usa la grilla, para que el análisis
 *  del cliente dé exactamente lo mismo en los dos lugares. */
const CAMPOS_FILA = {
  id: true, filaExcel: true, codigoCrudo: true, descripcionProveedor: true,
  unidadProveedor: true, unidadesPorBulto: true, precioConIva: true, recargoPct: true,
  estado: true, motivo: true, aplicada: true, excluidaManual: true, productoBaseId: true,
  costoAnterior: true, costoMaestroPropuesto: true, montoRecargo: true, precioConRecargo: true,
  costoPrevioAplicacion: true, costoAplicado: true, aplicadaEn: true,
  multiplicadorConfirmado: true, cantidadPresentacion: true,
  // Lo que `rangoDeLaFila` necesita para saber si manda el rango congelado de la
  // fila o el de la cabecera. Sin estos cuatro campos la función no puede ver una
  // confirmación y cae SIEMPRE a la cabecera, en silencio.
  //
  // Hoy no cambia ningún número —el reporte solo analiza filas FACTOR_DUDOSO, y
  // una fila confirmada deja de estar en ese estado— pero el llamador dice que
  // resuelve el rango de la fila y tiene que poder hacerlo. Si no, el día que
  // alguien analice otro estado desde acá, la respuesta va a estar mal sin que
  // nada lo delate.
  confirmadoEn: true, vinculadoEn: true,
  aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true,
};

const numero = (v) => (v === null || v === undefined ? null : Number(v));

export async function GET(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const url = new URL(req.url);
    const situacion = String(url.searchParams.get("situacion") ?? "");
    if (!SITUACION_DETALLE[situacion]) {
      return NextResponse.json(
        { ok: false, error: "Situación desconocida.", situaciones: Object.keys(SITUACION_DETALLE) },
        { status: 400 }
      );
    }
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    // El reporte necesita TODO de una: paginado en 50 tardaría ocho viajes para
    // los 279 actualizados y podría mostrar un estado inconsistente si alguien
    // aplica algo en el medio. El tope existe igual, por las dudas.
    const todo = url.searchParams.get("todo") === "1";

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, proveedorId: true, recargoPct: true, aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const universo = { grupoId, ...productoDelProveedorWhere(importacion.proveedorId) };
    const conAplicada = { filasImportacionLista: { some: { importacionId, aplicada: true } } };
    const conFila = { filasImportacionLista: { some: { importacionId } } };

    // El where de cada situación. Son excluyentes por construcción: el mismo
    // criterio que usa el resumen, para que los números coincidan siempre.
    const wherePorSituacion = {
      ACTUALIZADOS: { ...universo, ...conAplicada },
      PENDIENTES: { ...universo, NOT: conAplicada, ...conFila },
      AUSENTES: { ...universo, filasImportacionLista: { none: { importacionId } } },
      SIN_CODIGO: {
        ...universo,
        codigosProveedor: { none: { proveedorId: importacion.proveedorId, activo: true } },
      },
    };
    const where = wherePorSituacion[situacion];

    const [total, productos] = await Promise.all([
      prisma.productoBase.count({ where }),
      prisma.productoBase.findMany({
        where,
        select: CAMPOS_PRODUCTO,
        orderBy: { nombre: "asc" },
        skip: todo ? 0 : (page - 1) * PAGE_SIZE,
        take: todo ? TOPE_REPORTE : PAGE_SIZE,
      }),
    ]);

    const ids = productos.map((p) => p.id);

    // Las filas de ESTA importación que tocan estos productos. Un solo viaje.
    const filas = ids.length
      ? await prisma.importacionListaFila.findMany({
          where: { importacionId, productoBaseId: { in: ids } },
          select: CAMPOS_FILA,
          orderBy: { filaExcel: "asc" },
        })
      : [];
    const filasPorProducto = new Map();
    for (const f of filas) {
      if (!filasPorProducto.has(f.productoBaseId)) filasPorProducto.set(f.productoBaseId, []);
      filasPorProducto.get(f.productoBaseId).push(f);
    }

    // Los códigos del proveedor, para poder mostrarlos al lado del producto.
    const vinculos = ids.length
      ? await prisma.productoCodigoProveedor.findMany({
          where: { grupoId, proveedorId: importacion.proveedorId, productoBaseId: { in: ids }, activo: true },
          select: { productoBaseId: true, codigoInterno: true },
        })
      : [];
    const codigosPorProducto = new Map();
    for (const v of vinculos) {
      if (!codigosPorProducto.has(v.productoBaseId)) codigosPorProducto.set(v.productoBaseId, []);
      codigosPorProducto.get(v.productoBaseId).push(v.codigoInterno);
    }

    // Los proveedores del producto, solo para la situación que lo necesita: es
    // la que pregunta "¿a quién le compro esto, si no tiene código de Arcor?".
    let nombresProveedor = new Map();
    if (situacion === "SIN_CODIGO") {
      const provIds = [
        ...new Set(productos.flatMap((p) => [p.proveedor_id, p.proveedor2_id, p.proveedor3_id]).filter(Boolean)),
      ];
      const provs = provIds.length
        ? await prisma.proveedor.findMany({ where: { id: { in: provIds } }, select: { id: true, nombre: true } })
        : [];
      nombresProveedor = new Map(provs.map((p) => [p.id, p.nombre]));
    }

    const items = productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      costoActual: numero(p.precio_costo),
      actualizadoEn: p.updatedAt,
      unidadMedida: p.unidad_medida,
      factorPack: p.factor_pack,
      modoCompraProveedor: p.modoCompraProveedor,
      codigosArcor: codigosPorProducto.get(p.id) ?? [],
      proveedores:
        situacion === "SIN_CODIGO"
          ? [p.proveedor_id, p.proveedor2_id, p.proveedor3_id]
              .filter(Boolean)
              .map((x) => nombresProveedor.get(x) ?? `#${x}`)
          : undefined,
      filas: (filasPorProducto.get(p.id) ?? []).map((f) => ({
        ...f,
        precioConIva: numero(f.precioConIva),
        recargoPct: numero(f.recargoPct),
        montoRecargo: numero(f.montoRecargo),
        precioConRecargo: numero(f.precioConRecargo),
        costoAnterior: numero(f.costoAnterior),
        costoMaestroPropuesto: numero(f.costoMaestroPropuesto),
        costoPrevioAplicacion: numero(f.costoPrevioAplicacion),
        costoAplicado: numero(f.costoAplicado),
        importacionId,
      })),
    }));

    return NextResponse.json({
      ok: true,
      situacion,
      items,
      // El rango de la IMPORTACIÓN, resuelto por el único lugar que sabe de
      // dónde sale: cabecera, y si no la tiene, el default del sistema. El `{}`
      // es porque acá no hay una fila que pueda aportar un congelado; cuando la
      // hay —cada fila de `items`— quien la muestra la resuelve con su propia
      // fila. Antes eran dos `?? 10` y `?? 20` escritos a mano, que además
      // ignoraban el congelado.
      rango: rangoDeLaFila({}, importacion),
      recargoPct: numero(importacion.recargoPct),
      paginacion: {
        page: todo ? 1 : page,
        pageSize: todo ? TOPE_REPORTE : PAGE_SIZE,
        total,
        paginas: todo ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    });
  } catch (e) {
    console.error("[listas/sistema] error:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// app/api/reportes-stock/valorizado/route.js
//
// Reporte de stock valorizado para un local.
// Devuelve resumen agregado + items por producto.
//
// Reutiliza la lógica de costo/venta unitaria que hoy aplica
// /api/stock_locales/listar (sin tocar ese endpoint).
//
// Exporta `obtenerReporte(req)` para que /exportar-excel pueda reusar
// la query sin duplicar lógica.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { redondear100 } from "@/lib/precios/redondeo";

function safeNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

// Helper compartido — lo usa GET y /exportar-excel.
// Devuelve:
//   { ok: true, resumen, items, local }
//   { ok: false, error, status }
//
// El local SIEMPRE se resuelve desde el contexto activo de la sesión (JWT
// o cookie de contexto-activo) — nunca desde query. Esto evita que un
// usuario pueda ver el stock de otro local distinto al que está operando.
export async function obtenerReporte(req) {
  const ctx = await resolveLocalAndGrupo(req);
  if (ctx.error) {
    return { ok: false, error: ctx.error, status: ctx.status };
  }

  const { session, localId } = ctx;

  const perm = checkPerm(session, "stock.ver");
  if (!perm.ok) return { ok: false, error: perm.error, status: perm.status };

  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim();
  const categoria = searchParams.get("categoria") || "";
  const proveedor = searchParams.get("proveedor") || "";
  const estadoStock = searchParams.get("estadoStock") || "todos";

  const local = await prisma.local.findUnique({
    where: { id: localId },
    select: { id: true, nombre: true, es_deposito: true },
  });

  if (!local) return { ok: false, error: "Local no encontrado", status: 404 };

  const rows = await prisma.productoLocal.findMany({
    where: {
      localId,
      activo: true,
      base: {
        activo: true,
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { codigo_barra: { contains: q, mode: "insensitive" } },
                { codigo_barra_secundario: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        categoria_id: categoria ? Number(categoria) : undefined,
        proveedor_id: proveedor ? Number(proveedor) : undefined,
      },
    },
    orderBy: { id: "asc" },
    include: {
      base: {
        select: {
          id: true,
          nombre: true,
          codigo_barra: true,
          factor_pack: true,
          precio_costo: true,
          precio_venta: true,
          redondeo_100: true,
          categoria: { select: { id: true, nombre: true } },
          proveedor: { select: { id: true, nombre: true } },
        },
      },
      stock: { take: 1, select: { cantidad: true } },
    },
  });

  const items = [];

  for (const p of rows) {
    const base = p.base;
    const cantidad = safeNum(p.stock?.[0]?.cantidad);
    const factor = Math.max(1, safeNum(base.factor_pack) || 1);

    // Costo: ProductoLocal override → ProductoBase fallback.
    // Si factor_pack > 1, el precio en DB es del bulto → dividir.
    const precioCostoBase = safeNum(p.precio_costo ?? base.precio_costo);
    const precioCostoUnitario =
      factor > 1 ? precioCostoBase / factor : precioCostoBase;

    // Venta: idem. Luego aplicar redondeo a 100 si corresponde (igual que stock_locales/listar).
    const precioVentaBase = safeNum(p.precio_venta ?? base.precio_venta);
    let precioVentaUnitario =
      factor > 1 ? precioVentaBase / factor : precioVentaBase;
    if (base.redondeo_100 === true) {
      precioVentaUnitario = redondear100(precioVentaUnitario);
    }

    const sinCosto = !(precioCostoUnitario > 0);
    const valorCosto = sinCosto ? 0 : cantidad * precioCostoUnitario;
    const valorVenta =
      precioVentaUnitario > 0 ? cantidad * precioVentaUnitario : 0;
    const gananciaPotencial = valorVenta - valorCosto;

    const item = {
      productoId: base.id,
      productoLocalId: p.id,
      localId: local.id,
      localNombre: local.nombre,
      productoNombre: base.nombre,
      codigoBarra: base.codigo_barra || "",
      categoriaNombre: base.categoria?.nombre || "",
      proveedorNombre: base.proveedor?.nombre || "",
      cantidad,
      precioCostoUnitario,
      precioVentaUnitario,
      valorCosto,
      valorVenta,
      gananciaPotencial,
      observacion: sinCosto ? "Sin costo cargado" : "",
    };

    // Filtro estadoStock — post-cómputo de cantidad.
    if (estadoStock === "conStock" && !(cantidad > 0)) continue;
    if (estadoStock === "sinStock" && cantidad !== 0) continue;
    if (estadoStock === "negativo" && !(cantidad < 0)) continue;
    // "todos" → sin filtro

    items.push(item);
  }

  const resumen = items.reduce(
    (acc, it) => {
      acc.totalCosto += it.valorCosto;
      acc.totalVenta += it.valorVenta;
      acc.gananciaPotencial += it.gananciaPotencial;
      acc.unidadesTotales += it.cantidad;
      return acc;
    },
    {
      totalCosto: 0,
      totalVenta: 0,
      gananciaPotencial: 0,
      cantidadProductos: 0,
      unidadesTotales: 0,
    }
  );
  resumen.cantidadProductos = items.length;

  return { ok: true, resumen, items, local };
}

export async function GET(req) {
  try {
    const result = await obtenerReporte(req);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }
    return NextResponse.json({
      ok: true,
      resumen: result.resumen,
      items: result.items,
    });
  } catch (err) {
    console.error("Error reportes-stock/valorizado:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

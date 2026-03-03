import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { getContextoActivo } from "@/lib/contexto";
import * as XLSX from "xlsx";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();

    // Resolver localId: body → session → contexto cookie
    let localId = Number(body.localId) || 0;
    if (!localId && session.localId) localId = Number(session.localId);
    if (!localId && session.esAdmin) {
      const ctx = getContextoActivo(req, session);
      if (ctx.localId) localId = Number(ctx.localId);
    }

    // Resolver grupoId: session → derivar de localId
    let grupoId = Number(session.grupoId) || 0;
    if (!grupoId && localId) {
      grupoId = await getGrupoIdDeLocal(localId);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[productos/export] CTX:", { sessionGrupoId: session.grupoId, localId, grupoIdResolved: grupoId });
    }

    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "Selecciona un grupo activo" },
        { status: 400 }
      );
    }

    localId = localId || null;
    const proveedorId = body.proveedorId ? Number(body.proveedorId) : null;
    const categoriaId = body.categoriaId ? Number(body.categoriaId) : null;

    // Filtro base
    const where = { grupoId };
    if (proveedorId) where.proveedor_id = proveedorId;
    if (categoriaId) where.categoria_id = categoriaId;

    // Obtener productos base con relaciones
    const productos = await prisma.productoBase.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: {
        categoria: { select: { nombre: true } },
        proveedor: { select: { nombre: true } },
        area_fisica: { select: { nombre: true } },
        locales: localId
          ? {
              where: { localId },
              take: 1,
              include: {
                local: { select: { nombre: true } },
                stock: { select: { cantidad: true, stockMin: true, stockMax: true } },
              },
            }
          : {
              include: {
                local: { select: { nombre: true } },
                stock: { select: { cantidad: true, stockMin: true, stockMax: true } },
              },
            },
      },
    });

    // Armar filas para Excel
    const filas = [];

    for (const p of productos) {
      if (localId && p.locales.length > 0) {
        // Una fila por el local filtrado
        const loc = p.locales[0];
        filas.push({
          id: p.id,
          codigo_barra: p.codigo_barra || "",
          nombre: loc.nombre || p.nombre,
          categoria: p.categoria?.nombre || "",
          proveedor: p.proveedor?.nombre || "",
          area_fisica: p.area_fisica?.nombre || "",
          unidad_medida: p.unidad_medida || "",
          factor_pack: p.factor_pack != null ? Number(p.factor_pack) : "",
          precio_costo: Number(loc.precio_costo ?? p.precio_costo ?? 0),
          precio_venta: Number(loc.precio_venta ?? p.precio_venta ?? 0),
          margen: Number(loc.margen ?? p.margen ?? 0),
          stock_actual: loc.stock?.[0] ? Number(loc.stock[0].cantidad) : 0,
          stock_min: loc.stock?.[0]?.stockMin != null ? Number(loc.stock[0].stockMin) : "",
          stock_max: loc.stock?.[0]?.stockMax != null ? Number(loc.stock[0].stockMax) : "",
          activo: (loc.activo ?? p.activo) ? "SI" : "NO",
          local_nombre: loc.local?.nombre || "",
        });
      } else if (!localId && p.locales.length > 0) {
        // Sin filtro de local: una fila por cada local
        for (const loc of p.locales) {
          filas.push({
            id: p.id,
            codigo_barra: p.codigo_barra || "",
            nombre: loc.nombre || p.nombre,
            categoria: p.categoria?.nombre || "",
            proveedor: p.proveedor?.nombre || "",
            area_fisica: p.area_fisica?.nombre || "",
            unidad_medida: p.unidad_medida || "",
            factor_pack: p.factor_pack != null ? Number(p.factor_pack) : "",
            precio_costo: Number(loc.precio_costo ?? p.precio_costo ?? 0),
            precio_venta: Number(loc.precio_venta ?? p.precio_venta ?? 0),
            margen: Number(loc.margen ?? p.margen ?? 0),
            stock_actual: loc.stock?.[0] ? Number(loc.stock[0].cantidad) : 0,
            stock_min: loc.stock?.[0]?.stockMin != null ? Number(loc.stock[0].stockMin) : "",
            stock_max: loc.stock?.[0]?.stockMax != null ? Number(loc.stock[0].stockMax) : "",
            activo: (loc.activo ?? p.activo) ? "SI" : "NO",
            local_nombre: loc.local?.nombre || "",
          });
        }
      } else {
        // Producto sin locales asignados (solo base)
        filas.push({
          id: p.id,
          codigo_barra: p.codigo_barra || "",
          nombre: p.nombre,
          categoria: p.categoria?.nombre || "",
          proveedor: p.proveedor?.nombre || "",
          area_fisica: p.area_fisica?.nombre || "",
          unidad_medida: p.unidad_medida || "",
          factor_pack: p.factor_pack != null ? Number(p.factor_pack) : "",
          precio_costo: Number(p.precio_costo ?? 0),
          precio_venta: Number(p.precio_venta ?? 0),
          margen: Number(p.margen ?? 0),
          stock_actual: "",
          stock_min: "",
          stock_max: "",
          activo: p.activo ? "SI" : "NO",
          local_nombre: "",
        });
      }
    }

    // Generar Excel
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");

    // Ajustar ancho de columnas
    ws["!cols"] = [
      { wch: 6 },   // id
      { wch: 16 },  // codigo_barra
      { wch: 35 },  // nombre
      { wch: 15 },  // categoria
      { wch: 18 },  // proveedor
      { wch: 15 },  // area_fisica
      { wch: 14 },  // unidad_medida
      { wch: 10 },  // factor_pack
      { wch: 12 },  // precio_costo
      { wch: 12 },  // precio_venta
      { wch: 8 },   // margen
      { wch: 12 },  // stock_actual
      { wch: 10 },  // stock_min
      { wch: 10 },  // stock_max
      { wch: 6 },   // activo
      { wch: 18 },  // local_nombre
    ];

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const hoy = new Date().toISOString().split("T")[0];

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="productos_${hoy}.xlsx"`,
      },
    });
  } catch (e) {
    console.error("ERROR productos/export:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}

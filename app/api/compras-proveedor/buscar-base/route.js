// app/api/compras-proveedor/buscar-base/route.js
// Solo lectura: busca ProductoBase para vincular un código interno desde Compras
// a Proveedor. Filtra por grupoId Y por el universo del proveedor seleccionado
// (mismo criterio que el buscador de compras): proveedor 1/2/3 o ya vinculado.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const url = new URL(req.url);
    const search = (url.searchParams.get("search") || "").trim();
    const proveedorId = Number(url.searchParams.get("proveedorId") || 0);

    if (!proveedorId) {
      return NextResponse.json(
        { ok: false, error: "proveedorId requerido" },
        { status: 400 }
      );
    }
    if (!search) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Universo del proveedor: proveedor 1/2/3 + bases ya vinculadas por código interno.
    const vinculos = await prisma.productoCodigoProveedor.findMany({
      where: { grupoId, proveedorId, activo: true },
      select: { productoBaseId: true },
    });
    const baseIdsVinculados = [...new Set(vinculos.map((v) => v.productoBaseId))];

    const rows = await prisma.productoBase.findMany({
      where: {
        grupoId,
        activo: true,
        AND: [
          {
            OR: [
              { proveedor_id: proveedorId },
              { proveedor2_id: proveedorId },
              { proveedor3_id: proveedorId },
              ...(baseIdsVinculados.length ? [{ id: { in: baseIdsVinculados } }] : []),
            ],
          },
          {
            OR: [
              { nombre: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { codigo_barra: { contains: search, mode: "insensitive" } },
              { codigo_barra_secundario: { contains: search, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        nombre: true,
        sku: true,
        codigo_barra: true,
        codigo_barra_secundario: true,
      },
      orderBy: { nombre: "asc" },
      take: 20,
    });

    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    console.error("ERROR compras-proveedor/buscar-base:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

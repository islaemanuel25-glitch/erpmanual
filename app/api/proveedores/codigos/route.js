// app/api/proveedores/codigos/route.js
// Solo lectura: productos del ERP vinculados a un proveedor por código interno.
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

    const perm = checkPerm(session, "proveedores.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const url = new URL(req.url);
    const proveedorId = Number(url.searchParams.get("proveedorId") || 0);

    if (!proveedorId) {
      return NextResponse.json(
        { ok: false, error: "proveedorId requerido" },
        { status: 400 }
      );
    }

    // El proveedor es global, pero los vínculos son por grupoId.
    const vinculos = await prisma.productoCodigoProveedor.findMany({
      where: { grupoId, proveedorId, activo: true },
      include: {
        productoBase: {
          select: {
            id: true,
            nombre: true,
            codigo_barra: true,
            codigo_barra_secundario: true,
          },
        },
      },
      orderBy: { codigoInterno: "asc" },
    });

    const items = vinculos.map((v) => ({
      id: v.id,
      codigoInterno: v.codigoInterno,
      descripcionProveedor: v.descripcionProveedor,
      productoBaseId: v.productoBaseId,
      nombre: v.productoBase?.nombre ?? null,
      codigo_barra: v.productoBase?.codigo_barra ?? null,
      codigo_barra_secundario: v.productoBase?.codigo_barra_secundario ?? null,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("ERROR proveedores/codigos:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

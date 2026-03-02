// app/api/compras-proveedor/listar/route.js
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
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);

    const proveedorId = Number(url.searchParams.get("proveedorId") || 0) || undefined;
    const estado = url.searchParams.get("estado") || undefined;
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") || 20)));

    const where = { grupoId };
    if (proveedorId) where.proveedorId = proveedorId;
    if (estado) where.estado = estado;

    const [items, total] = await Promise.all([
      prisma.pedidoProveedor.findMany({
        where,
        include: {
          proveedor: { select: { id: true, nombre: true } },
          deposito: { select: { id: true, nombre: true } },
          _count: { select: { detalles: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.pedidoProveedor.count({ where }),
    ]);

    const mapped = items.map((p) => ({
      id: p.id,
      estado: p.estado,
      notas: p.notas,
      proveedorNombre: p.proveedor.nombre,
      proveedorId: p.proveedor.id,
      depositoNombre: p.deposito.nombre,
      depositoId: p.deposito.id,
      cantItems: p._count.detalles,
      fechaConfirmado: p.fechaConfirmado,
      fechaEnviado: p.fechaEnviado,
      fechaRecibido: p.fechaRecibido,
      createdAt: p.createdAt,
    }));

    return NextResponse.json({ ok: true, items: mapped, total });
  } catch (err) {
    console.error("Error compras-proveedor/listar:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

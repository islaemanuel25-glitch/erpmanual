import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // grupoId SIEMPRE derivado del alcance autorizado (no de un localId crudo del
    // query: un no-admin podía pasar ?localId=<otro grupo> y leer su historial).
    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }
    const grupoId = vista.grupoId;

    const updates = await prisma.precioUpdate.findMany({
      where: { grupoId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: { select: { id: true } },
      },
    });

    const proveedorIds = [...new Set(updates.map((u) => u.proveedorId).filter(Boolean))];
    const proveedores = await prisma.proveedor.findMany({
      where: { id: { in: proveedorIds } },
      select: { id: true, nombre: true },
    });
    const proveedoresMap = new Map(proveedores.map((p) => [p.id, p.nombre]));

    const items = updates.map((u) => ({
      id: u.id,
      fecha: new Date(u.createdAt).toLocaleString("es-AR"),
      proveedorId: u.proveedorId,
      proveedorNombre: u.proveedorId ? proveedoresMap.get(u.proveedorId) || null : null,
      metodo: u.metodo,
      pricingMode: u.pricingMode,
      itemsCount: u.items.length,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("ERROR productos/precios/history:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

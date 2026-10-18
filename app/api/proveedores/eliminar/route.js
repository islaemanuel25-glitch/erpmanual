import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorEditableWhere } from "@/lib/visibilidad";

export async function DELETE(req) {
  try {
    // El permiso, como crear y editar; acá decía `requireAdmin` escrito a mano.
    // El admin pasa igual: tiene el comodín.
    const auth = requirePerm(req, "proveedores.eliminar");
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const numId = Number(body.id || 0);

    if (!numId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // ── SOLO LO PROPIO ─────────────────────────────────────────────────────
    //
    // La misma regla que editar: sin el comodín, solo un proveedor creado en el
    // local de la sesión, aunque el id venga escrito a mano. Uno de otro local,
    // del depósito o viejo sin local contesta 403 y no se toca. De acá en
    // adelante, lo mismo que hacía para el admin: no cambia QUÉ pasa al
    // eliminar, solo quién puede.
    const scope = await resolveLocalAndGrupo(req);
    if (!auth.session.esAdmin && scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const propio = await prisma.proveedor.findFirst({
      where: { id: numId, ...proveedorEditableWhere(scope.localId, auth.session.esAdmin) },
      select: { id: true },
    });
    if (!propio && !auth.session.esAdmin) {
      return NextResponse.json(
        { ok: false, error: "Ese proveedor no es de este local. Cada local tiene sus propios proveedores." },
        { status: 403 }
      );
    }

    const countProductos = await prisma.productoBase.count({
      where: { proveedor_id: numId },
    });

    if (countProductos > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se puede eliminar: tiene productos asociados",
        },
        { status: 400 }
      );
    }

    await prisma.proveedor.delete({
      where: { id: numId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ELIMINAR proveedor:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

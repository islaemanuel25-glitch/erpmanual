import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveGrupo } from "@/lib/grupos";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // Lectura de proveedor: se usa tanto en Proveedores como en flujos de Compras.
    // Aceptar cualquiera de los dos permisos para no romper roles operativos.
    const permProv = checkPerm(session, "proveedores.ver");
    const permCompras = checkPerm(session, "compras.ver");
    if (!permProv.ok && !permCompras.ok) {
      return NextResponse.json({ ok: false, error: permProv.error }, { status: permProv.status });
    }

    // Scope de grupo: solo proveedores del grupo de la sesión (ajeno → 404, no revela).
    const scope = await resolveGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const item = await prisma.proveedor.findFirst({
      where: { id, grupoId: scope.grupoId },
      select: {
        id: true,
        nombre: true,
        cuit: true,
        telefono: true,
        email: true,
        direccion: true,
        dias_pedido: true,   // 🔥 EL CAMPO QUE FALTABA
        activo: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item });

  } catch (e) {
    console.error("GET proveedor:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";
import { resolveScope, getGrupoIdDeLocal } from "@/lib/grupos";

export async function DELETE(req) {
  try {
    // 1) Auth + admin
    const auth = requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }
    const session = auth.session;

    // 2) Alcance: un admin global sin contexto no puede borrar cualquier
    // usuario por email. Resolvemos el grupo del admin actuante.
    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    // 3) Obtener email del body
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Email requerido." },
        { status: 400 }
      );
    }

    // 4) Buscar usuario por email
    const usuario = await prisma.usuario.findFirst({
      where: { email },
      include: { rol: true },
    });

    if (!usuario) {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    // 4b) Alcance: el usuario objetivo debe pertenecer al grupo del contexto.
    const grupoObjetivo = usuario.localId
      ? await getGrupoIdDeLocal(usuario.localId)
      : null;
    if (!grupoObjetivo || grupoObjetivo !== scope.grupoId) {
      return NextResponse.json(
        { ok: false, error: "El usuario no pertenece a tu alcance." },
        { status: 403 }
      );
    }

    // 5) Bloqueo auto-eliminación
    if (Number(session.id) === usuario.id) {
      return NextResponse.json(
        { ok: false, error: "No podés eliminar tu propio usuario." },
        { status: 400 }
      );
    }

    // 6) Bloqueo Admin
    if (usuario.rol?.nombre === "Admin") {
      return NextResponse.json(
        { ok: false, error: "No se puede eliminar el usuario administrador." },
        { status: 403 }
      );
    }

    // 7) Soft delete (marcar como inactivo)
    const eliminado = await prisma.usuario.update({
      where: { id: usuario.id },
      data: { activo: false },
      include: { rol: true, local: true },
    });

    return NextResponse.json(
      { 
        ok: true, 
        usuario: eliminado,
        mensaje: `Usuario ${email} eliminado correctamente.`
      },
      { status: 200 }
    );
  } catch (e) {
    if (e?.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    console.error("❌ usuarios/eliminarPorEmail", e);
    return NextResponse.json(
      { ok: false, error: "Error al eliminar usuario." },
      { status: 500 }
    );
  }
}


import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

export async function PUT(req, context) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { id } = await context.params; // ✅ Next 15
    const rolId = Number(id);

    if (!rolId || Number.isNaN(rolId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const data = {};

    if (body?.nombre !== undefined) {
      const nombre = String(body.nombre).trim();
      if (!nombre) {
        return NextResponse.json(
          { ok: false, error: "Nombre requerido" },
          { status: 400 }
        );
      }
      data.nombre = nombre;
    }

    if (body?.permisos !== undefined) {
      if (!Array.isArray(body.permisos)) {
        return NextResponse.json(
          { ok: false, error: "Permisos inválidos (deben ser array)" },
          { status: 400 }
        );
      }
      data.permisos = body.permisos;
    }

    // Guards de rol de sistema y del privilegio universal "*".
    const actual = await prisma.rol.findUnique({
      where: { id: rolId },
      select: { nombre: true, permisos: true, esSistema: true },
    });
    if (!actual) {
      return NextResponse.json({ ok: false, error: "Rol no encontrado" }, { status: 404 });
    }
    const actualEsUniversal = Array.isArray(actual.permisos) && actual.permisos.includes("*");
    const nuevoPermisos = data.permisos; // undefined si no se envió
    // 1) No agregar "*" a NINGÚN rol que no lo tenga (común o de sistema ≠ Admin).
    if (!actualEsUniversal && Array.isArray(nuevoPermisos) && nuevoPermisos.includes("*")) {
      return NextResponse.json(
        { ok: false, error: "No se puede otorgar el privilegio universal (*)." },
        { status: 400 }
      );
    }
    // 2) No retirar "*" del rol Admin (evita auto-lockout).
    if (actualEsUniversal && Array.isArray(nuevoPermisos) && !nuevoPermisos.includes("*")) {
      return NextResponse.json(
        { ok: false, error: "No se puede retirar el privilegio universal del rol administrador." },
        { status: 400 }
      );
    }
    // 3) No renombrar un rol de sistema (Admin/CAJERO/ENCARGADO/DUEÑO_LOCAL).
    //    Sus permisos SÍ pueden ajustarse (salvo el "*", cubierto por 1 y 2).
    if (actual.esSistema && data.nombre !== undefined && data.nombre !== actual.nombre) {
      return NextResponse.json(
        { ok: false, error: "No se puede renombrar un rol de sistema." },
        { status: 400 }
      );
    }

    const item = await prisma.rol.update({
      where: { id: rolId },
      data
    });

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un rol con ese nombre" },
        { status: 409 }
      );
    }

    if (e.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "Rol no encontrado" },
        { status: 404 }
      );
    }

    console.error("roles/editar", e);
    return NextResponse.json(
      { ok: false, error: "Error al editar rol" },
      { status: 500 }
    );
  }
}

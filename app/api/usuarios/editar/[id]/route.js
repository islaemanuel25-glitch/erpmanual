import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt"; // ✅ unificado con seed

export async function PUT(req, context) {
  try {
    // ⚠️ En Next 15 params es un Promise: hay que hacer await
    const { id } = await context.params;
    const userId = Number(id);

    if (!userId || Number.isNaN(userId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const data = {};

    // ✅ NOMBRE
    if (body?.nombre !== undefined) {
      const nombre = String(body.nombre).trim();
      if (!nombre) {
        return NextResponse.json(
          { ok: false, error: "Nombre requerido." },
          { status: 400 }
        );
      }
      data.nombre = nombre;
    }

    // ✅ EMAIL
    if (body?.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!email) {
        return NextResponse.json(
          { ok: false, error: "Email requerido." },
          { status: 400 }
        );
      }
      data.email = email;
    }

    // ✅ PASSWORD
    if (body?.password !== undefined && String(body.password).trim() !== "") {
      data.passwordHash = await bcrypt.hash(String(body.password), 10);
    }

    // ✅ ROL (no acepta null)
    if (body?.rolId !== undefined) {
      const rolId = Number(body.rolId);
      if (!rolId || Number.isNaN(rolId)) {
        return NextResponse.json(
          { ok: false, error: "Rol inválido." },
          { status: 400 }
        );
      }
      data.rolId = rolId;
    }

    // ✅ LOCAL — igual lógica que en crear
    if (body?.localId !== undefined) {
      let localId = body.localId;

      if (localId === "" || localId === null || localId === undefined) {
        localId = null;
      } else {
        localId = Number(localId);
        if (Number.isNaN(localId)) localId = null;
      }

      data.localId = localId;
    }

    // ✅ ACTIVO
    if (body?.activo !== undefined) {
      data.activo = Boolean(body.activo);
    }

    const editado = await prisma.usuario.update({
      where: { id: userId },
      data,
      include: { rol: true, local: true },
    });

    return NextResponse.json(
      { ok: true, usuario: editado },
      { status: 200 }
    );
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un usuario con ese email." },
        { status: 409 }
      );
    }
    if (e?.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    console.error("❌ usuarios/editar", e);

    return NextResponse.json(
      { ok: false, error: "Error al editar usuario." },
      { status: 500 }
    );
  }
}

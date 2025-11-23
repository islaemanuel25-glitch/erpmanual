import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt"; // ✅ unificado con seed.js (ANTES: bcrypt)

export async function POST(req) {
  try {
    const body = await req.json();

    const nombre = String(body?.nombre ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const rolId = Number(body?.rolId);

    // ✅ localId: si viene 0 enviar 0, no null (antes: 0 → null)
    let localId = body?.localId;
    if (localId === "" || localId === undefined || localId === null) {
      localId = null;
    } else {
      localId = Number(localId);
      if (Number.isNaN(localId)) localId = null;
    }

    const activo = body?.activo ?? true;

    // ✅ Validaciones
    if (!nombre) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido." },
        { status: 400 }
      );
    }
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Email requerido." },
        { status: 400 }
      );
    }
    if (!password) {
      return NextResponse.json(
        { ok: false, error: "Contraseña requerida." },
        { status: 400 }
      );
    }
    if (!rolId || Number.isNaN(rolId)) {
      return NextResponse.json(
        { ok: false, error: "Rol inválido." },
        { status: 400 }
      );
    }

    // ✅ bcrypt unificado con el seed (ANTES: bcrypt → error)
    const passwordHash = await bcrypt.hash(password, 10);

    const creado = await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash,
        rolId, // ✅ sigue igual, necesario
        localId, // ✅ ahora soporta 0 correctamente
        activo: Boolean(activo),
      },
      include: { rol: true, local: true },
    });

    return NextResponse.json(
      { ok: true, usuario: creado },
      { status: 201 }
    );
  } catch (e) {
    // ✅ Email duplicado
    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un usuario con ese email." },
        { status: 409 }
      );
    }

    console.error("❌ Error en usuarios/crear:", e);
    return NextResponse.json(
      { ok: false, error: "Error al crear usuario." },
      { status: 500 }
    );
  }
}

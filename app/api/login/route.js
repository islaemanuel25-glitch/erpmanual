export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt"; // ✅ bcrypt NATIVO (coincide con tu hash real)
import { firmarToken, SesionCookie } from "@/lib/auth";

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    // ============================
    // 1) Validación de inputs
    // ============================
    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Completa email y contraseña." },
        { status: 400 }
      );
    }

    // ============================
    // 2) Buscar usuario
    // ============================
    const user = await prisma.usuario.findUnique({
      where: { email },
      include: {
        rol: true,
        local: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Usuario o contraseña inválidos." },
        { status: 401 }
      );
    }

    if (!user.activo) {
      return NextResponse.json(
        { ok: false, error: "Usuario inactivo. Contacte al administrador." },
        { status: 403 }
      );
    }

    // ============================
    // 3) Validar contraseña
    // ============================
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Usuario o contraseña inválidos." },
        { status: 401 }
      );
    }

    // ============================
    // 4) Permisos del rol
    // ============================
    const permisos = Array.isArray(user.rol?.permisos)
      ? user.rol.permisos
      : ["*"];

    // ============================
    // 5) Payload del JWT
    // ============================
    const payload = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,

      rolId: user.rolId,
      rolNombre: user.rol?.nombre ?? null,
      permisos,

      localId: user.localId ?? null,
      esDeposito: user.local?.es_deposito ?? false,
    };

    const token = firmarToken(payload);

    // ============================
    // 6) Respuesta + cookie
    // ============================
    const res = NextResponse.json({ ok: true, user: payload }, { status: 200 });

    res.cookies.set(SesionCookie.nombre, token, SesionCookie.opciones);

    return res;
  } catch (e) {
    console.error("Error en /api/login:", e);
    return NextResponse.json(
      { ok: false, error: "Error en el servidor." },
      { status: 500 }
    );
  }
}

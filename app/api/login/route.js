export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { firmarToken, SesionCookie } from "@/lib/auth";

// Rate limit en memoria por IP: máx 10 intentos por 15 min
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_MAX = 10;
const loginAttempts = new Map();

function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function isLoginRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now > entry.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_RATE_MAX;
}

function recordLoginAttempt(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export async function POST(req) {
  try {
    const ip = getClientIp(req);
    if (isLoginRateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: "Demasiados intentos. Intente más tarde." },
        { status: 429 }
      );
    }
    recordLoginAttempt(ip);

    const body = await req.json();
    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Payload inválido." },
        { status: 400 }
      );
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
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

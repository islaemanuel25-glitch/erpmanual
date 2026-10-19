export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { firmarTokenDeSesion, SesionCookie } from "@/lib/auth";
import { payloadDeSesion } from "@/lib/sesionCuenta";

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
  // LA VENTANA CORRE DESDE EL ÚLTIMO INTENTO, no desde el primero.
  //
  // Arrancaba en el primero, así que quedar bloqueado en el intento 10
  // significaba esperar lo que restara de esos 15 minutos — con la persona
  // reintentando, que era lo único que podía hacer. Ahora cada intento corre el
  // reloj: quien deja de insistir se destraba en 15 minutos exactos, y quien
  // insiste no acorta su espera, que es justamente el desincentivo que un
  // límite de intentos tiene que dar.
  entry.resetAt = now + LOGIN_RATE_WINDOW_MS;
}

/**
 * Un login que salió BIEN no gasta cupo.
 *
 * El contador se llevaba todos los intentos, aciertos incluidos, y se sumaba
 * antes de validar nada. Diez entradas normales en 15 minutos —cambiar de
 * ubicación, cerrar y volver, dos personas en el mismo local— dejaban a la IP
 * bloqueada sin que nadie se hubiera equivocado nunca.
 *
 * Un límite de intentos existe para frenar a quien PRUEBA CONTRASEÑAS. El que
 * entra bien no es ese.
 */
function perdonarIntento(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return;
  entry.count = Math.max(0, entry.count - 1);
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
    // 4) Payload del JWT
    // ============================
    // Permisos (fail-closed: un `permisos` que no es array no otorga nada), la
    // identidad de DUEÑO_LOCAL y el local. Lo arma `payloadDeSesion`, la misma
    // pieza con que `proxy.js` renueva la foto cuando cambia en la base.
    const payload = payloadDeSesion(user);

    // Sin vencimiento por reloj: la sesión dura hasta que el usuario sale. La
    // valida el servidor en cada pedido (`proxy.js`).
    const token = firmarTokenDeSesion(payload);

    // ============================
    // 6) Respuesta + cookie
    // ============================
    // Entró bien: el intento no cuenta contra el límite.
    perdonarIntento(ip);

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

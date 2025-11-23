// app/api/me/route.js
import { NextResponse } from "next/server";
import { getTokenFromRequest, verificarToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return NextResponse.json({ ok: false, user: null });
    }

    const payload = verificarToken(token);
    if (!payload) {
      return NextResponse.json({ ok: false, user: null });
    }

    // -------------------------------------------
    // Normalización de permisos
    // -------------------------------------------
    const permisos = Array.isArray(payload.permisos)
      ? payload.permisos
      : ["*"];

    const esAdmin = permisos.includes("*");

    // -------------------------------------------
    // Saber si es depósito (solo si tiene localId)
    // -------------------------------------------
    let esDeposito = false;

    // 🔵 ESTA ES LA CORRECCIÓN IMPORTANTE:
    const localId =
      payload.localId !== undefined &&
      payload.localId !== null &&
      payload.localId !== ""
        ? Number(payload.localId)
        : null;

    if (localId !== null) {
      const loc = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });
      if (loc) esDeposito = loc.es_deposito === true;
    }

    // -------------------------------------------
    // Usuario final normalizado
    // -------------------------------------------
    const user = {
      id: Number(payload.id),
      nombre: payload.nombre ?? "",
      email: payload.email ?? "",
      rolId: payload.rolId ?? null,
      rolNombre: payload.rolNombre ?? "",
      permisos,
      esAdmin,

      // 🔵 localId ahora es CORRECTO SIEMPRE
      localId,

      esDeposito,
    };

    return NextResponse.json({
      ok: true,
      user,
    });

  } catch (err) {
    return NextResponse.json({
      ok: false,
      user: null,
      error: err.message,
    });
  }
}

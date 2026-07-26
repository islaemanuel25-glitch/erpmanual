// app/api/me/route.js
import { NextResponse } from "next/server";
import { getTokenFromRequest, verificarToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { operarioObligatorio } from "@/lib/config/acceso";

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

    // Operario obligatorio EFECTIVO del local de la sesión (per-local; null=true).
    // El frontend lo usa para no forzar el flujo de operario cuando el local lo
    // desactivó (ver perfilExentoDeOperador). El backend revalida en cada operación.
    let exigirOperador = true;

    if (localId !== null) {
      const [loc, cl] = await Promise.all([
        prisma.local.findUnique({
          where: { id: localId },
          select: { es_deposito: true },
        }),
        prisma.configuracionLocal.findUnique({
          where: { localId },
          select: { exigirOperador: true },
        }),
      ]);
      if (loc) esDeposito = loc.es_deposito === true;
      exigirOperador = operarioObligatorio(cl?.exigirOperador);
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
      // Flag para el frontend (perfilExentoDeOperador). JWT viejos → false.
      esDuenoLocal: payload.esDuenoLocal === true,

      // 🔵 localId ahora es CORRECTO SIEMPRE
      localId,

      esDeposito,
      // Operario obligatorio efectivo del local de la sesión (null=true).
      exigirOperador,
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

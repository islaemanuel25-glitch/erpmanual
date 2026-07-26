// app/api/contexto-activo/set/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { ContextoActivoCookie } from "@/lib/contexto";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();

    // VISTA GLOBAL EXPLÍCITA: solo admin, y acotada a su grupo activo.
    if (body.global === true) {
      if (!session.esAdmin) {
        return NextResponse.json(
          { ok: false, error: "Solo un administrador puede usar la vista global" },
          { status: 403 }
        );
      }
      if (!session.grupoId) {
        return NextResponse.json(
          { ok: false, error: "Seleccioná un grupo activo antes de la vista global" },
          { status: 400 }
        );
      }
      const response = NextResponse.json({ ok: true, global: true });
      response.cookies.set(
        ContextoActivoCookie.nombre,
        JSON.stringify({ global: true }),
        ContextoActivoCookie.opciones
      );
      return response;
    }

    const localId = Number(body.localId);

    if (!localId || Number.isNaN(localId) || localId <= 0) {
      return NextResponse.json(
        { ok: false, error: "localId inválido" },
        { status: 400 }
      );
    }

    // Validar que el local existe y está activo
    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { id: true, nombre: true, es_deposito: true, activo: true },
    });

    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    if (!local.activo) {
      return NextResponse.json(
        { ok: false, error: "El local está inactivo" },
        { status: 400 }
      );
    }

    // No-admin: solo puede elegir su propio local. Fail-closed: sin local asignado
    // (o distinto al asignado) → 403 (antes, sin session.localId el guard se salteaba).
    if (!session.esAdmin) {
      if (!session.localId || session.localId !== localId) {
        return NextResponse.json(
          { ok: false, error: "No podés elegir un local distinto al asignado" },
          { status: 403 }
        );
      }
    }

    // Admin con grupo activo: validar que el local pertenece al grupo
    if (session.esAdmin && session.grupoId) {
      const enGrupo =
        (await prisma.grupoLocal.findFirst({
          where: { grupoId: session.grupoId, localId },
        })) ||
        (await prisma.grupoDeposito.findFirst({
          where: { grupoId: session.grupoId, localId },
        }));

      if (!enGrupo) {
        return NextResponse.json(
          { ok: false, error: "El local no pertenece al grupo activo" },
          { status: 403 }
        );
      }
    }

    // Setear cookie
    const payload = JSON.stringify({
      localId: local.id,
      esDeposito: local.es_deposito === true,
    });

    const response = NextResponse.json({
      ok: true,
      localId: local.id,
      nombre: local.nombre,
      esDeposito: local.es_deposito === true,
    });

    response.cookies.set(
      ContextoActivoCookie.nombre,
      payload,
      ContextoActivoCookie.opciones
    );

    return response;
  } catch (err) {
    console.error("Error contexto-activo/set:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

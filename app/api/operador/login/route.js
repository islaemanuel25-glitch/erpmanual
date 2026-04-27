import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { firmarTokenOperador, OperadorCookie } from "@/lib/operador";

export async function POST(req) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto === true },
        { status: scope.status }
      );
    }

    const body = await req.json();
    const { operadorId, pin } = body;

    if (!operadorId || !pin) {
      return NextResponse.json({ ok: false, error: "Seleccioná un operador e ingresá el PIN." }, { status: 400 });
    }

    const asignacion = await prisma.operadorEnLocal.findUnique({
      where: {
        operadorId_localId: { operadorId: Number(operadorId), localId: scope.localId },
      },
      include: { operador: true },
    });

    if (!asignacion || !asignacion.operador.activo) {
      return NextResponse.json({ ok: false, error: "Operador no disponible en este local." }, { status: 404 });
    }

    const pinValido = await bcrypt.compare(String(pin), asignacion.operador.pinHash);
    if (!pinValido) {
      return NextResponse.json({ ok: false, error: "PIN incorrecto." }, { status: 401 });
    }

    const token = firmarTokenOperador({
      operadorId: asignacion.operador.id,
      nombre: asignacion.operador.nombre,
      localId: scope.localId,
    });

    const res = NextResponse.json({
      ok: true,
      operador: { id: asignacion.operador.id, nombre: asignacion.operador.nombre },
    });

    res.cookies.set(OperadorCookie.nombre, token, OperadorCookie.opciones);
    return res;
  } catch (e) {
    console.error("operador/login:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

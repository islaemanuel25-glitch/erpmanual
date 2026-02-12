import { NextResponse } from "next/server";
import { getUsuarioSession, GrupoActivoCookie } from "@/lib/auth";

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    if (!session.esAdmin) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const grupoId = toNumber(body?.grupoId);

    if (grupoId == null || grupoId <= 0) {
      return NextResponse.json({ ok: false, error: "grupoId inválido" }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true, grupoId });
    res.cookies.set(GrupoActivoCookie.nombre, String(grupoId), GrupoActivoCookie.opciones);
    return res;
  } catch (e) {
    console.error("ERROR grupo-activo/set:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

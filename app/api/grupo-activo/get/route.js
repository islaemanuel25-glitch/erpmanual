import { NextResponse } from "next/server";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      esAdmin: !!session.esAdmin,
      grupoId: session.grupoId || null,
      grupoActivoId: session.grupoActivoId || null,
    });
  } catch (e) {
    console.error("ERROR grupo-activo/get:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

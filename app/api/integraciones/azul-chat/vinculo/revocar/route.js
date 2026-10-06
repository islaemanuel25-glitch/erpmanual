// POST /api/integraciones/azul-chat/vinculo/revocar
//
// Corta el vínculo de Azul Chat de un usuario. Desde la próxima consulta, Azul
// Chat no puede hablar en su nombre.
//
// Cuerpo: `{ "usuarioId": n }`, opcional. Sin él, revoca el de la propia sesión.
// Revocar el de OTRO usuario lo puede quien hoy lo puede dar de baja en el ERP —la
// regla de /api/usuarios/eliminar/[id]—. Ver lib/integraciones/vinculos/vinculos.js.
//
// Es idempotente: sin vínculo vigente responde ok con `revocado: false`.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { revocarVinculo } from "@/lib/integraciones/vinculos/vinculos";
import { APLICACION_INTEGRACION } from "@/lib/integraciones/vinculos/codigoVinculo";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session?.id) {
      return NextResponse.json({ ok: false, codigo: "SIN_SESION", error: "No autenticado." }, { status: 401 });
    }

    const texto = await req.text();
    let cuerpo = {};
    if (texto.trim()) {
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        return NextResponse.json({ ok: false, codigo: "PEDIDO_INVALIDO", error: "El cuerpo no es JSON." }, { status: 400 });
      }
    }
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo) || Object.keys(cuerpo).some((k) => k !== "usuarioId")) {
      return NextResponse.json({ ok: false, codigo: "PEDIDO_INVALIDO", error: "El cuerpo solo acepta usuarioId." }, { status: 400 });
    }
    const usuarioId = cuerpo.usuarioId === undefined ? Number(session.id) : cuerpo.usuarioId;

    const r = await revocarVinculo(prisma, { session, usuarioId, aplicacion: APLICACION_INTEGRACION.AZUL_CHAT });
    if (!r.ok) return NextResponse.json({ ok: false, codigo: r.codigo, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, revocado: r.revocado }, { status: 200 });
  } catch (e) {
    console.error("[azul-chat] revocar vínculo falló:", e?.message || e);
    return NextResponse.json(
      { ok: false, codigo: "ERROR_AL_REVOCAR", error: `No se pudo revocar Azul Chat: ${e?.message || "error desconocido"}.` },
      { status: 500 }
    );
  }
}

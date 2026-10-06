// POST /api/integraciones/azul-chat/vinculo/autorizar
//
// La persona con sesión en el ERP autoriza a Azul Chat a consultar EN SU NOMBRE.
// Devuelve el código de vínculo UNA sola vez: el ERP guarda su hash y no lo
// puede volver a mostrar. Volver a llamar revoca el vínculo anterior y entrega
// un código nuevo.
//
// Es una ruta del ERP, para una persona en su navegador. NO es la puerta de
// Azul Chat: ésa no tiene ruta todavía (DEC-0013).
//
// El usuario sale de la SESIÓN. El cuerpo no se lee: no hay forma de autorizar
// en nombre de otro. Ver lib/integraciones/vinculos/vinculos.js.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { autorizarVinculo } from "@/lib/integraciones/vinculos/vinculos";
import { APLICACION_INTEGRACION } from "@/lib/integraciones/vinculos/codigoVinculo";

// El código es un secreto: ningún intermediario puede guardar la respuesta.
const SIN_CACHE = { "Cache-Control": "no-store" };

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session?.id) {
      return NextResponse.json({ ok: false, codigo: "SIN_SESION", error: "No autenticado." }, { status: 401 });
    }

    const r = await autorizarVinculo(prisma, { usuarioId: Number(session.id), aplicacion: APLICACION_INTEGRACION.AZUL_CHAT });
    if (!r.ok) {
      return NextResponse.json({ ok: false, codigo: r.codigo, error: r.error }, { status: r.status, headers: SIN_CACHE });
    }
    return NextResponse.json(
      {
        ok: true,
        codigoVinculo: r.codigo,
        autorizadoEn: r.vinculo.autorizadoEn,
        aviso: "Copiá este código en Azul Chat ahora: el ERP no lo guarda y no lo puede volver a mostrar.",
      },
      { status: 200, headers: SIN_CACHE }
    );
  } catch (e) {
    // Se registra el motivo; nunca el código generado.
    console.error("[azul-chat] autorizar vínculo falló:", e?.message || e);
    return NextResponse.json(
      { ok: false, codigo: "ERROR_AL_AUTORIZAR", error: `No se pudo autorizar Azul Chat: ${e?.message || "error desconocido"}.` },
      { status: 500, headers: SIN_CACHE }
    );
  }
}

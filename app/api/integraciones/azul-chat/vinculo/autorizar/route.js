// POST /api/integraciones/azul-chat/vinculo/autorizar
//
// La persona con sesión en el ERP autoriza a Azul Chat a consultar EN SU NOMBRE.
// Devuelve el CÓDIGO DE CANJE una sola vez: el ERP guarda su hash y no lo puede
// volver a mostrar. Vale 10 minutos y un canje (`/vinculo/canjear`, de
// servidor a servidor); no sirve para consultar. Volver a llamar revoca el
// vínculo anterior —y la delegación que se hubiera canjeado con él— y entrega
// un código nuevo.
//
// Es una ruta del ERP, para una persona en su navegador. NO es una puerta de
// Azul Chat: ésas son `consultar` y `canjear` (DEC-0013).
//
// El usuario sale de la SESIÓN. El cuerpo no se lee: no hay forma de autorizar
// en nombre de otro. Ver lib/integraciones/vinculos/vinculos.js.
//
// La cookie de sesión del ERP es SameSite=Lax (lib/auth.js), así que un POST
// desde otro sitio no la lleva y no puede revocar el vínculo vigente de nadie.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { autorizarVinculo } from "@/lib/integraciones/vinculos/vinculos";
import { APLICACION_INTEGRACION, vencimientoDelCodigo } from "@/lib/integraciones/vinculos/codigoVinculo";

// El código es un secreto: ningún intermediario puede guardar la respuesta.
const SIN_CACHE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

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
        codigoCanje: r.codigo,
        autorizadoEn: r.vinculo.autorizadoEn,
        venceEn: vencimientoDelCodigo(r.vinculo.autorizadoEn),
        aviso: "Pegá este código en Azul Chat ahora: vence en 10 minutos, sirve una sola vez, y el ERP no lo puede volver a mostrar.",
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

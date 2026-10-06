// POST /api/integraciones/azul-chat/vinculo/canjear
//
// EL CANJE, DE SERVIDOR A SERVIDOR. El backend de Azul Chat manda el código que
// la persona copió del ERP y recibe, una sola vez, un token de delegación. Ver
// lib/integraciones/vinculos/canje.js y DEC-0013.
//
// Mismas reglas de borde que `consultar`: `application/json`, hasta
// MAX_BYTES_CUERPO bytes leídos como BYTES, firma HMAC verificada sobre esos
// bytes, JSON canónico, sin cookies, sin CORS, sin caché. La respuesta de éxito
// trae un token: `no-store` es obligatorio, no cortesía.
//
// El registro no lleva el código, ni el token, ni sus hashes, ni el cuerpo.
//
// Solo se exporta POST: cualquier otro método lo contesta Next con 405.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MAX_BYTES_CUERPO } from "@/lib/integraciones/azul-chat/atender";
import { esTipoJson, leerCuerpoAcotado } from "@/lib/integraciones/azul-chat/cuerpoHttp";
import { aRespuestaPublica, rechazoPublico } from "@/lib/integraciones/azul-chat/respuestaPublica";
import { atenderCanje, crearLimitadorCanje } from "@/lib/integraciones/vinculos/canje";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Uno por proceso, como el de la consulta. */
const limitadorCanje = crearLimitadorCanje();

const responder = ({ status, cuerpo, cabeceras }) => NextResponse.json(cuerpo, { status, headers: cabeceras });

export async function POST(req) {
  try {
    if (!esTipoJson(req.headers.get("content-type"))) {
      return responder(rechazoPublico("TIPO_DE_CONTENIDO_INVALIDO"));
    }
    const leido = await leerCuerpoAcotado(req, MAX_BYTES_CUERPO);
    if (!leido.ok) {
      return responder(rechazoPublico(leido.motivo === "DEMASIADO_GRANDE" ? "CUERPO_DEMASIADO_GRANDE" : "SOLICITUD_INVALIDA"));
    }

    const resultado = await atenderCanje({ headers: req.headers, cuerpo: leido.bytes }, { db: prisma, limitador: limitadorCanje });
    const publica = aRespuestaPublica(resultado);
    if (publica.status !== 200) {
      const motivoInterno = resultado?.cuerpo?.error ?? "?";
      const detalle = publica.referencia ? ` ref=${publica.referencia} motivo=${motivoInterno}` : "";
      console.warn(`[azul-chat] canjear ${publica.status} ${publica.cuerpo.codigo} (${publica.interno ?? "sin código"})${detalle}`);
    }
    return responder(publica);
  } catch (e) {
    // Solo el tipo y el código del error, no su mensaje: un error de validación
    // de Prisma imprime los argumentos de la llamada, y acá esos argumentos
    // incluyen el hash del token.
    const referencia = crypto.randomUUID();
    console.error(`[azul-chat] canjear falló ref=${referencia}: ${e?.name ?? "Error"} ${e?.code ?? ""}`.trim());
    return responder(rechazoPublico("ERROR_AL_CALCULAR", { referencia }));
  }
}

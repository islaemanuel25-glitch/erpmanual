// POST /api/integraciones/azul-chat/consultar
//
// LA ÚNICA RUTA DE SERVIDOR A SERVIDOR DE AZUL CHAT. Ver DEC-0013.
//
// No es una API para navegadores: no lee cookies ni `Authorization`, no
// contesta CORS y no deja nada en caché. Lo único que hace es:
//
//   1. exigir `application/json` y un cuerpo de hasta MAX_BYTES_CUERPO bytes;
//   2. leer ese cuerpo como BYTES, sin parsearlo ni decodificarlo;
//   3. pasárselo a la puerta (`atenderSolicitudAzulChat`), que verifica la
//      firma HMAC sobre esos mismos bytes ANTES de leerlos, y recién después
//      decodifica, exige JSON canónico, mira el catálogo, el cupo, el vínculo,
//      el usuario, sus permisos y su alcance, y ejecuta la capacidad;
//   4. traducir el resultado a la respuesta pública (`respuestaPublica.js`).
//
// SOLO LECTURA: ni esta ruta ni la puerta escriben en la base. No hay "último
// uso" del vínculo, ni auditoría en tabla, ni eventos. El registro es el log
// del proceso, y no lleva cuerpo, firma, secreto ni código de vínculo.
//
// Solo se exporta POST: cualquier otro método lo contesta Next con 405.

import { NextResponse } from "next/server";
import { atenderSolicitudAzulChat } from "@/lib/integraciones/azul-chat/servidor";
import { MAX_BYTES_CUERPO } from "@/lib/integraciones/azul-chat/atender";
import { esTipoJson, leerCuerpoAcotado } from "@/lib/integraciones/azul-chat/cuerpoHttp";
import { aRespuestaPublica, rechazoPublico } from "@/lib/integraciones/azul-chat/respuestaPublica";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    const resultado = await atenderSolicitudAzulChat({ headers: req.headers, cuerpo: leido.bytes });
    const publica = aRespuestaPublica(resultado);
    if (publica.status !== 200) {
      // El código interno queda en el log; afuera sale el público. Sin cuerpo,
      // sin firma, sin secreto, sin código de vínculo.
      // El motivo interno solo se escribe en un error nuestro (500), que es
      // cuando hace falta para leer el log con la referencia que recibió Azul Chat.
      const motivoInterno = resultado?.cuerpo?.error ?? "?";
      const detalle = publica.referencia ? ` ref=${publica.referencia} motivo=${motivoInterno}` : "";
      const codigoPublico = publica.cuerpo.codigo;
      console.warn(`[azul-chat] consultar ${publica.status} ${codigoPublico} (${publica.interno ?? "sin código"})${detalle}`);
    }
    return responder(publica);
  } catch (e) {
    const referencia = crypto.randomUUID();
    console.error(`[azul-chat] consultar falló ref=${referencia}:`, e?.message || e);
    return responder(rechazoPublico("ERROR_AL_CALCULAR", { referencia }));
  }
}

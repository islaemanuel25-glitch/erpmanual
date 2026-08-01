// app/api/version/route.js
//
// Identidad del despliegue que está sirviendo ESTE proceso. La usa el guard de
// versión del cliente para detectar que su bundle quedó viejo después de un
// deploy (ver lib/version/compararBuild.js).
//
// Devuelve SOLO el buildId: nada de versiones de Node, rutas, entorno ni
// hostname. Es un endpoint público sin autenticación —tiene que responder
// aunque la sesión haya expirado—, así que no puede filtrar nada del servidor.
//
// No consulta la base: el valor sale de una variable de entorno ya cargada.
import { NextResponse } from "next/server";

// Sin esto Next lo trataría como ruta estática y devolvería el valor congelado
// del build, que es justo lo contrario de lo que hace falta.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.APP_BUILD_ID ?? "" },
    {
      headers: {
        // El guard se apoya en que esta respuesta NUNCA venga de una caché
        // intermedia: nginx, Cloudflare o el propio navegador.
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

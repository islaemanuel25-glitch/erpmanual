import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { ejecutarBarrido } from "@/lib/ofertas/barrido";

// BARRIDO: comparar los costos de referencia contra los de hoy, marcar lo que
// cambió y avisar.
//
// ── ESTA RUTA YA NO ES EL ÚNICO DISPARADOR ─────────────────────────────────
//
// El cuerpo del barrido se mudó a `lib/ofertas/barrido.js` porque hoy hay tres
// caminos que lo necesitan, y un `route.js` de Next no puede exportar otra cosa
// que sus handlers:
//
//   · esta ruta, que la llama la pantalla de Ofertas al abrirse;
//   · el disparo POR EVENTO, cuando una escritura cambia un costo de verdad
//     (`lib/ofertas/disparadorCosto.js`);
//   · la apertura del POS, para el aviso de vencimiento (`/api/recargos-pago`).
//
// Los tres corren EXACTAMENTE el mismo código. Tres copias de la regla que
// decide cuándo una oferta pide revisión no se rompen el día que se escriben:
// se rompen el día que una cambia.
//
// ── ESCRIBE, PERO NO DECIDE NADA DE NEGOCIO ────────────────────────────────
//
// Marca y desmarca líneas, y crea notificaciones. No toca un solo precio. Por
// eso pide `ofertas.ver` y no `ofertas.editar`: quien puede mirar las ofertas
// puede disparar la comparación, porque lo único que produce es información.
//
// ── POR QUÉ SIGUE PIDIENDO PERMISO SI EL POS LA DISPARA SIN ÉL ─────────────
//
// Porque son dos cosas distintas. Esta ruta la llama una PERSONA desde la
// pantalla de Ofertas y le devuelve el resultado, así que pide el permiso de
// verlas. El disparo del POS no pasa por acá: corre server-side después de
// responder, no devuelve nada a nadie, y las notificaciones que produce llevan
// `permisoRequerido: "ofertas.ver"`. Un cajero puede provocarlo y no ve nada.

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "ofertas.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // `forzar`: la persona abrió la pantalla y espera el resultado de AHORA. El
    // acelerador existe para el disparo automático del POS, no para negarle a
    // alguien la respuesta que vino a buscar.
    const resultado = await ejecutarBarrido(prisma, {
      grupoId,
      localIds: [localId],
      forzar: true,
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("Error en el barrido de ofertas:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo revisar el estado de las ofertas: ${err.message}` },
      { status: 500 }
    );
  }
}

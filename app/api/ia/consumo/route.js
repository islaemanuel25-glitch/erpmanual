// GET /api/ia/consumo
//
// Cuántas consultas de IA se usaron hoy y cuántas quedan. NO consume ninguna:
// solo cuenta filas.
//
// Vive en `app/api/ia/` y no adentro de compras a propósito: el contador es
// COMPARTIDO —importador, comprobantes y lo que venga— y ponerlo dentro de un
// módulo haría que el siguiente que lo necesite escriba el suyo.

import { NextResponse } from "next/server";

import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { estadoDeConsumo } from "@/lib/ia/contadorDeIa";
import { desdeCuandoSeCuenta } from "@/lib/ia/limiteDiario";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    // ── EL PERMISO ES `compras.ver`, Y NO ES UN TRÁMITE ────────────────
    //
    // La primera versión pedía solo sesión, con el argumento de que el contador
    // es compartido y atarlo a un módulo sería raro. El candado del censo la
    // frenó, y tenía razón: los DOS consumidores de hoy —el importador de
    // pedidos y el lector de comprobantes— viven en compras, así que
    // `compras.ver` no es un permiso ajeno para ninguno.
    //
    // El día que la IA se use desde otro módulo, esto se mira de nuevo. Lo que
    // no se hace es inventar un permiso nuevo ni pedir una excepción para no
    // tener que elegir.
    const perm = checkPerm(ctx.session, "compras.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const estado = await estadoDeConsumo();
    const { huso } = desdeCuandoSeCuenta();
    return NextResponse.json({
      ok: true,
      usadas: estado.usadas,
      limite: estado.limite,
      quedan: estado.quedan,
      puede: estado.puede,
      // Se informa el huso porque la cuota repone en la medianoche del
      // proveedor y no en la nuestra. Sin decirlo, un contador que no coincide
      // con la intuición parece roto.
      huso,
    });
  } catch (error) {
    console.error("[ia] consumo:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer el consumo de IA. Se puede seguir trabajando." },
      { status: 500 }
    );
  }
}

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
import { estadoDeConsumo } from "@/lib/ia/contadorDeIa";
import { desdeCuandoSeCuenta } from "@/lib/ia/limiteDiario";

export async function GET(req) {
  try {
    // Pide sesión pero NO un permiso de compras: el número lo mira cualquiera
    // que pueda usar la IA desde cualquier módulo, y atarlo a `compras.crear`
    // haría que el lector de comprobantes tenga que pedir un permiso ajeno.
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

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

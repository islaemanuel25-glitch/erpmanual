// app/api/combos/[productoLocalId]/disponibilidad/route.js
//
// GET /api/combos/[productoLocalId]/disponibilidad?localId=...
// Devuelve la disponibilidad del combo (componente limitante) usando el stock del
// local activo, más el flag allowNegativeStock del grupo. NO descuenta stock.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { getDisponibilidad } from "@/lib/combos/service";
import { mensajeErrorCombo } from "@/lib/combos/errores";

export async function GET(req, context) {
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) {
    return NextResponse.json(
      { ok: false, error: scope.error, needsContexto: scope.needsContexto },
      { status: scope.status }
    );
  }
  const { grupoId, localId, session } = scope;

  const perm = checkPerm(session, "productos.ver");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  try {
    const { productoLocalId } = await context.params;
    const disp = await getDisponibilidad({ prisma, grupoId, localId, productoLocalId });
    return NextResponse.json({ ok: true, ...disp });
  } catch (e) {
    const { status, mensaje } = mensajeErrorCombo(e, { accion: "calcular la disponibilidad" });
    if (status >= 500) console.error("🔥 combos disponibilidad:", e);
    return NextResponse.json({ ok: false, error: mensaje }, { status });
  }
}

// POST /api/caja/correcciones/aplicar   { codigo, confirmacion }
//
// APLICA una corrección histórica de caja AUTORIZADA. `confirmacion` tiene que
// repetir el código: es la confirmación explícita de quien la ejecuta. El motor
// exige que la huella del plan de hoy sea exactamente la autorizada; si algo
// cambió desde el ensayo, no aplica nada.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { PERMISO_CORREGIR_HISTORICO, ESTADO_MANIFIESTO } from "@/lib/caja/correcciones/plan";
import { MANIFIESTOS, buscarManifiesto } from "@/lib/caja/correcciones/manifiestos";
import { ejecutarCorreccion, RESULTADO } from "@/lib/caja/correcciones/motor";

export async function POST(req) {
  const perm = requirePerm(req, PERMISO_CORREGIR_HISTORICO);
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({}));
  const codigo = String(body?.codigo ?? "");
  const manifiesto = buscarManifiesto(codigo, MANIFIESTOS);
  if (!manifiesto) {
    return NextResponse.json({ ok: false, error: "No hay ningún manifiesto con ese código." }, { status: 404 });
  }
  if (manifiesto.estado !== ESTADO_MANIFIESTO.AUTORIZADO) {
    return NextResponse.json({ ok: false, error: "Un manifiesto PROPUESTO solo se puede ensayar." }, { status: 409 });
  }
  if (String(body?.confirmacion ?? "").trim() !== codigo) {
    return NextResponse.json(
      { ok: false, error: `Para aplicar, escribí el código ${codigo} como confirmación.` },
      { status: 400 }
    );
  }

  const informe = await ejecutarCorreccion(prisma, manifiesto, { modo: "aplicar", usuarioId: perm.session.id });
  const ok = informe.resultado === RESULTADO.APLICADA || informe.resultado === RESULTADO.YA_APLICADA;
  return NextResponse.json({ ok, informe }, { status: ok ? 200 : 409 });
}

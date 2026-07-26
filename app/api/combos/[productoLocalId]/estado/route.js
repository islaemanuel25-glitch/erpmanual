// app/api/combos/[productoLocalId]/estado/route.js
//
// PATCH /api/combos/[productoLocalId]/estado?localId=...
// Body: { activo: boolean }
//
// Acción RÁPIDA de activar/desactivar un combo (identidad = ProductoLocal.id).
// Cambia SOLO ProductoLocal.activo — NUNCA ProductoBase.activo, ni composición, ni
// stock, ni historial. Reglas de negocio en lib/combos/service.cambiarEstadoCombo:
//   · Desactivar: siempre permitido (aunque la composición sea inválida).
//   · Reactivar: exige composición estructuralmente válida (si no → 409 con motivo).
//
// Validaciones: contexto + permisos; el combo pertenece al local activo; base.es_combo;
// no se puede operar desde otro local (resolverComboPL lo garantiza).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { cambiarEstadoCombo } from "@/lib/combos/service";
import { mensajeErrorCombo } from "@/lib/combos/errores";

export async function PATCH(req, context) {
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) {
    return NextResponse.json(
      { ok: false, error: scope.error, needsContexto: scope.needsContexto },
      { status: scope.status }
    );
  }
  const { grupoId, localId, session } = scope;

  const perm = checkPerm(session, "productos.editar");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  try {
    const { productoLocalId } = await context.params;
    const body = await req.json().catch(() => ({}));
    if (typeof body?.activo !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "El campo 'activo' es obligatorio (booleano)." },
        { status: 400 }
      );
    }
    const combo = await cambiarEstadoCombo({ prisma, grupoId, localId, productoLocalId, activo: body.activo });
    return NextResponse.json({ ok: true, combo });
  } catch (e) {
    const { status, mensaje } = mensajeErrorCombo(e, { accion: "cambiar el estado del combo" });
    if (status >= 500) console.error("🔥 combos/estado:", e);
    return NextResponse.json({ ok: false, error: mensaje }, { status });
  }
}

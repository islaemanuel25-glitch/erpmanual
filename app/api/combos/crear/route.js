// app/api/combos/crear/route.js
//
// POST /api/combos/crear?localId=...
// Crea un combo EXCLUSIVO del local activo (incluye depósito). El combo es un
// ProductoBase(es_combo=true) con UN ProductoLocal y SIN StockLocal. No se
// replica ni se muestra en otros locales. Toda la lógica está en lib/combos/service.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { crearCombo } from "@/lib/combos/service";
import { mensajeErrorCombo } from "@/lib/combos/errores";

export async function POST(req) {
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) {
    return NextResponse.json(
      { ok: false, error: scope.error, needsContexto: scope.needsContexto },
      { status: scope.status }
    );
  }
  const { grupoId, localId, session } = scope;

  const perm = checkPerm(session, "productos.crear");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  try {
    const body = await req.json();
    const combo = await crearCombo({ prisma, grupoId, localId, data: body });
    return NextResponse.json({ ok: true, combo });
  } catch (e) {
    const { status, mensaje } = mensajeErrorCombo(e, { accion: "crear el combo" });
    if (status >= 500) console.error("🔥 combos/crear:", e);
    return NextResponse.json({ ok: false, error: mensaje }, { status });
  }
}

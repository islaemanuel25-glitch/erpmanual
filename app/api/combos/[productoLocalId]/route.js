// app/api/combos/[productoLocalId]/route.js
//
// Identidad del combo = ProductoLocal.id (combo exacto y exclusivo de una ubicación).
//   GET /api/combos/[productoLocalId]?localId=...  → detalle + costo + disponibilidad
//   PUT /api/combos/[productoLocalId]?localId=...  → editar identidad + composición
//
// Ambos validan que el ProductoLocal exista, pertenezca al local activo, su
// ProductoBase sea combo y haya sido creado en esa ubicación (lib/combos/service).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { getCombo, editarCombo } from "@/lib/combos/service";
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
    const combo = await getCombo({ prisma, grupoId, localId, productoLocalId });
    return NextResponse.json({ ok: true, combo });
  } catch (e) {
    const { status, mensaje } = mensajeErrorCombo(e, { accion: "cargar el combo" });
    if (status >= 500) console.error("🔥 combos GET:", e);
    return NextResponse.json({ ok: false, error: mensaje }, { status });
  }
}

export async function PUT(req, context) {
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
    const body = await req.json();
    const combo = await editarCombo({ prisma, grupoId, localId, productoLocalId, data: body });
    return NextResponse.json({ ok: true, combo });
  } catch (e) {
    const { status, mensaje } = mensajeErrorCombo(e, { accion: "guardar el combo" });
    if (status >= 500) console.error("🔥 combos PUT:", e);
    return NextResponse.json({ ok: false, error: mensaje }, { status });
  }
}

// POST /api/caja/correcciones/ensayo   { codigo }
//
// ENSAYO EN SECO de una corrección histórica de caja. Corre el mismo motor que la
// aplicación —hasta los UPDATE y la relectura— y deshace todo al final. Nunca
// deja registro, bitácora ni cambios. Sirve para PROPUESTO y para AUTORIZADO.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { PERMISO_CORREGIR_HISTORICO } from "@/lib/caja/correcciones/plan";
import { MANIFIESTOS, buscarManifiesto } from "@/lib/caja/correcciones/manifiestos";
import { ejecutarCorreccion } from "@/lib/caja/correcciones/motor";

export async function POST(req) {
  const perm = requirePerm(req, PERMISO_CORREGIR_HISTORICO);
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({}));
  const manifiesto = buscarManifiesto(String(body?.codigo ?? ""), MANIFIESTOS);
  if (!manifiesto) {
    return NextResponse.json({ ok: false, error: "No hay ningún manifiesto con ese código." }, { status: 404 });
  }

  const informe = await ejecutarCorreccion(prisma, manifiesto, { modo: "ensayo", usuarioId: perm.session.id });
  return NextResponse.json({ ok: informe.errores.length === 0, informe });
}

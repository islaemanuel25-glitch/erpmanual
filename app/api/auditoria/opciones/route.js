import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

// Valores para los dropdowns de filtro de la bitácora. Mismo guard que listar.
export async function GET(req) {
  try {
    const perm = requirePerm(req, "auditoria.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const [acciones, entidades, locales, operadores, usuarios] = await Promise.all([
      prisma.auditoriaBitacora.findMany({ distinct: ["accion"], select: { accion: true }, orderBy: { accion: "asc" } }),
      prisma.auditoriaBitacora.findMany({ distinct: ["entidad"], select: { entidad: true }, orderBy: { entidad: "asc" } }),
      prisma.local.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.operadorLocal.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.usuario.findMany({ select: { id: true, nombre: true, email: true }, orderBy: { id: "asc" } }),
    ]);

    return NextResponse.json({
      ok: true,
      acciones: acciones.map((a) => a.accion),
      entidades: entidades.map((e) => e.entidad),
      locales,
      operadores,
      usuarios: usuarios.map((u) => ({ id: u.id, nombre: u.nombre || u.email || `#${u.id}` })),
    });
  } catch (e) {
    console.error("auditoria/opciones:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

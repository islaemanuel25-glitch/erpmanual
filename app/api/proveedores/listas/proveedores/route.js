// GET /api/proveedores/listas/proveedores
//
// Los proveedores del alcance activo, con el único dato extra que esta pantalla
// necesita: si tienen configurado el formato de su lista de precios.
//
// ── POR QUÉ NO SE REUTILIZA /api/proveedores/listar ─────────────────────────
//
// Ese endpoint existe y hace bien lo suyo, pero no devuelve `parserListaId` y lo
// usan varias pantallas. Agregárselo obligaría a tocar un endpoint compartido
// para una necesidad de una sola pantalla. Este es mínimo —tres campos, sin
// paginación, sin filtros, solo lectura— y no amplía nada: no crea, no edita y
// no borra.
//
// El alcance sale de `proveedorVisibleWhere`, la misma regla canónica que usa la
// importación. Que las dos usen el mismo predicado es lo que evita que la
// pantalla ofrezca un proveedor que después el endpoint rechaza con 404.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { proveedorVisibleWhere } from "@/lib/visibilidad";
import { listarParsers } from "@/lib/proveedores/listas/registro";

export async function GET(req) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId } = scope;

    const items = await prisma.proveedor.findMany({
      where: { activo: true, ...proveedorVisibleWhere(localId, grupoId) },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, parserListaId: true },
    });

    return NextResponse.json({
      ok: true,
      // Se devuelven TODOS los visibles, incluidos los que no admiten
      // importación. Esconderlos dejaría al usuario buscando un proveedor que
      // está ahí; mostrarlos con el motivo le dice qué le falta configurar.
      items: items.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        parserListaId: p.parserListaId,
        admiteImportacion: !!p.parserListaId,
      })),
      // Los formatos disponibles, por si la pantalla quiere explicar cuáles hay.
      parsers: listarParsers(),
    });
  } catch (error) {
    console.error("Error listando proveedores para listas:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

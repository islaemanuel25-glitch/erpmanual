import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorVisibleWhere } from "@/lib/visibilidad";

// El permiso sale del módulo, no se inventa uno nuevo: la pantalla
// `/modulos/proveedores` pide `proveedores.ver`, y `ProveedoresDeHoyAlert` —el
// otro consumidor, que vive en la portada— ya se muestra a sí mismo con
// `compras.ver` O `proveedores.ver`. Es el mismo par.
const PERMISO_VER_PROVEEDORES = ["compras.ver", "proveedores.ver"];

export async function GET(req) {
  try {
    // ANTES ESTA RUTA SOLO PEDÍA SESIÓN. Un CAJERO con cuatro permisos de
    // clientes recibía la lista entera con nombres y teléfonos (INC-0007).
    const auth = requirePerm(req, PERMISO_VER_PROVEEDORES);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "activos";
    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 20);

    // Regla B: visibilidad por local activo. Admin sin contexto → todos.
    const scope = await resolveLocalAndGrupo(req);
    const visFilter = scope.error ? [] : [proveedorVisibleWhere(scope.localId, scope.grupoId)];

    const where = {
      AND: [
        estado === "activos" ? { activo: true } : {},
        search
          ? {
              OR: [
                { nombre: { contains: search, mode: "insensitive" } },
                { cuit: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { direccion: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        ...visFilter,
      ],
    };

    const total = await prisma.proveedor.count({ where });

    const items = await prisma.proveedor.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        cuit: true,
        telefono: true,
        email: true,
        direccion: true,
        dias_pedido: true,   // 🔥 NECESARIO
        activo: true,
      },
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      page,
      pageSize,
    });
  } catch (e) {
    console.error("Error LISTAR PROVEEDORES:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

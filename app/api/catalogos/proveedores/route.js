import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorVisibleWhere } from "@/lib/visibilidad";

// ES UN CATÁLOGO COMPARTIDO y por eso la lista es larga: lo piden la ficha de
// producto, el listado de productos, la edición rápida, reportes de stock y los
// filtros de stock. Cada una de esas pantallas se cierra con `productos.ver` o
// `stock.ver`, y el dato en sí es del módulo de proveedores.
//
// Van los cuatro con "alcanza con uno" —que es para lo que `requirePerm` acepta
// un array— en vez de elegir uno y romper tres pantallas. Ver quién la llama en
// `docs/incidents/INC-0007`.
const PERMISO_CATALOGO_PROVEEDORES = [
  "productos.ver",
  "stock.ver",
  "compras.ver",
  "proveedores.ver",
];

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_CATALOGO_PROVEEDORES);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, items: [], error: auth.error }, { status: auth.status });
    }

    // Regla B: el proveedor se ve donde se crearon los productos que lo usan
    // (fallback: quien lo creó, si aún no tiene productos). Admin sin contexto
    // activo → catálogo completo.
    const scope = await resolveLocalAndGrupo(req);
    const where = scope.error ? {} : proveedorVisibleWhere(scope.localId, scope.grupoId);

    const proveedores = await prisma.proveedor.findMany({
      where,
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, items: proveedores });
  } catch (err) {
    console.error("❌ Error PROVEEDORES:", err);
    return NextResponse.json(
      { ok: false, items: [], error: "Error al cargar proveedores" },
      { status: 500 }
    );
  }
}

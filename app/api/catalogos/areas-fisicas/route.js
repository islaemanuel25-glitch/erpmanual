import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

// La piden las pantallas de producto y las de stock, que se cierran con
// `productos.ver` y `stock.ver`. Es el mismo criterio que `catalogos/categorias`,
// que reexporta el GET de `categorias/listar` y por eso ya contestaba
// "Sin permiso: productos.ver".
const PERMISO_CATALOGO_AREAS = ["productos.ver", "stock.ver"];

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_CATALOGO_AREAS);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, items: [], error: auth.error }, { status: auth.status });
    }

    const areas = await prisma.areaFisica.findMany({
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, items: areas });
  } catch (err) {
    console.error("❌ Error AREAS FISICAS:", err);
    return NextResponse.json(
      { ok: false, items: [], error: "Error al cargar áreas físicas" },
      { status: 500 }
    );
  }
}

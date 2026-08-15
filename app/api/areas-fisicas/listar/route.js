import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

// Mismo par que `catalogos/areas-fisicas`, que devuelve lo mismo. Se le pone el
// permiso del catálogo y no `requireAdmin` —que es lo que usa su hermana
// `areas-fisicas/crear`— porque LEER un área no es lo mismo que crearla, y esta
// ruta no tiene hoy ningún consumidor en el repo: elegir el permiso más estrecho
// solo porque nadie la llama sería fijar un contrato por accidente.
const PERMISO_CATALOGO_AREAS = ["productos.ver", "stock.ver"];

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_CATALOGO_AREAS);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const items = await prisma.areaFisica.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({
      ok: true,
      items,
      error: null,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      items: [],
      error: err.message,
    });
  }
}

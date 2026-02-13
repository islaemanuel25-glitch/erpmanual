import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const localId =
      session.localId ||
      Number(req.nextUrl.searchParams.get("localId"));

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    // Top 10 productos mas vendidos en ultimos 30 dias
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    const favoritos = await prisma.$queryRaw`
      SELECT
        pb.id,
        pb.nombre,
        pb.codigo_barra,
        pl.precio_venta,
        SUM(vd.cantidad) as total_vendido
      FROM "VentaDetalle" vd
      INNER JOIN "Venta" v ON vd."ventaId" = v.id
      INNER JOIN "ProductoBase" pb ON vd."productoBaseId" = pb.id
      LEFT JOIN "ProductoLocal" pl ON pb.id = pl."baseId" AND pl."localId" = ${localId}
      WHERE v."localId" = ${localId}
        AND v.fecha >= ${hace30Dias}
      GROUP BY pb.id, pb.nombre, pb.codigo_barra, pl.precio_venta
      ORDER BY total_vendido DESC
      LIMIT 10
    `;

    // Convertir BigInt a Number para evitar error de serialización
    const items = (favoritos || []).map((f) => ({
      ...f,
      id: Number(f.id),
      total_vendido: Number(f.total_vendido),
      precio_venta: f.precio_venta ? Number(f.precio_venta) : null,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("Error obteniendo favoritos:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

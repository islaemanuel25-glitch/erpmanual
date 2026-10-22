// app/api/pedidos/historial/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { alcanceDelHistorial, pedidosDelHistorial, ESTADOS_DEL_HISTORIAL } from "@/lib/pedidos/alcanceDelHistorial";

export async function GET(req) {
  try {
    // Sesión, `pedidos.ver`, local y no depósito, y el depósito del grupo. Lo
    // comparte con el detalle de un pedido (`./[id]/route.js`).
    const alcance = await alcanceDelHistorial(req);
    if (alcance.respuesta) return alcance.respuesta;

    // Query params
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || 20)));
    const estado = searchParams.get("estado") || "";
    const q = (searchParams.get("q") || "").trim();

    // Filtro base. Los cancelados entran desde el 2026-10-22 (ver
    // `ESTADOS_DEL_HISTORIAL`): esta lectura no pasa por `sinCancelados`.
    const estadosValidos = ESTADOS_DEL_HISTORIAL;
    const where = {
      ...pedidosDelHistorial(alcance),
      estado: estado && estadosValidos.includes(estado)
        ? estado
        : { in: estadosValidos },
    };

    // Búsqueda por nombre/código/sku dentro de items
    if (q) {
      where.detalles = {
        some: {
          OR: [
            { producto: { nombre: { contains: q, mode: "insensitive" } } },
            { producto: { base: { nombre: { contains: q, mode: "insensitive" } } } },
            { producto: { base: { codigo_barra: { contains: q, mode: "insensitive" } } } },
            { producto: { base: { sku: { contains: q, mode: "insensitive" } } } },
          ],
        },
      };
    }

    // Consultas en paralelo: datos + total
    const [rows, total] = await Promise.all([
      prisma.posTransferencia.findMany({
        where,
        include: {
          detalles: {
            include: {
              producto: {
                include: {
                  base: {
                    select: {
                      nombre: true,
                      codigo_barra: true,
                      factor_pack: true,
                    },
                  },
                },
              },
            },
          },
          transferencias: {
            select: {
              id: true,
              estado: true,
              fechaEnvio: true,
              fechaRecepcion: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: [
          { solicitadoAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.posTransferencia.count({ where }),
    ]);

    const items = rows.map((pos) => {
      let totalBultos = 0;
      let totalUnidades = 0;

      const detallesAll = pos.detalles.map((d) => {
        const nombre = d.producto?.nombre || d.producto?.base?.nombre || "";
        const sugerido = Number(d.sugerido || 0);
        const unidadSugerida = d.unidadSugerida || "BULTO";
        const factorPack = Number(d.producto?.base?.factor_pack || 1);

        if (unidadSugerida === "BULTO") {
          totalBultos += sugerido;
        } else {
          totalUnidades += sugerido;
        }

        return { nombre, sugerido, unidadSugerida, factorPack };
      });

      const trans = pos.transferencias?.[0] || null;

      return {
        posId: pos.id,
        estado: pos.estado,
        solicitadoAt: pos.solicitadoAt,
        createdAt: pos.createdAt,
        itemCount: pos.detalles.length,
        totalBultos,
        totalUnidades,
        resumen: detallesAll.slice(0, 5),
        transferenciaId: trans?.id || null,
        transferenciaEstado: trans?.estado || null,
        transferenciaFechaEnvio: trans?.fechaEnvio || null,
        transferenciaFechaRecepcion: trans?.fechaRecepcion || null,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  } catch (err) {
    console.error("Error pedidos/historial:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

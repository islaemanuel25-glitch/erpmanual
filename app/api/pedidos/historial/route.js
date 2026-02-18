// app/api/pedidos/historial/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getGrupoIdDeLocal } from "@/lib/grupos";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const permisos = Array.isArray(session.permisos) ? session.permisos : [];
    if (!permisos.includes("*") && !permisos.includes("pedidos.ver")) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso para ver pedidos" },
        { status: 403 }
      );
    }

    const localId = Number(session.localId);
    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "Usuario sin local asignado" },
        { status: 400 }
      );
    }

    const localUser = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (localUser?.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "Solo locales pueden ver historial de pedidos" },
        { status: 403 }
      );
    }

    // Resolver depósito del grupo
    const grupoId = await getGrupoIdDeLocal(localId);
    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "El local no pertenece a ningún grupo" },
        { status: 400 }
      );
    }

    const grupoDeposito = await prisma.grupoDeposito.findFirst({
      where: { grupoId },
      select: { localId: true },
    });

    if (!grupoDeposito) {
      return NextResponse.json(
        { ok: false, error: "No se encontró un depósito para el grupo" },
        { status: 400 }
      );
    }

    const depositoId = grupoDeposito.localId;

    // Query params
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || 20)));
    const estado = searchParams.get("estado") || "";
    const q = (searchParams.get("q") || "").trim();

    // Filtro base
    const estadosValidos = ["Solicitado", "Preparando", "Enviado"];
    const where = {
      destinoId: localId,
      origenId: depositoId,
      origenManual: true,
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

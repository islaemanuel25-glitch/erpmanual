// app/api/categorias/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          items: [],
          total: 0,
          totalPages: 1,
          tieneSinCategoria: false,
          error: "No autenticado",
        },
        { status: 401 }
      );
    }

    // Las categorías son parte del catálogo de productos.
    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, tieneSinCategoria: false, error: perm.error },
        { status: perm.status }
      );
    }

    const { searchParams } = new URL(req.url);

    const rawPage = Number(searchParams.get("page") || 1);
    const rawPageSize = Number(searchParams.get("pageSize") || 20);
    const estado = (searchParams.get("estado") || "todos").toLowerCase();
    const search = (searchParams.get("search") || "").trim();

    const destinoId = Number(searchParams.get("destinoId") || 0);
    const posId = Number(searchParams.get("posId") || 0);

    const page = rawPage > 0 ? rawPage : 1;
    const pageSize =
      rawPageSize > 0 && rawPageSize <= 200 ? rawPageSize : 20;

    const where = {};

    if (estado === "activas") where.activo = true;
    if (estado === "inactivas") where.activo = false;

    if (search) {
      where.nombre = {
        contains: search,
        mode: "insensitive",
      };
    }

    let categoriaIdsFiltradas = null;
    let haySinCategoria = false;

    if (posId) {
      const detallesPOS = await prisma.posTransferenciaDetalle.findMany({
        where: { posTransferenciaId: posId },
        select: {
          producto: {
            select: {
              base: { select: { categoria_id: true } },
            },
          },
        },
      });

      const ids = detallesPOS.map((d) => d.producto?.base?.categoria_id ?? null);
      haySinCategoria = ids.some((x) => x === null);
      categoriaIdsFiltradas = ids.filter((x) => x !== null);
    }

    if (!posId && destinoId) {
      const productosDestino = await prisma.productoLocal.findMany({
        where: { localId: destinoId },
        select: {
          base: { select: { categoria_id: true } },
        },
      });

      const ids = productosDestino.map((p) => p.base?.categoria_id ?? null);
      haySinCategoria = ids.some((x) => x === null);
      categoriaIdsFiltradas = ids.filter((x) => x !== null);
    }

    // ✅ FIX: si hay contexto (posId/destinoId) pero NO hay categorías, no devolver todas
    if ((posId || destinoId) && (!categoriaIdsFiltradas || categoriaIdsFiltradas.length === 0)) {
      return NextResponse.json({
        ok: true,
        items: [],
        total: 0,
        totalPages: 1,
        tieneSinCategoria: haySinCategoria,
        error: null,
      });
    }

    if (categoriaIdsFiltradas && categoriaIdsFiltradas.length > 0) {
      where.id = { in: Array.from(new Set(categoriaIdsFiltradas)) };
    }

    const total = await prisma.categoria.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const items = await prisma.categoria.findMany({
      where,
      orderBy: { nombre: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      totalPages,
      tieneSinCategoria: haySinCategoria,
      error: null,
    });
  } catch (err) {
    console.error("ERROR /api/categorias/listar:", err);

    return NextResponse.json(
      {
        ok: false,
        items: [],
        total: 0,
        totalPages: 1,
        tieneSinCategoria: false,
        error: "Error al listar categorías",
      },
      { status: 500 }
    );
  }
}

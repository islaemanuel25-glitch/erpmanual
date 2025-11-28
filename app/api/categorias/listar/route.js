// app/api/categorias/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // =======================================
    // 📌 Query params
    // =======================================
    const rawPage = Number(searchParams.get("page") || 1);
    const rawPageSize = Number(searchParams.get("pageSize") || 20);
    const estado = (searchParams.get("estado") || "todos").toLowerCase();
    const search = (searchParams.get("search") || "").trim();

    const destinoId = Number(searchParams.get("destinoId") || 0);
    const posId = Number(searchParams.get("posId") || 0);

    // Sanitizar
    const page = rawPage > 0 ? rawPage : 1;
    const pageSize =
      rawPageSize > 0 && rawPageSize <= 200 ? rawPageSize : 20;

    // =======================================
    // 📌 Base del where
    // =======================================
    const where = {};

    // Estado
    if (estado === "activas") where.activo = true;
    if (estado === "inactivas") where.activo = false;

    // Búsqueda
    if (search) {
      where.nombre = {
        contains: search,
        mode: "insensitive",
      };
    }

    // =======================================
    // 🧠 CONTEXTO POS / DESTINO
    // Solo devolver categorías que tengan productos asociados
    // y marcar si hay productos "sin categoría"
    // =======================================
    let categoriaIdsFiltradas = null;
    let haySinCategoria = false;

    // ---------------------------------------
    // 🟣 Caso POS (posId)
    // PosTransferenciaDetalle → producto (ProductoLocal) → base (ProductoBase) → categoria_id
    // ---------------------------------------
    if (posId) {
      const detallesPOS = await prisma.posTransferenciaDetalle.findMany({
        where: { posTransferenciaId: posId },
        select: {
          producto: {
            select: {
              base: {
                select: { categoria_id: true },
              },
            },
          },
        },
      });

      const ids = detallesPOS.map((d) => d.producto?.base?.categoria_id ?? null);

      haySinCategoria = ids.some((x) => x === null);
      categoriaIdsFiltradas = ids.filter((x) => x !== null);
    }

    // ---------------------------------------
    // 🟢 Caso TRANSFERENCIA destinoId
    // ProductoLocal (por localId) → base → categoria_id
    // ---------------------------------------
    if (!posId && destinoId) {
      const productosDestino = await prisma.productoLocal.findMany({
        where: { localId: destinoId },
        select: {
          base: {
            select: { categoria_id: true },
          },
        },
      });

      const ids = productosDestino.map((p) => p.base?.categoria_id ?? null);

      haySinCategoria = ids.some((x) => x === null);
      categoriaIdsFiltradas = ids.filter((x) => x !== null);
    }

    // ---------------------------------------
    // 🔵 Aplicar filtro por categorías si hay contexto
    // ---------------------------------------
    if (categoriaIdsFiltradas && categoriaIdsFiltradas.length > 0) {
      // Solo categorizadas; "sin categoría" va como flag aparte
      where.id = { in: Array.from(new Set(categoriaIdsFiltradas)) };
    }

    // =======================================
    // 📊 Total + Paginación
    // =======================================
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

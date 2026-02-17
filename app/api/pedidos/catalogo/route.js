// app/api/pedidos/catalogo/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getGrupoIdDeLocal } from "@/lib/grupos";

const PAGE_SIZE = 50;

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const localId = Number(session.localId);
    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "Usuario sin local asignado" },
        { status: 400 }
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

    // Filtros
    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const q = (searchParams.get("q") || "").trim();
    const categoriaId = searchParams.get("categoriaId")
      ? Number(searchParams.get("categoriaId"))
      : null;
    const proveedorId = searchParams.get("proveedorId")
      ? Number(searchParams.get("proveedorId"))
      : null;
    const areaId = searchParams.get("areaId")
      ? Number(searchParams.get("areaId"))
      : null;

    // WHERE sobre ProductoLocal del depósito
    const whereProductoLocal = {
      localId: depositoId,
      activo: true,
      base: {
        AND: [
          { grupoId },
          { activo: true },
          categoriaId ? { categoria_id: categoriaId } : {},
          proveedorId ? { proveedor_id: proveedorId } : {},
          areaId ? { area_fisica_id: areaId } : {},
          q
            ? {
                OR: [
                  { nombre: { contains: q, mode: "insensitive" } },
                  { codigo_barra: { contains: q, mode: "insensitive" } },
                  { sku: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
    };

    const total = await prisma.productoLocal.count({
      where: whereProductoLocal,
    });

    const rows = await prisma.productoLocal.findMany({
      where: whereProductoLocal,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: { base: { nombre: "asc" } },
      include: {
        base: {
          include: {
            categoria: { select: { id: true, nombre: true } },
            proveedor: { select: { id: true, nombre: true } },
            area_fisica: { select: { id: true, nombre: true } },
          },
        },
        stock: {
          where: { localId: depositoId },
          select: { cantidad: true },
        },
      },
    });

    const items = rows.map((pl) => {
      const base = pl.base;
      const stockDeposito = Number(pl.stock?.[0]?.cantidad || 0);

      return {
        productoLocalId: pl.id,
        baseId: pl.baseId,
        nombre: pl.nombre || base?.nombre || "",
        codigoBarra: base?.codigo_barra || null,
        sku: base?.sku || null,
        imagenUrl: base?.imagen_url || null,
        precioCosto: Number(pl.precio_costo || base?.precio_costo || 0),
        unidadMedida: base?.unidad_medida || "unidad",
        factorPack: Number(base?.factor_pack || 1),
        modoPedido: base?.modo_pedido || "BULTO",
        stockDeposito,
        categoriaNombre: base?.categoria?.nombre ?? null,
        proveedorNombre: base?.proveedor?.nombre ?? null,
        areaFisicaNombre: base?.area_fisica?.nombre ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    console.error("Error pedidos/catalogo:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

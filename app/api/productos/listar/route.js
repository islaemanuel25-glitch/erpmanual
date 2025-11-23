// app/api/productos/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { mergeBaseLocalToUi } from "@/lib/mappers/producto";

const PAGE_SIZE = 25;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // localId requerido
    const localId = Number(searchParams.get("localId") || 0);
    if (!localId || Number.isNaN(localId)) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    // Grupo del local
    const grupoId = await getGrupoIdDeLocal(localId);
    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "El local no pertenece a ningún grupo" },
        { status: 400 }
      );
    }

    // Paginación / filtros
    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const q = (searchParams.get("q") || "").trim();

    const categoriaId =
      searchParams.get("categoriaId") !== null
        ? Number(searchParams.get("categoriaId"))
        : null;

    const proveedorId =
      searchParams.get("proveedorId") !== null
        ? Number(searchParams.get("proveedorId"))
        : null;

    const areaFisicaId =
      searchParams.get("areaFisicaId") !== null
        ? Number(searchParams.get("areaFisicaId"))
        : null;

    const activo = searchParams.get("activo");
    const activoFilter =
      activo === "true" ? true : activo === "false" ? false : undefined;

    // WHERE — snake_case SOLO dentro de Prisma
    const where = {
      AND: [
        { grupoId },
        categoriaId ? { categoria_id: categoriaId } : {},
        proveedorId ? { proveedor_id: proveedorId } : {},
        areaFisicaId ? { area_fisica_id: areaFisicaId } : {},
        activoFilter !== undefined ? { activo: activoFilter } : {},
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
    };

    const total = await prisma.productoBase.count({ where });

    // Consulta principal
    const rows = await prisma.productoBase.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      include: {
        categoria: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, nombre: true } },
        area_fisica: { select: { id: true, nombre: true } },
        locales: {
          where: { localId },
          take: 1,
          select: {
            id: true,
            localId: true,
            precio_costo: true,
            precio_venta: true,
            margen: true,
            activo: true,
            nombre: true,
            descripcion: true,
          },
        },
      },
    });

    // MAP — limpiar snake_case del output final
    const items = rows.map((p) => {
      const override = p.locales?.[0] ?? null;
      const base = mergeBaseLocalToUi(p, override); // ya es camelCase

      return {
        ...base,

        // nombres de catálogo
        categoriaNombre: p.categoria?.nombre ?? null,
        proveedorNombre: p.proveedor?.nombre ?? null,
        areaFisicaNombre: p.area_fisica?.nombre ?? null,

        // IDs camelCase
        categoriaId: p.categoria?.id ?? null,
        proveedorId: p.proveedor?.id ?? null,
        areaFisicaId: p.area_fisica?.id ?? null,

        // codigo de barras uniforme
        codigoBarra: p.codigo_barra ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    console.error("productos/listar", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno" },
      { status: 500 }
    );
  }
}

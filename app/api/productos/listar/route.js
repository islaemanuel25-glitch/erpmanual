// app/api/productos/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { mergeBaseLocalToUi } from "@/lib/mappers/producto";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

const PAGE_SIZES_VALIDOS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

// Whitelist de campos ordenables → mapping a Prisma orderBy
const SORT_FIELDS = {
  nombre: { nombre: "asc" },
  codigoBarra: { codigo_barra: "asc" },
  precioCosto: { precio_costo: "asc" },
  precioVenta: { precio_venta: "asc" },
  margen: { margen: "asc" },
  categoriaId: { categoria_id: "asc" },
  proveedorId: { proveedor_id: "asc" },
  activo: { activo: "asc" },
  createdAt: { createdAt: "asc" },
};

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

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

    // Paginación
    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const rawPageSize = Number(searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);
    const pageSize = PAGE_SIZES_VALIDOS.includes(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE;

    // Ordenamiento
    const sortKey = searchParams.get("sortKey") || "createdAt";
    const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    // Filtros
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

    // Ordenamiento dinámico
    const sortMapping = SORT_FIELDS[sortKey];
    const prismaField = sortMapping ? Object.keys(sortMapping)[0] : "createdAt";
    const orderBy = { [prismaField]: sortDir };

    // Consulta principal
    const rows = await prisma.productoBase.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
      include: {
        categoria: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, nombre: true } },
        proveedor2: { select: { id: true, nombre: true } },
        proveedor3: { select: { id: true, nombre: true } },
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
        proveedor2Nombre: p.proveedor2?.nombre ?? null,
        proveedor3Nombre: p.proveedor3?.nombre ?? null,
        areaFisicaNombre: p.area_fisica?.nombre ?? null,

        // IDs camelCase
        categoriaId: p.categoria?.id ?? null,
        proveedorId: p.proveedor?.id ?? null,
        proveedor2Id: p.proveedor2?.id ?? null,
        proveedor3Id: p.proveedor3?.id ?? null,
        areaFisicaId: p.area_fisica?.id ?? null,

        // codigo de barras uniforme
        codigoBarra: p.codigo_barra ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("productos/listar", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno" },
      { status: 500 }
    );
  }
}

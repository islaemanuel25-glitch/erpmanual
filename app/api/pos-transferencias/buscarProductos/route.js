// app/api/pos-transferencias/buscarProductos/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { resolverContraCatalogo } from "@/lib/productos/busquedaFuzzyProducto";

const FUZZY_CANDIDATE_LIMIT = 10000;
const FUZZY_TOP_RESULTS = 10;

function mapItem(productoLocal) {
  const base = productoLocal.base;
  const stockActual = Number(productoLocal.stock?.[0]?.cantidad || 0);
  return {
    productoLocalId: productoLocal.id,
    baseId: productoLocal.baseId,
    nombre: productoLocal.nombre || base?.nombre || "",
    codigoBarra: base?.codigo_barra || "",
    stockActual,
    precioCosto: Number(
      productoLocal.precio_costo || base?.precio_costo || 0
    ),
    unidadMedida: base?.unidad_medida || "unidad",
    factorPack: Number(base?.factor_pack || 1),
    categoriaNombre: base?.categoria?.nombre ?? null,
    areaFisicaNombre: base?.area_fisica?.nombre ?? null,
  };
}

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    let origenId = Number(searchParams.get("origenId") || 0);
    const fromVoice = searchParams.get("fromVoice") === "true";

    if (!origenId) origenId = Number(session.localId || 0);

    if (!origenId) {
      return NextResponse.json(
        { ok: false, error: "origenId requerido" },
        { status: 400 }
      );
    }

    if (!session.esAdmin && origenId !== Number(session.localId)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para este local" },
        { status: 403 }
      );
    }

    // Búsqueda por voz: la transcripción se resuelve contra el catálogo real;
    // los resultados son productos existentes elegidos por similitud.
    if (q && fromVoice) {
      const candidatos = await prisma.productoLocal.findMany({
        where: { localId: origenId },
        select: {
          id: true,
          nombre: true,
          base: { select: { nombre: true, codigo_barra: true } },
        },
        take: FUZZY_CANDIDATE_LIMIT,
      });

      const { rankings, queryInterpretada } = resolverContraCatalogo(
        candidatos,
        q,
        {
          getNombre: (p) => p.nombre || p.base?.nombre || "",
          getCodigo: (p) => p.base?.codigo_barra || null,
          maxDistance: 3,
        }
      );

      const topIds = rankings.slice(0, FUZZY_TOP_RESULTS).map((r) => r.item.id);
      if (topIds.length === 0) {
        return NextResponse.json({
          ok: true,
          items: [],
          total: 0,
          queryInterpretada: null,
          error: null,
        });
      }

      const productosFull = await prisma.productoLocal.findMany({
        where: { id: { in: topIds } },
        include: {
          base: { include: { categoria: true, area_fisica: true } },
          stock: { where: { localId: origenId }, select: { cantidad: true } },
        },
      });
      const orderMap = new Map(topIds.map((id, idx) => [id, idx]));
      productosFull.sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));

      const items = productosFull.map(mapItem);
      return NextResponse.json({
        ok: true,
        items,
        total: items.length,
        queryInterpretada,
        error: null,
      });
    }

    // Búsqueda manual (sin voz): LIKE clásico.
    const whereBusqueda = {
      localId: origenId,
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { base: { nombre: { contains: q, mode: "insensitive" } } },
              { base: { codigo_barra: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const productos = await prisma.productoLocal.findMany({
      where: whereBusqueda,
      include: {
        base: { include: { categoria: true, area_fisica: true } },
        stock: { where: { localId: origenId }, select: { cantidad: true } },
      },
      take: 50,
    });

    const items = productos.map(mapItem);
    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
      error: null,
    });
  } catch (err) {
    console.error("Error buscarProductos:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos" },
      { status: 500 }
    );
  }
}

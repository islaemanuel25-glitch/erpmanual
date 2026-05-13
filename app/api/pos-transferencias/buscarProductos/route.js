// app/api/pos-transferencias/buscarProductos/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { rankearFuzzy } from "@/lib/productos/busquedaFuzzyProducto";

const FUZZY_CANDIDATE_LIMIT = 10000;
const FUZZY_MIN_LIKE_RESULTS = 3;
const FUZZY_TOP_RESULTS = 10;

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
        base: {
          include: {
            categoria: true,
            area_fisica: true,
          },
        },
        stock: {
          where: { localId: origenId },
          select: { cantidad: true },
        },
      },
      take: 50,
    });

    // Fallback fuzzy para búsqueda por voz: si el LIKE devolvió pocos resultados,
    // traer candidatos del local y rankear por similitud (tolera "brama" → BRAHMA,
    // "acotar" → COTAR). Solo se activa con fromVoice=true para no afectar la
    // búsqueda manual ni el scanner.
    if (q && fromVoice && productos.length < FUZZY_MIN_LIKE_RESULTS) {
      const idsActuales = new Set(productos.map((p) => p.id));
      const candidatos = await prisma.productoLocal.findMany({
        where: { localId: origenId },
        select: {
          id: true,
          nombre: true,
          base: { select: { nombre: true, codigo_barra: true } },
        },
        take: FUZZY_CANDIDATE_LIMIT,
        orderBy: { id: "asc" },
      });

      const ranked = rankearFuzzy(candidatos, q, {
        getNombre: (p) => p.nombre || p.base?.nombre || "",
        getCodigo: (p) => p.base?.codigo_barra || null,
        maxDistance: 3,
      });

      const idsFuzzy = ranked
        .map((r) => r.item.id)
        .filter((id) => !idsActuales.has(id))
        .slice(0, FUZZY_TOP_RESULTS);

      if (idsFuzzy.length > 0) {
        const fuzzyFull = await prisma.productoLocal.findMany({
          where: { id: { in: idsFuzzy } },
          include: {
            base: {
              include: {
                categoria: true,
                area_fisica: true,
              },
            },
            stock: {
              where: { localId: origenId },
              select: { cantidad: true },
            },
          },
        });
        const orderMap = new Map(idsFuzzy.map((id, idx) => [id, idx]));
        fuzzyFull.sort(
          (a, b) => orderMap.get(a.id) - orderMap.get(b.id)
        );
        productos.push(...fuzzyFull);
      }
    }

    const items = productos.map((productoLocal) => {
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

        // 🔥 NECESARIOS PARA LOS FILTROS (null, no vacío)
        categoriaNombre: base?.categoria?.nombre ?? null,
        areaFisicaNombre: base?.area_fisica?.nombre ?? null,
      };
    });

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

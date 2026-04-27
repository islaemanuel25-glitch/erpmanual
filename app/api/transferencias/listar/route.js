// app/api/transferencias/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession, getCookieValue } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

const PAGE_SIZE = 25;

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.ver");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: perm.error },
        { status: perm.status }
      );
    }

    // Resolver localId: cookie de contexto > JWT
    let localId = null;

    // 1. Intentar cookie de contexto activo
    const raw = getCookieValue(req, "erpazul_contexto_activo");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const ctx = Number(parsed.localId);
        if (ctx > 0) localId = ctx;
      } catch {}
    }

    // 2. Fallback: localId del JWT
    if (!localId && session.localId) {
      localId = Number(session.localId);
    }

    const { searchParams } = new URL(req.url);

    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const estado = searchParams.get("estado") || "";
    const fechaDesde = searchParams.get("fechaDesde") || "";
    const fechaHasta = searchParams.get("fechaHasta") || "";

    const where = {};

    if (estado) where.estado = estado;

    if (fechaDesde || fechaHasta) {
      where.fechaEnvio = {};
      if (fechaDesde) where.fechaEnvio.gte = new Date(fechaDesde + "T00:00:00");
      if (fechaHasta) where.fechaEnvio.lte = new Date(fechaHasta + "T23:59:59");
    }

    // Filtrar por contexto activo
    if (localId) {
      const local = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });

      if (local?.es_deposito) where.origenId = localId;
      else where.destinoId = localId;
    }
    // Si no hay localId (admin sin contexto): no filtra por local, ve todas

    // ======================================
    // CONSULTA PRINCIPAL CORREGIDA
    // ======================================
    const [total, registros] = await Promise.all([
      prisma.transferencia.count({ where }),

      prisma.transferencia.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          origen: { select: { id: true, nombre: true, es_deposito: true } },
          destino: { select: { id: true, nombre: true } },

          detalle: {
            select: {
              id: true,
              cantidad: true,
              recibido: true,          // ← 🔥 AGREGADO
              precioCosto: true,
              producto: {
                select: {
                  precio_costo: true,  // productoLocal
                  base: {
                    select: {
                      precio_costo: true, // ← 🔥 AGREGADO productoBase
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // ======================================
    // CÁLCULO EXACTO DEL DETALLE (COPIADO)
    // ======================================
    const items = registros.map((t) => {
      let totalCosto = 0;

      t.detalle.forEach((d) => {
        const cantidadEnviada = Number(d.cantidad || 0);
        const cantidadRecibida = Number(d.recibido || 0);

        const precioCosto =
          d.precioCosto ??
          d.producto?.precio_costo ??
          d.producto?.base?.precio_costo ??
          0;

        const cantidadReal =
          cantidadRecibida > 0 ? cantidadRecibida : cantidadEnviada;

        totalCosto += precioCosto * cantidadReal;
      });

      return {
        id: t.id,
        origenNombre: t.origen?.nombre,
        origenEsDeposito: t.origen?.es_deposito,
        destinoNombre: t.destino?.nombre,
        estado: t.estado,
        cantidadItems: t.detalle.length,
        fechaEnvio: t.fechaEnvio,
        fechaRecepcion: t.fechaRecepcion,
        totalCosto,
      };
    });

    const totalCostoGlobal = items.reduce(
      (acc, t) => acc + Number(t.totalCosto || 0),
      0
    );

    return NextResponse.json({
      ok: true,
      items,
      total,
      totalPages,
      totalCostoGlobal,
      error: null,
    });

  } catch (err) {
    console.error("Error listando transferencias:", err);
    return NextResponse.json(
      {
        ok: false,
        items: [],
        total: 0,
        totalPages: 1,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

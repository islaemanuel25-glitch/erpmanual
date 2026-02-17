// app/api/pedidos/carrito/route.js
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

    const localId = Number(session.localId);
    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "Usuario sin local asignado" },
        { status: 400 }
      );
    }

    // Solo locales (no depósito) pueden usar Pedidos
    const localUser = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (localUser?.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "Solo locales pueden usar Pedidos" },
        { status: 403 }
      );
    }

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

    // Buscar POS borrador activa
    const pos = await prisma.posTransferencia.findFirst({
      where: {
        origenId: depositoId,
        destinoId: localId,
        usuarioId: session.id,
        estado: { in: ["Borrador", "Preparando"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        detalles: {
          include: {
            producto: {
              include: { base: true },
            },
          },
        },
      },
    });

    if (!pos) {
      return NextResponse.json({
        ok: true,
        posId: null,
        items: [],
        itemCount: 0,
      });
    }

    const items = pos.detalles.map((d) => {
      const pl = d.producto;
      const base = pl?.base;
      return {
        detalleId: d.id,
        productoLocalId: d.productoId,
        baseId: pl?.baseId,
        nombre: pl?.nombre || base?.nombre || "",
        codigoBarra: base?.codigo_barra || null,
        sugerido: Number(d.sugerido || 0),
        preparado: Number(d.preparado || 0),
        unidadSugerida: d.unidadSugerida,
        factorPack: Number(base?.factor_pack || 1),
        unidadMedida: base?.unidad_medida || "unidad",
        imagenUrl: base?.imagen_url || null,
      };
    });

    return NextResponse.json({
      ok: true,
      posId: pos.id,
      estado: pos.estado,
      items,
      itemCount: items.length,
    });
  } catch (err) {
    console.error("Error pedidos/carrito:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

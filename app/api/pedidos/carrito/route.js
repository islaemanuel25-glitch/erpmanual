// app/api/pedidos/carrito/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { defaultModoEnvio } from "@/lib/conversiones/stock";

export async function GET(req) {
  try {
    // Auth + localId + grupoId (soporta admin con contexto activo)
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto || false },
        { status: scope.status }
      );
    }

    const { localId, grupoId, session } = scope;

    // Permisos
    const permisos = Array.isArray(session.permisos) ? session.permisos : [];
    if (!permisos.includes("*") && !permisos.includes("pedidos.ver")) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso para ver pedidos" },
        { status: 403 }
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

    // Buscar POS borrador activa para este par (depósito->local)
    // Sin filtrar por usuarioId: todos los usuarios del local comparten el mismo borrador.
    const pos = await prisma.posTransferencia.findFirst({
      where: {
        origenId: depositoId,
        destinoId: localId,
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

    // Verificar si hay un pedido "Solicitado" pendiente para este par
    const posPendiente = await prisma.posTransferencia.findFirst({
      where: {
        origenId: depositoId,
        destinoId: localId,
        estado: "Solicitado",
      },
      orderBy: { solicitadoAt: "desc" },
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

    const pendiente = posPendiente
      ? {
          posId: posPendiente.id,
          estado: posPendiente.estado,
          solicitadoAt: posPendiente.solicitadoAt,
          createdAt: posPendiente.createdAt,
          items: posPendiente.detalles.map((d) => {
            const pl = d.producto;
            const base = pl?.base;
            return {
              nombre: pl?.nombre || base?.nombre || "",
              sugerido: Number(d.sugerido || 0),
              unidadSugerida: d.unidadSugerida,
              factorPack: Number(base?.factor_pack || 1),
              modoEnvio: base?.modo_envio || defaultModoEnvio(base?.unidad_medida),
            };
          }),
          itemCount: posPendiente.detalles.length,
        }
      : null;

    if (!pos) {
      return NextResponse.json({
        ok: true,
        posId: null,
        items: [],
        itemCount: 0,
        pendiente,
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
        modoEnvio: base?.modo_envio || defaultModoEnvio(base?.unidad_medida),
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
      pendiente,
    });
  } catch (err) {
    console.error("Error pedidos/carrito:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

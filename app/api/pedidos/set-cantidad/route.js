// app/api/pedidos/set-cantidad/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { esBultoMode } from "@/lib/conversiones/stock";

export async function POST(req) {
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
    if (!permisos.includes("*") && !permisos.includes("pedidos.editar")) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso para editar pedidos" },
        { status: 403 }
      );
    }

    // Verificar que no es depósito
    const localUser = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (localUser?.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "El depósito no usa esta función. Usá POS Transferencias." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const productoLocalId = Number(body.productoLocalId || 0);
    const cantidad = Number(body.cantidad || 0);

    if (!productoLocalId) {
      return NextResponse.json(
        { ok: false, error: "productoLocalId requerido" },
        { status: 400 }
      );
    }

    if (cantidad < 0) {
      return NextResponse.json(
        { ok: false, error: "La cantidad no puede ser negativa" },
        { status: 400 }
      );
    }

    // Resolver depósito del grupo
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

    // Verificar que el productoLocal pertenece al depósito
    const productoOrigen = await prisma.productoLocal.findUnique({
      where: { id: productoLocalId },
      include: { base: true },
    });

    if (!productoOrigen || productoOrigen.localId !== depositoId) {
      return NextResponse.json(
        { ok: false, error: "Producto no encontrado en el depósito" },
        { status: 404 }
      );
    }

    // Validar modo_envio: si llega cantidad en UNIDAD y el producto sale por bulto,
    // la cantidad debe ser múltiplo de factorPack. Si llega en BULTO, no aplica.
    const base = productoOrigen.base;
    const factorPack = Number(base?.factor_pack || 1);
    const unidadIn = body.unidad === "BULTO" ? "BULTO" : "UNIDAD";

    if (
      unidadIn === "UNIDAD" &&
      cantidad > 0 &&
      base?.modo_envio === "SOLO_BULTO" &&
      factorPack > 1
    ) {
      if (cantidad % factorPack !== 0) {
        return NextResponse.json(
          { ok: false, error: `Este producto se pide por bulto completo (x${factorPack}).` },
          { status: 400 }
        );
      }
    }

    // Se respeta la unidad recibida ("BULTO" o "UNIDAD"). Fallback a "UNIDAD".
    const unidad = unidadIn;

    // Obtener/crear POS borrador para este par (depósito->local)
    const pos = await prisma.$transaction(async (tx) => {
      let found = await tx.posTransferencia.findFirst({
        where: {
          origenId: depositoId,
          destinoId: localId,
          estado: { in: ["Borrador", "Preparando"] },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!found) {
        found = await tx.posTransferencia.create({
          data: {
            origenId: depositoId,
            destinoId: localId,
            usuarioId: session.id,
            estado: "Borrador",
          },
        });
      }

      return found;
    });

    // Verificar que la POS no esté Solicitado o Enviado
    if (pos.estado === "Solicitado") {
      return NextResponse.json(
        { ok: false, error: "Tu pedido ya fue solicitado. Esperá a que el depósito lo procese, o cancelalo." },
        { status: 409 }
      );
    }

    if (pos.estado === "Enviado") {
      return NextResponse.json(
        { ok: false, error: "Esta POS ya fue enviada" },
        { status: 400 }
      );
    }

    // Buscar detalle existente
    const existente = await prisma.posTransferenciaDetalle.findFirst({
      where: {
        posTransferenciaId: pos.id,
        productoId: productoLocalId,
      },
    });

    let item = null;

    if (cantidad === 0) {
      // Quitar item si existe
      if (existente) {
        await prisma.posTransferenciaDetalle.delete({
          where: { id: existente.id },
        });
      }
    } else {
      // Upsert: sugerido = cantidad, preparado = 0
      if (existente) {
        item = await prisma.posTransferenciaDetalle.update({
          where: { id: existente.id },
          data: {
            sugerido: cantidad,
            preparado: 0,
            unidadSugerida: unidad,
            tipo: "manual",
          },
        });
      } else {
        item = await prisma.posTransferenciaDetalle.create({
          data: {
            posTransferenciaId: pos.id,
            productoId: productoLocalId,
            sugerido: cantidad,
            preparado: 0,
            tipo: "manual",
            unidadSugerida: unidad,
            unidadPreparada: unidad,
          },
        });
      }
    }

    // Contar items en el carrito
    const itemCount = await prisma.posTransferenciaDetalle.count({
      where: { posTransferenciaId: pos.id },
    });

    return NextResponse.json({
      ok: true,
      posId: pos.id,
      item: item
        ? {
            detalleId: item.id,
            productoLocalId: item.productoId,
            sugerido: Number(item.sugerido || 0),
            preparado: Number(item.preparado || 0),
            unidadSugerida: item.unidadSugerida,
          }
        : null,
      itemCount,
      cantidad,
    });
  } catch (err) {
    console.error("Error pedidos/set-cantidad:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

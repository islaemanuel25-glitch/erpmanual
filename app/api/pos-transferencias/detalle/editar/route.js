import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { defaultModoEnvio, esProductoFiambre, piezasToKg } from "@/lib/conversiones/stock";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const detalleId = Number(body.detalleId || 0);
    const sugerido =
      body.sugerido !== undefined ? Number(body.sugerido) : undefined;
    const preparado =
      body.preparado !== undefined ? Number(body.preparado) : undefined;
    const unidadSugerida = body.unidadSugerida && (body.unidadSugerida === "BULTO" || body.unidadSugerida === "UNIDAD" || body.unidadSugerida === "PIEZA")
      ? body.unidadSugerida
      : undefined;
    const unidadPreparada = body.unidadPreparada && (body.unidadPreparada === "BULTO" || body.unidadPreparada === "UNIDAD" || body.unidadPreparada === "PIEZA")
      ? body.unidadPreparada
      : undefined;

    if (!detalleId) {
      return NextResponse.json(
        { ok: false, error: "detalleId requerido" },
        { status: 400 }
      );
    }

    const detalle = await prisma.posTransferenciaDetalle.findUnique({
      where: { id: detalleId },
      include: {
        pos: {
          select: { id: true, estado: true, origenId: true },
        },
        producto: {
          include: { base: true },
        },
      },
    });

    if (!detalle) {
      return NextResponse.json(
        { ok: false, error: "Detalle no encontrado" },
        { status: 404 }
      );
    }

    if (detalle.pos.estado === "Enviado") {
      return NextResponse.json(
        { ok: false, error: "No se puede editar un detalle de una POS enviada" },
        { status: 400 }
      );
    }

    // Si está Solicitado, solo depósito/admin puede modificar
    if (detalle.pos.estado === "Solicitado") {
      const isAdmin =
        Array.isArray(session.permisos) &&
        session.permisos.includes("*") &&
        !session.localId;

      if (!isAdmin) {
        const userLocal = await prisma.local.findUnique({
          where: { id: Number(session.localId) },
          select: { es_deposito: true },
        });

        if (!userLocal?.es_deposito) {
          return NextResponse.json(
            { ok: false, error: "Solo depósito/admin puede modificar una POS solicitada" },
            { status: 403 }
          );
        }
      }
    }

    // Determinar si el usuario es depósito/admin o local
    const isAdminUser =
      Array.isArray(session.permisos) &&
      session.permisos.includes("*") &&
      !session.localId;

    let esDeposito = isAdminUser;
    if (!isAdminUser && session.localId) {
      const userLocal = await prisma.local.findUnique({
        where: { id: Number(session.localId) },
        select: { es_deposito: true },
      });
      esDeposito = !!userLocal?.es_deposito;
    }

    const baseProducto = detalle.producto?.base;
    const esFiambre = esProductoFiambre(baseProducto);
    const pesoReferenciaKg = Number(baseProducto?.pesoReferenciaKg || 0);

    const data = {};

    // Local → solo puede modificar sugerido/unidadSugerida
    // Depósito/Admin → solo puede modificar preparado/unidadPreparada
    // Si entra PIEZA: convertir SIEMPRE a kg antes de persistir (stock real en kg)
    if (esDeposito) {
      if (preparado !== undefined) {
        if (isNaN(preparado) || preparado < 0) {
          return NextResponse.json(
            { ok: false, error: "preparado debe ser un número válido" },
            { status: 400 }
          );
        }
        if (unidadPreparada === "PIEZA") {
          if (!esFiambre || pesoReferenciaKg <= 0) {
            return NextResponse.json(
              { ok: false, error: "Este producto no admite cantidad en piezas" },
              { status: 400 }
            );
          }
          data.preparado = piezasToKg(preparado, pesoReferenciaKg);
          data.unidadPreparada = "UNIDAD";
        } else {
          data.preparado = preparado;
          if (unidadPreparada !== undefined) data.unidadPreparada = unidadPreparada;
        }
      } else if (unidadPreparada !== undefined && unidadPreparada !== "PIEZA") {
        data.unidadPreparada = unidadPreparada;
      }
    } else {
      if (sugerido !== undefined) {
        if (isNaN(sugerido) || sugerido < 0) {
          return NextResponse.json(
            { ok: false, error: "sugerido debe ser un número válido" },
            { status: 400 }
          );
        }
        if (unidadSugerida === "PIEZA") {
          if (!esFiambre || pesoReferenciaKg <= 0) {
            return NextResponse.json(
              { ok: false, error: "Este producto no admite cantidad en piezas" },
              { status: 400 }
            );
          }
          data.sugerido = piezasToKg(sugerido, pesoReferenciaKg);
          data.unidadSugerida = "UNIDAD";
        } else {
          data.sugerido = sugerido;
          if (unidadSugerida !== undefined) data.unidadSugerida = unidadSugerida;
        }
      } else if (unidadSugerida !== undefined && unidadSugerida !== "PIEZA") {
        data.unidadSugerida = unidadSugerida;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay cambios para aplicar" },
        { status: 400 }
      );
    }

    const updated = await prisma.posTransferenciaDetalle.update({
      where: { id: detalleId },
      data,
      include: {
        producto: { include: { base: true } },
        pos: { select: { origenId: true } },
      },
    });

    const stockOrigen = await prisma.stockLocal.findUnique({
      where: {
        localId_productoId: {
          localId: updated.pos.origenId,
          productoId: updated.productoId,
        },
      },
      select: { cantidad: true },
    });

    const productoLocal = updated.producto;
    const baseItem = productoLocal?.base;
    const stockActual = Number(stockOrigen?.cantidad || 0);

    const item = {
      detalleId: updated.id,
      productoLocalId: updated.productoId,
      baseId: productoLocal?.baseId,
      tipo: updated.tipo,
      sugerido: Number(updated.sugerido || 0),
      preparado: Number(updated.preparado || 0),
      unidadSugerida: updated.unidadSugerida,
      unidadPreparada: updated.unidadPreparada,
      productoNombre: productoLocal?.nombre || baseItem?.nombre || "",
      codigoBarra: baseItem?.codigo_barra || "",
      stockActual,
      cantidadReal: stockActual,
      precioCosto: Number(
        productoLocal?.precio_costo || baseItem?.precio_costo || 0
      ),
      unidadMedida: baseItem?.unidad_medida || "unidad",
      factorPack: Number(baseItem?.factor_pack || 1),
      modoEnvio: baseItem?.modo_envio || defaultModoEnvio(baseItem?.unidad_medida || "unidad"),
      esFiambre,
      modoVentaDeposito: baseItem?.modoVentaDeposito || "PESO",
      pesoReferenciaKg: esFiambre ? pesoReferenciaKg : null,
    };

    return NextResponse.json({
      ok: true,
      item,
      error: null,
    });
  } catch (err) {
    console.error("Error editar detalle POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al editar detalle" },
      { status: 500 }
    );
  }
}
// app/api/pos-transferencias/detalle/editar/route.js

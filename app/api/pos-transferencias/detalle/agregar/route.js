import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { defaultModoEnvio } from "@/lib/conversiones/stock";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();

    const posId = Number(body.posId);
    const productoLocalDestinoId = Number(body.productoLocalId);
    const cantidadBody = Number(body.sugerido || body.cantidad || body.preparado || 0);
    const tiposPermitidos = ["manual", "rotura"];
    const tipo = tiposPermitidos.includes(body.tipo) ? body.tipo : "sugerido";

    // Leer unidades del body
    let unidadBody = body.sugeridoUnidad || body.unidad || body.unidadPreparada;

    if (!unidadBody || (unidadBody !== "BULTO" && unidadBody !== "UNIDAD")) {
      unidadBody = null; // Se calculará después de obtener el producto
    }

    if (!posId || !productoLocalDestinoId) {
      return NextResponse.json({ ok: false, error: "posId y productoLocalId requeridos" }, { status: 400 });
    }

    // POS
    const pos = await prisma.posTransferencia.findUnique({
      where: { id: posId },
      select: { estado: true, origenId: true, destinoId: true }
    });

    if (!pos) return NextResponse.json({ ok: false, error: "POS inexistente" }, { status: 404 });

    if (pos.estado === "Enviado") {
      return NextResponse.json({ ok: false, error: "POS ya enviada" }, { status: 400 });
    }

    // Si está Solicitado, solo depósito/admin puede modificar
    if (pos.estado === "Solicitado") {
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

    // PRODUCTO DEL DESTINO
    const productoDestino = await prisma.productoLocal.findUnique({
      where: { id: productoLocalDestinoId },
      include: { base: true }
    });

    if (!productoDestino)
      return NextResponse.json({ ok: false, error: "Producto destino inexistente" }, { status: 404 });

    // PRODUCTO EQUIVALENTE DEL ORIGEN (DEPÓSITO)
    const productoOrigen = await prisma.productoLocal.findFirst({
      where: {
        baseId: productoDestino.baseId,
        localId: pos.origenId
      },
      include: { base: true }
    });

    if (!productoOrigen)
      return NextResponse.json({ ok: false, error: "El depósito no tiene este producto" }, { status: 400 });

    // Inferir unidad si no vino en el body (respetar modo_envio)
    const factorPack = Number(productoOrigen.base.factor_pack || 1);

    if (!unidadBody || (unidadBody !== "BULTO" && unidadBody !== "UNIDAD")) {
      const efectivo = productoOrigen.base.modo_envio || defaultModoEnvio(productoOrigen.base.unidad_medida || "unidad");
      unidadBody = efectivo === "SOLO_UNIDAD" ? "UNIDAD" : (factorPack > 1 ? "BULTO" : "UNIDAD");
    }

    // Determinar si el usuario es depósito/admin o local
    const isAdmin =
      Array.isArray(session.permisos) &&
      session.permisos.includes("*") &&
      !session.localId;

    let esDeposito = isAdmin;
    if (!isAdmin && session.localId) {
      const userLocal = await prisma.local.findUnique({
        where: { id: Number(session.localId) },
        select: { es_deposito: true },
      });
      esDeposito = !!userLocal?.es_deposito;
    }

    // Si el body trae sugerido y preparado explícitos, usarlos directamente
    // (por ejemplo, al devolver un ítem de Preparados a Sugeridos)
    // Caso contrario: Local → sugerido, Depósito → preparado
    let sugerido = 0;
    let preparado = 0;
    let unidadSugerida = null;
    let unidadPreparada = null;

    const hasSugeridoExplicito = body.sugerido !== undefined && body.preparado !== undefined;

    if (hasSugeridoExplicito) {
      sugerido = Number(body.sugerido || 0);
      preparado = Number(body.preparado || 0);
      unidadSugerida = unidadBody;
      unidadPreparada = unidadBody;
    } else if (esDeposito) {
      preparado = cantidadBody;
      unidadPreparada = unidadBody;
      unidadSugerida = unidadBody;
    } else {
      sugerido = cantidadBody;
      unidadSugerida = unidadBody;
      unidadPreparada = unidadBody;
    }

    // Verificar que no exista
    const existente = await prisma.posTransferenciaDetalle.findFirst({
      where: {
        posTransferenciaId: posId,
        productoId: productoOrigen.id
      }
    });

    if (existente)
      return NextResponse.json({ ok: false, error: "El producto ya está en la POS" }, { status: 400 });

    // Crear
    const detalle = await prisma.posTransferenciaDetalle.create({
      data: {
        posTransferenciaId: posId,
        productoId: productoOrigen.id,
        sugerido,
        preparado,
        tipo,
        unidadSugerida,
        unidadPreparada
      }
    });

    return NextResponse.json({
      ok: true,
      item: {
        detalleId: detalle.id,
        productoLocalId: productoOrigen.id,
        baseId: productoOrigen.baseId,
        tipo,
        sugerido: Number(detalle.sugerido || 0),
        preparado: Number(detalle.preparado || 0),
        unidadSugerida: detalle.unidadSugerida,
        unidadPreparada: detalle.unidadPreparada,

        productoNombre: productoDestino.nombre || productoDestino.base.nombre,
        codigoBarra: productoDestino.base.codigo_barra,

        precioCosto: Number(productoDestino.precio_costo || productoDestino.base.precio_costo || 0),
        unidadMedida: productoDestino.base.unidad_medida,
        factorPack: Number(productoDestino.base.factor_pack || 1),
        modoEnvio: productoOrigen.base.modo_envio || defaultModoEnvio(productoOrigen.base.unidad_medida || "unidad"),
      },
      error: null
    });

  } catch (err) {
    console.error("ERROR AGREGAR POS:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// app/api/transferencias/detalle/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

function toNumber(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
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

    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const transferencia = await prisma.transferencia.findUnique({
      where: { id },
      include: {
        origen: {
          select: { id: true, nombre: true, es_deposito: true },
        },
        destino: {
          select: { id: true, nombre: true },
        },
        detalle: {
          include: {
            producto: {
              include: { base: true },
            },
          },
        },
      },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    // ======================================================
    // PERMISOS
    // ======================================================
    if (session.localId) {
      const localId = Number(session.localId);

      const local = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });

      if (!local)
        return NextResponse.json(
          { ok: false, error: "Local no encontrado" },
          { status: 404 }
        );

      if (local.es_deposito && transferencia.origenId !== localId)
        return NextResponse.json(
          { ok: false, error: "Sin permiso" },
          { status: 403 }
        );

      if (!local.es_deposito && transferencia.destinoId !== localId)
        return NextResponse.json(
          { ok: false, error: "Sin permiso" },
          { status: 403 }
        );
    }

    // ======================================================
    // MAPEO DETALLES
    // ======================================================
    let itemsEnviados = 0;
    let itemsRecibidos = 0;
    let costoTotal = 0;

    const items = transferencia.detalle.map((d) => {
      const cantidadEnviada = toNumber(d.cantidad);
      const cantidadRecibida = toNumber(d.recibido);

      const precioCosto =
        d.precioCosto != null
          ? toNumber(d.precioCosto)
          : d.producto?.precio_costo != null
          ? toNumber(d.producto.precio_costo)
          : d.producto?.base?.precio_costo != null
          ? toNumber(d.producto.base.precio_costo)
          : 0;

      const subtotal =
        precioCosto *
        (cantidadRecibida > 0 ? cantidadRecibida : cantidadEnviada);

      itemsEnviados += cantidadEnviada;
      itemsRecibidos += cantidadRecibida;
      costoTotal += subtotal;

      return {
        id: d.id,
        nombre:
          d.producto?.nombre ||
          d.producto?.base?.nombre ||
          "Producto sin nombre",
        codigoBarra: d.producto?.base?.codigo_barra || null,
        cantidadEnviada,
        cantidadRecibida,
        precioCosto,
        subtotal,

        motivoPrincipal: d.motivoPrincipal || "",
        motivoDetalle: d.motivoDetalle || "",
      };
    });

    const diferenciaTotal = itemsRecibidos - itemsEnviados;

    const item = {
      id: transferencia.id,
      estado: transferencia.estado,
      tieneDiferencias:
        transferencia.tieneDiferencias || diferenciaTotal !== 0,
      fechaCreada: transferencia.createdAt,
      fechaEnvio: transferencia.fechaEnvio,
      fechaRecepcion: transferencia.fechaRecepcion,
      origen: {
        id: transferencia.origen.id,
        nombre: transferencia.origen.nombre,
        esDeposito: transferencia.origen.es_deposito,
      },
      destino: {
        id: transferencia.destino.id,
        nombre: transferencia.destino.nombre,
      },
      resumen: {
        itemsEnviados,
        itemsRecibidos,
        diferenciaTotal,
        costoTotal,
      },
      items,
    };

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("Error en /api/transferencias/detalle:", err);
    return NextResponse.json(
      { ok: false, error: "Error al obtener detalle de transferencia" },
      { status: 500 }
    );
  }
}

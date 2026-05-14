import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

const num = (v) => (v == null ? 0 : Number(v));

export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || isNaN(ventaId)) {
      return NextResponse.json(
        { ok: false, error: "ID de venta invalido" },
        { status: 400 }
      );
    }

    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      select: {
        id: true,
        numero: true,
        fecha: true,
        localId: true,
        subtotal: true,
        descuento: true,
        total: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaBruta: true,
        gananciaNeta: true,
        formaPago: true,
        esFiado: true,
        cliente: { select: { id: true, nombre: true, documento: true } },
        vendedor: { select: { id: true, nombre: true } },
        local: { select: { id: true, nombre: true } },
        detalles: {
          select: {
            id: true,
            nombre: true,
            cantidad: true,
            precio: true,
            subtotal: true,
            precioCosto: true,
            ganancia: true,
            tipoPrecioAplicado: true,
            margenAplicado: true,
          },
        },
      },
    });

    if (!venta) {
      return NextResponse.json(
        { ok: false, error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    // Scope de local: usuario no-admin solo ve ventas de su local
    if (
      !session.esAdmin &&
      session.localId &&
      venta.localId !== session.localId
    ) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 403 }
      );
    }

    const verCostos = !!session.esAdmin;

    const totales = {
      subtotal: num(venta.subtotal).toFixed(2),
      descuento: num(venta.descuento).toFixed(2),
      total: num(venta.total).toFixed(2),
      comisionBancaria: num(venta.comisionBancaria).toFixed(2),
      netoRecibido: num(venta.netoRecibido).toFixed(2),
    };
    if (verCostos) {
      totales.costoTotal = num(venta.costoTotal).toFixed(2);
      totales.gananciaBruta = num(venta.gananciaBruta).toFixed(2);
      totales.gananciaNeta = num(venta.gananciaNeta).toFixed(2);
    }

    const detalles = venta.detalles.map((d) => {
      const subtotalLinea = num(d.subtotal);
      const base = {
        id: d.id,
        nombre: d.nombre,
        cantidad: num(d.cantidad),
        precio: num(d.precio).toFixed(2),
        subtotal: subtotalLinea.toFixed(2),
      };
      if (verCostos) {
        const gananciaLinea = num(d.ganancia);
        const margen =
          subtotalLinea > 0 ? (gananciaLinea / subtotalLinea) * 100 : 0;
        base.precioCosto = num(d.precioCosto).toFixed(2);
        base.ganancia = gananciaLinea.toFixed(2);
        base.margen = margen.toFixed(1);
        base.tipoPrecioAplicado = d.tipoPrecioAplicado || null;
        base.margenAplicado =
          d.margenAplicado != null ? num(d.margenAplicado).toFixed(2) : null;
      }
      return base;
    });

    return NextResponse.json({
      ok: true,
      permisos: { verCostos },
      venta: {
        id: venta.id,
        numero: venta.numero,
        fecha: venta.fecha,
        formaPago: venta.formaPago,
        esFiado: venta.esFiado,
        estado: venta.esFiado ? "fiado" : "cobrado",
        cliente: venta.cliente
          ? {
              id: venta.cliente.id,
              nombre: venta.cliente.nombre,
              documento: venta.cliente.documento || null,
            }
          : null,
        vendedor: venta.vendedor
          ? { id: venta.vendedor.id, nombre: venta.vendedor.nombre }
          : null,
        local: venta.local
          ? { id: venta.local.id, nombre: venta.local.nombre }
          : null,
        totales,
        detalles,
      },
    });
  } catch (error) {
    console.error("Error en detalle venta:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

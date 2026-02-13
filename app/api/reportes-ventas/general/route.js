import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { searchParams } = req.nextUrl;
    const fechaDesde = searchParams.get("fechaDesde");
    const fechaHasta = searchParams.get("fechaHasta");
    const localIdParam = searchParams.get("localId");
    const formaPagoParam = searchParams.get("formaPago");

    if (!fechaDesde || !fechaHasta) {
      return NextResponse.json(
        { ok: false, error: "Fechas requeridas" },
        { status: 400 }
      );
    }

    // Construir WHERE
    const where = {
      fecha: {
        gte: new Date(fechaDesde + "T00:00:00"),
        lte: new Date(fechaHasta + "T23:59:59"),
      },
    };

    // Filtrar por local
    if (localIdParam) {
      where.localId = Number(localIdParam);
    } else if (session.localId) {
      // Usuario no admin: solo su local
      where.localId = session.localId;
    }
    // Admin sin filtro de local: ve todo (no filtra por localId)

    if (formaPagoParam) {
      where.formaPago = formaPagoParam;
    }

    // Obtener ventas con detalles
    const ventas = await prisma.venta.findMany({
      where,
      select: {
        id: true,
        total: true,
        subtotal: true,
        descuento: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaBruta: true,
        gananciaNeta: true,
        formaPago: true,
        detalles: {
          select: {
            nombre: true,
            cantidad: true,
            precio: true,
            subtotal: true,
            precioCosto: true,
            ganancia: true,
          },
        },
      },
    });

    // Resumen general
    const cantidadVentas = ventas.length;
    let totalBruto = 0;
    let totalDescuentos = 0;
    let totalComisiones = 0;
    let totalNeto = 0;
    let totalCostos = 0;
    let gananciaNeta = 0;

    ventas.forEach((v) => {
      totalBruto += Number(v.total);
      totalDescuentos += Number(v.descuento);
      totalComisiones += Number(v.comisionBancaria);
      totalNeto += Number(v.netoRecibido);
      totalCostos += Number(v.costoTotal);
      gananciaNeta += Number(v.gananciaNeta);
    });

    // Desglose por forma de pago
    const desglosePagoMap = {};
    ventas.forEach((v) => {
      if (!desglosePagoMap[v.formaPago]) {
        desglosePagoMap[v.formaPago] = {
          formaPago: v.formaPago,
          cantidad: 0,
          total: 0,
          comision: 0,
          neto: 0,
        };
      }
      desglosePagoMap[v.formaPago].cantidad++;
      desglosePagoMap[v.formaPago].total += Number(v.total);
      desglosePagoMap[v.formaPago].comision += Number(v.comisionBancaria);
      desglosePagoMap[v.formaPago].neto += Number(v.netoRecibido);
    });

    // Top productos
    const productosMap = {};
    ventas.forEach((v) => {
      v.detalles.forEach((d) => {
        if (!productosMap[d.nombre]) {
          productosMap[d.nombre] = {
            nombre: d.nombre,
            cantidad: 0,
            totalVenta: 0,
            totalCosto: 0,
            ganancia: 0,
          };
        }
        productosMap[d.nombre].cantidad += d.cantidad;
        productosMap[d.nombre].totalVenta += Number(d.subtotal);
        productosMap[d.nombre].totalCosto += Number(d.precioCosto) * d.cantidad;
        productosMap[d.nombre].ganancia += Number(d.ganancia);
      });
    });

    const topProductos = Object.values(productosMap)
      .sort((a, b) => b.totalVenta - a.totalVenta)
      .slice(0, 20);

    return NextResponse.json({
      ok: true,
      resumen: {
        cantidadVentas,
        totalBruto: totalBruto.toFixed(2),
        totalDescuentos: totalDescuentos.toFixed(2),
        totalComisiones: totalComisiones.toFixed(2),
        totalNeto: totalNeto.toFixed(2),
        totalCostos: totalCostos.toFixed(2),
        gananciaNeta: gananciaNeta.toFixed(2),
      },
      desglosePago: Object.values(desglosePagoMap),
      topProductos,
    });
  } catch (error) {
    console.error("Error generando reporte:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

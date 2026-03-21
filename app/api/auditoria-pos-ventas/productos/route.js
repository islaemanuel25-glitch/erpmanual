import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";
import { estadoProducto } from "@/lib/auditoria-pos-ventas/agregaciones";
import { UMBRAL_MARGEN_BAJO_PCT } from "@/lib/auditoria-pos-ventas/constantes";

export async function GET(req) {
  try {
    const scope = await getAuditoriaScope(req);
    if (!scope.ok) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }

    const rango = parseRangoFechas(req.nextUrl.searchParams);
    if (rango.error) {
      return NextResponse.json({ ok: false, error: rango.error }, { status: 400 });
    }

    const detalles = await prisma.ventaDetalle.findMany({
      where: {
        venta: {
          localId: scope.localId,
          fecha: { gte: rango.fechaInicio, lte: rango.fechaFin },
        },
      },
      select: {
        productoBaseId: true,
        nombre: true,
        cantidad: true,
        subtotal: true,
        precioCosto: true,
        venta: {
          select: {
            id: true,
            total: true,
            comisionBancaria: true,
          },
        },
      },
    });

    const map = new Map();

    for (const d of detalles) {
      const pid = d.productoBaseId;
      const sub = Number(d.subtotal) || 0;
      const cant = Number(d.cantidad) || 0;
      const costoLinea = (Number(d.precioCosto) || 0) * cant;
      const totalVenta = Number(d.venta.total) || 0;
      const comisionVenta = Number(d.venta.comisionBancaria) || 0;
      const share = totalVenta > 0 ? sub / totalVenta : 0;
      const comisionProrrateada = comisionVenta * share;
      const resultadoLinea = sub - costoLinea - comisionProrrateada;

      if (!map.has(pid)) {
        map.set(pid, {
          productoBaseId: pid,
          nombre: d.nombre,
          cantidad: 0,
          venta: 0,
          costo: 0,
          comisionProrrateada: 0,
          resultadoReal: 0,
        });
      }
      const row = map.get(pid);
      row.cantidad += cant;
      row.venta += sub;
      row.costo += costoLinea;
      row.comisionProrrateada += comisionProrrateada;
      row.resultadoReal += resultadoLinea;
    }

    const items = Array.from(map.values())
      .map((row) => {
        const estado = estadoProducto(row.resultadoReal, row.venta);
        const margenPct =
          row.venta > 0 ? (row.resultadoReal / row.venta) * 100 : null;
        return {
          ...row,
          cantidad: Number(row.cantidad.toFixed(3)),
          venta: Number(row.venta.toFixed(2)),
          costo: Number(row.costo.toFixed(2)),
          comisionProrrateada: Number(row.comisionProrrateada.toFixed(2)),
          resultadoReal: Number(row.resultadoReal.toFixed(2)),
          margenPct: margenPct === null ? null : Number(margenPct.toFixed(4)),
          estado,
        };
      })
      .sort((a, b) => a.resultadoReal - b.resultadoReal);

    return NextResponse.json({
      ok: true,
      items,
      nota: `Comisión por producto prorrateada desde Venta.comisionBancaria × (subtotal línea / total ticket). Umbral margen bajo: 0–${UMBRAL_MARGEN_BAJO_PCT}% sobre venta del producto.`,
    });
  } catch (e) {
    console.error("auditoria-pos-ventas/productos:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

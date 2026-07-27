import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";
import { MEDIOS_CONOCIDOS } from "@/lib/auditoria-pos-ventas/constantes";
import { tendersParaAgregar } from "@/lib/pos-ventas/pagos";

const ORDEN_FILAS = [...MEDIOS_CONOCIDOS, "otros"];

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

    const ventas = await prisma.venta.findMany({
      where: {
        localId: scope.localId,
        fecha: { gte: rango.fechaInicio, lte: rango.fechaFin },
      },
      select: {
        total: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaNeta: true,
        formaPago: true,
        esFiado: true,
        pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
      },
    });

    const map = {};
    for (const k of ORDEN_FILAS) {
      map[k] = { medio: k, bruto: 0, comision: 0, neto: 0, costo: 0, ganancia: 0 };
    }

    // POR TENDER: bruto/comisión/neto de cada pago van a su medio. costo y ganancia
    // son de la VENTA (no del pago) → se prorratean por la participación del tender
    // en el total, para que las columnas sigan sumando el total del período.
    for (const v of ventas) {
      const total = Number(v.total) || 0;
      const costoV = Number(v.costoTotal) || 0;
      const ganV = Number(v.gananciaNeta) || 0;
      for (const t of tendersParaAgregar(v)) {
        const b = t.medio.toLowerCase();
        if (!map[b]) map[b] = { medio: b, bruto: 0, comision: 0, neto: 0, costo: 0, ganancia: 0 };
        const share = total > 0 ? t.monto / total : 0;
        map[b].bruto += t.monto;
        map[b].comision += t.comision;
        map[b].neto += t.neto;
        map[b].costo += costoV * share;
        map[b].ganancia += ganV * share;
      }
    }

    const items = ORDEN_FILAS.map((k) => map[k]);

    return NextResponse.json({
      ok: true,
      items,
      nota:
        "Montos por TENDER (VentaPago): cada pago suma al bucket de su medio. Costo y ganancia se prorratean por participación del pago en el total.",
    });
  } catch (e) {
    console.error("auditoria-pos-ventas/medios:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

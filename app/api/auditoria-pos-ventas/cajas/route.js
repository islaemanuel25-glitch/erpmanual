import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";

/**
 * GET /api/auditoria-pos-ventas/cajas?fechaDesde=YYYY-MM-DD&fechaHasta=YYYY-MM-DD
 *
 * Devuelve cada turno como "caja" con:
 * - datos de turno (apertura, cierre, responsable, montos)
 * - movimientos manuales (CajaMovimiento)
 * - aggregates de ventas calculados en vivo (para turnos abiertos)
 * - datos persistidos de cierre (para turnos cerrados)
 */
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

    const { localId } = scope;
    const { fechaInicio, fechaFin } = rango;

    // 1. Traer turnos con vendedor y movimientos de caja
    const turnos = await prisma.turno.findMany({
      where: {
        localId,
        apertura: { gte: fechaInicio, lte: fechaFin },
      },
      orderBy: { apertura: "desc" },
      include: {
        vendedor: { select: { id: true, nombre: true, email: true } },
        operador: { select: { id: true, nombre: true } },
        cerradoPor: { select: { id: true, nombre: true, email: true } },
        cajaMovimientos: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            tipo: true,
            monto: true,
            motivo: true,
            createdAt: true,
            usuario: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    const turnoIds = turnos.map((t) => t.id);

    // 2. Aggregate ventas por turno + desglose efectivo/digital
    let ventasAggMap = new Map();
    if (turnoIds.length > 0) {
      const ventasRaw = await prisma.venta.findMany({
        where: {
          turnoId: { in: turnoIds },
          localId,
        },
        select: {
          turnoId: true,
          total: true,
          formaPago: true,
          esFiado: true,
          comisionBancaria: true,
          netoRecibido: true,
          costoTotal: true,
          gananciaNeta: true,
          descuento: true,
        },
      });

      for (const v of ventasRaw) {
        const tid = v.turnoId;
        if (!tid) continue;
        if (!ventasAggMap.has(tid)) {
          ventasAggMap.set(tid, {
            count: 0,
            totalBruto: 0,
            totalEfectivo: 0,
            totalDigital: 0,
            totalFiado: 0,
            comision: 0,
            neto: 0,
            costo: 0,
            ganancia: 0,
            descuento: 0,
          });
        }
        const a = ventasAggMap.get(tid);
        const total = Number(v.total) || 0;
        a.count++;
        a.totalBruto += total;
        a.comision += Number(v.comisionBancaria) || 0;
        a.neto += Number(v.netoRecibido) || 0;
        a.costo += Number(v.costoTotal) || 0;
        a.ganancia += Number(v.gananciaNeta) || 0;
        a.descuento += Number(v.descuento) || 0;

        if (v.esFiado === true) {
          a.totalFiado += total;
        } else if (v.formaPago === "efectivo") {
          a.totalEfectivo += total;
        } else {
          a.totalDigital += total;
        }
      }
    }

    // 3. Armar respuesta
    const items = turnos.map((t) => {
      const vAgg = ventasAggMap.get(t.id) || {
        count: 0, totalBruto: 0, totalEfectivo: 0, totalDigital: 0,
        totalFiado: 0, comision: 0, neto: 0, costo: 0, ganancia: 0, descuento: 0,
      };

      // Movimientos de caja
      let totalIngresos = 0;
      let totalRetiros = 0;
      const movimientos = t.cajaMovimientos.map((m) => {
        const monto = Number(m.monto) || 0;
        if (m.tipo === "INGRESO") totalIngresos += monto;
        else if (m.tipo === "RETIRO") totalRetiros += monto;
        return {
          id: m.id,
          tipo: m.tipo,
          monto,
          motivo: m.motivo,
          createdAt: m.createdAt,
          usuario: m.usuario,
        };
      });

      const montoInicial = Number(t.montoInicial) || 0;
      const esCerrado = t.cierre !== null;

      // Para turnos cerrados usamos datos persistidos; para abiertos calculamos en vivo
      const esperado = esCerrado
        ? (t.montoEsperadoEfectivo != null ? Number(t.montoEsperadoEfectivo) : null)
        : montoInicial + vAgg.totalEfectivo + totalIngresos - totalRetiros;
      const real = esCerrado
        ? (t.montoRealEfectivo != null ? Number(t.montoRealEfectivo) : null)
        : null;
      const diferencia = esCerrado
        ? (t.diferenciaEfectivo != null ? Number(t.diferenciaEfectivo) : null)
        : null;

      return {
        turnoId: t.id,
        estado: esCerrado ? "cerrado" : "abierto",
        apertura: t.apertura,
        cierre: t.cierre,
        responsable: t.vendedor,
        operador: t.operador || null,
        cerradoPor: t.cerradoPor || null,
        montoInicial,
        movimientos,
        totalIngresos,
        totalRetiros,
        ventas: {
          cantidad: vAgg.count,
          bruto: Number(vAgg.totalBruto.toFixed(2)),
          efectivo: Number(vAgg.totalEfectivo.toFixed(2)),
          digital: Number(vAgg.totalDigital.toFixed(2)),
          fiado: Number(vAgg.totalFiado.toFixed(2)),
          comision: Number(vAgg.comision.toFixed(2)),
          neto: Number(vAgg.neto.toFixed(2)),
          costo: Number(vAgg.costo.toFixed(2)),
          ganancia: Number(vAgg.ganancia.toFixed(2)),
          descuento: Number(vAgg.descuento.toFixed(2)),
        },
        esperado,
        real,
        diferencia,
        observaciones: t.observaciones,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("auditoria-pos-ventas/cajas:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

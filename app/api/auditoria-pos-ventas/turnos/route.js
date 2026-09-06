import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";
import { estadoFinanciero } from "@/lib/pos-ventas/comisionPendiente";

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

    // Filtro por intersección: turno aparece si su ventana
    // [apertura, cierre || abierto] toca el rango pedido. Esto cubre
    // turnos largos que cierran dentro del rango (caso típico al cerrar
    // caja después de varios días).
    const turnos = await prisma.turno.findMany({
      where: {
        localId,
        apertura: { lte: fechaFin },
        OR: [
          { cierre: null },
          { cierre: { gte: fechaInicio } },
        ],
      },
      orderBy: { apertura: "desc" },
      include: {
        vendedor: { select: { id: true, nombre: true, email: true } },
        operador: { select: { id: true, nombre: true } },
        // `include` ya devuelve TODOS los escalares del Turno —`anuladoEn`,
        // `anuladoPorId` y `motivoAnulacion` incluidos—, así que acá solo van
        // relaciones. Listar un escalar en un `include` hace fallar la consulta.
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

    // Aggregates principales por turno
    const aggs = turnoIds.length > 0
      ? await prisma.venta.groupBy({
          by: ["turnoId"],
          where: {
            localId,
            turnoId: { in: turnoIds },
            fecha: { gte: fechaInicio, lte: fechaFin },
          },
          _count: { id: true },
          _sum: {
            total: true,
            comisionBancaria: true,
            netoRecibido: true,
            costoTotal: true,
            gananciaNeta: true,
            descuento: true,
          },
        })
      : [];

    // Cuántas ventas de cada turno se cobraron sin la comisión configurada. Va
    // por `groupBy` porque un conteo filtrado cuesta mucho menos que traer las
    // filas solo para mirar un booleano.
    const pendientesPorTurno = new Map(
      turnoIds.length > 0
        ? (
            await prisma.venta.groupBy({
              by: ["turnoId"],
              where: {
                localId,
                turnoId: { in: turnoIds },
                fecha: { gte: fechaInicio, lte: fechaFin },
                comisionPendiente: true,
              },
              _count: { id: true },
            })
          ).map((p) => [p.turnoId, p._count?.id ?? 0])
        : []
    );

    const aggMap = new Map();
    for (const a of aggs) {
      aggMap.set(a.turnoId, a);
    }

    // Desglose por forma de pago + esFiado
    const ventasPorFP = turnoIds.length > 0
      ? await prisma.venta.groupBy({
          by: ["turnoId", "formaPago", "esFiado"],
          where: {
            localId,
            turnoId: { in: turnoIds },
            fecha: { gte: fechaInicio, lte: fechaFin },
          },
          _sum: { total: true },
        })
      : [];

    // Construir mapa turnoId → { efectivo, digital, fiado }
    const fpMap = new Map();
    for (const row of ventasPorFP) {
      if (!fpMap.has(row.turnoId)) {
        fpMap.set(row.turnoId, { efectivo: 0, digital: 0, fiado: 0 });
      }
      const entry = fpMap.get(row.turnoId);
      const monto = Number(row._sum.total ?? 0);
      if (row.esFiado) {
        entry.fiado += monto;
      } else if (row.formaPago === "efectivo") {
        entry.efectivo += monto;
      } else {
        entry.digital += monto;
      }
    }

    const items = turnos.map((t) => {
      const agg = aggMap.get(t.id);
      const fp = fpMap.get(t.id) || { efectivo: 0, digital: 0, fiado: 0 };
      const esCerrado = t.cierre !== null;

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

      const montoInicial = Number(t.montoInicial ?? 0);

      // Esperado: persistido si cerrado, calculado en vivo si abierto
      const esperado = esCerrado
        ? (t.montoEsperadoEfectivo != null ? Number(t.montoEsperadoEfectivo) : null)
        : montoInicial + fp.efectivo + totalIngresos - totalRetiros;

      return {
        // Campos originales (contrato existente)
        id: t.id,
        apertura: t.apertura,
        cierre: t.cierre,
        montoEsperadoEfectivo:
          t.montoEsperadoEfectivo != null ? Number(t.montoEsperadoEfectivo) : null,
        montoRealEfectivo: t.montoRealEfectivo != null ? Number(t.montoRealEfectivo) : null,
        diferenciaEfectivo: t.diferenciaEfectivo != null ? Number(t.diferenciaEfectivo) : null,
        ventasCount: agg?._count?.id ?? 0,
        ventaBruta: Number(agg?._sum?.total ?? 0),
        comision: Number(agg?._sum?.comisionBancaria ?? 0),
        neto: Number(agg?._sum?.netoRecibido ?? 0),
        costo: Number(agg?._sum?.costoTotal ?? 0),
        gananciaTurno: Number(agg?._sum?.gananciaNeta ?? 0),
        // La comisión, el neto y la ganancia del turno son parciales si alguna
        // de sus ventas se cobró sin la comisión configurada. El efectivo
        // esperado y la diferencia de caja NO cambian: no dependen de esto.
        estadoFinanciero: estadoFinanciero({
          pendientes: pendientesPorTurno.get(t.id) ?? 0,
          total: agg?._count?.id ?? 0,
        }),
        vendedor: t.vendedor,
        operador: t.operador || null,
        // Campos nuevos
        estado: esCerrado ? "cerrado" : "abierto",
        montoInicial,
        observaciones: t.observaciones ?? null,
        real: t.montoRealEfectivo != null ? Number(t.montoRealEfectivo) : null,
        esperado,
        cerradoPor: t.cerradoPor || null,
        movimientos,
        totalIngresos,
        totalRetiros,
        descuento: Number(agg?._sum?.descuento ?? 0),
        ventas: {
          efectivo: Number(fp.efectivo.toFixed(2)),
          digital: Number(fp.digital.toFixed(2)),
          fiado: Number(fp.fiado.toFixed(2)),
        },
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("auditoria-pos-ventas/turnos:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

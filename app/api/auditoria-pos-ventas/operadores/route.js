import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { turnoOperativo, estadoDelTurno } from "@/lib/caja/cierreRelevo";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";
import { estadoFinanciero } from "@/lib/pos-ventas/comisionPendiente";

/**
 * GET /api/auditoria-pos-ventas/operadores?fechaDesde=...&fechaHasta=...
 *
 * Trazabilidad por persona (Usuario/vendedorId).
 * Combina datos de Venta y Turno para cada usuario con actividad POS en el rango.
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

    // 1. Ventas agrupadas por vendedorId
    const ventasAgg = await prisma.venta.groupBy({
      by: ["vendedorId"],
      where: {
        localId,
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
    });

    // CUÁNTAS VENTAS DE CADA VENDEDOR SE COBRARON SIN LA COMISIÓN CONFIGURADA.
    //
    // Va por `groupBy` y no trayendo las filas: un `count` filtrado cuesta
    // mucho menos que traer miles de ventas solo para mirar un booleano, y el
    // estado que arma el dominio tiene la misma forma en los dos casos.
    const pendientesAgg = await prisma.venta.groupBy({
      by: ["vendedorId"],
      where: {
        localId,
        fecha: { gte: fechaInicio, lte: fechaFin },
        comisionPendiente: true,
      },
      _count: { id: true },
    });
    const pendientesPorVendedor = new Map(
      pendientesAgg.map((p) => [p.vendedorId, p._count?.id ?? 0])
    );

    // 2. Turnos en el rango para el local
    const turnos = await prisma.turno.findMany({
      where: {
        localId,
        apertura: { gte: fechaInicio, lte: fechaFin },
      },
      select: {
        id: true,
        vendedorId: true,
        operadorId: true,
        apertura: true,
        cierre: true,
        // El tercer estado: sin este campo, una caja cortada se cuenta como abierta.
        cierreEnPreparacionEn: true,
        diferenciaEfectivo: true,
        anuladoEn: true,
        montoEsperadoEfectivo: true,
        montoRealEfectivo: true,
        operador: { select: { id: true, nombre: true } },
      },
    });

    // Agrupar turnos por vendedorId
    const turnosPorVendedor = new Map();
    for (const t of turnos) {
      if (!turnosPorVendedor.has(t.vendedorId)) {
        turnosPorVendedor.set(t.vendedorId, []);
      }
      turnosPorVendedor.get(t.vendedorId).push(t);
    }

    // 3. Recopilar todos los vendedorIds con actividad (ventas o turnos)
    const allIds = new Set();
    for (const a of ventasAgg) allIds.add(a.vendedorId);
    for (const t of turnos) allIds.add(t.vendedorId);

    if (allIds.size === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // 4. Traer datos de usuarios
    const usuarios = await prisma.usuario.findMany({
      where: { id: { in: Array.from(allIds) } },
      select: { id: true, nombre: true, email: true },
    });
    const userMap = new Map();
    for (const u of usuarios) userMap.set(u.id, u);

    // Mapa de ventas
    const ventasMap = new Map();
    for (const a of ventasAgg) ventasMap.set(a.vendedorId, a);

    // 5. Armar respuesta por persona
    const items = Array.from(allIds).map((vid) => {
      const user = userMap.get(vid) || { id: vid, nombre: "—", email: "" };
      const va = ventasMap.get(vid);
      const tList = turnosPorVendedor.get(vid) || [];

      // Un turno ANULADO no es un cierre: se abrió por error o para probar y nunca
      // hubo plata ni conteo. Contarlo acá le sumaría a esta persona un cierre que
      // no hizo, y su diferencia (NULL) ensuciaría la métrica.
      const turnosCerrados = tList.filter((t) => t.cierre !== null && t.anuladoEn == null);
      const turnosAnulados = tList.filter((t) => t.anuladoEn != null).length;
      const diferenciaTotal = turnosCerrados.reduce(
        (acc, t) => acc + (Number(t.diferenciaEfectivo) || 0), 0
      );
      const cierresConDiferencia = turnosCerrados.filter(
        (t) => t.diferenciaEfectivo != null && Number(t.diferenciaEfectivo) !== 0
      ).length;

      // Operador más frecuente en los turnos de esta persona
      const opCounts = new Map();
      for (const t of tList) {
        if (t.operadorId && t.operador) {
          const key = t.operadorId;
          opCounts.set(key, (opCounts.get(key) || { count: 0, op: t.operador }));
          opCounts.get(key).count++;
        }
      }
      let operadorPrincipal = null;
      let maxCount = 0;
      for (const [, v] of opCounts) {
        if (v.count > maxCount) { maxCount = v.count; operadorPrincipal = v.op; }
      }

      return {
        vendedorId: vid,
        nombre: user.nombre,
        email: user.email,
        operador: operadorPrincipal,
        // Ventas
        tickets: va?._count?.id ?? 0,
        ventaBruta: Number(va?._sum?.total ?? 0),
        comision: Number(va?._sum?.comisionBancaria ?? 0),
        neto: Number(va?._sum?.netoRecibido ?? 0),
        costo: Number(va?._sum?.costoTotal ?? 0),
        ganancia: Number(va?._sum?.gananciaNeta ?? 0),
        descuento: Number(va?._sum?.descuento ?? 0),
        // Comisión, neto y ganancia de esta fila son parciales si hay ventas
        // pendientes: la comisión suma solo las conocidas y las otras dos
        // descontaron de menos.
        estadoFinanciero: estadoFinanciero({
          pendientes: pendientesPorVendedor.get(user.id) ?? 0,
          total: va?._count?.id ?? 0,
        }),
        // Turnos
        turnosTrabajados: tList.length,
        turnosCerrados: turnosCerrados.length,
        // OPERATIVOS, no "sin cerrar". Un turno que tomó su corte de cierre
        // sigue con "cierre" en null pero ya no vende: contarlo como abierto le
        // decía al auditor que hay más cajas en la calle de las que hay.
        turnosAbiertos: tList.filter((t) => turnoOperativo(t)).length,
        turnosEnCierre: tList.filter((t) => estadoDelTurno(t) === "CIERRE_EN_PREPARACION").length,
        // Se informan aparte: son auditables, pero no son cierres de esta persona.
        turnosAnulados,
        cierresConDiferencia,
        diferenciaTotal: Number(diferenciaTotal.toFixed(2)),
        // Detalle de turnos
        turnos: tList.map((t) => ({
          turnoId: t.id,
          apertura: t.apertura,
          cierre: t.cierre,
          diferencia: t.diferenciaEfectivo != null ? Number(t.diferenciaEfectivo) : null,
          operador: t.operador || null,
        })),
      };
    }).sort((a, b) => b.ventaBruta - a.ventaBruta);

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("auditoria-pos-ventas/operadores:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

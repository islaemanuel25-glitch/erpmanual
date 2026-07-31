// app/api/reportes-ventas/por-cliente/route.js
//
// Vista de reportes AGRUPADA POR CLIENTE. Mismo scope/filtros/rango AR que
// `listado`. Agrupa por clienteId (null → "Consumidor final"). NO fusiona
// tickets ni modifica ventas: cada grupo lista sus ventas originales.
//
// Contrato de respuesta:
//   { ok, clientes: [{ clienteId, nombre, documento, tickets, totalAcumulado,
//       unidadesTotales, ultimaCompra, pagos:[{medio,label,monto}],
//       ventas:[{id,numero,fecha,total,estado,formaPago}] }],
//     totales: { clientes, tickets, total } }

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";
import { resolveVistaOperativa, getGrupoIdDeLocal } from "@/lib/grupos";
import { getContextoActivo } from "@/lib/contexto";
import { tendersParaAgregar, MEDIO_LABEL } from "@/lib/pos-ventas/pagos";

const MAX_VENTAS = 5000; // techo defensivo de un reporte por rango
const ORDENES = new Set(["total_desc", "total_asc", "tickets_desc", "reciente", "nombre_asc"]);

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

    const perm = checkPerm(session, "reportes.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { searchParams } = req.nextUrl;
    const fechaDesde = searchParams.get("fechaDesde");
    const fechaHasta = searchParams.get("fechaHasta");
    const localIdParam = searchParams.get("localId");
    const formaPagoParam = searchParams.get("formaPago");
    const ordenParam = searchParams.get("orden");
    const orden = ORDENES.has(ordenParam) ? ordenParam : "total_desc";

    if (!fechaDesde || !fechaHasta) {
      return NextResponse.json({ ok: false, error: "Fechas requeridas" }, { status: 400 });
    }

    const { fechaInicio, fechaFin } = getRangoArgentina(fechaDesde, fechaHasta);
    const where = { fecha: { gte: fechaInicio, lte: fechaFin } };

    // Scope estricto por ubicación (idéntico a `listado`).
    const qLocal = Number(localIdParam) || 0;
    if (!session.esAdmin) {
      const propio = Number(session.localId) || 0;
      if (!propio) return NextResponse.json({ ok: false, error: "Sin alcance autorizado." }, { status: 403 });
      if (qLocal && qLocal !== propio) return NextResponse.json({ ok: false, error: "Local fuera de tu alcance." }, { status: 403 });
      where.localId = propio;
    } else if (qLocal) {
      const gLocal = await getGrupoIdDeLocal(qLocal);
      let grupoEfectivo = Number(session.grupoId) || 0;
      if (!grupoEfectivo) {
        const ctx = getContextoActivo(req, session);
        if (ctx?.localId) grupoEfectivo = (await getGrupoIdDeLocal(ctx.localId)) || 0;
      }
      if (!grupoEfectivo || !gLocal || gLocal !== grupoEfectivo) {
        return NextResponse.json({ ok: false, error: "Local fuera de tu grupo activo." }, { status: 403 });
      }
      where.localId = qLocal;
    } else {
      const vista = await resolveVistaOperativa(req);
      if (vista.error) return NextResponse.json({ ok: false, error: vista.error, needsContexto: vista.needsContexto }, { status: vista.status });
      where.localId = vista.modo === "GLOBAL" ? { in: vista.localIds } : vista.localId;
    }

    if (formaPagoParam) where.formaPago = formaPagoParam;

    const ventas = await prisma.venta.findMany({
      where: whereVentaComercial(where),
      take: MAX_VENTAS,
      orderBy: { fecha: "desc" },
      select: {
        id: true, numero: true, fecha: true, total: true, formaPago: true, esFiado: true, clienteId: true,
        cliente: { select: { id: true, nombre: true, documento: true } },
        pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
      },
    });

    // Unidades por venta (suma de cantidades de líneas), en un solo groupBy.
    const ventaIds = ventas.map((v) => v.id);
    const unidadesPorVenta = new Map();
    if (ventaIds.length) {
      const agg = await prisma.ventaDetalle.groupBy({
        by: ["ventaId"],
        where: { ventaId: { in: ventaIds } },
        _sum: { cantidad: true },
      });
      for (const r of agg) unidadesPorVenta.set(r.ventaId, Number(r._sum.cantidad || 0));
    }

    // Agrupar por clienteId (null → "Consumidor final"). Mismo nombre + distinto
    // id = grupos SEPARADOS (la clave es el id, no el nombre).
    const grupos = new Map();
    for (const v of ventas) {
      const key = v.clienteId == null ? "cf" : `c:${v.clienteId}`;
      if (!grupos.has(key)) {
        grupos.set(key, {
          clienteId: v.clienteId ?? null,
          nombre: v.cliente?.nombre ?? "Consumidor final",
          documento: v.cliente?.documento ?? null,
          tickets: 0, totalAcumulado: 0, unidadesTotales: 0, ultimaCompra: null,
          pagosMap: new Map(), ventas: [],
        });
      }
      const g = grupos.get(key);
      g.tickets += 1;
      g.totalAcumulado += Number(v.total) || 0;
      g.unidadesTotales += unidadesPorVenta.get(v.id) || 0;
      const f = v.fecha instanceof Date ? v.fecha : new Date(v.fecha);
      if (!g.ultimaCompra || f > g.ultimaCompra) g.ultimaCompra = f;
      for (const t of tendersParaAgregar(v)) {
        g.pagosMap.set(t.medio, (g.pagosMap.get(t.medio) || 0) + (Number(t.monto) || 0));
      }
      g.ventas.push({
        id: v.id, numero: v.numero, fecha: v.fecha,
        total: Number(v.total).toFixed(2), estado: v.esFiado ? "fiado" : "cobrado", formaPago: v.formaPago,
      });
    }

    let clientes = [...grupos.values()].map((g) => ({
      clienteId: g.clienteId,
      nombre: g.nombre,
      documento: g.documento,
      tickets: g.tickets,
      totalAcumulado: g.totalAcumulado.toFixed(2),
      unidadesTotales: Math.round((g.unidadesTotales + Number.EPSILON) * 1000) / 1000,
      ultimaCompra: g.ultimaCompra,
      pagos: [...g.pagosMap.entries()].map(([medio, monto]) => ({ medio, label: MEDIO_LABEL[medio] || medio, monto: monto.toFixed(2) })),
      // Tickets originales del acordeón, más recientes primero.
      ventas: g.ventas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    }));

    // Orden de las tarjetas.
    const cmp = {
      total_desc: (a, b) => Number(b.totalAcumulado) - Number(a.totalAcumulado),
      total_asc: (a, b) => Number(a.totalAcumulado) - Number(b.totalAcumulado),
      tickets_desc: (a, b) => b.tickets - a.tickets,
      reciente: (a, b) => new Date(b.ultimaCompra) - new Date(a.ultimaCompra),
      nombre_asc: (a, b) => String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" }),
    }[orden];
    clientes.sort(cmp);

    const totales = {
      clientes: clientes.length,
      tickets: clientes.reduce((s, c) => s + c.tickets, 0),
      total: clientes.reduce((s, c) => s + Number(c.totalAcumulado), 0).toFixed(2),
    };

    return NextResponse.json({ ok: true, orden, clientes, totales, truncado: ventas.length >= MAX_VENTAS });
  } catch (error) {
    console.error("Error en reportes por-cliente:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

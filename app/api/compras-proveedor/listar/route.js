// app/api/compras-proveedor/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);

    const proveedorId = Number(url.searchParams.get("proveedorId") || 0) || undefined;
    const estado = url.searchParams.get("estado") || undefined;
    // Soporte opcional de grupo de estados (CSV). Si viene, tiene prioridad sobre
    // `estado` simple. Mantiene compatibilidad con el filtro de estado único.
    const estadosCsv = url.searchParams.get("estados") || "";
    const estadosArr = estadosCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fechaDesde = url.searchParams.get("fechaDesde") || "";
    const fechaHasta = url.searchParams.get("fechaHasta") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") || 20)));

    // Aislamiento por ubicación: solo pedidos DUEÑOS de la ubicación activa.
    // (backfill: pedidos viejos → creadoEnLocalId = depositoId).
    const where = { grupoId, creadoEnLocalId: localId };
    if (proveedorId) where.proveedorId = proveedorId;
    if (estadosArr.length) {
      where.estado = { in: estadosArr };
    } else if (estado) {
      where.estado = estado;
    }

    // Filtro por rango de fecha de creación (AR). Solo aplica si vienen ambos.
    if (fechaDesde && fechaHasta) {
      const { fechaInicio, fechaFin } = getRangoArgentina(fechaDesde, fechaHasta);
      where.createdAt = { gte: fechaInicio, lte: fechaFin };
    }

    const [items, total] = await Promise.all([
      prisma.pedidoProveedor.findMany({
        where,
        include: {
          proveedor: { select: { id: true, nombre: true } },
          deposito: { select: { id: true, nombre: true } },
          _count: { select: { detalles: true } },
          // ── LAS LÍNEAS, SOLO PARA SUMAR EL ESTIMADO ──────────────────────
          //
          // El listado de "Recibir mercadería" muestra cuánta plata está por
          // entrar, y ese número no existía en ninguna columna: `totalFactura`
          // y `totalReal` se llenan al recibir y al facturar, o sea DESPUÉS.
          // Lo único que se sabe al mandar el pedido es lo que se calculó al
          // pedirlo, que es la suma de cantidad × costo de cada línea.
          //
          // Se traen los dos campos y se suma acá en vez de pedir un
          // `aggregate` aparte por pedido: son dos números por línea y el
          // listado ya trae como mucho una página de pedidos.
          detalles: { select: { cantidad: true, precioCosto: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.pedidoProveedor.count({ where }),
    ]);

    const mapped = items.map((p) => ({
      id: p.id,
      estado: p.estado,
      notas: p.notas,
      proveedorNombre: p.proveedor.nombre,
      proveedorId: p.proveedor.id,
      depositoNombre: p.deposito.nombre,
      depositoId: p.deposito.id,
      cantItems: p._count.detalles,
      // ESTIMADO, y el nombre lo dice. Una línea sin costo cargado no suma
      // cero: no suma, igual que en el texto del pedido. Si ninguna tiene
      // costo el total da 0, y la pantalla lo muestra como lo que es —no se
      // sabe cuánto vale— en vez de afirmar que vale nada.
      totalEstimado: (p.detalles || []).reduce((acc, d) => {
        const costo = Number(d.precioCosto) || 0;
        return costo > 0 ? acc + (Number(d.cantidad) || 0) * costo : acc;
      }, 0),
      fechaConfirmado: p.fechaConfirmado,
      fechaEnviado: p.fechaEnviado,
      fechaRecibido: p.fechaRecibido,
      createdAt: p.createdAt,
    }));

    return NextResponse.json({ ok: true, items: mapped, total });
  } catch (err) {
    console.error("Error compras-proveedor/listar:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

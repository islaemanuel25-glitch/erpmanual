// app/api/compras-proveedor/ganancia/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

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
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const proveedorId = url.searchParams.get("proveedorId");

    if (!desde || !hasta) {
      return NextResponse.json(
        { ok: false, error: "desde y hasta son requeridos (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const fechaDesde = new Date(desde + "T00:00:00");
    const fechaHasta = new Date(hasta + "T23:59:59.999");

    if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Fechas inválidas" },
        { status: 400 }
      );
    }

    const where = {
      grupoId,
      creadoEnLocalId: localId, // mismo scope por ubicación que el listado
      estado: "RECIBIDO",
      fechaRecibido: {
        gte: fechaDesde,
        lte: fechaHasta,
      },
    };

    if (proveedorId) {
      where.proveedorId = Number(proveedorId);
    }

    const pedidos = await prisma.pedidoProveedor.findMany({
      where,
      include: {
        proveedor: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaRecibido: "desc" },
    });

    // Resumen
    let sumaFactura = 0;
    let sumaReal = 0;
    let cantConGanancia = 0;

    // Ranking por proveedor
    const provMap = {};

    const compras = pedidos.map((p) => {
      const tf = p.totalFactura != null ? Number(p.totalFactura) : null;
      const tr = p.totalReal != null ? Number(p.totalReal) : null;
      const ganancia = tf != null && tr != null ? tf - tr : null;

      if (tf != null) sumaFactura += tf;
      if (tr != null) sumaReal += tr;
      if (ganancia != null) cantConGanancia++;

      // Acumular por proveedor
      const pk = p.proveedorId;
      if (!provMap[pk]) {
        provMap[pk] = {
          proveedorId: pk,
          proveedorNombre: p.proveedor?.nombre || "-",
          totalFactura: 0,
          totalReal: 0,
          ganancia: 0,
          compras: 0,
        };
      }
      if (tf != null) provMap[pk].totalFactura += tf;
      if (tr != null) provMap[pk].totalReal += tr;
      if (ganancia != null) provMap[pk].ganancia += ganancia;
      provMap[pk].compras++;

      return {
        id: p.id,
        proveedorNombre: p.proveedor?.nombre || "-",
        fechaRecibido: p.fechaRecibido,
        totalFactura: tf,
        totalReal: tr,
        ganancia,
        nroFactura: p.nroFactura,
      };
    });

    const rankingProveedores = Object.values(provMap).sort(
      (a, b) => b.ganancia - a.ganancia
    );

    return NextResponse.json({
      ok: true,
      resumen: {
        totalFactura: sumaFactura,
        totalReal: sumaReal,
        gananciaTotal: sumaFactura - sumaReal,
        cantidadCompras: pedidos.length,
        cantConGanancia,
      },
      rankingProveedores,
      compras,
    });
  } catch (err) {
    console.error("Error compras-proveedor/ganancia:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

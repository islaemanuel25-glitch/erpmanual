import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { getUsuarioSession } from "@/lib/auth";
import { getContextoActivo } from "@/lib/contexto";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const contexto = getContextoActivo(req, session);
    if (contexto.needsContexto) {
      return NextResponse.json(
        { ok: false, error: "Contexto requerido" },
        { status: 409 }
      );
    }

    const localId = contexto.localId;
    const limite = Number(req.nextUrl.searchParams.get("limite")) || 15;

    // Últimas ventas como actividad
    const ventasRecientes = await prisma.venta.findMany({
      where: whereVentaComercial({ localId }),
      orderBy: { fecha: "desc" },
      take: limite,
      select: {
        id: true,
        numero: true,
        fecha: true,
        total: true,
        vendedor: { select: { nombre: true } },
      },
    });

    // Últimos movimientos de stock
    const stockReciente = await prisma.auditoriaStock.findMany({
      where: { localId },
      orderBy: { createdAt: "desc" },
      take: limite,
      select: {
        id: true,
        accion: true,
        cantidadAnterior: true,
        cantidadNueva: true,
        motivo: true,
        createdAt: true,
        usuario: { select: { nombre: true } },
      },
    });

    // Combinar y ordenar por fecha
    const actividad = [];

    for (const v of ventasRecientes) {
      actividad.push({
        tipo: "venta",
        id: v.id,
        descripcion: `Venta #${v.numero} — $${Number(v.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
        usuario: v.vendedor?.nombre || "",
        fecha: v.fecha,
      });
    }

    for (const s of stockReciente) {
      const cantAnterior = s.cantidadAnterior != null ? Number(s.cantidadAnterior) : null;
      const cantNueva = s.cantidadNueva != null ? Number(s.cantidadNueva) : null;
      let desc = `Stock: ${s.accion}`;
      if (cantAnterior != null && cantNueva != null) {
        desc += ` (${cantAnterior} → ${cantNueva})`;
      }
      if (s.motivo) desc += ` — ${s.motivo}`;

      actividad.push({
        tipo: "stock",
        id: s.id,
        descripcion: desc,
        usuario: s.usuario?.nombre || "",
        fecha: s.createdAt,
      });
    }

    // Ordenar combinado por fecha descendente y tomar los primeros N
    actividad.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const resultado = actividad.slice(0, limite);

    return NextResponse.json({ ok: true, actividad: resultado });
  } catch (error) {
    console.error("Error dashboard/actividad:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

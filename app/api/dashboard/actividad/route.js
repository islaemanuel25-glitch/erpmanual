import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { requirePerm } from "@/lib/authorize";
import { getContextoActivo } from "@/lib/contexto";

// ESTE PANEL ES CONTROL, NO CAJA. Devuelve los movimientos de stock CON SU AUTOR
// —quién ajustó qué y cuándo— junto a las ventas del local. Es material de
// supervisión, y por eso deja de servirse con solo estar logueado (INC-0007).
//
// EL PERMISO SE ELIGIÓ MIRANDO QUIÉN LO TIENE, no solo qué suena bien.
// `auditoria.ver` parecía el natural —es una bitácora de quién hizo qué— pero
// contado contra los roles de producción **lo tiene solo Admin**: DUEÑO_LOCAL,
// que son los tres usuarios que más operan, no lo tiene, ni ENCARGADO ni
// Deposito. Cerrarlo solo con ése le sacaba el panel a todos menos a uno.
//
// Va junto con `stock.ver`, que es lo que sí tienen los cuatro roles de control
// —Admin, ENCARGADO, Deposito y DUEÑO_LOCAL— y además es exactamente el permiso
// del contenido: movimientos de stock. Ninguno de los dos lo tienen CAJERO ni
// Mini, que es lo que se quería.
const PERMISO_VER_ACTIVIDAD = ["auditoria.ver", "stock.ver"];

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_VER_ACTIVIDAD);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }
    const session = auth.session;

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

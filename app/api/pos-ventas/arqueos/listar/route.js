// GET /api/pos-ventas/arqueos/listar?turnoId=N
//
// Historial de arqueos de un turno, para el detalle de caja. Solo lectura.
//
// Devuelve las métricas de `resumenHistorial`, que deliberadamente NO incluyen
// una "diferencia acumulada": sumar la diferencia de cada corte cuenta el mismo
// faltante una vez por arqueo posterior. Un faltante de $1.000 detectado a las
// 10:47 sigue faltando a las 12:25 y a las 14:03 — es el mismo, no $3.000.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { contextoArqueo, serializarArqueo } from "@/lib/caja/arqueoServer";
import { resumenHistorial } from "@/lib/caja/arqueo";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const turnoId = req.nextUrl.searchParams.get("turnoId");
    if (!turnoId) {
      return NextResponse.json({ ok: false, error: "turnoId requerido" }, { status: 400 });
    }

    // Turno cerrado incluido: el historial se consulta justamente después.
    const ctx = await contextoArqueo(req, { turnoId, exigirAbierto: false });
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }
    const { turno } = ctx;
    if (!turno) {
      return NextResponse.json({ ok: false, error: "Turno no encontrado" }, { status: 404 });
    }

    const [filas, postergaciones] = await Promise.all([
      prisma.arqueoCaja.findMany({
        // El turnoId ya vino validado contra el local en contextoArqueo.
        where: { turnoId: turno.id },
        orderBy: { fechaHora: "asc" },
        include: {
          realizadoPor: { select: { nombre: true } },
          usuario: { select: { nombre: true } },
          operador: { select: { nombre: true } },
        },
      }),
      prisma.arqueoPostergacion.count({ where: { turnoId: turno.id } }),
    ]);

    const arqueos = filas.map(serializarArqueo);

    return NextResponse.json({
      ok: true,
      turnoId: turno.id,
      arqueos,
      totalPostergaciones: postergaciones,
      resumen: resumenHistorial(arqueos),
    });
  } catch (error) {
    console.error("Error listando arqueos:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

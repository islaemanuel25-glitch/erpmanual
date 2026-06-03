// app/api/compras-proveedor/resumen/route.js
// Solo lectura: conteos de pedidos por estado para el panel de compras.
// No modifica datos. Filtra siempre por grupoId.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

const ESTADOS = ["BORRADOR", "CONFIRMADO", "ENVIADO", "RECIBIDO", "ANULADO"];

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const grupos = await prisma.pedidoProveedor.groupBy({
      by: ["estado"],
      where: { grupoId },
      _count: { _all: true },
    });

    // Conteos con default 0 para todos los estados.
    const conteos = ESTADOS.reduce((acc, e) => ({ ...acc, [e]: 0 }), {});
    for (const g of grupos) {
      if (g.estado in conteos) conteos[g.estado] = g._count._all;
    }

    const activos = conteos.BORRADOR + conteos.CONFIRMADO + conteos.ENVIADO;
    const historial = conteos.RECIBIDO + conteos.ANULADO;

    return NextResponse.json({ ok: true, conteos, activos, historial });
  } catch (err) {
    console.error("Error compras-proveedor/resumen:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

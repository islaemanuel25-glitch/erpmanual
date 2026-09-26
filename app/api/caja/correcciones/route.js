// GET /api/caja/correcciones
//
// Los manifiestos de corrección histórica de caja que hay en el repo, con su
// estado y si ya se aplicaron. No calcula ningún plan: para eso está el ensayo.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { PERMISO_CORREGIR_HISTORICO, ESTADO_MANIFIESTO } from "@/lib/caja/correcciones/plan";
import { MANIFIESTOS } from "@/lib/caja/correcciones/manifiestos";

export async function GET(req) {
  const perm = requirePerm(req, PERMISO_CORREGIR_HISTORICO);
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  try {
    const codigos = MANIFIESTOS.map((m) => m.codigo);
    const aplicadas = codigos.length
      ? await prisma.correccionCaja.findMany({
          where: { codigo: { in: codigos } },
          select: { codigo: true, manifiestoHash: true, ejecutadoEn: true, ejecutadoPorUsuarioId: true },
        })
      : [];
    const porCodigo = new Map(aplicadas.map((a) => [a.codigo, a]));

    return NextResponse.json({
      ok: true,
      items: MANIFIESTOS.map((m) => ({
        codigo: m.codigo,
        estado: m.estado,
        motivo: m.motivo,
        evidencia: m.evidencia,
        dependeDe: m.dependeDe ?? [],
        hashAutorizado: m.estado === ESTADO_MANIFIESTO.AUTORIZADO ? m.autorizacion?.hash ?? null : null,
        cantidadCorrecciones: Array.isArray(m.correcciones) ? m.correcciones.length : 0,
        aplicada: porCodigo.get(m.codigo) ?? null,
      })),
    });
  } catch (error) {
    console.error("Error listando correcciones de caja:", error);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer las correcciones de caja: ${error?.message || error}` },
      { status: 500 }
    );
  }
}

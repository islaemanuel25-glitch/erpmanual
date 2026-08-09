// POST /api/proveedores/listas/[id]/finalizar
//
// Cierra una importación por decisión del usuario.
//
// ── POR QUÉ HACE FALTA UN CIERRE EXPLÍCITO ──────────────────────────────────
//
// Desde que aplicar una tanda ya no cierra la importación, una lista con filas
// que nadie va a resolver —625 productos que el ERP no tiene, por ejemplo—
// quedaría abierta para siempre, ocupando el archivo y apareciendo como proceso
// vivo. Este endpoint es la forma de decir "con esto alcanza".
//
// Cerrar NO aplica nada: las filas pendientes quedan como estaban, sin costo
// escrito y sin resultado. Lo único que cambia es que la importación deja de
// aceptar trabajo nuevo y libera el archivo para una lista posterior.
//
// NO TOCA COSTOS, PRECIOS NI PRODUCTOS.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import {
  ESTADO_IMPORTACION,
  esImportacionAbierta,
  OPCIONES_TX,
} from "@/lib/proveedores/listas/persistencia";

export async function POST(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { session, grupoId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId) || importacionId <= 0) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, estado: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // Idempotente: cerrar algo ya cerrado es la misma intención, no un error.
    if (importacion.estado === ESTADO_IMPORTACION.APLICADA) {
      return NextResponse.json({ ok: true, yaFinalizada: true });
    }
    if (!esImportacionAbierta(importacion.estado)) {
      return NextResponse.json(
        { ok: false, error: "Esta importación no está abierta." },
        { status: 409 }
      );
    }

    const usuarioId = Number(session?.id ?? session?.userId) || null;

    const salida = await prisma.$transaction(async (tx) => {
      const actual = await tx.importacionListaProveedor.findUnique({
        where: { id: importacionId },
        select: { estado: true },
      });
      if (!esImportacionAbierta(actual.estado)) return { carrera: true };

      // Las pendientes quedan sin resultado a propósito: nadie decidió sobre
      // ellas, y marcarlas como omitidas diría que se evaluaron.
      const pendientes = await tx.importacionListaFila.count({
        where: {
          importacionId,
          aplicada: false,
          excluidaManual: false,
          estado: { in: ["LISTO_PARA_ACTUALIZAR", "NO_MACHEADO", "FACTOR_DUDOSO", "CODIGO_DUPLICADO"] },
        },
      });

      // Se limpia la selección: dejar filas marcadas en una importación cerrada
      // es una promesa que ya no se puede cumplir.
      const { count: desmarcadas } = await tx.importacionListaFila.updateMany({
        where: { importacionId, seleccionada: true },
        data: { seleccionada: false },
      });

      await tx.importacionListaProveedor.update({
        where: { id: importacionId },
        data: {
          // TERMINADA, no APLICADA. Son cosas distintas: aplicada la escribió el
          // motor cuando no quedaba nada pendiente; terminada la cerró una
          // persona diciendo "con esto alcanza". Y sobre todo, una TERMINADA se
          // puede revertir — que es la razón de que el estado exista.
          estado: ESTADO_IMPORTACION.TERMINADA,
          terminadaEn: new Date(),
          terminadaPorUsuarioId: usuarioId,
        },
      });

      return { pendientes, desmarcadas };
    }, OPCIONES_TX);

    if (salida.carrera) {
      return NextResponse.json({ ok: true, yaFinalizada: true });
    }

    return NextResponse.json({
      ok: true,
      yaFinalizada: false,
      // Cuántas quedaron sin resolver. Se informa para que el cierre sea
      // consciente y no una sorpresa después.
      pendientesSinResolver: salida.pendientes,
      desmarcadas: salida.desmarcadas,
      archivoLiberado: true,
    });
  } catch (e) {
    console.error("[listas/finalizar] error:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo finalizar la importación." },
      { status: 500 }
    );
  }
}

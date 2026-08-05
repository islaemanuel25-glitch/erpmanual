// POST /api/proveedores/listas/[id]/cancelar
//
// Cancela una importación que no sirve.
//
// ── QUÉ DESBLOQUEA ──────────────────────────────────────────────────────────
//
// Una importación equivocada dejaba al usuario sin salida: no se podía descartar
// ni borrar, seguía apareciendo como proceso activo, y el archivo quedaba
// bloqueado para siempre por el índice único —que no miraba el estado—. Volver a
// subir el mismo Excel corregido era imposible.
//
// Cancelar deja el registro como historial y libera el archivo: el índice único
// pasó a ser parcial y excluye las canceladas. La garantía contra carreras se
// mantiene, porque sigue sin poder haber dos importaciones VIVAS del mismo
// archivo.
//
// ── QUÉ NO TOCA ─────────────────────────────────────────────────────────────
//
// Ni un costo, ni un precio, ni un producto, ni un vínculo. Cancelar es una
// decisión sobre el PROCESO, no sobre los datos del catálogo. Las filas se
// conservan tal como estaban para poder explicar después qué proponía esta
// importación; lo único que se les toca es la marca de selección, porque una
// fila seleccionada dentro de un proceso cancelado es una contradicción.
//
// Una importación YA APLICADA no se cancela: sus costos están escritos y decir
// "cancelada" sobre eso sería mentir. Para revertir una aplicación hace falta
// otra herramienta, que todavía no existe.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { ESTADO_IMPORTACION, OPCIONES_TX } from "@/lib/proveedores/listas/persistencia";

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
      select: { id: true, estado: true, archivoNombre: true, canceladaEn: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // Idempotente: cancelar dos veces no es un error, es la misma intención.
    if (importacion.estado === ESTADO_IMPORTACION.CANCELADA) {
      return NextResponse.json({
        ok: true,
        yaCancelada: true,
        canceladaEn: importacion.canceladaEn,
      });
    }

    if (importacion.estado === ESTADO_IMPORTACION.APLICADA) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta importación ya se aplicó: sus costos están escritos y cancelarla no los revierte.",
        },
        { status: 409 }
      );
    }

    const usuarioId = Number(session?.id ?? session?.userId) || null;
    const ahora = new Date();

    const resultado = await prisma.$transaction(async (tx) => {
      // Chequeo repetido DENTRO de la transacción: entre la lectura de afuera y
      // esta escritura alguien pudo aplicarla desde otra pestaña, y cancelar
      // una aplicada dejaría el registro diciendo algo falso.
      const actual = await tx.importacionListaProveedor.findUnique({
        where: { id: importacionId },
        select: { estado: true },
      });
      if (actual.estado === ESTADO_IMPORTACION.APLICADA) return { carrera: true };
      if (actual.estado === ESTADO_IMPORTACION.CANCELADA) return { yaCancelada: true };

      // Las filas conservan su estado y sus números; solo se desmarcan.
      const { count } = await tx.importacionListaFila.updateMany({
        where: { importacionId, seleccionada: true },
        data: { seleccionada: false },
      });

      await tx.importacionListaProveedor.update({
        where: { id: importacionId },
        data: {
          estado: ESTADO_IMPORTACION.CANCELADA,
          canceladaEn: ahora,
          canceladaPorUsuarioId: usuarioId,
        },
      });

      return { desmarcadas: count };
    }, OPCIONES_TX);

    if (resultado.carrera) {
      return NextResponse.json(
        { ok: false, error: "La importación se aplicó mientras se cancelaba." },
        { status: 409 }
      );
    }
    if (resultado.yaCancelada) {
      return NextResponse.json({ ok: true, yaCancelada: true });
    }

    return NextResponse.json({
      ok: true,
      yaCancelada: false,
      canceladaEn: ahora,
      filasDesmarcadas: resultado.desmarcadas,
      archivoLiberado: true,
    });
  } catch (e) {
    console.error("[listas/cancelar] error:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo cancelar la importación." },
      { status: 500 }
    );
  }
}

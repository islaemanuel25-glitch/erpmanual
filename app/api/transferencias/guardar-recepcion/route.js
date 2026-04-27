// app/api/transferencias/guardar-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const { transferenciaId, items } = body;

    if (!transferenciaId || !Array.isArray(items)) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    // Scope: non-admin debe ser destino de la transferencia
    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      select: { destinoId: true, estado: true },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    if (transferencia.estado === "Recibida") {
      return NextResponse.json(
        { ok: false, error: "Esta transferencia ya fue confirmada. No se pueden guardar cambios." },
        { status: 400 }
      );
    }

    if (transferencia.estado !== "Enviada" && transferencia.estado !== "Recibiendo") {
      return NextResponse.json(
        { ok: false, error: `No se puede editar una transferencia en estado "${transferencia.estado}"` },
        { status: 400 }
      );
    }

    if (!session.esAdmin) {
      const localId = Number(session.localId || 0);
      if (!localId || localId !== transferencia.destinoId) {
        return NextResponse.json(
          { ok: false, error: "Sin permiso para esta transferencia" },
          { status: 403 }
        );
      }
    }

    // Validación — solo si hay diferencia
    for (const it of items) {
      const recibida = Number(it.recibido);
      const enviada = Number(it.enviado ?? it.cantidad);

      if (recibida !== enviada) {
        if (!it.motivoPrincipal) {
          return NextResponse.json(
            { ok: false, error: "Falta motivo en productos con diferencia" },
            { status: 400 }
          );
        }

        if (
          it.motivoPrincipal === "Otro" &&
          (!it.motivoDetalle || it.motivoDetalle.trim() === "")
        ) {
          return NextResponse.json(
            { ok: false, error: "Falta detalle en motivo 'Otro'" },
            { status: 400 }
          );
        }
      }
    }

    // Guardar cada item
    for (const it of items) {
      await prisma.transferenciaDetalle.update({
        where: { id: it.id },
        data: {
          recibido: Number(it.recibido),

          motivoPrincipal:
            Number(it.recibido) !== Number(it.enviado)
              ? it.motivoPrincipal || null
              : null,

          motivoDetalle:
            it.motivoPrincipal === "Otro" ? it.motivoDetalle || null : null,
        },
      });
    }

    await prisma.transferencia.update({
      where: { id: transferenciaId },
      data: { estado: "Recibiendo" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("ERROR guardar-recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

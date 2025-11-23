// app/api/transferencias/guardar-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { transferenciaId, items } = body;

    if (!transferenciaId || !Array.isArray(items)) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos" },
        { status: 400 }
      );
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

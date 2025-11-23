// app/api/pos-transferencias/crear/route.js
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
    const destinoId = Number(body.destinoId || 0);

    if (!destinoId) {
      return NextResponse.json(
        { ok: false, error: "destinoId requerido" },
        { status: 400 }
      );
    }

    // ==========================================================
    // VALIDAR DESTINO → debe ser un local (NO depósito)
    // ==========================================================
    const destino = await prisma.local.findUnique({
      where: { id: destinoId },
      select: { es_deposito: true },
    });

    if (!destino || destino.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "El destino debe ser un local (no depósito)" },
        { status: 400 }
      );
    }

    // ==========================================================
    // ORIGEN → depende del tipo de usuario (admin / depósito)
    // ==========================================================
    const isAdmin = !session.localId;
    let origenId = null;

    if (isAdmin) {
      // -------------------------
      // ADMIN: origen desde body
      // -------------------------
      origenId = Number(body.origenId || 0);

      if (!origenId) {
        return NextResponse.json(
          { ok: false, error: "origenId requerido para admin" },
          { status: 400 }
        );
      }

      const origen = await prisma.local.findUnique({
        where: { id: origenId },
        select: { es_deposito: true },
      });

      if (!origen || !origen.es_deposito) {
        return NextResponse.json(
          { ok: false, error: "El origen para admin debe ser un depósito válido" },
          { status: 400 }
        );
      }

    } else {
      // -------------------------
      // DEPÓSITO NORMAL
      // -------------------------
      origenId = Number(session.localId);

      const origen = await prisma.local.findUnique({
        where: { id: origenId },
        select: { es_deposito: true },
      });

      if (!origen || !origen.es_deposito) {
        return NextResponse.json(
          { ok: false, error: "El usuario no pertenece a un depósito" },
          { status: 400 }
        );
      }
    }

    // ==========================================================
    // CREAR POS BORRADOR
    // ==========================================================
    const pos = await prisma.posTransferencia.create({
      data: {
        origenId,
        destinoId,
        usuarioId: session.id,
        estado: "Borrador",
      },
    });

    return NextResponse.json({
      ok: true,
      item: pos,
      error: null,
    });

  } catch (err) {
    console.error("Error crear POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al crear POS" },
      { status: 500 }
    );
  }
}

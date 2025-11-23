// app/api/stock_locales/limites/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    const body = await req.json();

    // ======================================================
    // 0) SESSION + PERMISOS
    // ======================================================
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { permisos, localId: sessionLocalId } = session;
    const esAdmin = Array.isArray(permisos) && permisos.includes("*");

    if (!esAdmin && !permisos.includes("stock.editar")) {
      return NextResponse.json(
        { ok: false, error: "No tenés permisos para editar límites." },
        { status: 403 }
      );
    }

    // ======================================================
    // 1) ENTRADA
    // ======================================================
    const bodyLocalId = Number(body.localId || 0);
    const productoLocalId = Number(body.productoLocalId || 0);

    const nuevoMin =
      body.nuevoMin !== undefined ? Number(body.nuevoMin) : null;
    const nuevoMax =
      body.nuevoMax !== undefined ? Number(body.nuevoMax) : null;

    // ======================================================
    // 2) RESOLVER localId REAL
    // ======================================================
    let localId = 0;

    if (esAdmin && !sessionLocalId) {
      localId = bodyLocalId;
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "localId requerido para admin sin local." },
          { status: 400 }
        );
      }
    } else {
      localId = Number(sessionLocalId || 0);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "localId inválido en sesión." },
          { status: 400 }
        );
      }
    }

    if (!productoLocalId) {
      return NextResponse.json(
        { ok: false, error: "productoLocalId es requerido." },
        { status: 400 }
      );
    }

    // ======================================================
    // 3) VALIDAR PRODUCTO-LOCAL
    // ======================================================
    const prodLocal = await prisma.productoLocal.findUnique({
      where: { id: productoLocalId },
      select: { id: true, localId: true },
    });

    if (!prodLocal || prodLocal.localId !== localId) {
      return NextResponse.json(
        { ok: false, error: "Producto/local inválido." },
        { status: 404 }
      );
    }

    // ======================================================
    // 4) OBTENER O CREAR STOCKLOCAL
    // ======================================================
    let registro = await prisma.stockLocal.findUnique({
      where: {
        localId_productoId: { localId, productoId: productoLocalId },
      },
    });

    if (!registro) {
      registro = await prisma.stockLocal.create({
        data: {
          localId,
          productoId: productoLocalId,
          cantidad: 0,
          stockMin: nuevoMin ?? 0,
          stockMax: nuevoMax ?? 0,
        },
      });

      return NextResponse.json({
        ok: true,
        item: {
          id: registro.id,
          localId: registro.localId,
          productoId: registro.productoId,
          cantidad: Number(registro.cantidad || 0),
          stockMin: Number(registro.stockMin || 0),
          stockMax: Number(registro.stockMax || 0),
        },
      });
    }

    // ======================================================
    // 5) ACTUALIZAR LÍMITES
    // ======================================================
    const actualizado = await prisma.stockLocal.update({
      where: {
        localId_productoId: { localId, productoId: productoLocalId },
      },
      data: {
        stockMin: nuevoMin ?? registro.stockMin ?? 0,
        stockMax: nuevoMax ?? registro.stockMax ?? 0,
      },
    });

    return NextResponse.json({
      ok: true,
      item: {
        id: actualizado.id,
        localId: actualizado.localId,
        productoId: actualizado.productoId,
        cantidad: Number(actualizado.cantidad || 0),
        stockMin: Number(actualizado.stockMin || 0),
        stockMax: Number(actualizado.stockMax || 0),
      },
    });
  } catch (err) {
    console.error("❌ ERROR STOCK LIMITES:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

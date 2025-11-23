// app/api/stock_locales/ajustar/route.js
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

    // Permiso mínimo para ajustar stock
    if (!esAdmin && !permisos.includes("stock.editar")) {
      return NextResponse.json(
        { ok: false, error: "No tenés permisos para ajustar stock." },
        { status: 403 }
      );
    }

    // ======================================================
    // 1) ENTRADA
    // ======================================================
    const bodyLocalId = Number(body.localId || 0);
    const productoLocalId = Number(body.productoLocalId || 0);

    const modo = String(body.modo || "ajuste"); // "ajuste" | "limites"
    const tipo = String(body.tipo || "sumar");  // "sumar" | "restar"

    const cantidad =
      body.cantidad !== undefined ? Number(body.cantidad) : null;
    const nuevoMin =
      body.nuevoMin !== undefined ? Number(body.nuevoMin) : null;
    const nuevoMax =
      body.nuevoMax !== undefined ? Number(body.nuevoMax) : null;

    // ======================================================
    // 2) RESOLVER localId REAL SEGÚN PROTOCOLO
    // ======================================================
    let localId = 0;

    if (esAdmin && !sessionLocalId) {
      // Admin global sin local → localId viene por body
      localId = bodyLocalId;
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "localId requerido para admin sin local." },
          { status: 400 }
        );
      }
    } else {
      // Usuario con local asociado (depósito o local)
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
    // 3) VALIDAR QUE EL PRODUCTO PERTENECE A ESE LOCAL
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
    // 4) OBTENER O CREAR REGISTRO DE STOCKLOCAL
    // ======================================================
    let stock = await prisma.stockLocal.findUnique({
      where: { localId_productoId: { localId, productoId: productoLocalId } },
    });

    if (!stock) {
      stock = await prisma.stockLocal.create({
        data: {
          localId,
          productoId: productoLocalId,
          cantidad: 0,
          stockMin: 0,
          stockMax: 0,
        },
      });
    }

    // ======================================================
    // 5) MODO AJUSTE (sumar / restar cantidad)
    // ======================================================
    if (modo === "ajuste") {
      if (cantidad === null || Number.isNaN(cantidad)) {
        return NextResponse.json(
          { ok: false, error: "Cantidad inválida." },
          { status: 400 }
        );
      }

      const actual = Number(stock.cantidad || 0);
      let nuevoStock =
        tipo === "restar" ? actual - cantidad : actual + cantidad;

      if (nuevoStock < 0) nuevoStock = 0;

      const actualizado = await prisma.stockLocal.update({
        where: { localId_productoId: { localId, productoId: productoLocalId } },
        data: { cantidad: nuevoStock },
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
    }

    // ======================================================
    // 6) MODO LÍMITES (por compatibilidad, aunque tenés /limites)
    // ======================================================
    if (modo === "limites") {
      const actualizado = await prisma.stockLocal.update({
        where: { localId_productoId: { localId, productoId: productoLocalId } },
        data: {
          stockMin: nuevoMin ?? stock.stockMin ?? 0,
          stockMax: nuevoMax ?? stock.stockMax ?? 0,
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
    }

    return NextResponse.json(
      { ok: false, error: "Modo inválido." },
      { status: 400 }
    );
  } catch (err) {
    console.error("❌ ERROR AJUSTAR STOCK:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

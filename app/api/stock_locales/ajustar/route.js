// app/api/stock_locales/ajustar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";

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

    const perm = checkPerm(session, "stock.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const sessionLocalId = session.localId;
    const esAdmin = session.esAdmin;

    // ======================================================
    // 1) ENTRADA
    // ======================================================
    const bodyLocalId = Number(body.localId || 0);
    const productoLocalId = Number(body.productoLocalId || 0);

    const modo = String(body.modo || "ajuste");
    const tipo = String(body.tipo || "sumar");
    const motivo = (body.motivo || "").trim();

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

    // ======================================================
    // 2b) LEER CONFIG DE GRUPO (motivo obligatorio)
    // ======================================================
    const grupoId = await getGrupoIdDeLocal(localId);
    let requireMotivoAjuste = false;
    let requireMotivoLimites = false;
    let allowNegativeStock = false;
    if (grupoId) {
      const configGrupo = await prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { requireMotivoAjusteStock: true, requireMotivoLimitesStock: true, allowNegativeStock: true },
      });
      requireMotivoAjuste = configGrupo?.requireMotivoAjusteStock === true;
      requireMotivoLimites = configGrupo?.requireMotivoLimitesStock === true;
      allowNegativeStock = configGrupo?.allowNegativeStock === true;
    }

    if (modo === "ajuste" && requireMotivoAjuste && !motivo) {
      return NextResponse.json(
        { ok: false, error: "Motivo requerido para ajustar stock." },
        { status: 400 }
      );
    }

    if (modo === "limites" && requireMotivoLimites && !motivo) {
      return NextResponse.json(
        { ok: false, error: "Motivo requerido para modificar límites de stock." },
        { status: 400 }
      );
    }

    // ======================================================
    // 3) SABER SI ES DEPÓSITO
    // ======================================================
    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    const esDeposito = local.es_deposito === true;

    // ======================================================
    // 4) VALIDAR PRODUCTOLOCAL
    // ======================================================
    const prodLocal = await prisma.productoLocal.findUnique({
      where: { id: productoLocalId },
      select: { id: true, localId: true, base: { select: { es_combo: true } } },
    });

    if (!prodLocal || prodLocal.localId !== localId) {
      return NextResponse.json(
        { ok: false, error: "Producto/local inválido" },
        { status: 404 }
      );
    }

    // Guard combos: un combo no tiene stock físico propio; no se ajusta ni se le
    // crea StockLocal. Su disponibilidad se calcula desde los componentes.
    if (prodLocal.base?.es_combo === true) {
      return NextResponse.json(
        { ok: false, error: "Un combo no tiene stock propio: ajustá el stock de sus componentes." },
        { status: 400 }
      );
    }

    // ======================================================
    // 5) OBTENER O CREAR STOCK
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
    // 6) MODO AJUSTE
    // ======================================================
    if (modo === "ajuste") {
      if (cantidad === null || Number.isNaN(cantidad)) {
        return NextResponse.json(
          { ok: false, error: "Cantidad inválida" },
          { status: 400 }
        );
      }

      const actual = Number(stock.cantidad || 0);
      const cantidadReal = cantidad;

      let nuevoStock;
      if (tipo === "fijar") {
        nuevoStock = cantidadReal;
      } else if (tipo === "restar") {
        nuevoStock = actual - cantidadReal;
      } else {
        nuevoStock = actual + cantidadReal;
      }

      if (nuevoStock < 0 && !allowNegativeStock) nuevoStock = 0;

      const actualizado = await prisma.stockLocal.update({
        where: { localId_productoId: { localId, productoId: productoLocalId } },
        data: { cantidad: nuevoStock },
      });

      // Auditoría
      if (grupoId) {
        await prisma.auditoriaStock.create({
          data: {
            grupoId,
            localId,
            productoLocalId,
            userId: session.id,
            accion:
              tipo === "fijar"
                ? "AJUSTE_FIJAR"
                : tipo === "restar"
                ? "AJUSTE_RESTAR"
                : "AJUSTE_SUMAR",
            cantidadAnterior: actual,
            cantidadNueva: nuevoStock,
            motivo: motivo || null,
          },
        }).catch((e) => console.error("Error auditoría stock:", e.message));
      }

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
    // 7) MODO LIMITES
    // ======================================================
    if (modo === "limites") {
      const minAnterior = Number(stock.stockMin || 0);
      const maxAnterior = Number(stock.stockMax || 0);

      const actualizado = await prisma.stockLocal.update({
        where: { localId_productoId: { localId, productoId: productoLocalId } },
        data: {
          stockMin: nuevoMin ?? stock.stockMin ?? 0,
          stockMax: nuevoMax ?? stock.stockMax ?? 0,
        },
      });

      // Auditoría
      if (grupoId) {
        await prisma.auditoriaStock.create({
          data: {
            grupoId,
            localId,
            productoLocalId,
            userId: session.id,
            accion: "LIMITES",
            stockMinAnterior: minAnterior,
            stockMinNuevo: Number(actualizado.stockMin || 0),
            stockMaxAnterior: maxAnterior,
            stockMaxNuevo: Number(actualizado.stockMax || 0),
            motivo: motivo || null,
          },
        }).catch((e) => console.error("Error auditoría stock:", e.message));
      }

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
      { ok: false, error: "Modo inválido" },
      { status: 400 }
    );

  } catch (err) {
    console.error("❌ ERROR AJUSTAR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

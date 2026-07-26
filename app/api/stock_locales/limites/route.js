// app/api/stock_locales/limites/route.js
// ⚠️ REVISIÓN (refactor Stock — Etapa 1): hoy NO se consume desde el módulo
//    Stock Locales y DUPLICA la rama `modo: "limites"` de `ajustar/route.js`
//    (los modales usan `ajustar`). Candidato a unificar/eliminar en Etapa 3.
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
    const motivo = (body.motivo || "").trim();

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
    // 2b) LEER CONFIG DE GRUPO (motivo obligatorio)
    // ======================================================
    const grupoId = await getGrupoIdDeLocal(localId);
    if (grupoId) {
      const configGrupo = await prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { requireMotivoLimitesStock: true },
      });
      if (configGrupo?.requireMotivoLimitesStock === true && !motivo) {
        return NextResponse.json(
          { ok: false, error: "Motivo requerido para modificar límites de stock." },
          { status: 400 }
        );
      }
    }

    // ======================================================
    // 3) VALIDAR PRODUCTO-LOCAL
    // ======================================================
    const prodLocal = await prisma.productoLocal.findUnique({
      where: { id: productoLocalId },
      select: { id: true, localId: true, base: { select: { es_combo: true } } },
    });

    if (!prodLocal || prodLocal.localId !== localId) {
      return NextResponse.json(
        { ok: false, error: "Producto/local inválido." },
        { status: 404 }
      );
    }

    // Los combos no tienen stock físico: no se les fijan límites.
    if (prodLocal.base?.es_combo) {
      return NextResponse.json(
        { ok: false, error: "Los combos no tienen stock físico: operá sus componentes." },
        { status: 400 }
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

      // Auditoría para creación
      if (grupoId) {
        await prisma.auditoriaStock.create({
          data: {
            grupoId,
            localId,
            productoLocalId,
            userId: session.id,
            accion: "LIMITES",
            stockMinAnterior: 0,
            stockMinNuevo: Number(registro.stockMin || 0),
            stockMaxAnterior: 0,
            stockMaxNuevo: Number(registro.stockMax || 0),
            motivo: motivo || null,
          },
        }).catch((e) => console.error("Error auditoría stock:", e.message));
      }

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
    const minAnterior = Number(registro.stockMin || 0);
    const maxAnterior = Number(registro.stockMax || 0);

    const actualizado = await prisma.stockLocal.update({
      where: {
        localId_productoId: { localId, productoId: productoLocalId },
      },
      data: {
        stockMin: nuevoMin ?? registro.stockMin ?? 0,
        stockMax: nuevoMax ?? registro.stockMax ?? 0,
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
  } catch (err) {
    console.error("❌ ERROR STOCK LIMITES:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

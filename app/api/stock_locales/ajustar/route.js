// app/api/stock_locales/ajustar/route.js
//
// ── EL AJUSTE MANUAL NO SE MUEVE SIN RASTRO ─────────────────────────────────
//
// EL CRITERIO, escrito para que no se vuelva a decidir al revés:
//
//   Si la fila de `AuditoriaStock` no se puede escribir, EL STOCK NO SE MUEVE.
//   La escritura y su rastro van en la MISMA transacción, y sin `grupoId` la
//   operación se rechaza con 409 en vez de escribir a ciegas.
//
// POR QUÉ ACÁ Y NO EN OTRO LADO. Todos los demás movimientos de stock tienen un
// documento atrás que los explica: una transferencia tiene su remito, una venta
// tiene su ticket, una recepción tiene su pedido. Si se pierde el rastro, el
// movimiento igual se puede reconstruir desde el documento.
//
// El ajuste manual NO TIENE NINGUNO. Alguien entra, escribe un número y el stock
// cambia. La fila de auditoría —quién, cuándo, de cuánto a cuánto y con qué
// motivo— es la ÚNICA evidencia que queda de que eso pasó. Un ajuste sin rastro
// es indistinguible de un faltante.
//
// QUÉ HABÍA ANTES. Las dos escrituras corrían fuera de transacción y con
// `.catch(console.error)`: el stock cambiaba igual y el error se iba a un log
// que nadie mira. En transferencias se había decidido lo contrario —sin poder
// auditar, no hay devolución (`confirmar-recepcion/route.js:171-187`)— y nada
// explicaba la diferencia. Eran dos criterios opuestos para el mismo hecho.
//
// EL COSTO DE ESTA DECISIÓN, para que esté a la vista: si la tabla de auditoría
// falla, el ajuste de stock deja de funcionar. Es deliberado. Preferimos que se
// note y se arregle antes que acumular movimientos sin autor.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";

const TEXTO_SIN_AUDITORIA =
  "No se puede registrar el ajuste porque no se pudo determinar el grupo de la " +
  "ubicación, y sin eso no queda rastro de quién lo hizo. El stock no se tocó.";

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

      // EL AJUSTE NO SE MUEVE SIN RASTRO. Ver el criterio al pie del archivo.
      if (!grupoId) {
        return NextResponse.json(
          { ok: false, error: TEXTO_SIN_AUDITORIA },
          { status: 409 }
        );
      }

      const actualizado = await prisma.$transaction(async (tx) => {
        const upd = await tx.stockLocal.update({
          where: { localId_productoId: { localId, productoId: productoLocalId } },
          data: { cantidad: nuevoStock },
        });
        await tx.auditoriaStock.create({
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
        });
        return upd;
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
    // 7) MODO LIMITES
    // ======================================================
    if (modo === "limites") {
      const minAnterior = Number(stock.stockMin || 0);
      const maxAnterior = Number(stock.stockMax || 0);

      // Mismo criterio que el ajuste: sin rastro no se escribe.
      if (!grupoId) {
        return NextResponse.json(
          { ok: false, error: TEXTO_SIN_AUDITORIA },
          { status: 409 }
        );
      }

      const actualizado = await prisma.$transaction(async (tx) => {
        const upd = await tx.stockLocal.update({
          where: { localId_productoId: { localId, productoId: productoLocalId } },
          data: {
            stockMin: nuevoMin ?? stock.stockMin ?? 0,
            stockMax: nuevoMax ?? stock.stockMax ?? 0,
          },
        });
        await tx.auditoriaStock.create({
          data: {
            grupoId,
            localId,
            productoLocalId,
            userId: session.id,
            accion: "LIMITES",
            stockMinAnterior: minAnterior,
            stockMinNuevo: Number(upd.stockMin || 0),
            stockMaxAnterior: maxAnterior,
            stockMaxNuevo: Number(upd.stockMax || 0),
            motivo: motivo || null,
          },
        });
        return upd;
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

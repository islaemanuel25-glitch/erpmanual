// app/api/stock_locales/limites/route.js
// ⚠️ REVISIÓN (refactor Stock — Etapa 1): hoy NO se consume desde el módulo
//    Stock Locales y DUPLICA la rama `modo: "limites"` de `ajustar/route.js`
//    (los modales usan `ajustar`). Candidato a unificar/eliminar en Etapa 3.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import {
  esConfiguracion,
  interpretarLimite,
  valorAGuardar,
} from "@/lib/stock/limites";

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

    // Tres ramas y no dos: no vino / vino vacío / vino un número. Ver
    // `lib/stock/limites.js` — `Number(null)` y `Number("")` dan 0, y eso
    // convertía "sacá el límite" en "poné cero".
    const minPedido = interpretarLimite(body.nuevoMin);
    const maxPedido = interpretarLimite(body.nuevoMax);
    const nuevoMin = minPedido.valor;
    const nuevoMax = maxPedido.valor;

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
          // ── EL 0 SE GUARDA COMO 0, Y EL null COMO null ──────────────────
          //
          // Antes acá decía `nuevoMin ?? 0`, así que "no fijé mínimo" y "fijé
          // mínimo en cero" terminaban escritos igual. Con un 0 que ES un valor
          // configurado válido, eso borraba la diferencia justo en el endpoint
          // que existe para configurarla.
          stockMin: nuevoMin,
          stockMax: nuevoMax,
          // Pasar por acá ES configurar, aunque lo que se guarde sea un cero o
          // incluso un null: alguien abrió Límites y decidió. Ésta es la única
          // ruta que sella esta marca.
          limitesConfiguradosAt: new Date(),
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
            // La fila no existía, así que no había límite anterior. `null` dice
            // eso; un 0 diría "antes valía cero", que es otra cosa.
            stockMinAnterior: null,
            stockMinNuevo: registro.stockMin === null ? null : Number(registro.stockMin),
            stockMaxAnterior: null,
            stockMaxNuevo: registro.stockMax === null ? null : Number(registro.stockMax),
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
          stockMin: registro.stockMin === null ? null : Number(registro.stockMin),
          stockMax: registro.stockMax === null ? null : Number(registro.stockMax),
          limitesConfigurados: registro.limitesConfiguradosAt !== null,
        },
      });
    }

    // ======================================================
    // 5) ACTUALIZAR LÍMITES
    // ======================================================
    // El anterior conserva su null: `Number(null || 0)` daba 0 y la auditoría
    // decía "antes valía cero" sobre un límite que no existía.
    const minAnterior = registro.stockMin === null ? null : Number(registro.stockMin);
    const maxAnterior = registro.stockMax === null ? null : Number(registro.stockMax);

    const actualizado = await prisma.stockLocal.update({
      where: {
        localId_productoId: { localId, productoId: productoLocalId },
      },
      data: {
        // Lo que no vino no se toca; lo que vino vacío se borra; lo que vino como
        // número se guarda, cero incluido.
        stockMin: valorAGuardar(minPedido, minAnterior),
        stockMax: valorAGuardar(maxPedido, maxAnterior),
        // Se sella solo si el guardado pidió cambiar algo. Un PUT que no trae
        // ninguno de los dos campos no configuró nada y no debe marcar la fila.
        ...(esConfiguracion(minPedido, maxPedido)
          ? { limitesConfiguradosAt: new Date() }
          : {}),
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
          stockMinNuevo: actualizado.stockMin === null ? null : Number(actualizado.stockMin),
          stockMaxAnterior: maxAnterior,
          stockMaxNuevo: actualizado.stockMax === null ? null : Number(actualizado.stockMax),
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
        stockMin: actualizado.stockMin === null ? null : Number(actualizado.stockMin),
        stockMax: actualizado.stockMax === null ? null : Number(actualizado.stockMax),
        limitesConfigurados: actualizado.limitesConfiguradosAt !== null,
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

// app/api/pos-transferencias/nueva/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos_transferencias.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = new URL(req.url);

    // =====================================================
    // D1: SOPORTE ?posId=X (abrir POS existente)
    // =====================================================
    const posIdParam = Number(searchParams.get("posId") || 0);
    if (posIdParam) {
      const posExistente = await prisma.posTransferencia.findUnique({
        where: { id: posIdParam },
      });

      if (!posExistente) {
        return NextResponse.json(
          { ok: false, error: "POS no encontrada" },
          { status: 404 }
        );
      }

      // Scope: no-admin solo puede leer POS de su propio local (origen o destino).
      // LECTURA de recurso ajeno → 404 (no revelar existencia).
      if (
        !session.esAdmin &&
        Number(session.localId) !== posExistente.origenId &&
        Number(session.localId) !== posExistente.destinoId
      ) {
        return NextResponse.json(
          { ok: false, error: "POS no encontrada" },
          { status: 404 }
        );
      }

      if (posExistente.estado === "Enviado") {
        return NextResponse.json(
          { ok: false, error: "La POS ya fue enviada" },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        item: {
          id: posExistente.id,
          origenId: posExistente.origenId,
          destinoId: posExistente.destinoId,
          estado: posExistente.estado,
          origenManual: posExistente.origenManual,
          solicitadoAt: posExistente.solicitadoAt,
          createdAt: posExistente.createdAt,
          updatedAt: posExistente.updatedAt,
        },
        error: null,
      });
    }

    // =====================================================
    // FLUJO NORMAL: crear/obtener POS
    // =====================================================
    const isAdmin = !session.localId;
    let origenId = null;
    let destinoId = Number(searchParams.get("destinoId") || 0);

    if (isAdmin) {
      // ADMIN: requiere origenId + destinoId
      origenId = Number(searchParams.get("origenId") || 0);

      if (!origenId || !destinoId) {
        return NextResponse.json(
          { ok: false, error: "origenId y destinoId requeridos para admin" },
          { status: 400 }
        );
      }

      const origen = await prisma.local.findUnique({
        where: { id: origenId },
        select: { es_deposito: true },
      });

      if (!origen || !origen.es_deposito) {
        return NextResponse.json(
          { ok: false, error: "El origen del admin debe ser un depósito válido" },
          { status: 400 }
        );
      }
    } else {
      // USUARIO CON LOCAL
      const localId = Number(session.localId);
      const localUser = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });

      if (!localUser) {
        return NextResponse.json(
          { ok: false, error: "Local del usuario no encontrado" },
          { status: 400 }
        );
      }

      if (localUser.es_deposito) {
        // DEPÓSITO NORMAL: origen = su local, destino del param
        origenId = localId;

        if (!destinoId) {
          return NextResponse.json(
            { ok: false, error: "destinoId requerido" },
            { status: 400 }
          );
        }
      } else {
        // D2: LOCAL (no es depósito) → modo manual
        // destino = el local del usuario, origen = depósito del grupo
        destinoId = localId;

        const grupoId = await getGrupoIdDeLocal(localId);
        if (!grupoId) {
          return NextResponse.json(
            { ok: false, error: "El local no pertenece a ningún grupo" },
            { status: 400 }
          );
        }

        const grupoDeposito = await prisma.grupoDeposito.findFirst({
          where: { grupoId },
          select: { localId: true },
        });

        if (!grupoDeposito) {
          return NextResponse.json(
            { ok: false, error: "No se encontró un depósito para el grupo" },
            { status: 400 }
          );
        }

        origenId = grupoDeposito.localId;
      }
    }

    // =====================================================
    // VALIDAR DESTINO (debe ser local, no depósito)
    // =====================================================
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

    // =====================================================
    // VALIDAR QUE ORIGEN Y DESTINO ESTÉN EN EL MISMO GRUPO
    // =====================================================
    const grupoOrigen = await getGrupoIdDeLocal(origenId);
    const grupoDestino = await getGrupoIdDeLocal(destinoId);

    if (!grupoOrigen || !grupoDestino || grupoOrigen !== grupoDestino) {
      return NextResponse.json(
        { ok: false, error: "Origen y destino no pertenecen al mismo grupo" },
        { status: 400 }
      );
    }

    // =====================================================
    // OBTENER POS BORRADOR
    // =====================================================
    let pos = await prisma.posTransferencia.findFirst({
      where: {
        origenId,
        destinoId,
        usuarioId: session.id,
        estado: { in: ["Borrador", "Preparando"] },
      },
      orderBy: { createdAt: "desc" },
    });

    // =====================================================
    // SI NO EXISTE → CREAR UNO
    // =====================================================
    if (!pos) {
      pos = await prisma.posTransferencia.create({
        data: {
          origenId,
          destinoId,
          usuarioId: session.id,
          estado: "Borrador",
        },
      });
    }

    // =====================================================
    // RESPUESTA
    // =====================================================
    const item = {
      id: pos.id,
      origenId,
      destinoId,
      estado: pos.estado,
      origenManual: pos.origenManual,
      solicitadoAt: pos.solicitadoAt,
      createdAt: pos.createdAt,
      updatedAt: pos.updatedAt,
    };

    return NextResponse.json({
      ok: true,
      item,
      error: null,
    });

  } catch (err) {
    console.error("Error nueva POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al crear/obtener POS" },
      { status: 500 }
    );
  }
}

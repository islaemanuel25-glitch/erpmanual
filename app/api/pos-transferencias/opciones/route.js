// app/api/pos-transferencias/opciones/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { relacionesDelDeposito } from "@/lib/transferencias/relacionesDelDeposito";
import {
  destinosDeTransferencia,
  puedeRecibirTransferencias,
} from "@/lib/transferencias/destinosDeTransferencia";

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

    // ======================================================
    // 🔥 FIX IMPORTANTE AQUÍ
    // ======================================================
    // Antes: const isAdmin = !session.localId;
    // Ahora: admin real = permisos "*", y no tiene localId
    const isAdmin =
      Array.isArray(session.permisos) &&
      session.permisos.includes("*") &&
      !session.localId;

    // ======================================================
    // MODO DEPÓSITO
    // ======================================================
    if (!isAdmin) {
      const localId = Number(session.localId);

      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "Usuario sin local válido" },
          { status: 400 }
        );
      }

      // Validar depósito
      const deposito = await prisma.local.findUnique({
        where: { id: localId },
        select: { id: true, nombre: true, es_deposito: true },
      });

      // Grupo del local/depósito
      const grupoId = await getGrupoIdDeLocal(localId);
      if (!grupoId) {
        return NextResponse.json(
          { ok: false, error: "El local no pertenece a ningún grupo" },
          { status: 400 }
        );
      }

      if (deposito.es_deposito) {
        // ── MODO DEPÓSITO: LOS DESTINOS SALEN DE LA PUERTA DE TRANSFERENCIAS ──
        //
        // Antes era `getLocalesDeGrupo(grupoId)`, que devuelve TODAS las filas
        // de `GrupoLocal` sin filtrar nada. Eso tenía dos agujeros:
        //
        //   · un local DADO DE BAJA se ofrecía como destino de una operación
        //     nueva — empezar a mover mercadería contra algo que ya no opera;
        //   · el "EXCLUYE depósitos" que dice su comentario no es un filtro,
        //     es una creencia: se cumple solo porque los depósitos viven en
        //     `GrupoDeposito`. El día que uno quede vinculado por las dos
        //     tablas, el depósito se ofrecería a sí mismo.
        //
        // Ahora la lista y el criterio son los MISMOS que usa la lista de
        // trabajo. Dos pantallas, una puerta.
        //
        // `getLocalesDeGrupo` sigue existiendo y NO se tocó: sus otros tres
        // consumidores la usan para replicar el CATÁLOGO, que es otra pregunta.
        // El porqué está en `lib/transferencias/destinosDeTransferencia.js`.
        const { locales } = await relacionesDelDeposito(grupoId);
        const destinos = destinosDeTransferencia(locales, { depositoLocalId: localId });

        return NextResponse.json({
          ok: true,
          modo: "deposito",
          origen: {
            id: deposito.id,
            nombre: deposito.nombre,
            esDeposito: true,
            grupoId,
          },
          destinos: destinos.map((l) => ({
            id: l.id,
            nombre: l.nombre,
            esDeposito: false,
            grupoId,
          })),
          error: null,
        });
      }

      // MODO LOCAL: resolver depósito del grupo
      const grupoDeposito = await prisma.grupoDeposito.findFirst({
        where: { grupoId },
        include: { local: { select: { id: true, nombre: true } } },
      });

      if (!grupoDeposito) {
        return NextResponse.json(
          { ok: false, error: "No se encontró un depósito para el grupo" },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        modo: "local",
        local: {
          id: deposito.id,
          nombre: deposito.nombre,
          grupoId,
        },
        deposito: {
          id: grupoDeposito.local.id,
          nombre: grupoDeposito.local.nombre,
        },
        error: null,
      });
    }

    // ======================================================
    // MODO ADMIN
    // ======================================================
    const grupos = await prisma.grupo.findMany({
      orderBy: { nombre: "asc" },
      include: {
        locales: { include: { local: true } },        // GrupoDeposito
        localesGrupo: { include: { local: true } },   // GrupoLocal
      },
    });

    const payload = grupos.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      depositos: g.locales
        .map((rel) => rel.local)
        .filter((l) => l.es_deposito)
        .map((l) => ({
          id: l.id,
          nombre: l.nombre,
          esDeposito: true,
        })),
      // El admin elige el destino de la misma lista, así que le corre el mismo
      // criterio: un local dado de baja no se ofrece por ser admin quien mira.
      // El `include: { local: true }` de arriba trae la fila entera, así que
      // `activo` está — que es lo que `puedeRecibirTransferencias` exige.
      locales: g.localesGrupo
        .map((rel) => rel.local)
        .filter((l) => puedeRecibirTransferencias(l))
        .map((l) => ({
          id: l.id,
          nombre: l.nombre,
          esDeposito: false,
        })),
    }));

    return NextResponse.json({
      ok: true,
      modo: "admin",
      grupos: payload,
      error: null,
    });

  } catch (err) {
    console.error("Error en opciones POS:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno en opciones" },
      { status: 500 }
    );
  }
}

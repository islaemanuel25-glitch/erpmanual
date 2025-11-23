// app/api/pos-transferencias/opciones/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getGrupoIdDeLocal, getLocalesDeGrupo } from "@/lib/grupos";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
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

      if (!deposito || !deposito.es_deposito) {
        return NextResponse.json(
          { ok: false, error: "El usuario no pertenece a un depósito" },
          { status: 400 }
        );
      }

      // Grupo del depósito
      const grupoId = await getGrupoIdDeLocal(localId);
      if (!grupoId) {
        return NextResponse.json(
          { ok: false, error: "El depósito no pertenece a ningún grupo" },
          { status: 400 }
        );
      }

      // Locales destino del grupo
      const destinos = await getLocalesDeGrupo(grupoId);

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
      locales: g.localesGrupo
        .map((rel) => rel.local)
        .filter((l) => !l.es_deposito)
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

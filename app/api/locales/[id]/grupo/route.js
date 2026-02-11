import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { inheritDepositoProductsToLocal } from "@/lib/grupos";

// ========================================================
// GET /api/locales/:id/grupo  → devuelve grupo y tipo
// ========================================================
export async function GET(req, context) {
  try {
    const { id } = await context.params;
    const localId = Number(id);

    if (!localId || Number.isNaN(localId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // 1) Buscar si es depósito
    const deposito = await prisma.grupoDeposito.findFirst({
      where: { localId },
      include: { grupo: true },
    });

    if (deposito) {
      return NextResponse.json({
        ok: true,
        tipo: "deposito",
        grupo: deposito.grupo,
      });
    }

    // 2) Buscar si es local normal
    const local = await prisma.grupoLocal.findFirst({
      where: { localId },
      include: { grupo: true },
    });

    if (local) {
      return NextResponse.json({
        ok: true,
        tipo: "local",
        grupo: local.grupo,
      });
    }

    return NextResponse.json({
      ok: false,
      error: "El local no está asignado a ningún grupo",
    });
  } catch (e) {
    console.error("GET /locales/[id]/grupo ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// ========================================================
// POST /api/locales/:id/grupo  → asignar a un grupo + heredar
// Body: { grupoId: number }
// ========================================================
export async function POST(req, context) {
  try {
    const { id } = await context.params;
    const localId = Number(id);

    if (!localId || Number.isNaN(localId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const grupoId = Number(body?.grupoId);

    if (!grupoId || Number.isNaN(grupoId)) {
      return NextResponse.json(
        { ok: false, error: "grupoId es obligatorio" },
        { status: 400 }
      );
    }

    const grupo = await prisma.grupo.findUnique({
      where: { id: grupoId },
      select: { id: true },
    });
    if (!grupo) {
      return NextResponse.json(
        { ok: false, error: "Grupo no encontrado" },
        { status: 404 }
      );
    }

    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { id: true, nombre: true, es_deposito: true, activo: true },
    });
    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    const yaEnGrupoLocal = await prisma.grupoLocal.findFirst({
      where: { localId },
      select: { id: true, grupoId: true },
    });
    const yaEnGrupoDeposito = await prisma.grupoDeposito.findFirst({
      where: { localId },
      select: { id: true, grupoId: true },
    });

    if (yaEnGrupoLocal || yaEnGrupoDeposito) {
      return NextResponse.json(
        {
          ok: false,
          error: "El local ya está asignado a un grupo",
          meta: {
            grupoId:
              yaEnGrupoLocal?.grupoId ?? yaEnGrupoDeposito?.grupoId ?? null,
          },
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      if (local.es_deposito) {
        const existeDeposito = await tx.grupoDeposito.findFirst({
          where: { grupoId },
          select: { id: true },
        });
        if (existeDeposito) {
          return {
            ok: false,
            status: 409,
            error: "El grupo ya tiene un depósito asignado",
          };
        }

        await tx.grupoDeposito.create({
          data: { grupoId, localId },
        });

        return { ok: true, tipo: "deposito", inherited: 0 };
      }

      await tx.grupoLocal.create({
        data: { grupoId, localId },
      });

      // NOTA: en POST lo dejamos como estaba (no crítico) si querés.
      let inherited = 0;
      try {
        const r = await inheritDepositoProductsToLocal(tx, grupoId, localId);
        inherited = r?.inherited ?? 0;
      } catch (e) {
        console.warn(`⚠️ Herencia falló en asignación de grupo: ${e.message}`);
      }

      return { ok: true, tipo: "local", inherited };
    });

    if (result?.ok === false) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        localId,
        grupoId,
        tipo: result.tipo,
        inherited: result.inherited,
      },
    });
  } catch (e) {
    console.error("POST /locales/[id]/grupo ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// ========================================================
// PUT /api/locales/:id/grupo  → mover/trasladar local a otro grupo
// Body: { grupoId: number }
// REGLA: en traslado, la herencia es OBLIGATORIA.
// Si falla herencia → rollback (no se mueve el local).
// ========================================================
export async function PUT(req, context) {
  try {
    const { id } = await context.params;
    const localId = Number(id);

    if (!localId || Number.isNaN(localId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const grupoId = Number(body?.grupoId);

    if (!grupoId || Number.isNaN(grupoId)) {
      return NextResponse.json(
        { ok: false, error: "grupoId es obligatorio" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const local = await tx.local.findUnique({
        where: { id: localId },
        select: { id: true, nombre: true, es_deposito: true },
      });

      if (!local) {
        const err = new Error("Local no encontrado");
        err.code = "NOT_FOUND_LOCAL";
        throw err;
      }

      if (local.es_deposito) {
        const err = new Error(
          "No se puede mover un depósito a otro grupo por este endpoint"
        );
        err.code = "BAD_REQUEST_DEPOSITO";
        throw err;
      }

      const grupo = await tx.grupo.findUnique({
        where: { id: grupoId },
        select: { id: true },
      });

      if (!grupo) {
        const err = new Error("Grupo no encontrado");
        err.code = "NOT_FOUND_GRUPO";
        throw err;
      }

      // eliminar relación previa
      await tx.grupoLocal.deleteMany({ where: { localId } });

      // asignar al nuevo grupo
      await tx.grupoLocal.create({ data: { grupoId, localId } });

      // ✅ herencia OBLIGATORIA: si falla, rollback
      const r = await inheritDepositoProductsToLocal(tx, grupoId, localId);
      const inherited = r?.inherited ?? 0;

      return { localId, grupoId, inherited };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    console.error("PUT /locales/[id]/grupo ERROR:", e);

    if (e?.code === "NOT_FOUND_LOCAL" || e?.code === "NOT_FOUND_GRUPO") {
      return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
    }

    if (e?.code === "BAD_REQUEST_DEPOSITO") {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }

    // Errores de herencia: depósito inexistente / etc.
    if (typeof e?.message === "string" && e.message.includes("depósito")) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, error: e.message || "Error interno" },
      { status: 500 }
    );
  }
}

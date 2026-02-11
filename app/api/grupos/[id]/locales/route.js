import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { inheritDepositoProductsToLocal } from "@/lib/grupos";

// GET → obtener locales del grupo
export async function GET(req, context) {
  try {
    const { id } = await context.params;
    const grupoId = Number(id);

    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const rows = await prisma.grupoLocal.findMany({
      where: { grupoId },
      include: { local: true },
      orderBy: { id: "asc" },
    });

    // 🔥 FIX: convertir snake_case → camelCase en la respuesta
    const data = rows.map((r) => ({
      ...r,
      local: {
        ...r.local,
        esDeposito: r.local.es_deposito, // 🔥 único cambio correcto
      },
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("GET grupo/locales ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// POST → agregar local (NO depósito)
export async function POST(req, context) {
  try {
    const { id } = await context.params;
    const grupoId = Number(id);

    const { localId } = await req.json();

    if (!grupoId || !localId) {
      return NextResponse.json(
        { ok: false, error: "IDs requeridos" },
        { status: 400 }
      );
    }

    const local = await prisma.local.findUnique({
      where: { id: Number(localId) },
    });

    // 🔥 NO usar local.es_deposito dentro del código.
    if (!local || local.es_deposito) {
      return NextResponse.json(
        {
          ok: false,
          error: "El local no existe o es depósito",
        },
        { status: 400 }
      );
    }

    // ✅ Crear GrupoLocal y heredar productos en transacción
    const resultado = await prisma.$transaction(async (tx) => {
      const creado = await tx.grupoLocal.create({
        data: { grupoId, localId: Number(localId) },
        include: { local: true },
      });

      // Heredar productos del depósito (NO crítico: no hace rollback si falla)
      try {
        await inheritDepositoProductsToLocal(tx, grupoId, Number(localId));
      } catch (e) {
        console.warn(`⚠️ No se pudieron heredar productos: ${e.message}`);
      }

      return creado;
    });

    const creado = resultado;

    // mapear snake → camel
    const data = {
      ...creado,
      local: {
        ...creado.local,
        esDeposito: creado.local.es_deposito,
      },
    };

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        {
          ok: false,
          error: "El local ya está en el grupo",
        },
        { status: 409 }
      );
    }

    console.error("POST grupo/locales ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// DELETE → quitar local del grupo
export async function DELETE(req, context) {
  try {
    const { id } = await context.params;
    const grupoId = Number(id);

    const { localId } = await req.json();

    if (!grupoId || !localId) {
      return NextResponse.json(
        { ok: false, error: "IDs requeridos" },
        { status: 400 }
      );
    }

    await prisma.grupoLocal.deleteMany({
      where: { grupoId, localId: Number(localId) },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE grupo/locales ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

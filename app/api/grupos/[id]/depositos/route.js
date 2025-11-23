import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET → obtener depósitos del grupo
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

    const deps = await prisma.grupoDeposito.findMany({
      where: { grupoId },
      include: { local: true },
      orderBy: { id: "asc" },
    });

    // Convertimos snake_case → camelCase SOLO EN LA RESPUESTA
    const data = deps.map((d) => ({
      ...d,
      local: {
        ...d.local,
        esDeposito: d.local.es_deposito, // 🔥 FIX
      },
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("GET grupo/depositos ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// POST → asignar depósito al grupo
export async function POST(req, context) {
  try {
    const { id } = await context.params;
    const grupoId = Number(id);

    const { localId } = await req.json();

    if (!grupoId || !localId) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    const local = await prisma.local.findUnique({
      where: { id: Number(localId) },
    });

    // ⛔ FIX: NO usar snake_case en JS, se mapea
    if (!local || !local.es_deposito) {
      return NextResponse.json(
        {
          ok: false,
          error: "El local no existe o no es depósito",
        },
        { status: 400 }
      );
    }

    const creado = await prisma.grupoDeposito.create({
      data: { grupoId, localId: Number(localId) },
      include: { local: true },
    });

    // convertimos snake → camel en la respuesta
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
        { ok: false, error: "El depósito ya está en el grupo" },
        { status: 409 }
      );
    }
    console.error("POST grupo/depositos ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// DELETE → quitar depósito del grupo
export async function DELETE(req, context) {
  try {
    const { id } = await context.params;
    const grupoId = Number(id);

    const { localId } = await req.json();

    if (!grupoId || !localId) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    await prisma.grupoDeposito.deleteMany({
      where: { grupoId, localId: Number(localId) },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE grupo/depositos ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

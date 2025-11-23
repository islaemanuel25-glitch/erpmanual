import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// ========================================================
// GET /api/locales  → listar todos
// ========================================================
export async function GET() {
  try {
    const locales = await prisma.local.findMany({
      select: {
        id: true,
        nombre: true,
        tipo: true,
        direccion: true,
        telefono: true,
        email: true,
        cuil: true,
        ciudad: true,
        provincia: true,
        codigoPostal: true,
        activo: true,
        es_deposito: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, data: locales });
  } catch (e) {
    console.error("GET LOCALES ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error al listar locales" },
      { status: 500 }
    );
  }
}

// ========================================================
// POST /api/locales  → crear local o depósito
// - Si viene grupoId → asignamos ese grupo
// - Si NO viene → creamos grupo nuevo automático
// ========================================================
export async function POST(req) {
  try {
    const body = await req.json();

    const {
      nombre,
      tipo = "local",
      direccion = null,
      telefono = null,
      email = null,
      cuil = null,
      ciudad = null,
      provincia = null,
      codigoPostal = null,
      activo = true,
      es_deposito = false,
      grupoId = null,
    } = body;

    if (!nombre?.trim()) {
      return NextResponse.json(
        { ok: false, error: "El nombre es obligatorio" },
        { status: 400 }
      );
    }

    // ✅ 1) Crear el local
    const nuevoLocal = await prisma.local.create({
      data: {
        nombre: nombre.trim(),
        tipo: tipo === "deposito" ? "deposito" : "local",
        direccion,
        telefono,
        email,
        cuil,
        ciudad,
        provincia,
        codigoPostal,
        activo,
        es_deposito: tipo === "deposito",
      },
    });

    let finalGroupId = grupoId ? Number(grupoId) : null;

    // ✅ 2) Si NO viene grupoId → crear grupo automático
    if (!finalGroupId) {
      const autoGroup = await prisma.grupo.create({
        data: {
          nombre: `Grupo ${nuevoLocal.nombre}`,
        },
      });

      finalGroupId = autoGroup.id;
    }

    // ✅ 3) Asignar el local al grupo correspondiente
    if (nuevoLocal.es_deposito) {
      await prisma.grupoDeposito.create({
        data: {
          grupoId: finalGroupId,
          localId: nuevoLocal.id,
        },
      });
    } else {
      await prisma.grupoLocal.create({
        data: {
          grupoId: finalGroupId,
          localId: nuevoLocal.id,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: { ...nuevoLocal, asignadoAGrupo: finalGroupId },
    });
  } catch (e) {
    console.error("CREAR LOCAL ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error al crear local" },
      { status: 500 }
    );
  }
}

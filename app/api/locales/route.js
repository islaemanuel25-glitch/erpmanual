// app/api/locales/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { inheritDepositoProductsToLocal } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";

// ========================================================
// GET /api/locales  → listar todos
// ========================================================
export async function GET(req) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

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
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

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
      es_deposito = false, // (se ignora: se deriva de tipo)
      grupoId = null,
    } = body;

    if (!nombre?.trim()) {
      return NextResponse.json(
        { ok: false, error: "El nombre es obligatorio" },
        { status: 400 }
      );
    }

    // ✅ Crear local + asignación a grupo + herencia dentro de una transacción
    const resultado = await prisma.$transaction(async (tx) => {
      // 1) Crear local
      const nuevoLocal = await tx.local.create({
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

      // 2) Si NO viene grupoId → crear grupo automático
      if (!finalGroupId) {
        const autoGroup = await tx.grupo.create({
          data: { nombre: `Grupo ${nuevoLocal.nombre}` },
        });
        finalGroupId = autoGroup.id;
      }

      // 3) Asignar el local al grupo correspondiente
      if (nuevoLocal.es_deposito) {
        await tx.grupoDeposito.create({
          data: {
            grupoId: finalGroupId,
            localId: nuevoLocal.id,
          },
        });
      } else {
        await tx.grupoLocal.create({
          data: {
            grupoId: finalGroupId,
            localId: nuevoLocal.id,
          },
        });

        // 4) Heredar productos del depósito (NO crítico: no hace rollback si falla)
        try {
          await inheritDepositoProductsToLocal(tx, finalGroupId, nuevoLocal.id);
        } catch (e) {
          console.warn(`⚠️ No se pudieron heredar productos: ${e.message}`);
        }
      }

      return { nuevoLocal, finalGroupId };
    });

    const { nuevoLocal, finalGroupId } = resultado;

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

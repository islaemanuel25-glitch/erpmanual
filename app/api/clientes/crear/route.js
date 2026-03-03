import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "clientes.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { nombre, documento, telefono, email, direccion, observaciones, limiteCredito, descuentoPorcentaje } = await req.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const cliente = await prisma.cliente.create({
      data: {
        grupoId,
        localId,
        nombre: nombre.trim(),
        documento: documento?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        direccion: direccion?.trim() || null,
        observaciones: observaciones?.trim() || null,
        limiteCredito: limiteCredito !== "" && limiteCredito != null ? Number(limiteCredito) : null,
        descuentoPorcentaje: descuentoPorcentaje !== "" && descuentoPorcentaje != null ? Number(descuentoPorcentaje) : null,
      },
    });

    return NextResponse.json({ ok: true, cliente });
  } catch (error) {
    console.error("Error creando cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

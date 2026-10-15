import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { crearEmpleadoDeOperador } from "@/lib/empleados/empleadosServer";
import { ERROR_EMPLEADO_REPETIDO, ERROR_NO_SE_MUDA, ERROR_OPERADOR_REPETIDO, pideOtroLocal } from "@/lib/empleados/empleados";

/** El empleado del mismo nombre ya tiene otro operador: no se crea ninguno. */
class EmpleadoConOtroOperador extends Error {}

export async function POST(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // UN OPERADOR ES DE UN LOCAL: el activo. No se elige en el pedido.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error, needsContexto: scope.needsContexto === true }, { status: scope.status });
    }
    const localId = scope.localId;

    const body = await req.json().catch(() => ({}));
    if (pideOtroLocal(body)) {
      return NextResponse.json({ ok: false, error: ERROR_NO_SE_MUDA }, { status: 400 });
    }
    const { nombre, pin } = body;

    if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
      return NextResponse.json({ ok: false, error: "El nombre debe tener al menos 2 caracteres." }, { status: 400 });
    }
    if (!pin || String(pin).length < 4) {
      return NextResponse.json({ ok: false, error: "El PIN debe tener al menos 4 dígitos." }, { status: 400 });
    }

    const nombreNorm = nombre.trim();

    // El nombre es único DENTRO del local: dos locales pueden tener un "Juan".
    const existente = await prisma.operadorLocal.findUnique({
      where: { localId_nombre: { localId, nombre: nombreNorm } },
      select: { id: true },
    });
    if (existente) {
      return NextResponse.json({ ok: false, error: ERROR_OPERADOR_REPETIDO }, { status: 409 });
    }

    const pinHash = await bcrypt.hash(String(pin), 10);

    // Todo operador es empleado: nace con el suyo, en el mismo local y en la
    // misma transacción.
    const operador = await prisma.$transaction(async (tx) => {
      const creado = await tx.operadorLocal.create({
        data: { nombre: nombreNorm, pinHash, localId },
        select: { id: true, nombre: true, activo: true, localId: true, createdAt: true },
      });
      const empleado = await crearEmpleadoDeOperador(tx, { operadorId: creado.id, nombre: creado.nombre, localId });
      if (!empleado) throw new EmpleadoConOtroOperador();
      return creado;
    });

    return NextResponse.json({ ok: true, operador });
  } catch (e) {
    if (e instanceof EmpleadoConOtroOperador) {
      return NextResponse.json({ ok: false, error: ERROR_EMPLEADO_REPETIDO }, { status: 409 });
    }
    // Otro alta con el mismo nombre en el mismo local, al mismo tiempo.
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: ERROR_OPERADOR_REPETIDO }, { status: 409 });
    }
    console.error("operador/crear:", e);
    return NextResponse.json({ ok: false, error: `No se pudo crear el operador: ${e.message}` }, { status: 500 });
  }
}

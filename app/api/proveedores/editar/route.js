import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorEditableWhere } from "@/lib/visibilidad";

export async function PUT(req) {
  try {
    // El permiso, como el resto del sistema; acá decía `requireAdmin` escrito a
    // mano. El admin pasa igual: tiene el comodín.
    const auth = requirePerm(req, "proveedores.editar");
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      id,
      nombre,
      cuit,
      telefono,
      email,
      direccion,
      dias_pedido = [],
      activo,
    } = body;

    const numId = Number(id);
    if (!numId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    if (!nombre || nombre.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    // Normalizar dias_pedido contra el enum DiaPedido (sin acentos).
    // Acepta inputs viejos con acento ("Miércoles", "Sábado") y filtra falsy/inválidos.
    const DIAS_VALIDOS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
    const ACENTOS_LEGACY = { "Miércoles": "Miercoles", "Sábado": "Sabado" };

    const diasEnum = (Array.isArray(dias_pedido) ? dias_pedido : [])
      .map((d) => ACENTOS_LEGACY[d] || d)
      .filter((d) => DIAS_VALIDOS.includes(d));

    // ── SOLO LO PROPIO ─────────────────────────────────────────────────────
    //
    // Cada local tiene sus propios proveedores. Sin el comodín se edita solo uno
    // creado en el local de la sesión, aunque el id venga escrito a mano: el
    // `where` lo pone el predicado de escritura, no el request. Uno de otro
    // local o del depósito contesta 403 y no se toca.
    const scope = await resolveLocalAndGrupo(req);
    if (!session.esAdmin && scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const propio = await prisma.proveedor.findFirst({
      where: { id: numId, ...proveedorEditableWhere(scope.localId, session.esAdmin) },
      select: { id: true },
    });
    if (!propio) {
      return NextResponse.json(
        {
          ok: false,
          error: session.esAdmin
            ? "Proveedor no encontrado"
            : "Ese proveedor no es de este local. Cada local tiene sus propios proveedores.",
        },
        { status: session.esAdmin ? 404 : 403 }
      );
    }

    const item = await prisma.proveedor.update({
      where: { id: propio.id },
      data: {
        nombre: nombre.trim(),
        cuit: cuit || null,
        telefono: telefono || null,
        email: email || null,
        direccion: direccion || null,
        dias_pedido: diasEnum,
        activo: Boolean(activo),
      },
    });

    return NextResponse.json({ ok: true, item });

  } catch (e) {
    console.error("Error EDITAR PROVEEDOR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

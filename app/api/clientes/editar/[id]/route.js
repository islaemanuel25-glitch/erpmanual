import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function PUT(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "clientes.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const body = await req.json();
    const { nombre, documento, telefono, email, direccion, observaciones, limiteCredito, descuentoPorcentaje, listaPrecioId } = body;

    const clienteExistente = await prisma.cliente.findFirst({
      where: { id: Number(id), localId, grupoId },
      select: { id: true, listaPrecioId: true },
    });

    if (!clienteExistente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado para este local" },
        { status: 404 }
      );
    }

    const esEdicionCompleta =
      nombre !== undefined ||
      documento !== undefined ||
      telefono !== undefined ||
      email !== undefined ||
      direccion !== undefined ||
      observaciones !== undefined;

    if (esEdicionCompleta && (!nombre || !nombre.trim())) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    // Validar listaPrecioId si vino en el body
    const tieneListaPrecio = Object.prototype.hasOwnProperty.call(body, "listaPrecioId");
    let listaPrecioIdFinal = undefined;
    if (tieneListaPrecio) {
      if (listaPrecioId === null) {
        listaPrecioIdFinal = null;
      } else if (typeof listaPrecioId === "number") {
        const esMismaQueActual = clienteExistente.listaPrecioId === listaPrecioId;
        if (esMismaQueActual) {
          // No re-validar activo si es la misma lista que ya tenía
          listaPrecioIdFinal = listaPrecioId;
        } else {
          const lp = await prisma.listaPrecio.findFirst({
            where: { id: listaPrecioId, grupoId, activo: true },
            select: { id: true },
          });
          if (!lp) {
            return NextResponse.json(
              { ok: false, error: "Lista de precios inválida o de otro grupo" },
              { status: 400 }
            );
          }
          listaPrecioIdFinal = listaPrecioId;
        }
      } else {
        // Tipo inesperado: ignorar (no actualizar)
        listaPrecioIdFinal = undefined;
      }
    }

    const limiteVal = limiteCredito !== "" && limiteCredito != null ? Number(limiteCredito) : null;
    const descuentoVal = descuentoPorcentaje !== "" && descuentoPorcentaje != null ? Number(descuentoPorcentaje) : null;

    const dataCompleta = {
      nombre: nombre.trim(),
      documento: documento?.trim() || null,
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
      direccion: direccion?.trim() || null,
      observaciones: observaciones?.trim() || null,
      limiteCredito: limiteVal,
      activo: body.activo,
    };
    if (descuentoPorcentaje !== undefined) {
      dataCompleta.descuentoPorcentaje = descuentoVal;
    }

    const dataSimple = { activo: body.activo };
    if (descuentoPorcentaje !== undefined) {
      dataSimple.descuentoPorcentaje = descuentoVal;
    }

    if (listaPrecioIdFinal !== undefined) {
      dataCompleta.listaPrecioId = listaPrecioIdFinal;
      dataSimple.listaPrecioId = listaPrecioIdFinal;
    }

    const cliente = await prisma.cliente.update({
      where: { id: Number(id), localId: Number(localId) },
      data: esEdicionCompleta ? dataCompleta : dataSimple,
      include: {
        listaPrecio: {
          select: { id: true, nombre: true, esDefault: true, activo: true },
        },
      },
    });

    return NextResponse.json({ ok: true, cliente });
  } catch (error) {
    console.error("Error actualizando estado de cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "clientes.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const body = await req.json();
    const { nombre, documento, telefono, email, direccion, observaciones, limiteCredito, descuentoPorcentaje } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const clienteExistente = await prisma.cliente.findFirst({
      where: { id: Number(id), localId, grupoId },
      select: { id: true },
    });

    if (!clienteExistente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado para este local" },
        { status: 404 }
      );
    }

    const cliente = await prisma.cliente.update({
      where: { id: Number(id), localId: Number(localId) },
      data: {
        nombre: nombre.trim(),
        documento: documento?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        direccion: direccion?.trim() || null,
        observaciones: observaciones?.trim() || null,
        limiteCredito: limiteCredito !== "" && limiteCredito != null ? Number(limiteCredito) : null,
        descuentoPorcentaje: descuentoPorcentaje !== "" && descuentoPorcentaje != null ? Number(descuentoPorcentaje) : null,
        activo: body.activo,
      },
    });

    return NextResponse.json({ ok: true, cliente });
  } catch (error) {
    console.error("Error editando cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

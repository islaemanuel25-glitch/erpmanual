import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo, getLocalIdsDeGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import {
  normalizarLocalVinculadoId,
  puedeVincularLocal,
  mensajeError,
  ERRORES,
} from "@/lib/ventas-internas/configurarVinculo";

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
      select: { id: true, listaPrecioId: true, localVinculadoId: true },
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

    // Local interno vinculado (Cliente.localVinculadoId). Update PARCIAL: si el
    // payload no trae el campo, se conserva el valor actual. Es lo que evita que el
    // toggle de activo, un import o cualquier pantalla que no lo conoce lo borren.
    const vinc = normalizarLocalVinculadoId(body);
    let localVinculadoIdFinal = undefined; // undefined = no tocar
    if (vinc.presente) {
      if (vinc.error) {
        return NextResponse.json({ ok: false, error: mensajeError(vinc.error) }, { status: 400 });
      }
      const cambia = (clienteExistente.localVinculadoId ?? null) !== (vinc.valor ?? null);
      if (cambia) {
        if (vinc.valor === null) {
          // Desvincular: no hay nada que validar contra la base.
          localVinculadoIdFinal = null;
        } else {
          const idsGrupo = await getLocalIdsDeGrupo(grupoId);
          if (!idsGrupo.includes(vinc.valor)) {
            return NextResponse.json(
              { ok: false, error: mensajeError(ERRORES.NO_ENCONTRADO) },
              { status: 400 }
            );
          }
          const local = await prisma.local.findUnique({
            where: { id: vinc.valor },
            select: {
              id: true,
              nombre: true,
              activo: true,
              es_deposito: true,
              clienteVinculado: { select: { id: true, nombre: true } },
            },
          });
          const check = puedeVincularLocal({
            local,
            clienteVinculadoId: local?.clienteVinculado?.id ?? null,
            vinculoActualDelCliente: clienteExistente.localVinculadoId ?? null,
            clienteIdActual: clienteExistente.id,
          });
          if (!check.ok) {
            return NextResponse.json(
              {
                ok: false,
                error: mensajeError(check.error, {
                  nombreLocal: local?.nombre ?? null,
                  nombreCliente: local?.clienteVinculado?.nombre ?? null,
                }),
              },
              { status: 400 }
            );
          }
          localVinculadoIdFinal = vinc.valor;
        }
      }
      // No cambia (reguardar el mismo vínculo): no se revalida ni se escribe.
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

    if (localVinculadoIdFinal !== undefined) {
      dataCompleta.localVinculadoId = localVinculadoIdFinal;
      dataSimple.localVinculadoId = localVinculadoIdFinal;
    }

    const cliente = await prisma.cliente.update({
      where: { id: Number(id), localId: Number(localId) },
      data: esEdicionCompleta ? dataCompleta : dataSimple,
      include: {
        listaPrecio: {
          select: { id: true, nombre: true, esDefault: true, activo: true },
        },
        localVinculado: {
          select: { id: true, nombre: true, activo: true },
        },
      },
    });

    return NextResponse.json({ ok: true, cliente });
  } catch (error) {
    // Carrera por el índice único de localVinculadoId: entre la validación previa y
    // el update, otro cliente pudo tomar el mismo local.
    if (error?.code === "P2002" && String(error?.meta?.target || "").includes("localVinculadoId")) {
      return NextResponse.json(
        { ok: false, error: mensajeError(ERRORES.YA_VINCULADO) },
        { status: 409 }
      );
    }
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

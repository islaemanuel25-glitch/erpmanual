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

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "clientes.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const {
      nombre,
      documento,
      telefono,
      email,
      direccion,
      observaciones,
      limiteCredito,
      descuentoPorcentaje,
      listaPrecioId,
    } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    // Local interno vinculado (Cliente.localVinculadoId). Ausente o null → sin
    // vínculo. Se valida contra la base: nunca se confía en la lista que mostró el
    // frontend. Cambiar el vínculo exige clientes.editar además de clientes.crear.
    const vinc = normalizarLocalVinculadoId(body);
    let localVinculadoIdFinal = null;
    if (vinc.presente && vinc.error) {
      return NextResponse.json({ ok: false, error: mensajeError(vinc.error) }, { status: 400 });
    }
    if (vinc.presente && vinc.valor != null) {
      const permEditar = checkPerm(session, "clientes.editar");
      if (!permEditar.ok) {
        return NextResponse.json(
          { ok: false, error: "No tenés permiso para vincular un local interno" },
          { status: 403 }
        );
      }
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
        vinculoActualDelCliente: null, // cliente nuevo: no tiene vínculo previo
        clienteIdActual: null,
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

    // Validar listaPrecioId si vino un number
    let listaPrecioIdFinal = null;
    if (typeof listaPrecioId === "number") {
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
        listaPrecioId: listaPrecioIdFinal,
        localVinculadoId: localVinculadoIdFinal,
      },
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
    // el insert, otro cliente pudo tomar el mismo local. Se traduce a un error
    // comercial en vez de un 500.
    if (error?.code === "P2002" && String(error?.meta?.target || "").includes("localVinculadoId")) {
      return NextResponse.json(
        { ok: false, error: mensajeError(ERRORES.YA_VINCULADO) },
        { status: 409 }
      );
    }
    console.error("Error creando cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

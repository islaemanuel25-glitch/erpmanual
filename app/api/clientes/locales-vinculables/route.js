import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo, getLocalIdsDeGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

// Locales del grupo que pueden vincularse a un cliente (Cliente.localVinculadoId).
//
// Endpoint propio y mínimo en lugar de reutilizar los existentes:
//   · /api/locales/listar no filtra por grupo (devolvería locales de otros grupos)
//     y expone dirección, teléfono, cuil, etc.;
//   · /api/locales/opciones filtra activo:true, así que un vínculo con un local que
//     quedó inactivo desaparecería del selector y no se podría quitar; tampoco sabe
//     qué locales ya están tomados por otro cliente.
//
// Mismo permiso y mismo scope que el formulario que lo consume (clientes.editar):
// quien solo puede ver o buscar clientes no debe poder listar candidatos ni cambiar
// el vínculo.
//
// Query opcional `clienteId`: el cliente en edición. Su local vinculado se incluye
// SIEMPRE, aunque esté inactivo, para poder mostrarlo y desvincularlo.
export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, session } = scope;

    const perm = checkPerm(session, "clientes.editar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const clienteIdRaw = req.nextUrl.searchParams.get("clienteId");
    const clienteId = /^\d+$/.test(String(clienteIdRaw || "")) ? Number(clienteIdRaw) : null;

    // Vínculo actual del cliente en edición (para no perderlo si quedó inactivo).
    let vinculoActual = null;
    if (clienteId) {
      const cliente = await prisma.cliente.findFirst({
        where: { id: clienteId, grupoId },
        select: { localVinculadoId: true },
      });
      vinculoActual = cliente?.localVinculadoId ?? null;
    }

    // Universo: locales del grupo (GrupoLocal + GrupoDeposito) más, si hace falta,
    // el local del vínculo actual aunque hubiera salido del grupo.
    const idsGrupo = await getLocalIdsDeGrupo(grupoId);
    const ids = new Set(idsGrupo);
    if (vinculoActual != null) ids.add(vinculoActual);
    if (ids.size === 0) return NextResponse.json({ ok: true, items: [] });

    const locales = await prisma.local.findMany({
      where: {
        id: { in: [...ids] },
        // Los depósitos no son destino de una venta interna: quedan fuera del
        // selector. Se hace la excepción si es el vínculo actual, para poder verlo
        // y quitarlo.
        ...(vinculoActual != null
          ? { OR: [{ es_deposito: false }, { id: vinculoActual }] }
          : { es_deposito: false }),
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        activo: true,
        es_deposito: true,
        // Cliente que ya representa a este local (inversa de localVinculadoId).
        clienteVinculado: { select: { id: true, nombre: true } },
      },
    });

    const items = locales
      // Un local inactivo solo se ofrece si es el vínculo actual del cliente.
      .filter((l) => l.activo === true || l.id === vinculoActual)
      .map((l) => ({
        id: l.id,
        nombre: l.nombre,
        activo: l.activo,
        esDeposito: l.es_deposito === true,
        clienteVinculadoId: l.clienteVinculado?.id ?? null,
        clienteVinculadoNombre: l.clienteVinculado?.nombre ?? null,
      }));

    return NextResponse.json({ ok: true, items, vinculoActual });
  } catch (error) {
    console.error("Error en clientes/locales-vinculables:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

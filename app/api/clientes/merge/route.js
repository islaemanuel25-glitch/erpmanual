import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId } = scope;
    const body = await req.json();
    const { clientePrincipalId, clientesSecundariosIds } = body;

    // Validaciones básicas
    if (!clientePrincipalId || !Number.isInteger(clientePrincipalId)) {
      return NextResponse.json(
        { ok: false, error: "clientePrincipalId requerido" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(clientesSecundariosIds) ||
      clientesSecundariosIds.length === 0
    ) {
      return NextResponse.json(
        { ok: false, error: "clientesSecundariosIds requerido (al menos 1)" },
        { status: 400 }
      );
    }

    if (clientesSecundariosIds.includes(clientePrincipalId)) {
      return NextResponse.json(
        { ok: false, error: "El principal no puede estar en la lista de secundarios" },
        { status: 400 }
      );
    }

    if (new Set(clientesSecundariosIds).size !== clientesSecundariosIds.length) {
      return NextResponse.json(
        { ok: false, error: "IDs duplicados en clientesSecundariosIds" },
        { status: 400 }
      );
    }

    // Validar que principal existe en el scope
    const principal = await prisma.cliente.findFirst({
      where: { id: clientePrincipalId, grupoId, localId },
      select: { id: true },
    });

    if (!principal) {
      return NextResponse.json(
        { ok: false, error: "Cliente principal no encontrado en este local" },
        { status: 404 }
      );
    }

    // Validar que todos los secundarios existen en el scope
    const secundarios = await prisma.cliente.findMany({
      where: { id: { in: clientesSecundariosIds }, grupoId, localId },
      select: { id: true },
    });

    const idsEncontrados = new Set(secundarios.map((s) => s.id));
    const faltantes = clientesSecundariosIds.filter((id) => !idsEncontrados.has(id));

    if (faltantes.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Clientes no encontrados en este local: ${faltantes.join(", ")}` },
        { status: 404 }
      );
    }

    // Ejecutar merge en transacción
    await prisma.$transaction(async (tx) => {
      for (const secId of clientesSecundariosIds) {
        // 1. Transferir ventas
        await tx.venta.updateMany({
          where: { clienteId: secId, grupoId, localId },
          data: { clienteId: clientePrincipalId },
        });

        // 2. Transferir movimientos cuenta corriente
        await tx.movimientoCuenta.updateMany({
          where: { clienteId: secId, grupoId, localId },
          data: { clienteId: clientePrincipalId },
        });

        // 3. Transferir movimientos de puntos
        await tx.clientePuntoMovimiento.updateMany({
          where: { clienteId: secId, grupoId, localId },
          data: { clienteId: clientePrincipalId },
        });

        // 4. Transferir tags (sin duplicar)
        const tagsSec = await tx.clienteTag.findMany({
          where: { clienteId: secId },
          select: { tagId: true },
        });

        if (tagsSec.length > 0) {
          const tagsPrincipal = await tx.clienteTag.findMany({
            where: { clienteId: clientePrincipalId },
            select: { tagId: true },
          });

          const tagsPrincipalSet = new Set(tagsPrincipal.map((t) => t.tagId));
          const tagsNuevos = tagsSec
            .filter((t) => !tagsPrincipalSet.has(t.tagId))
            .map((t) => ({ clienteId: clientePrincipalId, tagId: t.tagId }));

          if (tagsNuevos.length > 0) {
            await tx.clienteTag.createMany({
              data: tagsNuevos,
              skipDuplicates: true,
            });
          }

          // Eliminar tags del secundario
          await tx.clienteTag.deleteMany({
            where: { clienteId: secId },
          });
        }

        // 5. Eliminar cliente secundario
        await tx.cliente.delete({
          where: { id: secId, grupoId, localId },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ERROR clientes/merge:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}

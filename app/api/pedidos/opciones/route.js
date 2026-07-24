// app/api/pedidos/opciones/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorVisibleWhere } from "@/lib/visibilidad";

export async function GET(req) {
  try {
    // Auth + localId + grupoId (soporta admin con contexto activo)
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto || false },
        { status: scope.status }
      );
    }

    const { localId, grupoId, session } = scope;

    // Permisos
    const permisos = Array.isArray(session.permisos) ? session.permisos : [];
    if (!permisos.includes("*") && !permisos.includes("pedidos.ver")) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso para ver pedidos" },
        { status: 403 }
      );
    }

    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { id: true, nombre: true, es_deposito: true },
    });

    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    if (local.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "Solo locales pueden usar Pedidos" },
        { status: 403 }
      );
    }

    // Resolver depósito del grupo
    const grupoDeposito = await prisma.grupoDeposito.findFirst({
      where: { grupoId },
      include: { local: { select: { id: true, nombre: true } } },
    });

    if (!grupoDeposito) {
      return NextResponse.json(
        { ok: false, error: "No se encontró un depósito para el grupo" },
        { status: 400 }
      );
    }

    const depositoId = grupoDeposito.local.id;

    // Opciones de filtros: categorías, proveedores, áreas del grupo
    const [categorias, proveedores, areas] = await Promise.all([
      prisma.categoria.findMany({
        where: {
          activo: true,
          productos: { some: { grupoId } },
        },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
      // Regla B: el local ve sus proveedores (los de los productos que creó),
      // no los del depósito — aunque pueda pedir productos del depósito.
      prisma.proveedor.findMany({
        where: { AND: [{ activo: true }, proveedorVisibleWhere(localId, grupoId)] },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
      prisma.areaFisica.findMany({
        where: {
          activo: true,
          productos: { some: { grupoId } },
        },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      local: { id: local.id, nombre: local.nombre },
      deposito: { id: depositoId, nombre: grupoDeposito.local.nombre },
      grupoId,
      categorias,
      proveedores,
      areas,
    });
  } catch (err) {
    console.error("Error pedidos/opciones:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

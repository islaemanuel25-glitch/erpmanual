// app/api/pedidos/opciones/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getGrupoIdDeLocal } from "@/lib/grupos";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const localId = Number(session.localId);
    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "Usuario sin local asignado" },
        { status: 400 }
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

    // Resolver depósito del grupo
    const grupoId = await getGrupoIdDeLocal(localId);
    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "El local no pertenece a ningún grupo" },
        { status: 400 }
      );
    }

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
      prisma.proveedor.findMany({
        where: {
          activo: true,
          productos: { some: { grupoId } },
        },
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

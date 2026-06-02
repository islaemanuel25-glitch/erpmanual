// app/api/productos/codigos-proveedor/crear/route.js
// Crea (o reactiva) un vínculo proveedor + codigoInterno -> ProductoBase.
// Regla única: (grupoId, proveedorId, codigoInterno). Soft-delete con reactivación.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

const PROVEEDOR_SELECT = { id: true, nombre: true, cuit: true };

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const productoBaseId = Number(body.productoBaseId || 0);
    const proveedorId = Number(body.proveedorId || 0);
    const codigoInterno = String(body.codigoInterno ?? "").trim();
    const descripcionProveedor = body.descripcionProveedor
      ? String(body.descripcionProveedor).trim()
      : null;

    // Validaciones de entrada
    if (!productoBaseId) {
      return NextResponse.json({ ok: false, error: "productoBaseId requerido" }, { status: 400 });
    }
    if (!proveedorId) {
      return NextResponse.json({ ok: false, error: "proveedorId requerido" }, { status: 400 });
    }
    if (!codigoInterno) {
      return NextResponse.json(
        { ok: false, error: "El código interno no puede estar vacío" },
        { status: 400 }
      );
    }

    // El producto debe pertenecer al grupo del usuario
    const base = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: { id: true },
    });
    if (!base) {
      return NextResponse.json(
        { ok: false, error: "Producto no encontrado en este grupo" },
        { status: 404 }
      );
    }

    // El proveedor es global (no tiene grupoId): solo validar que exista
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: proveedorId },
      select: { id: true },
    });
    if (!proveedor) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    try {
      // ¿Existe ya la combinación (grupoId, proveedorId, codigoInterno)? Incluye inactivos.
      const existente = await prisma.productoCodigoProveedor.findUnique({
        where: {
          codigo_interno_unico_por_proveedor: { grupoId, proveedorId, codigoInterno },
        },
      });

      if (existente) {
        if (existente.activo) {
          return NextResponse.json(
            {
              ok: false,
              error: `Ya existe un código interno "${codigoInterno}" activo para este proveedor.`,
            },
            { status: 409 }
          );
        }

        // Existía inactivo → reactivar y actualizar destino/descripción
        const reactivado = await prisma.productoCodigoProveedor.update({
          where: { id: existente.id },
          data: { activo: true, productoBaseId, descripcionProveedor },
          include: { proveedor: { select: PROVEEDOR_SELECT } },
        });
        return NextResponse.json({ ok: true, item: reactivado, reactivado: true });
      }

      const creado = await prisma.productoCodigoProveedor.create({
        data: { grupoId, productoBaseId, proveedorId, codigoInterno, descripcionProveedor },
        include: { proveedor: { select: PROVEEDOR_SELECT } },
      });

      return NextResponse.json({ ok: true, item: creado });
    } catch (e) {
      if (e.code === "P2002") {
        return NextResponse.json(
          {
            ok: false,
            error: `Ya existe un código interno "${codigoInterno}" para este proveedor.`,
          },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (e) {
    console.error("ERROR productos/codigos-proveedor/crear:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

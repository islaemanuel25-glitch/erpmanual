// app/api/productos/codigos-proveedor/editar/route.js
// Edita un vínculo de código interno (codigoInterno / descripcionProveedor / proveedorId).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

const PROVEEDOR_SELECT = { id: true, nombre: true, cuit: true };

export async function PUT(req) {
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
    const id = Number(body.id || 0);
    if (!id) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    // El vínculo debe pertenecer al grupo del usuario
    const actual = await prisma.productoCodigoProveedor.findFirst({
      where: { id, grupoId },
    });
    if (!actual) {
      return NextResponse.json(
        { ok: false, error: "Vínculo no encontrado" },
        { status: 404 }
      );
    }

    // Campos editables (si no vienen, se mantiene el valor actual)
    const proveedorId =
      body.proveedorId != null && body.proveedorId !== ""
        ? Number(body.proveedorId)
        : actual.proveedorId;
    const codigoInterno =
      body.codigoInterno != null ? String(body.codigoInterno).trim() : actual.codigoInterno;
    const descripcionProveedor =
      body.descripcionProveedor !== undefined
        ? (body.descripcionProveedor ? String(body.descripcionProveedor).trim() : null)
        : actual.descripcionProveedor;

    if (!codigoInterno) {
      return NextResponse.json(
        { ok: false, error: "El código interno no puede estar vacío" },
        { status: 400 }
      );
    }

    // Si cambia de proveedor, validar que exista (proveedor es global)
    if (proveedorId !== actual.proveedorId) {
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
    }

    try {
      // Validar duplicados contra (grupoId, proveedorId, codigoInterno) en OTRO registro
      const dup = await prisma.productoCodigoProveedor.findUnique({
        where: {
          codigo_interno_unico_por_proveedor: { grupoId, proveedorId, codigoInterno },
        },
        select: { id: true, activo: true },
      });

      if (dup && dup.id !== id) {
        if (dup.activo) {
          return NextResponse.json(
            {
              ok: false,
              error: `Ya existe un código interno "${codigoInterno}" activo para este proveedor.`,
            },
            { status: 409 }
          );
        }
        return NextResponse.json(
          {
            ok: false,
            error: `Existe un vínculo inactivo con el código "${codigoInterno}" para este proveedor. Reactivalo en lugar de duplicarlo.`,
          },
          { status: 409 }
        );
      }

      const actualizado = await prisma.productoCodigoProveedor.update({
        where: { id },
        data: { proveedorId, codigoInterno, descripcionProveedor },
        include: { proveedor: { select: PROVEEDOR_SELECT } },
      });

      return NextResponse.json({ ok: true, item: actualizado });
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
    console.error("ERROR productos/codigos-proveedor/editar:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

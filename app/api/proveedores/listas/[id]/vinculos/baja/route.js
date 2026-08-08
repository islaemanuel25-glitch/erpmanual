// POST /api/proveedores/listas/[id]/vinculos/baja
//
// DA DE BAJA el código que este proveedor tiene guardado para un producto. Es lo
// que hay detrás de "marcarlo como discontinuado".
//
// ── POR QUÉ NO HAY COLUMNA "DISCONTINUADO" ──────────────────────────────────
//
// "Arcor dejó de traerlo" es un hecho de la RELACIÓN producto–proveedor, no del
// producto: el mismo producto puede seguir vivo y comprarse a otro. Marcarlo en
// `ProductoBase.activo` metería dos hechos en una columna y además lo sacaría
// del POS, que no es lo que nadie pidió.
//
// El vínculo ya tiene el concepto —`activo`— y darlo de baja produce exactamente
// el efecto que se busca: deja de machear en las listas siguientes y deja de
// contarse como faltante. De paso cierra el pendiente de no poder dar de baja un
// código viejo cuando el proveedor le cambia el código a un producto.
//
// NO TOCA EL PRODUCTO. Ni su costo, ni su precio, ni su estado: sigue vivo y se
// puede seguir vendiendo.
//
// Reversible: volver a vincularlo desde la pantalla lo reactiva, y esa
// reactivación queda marcada como decisión de una persona.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";

export async function POST(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }
    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const productoBaseId = Number(body?.productoBaseId);
    if (!Number.isInteger(productoBaseId) || productoBaseId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta el producto." }, { status: 400 });
    }

    // La importación ancla el proveedor, y el grupo va en el WHERE: una de otro
    // grupo no existe para esta consulta.
    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, proveedorId: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // El producto, con el filtro del grupo: un id de otro grupo no se toca.
    const producto = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: { id: true, nombre: true },
    });
    if (!producto) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado." }, { status: 404 });
    }

    // Solo los ACTIVOS. Si ya estaba dado de baja no hay nada que hacer, y el
    // pedido repetido devuelve lo mismo sin escribir: es idempotente.
    const r = await prisma.productoCodigoProveedor.updateMany({
      where: {
        grupoId,
        proveedorId: importacion.proveedorId,
        productoBaseId,
        activo: true,
      },
      data: { activo: false },
    });

    return NextResponse.json({
      ok: true,
      producto: { id: producto.id, nombre: producto.nombre },
      vinculosDadosDeBaja: r.count,
    });
  } catch (error) {
    console.error("Error dando de baja el vínculo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

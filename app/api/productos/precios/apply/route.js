import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const grupoId = Number(session.grupoId);
    if (!grupoId || grupoId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Seleccioná un grupo activo para trabajar." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const proveedorId = toNumber(body?.proveedorId);
    const metodo = body?.metodo;
    const pricingMode = body?.pricingMode;
    const items = Array.isArray(body?.items) ? body.items : null;

    // FIX: validar explícito (null / NaN / <= 0)
    if (proveedorId == null || proveedorId <= 0) {
      return NextResponse.json({ ok: false, error: "proveedorId requerido" }, { status: 400 });
    }

    if (!["MANUAL", "AUMENTO", "XLSX", "SCAN", "REGLAS", "PEGADO"].includes(metodo)) {
      return NextResponse.json({ ok: false, error: "metodo inválido" }, { status: 400 });
    }

    if (!["KEEP_VENTA", "RECALC_BY_MARGIN", "SET_VENTA"].includes(pricingMode)) {
      return NextResponse.json({ ok: false, error: "pricingMode inválido" }, { status: 400 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ ok: false, error: "items inválido" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const update = await tx.precioUpdate.create({
        data: {
          grupoId,
          proveedorId,
          metodo,
          pricingMode,
          usuarioId: session.id ? Number(session.id) : null,
        },
      });

      let applied = 0;
      for (const item of items) {
        const productoBaseId = toNumber(item?.productoBaseId);
        const costoAnterior = toNumber(item?.costoAnterior);
        const costoNuevo = toNumber(item?.costoNuevo);
        const ventaAnterior = toNumber(item?.ventaAnterior);
        const ventaNueva = toNumber(item?.ventaNueva);

        if (
          !productoBaseId ||
          costoAnterior === null ||
          costoNuevo === null ||
          ventaAnterior === null ||
          ventaNueva === null
        ) {
          throw new Error("Item inválido");
        }

        const updated = await tx.productoBase.updateMany({
          where: {
            id: productoBaseId,
            grupoId,
            proveedor_id: proveedorId,
          },
          data: {
            precio_costo: costoNuevo,
            precio_venta: ventaNueva,
          },
        });

        if (updated.count === 0) {
          throw new Error(`Producto ${productoBaseId} fuera de alcance`);
        }

        await tx.precioUpdateItem.create({
          data: {
            precioUpdateId: update.id,
            productoBaseId,
            costoAnterior,
            costoNuevo,
            ventaAnterior,
            ventaNueva,
          },
        });

        applied += 1;
      }

      return { updateId: update.id, applied };
    });

    return NextResponse.json({
      ok: true,
      message: `Actualización aplicada: ${result.applied} productos.`,
      updateId: result.updateId,
      applied: result.applied,
    });
  } catch (e) {
    console.error("ERROR productos/precios/apply:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error interno" }, { status: 500 });
  }
}

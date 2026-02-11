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
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const proveedorId = toNumber(body?.proveedorId);
    const metodo = body?.metodo;
    const pricingMode = body?.pricingMode;
    const items = Array.isArray(body?.items) ? body.items : null;

    if (!proveedorId) {
      return NextResponse.json(
        { ok: false, error: "proveedorId requerido" },
        { status: 400 }
      );
    }

    if (!["MANUAL", "AUMENTO", "XLSX", "SCAN"].includes(metodo)) {
      return NextResponse.json(
        { ok: false, error: "metodo inválido" },
        { status: 400 }
      );
    }

    if (pricingMode !== "KEEP_VENTA" && pricingMode !== "RECALC_BY_MARGIN") {
      return NextResponse.json(
        { ok: false, error: "pricingMode inválido" },
        { status: 400 }
      );
    }

    if (!items) {
      return NextResponse.json(
        { ok: false, error: "items inválido" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const update = await tx.precioUpdate.create({
        data: {
          grupoId: Number(session.grupoId),
          proveedorId,
          metodo,
          pricingMode,
          usuarioId: session.id ? Number(session.id) : null,
        },
      });

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

        await tx.productoBase.update({
          where: { id: productoBaseId },
          data: {
            precio_costo: costoNuevo,
            precio_venta: ventaNueva,
          },
        });

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
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ERROR productos/precios/apply:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

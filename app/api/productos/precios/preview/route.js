import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function roundUpTo100(value) {
  return Math.ceil(value / 100) * 100;
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
    const pricingMode = body?.pricingMode;
    const increase = body?.increase;

    if (!proveedorId) {
      return NextResponse.json(
        { ok: false, error: "proveedorId requerido" },
        { status: 400 }
      );
    }

    if (pricingMode !== "KEEP_VENTA" && pricingMode !== "RECALC_BY_MARGIN") {
      return NextResponse.json(
        { ok: false, error: "pricingMode inválido" },
        { status: 400 }
      );
    }

    if (increase !== undefined && increase !== null) {
      const validKind = increase.kind === "PCT" || increase.kind === "ABS";
      const validValue = toNumber(increase.value);
      if (!validKind || validValue === null) {
        return NextResponse.json(
          { ok: false, error: "increase inválido" },
          { status: 400 }
        );
      }
    }

    const productos = await prisma.productoBase.findMany({
      where: {
        grupoId: Number(session.grupoId),
        proveedor_id: proveedorId,
      },
      select: {
        id: true,
        nombre: true,
        precio_costo: true,
        precio_venta: true,
        margen: true,
        redondeo_100: true,
      },
      orderBy: { id: "asc" },
    });

    const items = productos.map((p) => {
      const costoAnterior = Number(p.precio_costo);
      const ventaAnterior = Number(p.precio_venta);

      let costoNuevo = costoAnterior;
      if (increase?.kind === "PCT") {
        costoNuevo = costoAnterior * (1 + Number(increase.value) / 100);
      } else if (increase?.kind === "ABS") {
        costoNuevo = costoAnterior + Number(increase.value);
      }

      let ventaNueva = ventaAnterior;
      if (pricingMode === "RECALC_BY_MARGIN") {
        const margen = p.margen === null ? 0 : Number(p.margen);
        ventaNueva = costoNuevo * (1 + margen / 100);
      }

      if (p.redondeo_100) {
        ventaNueva = roundUpTo100(ventaNueva);
      }

      return {
        productoBaseId: p.id,
        nombre: p.nombre,
        costoAnterior,
        costoNuevo,
        ventaAnterior,
        ventaNueva,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("ERROR productos/precios/preview:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

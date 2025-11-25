// app/api/stock_locales/obtener/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const { permisos, localId: sessionLocalId } = session;
    const esAdmin = Array.isArray(permisos) && permisos.includes("*");

    if (!esAdmin && !permisos.includes("stock.ver")) {
      return NextResponse.json({ ok: false, error: "No tenés permisos" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    const pl = await prisma.productoLocal.findUnique({
      where: { id },
      include: {
        base: true,
        stock: { take: 1, select: { cantidad: true, stockMin: true, stockMax: true }},
        local: { select: { id: true, nombre: true, es_deposito: true }},
      },
    });

    if (!pl) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
    }

    if (!esAdmin && sessionLocalId !== pl.localId) {
      return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
    }

    const s = pl.stock?.[0] ?? { cantidad: 0, stockMin: 0, stockMax: 0 };

    const precioCostoBulto = Number(pl.precio_costo ?? pl.base.precio_costo);
    const unidadMedida = pl.base.unidad_medida;
    const factorPack = Number(pl.base.factor_pack ?? 0);

    // ================================================================
    // 🟨 CALCULO CORRECTO DEL PRECIO UNITARIO
    // ================================================================
    let precioUnitario = precioCostoBulto;

    if (unidadMedida !== "unidad" && factorPack > 0) {
      precioUnitario = precioCostoBulto / factorPack;
    }

    const item = {
      id: pl.id,
      localId: pl.localId,
      baseId: pl.baseId,

      nombre: pl.base.nombre,
      codigoBarra: pl.base.codigo_barra,

      unidadMedida,
      factorPack,

      precioCosto: precioCostoBulto,
      precioUnitario: Number(precioUnitario.toFixed(2)),

      stock: Number(s.cantidad),
      stockMin: Number(s.stockMin),
      stockMax: Number(s.stockMax),
      faltante: Number(s.cantidad) < Number(s.stockMin),

      local: {
        id: pl.local.id,
        nombre: pl.local.nombre,
        esDeposito: pl.local.es_deposito,
      },
    };

    return NextResponse.json({ ok: true, item });

  } catch (err) {
    console.error("❌ ERROR STOCK OBTENER:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

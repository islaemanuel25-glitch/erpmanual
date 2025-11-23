// app/api/stock_locales/obtener/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    // ================================================================
    // 0) SESSION + PERMISOS
    // ================================================================
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { permisos, localId: sessionLocalId } = session;
    const esAdmin = Array.isArray(permisos) && permisos.includes("*");

    // permiso mínimo para ver un producto
    if (!esAdmin && !permisos.includes("stock.ver")) {
      return NextResponse.json(
        { ok: false, error: "No tenés permisos para ver stock" },
        { status: 403 }
      );
    }

    // ================================================================
    // 1) OBTENER ID DEL PRODUCTO LOCAL
    // ================================================================
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    // ================================================================
    // 2) OBTENER PRODUCTOLOCAL COMPLETO
    // ================================================================
    const pl = await prisma.productoLocal.findUnique({
      where: { id },
      include: {
        base: true,
        stock: {
          take: 1,
          select: { cantidad: true, stockMin: true, stockMax: true },
        },
        local: { select: { id: true, nombre: true, es_deposito: true } },
      },
    });

    if (!pl) {
      return NextResponse.json(
        { ok: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const productoLocalLocalId = pl.localId;

    // ================================================================
    // 3) VALIDAR ACCESO SEGÚN SESIÓN
    // ================================================================
    let accesoValido = false;

    if (esAdmin) {
      // admin global puede ver cualquier local
      accesoValido = true;
    } else {
      // USUARIO NORMAL: sólo puede ver su propio local
      if (sessionLocalId && productoLocalLocalId === sessionLocalId) {
        accesoValido = true;
      }
    }

    if (!accesoValido) {
      return NextResponse.json(
        { ok: false, error: "No podés ver stock de otro local" },
        { status: 403 }
      );
    }

    // ================================================================
    // 4) FORMATEO camelCase
    // ================================================================
    const s = pl.stock?.[0] || {
      cantidad: 0,
      stockMin: 0,
      stockMax: 0,
    };

    const item = {
      id: pl.id,
      localId: pl.localId,
      baseId: pl.baseId,

      nombre: pl.base.nombre,
      descripcion: pl.base.descripcion,
      sku: pl.base.sku,
      codigoBarra: pl.base.codigo_barra,

      categoriaId: pl.base.categoria_id,
      proveedorId: pl.base.proveedor_id,
      areaFisicaId: pl.base.area_fisica_id,

      unidadMedida: pl.base.unidad_medida,
      factorPack: pl.base.factor_pack,

      pesoKg: pl.base.peso_kg,
      volumenMl: pl.base.volumen_ml,

      imagenUrl: pl.base.imagen_url,
      esCombo: pl.base.es_combo,
      activo: pl.base.activo,

      precioCosto: Number(pl.precio_costo ?? pl.base.precio_costo),
      precioVenta: Number(pl.precio_venta ?? pl.base.precio_venta),
      margen:
        pl.margen !== null ? Number(pl.margen) : Number(pl.base.margen),

      stock: Number(s.cantidad),
      stockMin: Number(s.stockMin),
      stockMax: Number(s.stockMax),

      faltante: Number(s.cantidad) < Number(s.stockMin),

      local: {
        id: pl.local.id,
        nombre: pl.local.nombre,
        esDeposito: pl.local.es_deposito === true,
      },
    };

    return NextResponse.json({ ok: true, item });

  } catch (err) {
    console.error("❌ ERROR STOCK OBTENER:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

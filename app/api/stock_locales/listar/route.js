import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

const PAGE_SIZE = 25;

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { permisos, localId: sessionLocalId } = session;
    const esAdmin = Array.isArray(permisos) && permisos.includes("*");

    if (!esAdmin && !permisos.includes("stock.ver")) {
      return NextResponse.json(
        { ok: false, error: "No tenés permisos para ver stock." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);

    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const offset = (page - 1) * PAGE_SIZE;

    let localId = null;

    if (esAdmin && !sessionLocalId) {
      localId = Number(searchParams.get("localId") || 0);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "localId requerido para admin sin local." },
          { status: 400 }
        );
      }
    } else {
      localId = Number(sessionLocalId || 0);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "localId inválido" },
          { status: 400 }
        );
      }
    }

    const q = (searchParams.get("q") || "").trim();
    const categoria = searchParams.get("categoria");
    const proveedor = searchParams.get("proveedor");
    const area = searchParams.get("area");

    const conStock = searchParams.get("conStock") === "true";
    const sinStock = searchParams.get("sinStock") === "true";
    const faltantes = searchParams.get("faltantes") === "true";

    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    const esDeposito = local.es_deposito === true;

    let final = [];

    // ======================================================
    // 🟦 VISTA LOCAL → PRECIO UNITARIO + REDONDEO A 100
    // ======================================================
    if (!esDeposito) {
      const rows = await prisma.productoLocal.findMany({
        where: {
          localId,
          base: {
            nombre: q ? { contains: q, mode: "insensitive" } : undefined,
            categoria_id: categoria ? Number(categoria) : undefined,
            proveedor_id: proveedor ? Number(proveedor) : undefined,
            area_fisica_id: area ? Number(area) : undefined,
          },
        },
        orderBy: { id: "desc" },
        include: {
          base: {
            select: {
              id: true,
              nombre: true,
              codigo_barra: true,
              categoria_id: true,
              proveedor_id: true,
              area_fisica_id: true,
              unidad_medida: true,
              factor_pack: true,
              precio_costo: true,
              precio_venta: true,
              redondeo_100: true,
            },
          },
          stock: {
            take: 1,
            select: { cantidad: true, stockMin: true, stockMax: true },
          },
        },
      });

      final = rows.map((p) => {
        const base = p.base;
        const s = p.stock?.[0] ?? { cantidad: 0, stockMin: 0, stockMax: 0 };

        const factor = Number(base.factor_pack || 1);

        // 🟦 COSTO UNITARIO
        const costoUnit =
          factor > 1
            ? Number(p.precio_costo || base.precio_costo) / factor
            : Number(p.precio_costo || base.precio_costo);

        // 🟦 VENTA UNITARIA (antes de redondeo)
        let ventaUnit =
          factor > 1
            ? Number(p.precio_venta || base.precio_venta) / factor
            : Number(p.precio_venta || base.precio_venta);

        // 🟩 REDONDEO A 100 HACIA ARRIBA
        if (base.redondeo_100 === true) {
          ventaUnit = Math.ceil(ventaUnit / 100) * 100;
        }

        return {
          id: p.id,
          localId: p.localId,
          baseId: base.id,

          nombre: base.nombre,
          codigoBarra: base.codigo_barra,
          categoriaId: base.categoria_id,
          proveedorId: base.proveedor_id,
          areaFisicaId: base.area_fisica_id,
          unidadMedida: base.unidad_medida,
          factorPack: factor,

          precioUnitario: costoUnit,
          precioCosto: Number(p.precio_costo || base.precio_costo),

          // 🟦 PRECIO DE VENTA UNITARIO FINAL
          precioVentaUnitario: ventaUnit,

          precioVenta: Number(p.precio_venta || base.precio_venta),

          margen: p.margen,
          stock: Number(s.cantidad || 0),
          stockMin: Number(s.stockMin || 0),
          stockMax: Number(s.stockMax || 0),
          faltante: Number(s.cantidad || 0) < Number(s.stockMin || 0),
        };
      });
    }

    // ======================================================
    // 🟥 VISTA DEPÓSITO → PRECIO DE BULTO
    // ======================================================
    if (esDeposito) {
      const gruposDepo = await prisma.grupoDeposito.findMany({
        where: { localId },
        select: { grupoId: true },
      });

      const grupoIds = gruposDepo.map((g) => g.grupoId);

      if (grupoIds.length === 0) {
        return NextResponse.json({
          ok: true,
          items: [],
          total: 0,
          totalPages: 1,
        });
      }

      const bases = await prisma.productoBase.findMany({
        where: {
          grupoId: { in: grupoIds },
          nombre: q ? { contains: q, mode: "insensitive" } : undefined,
          categoria_id: categoria ? Number(categoria) : undefined,
          proveedor_id: proveedor ? Number(proveedor) : undefined,
          area_fisica_id: area ? Number(area) : undefined,
        },
        orderBy: { id: "desc" },
        include: {
          locales: {
            where: { localId },
            include: {
              stock: true,
              base: {
                select: {
                  unidad_medida: true,
                  factor_pack: true,
                },
              },
            },
          },
        },
      });

      final = [];

      for (const b of bases) {
        let pl = b.locales[0] || null;

        if (!pl) {
          pl = await prisma.productoLocal.create({
            data: {
              baseId: b.id,
              localId,
              precio_costo: b.precio_costo,
              precio_venta: b.precio_venta,
              margen: b.margen,
              activo: b.activo,
            },
            include: {
              stock: true,
              base: { select: { unidad_medida: true, factor_pack: true } },
            },
          });

          await prisma.stockLocal.create({
            data: {
              localId,
              productoId: pl.id,
              cantidad: 0,
              stockMin: 0,
              stockMax: 0,
            },
          });
        }

        const stock = pl.stock?.[0] || {
          cantidad: 0,
          stockMin: 0,
          stockMax: 0,
        };

        final.push({
          id: pl.id,
          localId,
          baseId: b.id,
          nombre: b.nombre,
          codigoBarra: b.codigo_barra,
          categoriaId: b.categoria_id,
          proveedorId: b.proveedor_id,
          areaFisicaId: b.area_fisica_id,
          unidadMedida: pl.base?.unidad_medida ?? b.unidad_medida,
          factorPack: pl.base?.factor_pack ?? b.factor_pack,

          precioCosto: Number(pl.precio_costo ?? b.precio_costo),
          precioVenta: Number(pl.precio_venta ?? b.precio_venta),

          margen: pl.margen ?? b.margen,
          stock: Number(stock.cantidad || 0),
          stockMin: Number(stock.stockMin || 0),
          stockMax: Number(stock.stockMax || 0),
          faltante: Number(stock.cantidad || 0) < Number(stock.stockMin || 0),
        });
      }
    }

    if (conStock) final = final.filter((p) => p.stock > 0);
    if (sinStock) final = final.filter((p) => p.stock === 0);
    if (faltantes) final = final.filter((p) => p.faltante);

    const total = final.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const items = final.slice(offset, offset + PAGE_SIZE);

    return NextResponse.json({ ok: true, items, total, totalPages });
  } catch (err) {
    console.error("❌ ERROR STOCK LISTAR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

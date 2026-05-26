// app/api/compras-proveedor/productos/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);
    const proveedorId = Number(url.searchParams.get("proveedorId") || 0);
    const search = (url.searchParams.get("search") || "").trim();

    if (!proveedorId) {
      return NextResponse.json(
        { ok: false, error: "proveedorId requerido" },
        { status: 400 }
      );
    }

    // Resolver depósito del grupo
    const gd = await prisma.grupoDeposito.findFirst({
      where: { grupoId },
      select: { localId: true },
    });

    if (!gd) {
      return NextResponse.json(
        { ok: false, error: "No se encontró depósito para el grupo" },
        { status: 400 }
      );
    }

    const depositoId = gd.localId;

    // Buscar ProductoLocal del depósito donde el base pertenece al proveedor
    const baseWhere = {
      grupoId,
      activo: true,
      OR: [
        { proveedor_id: proveedorId },
        { proveedor2_id: proveedorId },
        { proveedor3_id: proveedorId },
      ],
    };

    if (search) {
      baseWhere.AND = [
        {
          OR: [
            { nombre: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { codigo_barra: { contains: search, mode: "insensitive" } },
            { codigo_barra_secundario: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const productosLocal = await prisma.productoLocal.findMany({
      where: {
        localId: depositoId,
        activo: true,
        base: baseWhere,
      },
      include: {
        base: {
          select: {
            id: true,
            nombre: true,
            sku: true,
            codigo_barra: true,
            codigo_barra_secundario: true,
            unidad_medida: true,
            factor_pack: true,
            modo_pedido: true,
            precio_costo: true,
            precio_venta: true,
            modoCompraProveedor: true,
            pesoReferenciaKg: true,
            pesoEsFijo: true,
            pesoPromedioKg: true,
            actualizaPromedioPorRecepcion: true,
          },
        },
        stock: {
          where: { localId: depositoId },
          select: {
            cantidad: true,
            stockMin: true,
            stockMax: true,
          },
        },
      },
      orderBy: { base: { nombre: "asc" } },
      take: 100,
    });

    const items = productosLocal.map((pl) => {
      const st = pl.stock[0] || null;
      const cantidadRaw = Number(st?.cantidad ?? 0);
      const stockMinRaw = st?.stockMin != null ? Number(st.stockMin) : null;
      const stockMaxRaw = st?.stockMax != null ? Number(st.stockMax) : null;

      const sinParametros = stockMinRaw == null || stockMaxRaw == null;
      const factorPack = Number(pl.base.factor_pack) || 1;
      const modoCompra = pl.base.modoCompraProveedor || "BULTO";

      // En depósito el stock se guarda en UNIDADES (igual que en reposición).
      // Para BULTO (pack/cajón) debemos expresar todo en bultos en esta pantalla,
      // sin tocar kg/fiambre (modoCompra UNIDAD).
      let stockActual = cantidadRaw;
      let stockMin = stockMinRaw;
      let stockMax = stockMaxRaw;
      let faltante = 0;
      let sugerido = 0;
      let pesoRefKg = null;

      if (modoCompra === "UNIDAD") {
        // FIAMBRE: stock en KG, pedido en unidades (piezas). No tocar.
        faltante = sinParametros ? 0 : Math.max(0, (stockMax ?? 0) - stockActual);

        const pesoRef = Number(pl.base.pesoReferenciaKg || 0);
        const pesoProm = Number(pl.base.pesoPromedioKg || 0);
        pesoRefKg = pl.base.pesoEsFijo ? pesoRef : (pesoProm || pesoRef || 1);

        sugerido = faltante > 0 ? Math.ceil(faltante / pesoRefKg) : 0;
      } else {
        // BULTO (pack/cajón): DB tiene cantidad/stockMin/stockMax en UNIDADES.
        // Convertir a bultos para mostrar y calcular (igual que en reposición).
        if (factorPack > 1) {
          stockActual = Math.floor(cantidadRaw / factorPack);
          stockMin = stockMinRaw != null ? Math.floor(stockMinRaw / factorPack) : null;
          stockMax = stockMaxRaw != null ? Math.floor(stockMaxRaw / factorPack) : null;
        }
        faltante = sinParametros ? 0 : Math.max(0, (stockMax ?? 0) - stockActual);
        sugerido = faltante;
      }

      const bajoMin = !sinParametros && stockActual < (stockMin ?? 0);

      return {
        productoLocalId: pl.id,
        baseId: pl.base.id,
        nombre: pl.base.nombre,
        sku: pl.base.sku,
        codigo_barra: pl.base.codigo_barra,
        codigo_barra_secundario: pl.base.codigo_barra_secundario || null,
        unidad_medida: pl.base.unidad_medida,
        factor_pack: factorPack,
        modoCompra,
        precio_costo: pl.base.precio_costo,
        precio_venta: pl.base.precio_venta,
        stockActual,
        stockMin,
        stockMax,
        faltante,
        sugerido,
        sinParametros,
        bajoMin,
        pesoRefKg,
        pesoEsFijo: pl.base.pesoEsFijo ?? false,
        pesoReferenciaKg: pl.base.pesoReferenciaKg ? Number(pl.base.pesoReferenciaKg) : null,
        pesoPromedioKg: pl.base.pesoPromedioKg ? Number(pl.base.pesoPromedioKg) : null,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Error compras-proveedor/productos:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getGrupoIdDeLocal, getLocalesDeGrupo } from "@/lib/grupos";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

// Validar modo_pedido según unidad_medida y factor_pack
function validarModoPedido(modoPedido, unidadMedida, factorPack) {
  if (unidadMedida === "unidad" || !factorPack || factorPack <= 1) {
    return "UNIDAD";
  }
  if (modoPedido === "BULTO" || modoPedido === "UNIDAD") {
    return modoPedido;
  }
  return "BULTO";
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

    const perm = checkPerm(session, "productos.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);
    const localId = Number(url.searchParams.get("localId") || 0);
    const body = await req.json();

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    const num = (v) =>
      v === "" || v === null || v === undefined || Number.isNaN(Number(v))
        ? null
        : Number(v);

    // 1) Obtener grupo del local creador
    const grupoId = await getGrupoIdDeLocal(localId);
    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "El local no pertenece a ningún grupo" },
        { status: 400 }
      );
    }

    // 2) Validar proveedores no repetidos
    const provIds = [num(body.proveedor_id), num(body.proveedor2_id), num(body.proveedor3_id)]
      .filter((v) => v !== null && v !== 0);
    const provSet = new Set(provIds);
    if (provSet.size !== provIds.length) {
      return NextResponse.json(
        { ok: false, error: "Los proveedores no pueden repetirse" },
        { status: 400 }
      );
    }

    // 3) Ver si el creador es depósito
    const creador = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    // 3) Armar baseData
    const baseData = {
      grupoId,
      creadoEnLocalId: localId,
      nombre: body.nombre,
      descripcion: body.descripcion || null,
      sku: body.sku || null,
      codigo_barra: body.codigo_barra || null,

      categoria_id: num(body.categoria_id),
      proveedor_id: num(body.proveedor_id),
      proveedor2_id: num(body.proveedor2_id),
      proveedor3_id: num(body.proveedor3_id),
      area_fisica_id: num(body.area_fisica_id),

      unidad_medida: body.unidad_medida,
      factor_pack: num(body.factor_pack),
      modo_pedido: validarModoPedido(
        body.modo_pedido,
        body.unidad_medida,
        num(body.factor_pack)
      ),

      peso_kg: num(body.peso_kg),
      volumen_ml: num(body.volumen_ml),

      precio_costo: Number(body.precio_costo),
      precio_venta: Number(body.precio_venta),
      margen: num(body.margen),

      precio_sugerido: num(body.precio_sugerido),
      iva_porcentaje: num(body.iva_porcentaje),

      fecha_vencimiento: body.fecha_vencimiento
        ? new Date(body.fecha_vencimiento)
        : null,

      redondeo_100: Boolean(body.redondeo_100),
      activo: Boolean(body.activo),
      imagen_url: body.imagen_url || null,
      es_combo: Boolean(body.es_combo),

      // Fiambre fields
      modoCompraProveedor: body.modoCompraProveedor || "BULTO",
      pesoReferenciaKg: num(body.pesoReferenciaKg),
      pesoEsFijo: Boolean(body.pesoEsFijo ?? false),
      modoVentaDeposito: body.modoVentaDeposito || "PESO",
      pesoPromedioKg: num(body.pesoPromedioKg),
      actualizaPromedioPorRecepcion: body.actualizaPromedioPorRecepcion !== false,
    };

    // modo_envio default
    if (body.modo_envio) {
      baseData.modo_envio = body.modo_envio;
    } else if (body.unidad_medida === "cajon") {
      baseData.modo_envio = "SOLO_BULTO";
    } else {
      baseData.modo_envio = "MIXTO";
    }

    // modo_stock default
    if (body.modo_stock) {
      baseData.modo_stock = body.modo_stock;
    } else {
      baseData.modo_stock = "BULTO";
    }

    // 4) Transacción: crear base + (productoLocal/stock) según caso
    const result = await prisma.$transaction(async (tx) => {
      // 4.1) Crear ProductoBase (con fallback si faltan columnas)
      let base;
      try {
        base = await tx.productoBase.create({ data: baseData });
      } catch (e) {
        if (
          e.message?.includes("modo_envio") ||
          e.message?.includes("modo_stock") ||
          e.message?.includes("modoCompraProveedor") ||
          e.message?.includes("pesoReferenciaKg") ||
          e.message?.includes("pesoEsFijo") ||
          e.message?.includes("modoVentaDeposito") ||
          e.message?.includes("pesoPromedioKg") ||
          e.message?.includes("actualizaPromedioPorRecepcion")
        ) {
          const fallback = { ...baseData };
          delete fallback.modo_envio;
          delete fallback.modo_stock;
          delete fallback.modoCompraProveedor;
          delete fallback.pesoReferenciaKg;
          delete fallback.pesoEsFijo;
          delete fallback.modoVentaDeposito;
          delete fallback.pesoPromedioKg;
          delete fallback.actualizaPromedioPorRecepcion;
          base = await tx.productoBase.create({ data: fallback });
        } else {
          throw e;
        }
      }

      // --------------------------------------------------------
      // CASO DEPÓSITO → replicar a todos los locales del grupo
      // --------------------------------------------------------
      if (creador?.es_deposito) {
        const localesGrupo = await getLocalesDeGrupo(grupoId);
        const localIds = localesGrupo.map((l) => l.id);

        if (localIds.length === 0) {
          // No hay locales (solo depósito en el grupo). Base creada igual.
          return { base, replicatedTo: 0 };
        }

        // A) Crear ProductoLocal para todos los locales (idempotente)
        await tx.productoLocal.createMany({
          data: localIds.map((id) => ({
            localId: id,
            baseId: base.id,
            precio_costo: base.precio_costo,
            precio_venta: base.precio_venta,
            margen: base.margen,
            activo: base.activo,
          })),
          skipDuplicates: true,
        });

        // B) Buscar los ProductoLocal (para tener ids) y crear stock (idempotente)
        const pls = await tx.productoLocal.findMany({
          where: {
            baseId: base.id,
            localId: { in: localIds },
          },
          select: { id: true, localId: true },
        });

        await tx.stockLocal.createMany({
          data: pls.map((pl) => ({
            localId: pl.localId,
            productoId: pl.id,
            cantidad: "0", // Decimal safe
            stockMin: null,
            stockMax: null,
          })),
          skipDuplicates: true,
        });

        return { base, replicatedTo: localIds.length };
      }

      // --------------------------------------------------------
      // CASO LOCAL → crear solo en ese local
      // --------------------------------------------------------
      // ProductoLocal (idempotente por si reintenta)
      await tx.productoLocal.createMany({
        data: [
          {
            localId,
            baseId: base.id,
            precio_costo: base.precio_costo,
            precio_venta: base.precio_venta,
            margen: base.margen,
            activo: base.activo,
          },
        ],
        skipDuplicates: true,
      });

      const pl = await tx.productoLocal.findFirst({
        where: { localId, baseId: base.id },
        select: { id: true },
      });

      if (pl) {
        await tx.stockLocal.createMany({
          data: [
            {
              localId,
              productoId: pl.id,
              cantidad: "0",
              stockMin: null,
              stockMax: null,
            },
          ],
          skipDuplicates: true,
        });
      }

      return { base, replicatedTo: 1 };
    });

    return NextResponse.json({
      ok: true,
      item: result.base,
      meta: { replicatedTo: result.replicatedTo },
    });
  } catch (e) {
    console.error("🔥 ERROR CREAR PRODUCTO >>>", e);
    return NextResponse.json(
      { ok: false, error: e.message || String(e) },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { mergeBaseLocalToUi, splitUiToDb } from "@/lib/mappers/producto";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { normalizarCodigosBarra, validarUnicidadCodigos } from "@/lib/productos/validarCodigosBarra";

// Sincronizar precioCosto/activo a overrides, recalculando precio_venta por margen
async function syncFromBaseToLocales(baseId, { precioCosto, activo }) {
  if (precioCosto === undefined && activo === undefined) return;

  const base = await prisma.productoBase.findUnique({
    where: { id: baseId },
    select: { margen: true, redondeo_100: true },
  });

  if (!base) return;

  const locales = await prisma.productoLocal.findMany({
    where: { baseId },
  });

  for (const local of locales) {
    const data = {};

    if (precioCosto !== undefined && precioCosto !== null) {
      const costo = Number(precioCosto);
      data.precio_costo = costo;

      const margen = local.margen !== null && local.margen !== undefined
        ? Number(local.margen)
        : (base.margen !== null && base.margen !== undefined ? Number(base.margen) : 0);

      let venta = costo * (1 + margen / 100);

      if (base.redondeo_100) {
        venta = Math.round(venta / 100) * 100;
      }

      data.precio_venta = venta;
    }

    if (activo !== undefined) {
      data.activo = Boolean(activo);
    }

    if (Object.keys(data).length === 0) continue;

    await prisma.productoLocal.update({
      where: { id: local.id },
      data,
    });
  }
}

export async function PUT(req, context) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await context.params;
    const baseId = Number(id);

    if (!baseId || Number.isNaN(baseId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const localId = Number(url.searchParams.get("localId") || "0");

    // Scope check: verificar que el producto pertenece al grupo del usuario
    let grupoId = Number(session.grupoId) || 0;
    if (!grupoId && localId > 0) {
      grupoId = await getGrupoIdDeLocal(localId);
    } else if (!grupoId && session.localId) {
      grupoId = await getGrupoIdDeLocal(Number(session.localId));
    }
    if (grupoId) {
      const productoScope = await prisma.productoBase.findFirst({
        where: { id: baseId, grupoId },
        select: { id: true },
      });
      if (!productoScope) {
        return NextResponse.json(
          { ok: false, error: "Producto no encontrado" },
          { status: 404 }
        );
      }
    }

    const payload = await req.json();

    // Validar proveedores no repetidos
    const toNum = (v) =>
      v === "" || v === null || v === undefined || Number.isNaN(Number(v))
        ? null
        : Number(v);
    const provIds = [toNum(payload.proveedor_id), toNum(payload.proveedor2_id), toNum(payload.proveedor3_id)]
      .filter((v) => v !== null && v !== 0);
    const provSet = new Set(provIds);
    if (provSet.size !== provIds.length) {
      return NextResponse.json(
        { ok: false, error: "Los proveedores no pueden repetirse" },
        { status: 400 }
      );
    }

    // Normalizar y validar códigos de barra (principal + secundario)
    const norm = normalizarCodigosBarra({
      codigoBarra: payload.codigo_barra,
      codigoBarraSecundario: payload.codigo_barra_secundario,
    });
    if (!norm.ok) {
      return NextResponse.json({ ok: false, error: norm.error }, { status: 400 });
    }

    // Resolver grupoId del producto para validar unicidad cruzada
    const baseScope = await prisma.productoBase.findUnique({
      where: { id: baseId },
      select: { grupoId: true },
    });
    if (baseScope) {
      const vUnic = await validarUnicidadCodigos({
        prisma,
        grupoId: baseScope.grupoId,
        baseIdExcluir: baseId,
        principal: norm.principal,
        secundario: norm.secundario,
      });
      if (!vUnic.ok) {
        return NextResponse.json({ ok: false, error: vUnic.error }, { status: 400 });
      }
    }

    payload.codigo_barra = norm.principal;
    payload.codigo_barra_secundario = norm.secundario;

    // separar base vs local con snake_case
    const { baseData, localData } = splitUiToDb(payload);

    // depósito o sin localId → edita BASE
    if (localId <= 0) return await editarBase(baseId, baseData);

    const local = await prisma.local.findUnique({
      where: { id: localId },
    });

    if (local?.es_deposito) return await editarBase(baseId, baseData);

    return await editarOverride(baseId, localId, localData);
  } catch (e) {
    console.error("ERROR productos/editar:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

/* ============================================================
   EDITAR PRODUCTO BASE — FIX FINAL
   ============================================================ */
// Validar modo_pedido según unidad_medida y factor_pack
function validarModoPedido(modoPedido, unidadMedida, factorPack) {
  // Si unidad_medida es unidad o factor_pack es null/1, forzar UNIDAD
  if (unidadMedida === "unidad" || !factorPack || factorPack <= 1) {
    return "UNIDAD";
  }
  // Si es pack/cajon y factor > 1, puede ser BULTO o UNIDAD
  if (modoPedido === "BULTO" || modoPedido === "UNIDAD") {
    return modoPedido;
  }
  // Default: BULTO si tiene factor > 1
  return "BULTO";
}

async function editarBase(baseId, baseData) {
  const dataFinal = {
    nombre: baseData.nombre,
    descripcion: baseData.descripcion,
    sku: baseData.sku,
    codigo_barra: baseData.codigo_barra,
    codigo_barra_secundario: baseData.codigo_barra_secundario,

    unidad_medida: baseData.unidad_medida,
    factor_pack: baseData.factor_pack,
    modo_pedido: validarModoPedido(baseData.modo_pedido, baseData.unidad_medida, baseData.factor_pack),

    peso_kg: baseData.peso_kg,
    volumen_ml: baseData.volumen_ml,

    precio_costo: baseData.precio_costo,
    precio_venta: baseData.precio_venta,
    margen: baseData.margen,

    precio_sugerido: baseData.precio_sugerido,
    iva_porcentaje: baseData.iva_porcentaje,

    fecha_vencimiento: baseData.fecha_vencimiento,

    redondeo_100: baseData.redondeo_100,
    activo: baseData.activo,

    imagen_url: baseData.imagen_url,
    es_combo: baseData.es_combo,

    categoria_id: baseData.categoria_id ? Number(baseData.categoria_id) : null,
    proveedor_id: baseData.proveedor_id ? Number(baseData.proveedor_id) : null,
    proveedor2_id: baseData.proveedor2_id ? Number(baseData.proveedor2_id) : null,
    proveedor3_id: baseData.proveedor3_id ? Number(baseData.proveedor3_id) : null,
    area_fisica_id: baseData.area_fisica_id ? Number(baseData.area_fisica_id) : null,
  };

  // Fiambre fields
  if (baseData.modoCompraProveedor !== undefined) {
    dataFinal.modoCompraProveedor = baseData.modoCompraProveedor;
  }
  if (baseData.pesoReferenciaKg !== undefined) {
    dataFinal.pesoReferenciaKg = baseData.pesoReferenciaKg;
  }
  if (baseData.pesoEsFijo !== undefined) {
    dataFinal.pesoEsFijo = baseData.pesoEsFijo;
  }
  if (baseData.modoVentaDeposito !== undefined) {
    dataFinal.modoVentaDeposito = baseData.modoVentaDeposito;
  }
  if (baseData.pesoPromedioKg !== undefined) {
    dataFinal.pesoPromedioKg = baseData.pesoPromedioKg;
  }
  if (baseData.actualizaPromedioPorRecepcion !== undefined) {
    dataFinal.actualizaPromedioPorRecepcion = baseData.actualizaPromedioPorRecepcion;
  }

  // Agregar modo_envio y modo_stock solo si están disponibles (después de migración)
  if (baseData.modo_envio !== undefined) {
    dataFinal.modo_envio = baseData.modo_envio;
  } else if (baseData.unidad_medida === "cajon") {
    dataFinal.modo_envio = "SOLO_BULTO";
  } else {
    dataFinal.modo_envio = "MIXTO";
  }

  if (baseData.modo_stock !== undefined) {
    dataFinal.modo_stock = baseData.modo_stock;
  } else {
    dataFinal.modo_stock = "BULTO";
  }

  let updated;
  try {
    updated = await prisma.productoBase.update({
      where: { id: baseId },
      data: dataFinal,
      include: { locales: true },
    });
  } catch (e) {
    // Si falla porque los campos modo_envio/modo_stock no existen (migración no ejecutada),
    // intentar sin esos campos
    if (
      e.message?.includes("modo_envio") ||
      e.message?.includes("modo_stock") ||
      e.message?.includes("modoCompraProveedor") ||
      e.message?.includes("pesoReferenciaKg") ||
      e.message?.includes("pesoEsFijo") ||
      e.message?.includes("modoVentaDeposito") ||
      e.message?.includes("pesoPromedioKg") ||
      e.message?.includes("actualizaPromedioPorRecepcion") ||
      e.message?.includes("codigo_barra_secundario")
    ) {
      delete dataFinal.modo_envio;
      delete dataFinal.modo_stock;
      delete dataFinal.modoCompraProveedor;
      delete dataFinal.pesoReferenciaKg;
      delete dataFinal.pesoEsFijo;
      delete dataFinal.modoVentaDeposito;
      delete dataFinal.pesoPromedioKg;
      delete dataFinal.actualizaPromedioPorRecepcion;
      delete dataFinal.codigo_barra_secundario;
      updated = await prisma.productoBase.update({
        where: { id: baseId },
        data: dataFinal,
        include: { locales: true },
      });
    } else {
      throw e;
    }
  }

  // sincronizar precioCosto/activo en overrides (locales)
  await syncFromBaseToLocales(baseId, {
    precioCosto: baseData.precio_costo,
    activo: baseData.activo,
  });

  // Sincronizar ProductoLocal del depósito con los valores exactos de la base
  await prisma.productoLocal.updateMany({
    where: { baseId, local: { es_deposito: true } },
    data: {
      precio_costo: dataFinal.precio_costo,
      precio_venta: dataFinal.precio_venta,
      margen: dataFinal.margen,
      activo: dataFinal.activo,
    },
  });

  return NextResponse.json({
    ok: true,
    item: mergeBaseLocalToUi(updated, null),
  });
}

/* ============================================================
   EDITAR OVERRIDE LOCAL
   ============================================================ */
async function editarOverride(baseId, localId, localData) {
  const existing = await prisma.productoLocal.findFirst({
    where: { baseId, localId },
  });

  let override;

  if (existing) {
    override = await prisma.productoLocal.update({
      where: { id: existing.id },
      data: {
        precio_costo: localData.precio_costo ?? undefined,
        precio_venta: localData.precio_venta ?? undefined,
        margen: localData.margen ?? undefined,
        activo: localData.activo ?? undefined,
        nombre: null,
        descripcion: null,
      },
    });
  } else {
    override = await prisma.productoLocal.create({
      data: {
        baseId,
        localId,
        precio_costo: localData.precio_costo ?? null,
        precio_venta: localData.precio_venta ?? null,
        margen: localData.margen ?? null,
        activo: localData.activo ?? true,
        nombre: null,
        descripcion: null,
      },
    });
  }

  const base = await prisma.productoBase.findUnique({
    where: { id: baseId },
  });

  return NextResponse.json({
    ok: true,
    item: mergeBaseLocalToUi(base, override),
  });
}

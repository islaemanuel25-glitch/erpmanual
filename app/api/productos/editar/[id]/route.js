import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { mergeBaseLocalToUi, splitUiToDb } from "@/lib/mappers/producto";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { normalizarCodigosBarra, validarUnicidadCodigos } from "@/lib/productos/validarCodigosBarra";
import { esComboBase } from "@/lib/combos/guards";
import { puedeEditarCosto, mensajeCostoNoEditable, mismoCosto } from "@/lib/productos/propiedadCosto";
import { validarRecargoServicioPct } from "@/lib/pos-ventas/servicios";

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
    const qLocal = url.searchParams.get("localId");

    // Alcance seguro: no-admin no puede indicar un localId ajeno (→403); admin usa
    // contexto explícito. El grupo se deriva del alcance, NUNCA del cliente.
    const scope = await resolveScope(req, { explicitLocalId: qLocal });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId } = scope;
    const localId = Number(qLocal || "0");

    // Existencia + pertenencia al grupo del alcance.
    const baseScope = await prisma.productoBase.findUnique({
      where: { id: baseId },
      select: { id: true, grupoId: true, es_combo: true, creadoEnLocalId: true, precio_costo: true },
    });
    if (!baseScope) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
    }
    if (baseScope.grupoId !== grupoId) {
      // Recurso de otro grupo en una MODIFICACIÓN → 403.
      return NextResponse.json({ ok: false, error: "Producto fuera de tu alcance." }, { status: 403 });
    }

    const payload = await req.json();

    // ── PROPIEDAD DEL COSTO ──────────────────────────────────────────────
    // El costo (base y override) solo lo administra el DUEÑO del producto:
    // el depósito para productos de depósito; el local creador para exclusivos.
    // La ubicación que opera se toma del alcance autorizado (server-side), nunca
    // de un flag del cliente. Un intento de un no-dueño de CAMBIAR el costo → 403;
    // si el costo viene igual al actual (reenvío del form), se ignora sin error.
    const operandoEnLocalId = Number(scope.localId);
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const puedeCosto = puedeEditarCosto(operandoEnLocalId, baseScope.creadoEnLocalId, depositoLocalId);
    if (!puedeCosto) {
      // Costo efectivo actual en la ubicación que opera (override ?? maestro).
      let overrideCost = null;
      if (operandoEnLocalId > 0) {
        const ov = await prisma.productoLocal.findFirst({
          where: { baseId, localId: operandoEnLocalId },
          select: { precio_costo: true },
        });
        overrideCost = ov?.precio_costo ?? null;
      }
      const currentCost = overrideCost ?? baseScope.precio_costo;
      const submitted = payload.precio_costo;
      const intentaCambiar =
        submitted !== undefined && submitted !== null && submitted !== "" && !mismoCosto(submitted, currentCost);
      if (intentaCambiar) {
        return NextResponse.json(
          { ok: false, error: mensajeCostoNoEditable(baseScope.creadoEnLocalId, depositoLocalId) },
          { status: 403 }
        );
      }
      // No es dueño y no cambia el costo → seguir editando el resto SIN tocar el costo.
      payload.precio_costo = undefined;
    }

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

    // baseScope ya resuelto arriba (existencia + pertenencia al grupo del alcance).
    if (baseScope) {
      // Impedir convertir un producto en combo (o viceversa) desde este editor.
      if (Boolean(payload.es_combo) !== esComboBase(baseScope)) {
        return NextResponse.json(
          { ok: false, error: "No se puede convertir un producto en combo ni un combo en producto normal." },
          { status: 400 }
        );
      }
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

    // `?? undefined`: el costo es NOT NULL en el schema, así que un null (costo
    // ausente o bloqueado por propiedad) significa "no cambiar", nunca "borrar".
    // Elimina el borrado accidental del costo al editar sin tocarlo.
    precio_costo: baseData.precio_costo ?? undefined,
    precio_venta: baseData.precio_venta,
    margen: baseData.margen,

    precio_sugerido: baseData.precio_sugerido,
    iva_porcentaje: baseData.iva_porcentaje,

    fecha_vencimiento: baseData.fecha_vencimiento,

    redondeo_100: baseData.redondeo_100,
    activo: baseData.activo,

    imagen_url: baseData.imagen_url,
    es_combo: baseData.es_combo,

    // Servicios de importe variable: modalidad + recargo default (validado server-side).
    modalidad: baseData.modalidad === "IMPORTE_VARIABLE" ? "IMPORTE_VARIABLE" : "NORMAL",
    recargoServicioDefaultPct:
      baseData.modalidad === "IMPORTE_VARIABLE"
        ? (validarRecargoServicioPct(baseData.recargoServicioDefaultPct).valido
            ? validarRecargoServicioPct(baseData.recargoServicioDefaultPct).pct
            : 0)
        : null,

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
        // Override por local del recargo del servicio: null = heredar base.
        recargoServicioPct: validarRecargoServicioPct(localData.recargoServicioPct).valido
          ? validarRecargoServicioPct(localData.recargoServicioPct).pct
          : null,
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

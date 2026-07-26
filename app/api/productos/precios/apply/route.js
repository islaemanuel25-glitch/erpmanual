import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { puedeEditarCosto } from "@/lib/productos/propiedadCosto";

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

    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    
    // Alcance seguro. Se resuelve SIEMPRE la ubicación que opera (server-side) para
    // aplicar la regla de propiedad del costo: un local no puede cambiar el costo de
    // productos del depósito. No-admin → su local; admin → contexto/localId validado.
    const scope = await resolveScope(req, { explicitLocalId: body?.localId });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const grupoId = scope.grupoId;
    const operatingLocalId = Number(scope.localId);
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const proveedorId = toNumber(body?.proveedorId);
    const metodo = body?.metodo;
    const pricingMode = body?.pricingMode;
    const items = Array.isArray(body?.items) ? body.items : null;
    const esMargenMasivo = metodo === "MARGEN_MASIVO";

    // proveedorId requerido salvo en MARGEN_MASIVO (donde es opcional via filtros)
    if (!esMargenMasivo && (proveedorId == null || proveedorId <= 0)) {
      return NextResponse.json({ ok: false, error: "proveedorId requerido" }, { status: 400 });
    }

    if (!["MANUAL", "AUMENTO", "XLSX", "SCAN", "REGLAS", "PEGADO", "MARGEN_MASIVO"].includes(metodo)) {
      return NextResponse.json({ ok: false, error: "metodo inválido" }, { status: 400 });
    }

    if (!["KEEP_VENTA", "RECALC_BY_MARGIN", "SET_VENTA"].includes(pricingMode)) {
      return NextResponse.json({ ok: false, error: "pricingMode inválido" }, { status: 400 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ ok: false, error: "items inválido" }, { status: 400 });
    }

    if (items.length > 5000) {
      return NextResponse.json({ ok: false, error: "Demasiados items (máx 5000)" }, { status: 400 });
    }

    const proveedorIdParaUpdate = esMargenMasivo
      ? proveedorId && proveedorId > 0
        ? proveedorId
        : null
      : proveedorId;

    const result = await prisma.$transaction(async (tx) => {
      const update = await tx.precioUpdate.create({
        data: {
          grupoId,
          proveedorId: proveedorIdParaUpdate,
          metodo,
          pricingMode,
          usuarioId: session.id ? Number(session.id) : null,
        },
      });

      let applied = 0;
      const saltados = [];
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

        // Propiedad del costo: si la ubicación que opera NO es dueña del producto
        // (p. ej. un local sobre un producto del depósito), se SALTEA su costo y se
        // reporta; el resto del lote sigue. No se toca el maestro ajeno.
        const baseInfo = await tx.productoBase.findUnique({
          where: { id: productoBaseId },
          select: { creadoEnLocalId: true, grupoId: true },
        });
        if (!baseInfo || baseInfo.grupoId !== grupoId) {
          throw new Error(`Producto ${productoBaseId} fuera de alcance`);
        }
        if (!puedeEditarCosto(operatingLocalId, baseInfo.creadoEnLocalId, depositoLocalId)) {
          saltados.push({ productoBaseId, motivo: "costo administrado por otra ubicación (depósito)" });
          continue;
        }

        const productoWhere = {
          id: productoBaseId,
          grupoId,
        };
        if (!esMargenMasivo) productoWhere.proveedor_id = proveedorId;

        const updated = await tx.productoBase.updateMany({
          where: productoWhere,
          data: {
            precio_costo: costoNuevo,
            precio_venta: ventaNueva,
          },
        });

        if (updated.count === 0) {
          throw new Error(`Producto ${productoBaseId} fuera de alcance`);
        }

        // Sincronizar ProductoLocal solo si el precio local coincide con el anterior
        const locales = await tx.productoLocal.findMany({
          where: { baseId: productoBaseId },
          select: { id: true, precio_costo: true, precio_venta: true },
        });

        for (const local of locales) {
          const costoLocal = local.precio_costo ? Number(local.precio_costo) : null;
          const ventaLocal = local.precio_venta ? Number(local.precio_venta) : null;
          const data = {};

          // Actualizar solo si no tiene override o si el override coincide con el anterior
          if (costoLocal === null || Math.abs(costoLocal - costoAnterior) < 0.01) {
            data.precio_costo = costoNuevo;
          }
          if (ventaLocal === null || Math.abs(ventaLocal - ventaAnterior) < 0.01) {
            data.precio_venta = ventaNueva;
          }

          if (Object.keys(data).length > 0) {
            await tx.productoLocal.update({
              where: { id: local.id },
              data,
            });
          }
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

      return { updateId: update.id, applied, saltados };
    }, {
      maxWait: 10000,
      timeout: 120000,
    });

    const saltadosMsg =
      result.saltados.length > 0
        ? ` ${result.saltados.length} salteado(s): el costo lo administra el depósito.`
        : "";
    return NextResponse.json({
      ok: true,
      message: `Actualización aplicada: ${result.applied} productos.${saltadosMsg}`,
      updateId: result.updateId,
      applied: result.applied,
      saltados: result.saltados,
    });
  } catch (e) {
    console.error("ERROR productos/precios/apply:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error interno" }, { status: 500 });
  }
}

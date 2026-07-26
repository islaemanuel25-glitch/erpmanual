// app/api/compras-proveedor/editar-item/[id]/route.js
//
// Edita una línea (PedidoProveedorDetalle) de un pedido a proveedor.
// Solo permite edición en estado BORRADOR. Para ENVIADO, los cambios de
// recepción se guardan vía /recibir.
//
// Body:
//   - detalleId (int, requerido)
//   - cantidad (int >= 1, opcional)
//   - unidad ("BULTO" | "UNIDAD", opcional)
//   - precioCosto (number >= 0, opcional; null/"" para limpiar)
//
// Devuelve: { ok, detalle }

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { costoLineaAMaestro, actualizarCostoRealProducto } from "@/lib/compras-proveedor/costoMaestro";
import { esComboBase } from "@/lib/combos/guards";
import { pedidoEnAlcance, ownerLocalIdDePedido } from "@/lib/compras/scope";

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const pedidoId = Number(id);

    if (!pedidoId) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { detalleId, cantidad, unidad, precioCosto } = body;

    if (!detalleId || !Number.isFinite(Number(detalleId))) {
      return NextResponse.json(
        { ok: false, error: "detalleId requerido" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
    });

    if (!pedido || pedido.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }
    // Escritura sobre pedido de otra ubicación del mismo grupo → 403.
    if (!pedidoEnAlcance(pedido, { grupoId, localId })) {
      return NextResponse.json(
        { ok: false, error: "Pedido fuera de tu alcance" },
        { status: 403 }
      );
    }

    if (pedido.estado !== "BORRADOR") {
      return NextResponse.json(
        { ok: false, error: "Solo se pueden editar ítems en estado BORRADOR" },
        { status: 400 }
      );
    }

    const detalle = await prisma.pedidoProveedorDetalle.findUnique({
      where: { id: Number(detalleId) },
    });

    if (!detalle || detalle.pedidoId !== pedidoId) {
      return NextResponse.json(
        { ok: false, error: "Detalle no encontrado en este pedido" },
        { status: 404 }
      );
    }

    // Construir patch solo con los campos presentes en el body.
    const data = {};

    if (cantidad !== undefined) {
      const c = Number(cantidad);
      if (!Number.isFinite(c) || !Number.isInteger(c) || c < 1) {
        return NextResponse.json(
          { ok: false, error: "cantidad debe ser un entero >= 1" },
          { status: 400 }
        );
      }
      data.cantidad = c;
    }

    if (unidad !== undefined) {
      if (!["BULTO", "UNIDAD"].includes(unidad)) {
        return NextResponse.json(
          { ok: false, error: "unidad debe ser BULTO o UNIDAD" },
          { status: 400 }
        );
      }
      data.unidad = unidad;
    }

    if (precioCosto !== undefined) {
      if (precioCosto === null || precioCosto === "") {
        data.precioCosto = null;
      } else {
        const p = Number(precioCosto);
        if (!Number.isFinite(p) || p < 0) {
          return NextResponse.json(
            { ok: false, error: "precioCosto debe ser un número >= 0" },
            { status: 400 }
          );
        }
        data.precioCosto = p;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nada para actualizar" },
        { status: 400 }
      );
    }

    const updated = await prisma.pedidoProveedorDetalle.update({
      where: { id: Number(detalleId) },
      data,
    });

    // Si se editó el costo, propagarlo al costo real/maestro del producto (solo costo).
    if (data.precioCosto != null && data.precioCosto > 0) {
      const pl = await prisma.productoLocal.findUnique({
        where: { id: updated.productoLocalId },
        select: {
          base: {
            select: { factor_pack: true, modoCompraProveedor: true, unidad_medida: true, es_combo: true },
          },
        },
      });
      // Los combos no propagan costo: no tienen stock físico ni se compran.
      if (pl?.base && !esComboBase(pl.base)) {
        const costoMaestro = costoLineaAMaestro({
          precioCosto: data.precioCosto,
          unidad: updated.unidad,
          factorPack: pl.base.factor_pack,
          modoCompraProveedor: pl.base.modoCompraProveedor,
          unidadMedida: pl.base.unidad_medida,
        });
        await actualizarCostoRealProducto(prisma, {
          productoLocalId: updated.productoLocalId,
          costoMaestro,
          // Propiedad del costo: solo el dueño del producto mueve el costo.
          operadoDesdeLocalId: ownerLocalIdDePedido(pedido),
          depositoLocalId: pedido.depositoId,
        });
      }
    }

    return NextResponse.json({ ok: true, detalle: updated });
  } catch (err) {
    console.error("Error compras-proveedor/editar-item:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

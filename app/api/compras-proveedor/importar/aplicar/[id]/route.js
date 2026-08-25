import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { pedidoEnAlcance } from "@/lib/compras/scope";
import { esComboBase } from "@/lib/combos/guards";
import { sumarCantidadesImportadas } from "@/lib/compras-proveedor/importacion/merge";

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const perm = checkPerm(ctx.session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const pedidoId = Number((await params).id);
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (!pedidoId || !items.length) {
      return NextResponse.json({ ok: false, error: "El borrador y sus productos son obligatorios." }, { status: 400 });
    }
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1 || !["BULTO", "UNIDAD"].includes(item.unidad)) {
        return NextResponse.json({ ok: false, error: "Hay una cantidad o unidad inválida." }, { status: 400 });
      }
      if (item.precioCosto != null) {
        const costo = Number(item.precioCosto);
        if (!Number.isFinite(costo) || costo < 0) {
          return NextResponse.json({ ok: false, error: "Hay un costo inválido." }, { status: 400 });
        }
      }
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
      include: { detalles: true },
    });
    if (!pedido || pedido.grupoId !== ctx.grupoId) {
      return NextResponse.json({ ok: false, error: "Pedido no encontrado" }, { status: 404 });
    }
    if (!pedidoEnAlcance(pedido, ctx)) {
      return NextResponse.json({ ok: false, error: "Pedido fuera de tu alcance" }, { status: 403 });
    }
    if (pedido.estado !== "BORRADOR") {
      return NextResponse.json({ ok: false, error: "Solo se puede importar sobre un borrador." }, { status: 409 });
    }

    const ids = [...new Set(items.map((i) => Number(i.productoLocalId)))];
    if (ids.length !== items.length || ids.some((id) => !Number.isInteger(id) || id < 1)) {
      return NextResponse.json({ ok: false, error: "Hay productos repetidos o inválidos." }, { status: 400 });
    }
    const productos = await prisma.productoLocal.findMany({
      where: { id: { in: ids }, localId: pedido.depositoId, activo: true },
      select: { id: true, base: { select: { factor_pack: true, es_combo: true } } },
    });
    if (productos.length !== ids.length || productos.some((p) => esComboBase(p.base))) {
      return NextResponse.json({ ok: false, error: "Uno de los productos no pertenece al depósito o no se puede comprar." }, { status: 400 });
    }

    const porProducto = new Map(productos.map((p) => [p.id, p]));
    const existentes = new Map(pedido.detalles.map((d) => [d.productoLocalId, d]));
    const resultados = await prisma.$transaction(async (tx) => {
      const salida = [];
      for (const item of items) {
        const productoLocalId = Number(item.productoLocalId);
        const existente = existentes.get(productoLocalId);
        if (existente) {
          const suma = sumarCantidadesImportadas({
            actual: existente,
            importada: item,
            factorPack: porProducto.get(productoLocalId)?.base?.factor_pack,
          });
          const actualizado = await tx.pedidoProveedorDetalle.update({
            where: { id: existente.id },
            data: { cantidad: suma.cantidad, unidad: suma.unidad },
          });
          salida.push(actualizado);
        } else {
          const creado = await tx.pedidoProveedorDetalle.create({
            data: {
              pedidoId,
              productoLocalId,
              cantidad: Number(item.cantidad),
              unidad: item.unidad,
              precioCosto: item.precioCosto == null ? null : Number(item.precioCosto),
            },
          });
          salida.push(creado);
        }
      }
      return salida;
    });
    return NextResponse.json({ ok: true, pedidoId, detalles: resultados });
  } catch (error) {
    console.error("Error compras-proveedor/importar/aplicar:", error);
    return NextResponse.json({ ok: false, error: "No se pudo aplicar la importación al borrador." }, { status: 500 });
  }
}

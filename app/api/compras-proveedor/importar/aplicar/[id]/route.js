import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { pedidoEnAlcance } from "@/lib/compras/scope";
import { esComboBase } from "@/lib/combos/guards";
import { sumarCantidadesImportadas, costoParaUnidad } from "@/lib/compras-proveedor/importacion/merge";

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
    // El costo maestro y la naturaleza del producto se traen ACÁ y no se toman
    // del cuerpo del pedido: si la escala del costo saliera de lo que manda el
    // navegador, el defecto que esto arregla se podría volver a producir desde
    // afuera. `unidad_medida` y `modoCompraProveedor` son lo que `naturalezaLinea`
    // necesita para saber si el factor entra o no en el dinero.
    const productos = await prisma.productoLocal.findMany({
      where: { id: { in: ids }, localId: pedido.depositoId, activo: true },
      select: {
        id: true,
        base: {
          select: {
            factor_pack: true,
            es_combo: true,
            precio_costo: true,
            unidad_medida: true,
            modoCompraProveedor: true,
          },
        },
      },
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
        const base = porProducto.get(productoLocalId)?.base ?? null;
        const productoParaCosto = base
          ? {
              factor_pack: base.factor_pack,
              unidad_medida: base.unidad_medida,
              modoCompraProveedor: base.modoCompraProveedor,
              precio_costo: base.precio_costo,
            }
          : null;

        if (existente) {
          // La suma decide cantidad, unidad Y costo en una sola operación. Antes
          // acá se escribían solo las dos primeras: una línea de 2 BULTO a $2.100
          // que pasaba a 47 UNIDAD se quedaba con el costo del bulto y valía
          // 98.700 en vez de 4.700.
          const suma = sumarCantidadesImportadas({
            actual: existente,
            importada: item,
            factorPack: base?.factor_pack,
            producto: productoParaCosto,
            costoMaestro: base?.precio_costo ?? null,
          });
          const actualizado = await tx.pedidoProveedorDetalle.update({
            where: { id: existente.id },
            data: {
              cantidad: suma.cantidad,
              unidad: suma.unidad,
              // Si la unidad no cambió, `suma.precioCosto` es el que ya tenía, así
              // que esta escritura lo deja igual y no pisa un costo negociado.
              precioCosto: suma.precioCosto,
            },
          });
          salida.push(actualizado);
        } else {
          // Una línea nueva también tiene que quedar en la escala de SU unidad:
          // el importador manda el costo maestro y acá se lo baja a unitario si
          // la línea queda en UNIDAD y el producto es PACK.
          const costo = costoParaUnidad({
            costoMaestro: item.precioCosto ?? base?.precio_costo ?? null,
            unidad: item.unidad,
            producto: productoParaCosto,
          });
          const creado = await tx.pedidoProveedorDetalle.create({
            data: {
              pedidoId,
              productoLocalId,
              cantidad: Number(item.cantidad),
              unidad: item.unidad,
              precioCosto: costo,
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

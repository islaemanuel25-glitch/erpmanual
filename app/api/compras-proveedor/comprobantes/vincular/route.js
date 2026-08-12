// POST /api/compras-proveedor/comprobantes/vincular
//
// Vincula una línea leída a un producto, y GUARDA EL ALIAS.
//
// El alias es lo único que hace que el trabajo manual de hoy ahorre trabajo
// mañana: sin él, la misma factura del mes que viene vuelve a pedir las mismas
// veinte decisiones. Por eso se escribe en la MISMA transacción que el vínculo —
// que quede uno sin el otro sería el peor de los dos mundos.
//
// ── ESTA RUTA NO TOCA NINGÚN COSTO ─────────────────────────────────────────
//
// Vincular es decir a qué producto corresponde la línea. Escribir el precio es
// otra decisión, con su propia frontera y sus umbrales, y viene en su tanda.
// Mezclarlas haría que confirmar un vínculo moviera plata sin que nadie lo
// hubiera pedido.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { aliasAEscribir } from "@/lib/compras-proveedor/comprobante/vinculo";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const lineaId = Number(body?.lineaId);
    const productoBaseId = Number(body?.productoBaseId);
    const pedidoDetalleId = Number(body?.pedidoDetalleId) > 0 ? Number(body.pedidoDetalleId) : null;

    if (!Number.isFinite(lineaId) || !Number.isFinite(productoBaseId)) {
      return NextResponse.json(
        { ok: false, error: "Faltan la línea o el producto.", queHacer: "Elegí un producto de la lista." },
        { status: 400 }
      );
    }

    // El alcance por relación: una línea de otro grupo no existe.
    const linea = await prisma.comprobanteLinea.findFirst({
      where: { id: lineaId, comprobante: { grupoId } },
      select: {
        id: true, textoCrudo: true,
        comprobante: { select: { id: true, proveedorId: true, estado: true, confirmadoEn: true } },
      },
    });
    if (!linea) {
      return NextResponse.json({ ok: false, error: "No existe esa línea." }, { status: 404 });
    }
    if (linea.comprobante.estado === "ANULADO") {
      return NextResponse.json(
        { ok: false, error: "El comprobante está anulado.", queHacer: "No se puede vincular sobre un anulado." },
        { status: 409 }
      );
    }
    if (linea.comprobante.confirmadoEn) {
      // Ya alguien lo dio por bueno en una recepción: cambiar el vínculo ahora
      // movería el costo de otro producto sin que nadie lo revise.
      return NextResponse.json(
        {
          ok: false,
          error: "Este comprobante ya fue confirmado en una recepción.",
          queHacer: "Para cambiarlo hay que revisarlo desde la segunda revisión del dueño.",
        },
        { status: 409 }
      );
    }

    // El producto tiene que existir EN ESTE GRUPO y tener fila en esta
    // ubicación: el vínculo apunta a `productoLocalId`, que es por local.
    const productoLocal = await prisma.productoLocal.findFirst({
      where: { localId, baseId: productoBaseId, base: { grupoId } },
      select: { id: true, base: { select: { id: true, nombre: true } } },
    });
    if (!productoLocal) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ese producto no está disponible en esta ubicación.",
          queHacer: "Elegí uno de la lista, o creá el producto acá antes de vincularlo.",
        },
        { status: 404 }
      );
    }

    const alias = aliasAEscribir({
      linea: { codigoProveedor: body?.codigoProveedor ?? null, descripcion: linea.textoCrudo },
      productoBaseId,
      grupoId,
      proveedorId: linea.comprobante.proveedorId,
    });

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.comprobanteLinea.update({
        where: { id: linea.id },
        data: { productoLocalId: productoLocal.id, pedidoDetalleId },
      });

      // El alias va en la MISMA transacción. Que quede el vínculo sin el alias
      // haría que la próxima factura volviera a preguntar lo mismo, y que quede
      // el alias sin el vínculo dejaría un macheo automático que nadie confirmó.
      let aliasGuardado = null;
      if (alias) {
        aliasGuardado = await tx.productoCodigoProveedor.upsert({
          where: {
            codigo_interno_unico_por_proveedor: {
              grupoId: alias.grupoId,
              proveedorId: alias.proveedorId,
              codigoInterno: alias.codigoInterno,
            },
          },
          // Si ya existía apuntando a otro producto, se REAPUNTA y se reactiva:
          // la decisión de ahora, hecha mirando la factura, gana sobre una vieja.
          update: {
            productoBaseId: alias.productoBaseId,
            descripcionProveedor: alias.descripcionProveedor,
            activo: true,
          },
          create: alias,
          select: { id: true, codigoInterno: true },
        });
      }
      return { aliasGuardado };
    });

    return NextResponse.json({
      ok: true,
      lineaId: linea.id,
      productoLocalId: productoLocal.id,
      producto: productoLocal.base,
      alias: resultado.aliasGuardado,
      queHacer: resultado.aliasGuardado
        ? `Vinculado. La próxima factura de este proveedor va a reconocer "${linea.textoCrudo}" sola.`
        : "Vinculado. No se pudo guardar el alias porque la línea no trae ni código ni descripción.",
    });
  } catch (err) {
    console.error("Error comprobantes/vincular:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "vincular la línea con el producto",
        quedo: "Puede que el vínculo haya quedado hecho: volvé a abrir el detalle y fijate antes de repetirlo.",
      }) }, { status: 500 });
  }
}

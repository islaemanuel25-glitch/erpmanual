// POST /api/compras-proveedor/recepcion/recalcular
//
// AL ABRIR UN PEDIDO QUE SE ESTÁ RECIBIENDO, SE RECALCULA CON LO YA LEÍDO.
//
// Mauro #298 (2026-10-26): los dos papeles del pedido ya estaban subidos y
// leídos con las reglas de antes —dos facturas, una "no cierra" y otra "sin
// total", y 10 productos sin vincular—. Tienen que quedar bien sin volver a
// subirlos. Esta ruta hace, sobre lo guardado y SIN llamar a la IA, lo mismo
// que hace la lectura de un papel al terminar:
//
//   1. juntar las hojas de un mismo papel, incluidas las que solo cierran
//      sumadas (`agruparLasHojasDelPapel`);
//   2. vincular contra el pedido lo que el pedido explica por nombre y por
//      precio, y guardarlo como alias (`vincularContraElPedido`).
//
// Las dos son idempotentes: con nada que hacer, no escriben nada. No mueve
// stock ni escribe costos —eso es de `recibir/[id]`— y no toca un pedido que no
// esté ENVIADO.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { agruparLasHojasDelPapel } from "@/lib/compras-proveedor/comprobante/fusionarHojas";
import { vincularContraElPedido } from "@/lib/compras-proveedor/comprobante/vincularContraElPedido";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const pedidoId = Number(body?.pedidoId);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return NextResponse.json(
        { ok: false, error: "No se sabe qué pedido recalcular.", queHacer: "Volvé a abrir el pedido." },
        { status: 400 }
      );
    }
    const pedido = await prisma.pedidoProveedor.findFirst({
      where: { id: pedidoId, grupoId },
      select: { id: true, estado: true, proveedorId: true },
    });
    if (!pedido) return NextResponse.json({ ok: false, error: "No existe ese pedido." }, { status: 404 });
    if (pedido.estado !== "ENVIADO") return NextResponse.json({ ok: true, fusiones: [], vinculadas: [] });

    const agrupacion = await agruparLasHojasDelPapel(prisma, {
      grupoId,
      pedidoId,
      proveedorId: pedido.proveedorId,
    });
    const { vinculadas } = await vincularContraElPedido(prisma, { grupoId, localId, pedidoId });

    return NextResponse.json({ ok: true, fusiones: agrupacion?.fusiones ?? [], vinculadas });
  } catch (e) {
    console.error("Error compras-proveedor/recepcion/recalcular:", e);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "recalcular el pedido con los papeles ya leídos",
          quedo: "Los papeles siguen como estaban: no se perdió nada.",
        }),
      },
      { status: 500 }
    );
  }
}

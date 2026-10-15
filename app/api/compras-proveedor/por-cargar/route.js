// app/api/compras-proveedor/por-cargar/route.js
//
// LAS COMPRAS POR CARGAR de la ubicación: lo que se le pagó a un proveedor
// desde "Pagar" del POS y todavía no se recibió en Compras. Solo lee.
//
// "Por cargar" no es una columna: es una compra ENVIADA cuya cuenta ya tiene un
// pago en efectivo de tipo Proveedor (`whereComprasPorCargar`). Recibirla la
// saca de la lista sola.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { ESTADO_POR_CARGAR, whereComprasPorCargar } from "@/lib/compras-proveedor/compraPorCargar";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const [local, pedidos] = await Promise.all([
      prisma.local.findUnique({ where: { id: localId }, select: { nombre: true } }),
      prisma.pedidoProveedor.findMany({
        where: whereComprasPorCargar({ grupoId, localId }),
        select: {
          id: true,
          createdAt: true,
          proveedor: { select: { id: true, nombre: true } },
          cuentaPorPagar: {
            select: {
              pagos: {
                select: {
                  monto: true,
                  fecha: true,
                  turnoId: true,
                  usuario: { select: { nombre: true } },
                  turno: { select: { operador: { select: { nombre: true } } } },
                },
                orderBy: { id: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // La foto del remito, si se sacó: el primer comprobante del pedido con archivo.
    const ids = pedidos.map((p) => p.id);
    const comprobantes = ids.length
      ? await prisma.comprobanteProveedor.findMany({
          where: { grupoId, pedidoId: { in: ids }, estado: { not: "ANULADO" }, archivos: { some: {} } },
          select: { id: true, pedidoId: true },
          orderBy: { id: "asc" },
        })
      : [];
    const fotoDe = new Map();
    for (const c of comprobantes) if (!fotoDe.has(c.pedidoId)) fotoDe.set(c.pedidoId, c.id);

    const items = pedidos.map((p) => {
      const pagos = p.cuentaPorPagar?.pagos || [];
      const primero = pagos[0] || null;
      return {
        id: p.id,
        proveedor: p.proveedor,
        fecha: primero?.fecha ?? p.createdAt,
        // Quien pagó: el operador de la caja, o la cuenta si no hubo PIN.
        cajero: primero?.turno?.operador?.nombre || primero?.usuario?.nombre || null,
        monto: desdeCentavos(pagos.reduce((s, x) => s + aCentavos(x.monto), 0)),
        fotoComprobanteId: fotoDe.get(p.id) ?? null,
        estado: ESTADO_POR_CARGAR,
      };
    });

    return NextResponse.json({ ok: true, local: { id: localId, nombre: local?.nombre ?? null }, items });
  } catch (e) {
    console.error("[compras-proveedor/por-cargar]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer las compras por cargar: ${e.message}` },
      { status: 500 }
    );
  }
}

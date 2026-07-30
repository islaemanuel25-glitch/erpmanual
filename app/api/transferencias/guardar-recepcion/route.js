// app/api/transferencias/guardar-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import {
  validarDetalleRecepcion,
  mensajeRecepcion,
  statusRecepcion,
} from "@/lib/transferencias/recepcion";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const { transferenciaId, items } = body;

    if (!transferenciaId || !Array.isArray(items)) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    // Scope: non-admin debe ser destino de la transferencia
    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      select: { destinoId: true, estado: true },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    if (transferencia.estado === "Recibida") {
      return NextResponse.json(
        { ok: false, error: "Esta transferencia ya fue confirmada. No se pueden guardar cambios." },
        { status: 400 }
      );
    }

    if (transferencia.estado !== "Enviada" && transferencia.estado !== "Recibiendo") {
      return NextResponse.json(
        { ok: false, error: `No se puede editar una transferencia en estado "${transferencia.estado}"` },
        { status: 400 }
      );
    }

    if (!session.esAdmin) {
      const localId = Number(session.localId || 0);
      if (!localId || localId !== transferencia.destinoId) {
        return NextResponse.json(
          { ok: false, error: "Sin permiso para esta transferencia" },
          { status: 403 }
        );
      }
    }

    // ============================================================
    // 🟦 VALIDACIÓN — contra la BASE, no contra lo que manda el cliente
    //
    // La cantidad enviada sale ahora del detalle persistido. Antes se leía de
    // `it.enviado`, es decir del propio request: bastaba mandar un `enviado`
    // inflado para guardar un `recibido` mayor al real y, al confirmar,
    // acreditarle al destino stock que nunca salió del origen.
    //
    // Se valida TODO antes de escribir nada: si un item falla, no se guarda
    // ninguno (evita dejar la recepción a medio registrar).
    // ============================================================
    const detalles = await prisma.transferenciaDetalle.findMany({
      where: { transferenciaId, id: { in: items.map((it) => Number(it.id)) } },
      include: { producto: { include: { base: true } } },
    });
    const porId = new Map(detalles.map((d) => [d.id, d]));

    const planes = [];
    for (const it of items) {
      const d = porId.get(Number(it.id));
      if (!d) {
        return NextResponse.json(
          { ok: false, error: "Detalle inexistente o de otra transferencia" },
          { status: 400 }
        );
      }

      const plan = validarDetalleRecepcion({
        detalle: {
          cantidad: d.cantidad, // ← fuente de verdad: la base
          unidadEnviada: d.unidadEnviada,
          motivoPrincipal: it.motivoPrincipal,
          motivoDetalle: it.motivoDetalle,
        },
        factorPack: Number(d.producto?.base?.factor_pack || 1),
        recibidoPropuesto: it.recibido,
      });

      if (!plan.ok) {
        const nombre = d.producto?.base?.nombre || null;
        return NextResponse.json(
          { ok: false, codigo: plan.error, error: mensajeRecepcion(plan.error, { nombre }) },
          { status: statusRecepcion(plan.error) }
        );
      }

      planes.push({ id: d.id, plan, it });
    }

    // Guardar cada item
    for (const { id, plan, it } of planes) {
      await prisma.transferenciaDetalle.update({
        where: { id },
        data: {
          recibido: plan.recibida,

          motivoPrincipal: plan.hayDiferencia ? it.motivoPrincipal || null : null,

          motivoDetalle:
            plan.hayDiferencia && it.motivoPrincipal === "Otro"
              ? it.motivoDetalle || null
              : null,
        },
      });
    }

    await prisma.transferencia.update({
      where: { id: transferenciaId },
      data: { estado: "Recibiendo" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("ERROR guardar-recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

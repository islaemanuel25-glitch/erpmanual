// app/api/turnos-y-cierres/movimientos/[id]/route.js
//
// PATCH /api/turnos-y-cierres/movimientos/:id { tipo } — LE ASIGNA EL TIPO A UN
// EGRESO SIN CLASIFICAR. Solo el tipo: ni el monto, ni la caja, ni el motivo.
// Cambia la mirada de la GANANCIA (si resta como sueldo o gasto); la de la
// PLATA —esperado, cierre, Tesorería— no lo lee.
//
// Solo un egreso manual: el de un pago de Finanzas ya dice qué fue por su
// vínculo (`sePuedeClasificar`). Lo hace quien tiene Finanzas, sobre una caja
// del local que está operando.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { clasificarMovimientos } from "@/lib/finanzas/movimientosDeCaja";
import { vinculosDeMovimientos } from "@/lib/finanzas/movimientosDeCajaServer";
import { ETIQUETA_TIPO_EGRESO, esTipoEgreso, sePuedeClasificar } from "@/lib/caja/tipoEgreso";
import { PERMISO_CLASIFICAR_PAGOS } from "@/lib/turnosYCierres/alcance";

export async function PATCH(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    const perm = checkPerm(session, PERMISO_CLASIFICAR_PAGOS);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const id = Number((await params)?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "Movimiento inválido." }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    if (!esTipoEgreso(body.tipo)) {
      return NextResponse.json({ ok: false, error: "Elegí qué fue ese pago." }, { status: 400 });
    }

    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json({ ok: false, error: vista.error, needsContexto: vista.needsContexto }, { status: vista.status });
    }
    if (!vista.localId) {
      return NextResponse.json({ ok: false, error: "Elegí un local.", needsContexto: true }, { status: 409 });
    }

    const mov = await prisma.cajaMovimiento.findUnique({
      where: { id },
      select: { id: true, tipo: true, monto: true, tipoEgreso: true, turno: { select: { localId: true } } },
    });
    if (!mov || mov.turno?.localId !== vista.localId) {
      return NextResponse.json({ ok: false, error: `No existe el movimiento #${id} en este local.` }, { status: 404 });
    }
    const [clasificado] = clasificarMovimientos([mov], await vinculosDeMovimientos(prisma, [mov.id]));
    if (!sePuedeClasificar(clasificado)) {
      return NextResponse.json(
        { ok: false, error: "Ese movimiento no es un pago manual desde la caja: su tipo no se cambia acá." },
        { status: 409 }
      );
    }

    const actualizado = await prisma.cajaMovimiento.update({
      where: { id },
      data: { tipoEgreso: body.tipo },
      select: { id: true, tipoEgreso: true },
    });
    return NextResponse.json({ ok: true, item: { ...actualizado, etiqueta: ETIQUETA_TIPO_EGRESO[actualizado.tipoEgreso] } });
  } catch (e) {
    console.error("[turnos-y-cierres/movimientos PATCH]", e);
    return NextResponse.json({ ok: false, error: `No se pudo clasificar el pago: ${e.message}` }, { status: 500 });
  }
}

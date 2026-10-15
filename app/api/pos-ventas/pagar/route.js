// app/api/pos-ventas/pagar/route.js
//
// "PAGAR" DESDE EL POS. Lo puede usar todo cajero con `pos.usar`: no pide
// Compras ni Finanzas. La plata sale SIEMPRE de la caja abierta de quien paga
// —no se elige otra— y cada tipo queda en su módulo
// (lib/caja/pagarDesdeElPosServer.js).
//
//   GET  ?turnoId=N → lo que la pantalla ofrece: la caja, su efectivo de
//        ahora, proveedores, categorías de gasto y empleados del local.
//   POST { turnoId, tipo, monto, idempotencyKey, proveedorId?, operadorId?,
//          modalidad?, categoriaId? } → el pago.
//
// La forma es la de "Caja +/−": identidad canónica, una respuesta rápida
// afuera y la que decide adentro de la transacción, con el turno tomado por
// `bloquearTurno` y la misma `rechazoDelTurno`.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { identidadParaOperar } from "@/lib/caja/identidadCajaServer";
import { bloquearTurno } from "@/lib/caja/cierreRelevoServer";
import { LIMITES_TRANSACCION_DEL_LOCAL } from "@/lib/pos-ventas/candadoDelLocal";
import { SELECT_TURNO, rechazoDelTurno } from "@/lib/caja/turnoParaMover";
import { esRechazoDePagar, leerPedidoDePago, pagarDesdeElPos } from "@/lib/caja/pagarDesdeElPosServer";
import { CATEGORIA_SUELDOS } from "@/lib/caja/tipoEgreso";
import { categoriasDeGasto } from "@/lib/finanzas/gastosServer";
import { leerDetalleDeCaja } from "@/lib/turnosYCierres/lecturaTurnosYCierresServer";
import { proveedorVisibleWhere } from "@/lib/visibilidad";

const PERMISO = "pos.usar";

async function contexto(req) {
  const perm = requirePerm(req, PERMISO);
  if (!perm.ok) return { respuesta: NextResponse.json({ ok: false, error: perm.error }, { status: perm.status }) };
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) {
    return { respuesta: NextResponse.json({ ok: false, error: scope.error }, { status: scope.status }) };
  }
  const id = await identidadParaOperar(req, scope.session, { localId: scope.localId });
  if (!id.ok) {
    return {
      respuesta: NextResponse.json({ ok: false, error: id.error, needsOperador: true }, { status: id.status }),
    };
  }
  return { scope, identidad: id.identidad };
}

export async function GET(req) {
  try {
    const c = await contexto(req);
    if (c.respuesta) return c.respuesta;
    const { localId, grupoId } = c.scope;

    const turnoId = Number(new URL(req.url).searchParams.get("turnoId"));
    const turno = Number.isInteger(turnoId) && turnoId > 0
      ? await prisma.turno.findUnique({ where: { id: turnoId }, select: SELECT_TURNO })
      : null;
    const rechazo = rechazoDelTurno(turno, localId, c.identidad);
    if (rechazo) return NextResponse.json(rechazo.cuerpo, { status: rechazo.status });

    const [detalle, proveedores, categorias, empleados] = await Promise.all([
      leerDetalleDeCaja(prisma, turnoId),
      prisma.proveedor.findMany({
        where: { AND: [{ activo: true }, proveedorVisibleWhere(localId, grupoId)] },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
      categoriasDeGasto(prisma),
      prisma.operadorEnLocal.findMany({
        where: { localId, operador: { activo: true } },
        select: { operador: { select: { id: true, nombre: true } } },
        orderBy: { operador: { nombre: "asc" } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      caja: { id: turnoId, efectivoAhora: detalle?.detalle?.efectivo?.teniaQueHaber ?? null },
      proveedores,
      // Sueldos tiene su propio botón: como "Gasto" no se ofrece.
      categorias: categorias.filter((x) => x.nombre !== CATEGORIA_SUELDOS).map((x) => ({ id: x.id, nombre: x.nombre })),
      empleados: empleados.map((e) => e.operador),
    });
  } catch (e) {
    console.error("[pos-ventas/pagar GET]", e);
    return NextResponse.json({ ok: false, error: `No se pudo abrir Pagar: ${e.message}` }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const c = await contexto(req);
    if (c.respuesta) return c.respuesta;
    const { localId, grupoId, session } = c.scope;

    const body = await req.json().catch(() => ({}));
    const turnoId = Number(body.turnoId);
    const pedido = leerPedidoDePago(body);
    if (pedido.error) return NextResponse.json({ ok: false, error: pedido.error }, { status: 400 });

    const turno = Number.isInteger(turnoId) && turnoId > 0
      ? await prisma.turno.findUnique({ where: { id: turnoId }, select: SELECT_TURNO })
      : null;
    const rechazo = rechazoDelTurno(turno, localId, c.identidad);
    if (rechazo) return NextResponse.json(rechazo.cuerpo, { status: rechazo.status });

    const resultado = await prisma.$transaction(async (tx) => {
      await bloquearTurno(tx, turnoId);
      const vigente = await tx.turno.findUnique({ where: { id: turnoId }, select: SELECT_TURNO });
      const rechazoVigente = rechazoDelTurno(vigente, localId, c.identidad);
      if (rechazoVigente) return { rechazo: rechazoVigente };
      const pago = await pagarDesdeElPos(tx, { ...pedido, turnoId, localId, grupoId, session, body });
      return { pago };
    }, LIMITES_TRANSACCION_DEL_LOCAL);

    if (resultado.rechazo) {
      return NextResponse.json(resultado.rechazo.cuerpo, { status: resultado.rechazo.status });
    }
    return NextResponse.json({ ok: true, ...resultado.pago });
  } catch (e) {
    if (esRechazoDePagar(e)) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 400 });
    }
    console.error("[pos-ventas/pagar POST]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo registrar el pago. No salió plata de la caja: ${e.message}` },
      { status: 500 }
    );
  }
}

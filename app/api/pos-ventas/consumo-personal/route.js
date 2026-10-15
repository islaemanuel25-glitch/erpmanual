// app/api/pos-ventas/consumo-personal/route.js
//
// CONSUMO DEL PERSONAL desde el panel de cobro del POS. Lo puede registrar
// todo cajero con `pos.usar`. No es una venta: sale del stock con las
// funciones de la venta y queda como Gasto al costo
// (lib/pos-ventas/consumoPersonalServer.js).
//
//   POST { turnoId, operadorId, items, idempotencyKey } → el consumo.
//
// Quién consume se elige entre los operarios del local; la lista la da
// `/api/pos-ventas/pagar` (GET), la misma que usa "Sueldo" en Pagar.

import { NextResponse } from "next/server";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { identidadParaOperar } from "@/lib/caja/identidadCajaServer";
import { leerPedidoDeConsumo } from "@/lib/pos-ventas/consumoPersonal";
import { ErrorConsumoPersonal, registrarConsumoPersonal } from "@/lib/pos-ventas/consumoPersonalServer";
import { ErrorGasto } from "@/lib/finanzas/gastosServer";

const PERMISO = "pos.usar";

export async function POST(req) {
  try {
    const perm = requirePerm(req, PERMISO);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, grupoId, session } = scope;
    const id = await identidadParaOperar(req, session, { localId });
    if (!id.ok) {
      return NextResponse.json({ ok: false, error: id.error, needsOperador: true }, { status: id.status });
    }

    const body = await req.json().catch(() => ({}));
    const pedido = leerPedidoDeConsumo(body);
    if (pedido.error) return NextResponse.json({ ok: false, error: pedido.error }, { status: 400 });

    const consumo = await registrarConsumoPersonal({ localId, grupoId, session, identidad: id.identidad, pedido });
    return NextResponse.json({ ok: true, ...consumo });
  } catch (e) {
    if (e instanceof ErrorConsumoPersonal) {
      return NextResponse.json({ ...(e.extra || {}), ok: false, error: e.message }, { status: e.status || 400 });
    }
    if (e instanceof ErrorGasto) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 400 });
    }
    // Stock insuficiente, producto que no está en el local, combo inválido:
    // los mismos errores con texto que da la venta.
    if (e?.status === 409 || e?.esErrorVentaCombo || e?.esProductoNoEnLocal) {
      return NextResponse.json(
        { ok: false, error: e.message, limitante: e.limitante ?? undefined },
        { status: e.status || 400 }
      );
    }
    console.error("[pos-ventas/consumo-personal POST]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo registrar el consumo. No salió nada del stock: ${e.message}` },
      { status: 500 }
    );
  }
}

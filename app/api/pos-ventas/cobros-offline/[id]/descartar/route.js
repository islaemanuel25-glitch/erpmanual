// POST /api/pos-ventas/cobros-offline/[id]/descartar   { motivo }
//
// DESCARTAR UN COBRO OFFLINE: la salida EXCEPCIONAL de un cobro que no pudo
// convertirse en venta —su caja cerró antes de sincronizarse, por ejemplo—.
// Una persona con `ventas.resolver_offline` decide, con motivo, que ese cobro
// no va a ser venta. No crea ventas, no mueve dinero ni stock, no toca turnos:
// el cobro queda DESCARTADA con quién, cuándo y por qué, y `crear` ya no acepta
// una venta con ese id. Ver descartarCobroOffline en
// lib/pos-ventas/cobroOfflineServidor.js.
//
// Respuestas:
//   200 { ok, resultado: "DESCARTADA", estado }
//   409 { code: "COBRO_CON_VENTA" }       ya hay una venta con ese id; si es la
//                                          de su caja, el cobro quedó SINCRONIZADA
//   409 { code: "COBRO_YA_RESUELTO" }     ya está SINCRONIZADA o DESCARTADA
//   404                                    no existe o es de otro local
//   400                                    sin motivo

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { getOperadorActivoDelLocal } from "@/lib/operador";
import { PERMISO_RESOLVER_COBROS_OFFLINE, idPositivo, validarMotivoDescarte } from "@/lib/pos-ventas/cobroOffline";
import { descartarCobroOffline, RESULTADO_DESCARTE } from "@/lib/pos-ventas/cobroOfflineServidor";

const NO_ENCONTRADO = "No se encontró ese cobro offline.";

export async function POST(req, context) {
  try {
    const perm = requirePerm(req, PERMISO_RESOLVER_COBROS_OFFLINE);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, grupoId, session } = scope;

    const { id } = await context.params;
    const cobroId = idPositivo(id);
    if (!cobroId) return NextResponse.json({ ok: false, error: NO_ENCONTRADO }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const motivo = validarMotivoDescarte(body?.motivo);
    if (!motivo.valido) return NextResponse.json({ ok: false, error: motivo.error }, { status: 400 });

    // Quién resuelve: la cuenta y, si hay un PIN válido en el local, su
    // operador. No se exige PIN: es una decisión administrativa, como cerrar
    // sin conteo, y su autoría es la cuenta.
    const operador = await getOperadorActivoDelLocal(req, localId);
    const r = await descartarCobroOffline(prisma, {
      cobroId,
      localId,
      grupoId,
      usuarioId: session.id,
      operadorId: operador?.operadorId ?? null,
      motivo: motivo.motivo,
    });

    if (r.resultado === RESULTADO_DESCARTE.DESCARTADA) {
      return NextResponse.json({ ok: true, resultado: r.resultado, estado: r.estado });
    }
    if (r.resultado === RESULTADO_DESCARTE.NO_ENCONTRADO) {
      return NextResponse.json({ ok: false, error: NO_ENCONTRADO }, { status: 404 });
    }
    if (r.resultado === RESULTADO_DESCARTE.TIENE_VENTA) {
      return NextResponse.json(
        {
          ok: false,
          code: "COBRO_CON_VENTA",
          error: "Ese cobro ya tiene una venta con su id: no se puede descartar.",
          estado: r.estado,
          ...(r.ventaId ? { ventaId: r.ventaId } : {}),
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, code: "COBRO_YA_RESUELTO", error: "Ese cobro ya está resuelto.", estado: r.estado },
      { status: 409 }
    );
  } catch (err) {
    console.error("Error descartando un cobro offline:", err);
    return NextResponse.json({ ok: false, error: "No se pudo descartar el cobro offline. Reintentá." }, { status: 500 });
  }
}

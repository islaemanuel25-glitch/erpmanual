// GET /api/pos-ventas/cobros-offline?estado=PENDIENTE,REQUIERE_REVISION
//
// LOS COBROS OFFLINE DEL LOCAL, por estado. Por defecto, los que todavía no se
// resolvieron. Solo lectura.
//
// Cada uno se ve si se ve su caja (lib/pos-ventas/cobrosOfflineConsulta.js): un
// cajero, los de la suya; quien ve todas las cajas del local o puede resolver
// cobros offline, todos los del local. Nada de otros locales.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { PERMISO_RESOLVER_COBROS_OFFLINE } from "@/lib/pos-ventas/cobroOffline";
import { estadosPedidos, alcanceDeMirada, listarCobrosOffline } from "@/lib/pos-ventas/cobrosOfflineConsulta";

export async function GET(req) {
  try {
    const perm = requirePerm(req, ["pos.usar", "turnos.ver_todos", PERMISO_RESOLVER_COBROS_OFFLINE]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const estados = estadosPedidos(new URL(req.url).searchParams.get("estado"));
    if (!estados) return NextResponse.json({ ok: false, error: "Estado de cobro desconocido." }, { status: 400 });

    const alcance = await alcanceDeMirada(req, session, { localId });
    const { items, truncado } = await listarCobrosOffline(prisma, { localId, estados, alcance });
    return NextResponse.json({ ok: true, items, truncado, verTodas: alcance.verTodas });
  } catch (err) {
    console.error("Error listando cobros offline:", err);
    return NextResponse.json({ ok: false, error: "No se pudieron leer los cobros offline." }, { status: 500 });
  }
}

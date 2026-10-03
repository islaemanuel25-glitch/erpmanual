// GET /api/pos-ventas/cobros-offline/[id]
//
// UN COBRO OFFLINE, con lo que hace falta para entenderlo: quién lo cobró y lo
// registró, cuándo, su caja, sus ítems, sus intentos y su último rechazo, su
// venta si la tiene y su resolución si la tuvo. El payload va tal como se
// guardó: es evidencia.
//
// Si no existe, es de otro local o su caja no se puede ver, la respuesta es la
// misma: 404.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { PERMISO_RESOLVER_COBROS_OFFLINE, idPositivo } from "@/lib/pos-ventas/cobroOffline";
import { alcanceDeMirada, detalleCobroOffline } from "@/lib/pos-ventas/cobrosOfflineConsulta";

const NO_ENCONTRADO = "No se encontró ese cobro offline.";

export async function GET(req, context) {
  try {
    const perm = requirePerm(req, ["pos.usar", "turnos.ver_todos", PERMISO_RESOLVER_COBROS_OFFLINE]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const { id } = await context.params;
    const cobroId = idPositivo(id);
    if (!cobroId) return NextResponse.json({ ok: false, error: NO_ENCONTRADO }, { status: 404 });

    const alcance = await alcanceDeMirada(req, session, { localId });
    const item = await detalleCobroOffline(prisma, { cobroId, localId, alcance });
    if (!item) return NextResponse.json({ ok: false, error: NO_ENCONTRADO }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("Error leyendo un cobro offline:", err);
    return NextResponse.json({ ok: false, error: "No se pudo leer el cobro offline." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { getDefaultDeposito, setDefaultDeposito } from "@/lib/precios/defaultDeposito";

// GET: config de la lista predeterminada del DEPÓSITO activo (o esDeposito=false si es local).
export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "listas_precios.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const data = await getDefaultDeposito({ prisma, grupoId, localId });
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    if (error?.status) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("Error GET default-deposito:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// PUT: setea (o quita con null) la default del depósito activo. Local normal → 403.
export async function PUT(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "listas_precios.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = (await req.json()) || {};
    const listaPrecioDefaultId =
      body.listaPrecioDefaultId === null || body.listaPrecioDefaultId === undefined
        ? null
        : body.listaPrecioDefaultId;

    const data = await setDefaultDeposito({ prisma, grupoId, localId, listaPrecioDefaultId });
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    if (error?.status) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("Error PUT default-deposito:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

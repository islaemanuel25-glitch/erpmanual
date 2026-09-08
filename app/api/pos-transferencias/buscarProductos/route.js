// app/api/pos-transferencias/buscarProductos/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { buscarCatalogoLocal } from "@/lib/productos/buscarCatalogoLocal";

// BUSCAR PRODUCTOS PARA ARMAR UNA TRANSFERENCIA.
//
// ── LA BÚSQUEDA SE MUDÓ AL KIT, LA AUTORIZACIÓN SE QUEDÓ ──────────────────
//
// El universo, el ranking y el mapeo viven ahora en
// `lib/productos/buscarCatalogoLocal.js`, porque la recepción de transferencias
// necesita EXACTAMENTE la misma búsqueda con otra autorización. Copiarla habría
// dejado dos buscadores que se separan el día que uno aprende a excluir algo.
//
// Lo que se queda acá es lo único propio de esta pantalla y lo que NO se puede
// compartir: quién puede buscar y en qué local. Acá el que busca es el ORIGEN y
// tiene que ser su propio local; en recepción es el DESTINO y el catálogo es el
// del origen de esa transferencia.

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos_transferencias.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    let origenId = Number(searchParams.get("origenId") || 0);
    const fromVoice = searchParams.get("fromVoice") === "true";

    if (!origenId) origenId = Number(session.localId || 0);

    if (!origenId) {
      return NextResponse.json(
        { ok: false, error: "origenId requerido" },
        { status: 400 }
      );
    }

    if (!session.esAdmin && origenId !== Number(session.localId)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para este local" },
        { status: 403 }
      );
    }

    const { items, total, queryInterpretada } = await buscarCatalogoLocal(prisma, {
      localId: origenId,
      q,
      fromVoice,
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      ...(fromVoice && q ? { queryInterpretada } : {}),
      error: null,
    });
  } catch (err) {
    console.error("Error buscarProductos:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos" },
      { status: 500 }
    );
  }
}

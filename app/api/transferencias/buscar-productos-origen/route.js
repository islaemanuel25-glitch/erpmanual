// app/api/transferencias/buscar-productos-origen/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { buscarCatalogoLocal, mapProductoParaRecepcion } from "@/lib/productos/buscarCatalogoLocal";
import { estadoAdmiteRecepcion, puedeRecibir } from "@/lib/transferencias/recepcionServidor";

// BUSCAR EN EL CATÁLOGO DEL ORIGEN, PARA AGREGAR UN PRODUCTO QUE LLEGÓ DE MÁS.
//
// ── POR QUÉ NO SE REUSÓ `pos-transferencias/buscarProductos` ──────────────
//
// Porque protege exactamente al revés de lo que hace falta acá. Ese endpoint
// exige que el local buscado sea el de la SESIÓN:
//
//     if (!session.esAdmin && origenId !== Number(session.localId)) → 403
//
// y en una recepción el que busca es el DESTINO mientras el catálogo que
// necesita es el del ORIGEN. Con esa regla, un local destino no puede usarlo
// nunca. Sacarle la comprobación habría abierto el catálogo de cualquier local a
// cualquiera que tenga el permiso del POS.
//
// Lo que sí se reusó es la BÚSQUEDA: el universo, el ranking y el mapeo salieron
// a `lib/productos/buscarCatalogoLocal.js` y los dos endpoints llaman ahí. No hay
// dos buscadores.
//
// ── LA AUTORIZACIÓN, QUE ES LO PROPIO DE ESTA RUTA ────────────────────────
//
//   · permiso `transferencias.recibir`, el mismo que guardar y confirmar;
//   · solo el DESTINO de ESA transferencia, salvo admin;
//   · el ORIGEN no se recibe por parámetro: se lee de la transferencia
//     persistida. Si viniera del request, cualquiera con el permiso podría
//     listar el catálogo de cualquier local pasando otro número;
//   · solo mientras la recepción está abierta. Buscar productos para agregar a
//     una transferencia ya confirmada no tiene sentido y sería el primer paso de
//     intentar agregarlos.

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "transferencias.recibir");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = new URL(req.url);
    const transferenciaId = Number(searchParams.get("transferenciaId") || 0);
    const q = (searchParams.get("q") || "").trim();
    const fromVoice = searchParams.get("fromVoice") === "true";

    if (!transferenciaId) {
      return NextResponse.json(
        { ok: false, error: "transferenciaId requerido" },
        { status: 400 }
      );
    }

    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      select: { id: true, origenId: true, destinoId: true, estado: true },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    const alcance = puedeRecibir(session, transferencia);
    if (!alcance.ok) {
      return NextResponse.json(
        { ok: false, error: alcance.error },
        { status: alcance.status }
      );
    }

    const estado = estadoAdmiteRecepcion(transferencia.estado, { accion: "buscar productos" });
    if (!estado.ok) {
      return NextResponse.json(
        { ok: false, error: estado.error },
        { status: estado.status }
      );
    }

    // El origen sale de la transferencia, nunca del request.
    const { items, total, queryInterpretada } = await buscarCatalogoLocal(prisma, {
      localId: transferencia.origenId,
      q,
      fromVoice,
    });

    // ── EL JSON DE RECEPCIÓN NO LLEVA STOCK NI COSTO ────────────────────────
    //
    // `buscarCatalogoLocal` los trae porque el POS los necesita. Quien recibe
    // mercadería, no: lo que tiene que hacer es identificar el producto que
    // tiene en la mano y decir en qué presentación llegó.
    //
    // No alcanza con no dibujarlos. Mientras viajen en la respuesta están a un
    // `fetch` de cualquiera con `transferencias.recibir`, y ese permiso no es el
    // de ver costos. Por eso hay una proyección explícita y no un `delete`
    // suelto: lo que se agregue mañana al mapper compartido NO sale por acá
    // hasta que alguien lo ponga a propósito.
    return NextResponse.json({
      ok: true,
      origenId: transferencia.origenId,
      items: items.map(mapProductoParaRecepcion),
      total,
      ...(fromVoice && q ? { queryInterpretada } : {}),
      error: null,
    });
  } catch (err) {
    console.error("Error buscar-productos-origen:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos del origen" },
      { status: 500 }
    );
  }
}

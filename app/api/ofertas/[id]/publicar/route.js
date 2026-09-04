import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { estadoOferta, ESTADO_OFERTA } from "@/lib/ofertas/estados";
import { registrarEventoOferta, buscarConflictos, textoConflicto } from "@/lib/ofertas/servidor";
import { puedePublicarOfertas } from "@/lib/ofertas/integracionPos";

// PUBLICAR: el momento en que la oferta empieza a cambiar lo que se le cobra a
// la gente. Es un acto separado de crear y de editar, con su propio clic, a
// propósito.
//
// ⚠️ HOY ESTÁ ENCLAVADO. Ver lib/ofertas/integracionPos.js: el POS todavía no
// sabe mostrar el precio promocional, así que publicar dejaría al cliente
// pagando un importe distinto al de la pantalla. Todo lo demás del módulo
// funciona; lo único bloqueado es poner una oferta a cobrar.

export async function POST(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "ofertas.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const gate = puedePublicarOfertas();
    if (!gate.puede) {
      // 409 y no 403: no es que a esta persona le falte permiso, es que el
      // sistema todavía no puede honrarlo. El mensaje lo dice completo.
      return NextResponse.json(
        { ok: false, error: gate.motivo, publicacionBloqueada: true },
        { status: 409 }
      );
    }

    const { id } = await params;
    const ofertaId = Number(id);

    const oferta = await prisma.oferta.findFirst({
      where: { id: ofertaId, localId },
      include: { lineas: { select: { productoLocalId: true } } },
    });
    if (!oferta) {
      return NextResponse.json({ ok: false, error: "Esa oferta no existe en este local." }, { status: 404 });
    }

    const estado = estadoOferta(oferta);
    if (estado !== ESTADO_OFERTA.BORRADOR) {
      return NextResponse.json(
        { ok: false, error: `Esta oferta ya está publicada (${estado}).` },
        { status: 409 }
      );
    }

    if (oferta.lineas.length === 0) {
      return NextResponse.json(
        { ok: false, error: "La oferta no tiene productos: publicarla no cambiaría ningún precio." },
        { status: 400 }
      );
    }

    const publicada = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(localId)})`;

      // Un borrador NO compite por solapamiento —no rige—, así que el conflicto
      // recién puede aparecer ACÁ, al publicarlo. Es el único momento en que hay
      // que volver a preguntarlo.
      const choques = await buscarConflictos(tx, {
        localId,
        inicioEn: oferta.inicioEn,
        finEn: oferta.finEn,
        productoLocalIds: oferta.lineas.map((l) => l.productoLocalId),
        excluirOfertaId: ofertaId,
      });
      if (choques.length > 0) {
        const e = new Error(textoConflicto(choques));
        e.esConflictoDeOferta = true;
        throw e;
      }

      const res = await tx.oferta.update({
        where: { id: ofertaId },
        data: { publicadaEn: new Date(), publicadaPorId: session.id },
      });

      await registrarEventoOferta(tx, {
        ofertaId,
        tipo: "PUBLICADA",
        usuarioId: session.id,
        valorNuevo: { publicadaEn: res.publicadaEn, productos: oferta.lineas.length },
      });

      return res;
    });

    return NextResponse.json({ ok: true, ofertaId: publicada.id, publicadaEn: publicada.publicadaEn });
  } catch (err) {
    if (err.esConflictoDeOferta) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    console.error("Error publicando oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo publicar la oferta: ${err.message}` },
      { status: 500 }
    );
  }
}

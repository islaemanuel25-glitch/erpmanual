import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { estadoOferta, ESTADO_OFERTA } from "@/lib/ofertas/estados";
import { registrarEventoOferta } from "@/lib/ofertas/servidor";

// FINALIZAR = ARCHIVAR. La oferta deja de aplicarse desde este instante y sale
// del trabajo diario, pero no se borra: sus ventas la siguen nombrando y alguien
// va a querer ver qué se había configurado.
//
// Los tres campos van juntos —cuándo, quién y por qué— igual que la anulación de
// una venta. Una finalización sin autor es indistinguible, dentro de un mes, de
// un error de datos. El motivo es opcional porque bajar una promoción no siempre
// tiene una historia atrás; el autor y la fecha no lo son.

export async function POST(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "ofertas.finalizar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const ofertaId = Number(id);

    const oferta = await prisma.oferta.findFirst({
      where: { id: ofertaId, localId },
      include: { lineas: { select: { id: true, revisionPendienteDesde: true } } },
    });
    if (!oferta) {
      return NextResponse.json({ ok: false, error: "Esa oferta no existe en este local." }, { status: 404 });
    }

    if (estadoOferta(oferta) === ESTADO_OFERTA.FINALIZADA) {
      return NextResponse.json(
        { ok: false, error: "Esa oferta ya estaba finalizada." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const motivo = body?.motivo ? String(body.motivo).trim() : null;

    const ahora = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.oferta.update({
        where: { id: ofertaId },
        data: { finalizadaEn: ahora, finalizadaPorId: session.id, motivoFinalizacion: motivo },
      });

      // Las marcas de revisión se levantan al archivar. Una oferta que ya no
      // rige no tiene nada que revisar, y dejarlas puestas haría que el archivo
      // se viera lleno de avisos que nadie puede ni debe atender.
      await tx.ofertaLinea.updateMany({
        where: { ofertaId, revisionPendienteDesde: { not: null } },
        data: { revisionPendienteDesde: null, costoAlDetectar: null },
      });

      await registrarEventoOferta(tx, {
        ofertaId,
        tipo: "FINALIZADA",
        usuarioId: session.id,
        valorNuevo: { finalizadaEn: ahora, motivo },
        nota: motivo,
      });
    });

    return NextResponse.json({ ok: true, ofertaId, finalizadaEn: ahora });
  } catch (err) {
    console.error("Error finalizando oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo finalizar la oferta: ${err.message}` },
      { status: 500 }
    );
  }
}

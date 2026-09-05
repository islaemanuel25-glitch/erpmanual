import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { referenciasDeProducto, registrarEventoOferta } from "@/lib/ofertas/servidor";

// CONFIRMAR LA REVISIÓN DE UNA O VARIAS LÍNEAS.
//
// Es lo que hace la persona después de mirar el "$650 → $820": dice "lo vi, lo
// banco así". Al confirmar pasan dos cosas y las dos importan:
//
//   1. Se levanta la marca, y la oferta sale del estado REVISAR.
//   2. **Se vuelve a fotografiar el costo.** De ahí en adelante el costo de
//      referencia es el nuevo, así que el próximo aviso va a comparar contra lo
//      que la persona aceptó y no contra un valor de hace tres semanas. Sin
//      esto, el mismo cambio volvería a avisar para siempre y la gente
//      aprendería a ignorar el aviso — que es la única forma de romper un
//      control sin tocar una línea de código.
//
// El precio de oferta NO se toca acá. Si además hay que cambiarlo, eso es editar
// las líneas, y es otra acción con su propio rastro.

export async function POST(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "ofertas.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const ofertaId = Number(id);

    const oferta = await prisma.oferta.findFirst({
      where: { id: ofertaId, localId },
      include: { lineas: { where: { revisionPendienteDesde: { not: null } } } },
    });
    if (!oferta) {
      return NextResponse.json({ ok: false, error: "Esa oferta no existe en este local." }, { status: 404 });
    }
    if (oferta.finalizadaEn != null) {
      return NextResponse.json(
        { ok: false, error: "Esa oferta está finalizada: no hay nada que revisar." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    // Sin lista explícita se confirman TODAS las marcadas: es el botón
    // "Revisado todo" de la pantalla. Con lista, solo esas.
    const pedidas = Array.isArray(body?.lineaIds)
      ? oferta.lineas.filter((l) => body.lineaIds.map(Number).includes(l.id))
      : oferta.lineas;

    if (pedidas.length === 0) {
      return NextResponse.json({ ok: true, revisadas: 0, sinCambios: true });
    }

    // El costo que se congela es el de AHORA, leído de la base. No el que venía
    // en `costoAlDetectar`: entre que se marcó y que la persona confirmó, el
    // costo pudo moverse otra vez, y lo que hay que dejar guardado es contra qué
    // se va a comparar de acá en adelante.
    const actuales = await referenciasDeProducto(prisma, {
      localId,
      productoLocalIds: pedidas.map((l) => l.productoLocalId),
    });

    const ahora = new Date();
    let revisadas = 0;

    await prisma.$transaction(async (tx) => {
      for (const l of pedidas) {
        const ref = actuales[l.productoLocalId];
        // Un producto que desapareció del local no se puede refotografiar. Se
        // deja marcado a propósito: el aviso sigue puesto y alguien va a tener
        // que sacar esa línea de la oferta, que es lo correcto.
        if (!ref) continue;

        await tx.ofertaLinea.update({
          where: { id: l.id },
          data: {
            revisionPendienteDesde: null,
            costoAlDetectar: null,
            costoReferencia: ref.costo,
            precioNormalReferencia: ref.precioNormal,
            revisadaEn: ahora,
            revisadaPorId: session.id,
          },
        });
        revisadas += 1;

        await registrarEventoOferta(tx, {
          ofertaId,
          ofertaLineaId: l.id,
          tipo: "REVISION_CONFIRMADA",
          usuarioId: session.id,
          valorAnterior: { costoReferencia: Number(l.costoReferencia) },
          valorNuevo: { costoReferencia: ref.costo, precioOferta: Number(l.precioOferta) },
          nota: ref.nombre,
        });
      }
    });

    return NextResponse.json({
      ok: true,
      revisadas,
      pendientes: pedidas.length - revisadas,
    });
  } catch (err) {
    console.error("Error confirmando revisión de oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo confirmar la revisión: ${err.message}` },
      { status: 500 }
    );
  }
}

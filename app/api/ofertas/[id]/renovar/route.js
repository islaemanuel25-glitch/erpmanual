import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { validarVentana } from "@/lib/ofertas/vigencia";
import { referenciasDeProducto, registrarEventoOferta } from "@/lib/ofertas/servidor";

// RENOVAR = DUPLICAR CON FECHAS NUEVAS.
//
// ── HAY DOS FORMAS DE RENOVAR Y ESTA ES LA SEGUNDA ──────────────────────────
//
// Si lo único que hace falta es correr la fecha de fin, no se usa esto: se edita
// la oferta (PATCH con `finEn`) y sigue siendo la misma, con su historia y sus
// ventas colgando. Es lo más liviano y es lo que hay que hacer casi siempre.
//
// Esto es para el otro caso: la oferta ya se finalizó, o se quiere arrancar una
// temporada nueva conservando la lista de productos pero sin mezclar las ventas
// de una con las de la otra. Nace una oferta NUEVA, en borrador, apuntando a la
// original con `renovadaDesdeId`.
//
// ── LOS PRECIOS SE COPIAN; LAS REFERENCIAS SE VUELVEN A SACAR ───────────────
//
// El precio de oferta se copia tal cual: es la decisión comercial que se quiere
// repetir. El precio normal y el costo de referencia, en cambio, se leen de HOY.
// Copiarlos de la oferta vieja sería arrastrar una foto de hace tres meses, y el
// aviso de cambio de costo compararía contra un número que ya no significa nada
// — el control quedaría encendido pero mirando al lugar equivocado.

export async function POST(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "ofertas.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const origenId = Number(id);

    const origen = await prisma.oferta.findFirst({
      where: { id: origenId, localId },
      include: { lineas: { orderBy: { id: "asc" } } },
    });
    if (!origen) {
      return NextResponse.json({ ok: false, error: "Esa oferta no existe en este local." }, { status: 404 });
    }
    if (origen.lineas.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Esa oferta no tiene productos: no hay nada que renovar." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const ventana = validarVentana({ inicioEn: body?.inicioEn, finEn: body?.finEn });
    if (!ventana.valido) {
      return NextResponse.json({ ok: false, error: ventana.error }, { status: 400 });
    }

    const actuales = await referenciasDeProducto(prisma, {
      localId,
      productoLocalIds: origen.lineas.map((l) => l.productoLocalId),
    });

    // Un producto que desapareció del local desde la oferta original no frena la
    // renovación entera: se saltea y se informa. Frenar obligaría a editar la
    // oferta vieja para poder copiarla, que es exactamente el trabajo que
    // renovar existe para evitar.
    const lineasNuevas = [];
    const salteados = [];
    for (const l of origen.lineas) {
      const ref = actuales[l.productoLocalId];
      if (!ref || ref.esServicio) {
        salteados.push(l.productoLocalId);
        continue;
      }
      const precioOferta = Number(l.precioOferta);
      // Si el precio normal bajó tanto que la oferta vieja ya no es oferta, la
      // línea se saltea: guardarla dejaría una "oferta" más cara que el precio
      // de góndola, que es peor que no tenerla.
      if (!(precioOferta > 0) || precioOferta >= ref.precioNormal) {
        salteados.push(l.productoLocalId);
        continue;
      }
      lineasNuevas.push({
        productoLocalId: l.productoLocalId,
        productoBaseId: ref.productoBaseId,
        precioOferta,
        precioNormalReferencia: ref.precioNormal,
        costoReferencia: ref.costo,
      });
    }

    if (lineasNuevas.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Ningún producto de esa oferta se puede renovar: o ya no están en el local, " +
            "o su precio normal bajó por debajo del precio de oferta.",
        },
        { status: 409 }
      );
    }

    const nueva = await prisma.$transaction(async (tx) => {
      const creada = await tx.oferta.create({
        data: {
          grupoId,
          localId,
          nombre: body?.nombre ? String(body.nombre).trim() : `${origen.nombre} (renovada)`,
          condicionPago: origen.condicionPago,
          inicioEn: ventana.inicioEn,
          finEn: ventana.finEn,
          observaciones: origen.observaciones,
          creadoPorId: session.id,
          renovadaDesdeId: origen.id,
          lineas: { create: lineasNuevas },
        },
      });

      await registrarEventoOferta(tx, {
        ofertaId: creada.id,
        tipo: "RENOVADA",
        usuarioId: session.id,
        valorAnterior: { ofertaId: origen.id, nombre: origen.nombre },
        valorNuevo: { productos: lineasNuevas.length, salteados: salteados.length },
      });
      // También se anota del lado de la vieja: mirando la original se tiene que
      // poder ver que tuvo continuidad, sin salir a buscarla.
      await registrarEventoOferta(tx, {
        ofertaId: origen.id,
        tipo: "RENOVADA",
        usuarioId: session.id,
        valorNuevo: { ofertaId: creada.id, nombre: creada.nombre },
      });

      return creada;
    });

    return NextResponse.json({
      ok: true,
      ofertaId: nueva.id,
      nombre: nueva.nombre,
      productos: lineasNuevas.length,
      // Se devuelven para que la pantalla los muestre: un salteo silencioso es
      // una oferta con menos productos de los que la persona cree.
      salteados,
    });
  } catch (err) {
    console.error("Error renovando oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo renovar la oferta: ${err.message}` },
      { status: 500 }
    );
  }
}

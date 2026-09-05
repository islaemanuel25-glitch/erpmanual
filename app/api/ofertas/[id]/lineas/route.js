import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { estadoOferta, ESTADO_OFERTA } from "@/lib/ofertas/estados";
import { resolverCargaDeLinea } from "@/lib/ofertas/precio";
import {
  referenciasDeProducto,
  registrarEventoOferta,
  buscarConflictos,
  textoConflicto,
} from "@/lib/ofertas/servidor";

// LOS PRODUCTOS DE LA OFERTA. Se manda el conjunto completo y acá se concilia:
// se agrega lo que falta, se actualiza lo que cambió de precio y se saca lo que
// ya no está. Mandar el conjunto y no operaciones sueltas evita que dos pestañas
// abiertas se pisen a mitad de camino.
//
// ── EDITAR EL PRECIO DE UNA OFERTA ACTIVA ESTÁ PERMITIDO ────────────────────
//
// Es el caso del pedido: la oferta estaba en $900 y pasa a $950. Desde ese
// momento las ventas nuevas usan $950, y las anteriores NO cambian — eso sale
// solo, porque cada venta guardó su propio snapshot en VentaDetalle y nadie lo
// vuelve a leer de acá. No hace falta crear otra oferta.
//
// Lo que sí queda es el rastro: cada cambio de precio escribe un evento con el
// valor viejo, el nuevo, quién y cuándo.

export async function PUT(req, { params }) {
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
      include: { lineas: true },
    });
    if (!oferta) {
      return NextResponse.json({ ok: false, error: "Esa oferta no existe en este local." }, { status: 404 });
    }
    if (estadoOferta(oferta) === ESTADO_OFERTA.FINALIZADA) {
      return NextResponse.json(
        { ok: false, error: "Una oferta finalizada no se edita. Duplicala con Renovar." },
        { status: 409 }
      );
    }

    const body = await req.json();
    const pedidas = Array.isArray(body?.lineas) ? body.lineas : [];
    const idsPedidos = pedidas.map((l) => Number(l?.productoLocalId)).filter(Number.isInteger);

    if (new Set(idsPedidos).size !== idsPedidos.length) {
      return NextResponse.json(
        { ok: false, error: "Hay un producto repetido en la lista: no puede tener dos precios de oferta." },
        { status: 400 }
      );
    }

    const referencias = await referenciasDeProducto(prisma, { localId, productoLocalIds: idsPedidos });

    // Se valida TODO antes de escribir nada: media oferta cargada es peor que
    // ninguna, porque parece completa.
    const resueltas = [];
    for (const l of pedidas) {
      const pid = Number(l?.productoLocalId);
      const ref = referencias[pid];
      if (!ref) {
        return NextResponse.json({ ok: false, error: `El producto ${pid} no existe en este local.` }, { status: 400 });
      }
      if (ref.esServicio) {
        return NextResponse.json(
          { ok: false, error: `"${ref.nombre}" es un servicio de importe variable y no admite oferta.` },
          { status: 400 }
        );
      }
      const carga = resolverCargaDeLinea({
        precioNormal: ref.precioNormal,
        precioOferta: l?.precioOferta,
        descuentoPct: l?.descuentoPct,
      });
      if (!carga.valido) {
        return NextResponse.json({ ok: false, error: `"${ref.nombre}": ${carga.error}` }, { status: 400 });
      }
      resueltas.push({ pid, ref, precioOferta: carga.precioOferta });
    }

    const existentesPorProducto = new Map(oferta.lineas.map((l) => [l.productoLocalId, l]));

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(localId)})`;

      // Agregar productos puede hacerla chocar con otra oferta vigente. Se
      // revalida con el conjunto NUEVO, y solo si esta oferta rige: un borrador
      // no compite con nadie.
      if (oferta.publicadaEn != null && resueltas.length > 0) {
        const choques = await buscarConflictos(tx, {
          localId,
          inicioEn: oferta.inicioEn,
          finEn: oferta.finEn,
          productoLocalIds: resueltas.map((r) => r.pid),
          excluirOfertaId: ofertaId,
        });
        if (choques.length > 0) {
          const e = new Error(textoConflicto(choques, referencias));
          e.esConflictoDeOferta = true;
          throw e;
        }
      }

      let agregadas = 0;
      let actualizadas = 0;

      for (const r of resueltas) {
        const previa = existentesPorProducto.get(r.pid);
        if (!previa) {
          const creada = await tx.ofertaLinea.create({
            data: {
              ofertaId,
              productoLocalId: r.pid,
              productoBaseId: r.ref.productoBaseId,
              precioOferta: r.precioOferta,
              precioNormalReferencia: r.ref.precioNormal,
              costoReferencia: r.ref.costo,
            },
          });
          agregadas += 1;
          await registrarEventoOferta(tx, {
            ofertaId,
            ofertaLineaId: creada.id,
            tipo: "LINEA_AGREGADA",
            usuarioId: session.id,
            valorNuevo: { producto: r.ref.nombre, precioOferta: r.precioOferta, costoReferencia: r.ref.costo },
          });
          continue;
        }

        const precioViejo = Number(previa.precioOferta);
        if (Math.round(precioViejo * 100) === Math.round(r.precioOferta * 100)) continue;

        await tx.ofertaLinea.update({
          where: { id: previa.id },
          data: { precioOferta: r.precioOferta },
        });
        actualizadas += 1;
        await registrarEventoOferta(tx, {
          ofertaId,
          ofertaLineaId: previa.id,
          tipo: "PRECIO_CAMBIADO",
          usuarioId: session.id,
          valorAnterior: { precioOferta: precioViejo },
          valorNuevo: { precioOferta: r.precioOferta },
          nota: r.ref.nombre,
        });
      }

      // Lo que ya no está en la lista se saca. Sacar un producto de una oferta
      // NO toca las ventas que ya lo cobraron con ella: esas tienen su snapshot.
      const idsFinales = new Set(resueltas.map((r) => r.pid));
      const aBorrar = oferta.lineas.filter((l) => !idsFinales.has(l.productoLocalId));
      for (const l of aBorrar) {
        await tx.ofertaLinea.delete({ where: { id: l.id } });
        await registrarEventoOferta(tx, {
          ofertaId,
          tipo: "LINEA_QUITADA",
          usuarioId: session.id,
          valorAnterior: { productoLocalId: l.productoLocalId, precioOferta: Number(l.precioOferta) },
        });
      }

      return { agregadas, actualizadas, quitadas: aBorrar.length, total: resueltas.length };
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    if (err.esConflictoDeOferta) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    console.error("Error guardando productos de la oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron guardar los productos de la oferta: ${err.message}` },
      { status: 500 }
    );
  }
}

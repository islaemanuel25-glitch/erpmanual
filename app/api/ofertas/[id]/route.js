import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { ofertaParaDetalle } from "@/lib/ofertas/dto";
import { estadoOferta, ESTADO_OFERTA } from "@/lib/ofertas/estados";
import { validarVentana, CONDICION_PAGO_OFERTA } from "@/lib/ofertas/vigencia";
import {
  referenciasDeProducto,
  registrarEventoOferta,
  buscarConflictos,
  textoConflicto,
} from "@/lib/ofertas/servidor";

// VER, EDITAR Y ELIMINAR UNA OFERTA.
//
// El scope es el LOCAL ACTIVO en las tres. Una oferta de otro local no se lee ni
// se toca aunque se sepa el id: el `localId` va en el WHERE y no en un chequeo
// posterior, para que no se pueda olvidar en una rama.

async function cargarOferta(id, localId) {
  return prisma.oferta.findFirst({
    where: { id, localId },
    include: {
      local: { select: { nombre: true } },
      _count: { select: { lineas: true } },
      lineas: {
        orderBy: { id: "asc" },
        include: {
          productoLocal: { select: { nombre: true, base: { select: { nombre: true } } } },
        },
      },
    },
  });
}

export async function GET(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "ofertas.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const ofertaId = Number(id);
    if (!Number.isInteger(ofertaId)) {
      return NextResponse.json({ ok: false, error: "Id de oferta inválido." }, { status: 400 });
    }

    const oferta = await cargarOferta(ofertaId, localId);
    if (!oferta) {
      return NextResponse.json(
        { ok: false, error: "Esa oferta no existe en este local." },
        { status: 404 }
      );
    }

    // El precio y el costo de HOY salen del producto, no de la oferta: son
    // justamente los que pueden haberse movido desde que se cargó.
    const actuales = await referenciasDeProducto(prisma, {
      localId,
      productoLocalIds: oferta.lineas.map((l) => l.productoLocalId),
    });

    return NextResponse.json({
      ok: true,
      oferta: ofertaParaDetalle(oferta, { actualesPorProductoLocal: actuales }),
    });
  } catch (err) {
    console.error("Error leyendo oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo leer la oferta: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "ofertas.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const ofertaId = Number(id);
    const oferta = await cargarOferta(ofertaId, localId);
    if (!oferta) {
      return NextResponse.json({ ok: false, error: "Esa oferta no existe en este local." }, { status: 404 });
    }

    const estado = estadoOferta(oferta);
    if (estado === ESTADO_OFERTA.FINALIZADA) {
      return NextResponse.json(
        {
          ok: false,
          error: "Una oferta finalizada no se edita. Si querés volver a usarla, duplicala con Renovar.",
        },
        { status: 409 }
      );
    }

    const body = await req.json();
    const data = {};
    const anterior = {};
    const nuevo = {};

    if (body?.nombre != null) {
      const nombre = String(body.nombre).trim();
      if (!nombre) return NextResponse.json({ ok: false, error: "La oferta necesita un nombre." }, { status: 400 });
      if (nombre !== oferta.nombre) {
        anterior.nombre = oferta.nombre;
        nuevo.nombre = nombre;
        data.nombre = nombre;
      }
    }

    if (body?.observaciones !== undefined) {
      data.observaciones = body.observaciones ? String(body.observaciones) : null;
    }

    if (body?.condicionPago != null && body.condicionPago !== oferta.condicionPago) {
      if (!Object.values(CONDICION_PAGO_OFERTA).includes(body.condicionPago)) {
        return NextResponse.json({ ok: false, error: "Condición de pago desconocida." }, { status: 400 });
      }
      anterior.condicionPago = oferta.condicionPago;
      nuevo.condicionPago = body.condicionPago;
      data.condicionPago = body.condicionPago;
    }

    // ── Ventana ──────────────────────────────────────────────────────────────
    // Extender la fecha final es EXACTAMENTE lo que pide "renovar sin recrear
    // todo", así que se admite incluso sobre una oferta vencida: mover `finEn`
    // hacia adelante la vuelve a poner en marcha con su historia intacta.
    let ventana = null;
    if (body?.inicioEn != null || body?.finEn != null) {
      ventana = validarVentana({
        inicioEn: body?.inicioEn ?? oferta.inicioEn,
        finEn: body?.finEn ?? oferta.finEn,
      });
      if (!ventana.valido) return NextResponse.json({ ok: false, error: ventana.error }, { status: 400 });
      anterior.inicioEn = oferta.inicioEn;
      anterior.finEn = oferta.finEn;
      nuevo.inicioEn = ventana.inicioEn;
      nuevo.finEn = ventana.finEn;
      data.inicioEn = ventana.inicioEn;
      data.finEn = ventana.finEn;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, sinCambios: true });
    }

    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(localId)})`;

      // Mover la ventana puede hacerla chocar con otra oferta que antes no
      // pisaba. Se revalida con las fechas NUEVAS, no con las viejas.
      if (ventana && oferta.lineas.length > 0) {
        const choques = await buscarConflictos(tx, {
          localId,
          inicioEn: ventana.inicioEn,
          finEn: ventana.finEn,
          productoLocalIds: oferta.lineas.map((l) => l.productoLocalId),
          excluirOfertaId: ofertaId,
        });
        if (choques.length > 0) {
          const e = new Error(textoConflicto(choques));
          e.esConflictoDeOferta = true;
          throw e;
        }
      }

      const res = await tx.oferta.update({ where: { id: ofertaId }, data });

      await registrarEventoOferta(tx, {
        ofertaId,
        tipo: ventana ? "VENTANA_CAMBIADA" : nuevo.condicionPago ? "CONDICION_CAMBIADA" : "EDITADA",
        usuarioId: session.id,
        valorAnterior: anterior,
        valorNuevo: nuevo,
      });

      return res;
    });

    return NextResponse.json({ ok: true, ofertaId: actualizada.id });
  } catch (err) {
    if (err.esConflictoDeOferta) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    console.error("Error editando oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo editar la oferta: ${err.message}` },
      { status: 500 }
    );
  }
}

// ── ELIMINAR ────────────────────────────────────────────────────────────────
//
// Solo si NUNCA se usó en una venta. Y "nunca se usó" se pregunta contando
// líneas de venta que la apuntan, no deduciéndolo de las fechas ni del estado:
// una oferta puede estar vencida y haber vendido muchísimo.
//
// Si se usó, se ofrece finalizar. Técnicamente se podría borrar igual —la venta
// tiene su snapshot y `ofertaId` va con SET NULL, así que el histórico
// sobreviviría— pero se pierde poder abrir la oferta y ver qué se había
// configurado. Se prefiere no dejar basura visual antes que perder trazabilidad,
// y para lo visual ya está el archivo.
export async function DELETE(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "ofertas.eliminar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const ofertaId = Number(id);

    const oferta = await prisma.oferta.findFirst({
      where: { id: ofertaId, localId },
      select: { id: true, nombre: true },
    });
    if (!oferta) {
      return NextResponse.json({ ok: false, error: "Esa oferta no existe en este local." }, { status: 404 });
    }

    const usos = await prisma.ventaDetalle.count({ where: { ofertaId } });
    if (usos > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `"${oferta.nombre}" ya se aplicó en ${usos} línea${usos === 1 ? "" : "s"} de venta, así que no se borra. ` +
            `Finalizala: desaparece del trabajo diario y queda en el archivo.`,
          usos,
        },
        { status: 409 }
      );
    }

    // Las líneas y los eventos se van con ella por CASCADE. Es configuración,
    // no historial: el historial vive en VentaDetalle y acá se comprobó que no
    // hay ninguno.
    await prisma.oferta.delete({ where: { id: ofertaId } });

    console.log(
      "[ofertas] eliminada oferta=%s nombre=%s local=%s por usuario=%s",
      ofertaId, oferta.nombre, localId, session.id
    );

    return NextResponse.json({ ok: true, eliminada: true });
  } catch (err) {
    console.error("Error eliminando oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo eliminar la oferta: ${err.message}` },
      { status: 500 }
    );
  }
}

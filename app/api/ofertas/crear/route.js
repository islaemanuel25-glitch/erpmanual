import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { validarVentana, CONDICION_PAGO_OFERTA } from "@/lib/ofertas/vigencia";
import { resolverCargaDeLinea } from "@/lib/ofertas/precio";
import {
  referenciasDeProducto,
  registrarEventoOferta,
  buscarConflictos,
  textoConflicto,
} from "@/lib/ofertas/servidor";

// CREAR UNA OFERTA.
//
// Nace SIEMPRE como borrador: `publicadaEn` en null. Publicar es un acto
// separado y con su propia ruta, porque es el momento en que la oferta empieza a
// cambiar lo que se le cobra a la gente y eso merece un clic propio.
//
// Los productos son opcionales al crear: se puede armar el encabezado y cargar
// los productos después. Una oferta sin productos no rige aunque se publique
// —no tiene ninguna línea que aplicar—, así que no hace falta prohibirlo.

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "ofertas.crear");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const nombre = String(body?.nombre || "").trim();
    if (!nombre) {
      return NextResponse.json({ ok: false, error: "La oferta necesita un nombre." }, { status: 400 });
    }

    const ventana = validarVentana({ inicioEn: body?.inicioEn, finEn: body?.finEn });
    if (!ventana.valido) {
      return NextResponse.json({ ok: false, error: ventana.error }, { status: 400 });
    }

    const condicionPago = Object.values(CONDICION_PAGO_OFERTA).includes(body?.condicionPago)
      ? body.condicionPago
      : CONDICION_PAGO_OFERTA.CUALQUIER_MEDIO;

    // ── Productos ────────────────────────────────────────────────────────────
    // Cada línea congela el precio normal y el costo DE HOY. Esos dos números
    // salen de la base, nunca del cuerpo del request: si el navegador pudiera
    // fijar el costo de referencia, el aviso de cambio de costo no querría decir
    // nada porque se estaría comparando contra un valor inventado.
    const lineasBody = Array.isArray(body?.lineas) ? body.lineas : [];
    const productoLocalIds = lineasBody.map((l) => Number(l?.productoLocalId)).filter(Number.isInteger);

    const referencias = await referenciasDeProducto(prisma, { localId, productoLocalIds });

    const lineasAGuardar = [];
    for (const l of lineasBody) {
      const pid = Number(l?.productoLocalId);
      const ref = referencias[pid];
      if (!ref) {
        return NextResponse.json(
          { ok: false, error: `El producto ${pid} no existe en este local.` },
          { status: 400 }
        );
      }
      if (ref.esServicio) {
        return NextResponse.json(
          {
            ok: false,
            error: `"${ref.nombre}" es un servicio de importe variable: su importe lo ingresa el cajero y no admite oferta.`,
          },
          { status: 400 }
        );
      }

      const carga = resolverCargaDeLinea({
        precioNormal: ref.precioNormal,
        precioOferta: l?.precioOferta,
        descuentoPct: l?.descuentoPct,
      });
      if (!carga.valido) {
        return NextResponse.json(
          { ok: false, error: `"${ref.nombre}": ${carga.error}` },
          { status: 400 }
        );
      }

      lineasAGuardar.push({
        productoLocalId: pid,
        productoBaseId: ref.productoBaseId,
        precioOferta: carga.precioOferta,
        precioNormalReferencia: ref.precioNormal,
        costoReferencia: ref.costo,
      });
    }

    // ── Solapamiento ─────────────────────────────────────────────────────────
    // Se pregunta ANTES de escribir y DENTRO de la transacción, con un lock por
    // local: sin el lock, dos personas cargando ofertas del mismo producto al
    // mismo tiempo pasarían las dos la validación y quedarían dos precios
    // posibles para el mismo producto. Es el mismo candado que usa el número de
    // venta, por el mismo motivo.
    const creada = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(localId)})`;

      if (lineasAGuardar.length > 0) {
        const choques = await buscarConflictos(tx, {
          localId,
          inicioEn: ventana.inicioEn,
          finEn: ventana.finEn,
          productoLocalIds: lineasAGuardar.map((l) => l.productoLocalId),
        });
        if (choques.length > 0) {
          const e = new Error(textoConflicto(choques, referencias));
          e.esConflictoDeOferta = true;
          throw e;
        }
      }

      const oferta = await tx.oferta.create({
        data: {
          grupoId,
          localId,
          nombre,
          condicionPago,
          inicioEn: ventana.inicioEn,
          finEn: ventana.finEn,
          observaciones: body?.observaciones ? String(body.observaciones) : null,
          creadoPorId: session.id,
          lineas: lineasAGuardar.length > 0 ? { create: lineasAGuardar } : undefined,
        },
        include: { _count: { select: { lineas: true } } },
      });

      await registrarEventoOferta(tx, {
        ofertaId: oferta.id,
        tipo: "CREADA",
        usuarioId: session.id,
        valorNuevo: {
          nombre,
          condicionPago,
          inicioEn: ventana.inicioEn,
          finEn: ventana.finEn,
          productos: lineasAGuardar.length,
        },
      });

      return oferta;
    });

    return NextResponse.json({ ok: true, ofertaId: creada.id, nombre: creada.nombre });
  } catch (err) {
    if (err.esConflictoDeOferta) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    console.error("Error creando oferta:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo crear la oferta: ${err.message}` },
      { status: 500 }
    );
  }
}

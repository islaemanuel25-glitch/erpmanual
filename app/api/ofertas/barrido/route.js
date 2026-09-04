import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { crearNotificacion } from "@/lib/notificaciones/crearNotificacion";
import { planDeRevision, resumenCambioDeCosto } from "@/lib/ofertas/revision";
import { referenciasDeProducto } from "@/lib/ofertas/servidor";
import {
  avisosDelBarrido,
  TIPO_NOTIFICACION,
  HORAS_AVISO_VENCIMIENTO,
} from "@/lib/ofertas/notificaciones";

// BARRIDO: comparar los costos de referencia contra los de hoy, marcar lo que
// cambió y avisar.
//
// ── POR QUÉ NO ES UNA TAREA PROGRAMADA ─────────────────────────────────────
//
// Porque no hay dónde correrla: el proyecto no tiene un planificador, y un
// script suelto en el VPS es justamente lo que las reglas del repo prohíben.
// Corre cuando alguien abre la pantalla de ofertas, que es cuando el resultado
// le sirve a alguien.
//
// Eso tiene una consecuencia que conviene saber: **si nadie abre la pantalla, no
// se marca nada y no se avisa nada.** El aviso de vencimiento puede llegar tarde
// si el local pasó tres días sin entrar. Es un límite conocido de la v1, no un
// descuido; queda anotado en la documentación del módulo.
//
// ── ESCRIBE, PERO NO DECIDE NADA DE NEGOCIO ────────────────────────────────
//
// Marca y desmarca líneas, y crea notificaciones. No toca un solo precio. Por
// eso pide `ofertas.ver` y no `ofertas.editar`: quien puede mirar las ofertas
// puede disparar la comparación, porque lo único que produce es información.

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "ofertas.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const ahora = new Date();

    // Solo las que rigen o van a regir. Una finalizada no tiene nada que
    // revisar, y una vencida tampoco: su precio ya no se aplica.
    const ofertas = await prisma.oferta.findMany({
      where: {
        localId,
        finalizadaEn: null,
        publicadaEn: { not: null },
        finEn: { gt: ahora },
      },
      include: { lineas: true },
    });

    if (ofertas.length === 0) {
      return NextResponse.json({ ok: true, ofertas: 0, marcadas: 0, desmarcadas: 0, avisos: 0 });
    }

    const todasLasLineas = ofertas.flatMap((o) => o.lineas);
    const actuales = await referenciasDeProducto(prisma, {
      localId,
      productoLocalIds: todasLasLineas.map((l) => l.productoLocalId),
    });

    // El costo de hoy, por línea. Una línea cuyo producto ya no está en el local
    // se queda afuera del mapa y `planDeRevision` no la toca en ninguna
    // dirección: sin costo actual no hay comparación que hacer.
    const costoPorLinea = {};
    for (const l of todasLasLineas) {
      const ref = actuales[l.productoLocalId];
      if (ref) costoPorLinea[l.id] = ref.costo;
    }

    const plan = planDeRevision(todasLasLineas, costoPorLinea);

    if (plan.marcar.length > 0) {
      // `costoAlDetectar` se escribe una por una y no con un updateMany porque
      // cada línea tiene su propio costo. El volumen es chico: las líneas de las
      // ofertas vivas de un local.
      await prisma.$transaction(
        plan.marcar.map((lineaId) =>
          prisma.ofertaLinea.update({
            where: { id: lineaId },
            data: { revisionPendienteDesde: ahora, costoAlDetectar: costoPorLinea[lineaId] },
          })
        )
      );
    }

    if (plan.desmarcar.length > 0) {
      // El costo volvió al de referencia —típicamente una carga equivocada que
      // se corrigió—. La marca se levanta sola: sin esto, un error de tipeo
      // dejaría la oferta en REVISAR para siempre.
      await prisma.ofertaLinea.updateMany({
        where: { id: { in: plan.desmarcar } },
        data: { revisionPendienteDesde: null, costoAlDetectar: null },
      });
    }

    // ── Avisos ───────────────────────────────────────────────────────────────
    const previas = await prisma.notificacion.findMany({
      where: {
        grupoId,
        tipo: TIPO_NOTIFICACION.POR_VENCER,
        entidadTipo: "Oferta",
        entidadId: { in: ofertas.map((o) => o.id) },
        createdAt: { gte: new Date(ahora.getTime() - HORAS_AVISO_VENCIMIENTO * 60 * 60 * 1000 * 2) },
      },
      select: { entidadId: true, createdAt: true },
    });

    const detalleLineas = {};
    for (const lineaId of plan.marcar) {
      const linea = todasLasLineas.find((l) => l.id === lineaId);
      const ref = actuales[linea.productoLocalId];
      detalleLineas[lineaId] = {
        nombre: ref?.nombre || `#${linea.productoLocalId}`,
        resumen: resumenCambioDeCosto({
          costoReferencia: linea.costoReferencia,
          costoActual: costoPorLinea[lineaId],
          precioOferta: linea.precioOferta,
          precioNormalReferencia: linea.precioNormalReferencia,
        }),
      };
    }

    const avisos = avisosDelBarrido({
      ofertas,
      lineasRecienMarcadas: plan.marcar,
      notificacionesPrevias: previas,
      detalleLineas,
      ahora,
    });

    for (const aviso of avisos) {
      await crearNotificacion({
        grupoId,
        tipo: aviso.tipo,
        titulo: aviso.titulo,
        cuerpo: aviso.cuerpo,
        href: `/modulos/ofertas/${aviso.ofertaId}`,
        entidadTipo: "Oferta",
        entidadId: aviso.ofertaId,
        // La oferta es de UN local: el aviso también. Un encargado de otra boca
        // no tiene por qué ver que a ésta le cambió un costo.
        alcance: "LOCAL",
        localId,
        // Y dentro del local, solo quien puede ver ofertas. Sin esto, el cajero
        // recibiría avisos sobre márgenes y costos.
        permisoRequerido: "ofertas.ver",
      });
    }

    return NextResponse.json({
      ok: true,
      ofertas: ofertas.length,
      marcadas: plan.marcar.length,
      desmarcadas: plan.desmarcar.length,
      avisos: avisos.length,
    });
  } catch (err) {
    console.error("Error en el barrido de ofertas:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo revisar el estado de las ofertas: ${err.message}` },
      { status: 500 }
    );
  }
}

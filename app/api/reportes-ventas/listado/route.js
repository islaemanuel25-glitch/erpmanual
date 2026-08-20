import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";
import { resolveVistaOperativa, getGrupoIdDeLocal } from "@/lib/grupos";
import { getContextoActivo } from "@/lib/contexto";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "reportes.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = req.nextUrl;
    const fechaDesde = searchParams.get("fechaDesde");
    const fechaHasta = searchParams.get("fechaHasta");
    const localIdParam = searchParams.get("localId");
    const formaPagoParam = searchParams.get("formaPago");
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");

    if (!fechaDesde || !fechaHasta) {
      return NextResponse.json(
        { ok: false, error: "Fechas requeridas" },
        { status: 400 }
      );
    }

    const page = Math.max(1, Number(pageParam) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(limitParam) || DEFAULT_LIMIT)
    );
    const skip = (page - 1) * limit;

    const { fechaInicio, fechaFin } = getRangoArgentina(fechaDesde, fechaHasta);

    const where = {
      fecha: {
        gte: fechaInicio,
        lte: fechaFin,
      },
    };

    // Scope estricto por UBICACIÓN. Nunca queda sin filtro (antes: admin sin
    // localId veía TODOS los grupos).
    //  - No-admin: SIEMPRE su local; localId ajeno por query → 403.
    //  - Admin con qLocal: debe ser un local de SU grupo activo → filtra por él.
    //  - Admin sin qLocal: usa el contexto (vista global explícita = todo el grupo;
    //    contexto de un local = ese local; sin contexto → 409, no ve todo).
    const qLocal = Number(localIdParam) || 0;
    if (!session.esAdmin) {
      const propio = Number(session.localId) || 0;
      if (!propio) {
        return NextResponse.json({ ok: false, error: "Sin alcance autorizado." }, { status: 403 });
      }
      if (qLocal && qLocal !== propio) {
        return NextResponse.json({ ok: false, error: "Local fuera de tu alcance." }, { status: 403 });
      }
      where.localId = propio;
    } else if (qLocal) {
      // Grupo EFECTIVO del admin: su grupo activo (cookie erpazul_grupo_activo) o,
      // si no está seteado, el grupo del LOCAL DEL CONTEXTO ACTIVO (misma fuente de
      // verdad que resolveVistaOperativa, ver lib/grupos.js). Se deriva del CONTEXTO
      // del admin, NO del local solicitado, para que no pueda consultar otro grupo
      // pasando otro localId. El local pedido debe pertenecer a ese grupo efectivo.
      const gLocal = await getGrupoIdDeLocal(qLocal);
      let grupoEfectivo = Number(session.grupoId) || 0;
      if (!grupoEfectivo) {
        const ctx = getContextoActivo(req, session);
        if (ctx?.localId) grupoEfectivo = (await getGrupoIdDeLocal(ctx.localId)) || 0;
      }
      if (!grupoEfectivo || !gLocal || gLocal !== grupoEfectivo) {
        return NextResponse.json({ ok: false, error: "Local fuera de tu grupo activo." }, { status: 403 });
      }
      where.localId = qLocal;
    } else {
      const vista = await resolveVistaOperativa(req);
      if (vista.error) {
        return NextResponse.json(
          { ok: false, error: vista.error, needsContexto: vista.needsContexto },
          { status: vista.status }
        );
      }
      where.localId = vista.modo === "GLOBAL" ? { in: vista.localIds } : vista.localId;
    }

    if (formaPagoParam) {
      where.formaPago = formaPagoParam;
    }

    // ── QUÉ SE MUESTRA ACÁ, Y POR QUÉ NO ES LO MISMO QUE QUÉ SUMA ───────────
    //
    // Las ANULADAS se muestran siempre, marcadas: si desaparecieran, quien anuló
    // una por error no tendría dónde encontrarla.
    //
    // Las INTERNAS —las que generaron un remito— se muestran solo si se piden
    // con `?incluirInternas=1`. Mismo mecanismo que el historial del cliente, y
    // por el mismo motivo: verlas es una decisión explícita, nunca la mezcla por
    // defecto, porque un movimiento entre dos cajas del mismo grupo no es una
    // venta y mezclarlo infla lo que se lee como facturación.
    //
    // ── DE DÓNDE SALIÓ ESTA SEGUNDA MITAD ───────────────────────────────────
    //
    // El 2026-08-20 se desplegó el botón de anular en el detalle de la venta, y
    // Emanuel no pudo llegar a la venta que quería anular: la 7726 tiene remito,
    // así que el listado la escondía. Medido ese día sobre el 19/08 en el
    // depósito: el listado mostraba 5 de 12 ventas. El botón estaba en una
    // pantalla a la que no se llegaba.
    //
    // Las dos condiciones son independientes a propósito: pedir internas NO
    // muestra las anuladas de arrastre, y viceversa. Cada una se decide sola.
    const incluirInternas = searchParams.get("incluirInternas") === "1";
    const whereListado = whereVentaComercial(where, {
      incluirAnuladas: true,
      incluirInternas,
    });

    const [total, ventas] = await Promise.all([
      prisma.venta.count({ where: whereListado }),
      prisma.venta.findMany({
        where: whereListado,
        orderBy: { fecha: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          numero: true,
          fecha: true,
          total: true,
          formaPago: true,
          esFiado: true,
          // Corrección de ventas: flags para el badge "Corregida · vN" en la card.
          corregida: true,
          version: true,
          // Para la marca de anulada en la card.
          anuladaEn: true,
          // Para la marca de "interna" cuando se piden. Sin esto, con el
          // interruptor prendido las internas se verían como ventas comunes.
          transferencia: { select: { id: true } },
          cliente: { select: { id: true, nombre: true } },
          vendedor: { select: { id: true, nombre: true } },
          local: { select: { id: true, nombre: true } },
          _count: { select: { detalles: true } },
        },
      }),
    ]);

    const items = ventas.map((v) => ({
      id: v.id,
      numero: v.numero,
      fecha: v.fecha,
      total: Number(v.total).toFixed(2),
      formaPago: v.formaPago,
      estado: v.esFiado ? "fiado" : "cobrado",
      cliente: v.cliente
        ? { id: v.cliente.id, nombre: v.cliente.nombre }
        : null,
      vendedor: v.vendedor
        ? { id: v.vendedor.id, nombre: v.vendedor.nombre }
        : null,
      local: v.local ? { id: v.local.id, nombre: v.local.nombre } : null,
      items: v._count?.detalles ?? 0,
      // Corrección: la card muestra "Corregida · vN" cuando corregida=true.
      corregida: !!v.corregida,
      version: v.version ?? 0,
      // La card la muestra tachada con su cinta. No suma en ningún total.
      anulada: v.anuladaEn != null,
      // Interna = generó un remito. La card la marca para que no se lea como
      // una venta más cuando el interruptor está prendido.
      interna: v.transferencia != null,
      remitoId: v.transferencia?.id ?? null,
    }));

    return NextResponse.json({
      ok: true,
      ventas: items,
      paginacion: {
        page,
        limit,
        total,
        totalPaginas: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Error listando ventas:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { ofertaParaLista } from "@/lib/ofertas/dto";
import { ESTADO_OFERTA, ESTADOS_OPERATIVOS } from "@/lib/ofertas/estados";

// LISTADO DE OFERTAS DEL LOCAL ACTIVO.
//
// ── LA VISTA PRINCIPAL NO SE LLENA DE HISTÓRICO ─────────────────────────────
//
// El corte entre "trabajo de hoy" y "archivo" se hace EN LA CONSULTA, con
// `finalizadaEn`, que es una columna de verdad. Los seis estados funcionales son
// derivados y no se pueden pedir en un WHERE; pero el corte que importa —¿está
// archivada o no?— sí, y es el que evita traer trescientas ofertas viejas para
// después descartarlas en memoria.
//
// El filtro fino por estado (solo activas, solo programadas, solo las que piden
// revisión) se aplica después sobre lo ya traído, que son pocas filas: las
// ofertas vivas de UN local.
//
// ── POR QUÉ LAS LÍNEAS VIENEN FILTRADAS ─────────────────────────────────────
//
// `lineas` trae SOLO las marcadas para revisar, y el total sale de `_count`. Así
// la tarjeta puede decir "8 productos, 2 cambiaron de costo" sin traer las ocho
// filas de cada oferta.

export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId, session } = scope;

    const perm = checkPerm(session, "ofertas.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = new URL(req.url);
    const archivadas = searchParams.get("archivadas") === "1";
    const q = (searchParams.get("q") || "").trim();
    const estadoPedido = (searchParams.get("estado") || "").trim().toUpperCase();

    const ofertas = await prisma.oferta.findMany({
      where: {
        localId,
        finalizadaEn: archivadas ? { not: null } : null,
        ...(q ? { nombre: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: archivadas ? { finalizadaEn: "desc" } : { inicioEn: "desc" },
      // El archivo se pagina de a poco: es la parte que crece para siempre.
      take: archivadas ? 100 : undefined,
      include: {
        local: { select: { nombre: true } },
        _count: { select: { lineas: true } },
        lineas: {
          where: { revisionPendienteDesde: { not: null } },
          select: { id: true, revisionPendienteDesde: true },
        },
      },
    });

    const ahora = new Date();
    let items = ofertas.map((o) => ofertaParaLista(o, ahora));

    if (estadoPedido && Object.values(ESTADO_OFERTA).includes(estadoPedido)) {
      items = items.filter((o) => o.estado === estadoPedido);
    }

    // El resumen compacto de arriba de la pantalla. Se cuenta acá y no en el
    // navegador para que el número y la lista no se puedan contradecir.
    const resumen = {};
    for (const e of ESTADOS_OPERATIVOS) resumen[e] = 0;
    resumen[ESTADO_OFERTA.FINALIZADA] = 0;
    for (const o of items) resumen[o.estado] = (resumen[o.estado] || 0) + 1;

    return NextResponse.json({
      ok: true,
      items,
      resumen,
      totalProductosPorRevisar: items.reduce((a, o) => a + o.lineasPorRevisar, 0),
    });
  } catch (err) {
    console.error("Error listando ofertas:", err);
    // El mensaje dice QUÉ pasó. "Error interno" a secas fue lo único que se vio
    // el día que producción se cayó, y no le sirvió a nadie.
    return NextResponse.json(
      { ok: false, error: `No se pudo leer el listado de ofertas: ${err.message}` },
      { status: 500 }
    );
  }
}

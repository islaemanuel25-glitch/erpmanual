// POST /api/compras-proveedor/comprobantes/marcar-revisada
//
// Marca —o desmarca— un renglón de la factura como controlado por una persona.
//
// ── POR QUÉ ESTO SÍ TIENE RUTA PROPIA Y LA CANTIDAD NO ────────────────────
//
// La cantidad recibida, las sueltas y el motivo NO tienen una ruta por línea, y
// está escrito por qué: recibir es una sola transacción que mueve stock, y
// guardar cada línea aparte dejaría media recepción escrita si algo fallara en
// el medio.
//
// La marca no mueve stock ni escribe ningún costo: es el avance del control. Su
// riesgo es el contrario —perderla— y por eso se guarda apenas ocurre. Un
// refresco devolvía la pantalla a 0 de 15 revisadas mientras las cantidades y
// las decisiones de precio sí sobrevivían.
//
// ── QUÉ SE MARCA ──────────────────────────────────────────────────────────
//
// El RENGLÓN DEL PAPEL, `ComprobanteLinea`, y no la línea del pedido. Dos
// renglones de una factura pueden apuntar a la misma línea del pedido —medido:
// la 120 y la 121 del comprobante 5 van las dos al detalle 2565— y marcar uno
// marcaba el otro.
//
// ── DESMARCAR BORRA, NO VENCE ─────────────────────────────────────────────
//
// Al desmarcar se limpian también el autor y la fecha. No es como la
// confirmación de un vínculo, que VENCE y conserva quién la había hecho: acá la
// pregunta es "¿alguien controló este renglón?", y si la respuesta vuelve a ser
// que no, un autor colgado diría que sí.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const lineaId = Number(body?.lineaId);
    if (!Number.isFinite(lineaId)) {
      return NextResponse.json({ ok: false, error: "Falta la línea." }, { status: 400 });
    }
    // Sin `revisada` es marcar, que es el gesto de todos los días. Desmarcar
    // llega explícito.
    const revisada = body?.revisada !== false;

    // El alcance va en el WHERE: una línea de otro grupo no existe.
    const linea = await prisma.comprobanteLinea.findFirst({
      where: { id: lineaId, comprobante: { grupoId } },
      select: { id: true, comprobante: { select: { id: true, confirmadoEn: true } } },
    });
    if (!linea) return NextResponse.json({ ok: false, error: "No existe esa línea." }, { status: 404 });

    // Un comprobante ya confirmado en una recepción no se sigue controlando: lo
    // que se revisó quedó como quedó. Es la misma guarda que tiene aceptar un
    // precio, por el mismo motivo.
    if (linea.comprobante.confirmadoEn) {
      return NextResponse.json(
        {
          ok: false,
          error: "El comprobante ya fue confirmado en una recepción, así que el control está cerrado.",
        },
        { status: 409 }
      );
    }

    const actualizada = await prisma.comprobanteLinea.update({
      where: { id: linea.id },
      data: {
        revisadoEnRecepcion: revisada,
        revisadoEnRecepcionPorId: revisada ? session?.id ?? null : null,
        revisadoEnRecepcionAt: revisada ? new Date() : null,
      },
      select: { id: true, revisadoEnRecepcion: true, revisadoEnRecepcionAt: true },
    });

    return NextResponse.json({
      ok: true,
      lineaId: actualizada.id,
      revisada: actualizada.revisadoEnRecepcion,
      revisadaEn: actualizada.revisadoEnRecepcionAt,
      queHacer: revisada
        ? "Renglón marcado como controlado. Queda guardado aunque cierres la pantalla."
        : "Renglón devuelto a pendiente.",
    });
  } catch (err) {
    console.error("Error comprobantes/marcar-revisada:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "marcar el renglón como revisado",
          quedo: "La marca puede no haberse guardado: volvé a tocarla y fijate si queda.",
        }),
      },
      { status: 500 }
    );
  }
}

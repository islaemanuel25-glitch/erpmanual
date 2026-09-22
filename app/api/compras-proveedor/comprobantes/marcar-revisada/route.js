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
import { resolverLineaDelPapel } from "@/lib/compras-proveedor/comprobante/resolverLineaDelPapel";
import { aliasAEscribir } from "@/lib/compras-proveedor/comprobante/vinculo";

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

    // El alcance va adentro de la resolución: una línea de otro grupo no
    // existe. Y el renglón se encuentra aunque el papel se haya vuelto a leer
    // —eso borra los renglones y los recrea con ids nuevos—, que es como esta
    // ruta llegaba a contestar "No existe esa línea." sobre un renglón que
    // estaba ahí.
    const { linea, motivo: motivoDeLaLinea } = await resolverLineaDelPapel(prisma, {
      grupoId,
      lineaId,
      pedidoId: body?.pedidoId,
      textoCrudo: body?.textoCrudo,
      select: {
        id: true,
        // Con qué escribir el código exacto al confirmar: lo que el papel
        // imprime, a qué producto quedó vinculado, y de qué proveedor es.
        codigoProveedor: true,
        textoCrudo: true,
        productoLocalId: true,
        comprobante: { select: { id: true, confirmadoEn: true, grupoId: true, proveedorId: true } },
      },
    });
    if (!linea) {
      return NextResponse.json(
        { ok: false, error: motivoDeLaLinea, queHacer: motivoDeLaLinea },
        { status: 409 }
      );
    }

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

    // ── CONFIRMAR UN RENGLÓN DEJA EL CÓDIGO EXACTO PARA LA PRÓXIMA VEZ ───
    //
    // Cuando alguien toca "✓ Coincide" o "Revisado y seguir" sobre un renglón
    // que se vinculó POR TERMINACIÓN, está diciendo que ese producto es el que
    // el papel nombra. Guardar el código TAL CUAL LO IMPRIME EL PAPEL hace que
    // la próxima factura entre por macheo exacto y no vuelva a depender de la
    // escalera.
    //
    // El caso: Arcor guarda 1001999 en su lista y la factura dice 1999. Sin
    // esto, cada factura vuelve a resolverlo por terminación; con esto, la
    // segunda ya entra derecho.
    //
    // Es el MISMO camino que usa vincular a mano —`aliasAEscribir` y el mismo
    // upsert—, así que un código que ya apunta a otro producto se REAPUNTA y no
    // se pisa en silencio. Y va después de marcar: que falle esto no puede
    // impedir que el tilde quede puesto, que es lo que la persona pidió.
    let codigoGuardado = null;
    if (revisada && linea.productoLocalId && linea.codigoProveedor) {
      try {
        const pl = await prisma.productoLocal.findUnique({
          where: { id: linea.productoLocalId },
          select: { baseId: true },
        });
        const alias = pl?.baseId
          ? aliasAEscribir({
              linea: { codigoProveedor: linea.codigoProveedor, descripcion: linea.textoCrudo },
              productoBaseId: pl.baseId,
              grupoId: linea.comprobante.grupoId,
              proveedorId: linea.comprobante.proveedorId,
            })
          : null;
        if (alias) {
          const guardado = await prisma.productoCodigoProveedor.upsert({
            where: {
              codigo_interno_unico_por_proveedor: {
                grupoId: alias.grupoId,
                proveedorId: alias.proveedorId,
                codigoInterno: alias.codigoInterno,
              },
            },
            update: {
              productoBaseId: alias.productoBaseId,
              descripcionProveedor: alias.descripcionProveedor,
              activo: true,
            },
            create: alias,
            select: { id: true, codigoInterno: true },
          });
          codigoGuardado = guardado.codigoInterno;
        }
      } catch (e) {
        // No se grita: el tilde ya quedó. Lo que se pierde es que la próxima
        // factura vuelva a resolverlo por terminación, que es lo que hacía
        // hasta hoy.
        console.error("No se pudo guardar el código del proveedor al confirmar:", e?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      codigoGuardado,
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

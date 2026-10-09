// POST /api/compras-proveedor/recepcion/correccion
//
// GUARDA LO QUE UNA PERSONA CORRIGIÓ EN UN RENGLÓN, EN EL MOMENTO.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// Lo que se cargaba en la hoja de Corregir —cuánto entró, las sueltas, los
// kilos, el motivo de la diferencia— vivía en la memoria del navegador hasta
// tocar "Recibir mercadería". Refrescar la página lo borraba. Había medio
// remedio: la cantidad y los kilos se copiaban al `sessionStorage`, pero las
// sueltas, las unidades que entran al stock y el motivo no, y el
// `sessionStorage` se muere al cerrar la pestaña.
//
// Es el mismo criterio que ya tiene la marca de revisado, escrito al lado de
// ella: **marcar es escribir, y se escribe apenas ocurre.** Su riesgo no es
// mover stock, es perderse. Corregir un renglón es exactamente lo mismo.
//
// ── LO QUE ESTA RUTA NO HACE ──────────────────────────────────────────────
//
// **No mueve stock y no escribe ningún costo.** Eso lo sigue haciendo
// `recibir/[id]`, en una sola transacción, cuando alguien recibe de verdad.
// Acá se guarda lo contado, que es un borrador de trabajo: las mismas columnas
// que la recepción va a leer, escritas antes de tiempo.
//
// Por eso tampoco cambia el estado del pedido ni marca nada como recibido: un
// `cantidadRecibida` escrito acá es "esto es lo que conté", no "esto entró".

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { resolverLineaDelPapel } from "@/lib/compras-proveedor/comprobante/resolverLineaDelPapel";
import { filasDeIdentidad, METODO_DETECCION } from "@/lib/proveedores/identidad/servicioIdentidad";
import { persistirIdentidad } from "@/lib/proveedores/identidad/persistirIdentidad";

/** Un número que llegó de la pantalla, o null. Vacío es null, no cero. */
function numeroONull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const pedidoId = Number(body?.pedidoId);
    const pedidoDetalleId = Number(body?.pedidoDetalleId);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return NextResponse.json(
        { ok: false, error: "No se sabe de qué pedido es esta corrección.", queHacer: "Volvé a abrir el pedido." },
        { status: 400 }
      );
    }

    // El alcance va en el WHERE: una línea de otro grupo no existe.
    const detalle = Number.isFinite(pedidoDetalleId)
      ? await prisma.pedidoProveedorDetalle.findFirst({
          where: { id: pedidoDetalleId, pedido: { id: pedidoId, grupoId } },
          select: { id: true, pedido: { select: { id: true, estado: true } } },
        })
      : null;

    if (Number.isFinite(pedidoDetalleId) && !detalle) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ese renglón no es de este pedido. Volvé a la lista y abrilo de nuevo.",
          queHacer: "Ese renglón no es de este pedido. Volvé a la lista y abrilo de nuevo.",
        },
        { status: 409 }
      );
    }

    // ── UN PEDIDO YA RECIBIDO NO SE SIGUE CORRIGIENDO ───────────────────
    //
    // Lo que entró, entró. Guardar encima una cantidad nueva dejaría el
    // registro diciendo una cosa y el stock otra, sin que nada lo avise. Es la
    // misma guarda que tienen las tres rutas del control.
    if (detalle && detalle.pedido.estado === "RECIBIDO") {
      return NextResponse.json(
        {
          ok: false,
          error: "Este pedido ya se recibió, así que no se puede seguir corrigiendo.",
          queHacer: "Este pedido ya se recibió, así que no se puede seguir corrigiendo.",
        },
        { status: 409 }
      );
    }

    // Lo contado. Cada campo se escribe solo si vino: mandar la hoja sin tocar
    // los kilos no puede borrar unos kilos que ya estaban.
    const aGuardar = {};
    if ("cantidadRecibida" in body) aGuardar.cantidadRecibida = numeroONull(body.cantidadRecibida);
    if ("unidadesSueltas" in body) {
      const s = numeroONull(body.unidadesSueltas);
      aGuardar.unidadesSueltas = s === null ? null : Math.trunc(s);
    }
    if ("unidadesFisicas" in body) aGuardar.unidadesFisicas = numeroONull(body.unidadesFisicas);
    if ("kgRecibidos" in body) aGuardar.kgRecibidos = numeroONull(body.kgRecibidos);
    if ("motivoPrincipal" in body) aGuardar.motivoPrincipal = body.motivoPrincipal || null;
    if ("motivoDetalle" in body) aGuardar.motivoDetalle = body.motivoDetalle || null;

    if (detalle && Object.keys(aGuardar).length) {
      await prisma.pedidoProveedorDetalle.update({ where: { id: detalle.id }, data: aGuardar });
    }

    // ── Y LA ELECCIÓN DE UNIDAD, QUE ES DEL RENGLÓN DEL PAPEL ───────────
    //
    // Por unidad o por bulto: cuando el papel no lo deja deducir, la pantalla
    // pregunta y alguien elige. Esa elección no es de la línea del pedido —dos
    // renglones pueden apuntar a la misma— así que va en el renglón, y se
    // resuelve con el mismo reencuentro que usan las tres rutas del control,
    // para que un id muerto por una relectura no la pierda.
    let unidadGuardadaEn = null;
    if (body?.unidadElegida) {
      const { linea } = await resolverLineaDelPapel(prisma, {
        grupoId,
        lineaId: body?.lineaId,
        pedidoId,
        textoCrudo: body?.textoCrudo,
        select: { id: true },
      });
      if (linea) {
        await prisma.comprobanteLinea.update({
          where: { id: linea.id },
          data: { unidadElegida: String(body.unidadElegida) },
        });
        unidadGuardadaEn = linea.id;
      }
    }

    // ── Y EL PACK QUE FACTURA EL PROVEEDOR, QUE ES DEL VÍNCULO ───────────
    //
    // "DYSSA lo trae por pack de 6": la hoja lo mostró con su cuenta y quien
    // recibe guardó mirándolo. Eso es una confirmación, y vale para la próxima
    // boleta, factura o lista de ese proveedor con ese producto: va al vínculo
    // —`unidadesPorPresentacion`—, el mismo dato que Listas ya escribe. Por el
    // servicio de identidad y no a mano: una deducción no pisa lo que una
    // persona confirmó, y las dos claves del renglón —código y texto— quedan
    // iguales.
    let presentacionGuardada = null;
    const unidadesPorFacturada = numeroONull(body?.unidadesPorFacturada);
    if (Number.isInteger(unidadesPorFacturada) && unidadesPorFacturada > 1) {
      const { linea } = await resolverLineaDelPapel(prisma, {
        grupoId,
        lineaId: body?.lineaId,
        pedidoId,
        textoCrudo: body?.textoCrudo,
        select: {
          id: true, codigoProveedor: true, textoCrudo: true, productoLocalId: true,
          comprobante: { select: { proveedorId: true } },
        },
      });
      const productoBaseId = linea?.productoLocalId
        ? (await prisma.productoLocal.findUnique({ where: { id: linea.productoLocalId }, select: { baseId: true } }))?.baseId
        : null;
      if (linea && productoBaseId) {
        const filas = filasDeIdentidad({
          grupoId,
          proveedorId: linea.comprobante.proveedorId,
          productoBaseId,
          codigoProveedor: linea.codigoProveedor,
          descripcionProveedor: linea.textoCrudo,
          metodoDeteccion: METODO_DETECCION.MANUAL,
          confirmadaPorUsuarioId: session?.id ?? null,
          confirmadaEn: new Date(),
          unidadesPorPresentacion: unidadesPorFacturada,
        });
        presentacionGuardada = await prisma.$transaction((tx) => persistirIdentidad(tx, filas));
      }
    }

    return NextResponse.json({
      ok: true,
      pedidoDetalleId: detalle?.id ?? null,
      guardado: Object.keys(aGuardar),
      unidadGuardadaEn,
      presentacionGuardada,
      queHacer: "Queda guardado. Si refrescás la pantalla, sigue estando.",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "guardar lo que corregiste en este renglón",
          quedo: "Puede no haberse guardado: volvé a abrirlo y fijate si quedó.",
        }),
      },
      { status: 500 }
    );
  }
}

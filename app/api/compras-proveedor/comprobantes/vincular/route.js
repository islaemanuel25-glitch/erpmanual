// POST /api/compras-proveedor/comprobantes/vincular
//
// Vincula una línea leída a un producto, y GUARDA EL ALIAS.
//
// El alias es lo único que hace que el trabajo manual de hoy ahorre trabajo
// mañana: sin él, la misma factura del mes que viene vuelve a pedir las mismas
// veinte decisiones. Por eso se escribe en la MISMA transacción que el vínculo —
// que quede uno sin el otro sería el peor de los dos mundos.
//
// ── ESTA RUTA NO TOCA NINGÚN COSTO ─────────────────────────────────────────
//
// Vincular es decir a qué producto corresponde la línea. Escribir el precio es
// otra decisión, con su propia frontera y sus umbrales, y viene en su tanda.
// Mezclarlas haría que confirmar un vínculo moviera plata sin que nadie lo
// hubiera pedido.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { aliasAEscribir, resolverLineaDelPedido } from "@/lib/compras-proveedor/comprobante/vinculo";
import {
  aplanarDetalles,
  buscarProductoDeLaLinea,
  cargarContexto,
} from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { productoBaseDeLaLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { productosDeLasFilas } from "@/lib/compras-proveedor/comprobante/productoDeLaFila";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { sembrarPedidoDesdeFactura } from "@/lib/compras-proveedor/sembrarPedidoDesdeFactura";
import {
  textoDeLaAsociacion,
  yaEsDelProveedor,
} from "@/lib/compras-proveedor/comprobante/asociarAlProveedor";
import { resolverLineaDelPapel } from "@/lib/compras-proveedor/comprobante/resolverLineaDelPapel";
import {
  parDelTextoRechazado,
  parRechazado,
  paresQueReconocenLaLinea,
} from "@/lib/compras-proveedor/comprobante/paresDeLaLinea";

/**
 * El renglón, y si se le puede tocar el vínculo. Lo comparten vincular y quitar
 * el producto: las dos cambian lo mismo y frenan en los mismos casos.
 *
 * @returns `{ linea }` o `{ rechazo }`, la respuesta ya armada.
 */
async function lineaQueSePuedeVincular({ grupoId, lineaId, body }) {
  // El alcance por relación: una línea de otro grupo no existe. Y el
  // renglón se encuentra aunque el papel se haya vuelto a leer, que es lo
  // que dejaba a esta ruta contestando "No existe esa línea." sobre un
  // renglón que la pantalla estaba mostrando.
  const { linea, motivo: motivoDeLaLinea } = await resolverLineaDelPapel(prisma, {
    grupoId,
    lineaId,
    pedidoId: body?.pedidoId,
    textoCrudo: body?.textoCrudo,
    select: {
      id: true, textoCrudo: true, codigoProveedor: true,
      // Lo que colgaba del vínculo ANTERIOR. Si el producto cambia, esto hay
      // que deshacerlo: si no, queda un costo aceptado escrito sobre la línea
      // de pedido equivocada y nadie se entera.
      productoLocalId: true, pedidoDetalleId: true,
      precioPedidoPrevio: true, costoFinalUnitario: true,
      // `pedidoId` para poder resolver a qué línea del pedido corresponde.
      comprobante: {
        select: { id: true, pedidoId: true, proveedorId: true, estado: true, confirmadoEn: true },
      },
    },
  });
  if (!linea) {
    return { rechazo: NextResponse.json({ ok: false, error: motivoDeLaLinea, queHacer: motivoDeLaLinea }, { status: 409 }) };
  }
  if (linea.comprobante.estado === "ANULADO") {
    return {
      rechazo: NextResponse.json(
        { ok: false, error: "El comprobante está anulado.", queHacer: "No se puede vincular sobre un anulado." },
        { status: 409 }
      ),
    };
  }
  if (linea.comprobante.confirmadoEn) {
    // Ya alguien lo dio por bueno en una recepción: cambiar el vínculo ahora
    // movería el costo de otro producto sin que nadie lo revise.
    return {
      rechazo: NextResponse.json(
        {
          ok: false,
          error: "Este comprobante ya fue confirmado en una recepción.",
          queHacer: "Para cambiarlo hay que revisarlo desde la segunda revisión del dueño.",
        },
        { status: 409 }
      ),
    };
  }
  return { linea };
}

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const lineaId = Number(body?.lineaId);
    const productoBaseId = Number(body?.productoBaseId);
    const pedidoDetalleId = Number(body?.pedidoDetalleId) > 0 ? Number(body.pedidoDetalleId) : null;

    if (!Number.isFinite(lineaId) || !Number.isFinite(productoBaseId)) {
      return NextResponse.json(
        { ok: false, error: "Faltan el producto del papel o el tuyo.", queHacer: "Elegí un producto de la lista." },
        { status: 400 }
      );
    }

    const { linea, rechazo } = await lineaQueSePuedeVincular({ grupoId, lineaId, body });
    if (rechazo) return rechazo;

    // El producto tiene que existir EN ESTE GRUPO y tener fila en esta
    // ubicación: el vínculo apunta a `productoLocalId`, que es por local.
    const productoLocal = await prisma.productoLocal.findFirst({
      where: { localId, baseId: productoBaseId, base: { grupoId } },
      select: {
        id: true,
        base: {
          select: {
            id: true,
            nombre: true,
            // Las tres relaciones que DEFINEN el universo del proveedor. Hacen
            // falta para saber si este producto ya es suyo o hay que asociarlo.
            proveedor_id: true,
            proveedor2_id: true,
            proveedor3_id: true,
          },
        },
      },
    });
    if (!productoLocal) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ese producto no está disponible en esta ubicación.",
          queHacer: "Elegí uno de la lista, o creá el producto acá antes de vincularlo.",
        },
        { status: 404 }
      );
    }

    const alias = aliasAEscribir({
      linea: { codigoProveedor: body?.codigoProveedor ?? null, descripcion: linea.textoCrudo },
      productoBaseId,
      grupoId,
      proveedorId: linea.comprobante.proveedorId,
    });

    // ── SI NADIE LA MANDA, LA LÍNEA DEL PEDIDO SE RESUELVE ACÁ ───────────
    //
    // `pedidoDetalleId` venía SOLO del cuerpo, y ningún cliente lo mandaba:
    // medido el 2026-09-20, 0 de 21 líneas la tenían. La columna es lo que
    // después permite aceptar un precio, así que una línea recién vinculada
    // quedaba sin poder decidir su costo.
    //
    // Se deduce con `resolverLineaDelPedido`, el MISMO criterio que usan la
    // pantalla y la ruta de aceptar un precio. Si el cuerpo la manda, manda el
    // cuerpo: puede haber varias líneas del mismo producto y ahí eligió una
    // persona.
    // ── AL CAMBIAR DE PRODUCTO, LA COLUMNA GUARDADA NO MANDA ─────────────
    //
    // `resolverLineaDelPedido` devuelve la columna cuando está, y con razón: no
    // pisa en silencio una línea que alguien eligió a mano. Pero al RE-VINCULAR
    // esa columna es del producto anterior, así que devolverla deja la línea
    // apuntando a la línea de pedido equivocada.
    //
    // Medido: cambiar la línea 110 de Philips 10 a Chester 10 dejó
    // `pedidoDetalleId` en 2574, que es la línea de Philips. El producto decía
    // una cosa y la comparación se hacía contra otra.
    //
    // Así que cuando el producto cambia se deduce de cero, por el producto
    // nuevo.
    const cambiaDeProducto =
      linea.productoLocalId != null && linea.productoLocalId !== productoLocal.id;

    let detalleDelPedido = pedidoDetalleId;
    if (!detalleDelPedido && linea.comprobante.pedidoId) {
      const delPedido = resolverLineaDelPedido({
        linea: cambiaDeProducto ? { ...linea, pedidoDetalleId: null } : linea,
        productoBaseId,
        detalles: aplanarDetalles(
          await prisma.pedidoProveedorDetalle.findMany({
            where: { pedidoId: linea.comprobante.pedidoId },
            select: {
              id: true,
              cantidad: true,
              precioCosto: true,
              producto: { select: { baseId: true } },
            },
          })
        ),
      });
      detalleDelPedido = delPedido.detalle?.id ?? null;
    }

    // ── ¿CAMBIA DE LÍNEA DE PEDIDO? ENTONCES HAY QUE DESHACER LO ANTERIOR ─
    //
    // Re-vincular no es vincular por primera vez: puede haber un costo ya
    // aceptado escrito sobre la línea del pedido VIEJA. Sin deshacerlo queda un
    // precio de la factura aplicado a un producto que esa factura no trae, y no
    // se ve: el número es plausible y nadie lo va a ir a buscar.
    //
    // Se restaura desde `precioPedidoPrevio`, que es la columna que
    // `aceptar-precio` llena justamente para poder contestar "a cuánto estaba
    // antes". Si está en null no se toca nada: no hay a qué volver.
    const cambiaDeDetalle =
      linea.pedidoDetalleId != null && linea.pedidoDetalleId !== detalleDelPedido;
    const habiaPrecioAceptado = linea.costoFinalUnitario != null;

    const resultado = await prisma.$transaction(async (tx) => {
      if (cambiaDeDetalle && habiaPrecioAceptado && linea.precioPedidoPrevio != null) {
        await tx.pedidoProveedorDetalle.update({
          where: { id: linea.pedidoDetalleId },
          data: { precioCosto: linea.precioPedidoPrevio },
        });
      }

      await tx.comprobanteLinea.update({
        where: { id: linea.id },
        data: {
          productoLocalId: productoLocal.id,
          pedidoDetalleId: detalleDelPedido,
          // Y se limpia la decisión de precio: era sobre el producto anterior.
          // Dejarla haría que la pantalla mostrara un costo "aceptado" que no se
          // aceptó para este producto.
          ...(cambiaDeDetalle
            ? {
                precioPedidoPrevio: null,
                costoFinalUnitario: null,
                claseDiferencia: null,
                diferenciaPct: null,
              }
            : {}),
        },
      });

      // ── QUÉ HACE QUE EL PRODUCTO APAREZCA LA PRÓXIMA VEZ ──────────────
      //
      // El buscador de la hoja ofrece por defecto el universo del proveedor y
      // tiene una salida explícita al catálogo entero, para lo que el proveedor
      // trae por primera vez. Lo que hace que ESE producto aparezca la próxima
      // vez sin salir del universo es EL ALIAS que se escribe acá abajo: el
      // catálogo del proveedor suma las bases con un código vinculado activo
      // —`baseIdsVinculados` en `compras-proveedor/productos`— y la cascada lo
      // reconoce sola por `ALIAS_DESCRIPCION`, que es su segundo escalón.
      //
      // ── Y POR QUÉ NO SE ESCRIBE LA RELACIÓN DEL PRODUCTO ──────────────
      //
      // Se intentó: llenar `proveedor2_id` sería la afirmación más fuerte —"a
      // este proveedor se le compra esto"—. Lo frenó un candado que existe
      // desde antes y tiene razón: NINGUNA ruta de pedido escribe sobre
      // ProductoBase, salvo recibir. Los datos del producto se editan en editar
      // producto y no como efecto lateral de otra cosa; así fue como los costos
      // se filtraban al catálogo sin que nadie lo pidiera.
      //
      // El alias alcanza para lo que se pedía y no toca la ficha del producto.
      // Si algún día hace falta la relación, es una decisión de Emanuel y va
      // por editar producto, no por acá.
      const asociacion = { accion: yaEsDelProveedor(productoLocal.base, linea.comprobante.proveedorId)
        ? "YA_ESTABA"
        : "POR_ALIAS" };

      // El alias va en la MISMA transacción. Que quede el vínculo sin el alias
      // haría que la próxima factura volviera a preguntar lo mismo, y que quede
      // el alias sin el vínculo dejaría un macheo automático que nadie confirmó.
      // ── CAMBIAR REEMPLAZA: QUEDA UN SOLO PAR, EL NUEVO ──────────────────
      //
      // El upsert de abajo solo pisa el par con la MISMA clave. Si el renglón
      // lo reconocía otro par —el "TXT:…" que guarda la vinculación automática
      // junto al código, o un código de la lista por la escalera—, ese seguía
      // apuntando al producto viejo: dos alias para el mismo texto, y la próxima
      // factura frenaba por "más de un producto". Se dan de baja los que
      // apuntan a otro producto (`paresQueReconocenLaLinea`).
      const viejos = paresQueReconocenLaLinea({
        linea: { codigoProveedor: body?.codigoProveedor ?? null, textoCrudo: linea.textoCrudo },
        vinculos: await tx.productoCodigoProveedor.findMany({
          where: { grupoId, proveedorId: linea.comprobante.proveedorId, activo: true },
          select: { id: true, productoBaseId: true, codigoInterno: true, descripcionProveedor: true, activo: true },
        }),
      }).filter((v) => Number(v.productoBaseId) !== Number(productoBaseId));
      if (viejos.length) {
        await tx.productoCodigoProveedor.updateMany({
          where: { id: { in: viejos.map((v) => v.id) } },
          data: { activo: false },
        });
      }

      let aliasGuardado = null;
      if (alias) {
        aliasGuardado = await tx.productoCodigoProveedor.upsert({
          where: {
            codigo_interno_unico_por_proveedor: {
              grupoId: alias.grupoId,
              proveedorId: alias.proveedorId,
              codigoInterno: alias.codigoInterno,
            },
          },
          // Si ya existía apuntando a otro producto, se REAPUNTA y se reactiva:
          // la decisión de ahora, hecha mirando la factura, gana sobre una vieja.
          update: {
            productoBaseId: alias.productoBaseId,
            descripcionProveedor: alias.descripcionProveedor,
            activo: true,
          },
          create: alias,
          select: { id: true, codigoInterno: true },
        });
      }
      return { aliasGuardado, asociacion };
    });

    // ── SI EL PEDIDO NACIÓ DE LA FACTURA, LA LÍNEA DEL PEDIDO SE CREA ACÁ ─
    //
    // En un pedido normal, vincular a un producto que nadie pidió deja la línea
    // "no pedida" y eso está bien: el papel trajo algo de más. En uno nacido de
    // una factura no existe tal cosa —el pedido ES el papel—, así que un
    // producto recién vinculado necesita su línea de pedido o no se va a poder
    // ni decidir su precio ni recibir.
    //
    // Se llama a la MISMA siembra que corre al leer, que ya sabe en qué escala
    // entra cada renglón y es idempotente. Escribir acá una creación parecida
    // al lado sería el segundo criterio de siempre. Devuelve sin tocar nada
    // —una consulta— cuando el pedido no nació de una factura, que es el caso
    // de todos los días.
    let siembra = null;
    if (detalleDelPedido == null && linea.comprobante.pedidoId) {
      try {
        siembra = await sembrarPedidoDesdeFactura(prisma, {
          pedidoId: linea.comprobante.pedidoId,
          grupoId,
          localId,
        });
      } catch (e) {
        console.error("No se pudo armar la línea del pedido para la línea vinculada:", e?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      lineaId: linea.id,
      productoLocalId: productoLocal.id,
      // Cuántas líneas de pedido se armaron con esto, cuando el pedido nació de
      // una factura. Null en el caso normal.
      siembra: siembra?.ok === true ? siembra : null,
      producto: productoLocal.base,
      alias: resultado.aliasGuardado,
      queHacer: [
        resultado.aliasGuardado
          ? `Vinculado. La próxima factura de este proveedor va a reconocer "${linea.textoCrudo}" sola.`
          : "Vinculado. No se pudo guardar el alias porque el producto del papel no trae ni código ni descripción.",
        // Sin el nombre del proveedor: esta ruta no lo trae, y pedirlo solo
        // para el texto sería una consulta más por cada vínculo. El default
        // dice "este proveedor", que en la pantalla del pedido no es ambiguo.
        textoDeLaAsociacion(resultado.asociacion),
      ]
        .filter(Boolean)
        .join(" "),
      // Qué pasó con la asociación al proveedor, para poder contarlo sin
      // deducirlo del texto.
      asociadoAlProveedor: resultado.asociacion?.accion ?? null,
    });
  } catch (err) {
    console.error("Error comprobantes/vincular:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "vincular el producto del papel con el tuyo",
        quedo: "Puede que el vínculo haya quedado hecho: volvé a abrir el detalle y fijate antes de repetirlo.",
      }) }, { status: 500 });
  }
}

// DELETE /api/compras-proveedor/comprobantes/vincular
//
// QUITAR EL PRODUCTO DE UNA LÍNEA. Arcor: "HW MOGUL MINI GUSANITOS 10×50G"
// quedó con "Mogul extreme mini gustnitos" y Emanuel dijo que está mal; solo
// había "Cambiar". Quitar deja el renglón sin producto, como recién leído, y
// da de baja los pares del proveedor que lo llevaban a ESE producto —también
// si venían de una lista—, para que la próxima factura no lo vuelva a vincular
// mal. Mismo permiso que vincular.
export async function DELETE(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const lineaId = Number(body?.lineaId);
    if (!Number.isFinite(lineaId)) {
      return NextResponse.json({ ok: false, error: "Falta el producto del papel." }, { status: 400 });
    }
    const { linea, rechazo } = await lineaQueSePuedeVincular({ grupoId, lineaId, body });
    if (rechazo) return rechazo;

    // ── EL PRODUCTO QUE LA PANTALLA MUESTRA, CON LAS PIEZAS DE LA PANTALLA ──
    //
    // El vínculo hecho a mano gana; si no hay, el que la cascada da por bueno
    // solo —código o alias exactos—, igual que `analizarLineas`. Sin el pedido:
    // lo que vincula solo no depende de él.
    const proveedorId = linea.comprobante.proveedorId;
    const contexto = await cargarContexto(prisma, { grupoId, localId, proveedorId });
    const { productoBaseId } = productoBaseDeLaLinea({
      linea,
      baseDelLocal: new Map([...(await productosDeLasFilas(prisma, [linea]))].map(([id, p]) => [id, p.baseId])),
      sugeridoBaseId:
        linea.productoLocalId == null
          ? buscarProductoDeLaLinea({
              linea: { codigoProveedor: linea.codigoProveedor, descripcion: linea.textoCrudo },
              contexto,
            })?.vinculoAutomatico?.productoBaseId ?? null
          : null,
    });
    if (!productoBaseId) {
      const sinProducto = "El producto del papel ya no está vinculado a ninguno tuyo.";
      return NextResponse.json({ ok: false, error: sinProducto, queHacer: sinProducto }, { status: 409 });
    }

    const renglon = { codigoProveedor: linea.codigoProveedor, textoCrudo: linea.textoCrudo };
    const bajas = await prisma.$transaction(async (tx) => {
      // Un precio aceptado sobre la línea del pedido se deshace, igual que al
      // cambiar de producto: era la factura aplicada a ESTE producto.
      if (linea.pedidoDetalleId != null && linea.costoFinalUnitario != null && linea.precioPedidoPrevio != null) {
        await tx.pedidoProveedorDetalle.update({
          where: { id: linea.pedidoDetalleId },
          data: { precioCosto: linea.precioPedidoPrevio },
        });
      }
      await tx.comprobanteLinea.update({
        where: { id: linea.id },
        data: {
          productoLocalId: null,
          pedidoDetalleId: null,
          precioPedidoPrevio: null,
          costoFinalUnitario: null,
          claseDiferencia: null,
          diferenciaPct: null,
        },
      });

      const delProveedor = await tx.productoCodigoProveedor.findMany({
        where: { grupoId, proveedorId, productoBaseId },
        select: { id: true, productoBaseId: true, codigoInterno: true, descripcionProveedor: true, activo: true },
      });
      const pares = paresQueReconocenLaLinea({ linea: renglon, vinculos: delProveedor.filter((v) => v.activo) });
      if (pares.length) {
        await tx.productoCodigoProveedor.updateMany({
          where: { id: { in: pares.map((v) => v.id) } },
          data: { activo: false },
        });
      }

      // Y que quede dicho por TEXTO, que es lo que mira la vinculación
      // automática contra el pedido (`parRechazado`). Si ningún par lo decía
      // —venía solo por un código—, se guarda el del texto ya dado de baja.
      const ahora = delProveedor.map((v) => (pares.some((p) => p.id === v.id) ? { ...v, activo: false } : v));
      if (!parRechazado({ linea: renglon, vinculos: ahora, productoBaseId })) {
        const rechazado = parDelTextoRechazado({ linea: renglon, grupoId, proveedorId, productoBaseId });
        const existe = rechazado
          ? await tx.productoCodigoProveedor.findUnique({
              where: { codigo_interno_unico_por_proveedor: { grupoId, proveedorId, codigoInterno: rechazado.codigoInterno } },
              select: { id: true },
            })
          : null;
        if (rechazado && !existe) await tx.productoCodigoProveedor.create({ data: rechazado });
      }
      return pares.length;
    });

    return NextResponse.json({
      ok: true,
      lineaId: linea.id,
      paresDadosDeBaja: bajas,
      queHacer: "Quitado. El producto del papel queda sin vincular, y la próxima factura no lo va a vincular solo a ese producto.",
    });
  } catch (err) {
    console.error("Error comprobantes/vincular (quitar):", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "quitar el producto vinculado",
        quedo: "Puede que el producto haya quedado quitado: volvé a abrir el detalle y fijate antes de repetirlo.",
      }) }, { status: 500 });
  }
}

// POST /api/compras-proveedor/comprobantes/aceptar-precio
//
// Acepta el precio de una línea leída y lo escribe EN LA LÍNEA DEL PEDIDO.
//
// ── Y TAMBIÉN GUARDA LA OTRA RESPUESTA, QUE ES LA MISMA DECISIÓN ───────────
//
// `decision: "DEJA_EL_MIO"` no escribe ningún costo: solo registra que sobre
// estos dos precios ya se contestó. Está en ESTA ruta y no en una al lado
// porque es el mismo hecho con el otro valor —un `ProductoQueNoSeCambia` del
// precio— y porque las dos necesitan exactamente lo mismo para poder guardarse:
// a qué producto es, a qué línea del pedido corresponde y cuáles son los dos
// números que se compararon. Con dos rutas, cualquiera de esas tres se
// resolvería distinto de un lado que del otro, que es el defecto que este
// módulo ya tuvo dos veces.
//
// El default es aceptar, así que quien ya la llamaba —la conciliación de
// escritorio— sigue llamándola igual.
//
// ── UN SOLO ESCRITOR DE COSTO ──────────────────────────────────────────────
//
// Esta ruta NO toca el costo del producto. Escribe el precio en
// `PedidoProveedorDetalle.precioCosto`, y el costo lo sigue escribiendo la
// recepción —`recibir/[id]`— con la frontera que ya está, cuando alguien recibe
// la mercadería de verdad.
//
// Así hay un solo lugar que mueve costos y una sola regla que los gobierna. Si
// esta ruta escribiera el costo directo, habría dos caminos con dos criterios, y
// el día que uno cambie el otro queda viejo sin que nada lo diga.
//
// ── LAS TRES REGLAS SE COMPRUEBAN ACÁ TAMBIÉN ──────────────────────────────
//
// La pantalla esconde el botón cuando no corresponde, pero quien llama a esta
// ruta puede ser cualquiera. `puedeAceptarse` las vuelve a comprobar del lado
// del servidor, y por eso frena una baja o un salto brusco aunque el pedido
// llegue igual.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { puedeAceptarse } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { RECETA_POR_DEFECTO } from "@/lib/compras-proveedor/comprobante/impuestos";
import { productosDeLasFilas } from "@/lib/compras-proveedor/comprobante/productoDeLaFila";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { resolverLineaDelPedido } from "@/lib/compras-proveedor/comprobante/vinculo";
import { aplanarDetalles } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { guardarDecisionDePrecio } from "@/lib/compras-proveedor/comprobante/guardarDecisionDePrecio";
import {
  DECISION_DE_PRECIO,
  esDecisionConocida,
  mismoPrecio,
} from "@/lib/compras-proveedor/decisionDePrecio";

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

    // Sin `decision` es aceptar, que es lo que esta ruta hacía siempre.
    const decisionPedida = body?.decision ?? DECISION_DE_PRECIO.ACEPTA_FACTURA;
    if (!esDecisionConocida(decisionPedida)) {
      return NextResponse.json(
        { ok: false, error: "Esa no es una decisión de precio conocida." },
        { status: 400 }
      );
    }

    const linea = await prisma.comprobanteLinea.findFirst({
      where: { id: lineaId, comprobante: { grupoId } },
      select: {
        id: true, cantidad: true, netoUnitario: true, internoUnitario: true,
        // `subtotalImpreso` es lo que permite comprobar que la cuenta de ESTA
        // línea cierra. Con un papel sin total impreso es lo único que queda
        // para verificar el precio, así que sin él la guarda no puede decidir.
        subtotalImpreso: true,
        // El escalar, no una relación: `productoLocal` no existe en el esquema y
        // pedirla acá rompía la ruta contra Postgres. El producto se trae aparte.
        productoLocalId: true, pedidoDetalleId: true,
        comprobante: {
          select: {
            // `pedidoId` para poder resolver a qué línea del pedido pertenece
            // esta línea, con el mismo criterio que usa la pantalla.
            id: true, pedidoId: true, estado: true, confirmadoEn: true, recetaUsada: true,
            proveedor: { select: { id: true, umbralRevisarPct: true, umbralSospechaBajaPct: true } },
          },
        },
      },
    });
    if (!linea) return NextResponse.json({ ok: false, error: "No existe esa línea." }, { status: 404 });

    const receta = linea.comprobante.recetaUsada ?? { ...RECETA_POR_DEFECTO };

    // El producto vinculado, en una consulta aparte. Se piden los tres campos
    // que el análisis usa y ninguno más.
    const porProductoLocal = await productosDeLasFilas(prisma, [linea], {
      id: true, nombre: true, factor_pack: true, precio_costo: true,
    });
    const base = porProductoLocal.get(Number(linea.productoLocalId))?.base ?? null;

    // LOS CINCO PASOS SALEN DEL MÓDULO COMPARTIDO, el mismo que alimenta la
    // pantalla. Se recalculan acá en vez de aceptar lo que llegó en el pedido:
    // el precio que se escribe no puede venir del cliente.
    const analisis = analizarPrecioDeLinea({
      linea,
      producto: base,
      receta,
      proveedor: linea.comprobante.proveedor,
      // Lo único que se toma del pedido es la ELECCIÓN de unidad, cuando el
      // cociente no alcanza para decidir. Es una decisión de una persona que
      // miró la factura, no un número calculado.
      unidadElegida: body?.unidad,
    });

    // Sin análisis no hay precio que escribir, y se frena ANTES de la puerta.
    // `puedeAceptarse` no lo atajaría: mira el vínculo y la unidad, y un
    // `undefined?.requiereDecision` es falso, o sea que pasaría — y el `throw`
    // caería después, con un "Error interno" que no explica nada.
    if (!analisis) {
      return NextResponse.json(
        {
          ok: false,
          error: "El producto vinculado no tiene costo ni bulto cargados, así que no hay con qué comparar.",
        },
        { status: 409 }
      );
    }

    // ── A QUÉ LÍNEA DEL PEDIDO PERTENECE, CON EL CRITERIO ÚNICO ──────────
    //
    // Antes esto se leía de `linea.pedidoDetalleId` y nada más. Esa columna
    // solo se escribe si quien llama a vincular la manda, y la pantalla no la
    // manda: medido, 0 de 21 líneas la tienen. O sea que la guarda de abajo
    // cortaba siempre y aceptar un precio no funcionaba nunca.
    //
    // `resolverLineaDelPedido` es el mismo criterio que alimenta la fila que la
    // persona está mirando: la columna manda cuando está, y si no se deduce por
    // producto. Con dos criterios, la pantalla mostraba una línea y el servidor
    // buscaba otra.
    const detallesDelPedido = aplanarDetalles(
      await prisma.pedidoProveedorDetalle.findMany({
        where: { pedidoId: linea.comprobante.pedidoId },
        select: {
          id: true,
          cantidad: true,
          precioCosto: true,
          producto: { select: { baseId: true } },
        },
      })
    );
    const delPedido = resolverLineaDelPedido({
      linea,
      productoBaseId: base?.id ?? null,
      detalles: detallesDelPedido,
    });

    // ── DEJAR EL PROPIO NO ESCRIBE NINGÚN COSTO ─────────────────────────
    //
    // Solo registra que sobre estos dos precios ya se contestó, y por eso no
    // pasa por `puedeAceptarse`: esa guarda existe para que un precio de la
    // factura no entre sin que alguien lo mire, y acá no entra ninguno. Lo
    // único que hace falta es contra QUÉ costo se decidió, que es el de la
    // línea del pedido — el mismo número que la pantalla mostró.
    if (decisionPedida === DECISION_DE_PRECIO.DEJA_EL_MIO) {
      if (!delPedido.detalle) {
        return NextResponse.json(
          {
            ok: false,
            error: "Esa línea todavía no está apareada con una del pedido, así que no hay contra qué decidir.",
          },
          { status: 409 }
        );
      }
      await guardarDecisionDePrecio(prisma, {
        grupoId,
        proveedorId: linea.comprobante.proveedor.id,
        productoBaseId: base.id,
        decision: DECISION_DE_PRECIO.DEJA_EL_MIO,
        precioFacturado: analisis.precioAEscribir,
        precioPropio: Number(delPedido.detalle.precioCosto),
        comprobanteLineaId: linea.id,
        usuarioId: session?.id ?? null,
      });
      return NextResponse.json({
        ok: true,
        lineaId: linea.id,
        decision: DECISION_DE_PRECIO.DEJA_EL_MIO,
        producto: base?.nombre ?? null,
        queHacer:
          "Queda tu costo. No se vuelve a preguntar mientras la factura traiga el mismo precio " +
          "contra el mismo costo tuyo.",
      });
    }

    const puede = puedeAceptarse({
      linea,
      lineaDePedidoId: delPedido.detalle?.id ?? null,
      comprobante: linea.comprobante,
      decision: analisis.decision,
      unidad: analisis.unidad,
    });
    if (!puede.ok) {
      return NextResponse.json(
        { ok: false, error: puede.motivo, queHacer: puede.motivo, decision: analisis?.decision ?? null },
        { status: 409 }
      );
    }
    const precioAEscribir = analisis.precioAEscribir;
    const clasificacion = analisis.clasificacion;

    const resultado = await prisma.$transaction(async (tx) => {
      const detalle = await tx.pedidoProveedorDetalle.findUnique({
        where: { id: delPedido.detalle.id },
        select: { id: true, precioCosto: true },
      });
      if (!detalle) throw new Error("La línea del pedido ya no existe.");

      // EL PRECIO ANTERIOR SE GUARDA ANTES DE PISARLO, en su columna propia.
      // Sin esto no se puede ver a qué se pidió y a qué terminó facturando, que
      // es una pregunta comercial y no de reversión — por eso no comparte
      // columna con `costoPrevioAplicacion`.
      await tx.comprobanteLinea.update({
        where: { id: linea.id },
        data: {
          precioPedidoPrevio: detalle.precioCosto,
          costoFinalUnitario: precioAEscribir,
          claseDiferencia: clasificacion.clase,
          diferenciaPct: clasificacion.diferenciaPct,
        },
      });

      await tx.pedidoProveedorDetalle.update({
        where: { id: detalle.id },
        data: { precioCosto: precioAEscribir },
      });

      // LA DECISIÓN, CON LOS DOS PRECIOS QUE SE COMPARARON. El propio es el de
      // ANTES de esta escritura: es contra ése que se decidió, y es el que la
      // próxima factura va a encontrar si el costo no se movió. Guardar el
      // nuevo dejaría una decisión que nunca vuelve a aplicar, porque los dos
      // lados serían el mismo número.
      //
      // Va adentro de la transacción: una decisión guardada sobre un costo que
      // no llegó a escribirse haría que la próxima factura no pregunte por algo
      // que no pasó.
      //
      // Y no se guarda nada si los dos números ya eran el mismo: ahí no hubo
      // ninguna pregunta que contestar, y la fila quedaría diciendo "antes
      // decidiste" sobre una comparación que nunca existió.
      if (!mismoPrecio(detalle.precioCosto, precioAEscribir)) {
        await guardarDecisionDePrecio(tx, {
          grupoId,
          proveedorId: linea.comprobante.proveedor.id,
          productoBaseId: base.id,
          decision: DECISION_DE_PRECIO.ACEPTA_FACTURA,
          precioFacturado: precioAEscribir,
          precioPropio: Number(detalle.precioCosto),
          comprobanteLineaId: linea.id,
          usuarioId: session?.id ?? null,
        });
      }

      return { anterior: detalle.precioCosto, nuevo: precioAEscribir };
    });

    return NextResponse.json({
      ok: true,
      lineaId: linea.id,
      producto: base?.nombre ?? null,
      precioAnterior: resultado.anterior,
      precioNuevo: resultado.nuevo,
      queHacer:
        "Precio aceptado y escrito en la línea del pedido. El costo del producto se actualiza " +
        "cuando recibas la mercadería, con la regla de siempre.",
    });
  } catch (err) {
    console.error("Error comprobantes/aceptar-precio:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "aceptar el precio",
        quedo: "Puede que el precio haya quedado escrito en la línea del pedido: fijate en el pedido antes de aceptarlo de nuevo.",
      }) }, { status: 500 });
  }
}

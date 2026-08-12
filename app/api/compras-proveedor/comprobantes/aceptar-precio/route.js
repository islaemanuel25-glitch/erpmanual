// POST /api/compras-proveedor/comprobantes/aceptar-precio
//
// Acepta el precio de una línea leída y lo escribe EN LA LÍNEA DEL PEDIDO.
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

    const linea = await prisma.comprobanteLinea.findFirst({
      where: { id: lineaId, comprobante: { grupoId } },
      select: {
        id: true, cantidad: true, netoUnitario: true, internoUnitario: true,
        // El escalar, no una relación: `productoLocal` no existe en el esquema y
        // pedirla acá rompía la ruta contra Postgres. El producto se trae aparte.
        productoLocalId: true, pedidoDetalleId: true,
        comprobante: {
          select: {
            id: true, estado: true, confirmadoEn: true, recetaUsada: true,
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

    const puede = puedeAceptarse({
      linea,
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
        where: { id: linea.pedidoDetalleId },
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
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

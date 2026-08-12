// GET /api/compras-proveedor/conciliacion/[pedidoId]
//
// TODO lo que la pantalla de recepción necesita, de una sola vez: los
// comprobantes del pedido con sus líneas ya analizadas, lo que a cada línea le
// corresponde del pedido, y las líneas del pedido que ningún comprobante trajo.
//
// ── POR QUÉ UNA RUTA Y NO DOS ──────────────────────────────────────────────
//
// La pantalla vieja tenía dos listas —los comprobantes arriba, el pedido
// abajo— y dos rutas para alimentarlas. Cruzarlas quedaba a cargo de la persona,
// de memoria. La lista nueva es una sola, así que el cruce se hace acá, donde
// están los dos lados, y no en el navegador con dos respuestas que pueden llegar
// desfasadas.
//
// El análisis por comprobante es el MISMO de siempre: sale de
// `analisisDeComprobante.js`, que se extrajo de la ruta de un comprobante para
// no tener dos versiones del cruce que decide qué producto es cada línea.
//
// El contexto —universo del proveedor y catálogo— se carga UNA vez para todos
// los comprobantes, no uno por comprobante.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import {
  cargarContexto,
  aplanarDetalles,
  analizarLineas,
  vinculadasDeTodos,
} from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { coberturaDelPedido, textoDeCobertura } from "@/lib/compras-proveedor/comprobante/cobertura";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, ["compras.ver", "compras.recibir"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { pedidoId: crudo } = await params;
    const pedidoId = Number(crudo);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta decir de qué pedido." }, { status: 400 });
    }

    const pedido = await prisma.pedidoProveedor.findFirst({
      where: { id: pedidoId, grupoId },
      select: { id: true, estado: true, proveedorId: true },
    });
    if (!pedido) {
      return NextResponse.json({ ok: false, error: "No existe ese pedido." }, { status: 404 });
    }

    // Las líneas del pedido, con lo que la fila muestra al lado de la factura.
    const detalles = await prisma.pedidoProveedorDetalle.findMany({
      where: { pedidoId },
      orderBy: { id: "asc" },
      select: {
        id: true, cantidad: true, precioCosto: true, cantidadRecibida: true, unidad: true,
        producto: { select: { id: true, baseId: true, base: { select: { id: true, nombre: true } } } },
      },
    });
    const detallesPlanos = aplanarDetalles(detalles);

    // El alcance va en el WHERE: un comprobante de otro grupo no existe.
    const comprobantes = await prisma.comprobanteProveedor.findMany({
      where: { grupoId, pedidoId, estado: { not: "ANULADO" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, estado: true, tipo: true, puntoVenta: true, numero: true, fecha: true,
        confirmadoEn: true, imagenBorradaEn: true, leidoEn: true, recetaUsada: true,
        proveedor: { select: { id: true, nombre: true, umbralRevisarPct: true, umbralSospechaBajaPct: true } },
        lineas: {
          orderBy: { orden: "asc" },
          select: {
            id: true, orden: true, textoCrudo: true, codigoProveedor: true, cantidad: true,
            netoUnitario: true, subtotalImpreso: true, internoUnitario: true,
            productoLocalId: true, pedidoDetalleId: true, precioPedidoPrevio: true,
          },
        },
      },
    });

    const contexto = await cargarContexto(prisma, {
      grupoId,
      localId,
      proveedorId: pedido.proveedorId,
    });
    const porProductoLocal = await vinculadasDeTodos(prisma, comprobantes);

    const analizados = comprobantes.map((c) => ({
      ...c,
      lineas: analizarLineas({ comprobante: c, contexto, detallesPlanos, porProductoLocal }),
    }));

    const { grupos, sinComprobante, hayFaltantes, totales } = filasDeConciliacion({
      comprobantes: analizados,
      detalles: detallesPlanos,
    });

    // La cobertura, con la MISMA regla de siempre: mientras falten comprobantes
    // por subir o por leer, lo que falta NO es un error y no se pinta como tal.
    const cobertura = coberturaDelPedido({
      detalles: detallesPlanos.map((d) => ({
        id: d.id,
        productoBaseId: d.productoBaseId,
        nombre: d.nombre,
      })),
      lineasDeComprobantes: analizados.flatMap((c) =>
        (c.lineas ?? [])
          .filter((l) => l.pedidoDetalleId != null || l.productoLocalId != null)
          .map((l) => ({
            productoBaseId: l.pedidoDetalle?.productoBaseId ?? null,
            comprobanteId: c.id,
          }))
      ),
    });
    const sinLeer = comprobantes.filter((c) => !c.leidoEn).length;

    return NextResponse.json({
      ok: true,
      pedido: { id: pedido.id, estado: pedido.estado },
      grupos,
      sinComprobante,
      hayFaltantes,
      totales,
      cobertura: {
        ...cobertura,
        ...textoDeCobertura(cobertura, {
          comprobantesSinLeer: sinLeer,
          pedidoCerrado: pedido.estado === "RECIBIDO",
        }),
      },
    });
  } catch (err) {
    console.error("Error compras-proveedor/conciliacion:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "cargar la recepción",
          quedo: "No se tocó nada: esto solo muestra lo que ya estaba cargado.",
        }),
      },
      { status: 500 }
    );
  }
}

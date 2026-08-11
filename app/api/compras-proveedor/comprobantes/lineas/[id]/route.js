// GET /api/compras-proveedor/comprobantes/lineas/[id]
//
// Las líneas leídas de un comprobante, cada una con su vínculo o sus
// candidatos, y con la línea del pedido que le corresponde.
//
// ── POR QUÉ EL CÁLCULO VIVE ACÁ Y NO EN LA PANTALLA ────────────────────────
//
// `buscarCandidatos` es pura y se podría importar en el cliente, pero el dato
// que necesita no: el universo del proveedor y el catálogo salen de consultas, y
// mandarle miles de productos al navegador para que elija uno sería mover mucho
// para traer poco. Es el mismo motivo por el que el panel de listas calcula sus
// candidatos en el servidor.
//
// Calculando acá, cada apertura relee: no hay copia en memoria del cliente y por
// lo tanto no hay nada que invalidar. Un producto creado hace diez segundos
// aparece.
//
// ── EL UNIVERSO ES EL MISMO QUE EL DE LISTAS ───────────────────────────────
//
// Sale de `cargarDatosDeConciliacion`. No se arma un `where` parecido al lado:
// `productoDelProveedorWhere` tiene su propia historia —mira `proveedor_id` y
// `proveedor2_id` y no los vínculos de código, porque un vínculo viejo metía
// productos ajenos— y duplicar ese criterio garantiza que algún día diverjan y
// esta pantalla sugiera productos que el motor no considera del proveedor.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { cargarDatosDeConciliacion } from "@/lib/proveedores/listas/cargaErp";
import {
  buscarCandidatos,
  lineaDelPedido,
  TEXTO_MOTIVO_PEDIDO,
} from "@/lib/compras-proveedor/comprobante/vinculo";

export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId) || comprobanteId <= 0) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    // El alcance va en el WHERE: un comprobante de otro grupo no existe.
    const comprobante = await prisma.comprobanteProveedor.findFirst({
      where: { id: comprobanteId, grupoId },
      select: {
        id: true, proveedorId: true, pedidoId: true, estado: true,
        proveedor: { select: { id: true, nombre: true } },
        lineas: {
          orderBy: { orden: "asc" },
          select: {
            id: true, orden: true, textoCrudo: true, codigoProveedor: true, cantidad: true,
            netoUnitario: true, subtotalImpreso: true, internoUnitario: true,
            productoLocalId: true, pedidoDetalleId: true,
          },
        },
      },
    });
    if (!comprobante) {
      return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });
    }

    // Los vínculos y el universo del proveedor, con la MISMA función que usa
    // la conciliación de listas.
    const datos = await cargarDatosDeConciliacion(
      { grupoId, proveedorId: comprobante.proveedorId, localId },
      prisma
    );

    // El catálogo completo es la última red de la cascada. Se trae acotado a lo
    // visible en esta ubicación, que es lo que la persona puede elegir.
    const catalogo = await prisma.productoBase.findMany({
      where: { grupoId, activo: true },
      select: { id: true, nombre: true },
      take: 5000,
    });
    const catalogoNormalizado = catalogo.map((p) => ({ productoBaseId: p.id, nombre: p.nombre }));

    // Las líneas del pedido, para decir cuál corresponde a cada línea leída.
    const detalles = comprobante.pedidoId
      ? await prisma.pedidoProveedorDetalle.findMany({
          where: { pedidoId: comprobante.pedidoId },
          select: {
            id: true, cantidad: true, precioCosto: true,
            producto: { select: { id: true, baseId: true, base: { select: { id: true, nombre: true } } } },
          },
        })
      : [];
    const detallesPlanos = detalles.map((d) => ({
      id: d.id,
      cantidad: d.cantidad,
      precioCosto: d.precioCosto,
      productoBaseId: d.producto?.baseId ?? d.producto?.base?.id ?? null,
      nombre: d.producto?.base?.nombre ?? null,
    }));

    // El nombre de cada producto, para poder mostrar el candidato sin otra
    // consulta desde la pantalla.
    const nombrePorBase = new Map(catalogo.map((p) => [p.id, p.nombre]));

    const lineas = comprobante.lineas.map((l) => {
      const yaVinculada = l.productoLocalId != null;
      const busqueda = yaVinculada
        ? null
        : buscarCandidatos({
            linea: { codigoProveedor: l.codigoProveedor, descripcion: l.textoCrudo },
            vinculos: datos.codigosProveedor.map((v) => ({
              ...v,
              nombre: nombrePorBase.get(v.productoBaseId) ?? null,
            })),
            universoProveedor: datos.productos.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })),
            catalogo: catalogoNormalizado,
          });

      const productoBaseId = busqueda?.vinculoAutomatico?.productoBaseId ?? null;
      const delPedido = lineaDelPedido({ productoBaseId, detalles: detallesPlanos });

      return {
        ...l,
        // Lo que vinculó solo se distingue de lo sugerido POR DATO, no por
        // color: la pantalla no tiene que deducirlo del origen.
        vinculadaSola: !!busqueda?.vinculoAutomatico,
        requiereDecision: busqueda?.requiereDecision ?? false,
        origen: busqueda?.origen ?? null,
        textoOrigen: busqueda?.texto ?? null,
        problema: busqueda?.problema ?? null,
        candidatos: (busqueda?.candidatos ?? []).map((c) => ({
          ...c,
          nombre: c.nombre ?? nombrePorBase.get(c.productoBaseId) ?? null,
        })),
        sugerido: busqueda?.vinculoAutomatico ?? null,
        pedidoDetalle: delPedido.detalle,
        motivoPedido: delPedido.motivo,
        textoMotivoPedido: delPedido.motivo ? TEXTO_MOTIVO_PEDIDO[delPedido.motivo] : null,
      };
    });

    return NextResponse.json({
      ok: true,
      comprobante: {
        id: comprobante.id,
        estado: comprobante.estado,
        proveedor: comprobante.proveedor,
        pedidoId: comprobante.pedidoId,
      },
      lineas,
      resumen: {
        total: lineas.length,
        vinculadasSolas: lineas.filter((l) => l.vinculadaSola).length,
        esperandoDecision: lineas.filter((l) => l.requiereDecision).length,
        sinCandidatos: lineas.filter((l) => l.origen === "SIN_CANDIDATOS").length,
      },
    });
  } catch (err) {
    console.error("Error comprobantes/lineas:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// app/api/compras-proveedor/crear/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { costoLineaAMaestro, actualizarCostoRealProducto } from "@/lib/compras-proveedor/costoMaestro";
import { esComboBase } from "@/lib/combos/guards";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const { proveedorId, notas, items } = body;

    if (!proveedorId) {
      return NextResponse.json(
        { ok: false, error: "proveedorId requerido" },
        { status: 400 }
      );
    }

    // depositoId = SIEMPRE el depósito del grupo (referencia); NUNCA del body. El
    // DESTINO de stock lo fija creadoEnLocalId (contexto autorizado), abajo.
    const gd = await prisma.grupoDeposito.findFirst({
      where: { grupoId },
      select: { localId: true },
    });
    if (!gd) {
      return NextResponse.json(
        { ok: false, error: "No se encontró depósito para el grupo" },
        { status: 400 }
      );
    }
    const depId = gd.localId;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Debe incluir al menos un producto" },
        { status: 400 }
      );
    }

    // Validar cantidades: entero finito >= 1
    for (const it of items) {
      const c = Number(it.cantidad);
      if (!Number.isFinite(c) || !Number.isInteger(c) || c < 1) {
        return NextResponse.json(
          { ok: false, error: `cantidad debe ser un entero >= 1 (productoLocalId: ${it.productoLocalId})` },
          { status: 400 }
        );
      }
    }

    // Validar proveedor
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: Number(proveedorId) },
    });
    if (!proveedor) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    // Los combos no se compran a proveedor: se compran sus componentes.
    const productosLocales = await prisma.productoLocal.findMany({
      where: { id: { in: items.map((i) => Number(i.productoLocalId)) } },
      select: { id: true, base: { select: { es_combo: true } } },
    });
    if (productosLocales.some((pl) => esComboBase(pl.base))) {
      return NextResponse.json(
        { ok: false, error: "Los combos no se compran a proveedor; se compran sus componentes." },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.create({
      data: {
        grupoId,
        depositoId: depId,
        // Ubicación DUEÑA del pedido = contexto activo (server-authoritative, no
        // del body). Aísla la compra a la ubicación que la creó.
        creadoEnLocalId: localId,
        proveedorId: Number(proveedorId),
        notas: notas || null,
        creadoPorId: session.id,
        detalles: {
          create: items.map((it) => ({
            productoLocalId: Number(it.productoLocalId),
            cantidad: Number(it.cantidad || 1),
            unidad: it.unidad || "BULTO",
            precioCosto: it.precioCosto ? Number(it.precioCosto) : null,
          })),
        },
      },
      include: {
        detalles: {
          include: {
            producto: {
              include: {
                base: {
                  select: {
                    id: true,
                    nombre: true,
                    factor_pack: true,
                    modoCompraProveedor: true,
                    unidad_medida: true,
                  },
                },
              },
            },
          },
        },
        proveedor: { select: { id: true, nombre: true } },
        deposito: { select: { id: true, nombre: true } },
      },
    });

    // Propagar el costo de cada línea al costo real/maestro del producto (solo costo).
    for (const det of pedido.detalles) {
      const costo = det.precioCosto != null ? Number(det.precioCosto) : null;
      if (!costo || costo <= 0) continue;
      const base = det.producto?.base;
      const costoMaestro = costoLineaAMaestro({
        precioCosto: costo,
        unidad: det.unidad,
        factorPack: base?.factor_pack,
        modoCompraProveedor: base?.modoCompraProveedor,
        unidadMedida: base?.unidad_medida,
      });
      await actualizarCostoRealProducto(prisma, {
        productoLocalId: det.productoLocalId,
        costoMaestro,
        // Propiedad del costo: la ubicación dueña del pedido (creadoEnLocalId=localId)
        // solo mueve el costo si es dueña del producto. Un local comprando un
        // producto del depósito NO toca el costo.
        operadoDesdeLocalId: localId,
        depositoLocalId: depId,
      });
    }

    return NextResponse.json({ ok: true, item: pedido });
  } catch (err) {
    console.error("Error compras-proveedor/crear:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al crear pedido" },
      { status: 500 }
    );
  }
}

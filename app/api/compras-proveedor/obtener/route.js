// app/api/compras-proveedor/obtener/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { ownerLocalIdDePedido, pedidoEnAlcance } from "@/lib/compras/scope";
import { SELECT_CUENTA, serializarCuenta } from "@/lib/finanzas/pagosProveedoresServer";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id },
      include: {
        proveedor: { select: { id: true, nombre: true, telefono: true, email: true, direccion: true } },
        deposito: { select: { id: true, nombre: true } },
        // La deuda que nació al cerrar, para el resumen del pedido recibido.
        // Viaja ya resuelta por `serializarCuenta` —la misma de Finanzas—, así
        // que la pantalla no suma pagos.
        cuentaPorPagar: { select: SELECT_CUENTA },
        detalles: {
          include: {
            producto: {
              include: {
                base: {
                  select: {
                    id: true,
                    nombre: true,
                    sku: true,
                    codigo_barra: true,
                    unidad_medida: true,
                    factor_pack: true,
                    modo_pedido: true,
                    precio_costo: true,
                    precio_venta: true,
                    modoCompraProveedor: true,
                    pesoReferenciaKg: true,
                    pesoEsFijo: true,
                    pesoPromedioKg: true,
                  },
                },
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    });

    // Lectura ajena (otro grupo u otra ubicación del mismo grupo) → 404: no revela
    // existencia. Aísla el detalle (proveedor, costos, factura) por ubicación.
    if (!pedidoEnAlcance(pedido, { grupoId, localId })) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    const { cuentaPorPagar, ...item } = pedido;
    // La ubicación DUEÑA, con nombre: es la que debe la compra y la única de
    // la que puede salir el pago inicial. La hoja de cierre la muestra fija
    // ("Sale de: …") en vez de ofrecer un selector.
    const duenaId = ownerLocalIdDePedido(pedido);
    const ubicacionDuena = duenaId
      ? await prisma.local.findUnique({ where: { id: duenaId }, select: { id: true, nombre: true } })
      : null;
    return NextResponse.json({
      ok: true,
      item,
      ubicacionDuena,
      cuentaPorPagar: cuentaPorPagar ? serializarCuenta(cuentaPorPagar) : null,
    });
  } catch (err) {
    console.error("Error compras-proveedor/obtener:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

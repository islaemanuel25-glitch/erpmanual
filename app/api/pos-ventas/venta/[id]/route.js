import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

export async function GET(req, { params }) {
  try {
    const perm = requirePerm(req, "pos.usar");
    if (!perm.ok)
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || isNaN(ventaId)) {
      return NextResponse.json(
        { ok: false, error: "ID de venta invalido" },
        { status: 400 }
      );
    }

    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      include: {
        detalles: true,
        pagos: { select: { medio: true, monto: true, comisionPct: true, comision: true, neto: true } },
        cliente: true,
        vendedor: { select: { id: true, nombre: true, email: true } },
        local: { select: { id: true, nombre: true } },
      },
    });

    // Lectura por ID: inexistente O de otro local → 404 (no revelar existencia).
    // Admin ("*") ve cualquier venta; un no-admin solo las de su local de sesión.
    if (!venta || (!perm.session?.esAdmin && venta.localId !== perm.session?.localId)) {
      return NextResponse.json(
        { ok: false, error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      venta: {
        id: venta.id,
        numero: venta.numero,
        fecha: venta.fecha,
        subtotal: venta.subtotal,
        descuento: venta.descuento,
        total: venta.total,
        // ── CONDICIÓN COMERCIAL CONGELADA ────────────────────────────────────
        //
        // Sale de las columnas de ESTA venta, no de las ofertas de hoy. Una
        // reimpresión de hace tres meses tiene que decir lo que se cobró aquel
        // día: recalcular la oferta vigente ahora daría otro papel para la misma
        // operación, y el que quedó en la mano del cliente sería el falso.
        descuentoPromocional: venta.descuentoPromocional,
        totalAntesRecargo: venta.totalAntesRecargo,
        recargoPagoPct: venta.recargoPagoPct,
        recargoPagoImporte: venta.recargoPagoImporte,
        recargoPagoMedio: venta.recargoPagoMedio,
        formaPago: venta.formaPago,
        comisionBancaria: venta.comisionBancaria,
        netoRecibido: venta.netoRecibido,
        // Tenders congelados (pago dividido). Para venta de 1 medio, un solo pago.
        pagos: venta.pagos.map((p) => ({
          medio: p.medio,
          monto: p.monto,
          comisionPct: p.comisionPct,
          comision: p.comision,
          neto: p.neto,
        })),
        cliente: venta.cliente
          ? { id: venta.cliente.id, nombre: venta.cliente.nombre }
          : null,
        vendedor: venta.vendedor
          ? { id: venta.vendedor.id, nombre: venta.vendedor.nombre || venta.vendedor.email }
          : null,
        local: venta.local
          ? { id: venta.local.id, nombre: venta.local.nombre }
          : null,
        detalles: venta.detalles.map((d) => ({
          id: d.id,
          nombre: d.nombre,
          precio: d.precio,
          cantidad: d.cantidad,
          subtotal: d.subtotal,
          // Snapshot de servicio de importe variable (para desglose en detalle/reimpresión).
          esServicio: d.esServicio,
          importeBaseServicio: d.importeBaseServicio,
          recargoServicioPct: d.recargoServicioPct,
          recargoServicioImporte: d.recargoServicioImporte,
          // Snapshot de la oferta. `precio` (arriba) YA es lo cobrado; esto es lo
          // que habría costado sin ella y cómo se llamaba. El nombre está
          // congelado en la fila, así que sigue leyéndose aunque la oferta se
          // haya finalizado o borrado.
          precioNormal: d.precioNormal,
          ofertaNombre: d.ofertaNombre,
          descuentoPromocional: d.descuentoPromocional,
        })),
      },
    });
  } catch (err) {
    console.error("Error en GET /api/pos-ventas/venta/[id]:", err);
    // "Error interno" no le dice nada a nadie. Es la deuda que CLAUDE.md tiene
    // anotada —206 rutas contestan eso, y el día que producción se cayó fue lo
    // único que se vio—. Esta es la ruta de la que cuelga la reimpresión: si un
    // ticket no se puede recuperar, quien lo está buscando necesita saber por
    // qué, no que "hubo un error".
    return NextResponse.json(
      { ok: false, error: `No se pudo leer la venta: ${err.message}` },
      { status: 500 }
    );
  }
}

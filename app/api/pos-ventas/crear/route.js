import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

const COMISION_PCT = 7;

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId, session } = scope;

    const body = await req.json();
    const { clienteId, turnoId, formaPago, descuento, items, esFiado, descuentoPorPuntos: descuentoPorPuntosBody, puntosCanje } = body;

    // Validaciones
    if (!formaPago) {
      return NextResponse.json(
        { ok: false, error: "Forma de pago requerida" },
        { status: 400 }
      );
    }

    if (esFiado && !clienteId) {
      return NextResponse.json(
        { ok: false, error: "Venta fiado requiere un cliente seleccionado" },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay items en la venta" },
        { status: 400 }
      );
    }

    // Validar cada item
    for (const item of items) {
      if (!item.productoBaseId || !item.cantidad || item.cantidad <= 0) {
        return NextResponse.json(
          { ok: false, error: `Item invalido: ${item.nombre || "sin nombre"}` },
          { status: 400 }
        );
      }
      if (!item.precio || item.precio <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Precio invalido para: ${item.nombre || "sin nombre"}`,
          },
          { status: 400 }
        );
      }
    }

    // Obtener descuento automático del cliente y sus tags
    let descuentoAplicadoPct = 0;
    if (clienteId) {
      const clienteDesc = await prisma.cliente.findFirst({
        where: { id: clienteId, grupoId, localId },
        select: {
          descuentoPorcentaje: true,
          tags: {
            select: {
              tag: {
                select: { descuentoPorcentaje: true },
              },
            },
          },
        },
      });
      if (clienteDesc) {
        const pctCliente = Number(clienteDesc.descuentoPorcentaje) || 0;
        let pctMaxTag = 0;
        for (const ct of clienteDesc.tags) {
          const pctTag = Number(ct.tag.descuentoPorcentaje) || 0;
          if (pctTag > pctMaxTag) pctMaxTag = pctTag;
        }
        descuentoAplicadoPct = Math.max(pctCliente, pctMaxTag);
      }
    }

    // Calcular totales
    const subtotal = items.reduce(
      (acc, item) => acc + item.precio * item.cantidad,
      0
    );
    const descuentoManual = Number(descuento) || 0;
    const descuentoAutomatico = subtotal * (descuentoAplicadoPct / 100);
    const descuentoPorPuntosVal = Number(descuentoPorPuntosBody) || 0;
    const descuentoTotal = descuentoAutomatico + descuentoManual + descuentoPorPuntosVal;
    const total = subtotal - descuentoTotal; // Lo que paga el cliente (SIN comision)

    if (total <= 0) {
      return NextResponse.json(
        { ok: false, error: "El total debe ser mayor a 0" },
        { status: 400 }
      );
    }

    // Validar límite de crédito si es fiado
    if (esFiado && clienteId) {
      const clienteCC = await prisma.cliente.findFirst({
        where: { id: clienteId, grupoId, localId },
        select: { limiteCredito: true },
      });

      if (clienteCC && clienteCC.limiteCredito != null) {
        const limiteCredito = Number(clienteCC.limiteCredito);

        // Calcular saldo actual: sum(DEBITO) - sum(CREDITO)
        const agg = await prisma.movimientoCuenta.groupBy({
          by: ["direccion"],
          where: { clienteId, localId, grupoId },
          _sum: { monto: true },
        });

        let debitos = 0;
        let creditos = 0;
        for (const row of agg) {
          const val = Number(row._sum.monto || 0);
          if (row.direccion === "DEBITO") debitos = val;
          else if (row.direccion === "CREDITO") creditos = val;
        }
        const saldoActual = debitos - creditos;
        const nuevoTotal = saldoActual + total;

        if (nuevoTotal > limiteCredito) {
          const local = await prisma.local.findFirst({
            where: { id: localId },
            select: { politicaLimiteCredito: true },
          });

          if (local?.politicaLimiteCredito === "BLOQUEAR") {
            return NextResponse.json(
              { ok: false, error: "Límite de crédito excedido." },
              { status: 400 }
            );
          }
        }
      }
    }

    // Comision bancaria: solo para pagos digitales
    const tieneComision = ["mercadopago", "debito", "credito"].includes(formaPago);
    const comisionBancaria = tieneComision ? total * (COMISION_PCT / 100) : 0;
    const netoRecibido = total - comisionBancaria;

    // Obtener precios de costo de cada producto
    const productoBaseIds = items.map((i) => i.productoBaseId);
    const productosBase = await prisma.productoBase.findMany({
      where: { id: { in: productoBaseIds } },
      select: { id: true, precio_costo: true },
    });
    const costosMap = {};
    productosBase.forEach((p) => {
      costosMap[p.id] = Number(p.precio_costo) || 0;
    });

    // Calcular costo total y detalle con ganancia
    let costoTotal = 0;
    const itemsConCosto = items.map((item) => {
      const precioCosto = costosMap[item.productoBaseId] || 0;
      const subtotalItem = item.precio * item.cantidad;
      const costoItem = precioCosto * item.cantidad;
      const ganancia = subtotalItem - costoItem;
      costoTotal += costoItem;
      return { ...item, precioCosto, subtotalItem, ganancia };
    });

    const gananciaBruta = total - costoTotal;
    const gananciaNeta = netoRecibido - costoTotal;

    // Transaccion: crear venta + descontar stock + movimiento CC si fiado
    const venta = await prisma.$transaction(async (tx) => {
      // Obtener proximo numero de venta para este local
      const ultima = await tx.venta.findFirst({
        where: { localId },
        orderBy: { numero: "desc" },
        select: { numero: true },
      });
      const numero = (ultima?.numero || 0) + 1;

      // Crear venta
      const nuevaVenta = await tx.venta.create({
        data: {
          localId,
          vendedorId: session.id,
          clienteId: clienteId || null,
          turnoId: turnoId || null,
          numero,
          subtotal,
          descuento: descuentoTotal,
          total,
          comisionBancaria,
          netoRecibido,
          costoTotal,
          gananciaBruta,
          gananciaNeta,
          formaPago,
          esFiado: !!esFiado,
          detalles: {
            create: itemsConCosto.map((item) => ({
              productoBaseId: item.productoBaseId,
              nombre: item.nombre,
              precio: item.precio,
              precioCosto: item.precioCosto,
              cantidad: item.cantidad,
              subtotal: item.subtotalItem,
              ganancia: item.ganancia,
            })),
          },
        },
      });

      // Descontar stock de cada item
      for (const item of items) {
        const productoLocal = await tx.productoLocal.findFirst({
          where: { localId, baseId: item.productoBaseId },
          select: { id: true },
        });

        if (!productoLocal) continue;

        await tx.stockLocal.updateMany({
          where: {
            localId,
            productoId: productoLocal.id,
          },
          data: {
            cantidad: { decrement: item.cantidad },
          },
        });
      }

      // Si es fiado, crear MovimientoCuenta DEBITO
      if (esFiado && clienteId) {
        try {
          const existente = await tx.movimientoCuenta.findFirst({
            where: { ventaId: nuevaVenta.id },
          });
          if (!existente) {
            await tx.movimientoCuenta.create({
              data: {
                grupoId,
                localId,
                clienteId,
                tipo: "VENTA",
                direccion: "DEBITO",
                monto: total,
                ventaId: nuevaVenta.id,
                nota: `Venta #${numero}`,
              },
            });
          }
        } catch (ccErr) {
          // Si falla por unique constraint u otro error, loguear pero no romper la venta
          console.error("Error creando movimiento CC (venta continúa):", ccErr.message);
        }
      }

      return nuevaVenta;
    });

    // Post-transacción: puntos de fidelidad
    if (clienteId) {
      try {
        const puntosConfig = await prisma.puntosConfigLocal.findFirst({
          where: { localId, activo: true },
        });

        if (puntosConfig) {
          // 1. Acreditar puntos por la compra (idempotente por ventaId+tipo)
          const puntosPorPeso = puntosConfig.reglasJson?.puntosPorPeso || 0;
          const puntosAcreditar = Math.floor(total * puntosPorPeso);

          if (puntosAcreditar > 0) {
            const existeAcreditacion = await prisma.clientePuntoMovimiento.findFirst({
              where: { ventaId: venta.id, tipo: "ACREDITACION" },
            });
            if (!existeAcreditacion) {
              await prisma.clientePuntoMovimiento.create({
                data: {
                  grupoId,
                  localId,
                  clienteId,
                  direccion: "CREDITO",
                  tipo: "ACREDITACION",
                  puntos: puntosAcreditar,
                  ventaId: venta.id,
                  userId: session.id,
                  nota: `Venta #${venta.numero}`,
                },
              });
            }
          }

          // 2. Asociar canje reciente a esta venta (si hubo)
          if (puntosCanje > 0) {
            const canjeReciente = await prisma.clientePuntoMovimiento.findFirst({
              where: {
                clienteId,
                localId,
                tipo: "CANJE",
                ventaId: null,
                createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
              },
              orderBy: { createdAt: "desc" },
            });
            if (canjeReciente) {
              await prisma.clientePuntoMovimiento.update({
                where: { id: canjeReciente.id },
                data: { ventaId: venta.id },
              });
            }
          }
        }
      } catch (puntosErr) {
        console.error("Error procesando puntos (venta continúa):", puntosErr.message);
      }
    }

    return NextResponse.json({
      ok: true,
      ventaId: venta.id,
      numero: venta.numero,
      message: `Venta #${venta.numero} registrada correctamente`,
      breakdown: {
        subtotal,
        descuentoAutomatico,
        descuentoManual,
        descuentoPorPuntos: descuentoPorPuntosVal,
        descuentoTotal,
        total,
      },
    });
  } catch (err) {
    console.error("Error crear venta POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al registrar la venta" },
      { status: 500 }
    );
  }
}

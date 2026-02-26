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
    const { clientTxnId, clientVentaId, clienteId, turnoId, formaPago, descuento, items, esFiado, descuentoPorPuntos: descuentoPorPuntosBody, puntosCanje } = body;

    // clientVentaId es alias de clientTxnId para compatibilidad con cola offline
    const txnId = clientTxnId || clientVentaId;

    // Verificar idempotencia por clientTxnId/clientVentaId
    if (txnId) {
      const ventaExistente = await prisma.venta.findUnique({
        where: { clientTxnId: txnId },
        select: {
          id: true,
          numero: true,
          total: true,
          fecha: true,
          subtotal: true,
          descuento: true,
        },
      });

      if (ventaExistente) {
        // Calcular breakdown desde venta existente
        const descuentoAutomatico = 0; // No lo tenemos guardado, usar 0
        const descuentoManual = Number(ventaExistente.descuento) || 0;
        const descuentoPorPuntosVal = 0; // No lo tenemos guardado, usar 0

        return NextResponse.json({
          ok: true,
          ventaId: ventaExistente.id,
          numero: ventaExistente.numero,
          message: `Venta #${ventaExistente.numero} ya registrada (idempotencia)`,
          isDuplicate: true,
          breakdown: {
            subtotal: Number(ventaExistente.subtotal),
            descuentoAutomatico,
            descuentoManual,
            descuentoPorPuntos: descuentoPorPuntosVal,
            descuentoTotal: Number(ventaExistente.descuento),
            total: Number(ventaExistente.total),
          },
        });
      }
    }

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

    // Validar cada item (cantidad puede ser decimal para KG)
    for (const item of items) {
      const cant = Number(item.cantidad);
      if (!item.productoBaseId || !cant || cant <= 0) {
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
      // Normalizar cantidad a número
      item.cantidad = cant;
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

    // Validar saldo de puntos antes de continuar
    if (clienteId && puntosCanje > 0) {
      const aggPuntos = await prisma.clientePuntoMovimiento.groupBy({
        by: ["direccion"],
        where: { clienteId, localId, grupoId },
        _sum: { puntos: true },
      });

      let creditosPuntos = 0;
      let debitosPuntos = 0;
      for (const row of aggPuntos) {
        const val = Number(row._sum.puntos || 0);
        if (row.direccion === "CREDITO") creditosPuntos = val;
        else if (row.direccion === "DEBITO") debitosPuntos = val;
      }
      const saldoPuntos = creditosPuntos - debitosPuntos;

      if (puntosCanje > saldoPuntos) {
        return NextResponse.json(
          { ok: false, error: "Saldo de puntos insuficiente." },
          { status: 400 }
        );
      }
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
      select: { id: true, precio_costo: true, categoria_id: true },
    });
    const costosMap = {};
    const pbMap = {};
    productosBase.forEach((p) => {
      costosMap[p.id] = Number(p.precio_costo) || 0;
      pbMap[p.id] = { categoria_id: p.categoria_id };
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
      // Lock a nivel de transacción para evitar concurrencia en número de venta
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(localId)})`;

      // Calcular número de venta consultando el último número existente
      const ultimaVenta = await tx.venta.findFirst({
        where: { localId },
        orderBy: { numero: "desc" },
        select: { numero: true },
      });

      const numero = ultimaVenta ? Number(ultimaVenta.numero) + 1 : 1;

      // Actualizar contador para mantener consistencia (opcional, pero útil para consultas rápidas)
      try {
        await tx.posVentaCounter.upsert({
          where: { localId },
          update: { ultimoNumero: numero },
          create: {
            grupoId,
            localId,
            ultimoNumero: numero,
          },
        });
      } catch (err) {
        // Si falla el contador, no es crítico, el número ya está calculado
        console.warn("Error actualizando contador (no crítico):", err);
      }

      // Validar y descontar stock con locks atómicos
      const stockValidations = [];
      for (const item of items) {
        const productoLocal = await tx.productoLocal.findFirst({
          where: { localId, baseId: item.productoBaseId },
          select: { id: true },
        });

        if (!productoLocal) {
          throw new Error(`Producto ${item.nombre || item.productoBaseId} no encontrado en este local`);
        }

        // Lockear stock con FOR UPDATE
        const stockLocked = await tx.$queryRaw`
          SELECT cantidad 
          FROM "StockLocal" 
          WHERE "localId" = ${localId} 
            AND "productoId" = ${productoLocal.id}
          FOR UPDATE
        `;

        const stockActual = stockLocked && Array.isArray(stockLocked) && stockLocked.length > 0 
          ? Number(stockLocked[0].cantidad || 0)
          : 0;
        
        if (stockActual < item.cantidad) {
          throw new Error(
            `Stock insuficiente para ${item.nombre || "producto"}. Disponible: ${stockActual}, Solicitado: ${item.cantidad}`
          );
        }

        // Descontar stock
        await tx.stockLocal.updateMany({
          where: {
            localId,
            productoId: productoLocal.id,
          },
          data: {
            cantidad: { decrement: item.cantidad },
          },
        });

        stockValidations.push({ productoLocalId: productoLocal.id, cantidad: item.cantidad });
      }

      // Crear venta
      const nuevaVenta = await tx.venta.create({
        data: {
          localId,
          vendedorId: session.id,
          clienteId: clienteId || null,
          turnoId: turnoId || null,
          numero,
          clientTxnId: txnId || null,
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
                userId: session?.id || null,
              },
            });
          }
        } catch (ccErr) {
          // Si falla por unique constraint u otro error, loguear pero no romper la venta
          console.error("Error creando movimiento CC (venta continúa):", ccErr.message);
        }
      }

      // Canjear puntos dentro de transacción (si puntosCanje > 0)
      if (clienteId && puntosCanje > 0) {
        // Validar saldo dentro de transacción
        const aggPuntos = await tx.clientePuntoMovimiento.groupBy({
          by: ["direccion"],
          where: { clienteId, localId, grupoId },
          _sum: { puntos: true },
        });

        let creditosPuntos = 0;
        let debitosPuntos = 0;
        for (const row of aggPuntos) {
          const val = Number(row._sum.puntos || 0);
          if (row.direccion === "CREDITO") creditosPuntos = val;
          else if (row.direccion === "DEBITO") debitosPuntos = val;
        }
        const saldoPuntos = creditosPuntos - debitosPuntos;

        if (puntosCanje > saldoPuntos) {
          throw new Error("Saldo de puntos insuficiente durante la transacción");
        }

        // Crear movimiento de canje asociado a la venta
        await tx.clientePuntoMovimiento.create({
          data: {
            grupoId,
            localId,
            clienteId,
            direccion: "DEBITO",
            tipo: "CANJE",
            puntos: puntosCanje,
            ventaId: nuevaVenta.id,
            userId: session.id,
            nota: `Venta #${numero}`,
          },
        });
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

          // Filtrar items excluidos de puntos
          const excl = puntosConfig.exclusionesJson || {};
          const exclCats = new Set(excl.categoriaIds || []);
          const exclProds = new Set(excl.productoBaseIds || []);

          let subtotalElegible = 0;
          for (const item of items) {
            if (exclProds.has(item.productoBaseId)) continue;
            const catId = pbMap[item.productoBaseId]?.categoria_id;
            if (catId != null && exclCats.has(catId)) continue;
            subtotalElegible += item.precio * item.cantidad;
          }

          const puntosAcreditar = Math.floor(subtotalElegible * puntosPorPeso);

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

          // 2. Canje de puntos ya se procesó dentro de la transacción
          // (removido: ya no se asocia canje previo, se crea directamente en transacción)
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
    
    // Manejo de errores específicos
    if (err.message && err.message.includes("Stock insuficiente")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 409 }
      );
    }
    
    if (err.message && err.message.includes("Saldo de puntos")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 409 }
      );
    }
    
    // Error de unique constraint (clientTxnId duplicado o número duplicado)
    if (err.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: "Error de concurrencia. Intenta nuevamente." },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { ok: false, error: "Error interno al registrar la venta" },
      { status: 500 }
    );
  }
}

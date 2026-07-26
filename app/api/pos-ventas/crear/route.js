import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { requireOperadorSalvoDueno, verificarVoucherOperador } from "@/lib/operador";
import { resolverListaCliente } from "@/lib/precios/resolverListaCliente";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { construirLineasComerciales, aplicarConsumoStock } from "@/lib/combos/ventaConsumo";

// Mapea lista.tipoBase a VentaDetalle.tipoPrecioAplicado.
// MANUAL_AUTORIZADO y casos desconocidos caen a PRECIO_VENTA (fallback).
function mapTipoPrecioAplicado(lista) {
  if (!lista) return "PRECIO_VENTA";
  if (lista.tipoBase === "PRECIO_VENTA") return "PRECIO_VENTA";
  if (lista.tipoBase === "COSTO") {
    const margen = Number(lista.margenPorcentaje);
    if (!Number.isFinite(margen) || margen === 0) return "COSTO_PURO";
    return "COSTO_MAS_MARGEN";
  }
  // MANUAL_AUTORIZADO o cualquier otro caso: fallback
  return "PRECIO_VENTA";
}

export async function POST(req) {
  try {
    const perm = requirePerm(req, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId, session } = scope;

    const body = await req.json();
    const { clientTxnId, clientVentaId, clienteId, turnoId, formaPago, descuento, items, esFiado, descuentoPorPuntos: descuentoPorPuntosBody, puntosCanje, origenOffline, operadorVoucher } = body;

    // Resolver operador de la venta.
    // - Venta online: se exige operador activo salvo dueño (permiso "*").
    // - Replay de cola offline (origenOffline): la venta YA se cobró con un
    //   operador identificado en su momento. NUNCA se rechaza por operario
    //   vencido. La atribución NO se toma de un id crudo del cliente (sería
    //   falsificable: el mismo agujero por otra puerta) sino de un VOUCHER
    //   firmado por el server al identificarse el operador. Sin voucher válido
    //   (ítems legacy, o venta genuinamente sin operador) se persiste con null
    //   antes que perder una venta cobrada — queda logueado para auditoría.
    let operadorId = null;
    if (origenOffline === true) {
      operadorId = verificarVoucherOperador(operadorVoucher, localId);
      if (!operadorId) {
        console.warn(
          "[pos-ventas/crear] replay offline sin operador verificable (voucher ausente/inválido) — se graba con operador null. localId=%s clientTxnId=%s",
          localId,
          clientTxnId || clientVentaId || "?"
        );
      }
    } else {
      const gateOp = requireOperadorSalvoDueno(req, session);
      if (!gateOp.ok) {
        return NextResponse.json(
          { ok: false, error: gateOp.error, needsOperador: true },
          { status: gateOp.status }
        );
      }
      operadorId = gateOp.operadorId;
    }

    // Validar turnoId obligatorio
    if (!turnoId) {
      return NextResponse.json(
        { ok: false, error: "Debe haber un turno abierto" },
        { status: 400 }
      );
    }

    // Validar que el turno existe, pertenece al local, al vendedor, y está abierto
    const turnoValido = await prisma.turno.findFirst({
      where: {
        id: turnoId,
        localId,
        vendedorId: session.id,
        cierre: null,
      },
      select: { id: true, apertura: true },
    });

    if (!turnoValido) {
      return NextResponse.json(
        { ok: false, error: "Turno inválido, cerrado, o no pertenece a este usuario/local" },
        { status: 403 }
      );
    }

    // Bloquear si el turno fue abierto un día anterior (calendario AR).
    // El cajero debe cerrar caja antes de seguir vendiendo.
    const diaAperturaAR = fechaArgentinaISO(turnoValido.apertura);
    const hoyAR = hoyArgentinaISO();
    if (diaAperturaAR && diaAperturaAR !== hoyAR) {
      return NextResponse.json(
        {
          ok: false,
          error: "Caja abierta de un día anterior. Cerrá caja antes de vender.",
        },
        { status: 403 }
      );
    }

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

    // Gate "cliente obligatorio" según contexto + config del grupo.
    // Se evalúa antes de la regla de fiado para mensaje más específico.
    if (!clienteId) {
      const [localCtx, configGrupo] = await Promise.all([
        prisma.local.findUnique({ where: { id: localId }, select: { es_deposito: true } }),
        prisma.configuracionGrupo.findUnique({
          where: { grupoId },
          select: { exigirClienteVentasDeposito: true, exigirClienteVentasLocal: true },
        }),
      ]);
      const esDeposito = localCtx?.es_deposito === true;
      const exigir = esDeposito
        ? configGrupo?.exigirClienteVentasDeposito === true
        : configGrupo?.exigirClienteVentasLocal === true;
      if (exigir) {
        return NextResponse.json(
          {
            ok: false,
            error: esDeposito
              ? "Este depósito exige cliente para cerrar la venta."
              : "Este local exige cliente para cerrar la venta.",
          },
          { status: 400 }
        );
      }
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

    // Resolver lista según UBICACIÓN (server-authoritative), pasando localId.
    //  - Fallback COMERCIAL legítimo → lista = null (trazabilidad sin lista; precio normal).
    //  - Error de CONTEXTO (cross-group / local inválido / params) → NO se oculta: se
    //    rechaza el request con su status. Un local cross-group NO vende por fallback.
    let listaResuelta = null;
    try {
      const resolucion = await resolverListaCliente({ clienteId, grupoId, localId, prisma });
      listaResuelta = resolucion.lista;
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e.message },
        { status: e.status || 400 }
      );
    }

    // Guarda server-side: la ÚNICA lista válida es la resuelta por el server (cliente +
    // ubicación). Si un item declara otra lista (stale entre buscar y crear, desactivada,
    // de otro grupo o manipulada), se rechaza: no se cobra/registra con una lista inválida.
    const listaResueltaId = listaResuelta?.id ?? null;
    for (const item of items) {
      const itemListaId = Number.isInteger(item?.listaPrecioId) ? item.listaPrecioId : null;
      if (itemListaId !== null && itemListaId !== listaResueltaId) {
        return NextResponse.json(
          { ok: false, error: "La lista de precios cambió. Refrescá el POS y volvé a intentar." },
          { status: 409 }
        );
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

    // Comision bancaria: solo para pagos digitales, con tasas configurables por grupo
    const tieneComision = ["mercadopago", "debito", "credito"].includes(formaPago);
    let comisionPct = 7; // default
    if (tieneComision) {
      const comisionConfig = await prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { comisionDebito: true, comisionCredito: true, comisionMercadopago: true },
      });
      if (comisionConfig) {
        const mapaCom = {
          debito: Number(comisionConfig.comisionDebito ?? 7),
          credito: Number(comisionConfig.comisionCredito ?? 7),
          mercadopago: Number(comisionConfig.comisionMercadopago ?? 7),
        };
        comisionPct = mapaCom[formaPago] ?? 7;
      }
    }
    const comisionBancaria = tieneComision ? total * (comisionPct / 100) : 0;
    const netoRecibido = total - comisionBancaria;

    // Obtener precios de costo y datos para conversión piezas→kg (depósito PIEZA)
    const productoBaseIds = items.map((i) => i.productoBaseId);
    const productosBase = await prisma.productoBase.findMany({
      where: { id: { in: productoBaseIds } },
      select: { id: true, precio_costo: true, factor_pack: true, categoria_id: true, modoVentaDeposito: true, pesoReferenciaKg: true, modo_envio: true, unidad_medida: true, es_combo: true },
    });
    const localInfo = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });
    const esDeposito = localInfo?.es_deposito === true;
    const costosMap = {};
    const pbMap = {};
    const baseStockMap = {};
    const productosBaseMap = {}; // { es_combo } por productoBaseId (server-authoritative)
    productosBase.forEach((p) => {
      const costoBulto = Number(p.precio_costo) || 0;
      const factorPack = Math.max(1, Number(p.factor_pack) || 1);
      costosMap[p.id] = { costoBulto, factorPack };
      pbMap[p.id] = { categoria_id: p.categoria_id };
      productosBaseMap[p.id] = { es_combo: p.es_combo === true };
      baseStockMap[p.id] = {
        modoVentaDeposito: p.modoVentaDeposito || "PESO",
        pesoReferenciaKg: Number(p.pesoReferenciaKg || 0),
        factorPack,
        modo_envio: p.modo_envio || null,
        unidad_medida: p.unidad_medida || "unidad",
      };
    });

    // El costo total, la ganancia y el descuento consolidado de stock se calculan
    // DENTRO de la transacción (más abajo), porque los combos requieren cargar su
    // composición desde la base para consolidar el consumo físico de componentes.

    // Leer config de stock negativo desde DB
    const configGrupo = await prisma.configuracionGrupo.findUnique({
      where: { grupoId },
      select: { allowNegativeStock: true },
    });
    const ALLOW_NEGATIVE_STOCK = configGrupo?.allowNegativeStock === true;

    // Transaccion: crear venta + descontar stock + movimiento CC si fiado
    const txResult = await prisma.$transaction(async (tx) => {
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

      // === Líneas comerciales + plan consolidado de consumo físico ===
      // Los combos se resuelven y validan contra la base DENTRO de la tx (no se
      // confía en componentes/costos/disponibilidad del cliente). El plan agrupa por
      // ProductoLocal.id: un producto vendido suelto y como componente de uno o más
      // combos se descuenta UNA sola vez con el total consolidado.
      const { lineasComerciales, consumoFisicoConsolidado } = await construirLineasComerciales(tx, {
        items,
        productosBaseMap,
        costosMap,
        baseStockMap,
        localId,
        esDeposito,
      });

      // Costo y ganancia totales desde las líneas (combos: costo desde componentes).
      let costoTotal = 0;
      for (const l of lineasComerciales) costoTotal += l.costoLinea;
      costoTotal = Math.round((costoTotal + Number.EPSILON) * 100) / 100;
      const gananciaBruta = total - costoTotal;
      const gananciaNeta = netoRecibido - costoTotal;

      // Bloqueo determinístico (FOR UPDATE por productoLocalId asc) + validación +
      // descuento consolidado. Insuficiencia respeta ALLOW_NEGATIVE_STOCK; la
      // invalidez ESTRUCTURAL del combo ya abortó antes (en construirLineasComerciales).
      const { allowNegativeStockUsed } = await aplicarConsumoStock(tx, {
        localId,
        consumoFisicoConsolidado,
        allowNegativeStock: ALLOW_NEGATIVE_STOCK,
      });

      // Crear venta (header)
      const nuevaVenta = await tx.venta.create({
        data: {
          localId,
          vendedorId: session.id,
          operadorId,
          clienteId: clienteId || null,
          turnoId,
          numero,
          clientTxnId: txnId || null,
          listaPrecioId: listaResuelta?.id ?? null,
          subtotal,
          descuento: descuentoTotal,
          descuentoAutomatico: descuentoAutomatico || null,
          descuentoManual: descuentoManual || null,
          descuentoPorPuntos: descuentoPorPuntosVal || null,
          total,
          comisionBancaria,
          comisionPct: tieneComision ? comisionPct : null,
          netoRecibido,
          costoTotal,
          gananciaBruta,
          gananciaNeta,
          formaPago,
          esFiado: !!esFiado,
        },
      });

      // VentaDetalle por LÍNEA COMERCIAL (el combo es UNA línea, no una por
      // componente). Para combos se congela el consumo en VentaDetalleComponente.
      for (const l of lineasComerciales) {
        const lineaSubtotal = l.subtotal;
        const shareLinea = total > 0 ? lineaSubtotal / total : 0;
        const comisionLinea = comisionBancaria * shareLinea;
        const esComboLinea = l.tipo === "COMBO";
        // Combos: precio manual, sin lista. Normales: la lista resuelta por el server.
        const itemListaValida = esComboLinea ? null : listaResuelta;

        const detalle = await tx.ventaDetalle.create({
          data: {
            ventaId: nuevaVenta.id,
            productoBaseId: l.productoBaseId,
            nombre: l.nombre,
            precio: l.precio,
            precioCosto: l.costoUnitario, // combo: costo unitario TOTAL del combo
            cantidad: l.cantidad,
            subtotal: lineaSubtotal,
            ganancia: Math.round((lineaSubtotal - l.costoLinea + Number.EPSILON) * 100) / 100,
            comisionLinea: comisionLinea > 0 ? Number(comisionLinea.toFixed(2)) : null,
            listaPrecioId: itemListaValida?.id ?? null,
            tipoPrecioAplicado: mapTipoPrecioAplicado(itemListaValida),
            margenAplicado:
              itemListaValida && itemListaValida.tipoBase === "COSTO"
                ? itemListaValida.margenPorcentaje
                : null,
          },
        });

        if (esComboLinea && l.componentesCongelables?.length) {
          await tx.ventaDetalleComponente.createMany({
            data: l.componentesCongelables.map((c) => ({
              ventaDetalleId: detalle.id,
              productoBaseId: c.productoBaseId,
              productoLocalId: c.productoLocalId,
              cantidad: c.cantidad, // cantidad por combo × combos vendidos
              precioCosto: c.costoUnitario,
            })),
          });
        }
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

      return { venta: nuevaVenta, allowNegativeStockUsed };
    });

    const venta = txResult.venta;
    const allowNegativeStockUsed = txResult.allowNegativeStockUsed === true;

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
      allowNegativeStockUsed: allowNegativeStockUsed || undefined,
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
    
    // Combo estructuralmente inválido (componente inactivo/inexistente/combo/
    // cantidad inválida/composición vacía): bloquea la venta SIEMPRE, incluso con
    // allowNegativeStock.
    if (err.esErrorVentaCombo) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status || 400 }
      );
    }

    // Stock insuficiente: incluir el producto/componente limitante para el cajero.
    if ((err.message && err.message.includes("Stock insuficiente")) || err.limitante) {
      return NextResponse.json(
        { ok: false, error: err.message, limitante: err.limitante || undefined },
        { status: err.status || 409 }
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

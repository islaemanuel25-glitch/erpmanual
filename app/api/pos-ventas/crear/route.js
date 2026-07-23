import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { requireOperadorSalvoDueno, verificarVoucherOperador } from "@/lib/operador";
import { resolverListaCliente } from "@/lib/precios/resolverListaCliente";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { defaultModoEnvio } from "@/lib/conversiones/stock";

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

    // Resolver lista de precios aplicable para trazabilidad (server-authoritative).
    // Fallback silencioso si no se puede resolver — NO bloquea la venta.
    let listaResuelta = null;
    try {
      listaResuelta = await resolverListaCliente({ clienteId, grupoId, prisma });
    } catch (e) {
      console.warn(
        `[pos-ventas/crear] No se pudo resolver lista (grupoId=${grupoId}, clienteId=${clienteId}):`,
        e.message
      );
      listaResuelta = null;
    }

    // Validar listaPrecioId que viene de cada item: debe pertenecer al grupoId.
    // Si no pertenece o no existe, se descarta y queda null.
    const idsListasPorValidar = new Set();
    for (const item of items) {
      const itemListaId = Number.isInteger(item?.listaPrecioId) ? item.listaPrecioId : null;
      if (itemListaId && (!listaResuelta || listaResuelta.id !== itemListaId)) {
        idsListasPorValidar.add(itemListaId);
      }
    }
    let listasValidadasPorGrupo = new Map();
    if (idsListasPorValidar.size > 0) {
      const listas = await prisma.listaPrecio.findMany({
        where: { id: { in: Array.from(idsListasPorValidar) }, grupoId },
        select: { id: true, tipoBase: true, margenPorcentaje: true },
      });
      for (const lp of listas) {
        listasValidadasPorGrupo.set(lp.id, {
          id: lp.id,
          tipoBase: lp.tipoBase,
          margenPorcentaje: lp.margenPorcentaje,
        });
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
      select: { id: true, precio_costo: true, factor_pack: true, categoria_id: true, modoVentaDeposito: true, pesoReferenciaKg: true, modo_envio: true, unidad_medida: true },
    });
    const localInfo = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });
    const esDeposito = localInfo?.es_deposito === true;
    const costosMap = {};
    const pbMap = {};
    const baseStockMap = {};
    productosBase.forEach((p) => {
      const costoBulto = Number(p.precio_costo) || 0;
      const factorPack = Math.max(1, Number(p.factor_pack) || 1);
      costosMap[p.id] = { costoBulto, factorPack };
      pbMap[p.id] = { categoria_id: p.categoria_id };
      baseStockMap[p.id] = {
        modoVentaDeposito: p.modoVentaDeposito || "PESO",
        pesoReferenciaKg: Number(p.pesoReferenciaKg || 0),
        factorPack,
        modo_envio: p.modo_envio || null,
        unidad_medida: p.unidad_medida || "unidad",
      };
    });

    // Calcular costo total y detalle con ganancia.
    //
    // Fuente de verdad: item.precioCosto (lo manda el POS desde buscar-producto,
    // ya en la MISMA escala que item.precio — unitario, bulto o pieza según el
    // modo de salida). Esto evita el bug de calcular costo unitario dividiendo
    // costoBulto/factorPack cuando la línea se vendió como bulto (factor_pack
    // x ganancia falsa). Fallback al cálculo legacy si el item no trae costo
    // (cola offline pre-fix o clientes viejos).
    let costoTotal = 0;
    const itemsConCosto = items.map((item) => {
      const { costoBulto, factorPack } = costosMap[item.productoBaseId] || { costoBulto: 0, factorPack: 1 };
      const costoFromClient = Number(item.precioCosto);
      const costoUnitarioDeLinea =
        Number.isFinite(costoFromClient) && costoFromClient >= 0
          ? costoFromClient
          : costoBulto / factorPack;
      const subtotalItem = item.precio * item.cantidad;
      const costoItem = costoUnitarioDeLinea * item.cantidad;
      const ganancia = subtotalItem - costoItem;
      costoTotal += costoItem;
      return { ...item, precioCosto: costoUnitarioDeLinea, subtotalItem, ganancia };
    });

    const gananciaBruta = total - costoTotal;
    const gananciaNeta = netoRecibido - costoTotal;

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

      // Validar y descontar stock con locks atómicos
      const stockValidations = [];
      let allowNegativeStockUsed = false;
      for (const item of items) {
        const productoLocal = await tx.productoLocal.findFirst({
          where: { localId, baseId: item.productoBaseId },
          select: { id: true },
        });

        if (!productoLocal) {
          throw new Error(`Producto ${item.nombre || item.productoBaseId} no encontrado en este local`);
        }

        // Convertir cantidad del carrito a la escala de StockLocal.
        // StockLocal SIEMPRE en UNIDADES en depósito (excepto PIEZA fiambre que va en KG).
        // El POS envía cantidad en la unidad de venta efectiva (BULTO, UNIDAD o PIEZA).
        const baseStock = baseStockMap[item.productoBaseId] || {};
        const factorPackItem = Math.max(1, Number(baseStock.factorPack) || 1);
        const vendePorPieza = esDeposito && baseStock.modoVentaDeposito === "PIEZA" && baseStock.pesoReferenciaKg > 0;

        let cantidadParaStock;
        if (vendePorPieza) {
          // PIEZA fiambre fijo: el stock operativo del depósito está en PIEZAS.
          // Se descuenta la cantidad en piezas tal cual (sin multiplicar por pesoReferenciaKg).
          cantidadParaStock = Number(item.cantidad);
        } else if (esDeposito && factorPackItem > 1) {
          // Depósito con pack. El factorPack y el stock se validan SIEMPRE contra DB
          // (factorPackItem viene de baseStockMap, no del cliente).
          if (item.modoVentaLinea === "UNIDAD_REMANENTE") {
            // Remanente/excepción: vender unidades sueltas sin tocar la config del
            // producto. item.cantidad ya está expresada en unidades reales → no se
            // multiplica por el pack. La validación de stock disponible (más abajo)
            // garantiza que no se vendan más unidades de las que hay.
            cantidadParaStock = Number(item.cantidad);
          } else {
            // NORMAL: replicar la lógica de calcularModoSalida() de buscar-producto.
            // SOLO_UNIDAD → vende por unidad; SOLO_BULTO / MIXTO / null → vende por bulto.
            const modoEnvioEfectivo = baseStock.modo_envio || defaultModoEnvio(baseStock.unidad_medida);
            const modoSalida = modoEnvioEfectivo === "SOLO_UNIDAD" ? "UNIDAD" : "BULTO";
            cantidadParaStock = modoSalida === "BULTO"
              ? Number(item.cantidad) * factorPackItem
              : Number(item.cantidad);
          }
        } else {
          // Local normal, o producto sin factor_pack: cantidad directa.
          cantidadParaStock = Number(item.cantidad);
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
        
        if (stockActual < cantidadParaStock) {
          if (!ALLOW_NEGATIVE_STOCK) {
            throw new Error(
              `Stock insuficiente para ${item.nombre || "producto"}. Disponible: ${stockActual}, Solicitado: ${cantidadParaStock}`
            );
          }
          allowNegativeStockUsed = true;
          console.log(
            "[POS venta con stock negativo] productoBaseId=%s productoLocalId=%s localId=%s cantidad=%s stockActual=%s",
            item.productoBaseId,
            productoLocal.id,
            localId,
            cantidadParaStock,
            stockActual
          );
        }

        // Descontar stock (permite negativo si ALLOW_NEGATIVE_STOCK=1). VentaDetalle sigue con item.cantidad (piezas o kg según corresponda).
        await tx.stockLocal.updateMany({
          where: {
            localId,
            productoId: productoLocal.id,
          },
          data: {
            cantidad: { decrement: cantidadParaStock },
          },
        });

        stockValidations.push({ productoLocalId: productoLocal.id, cantidad: cantidadParaStock });
      }

      // Crear venta
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
          detalles: {
            create: itemsConCosto.map((item) => {
              const lineaSubtotal = item.subtotalItem;
              const shareLinea = total > 0 ? lineaSubtotal / total : 0;
              const comisionLinea = comisionBancaria * shareLinea;

              // Resolver lista para este item (trazabilidad por línea):
              // 1) Si el item trae listaPrecioId y coincide con listaResuelta → usarla
              // 2) Si trae listaPrecioId distinta, validada contra el grupo → usarla
              // 3) Si el item no trae listaPrecioId pero hay listaResuelta → usar listaResuelta
              // 4) Sino → null
              const itemListaId = Number.isInteger(item?.listaPrecioId) ? item.listaPrecioId : null;
              let itemListaValida = null;
              if (itemListaId) {
                if (listaResuelta && listaResuelta.id === itemListaId) {
                  itemListaValida = listaResuelta;
                } else if (listasValidadasPorGrupo.has(itemListaId)) {
                  itemListaValida = listasValidadasPorGrupo.get(itemListaId);
                }
              }
              if (!itemListaValida && listaResuelta) {
                itemListaValida = listaResuelta;
              }

              return {
                productoBaseId: item.productoBaseId,
                nombre: item.nombre,
                precio: item.precio,
                precioCosto: item.precioCosto,
                cantidad: item.cantidad,
                subtotal: item.subtotalItem,
                ganancia: item.ganancia,
                comisionLinea: comisionLinea > 0 ? Number(comisionLinea.toFixed(2)) : null,
                listaPrecioId: itemListaValida?.id ?? null,
                tipoPrecioAplicado: mapTipoPrecioAplicado(itemListaValida),
                margenAplicado:
                  itemListaValida && itemListaValida.tipoBase === "COSTO"
                    ? itemListaValida.margenPorcentaje
                    : null,
              };
            }),
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

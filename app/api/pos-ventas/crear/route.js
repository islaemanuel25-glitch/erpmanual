import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm, checkPerm } from "@/lib/authorize";
import {
  esSinVinculo,
  respuestaVinculoInvalido,
  construirSnapshots,
  idsParaSnapshots,
  bloqueoReintentoHuerfana,
  resolverVentaInterna,
  confirmarVinculoTransaccional,
} from "@/lib/ventas-internas/integracionVenta";
import { mapearVentaATransferencia } from "@/lib/ventas-internas/mapearVentaATransferencia";
import { crearTransferencia } from "@/lib/transferencias/crearTransferencia";
import { SOLO_TRANSITO } from "@/lib/transferencias/politicasStock";
import { requireOperadorSegunConfig, verificarVoucherOperador } from "@/lib/operador";
import { normalizarYConsolidarPagos, aplicarComisiones, derivarCamposVenta } from "@/lib/pos-ventas/pagos";
import {
  esModalidadServicio,
  validarImporteServicio,
  resolverRecargoServicioPct,
  calcularServicio,
  sumarTotalServicios,
  validarCoberturaEfectivo,
} from "@/lib/pos-ventas/servicios";
import { resolverListaCliente } from "@/lib/precios/resolverListaCliente";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { construirLineasComerciales, aplicarConsumoStock } from "@/lib/combos/ventaConsumo";
import { getConfigLocalEfectiva } from "@/lib/config/local";

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
    const { clientTxnId, clientVentaId, clienteId, turnoId, formaPago, descuento, items, descuentoPorPuntos: descuentoPorPuntosBody, puntosCanje, origenOffline, operadorVoucher } = body;

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
      const gateOp = await requireOperadorSegunConfig(req, session, { localId });
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
          // Venta interna: el reintento no puede devolver "ok, duplicada" si la
          // transferencia falta. Ver bloqueoReintentoHuerfana.
          cliente: { select: { localVinculadoId: true } },
          transferencia: { select: { id: true } },
          detalles: { select: { cantidadStock: true } },
        },
      });

      if (ventaExistente) {
        // Segunda barrera de idempotencia: Transferencia.ventaId @unique. Si la
        // venta interna ya tiene su transferencia, este reintento no crea nada.
        const huerfana = bloqueoReintentoHuerfana({
          esInterna: ventaExistente.cliente?.localVinculadoId != null,
          tieneFisico: ventaExistente.detalles.some((d) => d.cantidadStock != null),
          tieneTransferencia: ventaExistente.transferencia != null,
        });
        if (huerfana) {
          return NextResponse.json(
            { ok: false, error: huerfana.error, code: huerfana.code },
            { status: huerfana.status }
          );
        }

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
      const localCtx = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });
      const esDeposito = localCtx?.es_deposito === true;
      // Config EFECTIVA por local (config_local.pos), con herencia al grupo.
      const { exigirClienteVenta: exigir } = await getConfigLocalEfectiva(localId, grupoId, {
        esDeposito,
      });
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

    // (La regla "fiado requiere cliente" se valida más abajo con el esFiado DERIVADO
    // de los tenders, server-authoritative — no se confía en body.esFiado.)

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay items en la venta" },
        { status: 400 }
      );
    }

    // === Clasificación de MODALIDAD server-authoritative (servicios de importe
    // variable). El backend decide por sí mismo qué producto es servicio (no confía
    // en flags del cliente) y RECALCULA el importe/recargo/precio/costo/ganancia.
    const baseIdsModalidad = [...new Set(items.map((i) => i.productoBaseId).filter(Boolean))];
    const basesModalidad = await prisma.productoBase.findMany({
      where: { id: { in: baseIdsModalidad } },
      select: { id: true, modalidad: true, recargoServicioDefaultPct: true },
    });
    const modalidadMap = new Map(basesModalidad.map((b) => [b.id, b]));
    const localesRecargo = await prisma.productoLocal.findMany({
      where: { localId, baseId: { in: baseIdsModalidad } },
      select: { baseId: true, recargoServicioPct: true },
    });
    const recargoLocalMap = new Map(localesRecargo.map((pl) => [pl.baseId, pl.recargoServicioPct]));

    // Validar cada item (cantidad puede ser decimal para KG en normales; fija=1 en servicios)
    for (const item of items) {
      if (!item.productoBaseId) {
        return NextResponse.json(
          { ok: false, error: `Item invalido: ${item.nombre || "sin nombre"}` },
          { status: 400 }
        );
      }
      const base = modalidadMap.get(item.productoBaseId);
      const esServicio = esModalidadServicio(base?.modalidad);

      if (esServicio) {
        // SERVICIO: importe ingresado por el cajero; TODO lo demás server-side.
        const val = validarImporteServicio(item.importeBaseServicio);
        if (!val.valido) {
          return NextResponse.json(
            { ok: false, error: `${item.nombre || "Servicio"}: ${val.error}` },
            { status: 400 }
          );
        }
        // Cantidad fija = 1. Cualquier otra cantidad se rechaza (no multiplicar importe).
        const cantRaw = item.cantidad == null ? 1 : Number(item.cantidad);
        if (cantRaw !== 1) {
          return NextResponse.json(
            { ok: false, error: `Un servicio se vende de a uno (cantidad = 1): ${item.nombre || "Servicio"}` },
            { status: 400 }
          );
        }
        const recargoPct = resolverRecargoServicioPct(
          recargoLocalMap.get(item.productoBaseId),
          base?.recargoServicioDefaultPct
        );
        const calc = calcularServicio(val.importe, recargoPct);
        // Overwrite server-authoritative: se ignora cualquier precio/costo/pct del cliente.
        item.precio = calc.precioFinal;
        item.cantidad = 1;
        item.precioCosto = calc.precioCosto;
        item.esServicio = true;
        item.__servicio = {
          esServicio: true,
          importeBaseServicio: calc.importeBase,
          recargoServicioPct: calc.recargoPct,
          recargoServicioImporte: calc.recargoImporte,
          precioFinal: calc.precioFinal,
          precioCosto: calc.precioCosto,
          ganancia: calc.ganancia,
        };
      } else {
        // NORMAL: rechazar si viene con importe de servicio (producto normal como servicio).
        if (item.importeBaseServicio != null) {
          return NextResponse.json(
            { ok: false, error: `El producto "${item.nombre || item.productoBaseId}" no es un servicio de importe variable.` },
            { status: 400 }
          );
        }
        const cant = Number(item.cantidad);
        if (!cant || cant <= 0) {
          return NextResponse.json(
            { ok: false, error: `Item invalido: ${item.nombre || "sin nombre"}` },
            { status: 400 }
          );
        }
        if (!item.precio || item.precio <= 0) {
          return NextResponse.json(
            { ok: false, error: `Precio invalido para: ${item.nombre || "sin nombre"}` },
            { status: 400 }
          );
        }
        item.cantidad = cant;
        item.esServicio = false;
      }
    }

    // Total de servicios (server-authoritative). Se ignora cualquier total de
    // servicios enviado por el frontend.
    const subtotalServicios = sumarTotalServicios(items);

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
    // Base ELEGIBLE para descuentos/puntos = mercadería (subtotal SIN servicios).
    // Los servicios de importe variable no reciben descuentos/promos/puntos y su
    // importe no puede reducirse indirectamente por un descuento global.
    const baseElegibleDescuento = Math.round((subtotal - subtotalServicios + Number.EPSILON) * 100) / 100;
    const descuentoManual = Number(descuento) || 0;
    const descuentoAutomatico = baseElegibleDescuento * (descuentoAplicadoPct / 100);
    const descuentoPorPuntosVal = Number(descuentoPorPuntosBody) || 0;
    const descuentoTotal = descuentoAutomatico + descuentoManual + descuentoPorPuntosVal;

    // Ningún descuento (manual/automático/puntos) puede exceder la mercadería elegible:
    // eso equivaldría a descontar sobre servicios. Se rechaza explícitamente.
    if (Math.round(descuentoTotal * 100) > Math.round(baseElegibleDescuento * 100) + 1) {
      return NextResponse.json(
        {
          ok: false,
          error: "Los descuentos no pueden aplicarse sobre servicios de importe variable.",
        },
        { status: 400 }
      );
    }

    const total = subtotal - descuentoTotal; // Lo que paga el cliente (SIN comision)

    if (total <= 0) {
      return NextResponse.json(
        { ok: false, error: "El total debe ser mayor a 0" },
        { status: 400 }
      );
    }

    // === PAGOS (pago dividido) ==========================================
    // Fuente: body.pagos[] (clientes nuevos) o compat legacy formaPago → 1 tender
    // por el total. Se recalcula TODO server-side: se valida Σ==total (exacto),
    // medios válidos, montos>0, FIADO único; y se derivan comisión/neto y los
    // campos legacy de Venta. NO se confía en comisión/neto/pct del cliente.
    const pagosRaw =
      Array.isArray(body.pagos) && body.pagos.length > 0
        ? body.pagos
        : formaPago
        ? [{ medio: formaPago, monto: total }]
        : [];

    const consolidado = normalizarYConsolidarPagos(pagosRaw, total);
    if (consolidado.error) {
      return NextResponse.json({ ok: false, error: consolidado.error }, { status: 400 });
    }

    // % de comisión por medio digital, resueltos de la config del grupo (no hardcode).
    let comisionPctPorMedio = {};
    if (consolidado.pagos.some((p) => ["MERCADOPAGO", "DEBITO", "CREDITO"].includes(p.medio))) {
      const comCfg = await prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { comisionDebito: true, comisionCredito: true, comisionMercadopago: true },
      });
      comisionPctPorMedio = {
        DEBITO: Number(comCfg?.comisionDebito ?? 7),
        CREDITO: Number(comCfg?.comisionCredito ?? 7),
        MERCADOPAGO: Number(comCfg?.comisionMercadopago ?? 7),
      };
    }

    const pagosConComision = aplicarComisiones(consolidado.pagos, comisionPctPorMedio);
    const derivado = derivarCamposVenta(pagosConComision);
    const esFiadoVenta = derivado.esFiado; // server-authoritative (deriva de los tenders)

    // === REGLAS DE SERVICIOS sobre el cobro ============================
    if (subtotalServicios > 0) {
      // Ninguna parte de un servicio puede quedar fiada (v1: FIADO es tender único
      // por el total → una venta con servicio no puede llevar FIADO).
      if (esFiadoVenta) {
        return NextResponse.json(
          { ok: false, error: "No se puede fiar una venta que contiene servicios de importe variable." },
          { status: 400 }
        );
      }
      // El total de los servicios debe quedar cubierto ÍNTEGRAMENTE en efectivo.
      const cobertura = validarCoberturaEfectivo(subtotalServicios, consolidado.pagos);
      if (!cobertura.valido) {
        return NextResponse.json(
          {
            ok: false,
            error: `Esta venta contiene servicios. Debe abonarse al menos $${cobertura.minEfectivo.toFixed(2)} en efectivo.`,
            minEfectivoServicios: cobertura.minEfectivo,
          },
          { status: 400 }
        );
      }
    }

    // FIADO exige cliente (regla derivada del tender, no del body).
    if (esFiadoVenta && !clienteId) {
      return NextResponse.json(
        { ok: false, error: "Venta fiado requiere un cliente seleccionado" },
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
    if (esFiadoVenta && clienteId) {
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

    // Comisión y neto: DERIVADOS de los tenders (suma por venta). Congelados por
    // tender en VentaPago; en Venta quedan como agregados legacy/compat.
    const comisionBancaria = derivado.comisionBancaria;
    const netoRecibido = derivado.netoRecibido;
    const comisionPctVenta = derivado.comisionPct; // pct del único tender, o null si mixto
    const formaPagoVenta = derivado.formaPago; // medio si 1 tender, "mixto" si ≥2

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

    // === VENTA INTERNA: ¿esta venta despacha mercadería a un local propio? ===
    //
    // El destino sale EXCLUSIVAMENTE de Cliente.localVinculadoId. Nunca del nombre
    // del cliente, su dirección, su código ni de Cliente.localId (que es el local
    // PROPIETARIO de la ficha, otra cosa).
    //
    // El scope de esta consulta es el GRUPO, no el local: las demás consultas de
    // cliente de esta ruta filtran además por localId (dueño de la ficha), pero
    // usar ese filtro acá haría que un cliente interno de otra ficha se leyera como
    // "sin cliente" y la venta degradara en silencio a común — justo lo que hay que
    // evitar, porque generaría deuda sin transferencia.
    //
    // Sin clienteId no se consulta nada: es una venta común y no cuesta una query.
    //
    // Esta resolución NO es la fuente de verdad: sirve para fallar temprano y
    // evitar trabajo inútil. La decisión definitiva se vuelve a tomar DENTRO de la
    // transacción, con `tx`, justo antes de crear la transferencia.
    //
    // El permiso se evalúa contra la sesión ya resuelta (checkPerm), no contra la
    // base: depende del usuario logueado, no de una fila mutable de Cliente o
    // Local, así que no puede cambiar por debajo durante la venta y no hace falta
    // releerlo dentro de la transacción.
    const permTransferencias = checkPerm(session, "transferencias.crear").ok === true;
    const argsVinculo = {
      clienteId,
      grupoId,
      localOrigenId: localId,
      esDeposito,
      tienePermisoCrearTransferencia: permTransferencias,
    };

    const previo = await resolverVentaInterna(prisma, argsVinculo);
    let ventaInterna = null;
    if (previo.activa) {
      ventaInterna = { destinoId: previo.destinoId, destinoNombre: previo.destinoNombre };
    } else if (!esSinVinculo(previo.codigo)) {
      // Vínculo declarado pero estructuralmente inválido: se RECHAZA la venta
      // entera. Degradar a venta común dejaría deuda sin mercadería en viaje.
      const rechazo = respuestaVinculoInvalido(previo.codigo, {
        nombreLocal: previo.destinoNombre,
      });
      return NextResponse.json(
        { ok: false, error: rechazo.error, code: rechazo.code },
        { status: rechazo.status }
      );
    }

    // El costo total, la ganancia y el descuento consolidado de stock se calculan
    // DENTRO de la transacción (más abajo), porque los combos requieren cargar su
    // composición desde la base para consolidar el consumo físico de componentes.

    // Config EFECTIVA por local de "vender sin stock" (config_local.stock),
    // con herencia al grupo (fase 1 de la migración group→local).
    const { allowNegativeStock: ALLOW_NEGATIVE_STOCK } = await getConfigLocalEfectiva(
      localId,
      grupoId
    );

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
          comisionPct: comisionPctVenta,
          netoRecibido,
          costoTotal,
          gananciaBruta,
          gananciaNeta,
          formaPago: formaPagoVenta, // derivado: medio único o "mixto"
          esFiado: esFiadoVenta,
        },
      });

      // Pagos (tenders) — fuente de verdad de la distribución del cobro.
      await tx.ventaPago.createMany({
        data: pagosConComision.map((t) => ({
          ventaId: nuevaVenta.id,
          medio: t.medio,
          monto: t.monto,
          comisionPct: t.comisionPct,
          comision: t.comision,
          neto: t.neto,
        })),
      });

      // VentaDetalle por LÍNEA COMERCIAL (el combo es UNA línea, no una por
      // componente). Para combos se congela el consumo en VentaDetalleComponente.
      for (const l of lineasComerciales) {
        const lineaSubtotal = l.subtotal;
        const esComboLinea = l.tipo === "COMBO";
        const esServicioLinea = l.tipo === "SERVICIO";
        // Servicios: cobrados en efectivo → sin comisión bancaria. Normales/combos:
        // se prorratea la comisión por participación en el total.
        const shareLinea = total > 0 ? lineaSubtotal / total : 0;
        const comisionLinea = esServicioLinea ? 0 : comisionBancaria * shareLinea;
        // Servicios y combos: sin lista de precios. Normales: la lista resuelta por el server.
        const itemListaValida = esComboLinea || esServicioLinea ? null : listaResuelta;
        const svc = esServicioLinea ? l.servicio : null;

        const detalle = await tx.ventaDetalle.create({
          data: {
            ventaId: nuevaVenta.id,
            productoBaseId: l.productoBaseId,
            nombre: l.nombre,
            precio: l.precio,
            precioCosto: l.costoUnitario, // combo: costo unitario TOTAL del combo; servicio: importe base
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
            // Snapshot histórico del servicio (congelado; null en líneas normales).
            esServicio: esServicioLinea,
            importeBaseServicio: svc ? svc.importeBaseServicio : null,
            recargoServicioPct: svc ? svc.recargoServicioPct : null,
            recargoServicioImporte: svc ? svc.recargoServicioImporte : null,
            // Consumo físico CONGELADO de la línea (para reversión exacta al corregir).
            // NORMAL → {productoLocalId, cantidadStock} del plan; COMBO → null (su
            // consumo vive en VentaDetalleComponente); SERVICIO → null (sin stock).
            productoLocalId: l.consumoFisico?.productoLocalId ?? null,
            cantidadStock: l.consumoFisico?.cantidadStock ?? null,
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

      // === Transferencia de la venta interna ===
      //
      // DENTRO de la misma transacción, a propósito: si algo falla después (cuenta
      // corriente, puntos), la venta, sus detalles, el stock y la transferencia
      // vuelven atrás juntos. Nunca queda una venta interna sin su transferencia.
      //
      // Stock: la venta YA descontó `cantidad` en aplicarConsumoStock. Por eso acá
      // va SOLO_TRANSITO, que únicamente incrementa `enTransito`. Un solo descuento
      // real del depósito. La recepción existente hará el resto.
      let transferenciaVenta = null;
      if (ventaInterna) {
        const idsOrigen = idsParaSnapshots(consumoFisicoConsolidado);
        // UNA sola consulta para todos los snapshots (nada de N+1). crearTransferencia
        // los usa para crear el ProductoLocal del destino y congelar precioCosto.
        const productosOrigen = idsOrigen.length
          ? await tx.productoLocal.findMany({
              where: { id: { in: idsOrigen } },
              include: { base: true },
            })
          : [];

        const mapeo = mapearVentaATransferencia({
          consumoFisicoConsolidado,
          lineasComerciales,
          snapshots: construirSnapshots(productosOrigen),
        });

        // Venta 100% de servicios: se completa normalmente y no genera
        // transferencia. No es un error. Y como no hay mercadería que despachar,
        // NO se revalida el vínculo: sería introducir una dependencia logística en
        // una venta que no mueve stock. Se revalida solo si hay algo que enviar.
        if (mapeo.debeCrearTransferencia) {
          // FUENTE DE VERDAD del destino: relectura DENTRO de la transacción.
          // Entre la validación previa y este punto, otro usuario pudo desvincular
          // el cliente, apuntarlo a otro local, desactivarlo o sacarlo del grupo.
          // Si algo de eso pasó, se aborta TODO (venta, pagos, detalles, stock).
          const confirmado = confirmarVinculoTransaccional(
            await resolverVentaInterna(tx, argsVinculo),
            ventaInterna.destinoId
          );

          const { transferencia } = await crearTransferencia({
            tx,
            origenId: localId,
            destinoId: confirmado.destinoId,
            creadoPorId: session.id,
            posTransferenciaId: null,
            ventaId: nuevaVenta.id,
            politicaStockOrigen: SOLO_TRANSITO,
            items: mapeo.items,
          });
          transferenciaVenta = transferencia;
        }
      }

      // Si es fiado, crear MovimientoCuenta DEBITO por el total (v1: fiado global).
      if (esFiadoVenta && clienteId) {
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

      return { venta: nuevaVenta, allowNegativeStockUsed, transferenciaVenta };
    });

    const venta = txResult.venta;
    const allowNegativeStockUsed = txResult.allowNegativeStockUsed === true;

    // La respuesta pública NO cambia en esta etapa: la cola offline y el POS
    // comparan campos concretos y no hay UI que muestre la transferencia todavía.
    // Queda el rastro en el log para poder auditar el flujo recién activado.
    if (txResult.transferenciaVenta) {
      console.log(
        "[pos-ventas/crear] venta interna: venta=%s → transferencia=%s destino=%s items=%s",
        venta.id,
        txResult.transferenciaVenta.id,
        txResult.transferenciaVenta.destinoId,
        txResult.transferenciaVenta.detalle?.length ?? 0
      );
    }

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
            // Los servicios de importe variable NO acreditan puntos ni entran a la base.
            if (item.esServicio === true) continue;
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
      // Snapshot de pago para el ticket (valores congelados, server-authoritative).
      formaPago: formaPagoVenta,
      comisionBancaria,
      netoRecibido,
      pagos: pagosConComision.map((t) => ({
        medio: t.medio, monto: t.monto, comisionPct: t.comisionPct, comision: t.comision, neto: t.neto,
      })),
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
    
    // Venta interna: el vínculo cambió o dejó de ser válido DENTRO de la
    // transacción. Ya hizo rollback de venta, pagos, detalles, stock y
    // transferencia; acá solo se traduce el error tipado a la respuesta HTTP.
    if (err.esErrorVentaInterna) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: err.status || 409 }
      );
    }

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

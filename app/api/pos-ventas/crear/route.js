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
import { WHERE_TURNO_OPERATIVO, ERROR_TURNO_EN_PREPARACION } from "@/lib/caja/cierreRelevo";
import { normalizarYConsolidarPagos, aplicarComisiones, derivarCamposVenta, normalizarMedio, MEDIOS_CON_COMISION } from "@/lib/pos-ventas/pagos";
import { mediosDelLocal } from "@/lib/pos-ventas/mediosCobroServidor";
import { comisionesDeMedios } from "@/lib/pos-ventas/mediosCobro";
import { calcularVentaComercial } from "@/lib/ofertas/motorVenta";
import { ofertasVigentesPorProductoLocal, recargosDelLocal } from "@/lib/ofertas/servidor";
import { verificarDescuentoPuntos, textoDescuentoPuntosInvalido } from "@/lib/pos-ventas/puntos";
import {
  esModalidadServicio,
  validarImporteServicio,
  resolverRecargoServicioPct,
  calcularServicio,
  sumarTotalServicios,
  validarCoberturaEfectivo,
} from "@/lib/pos-ventas/servicios";
import {
  esProductoPorPeso,
  pesoDesdeImporte,
  validarSubtotalFijado,
  subtotalLinea,
  // `sumarSubtotales` salió de acá: el subtotal ahora lo devuelve el motor
  // comercial, que suma lo MISMO pero después de aplicar las ofertas. Dejarlo
  // importado invitaría a volver a sumar por su cuenta y a que el total y las
  // líneas dejaran de contar la misma historia.
} from "@/lib/pos-ventas/lineaPorImporte";
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

    // Validar que el turno existe, pertenece al local, al vendedor, y está abierto.
    //
    // "Abierto" ya no es solo `cierre: null`. Un turno que tomó el corte de cierre
    // sigue con `cierre` en null —el cajero todavía está contando en otra
    // pestaña— pero su universo de ventas quedó CONGELADO: una venta nueva sobre
    // él entraría después de la frontera del corte y no la vería ni el cierre que
    // se está confirmando ni ningún otro. `WHERE_TURNO_OPERATIVO` es la condición
    // única, y va en el WHERE y no en un chequeo posterior para que no se pueda
    // olvidar en una rama.
    const turnoValido = await prisma.turno.findFirst({
      where: {
        id: turnoId,
        localId,
        vendedorId: session.id,
        ...WHERE_TURNO_OPERATIVO,
      },
      select: { id: true, apertura: true },
    });

    if (!turnoValido) {
      // Se distingue el corte del resto: "turno inválido" no le dice nada a quien
      // acaba de iniciar un cierre y no entiende por qué no puede vender.
      const enPreparacion = await prisma.turno.findFirst({
        where: { id: turnoId, localId, cierre: null, cierreEnPreparacionEn: { not: null } },
        select: { id: true },
      });
      return NextResponse.json(
        {
          ok: false,
          error: enPreparacion
            ? ERROR_TURNO_EN_PREPARACION
            : "Turno inválido, cerrado, o no pertenece a este usuario/local",
          turnoEnPreparacionDeCierre: Boolean(enPreparacion),
        },
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
      select: {
        id: true, modalidad: true, recargoServicioDefaultPct: true,
        // Para decidir server-side si el producto se vende POR PESO (única
        // modalidad que admite carga por importe).
        unidad_medida: true, modoVentaDeposito: true, pesoReferenciaKg: true, es_combo: true,
      },
    });
    const modalidadMap = new Map(basesModalidad.map((b) => [b.id, b]));
    const localesRecargo = await prisma.productoLocal.findMany({
      where: { localId, baseId: { in: baseIdsModalidad } },
      select: { baseId: true, recargoServicioPct: true },
    });
    const recargoLocalMap = new Map(localesRecargo.map((pl) => [pl.baseId, pl.recargoServicioPct]));

    // Se resuelve ACÁ (y no más abajo) porque la validación de las líneas de peso
    // cargadas por importe necesita saber si el local es depósito: el fiambre de
    // pieza fija tiene unidad "kg" pero allí se vende por PIEZAS, no por peso.
    const localInfo = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });
    const esDeposito = localInfo?.es_deposito === true;

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
        // Un servicio ya tiene su propio importe (importeBaseServicio); el
        // marcador de peso por importe no aplica y se descarta.
        item.subtotalFijado = null;
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

        // === LÍNEA DE PESO CARGADA POR IMPORTE ===
        //
        // El cajero tecleó "$2.000" y el peso es el derivado. El importe es la
        // fuente de verdad del total de la línea; el peso solo sirve para
        // descontar stock, mostrar, guardar y auditar.
        //
        // El backend NO confía en el cliente: revalida que el producto se venda
        // por peso y RECALCULA el peso él mismo desde el importe. Si el POS mandó
        // otra cantidad (payload viejo de la cola offline, o manipulado), gana la
        // del server. Mismo criterio que los servicios de importe variable.
        if (item.subtotalFijado != null) {
          const v = validarSubtotalFijado(item.subtotalFijado);
          if (!v.valido) {
            return NextResponse.json(
              { ok: false, error: `${item.nombre || "Producto"}: ${v.error}` },
              { status: 400 }
            );
          }
          if (base?.es_combo === true || !esProductoPorPeso(base, { esDeposito })) {
            return NextResponse.json(
              {
                ok: false,
                error: `El producto "${item.nombre || item.productoBaseId}" no se vende por peso: no admite carga por importe.`,
              },
              { status: 400 }
            );
          }
          const peso = pesoDesdeImporte(v.importe, item.precio);
          if (peso == null) {
            return NextResponse.json(
              { ok: false, error: `El importe de "${item.nombre || "producto"}" no alcanza para 1 gramo.` },
              { status: 400 }
            );
          }
          item.cantidad = peso;
          item.subtotalFijado = v.importe;
        } else {
          // Normaliza ausente/undefined a null: ninguna línea por peso queda con
          // un marcador ambiguo dando vueltas.
          item.subtotalFijado = null;
        }
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

    const descuentoManual = Number(descuento) || 0;

    // El descuento por puntos LO CALCULA EL SERVIDOR. Era el único importe del
    // cobro que entraba crudo del body: se validaba cuántos puntos se gastaban
    // pero no cuánta plata valían, así que un canje de 1 punto podía descontar
    // el subtotal entero. Manda el `pesoPorPunto` vigente ahora, no el que el
    // navegador tenía cargado. Ver lib/pos-ventas/puntos.js.
    let descuentoPorPuntosVal = 0;
    if (puntosCanje > 0) {
      const cfgPuntos = await prisma.puntosConfigLocal.findFirst({
        where: { localId, activo: true },
        select: { redencionJson: true },
      });
      const pesoPorPunto = cfgPuntos?.redencionJson?.pesoPorPunto || 0;

      const chequeo = verificarDescuentoPuntos({
        puntosCanje,
        pesoPorPunto,
        descuentoRecibido: descuentoPorPuntosBody,
      });
      if (!chequeo.ok) {
        return NextResponse.json(
          { ok: false, error: textoDescuentoPuntosInvalido(chequeo) },
          { status: 400 }
        );
      }
      // Se usa el del servidor, no el recibido, aunque hayan coincidido dentro
      // de la tolerancia: el que vale es el calculado acá.
      descuentoPorPuntosVal = chequeo.esperado;
    }

    // === OFERTAS Y RECARGO COMERCIAL — SERVER-AUTHORITATIVE ==================
    //
    // El POS puede MOSTRAR un precio de oferta, pero no puede imponerlo: el que
    // vale es el que sale de la fila de la oferta leída acá. Si el navegador
    // manda $900 y no hay oferta vigente, se cobra el precio normal.
    //
    // El `productoLocalId` de cada línea se resuelve ACÁ contra la base, por
    // (localId, baseId), y no se toma del body. Un id de otra ubicación colado
    // en el payload aplicaría la oferta de otro local.
    const idsBaseCarrito = [...new Set(items.map((i) => i.productoBaseId).filter(Boolean))];
    const filasLocales = await prisma.productoLocal.findMany({
      where: { localId, baseId: { in: idsBaseCarrito } },
      select: { id: true, baseId: true },
    });
    const productoLocalPorBase = new Map(filasLocales.map((pl) => [pl.baseId, pl.id]));

    // Los MEDIOS de la venta (no los importes) deciden si una oferta aplica y
    // cuánto recargo se cobra. Salen del body antes de conocer el total, porque
    // el total DEPENDE de ellos: con débito puede no haber oferta y sí recargo.
    const mediosDeclarados =
      Array.isArray(body.pagos) && body.pagos.length > 0
        ? body.pagos.map((p) => normalizarMedio(p?.medio))
        : [normalizarMedio(formaPago)];
    const mediosUsados = [...new Set(mediosDeclarados.filter(Boolean))];

    // ── LA VENTA OFFLINE NO APLICA OFERTAS NI RECARGOS, Y ES A PROPÓSITO ─────
    //
    // Una venta encolada se cobró hace rato y se está registrando ahora. Si acá
    // se resolviera la oferta contra el reloj de HOY podría aplicarse una que ya
    // venció, o dejar de aplicarse una que regía cuando el cajero cobró: las dos
    // formas dan una venta que no coincide con la plata que entró al cajón.
    //
    // Y con el recargo es peor que un número mal: la cola manda los pagos con el
    // total que se cobró, así que sumarle un recargo acá haría que la suma no dé
    // y la venta encolada se RECHACE. Eso rompería el modo offline, que es
    // justamente lo que no se puede tocar.
    //
    // Por eso la política de la v1 es explícita en los dos lados: el POS avisa
    // que sin conexión no hay ofertas ni recargos, y acá se registra la venta
    // exactamente como se cobró.
    const esReplayOffline = origenOffline === true;
    const ofertasPorProductoLocal = esReplayOffline
      ? {}
      : await ofertasVigentesPorProductoLocal(prisma, {
          localId,
          productoLocalIds: [...productoLocalPorBase.values()],
        });
    const recargosPorMedio = esReplayOffline ? {} : await recargosDelLocal(prisma, localId);

    // Motor comercial canónico: ofertas, descuentos existentes y recargo, en ese
    // orden. Ver lib/ofertas/motorVenta.js — es puro y está cubierto por
    // candados; acá solo se le da de comer y se guarda lo que devuelve.
    const comercial = calcularVentaComercial({
      lineas: items.map((item) => ({
        productoBaseId: item.productoBaseId,
        productoLocalId: productoLocalPorBase.get(item.productoBaseId) ?? null,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioNormal: item.precio,
        esServicio: item.esServicio === true,
        subtotalFijado: item.subtotalFijado ?? null,
      })),
      ofertasPorProductoLocal,
      mediosUsados,
      recargosPorMedio,
      descuentos: {
        automaticoPct: descuentoAplicadoPct,
        manual: descuentoManual,
        porPuntos: descuentoPorPuntosVal,
      },
      subtotalServicios,
    });

    // El precio de la línea pasa a ser el que se cobra de verdad. Todo lo que
    // viene después —subtotales, costo, ganancia, consumo de stock, puntos— usa
    // el mismo número, así que la oferta no puede quedar aplicada en el total y
    // olvidada en una línea.
    comercial.lineas.forEach((linea, i) => {
      items[i].precio = linea.precioAplicado;
      items[i].__oferta = linea.ofertaAplicada
        ? {
            ofertaId: linea.ofertaId,
            ofertaNombre: linea.ofertaNombre,
            precioNormal: linea.precioNormal,
            descuentoPromocional: linea.descuentoPromocional,
          }
        : { ofertaId: null, ofertaNombre: null, precioNormal: linea.precioNormal, descuentoPromocional: 0 };
    });

    // Base ELEGIBLE para descuentos/puntos = mercadería (subtotal SIN servicios).
    // Los servicios de importe variable no reciben descuentos/promos/puntos y su
    // importe no puede reducirse indirectamente por un descuento global.
    const subtotal = comercial.subtotal;
    const descuentoAutomatico = comercial.descuentoAutomatico;
    const descuentoTotal = comercial.descuentoTotal;
    const descuentoPromocional = comercial.descuentoPromocional;
    const totalAntesRecargo = comercial.totalAntesRecargo;

    // Ningún descuento (manual/automático/puntos) puede exceder la mercadería elegible:
    // eso equivaldría a descontar sobre servicios. Se rechaza explícitamente.
    if (comercial.excedeDescuento) {
      return NextResponse.json(
        {
          ok: false,
          error: "Los descuentos no pueden aplicarse sobre servicios de importe variable.",
        },
        { status: 400 }
      );
    }

    // Lo que paga el cliente: YA incluye el recargo comercial y todavía NO la
    // comisión bancaria, que no la paga él.
    const total = comercial.total;

    if (total <= 0) {
      return NextResponse.json(
        { ok: false, error: "El total debe ser mayor a 0" },
        { status: 400 }
      );
    }

    // ── LA PANTALLA DIJO UN NÚMERO Y ACÁ SALIÓ OTRO ─────────────────────────
    //
    // El POS manda `totalPantalla`: el importe que el cajero acaba de ver en el
    // botón que apretó, y que probablemente ya le dijo en voz alta al cliente.
    // Si la cuenta de acá no coincide, la venta NO se registra.
    //
    // Sin esto el desenlace es silencioso y es el peor de los dos posibles: con
    // un solo medio el backend arma el tender con SU total, así que la venta
    // entra por $8.300, la pantalla pidió $8.100, y nadie se entera hasta el
    // arqueo — donde aparece una diferencia sin explicación y sin forma de saber
    // de qué venta salió. Con pago dividido el error al menos se ve, porque los
    // importes no suman.
    //
    // Se responde con el total bueno y su desglose para que el POS pueda
    // refrescar y volver a confirmar CON EL NÚMERO NUEVO A LA VISTA, en vez de
    // reintentar solo y cobrar algo que nadie miró.
    //
    // La cola offline queda afuera a propósito: una venta encolada se cobró hace
    // rato, no aplica ofertas ni recargos (ver arriba) y su total es el que
    // efectivamente entró al cajón. Compararlo contra el de hoy la rechazaría
    // por estar bien.
    const totalPantalla = Number(body?.totalPantalla);
    if (!esReplayOffline && Number.isFinite(totalPantalla) && totalPantalla > 0) {
      const difiere = Math.round(totalPantalla * 100) !== Math.round(total * 100);
      if (difiere) {
        return NextResponse.json(
          {
            ok: false,
            code: "TOTAL_DESACTUALIZADO",
            error:
              `El total cambió: la pantalla mostraba $${totalPantalla} y ahora son $${total}. ` +
              `Puede haber empezado o terminado una oferta, o haber cambiado un recargo. ` +
              `Revisá el importe antes de cobrar.`,
            totalEsperado: total,
            totalPantalla,
            breakdown: {
              subtotal,
              subtotalSinOferta: comercial.subtotalNormal,
              descuentoPromocional,
              descuentoTotal,
              totalAntesRecargo,
              recargoPagoPct: comercial.recargoPagoPct,
              recargoPagoImporte: comercial.recargoPagoImporte,
              recargoPagoMedio: comercial.recargoPagoMedio,
              total,
            },
          },
          { status: 409 }
        );
      }
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
      // Cuando hay recargo o descuento promocional, "la suma de los pagos no da"
      // casi siempre significa que el POS calculó con otro total, no que el
      // cajero se equivocó tipeando. Un mensaje genérico ahí manda a la persona
      // a contar billetes cuando el problema es que la pantalla está vieja.
      const hayCondicionComercial =
        comercial.recargoPagoImporte > 0 || comercial.descuentoPromocional > 0;
      return NextResponse.json(
        {
          ok: false,
          error: hayCondicionComercial
            ? `${consolidado.error} El total incluye la condición comercial vigente` +
              (comercial.recargoPagoImporte > 0
                ? ` (recargo ${comercial.recargoPagoPct} % por ${comercial.recargoPagoMedio}: $${comercial.recargoPagoImporte})`
                : "") +
              (comercial.descuentoPromocional > 0
                ? ` (descuento por ofertas: $${comercial.descuentoPromocional})`
                : "") +
              ". Refrescá el POS y volvé a cobrar."
            : consolidado.error,
          totalEsperado: total,
          recargoPagoPct: comercial.recargoPagoPct || undefined,
          recargoPagoImporte: comercial.recargoPagoImporte || undefined,
          descuentoPromocional: comercial.descuentoPromocional || undefined,
        },
        { status: 400 }
      );
    }

    // ── % DE COMISIÓN POR MEDIO ──────────────────────────────────────────────
    //
    // Sale de la configuración de medios del local, que compone dos fuentes: la
    // comisión propia del medio si alguien la definió, y la del GRUPO
    // (`ConfiguracionGrupo`) cuando no. Ver `lib/pos-ventas/mediosCobro.js`.
    //
    // Un local que nunca configuró nada da EXACTAMENTE los mismos números que
    // antes de esta tanda: los medios por defecto tienen `comisionPct` en null y
    // heredan del grupo, con el mismo 7 de respaldo. Ese es el requisito de no
    // regresión y por eso la fuente se cambió acá y no el cálculo, que sigue
    // siendo `aplicarComisiones` sin tocar.
    //
    // NO se rechaza un tender cuyo medio no esté configurado o esté apagado, y es
    // deliberado: la configuración puede cambiar entre que el cajero abrió el POS
    // y apretó cobrar, y una venta offline llega con el medio con el que se cobró
    // hace rato. Rechazarla sería perder una venta que ya ocurrió. Lo que protege
    // el dato es la validación contra el enum canónico, que sigue intacta.
    let comisionPctPorMedio = {};
    if (consolidado.pagos.some((p) => MEDIOS_CON_COMISION.includes(p.medio))) {
      const mediosDelPos = await mediosDelLocal(prisma, { localId, grupoId });
      comisionPctPorMedio = comisionesDeMedios(mediosDelPos);
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

    // Transaccion: crear venta + descontar stock + movimiento CC si fiado.
    //
    // Una venta interna también crea su transferencia acá adentro para conservar
    // la atomicidad. En producción, el 2026-08-31, una venta de 151 líneas llegó
    // a procesar 137 y Prisma la revirtió por superar apenas su default implícito
    // de 5 s (P2028, 5071 ms). El tiempo por línea medido varió entre 17 y 57 ms
    // según la carga de PostgreSQL: no existe un umbral seguro de cantidad.
    //
    // Treinta segundos no aceleran los viajes seriales, pero dan margen al flujo
    // actual sin sacar la transferencia de esta misma transacción. maxWait limita
    // por separado cuánto puede esperar Prisma antes de conseguir una transacción.
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
      // ── LA GANANCIA DE MERCADERÍA SE MIDE ANTES DEL RECARGO ────────────────
      //
      // El recargo por medio de pago NO es venta de mercadería: es un cargo
      // financiero que el comercio le traslada al cliente. Sumarlo acá haría que
      // vender lo mismo con débito "diera más ganancia de mercadería" que con
      // efectivo, y el reporte de rentabilidad de productos pasaría a depender
      // de cómo pagó cada cliente.
      //
      // En una venta SIN recargo `totalAntesRecargo` es idéntico a `total`, así
      // que las ventas de hoy siguen dando exactamente el mismo número: esto no
      // cambia ni un peso de lo que ya está guardado ni de lo que se calcula
      // cuando no hay recargo configurado.
      //
      // `gananciaNeta` SÍ se sigue midiendo contra el neto recibido —recargo
      // cobrado menos comisión pagada—, porque esa es la pregunta financiera:
      // cuánto entró de verdad. Son dos ganancias distintas a propósito.
      const gananciaBruta = totalAntesRecargo - costoTotal;
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
          // Snapshot: al menos un tender que cobra comisión se cobró sin tenerla
          // configurada, así que `comisionBancaria`, `netoRecibido` y
          // `gananciaNeta` de esta fila son placeholders y no mediciones.
          comisionPendiente: derivado.comisionPendiente,
          netoRecibido,
          costoTotal,
          gananciaBruta,
          gananciaNeta,
          formaPago: formaPagoVenta, // derivado: medio único o "mixto"
          esFiado: esFiadoVenta,
          // Snapshot comercial. Se guarda SIEMPRE, incluso en cero, para que una
          // venta nueva sin oferta se distinga de una venta vieja anterior a
          // esta tanda —esas quedan en null— cuando alguien reconstruya el
          // histórico dentro de unos años.
          descuentoPromocional,
          totalAntesRecargo,
          recargoPagoPct: comercial.recargoPagoPct,
          recargoPagoImporte: comercial.recargoPagoImporte,
          recargoPagoMedio: comercial.recargoPagoMedio,
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
        // Con la comisión pendiente NO se prorratea: repartir un cero
        // estructural por línea convertiría un dato faltante en "esta línea no
        // pagó comisión", que es una afirmación que nadie puede hacer todavía.
        // `comisionLinea` ya es nulable y `null` es su forma de decirlo.
        const comisionLinea =
          esServicioLinea || derivado.comisionPendiente ? 0 : comisionBancaria * shareLinea;
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
            // Snapshot de la oferta. `precio` (arriba) ya es lo COBRADO; esto es
            // lo que habría costado sin oferta y cuál era. `ofertaNombre` se
            // congela para que la línea se pueda leer aunque la oferta se borre.
            precioNormal: l.oferta?.precioNormal ?? l.precio,
            ofertaId: l.oferta?.ofertaId ?? null,
            ofertaNombre: l.oferta?.ofertaNombre ?? null,
            descuentoPromocional: l.oferta?.descuentoPromocional ?? 0,
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

      // `lineasComerciales` sale de la transacción porque el TICKET se arma con
      // ellas. Son exactamente las filas que se acaban de escribir en
      // VentaDetalle: mismo precio, misma cantidad, mismo subtotal. Es la única
      // forma de que el papel no pueda decir otra cosa que la base.
      return { venta: nuevaVenta, allowNegativeStockUsed, transferenciaVenta, lineasComerciales };
    }, {
      maxWait: 10_000,
      timeout: 30_000,
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
            subtotalElegible += subtotalLinea(item);
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
        // Condición comercial aplicada, para el ticket y para que el POS pueda
        // mostrar lo mismo que se guardó en vez de recalcularlo por su cuenta.
        subtotalSinOferta: comercial.subtotalNormal,
        descuentoPromocional,
        totalAntesRecargo,
        recargoPagoPct: comercial.recargoPagoPct,
        recargoPagoImporte: comercial.recargoPagoImporte,
        recargoPagoMedio: comercial.recargoPagoMedio,
        // ── LAS LÍNEAS AUTORITATIVAS, PARA EL TICKET ────────────────────────
        //
        // El POS armaba el ticket con `state.carrito`, que tiene el precio
        // NORMAL. Con una oferta eso imprime "9 × $1.000" arriba de un total de
        // $8.100: un papel que no cierra, que el cliente mira y que no hay forma
        // de defender en el mostrador.
        //
        // Estas son las líneas que se acaban de escribir en VentaDetalle.
        // `precio` es lo COBRADO, así que cantidad × precio suma el subtotal, y
        // `precioNormal` viaja al lado para poder decir cuánto se ahorró sin
        // tener que restar nada en el navegador.
        lineas: (txResult.lineasComerciales || []).map((l) => ({
          nombre: l.nombre,
          cantidad: l.cantidad,
          precio: l.precio,
          subtotal: l.subtotal,
          precioNormal: l.oferta?.precioNormal ?? l.precio,
          ofertaNombre: l.oferta?.ofertaNombre ?? null,
          descuentoPromocional: l.oferta?.descuentoPromocional ?? 0,
          // Snapshot del servicio de importe variable, para que el ticket pueda
          // desglosar la carga y su recargo igual que en la reimpresión.
          esServicio: l.tipo === "SERVICIO",
          importeBaseServicio: l.servicio?.importeBaseServicio ?? null,
          recargoServicioPct: l.servicio?.recargoServicioPct ?? null,
          recargoServicioImporte: l.servicio?.recargoServicioImporte ?? null,
        })),
        ofertasAplicadas: comercial.lineas
          .filter((l) => l.ofertaAplicada)
          .map((l) => ({
            nombre: l.nombre,
            ofertaNombre: l.ofertaNombre,
            precioNormal: l.precioNormal,
            precioOferta: l.precioAplicado,
            descuento: l.descuentoPromocional,
          })),
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

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
import { WHERE_TURNO_OPERATIVO, ERROR_TURNO_EN_PREPARACION, whereCajaPropia } from "@/lib/caja/cierreRelevo";
import { compartirTurno } from "@/lib/caja/cierreRelevoServer";
import { ERROR_VENTA_DE_OTRO_OPERADOR } from "@/lib/pos-ventas/replayOffline";
import { esMismoDestino, esChoqueDeClientTxnId } from "@/lib/pos-ventas/idempotenciaVenta";
import { tomarCandadoDelLocal, LIMITES_TRANSACCION_DEL_LOCAL } from "@/lib/pos-ventas/candadoDelLocal";
import { CODIGO_COBRO_OFFLINE_DESCARTADO } from "@/lib/pos-ventas/cobroOffline";
import {
  verificarCobroOfflineNoDescartado,
  sincronizarCobroOfflineEnTransaccion,
  reconciliarCobroOfflineConVenta,
  anotarRechazoDeVenta,
} from "@/lib/pos-ventas/cobroOfflineServidor";
import { CODIGO_RECHAZO_VENTA, codigoDeTurnoRechazado } from "@/lib/pos-ventas/rechazoVenta";
import { consolidarTenders, aplicarComisionesResueltas, derivarCamposVenta, normalizarMedio, MEDIOS_CON_COMISION } from "@/lib/pos-ventas/pagos";
import { mediosDelLocal } from "@/lib/pos-ventas/mediosCobroServidor";
import { comisionesDeMedios } from "@/lib/pos-ventas/mediosCobro";
import { CONFLICTO_COBRO, condicionLegacy, resolverTenders } from "@/lib/pos-ventas/modalidadesDeMedio";
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
import { declararOrigenDeStock, ORIGEN_STOCK } from "@/lib/stock/libro/libroStock";

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

/** La venta de un `clientTxnId`, con lo que hace falta para responder un reintento. */
function buscarVentaPorTxn(txnId) {
  return prisma.venta.findUnique({
    where: { clientTxnId: txnId },
    select: {
      id: true,
      numero: true,
      total: true,
      fecha: true,
      subtotal: true,
      descuento: true,
      localId: true,
      turnoId: true,
      // Venta interna: el reintento no puede devolver "ok, duplicada" si la
      // transferencia falta. Ver bloqueoReintentoHuerfana.
      cliente: { select: { localVinculadoId: true } },
      transferencia: { select: { id: true } },
      detalles: { select: { cantidadStock: true } },
    },
  });
}

/** El turno dejó de estar operativo entre la validación y la transacción. */
class ErrorTurnoNoOperativo extends Error {
  constructor() {
    super("El turno dejó de estar operativo antes de escribir la venta.");
    this.esTurnoNoOperativo = true;
  }
}

/**
 * La caja de la venta no está operativa: POR QUÉ, con un código estable
 * (codigoDeTurnoRechazado). La decisión ya se tomó —en el WHERE de la
 * validación o, con el turno tomado, adentro de la transacción—; esto solo la
 * explica. Se distingue el corte del resto en el mensaje: "turno inválido" no
 * le dice nada a quien acaba de iniciar un cierre. Solo sobre la caja PROPIA:
 * el estado de la caja de otro no se informa, ni en el mensaje ni en el código.
 */
async function responderTurnoNoOperativo({ turnoId, localId, usuarioId, operadorId }) {
  const turnoPedido = await prisma.turno.findUnique({
    where: { id: turnoId },
    select: { localId: true, operadorId: true, vendedorId: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true },
  });
  const codigoTurno = codigoDeTurnoRechazado(turnoPedido, { localId, usuarioId, operadorId });
  const enPreparacion = codigoTurno === CODIGO_RECHAZO_VENTA.TURNO_EN_CORTE;
  return NextResponse.json(
    {
      ok: false,
      error: enPreparacion
        ? ERROR_TURNO_EN_PREPARACION
        : "Turno inválido, cerrado, o no es tu caja en este local",
      code: codigoTurno,
      turnoEnPreparacionDeCierre: enPreparacion,
    },
    { status: 403 }
  );
}

/**
 * La respuesta canónica de un reintento: la venta que ya existe, sin escribir
 * nada de la venta.
 *
 * Antes de responder, si hay un cobro offline registrado con ese id y es de la
 * caja de esa venta, se lo deja SINCRONIZADA (reconciliarCobroOfflineConVenta:
 * una actualización condicional, idempotente y sin efecto económico). Si esa
 * reconciliación falla, el reintento se responde igual: la garantía de #127 —
 * un reintento recibe la venta existente— no depende de ella.
 */
async function responderDuplicada(ventaExistente, clientTxnId) {
  try {
    await reconciliarCobroOfflineConVenta(prisma, {
      clientTxnId,
      ventaId: ventaExistente.id,
      localId: ventaExistente.localId,
      turnoId: ventaExistente.turnoId,
    });
  } catch (errCobro) {
    console.error("No se pudo reconciliar el cobro offline del reintento:", errCobro);
  }

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

/**
 * Si la venta no se escribió y su id es el de un cobro offline registrado en
 * este local, el intento y su rechazo quedan anotados en el cobro
 * (anotarRechazoDeVenta). Va DESPUÉS de responder la venta, fuera de su
 * transacción: el rechazo tiene que sobrevivir al rollback. La respuesta no
 * cambia nunca por esto.
 */
export async function POST(req) {
  const intento = { txnId: null, localId: null };
  const respuesta = await procesarCrear(req, intento);
  if (respuesta.status >= 400 && intento.txnId && intento.localId) {
    try {
      const cuerpo = await respuesta.clone().json().catch(() => ({}));
      await anotarRechazoDeVenta(prisma, {
        clientTxnId: intento.txnId,
        localId: intento.localId,
        status: respuesta.status,
        codigo: typeof cuerpo?.code === "string" ? cuerpo.code : null,
        mensaje: typeof cuerpo?.error === "string" ? cuerpo.error : null,
      });
    } catch (errAnotar) {
      console.error("No se pudo anotar el rechazo en el cobro offline:", errAnotar);
    }
  }
  return respuesta;
}

async function procesarCrear(req, intento) {
  // El id de idempotencia y el destino de este pedido, cuando ya se conocen.
  // Vive afuera del `try` porque lo lee el `catch`.
  let pedidoIdempotente = null;
  // La caja que la venta validó, para explicar el rechazo si deja de estar
  // operativa adentro de la transacción. También la lee el `catch`.
  let intentoTurno = null;
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

    // clientVentaId es alias de clientTxnId para compatibilidad con cola offline
    const txnId = clientTxnId || clientVentaId;
    // Desde acá un rechazo se anota en el cobro offline de este id, si lo hay.
    intento.txnId = typeof txnId === "string" ? txnId : null;
    intento.localId = localId;

    // QUIÉN COBRA: la identidad de caja de esta venta.
    //
    // Es SIEMPRE el PIN activo, validado en el local, como cualquier venta. Sin
    // PIN donde el local lo exige, 428: no hay a nombre de quién cobrar.
    //
    // `origenOffline` lo manda el cliente y no prueba nada: no concede ninguna
    // excepción de propiedad ni de vigencia. Offline solo significa que la venta
    // llega tarde; para escribirse sola tiene que poder escribirse como una venta
    // de ahora, en su turno original. Si no puede, queda en la cola.
    //
    // El voucher del operador tampoco autoriza: no está atado a ninguna venta, no
    // vence y queda guardado en el navegador, así que quien lo lea puede
    // reusarlo. Se conserva SOLO para negar: si la venta de la cola la cobró otro
    // operador que el del PIN, no se escribe a nombre de éste.
    //
    // Antes el voucher era la identidad del replay y la bandera salteaba la
    // vigencia del turno: con la cuenta compartida, B podía fabricar ventas en la
    // caja de A con el voucher de A, y cualquiera vender en su caja vencida.
    const gateOp = await requireOperadorSegunConfig(req, session, { localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }
    const operadorId = gateOp.operadorId;

    const operadorDelVoucher =
      origenOffline === true ? verificarVoucherOperador(operadorVoucher, localId) : null;
    if (operadorDelVoucher != null && operadorDelVoucher !== operadorId) {
      return NextResponse.json(
        {
          ok: false,
          error: ERROR_VENTA_DE_OTRO_OPERADOR,
          code: "VENTA_DE_OTRO_OPERADOR",
        },
        { status: 409 }
      );
    }

    // Validar turnoId obligatorio
    if (!turnoId) {
      return NextResponse.json(
        { ok: false, error: "Debe haber un turno abierto", code: CODIGO_RECHAZO_VENTA.TURNO_REQUERIDO },
        { status: 400 }
      );
    }

    // IDEMPOTENCIA, antes de mirar el turno. Un reintento de una venta que YA se
    // escribió —la respuesta se perdió— tiene que reconocerse aunque su caja
    // haya cerrado después: si no, la cola la dejaría pendiente para siempre
    // estando escrita, y resolverla a mano la duplicaría. Se reconoce solo si
    // apunta al MISMO local y turno que la venta guardada; cualquier otra cosa
    // sigue por las validaciones de siempre.
    const ventaExistente = txnId ? await buscarVentaPorTxn(txnId) : null;

    // Lo que el `catch` necesita para reconocer el choque de dos reintentos
    // simultáneos contra el índice único (ver más abajo).
    pedidoIdempotente = txnId ? { txnId, localId, turnoId } : null;

    if (esMismoDestino(ventaExistente, { localId, turnoId })) {
      return responderDuplicada(ventaExistente, txnId);
    }

    // Validar que el turno existe, pertenece al local, es LA CAJA de quien vende,
    // y está abierto.
    //
    // LA CAJA ES DEL OPERADOR. Con una cuenta compartida por el mostrador, el
    // turno de B es del mismo local, de la misma cuenta y está abierto: nada de
    // eso lo hace de A. `whereCajaPropia` decide con la identidad de arriba
    // —el PIN validado, nunca un id del cuerpo—, y con la cuenta cuando no hay
    // operador. Es la MISMA condición para online y offline: no hay una rama
    // que acepte "cualquier turno de la cuenta".
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
        ...whereCajaPropia({ usuarioId: session.id, operadorId }),
        ...WHERE_TURNO_OPERATIVO,
      },
      select: { id: true, apertura: true },
    });

    intentoTurno = { turnoId, localId, usuarioId: session.id, operadorId };
    if (!turnoValido) {
      return responderTurnoNoOperativo(intentoTurno);
    }

    // Bloquear si el turno fue abierto un día anterior (calendario AR).
    // El cajero debe cerrar caja antes de seguir vendiendo.
    //
    // Vale igual para un replay offline: la bandera la manda el cliente y no
    // distingue una venta encolada de una fabricada ahora. La venta de una caja
    // vencida no se escribe sola: queda en la cola para resolverla una persona.
    const diaAperturaAR = fechaArgentinaISO(turnoValido.apertura);
    const hoyAR = hoyArgentinaISO();
    if (diaAperturaAR && diaAperturaAR !== hoyAR) {
      return NextResponse.json(
        {
          ok: false,
          error: "Caja abierta de un día anterior. Cerrá caja antes de vender.",
          code: CODIGO_RECHAZO_VENTA.TURNO_DE_OTRO_DIA,
        },
        { status: 403 }
      );
    }

    // Idempotencia por clientTxnId/clientVentaId para un id ya usado en otro
    // destino: con el turno validado, la respuesta de siempre —dentro del
    // MISMO local—. Un id que es de una venta de OTRO local no es un reintento
    // de nada de este local: devolverla como duplicada le daba a este local el
    // número, el total y el detalle de una venta ajena, y le hacía dar por
    // sincronizado un cobro que no lo estaba. Se responde con el mismo código
    // que el registro de cobros offline, sin ningún dato de esa venta.
    if (ventaExistente && ventaExistente.localId !== localId) {
      return NextResponse.json(
        { ok: false, error: "Ese cobro ya existe en otro local.", code: CODIGO_RECHAZO_VENTA.ID_DE_OTRO_LOCAL },
        { status: 409 }
      );
    }
    if (ventaExistente) {
      return responderDuplicada(ventaExistente, txnId);
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
            code: CODIGO_RECHAZO_VENTA.CLIENTE_REQUERIDO,
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
          { ok: false, error: "La lista de precios cambió. Refrescá el POS y volvé a intentar.", code: CODIGO_RECHAZO_VENTA.LISTA_PRECIOS_CAMBIADA },
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

    // ── LO QUE EL CLIENTE ELIGE, ANTES DE CONOCER EL TOTAL ──────────────────
    //
    // La CONDICIÓN de la venta —qué oferta aplica, cuánto recargo se cobra— sale
    // de con qué se paga, así que hay que resolverla antes del total: el total
    // DEPENDE de ella. Con débito puede no haber oferta y sí recargo.
    //
    // Lo que el navegador manda es IDENTIDAD y monto, en dos formas que conviven:
    //
    //   nuevo    { medioCobroLocalId, modalidadId, monto }
    //   legacy   { medio, monto }   ·   o `formaPago` y nada más
    //
    // Ninguna de las dos trae condición. El tipo contable, el recargo, la
    // comisión, el procesador y los nombres se releen del servidor más abajo.
    const hayPagosExplicitos = Array.isArray(body.pagos) && body.pagos.length > 0;
    const selecciones = hayPagosExplicitos ? body.pagos : formaPago ? [{ medio: formaPago }] : [];

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

    // ── LA CONDICIÓN DE CADA TENDER, RESUELTA CONTRA LA CONFIGURACIÓN ───────
    //
    // Acá el servidor deja de creerle al cliente. De lo que llegó se usa
    // únicamente `medioCobroLocalId`, `modalidadId` y `monto`; todo lo demás se
    // relee. Un `recargoPct`, un `comisionPct`, un `procesador` o un `medio`
    // mandados por el navegador junto a los ids no se miran: no entran a
    // `resolverTenders`.
    //
    // ── POR QUÉ LA CONFIGURACIÓN SE LEE ACÁ Y NO MÁS ABAJO ─────────────────
    //
    // Antes se leía después del total, solo para la comisión y solo si algún
    // tender la cobraba. Ahora hace falta antes, porque de la configuración sale
    // el RECARGO de la modalidad, y el recargo cambia el total. Es una consulta
    // indexada por local y ya se hacía en casi todas las ventas.
    //
    // ── LA OFERTA OFFLINE QUEDA EXACTAMENTE COMO ESTABA ────────────────────
    //
    // Una venta encolada se cobró hace rato: no se le releen condiciones, no se
    // le resuelven modalidades y NO se la rechaza porque hoy una modalidad esté
    // inactiva o porque el medio con el que se cobró ahora tenga modalidades. Se
    // registra como se cobró. Ver el bloque de arriba.
    //
    // La configuración se lee SIEMPRE online. Offline se lee solo cuando algún
    // tender cobra comisión, que es exactamente cuándo se leía antes de esta
    // tanda: una cola de ventas en efectivo no paga una consulta de más.
    const necesitaConfiguracion =
      !esReplayOffline ||
      selecciones.some((p) => MEDIOS_CON_COMISION.includes(normalizarMedio(p?.medio)));
    const mediosDelPos = necesitaConfiguracion
      ? await mediosDelLocal(prisma, { localId, grupoId })
      : [];
    const comisionPctPorMedio = comisionesDeMedios(mediosDelPos);

    const resolucion = esReplayOffline
      ? {
          ok: true,
          tenders: selecciones.map((p) => ({
            // El medio crudo sobrevive cuando no se reconoce, para que el mensaje
            // de "medio desconocido" siga nombrando lo que mandó el cliente y no
            // un `null` que no ayuda a nadie.
            ...condicionLegacy(normalizarMedio(p?.medio) ?? p?.medio, { comisionPctPorMedio }),
            monto: p?.monto,
          })),
        }
      : resolverTenders({
          medios: mediosDelPos,
          pagos: selecciones,
          recargosPorMedio,
          comisionPctPorMedio,
        });

    if (!resolucion.ok) {
      // Es un conflicto de CONFIGURACIÓN, no un error del cajero: la
      // configuración cambió entre que abrió el POS y apretó cobrar. Se contesta
      // 409 con el motivo, igual que `TOTAL_DESACTUALIZADO`, para que la pantalla
      // pueda refrescar y volver a confirmar en vez de reintentar a ciegas.
      //
      // El caso que este 409 existe para tapar: un POS viejo mandando
      // `medio: MERCADOPAGO` cuando el local ya configuró modalidades adentro de
      // Mercado Pago. Cobrarlo contra `RecargoPagoLocal` saltearía el recargo de
      // Crédito, en silencio y a favor de quien manda el pedido.
      //
      // DOS CÓDIGOS, Y LA DIFERENCIA IMPORTA. "No existe" es 404 y cubre
      // también lo que no es de este local o cuelga de otro padre: los tres se
      // contestan igual para que un id ajeno no sirva para averiguar qué
      // configuró otra boca. "Existe pero cambió" —se desactivó, ahora exige
      // modalidad— es 409, que es lo que la pantalla sabe leer como "refrescá".
      const noExiste =
        resolucion.motivo === CONFLICTO_COBRO.MEDIO_INEXISTENTE ||
        resolucion.motivo === CONFLICTO_COBRO.MODALIDAD_INEXISTENTE;
      return NextResponse.json(
        { ok: false, code: resolucion.motivo, error: resolucion.error },
        { status: noExiste ? 404 : 409 }
      );
    }

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
      // Las condiciones ya resueltas por el servidor. `mediosUsados` sale de
      // adentro de ellas —del `tipoContable` efectivo de cada una, que con
      // modalidad es el de la modalidad— y por eso no se pasa: lo que decide si
      // una oferta SOLO_EFECTIVO aplica tiene que ser lo mismo que se congela en
      // el tender, no lo que declaró el navegador.
      condicionesDeCobro: resolucion.tenders,
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
              // Aditivo: quién impuso la condición, para que la pantalla pueda
              // decir "el recargo lo pone Mercado Pago · Crédito" y no solo un
              // porcentaje. Los consumidores viejos leen lo de arriba igual.
              recargoPagoMedioNombre: comercial.recargoPagoMedioNombre,
              recargoPagoModalidadNombre: comercial.recargoPagoModalidadNombre,
              total,
            },
          },
          { status: 409 }
        );
      }
    }

    // === PAGOS (pago dividido) ==========================================
    // Las condiciones ya están resueltas; acá se cierran las reglas de PLATA:
    // Σ == total (exacto, en centavos), montos > 0, FIADO único, y la
    // consolidación de tenders repetidos. NO se confía en comisión/neto/pct del
    // cliente: ninguno de esos tres llegó hasta acá.
    //
    // La consolidación ahora es POR IDENTIDAD y no por tipo contable: dos
    // modalidades distintas que comparten CREDITO son dos tenders. Ver
    // `claveDeTender`, donde está escrito por qué un medio sin modalidad se
    // sigue consolidando por su enum y no por su id.
    //
    // Sin `body.pagos` hay un solo tender y su monto es el total: es la compat
    // de `formaPago`, y por eso el monto se completa recién acá, cuando el total
    // ya está calculado.
    const tendersConMonto = resolucion.tenders.map((t) => ({
      ...t,
      monto: hayPagosExplicitos ? t.monto : total,
    }));

    const consolidado = consolidarTenders(tendersConMonto, total);
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

    // ── % DE COMISIÓN: CADA TENDER TRAE EL SUYO ─────────────────────────────
    //
    // Ya viene adentro de la condición resuelta más arriba, y por eso acá no hay
    // ninguna búsqueda. El mapa `{TIPO: pct}` que había antes no alcanzaba desde
    // que existen las modalidades: "Crédito 1 pago" al 3 % y "Crédito cuotas" al
    // 7 % son las dos CREDITO, y un mapa no puede tener las dos.
    //
    // La CUENTA no cambió: `aplicarComisionesResueltas` y `aplicarComisiones`
    // llaman las dos a `comisionDeTender`, que es la única fórmula. Lo único que
    // cambió es de dónde sale el porcentaje.
    //
    // Un local que nunca configuró nada da EXACTAMENTE los mismos números que
    // antes: sus medios por defecto tienen `comisionPct` en null y heredan del
    // grupo, igual que siempre.
    //
    // NO se rechaza un tender por su comisión, y es deliberado: `null` significa
    // sin configurar, se guarda como null y la venta queda con
    // `comisionPendiente`. Perder la venta por un dato que falta sería peor.
    const pagosConComision = aplicarComisionesResueltas(consolidado.tenders);
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
      const cobertura = validarCoberturaEfectivo(subtotalServicios, consolidado.tenders);
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
      select: {
        id: true, precio_costo: true, factor_pack: true, categoria_id: true,
        modoVentaDeposito: true, pesoReferenciaKg: true, modo_envio: true,
        unidad_medida: true, es_combo: true,
        // ── SIN ESTOS DOS, NINGUNA PIEZA SE CONGELA COMO PIEZA ───────────
        //
        // `baseStockMap` los lee más abajo para armar la entrada que decide la
        // presentación, pero el select no los pedía: llegaban `undefined`, así
        // que `modoCompraProveedor` quedaba en null y `esProductoFiambre` —la
        // puerta de `esFiambreFijo`— daba false SIEMPRE. Un fiambre de pieza
        // fija tiene `unidad_medida = "kg"`, o sea que caía en la rama del kilo
        // y el snapshot lo congelaba como KG: "2 PIEZA" se guardaba como "2 KG",
        // y de ahí sale cuántos kilos acredita `confirmar-recepcion`.
        //
        // El candado del helper pasaba igual porque lo llamaba con un objeto
        // escrito a mano, donde los dos campos estaban. El camino real del POS
        // no los tenía.
        modoCompraProveedor: true, pesoEsFijo: true,
      },
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
        // Lo exige `esProductoFiambre`, la puerta de `esFiambreFijo`: sin él una
        // pieza fija se lee como producto a granel al congelar la presentación.
        modoCompraProveedor: p.modoCompraProveedor || null,
        pesoEsFijo: p.pesoEsFijo ?? null,
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
    // Los dos valores viven en LIMITES_TRANSACCION_DEL_LOCAL porque el registro
    // de cobros offline espera este mismo candado y tiene que poder esperarlo.
    const txResult = await prisma.$transaction(async (tx) => {
      // Lock a nivel de transacción para evitar concurrencia en número de venta
      await tomarCandadoDelLocal(tx, localId);

      // EL TURNO SIGUE OPERATIVO, AHORA. La validación de arriba es anterior a
      // esta transacción, y entre las dos la venta puede esperar el candado del
      // local varios segundos: si en ese tiempo se tomaba el corte, la venta se
      // escribía igual en un turno ya cortado, después de la frontera que el
      // corte acababa de congelar (R2c). Se toma el turno compartido
      // —`compartirTurno`, que explica por qué FOR SHARE— y se vuelve a leer con
      // EL MISMO predicado. Desde acá hasta confirmar, nadie lo corta ni lo cierra.
      //
      // Orden: candado del local → turno → cobro offline → filas de stock. Quien
      // corta, cierra o retira toma el turno y no toma el candado del local ni
      // esas filas, así que no se forma un ciclo.
      await compartirTurno(tx, turnoId);
      const sigueOperativo = await tx.turno.findFirst({
        where: {
          id: turnoId,
          localId,
          ...whereCajaPropia({ usuarioId: session.id, operadorId }),
          ...WHERE_TURNO_OPERATIVO,
        },
        select: { id: true },
      });
      if (!sigueOperativo) throw new ErrorTurnoNoOperativo();

      // EL COBRO OFFLINE CON ESTE ID, SI LO HAY. Se lee con FOR UPDATE ya con el
      // candado del local tomado —el mismo que toma el registro—: si una persona
      // lo descartó, esta venta no se crea (lib/pos-ventas/cobroOfflineServidor.js).
      if (txnId) await verificarCobroOfflineNoDescartado(tx, txnId);

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

      // ── LA VENTA SE CREA ANTES DEL CONSUMO ─────────────────────────────────
      //
      // El Libro de Stock anota el descuento con el documento que lo explica, y
      // ese documento es esta venta: necesita su id ANTES de tocar el stock.
      // Antes se descontaba primero y la venta nacía después. El orden no le
      // importa a nada más —el consumo no le pasa ningún dato a la cabecera—, y
      // los dos siguen en la misma transacción: un stock insuficiente revierte
      // también la venta, como antes.
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
          // QUIÉN impuso el recargo, además de cuánto. Sale del MISMO cálculo
          // que decidió el porcentaje —no de una segunda búsqueda—, así que la
          // venta no puede quedar con un ganador que no produjo su número.
          //
          // `recargoPagoMedio` sigue congelando el tipo contable del ganador y
          // no se toca: es lo que leen los reportes de hoy. Esto se le suma.
          recargoPagoMedioCobroLocalId: comercial.recargoPagoMedioCobroLocalId,
          recargoPagoMedioNombre: comercial.recargoPagoMedioNombre,
          recargoPagoModalidadId: comercial.recargoPagoModalidadId,
          recargoPagoModalidadNombre: comercial.recargoPagoModalidadNombre,
        },
      });

      // El cobro offline registrado con este id, si es de esta caja, pasa a
      // SINCRONIZADA apuntando a esta venta, EN ESTA TRANSACCIÓN: si la venta se
      // revierte (stock, pagos, lo que sea), el cobro también.
      if (txnId) {
        await sincronizarCobroOfflineEnTransaccion(tx, {
          clientTxnId: txnId,
          ventaId: nuevaVenta.id,
          localId,
          turnoId: nuevaVenta.turnoId,
        });
      }

      // Bloqueo determinístico (FOR UPDATE por productoLocalId asc) + validación +
      // descuento consolidado. Insuficiencia respeta ALLOW_NEGATIVE_STOCK; la
      // invalidez ESTRUCTURAL del combo ya abortó antes (en construirLineasComerciales).
      //
      // Se declara el origen justo antes: si esta venta es interna, más abajo
      // `crearTransferencia` declara el suyo para el tránsito, y cada tramo
      // queda con su documento.
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.VENTA, referencia: String(nuevaVenta.id) });
      const { allowNegativeStockUsed } = await aplicarConsumoStock(tx, {
        localId,
        consumoFisicoConsolidado,
        allowNegativeStock: ALLOW_NEGATIVE_STOCK,
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
          // CON QUÉ SE COBRÓ ESTE TENDER. Van en pares referencia + texto: la
          // referencia para operar, el texto para que la venta siga
          // explicándose cuando alguien renombre o borre la configuración.
          //
          // Los cinco en null es un cobro sin identidad configurable —una venta
          // offline, un cliente viejo— y sigue siendo válido. Un medio SIN
          // modalidades sí congela los tres del padre: "Banco X · CREDITO" y
          // "Mercado Pago · CREDITO" no pueden quedar indistinguibles.
          medioCobroLocalId: t.medioCobroLocalId ?? null,
          medioNombre: t.medioNombre ?? null,
          procesador: t.procesador ?? null,
          modalidadId: t.modalidadId ?? null,
          modalidadNombre: t.modalidadNombre ?? null,
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
          // Fuera de un depósito no hay modos de venta por bulto ni piezas: la
          // presentación es la del producto y nada más. Es el mismo dato que ya
          // gobierna `cantidadParaStockNormal`.
          esDeposito,
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
    }, LIMITES_TRANSACCION_DEL_LOCAL);

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
      // Los cinco campos de siempre, más la identidad congelada CUANDO EXISTE.
      // Es aditivo a propósito: los consumidores actuales leen `medio` y `monto`
      // y no se enteran. Lo que habilita es que el ticket pueda decir "Mercado
      // Pago · Crédito" sin ir a buscar la configuración de hoy —que para
      // entonces puede ser otra—. El ticket no se rediseña en esta tanda: el
      // dato queda disponible.
      pagos: pagosConComision.map((t) => ({
        medio: t.medio, monto: t.monto, comisionPct: t.comisionPct, comision: t.comision, neto: t.neto,
        medioCobroLocalId: t.medioCobroLocalId ?? null,
        medioNombre: t.medioNombre ?? null,
        procesador: t.procesador ?? null,
        modalidadId: t.modalidadId ?? null,
        modalidadNombre: t.modalidadNombre ?? null,
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
        // Y quién lo impuso, con las mismas palabras que quedaron en la venta.
        recargoPagoMedioNombre: comercial.recargoPagoMedioNombre,
        recargoPagoModalidadNombre: comercial.recargoPagoModalidadNombre,
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
    // El cobro offline con este id fue descartado por una persona: esta venta
    // no se crea. La transacción ya se revirtió sin escribir nada.
    // El turno dejó de estar operativo mientras la venta esperaba su candado:
    // la misma respuesta que si ya lo estuviera al validar, con su código
    // (TURNO_EN_CORTE, TURNO_CERRADO…). La transacción ya se revirtió sin escribir nada.
    if (err.esTurnoNoOperativo && intentoTurno) {
      return responderTurnoNoOperativo(intentoTurno);
    }

    if (err.esCobroOfflineDescartado) {
      return NextResponse.json(
        { ok: false, error: err.message, code: CODIGO_COBRO_OFFLINE_DESCARTADO },
        { status: 409 }
      );
    }

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
        { ok: false, error: err.message, code: CODIGO_RECHAZO_VENTA.COMBO_INVALIDO },
        { status: err.status || 400 }
      );
    }

    // Stock insuficiente: incluir el producto/componente limitante para el cajero.
    // El código sale solo del error tipado (`limitante`, que pone
    // aplicarConsumoStock): la rama por texto se conserva para la respuesta de
    // siempre, pero un texto no clasifica.
    if ((err.message && err.message.includes("Stock insuficiente")) || err.limitante) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          limitante: err.limitante || undefined,
          code: err.limitante ? CODIGO_RECHAZO_VENTA.STOCK_INSUFICIENTE : undefined,
        },
        { status: err.status || 409 }
      );
    }
    
    if (err.message && err.message.includes("Saldo de puntos")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 409 }
      );
    }
    
    // DOS REINTENTOS SIMULTÁNEOS DE LA MISMA VENTA. Los dos pasaron la consulta
    // de idempotencia de arriba antes de que el otro creara la venta, y éste
    // chocó contra el índice único de `clientTxnId` al crearla. Su transacción
    // ya se revirtió entera —venta, pagos, stock, movimientos, libros—: no
    // escribió nada. Si la venta que ganó es del MISMO local y turno, esto es un
    // reintento y recibe esa venta, como en la consulta de arriba. Cualquier
    // otro P2002 —el número de venta, otra tabla— sigue siendo un conflicto.
    if (esChoqueDeClientTxnId(err) && pedidoIdempotente) {
      try {
        const ganadora = await buscarVentaPorTxn(pedidoIdempotente.txnId);
        if (esMismoDestino(ganadora, pedidoIdempotente)) {
          return await responderDuplicada(ganadora, pedidoIdempotente.txnId);
        }
      } catch (errBusqueda) {
        console.error("Error buscando la venta del reintento simultáneo:", errBusqueda);
      }
    }

    // Error de unique constraint (clientTxnId duplicado o número duplicado)
    if (err.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: "Error de concurrencia. Intenta nuevamente." },
        { status: 409 }
      );
    }
    
    // Un producto que no está en el local responde lo de siempre (500, mismo
    // mensaje), pero con su código: el cobro offline que lo pide no se arregla
    // reintentando.
    return NextResponse.json(
      {
        ok: false,
        error: "Error interno al registrar la venta",
        code: err.esProductoNoEnLocal ? CODIGO_RECHAZO_VENTA.PRODUCTO_NO_EN_LOCAL : undefined,
      },
      { status: 500 }
    );
  }
}

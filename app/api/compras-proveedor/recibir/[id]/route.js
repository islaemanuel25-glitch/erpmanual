// app/api/compras-proveedor/recibir/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { subtotalLinea } from "@/lib/compras-proveedor/calculoPedido";
import { costoLineaAMaestro, actualizarCostoRealProducto } from "@/lib/compras-proveedor/costoMaestro";
import { esFiambreFijoEnUbicacion, elDepositoCuentaPorKilo } from "@/lib/conversiones/stock";
import {
  clasificarDiferenciaCosto,
  decidirEscrituraDeCosto,
  cantidadesNegativas,
} from "@/lib/compras-proveedor/fronteraCosto";
import { esComboBase } from "@/lib/combos/guards";
import { unidadFisicaDelIngreso } from "@/lib/compras-proveedor/stockIngresado";
import { laCantidadCuadraConElPrecio } from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";
import { pedidoEnAlcance, ownerLocalIdDePedido } from "@/lib/compras/scope";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { ErrorParaLaPersona, esParaLaPersona } from "@/lib/compras-proveedor/errorParaLaPersona";
import { formatearMoneda } from "@/lib/moneda";
import { aCentavos } from "@/lib/compras-proveedor/comprobante/impuestos";
import {
  decisionDeCostoSugerida,
  textoDeLaDiferencia,
  VARIACION_POR_DEFECTO,
} from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import {
  planDelPagoInicial,
  resolverTotalDelCierre,
  estadoSacaPlata,
} from "@/lib/compras-proveedor/pagoDelCierre";
import { PERMISO_REGISTRAR_PAGOS, leerFechaOpcional } from "@/lib/finanzas/pagosProveedores";
import {
  ERROR_OPERAR_EN_LA_UBICACION_DE_LA_DEUDA,
  ERROR_ORIGEN_DE_OTRA_UBICACION,
  ErrorPagoProveedor,
  SELECT_CUENTA,
  crearCuentaPorPagarDesdeCompra,
  serializarCuenta,
} from "@/lib/finanzas/pagosProveedoresServer";

/** Otro envío ya cerró este pedido mientras éste esperaba el lock. */
class CierreYaHecho extends Error {}

/**
 * LO QUE CONTESTA EL CIERRE, haya escrito o no.
 *
 * Es la misma forma para el cierre nuevo y para el reintento: el pedido como
 * quedó y su cuenta por pagar con total, pagado, saldo y estado —de
 * `serializarCuenta`, la misma de Finanzas—. Si el pedido no terminó RECIBIDO
 * —lo anularon mientras tanto—, no es un reintento y se dice.
 */
async function respuestaDelCierre(pedidoId, { repetido = false, decisionesDeCosto = [] } = {}) {
  const updated = await prisma.pedidoProveedor.findUnique({
    where: { id: pedidoId },
    include: {
      proveedor: { select: { id: true, nombre: true } },
      deposito: { select: { id: true, nombre: true } },
      cuentaPorPagar: { select: SELECT_CUENTA },
      detalles: {
        include: {
          producto: {
            include: {
              base: { select: { id: true, nombre: true, sku: true, modoCompraProveedor: true } },
            },
          },
        },
      },
    },
  });
  if (updated?.estado !== "RECIBIDO") {
    return NextResponse.json(
      { ok: false, error: `El pedido no se pudo cerrar: está ${updated?.estado || "sin estado"}.` },
      { status: 409 }
    );
  }
  const { cuentaPorPagar, ...item } = updated;
  return NextResponse.json({
    ok: true,
    repetido,
    item,
    cuentaPorPagar: cuentaPorPagar ? serializarCuenta(cuentaPorPagar) : null,
    decisionesDeCosto,
  });
}

// Resuelve el ProductoLocal DESTINO (de la ubicación dueña del pedido) para una
// línea. Para el depósito es el mismo que ya trae la línea. Para un local, busca
// —o crea, heredando precios del PL de origen— el ProductoLocal de ese local para
// la misma base, de modo que el stock entre en el local y no en el depósito.
async function resolverProductoLocalDestino(tx, ownerLocalId, depositoId, det, base) {
  if (Number(ownerLocalId) === Number(depositoId)) return det.productoLocalId;
  const baseId = base.id;
  const existing = await tx.productoLocal.findUnique({
    where: { localId_baseId: { localId: ownerLocalId, baseId } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const src = det.producto; // ProductoLocal del depósito (origen de precios)
  const created = await tx.productoLocal.create({
    data: {
      localId: ownerLocalId,
      baseId,
      precio_costo: src?.precio_costo ?? null,
      precio_venta: src?.precio_venta ?? null,
      margen: src?.margen ?? null,
      activo: true,
    },
    select: { id: true },
  });
  return created.id;
}

export async function POST(req, { params }) {
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

    const { id } = await params;
    const pedidoId = Number(id);

    if (!pedidoId) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
      include: {
        // Para poder nombrarlo cuando el cierre frena por una diferencia de
        // precio: "Paty cobra X y tu precio es Y" dice más que "el proveedor".
        proveedor: { select: { id: true, nombre: true } },
        detalles: {
          include: {
            producto: {
              include: {
                base: {
                  select: {
                    id: true,
                    // El NOMBRE no es decoración: sin él, el mensaje que frena
                    // el cierre dice "Un producto" y no hay forma de saber cuál
                    // abrir. Fue exactamente lo que pasó el 2026-09-22.
                    nombre: true,
                    es_combo: true,
                    factor_pack: true,
                    modoCompraProveedor: true,
                    modoVentaDeposito: true,
                    unidad_medida: true,
                    pesoReferenciaKg: true,
                    pesoEsFijo: true,
                    pesoPromedioKg: true,
                    actualizaPromedioPorRecepcion: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!pedido || pedido.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }
    // Escritura sobre pedido de otra ubicación del mismo grupo → 403.
    if (!pedidoEnAlcance(pedido, { grupoId, localId })) {
      return NextResponse.json(
        { ok: false, error: "Pedido fuera de tu alcance" },
        { status: 403 }
      );
    }

    // ── EL MISMO CIERRE, OTRA VEZ ─────────────────────────────────────────
    //
    // Doble toque, reintento o respuesta perdida: el pedido ya está RECIBIDO
    // porque el primer envío terminó. No se vuelve a cerrar nada —ni stock, ni
    // cuenta, ni pago—: se devuelve lo que quedó, marcado `repetido`. Quien
    // reintenta necesita saber cómo terminó, no un "estado inválido".
    if (pedido.estado === "RECIBIDO") {
      return respuestaDelCierre(pedidoId, { repetido: true });
    }

    // Solo ENVIADO → RECIBIDO
    if (pedido.estado !== "ENVIADO") {
      return NextResponse.json(
        {
          ok: false,
          error: `Solo se puede recibir un pedido en estado ENVIADO. Estado actual: ${pedido.estado}`,
        },
        { status: 400 }
      );
    }

    // Leer cantidades recibidas del body (opcional — si no vienen, usa cantidad pedida)
    const body = await req.json().catch(() => ({}));
    const recibidos = body.recibidos || {}; // { detalleId: cantidadRecibida }
    const kgRecibidosMap = body.kgRecibidos || {}; // { detalleId: kgReales }
    // ── LO QUE LA HOJA DE CORREGIR AGREGA AL CONTEO ─────────────────────
    //
    // `sueltas` son unidades sueltas además de los bultos enteros, y `motivos`
    // es por qué la cantidad no coincide. Los dos llegan como mapas por
    // detalle, igual que las cantidades, y se escriben en la misma pasada: son
    // parte del mismo conteo y separarlos dejaría una recepción guardada a
    // medias si una de las dos escrituras fallara.
    const sueltasMap = body.sueltas || {}; // { detalleId: unidadesSueltas }
    // Las unidades que la hoja mostró en "Entra al stock", por línea. Gana
    // sobre deducir la escala acá: ver el comentario en el cálculo del
    // incremento.
    const fisicasMap = body.fisicas || {}; // { detalleId: unidadesFisicas }
    const motivosMap = body.motivos || {}; // { detalleId: { principal, detalle } }

    // ── LA FRONTERA ENTRE RECIBIR Y ESCRIBIR EL COSTO ────────────────────
    //
    // Hasta el 2026-08-11 recibir escribía el costo maestro de TODAS las
    // líneas, sin excepción. Estas dos listas permiten separar las decisiones:
    // la mercadería entra igual, el costo se toca o no.
    //
    // AMBAS SON OPCIONALES Y VACÍAS POR DEFECTO, así que un cliente que no las
    // mande —la pantalla de compras de hoy— se comporta exactamente como antes.
    // Es a propósito: este cambio no puede alterar lo que ya funciona.
    const costosExcluidos = new Set(
      (Array.isArray(body.costosExcluidos) ? body.costosExcluidos : []).map(Number).filter(Number.isFinite)
    );
    const costosAceptados = new Set(
      (Array.isArray(body.costosAceptados) ? body.costosAceptados : []).map(Number).filter(Number.isFinite)
    );
    const decisionesDeCosto = []; // para informar qué se escribió y qué no

    // ── LOS UMBRALES, Y QUIÉN GOBIERNA A QUIÉN ───────────────────────────
    //
    // Los dos números entran por el cuerpo del pedido y tienen su default en
    // UNA sola constante (lib/compras-proveedor/fronteraCosto.js). Dónde se
    // guardan —por proveedor, global o por comprobante— todavía no está
    // decidido; cuando se decida, el que los lea se los pasa acá.
    const umbralesDeCosto = {
      revisarPct: body.umbralRevisarPct,
      sospechaBajaPct: body.umbralSospechaBajaPct,
    };

    // La regla de umbrales SOLO gobierna si el cliente la pide. Es deliberado:
    // la pantalla de compras de hoy no tiene forma de aceptar una línea marcada,
    // así que si los umbrales rigieran de entrada, esa pantalla dejaría de
    // escribir costos por encima del 5 % y nadie tendría cómo autorizarlos.
    //
    // La exclusión explícita, en cambio, SIEMPRE se respeta: si alguien se tomó
    // el trabajo de listar una línea, es una intención, no un default.
    const fronteraCostoActiva = body.fronteraCostoActiva === true;

    // ── NEGATIVOS: se frena, no se convierte en cero ─────────────────────
    //
    // `toUnidades` devuelve 0 ante una cantidad negativa, sin error y sin aviso
    // (lib/conversiones/stock.js:23). Con un remito interno eso no pasaba; con
    // una factura sí, en cuanto aparezca una nota de crédito o una devolución.
    // NO se toca `toUnidades` en esta tanda: todavía no está decidido si las
    // notas de crédito entran por acá, y cambiarla toca transferencias y stock.
    // Hasta que se decida, frenar es la respuesta honesta.
    const negativos = cantidadesNegativas(
      Object.entries(recibidos).map(([id, cantidad]) => ({ id: Number(id), cantidad }))
    );
    if (negativos.hay) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Hay líneas con cantidad negativa. Este módulo todavía no acepta notas de crédito ni devoluciones: " +
            "convertirlas en cero perdería el dato sin avisar, así que se frena.",
          detallesConNegativo: negativos.ids,
        },
        { status: 400 }
      );
    }

    // --- Factura (opcionales) ---
    // totalFactura se computa en la transacción desde cantRecibida * precioCosto,
    // y es un CONTROL interno. `totalReal` ya no viene suelto del cliente: es la
    // deuda con el proveedor y se resuelve abajo, con el pago.
    let nroFactura = null;
    let fechaFactura = null;

    if (body.nroFactura !== undefined && body.nroFactura !== null) {
      const nf = String(body.nroFactura).trim();
      nroFactura = nf || null;
    }

    if (body.fechaFactura !== undefined && body.fechaFactura !== "" && body.fechaFactura !== null) {
      const ff = new Date(body.fechaFactura);
      if (isNaN(ff.getTime())) {
        return NextResponse.json(
          { ok: false, error: "fechaFactura inválida" },
          { status: 400 }
        );
      }
      fechaFactura = ff;
    }

    // --- Costos editados por ítem (opcionales) ---
    const costosMap = body.costos || {}; // { detalleId: precioCosto }

    for (const [detId, costo] of Object.entries(costosMap)) {
      if (costo === "" || costo === null) continue;
      const c = Number(costo);
      if (!Number.isFinite(c) || c < 0) {
        return NextResponse.json(
          { ok: false, error: `precioCosto debe ser un número >= 0 (detalleId: ${detId})` },
          { status: 400 }
        );
      }
    }

    // Validar cantidades recibidas: entero finito >= 0
    for (const [detId, cant] of Object.entries(recibidos)) {
      const c = Number(cant);
      if (!Number.isFinite(c) || !Number.isInteger(c) || c < 0) {
        return NextResponse.json(
          { ok: false, error: `cantidad debe ser un entero >= 0 (detalleId: ${detId})` },
          { status: 400 }
        );
      }
    }

    // Validar kg recibidos para fiambres
    for (const [detId, sueltas] of Object.entries(sueltasMap)) {
      if (sueltas === "" || sueltas === null || sueltas === undefined) continue;
      const sv = Number(sueltas);
      if (!Number.isInteger(sv) || sv < 0) {
        return NextResponse.json(
          { ok: false, error: `unidadesSueltas debe ser un entero >= 0 (detalleId: ${detId})` },
          { status: 400 }
        );
      }
    }

    for (const [detId, kg] of Object.entries(kgRecibidosMap)) {
      const k = Number(kg);
      if (!Number.isFinite(k) || k < 0) {
        return NextResponse.json(
          { ok: false, error: `kgRecibidos debe ser un numero >= 0 (detalleId: ${detId})` },
          { status: 400 }
        );
      }
    }

    // El stock entra en la UBICACIÓN DUEÑA del pedido (creadoEnLocalId), fijada
    // desde el contexto al crear — NO se toma del body ni cambia en la recepción.
    // Para el depósito coincide con depositoId (caso normal).
    //
    // Y ES TAMBIÉN DE QUIÉN ES EL GASTO: la deuda con el proveedor nace a nombre
    // de esta misma ubicación, sin que el cliente la mande.
    const ownerLocalId = ownerLocalIdDePedido(pedido);

    // ── EL PAGO AL PROVEEDOR: TODO SE DECIDE ANTES DE ESCRIBIR NADA ─────────
    //
    // La deuda, el pago inicial, el permiso y el origen del dinero se validan
    // acá, antes de abrir la transacción. Lo que solo se puede comprobar
    // escribiendo —que el turno siga abierto al tomar su lock— lo comprueba
    // `registrarPagoProveedor` adentro, y si falla la transacción entera vuelve
    // atrás: no queda stock, ni compra cerrada, ni cuenta, ni retiro.
    const pagoAlProveedor = body.pagoAlProveedor || {};
    const estadoDelPago = pagoAlProveedor.estado;

    // Sacar plata es escritura financiera y pide su permiso; dejarla PENDIENTE
    // no saca nada —solo nace la obligación que la compra ya generó— y alcanza
    // con el de Compras. Se chequea antes que todo lo demás del pago: sin
    // permiso no hace falta ni leer las facturas.
    if (estadoSacaPlata(estadoDelPago)) {
      const permPago = checkPerm(session, PERMISO_REGISTRAR_PAGOS);
      if (!permPago.ok) {
        return NextResponse.json({ ok: false, error: permPago.error }, { status: permPago.status });
      }
    }

    // LA DEUDA ES LO QUE FACTURA EL PROVEEDOR. Los comprobantes son los mismos
    // que muestra la conciliación: los de este pedido y este grupo, sin los
    // anulados.
    const facturasDelPedido = await prisma.comprobanteProveedor.findMany({
      where: { grupoId, pedidoId, estado: { not: "ANULADO" } },
      select: { totalLeido: true },
    });
    const deuda = resolverTotalDelCierre({
      totales: facturasDelPedido.map((c) => c.totalLeido),
      totalConfirmado: pagoAlProveedor.totalAPagar,
      confirmado: pagoAlProveedor.totalConfirmado === true,
    });
    if (deuda.error) {
      return NextResponse.json(
        { ok: false, error: deuda.error, queHacer: deuda.error, pideTotal: deuda.pideTotal },
        { status: 400 }
      );
    }
    const totalDeLaDeuda = deuda.centavos / 100;

    const plan = planDelPagoInicial({
      estado: estadoDelPago,
      totalCentavos: deuda.centavos,
      pago: pagoAlProveedor.pago,
    });
    if (plan.error) {
      return NextResponse.json({ ok: false, error: plan.error, queHacer: plan.error }, { status: 400 });
    }

    const vencimiento = leerFechaOpcional(pagoAlProveedor.vencimientoProveedor);
    if (vencimiento.error) {
      return NextResponse.json({ ok: false, error: vencimiento.error }, { status: 400 });
    }

    // ── DE DÓNDE SALE LA PLATA: DE LA UBICACIÓN QUE COMPRA ───────────────
    //
    // No se elige. La deuda es de la ubicación dueña del pedido y la paga esa
    // ubicación, con su plata, registrada por quien la opera. Acá solo se
    // deriva y se rechaza temprano; la regla y la última defensa viven en
    // `registrarPagoProveedor`, que vuelve a exigir las dos igualdades.
    //
    // Un origen distinto en el cuerpo es 403 y no se corrige en silencio: el
    // depósito cerrando su compra "con la plata de Casiano" es un cruce y se
    // tiene que ver. Pendiente no pasa por acá: no hay pago.
    let pagoInicial = null;
    if (plan.pagoInicial) {
      if (Number(localId) !== Number(ownerLocalId)) {
        return NextResponse.json(
          { ok: false, error: ERROR_OPERAR_EN_LA_UBICACION_DE_LA_DEUDA },
          { status: 403 }
        );
      }
      const pedidoOrigen = pagoAlProveedor.pago?.localOrigenId;
      if (
        pedidoOrigen !== undefined &&
        pedidoOrigen !== null &&
        pedidoOrigen !== "" &&
        Number(pedidoOrigen) !== Number(ownerLocalId)
      ) {
        return NextResponse.json({ ok: false, error: ERROR_ORIGEN_DE_OTRA_UBICACION }, { status: 403 });
      }
      pagoInicial = { ...plan.pagoInicial, localOrigenId: ownerLocalId };
    }

    // La ubicación decide la UNIDAD en la que entra el fiambre de pieza fija:
    // piezas en el depósito, kilos en un local. El pedido no trae este dato —su
    // include no tiene ninguna relación a Local, solo ids— así que se consulta
    // acá, antes de abrir la transacción.
    //
    // Sin esto, la recepción sumaba PIEZAS a la fila de un local mientras el POS
    // de ese local descontaba KILOS del mismo número. Es la forma canónica de
    // preguntarlo, la misma que ya usan el POS y stock_locales.
    const ubicacionDestino = await prisma.local.findUnique({
      where: { id: ownerLocalId },
      select: { es_deposito: true },
    });
    const destinoEsDeposito = ubicacionDestino?.es_deposito === true;

    // ── LO QUE EL PAPEL FACTURÓ DE CADA LÍNEA, PARA COMPROBAR LA ESCALA ──
    //
    // El precio delata la escala: lo que entra al stock, valuado al precio que
    // el papel cobra por unidad, tiene que dar su subtotal. Para preguntarlo
    // hacen falta los dos números del renglón, y viven en el comprobante.
    //
    // Una consulta sola para todo el pedido, antes de abrir la transacción: lo
    // que se lee no tiene por qué estar adentro, y tener el bloqueo abierto
    // mientras se consulta alarga la transacción que escribe stock.
    //
    // Si una línea del pedido tiene DOS renglones del papel, no se mira: ahí lo
    // que entra es la suma de los dos y la igualdad no aplica renglón a renglón.
    const lineasDelPapel = await prisma.comprobanteLinea.findMany({
      where: {
        comprobante: { pedidoId, grupoId, estado: { not: "ANULADO" } },
        pedidoDetalleId: { not: null },
      },
      select: {
        pedidoDetalleId: true,
        cantidad: true,
        subtotalImpreso: true,
        subtotalCorregido: true,
        // El precio que alguien ACEPTÓ para este renglón. Lo escribe
        // `aceptar-precio` y solo cuando la respuesta es "aceptar el precio
        // nuevo" —"dejar el que tenía" no lo toca—, y `vincular` lo borra si el
        // renglón cambia de producto. Ver `aceptadoEnElPapel`, abajo.
        costoFinalUnitario: true,
      },
    });
    // ── LO QUE YA SE ACEPTÓ EN ESTA RECEPCIÓN, POR LÍNEA DEL PEDIDO ──────
    //
    // El freno de abajo deja pasar un costo fuera de la variación si "la
    // persona aceptó ese costo en esta misma recepción". Esa aceptación ya
    // está guardada: "Aceptar el precio nuevo" en la hoja de Corregir escribe
    // el mismo número en la línea del pedido y en `costoFinalUnitario` de su
    // renglón. La pantalla no la manda en `costosAceptados`, así que sin leerla
    // acá un aumento aceptado volvía a frenar el cierre cada vez, sin salida.
    //
    // Se guardan en centavos —la escala del costo de la línea que manda la
    // pantalla— y se compara contra el costo que va a escribir el cierre:
    // aceptar 1.150 no autoriza a escribir 30.000.
    const aceptadosEnElPapel = new Map();
    for (const l of lineasDelPapel) {
      if (l.costoFinalUnitario == null) continue;
      const aceptados = aceptadosEnElPapel.get(l.pedidoDetalleId) ?? new Set();
      aceptados.add(aCentavos(l.costoFinalUnitario));
      aceptadosEnElPapel.set(l.pedidoDetalleId, aceptados);
    }
    const aceptadoEnElPapel = (detalleId, costo) =>
      aceptadosEnElPapel.get(detalleId)?.has(aCentavos(costo)) === true;
    // ── CUÁNTO SE LE MUEVE EL PRECIO A ESTE PROVEEDOR ───────────────────
    //
    // La misma pregunta que hace la hoja de Corregir, contestada con la misma
    // receta: un costo que cae fuera de esa variación no se escribe si la
    // persona no lo eligió en esta recepción. Reemplaza al freno de "más de
    // tres veces", que era un número del sistema y no del proveedor.
    const recetaDelProveedor = pedido.proveedorId
      ? await prisma.recetaProveedor.findFirst({
          where: { grupoId, proveedorId: pedido.proveedorId },
          select: { variacionNormalPct: true },
        })
      : null;
    const variacionNormalPct =
      recetaDelProveedor?.variacionNormalPct != null
        ? Number(recetaDelProveedor.variacionNormalPct)
        : VARIACION_POR_DEFECTO;
    const nombreDelProveedor = pedido.proveedor?.nombre || "Este proveedor";

    const lineaDelPapelPorDetalle = new Map();
    const repetidos = new Set();
    for (const l of lineasDelPapel) {
      if (lineaDelPapelPorDetalle.has(l.pedidoDetalleId)) repetidos.add(l.pedidoDetalleId);
      lineaDelPapelPorDetalle.set(l.pedidoDetalleId, l);
    }
    for (const d of repetidos) lineaDelPapelPorDetalle.delete(d);

    // Transacción: incrementar stock + marcar recibido
    await prisma.$transaction(async (tx) => {
      // ── UN SOLO CIERRE POR PEDIDO, AUNQUE LLEGUEN DOS A LA VEZ ───────────
      //
      // El chequeo de ENVIADO de arriba se hizo sin lock: dos envíos
      // simultáneos lo pasan los dos. Acá se toma el lock de la fila y se
      // vuelve a preguntar; el segundo espera al primero, lo encuentra
      // RECIBIDO y sale sin escribir nada —ni stock, ni cuenta, ni pago—.
      // Detrás quedan dos redes en la base: el UNIQUE de la cuenta por pedido
      // y el de la clave del pago inicial.
      await tx.$queryRaw`SELECT id FROM "PedidoProveedor" WHERE id = ${pedidoId} FOR UPDATE`;
      const vigente = await tx.pedidoProveedor.findUnique({
        where: { id: pedidoId },
        select: { estado: true },
      });
      if (vigente?.estado !== "ENVIADO") throw new CierreYaHecho();

      let totalFacturaComputed = 0;

      for (const det of pedido.detalles) {
        // ── LO QUE NADIE CONTÓ NO ENTRA AL STOCK ──────────────────────────
        //
        // Acá decía: sin cantidad declarada, `Number(det.cantidad)` — o sea, se
        // daba por recibido TODO lo pedido. Medido sobre el pedido 232: nueve
        // líneas que ningún comprobante trajo entraron igual, con la cantidad
        // pedida, y metieron 620 unidades por $1.263.705,60 que nadie vio
        // llegar. El stock queda más alto que la realidad y la diferencia
        // recién aparece cuando alguien cuenta el depósito.
        //
        // Ahora lo que no se declaró vale CERO. La pantalla declara línea por
        // línea, incluida la respuesta "no llegó", y el servidor no completa
        // por su cuenta: completar es inventar.
        const declarada = recibidos[det.id];
        const seDeclaro = declarada !== undefined && declarada !== null && declarada !== "";
        const cantRecibida = seDeclaro ? Number(declarada) : 0;

        const base = det.producto?.base;
        const modoCompra = base?.modoCompraProveedor || "BULTO";

        // ── LOS KILOS QUE LA HOJA MOSTRÓ ENTRAN COMO KILOS ─────────────────
        //
        // La hoja de Corregir pide kilos cuando `elDepositoCuentaPorKilo` dice
        // que el depósito guarda ese producto por peso, y ése NO es el mismo
        // conjunto que `modoCompraProveedor === "UNIDAD"`. Medido contra
        // producción: de los 60 productos activos que el depósito cuenta por
        // kilo, **36 se compran por bulto** —Trozado, Pechuga, pan, Cebolla—.
        // En esos, la hoja mostraba "Entra al stock 12,5 kg" y esta cuenta
        // escribía 12 unidades: el mismo renglón en dos unidades distintas.
        //
        // Se agrega la condición en vez de cambiarla para no tocar lo que pasa
        // cuando NADIE pesó: ahí los 36 siguen entrando como hasta hoy. Lo que
        // cambia es solo que unos kilos cargados a mano dejan de perderse.
        const kilosDeLaHoja = kgRecibidosMap[det.id];
        const hayKilosDeLaHoja =
          kilosDeLaHoja !== undefined &&
          kilosDeLaHoja !== null &&
          kilosDeLaHoja !== "" &&
          Number.isFinite(Number(kilosDeLaHoja)) &&
          Number(kilosDeLaHoja) > 0;
        const vaPorPeso = modoCompra === "UNIDAD" || (elDepositoCuentaPorKilo(base) && hayKilosDeLaHoja);

        // ── EN QUÉ QUEDA CONTADO LO QUE ENTRA ──────────────────────────────
        //
        // Sale de `vaPorPeso` —la misma variable que elige la rama de abajo— y
        // de `esFiambreFijoEnUbicacion`, que es con lo que la rama de peso
        // elige piezas o kilos. Se congela junto con el número: es lo que
        // permite leer "3" como tres piezas y no como tres kilos cuando el
        // producto ya cambió de modo.
        const unidadIngreso = unidadFisicaDelIngreso({ vaPorPeso, base, destinoEsDeposito });

        if (cantRecibida <= 0) {
          // UN CERO DECLARADO ES UN DATO: "se contó y no llegó". Se guarda,
          // porque es distinto de `null` —nunca se contó— y esa diferencia es
          // la que deja saber después si alguien miró la línea.
          const detCero = seDeclaro ? { cantidadRecibida: 0 } : {};
          // Y lo que este cierre sumó a `StockLocal` por la línea también es un
          // dato, declarada o no: sumó 0, y eso se sabe con certeza. OJO: es el
          // movimiento que registró el ERP, NO que se haya comprobado que
          // físicamente llegaron cero —una línea ausente del cuerpo no la contó
          // nadie—. El NULL queda para lo que no tiene un hecho de stock: el
          // combo —no mueve stock— y la compra recibida antes de que esto se
          // guardara.
          if (!esComboBase(base)) {
            detCero.stockIngresado = 0;
            detCero.stockIngresadoUnidad = unidadIngreso;
          }
          if (Object.keys(detCero).length) {
            await tx.pedidoProveedorDetalle.update({
              where: { id: det.id },
              data: detCero,
            });
          }
          continue;
        }

        // Los combos no reciben StockLocal ni actualizan costo físico.
        if (esComboBase(base)) continue;

        let incremento;
        let kgReales = null;

        if (vaPorPeso) {
          // FIAMBRE: stock incrementa por kg reales, no por unidades
          kgReales = kgRecibidosMap[det.id] !== undefined
            ? Number(kgRecibidosMap[det.id])
            : null;

          if (kgReales === null || kgReales <= 0) {
            // Fallback: estimar desde pesoReferencia * cantRecibida
            const pesoRef = Number(base.pesoReferenciaKg || 1);
            kgReales = cantRecibida * pesoRef;
          }

          // La unidad depende de DÓNDE entra el stock, no solo del producto:
          // - Fiambre fijo EN EL DEPÓSITO: se cuenta en PIEZAS. Recibir 10
          //   piezas suma +10 (NO +60). Los kg son solo equivalencia.
          // - Fiambre fijo EN UN LOCAL: se cuenta en KILOS, igual que lo lee el
          //   POS de ese local y que lo escribe una transferencia.
          // - Fiambre variable, en cualquier lado: se cuenta en kg (kgReales).
          incremento = esFiambreFijoEnUbicacion(base, destinoEsDeposito)
            ? cantRecibida
            : kgReales;

          // Actualizar pesoPromedioKg si está habilitado
          if (base.actualizaPromedioPorRecepcion && cantRecibida > 0 && kgReales > 0) {
            const nuevoPesoPromedio = kgReales / cantRecibida;
            await tx.productoBase.update({
              where: { id: base.id },
              data: { pesoPromedioKg: nuevoPesoPromedio },
            });
          }
        } else {
          // No-fiambre: el StockLocal del depósito SIEMPRE se guarda en UNIDADES.
          //
          // ── LO QUE LA HOJA DIJO QUE ENTRA, GANA ─────────────────────────
          //
          // La pantalla manda `fisicas`: el número que la franja "Entra al
          // stock" mostró antes de guardar. Acá se deducía con `det.unidad`, y
          // ése es un TERCER lugar donde se decide la escala —los otros dos son
          // la tarjeta y la hoja—. Sobre la Hamburguesa Paty del pedido 242 los
          // tres no coincidían: la hoja mostraba 3 bultos de 30 y esta cuenta
          // los entraba como 3 unidades sueltas.
          //
          // Lo que se ve es lo que entra. Sin ese dato —una pantalla vieja, o
          // una línea que nadie abrió— se sigue deduciendo como antes.
          const factorPack = Math.max(1, Number(base?.factor_pack || 1));
          const declaradasFisicas = fisicasMap[det.id];
          const hayFisicas =
            declaradasFisicas !== undefined &&
            declaradasFisicas !== null &&
            declaradasFisicas !== "" &&
            Number.isFinite(Number(declaradasFisicas)) &&
            Number(declaradasFisicas) > 0;
          incremento = hayFisicas
            ? Number(declaradasFisicas)
            : cantRecibida * (det.unidad === "UNIDAD" ? 1 : factorPack);

          // ── EL PRECIO DELATA LA ESCALA ─────────────────────────────────
          //
          // Antes de escribir stock: lo que va a entrar, valuado al precio que
          // el papel cobra por unidad, tiene que dar el subtotal del papel. Si
          // no da, la cantidad está en otra unidad y entraría mal.
          //
          // NO se mira cuando la persona declaró una diferencia: ahí está
          // diciendo a propósito que llegó otra cosa que la facturada, y eso es
          // exactamente lo que la recepción existe para registrar.
          const delPapel = lineaDelPapelPorDetalle.get(det.id);
          const motivoDeclarado = motivosMap[det.id]?.principal;
          if (delPapel && !motivoDeclarado) {
            const r = laCantidadCuadraConElPrecio({
              // Lo corregido manda: el control de escala tiene que mirar el
              // importe que el papel cobra de verdad, no el dígito mal leído.
              subtotal: delPapel.subtotalCorregido ?? delPapel.subtotalImpreso,
              cantidad: delPapel.cantidad,
              fisicas: incremento,
              // Cuántas unidades trae un bulto: sin esto, un papel que factura
              // POR BULTO —el Queso Rallado del 242 dice 6 y entran 120— se
              // acusa como error de escala siendo perfecto.
              factorPack,
            });
            if (r.aplica && !r.cuadra) {
              throw new ErrorParaLaPersona(
                `${base?.nombre || "Un producto"}: entrarían ${incremento} unidades al stock y el ` +
                  `papel factura ${r.esperado}. La cantidad está en otra unidad — abrí Corregir y ` +
                  `revisá si son bultos o unidades sueltas.`
              );
            }
          }
        }

        // ProductoLocal de la ubicación DESTINO (dueña del pedido).
        const plDestino = await resolverProductoLocalDestino(
          tx, ownerLocalId, pedido.depositoId, det, base
        );

        await tx.stockLocal.upsert({
          where: {
            localId_productoId: {
              localId: ownerLocalId,
              productoId: plDestino,
            },
          },
          update: {
            cantidad: { increment: incremento },
          },
          create: {
            localId: ownerLocalId,
            productoId: plDestino,
            cantidad: incremento,
          },
        });

        // Actualizar cantidadRecibida y kgRecibidos en detalle
        // Actualizar detalle: cantRecibida, kg, y costo si fue editado
        const detData = {
          cantidadRecibida: cantRecibida,
          kgRecibidos: kgReales,
          // ── EL HECHO, CONGELADO ─────────────────────────────────────────
          //
          // `stockIngresado` es el delta que ESTA línea aplicó a `StockLocal`
          // en esta recepción: lo que el ERP registró, no una comprobación
          // física de lo que mandó el proveedor. Es la MISMA variable que acaba
          // de ir al `increment` de arriba, en la misma transacción: si una de
          // las dos escrituras falla, no queda ninguna. No se recalcula acá con
          // `cantRecibida × factor_pack` ni con nada del producto — eso es
          // exactamente lo que cambia después.
          stockIngresado: incremento,
          stockIngresadoUnidad: unidadIngreso,
        };

        // Las sueltas y el motivo solo se escriben si vinieron: un `undefined`
        // no puede borrar lo que alguien anotó en una pasada anterior, y un 0
        // escrito por omisión diría "se contó y no había", que es un dato que
        // nadie cargó.
        const sueltas = sueltasMap[det.id];
        if (sueltas !== undefined && sueltas !== "" && sueltas !== null) {
          detData.unidadesSueltas = Number(sueltas);
        }
        const motivo = motivosMap[det.id];
        if (motivo !== undefined) {
          detData.motivoPrincipal = motivo?.principal || null;
          detData.motivoDetalle = motivo?.detalle || null;
        }

        const costoEditado = costosMap[det.id];
        if (costoEditado !== undefined && costoEditado !== "" && costoEditado !== null) {
          const cv = Number(costoEditado);
          if (Number.isFinite(cv) && cv >= 0) {
            detData.precioCosto = cv;
          }
        }

        await tx.pedidoProveedorDetalle.update({
          where: { id: det.id },
          data: detData,
        });

        // Acumular totalFactura con la fórmula económica única.
        // Fiambre: kg × costo (kg reales recibidos); resto: cantRecibida × costo.
        const costoFinal = detData.precioCosto !== undefined
          ? Number(detData.precioCosto)
          : Number(det.precioCosto || 0);
        const { subtotal: subtotalEconomico } = subtotalLinea({
          base,
          cantidad: cantRecibida,
          costo: costoFinal,
          kg: kgReales,
        });
        totalFacturaComputed += subtotalEconomico || 0;

        // Reconfirmar el costo real/maestro del producto con el costo recibido (solo costo).
        const costoMaestro = costoLineaAMaestro({
          precioCosto: costoFinal,
          unidad: det.unidad,
          factorPack: base?.factor_pack,
          modoCompraProveedor: base?.modoCompraProveedor,
          unidadMedida: base?.unidad_medida,
          // Con qué comparar para saber en qué escala está el costo de la
          // línea. Sin esto, un costo ya guardado POR BULTO en una línea en
          // escala UNIDAD se vuelve a multiplicar por el factor.
          costoActual: base?.precio_costo ?? null,
        });

        // ── LA FRONTERA ─────────────────────────────────────────────────
        //
        // Todo lo de arriba —el stock, el detalle del pedido, el total de la
        // factura— ya ocurrió y NO depende de esta decisión. Lo único que
        // cuelga de acá es la propagación del costo al producto y a sus
        // ubicaciones. Si no se escribe, la mercadería entró igual.
        //
        // El costo del catálogo se compara contra el maestro, que es la misma
        // escala en la que se escribiría: comparar contra el precio de línea
        // daría porcentajes falsos en cuanto haya un pack de por medio.
        const clasificacion = clasificarDiferenciaCosto({
          costoAnterior: Number(base?.precio_costo ?? 0),
          costoNuevo: costoMaestro,
          umbrales: umbralesDeCosto,
        });
        // Aceptado en esta recepción: lo que mandó quien llama, o lo que la
        // hoja de Corregir ya dejó guardado para ESTE costo.
        const aceptada = costosAceptados.has(det.id) || aceptadoEnElPapel(det.id, costoFinal);
        const decision = decidirEscrituraDeCosto({
          clasificacion,
          excluidaAMano: costosExcluidos.has(det.id),
          aceptada,
          hayCosto: Number.isFinite(costoMaestro) && costoMaestro > 0,
        });
        // Con la frontera apagada se conserva el comportamiento de siempre
        // —escribir— salvo que la línea esté excluida a mano. La clasificación
        // se calcula igual y viaja en la respuesta: es información gratis y sin
        // efecto, útil para ver qué pasaría antes de encender la regla.
        const escribeCosto = fronteraCostoActiva
          ? decision.escribe
          : !costosExcluidos.has(det.id);

        // ── UN COSTO NO SE MULTIPLICA NI SE DIVIDE POR TRES SIN QUE ALGUIEN LO DIGA ──
        //
        // El 2026-09-22 el cierre del pedido 242 escribió el costo de la
        // Hamburguesa Paty en $1.851.090 contra los $61.703 que tenía —treinta
        // veces— y arrastró el precio de venta de $80.300 a $2.406.500 en las
        // cinco ubicaciones. Nadie lo decidió: Emanuel había elegido justamente
        // "dejo el mío" sobre ese renglón.
        //
        // Un salto así no es un aumento: es una escala equivocada. Así que el
        // cierre FRENA, y solo pasa si la persona aceptó ese costo en esta
        // misma recepción. La mercadería no entra a medias — el cierre es una
        // transacción, así que no entra nada y se vuelve a intentar.
        //
        // ── Y SOLO FRENA LO QUE SE VA A ESCRIBIR ─────────────────────────
        //
        // Va DESPUÉS de `escribeCosto` y pregunta por él: el freno existe para
        // que un costo que nadie decidió no llegue al catálogo, y una línea
        // excluida —la que llegó sin papel— no escribe ninguno. Frenarla dejaba
        // la recepción trabada por una diferencia que después no se iba a
        // persistir, sin nada que la persona pudiera elegir para destrabarla.
        const anterior = Number(base?.precio_costo ?? 0);
        const sugerida = decisionDeCostoSugerida({
          papel: costoMaestro,
          tuyo: anterior,
          variacionPct: variacionNormalPct,
          factorPack: base?.factor_pack,
        });
        if (escribeCosto && sugerida.exigeElegir && !aceptada) {
          const aviso = textoDeLaDiferencia(sugerida, {
            proveedor: nombreDelProveedor,
            moneda: formatearMoneda,
            papel: costoMaestro,
            tuyo: anterior,
          });
          throw new ErrorParaLaPersona(
            `${base?.nombre || "Un producto"}: ${aviso} Abrí Corregir, elegí qué precio queda y ` +
              `volvé a cerrar. No entró nada.`
          );
        }

        decisionesDeCosto.push({
          detalleId: det.id,
          escribio: escribeCosto,
          motivo: escribeCosto ? null : decision.motivo,
          clase: clasificacion.clase,
          diferenciaPct: clasificacion.diferenciaPct,
          gobernadaPorUmbrales: fronteraCostoActiva,
        });

        if (escribeCosto) {
          await actualizarCostoRealProducto(tx, {
            productoLocalId: plDestino,
            costoMaestro,
            // Propiedad del costo: solo el dueño del producto mueve el costo. Un local
            // que recibe una compra de un producto del depósito NO toca el costo.
            operadoDesdeLocalId: ownerLocalId,
            depositoLocalId: pedido.depositoId,
          });
        }
      }

      // ── LO QUE LA FOTO YA SABE, NO SE VUELVE A PEDIR ───────────────────
      //
      // El número, la fecha y el total de la factura salen del comprobante
      // leído cuando la pantalla no los manda. Antes eran tres campos para
      // teclear a mano al lado del botón que los completa solo, y el manual es
      // el que se equivoca.
      //
      // Se toma el PRIMER comprobante del pedido que tenga número: con varios
      // —una factura de dos hojas subidas por separado— todos traen el mismo, y
      // si difieren es otro problema que esta ruta no resuelve.
      //
      // `totalLeido` puede venir en null y se respeta: es el papel que no trae
      // total impreso, que tiene su propio estado. Inventar ahí la suma de las
      // líneas es exactamente el agujero que el lector ya tiene documentado.
      let nroFinal = nroFactura;
      let fechaFinal = fechaFactura;
      if (nroFinal == null || fechaFinal == null) {
        const delPapel = await tx.comprobanteProveedor.findFirst({
          where: { pedidoId, grupoId },
          orderBy: { id: "asc" },
          select: { numero: true, fecha: true },
        });
        if (delPapel) {
          if (nroFinal == null && delPapel.numero) nroFinal = delPapel.numero;
          if (fechaFinal == null && delPapel.fecha) fechaFinal = delPapel.fecha;
        }
      }

      // Marcar pedido como RECIBIDO + guardar factura.
      //
      // `totalReal` es LA DEUDA: el total de las facturas, o el que la persona
      // confirmó cuando alguna no lo trae. Es el mismo número con el que nace
      // la cuenta por pagar, así que la compra y Finanzas no pueden discrepar.
      await tx.pedidoProveedor.update({
        where: { id: pedidoId },
        data: {
          estado: "RECIBIDO",
          fechaRecibido: new Date(),
          totalFactura: totalFacturaComputed,
          totalReal: totalDeLaDeuda,
          nroFactura: nroFinal,
          fechaFactura: fechaFinal,
        },
      });

      // ── Y EN LA MISMA TRANSACCIÓN, LA DEUDA Y EL PRIMER PAGO ─────────────
      //
      // Por la puerta canónica de Finanzas, sin una línea de lógica de pagos
      // acá: la cuenta nace a nombre de la ubicación dueña del pedido, y el
      // pago inicial —si hay— pasa por `registrarPagoProveedor`, con su clave
      // `compra-<pedido>-pago-inicial`, su turno operativo y su RETIRO si es
      // efectivo. Si algo de eso falla, vuelve atrás también el stock.
      await crearCuentaPorPagarDesdeCompra(tx, {
        pedidoProveedorId: pedidoId,
        localGastoId: ownerLocalId,
        total: totalDeLaDeuda,
        vencimientoProveedor: vencimiento.valor,
        // La fecha prevista es planificación interna: se decide en Finanzas.
        fechaPrevistaPago: null,
        usuarioId: session.id,
        pagoInicial,
        // La ubicación que opera quien cierra. Con pago inicial, Finanzas
        // exige que sea la del gasto.
        localOperativoId: localId,
      });
    });

    // `decisionesDeCosto` viaja siempre, esté la frontera encendida o no: quien
    // recibe tiene derecho a saber qué costos se escribieron y cuáles no, y con
    // qué diferencia porcentual. Sin esto, no escribir un costo sería tan
    // silencioso como escribirlo mal.
    return respuestaDelCierre(pedidoId, { repetido: false, decisionesDeCosto });
  } catch (err) {
    // Otro envío del mismo cierre terminó primero: se devuelve cómo quedó. El
    // P2002 es la red de abajo del lock —el UNIQUE de la cuenta por pedido o
    // el de la clave del pago inicial—, y dice lo mismo.
    if (err instanceof CierreYaHecho || err?.code === "P2002") {
      const id = Number((await params)?.id);
      if (id) return respuestaDelCierre(id, { repetido: true });
    }
    // Una regla de Finanzas que frena —el turno ya no está abierto, el origen
    // no es del grupo— vuelve con su status y su texto: no entró nada.
    if (err instanceof ErrorPagoProveedor) {
      const texto = `${err.message} No entró nada: ni la mercadería, ni la deuda, ni el pago.`;
      return NextResponse.json({ ok: false, error: texto, queHacer: texto }, { status: err.status });
    }
    // ── UNA REGLA QUE FRENA NO ES UNA FALLA DEL SISTEMA ─────────────────
    //
    // El cierre frena a propósito cuando algo no cuadra, y ese motivo está
    // escrito en castellano para quien está recibiendo. Caía en este catch y
    // salía como "Error interno al recibir pedido": el motivo quedaba solo en
    // el log del servidor y la persona veía un cartel que no dice nada y que
    // encima es falso —la aplicación contestó perfecto—.
    //
    // Pasó el 2026-09-22 a las 10:22 y a las 10:23 cerrando el pedido 242.
    if (esParaLaPersona(err)) {
      return NextResponse.json(
        { ok: false, error: err.message, queHacer: err.message },
        { status: 409 }
      );
    }
    console.error("Error compras-proveedor/recibir:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "recibir la mercadería de este pedido",
          quedo:
            "No entró nada: el cierre corre entero en una transacción, así que o entra todo o no entra nada.",
        }),
      },
      { status: 500 }
    );
  }
}

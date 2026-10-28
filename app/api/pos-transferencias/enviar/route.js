// app/api/pos-transferencias/enviar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { toUnidades, validarEnvio, esFiambreFijo, piezasToKg } from "@/lib/conversiones/stock";
import { esComboBase } from "@/lib/combos/guards";
import { crearTransferencia } from "@/lib/transferencias/crearTransferencia";
import { DESCONTAR_Y_TRANSITO } from "@/lib/transferencias/politicasStock";
import { ESTADO_PEDIDO, sinCancelados } from "@/lib/pedidos/estados";
import { bloquearParDelPedido, bloquearFilaDelPedido } from "@/lib/pedidos/bloqueoDelPedido";
import { cantidadQueViaja, estaRevisada } from "@/lib/pedidos/revisionDeLinea";
import { esDepositoDelPedido, mensajeNoEstaEnElCatalogo, productoDelDeposito } from "@/lib/pedidos/depositosDelPedido";
import {
  PRESENTACION,
  agrupa,
  presentacionDeProducto,
} from "@/lib/productos/presentacionDeProducto";

/**
 * El snapshot de presentación de una línea preparada a mano.
 *
 * Este camino SÍ sabe en qué unidad se contó —`unidadPreparada`— así que no hay
 * que deducir nada: se le pasa como `contadoEn` y el descriptor resuelve si eso
 * fue un pack, un cajón, un kilo o una pieza mirando el producto.
 *
 * Devuelve `null` cuando falta el producto base: sin él no se puede afirmar la
 * presentación, y una línea sin snapshot dice "no se registró", que es preferible
 * a registrar una adivinada.
 */
function snapshotDeEnvioManual(item) {
  const base = item?.detalle?.producto?.base;
  if (!base) return null;

  const d = presentacionDeProducto({
    unidadMedida: base.unidad_medida,
    factorPack: base.factor_pack,
    modoVentaDeposito: base.modoVentaDeposito,
    pesoReferenciaKg: base.pesoReferenciaKg,
    modoCompraProveedor: base.modoCompraProveedor,
    pesoEsFijo: base.pesoEsFijo,
    contadoEn: item.unidadEnviada,
  });

  return {
    presentacionEnvio: d.presentacion,
    // La cantidad preparada ya está EN esa presentación: si se contaron 6
    // bultos, `cantidadRaw` es 6. No se convierte.
    cantidadPresentada: Number(item.cantidadRaw) || 0,
    // Este flujo prepara bultos completos: no tiene una casilla para las sueltas.
    // Cero es un dato, no un hueco.
    sueltasEnviadas: 0,
    factorPresentacion: agrupa(d.presentacion) ? d.factor : null,
    pesoPiezaKg: d.presentacion === PRESENTACION.PIEZA ? d.pesoPiezaKg : null,
  };
}

/** Lo que lee el que envía cuando el depósito canceló el pedido antes que él. */
const MENSAJE_SE_CANCELO = "Este pedido se canceló.";

/**
 * Lo que lee el que envía cuando OTRO ya lo envió (2026-10-28): los dos
 * depósitos de la empresa pueden tocar "Enviar al local" y el pedido sale una
 * sola vez. Con 409, como las otras carreras.
 */
const MENSAJE_YA_SE_ENVIO = "Este pedido ya se envió.";

/**
 * Lo que lee el depósito cuando el envío falla por algo que no se sabe nombrar
 * (2026-10-28): nunca "POS" ni "interno". Lo de adentro va al log.
 */
const MENSAJE_NO_SE_PUDO = "No se pudo enviar el pedido. Probá de nuevo.";

/**
 * Un renglón que no se puede enviar como se preparó: "GASEOSA: solo se puede
 * enviar por bulto." Sale con 409 y nombrando el producto, y como se lanza
 * antes de la transacción no se escribe nada.
 */
class ProductoQueNoSeEnvia extends Error {
  constructor(producto, motivo) {
    super(`${producto}: ${String(motivo).replace(/^Este producto /, "")}.`);
  }
}

/** Las líneas de un pedido como texto comparable: qué producto, cuánto y en qué unidad. */
function firmaDeLineas(lineas) {
  return (lineas || [])
    .map((d) => [d.id, d.productoId, Number(d.sugerido || 0), Number(d.preparado || 0), d.unidadSugerida, d.unidadPreparada, d.revisadoEn ? new Date(d.revisadoEn).getTime() : "", d.resueltoPorDepositoId ?? ""].join(":"))
    .sort()
    .join("|");
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos_transferencias.enviar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const posId = Number(body.posId || 0);

    if (!posId) {
      return NextResponse.json(
        { ok: false, error: MENSAJE_NO_SE_PUDO },
        { status: 400 }
      );
    }

    const pos = await prisma.posTransferencia.findUnique({
      where: sinCancelados({ id: posId }),
      include: {
        detalles: {
          include: {
            producto: {
              include: { base: true },
            },
          },
        },
      },
    });

    if (!pos) {
      // Cancelado antes de llegar acá: lo mismo que si se cancelaba durante el
      // bloqueo de abajo, y no un "no encontrada" que no dice qué pasó. Con el
      // mismo alcance de abajo: a quien no es del origen ni del destino no se
      // le dice nada de un pedido ajeno.
      const cancelado = await prisma.posTransferencia.findFirst({
        where: { id: posId, estado: ESTADO_PEDIDO.CANCELADO },
        select: { origenId: true, destinoId: true },
      });
      const local = Number(session.localId);
      if (cancelado && (session.esAdmin || local === cancelado.destinoId || (await esDepositoDelPedido(prisma, local, cancelado)))) {
        return NextResponse.json({ ok: false, error: MENSAJE_SE_CANCELO }, { status: 409 });
      }
      return NextResponse.json(
        { ok: false, error: "No se encontró el pedido." },
        { status: 404 }
      );
    }

    // Scope: no-admin solo puede operar sobre POS de su local (origen o destino).
    // ESCRITURA/ENVÍO sobre recurso ajeno → 403.
    // Los depósitos de la empresa del local también: cualquiera de los dos manda
    // el pedido que arman juntos (`lib/pedidos/depositosDelPedido.js`).
    if (
      !session.esAdmin &&
      Number(session.localId) !== pos.destinoId &&
      !(await esDepositoDelPedido(prisma, session.localId, pos))
    ) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para esta transferencia" },
        { status: 403 }
      );
    }

    // E2: Solo depot/admin pueden enviar
    const isAdmin =
      Array.isArray(session.permisos) &&
      session.permisos.includes("*") &&
      !session.localId;

    if (!isAdmin) {
      const userLocal = await prisma.local.findUnique({
        where: { id: Number(session.localId) },
        select: { es_deposito: true },
      });

      if (!userLocal?.es_deposito) {
        return NextResponse.json(
          { ok: false, error: "Solo el depósito o admin pueden enviar transferencias" },
          { status: 403 }
        );
      }
    }

    // E1: Permitir Solicitado además de Borrador/Preparando
    if (!["Borrador", "Preparando", "Solicitado"].includes(pos.estado)) {
      return NextResponse.json({ ok: false, error: MENSAJE_YA_SE_ENVIO }, { status: 409 });
    }

    if (!pos.detalles || pos.detalles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay ítems para enviar" },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // Preparar ítems válidos (cantidadRaw + unidadEnviada)
    // --------------------------------------------------
    const items = pos.detalles
      .map((detalle) => {
        // Lo preparado; sin nada preparado, lo pedido —como siempre— salvo que
        // el depósito la haya decidido en 0: esa no viaja. Ver
        // `lib/pedidos/revisionDeLinea.js`.
        const cantidadRaw = cantidadQueViaja(detalle);

        if (!cantidadRaw || cantidadRaw <= 0) return null;

        const base = detalle.producto?.base;
        // Los combos no se transfieren: se transfieren sus componentes.
        if (esComboBase(base)) {
          throw new Error("COMBO_NO_TRANSFERIBLE");
        }
        const factorPack = Number(base?.factor_pack || 1);

        const modoEnvio =
          base?.modo_envio ||
          (base?.unidad_medida === "cajon" ? "SOLO_BULTO" : "MIXTO");

        const unidadPreparada =
          detalle.unidadPreparada || detalle.unidadSugerida || "BULTO";

        const validacion = validarEnvio({
          modoEnvio,
          unidadElegida: unidadPreparada,
        });
        // Un producto que no se puede enviar en la unidad en que se preparó: se
        // dice CUÁL y por qué (incidente del pedido #19, 2026-10-28). Salía como
        // error suelto y el `catch` lo convertía en "Error interno al enviar
        // POS", sin nombre: el depósito no tenía cómo saber qué renglón tocar.
        //
        // Regla de Emanuel (2026-10-28): "solo por bulto" con bulto de 1 sale
        // aunque se haya preparado por unidad —con bulto de 1, bulto y unidad
        // son lo mismo, y el stock se mueve igual—. Con bulto de más de 1 sigue
        // el rechazo. Ninguna otra combinación cambia.
        const bultoDeUno = modoEnvio === "SOLO_BULTO" && unidadPreparada === "UNIDAD" && factorPack <= 1;
        if (!validacion.ok && !bultoDeUno) {
          throw new ProductoQueNoSeEnvia(detalle.producto?.nombre || base?.nombre || "Un producto", validacion.error);
        }

        toUnidades({
          cantidad: cantidadRaw,
          unidad: unidadPreparada,
          factorPack,
        });

        return {
          detalle,
          cantidadRaw,
          unidadEnviada: unidadPreparada,
          baseId: detalle.producto?.baseId,
          productoLocalOrigen: detalle.producto,
          factorPack,
        };
      })
      .filter(Boolean);

    if (!items.length) {
      return NextResponse.json(
        { ok: false, error: "No hay cantidades válidas para enviar" },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // DE QUÉ DEPÓSITO SALE CADA LÍNEA (2026-10-28)
    // --------------------------------------------------
    // Dos depósitos de la empresa arman el mismo pedido, cada uno su parte, y
    // cada línea descuenta del stock del que la resolvió, nunca del otro. Lo que
    // nadie resolvió —el flujo de la computadora, las líneas de antes— sale del
    // origen del pedido, como siempre. Las líneas son del catálogo del origen:
    // las del otro depósito salen de SU producto para la misma base.
    for (const item of items) {
      const resolvio = estaRevisada(item.detalle) ? item.detalle.resueltoPorDepositoId : null;
      item.depositoId = resolvio ?? pos.origenId;
      if (item.depositoId === pos.origenId) continue;
      const propio = await productoDelDeposito(prisma, item.depositoId, item.baseId);
      if (!propio) {
        const deposito = await prisma.local.findUnique({ where: { id: item.depositoId }, select: { nombre: true } });
        return NextResponse.json(
          { ok: false, error: mensajeNoEstaEnElCatalogo(item.productoLocalOrigen?.base?.nombre || item.productoLocalOrigen?.nombre || "Un producto", deposito?.nombre ?? "un depósito") },
          { status: 409 }
        );
      }
      item.productoLocalOrigen = propio;
    }
    // El origen primero: su transferencia es la que la respuesta devuelve en
    // `item`, como cuando había una sola.
    const depositos = [...new Set([pos.origenId, ...items.map((i) => i.depositoId)])].filter((id) => items.some((i) => i.depositoId === id));

    // --------------------------------------------------
    // E3: Validación de stock del depósito
    // --------------------------------------------------
    const grupoId = await getGrupoIdDeLocal(pos.origenId);
    let allowNegativeStock = false;
    if (grupoId) {
      const configGrupo = await prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { allowNegativeStock: true },
      });
      allowNegativeStock = configGrupo?.allowNegativeStock === true;
    }

    // El stock de cada línea es el de SU depósito.
    const stocks = await prisma.stockLocal.findMany({
      where: { OR: items.map((i) => ({ localId: i.depositoId, productoId: i.productoLocalOrigen.id })) },
    });

    const claveStock = (localId, productoId) => `${localId}:${productoId}`;
    const stockMap = new Map(stocks.map((s) => [claveStock(s.localId, s.productoId), Number(s.cantidad)]));

    const faltantes = [];
    for (const item of items) {
      const stockDisp = stockMap.get(claveStock(item.depositoId, item.productoLocalOrigen.id)) || 0;
      const unidadesNecesarias = toUnidades({
        cantidad: item.cantidadRaw,
        unidad: item.unidadEnviada,
        factorPack: item.factorPack,
      });

      if (unidadesNecesarias > stockDisp) {
        faltantes.push({
          productoNombre: item.productoLocalOrigen?.base?.nombre || item.productoLocalOrigen?.nombre || "N/A",
          necesario: unidadesNecesarias,
          disponible: stockDisp,
        });
      }
    }

    if (faltantes.length > 0 && !allowNegativeStock) {
      return NextResponse.json(
        {
          ok: false,
          error: "STOCK_INSUFICIENTE",
          faltantes,
        },
        { status: 400 }
      );
    }

    if (faltantes.length > 0 && allowNegativeStock) {
      console.log(
        "[POS-transferencia envío con stock negativo] posId=%s origenId=%s faltantes=%s",
        posId,
        pos.origenId,
        JSON.stringify(faltantes)
      );
    }

    // --------------------------------------------------
    // TRANSACCIÓN REAL
    // --------------------------------------------------
    const transferencias = await prisma.$transaction(async (tx) => {
      // ── EL MISMO BLOQUEO QUE EL LOCAL, Y LAS LÍNEAS DE AHORA ──────────────
      // Despachar EMPIEZA el pedido (`depositoEmpezo`), y mientras el pedido
      // enviado espera, el local le puede sumar productos con `set-cantidad`.
      // Con el mismo bloqueo del par y la fila, los dos no se pisan. Y las
      // líneas se leyeron AFUERA de esta transacción —para validar stock—: si
      // el local cambió algo entre esa lectura y acá, se despacharía una lista
      // vieja y lo que sumó quedaría en el pedido sin viajar. Entonces no se
      // despacha y se dice. Ver `lib/pedidos/bloqueoDelPedido.js`.
      await bloquearParDelPedido(tx, pos.origenId, pos.destinoId);
      const fila = await bloquearFilaDelPedido(tx, pos.id);
      // ── SI LO CANCELARON MIENTRAS ESPERABA, ES ESO LO QUE SE DICE ─────────
      // El depósito puede cancelar el pedido (2026-10-23). Si la cancelación
      // tomó el bloqueo primero, las líneas de abajo ya no se leen —el pedido
      // está cancelado— y la firma no coincide: se decía "El local cambió el
      // pedido", que es falso. Se pregunta primero por el estado de la fila.
      if (fila?.estado === ESTADO_PEDIDO.CANCELADO) {
        throw new Error("PEDIDO_CANCELADO");
      }
      // Lo mismo si el otro depósito lo envió mientras éste esperaba el bloqueo
      // (2026-10-28): es eso lo que se dice, y no que el local lo cambió.
      if (fila?.estado === "Enviado" || fila?.estado === "Enviando") {
        throw new Error("ALREADY_SENT");
      }
      const ahora = await tx.posTransferenciaDetalle.findMany({
        where: { posTransferenciaId: pos.id, pos: sinCancelados() },
        select: { id: true, productoId: true, sugerido: true, preparado: true, unidadSugerida: true, unidadPreparada: true, revisadoEn: true, resueltoPorDepositoId: true },
      });
      if (firmaDeLineas(ahora) !== firmaDeLineas(pos.detalles)) {
        throw new Error("PEDIDO_CAMBIO");
      }

      // Barrera atómica: evitar doble envío concurrente
      const lock = await tx.posTransferencia.updateMany({
        where: {
          id: pos.id,
          estado: { in: ["Borrador", "Preparando", "Solicitado"] },
        },
        data: { estado: "Enviando" },
      });

      if (lock.count === 0) {
        throw new Error("ALREADY_SENT");
      }

      // Creación de la transferencia + política de stock del origen: servicio
      // compartido (lib/transferencias/crearTransferencia). El flujo manual usa
      // DESCONTAR_Y_TRANSITO, que es el comportamiento histórico de esta ruta.
      //
      // UNA POR DEPÓSITO (2026-10-28): cada una sale del stock de su depósito y
      // las dos quedan ligadas al mismo pedido. La recepción del local trabaja
      // por transferencia con su propio origen, así que recibe las dos como
      // recibe cualquiera.
      const nuevas = [];
      for (const depositoId of depositos) {
        const { transferencia: nuevaTransferencia } = await crearTransferencia({
        tx,
        origenId: depositoId,
        destinoId: pos.destinoId,
        creadoPorId: pos.usuarioId,
        posTransferenciaId: pos.id,
        politicaStockOrigen: DESCONTAR_Y_TRANSITO,
        items: items.filter((item) => item.depositoId === depositoId).map((item) => ({
          baseId: item.baseId,
          productoLocalOrigenId: item.productoLocalOrigen.id,
          cantidad: item.cantidadRaw,
          unidadEnviada: item.unidadEnviada,
          factorPack: item.factorPack,
          productoLocalOrigen: item.productoLocalOrigen,
          // ── ACÁ LA PRESENTACIÓN SÍ ESTABA, Y SE PERDÍA IGUAL ──────────────
          //
          // Este camino es el bueno: registra en qué unidad se preparó cada
          // línea. Lo que no sabía decir era si el bulto era un pack o un cajón,
          // ni distinguir un kilo de una pieza, porque `unidadEnviada` solo
          // tiene BULTO y UNIDAD. El descriptor lo resuelve con los datos del
          // producto, y se congela junto con el factor.
          presentacion: snapshotDeEnvioManual(item),
        })),
        });
        nuevas.push(nuevaTransferencia);
      }

      await tx.posTransferencia.update({
        where: { id: pos.id },
        data: { estado: "Enviado" },
      });

      return nuevas;
    });
    const [transferencia] = transferencias;

    return NextResponse.json({
      ok: true,
      item: transferencia,
      transferencias,
      posId,
      totalItems: items.length,
      error: null,
    });
  } catch (err) {
    if (err.message === "PEDIDO_CANCELADO") {
      return NextResponse.json({ ok: false, error: MENSAJE_SE_CANCELO }, { status: 409 });
    }
    if (err.message === "PEDIDO_CAMBIO") {
      return NextResponse.json(
        { ok: false, error: "El local cambió el pedido mientras lo enviabas. Volvé a abrirlo y enviá de nuevo." },
        { status: 409 }
      );
    }
    if (err.message === "ALREADY_SENT") {
      return NextResponse.json({ ok: false, error: MENSAJE_YA_SE_ENVIO }, { status: 409 });
    }
    if (err.message === "COMBO_NO_TRANSFERIBLE") {
      return NextResponse.json(
        { ok: false, error: "Los combos no se transfieren; se transfieren sus componentes." },
        { status: 400 }
      );
    }
    if (err instanceof ProductoQueNoSeEnvia) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    console.error("Error enviar POS:", err);
    return NextResponse.json({ ok: false, error: MENSAJE_NO_SE_PUDO }, { status: 500 });
  }
}

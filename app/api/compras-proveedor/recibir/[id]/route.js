// app/api/compras-proveedor/recibir/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { subtotalLinea } from "@/lib/compras-proveedor/calculoPedido";
import { costoLineaAMaestro, actualizarCostoRealProducto } from "@/lib/compras-proveedor/costoMaestro";
import { esFiambreFijoEnUbicacion } from "@/lib/conversiones/stock";
import {
  clasificarDiferenciaCosto,
  decidirEscrituraDeCosto,
  cantidadesNegativas,
} from "@/lib/compras-proveedor/fronteraCosto";
import { esComboBase } from "@/lib/combos/guards";
import { pedidoEnAlcance, ownerLocalIdDePedido } from "@/lib/compras/scope";

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
        detalles: {
          include: {
            producto: {
              include: {
                base: {
                  select: {
                    id: true,
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

    // --- Factura / ganancia (opcionales) ---
    // totalFactura se computa en la transacción desde cantRecibida * precioCosto
    let totalReal = null;
    let nroFactura = null;
    let fechaFactura = null;

    if (body.totalReal !== undefined && body.totalReal !== "" && body.totalReal !== null) {
      const tr = Number(body.totalReal);
      if (!Number.isFinite(tr) || tr < 0) {
        return NextResponse.json(
          { ok: false, error: "totalReal debe ser un número >= 0" },
          { status: 400 }
        );
      }
      totalReal = tr;
    }

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
    const ownerLocalId = ownerLocalIdDePedido(pedido);

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

    // Transacción: incrementar stock + marcar recibido
    await prisma.$transaction(async (tx) => {
      let totalFacturaComputed = 0;

      for (const det of pedido.detalles) {
        const cantRecibida =
          recibidos[det.id] !== undefined
            ? Number(recibidos[det.id])
            : Number(det.cantidad);

        if (cantRecibida <= 0) continue;

        const base = det.producto?.base;
        // Los combos no reciben StockLocal ni actualizan costo físico.
        if (esComboBase(base)) continue;
        const modoCompra = base?.modoCompraProveedor || "BULTO";

        let incremento;
        let kgReales = null;

        if (modoCompra === "UNIDAD") {
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
          // Respeta la unidad de la línea (Opción A): BULTO entra ×factor_pack,
          // UNIDAD entra ×1. factor_pack solo afecta la ENTRADA de stock, no el dinero.
          const factorPack = Math.max(1, Number(base?.factor_pack || 1));
          const multiplicador = det.unidad === "UNIDAD" ? 1 : factorPack;
          incremento = cantRecibida * multiplicador;
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
        };

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
        const decision = decidirEscrituraDeCosto({
          clasificacion,
          excluidaAMano: costosExcluidos.has(det.id),
          aceptada: costosAceptados.has(det.id),
          hayCosto: Number.isFinite(costoMaestro) && costoMaestro > 0,
        });
        // Con la frontera apagada se conserva el comportamiento de siempre
        // —escribir— salvo que la línea esté excluida a mano. La clasificación
        // se calcula igual y viaja en la respuesta: es información gratis y sin
        // efecto, útil para ver qué pasaría antes de encender la regla.
        const escribeCosto = fronteraCostoActiva
          ? decision.escribe
          : !costosExcluidos.has(det.id);

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

      // Marcar pedido como RECIBIDO + guardar factura/ganancia
      await tx.pedidoProveedor.update({
        where: { id: pedidoId },
        data: {
          estado: "RECIBIDO",
          fechaRecibido: new Date(),
          totalFactura: totalFacturaComputed,
          totalReal,
          nroFactura,
          fechaFactura,
        },
      });
    });

    // Devolver pedido actualizado
    const updated = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        deposito: { select: { id: true, nombre: true } },
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

    // `decisionesDeCosto` viaja siempre, esté la frontera encendida o no: quien
    // recibe tiene derecho a saber qué costos se escribieron y cuáles no, y con
    // qué diferencia porcentual. Sin esto, no escribir un costo sería tan
    // silencioso como escribirlo mal.
    return NextResponse.json({ ok: true, item: updated, decisionesDeCosto });
  } catch (err) {
    console.error("Error compras-proveedor/recibir:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al recibir pedido" },
      { status: 500 }
    );
  }
}

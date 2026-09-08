// app/api/transferencias/confirmar-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { esFiambreFijo, piezasToKg } from "@/lib/conversiones/stock";
import { esComboBase } from "@/lib/combos/guards";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import {
  validarDetalleRecepcion,
  mensajeRecepcion,
  statusRecepcion,
  accionAuditoriaDe,
  ACCIONES_RECEPCION,
} from "@/lib/transferencias/recepcion";
import { estadoAdmiteRecepcion, puedeRecibir } from "@/lib/transferencias/recepcionServidor";
import { getConfigLocalEfectiva } from "@/lib/config/local";

/** Cantidades siempre con la escala física de StockLocal (3 decimales). */
const fmt = (n) => Number(n || 0).toFixed(3);

/**
 * Error tipado que se lanza DENTRO de la transacción para abortarla entera. El
 * catch exterior lo traduce a HTTP: nunca se devuelve un NextResponse desde
 * adentro de `$transaction`.
 */
class ErrorRecepcion extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "ErrorRecepcion";
    this.code = code;
    this.status = status;
  }
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

    const perm = checkPerm(session, "transferencias.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const esAdmin = session.esAdmin;

    // Usuario REAL, resuelto antes de tocar nada. AuditoriaStock.userId es
    // obligatorio y con FK: sin un id válido la auditoría de la devolución
    // fallaría DENTRO de la transacción y voltearía una recepción ya empezada.
    // Mejor rechazar acá, con el stock intacto.
    const usuarioId = Number(session.id || 0);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return NextResponse.json(
        {
          ok: false,
          codigo: "USUARIO_SESION_INVALIDO",
          error: "Tu sesión no identifica un usuario válido. Volvé a iniciar sesión para confirmar la recepción.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();
    const transferenciaId = Number(body.transferenciaId || 0);

    if (!transferenciaId) {
      return NextResponse.json(
        { ok: false, error: "transferenciaId requerido" },
        { status: 400 }
      );
    }

    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      include: {
        detalle: {
          include: {
            producto: { include: { base: true } },
          },
        },
      },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    // Validar estado antes de procesar
    const estadoOk = estadoAdmiteRecepcion(transferencia.estado, { accion: "volver a confirmar" });
    if (!estadoOk.ok) {
      return NextResponse.json({ ok: false, error: estadoOk.error }, { status: estadoOk.status });
    }

    const alcance = puedeRecibir(session, transferencia);
    if (!alcance.ok) {
      return NextResponse.json({ ok: false, error: alcance.error }, { status: alcance.status });
    }

    // ============================================================
    // 🟦 VALIDACIÓN PREVIA — antes de tocar una sola fila
    //
    // Se validan TODOS los detalles primero: si uno solo es inválido, la
    // recepción no empieza y el stock queda intacto. Antes la aritmética se
    // resolvía dentro del loop de mutación, así que un detalle malo podía
    // encontrarse con detalles anteriores ya aplicados (la transacción los
    // revertía, pero el estado quedaba en "Confirmando" hasta el rollback).
    // ============================================================
    const planes = new Map(); // detalleId → resultado validado

    for (const d of transferencia.detalle) {
      // Los combos no tienen stock físico: no se reciben (igual que antes).
      if (esComboBase(d.producto.base)) continue;

      const plan = validarDetalleRecepcion({
        detalle: {
          cantidad: d.cantidad,
          recibido: d.recibido,
          unidadEnviada: d.unidadEnviada,
          motivoPrincipal: d.motivoPrincipal,
          motivoDetalle: d.motivoDetalle,
          agregadoEnRecepcion: d.agregadoEnRecepcion,
        },
        factorPack: Number(d.producto.base.factor_pack || 1),
      });

      if (!plan.ok) {
        const nombre = d.producto.base.nombre || d.producto.nombre || null;
        return NextResponse.json(
          { ok: false, codigo: plan.error, error: mensajeRecepcion(plan.error, { nombre }) },
          { status: statusRecepcion(plan.error) }
        );
      }

      planes.set(d.id, plan);
    }

    // ============================================================
    // 🟦 GRUPO DEL ORIGEN — también antes de la transacción
    //
    // Hace falta si hay CUALQUIER ajuste de stock del origen, en los dos
    // sentidos: la auditoría lo exige (AuditoriaStock.grupoId es obligatorio). Si
    // no se puede resolver, la recepción se detiene: mover stock sin dejar rastro
    // sería exactamente la "corrección silenciosa" que este flujo viene a
    // eliminar.
    //
    // Antes esto solo miraba las devoluciones, porque eran el único ajuste
    // posible. Con diferencias positivas y líneas agregadas, el origen también
    // PIERDE stock y ese movimiento necesita el mismo rastro.
    // ============================================================
    const hayAjusteOrigen = [...planes.values()].some((p) => p.ajusteOrigenUnidades !== 0);
    let grupoOrigenId = null;

    if (hayAjusteOrigen) {
      grupoOrigenId = await getGrupoIdDeLocal(transferencia.origenId);
      if (!grupoOrigenId) {
        return NextResponse.json(
          {
            ok: false,
            codigo: "GRUPO_ORIGEN_NO_RESUELTO",
            error:
              "No se pudo determinar el grupo del local de origen. Hay diferencias que ajustar y no se puede auditar el movimiento.",
          },
          { status: 409 }
        );
      }
    }

    // ============================================================
    // 🟦 STOCK NEGATIVO — LA POLÍTICA VIGENTE, NO UNA NUEVA
    //
    // Cuando llega MÁS de lo enviado, el origen pierde la diferencia además de
    // lo que ya había perdido al mandar. Eso puede dejarlo en negativo, y ERP
    // Azul ya tiene una regla para eso: `allowNegativeStock`, el mismo flag que
    // decide si un envío con stock insuficiente se rechaza o se registra
    // (`pos-transferencias/enviar`). Acá se respeta esa política y no se inventa
    // otra.
    //
    // Se lee con `getConfigLocalEfectiva` del local ORIGEN, que es la fuente
    // canónica —override del local con fallback al grupo—. El envío lee solo el
    // grupo; esa asimetría es previa y no se toca en esta tanda.
    //
    // Y se comprueba ANTES de la transacción, con el stock actual: si no alcanza
    // y el grupo no permite negativos, la recepción no empieza. Rechazar acá deja
    // el inventario intacto y le dice al operador exactamente qué producto y
    // cuánto falta.
    // ============================================================
    const excedentes = [...planes.entries()].filter(([, p]) => p.excedenteUnidades > 0);
    let permiteNegativo = false;

    if (excedentes.length > 0) {
      const grupoParaPolitica = grupoOrigenId || (await getGrupoIdDeLocal(transferencia.origenId));
      const cfg = await getConfigLocalEfectiva(transferencia.origenId, grupoParaPolitica);
      permiteNegativo = cfg.allowNegativeStock === true;

      if (!permiteNegativo) {
        const porDetalle = new Map(transferencia.detalle.map((d) => [d.id, d]));
        const faltantes = [];

        for (const [detalleId, plan] of excedentes) {
          const d = porDetalle.get(detalleId);
          const productoOrigen = await prisma.productoLocal.findUnique({
            where: {
              localId_baseId: { localId: transferencia.origenId, baseId: d.producto.base.id },
            },
            select: { id: true },
          });
          const stock = productoOrigen
            ? await prisma.stockLocal.findUnique({
                where: {
                  localId_productoId: {
                    localId: transferencia.origenId,
                    productoId: productoOrigen.id,
                  },
                },
                select: { cantidad: true },
              })
            : null;

          const disponible = Number(stock?.cantidad || 0);
          if (plan.excedenteUnidades > disponible) {
            faltantes.push({
              productoNombre: d.producto.base.nombre || d.producto.nombre || "N/A",
              necesario: plan.excedenteUnidades,
              disponible,
            });
          }
        }

        if (faltantes.length > 0) {
          return NextResponse.json(
            {
              ok: false,
              codigo: "STOCK_INSUFICIENTE",
              error:
                "Llegó más mercadería de la enviada y el local de origen no tiene stock para cubrir la diferencia. " +
                "Este grupo no permite stock negativo.",
              faltantes,
            },
            { status: 400 }
          );
        }
      }
    }

    // ============================================================
    // TODO en transacción para consistencia de stock
    // ============================================================
    await prisma.$transaction(async (tx) => {
      // Barrera atómica: tomar exclusividad con updateMany condicional.
      // Solo pasa si estado es Enviada o Recibiendo.
      // Si otro proceso ya cambió el estado, count = 0 → abortar.
      const lock = await tx.transferencia.updateMany({
        where: {
          id: transferenciaId,
          estado: { in: ["Enviada", "Recibiendo"] },
        },
        data: { estado: "Confirmando" },
      });

      if (lock.count === 0) {
        throw new Error("ALREADY_CONFIRMED");
      }

      let tieneDiferencias = false;

      for (const d of transferencia.detalle) {
        // Defensa: los combos no tienen stock físico, no se procesan aquí.
        if (esComboBase(d.producto.base)) continue;

        // Plan ya validado arriba: cantidades dentro de rango, unidad conocida y
        // motivo presente si hay diferencia. Acá solo se aplica.
        const plan = planes.get(d.id);
        const { recibida, recibidaUnidades } = plan;

        if (plan.hayDiferencia) tieneDiferencias = true;

        // StockLocal SIEMPRE en UNIDADES (o kg para local de fiambre fijo).
        // La conversión BULTO→unidades ya la hizo validarDetalleRecepcion, una
        // sola vez y solo si unidadEnviada es BULTO.
        const esFijo = esFiambreFijo(d.producto.base);

        // Unidades para sumar al local (KG para fiambre fijo, unidades normal)
        const incrementoLocal = esFijo
          ? piezasToKg(recibida, Number(d.producto.base.pesoReferenciaKg))
          : recibidaUnidades;

        // ============================================================
        // 🟦 PRODUCTO DESTINO
        // ============================================================
        let productoDestino = await tx.productoLocal.findUnique({
          where: {
            localId_baseId: {
              localId: transferencia.destinoId,
              baseId: d.producto.base.id,
            },
          },
        });

        if (!productoDestino) {
          productoDestino = await tx.productoLocal.create({
            data: {
              localId: transferencia.destinoId,
              baseId: d.producto.base.id,
              precio_costo:
                d.producto.precio_costo || d.producto.base.precio_costo || 0,
              precio_venta:
                d.producto.precio_venta || d.producto.base.precio_venta || 0,
              margen: d.producto.margen || d.producto.base.margen || 0,
              activo: true,
            },
          });

          await tx.stockLocal.create({
            data: {
              localId: transferencia.destinoId,
              productoId: productoDestino.id,
              cantidad: 0,
              // NULL: recibir una transferencia crea la fila si falta, pero no
              // configura límites. Ver `limitesConfiguradosAt` en el esquema.
              stockMin: null,
              stockMax: null,
            },
          });
        }

        // ============================================================
        // 🟩 SUMAR AL DESTINO (KG para fiambre fijo, unidades normal)
        // ============================================================
        await tx.stockLocal.upsert({
          where: {
            localId_productoId: {
              localId: transferencia.destinoId,
              productoId: productoDestino.id,
            },
          },
          update: { cantidad: { increment: incrementoLocal } },
          create: {
            localId: transferencia.destinoId,
            productoId: productoDestino.id,
            cantidad: incrementoLocal,
          },
        });

        // ============================================================
        // 🟥 ORIGEN — limpiar tránsito y AJUSTAR por la diferencia
        //
        // El origen ya perdió la cantidad enviada antes de llegar acá: en
        // DESCONTAR_Y_TRANSITO la descontó la transferencia al enviarse, en
        // SOLO_TRANSITO la descontó la Venta al crearse. Por eso la recepción NO
        // distingue política: en los dos casos el neto correcto es que el origen
        // pierda exactamente lo que el destino recibió.
        //
        //   enTransito -= enviado     (la mercadería salió: el tránsito queda en 0)
        //   cantidad   += enviado - recibido
        //
        // El segundo término tiene SIGNO. Positivo devuelve lo que no llegó;
        // negativo descuenta lo que llegó de más, que el origen todavía no había
        // perdido. La fórmula es la misma para los tres casos, y esa es la razón
        // por la que no hay ramas acá: 10/8 → +2, 10/10 → 0, 10/15 → −5.
        //
        // Y para una línea AGREGADA en recepción el tránsito NO se toca: nunca
        // formó parte del envío, así que no hay reserva que liberar. Restarle su
        // cantidad inventaría un tránsito que nadie creó.
        //
        // Las dos van en UNA sola escritura atómica sobre la fila: partirlas en
        // dos updates abre una ventana donde el stock del origen está a medio
        // corregir.
        //
        // El ajuste es de INVENTARIO, no comercial: si la transferencia nació de
        // una venta interna, esa venta sigue facturando lo enviado. Resolver el
        // desfase (nota de crédito, merma, imputación) es una etapa aparte.
        // ============================================================
        const { enviadaUnidades, ajusteOrigenUnidades } = plan;

        const productoOrigen = await tx.productoLocal.findUnique({
          where: {
            localId_baseId: {
              localId: transferencia.origenId,
              baseId: d.producto.base.id,
            },
          },
        });

        // Antes esto era un `if (productoOrigen)`: sin fila de origen no se
        // limpiaba el tránsito y nadie se enteraba. Con devolución de por medio
        // ese salteo silencioso perdería mercadería, así que ahora aborta todo.
        if (!productoOrigen) {
          throw new ErrorRecepcion(
            "STOCK_ORIGEN_NO_ENCONTRADO",
            `El producto "${d.producto.base.nombre || d.producto.nombre || d.producto.base.id}" no existe en el local de origen. No se puede confirmar la recepción sin poder ajustar su stock.`
          );
        }

        const stockOrigen = await tx.stockLocal.findUnique({
          where: {
            localId_productoId: {
              localId: transferencia.origenId,
              productoId: productoOrigen.id,
            },
          },
        });

        if (!stockOrigen) {
          throw new ErrorRecepcion(
            "STOCK_ORIGEN_NO_ENCONTRADO",
            `El producto "${d.producto.base.nombre || d.producto.nombre || productoOrigen.id}" no tiene stock registrado en el local de origen. No se puede confirmar la recepción sin poder ajustar su stock.`
          );
        }

        // `increment` con un número negativo descuenta: es la misma operación
        // atómica de Postgres y no hace falta una segunda rama para el signo.
        // Se arma como UNA expresión y no mutando un objeto: las dos claves
        // quedan juntas en el mismo literal, que es lo que hace evidente —y
        // comprobable— que van en la misma escritura.
        const datosOrigen = plan.tocaTransito
          ? { cantidad: { increment: ajusteOrigenUnidades }, enTransito: { decrement: enviadaUnidades } }
          : { cantidad: { increment: ajusteOrigenUnidades } };

        const origenActualizado = await tx.stockLocal.update({
          where: {
            localId_productoId: {
              localId: transferencia.origenId,
              productoId: productoOrigen.id,
            },
          },
          data: datosOrigen,
        });

        // ============================================================
        // 🟪 AUDITORÍA DEL AJUSTE — dentro de la transacción
        //
        // Sin `.catch()` a propósito, al revés que las auditorías de
        // stock_locales/ajustar: acá la auditoría no es un extra, es el único
        // rastro de que ese stock se movió solo. Si no se puede escribir, la
        // recepción entera se revierte.
        //
        // TRES ACCIONES Y NO UNA. Hasta acá todo se guardaba como
        // `DIFERENCIA_RECEPCION_TRANSFERENCIA`, que significaba "faltó
        // mercadería" porque era el único caso posible. Con diferencias
        // positivas eso dejaría de ser cierto y un reporte que agrupe por acción
        // sumaría faltantes con sobrantes. Ver `accionAuditoriaDe`.
        //
        // Y el vínculo con la transferencia ahora es ESTRUCTURAL —dos columnas—
        // y no solo el texto del motivo: "todos los movimientos de la
        // transferencia 97" no se puede contestar parseando castellano.
        // ============================================================
        const accion = accionAuditoriaDe(plan);
        if (accion) {
          const esAgregada = accion === ACCIONES_RECEPCION.AGREGADO;
          const esFaltante = accion === ACCIONES_RECEPCION.FALTANTE;
          const magnitud = esFaltante ? plan.devolucionUnidades : plan.excedenteUnidades;

          await tx.auditoriaStock.create({
            data: {
              grupoId: grupoOrigenId,
              localId: transferencia.origenId,
              productoLocalId: productoOrigen.id,
              userId: usuarioId,
              accion,
              transferenciaId,
              transferenciaDetalleId: d.id,
              cantidadAnterior: Number(stockOrigen.cantidad),
              cantidadNueva: Number(origenActualizado.cantidad),
              // Enviado y recibido van en la unidad del REMITO (puede ser BULTO);
              // el movimiento, en unidades de stock. Se explicita para que la
              // auditoría no se lea como "2 bultos" cuando son 2 unidades.
              motivo: esAgregada
                ? `Producto agregado durante la recepción — transferencia #${transferenciaId}, ` +
                  `detalle #${d.id}, enviado 0.000, recibido ${fmt(plan.recibida)} ${plan.unidad}, ` +
                  `descontado del origen ${fmt(magnitud)} (unidades de stock)`
                : esFaltante
                ? `Devolución por diferencia de recepción — transferencia #${transferenciaId}, ` +
                  `detalle #${d.id}, enviado ${fmt(plan.enviada)} ${plan.unidad}, ` +
                  `recibido ${fmt(plan.recibida)} ${plan.unidad}, ` +
                  `devuelto ${fmt(magnitud)} (unidades de stock)`
                : `Excedente de recepción — transferencia #${transferenciaId}, ` +
                  `detalle #${d.id}, enviado ${fmt(plan.enviada)} ${plan.unidad}, ` +
                  `recibido ${fmt(plan.recibida)} ${plan.unidad}, ` +
                  `descontado del origen ${fmt(magnitud)} (unidades de stock)`,
            },
          });
        }

        // ============================================================
        // 🟨 GUARDAR RECEPCIÓN
        // ============================================================
        await tx.transferenciaDetalle.update({
          where: { id: d.id },
          data: {
            recibido: recibida, // en la misma unidad que 'enviada'
            confirmadoPorId: usuarioId,
            fechaRecepcion: new Date(),
          },
        });
      }

      // ============================================================
      // 🟩 CABECERA
      // ============================================================
      await tx.transferencia.update({
        where: { id: transferenciaId },
        data: {
          estado: "Recibida",
          fechaRecepcion: new Date(),
          tieneDiferencias,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.message === "ALREADY_CONFIRMED") {
      return NextResponse.json(
        { ok: false, error: "Esta transferencia ya fue confirmada." },
        { status: 400 }
      );
    }
    // Abortos deliberados desde adentro de la transacción: nada quedó escrito.
    if (err.name === "ErrorRecepcion") {
      return NextResponse.json(
        { ok: false, codigo: err.code, error: err.message },
        { status: err.status || 409 }
      );
    }
    console.error("ERROR confirmar recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

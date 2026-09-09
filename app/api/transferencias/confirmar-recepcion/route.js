// app/api/transferencias/confirmar-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { esFiambreFijo, piezasToKg } from "@/lib/conversiones/stock";
import { esComboBase } from "@/lib/combos/guards";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import {
  mensajeRecepcion,
  statusRecepcion,
  accionAuditoriaDe,
  ACCIONES_RECEPCION,
} from "@/lib/transferencias/recepcion";
import {
  cargarDetallesDeRecepcion,
  pesoPiezaParaRecepcion,
  ErrorRecepcion,
  estadoAdmiteRecepcion,
  originalesSinRevisar,
  planificarRecepcion,
  puedeRecibir,
  reclamarOFallar,
} from "@/lib/transferencias/recepcionServidor";
import { getConfigLocalEfectiva } from "@/lib/config/local";

/** Cantidades siempre con la escala física de StockLocal (3 decimales). */
const fmt = (n) => Number(n || 0).toFixed(3);

const MENSAJE_STOCK_INSUFICIENTE =
  "Llegó más mercadería de la enviada y el local de origen no tiene stock para cubrir la diferencia. " +
  "Este grupo no permite stock negativo.";

/**
 * QUÉ PRODUCTOS NO ALCANZAN — SOLO PARA EL MENSAJE.
 *
 * Lectura sin lock, antes de la transacción, para poder decir qué producto y
 * cuánto falta. **No es la garantía**: ver `descontarConGuardia`.
 */
async function faltantesDeExcedente(db, { origenId, detalles, planes }) {
  const faltantes = [];

  for (const d of detalles) {
    const plan = planes.get(d.id);
    if (!plan || plan.excedenteUnidades <= 0) continue;

    const productoOrigen = await db.productoLocal.findUnique({
      where: { localId_baseId: { localId: origenId, baseId: d.producto.base.id } },
      select: { id: true },
    });
    const stock = productoOrigen
      ? await db.stockLocal.findUnique({
          where: { localId_productoId: { localId: origenId, productoId: productoOrigen.id } },
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

  return faltantes;
}

/**
 * EL DESCUENTO DEL ORIGEN, CON LA GUARDIA DE STOCK NEGATIVO ADENTRO DE LA
 * TRANSACCIÓN.
 *
 * ── POR QUÉ NO ALCANZABA CON MIRAR ANTES ──────────────────────────────────
 *
 * Leer el stock, ver que alcanza y descontar después deja una carrera entre DOS
 * TRANSFERENCIAS DISTINTAS sobre el mismo producto. El lock de `Transferencia`
 * no la cubre: A y B no comparten esa fila.
 *
 *     stock 10, las dos necesitan 8
 *     A lee 10 → pasa · B lee 10 → pasa · A descuenta → 2 · B descuenta → -6
 *
 * ── CÓMO SE CIERRA ────────────────────────────────────────────────────────
 *
 * El UPDATE lleva la condición adentro: `cantidad >= minimoRequerido`. En READ
 * COMMITTED, la segunda transacción se BLOQUEA en el lock de esa fila y, cuando
 * la primera termina, vuelve a evaluar el WHERE contra la versión NUEVA. Ve
 * `cantidad = 2`, `2 >= 8` es falso, empareja cero filas y se entera. No hay
 * ventana entre comprobar y escribir porque son la misma sentencia.
 *
 * Y funciona con varios detalles del MISMO producto en la misma recepción: cada
 * uno descuenta en secuencia dentro de la misma transacción, así que el segundo
 * ve lo que dejó el primero. Validar los dos contra el stock inicial dejaría que
 * la suma lo atravesara.
 *
 * `updateMany` no devuelve la fila, así que el valor nuevo se relee para la
 * auditoría. Con `minimoRequerido = 0` no hay nada que guardar y se usa el
 * `update` de siempre, que ya la devuelve.
 */
async function descontarConGuardia(tx, { localId, productoId, datos, minimoRequerido, nombre }) {
  const donde = { localId_productoId: { localId, productoId } };

  if (!(minimoRequerido > 0)) {
    return tx.stockLocal.update({ where: donde, data: datos });
  }

  const r = await tx.stockLocal.updateMany({
    where: { localId, productoId, cantidad: { gte: minimoRequerido } },
    data: datos,
  });

  if (r.count === 0) {
    throw new ErrorRecepcion(
      "STOCK_INSUFICIENTE",
      `${MENSAJE_STOCK_INSUFICIENTE} (${nombre}: hacen falta ${fmt(minimoRequerido)} unidades)`,
      400
    );
  }

  return tx.stockLocal.findUnique({ where: donde });
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
    // 🟦 PREVALIDACIÓN — RÁPIDA Y NO AUTORITATIVA
    //
    // Corre antes de la transacción para poder contestar con un mensaje bueno
    // —qué producto, qué le falta— sin haber tomado ningún lock.
    //
    // NO ES LA GARANTÍA. Entre esta lectura y la transacción, otra persona puede
    // agregar una línea, borrarla o cambiar una cantidad. La versión que manda es
    // la que corre DESPUÉS del lock, sobre los detalles releídos ahí. Las dos
    // llaman a la MISMA función: si fueran dos copias, la de adentro se quedaría
    // atrás y este rechazo amable dejaría pasar lo que aquélla tendría que frenar.
    // ============================================================
    const previo = planificarRecepcion(transferencia.detalle);
    if (!previo.ok) {
      return NextResponse.json(
        { ok: false, codigo: previo.error, error: mensajeRecepcion(previo.error, { nombre: previo.nombre }) },
        { status: statusRecepcion(previo.error) }
      );
    }
    const planes = previo.planes;

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
    // Se resuelve SIEMPRE, no solo si el snapshot de afuera ve ajustes: entre
    // esta lectura y el lock puede aparecer una línea agregada que sí los tenga,
    // y quedarse sin grupo ahí adentro voltearía una recepción ya empezada. Es
    // una consulta indexada y no depende de los detalles.
    const grupoOrigenId = await getGrupoIdDeLocal(transferencia.origenId);

    // Pero la EXIGENCIA sigue siendo condicional, y es la de antes: una recepción
    // sin ningún ajuste de origen no escribe auditoría, así que no necesita
    // grupo, y pedírselo rechazaría recepciones que hoy funcionan.
    //
    // Éste es el rechazo amable, sobre el snapshot de afuera. El que manda está
    // adentro de la transacción, justo antes de escribir la auditoría: es ahí
    // donde se sabe de verdad si hay algo que auditar.
    const hayAjusteOrigen = [...previo.planes.values()].some((p) => p.ajusteOrigenUnidades !== 0);
    if (hayAjusteOrigen && !grupoOrigenId) {
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
    // ── DÓNDE ESTÁ LA GARANTÍA, Y DÓNDE NO ────────────────────────────────
    //
    // El chequeo de abajo es SOLO para el mensaje: dice qué producto y cuánto
    // falta sin haber tomado ningún lock. NO es la garantía, y creer que lo era
    // dejaba abierta una carrera entre DOS TRANSFERENCIAS DISTINTAS sobre el
    // mismo producto:
    //
    //     stock 10, las dos necesitan descontar 8
    //     A consulta → hay 10 → pasa
    //     B consulta → hay 10 → pasa
    //     A descuenta → quedan 2
    //     B descuenta → quedan -6      ← con allowNegativeStock = false
    //
    // El lock de `Transferencia` no lo arregla porque A y B son transferencias
    // distintas: no comparten esa fila. La garantía real está adentro de la
    // transacción, en un UPDATE condicionado al stock disponible. Ver
    // `descontarConGuardia`.
    // ============================================================
    const cfgOrigen = await getConfigLocalEfectiva(transferencia.origenId, grupoOrigenId);
    const permiteNegativo = cfgOrigen.allowNegativeStock === true;

    if (!permiteNegativo) {
      const faltantes = await faltantesDeExcedente(prisma, {
        origenId: transferencia.origenId,
        detalles: transferencia.detalle,
        planes,
      });
      if (faltantes.length > 0) {
        return NextResponse.json(
          { ok: false, codigo: "STOCK_INSUFICIENTE", error: MENSAJE_STOCK_INSUFICIENTE, faltantes },
          { status: 400 }
        );
      }
    }

    // ============================================================
    // TODO en transacción para consistencia de stock
    // ============================================================
    await prisma.$transaction(async (tx) => {
      // ── 1. EL LOCK, Y ES LO PRIMERO QUE PASA ────────────────────────────
      //
      // `updateMany` condicional sobre la fila de la transferencia. En READ
      // COMMITTED, cualquier otra escritura de recepción sobre esa fila se
      // bloquea acá y después vuelve a evaluar su WHERE contra lo que dejamos:
      // ve "Confirmando" y empareja cero.
      await reclamarOFallar(tx, transferenciaId, "Confirmando");

      // ── 2. RECIÉN AHORA SE LEE QUÉ HAY QUE PROCESAR ─────────────────────
      //
      // Éste es el arreglo. Antes los detalles se leían ANTES del lock, así que
      // una línea agregada entre la lectura y la barrera quedaba fuera del
      // snapshot: la transferencia terminaba "Recibida" con una línea cuyo stock
      // nunca se movió. Ahora el conjunto que mueve stock es POSTERIOR al lock,
      // y a partir de acá nadie más puede tocarlo.
      const detalles = await cargarDetallesDeRecepcion(tx, transferenciaId);

      // ── 3. Y SE VUELVE A VALIDAR SOBRE ESA LECTURA ──────────────────────
      //
      // Con la MISMA función que la prevalidación de afuera. Si algo no valida,
      // se lanza y la transacción entera se revierte — incluido el "Confirmando",
      // que vuelve al estado anterior.
      // ── 2.bis · ¿SE TERMINÓ DE CONTAR? ──────────────────────────────────
      //
      // La recepción es un control físico: confirmar con productos del remito
      // sin revisar sería cerrar un conteo que nadie terminó, y el stock se
      // mueve acá. La guarda va en el SERVIDOR y no solo en el botón, porque una
      // pestaña vieja o un pedido a mano lo saltean.
      //
      // Y va DESPUÉS del lock, sobre la lectura firme: entre el snapshot de
      // afuera y este punto alguien pudo desmarcar o agregar una línea.
      //
      // Las agregadas no cuentan: no pertenecen al remito, y meterlas en el
      // denominador haría que agregar un producto bloqueara la confirmación.
      const pendientes = originalesSinRevisar(detalles);
      if (pendientes.length > 0) {
        const nombres = pendientes.slice(0, 5).map((p) => p.nombre).filter(Boolean);
        throw new ErrorRecepcion(
          "PRODUCTOS_SIN_REVISAR",
          `Faltan revisar ${pendientes.length} producto${pendientes.length === 1 ? "" : "s"} del remito` +
            (nombres.length ? `: ${nombres.join(", ")}${pendientes.length > nombres.length ? "…" : ""}` : "") +
            ". Terminá el control físico antes de confirmar.",
          409,
          { pendientes: pendientes.length, ejemplos: nombres }
        );
      }

      const autoritativo = planificarRecepcion(detalles);
      if (!autoritativo.ok) {
        throw new ErrorRecepcion(
          autoritativo.error,
          mensajeRecepcion(autoritativo.error, { nombre: autoritativo.nombre }),
          statusRecepcion(autoritativo.error)
        );
      }
      const planesFirmes = autoritativo.planes;

      let tieneDiferencias = false;

      for (const d of detalles) {
        // Defensa: los combos no tienen stock físico, no se procesan aquí.
        if (esComboBase(d.producto.base)) continue;

        // Plan ya validado sobre la lectura de ADENTRO del lock: cantidades
        // válidas, unidad conocida y motivo presente si hay diferencia.
        const plan = planesFirmes.get(d.id);
        const { recibida, recibidaUnidades } = plan;

        if (plan.hayDiferencia) tieneDiferencias = true;

        // StockLocal SIEMPRE en UNIDADES (o kg para local de fiambre fijo).
        // La conversión BULTO→unidades ya la hizo validarDetalleRecepcion, una
        // sola vez y solo si unidadEnviada es BULTO.
        const esFijo = esFiambreFijo(d.producto.base);

        // Unidades para sumar al local (KG para fiambre fijo, unidades normal)
        // ── EL PESO CONGELADO LE GANA AL DEL CATÁLOGO ────────────────────
        //
        // De este número sale cuántos KILOS se le acreditan al destino. Leerlo
        // vivo significaba que editar `pesoReferenciaKg` después de despachar
        // cambiaba el stock que entraba por un remito que ya había salido.
        // `pesoPiezaParaRecepcion` usa el snapshot si la línea lo tiene, y el
        // catálogo si es anterior a la migración — o sea, lo de siempre.
        const incrementoLocal = esFijo
          ? piezasToKg(recibida, pesoPiezaParaRecepcion(d))
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

        const origenActualizado = await descontarConGuardia(tx, {
          localId: transferencia.origenId,
          productoId: productoOrigen.id,
          datos: datosOrigen,
          // La guardia solo hace falta cuando el origen PIERDE stock y el grupo
          // no admite negativos. Una devolución nunca puede dejarlo negativo.
          minimoRequerido: !permiteNegativo ? plan.excedenteUnidades : 0,
          nombre: d.producto.base.nombre || d.producto.nombre || String(productoOrigen.id),
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
          // La versión que manda del chequeo de grupo. El de afuera mira el
          // snapshot previo al lock; acá ya se sabe, sobre la lectura firme, que
          // esta línea mueve stock y necesita rastro. Sin grupo se aborta todo:
          // `AuditoriaStock.grupoId` es obligatorio y dejarlo llegar a Prisma
          // devolvería "Error interno" en lugar de decir qué falta.
          if (!grupoOrigenId) {
            throw new ErrorRecepcion(
              "GRUPO_ORIGEN_NO_RESUELTO",
              "No se pudo determinar el grupo del local de origen. Hay diferencias que ajustar y no se puede auditar el movimiento."
            );
          }

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
    // Abortos deliberados desde adentro de la transacción: nada quedó escrito.
    // Incluye RECEPCION_TOMADA, que es haber perdido la carrera por el lock.
    if (err.name === "ErrorRecepcion") {
      return NextResponse.json(
        { ok: false, codigo: err.code, error: err.message, ...(err.datos || {}) },
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

// app/api/stock_locales/ajustar/route.js
//
// ── EL AJUSTE MANUAL NO SE MUEVE SIN RASTRO ─────────────────────────────────
//
// EL CRITERIO, escrito para que no se vuelva a decidir al revés:
//
//   Si la fila de `AuditoriaStock` no se puede escribir, EL STOCK NO SE MUEVE.
//   La escritura y su rastro van en la MISMA transacción, y sin `grupoId` la
//   operación se rechaza con 409 en vez de escribir a ciegas.
//
// POR QUÉ ACÁ Y NO EN OTRO LADO. Todos los demás movimientos de stock tienen un
// documento atrás que los explica: una transferencia tiene su remito, una venta
// tiene su ticket, una recepción tiene su pedido. Si se pierde el rastro, el
// movimiento igual se puede reconstruir desde el documento.
//
// El ajuste manual NO TIENE NINGUNO. Alguien entra, escribe un número y el stock
// cambia. La fila de auditoría —quién, cuándo, de cuánto a cuánto, con qué causa
// y qué detalle— es la ÚNICA evidencia que queda de que eso pasó. Un ajuste sin
// rastro es indistinguible de un faltante.
//
// QUÉ HABÍA ANTES. Las dos escrituras corrían fuera de transacción y con
// `.catch(console.error)`: el stock cambiaba igual y el error se iba a un log
// que nadie mira. En transferencias se había decidido lo contrario —sin poder
// auditar, no hay devolución (`confirmar-recepcion/route.js:171-187`)— y nada
// explicaba la diferencia. Eran dos criterios opuestos para el mismo hecho.
//
// EL COSTO DE ESTA DECISIÓN, para que esté a la vista: si la tabla de auditoría
// falla, el ajuste de stock deja de funcionar. Es deliberado. Preferimos que se
// note y se arregle antes que acumular movimientos sin autor.
//
// ── LA AUDITORÍA ES EL DOCUMENTO, Y POR ESO VA PRIMERO ──────────────────────
//
// El Libro de Stock anota cada cambio de `StockLocal` con el origen que la
// transacción declaró. Para el ajuste manual el documento que lo explica es la
// fila de `AuditoriaStock`, así que se escribe ANTES que el stock: primero la
// auditoría, después `declararOrigenDeStock(AJUSTE_MANUAL, auditoría.id)`, y
// recién después el cambio. El movimiento queda apuntando a su causa sin copiarla.
//
// ── LA CANTIDAD SE LEE BLOQUEADA, ADENTRO ───────────────────────────────────
//
// Antes se leía `actual` FUERA de la transacción y se escribía un valor absoluto
// adentro. Una venta que bajaba 10 a 9 entre las dos quedaba borrada: restar 3
// dejaba 7 en vez de 6, y la auditoría decía 10 → 7 mientras el libro decía
// 9 → 7. Ahora la fila se bloquea con `FOR UPDATE` —el mismo bloqueo que toma la
// venta— y todo se calcula desde lo que hay de verdad.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { getConfigLocalEfectiva } from "@/lib/config/local";
import {
  esConfiguracion,
  interpretarLimite,
  valorAGuardar,
} from "@/lib/stock/limites";
import { unidadFisicaDeStock } from "@/lib/stock/escalaFisica";
import {
  ACCION_AUDITORIA_AJUSTE,
  calcularNuevoStock,
  validarCausaContraElStockReal,
  validarPedidoDeAjuste,
} from "@/lib/stock/ajusteManual";
import { declararOrigenDeStock, ORIGEN_STOCK } from "@/lib/stock/libro/libroStock";

const TEXTO_SIN_AUDITORIA =
  "No se puede registrar el ajuste porque no se pudo determinar el grupo de la " +
  "ubicación, y sin eso no queda rastro de quién lo hizo. El stock no se tocó.";

const TEXTO_FILA_CONCURRENTE =
  "El stock de este producto se creó mientras se guardaba el ajuste. Volvé a " +
  "intentarlo: el stock no se tocó.";

const MODOS = new Set(["ajuste", "limites"]);

/** Un rechazo que se decide adentro de la transacción y la revierte entera. */
class RechazoDelAjuste extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * El local sobre el que se ajusta, con el protocolo de siempre: el admin sin
 * local fijo lo manda; el resto usa el de su sesión.
 */
function resolverLocal(session, localIdPedido) {
  if (session.esAdmin && !session.localId) {
    const localId = Number(localIdPedido || 0);
    if (!localId) return { error: "localId requerido para admin sin local.", status: 400 };
    return { localId };
  }
  const localId = Number(session.localId || 0);
  if (!localId) return { error: "localId inválido en sesión.", status: 400 };
  return { localId };
}

/**
 * LAS REGLAS QUE RIGEN UN AJUSTE EN ESTE LOCAL. Una sola resolución para el GET
 * —lo que la pantalla muestra— y el POST —lo que el servidor exige—.
 *
 * `allowNegativeStock` sale de `getConfigLocalEfectiva`, la misma que usa el
 * POS: el local manda y el grupo es el respaldo. Antes esta ruta leía solo el
 * del grupo, así que un local configurado distinto se ajustaba con otra regla
 * que la que vendía. Los dos "motivo obligatorio" son del grupo, como siempre.
 */
async function reglasDelAjuste(localId) {
  const grupoId = await getGrupoIdDeLocal(localId);
  const [efectiva, configGrupo] = await Promise.all([
    getConfigLocalEfectiva(localId, grupoId),
    grupoId
      ? prisma.configuracionGrupo.findUnique({
          where: { grupoId },
          select: { requireMotivoAjusteStock: true, requireMotivoLimitesStock: true },
        })
      : Promise.resolve(null),
  ]);
  return {
    grupoId,
    allowNegativeStock: efectiva.allowNegativeStock === true,
    requireMotivoAjuste: configGrupo?.requireMotivoAjusteStock === true,
    requireMotivoLimites: configGrupo?.requireMotivoLimitesStock === true,
  };
}

/** La fila bloqueada hasta el fin de la transacción, o null si no existe. */
async function bloquearFila(tx, localId, productoLocalId) {
  const filas = await tx.$queryRaw`
    SELECT "id", "cantidad", "stockMin", "stockMax"
    FROM "StockLocal"
    WHERE "localId" = ${localId} AND "productoId" = ${productoLocalId}
    FOR UPDATE`;
  return filas[0] ?? null;
}

/**
 * Crea la fila en cero si falta, con el origen ya declarado, y la devuelve
 * bloqueada. `skipDuplicates` es el `ON CONFLICT DO NOTHING`: si otro pedido la
 * creó en el medio, no se duplica ni explota, y la lectura que sigue la ve.
 */
async function crearFilaEnCero(tx, localId, productoLocalId) {
  await tx.stockLocal.createMany({
    data: [
      {
        localId,
        productoId: productoLocalId,
        cantidad: 0,
        // NULL, no 0: crear la fila para poder ajustar cantidad no configura
        // límites. Los sella el modo "limites", más abajo.
        stockMin: null,
        stockMax: null,
      },
    ],
    skipDuplicates: true,
  });
  return bloquearFila(tx, localId, productoLocalId);
}

/**
 * Lo que la pantalla de ajuste necesita saber ANTES de mostrar el formulario:
 * si la causa es obligatoria en este grupo. Lo resuelve la misma función que
 * aplica el POST, así la pantalla no puede decir "opcional" donde el servidor
 * la exige.
 */
export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const perm = checkPerm(session, "stock.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const local = resolverLocal(session, req.nextUrl.searchParams.get("localId"));
    if (local.error) return NextResponse.json({ ok: false, error: local.error }, { status: local.status });

    const reglas = await reglasDelAjuste(local.localId);
    return NextResponse.json({
      ok: true,
      requireMotivoAjusteStock: reglas.requireMotivoAjuste,
      requireMotivoLimitesStock: reglas.requireMotivoLimites,
    });
  } catch (err) {
    console.error("❌ ERROR REGLAS DEL AJUSTE:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer las reglas del ajuste: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    // ======================================================
    // 0) SESSION + PERMISOS
    // ======================================================
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "stock.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // ======================================================
    // 1) ENTRADA
    // ======================================================
    //
    // TODO lo que se puede validar sin mirar el stock se valida ANTES de
    // escribir nada: antes un pedido inválido ya había dejado creada la fila en
    // cero —y su ALTA en el Libro— cuando recién se enteraba de que no servía.
    const productoLocalId = Number(body.productoLocalId || 0);
    const modo = String(body.modo || "ajuste");
    if (!MODOS.has(modo)) {
      return NextResponse.json({ ok: false, error: "Modo inválido" }, { status: 400 });
    }
    const motivo = (body.motivo || "").trim();

    // ── TRES RAMAS, NO DOS ──────────────────────────────────────────────────
    //
    // No vino / vino vacío / vino un número. `Number(null)` y `Number("")` dan 0,
    // así que "sacá el límite" y "poné el límite en cero" terminaban escritos
    // igual — y desde que el 0 es un valor configurado válido, esa confusión es
    // justo la que hay que cerrar. Ver `lib/stock/limites.js`.
    const minPedido = interpretarLimite(body.nuevoMin);
    const maxPedido = interpretarLimite(body.nuevoMax);

    // ======================================================
    // 2) RESOLVER localId REAL SEGÚN PROTOCOLO
    // ======================================================
    const local = resolverLocal(session, body.localId);
    if (local.error) {
      return NextResponse.json({ ok: false, error: local.error }, { status: local.status });
    }
    const { localId } = local;

    // ======================================================
    // 2b) LAS REGLAS DEL LOCAL (motivo obligatorio, stock negativo)
    // ======================================================
    const reglas = await reglasDelAjuste(localId);
    const { grupoId } = reglas;

    if (modo === "limites" && reglas.requireMotivoLimites && !motivo) {
      return NextResponse.json(
        { ok: false, error: "Motivo requerido para modificar límites de stock." },
        { status: 400 }
      );
    }

    // ======================================================
    // 3) SABER SI ES DEPÓSITO
    // ======================================================
    const localRow = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (!localRow) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    const esDeposito = localRow.es_deposito === true;

    // ======================================================
    // 4) VALIDAR PRODUCTOLOCAL
    // ======================================================
    const prodLocal = await prisma.productoLocal.findUnique({
      where: { id: productoLocalId },
      select: {
        id: true,
        localId: true,
        base: {
          select: {
            es_combo: true,
            // Lo que pide `unidadFisicaDeStock` para saber si la fila va en piezas.
            unidad_medida: true,
            modoCompraProveedor: true,
            pesoReferenciaKg: true,
            modoVentaDeposito: true,
            pesoEsFijo: true,
          },
        },
      },
    });

    if (!prodLocal || prodLocal.localId !== localId) {
      return NextResponse.json(
        { ok: false, error: "Producto/local inválido" },
        { status: 404 }
      );
    }

    // Guard combos: un combo no tiene stock físico propio; no se ajusta ni se le
    // crea StockLocal. Su disponibilidad se calcula desde los componentes.
    if (prodLocal.base?.es_combo === true) {
      return NextResponse.json(
        { ok: false, error: "Un combo no tiene stock propio: ajustá el stock de sus componentes." },
        { status: 400 }
      );
    }

    // EL AJUSTE NO SE MUEVE SIN RASTRO. Ver el criterio al pie del archivo.
    // Se pregunta acá, antes de escribir, en los dos modos.
    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: TEXTO_SIN_AUDITORIA },
        { status: 409 }
      );
    }

    // ======================================================
    // 5) MODO AJUSTE
    // ======================================================
    if (modo === "ajuste") {
      // ── LA CANTIDAD YA LLEGA EN LA UNIDAD DE LA FILA ─────────────────────
      //
      // No se convierte nada: se suma, se resta o se fija tal cual. Una fila
      // contada en PIEZAS —el peso fijo en el depósito— no acepta media pieza;
      // los kilos siguen admitiendo decimales.
      const pedido = validarPedidoDeAjuste({
        tipo: body.tipo,
        cantidad: body.cantidad,
        motivoPrincipal: body.motivoPrincipal,
        motivo,
        unidadFisica: unidadFisicaDeStock(prodLocal.base, esDeposito),
      });
      if (!pedido.ok) {
        return NextResponse.json({ ok: false, error: pedido.error }, { status: pedido.status });
      }

      const actualizado = await prisma.$transaction(async (tx) => {
        // 1 · La cantidad REAL, bloqueada. Sin fila todavía, es cero: la fila
        //     se crea más abajo, ya con el origen declarado.
        const fila = await bloquearFila(tx, localId, productoLocalId);
        const actual = fila ? Number(fila.cantidad) : 0;

        // 2 · Calcular desde ella y validar la causa contra lo que pasa de
        //     verdad. Hasta acá no se escribió nada.
        const nuevoStock = calcularNuevoStock({
          actual,
          tipo: pedido.tipo,
          cantidad: pedido.cantidad,
          allowNegativeStock: reglas.allowNegativeStock,
        });
        const causa = validarCausaContraElStockReal({
          actual,
          nuevo: nuevoStock,
          motivoPrincipal: pedido.motivoPrincipal,
          requireMotivo: reglas.requireMotivoAjuste,
        });
        if (!causa.ok) throw new RechazoDelAjuste(causa.status, causa.error);

        // 3 · El documento del ajuste.
        const auditoria = await tx.auditoriaStock.create({
          data: {
            grupoId,
            localId,
            productoLocalId,
            userId: session.id,
            accion: ACCION_AUDITORIA_AJUSTE[pedido.tipo],
            cantidadAnterior: actual,
            cantidadNueva: nuevoStock,
            motivoPrincipal: pedido.motivoPrincipal,
            motivo: pedido.motivo,
          },
        });

        // 4 · Qué documento explica los movimientos que siguen.
        await declararOrigenDeStock(tx, {
          origen: ORIGEN_STOCK.AJUSTE_MANUAL,
          referencia: String(auditoria.id),
        });

        // 5 · La fila en cero si faltaba. Si otro pedido la creó con otra
        //     cantidad en el medio, el "anterior" de la auditoría ya no es
        //     verdad: se revierte todo y se pide reintentar.
        if (!fila) {
          const creada = await crearFilaEnCero(tx, localId, productoLocalId);
          if (Number(creada.cantidad) !== actual) {
            throw new RechazoDelAjuste(409, TEXTO_FILA_CONCURRENTE);
          }
        }

        // 6 · El cambio.
        return tx.stockLocal.update({
          where: { localId_productoId: { localId, productoId: productoLocalId } },
          data: { cantidad: nuevoStock },
        });
      });

      return NextResponse.json({
        ok: true,
        item: {
          id: actualizado.id,
          localId: actualizado.localId,
          productoId: actualizado.productoId,
          cantidad: Number(actualizado.cantidad || 0),
          stockMin: Number(actualizado.stockMin || 0),
          stockMax: Number(actualizado.stockMax || 0),
        },
      });
    }

    // ======================================================
    // 6) MODO LIMITES
    // ======================================================
    //
    // No mueve cantidad, así que el Libro no anota nada salvo el ALTA en cero
    // de la fila, si faltaba. Los límites anteriores se leen de la fila
    // BLOQUEADA, por la misma razón que la cantidad del ajuste.
    const actualizado = await prisma.$transaction(async (tx) => {
      let fila = await bloquearFila(tx, localId, productoLocalId);
      if (!fila) {
        await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.LIMITES_STOCK });
        fila = await crearFilaEnCero(tx, localId, productoLocalId);
      }

      // El anterior conserva su null: con `Number(null || 0)` la auditoría decía
      // "antes valía cero" sobre un límite que no existía, y esa fila de
      // auditoría es la que después usa el backfill para decidir.
      const minAnterior = fila.stockMin === null ? null : Number(fila.stockMin);
      const maxAnterior = fila.stockMax === null ? null : Number(fila.stockMax);

      const upd = await tx.stockLocal.update({
        where: { localId_productoId: { localId, productoId: productoLocalId } },
        data: {
          // Lo que no vino no se toca; lo que vino vacío se borra; lo que vino
          // como número se guarda, cero incluido.
          stockMin: valorAGuardar(minPedido, minAnterior),
          stockMax: valorAGuardar(maxPedido, maxAnterior),
          // ── ACÁ SE SELLA LA MARCA, Y ES EL ÚNICO LUGAR QUE LO HACE ──────
          //
          // Pasar por Límites ES configurar, aunque lo guardado sea un cero o
          // un borrado: lo que se registra es que hubo una decisión, no el
          // valor. Si registrara el valor volveríamos a no poder distinguir un
          // cero puesto a propósito de una fila recién creada.
          //
          // OJO, y es lo que casi se nos escapa: la especificación de esta
          // tanda pedía sellar en `/api/stock_locales/limites`, pero ESA RUTA
          // NO SE USA — los dos modales llaman acá. Sellar solo allá habría
          // dejado la marca en null para siempre y la card "Límites sin
          // ajustar" mostrando el catálogo entero.
          ...(esConfiguracion(minPedido, maxPedido)
            ? { limitesConfiguradosAt: new Date() }
            : {}),
        },
      });
      await tx.auditoriaStock.create({
        data: {
          grupoId,
          localId,
          productoLocalId,
          userId: session.id,
          accion: "LIMITES",
          stockMinAnterior: minAnterior,
          stockMinNuevo: upd.stockMin === null ? null : Number(upd.stockMin),
          stockMaxAnterior: maxAnterior,
          stockMaxNuevo: upd.stockMax === null ? null : Number(upd.stockMax),
          motivo: motivo || null,
        },
      });
      return upd;
    });

    return NextResponse.json({
      ok: true,
      item: {
        id: actualizado.id,
        localId: actualizado.localId,
        productoId: actualizado.productoId,
        cantidad: Number(actualizado.cantidad || 0),
        stockMin: actualizado.stockMin === null ? null : Number(actualizado.stockMin),
        stockMax: actualizado.stockMax === null ? null : Number(actualizado.stockMax),
        limitesConfigurados: actualizado.limitesConfiguradosAt !== null,
      },
    });

  } catch (err) {
    if (err instanceof RechazoDelAjuste) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error("❌ ERROR AJUSTAR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

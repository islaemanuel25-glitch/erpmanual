// app/api/pedidos/set-cantidad/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { esBultoMode } from "@/lib/conversiones/stock";
import { esComboBase } from "@/lib/combos/guards";
import { sinCancelados } from "@/lib/pedidos/estados";

export async function POST(req) {
  try {
    // Auth + localId + grupoId (soporta admin con contexto activo)
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto || false },
        { status: scope.status }
      );
    }

    const { localId, grupoId, session } = scope;

    // Permisos
    const permisos = Array.isArray(session.permisos) ? session.permisos : [];
    if (!permisos.includes("*") && !permisos.includes("pedidos.editar")) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso para editar pedidos" },
        { status: 403 }
      );
    }

    // Verificar que no es depósito
    const localUser = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (localUser?.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "El depósito no usa esta función. Usá POS Transferencias." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const productoLocalId = Number(body.productoLocalId || 0);
    const cantidad = Number(body.cantidad || 0);

    if (!productoLocalId) {
      return NextResponse.json(
        { ok: false, error: "productoLocalId requerido" },
        { status: 400 }
      );
    }

    if (cantidad < 0) {
      return NextResponse.json(
        { ok: false, error: "La cantidad no puede ser negativa" },
        { status: 400 }
      );
    }

    // Resolver depósito del grupo
    const grupoDeposito = await prisma.grupoDeposito.findFirst({
      where: { grupoId },
      select: { localId: true },
    });

    if (!grupoDeposito) {
      return NextResponse.json(
        { ok: false, error: "No se encontró un depósito para el grupo" },
        { status: 400 }
      );
    }

    const depositoId = grupoDeposito.localId;

    // Verificar que el productoLocal pertenece al depósito
    const productoOrigen = await prisma.productoLocal.findUnique({
      where: { id: productoLocalId },
      include: { base: true },
    });

    if (!productoOrigen || productoOrigen.localId !== depositoId) {
      return NextResponse.json(
        { ok: false, error: "Producto no encontrado en el depósito" },
        { status: 404 }
      );
    }

    // Los combos no se transfieren: se transfieren sus componentes.
    if (esComboBase(productoOrigen.base)) {
      return NextResponse.json(
        { ok: false, error: "Los combos no se transfieren; se transfieren sus componentes." },
        { status: 400 }
      );
    }

    // Validar modo_envio: si llega cantidad en UNIDAD y el producto sale por bulto,
    // la cantidad debe ser múltiplo de factorPack. Si llega en BULTO, no aplica.
    const base = productoOrigen.base;
    const factorPack = Number(base?.factor_pack || 1);
    const unidadIn = body.unidad === "BULTO" ? "BULTO" : "UNIDAD";

    if (
      unidadIn === "UNIDAD" &&
      cantidad > 0 &&
      base?.modo_envio === "SOLO_BULTO" &&
      factorPack > 1
    ) {
      if (cantidad % factorPack !== 0) {
        return NextResponse.json(
          { ok: false, error: `Este producto se pide por bulto completo (x${factorPack}).` },
          { status: 400 }
        );
      }
    }

    // Se respeta la unidad recibida ("BULTO" o "UNIDAD"). Fallback a "UNIDAD".
    const unidad = unidadIn;

    // ── TODO LO QUE ESCRIBE, EN UNA TRANSACCIÓN Y DE A UNO POR PAR ──────────
    //
    // Antes buscar el borrador, buscar la línea y crearla iban por separado.
    // Dos toques rápidos al + sobre un producto en 0 viajaban juntos, ninguno
    // encontraba la línea y los dos la creaban: dos líneas del mismo producto
    // (reproducido 8 de 11 contra erpazul_al, pedido #31). Y una cantidad que
    // llegaba justo detrás del envío no encontraba borrador y abría uno nuevo
    // al lado del pedido enviado.
    //
    // Dos bloqueos, y cada uno cubre un choque distinto:
    //
    // · `pg_advisory_xact_lock(depósito, local)`: hace esperar a otro
    //   `set-cantidad` del mismo par hasta que éste termine. Va sobre el PAR y
    //   no sobre la fila del borrador porque, sin borrador todavía, no hay fila
    //   que bloquear y dos pedidos crearían dos. Es la forma de dos claves de
    //   32 bits, que en PostgreSQL no se pisa con la de una clave que usan
    //   Ofertas y la anulación de ventas.
    //
    // · `SELECT … FOR UPDATE` sobre la fila del borrador: hace esperar al envío
    //   (`/api/pos-transferencias/solicitar` actualiza esa fila) o espera a que
    //   el envío termine. Si el envío ganó, la fila se relee ya en
    //   "Solicitado" y no se escribe nada en ella.
    //
    // Sin migración a propósito: un índice único fallaría al aplicarse sobre
    // los pedidos que ya tienen líneas repetidas. Esos se arreglan solos acá
    // cuando se toca el producto (ver más abajo).
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${depositoId}::int, ${localId}::int)`;

      let pos = await tx.posTransferencia.findFirst({
        where: sinCancelados({
          origenId: depositoId,
          destinoId: localId,
          estado: { in: ["Borrador", "Preparando"] },
        }),
        orderBy: { createdAt: "desc" },
      });

      if (pos) {
        // La fila, bloqueada y releída: si el envío la pasó a "Solicitado"
        // mientras tanto, ya no es un borrador.
        const [bloqueada] = await tx.$queryRaw`SELECT id, estado FROM "PosTransferencia" WHERE id = ${pos.id} FOR UPDATE`;
        if (!bloqueada || !["Borrador", "Preparando"].includes(bloqueada.estado)) pos = null;
      }

      // ── MIENTRAS HAY UN PEDIDO ENVIADO, NO SE ARMA OTRO ─────────────────
      // Regla de Emanuel. El criterio de "Solicitado sin cancelar" es el
      // mismo de `solicitar`: `sinCancelados` sobre el par.
      //
      // Se pregunta DESPUÉS de buscar y bloquear el borrador, y el orden es el
      // arreglo: preguntado antes, un envío que se confirmaba entre las dos
      // consultas no se veía en la primera y ya se había llevado el borrador
      // en la segunda, y se abría uno nuevo (medido: 7 de 20). Ahora, si el
      // envío se llevó el borrador, ya está confirmado cuando se pregunta.
      const enviado = await tx.posTransferencia.findFirst({
        where: sinCancelados({ estado: "Solicitado", origenId: depositoId, destinoId: localId }),
        select: { id: true },
      });
      if (enviado) return { conflicto: true };

      if (!pos) {
        pos = await tx.posTransferencia.create({
          data: {
            origenId: depositoId,
            destinoId: localId,
            usuarioId: session.id,
            estado: "Borrador",
          },
        });
      }

      // Todas las líneas del producto: con el bloqueo puesto hay una o
      // ninguna, pero los borradores de antes pueden tener dos.
      const lineas = await tx.posTransferenciaDetalle.findMany({
        where: {
          posTransferenciaId: pos.id,
          productoId: productoLocalId,
          pos: sinCancelados(),
        },
        orderBy: { id: "asc" },
      });
      const [existente, ...sobrantes] = lineas;

      let item = null;

      if (cantidad === 0) {
        // Quitar el producto: todas sus líneas, también las repetidas.
        if (lineas.length) {
          await tx.posTransferenciaDetalle.deleteMany({ where: { id: { in: lineas.map((l) => l.id) } } });
        }
      } else {
        // Upsert: sugerido = cantidad, preparado = 0
        if (existente) {
          item = await tx.posTransferenciaDetalle.update({
            where: { id: existente.id },
            data: {
              sugerido: cantidad,
              preparado: 0,
              unidadSugerida: unidad,
              tipo: "manual",
            },
          });
          // Un borrador viejo con el producto dos veces queda con UNA línea,
          // la de la cantidad nueva.
          if (sobrantes.length) {
            await tx.posTransferenciaDetalle.deleteMany({ where: { id: { in: sobrantes.map((l) => l.id) } } });
          }
        } else {
          item = await tx.posTransferenciaDetalle.create({
            data: {
              posTransferenciaId: pos.id,
              productoId: productoLocalId,
              sugerido: cantidad,
              preparado: 0,
              tipo: "manual",
              unidadSugerida: unidad,
              unidadPreparada: unidad,
            },
          });
        }
      }

      // Contar items en el carrito
      const itemCount = await tx.posTransferenciaDetalle.count({
        where: { posTransferenciaId: pos.id, pos: sinCancelados() },
      });

      return { pos, item, itemCount };
    });

    if (resultado.conflicto) {
      return NextResponse.json(
        { ok: false, error: "Hay un pedido enviado esperando al depósito. Cancelalo para pedir otra cosa." },
        { status: 409 }
      );
    }

    const { pos, item, itemCount } = resultado;

    return NextResponse.json({
      ok: true,
      posId: pos.id,
      item: item
        ? {
            detalleId: item.id,
            productoLocalId: item.productoId,
            sugerido: Number(item.sugerido || 0),
            preparado: Number(item.preparado || 0),
            unidadSugerida: item.unidadSugerida,
          }
        : null,
      itemCount,
      cantidad,
    });
  } catch (err) {
    console.error("Error pedidos/set-cantidad:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

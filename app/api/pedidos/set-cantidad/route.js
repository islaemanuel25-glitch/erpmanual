// app/api/pedidos/set-cantidad/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { esBultoMode } from "@/lib/conversiones/stock";
import { esComboBase } from "@/lib/combos/guards";
import { sinCancelados } from "@/lib/pedidos/estados";
import { bloquearParDelPedido, bloquearFilaDelPedido, depositoEmpezo } from "@/lib/pedidos/bloqueoDelPedido";

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
    // Los dos bloqueos —el del par depósito→local y la fila del pedido FOR
    // UPDATE— y por qué son dos están en `lib/pedidos/bloqueoDelPedido.js`. Los
    // toman también las rutas del depósito que empiezan el pedido, así que o la
    // cantidad entra antes de que el depósito lo tome, o se contesta 409.
    //
    // Sin migración a propósito: un índice único fallaría al aplicarse sobre
    // los pedidos que ya tienen líneas repetidas. Esos se arreglan solos acá
    // cuando se toca el producto (ver más abajo).
    const resultado = await prisma.$transaction(async (tx) => {
      await bloquearParDelPedido(tx, depositoId, localId);

      // ── EL PEDIDO ENVIADO, SI LO HAY, SE SIGUE ARMANDO ──────────────────
      // Regla de Emanuel (reemplaza la de 9e2f438, que lo trababa): mientras
      // el pedido enviado espera al depósito, el local le suma productos y le
      // cambia cantidades, sin cancelarlo y sin abrir otro. Hasta que el
      // depósito lo EMPIEZA (`depositoEmpezo`): desde ahí, 409.
      //
      // El criterio de "Solicitado sin cancelar" es el mismo de `solicitar`:
      // `sinCancelados` sobre el par.
      //
      // Se pregunta DOS veces, antes y después de buscar el borrador: `solicitar`
      // no toma el bloqueo del par, y si confirma entre las dos lecturas el
      // borrador ya no aparece como borrador y el enviado no apareció todavía
      // —cada consulta ve lo confirmado hasta ese momento—. Con una sola
      // pregunta se abría un borrador nuevo al lado del enviado (13 de 20
      // vueltas de la carrera 8b contra erpazul_al).
      const tomarEnviado = async () => {
        const enviado = await tx.posTransferencia.findFirst({
          where: sinCancelados({ estado: "Solicitado", origenId: depositoId, destinoId: localId }),
          orderBy: { solicitadoAt: "desc" },
          select: { id: true },
        });
        if (!enviado) return null;
        const fila = await bloquearFilaDelPedido(tx, enviado.id);
        if (await depositoEmpezo(tx, fila)) return { conflicto: true };
        return { id: fila.id, estado: fila.estado };
      };
      let pos = await tomarEnviado();
      if (pos?.conflicto) return pos;

      if (!pos) {
        pos = await tx.posTransferencia.findFirst({
          where: sinCancelados({
            origenId: depositoId,
            destinoId: localId,
            estado: { in: ["Borrador", "Preparando"] },
          }),
          orderBy: { createdAt: "desc" },
        });
        if (pos) {
          // La fila, bloqueada y releída: si el local la acaba de enviar
          // (`solicitar` actualiza esa fila sin tomar el bloqueo del par), ya
          // es el pedido enviado, que todavía nadie empezó: se escribe ahí.
          const fila = await bloquearFilaDelPedido(tx, pos.id);
          if (!fila) pos = null;
          else if (fila.estado === "Solicitado") {
            if (await depositoEmpezo(tx, fila)) return { conflicto: true };
          } else if (!["Borrador", "Preparando"].includes(fila.estado)) pos = null;
        }
      }

      if (!pos) {
        pos = await tomarEnviado();
        if (pos?.conflicto) return pos;
      }

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
          // Un pedido viejo —borrador o enviado sin empezar— con el producto
          // dos veces queda con UNA línea, la de la cantidad nueva.
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
        { ok: false, error: "El depósito ya está preparando tu pedido. Ya no se puede cambiar." },
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

// app/api/transferencias/guardar-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import {
  validarDetalleRecepcion,
  mensajeRecepcion,
  statusRecepcion,
} from "@/lib/transferencias/recepcion";
import {
  ErrorRecepcion,
  detalleParaValidar,
  estadoAdmiteRecepcion,
  puedeRecibir,
  reclamarOFallar,
} from "@/lib/transferencias/recepcionServidor";

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

    const body = await req.json();
    const { transferenciaId, items } = body;

    if (!transferenciaId || !Array.isArray(items)) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    // Scope: non-admin debe ser destino de la transferencia
    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      select: { destinoId: true, estado: true },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    // Prechequeos BARATOS y no autoritativos: sirven para contestar rápido y con
    // un mensaje bueno. El estado se vuelve a exigir adentro de la transacción,
    // donde sí es una garantía; acá todavía puede cambiar entre esta lectura y
    // la escritura.
    const estado = estadoAdmiteRecepcion(transferencia.estado, { accion: "guardar cambios" });
    if (!estado.ok) {
      return NextResponse.json({ ok: false, error: estado.error }, { status: estado.status });
    }

    // El alcance sí es definitivo: el destino de una transferencia no cambia, y
    // los permisos de la sesión tampoco durante el pedido.
    const alcance = puedeRecibir(session, transferencia);
    if (!alcance.ok) {
      return NextResponse.json({ ok: false, error: alcance.error }, { status: alcance.status });
    }

    // ============================================================
    // 🟦 TODO ADENTRO DE UNA TRANSACCIÓN, Y EL LOCK PRIMERO
    //
    // Antes esto validaba con una lectura suelta y después escribía con N
    // updates sueltos. Dos agujeros:
    //
    //   1. Entre la validación y la escritura, confirmar podía cerrar la
    //      transferencia. Los updates se aplicaban igual, sobre una recepción ya
    //      confirmada, y ese `recibido` nuevo no movía ningún stock — quedaba una
    //      transferencia "Recibida" cuyo detalle dice otra cosa que su stock.
    //   2. Sin transacción, un fallo a mitad de la lista dejaba la recepción a
    //      medio guardar, que es justo lo que el comentario viejo decía evitar.
    //
    // `reclamarOFallar` es la primera escritura: toma el lock de la fila de la
    // transferencia y, de paso, exige que el estado siga admitiendo edición. Si
    // confirmar llegó antes, empareja cero y esto aborta sin escribir nada.
    // ============================================================
    await prisma.$transaction(async (tx) => {
      await reclamarOFallar(tx, transferenciaId, "Recibiendo");

      // ── VALIDACIÓN — contra la BASE, no contra lo que manda el cliente ──
      //
      // La cantidad enviada sale del detalle persistido. Antes se leía de
      // `it.enviado`, es decir del propio request: bastaba mandar un `enviado`
      // inflado para guardar un `recibido` mayor al real y, al confirmar,
      // acreditarle al destino stock que nunca salió del origen.
      //
      // Y se relee ACÁ, después del lock, no antes: una línea agregada o
      // borrada entre medio cambiaría qué se está validando.
      const detalles = await tx.transferenciaDetalle.findMany({
        where: { transferenciaId, id: { in: items.map((it) => Number(it.id)) } },
        include: { producto: { include: { base: true } } },
      });
      const porId = new Map(detalles.map((d) => [d.id, d]));

      const planes = [];
      for (const it of items) {
        const d = porId.get(Number(it.id));
        if (!d) {
          throw new ErrorRecepcion(
            "DETALLE_INEXISTENTE",
            "Detalle inexistente o de otra transferencia",
            400
          );
        }

        // La cantidad, la unidad y el factor salen de `detalleParaValidar`, la
        // MISMA resolución que usan revisar, confirmar y la pantalla. Siguen
        // saliendo de la base y no del request —si vinieran de ahí, cualquiera
        // podría marcar una línea del remito como agregada y dejar su tránsito
        // sin limpiar—; lo que cambia es que ahora la escala respeta el snapshot
        // en vez de leer `unidadEnviada` y el `factor_pack` vivo.
        const plan = validarDetalleRecepcion({
          ...detalleParaValidar(d, {
            detalle: {
              motivoPrincipal: it.motivoPrincipal,
              motivoDetalle: it.motivoDetalle,
            },
          }),
          recibidoPropuesto: it.recibido,
          sueltasPropuestas: it.recibidoUnidadesSueltas,
        });

        if (!plan.ok) {
          const nombre = d.producto?.base?.nombre || null;
          throw new ErrorRecepcion(
            plan.error,
            mensajeRecepcion(plan.error, { nombre }),
            statusRecepcion(plan.error)
          );
        }

        planes.push({ id: d.id, plan, it });
      }

      // Se valida TODO antes de escribir nada: si un item falla, no se guarda
      // ninguno. Ahora además lo garantiza la transacción y no el orden.
      for (const { id, plan, it } of planes) {
        await tx.transferenciaDetalle.update({
          where: { id },
          data: {
            recibido: plan.recibida,
            // El pack incompleto, normalizado por el validador: 0 si no hay.
            recibidoUnidadesSueltas: plan.recibidaSueltas,

            motivoPrincipal: plan.hayDiferencia ? it.motivoPrincipal || null : null,

            motivoDetalle:
              plan.hayDiferencia && it.motivoPrincipal === "Otro"
                ? it.motivoDetalle || null
                : null,

            // ── ESTA RUTA NO MARCA REVISADO, Y ES DELIBERADO ──────────────
            //
            // Guardar es un BORRADOR: "empecé a contar esto". Cerrar el control
            // físico es otro acto, tiene autor y hora, y habilita confirmar la
            // transferencia — vive en `revisar-producto`.
            //
            // Si guardar marcara revisado, un "Guardar" sobre una línea daría
            // por controlado un producto que nadie terminó de contar, y la
            // guarda de confirmación dejaría de significar algo.
          },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Abortos deliberados desde adentro de la transacción: nada quedó escrito.
    if (err.name === "ErrorRecepcion") {
      return NextResponse.json(
        { ok: false, codigo: err.code, error: err.message },
        { status: err.status || 409 }
      );
    }
    console.error("ERROR guardar-recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

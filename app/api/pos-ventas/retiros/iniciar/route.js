// POST /api/pos-ventas/retiros/iniciar
//
// SEPARA EL CAMBIO y TOMA EL CORTE CONGELADO del retiro de recaudación.
//
// EL BUG QUE ESTO CIERRA
//
// El retiro no tenía corte. El efectivo esperado se recalculaba en cada lectura
// y otra vez, definitivamente, dentro de la transacción que confirmaba. Como
// contar lleva veinte minutos y el POS sigue vendiendo, al confirmar se comparaba
// un conteo de las 19:00 contra un esperado de las 19:20: al cajero le aparecía
// un faltante por plata que entró después de que cerrara la pila.
//
// EN QUÉ SE DIFERENCIA DEL CORTE DE CIERRE
//
// El turno SIGUE OPERANDO. No se toca `cierreEnPreparacionEn`, el POS vende
// normalmente con el cambio que se acaba de separar, y las ventas posteriores se
// acumulan encima de él. Tampoco se publica ningún sobre: esta plata no cambia
// de manos, se queda en el mismo cajón del mismo turno.
//
// Lo que este endpoint NO hace, a propósito:
//   · no crea arqueo ni movimiento de caja: todavía no salió plata;
//   · no congela el turno ni bloquea ventas;
//   · no toca ninguna venta ni ningún movimiento anterior.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { contextoArqueo } from "@/lib/caja/arqueoServer";
import { validarDesgloseServidor } from "@/lib/caja/desgloseServidor";
import { generarToken, WHERE_TURNO_OPERATIVO, ERROR_RETIRO_YA_EN_PREPARACION } from "@/lib/caja/cierreRelevo";
import {
  ESTADO_RETIRO,
  calcularRetiroEsperado,
  claveIdempotenciaRetiro,
} from "@/lib/caja/retiroRelevo";
import {
  calcularCorteRetiro,
  serializarRetiroPreparacion,
} from "@/lib/caja/retiroRelevoServer";
import { procesoPendienteDeRetiro } from "@/lib/caja/procesoPendiente";
import {
  cierrePendienteDeTurno,
  retiroPendienteDeTurno,
  nombreDeOperador,
} from "@/lib/caja/procesoPendienteServer";
import { bloquearTurno, OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";

export async function POST(req) {
  // Fuera del `try` a propósito: el manejo del choque contra el índice parcial
  // necesita saber sobre qué turno se estaba cortando, y una `const` adentro del
  // bloque no llega al `catch`.
  let turnoDelPedido = null;
  try {
    const body = await req.json().catch(() => ({}));
    const { turnoId } = body;

    // AUTENTICAR PRIMERO, después validar el payload.
    //
    // `contextoArqueo` resuelve sesión, permiso `pos.usar` y alcance, ancla el
    // turno al localId, y —esto es la mitad de la exclusión mutua— rechaza con
    // 409 si el turno ya tomó su corte de CIERRE. Un retiro sobre una caja
    // cortada caería después de la frontera congelada y el cierre en curso no lo
    // vería nunca.
    const ctx = await contextoArqueo(req, { turnoId, exigirAbierto: true });
    if (ctx.error) {
      // Si lo que bloquea es un CIERRE ya tomado sobre este mismo turno, el
      // rechazo viaja con ese proceso. Antes solo llevaba un texto, y la pantalla
      // no tenía cómo llevar al cajero hasta el conteo que quedó abierto.
      const bloqueante = ctx.enPreparacionDeCierre
        ? await cierrePendienteDeTurno(ctx.turnoId ?? (Number(turnoId) || null))
        : null;
      return NextResponse.json(
        {
          ok: false,
          error: ctx.error,
          needsContexto: ctx.needsContexto,
          enPreparacionDeCierre: ctx.enPreparacionDeCierre ?? false,
          procesoPendiente: bloqueante,
        },
        { status: ctx.status }
      );
    }
    const { session, localId, turno } = ctx;
    turnoDelPedido = turno?.id ?? null;

    if (!turno) {
      return NextResponse.json(
        { ok: false, error: "No hay una caja abierta para retirar" },
        { status: 409 }
      );
    }

    // ── EL CAMBIO SE VALIDA ACÁ, NO SE CONFÍA ──────────────────────────────
    // El cliente manda cuántos billetes de cada uno. El total lo calcula el
    // servidor y cualquier `totalCambio` que venga en el pedido se ignora.
    //
    // Se permite vacío: llevarse todo y dejar el cajón sin cambio es una
    // decisión legítima, aunque poco frecuente.
    const cambio = validarDesgloseServidor(body?.desgloseCambio, {
      etiqueta: "cambio que queda en la caja",
      permitirVacio: true,
    });
    if (!cambio.valido) {
      return NextResponse.json({ ok: false, error: cambio.error }, { status: 400 });
    }

    // El operario queda GRABADO en la fila: es la autoría real del retiro. Desde
    // este instante la pantalla de conteo no vuelve a mirar el operador activo,
    // que es una cookie compartida por todo el navegador.
    const gateOp = await requireOperadorSegunConfig(req, session, { localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // El lock va PRIMERO. Bloquear después de leer no sirve: la lectura vieja
      // ya se usó para decidir. Dos "iniciar retiro" simultáneos sobre el mismo
      // turno se serializan acá.
      await bloquearTurno(tx, turno.id);

      // El turno se revalida DENTRO de la transacción: entre el chequeo de
      // arriba y este punto pudo cerrarse o tomar su corte de cierre.
      const vigente = await tx.turno.findFirst({
        where: { id: turno.id, localId, ...WHERE_TURNO_OPERATIVO },
        select: {
          id: true, localId: true, vendedorId: true, operadorId: true,
          apertura: true, montoInicial: true,
        },
      });
      if (!vigente) {
        const e = new Error("La caja ya fue cerrada o tomó su corte de cierre.");
        e.codigo = "conflicto";
        throw e;
      }

      // ── UN SOLO RETIRO EN PREPARACIÓN ────────────────────────────────────
      // Dos cortes simultáneos congelarían el mismo esperado y cada uno se
      // llevaría la misma recaudación. Se devuelve el que ya existe en vez de
      // romper: lo más probable es que sea la misma persona en otra pestaña.
      const enCurso = await tx.retiroPreparacion.findFirst({
        where: { turnoId: vigente.id, estado: ESTADO_RETIRO.PREPARANDO },
      });
      if (enCurso) return { retiro: enCurso, repetido: true };

      // EL CORTE. Se calcula acá dentro, con el lock tomado, para que el número
      // que se congela sea exactamente el estado que se persiste.
      const corte = await calcularCorteRetiro(vigente, tx);
      const ahora = new Date();

      // Puede dar negativo si se deja como cambio más plata de la que el sistema
      // esperaba encontrar. No se recorta: recortarlo rompería la identidad que
      // hace visible el sobrante. Ver `calcularRetiroEsperado`.
      const efectivoRetiradoEsperado = calcularRetiroEsperado({
        efectivoEsperadoCorte: corte.efectivoEsperadoCorte,
        totalCambio: cambio.total,
      });

      const creado = await tx.retiroPreparacion.create({
        data: {
          token: generarToken(randomBytes),
          turnoId: vigente.id,
          localId,
          iniciadoPorUsuarioId: session.id,
          iniciadoPorOperadorId: gateOp.operadorId ?? vigente.operadorId ?? null,
          corteEn: ahora,
          efectivoEsperadoCorte: corte.efectivoEsperadoCorte,
          ultimaVentaId: corte.ultimaVentaId,
          ultimoMovimientoId: corte.ultimoMovimientoId,
          desgloseCambio: cambio.desglose,
          totalCambio: cambio.total,
          efectivoRetiradoEsperado,
          // Provisoria: se reemplaza abajo por una derivada del id, que es lo
          // único estable y único por preparación. No se puede derivar antes de
          // crear la fila porque el id lo asigna la base.
          idempotencyKey: `retiro-tmp-${ahora.getTime()}-${session.id}`,
        },
      });

      // La clave definitiva sale del id de ESTA preparación: dos confirmaciones
      // de la misma preparación colapsan en una sola fila de ArqueoCaja, y dos
      // retiros distintos del mismo turno nunca chocan entre sí.
      const retiro = await tx.retiroPreparacion.update({
        where: { id: creado.id },
        data: { idempotencyKey: claveIdempotenciaRetiro(creado.id) },
      });

      // EL TURNO NO SE TOCA. Sigue operativo: el POS puede seguir vendiendo con
      // el cambio recién separado, y esas ventas quedan del lado de afuera de la
      // frontera que acabamos de congelar.
      return { retiro, repetido: false, desglose: corte.calculo };
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      repetido: resultado.repetido,
      // Un corte que YA EXISTÍA no es un alta: es un proceso pendiente. Se
      // informa con la misma forma que los rechazos para que la pantalla muestre
      // el cartel en vez de navegar sola a un conteo que el cajero no pidió.
      procesoPendiente: resultado.repetido
        ? procesoPendienteDeRetiro(resultado.retiro, {
            operadorNombre: await nombreDeOperador(resultado.retiro.iniciadoPorOperadorId),
          })
        : null,
      retiro: serializarRetiroPreparacion(resultado.retiro),
      desglose: resultado.desglose
        ? {
            montoInicial: resultado.desglose.montoInicial,
            ventasEfectivo: resultado.desglose.ventasEfectivo,
            ingresos: resultado.desglose.ingresos,
            retiros: resultado.desglose.retiros,
          }
        : null,
    });
  } catch (error) {
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    // Choque contra el índice parcial de "un retiro vigente por turno": otro
    // pedido tomó el corte mientras este estaba en vuelo. La base es la garantía
    // dura.
    if (error?.code === "P2002") {
      // Se busca el corte que ganó la carrera para poder ofrecerlo. Es una
      // lectura más en un camino excepcional, y evita dejar al cajero con un
      // aviso sin salida.
      const pendiente = await retiroPendienteDeTurno(turnoDelPedido);
      return NextResponse.json(
        {
          ok: false,
          error: ERROR_RETIRO_YA_EN_PREPARACION,
          duplicado: true,
          procesoPendiente: pendiente,
        },
        { status: 409 }
      );
    }
    console.error("Error iniciando retiro de recaudación:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

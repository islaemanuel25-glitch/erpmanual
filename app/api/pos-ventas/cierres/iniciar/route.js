// POST /api/pos-ventas/cierres/iniciar
//
// SEPARA EL CAMBIO, TOMA EL CORTE CONGELADO y libera el mostrador, en un solo
// acto atómico.
//
// EL ORDEN FÍSICO IMPORTA Y ES ÉSTE
//
// El cajero primero aparta de la caja los billetes que van a quedar para seguir
// vendiendo, los carga por denominación, y recién entonces corta. Desde el corte
// quedan congelados el efectivo esperado, la frontera de qué ventas y
// movimientos pertenecen al turno, y el cambio separado. Lo que queda por contar
// después es únicamente el dinero que se retira.
//
// El orden inverso —contar todo y elegir el cambio al final— es el que había
// hasta acá, y obligaba a contar el cajón entero mientras el local seguía
// vendiendo sobre ese mismo cajón.
//
// EL SOBRE SE PUBLICA ACÁ, NO AL CONFIRMAR
//
// Ésa es la razón de ser del cambio: el operador que releva tiene que poder
// tomar el cambio, abrir su turno y vender MIENTRAS el saliente todavía cuenta.
// Si el sobre naciera al confirmar, el relevo se quedaría esperando de brazos
// cruzados justamente durante los diez minutos que este flujo existe para
// aprovechar.
//
// Lo que este endpoint NO hace, a propósito:
//   · no cierra el turno — `cierre` sigue en null hasta la confirmación;
//   · no crea arqueo ni movimiento de caja: todavía no salió plata;
//   · no toca ninguna venta ni ningún movimiento anterior.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { validarDesgloseServidor } from "@/lib/caja/desgloseServidor";
import {
  ESTADO_TURNO,
  ESTADO_CIERRE,
  ESTADO_CAMBIO,
  estadoDelTurno,
  generarToken,
  claveIdempotenciaCierre,
  vencimientoCierre,
  calcularRetiroEsperado,
  ERROR_RETIRO_EN_PREPARACION_PARA_CIERRE,
} from "@/lib/caja/cierreRelevo";
import { ESTADO_RETIRO } from "@/lib/caja/retiroRelevo";
import {
  contextoRelevo,
  calcularCorte,
  bloquearTurno,
  serializarCierre,
  serializarCambio,
  OPCIONES_TX,
} from "@/lib/caja/cierreRelevoServer";

export async function POST(req) {
  try {
    const ctx = await contextoRelevo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }
    const { session, localId, grupoId } = ctx;

    const body = await req.json().catch(() => ({}));
    const turnoId = Number(body?.turnoId);
    if (!Number.isInteger(turnoId) || turnoId <= 0) {
      return NextResponse.json({ ok: false, error: "turnoId requerido" }, { status: 400 });
    }

    // ── EL CAMBIO SE VALIDA ACÁ, NO SE CONFÍA ──────────────────────────────
    // El cliente manda cuántos billetes de cada uno. El total lo calcula el
    // servidor y cualquier `totalCambio` que venga en el pedido se ignora.
    //
    // Se permite vacío: dejar $0 de cambio es un cierre legítimo —el turno
    // siguiente abre con lo que consiga— y prohibirlo obligaría a inventar
    // billetes que no están.
    const cambio = validarDesgloseServidor(body?.desgloseCambio, {
      etiqueta: "cambio que queda en la caja",
      permitirVacio: true,
    });
    if (!cambio.valido) {
      return NextResponse.json({ ok: false, error: cambio.error }, { status: 400 });
    }

    // Gate de operario. El operador que inicia el corte queda GRABADO en la fila:
    // es la autoría real del cierre. Desde este instante la pantalla del cierre
    // no vuelve a mirar el operador activo —que es una cookie compartida y va a
    // cambiar cuando el relevo haga login—, así que el conteo no puede terminar
    // firmado por quien no contó.
    const gateOp = await requireOperadorSegunConfig(req, session, { localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // El lock va PRIMERO. Bloquear después de leer no sirve: la lectura vieja
      // ya se usó para decidir. Dos "iniciar cierre" simultáneos sobre el mismo
      // turno se serializan acá; el segundo ve el corte del primero.
      await bloquearTurno(tx, turnoId);

      const turno = await tx.turno.findFirst({
        where: { id: turnoId, localId },
        select: {
          id: true, localId: true, vendedorId: true, operadorId: true,
          apertura: true, cierre: true, cierreEnPreparacionEn: true,
          anuladoEn: true, montoInicial: true,
        },
      });
      if (!turno) {
        const e = new Error("Turno no encontrado en este local");
        e.codigo = "no_encontrado";
        throw e;
      }

      const estado = estadoDelTurno(turno);
      if (estado === ESTADO_TURNO.CERRADO) {
        const e = new Error("El turno ya fue cerrado.");
        e.codigo = "conflicto";
        throw e;
      }
      if (estado === ESTADO_TURNO.ANULADO) {
        const e = new Error("El turno fue anulado.");
        e.codigo = "conflicto";
        throw e;
      }

      // Un corte VIGENTE ya existente. Se busca por estado y no solo por turno
      // porque un corte cancelado deja su fila y no debe bloquear uno nuevo.
      const vigente = await tx.cierrePreparacion.findFirst({
        where: { turnoId, estado: { in: [ESTADO_CIERRE.PREPARANDO, ESTADO_CIERRE.VENCIDO] } },
        include: { cambioPendiente: true },
      });

      if (estado === ESTADO_TURNO.CIERRE_EN_PREPARACION || vigente) {
        // No es un error del usuario: probablemente ya lo inició en otra pestaña.
        // Se devuelve el corte que existe en vez de romper — y con él su sobre,
        // porque el cambio ya quedó decidido y no se vuelve a preguntar.
        if (vigente) return { cierre: vigente, sobre: vigente.cambioPendiente, repetido: true };
        const e = new Error("El turno quedó marcado en preparación sin un corte vigente.");
        e.codigo = "conflicto";
        throw e;
      }

      // ── EXCLUSIÓN MUTUA CON EL RETIRO ─────────────────────────────────────
      // Los dos congelan el mismo esperado sobre el mismo turno. Si convivieran,
      // el segundo en confirmar restaría un retiro que el primero no vio y los
      // dos se atribuirían la misma recaudación. Se chequea DENTRO del lock: un
      // retiro iniciado un milisegundo antes tiene que verse.
      const retiroEnCurso = await tx.retiroPreparacion.findFirst({
        where: { turnoId, estado: ESTADO_RETIRO.PREPARANDO },
        select: { id: true, token: true },
      });
      if (retiroEnCurso) {
        const e = new Error(ERROR_RETIRO_EN_PREPARACION_PARA_CIERRE);
        e.codigo = "conflicto";
        e.retiroToken = retiroEnCurso.token;
        throw e;
      }

      // EL CORTE. Se calcula acá dentro, con el lock tomado, para que el número
      // que se congela sea exactamente el estado que se persiste.
      const corte = await calcularCorte(turno, tx);
      const ahora = new Date();

      // El retiro esperado se congela junto con el esperado. Puede dar negativo
      // si se deja como cambio más plata de la que el sistema esperaba: no se
      // recorta, porque recortarlo rompería la identidad que hace visible el
      // sobrante. Ver `calcularRetiroEsperado`.
      const efectivoRetiradoEsperado = calcularRetiroEsperado({
        efectivoEsperadoCorte: corte.efectivoEsperadoCorte,
        totalCambio: cambio.total,
      });

      const cierre = await tx.cierrePreparacion.create({
        data: {
          token: generarToken(randomBytes),
          turnoId: turno.id,
          localId,
          grupoId,
          iniciadoPorUsuarioId: session.id,
          iniciadoPorOperadorId: gateOp.operadorId ?? turno.operadorId ?? null,
          corteEn: ahora,
          efectivoEsperadoCorte: corte.efectivoEsperadoCorte,
          ultimaVentaId: corte.ultimaVentaId,
          ultimoMovimientoId: corte.ultimoMovimientoId,
          cantidadVentasCorte: corte.cantidadVentasCorte,
          // EL CAMBIO, CONGELADO DESDE ACÁ.
          desgloseCambio: cambio.desglose,
          totalCambio: cambio.total,
          efectivoRetiradoEsperado,
          idempotencyKey: claveIdempotenciaCierre(turno.id),
          venceEn: vencimientoCierre(ahora),
        },
      });

      // ── EL SOBRE, DISPONIBLE YA MISMO ────────────────────────────────────
      //
      // No se crea ningún CajaMovimiento por el cambio, y eso es deliberado: esa
      // plata no salió del cajón, se queda ahí. Ya está contemplada en el corte
      // —el retiro esperado la descuenta— y registrarla además como movimiento la
      // restaría dos veces. Entra al circuito recién cuando el turno siguiente la
      // toma como `montoInicial`.
      //
      // Un cambio de $0 igual se publica: "no quedó nada en el cajón" es
      // información que el operador entrante necesita, y publicarlo mantiene la
      // cadena de sobres completa.
      //
      // `observacion` queda en null a propósito. La observación del cierre se
      // carga al confirmar, y para entonces este sobre puede estar reservado o ya
      // recibido: escribirle algo encima sería modificar un cambio que ya cambió
      // de manos.
      const sobre = await tx.cambioPendiente.create({
        data: {
          localId,
          grupoId,
          cierrePreparacionId: cierre.id,
          turnoOrigenId: turno.id,
          operadorOrigenId: gateOp.operadorId ?? turno.operadorId ?? null,
          dejadoEn: ahora,
          total: cambio.total,
          desglose: cambio.desglose,
          estado: ESTADO_CAMBIO.DISPONIBLE,
        },
      });

      // Y recién ahora el turno deja de operar. El orden importa: si se marcara
      // antes de crear el corte y la creación fallara, el turno quedaría
      // congelado sin ningún cierre al que volver. Están en la misma transacción,
      // así que o pasan todas las cosas o no pasa ninguna.
      await tx.turno.update({
        where: { id: turno.id },
        data: { cierreEnPreparacionEn: ahora },
      });

      return { cierre, sobre, repetido: false, desglose: corte.calculo };
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      repetido: resultado.repetido,
      cierre: serializarCierre(resultado.cierre),
      cambioPendiente: serializarCambio(resultado.sobre),
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
    if (error?.codigo === "no_encontrado") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    if (error?.codigo === "conflicto") {
      return NextResponse.json(
        { ok: false, error: error.message, retiroToken: error.retiroToken ?? null },
        { status: 409 }
      );
    }
    // Choque contra el UNIQUE de turnoId: otro pedido tomó el corte mientras este
    // estaba en vuelo. La base es la garantía dura de "un corte por turno".
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Esta caja ya tiene un cierre en preparación.", duplicado: true },
        { status: 409 }
      );
    }
    console.error("Error iniciando cierre con relevo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

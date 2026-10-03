import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { identidadParaOperar } from "@/lib/caja/identidadCajaServer";
import { resolveScope } from "@/lib/grupos";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
// Fórmula única del efectivo esperado. Antes vivía duplicada acá, en
// turnos/resumen y en ModalCierreTurno; ahora los tres —y los arqueos— usan la
// misma función, así que el cierre y el arqueo no pueden informar faltantes
// distintos sobre la misma caja.
import { calcularEfectivoEsperado, calcularDiferencia } from "@/lib/caja/efectivoEsperado";
// Reparto del efectivo contado: lo que se retira del cajón y lo que queda como
// fondo del próximo turno. Antes no existía y la plata se acumulaba en el cajón.
import {
  sugerirRepartoCierre,
  validarRepartoCierre,
  motivoRetiroCierre,
} from "@/lib/caja/cierreCaja";
import {
  WHERE_TURNO_OPERATIVO,
  estadoDelTurno,
  ESTADO_TURNO,
  ERROR_CAJA_AJENA,
  puedeActuarSobreCaja,
} from "@/lib/caja/cierreRelevo";

const MSG_TURNO_EN_PREPARACION =
  "Esta caja tiene un cierre en preparación. Terminá el conteo desde la pantalla de cierre.";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const {
      turnoId,
      montoRealEfectivo,
      observaciones,
      // Reparto del efectivo contado (paso 3 del cierre). Si no vienen —cliente
      // viejo, cola offline— se usa el reparto sugerido: dejar el fondo de
      // apertura y retirar el resto. Nunca se cierra sin decidir qué pasa con la
      // plata, pero tampoco se rompe un POS que todavía no se actualizó.
      efectivoRetirado,
      fondoDejado,
      destinoRetiro,
      recibidoPor,
    } = await req.json();

    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
    });

    if (!turno) {
      return NextResponse.json(
        { ok: false, error: "Turno no encontrado" },
        { status: 404 }
      );
    }

    // Aislamiento por local. Antes solo se validaba `vendedorId === session.id`:
    // el local del turno nunca se contrastaba contra el alcance de la sesión.
    // Un usuario reasignado a otro local conservaba la llave de un turno ajeno.
    const scope = await resolveScope(req, { explicitLocalId: turno.localId });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    if (scope.localId !== turno.localId) {
      return NextResponse.json(
        { ok: false, error: "Turno fuera de tu alcance." },
        { status: 403 }
      );
    }

    // EL CIERRE ES DE LA CAJA DE QUIEN CIERRA, y se decide ANTES de mirar su
    // estado: el de una caja ajena no se informa. Antes era "de la cuenta", y con
    // una cuenta compartida un operador cerraba la caja de otro. Un cajero común
    // cierra solo la suya; Admin y el Dueño en su local, la de cualquiera, y
    // quedan como `cerradoPorId` y `realizadoPorId`. El local autorizado es el
    // del turno, ya validado arriba. Para DUEÑO_LOCAL el bypass de operario solo
    // aplica si ese local es el suyo (puedeOperarSinOperador).
    const id = await identidadParaOperar(req, session, { localId: turno.localId });
    if (!id.ok) {
      return NextResponse.json(
        { ok: false, error: id.error, needsOperador: true },
        { status: id.status }
      );
    }
    if (!puedeActuarSobreCaja(turno, id.identidad)) {
      return NextResponse.json({ ok: false, error: ERROR_CAJA_AJENA, cajaAjena: true }, { status: 403 });
    }

    if (turno.cierre) {
      return NextResponse.json(
        { ok: false, error: "Turno ya cerrado" },
        { status: 400 }
      );
    }

    // Un turno que ya tomó su corte de cierre NO se cierra por acá.
    //
    // Este endpoint recalcula el efectivo esperado con el estado actual, y ese es
    // justo el número que el corte congeló para no incluir las ventas que hizo el
    // relevo. Cerrarlo por esta vía le imputaría al cajero saliente plata que
    // nunca tuvo en la mano. El arqueo FINAL usa la misma `idempotencyKey` en los
    // dos caminos, así que la base también lo impediría — pero un 409 explicado
    // es mejor que un choque de índice.
    if (turno.cierreEnPreparacionEn) {
      return NextResponse.json(
        {
          ok: false,
          error: MSG_TURNO_EN_PREPARACION,
          turnoEnPreparacionDeCierre: true,
        },
        { status: 409 }
      );
    }

    // Calcular totales de ventas del turno.
    // Misma lógica que resumen/route.js: fiado va aparte, no infla digital.
    // (El modelo Turno no tiene campo totalVentasFiado, así que fiado no se
    // persiste — sólo se evita que contamine totalVentasDigital).
    const [ventas, cajaMovimientos] = await Promise.all([
      prisma.venta.findMany({
        // Las operaciones internas (venta con remito vinculado) no son cobros:
        // sumarlas al efectivo esperado produce un faltante de caja que nunca
        // ocurrió. Mismo criterio que turnos/resumen y turnos/ventas.
        where: whereVentaComercial({ turnoId }),
        select: {
          total: true, formaPago: true, esFiado: true,
          pagos: { select: { medio: true, monto: true } },
        },
      }),
      prisma.cajaMovimiento.findMany({
        where: { turnoId },
        select: { tipo: true, monto: true },
      }),
    ]);

    // Agregación POR TENDER: en una venta mixta, solo el tender efectivo cuenta al
    // efectivo esperado; el resto va a digital. Fiado no aporta plata real.
    // Toda esa aritmética vive ahora en lib/caja/efectivoEsperado.
    const calculo = calcularEfectivoEsperado({
      montoInicial: turno.montoInicial,
      ventas,
      movimientos: cajaMovimientos,
    });

    const totalEfectivo = calculo.ventasEfectivo;
    const totalDigital = calculo.ventasDigital;
    const montoEsperado = calculo.efectivoEsperado;
    const diferencia = calcularDiferencia(montoRealEfectivo, montoEsperado);

    // === Reparto del efectivo contado ===
    //
    // El cajero decide cuánto sale del cajón y cuánto queda para el próximo turno.
    // La regla no admite resto: retirado + fondo dejado = contado. Si no cierra,
    // hay plata sin explicar y el turno NO se cierra.
    const sugerido = sugerirRepartoCierre({
      contado: montoRealEfectivo,
      montoInicial: turno.montoInicial,
    });
    const reparto = validarRepartoCierre({
      contado: montoRealEfectivo,
      retirado: efectivoRetirado ?? sugerido.retirado,
      fondoDejado: fondoDejado ?? sugerido.fondoDejado,
    });
    if (!reparto.valido) {
      return NextResponse.json(
        { ok: false, error: reparto.error, repartoInvalido: true, sugerido },
        { status: 400 }
      );
    }

    const ahora = new Date();

    // El cierre YA pide el efectivo contado, así que ese mismo conteo se guarda
    // como arqueo FINAL en vez de pedirlo dos veces. Es la MISMA diferencia
    // persistida en dos lugares con el mismo valor —el turno la conserva para no
    // romper reportes, el arqueo la incorpora al historial de cortes—, no dos
    // diferencias distintas sobre el mismo conteo.
    //
    // Transacción: si la creación del arqueo fallara, el turno no puede quedar
    // cerrado sin su corte final.
    const { turnoCerrado } = await prisma.$transaction(async (tx) => {
      // Cierre ATÓMICO: el WHERE es el candado. Dos pedidos simultáneos leyeron el
      // turno abierto antes de entrar acá; solo el primero encuentra la fila y el
      // segundo sale con count 0 en vez de cerrar dos veces y crear dos retiros.
      // La clave única del arqueo FINAL es la segunda red.
      //
      // El WHERE es el del turno OPERATIVO, no solo `cierre: null`. El rechazo de
      // `cierreEnPreparacionEn` de arriba mira una lectura hecha fuera de esta
      // transacción: si `cierres/iniciar` toma el corte entre esa lectura y esta
      // escritura, con `cierre: null` solo el turno se cerraba igual, con un
      // esperado recalculado, y dejaba el corte vivo y su sobre ofrecido. Postgres
      // vuelve a evaluar el WHERE sobre la fila que dejó el corte, así que acá la
      // escritura pierde.
      const { count } = await tx.turno.updateMany({
        where: { id: turnoId, ...WHERE_TURNO_OPERATIVO },
        data: {
          cierre: ahora,
          cerradoPorId: session.id,
          montoEsperadoEfectivo: montoEsperado,
          montoRealEfectivo: Number(montoRealEfectivo),
          diferenciaEfectivo: diferencia,
          totalVentasEfectivo: totalEfectivo,
          totalVentasDigital: totalDigital,
          cantidadVentas: ventas.length,
          observaciones: observaciones || null,
          // Reparto ya validado: la suma da exactamente el contado.
          efectivoRetiradoCierre: reparto.retirado,
          fondoDejadoCierre: reparto.fondoDejado,
          destinoRetiroCierre: String(destinoRetiro || "").trim() || null,
          recibidoPorCierre: String(recibidoPor || "").trim() || null,
        },
      });
      if (count === 0) {
        // Se relee para decir cuál de los dos ganó: el corte o otro cierre.
        const actual = await tx.turno.findUnique({
          where: { id: turnoId },
          select: { cierre: true, cierreEnPreparacionEn: true, anuladoEn: true },
        });
        if (estadoDelTurno(actual) === ESTADO_TURNO.CIERRE_EN_PREPARACION) {
          const e = new Error(MSG_TURNO_EN_PREPARACION);
          e.codigo = "turno_en_preparacion";
          throw e;
        }
        const e = new Error("El turno ya fue cerrado.");
        e.codigo = "turno_ya_cerrado";
        throw e;
      }

      // El período del corte final arranca donde terminó el último parcial, o en
      // la apertura si no hubo ninguno.
      const ultimo = await tx.arqueoCaja.findFirst({
        where: { turnoId },
        orderBy: { fechaHora: "desc" },
        select: { fechaHora: true },
      });

      await tx.arqueoCaja.create({
        data: {
          turnoId,
          localId: turno.localId,
          usuarioId: turno.vendedorId,
          operadorId: turno.operadorId ?? null,
          realizadoPorId: session.id,
          fechaHora: ahora,
          periodoDesde: ultimo?.fechaHora ?? turno.apertura,
          periodoHasta: ahora,
          efectivoEsperado: montoEsperado,
          efectivoContado: Number(montoRealEfectivo),
          diferencia,
          observacion: observaciones || null,
          tipo: "FINAL",
          // Un turno cerrado no se vuelve a cerrar, así que la clave fija basta
          // para que un doble envío no genere dos cortes finales.
          idempotencyKey: `cierre-${turnoId}`,
        },
      });

      // === RETIRO, DESPUÉS del arqueo FINAL ===
      //
      // El orden importa y es deliberado. El efectivo esperado se calculó con los
      // movimientos que existían ANTES de cerrar; si este retiro se creara antes,
      // el propio cierre lo restaría de su esperado y el arqueo FINAL mostraría un
      // sobrante inventado por el monto retirado. Se crea al final, ya con el
      // corte congelado, y no puede retroalimentarlo.
      //
      // Retiro de $0 (todo el efectivo queda como fondo) no genera movimiento: un
      // movimiento en cero ensucia el historial y no mueve plata.
      let retiroId = null;
      if (reparto.retirado > 0) {
        const mov = await tx.cajaMovimiento.create({
          data: {
            turnoId,
            usuarioId: session.id,
            tipo: "RETIRO",
            monto: reparto.retirado,
            motivo: motivoRetiroCierre({ turnoId, destino: destinoRetiro }),
          },
        });
        retiroId = mov.id;
      }

      const actualizado = await tx.turno.update({
        where: { id: turnoId },
        data: { retiroCierreMovimientoId: retiroId },
      });

      return { turnoCerrado: actualizado };
    });

    return NextResponse.json({ ok: true, turno: turnoCerrado });
  } catch (error) {
    if (error?.codigo === "turno_ya_cerrado") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error?.codigo === "turno_en_preparacion") {
      return NextResponse.json(
        { ok: false, error: error.message, turnoEnPreparacionDeCierre: true },
        { status: 409 }
      );
    }
    // Choque contra la clave única del arqueo FINAL (`cierre-<turnoId>`): otro
    // pedido cerró este turno mientras este estaba en vuelo.
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "El turno ya fue cerrado." },
        { status: 409 }
      );
    }
    console.error("Error cerrando turno:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

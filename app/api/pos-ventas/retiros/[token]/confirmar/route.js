// POST /api/pos-ventas/retiros/[token]/confirmar
//
// REGISTRA el retiro con el conteo del dinero retirado, usando el retiro
// esperado que quedó CONGELADO al tomar el corte.
//
// EL NÚMERO NO SE RECALCULA. Es toda la razón de ser de este flujo: entre el
// corte y la confirmación el POS siguió vendiendo —a diferencia del cierre, acá
// el turno nunca se congela— y recalcular el esperado le imputaría a este retiro
// plata que entró después de que el cajero cerrara la pila.
//
// SE CUENTA UNA SOLA PILA. El cambio se separó y se contó ANTES del corte, así
// que ya no está en el montón. Lo que llega es el conteo del dinero retirado.
//
// EL TOTAL DEL CAJÓN SE DERIVA: `retiro contado + cambio separado` es lo que
// había en la caja al momento del corte, y es lo que se sigue escribiendo en
// `ArqueoCaja.efectivoContado` para que esa columna signifique lo mismo en los
// registros viejos y en los nuevos.
//
// Todo pasa en UNA transacción: arqueo PARCIAL, movimiento del retiro y cierre
// de la preparación. O pasan las tres cosas o no pasa ninguna.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validarDesgloseServidor } from "@/lib/caja/desgloseServidor";
import { clasificarDiferencia } from "@/lib/caja/efectivoEsperado";
import { TIPO_PARCIAL } from "@/lib/caja/arqueo";
import { WHERE_TURNO_OPERATIVO } from "@/lib/caja/cierreRelevo";
import {
  ESTADO_RETIRO,
  retiroConfirmable,
  calcularRetiroDesdeConteo,
  unirDesgloses,
  motivoRetiroPreparacion,
} from "@/lib/caja/retiroRelevo";
import {
  cargarRetiroPorToken,
  bloquearRetiro,
  serializarRetiroPreparacion,
} from "@/lib/caja/retiroRelevoServer";
import { bloquearTurno, OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";

export async function POST(req, context) {
  try {
    const { token } = await context.params;
    const res = await cargarRetiroPorToken(req, token);
    if (res.error) {
      return NextResponse.json(
        { ok: false, error: res.error, needsContexto: res.needsContexto },
        { status: res.status }
      );
    }
    const { session, localId, retiro } = res;

    // ── Idempotencia: una preparación ya confirmada devuelve lo que quedó ───
    // No es un error. Doble clic, reintento de la cola, dos pestañas: el cajero
    // tiene que ver el resultado real, no un fallo por algo que sí se hizo.
    if (retiro.estado === ESTADO_RETIRO.CONFIRMADO) {
      return NextResponse.json({
        ok: true,
        repetido: true,
        retiro: serializarRetiroPreparacion(retiro),
        estadoDiferencia: clasificarDiferencia(Number(retiro.diferencia ?? 0)),
      });
    }
    if (!retiroConfirmable(retiro)) {
      return NextResponse.json(
        { ok: false, error: "Este retiro fue cancelado y no se puede confirmar." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // ── EL CONTEO SE VALIDA ACÁ, NO SE CONFÍA ──────────────────────────────
    // El cliente manda cuántos billetes de cada uno. Los totales los calcula el
    // servidor; cualquier total que venga en el body se ignora.
    const conteo = validarDesgloseServidor(body?.desgloseRetiroContado, {
      etiqueta: "conteo del dinero retirado",
      permitirVacio: true,
    });
    if (!conteo.valido) {
      return NextResponse.json({ ok: false, error: conteo.error }, { status: 400 });
    }

    const cuentas = calcularRetiroDesdeConteo({
      totalRetiroContado: conteo.total,
      totalCambio: Number(retiro.totalCambio),
      efectivoRetiradoEsperado: Number(retiro.efectivoRetiradoEsperado),
    });
    if (!cuentas.valido) {
      return NextResponse.json({ ok: false, error: cuentas.error }, { status: 400 });
    }

    const observacion = String(body?.observacion ?? "").trim().slice(0, 500) || null;
    // El cajón completo se reconstruye: lo que se retiró más lo que se apartó.
    const desgloseCajon = unirDesgloses(conteo.desglose, retiro.desgloseCambio ?? {});

    const resultado = await prisma.$transaction(async (tx) => {
      // Los dos locks, siempre en el mismo orden —turno y después preparación—
      // para que dos transacciones no queden esperándose en cruz. Es el mismo
      // orden que usan el cierre y el retiro clásico sobre la misma fila de Turno.
      await bloquearTurno(tx, retiro.turnoId);
      await bloquearRetiro(tx, retiro.id);

      // Se relee TODO adentro de la transacción: entre la lectura de arriba y
      // este punto otro pedido pudo confirmar.
      const fila = await tx.retiroPreparacion.findUnique({ where: { id: retiro.id } });
      if (fila.estado === ESTADO_RETIRO.CONFIRMADO) {
        return { yaEstaba: fila, repetido: true };
      }
      if (!retiroConfirmable(fila)) {
        const e = new Error("Este retiro fue cancelado y no se puede confirmar.");
        e.codigo = "conflicto";
        throw e;
      }

      // El turno se revalida: entre el corte y ahora pudo cerrarse, o pudo tomar
      // su corte de cierre. Un retiro sobre cualquiera de los dos dejaría un
      // movimiento que el cierre no consideró en su esperado.
      const vigente = await tx.turno.findFirst({
        where: { id: retiro.turnoId, localId, ...WHERE_TURNO_OPERATIVO },
        select: { id: true, localId: true, vendedorId: true, operadorId: true, apertura: true },
      });
      if (!vigente) {
        const e = new Error("La caja ya fue cerrada o tomó su corte de cierre.");
        e.codigo = "conflicto";
        throw e;
      }

      const ahora = new Date();

      // ── 1) El registro del retiro ────────────────────────────────────────
      // El período va desde el último arqueo —o la apertura— hasta el instante
      // del CORTE, no hasta ahora: la ventana que este retiro controla terminó
      // cuando se congeló, no cuando el cajero terminó de contar.
      const ultimo = await tx.arqueoCaja.findFirst({
        where: { turnoId: vigente.id },
        orderBy: { fechaHora: "desc" },
        select: { fechaHora: true },
      });

      const arqueo = await tx.arqueoCaja.create({
        data: {
          turnoId: vigente.id,
          localId: vigente.localId,
          usuarioId: vigente.vendedorId,
          // La autoría es la GRABADA AL TOMAR EL CORTE, no el operador activo
          // ahora: la cookie del operario es del navegador entero y pudo cambiar
          // mientras el cajero contaba.
          operadorId: retiro.iniciadoPorOperadorId ?? vigente.operadorId ?? null,
          realizadoPorId: session.id,
          fechaHora: ahora,
          periodoDesde: ultimo?.fechaHora ?? vigente.apertura,
          periodoHasta: retiro.corteEn,
          // EL ESPERADO CONGELADO, tal cual quedó en el corte.
          efectivoEsperado: retiro.efectivoEsperadoCorte,
          // SEMÁNTICA HISTÓRICA INTACTA: todo el efectivo del cajón.
          efectivoContado: cuentas.totalCajonDerivado,
          diferencia: cuentas.diferencia,
          observacion,
          tipo: TIPO_PARCIAL,
          efectivoRetirado: cuentas.totalRetiroContado,
          // El cambio separado es el fondo que queda físicamente en el cajón.
          fondoDejado: cuentas.totalCambio,
          // Ya salió del cajón; falta documentar a quién se entregó.
          estadoEntrega: "PENDIENTE_ENTREGA",
          idempotencyKey: retiro.idempotencyKey,
        },
      });

      // ── 2) El movimiento que efectivamente descuenta ─────────────────────
      // SOLO lo retirado. El cambio NO genera movimiento: esa plata no salió del
      // cajón, se queda ahí y sigue formando parte del efectivo del turno.
      // Registrarla la descontaría por segunda vez.
      //
      // Un retiro de $0 no genera movimiento: mover cero no mueve plata y solo
      // ensucia el historial.
      let movimientoId = null;
      if (cuentas.totalRetiroContado > 0) {
        const mov = await tx.cajaMovimiento.create({
          data: {
            turnoId: vigente.id,
            usuarioId: session.id,
            tipo: "RETIRO",
            monto: cuentas.totalRetiroContado,
            // Texto para que un humano lea el historial. El vínculo REAL es por
            // id, con UNIQUE en la base: nunca se busca por este texto.
            motivo: motivoRetiroPreparacion(retiro.id),
          },
        });
        movimientoId = mov.id;
      }

      // ── 3) El vínculo 1:1 con el movimiento ──────────────────────────────
      await tx.arqueoCaja.update({
        where: { id: arqueo.id },
        data: { cajaMovimientoRetiroId: movimientoId },
      });

      // ── 4) La preparación queda CONFIRMADA ───────────────────────────────
      const confirmado = await tx.retiroPreparacion.update({
        where: { id: retiro.id },
        data: {
          estado: ESTADO_RETIRO.CONFIRMADO,
          confirmadoEn: ahora,
          desgloseRetiroContado: conteo.desglose,
          totalRetiroContado: cuentas.totalRetiroContado,
          totalCajonDerivado: cuentas.totalCajonDerivado,
          diferencia: cuentas.diferencia,
          observacion,
          arqueoCajaId: arqueo.id,
        },
      });

      // EL TURNO NO SE TOCA. Sigue abierto y operando: el esperado corriente
      // vuelve a calcularse con la fórmula acumulativa de siempre —todo el turno
      // menos los retiros confirmados— y ahora incluye este movimiento. Lo que
      // queda en la caja es el cambio separado más lo que se vendió después.
      return { confirmado, arqueo, movimientoId, repetido: false };
    }, OPCIONES_TX);

    if (resultado.repetido) {
      return NextResponse.json({
        ok: true,
        repetido: true,
        retiro: serializarRetiroPreparacion(resultado.yaEstaba),
      });
    }

    return NextResponse.json({
      ok: true,
      repetido: false,
      retiro: serializarRetiroPreparacion(resultado.confirmado),
      arqueoId: resultado.arqueo.id,
      cajaMovimientoId: resultado.movimientoId,
      estadoDiferencia: clasificarDiferencia(cuentas.diferencia),
      cuentas: {
        efectivoEsperadoCorte: Number(retiro.efectivoEsperadoCorte),
        efectivoRetiradoEsperado: Number(retiro.efectivoRetiradoEsperado),
        totalCambio: cuentas.totalCambio,
        totalRetiroContado: cuentas.totalRetiroContado,
        totalCajonDerivado: cuentas.totalCajonDerivado,
        diferencia: cuentas.diferencia,
      },
      // Para que la pantalla pueda explicar de dónde sale el total del cajón.
      desgloseCajon,
    });
  } catch (error) {
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Este retiro ya fue registrado.", duplicado: true },
        { status: 409 }
      );
    }
    console.error("Error confirmando retiro de recaudación:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

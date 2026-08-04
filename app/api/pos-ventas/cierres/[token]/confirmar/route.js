// POST /api/pos-ventas/cierres/[token]/confirmar
//
// CIERRA la caja con el conteo que hizo el cajero, usando el efectivo esperado
// que quedó CONGELADO al tomar el corte.
//
// EL NÚMERO NO SE RECALCULA. Es toda la razón de ser de este flujo: entre el
// corte y la confirmación el relevo estuvo vendiendo, y recalcular el esperado
// acá metería esas ventas en el cierre del saliente, que aparecería con un
// faltante enorme por plata que nunca tuvo en la mano.
//
// Todo pasa en UNA transacción: arqueo FINAL, movimiento del retiro, cierre del
// turno y publicación del cambio para el próximo operador. O pasan las cuatro
// cosas o no pasa ninguna.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validarDesgloseServidor, validarCambioContraConteo } from "@/lib/caja/desgloseServidor";
import { calcularDiferencia, clasificarDiferencia } from "@/lib/caja/efectivoEsperado";
import {
  ESTADO_CIERRE,
  ESTADO_CAMBIO,
  cierreConfirmable,
  calcularCierreDesdeConteo,
  motivoRetiroCierreRelevo,
} from "@/lib/caja/cierreRelevo";
import {
  cargarCierrePorToken,
  bloquearTurno,
  bloquearCierre,
  validarTurnoDelCierre,
  serializarCierre,
  serializarCambio,
  OPCIONES_TX,
} from "@/lib/caja/cierreRelevoServer";

export async function POST(req, context) {
  try {
    const { token } = await context.params;
    const res = await cargarCierrePorToken(req, token);
    if (res.error) {
      return NextResponse.json(
        { ok: false, error: res.error, needsContexto: res.needsContexto },
        { status: res.status }
      );
    }
    const { session, localId, grupoId, cierre } = res;

    // ── Idempotencia: un corte ya confirmado devuelve lo que quedó ──────────
    // No es un error. Doble clic, reintento de la cola, dos pestañas: el cajero
    // tiene que ver el resultado real, no un fallo por algo que sí se hizo.
    if (cierre.estado === ESTADO_CIERRE.CONFIRMADO) {
      return NextResponse.json({
        ok: true,
        repetido: true,
        cierre: serializarCierre(cierre),
        estadoDiferencia: clasificarDiferencia(
          calcularDiferencia(Number(cierre.totalContado ?? 0), Number(cierre.efectivoEsperadoCorte))
        ),
      });
    }
    if (!cierreConfirmable(cierre)) {
      return NextResponse.json(
        { ok: false, error: "Este cierre fue cancelado y no se puede confirmar." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // ── EL CONTEO SE VALIDA ACÁ, NO SE CONFÍA ──────────────────────────────
    // El cliente manda cuántos billetes de cada uno. Los totales los calcula el
    // servidor; cualquier `totalContado` que venga en el body se ignora.
    const conteo = validarDesgloseServidor(body?.desgloseContado, {
      etiqueta: "conteo del cajón",
      permitirVacio: true,
    });
    if (!conteo.valido) {
      return NextResponse.json({ ok: false, error: conteo.error }, { status: 400 });
    }

    const cambio = validarDesgloseServidor(body?.desgloseCambio, {
      etiqueta: "cambio que queda",
      permitirVacio: true,
    });
    if (!cambio.valido) {
      return NextResponse.json({ ok: false, error: cambio.error }, { status: 400 });
    }

    // El tope por DENOMINACIÓN, no solo por total: dejar 5 billetes de $10.000
    // habiendo contado 3 da un total menor al contado y pasaría un chequeo
    // global, pero es físicamente imposible.
    const tope = validarCambioContraConteo({
      desgloseContado: conteo.desglose,
      desgloseCambio: cambio.desglose,
    });
    if (!tope.valido) {
      return NextResponse.json(
        { ok: false, error: tope.error, excesos: tope.excesos },
        { status: 400 }
      );
    }

    const cuentas = calcularCierreDesdeConteo({
      totalContado: conteo.total,
      totalCambio: cambio.total,
      efectivoEsperadoCorte: Number(cierre.efectivoEsperadoCorte),
    });
    if (!cuentas.valido) {
      return NextResponse.json({ ok: false, error: cuentas.error }, { status: 400 });
    }

    const observacion = String(body?.observacion ?? "").trim().slice(0, 500) || null;

    const resultado = await prisma.$transaction(async (tx) => {
      // Los dos locks, siempre en el mismo orden —turno y después corte— para
      // que dos transacciones no puedan quedar esperándose en cruz.
      await bloquearTurno(tx, cierre.turnoId);
      await bloquearCierre(tx, cierre.id);

      // Se relee TODO adentro de la transacción: entre la lectura de arriba y
      // este punto otro pedido pudo confirmar.
      const filaCierre = await tx.cierrePreparacion.findUnique({ where: { id: cierre.id } });
      if (filaCierre.estado === ESTADO_CIERRE.CONFIRMADO) {
        return { yaEstaba: filaCierre, repetido: true };
      }
      if (!cierreConfirmable(filaCierre)) {
        const e = new Error("Este cierre fue cancelado y no se puede confirmar.");
        e.codigo = "conflicto";
        throw e;
      }

      const turno = await tx.turno.findFirst({
        where: { id: cierre.turnoId, localId },
        select: {
          id: true, localId: true, vendedorId: true, operadorId: true,
          apertura: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true,
        },
      });
      const problema = validarTurnoDelCierre(turno);
      if (problema) {
        const e = new Error(problema.error);
        e.codigo = "conflicto";
        throw e;
      }

      const ahora = new Date();

      // ── 1) Cierre ATÓMICO del turno ──────────────────────────────────────
      // El `cierre: null` en el WHERE es el candado, igual que en el cierre
      // clásico: dos confirmaciones simultáneas leyeron el turno abierto antes
      // de entrar; solo la primera encuentra la fila.
      const { count } = await tx.turno.updateMany({
        where: { id: turno.id, cierre: null },
        data: {
          cierre: ahora,
          cerradoPorId: session.id,
          // EL ESPERADO CONGELADO, tal cual quedó en el corte.
          montoEsperadoEfectivo: cierre.efectivoEsperadoCorte,
          montoRealEfectivo: cuentas.totalContado,
          diferenciaEfectivo: cuentas.diferencia,
          cantidadVentas: cierre.cantidadVentasCorte,
          observaciones: observacion,
          // Se conservan los nombres internos que ya existen: los reportes y el
          // circuito del dinero leen estos campos y no deben cambiar de contrato.
          efectivoRetiradoCierre: cuentas.retiroFinal,
          fondoDejadoCierre: cuentas.totalCambio,
        },
      });
      if (count === 0) {
        const e = new Error("El turno ya fue cerrado.");
        e.codigo = "conflicto";
        throw e;
      }

      // ── 2) Arqueo FINAL ──────────────────────────────────────────────────
      // El período va desde el último corte parcial —o la apertura— hasta el
      // instante del CORTE, no hasta ahora: la ventana que este cierre controla
      // terminó cuando se congeló, no cuando el cajero terminó de contar.
      const ultimo = await tx.arqueoCaja.findFirst({
        where: { turnoId: turno.id },
        orderBy: { fechaHora: "desc" },
        select: { fechaHora: true },
      });

      const arqueo = await tx.arqueoCaja.create({
        data: {
          turnoId: turno.id,
          localId: turno.localId,
          usuarioId: turno.vendedorId,
          // La autoría es la GRABADA AL TOMAR EL CORTE, no el operador activo
          // ahora: para cuando el cajero termina de contar, la cookie del
          // navegador ya puede estar mostrando al operador que lo relevó.
          operadorId: cierre.iniciadoPorOperadorId ?? turno.operadorId ?? null,
          realizadoPorId: session.id,
          fechaHora: ahora,
          periodoDesde: ultimo?.fechaHora ?? turno.apertura,
          periodoHasta: cierre.corteEn,
          efectivoEsperado: cierre.efectivoEsperadoCorte,
          efectivoContado: cuentas.totalContado,
          diferencia: cuentas.diferencia,
          observacion,
          tipo: "FINAL",
          // MISMA clave que el cierre clásico. Los dos caminos compiten por la
          // @@unique(turnoId, idempotencyKey), así que un turno no puede
          // terminar con dos cortes finales aunque se cierre por las dos vías.
          idempotencyKey: cierre.idempotencyKey,
        },
      });

      // ── 3) El movimiento que DESCUENTA, después del arqueo ───────────────
      // El orden es el mismo del cierre clásico y por la misma razón: si el
      // movimiento existiera antes, se restaría del esperado de su propio cierre.
      // Acá el esperado ya venía congelado desde el corte, así que no podría
      // contaminarlo igual — pero se mantiene el orden para que los dos caminos
      // dejen exactamente la misma huella y los reportes no tengan que
      // distinguirlos.
      //
      // Retiro de $0 no genera movimiento: mover cero no mueve plata.
      let movimientoId = null;
      if (cuentas.retiroFinal > 0) {
        const mov = await tx.cajaMovimiento.create({
          data: {
            turnoId: turno.id,
            usuarioId: session.id,
            tipo: "RETIRO",
            monto: cuentas.retiroFinal,
            motivo: motivoRetiroCierreRelevo(turno.id),
          },
        });
        movimientoId = mov.id;
      }
      await tx.turno.update({
        where: { id: turno.id },
        data: { retiroCierreMovimientoId: movimientoId },
      });

      // ── 4) El cambio queda DISPONIBLE para el próximo operador ───────────
      //
      // NO se crea ningún movimiento por el cambio dejado, y eso es deliberado.
      // Esa plata no salió del cajón: se queda ahí. Ya está contemplada en el
      // reparto `retiro + cambio = contado`, y registrarla además como
      // movimiento la descontaría por segunda vez. Entra al circuito recién
      // cuando el turno siguiente la toma como `montoInicial`.
      //
      // Un cambio de $0 igual se publica: "no quedó nada en el cajón" es
      // información que el operador entrante necesita, y publicarlo mantiene la
      // cadena de sobres completa.
      const sobre = await tx.cambioPendiente.create({
        data: {
          localId,
          grupoId,
          cierrePreparacionId: cierre.id,
          turnoOrigenId: turno.id,
          operadorOrigenId: cierre.iniciadoPorOperadorId ?? turno.operadorId ?? null,
          dejadoEn: ahora,
          total: cuentas.totalCambio,
          desglose: cambio.desglose,
          observacion,
          estado: ESTADO_CAMBIO.DISPONIBLE,
        },
      });

      // ── 5) El corte queda CONFIRMADO ─────────────────────────────────────
      const confirmado = await tx.cierrePreparacion.update({
        where: { id: cierre.id },
        data: {
          estado: ESTADO_CIERRE.CONFIRMADO,
          confirmadoEn: ahora,
          desgloseContado: conteo.desglose,
          desgloseCambio: cambio.desglose,
          totalContado: cuentas.totalContado,
          totalCambio: cuentas.totalCambio,
          retiroFinal: cuentas.retiroFinal,
          observacion,
          arqueoFinalId: arqueo.id,
        },
      });

      return { confirmado, sobre, arqueo, repetido: false };
    }, OPCIONES_TX);

    if (resultado.repetido) {
      return NextResponse.json({
        ok: true,
        repetido: true,
        cierre: serializarCierre(resultado.yaEstaba),
      });
    }

    return NextResponse.json({
      ok: true,
      repetido: false,
      cierre: serializarCierre(resultado.confirmado),
      cambioPendiente: serializarCambio(resultado.sobre),
      arqueoFinalId: resultado.arqueo.id,
      estadoDiferencia: clasificarDiferencia(cuentas.diferencia),
      cuentas: {
        efectivoEsperadoCorte: Number(cierre.efectivoEsperadoCorte),
        totalContado: cuentas.totalContado,
        totalCambio: cuentas.totalCambio,
        retiroFinal: cuentas.retiroFinal,
        diferencia: cuentas.diferencia,
      },
    });
  } catch (error) {
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Este cierre ya fue confirmado.", duplicado: true },
        { status: 409 }
      );
    }
    console.error("Error confirmando cierre con relevo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

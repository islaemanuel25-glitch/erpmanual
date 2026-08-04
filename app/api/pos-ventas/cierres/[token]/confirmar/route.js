// POST /api/pos-ventas/cierres/[token]/confirmar
//
// CIERRA la caja con el conteo del RETIRO, usando el retiro esperado que quedó
// CONGELADO al tomar el corte.
//
// LOS DOS NÚMEROS NO SE RECALCULAN. Es toda la razón de ser de este flujo: entre
// el corte y la confirmación el relevo estuvo vendiendo, y recalcular acá metería
// esas ventas en el cierre del saliente, que aparecería con un faltante enorme
// por plata que nunca tuvo en la mano.
//
// SE CUENTA UNA SOLA PILA
//
// El cambio se separó y se contó ANTES del corte, y su sobre ya está publicado
// —posiblemente ya reservado o recibido por el relevo—. Acá no se vuelve a
// preguntar por él: lo que llega es el conteo del dinero retirado, y se compara
// contra `efectivoRetiradoEsperado`.
//
// EL TOTAL DEL CAJÓN SE DERIVA, NO SE PIERDE. `retiro contado + cambio separado`
// es exactamente lo que había en la caja al momento del corte, y es lo que se
// sigue escribiendo en `ArqueoCaja.efectivoContado` y `Turno.montoRealEfectivo`
// para que esas columnas no cambien de significado entre registros viejos y
// nuevos.
//
// Todo pasa en UNA transacción: arqueo FINAL, movimiento del retiro y cierre del
// turno. O pasan las tres cosas o no pasa ninguna. El sobre de cambio ya existe
// desde el corte y NO se vuelve a crear.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validarDesgloseServidor, validarCambioContraConteo } from "@/lib/caja/desgloseServidor";
import { clasificarDiferencia } from "@/lib/caja/efectivoEsperado";
import {
  ESTADO_CIERRE,
  ESTADO_CAMBIO,
  cierreConfirmable,
  calcularCierreDesdeConteo,
  calcularCierreDesdeRetiro,
  unirDesgloses,
  motivoRetiroCierreRelevo,
} from "@/lib/caja/cierreRelevo";
import {
  cargarCierrePorToken,
  bloquearTurno,
  bloquearCierre,
  bloquearCambio,
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
        estadoDiferencia: clasificarDiferencia(Number(cierre.diferencia ?? 0)),
      });
    }
    if (!cierreConfirmable(cierre)) {
      return NextResponse.json(
        { ok: false, error: "Este cierre fue cancelado y no se puede confirmar." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const observacion = String(body?.observacion ?? "").trim().slice(0, 500) || null;

    // ¿Este corte separó el cambio por adelantado? Los tomados con el orden
    // anterior no tienen `efectivoRetiradoEsperado` y se confirman por el camino
    // viejo: contando todo el cajón y eligiendo el cambio al final. Ver el
    // comentario de compatibilidad en `calcularCierreDesdeConteo`.
    const cambioSeparadoEnCorte = cierre.efectivoRetiradoEsperado != null;

    // ── EL CONTEO SE VALIDA ACÁ, NO SE CONFÍA ──────────────────────────────
    // El cliente manda cuántos billetes de cada uno. Los totales los calcula el
    // servidor; cualquier total que venga en el body se ignora.
    let cuentas;
    let desgloseCajon;
    let desgloseCambio;
    let totalCambio;
    let desgloseRetiro = null;

    if (cambioSeparadoEnCorte) {
      const retiro = validarDesgloseServidor(body?.desgloseRetiroContado, {
        etiqueta: "conteo del dinero retirado",
        permitirVacio: true,
      });
      if (!retiro.valido) {
        return NextResponse.json({ ok: false, error: retiro.error }, { status: 400 });
      }

      desgloseCambio = cierre.desgloseCambio ?? {};
      totalCambio = Number(cierre.totalCambio ?? 0);
      desgloseRetiro = retiro.desglose;

      cuentas = calcularCierreDesdeRetiro({
        totalRetiroContado: retiro.total,
        totalCambio,
        efectivoRetiradoEsperado: Number(cierre.efectivoRetiradoEsperado),
      });
      if (!cuentas.valido) {
        return NextResponse.json({ ok: false, error: cuentas.error }, { status: 400 });
      }
      // El cajón completo se reconstruye: lo que se retiró más lo que se apartó.
      desgloseCajon = unirDesgloses(retiro.desglose, desgloseCambio);
    } else {
      // ── COMPATIBILIDAD: corte tomado con el orden anterior ────────────────
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

      const viejo = calcularCierreDesdeConteo({
        totalContado: conteo.total,
        totalCambio: cambio.total,
        efectivoEsperadoCorte: Number(cierre.efectivoEsperadoCorte),
      });
      if (!viejo.valido) {
        return NextResponse.json({ ok: false, error: viejo.error }, { status: 400 });
      }

      desgloseCambio = cambio.desglose;
      totalCambio = cambio.total;
      desgloseCajon = conteo.desglose;
      cuentas = {
        ...viejo,
        // En el orden viejo el retiro contado no existe como pila propia: lo que
        // salió es el total menos el cambio. Se guarda igual, para que la columna
        // signifique lo mismo en los dos caminos.
        totalRetiroContado: viejo.retiroFinal,
        totalCajonDerivado: viejo.totalContado,
      };
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // Los locks, siempre en el mismo orden —turno, corte, sobre— para que dos
      // transacciones no puedan quedar esperándose en cruz.
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
          // EL TOTAL EQUIVALENTE DEL CAJÓN. Mismo significado de siempre: todo el
          // efectivo que había al momento del corte. Con el orden nuevo se deriva
          // sumando el retiro contado y el cambio separado.
          montoRealEfectivo: cuentas.totalCajonDerivado,
          diferenciaEfectivo: cuentas.diferencia,
          cantidadVentas: cierre.cantidadVentasCorte,
          observaciones: observacion,
          // Se conservan los nombres internos que ya existen: los reportes y el
          // circuito del dinero leen estos campos y no deben cambiar de contrato.
          efectivoRetiradoCierre: cuentas.retiroFinal,
          fondoDejadoCierre: totalCambio,
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
          // SEMÁNTICA HISTÓRICA INTACTA: todo el efectivo del cajón.
          efectivoContado: cuentas.totalCajonDerivado,
          diferencia: cuentas.diferencia,
          observacion,
          tipo: "FINAL",
          // El circuito del retiro, con los mismos nombres de siempre.
          efectivoRetirado: cuentas.retiroFinal,
          fondoDejado: totalCambio,
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

      // ── 4) El sobre YA EXISTE desde el corte ─────────────────────────────
      //
      // No se crea nada acá. El cambio se publicó al cortar, y a esta altura el
      // relevo puede haberlo reservado o incluso abierto su turno con él.
      // Crearlo de nuevo dejaría dos sobres por el mismo dinero; modificarlo
      // sería cambiarle las denominaciones a alguien que ya las contó.
      //
      // Se bloquea para que su estado no cambie entre la lectura y el commit, y
      // se relee para devolverlo actualizado.
      let sobre = await tx.cambioPendiente.findUnique({
        where: { cierrePreparacionId: cierre.id },
      });
      if (sobre) {
        await bloquearCambio(tx, sobre.id);
        sobre = await tx.cambioPendiente.findUnique({ where: { id: sobre.id } });
      } else {
        // Sólo puede faltar en un corte del orden anterior, que no publicaba el
        // sobre hasta este momento. Se crea acá, como hacía antes.
        sobre = await tx.cambioPendiente.create({
          data: {
            localId,
            grupoId,
            cierrePreparacionId: cierre.id,
            turnoOrigenId: turno.id,
            operadorOrigenId: cierre.iniciadoPorOperadorId ?? turno.operadorId ?? null,
            dejadoEn: ahora,
            total: totalCambio,
            desglose: desgloseCambio,
            observacion,
            estado: ESTADO_CAMBIO.DISPONIBLE,
          },
        });
      }

      // ── 5) El corte queda CONFIRMADO ─────────────────────────────────────
      const confirmado = await tx.cierrePreparacion.update({
        where: { id: cierre.id },
        data: {
          estado: ESTADO_CIERRE.CONFIRMADO,
          confirmadoEn: ahora,
          // El conteo del retiro, en su campo propio.
          desgloseRetiroContado: desgloseRetiro,
          totalRetiroContado: cuentas.totalRetiroContado,
          // El equivalente del cajón, con el significado de siempre.
          desgloseContado: desgloseCajon,
          totalContado: cuentas.totalCajonDerivado,
          // El cambio ya estaba grabado desde el corte en el orden nuevo; en el
          // viejo se escribe recién acá.
          desgloseCambio,
          totalCambio,
          retiroFinal: cuentas.retiroFinal,
          diferencia: cuentas.diferencia,
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
        efectivoRetiradoEsperado:
          cierre.efectivoRetiradoEsperado != null ? Number(cierre.efectivoRetiradoEsperado) : null,
        totalRetiroContado: cuentas.totalRetiroContado,
        totalCambio,
        totalContado: cuentas.totalCajonDerivado,
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

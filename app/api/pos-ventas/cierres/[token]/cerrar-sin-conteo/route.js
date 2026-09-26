// POST /api/pos-ventas/cierres/[token]/cerrar-sin-conteo
//
// RESUELVE ADMINISTRATIVAMENTE un corte de cierre VENCIDO cuyo conteo ya no
// existe: el cajero se fue sin contar y, días o semanas después, nadie tiene ese
// número.
//
// DATO DESCONOCIDO NO ES CERO
//
// Confirmar exige un conteo del retiro. Mandar 0 fabrica un faltante igual al
// retiro esperado; mandar el esperado fabrica una caja que cuadra. Los dos son
// datos falsos en el historial de caja. Acá el turno se cierra con lo único que se
// sabe —el esperado congelado en el corte— y lo contado y la diferencia quedan en
// NULL, que en este modelo significa "no se contó", igual que en la anulación
// técnica.
//
// LO QUE NO HACE, A PROPÓSITO
//
//   · No crea ArqueoCaja FINAL: un arqueo es un conteo, y no lo hubo.
//   · No crea el CajaMovimiento del retiro: nadie vio salir esa plata.
//   · No toca el sobre de cambio. Existe desde el corte, y qué pasó con él —si el
//     relevo lo tomó, si sigue en el local— es otra pregunta que esto no contesta.
//   · No recalcula nada del corte: el esperado es el congelado.
//
// SOLO UN CORTE VENCIDO POR TIEMPO
//
// PREPARANDO o VENCIDO con el `venceEn` ya pasado, decidido acá adentro con el
// instante del servidor. La etiqueta VENCIDO no alcanza —se escribe recién cuando
// alguien abre la bandeja— ni hace falta. Un corte vigente no se cierra así: el
// cajero puede estar contando, y su salida es confirmar.
//
// Permiso propio (`PERMISO_CERRAR_SIN_CONTEO`), motivo obligatorio y la evidencia
// en `AuditoriaBitacora` en la MISMA transacción: una caja cerrada sin conteo y sin
// su explicación no puede confirmarse.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPerm } from "@/lib/authorize";
import {
  ESTADO_CIERRE,
  ACCION_CERRAR_SIN_CONTEO,
  PERMISO_CERRAR_SIN_CONTEO,
  cierreCerrableSinConteo,
  validarMotivoSinConteo,
} from "@/lib/caja/cierreRelevo";
import {
  cargarCierrePorToken,
  bloquearTurno,
  bloquearCierre,
  validarTurnoDelCierre,
  serializarCierre,
  OPCIONES_TX,
} from "@/lib/caja/cierreRelevoServer";

/** Por qué este corte no se puede cerrar sin conteo, según en qué quedó. */
function motivoNoCerrable(fila) {
  if (fila.estado === ESTADO_CIERRE.CONFIRMADO) return "Este cierre ya se confirmó con su conteo.";
  if (fila.estado === ESTADO_CIERRE.CANCELADO) return "Este cierre fue cancelado: el turno volvió a operar.";
  return "Este cierre todavía no venció. Terminá el conteo desde la pantalla de cierre.";
}

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

    const perm = checkPerm(session, PERMISO_CERRAR_SIN_CONTEO);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const motivo = validarMotivoSinConteo(body?.motivo);
    if (!motivo.valido) return NextResponse.json({ ok: false, error: motivo.error }, { status: 400 });

    const resultado = await prisma.$transaction(async (tx) => {
      // El mismo orden de locks que confirmar y cancelar —turno y después
      // corte—, así las tres operaciones sobre el mismo corte se serializan en el
      // mismo lugar y no pueden esperarse en cruz.
      await bloquearTurno(tx, cierre.turnoId);
      await bloquearCierre(tx, cierre.id);

      const fila = await tx.cierrePreparacion.findUnique({ where: { id: cierre.id } });
      if (fila.estado === ESTADO_CIERRE.CERRADO_SIN_CONTEO) return { yaEstaba: fila, repetido: true };

      // "Ahora" se decide acá, con los locks tomados: es el instante contra el
      // que se juzga el vencimiento y el que queda escrito como resolución.
      const ahora = new Date();
      if (!cierreCerrableSinConteo(fila, ahora)) {
        const e = new Error(motivoNoCerrable(fila));
        e.codigo = "conflicto";
        throw e;
      }

      const turno = await tx.turno.findFirst({
        where: { id: cierre.turnoId, localId },
        select: { id: true, localId: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true },
      });
      const problema = validarTurnoDelCierre(turno);
      if (problema) {
        const e = new Error(problema.error);
        e.codigo = "conflicto";
        throw e;
      }

      // ── 1) El turno se cierra con lo que se SABE ─────────────────────────
      //
      // El WHERE repite la condición de arriba: si el turno dejó de estar en
      // preparación entre la lectura y la escritura, no se escribe nada.
      //
      // Lo contado, la diferencia y el retiro van en NULL EXPLÍCITO: no se
      // contó, y ninguno de los tres se puede derivar de lo que hay. El cambio
      // SÍ se conoce: se separó y se contó antes del corte, y es el mismo número
      // que escribe la confirmación. En un corte del orden viejo no existía
      // todavía, y queda en NULL.
      const cambioSeparadoEnCorte = fila.efectivoRetiradoEsperado != null;
      const { count } = await tx.turno.updateMany({
        where: { id: turno.id, cierre: null, cierreEnPreparacionEn: { not: null } },
        data: {
          cierre: ahora,
          cerradoPorId: session.id,
          montoEsperadoEfectivo: fila.efectivoEsperadoCorte,
          cantidadVentas: fila.cantidadVentasCorte,
          montoRealEfectivo: null,
          diferenciaEfectivo: null,
          efectivoRetiradoCierre: null,
          fondoDejadoCierre: cambioSeparadoEnCorte ? fila.totalCambio : null,
        },
      });
      if (count === 0) {
        const e = new Error("El turno ya no está en preparación de cierre.");
        e.codigo = "conflicto";
        throw e;
      }

      // ── 2) El corte queda resuelto, con su autoría ───────────────────────
      //
      // El WHERE repite los estados de los que se puede salir: una
      // confirmación que hubiera ganado dejaría CONFIRMADO y esto no escribiría.
      // Nada del corte se pisa —esperado, frontera, cambio—: es la evidencia.
      const { count: resueltos } = await tx.cierrePreparacion.updateMany({
        where: { id: fila.id, estado: { in: [ESTADO_CIERRE.PREPARANDO, ESTADO_CIERRE.VENCIDO] } },
        data: {
          estado: ESTADO_CIERRE.CERRADO_SIN_CONTEO,
          cerradoSinConteoEn: ahora,
          cerradoSinConteoPorUsuarioId: session.id,
          motivoCierreSinConteo: motivo.motivo,
        },
      });
      if (resueltos !== 1) {
        const e = new Error("El cierre cambió mientras se resolvía. Volvé a intentarlo.");
        e.codigo = "conflicto";
        throw e;
      }
      const resuelto = await tx.cierrePreparacion.findUnique({ where: { id: fila.id } });

      // ── 3) La evidencia, en la misma transacción ─────────────────────────
      //
      // Con `tx` y no con el interceptor, que escribe después y a mejor
      // esfuerzo: si algo de acá falla, el rollback se lleva el cierre y la
      // evidencia juntos. Mismo patrón que la cancelación de la semana
      // operativa y que la corrección de ventas.
      const esperado = Number(fila.efectivoEsperadoCorte);
      await tx.auditoriaBitacora.create({
        data: {
          usuarioId: session.id ?? null,
          operadorId: null,
          localId,
          grupoId: grupoId ?? null,
          accion: ACCION_CERRAR_SIN_CONTEO,
          entidad: "Turno",
          entidadId: String(turno.id),
          entidadNombre: `Turno #${turno.id}`,
          cambios: [
            {
              entidad: "Cierre de caja",
              nombre: `Turno #${turno.id}`,
              id: String(turno.id),
              campos: [
                { campo: "estado", label: "Cierre", antes: fila.estado, despues: ESTADO_CIERRE.CERRADO_SIN_CONTEO },
                { campo: "montoEsperadoEfectivo", label: "Esperado", antes: null, despues: esperado },
                { campo: "montoRealEfectivo", label: "Contado", antes: null, despues: null },
                { campo: "diferenciaEfectivo", label: "Diferencia", antes: null, despues: null },
              ],
              resolucion: {
                turnoId: turno.id,
                cierrePreparacionId: fila.id,
                localId,
                corteEn: fila.corteEn,
                venceEn: fila.venceEn,
                resueltoEn: ahora,
                estadoAnterior: fila.estado,
                motivo: motivo.motivo,
                esperadoCongelado: esperado,
                huboConteo: false,
                contado: null,
                diferencia: null,
                arqueoFinalCreado: false,
                movimientoRetiroCreado: false,
              },
            },
          ],
        },
      });

      return { resuelto, repetido: false };
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      repetido: resultado.repetido,
      cierre: serializarCierre(resultado.repetido ? resultado.yaEstaba : resultado.resuelto),
    });
  } catch (error) {
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    console.error("Error cerrando sin conteo:", error);
    return NextResponse.json(
      { ok: false, error: `No se pudo cerrar sin conteo: ${error?.message || "error desconocido"}` },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { tendersParaAgregar } from "@/lib/pos-ventas/pagos";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { calcularEfectivoEsperado, desglosarMovimientos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { estadoDelTurno } from "@/lib/caja/cierreRelevo";

export async function GET(req) {
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

    const turnoId = Number(req.nextUrl.searchParams.get("turnoId"));
    if (!turnoId) {
      return NextResponse.json(
        { ok: false, error: "turnoId requerido" },
        { status: 400 }
      );
    }

    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        localId: true,
        montoInicial: true,
        // El retiro del CIERRE se crea DESPUÉS del corte final, justamente para
        // que el cierre no se reste a sí mismo. Pero queda en CajaMovimiento, así
        // que quien recalcule el esperado de un turno cerrado sin excluirlo lo
        // descuenta una segunda vez.
        cierre: true,
        // El tercer estado del turno. Sin este campo, `estadoDelTurno` no puede
        // distinguir una caja operativa de una que ya tomó su corte.
        cierreEnPreparacionEn: true,
        anuladoEn: true,
        retiroCierreMovimientoId: true,
        montoEsperadoEfectivo: true,
      },
    });

    if (!turno) {
      return NextResponse.json(
        { ok: false, error: "Turno no encontrado" },
        { status: 404 }
      );
    }

    if (!session.esAdmin && Number(session.localId) !== Number(turno.localId)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para este turno" },
        { status: 403 }
      );
    }

    const [ventas, cajaMovimientos] = await Promise.all([
      prisma.venta.findMany({
        // Mismo criterio que turnos/cerrar: el operador tiene que ver exactamente
        // el mismo esperado que después calcula el cierre.
        where: whereVentaComercial({ turnoId }),
        select: {
          total: true, formaPago: true, esFiado: true, comisionBancaria: true, netoRecibido: true,
          pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
        },
      }),
      prisma.cajaMovimiento.findMany({
        where: {
          turnoId,
          // EXCLUSIÓN EXPLÍCITA del retiro de cierre. Sin esto, un turno cerrado
          // devolvía un esperado igual a `montoEsperadoEfectivo − retiroDeCierre`,
          // es decir un número que no coincidía con el que el propio cierre había
          // persistido, y que además empeora con cada retiro parcial nuevo.
          // Se filtra en la CONSULTA y no después, para que ningún consumidor
          // pueda recibir la lista sin filtrar por descuido.
          ...(turno?.retiroCierreMovimientoId
            ? { id: { not: turno.retiroCierreMovimientoId } }
            : {}),
        },
        // `motivo` y `createdAt` alimentan el detalle de "Movimientos de caja"
        // en la pantalla de retiro. Son los MISMOS campos que escribe Caja +/−
        // (app/api/pos-ventas/caja-movimientos/crear), donde el motivo es
        // obligatorio; queda nullable por los movimientos históricos.
        select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Totales por tender e ingresos/retiros: misma función que usa el cierre y
    // el arqueo (lib/caja/efectivoEsperado). Antes esta agregación estaba
    // escrita a mano acá y otra vez en cerrar/route.js.
    const calculo = calcularEfectivoEsperado({
      montoInicial: turno?.montoInicial ?? 0,
      ventas,
      movimientos: cajaMovimientos,
    });

    // ── Movimientos MANUALES: los de "Caja +/−", sin los retiros de recaudación ──
    //
    // `calculo.retiros` incluye TODO lo que salió del cajón, y ahí adentro están
    // los retiros de recaudación, que ya se muestran en su propia pantalla.
    // Mezclarlos haría que un retiro de $103.400 apareciera como si alguien
    // hubiera sacado plata a mano. Se separan por el mismo vínculo que usa el
    // detalle del turno: un CajaMovimiento referenciado por un ArqueoCaja nació
    // de un retiro, no de Caja +/−.
    //
    // NO hay fórmula nueva: se reusa `desglosarMovimientos` sobre la lista ya
    // filtrada.
    const vinculados = await prisma.arqueoCaja.findMany({
      where: { turnoId, cajaMovimientoRetiroId: { not: null } },
      select: { cajaMovimientoRetiroId: true },
    });
    const idsVinculados = new Set(vinculados.map((a) => a.cajaMovimientoRetiroId));
    const manuales = cajaMovimientos.filter((m) => !idsVinculados.has(m.id));
    const desgloseManual = desglosarMovimientos(manuales);

    // ── EL RELEVO: los dos extremos del traspaso de cambio ─────────────────
    //
    // `cambioRecibido` es el sobre que ESTE turno tomó al abrir; `cambioDejado`,
    // el que dejó al cerrar. Los dos salen de CambioPendiente por su vínculo de
    // id —`turnoDestinoId` y `turnoOrigenId`— y nunca de comparar importes o
    // fechas: dos turnos del mismo día pueden dejar $30.000 y adivinar cuál es
    // cuál sería inventar la cadena.
    const [cambioRecibido, cambioDejado, corte] = await Promise.all([
      prisma.cambioPendiente.findUnique({
        where: { turnoDestinoId: turnoId },
        include: { turnoOrigen: { select: { id: true, vendedor: { select: { nombre: true } } } } },
      }),
      // El sobre VIGENTE, no cualquiera: un turno que tomó el corte, lo canceló
      // y volvió a cortar tiene además el sobre CANCELADO del primer intento, y
      // mostrarlo diría que dejó un cambio que nunca llegó a nadie.
      prisma.cambioPendiente.findFirst({
        where: { turnoOrigenId: turnoId, estado: { not: "CANCELADO" } },
        include: { turnoDestino: { select: { id: true, vendedor: { select: { nombre: true } } } } },
      }),
      prisma.cierrePreparacion.findFirst({
        where: { turnoId, estado: { in: ["PREPARANDO", "CONFIRMADO", "VENCIDO"] } },
        select: {
          id: true, corteEn: true, estado: true, efectivoEsperadoCorte: true,
          cantidadVentasCorte: true,
          // Las cifras del orden nuevo. `null` en los cortes tomados antes de
          // que el cambio se separara por adelantado: ahí no existió un "retiro
          // esperado" que congelar, y el detalle simplemente no muestra la fila.
          efectivoRetiradoEsperado: true, totalRetiroContado: true,
        },
      }),
    ]);

    // Los operarios son Int planos (mismo patrón que Turno.anuladoPorId), así que
    // los nombres se resuelven aparte.
    const idsOperador = [
      cambioRecibido?.operadorOrigenId, cambioRecibido?.recibidoPorOperadorId,
      cambioDejado?.operadorOrigenId, cambioDejado?.recibidoPorOperadorId,
    ].filter((x) => Number.isInteger(x));
    const operadores = idsOperador.length
      ? await prisma.operadorLocal.findMany({
          where: { id: { in: [...new Set(idsOperador)] } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombreOp = new Map(operadores.map((o) => [o.id, o.nombre]));

    const serializarSobre = (x) =>
      x
        ? {
            id: x.id,
            estado: x.estado,
            turnoOrigenId: x.turnoOrigenId,
            turnoDestinoId: x.turnoDestinoId ?? null,
            dejadoEn: x.dejadoEn,
            recibidoEn: x.recibidoEn ?? null,
            total: Number(x.total),
            desglose: x.desglose ?? {},
            totalRecibido: x.totalRecibido != null ? Number(x.totalRecibido) : null,
            desgloseRecibido: x.desgloseRecibido ?? null,
            diferencia: x.diferencia != null ? Number(x.diferencia) : null,
            motivoDiferencia: x.motivoDiferencia ?? null,
            observacion: x.observacion ?? null,
            operadorOrigen: nombreOp.get(x.operadorOrigenId) ?? null,
            operadorRecibio: nombreOp.get(x.recibidoPorOperadorId) ?? null,
            cajeroOrigen: x.turnoOrigen?.vendedor?.nombre ?? null,
            cajeroDestino: x.turnoDestino?.vendedor?.nombre ?? null,
          }
        : null;

    const relevo = {
      cambioRecibido: serializarSobre(cambioRecibido),
      cambioDejado: serializarSobre(cambioDejado),
      corte: corte
        ? {
            id: corte.id,
            estado: corte.estado,
            corteEn: corte.corteEn,
            efectivoEsperadoCorte: Number(corte.efectivoEsperadoCorte),
            cantidadVentasCorte: corte.cantidadVentasCorte,
            efectivoRetiradoEsperado:
              corte.efectivoRetiradoEsperado != null
                ? Number(corte.efectivoRetiradoEsperado)
                : null,
            totalRetiroContado:
              corte.totalRetiroContado != null ? Number(corte.totalRetiroContado) : null,
          }
        : null,
    };

    // El desglose POR MEDIO digital es propio de esta pantalla —el cierre no lo
    // necesita— así que se arma acá, sobre los mismos tenders.
    const desglose = { mercadopago: 0, debito: 0, credito: 0, fiado: 0 };
    ventas.forEach((v) => {
      for (const t of tendersParaAgregar(v)) {
        const key = String(t.medio || "").toLowerCase();
        if (desglose[key] !== undefined) desglose[key] += t.monto;
      }
    });

    return NextResponse.json({
      ok: true,
      cantidadVentas: calculo.cantidadVentas,
      totalEfectivo: calculo.ventasEfectivo,
      totalDigital: calculo.ventasDigital,
      totalFiado: calculo.ventasFiado,
      totalComision: calculo.comisionDigital,
      netoDigital: calculo.netoDigital,
      totalIngresosCaja: calculo.ingresos,
      // Solo lo de Caja +/-: los retiros de recaudacion van aparte.
      movimientosManuales: {
        ingresos: desdeCentavos(desgloseManual.ingresosCentavos),
        retiros: desdeCentavos(desgloseManual.retirosCentavos),
        neto: desdeCentavos(desgloseManual.ingresosCentavos - desgloseManual.retirosCentavos),
        cantidad: manuales.length,
        // Detalle en orden cronológico, para que la pantalla no tenga que
        // ordenar ni adivinar. El motivo va tal cual se guardó: si está vacío
        // —solo posible en filas viejas— lo resuelve la vista.
        detalle: manuales.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          monto: Number(m.monto),
          motivo: m.motivo || null,
          fecha: m.createdAt,
        })),
      },
      totalRetirosCaja: calculo.retiros,
      // El esperado ya calculado por el backend: el modal de cierre lo muestra
      // en vez de recalcularlo por su cuenta.
      montoInicial: calculo.montoInicial,
      efectivoEsperado: calculo.efectivoEsperado,
      // Para un turno cerrado, este número tiene que coincidir con el que el
      // cierre persistió. Se expone para que la pantalla no tenga que
      // recalcularlo por su cuenta —era la cuarta copia de la fórmula— y para
      // que una divergencia sea detectable en vez de silenciosa.
      esperadoPersistido:
        turno?.montoEsperadoEfectivo != null ? Number(turno.montoEsperadoEfectivo) : null,
      estaCerrado: turno?.cierre != null,
      // El TERCER estado. `estaCerrado` se conserva porque lo leen la pantalla de
      // retiro y `compararHuellas`, pero por sí solo ya no describe al turno: uno
      // que tomó el corte no está cerrado y tampoco está operativo.
      estadoTurno: estadoDelTurno(turno),
      retiroCierreExcluido: turno?.retiroCierreMovimientoId ?? null,
      // ── EL RELEVO ────────────────────────────────────────────────────────
      //
      // Los dos extremos del traspaso, cada uno de su fuente. NUNCA se deducen
      // por coincidencia de importes ni de horarios: el vínculo es por id.
      relevo,
      desglose,
    });
  } catch (error) {
    console.error("Error resumen turno:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

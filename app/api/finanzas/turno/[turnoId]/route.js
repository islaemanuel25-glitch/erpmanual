// app/api/finanzas/turno/[turnoId]/route.js
//
// UN TURNO, VISTO DESDE FINANZAS.
//
// ── POR QUÉ NO SE MANDA A `/modulos/turnos/[id]` Y LISTO ─────────────────
//
// Esa pantalla existe y muestra casi lo mismo, pero **pide `pos.usar`**: es la
// vista del cajero sobre su propia caja. Quien mira Finanzas puede no tener ese
// permiso —un contador, el dueño desde el celular— y mandarlo ahí le daría un
// "Sin permisos" en la mitad del recorrido.
//
// Lo que NO se duplica es la aritmética. El efectivo esperado sale de
// `lib/caja/efectivoEsperado.js`, que es la fuente única del ERP y ya vivió tres
// veces copiada: acá se llama, no se reescribe. Lo mismo con el criterio de
// venta comercial y con la clasificación de los movimientos.
//
// ── LOS DOS DESCUENTOS QUE HAY QUE NO REPETIR ────────────────────────────
//
// El retiro de CIERRE se crea después del arqueo final, justamente para que el
// cierre no se reste a sí mismo, y queda en `CajaMovimiento`. Recalcular el
// esperado de un turno cerrado sin excluirlo lo descuenta una segunda vez y da
// un número que no coincide con el que el propio cierre persistió. Está anotado
// en `app/api/pos-ventas/turnos/resumen/route.js` y acá se aplica igual, con la
// misma puerta.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { calcularEfectivoEsperado } from "@/lib/caja/efectivoEsperado";
import { estadoDelTurno } from "@/lib/caja/cierreRelevo";
import { resultadoCierre } from "@/lib/caja/vistaTurno";

import { esVistaDeDeposito, resolverLocalPedido } from "@/lib/finanzas/alcanceFinanciero";
import { localesDeFinanzas } from "@/lib/finanzas/localesDelGrupo";
import {
  clasificarMovimientos,
  paraElEsperado,
  soloManuales,
  soloRecaudacion,
} from "@/lib/finanzas/movimientosDeCaja";
import { desglosarCaja, desglosarCobros } from "@/lib/finanzas/resumenFinanciero";
import { aCargoDelTurno, rangoHorarioDelTurno } from "@/lib/finanzas/actividadFinanciera";

export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "finanzas.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { turnoId: crudo } = await params;
    const turnoId = Number(crudo) || 0;
    if (!turnoId) {
      return NextResponse.json({ ok: false, error: "Turno inválido." }, { status: 400 });
    }

    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }

    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        localId: true,
        apertura: true,
        cierre: true,
        cierreEnPreparacionEn: true,
        anuladoEn: true,
        montoInicial: true,
        observaciones: true,
        // Los persistidos por el cierre. NULL en un turno abierto y en los
        // históricos anteriores al circuito del dinero: null es "no se registró"
        // y NO es cero. La pantalla lo distingue.
        montoEsperadoEfectivo: true,
        montoRealEfectivo: true,
        diferenciaEfectivo: true,
        efectivoRetiradoCierre: true,
        fondoDejadoCierre: true,
        retiroCierreMovimientoId: true,
        local: { select: { id: true, nombre: true } },
        vendedor: { select: { nombre: true } },
        operador: { select: { nombre: true } },
      },
    });

    if (!turno) {
      return NextResponse.json({ ok: false, error: "Turno no encontrado." }, { status: 404 });
    }

    // ── EL ALCANCE, CON LA MISMA PUERTA QUE EL TABLERO ────────────────────
    //
    // `resolveVistaOperativa` no cubre esto: el turno llega por la RUTA, no por
    // un `localId` en la query, así que su chequeo no lo ve. Sin esta
    // comprobación, un local podría abrir la caja de otro cambiando el número de
    // la URL.
    const localPropio = vista.localId
      ? await prisma.local.findUnique({
          where: { id: vista.localId },
          select: { id: true, nombre: true, es_deposito: true },
        })
      : null;
    const esDeposito = esVistaDeDeposito({ modo: vista.modo, localPropio });
    const { locales } = await localesDeFinanzas(vista.grupoId);

    const alcance = resolverLocalPedido({
      esDeposito,
      localDeLaSesion: vista.localId,
      destinoPedido: turno.localId,
      localesDelGrupo: locales,
    });
    if (alcance.error || alcance.localId !== turno.localId) {
      return NextResponse.json(
        { ok: false, error: alcance.error || "Local fuera de tu alcance." },
        { status: 403 }
      );
    }

    const [ventas, movimientos] = await Promise.all([
      prisma.venta.findMany({
        // Mismo criterio comercial que el resumen del período y que el cierre de
        // caja: el número del turno acá tiene que ser el mismo que allá.
        where: whereVentaComercial({ turnoId }),
        select: {
          id: true,
          total: true,
          esFiado: true,
          formaPago: true,
          comisionBancaria: true,
          netoRecibido: true,
          pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
        },
      }),
      prisma.cajaMovimiento.findMany({
        where: { turnoId },
        orderBy: { createdAt: "asc" },
        select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true, turnoId: true },
      }),
    ]);

    // El pago a proveedor en efectivo se reconoce por su vínculo,
    // `PagoProveedor.cajaMovimientoId` (UNIQUE), y no por el texto del motivo.
    // Se pregunta por los ids de ESTOS movimientos, que es el vínculo que decide.
    const idsDeMovimiento = movimientos.map((m) => m.id);
    const [arqueosConRetiro, pagosConRetiro] = await Promise.all([
      prisma.arqueoCaja.findMany({
        where: { turnoId, cajaMovimientoRetiroId: { not: null } },
        select: { cajaMovimientoRetiroId: true },
      }),
      idsDeMovimiento.length
        ? prisma.pagoProveedor.findMany({
            where: { cajaMovimientoId: { in: idsDeMovimiento } },
            select: { cajaMovimientoId: true },
          })
        : [],
    ]);

    const clasificados = clasificarMovimientos(movimientos, {
      idsDeRecaudacion: new Set(arqueosConRetiro.map((a) => a.cajaMovimientoRetiroId)),
      idsDeCierre: new Set(
        turno.retiroCierreMovimientoId ? [turno.retiroCierreMovimientoId] : []
      ),
      idsDePagoProveedor: new Set(pagosConRetiro.map((p) => p.cajaMovimientoId)),
    });

    // LA FÓRMULA ÚNICA. Sin el retiro de cierre, por lo de arriba.
    const calculo = calcularEfectivoEsperado({
      montoInicial: turno.montoInicial ?? 0,
      ventas,
      movimientos: paraElEsperado(clasificados),
    });

    const arqueos = await prisma.arqueoCaja.findMany({
      where: { turnoId },
      orderBy: { fechaHora: "asc" },
      select: {
        id: true,
        tipo: true,
        fechaHora: true,
        efectivoEsperado: true,
        efectivoContado: true,
        diferencia: true,
        efectivoRetirado: true,
        fondoDejado: true,
      },
    });

    return NextResponse.json({
      ok: true,
      turno: {
        id: turno.id,
        localId: turno.localId,
        localNombre: turno.local?.nombre || "—",
        aCargo: aCargoDelTurno({
          operadorNombre: turno.operador?.nombre,
          vendedorNombre: turno.vendedor?.nombre,
        }),
        operadorNombre: turno.operador?.nombre || null,
        vendedorNombre: turno.vendedor?.nombre || null,
        apertura: turno.apertura,
        cierre: turno.cierre,
        horario: rangoHorarioDelTurno(turno),
        // El estado se DERIVA con la puerta única del ERP y no comparando campos
        // acá: `cierre` distingue abierto de cerrado y `cierreEnPreparacionEn`
        // marca el tercer estado, el del corte ya tomado.
        estado: estadoDelTurno(turno),
        anulado: Boolean(turno.anuladoEn),
        observaciones: turno.observaciones || null,
      },
      // El desglose por medio, con la misma pieza que el resumen del período.
      cobros: desglosarCobros(ventas),
      caja: desglosarCaja({
        manuales: soloManuales(clasificados),
        recaudacion: soloRecaudacion(clasificados),
      }),
      // Los movimientos uno por uno, para que el turno pueda explicarse: el
      // motivo tal cual se escribió, sin interpretar.
      movimientos: clasificados.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        clase: m.clase,
        monto: Number(m.monto || 0),
        motivo: m.motivo || null,
        createdAt: m.createdAt,
      })),
      esperado: {
        montoInicial: calculo.montoInicial,
        ventasEfectivo: calculo.ventasEfectivo,
        ventasDigital: calculo.ventasDigital,
        ventasFiado: calculo.ventasFiado,
        ingresos: calculo.ingresos,
        retiros: calculo.retiros,
        efectivoEsperado: calculo.efectivoEsperado,
        cantidadVentas: calculo.cantidadVentas,
        // ── LO QUE EL CIERRE PERSISTIÓ, PARA PODER COMPARAR ────────────────
        //
        // `null` significa "no se registró" y NO cero: los turnos cerrados antes
        // del circuito del dinero lo tienen vacío, y un 0 afirmaría que se contó
        // cero. La pantalla los dibuja solo cuando existen.
        persistido: {
          montoEsperadoEfectivo: turno.montoEsperadoEfectivo,
          montoRealEfectivo: turno.montoRealEfectivo,
          diferenciaEfectivo: turno.diferenciaEfectivo,
          efectivoRetiradoCierre: turno.efectivoRetiradoCierre,
          fondoDejadoCierre: turno.fondoDejadoCierre,
        },
      },
      // En palabras, con la misma pieza que usa la pantalla del cajero.
      resultado: resultadoCierre({
        esperado: turno.montoEsperadoEfectivo ?? calculo.efectivoEsperado,
        contado: turno.montoRealEfectivo,
      }),
      arqueos,
    });
  } catch (e) {
    console.error("[finanzas/turno]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo abrir el turno: ${e.message}` },
      { status: 500 }
    );
  }
}

// app/api/finanzas/tablero/route.js
//
// QUÉ PASÓ ECONÓMICAMENTE, POR LOCAL Y POR PERÍODO.
//
// ── LA CUENTA SE HACE ACÁ Y NO EN EL TELÉFONO ─────────────────────────────
//
// Mismo criterio que `/api/transferencias/tablero`: el teléfono recibe NÚMEROS y
// no insumos. Mandarle las ventas del período para que sume sería una segunda
// implementación de las reglas comerciales del lado del cliente —el filtro de
// venta comercial, la clasificación de tenders, el margen— y el día que una
// regla cambie, la pantalla queda vieja sin que nada falle.
//
// Por eso el título del período, el rango, los topes de las flechas, las
// métricas y la actividad ya agrupada viajan resueltos.
//
// ── LO QUE ESTA RUTA NO HACE ES INVENTAR ──────────────────────────────────
//
// No hay gastos, ni pagos a proveedores, ni sueldos, ni resultado del negocio.
// Esas cuatro viajan en `noDisponible` con su motivo, y NO como ceros. Un cero
// se lee como "no hubo"; lo que pasa es que el sistema no los conoce.
//
// ── DOS VISTAS, UNA SOLA LLAMADA ──────────────────────────────────────────
//
// Con `entrada=1`, quien pregunta puede ser el depósito —y entonces lo que
// corresponde es la LISTA de locales— o un local mirando el suyo. Lo decide el
// SERVIDOR con `Local.es_deposito`, igual que Transferencias, así que la
// pantalla no tiene que adivinar quién es antes de preguntar.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { fechaArgentinaISO, getRangoArgentina } from "@/lib/fechas/rangoArgentina";
// EL FILTRO DE VENTA COMERCIAL ES OBLIGATORIO Y NO SE ESCRIBE A MANO. Excluye
// las anuladas y las que tienen remito —las internas entre el depósito y sus
// propios locales, que no son ventas sino movimientos entre dos cajas del mismo
// grupo—. Sin él, el depósito aparecería facturando la mercadería que se manda a
// sí mismo. El motivo largo está en el archivo.
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";

import { esVistaDeDeposito, resolverLocalPedido } from "@/lib/finanzas/alcanceFinanciero";
import { localesDeFinanzas } from "@/lib/finanzas/localesDelGrupo";
import {
  DESPLAZAMIENTO_POR_DEFECTO,
  descripcionFinanciera,
  desplazamientoFinanciero,
  puedeAvanzar,
  rangoFinanciero,
  unidadFinanciera,
} from "@/lib/finanzas/periodoFinanciero";
import { resumenDelPeriodo } from "@/lib/finanzas/resumenFinanciero";
import { actividadPorDia } from "@/lib/finanzas/actividadFinanciera";
import {
  CLASE_MOVIMIENTO,
  clasificarMovimientos,
  soloManuales,
  soloRecaudacion,
} from "@/lib/finanzas/movimientosDeCaja";

/**
 * LO QUE HAY QUE PEDIR DE CADA VENTA, Y POR QUÉ CADA CAMPO.
 *
 * `total`, `costoTotal` y `gananciaBruta` son las tres sumas del resumen, y
 * salen del MISMO `findMany` para que el costo no pueda sumarse sobre un
 * universo distinto del total.
 *
 * `pagos` es el desglose del cobro. Los cuatro de abajo —`esFiado`, `formaPago`,
 * `comisionBancaria`, `netoRecibido`— NO son un desglose paralelo: son lo que
 * `tendersParaAgregar` necesita para las ventas HISTÓRICAS que no tienen filas
 * en `VentaPago`. Sin ellos, esas ventas aportarían un tender inventado.
 */
const SELECT_VENTA = {
  id: true,
  total: true,
  costoTotal: true,
  gananciaBruta: true,
  turnoId: true,
  esFiado: true,
  formaPago: true,
  comisionBancaria: true,
  netoRecibido: true,
  pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
};

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "finanzas.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const unidad = unidadFinanciera(searchParams.get("unidad"));
    const desplazamiento = desplazamientoFinanciero(
      searchParams.get("desplazamiento") ?? DESPLAZAMIENTO_POR_DEFECTO
    );

    // ── QUIÉN SOY ──────────────────────────────────────────────────────────
    //
    // De `Local.es_deposito`, no del `modo` de la vista: aquél dice el ALCANCE
    // —un local o todo el grupo— y no si este local es el depósito.
    const localPropio = vista.localId
      ? await prisma.local.findUnique({
          where: { id: vista.localId },
          select: { id: true, nombre: true, es_deposito: true },
        })
      : null;
    const esDeposito = esVistaDeDeposito({ modo: vista.modo, localPropio });

    const { locales } = await localesDeFinanzas(vista.grupoId);

    // ── LA ENTRADA DEL DEPÓSITO: SOLO LA LISTA ────────────────────────────
    //
    // Sale antes de tocar `Venta`, y ése es el punto: la lista no muestra
    // importes ni período, así que calcular el resumen de cada local para
    // después no usarlo sería pagar la consulta más cara del módulo por nada.
    //
    // Y no muestra importes por la misma razón que la de Transferencias: un
    // importe es siempre el importe DE UN PERÍODO, y acá todavía no hay ninguno
    // elegido. Ponerle uno obligaría a elegirlo en silencio.
    if (searchParams.get("entrada") === "1" && esDeposito) {
      return NextResponse.json({ ok: true, vista: "ENTRADA", locales });
    }

    const alcance = resolverLocalPedido({
      esDeposito,
      localDeLaSesion: vista.localId,
      destinoPedido: searchParams.get("destino"),
      localesDelGrupo: locales,
    });
    if (alcance.error) {
      return NextResponse.json({ ok: false, error: alcance.error }, { status: 403 });
    }
    // Sin local y sin ser depósito no se llega: `resolverLocalPedido` ya devolvió
    // error. Sin local SIENDO depósito significa que no pidió ninguno, y la
    // respuesta es la lista.
    if (!alcance.localId) {
      return NextResponse.json({ ok: true, vista: "ENTRADA", locales });
    }
    const localId = alcance.localId;

    const rango = rangoFinanciero({ unidad, desplazamiento });
    const { fechaInicio, fechaFin } = getRangoArgentina(rango.desde, rango.hasta);

    // ── LAS VENTAS DEL PERÍODO ────────────────────────────────────────────
    //
    // Cortadas por local y por `Venta.fecha` —la fecha de la venta, que es la que
    // usa el reporte de ventas— y pasadas por el filtro comercial. NO se usa
    // Auditoría POS como fuente: aquélla es la vista TÉCNICA y a propósito NO
    // filtra internas ni anuladas, porque un auditor tiene que verlas.
    const ventas = await prisma.venta.findMany({
      where: whereVentaComercial({
        localId,
        fecha: { gte: fechaInicio, lte: fechaFin },
      }),
      select: SELECT_VENTA,
    });

    // ── LOS TURNOS DEL PERÍODO ────────────────────────────────────────────
    //
    // Por `apertura`, no por cierre: un turno que abre el sábado a las 22 y
    // cierra el domingo pertenece al sábado, que es como se lo nombra. Y por
    // cierre quedarían sin día los que todavía no cerraron, que son justamente
    // los que están pasando.
    const turnos = await prisma.turno.findMany({
      where: { localId, apertura: { gte: fechaInicio, lte: fechaFin } },
      orderBy: { apertura: "desc" },
      select: {
        id: true,
        apertura: true,
        cierre: true,
        anuladoEn: true,
        vendedor: { select: { nombre: true } },
        operador: { select: { nombre: true } },
      },
    });

    // ── LO QUE VENDIÓ CADA TURNO ──────────────────────────────────────────
    //
    // Consulta aparte y acotada a los turnos, no un filtro sobre las ventas de
    // arriba. La diferencia importa: un turno del período puede tener ventas
    // fuera del rango de fechas —abre el sábado a las 23 y vende a las 00:30—, y
    // atribuirle solo las del rango daría un total de turno que NO coincide con
    // el que muestra el detalle de ese mismo turno.
    //
    // Mismo filtro comercial, por el mismo motivo.
    const idsDeTurno = turnos.map((t) => t.id);
    const ventasPorTurno = idsDeTurno.length
      ? await prisma.venta.findMany({
          where: whereVentaComercial({ turnoId: { in: idsDeTurno } }),
          select: { turnoId: true, total: true },
        })
      : [];

    const totalPorTurno = new Map();
    for (const v of ventasPorTurno) {
      const previo = totalPorTurno.get(v.turnoId) || { centavos: 0, cantidad: 0 };
      previo.centavos += aCentavos(v.total);
      previo.cantidad += 1;
      totalPorTurno.set(v.turnoId, previo);
    }

    // ── LOS MOVIMIENTOS MANUALES DE CAJA ──────────────────────────────────
    //
    // Por su PROPIO `createdAt` dentro del período, y acotados a los turnos de
    // este local. Filtrar por "los turnos del período" en vez de por la fecha del
    // movimiento haría que el total del resumen incluyera movimientos que en la
    // lista de abajo caen en otro día — el resumen y las bandas dirían cosas
    // distintas sobre lo mismo.
    const movimientos = await prisma.cajaMovimiento.findMany({
      where: { turno: { localId }, createdAt: { gte: fechaInicio, lte: fechaFin } },
      orderBy: { createdAt: "desc" },
      select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true, turnoId: true },
    });

    // ── QUÉ MOVIMIENTO ES DE QUÉ CLASE ────────────────────────────────────
    //
    // Se pregunta por el VÍNCULO —qué arqueo lo referencia, qué turno lo declara
    // como su retiro de cierre— y NUNCA por el texto del motivo, que es libre.
    //
    // Se pregunta por los ids de los movimientos y no por los turnos del
    // período: un movimiento traído acá puede pertenecer a un turno que abrió
    // antes del rango, y buscándolo por turno quedaría sin clasificar.
    const idsDeMovimiento = movimientos.map((m) => m.id);
    const [arqueosConRetiro, turnosConRetiroDeCierre] = idsDeMovimiento.length
      ? await Promise.all([
          prisma.arqueoCaja.findMany({
            where: { cajaMovimientoRetiroId: { in: idsDeMovimiento } },
            select: { cajaMovimientoRetiroId: true },
          }),
          prisma.turno.findMany({
            where: { retiroCierreMovimientoId: { in: idsDeMovimiento } },
            select: { retiroCierreMovimientoId: true },
          }),
        ])
      : [[], []];

    const clasificados = clasificarMovimientos(movimientos, {
      idsDeRecaudacion: new Set(arqueosConRetiro.map((a) => a.cajaMovimientoRetiroId)),
      idsDeCierre: new Set(turnosConRetiroDeCierre.map((t) => t.retiroCierreMovimientoId)),
    });

    const resumen = resumenDelPeriodo({
      ventas,
      manuales: soloManuales(clasificados),
      recaudacion: soloRecaudacion(clasificados),
    });

    const actividad = actividadPorDia({
      turnos: turnos.map((t) => {
        const acc = totalPorTurno.get(t.id) || { centavos: 0, cantidad: 0 };
        return {
          id: t.id,
          apertura: t.apertura,
          cierre: t.cierre,
          anuladoEn: t.anuladoEn,
          vendedorNombre: t.vendedor?.nombre || null,
          operadorNombre: t.operador?.nombre || null,
          ventasTotal: desdeCentavos(acc.centavos),
          cantidadVentas: acc.cantidad,
        };
      }),
      // EL DE CIERRE NO SE DIBUJA. No es un hecho económico propio: es la misma
      // plata del turno saliendo del cajón al cerrarlo, y el cierre ya la
      // informa en su propio renglón. Como fila suelta se leería como un retiro
      // más y duplicaría lo que el turno de arriba ya dice.
      movimientos: clasificados.filter((m) => m.clase !== CLASE_MOVIMIENTO.CIERRE),
    });

    // ── EL TOPE HACIA ATRÁS SALE DEL DATO, NO DE UN NÚMERO ────────────────
    //
    // "Hasta N períodos atrás" es inventado: con N chico se tapa historia que
    // existe y con N grande igual se llega a meses vacíos. Lo único que no es
    // arbitrario es la PRIMERA venta de este local: antes de esa fecha está
    // probado que no hubo actividad comercial.
    //
    // Es un `findFirst` ordenado y acotado, o sea una fila por el índice de
    // `localId` + `fecha`.
    const primera = await prisma.venta.findFirst({
      where: whereVentaComercial({ localId }),
      orderBy: { fecha: "asc" },
      select: { fecha: true },
    });
    // ISO ARGENTINO, no `toISOString()`. Aquél es UTC, y una primera venta de
    // las 22:00 se leería como del día siguiente: la flecha de atrás se apagaría
    // un día antes de tiempo y esa venta quedaría inalcanzable.
    const primerMovimiento = primera ? fechaArgentinaISO(primera.fecha) : null;

    return NextResponse.json({
      ok: true,
      vista: "UN_LOCAL",
      unidad,
      desplazamiento,
      local: {
        id: localId,
        nombre: locales.find((l) => l.localId === localId)?.nombre || localPropio?.nombre || "—",
        esDeposito: Boolean(locales.find((l) => l.localId === localId)?.esDeposito),
        inactivo: Boolean(locales.find((l) => l.localId === localId)?.inactivo),
      },
      periodo: {
        rango,
        // `descripcion` viaja desde el SERVIDOR y no se arma en la pantalla, por
        // el mismo motivo por el que viaja el rango: quien sabe qué período se
        // consultó es el que lo consultó. Es lo que evita que el título diga
        // "Semana" con el chip en Mes.
        descripcion: descripcionFinanciera({ unidad, desplazamiento }),
      },
      resumen,
      actividad,
      puedeAvanzar: puedeAvanzar(desplazamiento),
      // Hacia atrás, hasta donde haya dato. `null` = este local no vendió nunca,
      // y ahí no hay a dónde ir.
      puedeRetroceder: Boolean(primerMovimiento && rango.desde > primerMovimiento),
      primerMovimiento,
    });
  } catch (e) {
    console.error("[finanzas/tablero]", e);
    // El mensaje dice QUÉ pasó. "Error interno" deja a la pantalla muda y ya
    // costó una caída de producción entera sin una sola pista.
    return NextResponse.json(
      { ok: false, error: `No se pudo armar el resumen de Finanzas: ${e.message}` },
      { status: 500 }
    );
  }
}

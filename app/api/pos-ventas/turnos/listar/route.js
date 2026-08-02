import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";

export async function GET(req) {
  try {
    const perm = requirePerm(req, "pos.usar");
    if (!perm.ok)
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { localId, session } = scope;
    const params = req.nextUrl.searchParams;

    // Filtros
    const fechaDesde = params.get("fechaDesde");
    const fechaHasta = params.get("fechaHasta");
    const estado = params.get("estado") || "todos";
    let vendedorId = params.get("vendedorId")
      ? Number(params.get("vendedorId"))
      : null;

    // Scope: solo sus turnos si no tiene turnos.ver_todos ni es admin
    const puedeVerTodos =
      session.esAdmin || session.permisos.includes("turnos.ver_todos");
    if (!puedeVerTodos) {
      vendedorId = session.id;
    }

    // Where
    const where = { localId };

    if (vendedorId) {
      where.vendedorId = vendedorId;
    }

    if (estado === "abierto") {
      where.cierre = null;
    } else if (estado === "cerrado") {
      where.cierre = { not: null };
    }

    if (fechaDesde || fechaHasta) {
      // Rango en hora Argentina para que turnos cercanos a medianoche no se
      // corran un día cuando el contenedor corre en UTC.
      const { fechaInicio, fechaFin } = getRangoArgentina(
        fechaDesde || fechaHasta,
        fechaHasta || fechaDesde
      );
      where.apertura = {};
      if (fechaDesde) where.apertura.gte = fechaInicio;
      if (fechaHasta) where.apertura.lte = fechaFin;
    }

    const turnos = await prisma.turno.findMany({
      where,
      orderBy: { apertura: "desc" },
      select: {
        id: true,
        apertura: true,
        cierre: true,
        montoInicial: true,
        montoEsperadoEfectivo: true,
        montoRealEfectivo: true,
        diferenciaEfectivo: true,
        totalVentasEfectivo: true,
        totalVentasDigital: true,
        cantidadVentas: true,
        observaciones: true,
        // Circuito del dinero físico. NULL en los turnos cerrados antes de que
        // existiera: el historial los muestra igual que siempre.
        efectivoRetiradoCierre: true,
        fondoDejadoCierre: true,
        destinoRetiroCierre: true,
        recibidoPorCierre: true,
        fondoSugeridoApertura: true,
        fondoRecibidoApertura: true,
        diferenciaFondoApertura: true,
        observacionFondoApertura: true,
        fondoOrigenTurnoId: true,
        fondoConsumidoEnTurnoId: true,
        anuladoEn: true,
        motivoAnulacion: true,
        vendedor: {
          select: { id: true, nombre: true, email: true },
        },
      },
    });

    // Serializar Decimals
    const items = turnos.map((t) => ({
      id: t.id,
      apertura: t.apertura,
      cierre: t.cierre,
      montoInicial: Number(t.montoInicial),
      montoEsperadoEfectivo: t.montoEsperadoEfectivo != null ? Number(t.montoEsperadoEfectivo) : null,
      montoRealEfectivo: t.montoRealEfectivo != null ? Number(t.montoRealEfectivo) : null,
      diferenciaEfectivo: t.diferenciaEfectivo != null ? Number(t.diferenciaEfectivo) : null,
      totalVentasEfectivo: t.totalVentasEfectivo != null ? Number(t.totalVentasEfectivo) : null,
      totalVentasDigital: t.totalVentasDigital != null ? Number(t.totalVentasDigital) : null,
      cantidadVentas: t.cantidadVentas,
      observaciones: t.observaciones,
      // Circuito del dinero. `null` significa "este turno es anterior al
      // circuito", no "cero": la pantalla tiene que poder distinguirlo.
      efectivoRetiradoCierre: t.efectivoRetiradoCierre != null ? Number(t.efectivoRetiradoCierre) : null,
      fondoDejadoCierre: t.fondoDejadoCierre != null ? Number(t.fondoDejadoCierre) : null,
      destinoRetiroCierre: t.destinoRetiroCierre,
      recibidoPorCierre: t.recibidoPorCierre,
      fondoSugeridoApertura: t.fondoSugeridoApertura != null ? Number(t.fondoSugeridoApertura) : null,
      fondoRecibidoApertura: t.fondoRecibidoApertura != null ? Number(t.fondoRecibidoApertura) : null,
      diferenciaFondoApertura: t.diferenciaFondoApertura != null ? Number(t.diferenciaFondoApertura) : null,
      observacionFondoApertura: t.observacionFondoApertura,
      fondoOrigenTurnoId: t.fondoOrigenTurnoId,
      fondoConsumidoEnTurnoId: t.fondoConsumidoEnTurnoId,
      // Anulación técnica: el turno se muestra, pero no como un cierre válido.
      anuladoEn: t.anuladoEn,
      motivoAnulacion: t.motivoAnulacion,
      vendedor: t.vendedor,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("Error listar turnos:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

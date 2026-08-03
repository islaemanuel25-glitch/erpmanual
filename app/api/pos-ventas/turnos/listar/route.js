import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import {
  construirWhereTurnos,
  normalizarEstado,
  normalizarPaginacion,
  resolverLocalListado,
  ORDEN_LISTADO,
} from "@/lib/turnos/filtrosListado";

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req) {
  try {
    const perm = requirePerm(req, "pos.usar");
    if (!perm.ok)
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );

    // `lecturaAjena` → un no-admin que pide otro local recibe 404, no 403: no se
    // le confirma que ese local exista.
    const scope = await resolveLocalAndGrupo(req, { lecturaAjena: true });
    if (scope.error) {
      return NextResponse.json(
        {
          ok: false,
          error: scope.error,
          // La pantalla necesita distinguir "elegí un local" de un error real
          // para mostrar el cartel en vez de un mensaje de fallo.
          ...(scope.needsContexto ? { needsContexto: true } : {}),
        },
        { status: scope.status }
      );
    }

    const { session } = scope;
    const params = req.nextUrl.searchParams;

    // ── Local: SOLO del contexto activo ──────────────────────────────────
    // La pantalla ya no tiene selector de local. Un `localId` mandado a mano no
    // puede ampliar ni cambiar el alcance: si no coincide con el contexto, se
    // rechaza. Para un no-admin, `resolveLocalAndGrupo` ya devolvió 404 antes de
    // llegar acá si pidió un local ajeno.
    const resuelto = resolverLocalListado({
      localContexto: scope.localId,
      localIdParam: params.get("localId"),
    });
    if (resuelto.error) {
      return NextResponse.json(
        { ok: false, error: resuelto.error },
        { status: resuelto.status }
      );
    }
    const localId = resuelto.localId;

    // ── Vendedor ─────────────────────────────────────────────────────────
    const puedeVerTodos =
      session.esAdmin || session.permisos.includes("turnos.ver_todos");
    let vendedorId = toPositiveInt(params.get("vendedorId"));
    if (!puedeVerTodos) {
      // Sin `turnos.ver_todos` el alcance es siempre propio, mande lo que mande.
      vendedorId = session.id;
    }

    const estado = normalizarEstado(params.get("estado"));
    const { where, rango } = construirWhereTurnos({
      localId,
      vendedorId,
      estado,
      fechaDesde: params.get("fechaDesde"),
      fechaHasta: params.get("fechaHasta"),
      hoy: hoyArgentinaISO(),
    });

    const { page, pageSize, skip, take } = normalizarPaginacion({
      page: params.get("page"),
      pageSize: params.get("pageSize"),
    });

    const [total, turnos] = await Promise.all([
      prisma.turno.count({ where }),
      prisma.turno.findMany({
        where,
        orderBy: ORDEN_LISTADO,
        skip,
        take,
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
      }),
    ]);

    // Opciones del filtro de vendedor. Se calculan sobre TODOS los turnos del
    // local, sin aplicar los filtros activos: si se calcularan sobre el
    // resultado, elegir un vendedor dejaría al resto fuera del desplegable y no
    // se podría volver atrás.
    let vendedores = [];
    if (puedeVerTodos) {
      const filas = await prisma.turno.findMany({
        where: { localId },
        distinct: ["vendedorId"],
        select: {
          vendedorId: true,
          vendedor: { select: { id: true, nombre: true, email: true } },
        },
      });
      vendedores = filas
        .map((f) => f.vendedor)
        .filter(Boolean)
        .sort((a, b) =>
          String(a.nombre || a.email).localeCompare(
            String(b.nombre || b.email),
            "es"
          )
        );
    }

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

    return NextResponse.json({
      ok: true,
      items,
      vendedores,
      // El rango REALMENTE aplicado, para que la pantalla pueda mostrar qué se
      // consultó aunque el usuario no haya elegido fechas.
      filtros: {
        localId,
        estado,
        vendedorId,
        fechaDesde: rango.desde,
        fechaHasta: rango.hasta,
      },
      paginacion: {
        page,
        pageSize,
        total,
        totalPaginas: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("Error listar turnos:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";

// Config de ticket por local (TicketConfig, @unique localId). El local se resuelve
// SIEMPRE con resolveLocalAndGrupo (server-authoritative): no-admin → su local
// (ajeno → 403); admin → su contexto activo (local/depósito), nunca un localId del
// request. Escritura: admin o config_local.ticket.

// VA EL PAR, Y NO SOLO `config_local.ticket`. La configuración del ticket la
// CONFIGURA la pantalla de configuración, pero la LEE el POS para imprimir:
// `lib/pos-ventas/imprimirTicketTermico.js` la pide en cada impresión. Cerrarla
// solo con el permiso de configuración —que tienen Admin y DUEÑO_LOCAL— dejaría
// a los cajeros imprimiendo tickets sin encabezado ni pie.
//
// ── Y HAY QUE DECIR LO QUE ESTO NO HACE ─────────────────────────────────────
//
// Los SEIS roles de producción tienen `pos.usar`, así que en la práctica este
// permiso no le cierra la puerta a nadie. Queda igual porque deja el contrato
// declarado y porque el día que exista un rol sin `pos.usar` va a cerrar solo.
//
// **Decidido el 2026-08-15 (Emanuel): queda así.** Lo que devuelve son LOS DATOS
// DEL TICKET —encabezado, pie, si va el CUIT—, o sea lo que igual se imprime y
// se le da al cliente en la mano. Separar "leer para imprimir" de "ver la
// configuración" es un cambio de diseño, no un permiso más: habría que partir la
// ruta en dos, o que el ticket se arme del lado del servidor. Va como entrada
// del rediseño de roles, en `docs/roadmap/kit-sunmi-fases.md`.
const PERMISO_LEER_TICKET = ["config_local.ticket", "pos.usar"];

export async function GET(req) {
  try {
    // Lectura de config: recurso ajeno → 404 (no revelar la config de otra ubicación).
    const scope = await resolveLocalAndGrupo(req, { lecturaAjena: true });
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const permiso = checkPerm(scope.session, PERMISO_LEER_TICKET);
    if (!permiso.ok) {
      return NextResponse.json({ ok: false, error: permiso.error }, { status: permiso.status });
    }

    const { localId } = scope;

    const row = await prisma.ticketConfig.findUnique({ where: { localId } });

    return NextResponse.json({
      ok: true,
      config: row?.configJson ?? null,
    });
  } catch (error) {
    console.error("Error obteniendo ticket config:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId, session } = scope;

    if (!session.esAdmin && !checkPerm(session, "config_local.ticket").ok) {
      return NextResponse.json({ ok: false, error: "Sin permiso: config_local.ticket" }, { status: 403 });
    }

    const body = await req.json();
    const configJson = body.config;
    if (!configJson || typeof configJson !== "object") {
      return NextResponse.json({ ok: false, error: "Config invalida" }, { status: 400 });
    }

    const row = await prisma.ticketConfig.upsert({
      where: { localId },
      update: { configJson },
      create: { localId, configJson },
    });

    return NextResponse.json({ ok: true, config: row.configJson });
  } catch (error) {
    console.error("Error guardando ticket config:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// app/api/finanzas/pago-a-deposito/route.js
//
// CUÁNTO SE RECONOCIÓ COMO PAGO AL DEPÓSITO, POR LOCAL Y POR PERÍODO.
//
// ── ES UNA LECTURA FINANCIERA DE TRANSFERENCIAS, NO UN SEGUNDO MÓDULO ──────
//
// No consulta `Transferencia` ni valoriza líneas: pide la cuenta del local en
// el criterio de recepción a la función de ese módulo —`detalleDePagoADeposito`,
// la MISMA que suma el "Pago a depósito" del Resumen, con su listado— y el tope
// de la navegación a `primeraRecepcion`. Toda la aritmética vive en
// Transferencias; acá se resuelve alcance, período y permiso.
//
// ── POR QUÉ NO USA `/api/finanzas/tablero` ────────────────────────────────
//
// El tablero carga ventas, turnos, movimientos de caja y sus clasificaciones
// para armar el Resumen entero. Esta pantalla muestra un solo bloque, así que
// traer todo eso para leerlo sería pagar la consulta más cara del módulo por
// nada. Esta ruta es de SOLO LECTURA y liviana: por local, la consulta canónica
// de recepción más el `findFirst` del tope.
//
// ── DOS VISTAS, UNA SOLA LLAMADA ──────────────────────────────────────────
//
// El depósito —o un admin en vista global— recibe la LISTA de los locales que
// PAGAN (sin el depósito, que no se paga a sí mismo); un local, su propia
// cuenta. Lo decide el servidor con `Local.es_deposito`, igual que el tablero.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";

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
import { vigenciasDeUbicaciones } from "@/lib/semanaOperativa/semanaOperativaServer";
// EL PAGO A DEPÓSITO ES DE TRANSFERENCIAS. La cuenta y su listado salen de la
// función de ese módulo; Finanzas no vuelve a valorizar ni a consultar.
import { detalleDePagoADeposito, primeraRecepcion } from "@/lib/transferencias/cuentaDelPeriodoServer";
import {
  PERMISO_VER_TRANSFERENCIAS,
  armarPagoADeposito,
  enlaceDePagoADeposito,
} from "@/lib/finanzas/pagoADeposito";

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

    // Quién pregunta: por `Local.es_deposito`, no por el `modo` de la vista.
    const localPropio = vista.localId
      ? await prisma.local.findUnique({
          where: { id: vista.localId },
          select: { id: true, nombre: true, es_deposito: true },
        })
      : null;
    const esDeposito = esVistaDeDeposito({ modo: vista.modo, localPropio });

    const { locales } = await localesDeFinanzas(vista.grupoId);
    // LOS QUE PAGAN: el depósito no se paga a sí mismo, así que no va en la
    // lista. Se filtra sobre la que ya se leyó, sin otra consulta.
    const pagadores = locales.filter((l) => !l.esDeposito);

    // La entrada del depósito: solo la lista. Sale antes de resolver un local y
    // sin tocar transferencias.
    if (searchParams.get("entrada") === "1" && esDeposito) {
      return NextResponse.json({ ok: true, vista: "ENTRADA", locales: pagadores });
    }

    const alcance = resolverLocalPedido({
      esDeposito,
      localDeLaSesion: vista.localId,
      destinoPedido: searchParams.get("destino"),
      // El grupo se comprueba contra la lista completa (incluye el depósito),
      // no contra el número que vino en la URL.
      localesDelGrupo: locales,
    });
    if (alcance.error) {
      return NextResponse.json({ ok: false, error: alcance.error }, { status: 403 });
    }
    // Sin local resuelto solo le pasa al depósito que no pidió ninguno: la lista.
    if (!alcance.localId) {
      return NextResponse.json({ ok: true, vista: "ENTRADA", locales: pagadores });
    }
    const localId = alcance.localId;
    const nombre = locales.find((l) => l.localId === localId)?.nombre || localPropio?.nombre || "—";
    const consultadoEsDeposito = Boolean(locales.find((l) => l.localId === localId)?.esDeposito);

    // La semana es la de ESTA ubicación, del cargador canónico, igual que el
    // tablero y que Transferencias.
    const vigencias = (await vigenciasDeUbicaciones(prisma, [localId])).get(localId) || [];
    const rango = rangoFinanciero({ unidad, desplazamiento, vigencias });
    const descripcion = descripcionFinanciera({ unidad, desplazamiento, vigencias });

    // El depósito consultado no se paga a sí mismo: no se consulta nada y el
    // bloque no aplica. A esta rama solo se llega con una URL escrita a mano,
    // porque la lista de entrada ya lo excluye.
    if (consultadoEsDeposito) {
      return NextResponse.json({
        ok: true,
        vista: "UN_LOCAL",
        unidad,
        desplazamiento,
        local: { id: localId, nombre, esDeposito: true },
        periodo: { rango, descripcion },
        pagoADeposito: armarPagoADeposito({ esDeposito: true }),
        recibidas: [],
        puedeVerTransferencias: false,
        localDelEnlace: null,
        puedeAvanzar: puedeAvanzar(desplazamiento),
        puedeRetroceder: false,
        primerMovimiento: null,
      });
    }

    const [cuenta, primerMovimiento] = await Promise.all([
      detalleDePagoADeposito(prisma, { destinoId: localId, rango }),
      primeraRecepcion(prisma, { destinoId: localId }),
    ]);

    const puedeVerTransferencias = checkPerm(session, PERMISO_VER_TRANSFERENCIAS).ok;
    const pagoADeposito = armarPagoADeposito({
      esDeposito: false,
      cuenta,
      // El "Ver transferencias" abre la cuenta de ESE local en el mismo período
      // y criterio. Desde el depósito, la de ese local; desde el local, la
      // propia. Solo con `transferencias.ver`.
      verDetalle: enlaceDePagoADeposito({
        puedeVerTransferencias,
        unidad,
        desplazamiento,
        localDelEnlace: esDeposito ? localId : null,
      }),
    });

    return NextResponse.json({
      ok: true,
      vista: "UN_LOCAL",
      unidad,
      desplazamiento,
      local: { id: localId, nombre, esDeposito: false },
      periodo: { rango, descripcion },
      pagoADeposito,
      // Solo lo financiero de cada reconocida; las líneas quedan en Transferencias.
      recibidas: cuenta.recibidas,
      // La señal para dibujar el "Ver" por transferencia: el mismo permiso que
      // el enlace agregado. El id para armar esos enlaces —del depósito, el
      // local mirado; del local, el suyo (null)—.
      puedeVerTransferencias,
      localDelEnlace: esDeposito ? localId : null,
      puedeAvanzar: puedeAvanzar(desplazamiento),
      // Hacia atrás hasta la primera recepción confirmada; `null` = nunca recibió.
      puedeRetroceder: Boolean(primerMovimiento && rango.desde > primerMovimiento),
      primerMovimiento,
    });
  } catch (e) {
    console.error("[finanzas/pago-a-deposito]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo armar el Pago a depósito: ${e.message}` },
      { status: 500 }
    );
  }
}

// app/api/finanzas/gastos/route.js
//
// LOS GASTOS: GET los lista, POST crea uno —con su pago inicial si viene—.
//
// ── EL ALCANCE LO DECIDE EL SERVIDOR ──────────────────────────────────────
//
// El mismo de Pagos a proveedores, por la misma función: un local ve sus
// gastos; el depósito —o un admin en vista global— los de todas las ubicaciones
// del grupo. `destino` pide UNA de ellas y pasa por `resolverLocalPedido`, como
// en el tablero: pedir una ajena es 403, no una lista vacía. `localId` no se
// usa para esto porque está reservado para `resolveVistaOperativa`.
//
// ── EL LISTADO SE FILTRA Y SE PAGINA EN LA BASE ───────────────────────────
//
// Estado, categoría, fechas y búsqueda viajan en el `where`, y la página con
// `skip`/`take`. Ver `leerFiltrosDeGastos` y `listarGastos`.
//
// ── CREAR ES DE LA UBICACIÓN QUE SE OPERA ─────────────────────────────────
//
// El gasto nace en `vista.localId`, no en un número que mande el cliente. Si el
// cuerpo trae otro `localId`, se rechaza —no se corrige en silencio—, porque
// "anotá este gasto a nombre de Casiano" desde el depósito es un cruce y tiene
// que verse. Las reglas las impone `crearGasto`, en una sola transacción con el
// pago inicial y su RETIRO: la ruta no escribe nada por su cuenta.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";
import { ERROR_DESTINO_INVALIDO, resolverLocalPedido } from "@/lib/finanzas/alcanceFinanciero";
import { PERMISO_REGISTRAR_GASTOS, leerFiltrosDeGastos } from "@/lib/finanzas/gastos";
import {
  ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO,
  ErrorGasto,
  alcanceDeGastos,
  crearGasto,
  gastoYaRegistrado,
  listarGastos,
} from "@/lib/finanzas/gastosServer";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";

function ubicacionDe(alcance) {
  const id = Number(alcance.vista.localId) || null;
  const local = id ? alcance.locales.find((l) => l.localId === id) : null;
  return local ? { id, nombre: local.nombre } : null;
}

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const perm = checkPerm(session, PERMISO_VER_FINANZAS);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const alcance = await alcanceDeGastos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const leido = leerFiltrosDeGastos((k) => searchParams.get(k));
    if (leido.error) return NextResponse.json({ ok: false, error: leido.error }, { status: 400 });
    const { filtros } = leido;

    // Sin `destino`, todas las visibles. Con `destino`, esa sola, si se ve.
    let localIds = alcance.visibles;
    if (filtros.destino !== null && filtros.destino !== undefined && filtros.destino !== "") {
      const pedido = resolverLocalPedido({
        esDeposito: alcance.esDeposito,
        localDeLaSesion: alcance.vista.localId,
        destinoPedido: filtros.destino,
        localesDelGrupo: alcance.locales,
      });
      if (pedido.error) {
        const status = pedido.error === ERROR_DESTINO_INVALIDO ? 400 : 403;
        return NextResponse.json({ ok: false, error: pedido.error }, { status });
      }
      localIds = [pedido.localId];
    }

    const { gastos, paginacion } = await listarGastos(prisma, { grupoId: alcance.grupoId, localIds, filtros });

    return NextResponse.json({
      ok: true,
      filtros: {
        estado: filtros.estado,
        categoriaId: filtros.categoriaId,
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
        q: filtros.q,
        destino: localIds.length === 1 && filtros.destino ? localIds[0] : null,
      },
      puedeEscribir: alcance.puedeEscribir,
      // Crear exige además operar una ubicación: un admin en vista global ve
      // todo y no crea nada, igual que no paga.
      puedeCrear: alcance.puedeEscribir && Number(alcance.vista.localId) > 0,
      // DÓNDE SE REGISTRA un gasto nuevo: la ubicación que se opera, con su
      // nombre, para que el formulario la muestre fija. Sale de la lista del
      // grupo que el servidor ya leyó, no de algo que diga el cliente; sin
      // ubicación operada —un admin en vista global— es null.
      ubicacionOperada: ubicacionDe(alcance),
      variasUbicaciones: localIds.length > 1,
      gastos,
      paginacion,
    });
  } catch (e) {
    console.error("[finanzas/gastos GET]", e);
    // El mensaje dice QUÉ pasó: "Error interno" deja a la pantalla muda.
    return NextResponse.json({ ok: false, error: `No se pudieron leer los gastos: ${e.message}` }, { status: 500 });
  }
}

export async function POST(req) {
  // Lo que hace falta para contestar un P2002 desde el `catch`.
  let localLeido = null;
  let claveLeida = null;
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    for (const p of [PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_GASTOS]) {
      const perm = checkPerm(session, p);
      if (!perm.ok) {
        return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
      }
    }

    const alcance = await alcanceDeGastos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const body = await req.json().catch(() => ({}));
    const operado = Number(alcance.vista.localId) || null;
    const pedido = body?.localId;
    if (!operado || (pedido !== undefined && pedido !== null && pedido !== "" && Number(pedido) !== operado)) {
      return NextResponse.json({ ok: false, error: ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO }, { status: 403 });
    }
    localLeido = operado;
    claveLeida = body?.idempotencyKey ?? null;

    // El pago inicial viaja con lo que el pago acepta y nada más. Su clave no se
    // recibe: la deriva `crearGasto` del gasto, así un reintento del alta cae en
    // el mismo pago. El movimiento de caja tampoco: lo crea el pago.
    const inicial = body?.pagoInicial;
    const pagoInicial = inicial
      ? {
          monto: inicial.monto,
          medio: inicial.medio,
          turnoId: inicial.turnoId,
          fecha: inicial.fecha,
          nota: inicial.nota,
          localOrigenId: inicial.localOrigenId,
        }
      : null;

    const resultado = await prisma.$transaction(
      (tx) =>
        crearGasto(tx, {
          session,
          grupoId: alcance.grupoId,
          localId: operado,
          localOperativoId: operado,
          categoriaId: body?.categoriaId,
          concepto: body?.concepto,
          total: body?.total,
          fecha: body?.fecha,
          beneficiario: body?.beneficiario,
          comprobanteNumero: body?.comprobanteNumero,
          comprobanteFecha: body?.comprobanteFecha,
          vencimiento: body?.vencimiento,
          fechaPrevistaPago: body?.fechaPrevistaPago,
          idempotencyKey: body?.idempotencyKey,
          pagoInicial,
        }),
      OPCIONES_TX
    );

    // Un reintento del mismo intento contesta 200 con el gasto de antes y
    // `repetido: true`, como un pago a proveedor.
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    // Choque contra el UNIQUE (localId, idempotencyKey): otro envío del mismo
    // intento ganó la carrera, con su pago y su retiro. Se devuelve lo que quedó.
    if (e?.code === "P2002" && localLeido && claveLeida) {
      const ganador = await gastoYaRegistrado(prisma, { localId: localLeido, idempotencyKey: claveLeida }).catch(() => null);
      if (ganador) return NextResponse.json({ ok: true, ...ganador });
    }
    if (e instanceof ErrorGasto) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[finanzas/gastos POST]", e);
    return NextResponse.json({ ok: false, error: `No se pudo registrar el gasto: ${e.message}` }, { status: 500 });
  }
}

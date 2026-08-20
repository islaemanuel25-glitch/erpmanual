// app/api/transferencias/por-destino/route.js
//
// Vista del reporte AGRUPADA POR LOCAL DESTINO. Es el espejo de
// /api/reportes-ventas/por-cliente: mismo techo defensivo, mismo parámetro
// `orden`, misma bandera `truncado`, y se consulta solo cuando la tab está
// activa — por eso vive en su propio endpoint y no engorda cada respuesta del
// listado.
//
// SOLO LECTURA. Un findMany y nada más: no toca stock, ni recepción, ni estados.
//
// El `where` se arma EXACTAMENTE igual que en /api/transferencias/listar —mismo
// filtro de estado, mismo rango de día argentino, mismo scope por ubicación— y
// se barre sin paginar. Si divergiera, el agrupado no cerraría contra el
// desglose de la pantalla principal.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { inicioDiaArgentina, finDiaArgentina } from "@/lib/fechas/rangoArgentina";
import {
  agruparPorDestino,
  ordenarDestinos,
  totalesDeDestinos,
  recortarPeriodo,
  ORDEN_DESTINO_DEFAULT,
  ORDENES_DESTINO,
  MAX_TRANSFERENCIAS,
} from "@/lib/transferencias/agregadosPeriodo";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, destinos: [], error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.ver");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, destinos: [], error: perm.error },
        { status: perm.status }
      );
    }

    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, destinos: [], error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado") || "";
    // Se aceptan los dos nombres: `desde`/`hasta` (los que pide esta vista) y
    // `fechaDesde`/`fechaHasta` (los que ya usa el listado). Así el front puede
    // reenviar el mismo objeto de filtros sin traducir.
    const fechaDesde = searchParams.get("desde") || searchParams.get("fechaDesde") || "";
    const fechaHasta = searchParams.get("hasta") || searchParams.get("fechaHasta") || "";
    const ordenParam = searchParams.get("orden");
    const orden = ORDENES_DESTINO.includes(ordenParam) ? ordenParam : ORDEN_DESTINO_DEFAULT;

    const where = {};
    if (estado) where.estado = estado;

    // Límites de día ARGENTINO, no del proceso: el contenedor corre en UTC.
    const desde = inicioDiaArgentina(fechaDesde);
    const hasta = finDiaArgentina(fechaHasta);
    if (desde || hasta) {
      where.fechaEnvio = {};
      if (desde) where.fechaEnvio.gte = desde;
      if (hasta) where.fechaEnvio.lte = hasta;
    }

    // Filtro por PARTICIPACIÓN (origen o destino), acotado a la vista.
    if (vista.modo === "GLOBAL") {
      where.OR = [
        { origenId: { in: vista.localIds } },
        { destinoId: { in: vista.localIds } },
      ];
    } else {
      where.OR = [{ origenId: vista.localId }, { destinoId: vista.localId }];
    }

    // Un solo findMany para todo el agrupado. Los nombres de origen y destino
    // vienen por join en la misma consulta: resolverlos después, por grupo,
    // sería el N+1 que hay que evitar.
    //
    // MAX + 1 a propósito: con `take: MAX` un período de exactamente MAX
    // devuelve MAX filas igual que uno de MAX + 500, y se marcaría como
    // truncado sin faltarle nada. La fila extra distingue los dos casos y
    // después se descarta.
    const resultados = await prisma.transferencia.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_TRANSFERENCIAS + 1,
      select: {
        id: true,
        estado: true,
        tieneDiferencias: true,
        fechaEnvio: true,
        createdAt: true,
        destinoId: true,
        // `es_deposito` NO es opcional. Sin la columna, `t.origen?.es_deposito`
        // es `undefined`, el `=== true` de más abajo lo vuelve `false`, y como
        // `false` es un booleano válido el control de origen obligatorio lo deja
        // pasar sin quejarse. Ésa fue exactamente la forma del defecto de la #97
        // en esta vista: no faltó el origen, llegó MENTIDO.
        origen: { select: { id: true, nombre: true, es_deposito: true } },
        destino: { select: { id: true, nombre: true } },
        detalle: {
          select: {
            cantidad: true,
            recibido: true,
            precioCosto: true,
            unidadEnviada: true,
            producto: {
              select: {
                precio_costo: true,
                base: {
                  select: {
                    precio_costo: true,
                    unidad_medida: true,
                    factor_pack: true,
                    // Los cuatro del fiambre de pieza fija. Sin ellos el
                    // predicado dice "no es fiambre" y el importe sale por kilo
                    // donde el depósito cuenta piezas. Ver el candado en
                    // lib/transferencias/formaDelSelect.test.mjs.
                    pesoEsFijo: true,
                    pesoReferenciaKg: true,
                    modoVentaDeposito: true,
                    modoCompraProveedor: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Estrictamente MAYOR: recibir MAX filas de MAX + 1 pedidas significa que el
    // período entra completo. La fila extra se descarta antes de agrupar.
    const { truncado, periodo } = recortarPeriodo(resultados, MAX_TRANSFERENCIAS);

    const grupos = ordenarDestinos(agruparPorDestino(periodo), orden);

    return NextResponse.json({
      ok: true,
      orden,
      destinos: grupos,
      totales: totalesDeDestinos(grupos),
      truncado,
      error: null,
    });
  } catch (err) {
    console.error("Error agrupando transferencias por destino:", err);
    return NextResponse.json(
      { ok: false, destinos: [], error: err.message },
      { status: 500 }
    );
  }
}

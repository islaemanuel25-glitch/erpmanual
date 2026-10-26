// GET /api/compras-proveedor/conciliacion/[pedidoId]
//
// TODO lo que la pantalla de recepción necesita, de una sola vez: los
// comprobantes del pedido con sus líneas ya analizadas, lo que a cada línea le
// corresponde del pedido, y las líneas del pedido que ningún comprobante trajo.
//
// ── POR QUÉ UNA RUTA Y NO DOS ──────────────────────────────────────────────
//
// La pantalla vieja tenía dos listas —los comprobantes arriba, el pedido
// abajo— y dos rutas para alimentarlas. Cruzarlas quedaba a cargo de la persona,
// de memoria. La lista nueva es una sola, así que el cruce se hace acá, donde
// están los dos lados, y no en el navegador con dos respuestas que pueden llegar
// desfasadas.
//
// El análisis por comprobante es el MISMO de siempre: sale de
// `analisisDeComprobante.js`, que se extrajo de la ruta de un comprobante para
// no tener dos versiones del cruce que decide qué producto es cada línea.
//
// El contexto —universo del proveedor y catálogo— se carga UNA vez para todos
// los comprobantes, no uno por comprobante.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import {
  cargarConciliacion,
  lineasSospechadasDeCorrimiento,
} from "@/lib/compras-proveedor/comprobante/conciliacionDelPedido";
import { coberturaDelPedido, textoDeCobertura } from "@/lib/compras-proveedor/comprobante/cobertura";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { elCatalogoSeMovio } from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { LLEGADA, llegada } from "@/lib/compras-proveedor/cierreDeRecepcion";
import { totalAPagarDelComprobante } from "@/lib/compras-proveedor/pagoDelCierre";
import { avisoDeImpuestos } from "@/lib/compras-proveedor/comprobante/pantalla";

export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, ["compras.ver", "compras.recibir"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { pedidoId: crudo } = await params;
    const pedidoId = Number(crudo);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta decir de qué pedido." }, { status: 400 });
    }

    // ── LA CONCILIACIÓN SE CARGA EN UN SOLO LUGAR ──────────────────────────
    //
    // `cargarConciliacion` trae el pedido, sus líneas y sus papeles, y arma las
    // filas con `analizarLineas` + `filasDeConciliacion`. La usan también el
    // acomodo de un papel leído corrido y `aceptar-precio` (Mauro #298): las
    // tres preguntan lo mismo.
    const conciliacion = await cargarConciliacion(prisma, { grupoId, localId, pedidoId });
    if (!conciliacion) {
      return NextResponse.json({ ok: false, error: "No existe ese pedido." }, { status: 404 });
    }
    const { pedido, detallesPlanos, comprobantes, analizados, grupos, sinComprobante, hayFaltantes, totales, variacionNormalPct } =
      conciliacion;
    // Los productos de un bloque que puede haberse leído corrido y no se pudo
    // acomodar: la tarjeta lo avisa y no propone su costo (`filasCorridas.js`).
    const sospechadas = lineasSospechadasDeCorrimiento(conciliacion);


    // La cobertura, con la MISMA regla de siempre: mientras falten comprobantes
    // por subir o por leer, lo que falta NO es un error y no se pinta como tal.
    //
    // ── CON EL PRODUCTO QUE RESOLVIÓ EL ANÁLISIS, NO SOLO EL GUARDADO ──────
    //
    // Filtraba por `pedidoDetalleId` y `productoLocalId`, que son las columnas
    // de un vínculo hecho a mano. La lista ata sola —por código, por alias— sin
    // escribir nada, así que con los 15 renglones de Mauro atados esto contaba
    // cero (#298). Ahora cuenta lo mismo que la lista: el producto y la línea
    // del pedido que salieron de `analizarLineas`.
    const cobertura = coberturaDelPedido({
      detalles: detallesPlanos.map((d) => ({
        id: d.id,
        productoBaseId: d.productoBaseId,
        nombre: d.nombre,
      })),
      lineasDeComprobantes: [
        ...analizados.flatMap((c) =>
          (c.lineas ?? [])
            // Lo que una persona dijo que no vino no llegó.
            .filter((l) => l.noVino !== true)
            .map((l) => ({
              productoBaseId: l.pedidoDetalle?.productoBaseId ?? l.productoBaseId ?? null,
              comprobanteId: c.id,
            }))
            .filter((l) => l.productoBaseId != null)
        ),
        // Lo que no está en ninguna boleta y alguien dijo "Llegó sin papel"
        // también llegó (Mauro, 2026-10-26). Sin comprobante que lo respalde.
        ...sinComprobante
          .filter((d) => llegada(d) === LLEGADA.LLEGO && d.productoBaseId != null)
          .map((d) => ({ productoBaseId: d.productoBaseId, comprobanteId: null })),
      ],
    });
    const sinLeer = comprobantes.filter((c) => !c.leidoEn).length;

    // La variación normal del proveedor viene con la conciliación: sale de su
    // receta VIGENTE, no del snapshot que quedó guardado con la lectura.
    const proveedorId = comprobantes[0]?.proveedor?.id ?? pedido.proveedorId ?? null;

    // ── EL CATÁLOGO QUE SE MOVIÓ DESPUÉS DEL PEDIDO ─────────────────────
    //
    // Se marca acá y no en `filasDeConciliacion`, que no clasifica precios: la
    // pregunta necesita la variación del proveedor, y ésta es la ruta que la
    // conoce. Es la misma regla con la que frena el cierre.
    const porId = new Map(comprobantes.map((c) => [c.id, c]));
    // ── LOS ÚLTIMOS PAPELES CERRADOS DEL PROVEEDOR, PARA EL AVISO ─────────
    //
    // "Este papel no trae impuestos y este proveedor suele traerlos"
    // (`avisoDeImpuestos`): se compara contra los suyos de otras compras, no
    // contra los de este pedido.
    const anteriores = proveedorId
      ? await prisma.comprobanteProveedor.findMany({
          where: {
            grupoId,
            proveedorId,
            estado: "CARGADO",
            leidoEn: { not: null },
            OR: [{ pedidoId: null }, { pedidoId: { not: pedidoId } }],
          },
          orderBy: { leidoEn: "desc" },
          take: 10,
          select: {
            tipo: true, ivaLeido: true, internoLeido: true, conceptosDelPieLeidos: true, recetaUsada: true,
            lineas: { select: { ivaPct: true, internoUnitario: true } },
          },
        })
      : [];
    const gruposConCatalogo = grupos.map((g) => ({
      ...g,
      // Lo que se le paga por este papel: el total impreso, o en un papel sin
      // total la suma de sus productos. La MISMA función que usa el cierre en
      // el servidor, para que la hoja no pida escribir lo que ya se sabe.
      comprobante: g.comprobante
        ? {
            ...g.comprobante,
            totalAPagar: totalAPagarDelComprobante(porId.get(g.comprobante.id)),
            avisoDeImpuestos: avisoDeImpuestos({ papel: porId.get(g.comprobante.id), anteriores }),
          }
        : g.comprobante,
      filas: (g.filas ?? []).map((f) => ({
        ...f,
        corridaSospechada: sospechadas.has(f.lineaId),
        catalogoMovido: elCatalogoSeMovio(f, { variacionPct: variacionNormalPct }),
        // Con la fila, para que la tarjeta y la hoja midan con la misma regla
        // cuánto puede alejarse una estimación de piezas —la del fiambre que
        // viene en kilos— sin pedir motivo.
        variacionNormalPct,
      })),
    }));

    // ── LO QUE SE CORRIGIÓ A MANO EN EL PAPEL, PARA LA SEGUNDA REVISIÓN ──
    //
    // Secco #256: un papel que no cierra se arregla poniendo a mano lo que dice
    // un renglón. Lo que se puso reemplaza a lo leído, y quien revisa después
    // tiene que poder verlo: qué renglón, qué había leído, qué se puso, quién y
    // cuándo.
    const correcciones = comprobantes.length
      ? await prisma.correccionManualRenglon.findMany({
          where: { grupoId, comprobanteId: { in: comprobantes.map((c) => c.id) } },
          orderBy: { creadaEn: "asc" },
          select: {
            id: true, comprobanteId: true, orden: true, textoCrudo: true, leido: true, puesto: true,
            cerroDespues: true, usuarioId: true, creadaEn: true,
          },
        })
      : [];
    const autores = correcciones.length
      ? await prisma.usuario.findMany({
          where: { id: { in: [...new Set(correcciones.map((x) => x.usuarioId).filter((x) => x != null))] } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombreDe = new Map(autores.map((u) => [u.id, u.nombre]));

    return NextResponse.json({
      ok: true,
      pedido: { id: pedido.id, estado: pedido.estado },
      correccionesManuales: correcciones.map((x) => ({ ...x, quien: nombreDe.get(x.usuarioId) ?? null })),
      proveedor: {
        id: proveedorId,
        nombre: comprobantes[0]?.proveedor?.nombre ?? null,
        variacionNormalPct,
      },
      grupos: gruposConCatalogo,
      sinComprobante,
      hayFaltantes,
      totales,
      cobertura: {
        ...cobertura,
        ...textoDeCobertura(cobertura, {
          comprobantesSinLeer: sinLeer,
          pedidoCerrado: pedido.estado === "RECIBIDO",
        }),
      },
    });
  } catch (err) {
    console.error("Error compras-proveedor/conciliacion:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "cargar la recepción",
          quedo: "No se tocó nada: esto solo muestra lo que ya estaba cargado.",
        }),
      },
      { status: 500 }
    );
  }
}

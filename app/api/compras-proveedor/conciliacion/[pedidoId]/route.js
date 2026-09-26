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
  cargarContexto,
  aplanarDetalles,
  analizarLineas,
  vinculadasDeTodos,
} from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { coberturaDelPedido, textoDeCobertura } from "@/lib/compras-proveedor/comprobante/cobertura";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { VARIACION_POR_DEFECTO } from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import { elCatalogoSeMovio } from "@/lib/compras-proveedor/estadoDeLineaFacturada";

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

    const pedido = await prisma.pedidoProveedor.findFirst({
      where: { id: pedidoId, grupoId },
      select: { id: true, estado: true, proveedorId: true },
    });
    if (!pedido) {
      return NextResponse.json({ ok: false, error: "No existe ese pedido." }, { status: 404 });
    }

    // Las líneas del pedido, con lo que la fila muestra al lado de la factura.
    const detalles = await prisma.pedidoProveedorDetalle.findMany({
      where: { pedidoId },
      orderBy: { id: "asc" },
      select: {
        id: true, cantidad: true, precioCosto: true, cantidadRecibida: true, unidad: true,
        kgRecibidos: true,
        // Lo que la hoja de corregir necesita para contar: cuántas sueltas se
        // anotaron y por qué la cantidad no coincide. Sin esto la hoja se abre
        // en blanco cada vez y la corrección de ayer se pierde de vista.
        unidadesSueltas: true, motivoPrincipal: true, motivoDetalle: true,
        // `modoCompraProveedor` es lo que decide si la línea es fiambre, y de eso
        // depende que aparezca la columna de kilos. El fiambre entra por PIEZA en
        // el depósito y se mide en KILOS en los locales: si esa columna
        // desapareciera, alguien recibiría fiambre sin poder cargar el peso.
        producto: {
          select: {
            id: true, baseId: true,
            // `factor_pack` es cuántas unidades trae un bulto. Lo usa la hoja
            // para decir "1 bulto = 24 u" y para calcular qué entra al stock
            // con los dos steppers. Sin él, la hoja no puede sumar sueltas.
            base: {
              select: {
                id: true,
                nombre: true,
                modoCompraProveedor: true,
                factor_pack: true,
                // ── PARA PONER LOS DOS PRECIOS EN LA MISMA UNIDAD ─────────
                //
                // El costo del catálogo de un producto en kilos está POR KILO,
                // y el depósito puede contarlo por PIEZA. Sin estos campos la
                // tarjeta comparaba $8.166,54 la bolsa contra $3.800 el kilo y
                // mostraba +114,9 % sobre un renglón donde el depósito gana.
                unidad_medida: true,
                modoVentaDeposito: true,
                pesoEsFijo: true,
                pesoReferenciaKg: true,
                // El costo maestro de HOY: el cierre compara contra éste, y la
                // hoja tiene que poder preguntar cuando se movió después del
                // pedido aunque el papel coincida con la línea.
                precio_costo: true,
              },
            },
          },
        },
      },
    });
    const detallesPlanos = aplanarDetalles(detalles);

    // El alcance va en el WHERE: un comprobante de otro grupo no existe.
    const comprobantes = await prisma.comprobanteProveedor.findMany({
      where: { grupoId, pedidoId, estado: { not: "ANULADO" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, estado: true, tipo: true, puntoVenta: true, numero: true, fecha: true,
        confirmadoEn: true, imagenBorradaEn: true, leidoEn: true, recetaUsada: true,
        // El total IMPRESO del papel, para que el rótulo "Factura" muestre lo
        // que factura el papel y no una suma parcial de los renglones que se
        // pudieron comparar.
        totalLeido: true,
        // ── Y EL RESTO DEL PIE, QUE ES PARTE DEL COSTO ─────────────────
        //
        // El costo de cada producto lleva adentro los conceptos que el papel
        // imprime entre el subtotal y el total —percepción de IVA, IIBB,
        // internos—, repartidos en proporción al neto de su renglón. Sin estos
        // campos el reparto se hace sobre un pie vacío y el precio vuelve a ser
        // neto + IVA, que es lo que pasaba hasta el 2026-09-23.
        netoLeido: true,
        ivaLeido: true,
        internoLeido: true,
        conceptosDelPieLeidos: true,
        proveedor: { select: { id: true, nombre: true, umbralRevisarPct: true, umbralSospechaBajaPct: true } },
        lineas: {
          orderBy: { orden: "asc" },
          select: {
            id: true, orden: true, textoCrudo: true, codigoProveedor: true, cantidad: true,
            netoUnitario: true, subtotalImpreso: true, internoUnitario: true,
            // El subtotal corregido, que manda sobre el leído: sin esto la
            // conciliación sigue valorizando el renglón con el dígito mal leído
            // aunque el comprobante ya haya cerrado.
            subtotalCorregido: true,
            // Los kilos y el descuento del papel: el costo real de un renglón
            // con peso sale de dividir por ellos, no por las piezas.
            pesoKg: true, bonificacionPct: true,
            productoLocalId: true, pedidoDetalleId: true, precioPedidoPrevio: true,
            // La marca de controlado, que ahora es un hecho guardado y no
            // estado de React: sin esto la pantalla vuelve a 0 revisadas en
            // cada refresco.
            revisadoEnRecepcion: true, revisadoEnRecepcionAt: true,
            // Por unidad o por bulto, cuando alguien ya lo eligió. Sin esto la
            // elección se pierde en cada refresco y el renglón vuelve a
            // preguntar lo mismo: el yogur del 242 preguntaba siempre.
            unidadElegida: true,
          },
        },
      },
    });

    const contexto = await cargarContexto(prisma, {
      grupoId,
      localId,
      proveedorId: pedido.proveedorId,
    });
    const porProductoLocal = await vinculadasDeTodos(prisma, comprobantes);

    const analizados = comprobantes.map((c) => ({
      ...c,
      lineas: analizarLineas({ comprobante: c, contexto, detallesPlanos, porProductoLocal }),
    }));

    const { grupos, sinComprobante, hayFaltantes, totales } = filasDeConciliacion({
      comprobantes: analizados,
      detalles: detallesPlanos,
    });

    // La cobertura, con la MISMA regla de siempre: mientras falten comprobantes
    // por subir o por leer, lo que falta NO es un error y no se pinta como tal.
    const cobertura = coberturaDelPedido({
      detalles: detallesPlanos.map((d) => ({
        id: d.id,
        productoBaseId: d.productoBaseId,
        nombre: d.nombre,
      })),
      lineasDeComprobantes: analizados.flatMap((c) =>
        (c.lineas ?? [])
          .filter((l) => l.pedidoDetalleId != null || l.productoLocalId != null)
          .map((l) => ({
            productoBaseId: l.pedidoDetalle?.productoBaseId ?? null,
            comprobanteId: c.id,
          }))
      ),
    });
    const sinLeer = comprobantes.filter((c) => !c.leidoEn).length;

    // ── CUÁNTO SE LE MUEVE EL PRECIO A ESTE PROVEEDOR ────────────────────
    //
    // Sale de la receta VIGENTE del proveedor, no del snapshot que quedó
    // guardado con la lectura: es una decisión de hoy sobre cómo leer una
    // diferencia, y si alguien la cambia tiene que valer para lo que está
    // recibiendo ahora. Sin receta cargada, el 10 % por defecto.
    const proveedorId = comprobantes[0]?.proveedor?.id ?? pedido.proveedorId ?? null;
    const recetaVigente = proveedorId
      ? await prisma.recetaProveedor.findFirst({
          where: { grupoId, proveedorId },
          select: { variacionNormalPct: true },
        })
      : null;

    const variacionNormalPct =
      recetaVigente?.variacionNormalPct != null
        ? Number(recetaVigente.variacionNormalPct)
        : VARIACION_POR_DEFECTO;

    // ── EL CATÁLOGO QUE SE MOVIÓ DESPUÉS DEL PEDIDO ─────────────────────
    //
    // Se marca acá y no en `filasDeConciliacion`, que no clasifica precios: la
    // pregunta necesita la variación del proveedor, y ésta es la ruta que la
    // conoce. Es la misma regla con la que frena el cierre.
    const gruposConCatalogo = grupos.map((g) => ({
      ...g,
      filas: (g.filas ?? []).map((f) => ({
        ...f,
        catalogoMovido: elCatalogoSeMovio(f, { variacionPct: variacionNormalPct }),
      })),
    }));

    return NextResponse.json({
      ok: true,
      pedido: { id: pedido.id, estado: pedido.estado },
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

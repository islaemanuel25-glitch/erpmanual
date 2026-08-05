// POST /api/proveedores/listas/[id]/aplicar
//
// ACÁ SE ESCRIBEN COSTOS REALES. Es el único endpoint del módulo que toca
// ProductoBase y ProductoLocal.
//
// ── POR QUÉ SE VUELVE A VALIDAR TODO ────────────────────────────────────────
//
// Entre conciliar y aplicar pasa tiempo real: horas, a veces días. En el medio
// el producto pudo cambiar de factor, pasar a fiambre, mudar de dueño o recibir
// un costo nuevo por una compra. El número congelado en la conciliación se
// calculó con supuestos que quizá ya no valen, y el costo es el dato del que
// cuelgan todos los precios de venta.
//
// Por eso nada se toma de la fila persistida: se lee el producto vivo DENTRO de
// la transacción y se recalcula con el mismo resolvedor del proveedor que usó la
// conciliación. Si el número no coincide, esa fila se omite con su motivo.
//
// ── DOS TIPOS DE PROBLEMA, DOS RESPUESTAS DISTINTAS ─────────────────────────
//
// Fila que cambió → se omite ESA fila y las demás se aplican. Es una
// discrepancia de negocio prevista, aislable y explicable.
//
// Error técnico de escritura → rollback completo. Ahí no sabemos en qué estado
// quedó la base, y lo único seguro es no dejar nada a medias.
//
// ── IDEMPOTENCIA ────────────────────────────────────────────────────────────
//
// Una importación APLICADA no se vuelve a aplicar nunca. El segundo pedido
// devuelve el resultado de la primera corrida sin tocar un solo producto. El
// chequeo se repite DENTRO de la transacción: dos pedidos simultáneos que pasen
// el chequeo de afuera al mismo tiempo no pueden duplicar la escritura.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { ESTADO_IMPORTACION } from "@/lib/proveedores/listas/persistencia";
import { CONFIG_ARCOR } from "@/lib/proveedores/listas/configuraciones/arcor";
import {
  MODO_PRECIO_VENTA,
  modoPrecioVentaValido,
  resolverModoPrecioVenta,
  revalidarFila,
  ventaParaModo,
  debeActualizarOverride,
  debeActualizarVentaOverride,
  resumirAplicacion,
  textoOmision,
  RESULTADO_FILA,
  MOTIVO_OMISION,
} from "@/lib/proveedores/listas/aplicacion";

// Una corrida grande escribe miles de filas. El default de 5 s de Prisma no
// alcanza ni de lejos; el de la persistencia (60 s) tampoco para una lista
// entera. Se sube solo acá, donde la transacción es inherentemente larga.
const TX_APLICAR = { maxWait: 20000, timeout: 300000 };

/** Resultado ya guardado de una corrida anterior. No toca nada. */
async function resultadoPrevio(importacionId) {
  const filas = await prisma.importacionListaFila.findMany({
    where: { importacionId, resultadoAplicacion: { not: null } },
    select: {
      id: true, codigoCrudo: true, descripcionProveedor: true,
      resultadoAplicacion: true, motivoAplicacion: true,
      costoPrevioAplicacion: true, costoAplicado: true,
      ventaAnterior: true, ventaNueva: true,
      productoBase: { select: { id: true, nombre: true } },
    },
    orderBy: { filaExcel: "asc" },
  });
  return filas.map((f) => ({
    filaId: f.id,
    codigo: f.codigoCrudo,
    producto: f.productoBase?.nombre ?? f.descripcionProveedor,
    resultado: f.resultadoAplicacion,
    motivo: f.motivoAplicacion,
    textoMotivo: f.motivoAplicacion ? textoOmision(f.motivoAplicacion) : null,
    costoAnterior: f.costoPrevioAplicacion === null ? null : Number(f.costoPrevioAplicacion),
    costoNuevo: f.costoAplicado === null ? null : Number(f.costoAplicado),
    ventaAnterior: f.ventaAnterior === null ? null : Number(f.ventaAnterior),
    ventaNueva: f.ventaNueva === null ? null : Number(f.ventaNueva),
  }));
}

export async function POST(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { session, grupoId, localId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const modoPedido = body?.modoPrecioVenta;
    if (modoPedido !== undefined && modoPedido !== null && !modoPrecioVentaValido(modoPedido)) {
      return NextResponse.json(
        { ok: false, error: "Modo de precio de venta inválido." },
        { status: 400 }
      );
    }
    const modoPrecioVenta = resolverModoPrecioVenta(modoPedido);

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true, estado: true, proveedorId: true, localOperativoId: true,
        recargoPct: true, archivoNombre: true, aplicadaEn: true,
        aplicadas: true, omitidas: true, modoPrecioVenta: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // ── Idempotencia: ya aplicada → se devuelve lo de antes, sin escribir ──
    if (importacion.estado === ESTADO_IMPORTACION.APLICADA) {
      return NextResponse.json({
        ok: true,
        yaAplicada: true,
        aplicadaEn: importacion.aplicadaEn,
        modoPrecioVenta: importacion.modoPrecioVenta,
        resumen: { aplicadas: importacion.aplicadas, omitidas: importacion.omitidas, motivos: [] },
        detalle: await resultadoPrevio(importacionId),
      });
    }

    if (importacion.estado !== ESTADO_IMPORTACION.CONCILIADA) {
      return NextResponse.json(
        { ok: false, error: "Solo se puede aplicar una importación conciliada." },
        { status: 409 }
      );
    }

    // La propiedad del costo depende de DÓNDE se opera. Aplicar desde una
    // ubicación distinta de la que concilió cambiaría en silencio qué productos
    // son tocables: mejor frenar y decirlo.
    if (Number(importacion.localOperativoId) !== Number(localId)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta importación se concilió desde otra ubicación. Cambiá el contexto a esa ubicación para aplicarla.",
        },
        { status: 409 }
      );
    }

    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const contexto = { operandoEnLocalId: Number(localId), depositoLocalId };
    const config = CONFIG_ARCOR;
    const recargoPct = Number(importacion.recargoPct);
    const usuarioId = Number(session?.id ?? session?.userId) || null;

    // ── La transacción ───────────────────────────────────────────────────
    const salida = await prisma.$transaction(async (tx) => {
      // Idempotencia dentro de la transacción: dos pedidos simultáneos que
      // hayan pasado el chequeo de afuera no pueden escribir los dos.
      const cab = await tx.importacionListaProveedor.findUnique({
        where: { id: importacionId },
        select: { estado: true },
      });
      if (cab.estado !== ESTADO_IMPORTACION.CONCILIADA) {
        return { carrera: true };
      }

      const filas = await tx.importacionListaFila.findMany({
        where: { importacionId, seleccionada: true, aplicada: false },
        orderBy: { filaExcel: "asc" },
      });

      if (filas.length === 0) {
        return { vacia: true };
      }

      const baseIds = [...new Set(filas.map((f) => f.productoBaseId).filter((x) => x !== null))];
      const productos = await tx.productoBase.findMany({
        where: { id: { in: baseIds }, grupoId },
        select: {
          id: true, nombre: true, precio_costo: true, precio_venta: true,
          margen: true, redondeo_100: true, es_combo: true, creadoEnLocalId: true,
          unidad_medida: true, factor_pack: true, modoCompraProveedor: true,
          pesoReferenciaKg: true,
        },
      });
      const porId = new Map(productos.map((p) => [p.id, p]));

      const overrides = await tx.productoLocal.findMany({
        where: { baseId: { in: baseIds } },
        select: { id: true, baseId: true, localId: true, precio_costo: true, precio_venta: true, margen: true },
      });
      const overridesPorBase = new Map();
      for (const o of overrides) {
        if (!overridesPorBase.has(o.baseId)) overridesPorBase.set(o.baseId, []);
        overridesPorBase.get(o.baseId).push(o);
      }

      const detalle = [];
      const omitidasPorMotivo = new Map();
      const ahora = new Date();

      for (const fila of filas) {
        const base = fila.productoBaseId === null ? null : porId.get(fila.productoBaseId) ?? null;
        const v = revalidarFila({ fila, base, contexto, config, recargoPct });

        if (!v.aplicable) {
          if (!omitidasPorMotivo.has(v.motivo)) omitidasPorMotivo.set(v.motivo, []);
          omitidasPorMotivo.get(v.motivo).push(fila.id);
          detalle.push({
            filaId: fila.id,
            codigo: fila.codigoCrudo,
            producto: base?.nombre ?? fila.descripcionProveedor,
            resultado: RESULTADO_FILA.OMITIDA,
            motivo: v.motivo,
            textoMotivo: textoOmision(v.motivo),
            costoAnterior: v.costoActual,
            costoNuevo: null,
            ventaAnterior: base?.precio_venta === undefined || base?.precio_venta === null ? null : Number(base.precio_venta),
            ventaNueva: null,
          });
          continue;
        }

        const costoAnterior = Number(base.precio_costo);
        const ventaAnteriorMaestra = base.precio_venta === null ? null : Number(base.precio_venta);
        const costoNuevo = v.costoNuevo;

        // ── Maestro ────────────────────────────────────────────────────
        const ventaMaestra = ventaParaModo({
          modo: modoPrecioVenta,
          costo: costoNuevo,
          margenConfigurado: base.margen,
          redondeo100: base.redondeo_100 === true,
        });
        const dataBase = { precio_costo: costoNuevo };
        if (ventaMaestra.aplica) dataBase.precio_venta = ventaMaestra.precioFinal;
        await tx.productoBase.update({ where: { id: base.id }, data: dataBase });

        // ── Overrides por ubicación ────────────────────────────────────
        //
        // Se pisa solo lo que venía arrastrando el maestro. Un costo cargado a
        // mano para un local es una decisión de esa ubicación y esta
        // herramienta no la borra. Y si NO se toca el costo del local, tampoco
        // se le recalcula la venta: sería derivarla de un costo que no cambió.
        for (const ov of overridesPorBase.get(base.id) ?? []) {
          if (!debeActualizarOverride(ov.precio_costo, costoAnterior)) continue;
          const dataLocal = { precio_costo: costoNuevo };
          if (modoPrecioVenta === MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN) {
            const margenLocal = ov.margen !== null && ov.margen !== undefined ? ov.margen : base.margen;
            const ventaLocal = ventaParaModo({
              modo: modoPrecioVenta,
              costo: costoNuevo,
              margenConfigurado: margenLocal,
              redondeo100: base.redondeo_100 === true,
            });
            if (ventaLocal.aplica && debeActualizarVentaOverride(ov.precio_venta, ventaAnteriorMaestra)) {
              dataLocal.precio_venta = ventaLocal.precioFinal;
            }
          }
          await tx.productoLocal.update({ where: { id: ov.id }, data: dataLocal });
        }

        // ── Historial de la fila ───────────────────────────────────────
        await tx.importacionListaFila.update({
          where: { id: fila.id },
          data: {
            aplicada: true,
            costoAplicado: costoNuevo,
            costoPrevioAplicacion: costoAnterior,
            ventaAnterior: ventaAnteriorMaestra,
            ventaNueva: ventaMaestra.aplica ? ventaMaestra.precioFinal : ventaAnteriorMaestra,
            aplicadaEn: ahora,
            aplicadaPorUsuarioId: usuarioId,
            resultadoAplicacion: RESULTADO_FILA.APLICADA,
            motivoAplicacion: null,
          },
        });

        detalle.push({
          filaId: fila.id,
          codigo: fila.codigoCrudo,
          producto: base.nombre,
          resultado: RESULTADO_FILA.APLICADA,
          motivo: null,
          textoMotivo: null,
          costoAnterior,
          costoNuevo,
          ventaAnterior: ventaAnteriorMaestra,
          ventaNueva: ventaMaestra.aplica ? ventaMaestra.precioFinal : ventaAnteriorMaestra,
        });
      }

      // Las omitidas se marcan por grupo de motivo: son pocos motivos y muchas
      // filas. `aplicada` queda en false a propósito — omitir no es aplicar.
      for (const [motivo, ids] of omitidasPorMotivo) {
        await tx.importacionListaFila.updateMany({
          where: { id: { in: ids }, importacionId },
          data: {
            resultadoAplicacion: RESULTADO_FILA.OMITIDA,
            motivoAplicacion: motivo,
            aplicadaEn: ahora,
            aplicadaPorUsuarioId: usuarioId,
          },
        });
      }

      const resumen = resumirAplicacion(detalle);

      await tx.importacionListaProveedor.update({
        where: { id: importacionId },
        data: {
          estado: ESTADO_IMPORTACION.APLICADA,
          aplicadaEn: ahora,
          aplicadaPorUsuarioId: usuarioId,
          modoPrecioVenta,
          aplicadas: resumen.aplicadas,
          omitidas: resumen.omitidas,
        },
      });

      return { resumen, detalle };
    }, TX_APLICAR);

    if (salida.carrera) {
      return NextResponse.json({
        ok: true,
        yaAplicada: true,
        conflictoIdempotente: true,
        detalle: await resultadoPrevio(importacionId),
      });
    }
    if (salida.vacia) {
      return NextResponse.json(
        { ok: false, error: "No hay filas seleccionadas para aplicar." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      yaAplicada: false,
      modoPrecioVenta,
      proveedor: importacion.proveedor?.nombre ?? null,
      archivo: importacion.archivoNombre,
      resumen: salida.resumen,
      detalle: salida.detalle,
    });
  } catch (e) {
    console.error("[listas/aplicar] error:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo aplicar la lista. No se modificó ningún costo." },
      { status: 500 }
    );
  }
}

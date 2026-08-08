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
import { ESTADO_IMPORTACION, esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
import { CONFIG_ARCOR } from "@/lib/proveedores/listas/configuraciones/arcor";
import { alertasDeFila, presentacionDe } from "@/lib/proveedores/listas/alertas";
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
// El macheo que deja una fila aplicada. Vive con las demás decisiones de
// vínculo, no acá: es la misma pregunta que resuelve la vinculación a mano.
import { vinculoAPersistirAlAplicar } from "@/lib/proveedores/listas/vinculacion";

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

/**
 * GET /api/proveedores/listas/[id]/aplicar
 *
 * El RESUMEN FINAL, antes de confirmar. No escribe nada.
 *
 * Los totales se calculan acá y no en la pantalla porque la pantalla ve una
 * página de 25 filas: sumar ahí daría el total de lo que se está mirando y lo
 * mostraría como si fuera el definitivo, que es la peor clase de número
 * equivocado —el que parece correcto—.
 *
 * Revalida cada fila igual que la aplicación real, así que la cantidad que
 * informa es la que se va a aplicar de verdad, no la que está marcada.
 */
export async function GET(req, context) {
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
    const { grupoId, localId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, estado: true, recargoPct: true, localOperativoId: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const filas = await prisma.importacionListaFila.findMany({
      where: { importacionId, seleccionada: true, aplicada: false },
      orderBy: { filaExcel: "asc" },
    });

    const baseIds = [...new Set(filas.map((f) => f.productoBaseId).filter((x) => x !== null))];
    const productos = baseIds.length
      ? await prisma.productoBase.findMany({
          where: { id: { in: baseIds }, grupoId },
          select: {
            id: true, nombre: true, precio_costo: true, precio_venta: true, margen: true,
            redondeo_100: true, es_combo: true, creadoEnLocalId: true,
            unidad_medida: true, factor_pack: true, modoCompraProveedor: true,
            pesoReferenciaKg: true,
          },
        })
      : [];
    const porId = new Map(productos.map((p) => [p.id, p]));

    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const contexto = { operandoEnLocalId: Number(localId), depositoLocalId };
    const recargoPct = Number(importacion.recargoPct);

    let cantidad = 0;
    let costoTotalAnterior = 0;
    let costoTotalNuevo = 0;
    let conAlerta = 0;
    let noAplicables = 0;

    for (const f of filas) {
      const base = f.productoBaseId === null ? null : porId.get(f.productoBaseId) ?? null;
      const v = revalidarFila({ fila: f, base, contexto, config: CONFIG_ARCOR, recargoPct });
      if (!v.aplicable) {
        noAplicables++;
        continue;
      }
      cantidad++;
      costoTotalAnterior += Number(v.costoActual ?? 0);
      costoTotalNuevo += Number(v.costoNuevo ?? 0);

      const presentacionConciliada = presentacionDe({
        unidadMedida: base.unidad_medida,
        factorPack: f.factorErp,
      });
      if (alertasDeFila({ ...f, presentacionConciliada }, base).length > 0) conAlerta++;
    }

    const variacionPct =
      costoTotalAnterior > 0 ? (costoTotalNuevo / costoTotalAnterior - 1) * 100 : 0;

    return NextResponse.json({
      ok: true,
      cantidad,
      seleccionadas: filas.length,
      // Seleccionadas que la revalidación descartaría. Si es > 0, el usuario
      // marcó filas que ya no se pueden aplicar y conviene que lo sepa antes.
      noAplicables,
      costoTotalAnterior: Math.round(costoTotalAnterior * 100) / 100,
      costoTotalNuevo: Math.round(costoTotalNuevo * 100) / 100,
      variacionPct,
      conAlerta,
    });
  } catch (e) {
    console.error("[listas/aplicar/previo] error:", e);
    return NextResponse.json({ ok: false, error: "No se pudo calcular el resumen." }, { status: 500 });
  }
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

    if (!esImportacionAbierta(importacion.estado)) {
      return NextResponse.json(
        { ok: false, error: "La importación está cerrada: no se pueden aplicar más filas." },
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
      if (!esImportacionAbierta(cab.estado)) {
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

      // ── Los vínculos que deja esta tanda ──────────────────────────────
      //
      // Se juntan acá y se insertan de una sola vez al final de la transacción.
      // Ver la nota larga más abajo, en el insert.
      const vinculosNuevos = new Map();

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
            // Deja de estar seleccionada: una fila cerrada marcada para aplicar
            // es una contradicción, y ensucia los contadores de la tanda
            // siguiente.
            seleccionada: false,
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

        // ── El macheo aprendido ────────────────────────────────────────
        //
        // Recién acá, con el costo ya escrito en ESTE producto desde ESTA fila.
        // Es la evidencia de que el vínculo sirvió para actuar; un macheo por
        // sufijo que nadie aplicó sigue siendo una suposición y no se guarda.
        const aprendido = vinculoAPersistirAlAplicar(fila);
        if (aprendido.persistir) {
          // La clave del índice único. Si dos filas de la misma tanda traen el
          // mismo código, queda una sola: insertar las dos haría que el propio
          // INSERT chocara consigo mismo.
          vinculosNuevos.set(aprendido.codigoInterno, {
            grupoId,
            proveedorId: importacion.proveedorId,
            productoBaseId: base.id,
            codigoInterno: aprendido.codigoInterno,
            descripcionProveedor: fila.descripcionProveedor ?? null,
            activo: true,
          });
        }

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

      // ── Los vínculos aprendidos, en un solo insert ─────────────────────
      //
      // `skipDuplicates` es lo que hace esto SEGURO, y no solo idempotente. Se
      // traduce a un ON CONFLICT DO NOTHING sobre el índice único
      // (grupoId, proveedorId, codigoInterno), así que:
      //
      //   · si el vínculo ya existe igual, no pasa nada;
      //   · si el código ya está vinculado a OTRO producto, NO se repunta. Ese
      //     conflicto es una decisión de una persona —la ruta de vincular a mano
      //     lo devuelve para que alguien lo mire— y aplicar una tanda no puede
      //     resolverlo en silencio;
      //   · si el vínculo existe pero está INACTIVO, no se resucita. Alguien lo
      //     dio de baja a propósito y un lote no revierte esa decisión.
      //
      // Un `create` con try/catch no serviría: en Postgres el error de unicidad
      // aborta la transacción entera, y se caerían los costos ya escritos.
      let vinculosGuardados = 0;
      if (vinculosNuevos.size > 0) {
        const r = await tx.productoCodigoProveedor.createMany({
          data: [...vinculosNuevos.values()],
          skipDuplicates: true,
        });
        vinculosGuardados = r.count;
      }

      const resumen = resumirAplicacion(detalle);

      // ── El estado final depende de lo que QUEDE ────────────────────────
      //
      // Antes se ponía APLICADA siempre, y eso cerraba la importación entera
      // aunque quedaran ochocientas filas por revisar: no se podía vincular,
      // ni seleccionar, ni aplicar una segunda tanda. Aplicar una tanda no es
      // terminar el trabajo.
      //
      // Pendiente = fila no aplicada, no excluida a mano y en un estado que
      // todavía admite una decisión. Una fila SIN_CAMBIOS o con ERROR no está
      // pendiente: no hay nada que decidir sobre ella.
      const pendientes = await tx.importacionListaFila.count({
        where: {
          importacionId,
          aplicada: false,
          excluidaManual: false,
          estado: { in: ["LISTO_PARA_ACTUALIZAR", "NO_MACHEADO", "FACTOR_DUDOSO", "CODIGO_DUPLICADO"] },
        },
      });

      // Los contadores ACUMULAN entre tandas: son el total de la importación,
      // no el de la última corrida.
      const yaAplicadas = await tx.importacionListaFila.count({
        where: { importacionId, aplicada: true },
      });
      const yaOmitidas = await tx.importacionListaFila.count({
        where: { importacionId, resultadoAplicacion: "OMITIDA" },
      });

      await tx.importacionListaProveedor.update({
        where: { id: importacionId },
        data: {
          estado: pendientes > 0
            ? ESTADO_IMPORTACION.PARCIALMENTE_APLICADA
            : ESTADO_IMPORTACION.APLICADA,
          aplicadaEn: ahora,
          aplicadaPorUsuarioId: usuarioId,
          modoPrecioVenta,
          aplicadas: yaAplicadas,
          omitidas: yaOmitidas,
        },
      });

      return { resumen, detalle, pendientes, vinculosGuardados };
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
      // Cuántos macheos quedaron aprendidos para la próxima lista del proveedor.
      vinculosGuardados: salida.vinculosGuardados ?? 0,
      detalle: salida.detalle,
      pendientes: salida.pendientes,
      // Si quedan pendientes, la importación NO terminó. La pantalla lo usa
      // para no decir "listo" cuando falta trabajo.
      finalizada: salida.pendientes === 0,
    });
  } catch (e) {
    console.error("[listas/aplicar] error:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo aplicar la lista. No se modificó ningún costo." },
      { status: 500 }
    );
  }
}

// GET /api/proveedores/listas/[id]
//
// Una importación: cabecera, resumen y filas PAGINADAS.
//
// Las 917 filas no se devuelven nunca de una. El grupo va en el WHERE junto al
// id, así que una importación de otro grupo no existe para esta consulta: da 404
// y no revela que existe.
//
// CADA FILA VIENE COMPLETA PARA PODER DECIDIR
//
// La pantalla de revisión compara lo que dice el archivo contra lo que tiene el
// ERP, producto por producto, antes de mover un costo. Para eso la fila trae los
// dos lados: el dato del proveedor tal como vino y el del producto VIVO —código
// de barras, presentación, factor, costo y venta actuales— más el costo y la
// venta que quedarían si se aplicara.
//
// Las alertas se calculan ACÁ y no en el navegador. Si las calculara la pantalla,
// el filtro "con alerta" tendría que traerse las 917 filas para poder contar, y
// dos clientes con versiones distintas mostrarían alertas distintas sobre los
// mismos datos.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resumirSeleccion } from "@/lib/proveedores/listas/seleccion";
import {
  textoOmision,
  ventaParaModo,
  MODO_PRECIO_VENTA,
} from "@/lib/proveedores/listas/aplicacion";
import { alertasDeFila, presentacionDe } from "@/lib/proveedores/listas/alertas";
import {
  TIPO_COINCIDENCIA,
  indexarCodigosProveedor,
  macheePorCodigo,
} from "@/lib/proveedores/listas/conciliarLista";
import { resumirMacheo, resumirProgreso } from "@/lib/proveedores/listas/macheo";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { paginacion, LIMITES } from "@/lib/proveedores/listas/persistencia";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Las vistas de la pantalla de revisión.
 *
 * Casi todas se resuelven en el WHERE. "alerta" no: las alertas dependen de
 * comparar la fila con el producto vivo, así que esa vista trae todo, calcula y
 * recién ahí pagina. Son 917 filas, no dos millones.
 */
const VISTAS = {
  todas: {},
  // Las vistas de TRABAJO excluyen lo ya aplicado. Sin esto, "Listas" mostraba
  // las 101 filas que ya se habían aplicado —su estado sigue siendo
  // LISTO_PARA_ACTUALIZAR— todas con la casilla deshabilitada, y la pantalla
  // parecía de solo lectura aunque la importación estuviera abierta.
  seleccionadas: { seleccionada: true, aplicada: false },
  listas: { estado: "LISTO_PARA_ACTUALIZAR", aplicada: false },
  // Para poder ver las aplicadas cuando se las busca a propósito.
  aplicadas: { aplicada: true },
  exactas: { tipoCoincidencia: "CODIGO_INTERNO" },
  sinCeros: { tipoCoincidencia: "CODIGO_INTERNO_SIN_CEROS" },
  sufijo8: { tipoCoincidencia: "SUFIJO_8" },
  sufijo7: { tipoCoincidencia: "SUFIJO_7" },
  sufijo6: { tipoCoincidencia: "SUFIJO_6" },
  sufijo5: { tipoCoincidencia: "SUFIJO_5" },
  sufijo4: { tipoCoincidencia: "SUFIJO_4" },
  manuales: { vinculadoPorUsuarioId: { not: null } },
  codigoBarra: { tipoCoincidencia: "CODIGO_BARRA" },
  factorDudoso: { estado: "FACTOR_DUDOSO" },
  sinVincular: { estado: "NO_MACHEADO" },
  ambiguas: { estado: "CODIGO_DUPLICADO" },
  excluidas: { excluidaManual: true },
  alerta: null, // se calcula en memoria
};

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
    const { grupoId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId) || importacionId <= 0) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    // grupoId en el WHERE, no en una validación posterior.
    const cabecera = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true, estado: true, archivoNombre: true, archivoTamano: true,
        archivoHash: true, archivoUbicacion: true, parser: true, parserVersion: true,
        recargoPct: true, umbralVariacionPct: true, modoPrecioVenta: true,
        localOperativoId: true, createdAt: true, conciliadaEn: true, aplicadaEn: true,
        totalFilas: true, listoParaActualizar: true, sinCambios: true, noMacheadas: true,
        codigoDuplicado: true, factorDudoso: true, excluidas: true, bloqueadas: true,
        errores: true, sugerenciasCodigoBarras: true, variacionAlta: true, faltantes: true,
        aplicadas: true, omitidas: true, aplicadaPorUsuarioId: true,
        proveedor: { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
    if (!cabecera) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const url = new URL(req.url);
    const { page, pageSize, skip, take } = paginacion({
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    });

    const where = { importacionId };

    const estado = url.searchParams.get("estado");
    if (estado) {
      if (!Object.prototype.hasOwnProperty.call(ESTADO_LINEA, estado)) {
        return NextResponse.json({ ok: false, error: "Estado inválido." }, { status: 400 });
      }
      where.estado = estado;
    }

    // Vista de la pantalla de revisión.
    const vista = url.searchParams.get("vista") ?? "todas";
    if (!Object.prototype.hasOwnProperty.call(VISTAS, vista)) {
      return NextResponse.json({ ok: false, error: "Vista inválida." }, { status: 400 });
    }
    const enMemoria = vista === "alerta";
    if (!enMemoria) Object.assign(where, VISTAS[vista]);

    // Búsqueda por código o por descripción. `insensitive` para que el cajero no
    // tenga que acordarse de cómo lo escribió el proveedor.
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q) {
      where.OR = [
        { codigoNormalizado: { contains: q.toUpperCase() } },
        { codigoCrudo: { contains: q, mode: "insensitive" } },
        { descripcionProveedor: { contains: q, mode: "insensitive" } },
      ];
    }

    // Con la vista "alerta" no se puede paginar en SQL: hay que calcular primero.
    const paginado = enMemoria ? {} : { skip, take };

    const [totalSql, filas] = await Promise.all([
      prisma.importacionListaFila.count({ where }),
      prisma.importacionListaFila.findMany({
        where,
        // Por fila del Excel: es el orden en el que el usuario ve el archivo.
        orderBy: { filaExcel: "asc" },
        ...paginado,
        select: {
          id: true, filaExcel: true, hojaNombre: true,
          codigoCrudo: true, codigoNormalizado: true, codigoBarraProveedor: true,
          descripcionProveedor: true, categoriaCruda: true,
          unidadProveedor: true, unidadesPorBulto: true,
          precioConIva: true, precioSinIva: true,
          productoBaseId: true, tipoCoincidencia: true, sufijoDigitos: true,
          sugerenciaProductoBaseId: true, sugerenciaCodigoBarra: true,
          costoAnterior: true, recargoPct: true, montoRecargo: true, precioConRecargo: true,
          factorErp: true, costoUnitarioCalculado: true, costoMaestroPropuesto: true,
          diferencia: true, diferenciaPct: true, variacionAlta: true,
          estado: true, motivo: true, seleccionable: true, seleccionada: true,
          aplicada: true, costoAplicado: true,
          resultadoAplicacion: true, motivoAplicacion: true,
          costoPrevioAplicacion: true, ventaAnterior: true, ventaNueva: true,
          excluidaManual: true,
          // El producto VIVO. Es la mitad de la comparación que el usuario
          // necesita para decidir, y tiene que salir de la base ahora, no de lo
          // que se congeló al conciliar.
          productoBase: {
            select: {
              id: true, nombre: true, codigo_barra: true, codigo_barra_secundario: true,
              unidad_medida: true, factor_pack: true, precio_costo: true,
              precio_venta: true, margen: true, redondeo_100: true,
              modoCompraProveedor: true, es_combo: true,
            },
          },
        },
      }),
    ]);

    const filasParaResumen = await prisma.importacionListaFila.findMany({
      where: { importacionId },
      select: {
        id: true, estado: true, aplicada: true, seleccionada: true,
        productoBaseId: true, costoMaestroPropuesto: true, excluidaManual: true,
      },
    });
    const resumenSeleccion = resumirSeleccion(filasParaResumen, cabecera);

    // ── El macheo, contado sobre TODA la importación ─────────────────────
    //
    // Sobre todas las filas y no sobre la página: el punto de esta sección es
    // decir cómo se macheó el archivo entero. Se piden solo las tres columnas
    // que deciden el grupo, no la fila completa.
    const filasParaMacheo = await prisma.importacionListaFila.findMany({
      where: { importacionId },
      select: { tipoCoincidencia: true, productoBaseId: true, vinculadoPorUsuarioId: true },
    });

    // El universo del ERP: productos con este proveedor asociado en alguna de
    // sus tres relaciones. Es un número del CATÁLOGO, no del archivo, y por eso
    // se informa aparte.
    const productosDelProveedor = await prisma.productoBase.count({
      where: { grupoId, ...productoDelProveedorWhere(cabecera.proveedor.id) },
    });

    const macheo = resumirMacheo(filasParaMacheo, { productosDelProveedor });

    // Progreso por tandas: cuántas ya se aplicaron y cuántas siguen pendientes
    // de decisión. Es lo que permite aplicar en varias veces sin que la pantalla
    // diga que terminó cuando falta trabajo.
    const progreso = resumirProgreso(filasParaResumen);

    // ── Códigos internos del proveedor, para mostrarlos al lado del producto ──
    const baseIds = [...new Set(filas.map((f) => f.productoBaseId).filter((x) => x !== null))];
    const vinculos = baseIds.length
      ? await prisma.productoCodigoProveedor.findMany({
          where: {
            grupoId, proveedorId: cabecera.proveedor.id,
            productoBaseId: { in: baseIds }, activo: true,
          },
          select: { productoBaseId: true, codigoInterno: true },
        })
      : [];
    const codigosPorBase = new Map();
    for (const v of vinculos) {
      if (!codigosPorBase.has(v.productoBaseId)) codigosPorBase.set(v.productoBaseId, []);
      codigosPorBase.get(v.productoBaseId).push(v.codigoInterno);
    }

    // ── Códigos de barras propios de la ubicación que operó ──────────────────
    const propios = baseIds.length
      ? await prisma.productoLocal.findMany({
          where: { localId: cabecera.localOperativoId, baseId: { in: baseIds }, codigo_barra_propio: { not: null } },
          select: { baseId: true, codigo_barra_propio: true },
        })
      : [];
    const propiosPorBase = new Map(propios.map((p) => [p.baseId, p.codigo_barra_propio]));

    // ── Candidatos de las filas AMBIGUAS ─────────────────────────────────
    //
    // Se calculan en vivo y no se guardan: son pocas filas y la alternativa era
    // una columna nueva para un dato derivable. Mostrarlos todos es el punto:
    // una fila ambigua es ambigua justamente porque hay más de un producto
    // posible, y esconderlos daría la impresión de que el sistema eligió.
    const hayAmbiguas = filas.some((f) => f.tipoCoincidencia === TIPO_COINCIDENCIA.AMBIGUA);
    let candidatosPorFila = new Map();
    if (hayAmbiguas) {
      const vinculosTodos = await prisma.productoCodigoProveedor.findMany({
        where: { grupoId, proveedorId: cabecera.proveedor.id, activo: true },
        select: { id: true, productoBaseId: true, codigoInterno: true, activo: true },
      });
      const indice = indexarCodigosProveedor(vinculosTodos);
      const idsCandidatos = new Set();
      const porFila = new Map();
      for (const f of filas) {
        if (f.tipoCoincidencia !== TIPO_COINCIDENCIA.AMBIGUA) continue;
        const r = macheePorCodigo(indice, f);
        const cands = (r.candidatos ?? []).map((c) => ({
          productoBaseId: c.productoBaseId,
          codigoInterno: c.codigoInterno,
        }));
        porFila.set(f.id, { candidatos: cands, sufijoDigitos: r.sufijoDigitos ?? null });
        for (const c of cands) idsCandidatos.add(c.productoBaseId);
      }
      const nombres = idsCandidatos.size
        ? await prisma.productoBase.findMany({
            where: { id: { in: [...idsCandidatos] } },
            select: { id: true, nombre: true, precio_costo: true },
          })
        : [];
      const nombrePorId = new Map(nombres.map((x) => [x.id, x]));
      for (const [filaId, v] of porFila) {
        candidatosPorFila.set(filaId, {
          sufijoDigitos: v.sufijoDigitos,
          candidatos: v.candidatos.map((c) => ({
            ...c,
            nombre: nombrePorId.get(c.productoBaseId)?.nombre ?? null,
            costoActual: nombrePorId.get(c.productoBaseId)?.precio_costo == null
              ? null
              : Number(nombrePorId.get(c.productoBaseId).precio_costo),
          })),
        });
      }
    }

    const modoVenta = MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN;

    const enriquecer = (f) => {
      const b = f.productoBase;
      const presentacionActual = b
        ? presentacionDe({ unidadMedida: b.unidad_medida, factorPack: b.factor_pack })
        : null;

      // La presentación con la que se CONCILIÓ, reconstruida del factor guardado.
      // Sirve para detectar que el producto cambió de escala después.
      const presentacionConciliada = b
        ? presentacionDe({ unidadMedida: b.unidad_medida, factorPack: f.factorErp })
        : null;

      const alertas = alertasDeFila({ ...f, presentacionConciliada }, b);

      // Qué precio de venta quedaría. Es una PROYECCIÓN: no se guarda ni se
      // aplica, se muestra para que el usuario vea el efecto completo antes de
      // decidir. Con el modo "mantener" el endpoint no la toca.
      const costoNuevo = numero(f.costoMaestroPropuesto);
      const proyeccion = b && costoNuevo !== null
        ? ventaParaModo({
            modo: modoVenta,
            costo: costoNuevo,
            margenConfigurado: b.margen,
            redondeo100: b.redondeo_100 === true,
          })
        : { aplica: false, precioFinal: null };

      return {
        ...f,
        precioConIva: numero(f.precioConIva),
        precioSinIva: numero(f.precioSinIva),
        costoAnterior: numero(f.costoAnterior),
        recargoPct: numero(f.recargoPct),
        montoRecargo: numero(f.montoRecargo),
        precioConRecargo: numero(f.precioConRecargo),
        costoUnitarioCalculado: numero(f.costoUnitarioCalculado),
        costoMaestroPropuesto: costoNuevo,
        diferencia: numero(f.diferencia),
        diferenciaPct: numero(f.diferenciaPct),
        costoAplicado: numero(f.costoAplicado),
        costoPrevioAplicacion: numero(f.costoPrevioAplicacion),
        ventaAnterior: numero(f.ventaAnterior),
        ventaNueva: numero(f.ventaNueva),
        textoMotivoAplicacion: f.motivoAplicacion ? textoOmision(f.motivoAplicacion) : null,

        // ── El lado del ERP, tal como está AHORA ──────────────────────────
        erp: b
          ? {
              id: b.id,
              nombre: b.nombre,
              codigosArcor: codigosPorBase.get(b.id) ?? [],
              codigoBarra: b.codigo_barra,
              codigoBarraSecundario: b.codigo_barra_secundario,
              codigoBarraPropio: propiosPorBase.get(b.id) ?? null,
              presentacion: presentacionActual,
              unidadMedida: b.unidad_medida,
              factorPack: b.factor_pack,
              costoActual: numero(b.precio_costo),
              ventaActual: numero(b.precio_venta),
              margen: numero(b.margen),
              redondeo100: b.redondeo_100 === true,
              esCombo: b.es_combo === true,
            }
          : null,
        // Lo que quedaría si se aplicara. Proyección, no promesa.
        costoNuevo,
        ventaNuevaProyectada: proyeccion.aplica ? proyeccion.precioFinal : (b ? numero(b.precio_venta) : null),
        ventaSeRecalcula: proyeccion.aplica,
        alertas,
        tieneAlerta: alertas.length > 0,
        // Solo en las ambiguas. Se muestran TODOS: elegir uno en silencio es
        // exactamente lo que el motor se niega a hacer.
        candidatos: candidatosPorFila.get(f.id)?.candidatos ?? null,
        candidatosSufijoDigitos: candidatosPorFila.get(f.id)?.sufijoDigitos ?? null,
      };
    };

    let filasSalida = filas.map(enriquecer);
    let total = totalSql;

    // La vista "alerta" filtra después de calcular, y recién ahí pagina.
    if (enMemoria) {
      filasSalida = filasSalida.filter((f) => f.tieneAlerta);
      total = filasSalida.length;
      filasSalida = filasSalida.slice(skip, skip + take);
    }

    return NextResponse.json({
      ok: true,
      importacion: {
        ...cabecera,
        recargoPct: numero(cabecera.recargoPct),
        umbralVariacionPct: numero(cabecera.umbralVariacionPct),
      },
      filas: filasSalida,
      vista,
      macheo,
      // El contador tiene que hablar de la importación entera: el usuario
      // selecciona en varias páginas y necesita saber cuántas lleva en total,
      // no cuántas hay marcadas en las 50 que está mirando.
      seleccion: resumenSeleccion,
      progreso,
      paginacion: {
        page,
        pageSize,
        total,
        paginas: Math.max(1, Math.ceil(total / pageSize)),
        pageSizeMax: LIMITES.pageSizeMax,
      },
    });
  } catch (error) {
    console.error("Error leyendo importación de lista:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// GET /api/proveedores/listas/[id]/catalogo
//
// EL CATÁLOGO DEL PROVEEDOR visto desde esta importación: pagina PRODUCTOS, no
// filas del archivo.
//
// ── POR QUÉ UN ENDPOINT NUEVO Y NO UN MODO DEL QUE YA ESTÁ ──────────────────
//
// `[id]/route.js` pagina `ImportacionListaFila` y lo consume la pantalla que
// está en producción. Meterle un modo "por producto" lo obligaría a devolver dos
// formas distintas de respuesta según un parámetro, y cualquier error de esa
// rama rompería la pantalla que hoy funciona.
//
// Éste vive aparte y nadie lo consume todavía: se puede medir y equivocar sin
// tocar nada. Cuando la pantalla nueva esté, el viejo se retira.
//
// ── QUÉ DEVUELVE ───────────────────────────────────────────────────────────
//
// Una página de productos del universo del proveedor, cada uno con su grupo y
// con las filas del archivo que le correspondan —ninguna, una o varias—. Más los
// contadores de TODOS los grupos, que no dependen de la página: el usuario
// necesita saber cuántos hay en cada situación mientras mira los 25 de la
// primera.
//
// Los contadores incluyen la verificación de cobertura. Si los grupos no suman
// el universo, se dice: un resumen que no cierra esconde productos que nadie
// mira.
//
// NO ESCRIBE NADA.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { paginacion, LIMITES } from "@/lib/proveedores/listas/persistencia";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { candidatosParaProducto } from "@/lib/proveedores/listas/candidatosSinCodigo";
import { rangoDeLaFila } from "@/lib/proveedores/listas/vigenciaConfirmacion";
import { filtroDeLaCola, esDeLaCola } from "@/lib/proveedores/listas/panelDecision";
import {
  GRUPO_PRODUCTO,
  TEXTO_GRUPO,
  DETALLE_GRUPO,
  TONO_GRUPO,
  grupoDeProducto,
  whereDelGrupo,
  coberturaDeGrupos,
} from "@/lib/proveedores/listas/gruposProducto";

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/** Además de los grupos, se admite ver el universo entero. */
const TODOS = "TODOS";

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

    // El grupo va en el WHERE junto al id: una importación de otro grupo no
    // existe para esta consulta.
    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true, estado: true, proveedorId: true, recargoPct: true,
        aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const url = new URL(req.url);
    const grupoPedido = url.searchParams.get("grupo") ?? TODOS;
    const grupoValido =
      grupoPedido === TODOS || Object.prototype.hasOwnProperty.call(GRUPO_PRODUCTO, grupoPedido);
    if (!grupoValido) {
      return NextResponse.json({ ok: false, error: "Grupo inválido." }, { status: 400 });
    }

    const { page, pageSize, skip, take } = paginacion({
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    });

    const universoWhere = { grupoId, ...productoDelProveedorWhere(importacion.proveedorId) };
    const filtroCola = filtroDeLaCola(prisma.importacionListaFila.fields.vinculadoEn);
    const argsGrupo = { universoWhere, importacionId, proveedorId: importacion.proveedorId, filtroCola };

    // ── Los contadores de TODOS los grupos ───────────────────────────────
    //
    // No dependen de la página ni del grupo que se esté mirando: son las cards
    // de arriba, y tienen que estar bien aunque el usuario esté en la página 7.
    const claves = Object.values(GRUPO_PRODUCTO);
    const [universoTotal, ...conteos] = await Promise.all([
      prisma.productoBase.count({ where: universoWhere }),
      ...claves.map((g) => prisma.productoBase.count({ where: whereDelGrupo(g, argsGrupo) })),
    ]);
    const porGrupo = Object.fromEntries(claves.map((g, i) => [g, conteos[i]]));
    const cobertura = coberturaDeGrupos({ universo: universoTotal, porGrupo });

    // ── La página ────────────────────────────────────────────────────────
    const where = grupoPedido === TODOS ? { ...universoWhere } : whereDelGrupo(grupoPedido, argsGrupo);

    const q = (url.searchParams.get("q") ?? "").trim();
    if (q) {
      where.AND = [
        {
          OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { codigo_barra: { contains: q } },
          ],
        },
      ];
    }

    const [total, productos] = await Promise.all([
      prisma.productoBase.count({ where }),
      prisma.productoBase.findMany({
        where,
        orderBy: { nombre: "asc" },
        skip,
        take,
        select: {
          id: true, nombre: true, sku: true, codigo_barra: true, codigo_barra_secundario: true,
          precio_costo: true, precio_venta: true, updatedAt: true,
          unidad_medida: true, factor_pack: true, modoCompraProveedor: true, es_combo: true,
        },
      }),
    ]);

    // ── Lo que cuelga de cada producto ───────────────────────────────────
    //
    // Dos consultas acotadas a los ids de la página, no una por producto.
    const ids = productos.map((p) => p.id);
    const [filas, codigos] = await Promise.all([
      ids.length
        ? prisma.importacionListaFila.findMany({
            where: { importacionId, productoBaseId: { in: ids } },
            orderBy: { filaExcel: "asc" },
            select: {
              id: true, filaExcel: true, codigoCrudo: true, codigoNormalizado: true,
              descripcionProveedor: true, unidadProveedor: true, unidadesPorBulto: true,
              precioConIva: true, recargoPct: true, productoBaseId: true,
              estado: true, motivo: true, tipoCoincidencia: true, resultadoInterpretacion: true,
              aplicada: true, excluidaManual: true, seleccionada: true,
              costoAnterior: true, costoMaestroPropuesto: true, costoAplicado: true,
              aplicadaEn: true, confirmadoEn: true, vinculadoEn: true,
              aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true,
            },
          })
        : [],
      ids.length
        ? prisma.productoCodigoProveedor.findMany({
            where: { grupoId, proveedorId: importacion.proveedorId, productoBaseId: { in: ids } },
            select: { productoBaseId: true, codigoInterno: true, activo: true, origenAlta: true },
          })
        : [],
    ]);

    // ── Candidatos de los productos SIN CÓDIGO ───────────────────────────
    //
    // Se calculan ACÁ y no en el navegador. Las señales se miden contra las 626
    // filas que no machearon con nada, y mandarlas al cliente para que las
    // recorra sería un megabyte por página para terminar mostrando cinco
    // tarjetas. El módulo es el mismo que prueban los candados.
    const rango = rangoDeLaFila({}, importacion);
    const recargoPct = numero(importacion.recargoPct);
    const candidatosPorProducto = new Map();

    const filasPorProducto = new Map();
    for (const f of filas) {
      if (!filasPorProducto.has(f.productoBaseId)) filasPorProducto.set(f.productoBaseId, []);
      filasPorProducto.get(f.productoBaseId).push(f);
    }
    const codigosPorProducto = new Map();
    for (const c of codigos) {
      if (!codigosPorProducto.has(c.productoBaseId)) codigosPorProducto.set(c.productoBaseId, []);
      codigosPorProducto.get(c.productoBaseId).push(c);
    }

    // El grupo de cada producto se recalcula con el MISMO predicado que armó los
    // contadores, sobre los hechos de esta página. Si difiriera del `where` que
    // lo trajo, el candado de equivalencia estaría roto y hay que verlo.
    const conGrupo = productos.map((p) => {
      const suyas = filasPorProducto.get(p.id) ?? [];
      const suyosCodigos = codigosPorProducto.get(p.id) ?? [];
      return {
        p,
        suyas,
        suyosCodigos,
        grupo: grupoDeProducto({
          tieneFilaAplicada: suyas.some((f) => f.aplicada === true),
          tieneFilaEnCola: suyas.some((f) => esDeLaCola(f)),
          tieneFila: suyas.length > 0,
          tieneCodigoActivo: suyosCodigos.some((c) => c.activo === true),
          tieneCodigoDadoDeBaja: suyosCodigos.some((c) => c.activo === false),
        }),
      };
    });

    // Las filas sin machear se traen UNA vez, y solo si hay algún producto que
    // las necesite. En una página de actualizados no se consulta nada.
    const necesitanCandidatos = conGrupo.filter((x) => x.grupo === GRUPO_PRODUCTO.SIN_CODIGO);
    if (necesitanCandidatos.length > 0) {
      const filasSinMachear = await prisma.importacionListaFila.findMany({
        where: { importacionId, productoBaseId: null },
        select: {
          id: true, filaExcel: true, codigoCrudo: true, codigoNormalizado: true,
          descripcionProveedor: true, unidadProveedor: true, unidadesPorBulto: true,
          precioConIva: true, recargoPct: true,
        },
      });
      const normalizadas = filasSinMachear.map((f) => ({
        ...f,
        precioConIva: numero(f.precioConIva),
        recargoPct: numero(f.recargoPct),
      }));
      for (const x of necesitanCandidatos) {
        candidatosPorProducto.set(
          x.p.id,
          candidatosParaProducto({
            producto: {
              nombre: x.p.nombre,
              precio_costo: numero(x.p.precio_costo),
              unidad_medida: x.p.unidad_medida,
              factor_pack: x.p.factor_pack,
              modoCompraProveedor: x.p.modoCompraProveedor,
            },
            filas: normalizadas,
            recargoPct,
            rango,
          })
        );
      }
    }

    const salida = conGrupo.map(({ p, suyas, suyosCodigos, grupo }) => {
      return {
        id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        codigoBarra: p.codigo_barra,
        codigoBarraSecundario: p.codigo_barra_secundario,
        costoActual: numero(p.precio_costo),
        ventaActual: numero(p.precio_venta),
        actualizadoEn: p.updatedAt,
        unidadMedida: p.unidad_medida,
        factorPack: p.factor_pack,
        modoCompraProveedor: p.modoCompraProveedor,
        esCombo: p.es_combo === true,
        grupo,
        // Solo en los sin código: las tarjetas de la tercera forma del panel.
        candidatos: candidatosPorProducto.get(p.id) ?? null,
        codigosProveedor: suyosCodigos.map((c) => ({
          codigo: c.codigoInterno,
          activo: c.activo,
          origenAlta: c.origenAlta,
        })),
        filas: suyas.map((f) => ({
          ...f,
          precioConIva: numero(f.precioConIva),
          recargoPct: numero(f.recargoPct),
          costoAnterior: numero(f.costoAnterior),
          costoMaestroPropuesto: numero(f.costoMaestroPropuesto),
          costoAplicado: numero(f.costoAplicado),
        })),
      };
    });

    return NextResponse.json({
      ok: true,
      importacion: {
        id: importacion.id,
        estado: importacion.estado,
        proveedor: importacion.proveedor,
        recargoPct: numero(importacion.recargoPct),
        aumentoEsperadoMinPct: numero(importacion.aumentoEsperadoMinPct),
        aumentoEsperadoMaxPct: numero(importacion.aumentoEsperadoMaxPct),
      },
      grupo: grupoPedido,
      productos: salida,
      grupos: claves.map((g) => ({
        clave: g,
        etiqueta: TEXTO_GRUPO[g],
        detalle: DETALLE_GRUPO[g],
        tono: TONO_GRUPO[g],
        valor: porGrupo[g],
      })),
      cobertura,
      paginacion: {
        page,
        pageSize,
        total,
        paginas: Math.max(1, Math.ceil(total / pageSize)),
        pageSizeMax: LIMITES.pageSizeMax,
      },
    });
  } catch (error) {
    console.error("Error leyendo el catálogo de la importación:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}


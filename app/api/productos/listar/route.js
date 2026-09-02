// app/api/productos/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { filtrosBaseDelCatalogo } from "@/lib/productos/whereCatalogo";
import { mergeBaseLocalToUi } from "@/lib/mappers/producto";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { evaluarEstructuraCombo } from "@/lib/combos/service";
import { ubicacionVendeAlCosto } from "@/lib/precios/ubicacionVendeAlCosto";
import { esControlValido } from "@/lib/productos/controlesCalidad";
import {
  filaMarcadaPor,
  filaMarcadaPorPresentacion,
} from "@/lib/productos/controlesDesdePrisma";
import {
  esPresentacionDeVenta,
  esPresentacionDeCompra,
} from "@/lib/productos/presentaciones";
import { traerFilasParaControles } from "@/lib/productos/sqlControles";

const PAGE_SIZES_VALIDOS = [25, 50, 100];

// El techo defensivo del filtro por control ESTABA ESCRITO ACÁ, con su gemelo en
// `/api/productos/controles`. Ahora vive en `controlesDesdePrisma` junto con el
// ORDEN con el que se corta, porque las dos consultas tienen que cortar por el
// mismo lugar y un número definido en dos archivos un día vale dos cosas.
const DEFAULT_PAGE_SIZE = 25;

// Whitelist de campos ordenables → mapping a Prisma orderBy
const SORT_FIELDS = {
  nombre: { nombre: "asc" },
  codigoBarra: { codigo_barra: "asc" },
  precioCosto: { precio_costo: "asc" },
  precioVenta: { precio_venta: "asc" },
  margen: { margen: "asc" },
  categoriaId: { categoria_id: "asc" },
  proveedorId: { proveedor_id: "asc" },
  activo: { activo: "asc" },
  createdAt: { createdAt: "asc" },
};

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { searchParams } = new URL(req.url);

    // Scope estricto por local. No-admin: SIEMPRE su local; un localId ajeno por
    // query → 403. Admin: puede indicar el local a ver (o su contexto activo).
    const qLocal = Number(searchParams.get("localId") || 0) || null;
    const scope = await resolveScope(req, { explicitLocalId: qLocal });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, ...(scope.needsContexto ? { needsContexto: true } : {}) },
        { status: scope.status }
      );
    }
    const { localId, grupoId } = scope;

    // ── ¿ESTA UBICACIÓN VENDE CON LISTA AL COSTO? ───────────────────────────
    //
    // UNA vez por pedido, no una por fila: es un predicado sobre la UBICACIÓN y
    // no sobre el producto. Cuesta entre 3 y 4 consultas por request.
    //
    // La pieza vive en `lib/precios/ubicacionVendeAlCosto.js` —con el porqué de
    // la degradación escrito ahí— y no inline acá, para que un candado pueda
    // ejercer el caso de error de verdad en vez de probar una copia.
    const { alCosto: vendeConListaAlCosto, redondea100: listaAlCostoRedondea100 } =
      await ubicacionVendeAlCosto({ prisma, grupoId, localId });

    // Paginación
    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const rawPageSize = Number(searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);
    const pageSize = PAGE_SIZES_VALIDOS.includes(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE;

    // Ordenamiento
    const sortKey = searchParams.get("sortKey") || "nombre";
    const rawSortDir = searchParams.get("sortDir");
    const sortDir = rawSortDir === "desc" ? "desc" : "asc";

    // Filtros
    const q = (searchParams.get("q") || "").trim();

    const categoriaId =
      searchParams.get("categoriaId") !== null
        ? Number(searchParams.get("categoriaId"))
        : null;

    const proveedorId =
      searchParams.get("proveedorId") !== null
        ? Number(searchParams.get("proveedorId"))
        : null;

    const areaFisicaId =
      searchParams.get("areaFisicaId") !== null
        ? Number(searchParams.get("areaFisicaId"))
        : null;

    // estado: activos (default) | inactivos | todos. Para no romper URLs
    // antiguas, también acepta el viejo `activo=true|false`.
    const estadoRaw = (searchParams.get("estado") || "").toLowerCase();
    const activoLegacy = searchParams.get("activo");
    let activoFilter;
    if (estadoRaw === "todos") {
      activoFilter = undefined;
    } else if (estadoRaw === "inactivos") {
      activoFilter = false;
    } else if (estadoRaw === "activos") {
      activoFilter = true;
    } else if (activoLegacy === "true") {
      activoFilter = true;
    } else if (activoLegacy === "false") {
      activoFilter = false;
    } else {
      // sin estado ni activo: default seguro = solo activos
      activoFilter = true;
    }

    const incompletos = searchParams.get("incompletos") === "true";

    // Filtro Tipo: todos (default) | productos | combos.
    const tipo = (searchParams.get("tipo") || "todos").toLowerCase();
    const tipoFilter =
      tipo === "combos" ? { es_combo: true } : tipo === "productos" ? { es_combo: false } : {};

    // WHERE — snake_case SOLO dentro de Prisma.
    // Filtros generales (sin proveedor): aplican siempre.
    const generalFilters = [
      // ── LAS TRES ESTRUCTURALES SALEN DE UN LUGAR SOLO ───────────────────
      //
      // Grupo, visibilidad depósito/local y la regla de combos. Estaban escritas
      // acá y ahora viven en `filtrosBaseDelCatalogo`, porque el contador de
      // "Para revisar" tiene que ver EXACTAMENTE el mismo universo: si el
      // contador mirara uno distinto, el número de la card no cerraría contra el
      // total de la lista que abre. Ya le faltaba la de combos.
      ...filtrosBaseDelCatalogo({ grupoId, localId }),
      // Filtro Tipo (Todos/Productos/Combos).
      tipoFilter,
      categoriaId ? { categoria_id: categoriaId } : {},
      areaFisicaId ? { area_fisica_id: areaFisicaId } : {},
      // Estado (activos/inactivos): un PRODUCTO normal lo lleva en ProductoBase.activo;
      // un COMBO lo lleva SOLO en su ProductoLocal.activo (la base del combo no cambia).
      // Por eso el filtro se ramifica por tipo para que "Estado" funcione con combos.
      activoFilter !== undefined
        ? {
            OR: [
              { es_combo: false, activo: activoFilter },
              { es_combo: true, locales: { some: { localId, activo: activoFilter } } },
            ],
          }
        : {},
      ...(incompletos
        ? [{
            OR: [
              { proveedor_id: null },
              { categoria_id: null },
              { area_fisica_id: null },
              { factor_pack: null },
            ],
          }]
        : []),
    ];

    // Filtro de proveedor (proveedor 1), igual que siempre.
    const proveedorFilter = proveedorId ? { proveedor_id: proveedorId } : {};

    // Busqueda: prioridad a match exacto por codigo_barra/codigo_barra_secundario/sku (alineado con POS).
    // El exact-vs-contains se evalúa dentro del alcance del proveedor (como hoy).
    let searchFilter = {};
    if (q) {
      // Código propio por ubicación: se matchea vía relación `locales.some` acotada
      // al localId activo (por-local). No reemplaza los globales de la base.
      const exactCount = await prisma.productoBase.count({
        where: {
          AND: [
            ...generalFilters,
            proveedorFilter,
            { OR: [
              { codigo_barra: { equals: q, mode: "insensitive" } },
              { codigo_barra_secundario: { equals: q, mode: "insensitive" } },
              { locales: { some: { localId, codigo_barra_propio: { equals: q, mode: "insensitive" } } } },
              { sku: { equals: q, mode: "insensitive" } },
            ] },
          ],
        },
      });

      searchFilter = exactCount > 0
        ? { OR: [
            { codigo_barra: { equals: q, mode: "insensitive" } },
            { codigo_barra_secundario: { equals: q, mode: "insensitive" } },
            { locales: { some: { localId, codigo_barra_propio: { equals: q, mode: "insensitive" } } } },
            { sku: { equals: q, mode: "insensitive" } },
          ] }
        : { OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { codigo_barra: { contains: q, mode: "insensitive" } },
            { codigo_barra_secundario: { contains: q, mode: "insensitive" } },
            { locales: { some: { localId, codigo_barra_propio: { contains: q, mode: "insensitive" } } } },
            { sku: { contains: q, mode: "insensitive" } },
          ] };
    }

    // Código interno por proveedor (Opción C): SOLO si hay proveedorId + q.
    // Trae ProductoBase vinculados a ese proveedor por codigoInterno EXACTO,
    // aunque no tengan proveedor_id = proveedorId.
    let baseIdsCodigo = [];
    if (q && proveedorId) {
      const matches = await prisma.productoCodigoProveedor.findMany({
        where: {
          grupoId,
          proveedorId,
          activo: true,
          codigoInterno: { equals: q, mode: "insensitive" },
        },
        select: { productoBaseId: true },
      });
      baseIdsCodigo = [...new Set(matches.map((m) => m.productoBaseId))];
    }

    // Opción C:
    //   (generales) AND ( (proveedor AND búsqueda) OR (id IN códigos internos) )
    // Sin q: solo aplica el filtro de proveedor (comportamiento actual, sin ampliar).
    let searchClause;
    if (q) {
      const proveedorYTexto = { AND: [proveedorFilter, searchFilter] };
      searchClause = baseIdsCodigo.length
        ? { OR: [proveedorYTexto, { id: { in: baseIdsCodigo } }] }
        : proveedorYTexto;
    } else {
      searchClause = proveedorFilter;
    }

    const where = { AND: [...generalFilters, searchClause] };

    // ── EL FILTRO POR CONTROL DE CALIDAD ────────────────────────────────────
    //
    // `?control=precio-vencido|sin-regla|sin-ganancia|escala-riesgo`. Tocar una
    // card de "Para revisar" trae exactamente los productos que componen ese
    // contador, y por eso el filtro NO es un `where` propio: usa la misma
    // clasificación que cuenta. Dos predicados distintos harían que la card diga
    // 47 sobre una lista de 45.
    //
    // POR QUÉ SE PAGINA EN MEMORIA CUANDO HAY CONTROL. Los cuatro dependen del
    // precio y el costo EFECTIVOS, que salen de mergear la ficha con el
    // `ProductoLocal` de la ubicación; Prisma no puede expresar eso en un
    // `where`. El issue lo decide así de frente: priorizar una sola semántica
    // antes que una consulta ingeniosa distinta a la lógica del ERP.
    //
    // El techo es el mismo criterio defensivo que usan los reportes: se trae
    // hasta `TECHO_CONTROL` y, si el catálogo lo supera, se avisa en vez de
    // mentir por lo bajo. El techo y el orden salen de `controlesDesdePrisma`,
    // compartidos con el contador de las cards.
    const controlPedido = searchParams.get("control") || null;
    const control = esControlValido(controlPedido) ? controlPedido : null;
    let truncadoPorControl = false;

    // ── Y EL FILTRO POR PRESENTACIÓN, CON EL MISMO MECANISMO ───────────────
    //
    // Dos parámetros y no uno, porque son dos preguntas independientes que se
    // combinan: `?presVenta=venta-pack&presCompra=compra-unidad` son "los que se
    // venden por pack" INTERSECTADO con "los que se compran por unidad". Un solo
    // parámetro con una lista obligaría a deducir a qué grupo pertenece cada
    // valor y a decidir qué hacer con dos del mismo grupo; así cada uno se valida
    // contra su grupo y no hay nada que deducir.
    //
    // La validación es por GRUPO y no solo por existencia: `?presVenta=compra-kg`
    // es un id válido en el grupo equivocado, y aceptarlo dejaría el listado
    // vacío en silencio —ninguna fila puede tener una presentación de compra como
    // presentación de venta—. Se descarta, que es lo mismo que hace `control` con
    // un id inventado.
    const presVenta = esPresentacionDeVenta(searchParams.get("presVenta"))
      ? searchParams.get("presVenta")
      : null;
    const presCompra = esPresentacionDeCompra(searchParams.get("presCompra"))
      ? searchParams.get("presCompra")
      : null;

    // La presentación de venta depende de la ubicación —un fiambre sale por pieza
    // en el depósito y por kilo en un local—, así que hay que saber dónde está
    // parado el que pregunta. UNA consulta por pedido, y solo cuando hay un filtro
    // de venta puesto: sin él, nadie la usa.
    let esDeposito = false;
    if (presVenta) {
      const local = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });
      esDeposito = local?.es_deposito === true;
    }

    // ── UNA SOLA PASADA PARA LOS TRES FILTROS QUE CLASIFICAN EN MEMORIA ────
    //
    // Control y presentaciones no pueden estar puestos a la vez —la pantalla
    // sostiene ese invariante y la URL se normaliza al entrar—, pero el servidor
    // no da eso por hecho: si llegaran los tres, se aplican los tres como una
    // intersección. Es la respuesta correcta en cualquier caso y no hay una
    // combinación que deje la ruta sin saber qué contestar.
    //
    // Lo que NO se hace es una consulta por filtro: se trae el universo una vez y
    // se le pregunta lo que haga falta. Con tres consultas, tres muestras
    // distintas por encima del techo.
    const predicados = [];
    if (control) predicados.push((p) => filaMarcadaPor(control, p));
    if (presVenta) predicados.push((p) => filaMarcadaPorPresentacion(presVenta, p, esDeposito));
    if (presCompra) predicados.push((p) => filaMarcadaPorPresentacion(presCompra, p, esDeposito));

    // Se resuelven los IDS marcados y se acotan con un `id: { in }` sobre el
    // mismo `where`. Así el conteo, el orden, la paginación, el map y el resto
    // del flujo siguen siendo los de siempre: el filtro agrega una condición,
    // no una segunda ruta paralela que después se desincroniza.
    if (predicados.length > 0) {
      // El techo, el orden y el corte salen de `traerFilasParaControles`, LA
      // MISMA función que usa el contador de las cards. Sin eso —dos consultas
      // escritas al lado— con más de 5.000 productos podían cortar por lugares
      // distintos: los dos números serían límites inferiores ciertos de muestras
      // diferentes, y la card diría "+37" sobre una lista de "+41" sin que
      // ninguno estuviera mal.
      const { filas: candidatos, truncado } = await traerFilasParaControles(prisma, {
        where,
        localId,
      });

      truncadoPorControl = truncado;
      const idsMarcados = candidatos
        .filter((p) => predicados.every((cumple) => cumple(p)))
        .map((p) => p.id);

      where.AND.push({ id: { in: idsMarcados } });
    }

    const total = await prisma.productoBase.count({ where });

    // Ordenamiento dinámico
    const sortMapping = SORT_FIELDS[sortKey];
    const prismaField = sortMapping ? Object.keys(sortMapping)[0] : "createdAt";
    const orderBy = { [prismaField]: sortDir };

    // Consulta principal
    const rows = await prisma.productoBase.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
      include: {
        categoria: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, nombre: true } },
        proveedor2: { select: { id: true, nombre: true } },
        proveedor3: { select: { id: true, nombre: true } },
        area_fisica: { select: { id: true, nombre: true } },
        locales: {
          where: { localId },
          take: 1,
          // ── LOS CUATRO ÚLTIMOS FALTABAN, Y EL LISTADO MENTÍA EN SILENCIO ──
          //
          // `mergeBaseLocalToUi` los LEE. Al no pedirlos, llegaban `undefined`,
          // caían al default del `??` y la fila salía con un valor inventado:
          // `reglaPrecio` siempre "MARGEN_PORCENTUAL" aunque en la base fuera
          // recargo fijo, y los otros tres siempre nulos.
          //
          // No rompía nada —por eso duró—: no hay error, no hay rojo, y la
          // pantalla dibuja. Lo que había era que la FICHA de un producto y su
          // FILA en el listado decían cosas distintas del mismo producto,
          // porque `obtener` trae el override sin `select` y ahí sí llegan.
          //
          // Medido contra producción: **1.137 de 10.614 filas** —el 10,7 %—
          // tenían al menos uno de los cuatro con un valor que no es el suyo.
          // Por campo: 231 de regla de precio, 231 de recargo fijo, 176 de
          // código propio y 961 de recargo de servicio.
          select: {
            id: true,
            localId: true,
            precio_costo: true,
            precio_venta: true,
            margen: true,
            activo: true,
            nombre: true,
            descripcion: true,
            reglaPrecio: true,
            recargoFijoUnidad: true,
            codigo_barra_propio: true,
            recargoServicioPct: true,
            // Última revisión del precio EN ESTA UBICACIÓN. Sin esta columna el
            // control "Precios +30 días" no puede filtrar, y el select acotado
            // devolvería `undefined` —que la clasificación leería como "sin
            // evidencia" y marcaría TODO el catálogo como vencido—.
            precioRevisadoAt: true,
          },
        },
        // Código interno por proveedor (distinto del código de barras).
        codigosProveedor: {
          where: { activo: true },
          select: { codigoInterno: true, proveedorId: true },
        },
      },
    });

    // MAP — limpiar snake_case del output final
    const items = rows.map((p) => {
      const override = p.locales?.[0] ?? null;
      const base = mergeBaseLocalToUi(p, override); // ya es camelCase

      return {
        ...base,

        // nombres de catálogo
        categoriaNombre: p.categoria?.nombre ?? null,
        proveedorNombre: p.proveedor?.nombre ?? null,
        proveedor2Nombre: p.proveedor2?.nombre ?? null,
        proveedor3Nombre: p.proveedor3?.nombre ?? null,
        areaFisicaNombre: p.area_fisica?.nombre ?? null,

        // IDs camelCase
        categoriaId: p.categoria?.id ?? null,
        proveedorId: p.proveedor?.id ?? null,
        proveedor2Id: p.proveedor2?.id ?? null,
        proveedor3Id: p.proveedor3?.id ?? null,
        areaFisicaId: p.area_fisica?.id ?? null,

        // codigo de barras uniforme
        codigoBarra: p.codigo_barra ?? null,

        // Código interno por proveedor (preferir el del proveedor principal;
        // si no, el primero activo disponible). NO es el código de barras.
        codigoInterno: (() => {
          const cods = p.codigosProveedor ?? [];
          if (cods.length === 0) return null;
          const principal = cods.find((c) => c.proveedorId === p.proveedor_id);
          return (principal ?? cods[0]).codigoInterno ?? null;
        })(),
      };
    });

    // Enriquecer combos de la página con su estado ESTRUCTURAL: un combo activo cuya
    // composición esté rota (componente inactivo/sin stock/cantidad inválida) se marca
    // "No disponible" (bloqueadoEstructural) para el badge del listado. Solo se resuelve
    // para los combos de la página (pocos), no para todo el catálogo.
    const comboRows = items.filter((it) => it.esCombo && it.localProductoId);
    if (comboRows.length) {
      await Promise.all(
        comboRows.map(async (it) => {
          try {
            const est = await evaluarEstructuraCombo(prisma, {
              localId,
              comboProductoLocalId: it.localProductoId,
            });
            it.bloqueadoEstructural = est.bloqueadoEstructural;
            it.disponibilidad = est.disponibilidad;
            // "No disponible": ACTIVO pero estructuralmente bloqueado.
            it.noDisponible = it.activo === true && est.bloqueadoEstructural === true;
            it.motivoNoDisponible = it.noDisponible ? est.motivo : null;
          } catch {
            // Ante cualquier problema resolviendo el combo, no romper el listado.
            it.bloqueadoEstructural = false;
            it.noDisponible = false;
            it.motivoNoDisponible = null;
          }
        })
      );
    }

    return NextResponse.json({
      ok: true,
      items,
      total,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      // El control activo vuelve para que la pantalla pueda mostrarlo y ofrecer
      // limpiarlo. `truncadoPorControl` avisa cuando el catálogo supera el techo
      // de clasificación: un reporte parcial se dice, no se disimula.
      control,
      // Las presentaciones vuelven igual que el control, y por el mismo motivo: la
      // pantalla tiene que poder mostrar qué está filtrando y ofrecer quitarlo.
      // Vuelven ya VALIDADAS, así que un valor inventado en la URL se ve acá como
      // `null` en vez de dejar la pantalla marcando una card que no existe.
      presVenta,
      presCompra,
      truncadoPorControl,
      // ── PARA QUÉ UBICACIÓN SE CONTESTÓ ──────────────────────────────────
      //
      // La pantalla puede pedir SIN `localId` —el servidor lo resuelve de la
      // misma cookie— para no tener que esperar a que el contexto llegue por su
      // propio pedido. Cuando después llega, compara contra esto: si es la misma
      // ubicación, no vuelve a pedir. Sin este campo tendría que suponerlo, y
      // suponer acá significa mostrar el catálogo de otro local.
      localId,
      // Propiedad de la UBICACIÓN, no de las filas: viaja una vez al lado de la
      // página y no repetido en cada uno de los items.
      vendeConListaAlCosto,
      listaAlCostoRedondea100,
    });
  } catch (err) {
    console.error("productos/listar", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno" },
      { status: 500 }
    );
  }
}

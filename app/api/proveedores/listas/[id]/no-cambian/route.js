// GET /api/proveedores/listas/[id]/no-cambian
//
// TUS PRODUCTOS DE ESTE PROVEEDOR QUE ESTA LISTA NO VA A CORREGIR.
//
// ── POR QUÉ NO ALCANZA NINGUNO DE LOS QUE YA ESTÁN ─────────────────────────
//
// Todos los demás endpoints del módulo parten de las FILAS DEL ARCHIVO y
// contestan qué hacer con cada renglón. Éste parte del CATÁLOGO y contesta lo
// contrario: de mis productos de M Y F, cuáles van a quedar con el costo viejo.
//
// `sistema` se le parece —también recorre el catálogo— pero reparte en cinco
// situaciones pensadas para el reporte, con "actualizados" y "listos para
// aplicar" adentro, que son justamente los que acá NO van. Filtrar su respuesta
// sería tener la regla en dos lados.
//
// ── EL UNIVERSO SALE DEL PREDICADO CANÓNICO ────────────────────────────────
//
// `productoDelProveedorWhere` mira `proveedor_id` y `proveedor2_id`, que es lo
// que el motor considera "producto de este proveedor", y NO los vínculos de
// código. El porqué está escrito allá: un vínculo viejo metía productos ajenos
// en la conciliación. Si acá se usara otra definición, esta pantalla listaría
// productos que el motor no considera del proveedor.
//
// NO ESCRIBE NADA.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { productoActivoWhere } from "@/lib/proveedores/listas/productoDeBaja";
import {
  contarLosQueNoCambian,
  chipsCierran,
  grupoQueNoCambia,
  ORDEN_NO_CAMBIAN,
} from "@/lib/proveedores/listas/losQueNoCambian";
import { costoParaMirar } from "@/lib/proveedores/listas/costoSospechoso";

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/** Las columnas de la fila que hacen falta para decidir su grupo. */
const CAMPOS_FILA = {
  id: true,
  productoBaseId: true,
  estado: true,
  motivo: true,
  costoAnterior: true,
  excluidaManual: true,
  aplicada: true,
  aplicadaEn: true,
  diferenciaPct: true,
  aumentoEsperadoMinPct: true,
  aumentoEsperadoMaxPct: true,
  confirmadoEn: true,
  vinculadoEn: true,
  multiplicadorConfirmado: true,
  fueraDeRangoAceptadaEn: true,
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

    const { id: idCrudo } = await context.params;
    const id = Number(idCrudo);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id, grupoId },
      select: {
        id: true,
        estado: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const rango = {
      minPct: numero(cab.aumentoEsperadoMinPct),
      maxPct: numero(cab.aumentoEsperadoMaxPct),
    };

    // ── EL UNIVERSO: tus productos de este proveedor ─────────────────────
    const productos = await prisma.productoBase.findMany({
      where: { grupoId, ...productoDelProveedorWhere(cab.proveedor?.id), ...productoActivoWhere() },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        precio_costo: true,
        factor_pack: true,
        filasImportacionLista: { where: { importacionId: id }, select: CAMPOS_FILA },
      },
    });

    // ── CADA PRODUCTO, UNA VEZ, CON UN SOLO MOTIVO ──────────────────────
    //
    // El reparto lo decide `grupoQueNoCambia`, que es puro y tiene su candado.
    // Acá no se vuelve a decidir nada: si esta ruta agrupara por su cuenta, el
    // número de la tarjeta del resultado y el de esta pantalla podrían separarse.
    const conGrupo = [];
    for (const p of productos) {
      const grupo = grupoQueNoCambia(p.filasImportacionLista, rango);
      if (grupo === null) continue;
      conGrupo.push({ producto: p, grupo });
    }

    const conteo = contarLosQueNoCambian(conGrupo);

    // ── CUÁNDO SE LE ESCRIBIÓ EL COSTO POR ÚLTIMA VEZ ───────────────────
    //
    // Sale de la fila APLICADA más reciente de cualquier importación, que es el
    // único registro de que una lista le tocó el costo. No hay columna de
    // "costo actualizado en" en el producto y no se crea una: sería un tercer
    // dato que puede desincronizarse de los otros dos.
    //
    // Una consulta sola para todos, y no una por producto: con 400 productos
    // eso serían 400 viajes a Postgres para dibujar una fecha.
    const ids = conGrupo.map((x) => x.producto.id);
    const ultimaPorProducto = new Map();
    const vecesPorProducto = new Map();
    if (ids.length > 0) {
      const aplicadas = await prisma.importacionListaFila.groupBy({
        by: ["productoBaseId"],
        where: { productoBaseId: { in: ids }, aplicada: true },
        _max: { aplicadaEn: true },
        _count: { _all: true },
      });
      for (const a of aplicadas) {
        ultimaPorProducto.set(a.productoBaseId, a._max.aplicadaEn ?? null);
        vecesPorProducto.set(a.productoBaseId, a._count._all);
      }
    }

    const url = new URL(req.url);
    const filtroPedido = url.searchParams.get("filtro");
    const filtro = ORDEN_NO_CAMBIAN.includes(filtroPedido) ? filtroPedido : null;
    const buscar = String(url.searchParams.get("buscar") ?? "").trim().toLowerCase();

    // ── EL FILTRO Y LA BÚSQUEDA SE APLICAN DESPUÉS DE CONTAR ────────────
    //
    // Los chips tienen que decir cuántos hay EN TOTAL de cada grupo, no cuántos
    // sobreviven a lo que se está escribiendo en el buscador. Un chip que baja
    // mientras se tipea no sirve para elegir a dónde ir.
    const visibles = conGrupo.filter((x) => {
      if (filtro && x.grupo !== filtro) return false;
      if (buscar && !x.producto.nombre.toLowerCase().includes(buscar)) return false;
      return true;
    });

    return NextResponse.json({
      ok: true,
      proveedor: cab.proveedor,
      conteo: { ...conteo, cierran: chipsCierran(conteo) },
      filtro,
      items: visibles.map(({ producto, grupo }) => {
        const costoActual = numero(producto.precio_costo);
        // La fila de ESTA importación que explica el motivo, si la hay. Es la
        // que la pantalla usa para abrir la revisión de ese producto.
        const fila = producto.filasImportacionLista[0] ?? null;
        return {
          productoBaseId: producto.id,
          filaId: fila?.id ?? null,
          nombre: producto.nombre,
          factorPack: producto.factor_pack ?? null,
          costoActual,
          actualizadoEn: ultimaPorProducto.get(producto.id) ?? null,
          grupo,
          costoRedondo: costoParaMirar({
            costoActual,
            vecesAplicado: vecesPorProducto.get(producto.id) ?? 0,
          }),
        };
      }),
    });
  } catch (e) {
    console.error("[listas/no-cambian]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudieron leer tus productos de este proveedor. Probá de nuevo." },
      { status: 500 }
    );
  }
}

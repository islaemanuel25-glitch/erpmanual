// LA CONSULTA DE LA LISTA DE PRECIOS EN PDF.
//
// Trae los productos de UNA ubicación con el mismo universo que el listado del
// catálogo —`filtrosBaseDelCatalogo` y `filtroDeEstado` en activos, que es su
// default—, los funde con su ficha de esa ubicación con `mergeBaseLocalToUi` y
// le pasa cada fila a `filaDeLaLista`, que es la que les pone los números.
//
// La ficha de la ubicación se trae ENTERA (`take: 1` sin `select`), como hace
// `obtener`: un `select` acotado al lado del del listado es el defecto que
// `lib/mappers/selectCompleto.test.mjs` cuenta —un campo que el mapper lee y la
// consulta no pide sale con un valor inventado, sin ningún error—.
//
// El proveedor es el 1 (`proveedor_id`), igual que el filtro del catálogo. El
// "tipo" es la categoría: medido en producción el 2026-10-31, "frio" y
// "Almacen" son categorías, y no hay otro campo que lo guarde.

import { filtrosBaseDelCatalogo, filtroDeEstado } from "./whereCatalogo.js";
import { mergeBaseLocalToUi } from "../mappers/producto.js";
import { ubicacionVendeAlCosto } from "../precios/ubicacionVendeAlCosto.js";
import { nombreDeUbicacion } from "../ubicacionActiva.js";
import { filaDeLaLista, gruposPorCategoria } from "./listaDePrecios.js";

/**
 * @returns {Promise<{ ubicacion: string, proveedor: string|null, tipo: string|null,
 *   grupos: Array<{categoria: string, filas: object[]}>, total: number }>}
 */
export async function datosDeLaListaDePrecios(prisma, { grupoId, localId, proveedorId = null, categoriaId = null }) {
  const [local, proveedor, categoria, vendeAlCosto, productos] = await Promise.all([
    prisma.local.findUnique({ where: { id: localId }, select: { nombre: true, es_deposito: true } }),
    proveedorId ? prisma.proveedor.findUnique({ where: { id: proveedorId }, select: { nombre: true } }) : null,
    categoriaId ? prisma.categoria.findUnique({ where: { id: categoriaId }, select: { nombre: true } }) : null,
    ubicacionVendeAlCosto({ prisma, grupoId, localId }),
    prisma.productoBase.findMany({
      where: {
        AND: [
          ...filtrosBaseDelCatalogo({ grupoId, localId }),
          filtroDeEstado({ localId, activo: true }),
          categoriaId ? { categoria_id: categoriaId } : {},
          proveedorId ? { proveedor_id: proveedorId } : {},
        ],
      },
      include: {
        categoria: { select: { nombre: true } },
        locales: { where: { localId }, take: 1 },
      },
    }),
  ]);

  const esDeposito = local?.es_deposito === true;
  const ubicacion = {
    esDeposito,
    vendeConListaAlCosto: vendeAlCosto.alCosto,
    listaAlCostoRedondea100: vendeAlCosto.redondea100,
  };
  const filas = productos.map((p) =>
    filaDeLaLista(
      { ...mergeBaseLocalToUi(p, p.locales?.[0] ?? null), categoriaNombre: p.categoria?.nombre ?? null },
      ubicacion
    )
  );

  return {
    ubicacion: local ? nombreDeUbicacion({ nombre: local.nombre, esDeposito }) : "",
    proveedor: proveedor?.nombre ?? null,
    tipo: categoria?.nombre ?? null,
    grupos: gruposPorCategoria(filas),
    total: filas.length,
  };
}

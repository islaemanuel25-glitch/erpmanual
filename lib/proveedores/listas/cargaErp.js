// lib/proveedores/listas/cargaErp.js
//
// Trae de la base todo lo que el motor de conciliación necesita, EN BLOQUE.
//
// ── POR QUÉ EN BLOQUE, Y NO POR FILA ────────────────────────────────────────
//
// Una lista de Arcor tiene 917 filas. Buscar el producto de cada una sería 917
// consultas; con el round-trip de red, minutos de espera. Acá son TRES consultas
// fijas, sin importar si el archivo trae 900 filas o 20.000.
//
// ── DOS CATÁLOGOS, NO UNO ───────────────────────────────────────────────────
//
// Son dos preguntas distintas y llevan dos conjuntos distintos:
//
//   MACHEO por código interno → solo los productos que YA tienen un vínculo
//     activo con este proveedor. Es lo único que puede machear solo.
//
//   SUGERENCIA por código de barras → los productos que NO tienen vínculo. Es
//     literalmente el caso para el que existe la sugerencia: "este código no está
//     vinculado, pero hay un producto tuyo con el mismo código de barras,
//     ¿será el mismo?".
//
// La primera versión de este archivo cargaba UN solo catálogo, el derivado de los
// vínculos, y lo usaba para las dos cosas. Resultado: la sugerencia solo podía
// encontrar productos que ya estaban vinculados, o sea nunca servía para nada. El
// defecto no rompía nada visible —simplemente no aparecía ninguna sugerencia— y
// por eso vale la pena dejarlo escrito.
//
// ── ALCANCE ─────────────────────────────────────────────────────────────────
//
// El catálogo de sugerencias va acotado por `grupoId` Y por
// `productoVisibleWhere(localId)`, que es la regla canónica del ERP: un producto
// exclusivo de OTRO local no puede aparecer como sugerencia. Sin ese filtro, un
// admin del depósito vería productos que no administra.

import prisma from "@/lib/prisma";
import { productoVisibleWhere } from "@/lib/visibilidad";

/** Los campos de ProductoBase que el motor necesita. */
const CAMPOS_BASE = {
  id: true,
  nombre: true,
  precio_costo: true,
  factor_pack: true,
  unidad_medida: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  creadoEnLocalId: true,
  es_combo: true,
  codigo_barra: true,
  codigo_barra_secundario: true,
};

/**
 * @param grupoId      grupo activo, ya validado por el endpoint
 * @param proveedorId  proveedor, ya validado como visible en el grupo
 * @param localId      ubicación operativa: define qué productos se ven y qué
 *                     códigos propios cuentan
 * @param db           cliente Prisma o tx
 *
 * @returns { codigosProveedor, productos, diagnostico }
 */
export async function cargarDatosDeConciliacion({ grupoId, proveedorId, localId }, db = prisma) {
  // ── 1. Los vínculos ACTIVOS del proveedor en este grupo ─────────────────
  //
  // Los inactivos no se traen: no machean, y tampoco cuentan como faltantes.
  const vinculos = await db.productoCodigoProveedor.findMany({
    where: { grupoId, proveedorId, activo: true },
    select: { id: true, productoBaseId: true, codigoInterno: true, activo: true },
  });
  const idsVinculados = [...new Set(vinculos.map((v) => v.productoBaseId))];

  // ── 2. Los códigos de barras PROPIOS de esta ubicación ──────────────────
  //
  // Viven en ProductoLocal y son POR LOCAL: el código propio de otro local no
  // identifica nada acá. Se consulta primero porque el resultado decide qué
  // productos hay que traer en la consulta siguiente: un producto cuyo ÚNICO
  // código de barras sea el propio de esta ubicación no aparecería si solo se
  // buscara por los códigos globales.
  const propios = await db.productoLocal.findMany({
    where: {
      localId,
      codigo_barra_propio: { not: null },
      base: { grupoId },
    },
    select: { baseId: true, codigo_barra_propio: true },
  });
  const propiosPorBase = new Map();
  for (const p of propios) {
    if (!propiosPorBase.has(p.baseId)) propiosPorBase.set(p.baseId, []);
    propiosPorBase.get(p.baseId).push(p.codigo_barra_propio);
  }

  // ── 3. Los productos ────────────────────────────────────────────────────
  //
  // Una sola consulta para los dos catálogos: los vinculados —que hacen falta
  // para machear— y los que tienen algún código de barras —que hacen falta para
  // sugerir—. Traerlos juntos evita una consulta más y no mezcla nada: quién
  // puede machear lo decide el índice de vínculos, no esta lista.
  //
  // El filtro de visibilidad es el canónico del ERP. Un producto exclusivo de
  // otro local no entra ni como sugerencia.
  const bases = await db.productoBase.findMany({
    where: {
      grupoId,
      ...productoVisibleWhere(localId),
      OR: [
        ...(idsVinculados.length ? [{ id: { in: idsVinculados } }] : []),
        { codigo_barra: { not: null } },
        { codigo_barra_secundario: { not: null } },
        ...(propiosPorBase.size ? [{ id: { in: [...propiosPorBase.keys()] } }] : []),
      ],
    },
    select: CAMPOS_BASE,
  });

  const productos = bases.map((b) => ({
    productoBaseId: b.id,
    nombre: b.nombre,
    // Decimal de Prisma → número. El motor trabaja en centavos enteros después.
    precioCostoActual: b.precio_costo === null ? null : Number(b.precio_costo),
    factorPack: b.factor_pack,
    unidadMedida: b.unidad_medida,
    modoCompraProveedor: b.modoCompraProveedor,
    pesoReferenciaKg: b.pesoReferenciaKg === null ? null : Number(b.pesoReferenciaKg),
    creadoEnLocalId: b.creadoEnLocalId,
    esCombo: b.es_combo === true,
    // Las tres fuentes reales de código de barras del ERP: el global, el
    // secundario global y el propio de esta ubicación.
    codigosBarra: [
      b.codigo_barra,
      b.codigo_barra_secundario,
      ...(propiosPorBase.get(b.id) ?? []),
    ].filter(Boolean),
  }));

  const vinculadosPresentes = new Set(productos.map((p) => p.productoBaseId));

  return {
    codigosProveedor: vinculos.map((v) => ({
      id: v.id,
      productoBaseId: v.productoBaseId,
      codigoInterno: v.codigoInterno,
      activo: v.activo,
    })),
    productos,
    // Para poder afirmar en las pruebas que el catálogo de sugerencias es más
    // amplio que el de macheo, que es todo el punto de la corrección.
    diagnostico: {
      consultas: 3,
      vinculosActivos: vinculos.length,
      productosVinculados: idsVinculados.length,
      productosEnCatalogo: productos.length,
      productosSoloSugeribles: productos.filter(
        (p) => !idsVinculados.includes(p.productoBaseId)
      ).length,
      productosConCodigoBarra: productos.filter((p) => p.codigosBarra.length > 0).length,
      // Un vinculado que el filtro de visibilidad dejó afuera: no debería pasar,
      // pero si pasara, sus filas quedarían NO_MACHEADAS sin explicación.
      vinculadosNoVisibles: idsVinculados.filter((id) => !vinculadosPresentes.has(id)).length,
    },
  };
}

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

import { productoVisibleWhere } from "@/lib/visibilidad";

/**
 * Cliente por defecto, resuelto TARDE.
 *
 * Importar `@/lib/prisma` arriba ata este módulo al interceptor de auditoría y,
 * a través de él, a `next/server`, que no existe fuera del bundle de Next: los
 * scripts de mantenimiento que corren en un container one-off de la imagen
 * standalone no podían importar este archivo. Con el import diferido, quien
 * pasa su propio cliente —que es lo que hacen los scripts— nunca lo evalúa.
 */
async function clientePorDefecto() {
  const m = await import("@/lib/prisma");
  return m.default;
}

/**
 * EL UNIVERSO: qué productos pueden participar de una importación.
 *
 * Solo los que tienen a ESTE proveedor asociado en alguna de las tres relaciones
 * reales del modelo: `proveedor_id`, `proveedor2_id` o `proveedor3_id`. No hay
 * tabla puente; son exactamente esas tres.
 *
 * NO alcanza con que exista un ProductoCodigoProveedor apuntando al proveedor.
 * Ese registro dice "el proveedor llama X a este producto", no "este producto se
 * le compra al proveedor": un vínculo viejo, heredado o cargado por error metía
 * en la conciliación productos que no son de Arcor, y la lista les proponía
 * costo. Un producto con varios proveedores participa si Arcor es cualquiera de
 * ellos.
 */
export function productoDelProveedorWhere(proveedorId) {
  return {
    OR: [
      { proveedor_id: proveedorId },
      { proveedor2_id: proveedorId },
      { proveedor3_id: proveedorId },
    ],
  };
}

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
  proveedor_id: true,
  proveedor2_id: true,
  proveedor3_id: true,
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
export async function cargarDatosDeConciliacion({ grupoId, proveedorId, localId }, dbEntrante) {
  const db = dbEntrante ?? (await clientePorDefecto());
  // ── 1. Los vínculos ACTIVOS del proveedor en este grupo ─────────────────
  //
  // Los inactivos no se traen: no machean, y tampoco cuentan como faltantes.
  const vinculos = await db.productoCodigoProveedor.findMany({
    where: { grupoId, proveedorId, activo: true },
    // `descripcionProveedor` se trae desde el 2026-08-11: la conciliación de
    // COMPROBANTES machea también por el nombre que alguien vinculó antes, y sin
    // este campo tendría que hacer su propia consulta a la misma tabla. Dos
    // consultas al mismo dato es cómo empiezan a divergir. A listas no le
    // molesta: lo ignora.
    select: { id: true, productoBaseId: true, codigoInterno: true, descripcionProveedor: true, activo: true },
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

  // ── 3. Los productos: EL UNIVERSO ───────────────────────────────────────
  //
  // Una sola lista, y es la única que el motor va a ver. Antes se traían dos
  // catálogos —los vinculados por código y, aparte, cualquier producto con
  // código de barras para poder sugerir—; el segundo era todo el catálogo del
  // grupo, y por ahí se colaban sugerencias de productos que no se le compran a
  // este proveedor.
  //
  // Ahora el universo es la asociación real de proveedor, y TODO se busca
  // adentro: código interno, sufijo, código de barras y nombre. Ningún camino
  // puede salir de acá.
  //
  // El filtro de visibilidad sigue siendo el canónico del ERP: un producto
  // exclusivo de otro local no entra ni aunque tenga a Arcor de proveedor.
  const bases = await db.productoBase.findMany({
    where: {
      grupoId,
      ...productoVisibleWhere(localId),
      ...productoDelProveedorWhere(proveedorId),
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
    // En cuál de las tres relaciones aparece el proveedor. Sirve para explicar
    // en la pantalla por qué un producto participa.
    relacionProveedor:
      b.proveedor_id === proveedorId
        ? 1
        : b.proveedor2_id === proveedorId
          ? 2
          : b.proveedor3_id === proveedorId
            ? 3
            : null,
    // Las tres fuentes reales de código de barras del ERP: el global, el
    // secundario global y el propio de esta ubicación.
    codigosBarra: [
      b.codigo_barra,
      b.codigo_barra_secundario,
      ...(propiosPorBase.get(b.id) ?? []),
    ].filter(Boolean),
  }));

  const enUniverso = new Set(productos.map((p) => p.productoBaseId));

  // Un vínculo que apunta a un producto FUERA del universo no machea. Es el
  // caso que motivó todo el cambio: existe el ProductoCodigoProveedor pero el
  // producto no tiene a este proveedor asociado, así que la lista no debería
  // proponerle costo. Se filtra acá, en la carga, para que el motor no tenga
  // que volver a comprobarlo en cada uno de sus caminos.
  const vinculosEnUniverso = vinculos.filter((v) => enUniverso.has(v.productoBaseId));

  return {
    codigosProveedor: vinculosEnUniverso.map((v) => ({
      id: v.id,
      productoBaseId: v.productoBaseId,
      codigoInterno: v.codigoInterno,
      descripcionProveedor: v.descripcionProveedor ?? null,
      activo: v.activo,
    })),
    productos,
    // Para poder afirmar en las pruebas que el catálogo de sugerencias es más
    // amplio que el de macheo, que es todo el punto de la corrección.
    diagnostico: {
      consultas: 3,
      /** Tamaño del universo: productos con este proveedor asociado y visibles. */
      productosDelProveedor: productos.length,
      productosPorRelacion: {
        principal: productos.filter((p) => p.relacionProveedor === 1).length,
        secundario: productos.filter((p) => p.relacionProveedor === 2).length,
        terciario: productos.filter((p) => p.relacionProveedor === 3).length,
      },
      vinculosActivos: vinculos.length,
      vinculosEnUniverso: vinculosEnUniverso.length,
      /** Vínculos que apuntan a productos SIN este proveedor asociado: los que
       *  antes macheaban y ahora, correctamente, no. */
      vinculosFueraDelUniverso: vinculos.length - vinculosEnUniverso.length,
      productosConCodigoBarra: productos.filter((p) => p.codigosBarra.length > 0).length,
    },
  };
}

// lib/productos/controlesDesdePrisma.js
//
// EL PUENTE entre lo que devuelve Prisma y la clasificación pura.
//
// ── POR QUÉ ESTA CAPA EXISTE ────────────────────────────────────────────────
//
// Los cuatro controles NO se pueden expresar como un `where` de Prisma, y no es
// por falta de ingenio: dependen del precio y el costo EFECTIVOS, que salen de
// mergear `ProductoBase` con el `ProductoLocal` de la ubicación. Un producto
// puede tener margen en la ficha y un override sin margen en el local —o al
// revés—, y la respuesta correcta sale recién después de mergear.
//
// El issue lo anticipa y decide: consultar los campos necesarios y clasificar con
// las funciones de dominio, priorizando una sola semántica antes que una consulta
// "ingeniosa" distinta a la lógica del ERP.
//
// Este archivo hace UNA cosa: llevar una fila de Prisma a la forma que
// `controlesCalidad` espera. Ni el contador ni el filtro arman esa forma por su
// cuenta — si lo hicieran, un campo que uno mergea y el otro no volvería a
// separar los dos números.
//
// ── EL SELECT MÍNIMO ESTÁ ACÁ, Y NO ES UN DETALLE ──────────────────────────
//
// `SELECT_CONTROLES` es lo que hay que pedirle a Prisma para poder clasificar.
// Vive junto a la función que lo consume porque un select incompleto no falla:
// devuelve `undefined` en el campo que falta y la clasificación contesta con
// confianza una respuesta equivocada. Ya pasó en este repo con el fiambre de
// pieza fija — un `select` a medias hizo que un predicado dijera "no es fiambre"
// y el importe saliera mal en dos pantallas.

import { marcadoPor, contarControles, IDS_CONTROL } from "./controlesCalidad";

/**
 * Lo mínimo que hay que traer de `ProductoBase` para poder clasificar.
 * Se pasa como `select` o se comprueba contra un `include`.
 */
export const SELECT_CONTROLES_BASE = {
  id: true,
  precio_costo: true,
  precio_venta: true,
  margen: true,
  modalidad: true,
  unidad_medida: true,
  factor_pack: true,
  pesoReferenciaKg: true,
};

/** Lo mínimo del `ProductoLocal` de la ubicación. */
export const SELECT_CONTROLES_LOCAL = {
  id: true,
  localId: true,
  precio_costo: true,
  precio_venta: true,
  margen: true,
  reglaPrecio: true,
  recargoFijoUnidad: true,
  precioRevisadoAt: true,
  activo: true,
};

/** El primer valor que no es null ni undefined. */
const efectivo = (...valores) => valores.find((v) => v !== null && v !== undefined) ?? null;

/**
 * Lleva una fila de Prisma —base + su ProductoLocal— a la forma que la
 * clasificación espera.
 *
 * ── QUÉ SE MERGEA Y QUÉ NO ─────────────────────────────────────────────────
 *
 * Precio, costo, margen, regla y recargo son POR UBICACIÓN: el override gana y,
 * si está en null, se hereda de la ficha. Es la misma regla que usan el listado,
 * el editor y el POS.
 *
 * La modalidad, la unidad de medida, el factor de pack y el peso de referencia
 * son de la FICHA y no tienen override: un producto no es un servicio en un local
 * y una mercadería en otro.
 *
 * `precioRevisadoAt` sale SOLO del local y nunca se hereda: revisar el precio de
 * una ubicación no dice nada sobre el de otra. Si el ProductoLocal no existe,
 * queda `null` —sin evidencia—, que es la verdad.
 */
export function filaParaControles(base, local = null) {
  return {
    id: base?.id ?? null,
    localId: local?.localId ?? null,
    productoLocalId: local?.id ?? null,

    // Efectivos de la ubicación.
    precio_costo: efectivo(local?.precio_costo, base?.precio_costo),
    precio_venta: efectivo(local?.precio_venta, base?.precio_venta),
    margen: efectivo(local?.margen, base?.margen),

    // ── LA REGLA DE PRECIO VIVE SOLO EN EL LOCAL ──────────────────────────
    //
    // `reglaPrecio` y `recargoFijoUnidad` son columnas de `ProductoLocal` y NO
    // existen en `ProductoBase`: no hay de dónde heredarlas. Sin ProductoLocal la
    // respuesta es MARGEN_PORCENTUAL, que es el default de la columna y lo mismo
    // que resuelve `mergeBaseLocalToUi` — si acá se contestara otra cosa, el
    // control diría "falta regla" sobre un producto que la pantalla muestra con
    // margen.
    //
    // Esto lo encontró la sonda contra Postgres, no el build ni los candados: el
    // `select` original las pedía en la base y Prisma contestó
    // `Unknown field reglaPrecio`.
    reglaPrecio: local?.reglaPrecio ?? "MARGEN_PORCENTUAL",
    recargoFijoUnidad: local?.recargoFijoUnidad ?? null,

    // De la ficha, sin override.
    modalidad: base?.modalidad ?? null,
    unidad_medida: base?.unidad_medida ?? null,
    factor_pack: base?.factor_pack ?? null,
    pesoReferenciaKg: base?.pesoReferenciaKg ?? null,

    // Solo del local, sin herencia.
    precioRevisadoAt: local?.precioRevisadoAt ?? null,
  };
}

/**
 * Clasifica un conjunto de filas de Prisma y devuelve el conteo por control.
 *
 * @param {Array} rows   filas de ProductoBase con `locales` (0 o 1 elemento)
 * @param {Date} [ahora]
 */
export function contarDesdePrisma(rows = [], ahora = new Date()) {
  return contarControles(
    rows.map((p) => filaParaControles(p, p.locales?.[0] ?? null)),
    ahora
  );
}

/**
 * ¿Esta fila de Prisma está marcada por este control?
 *
 * La usa el listado para filtrar. Es la MISMA función que alimenta el conteo, así
 * que el número de la card y el total del listado no se pueden separar.
 */
export function filaMarcadaPor(control, row, ahora = new Date()) {
  return marcadoPor(control, filaParaControles(row, row.locales?.[0] ?? null), ahora);
}

export { IDS_CONTROL };

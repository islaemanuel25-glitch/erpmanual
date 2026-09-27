// lib/stock/libro/libroStock.js
//
// LO QUE LA APLICACIÓN SABE DEL LIBRO HISTÓRICO FÍSICO DE STOCK.
//
// El libro lo escribe PostgreSQL: un trigger sobre `StockLocal` que corre en la
// misma transacción que cada cambio. La migración es
// `prisma/migrations/20260927120000_libro_stock/migration.sql`, y el porqué de
// cada columna está en `prisma/schema.prisma`, junto a `MovimientoStock`.
//
// Acá viven dos cosas y nada más:
//
//   1. Los NOMBRES que el SQL y el JavaScript tienen que compartir —las
//      configuraciones del origen, los triggers, los tipos, la zona—. El SQL no
//      puede importarlos, así que `libroStock.test.mjs` exige que la migración
//      diga exactamente lo mismo que este archivo.
//   2. `declararOrigenDeStock`, la única forma de decirle al trigger POR QUÉ
//      cambió el stock.
//
// ── ESTA PR NO MIGRA NINGÚN ESCRITOR ───────────────────────────────────────
//
// Ninguna ruta llama todavía a `declararOrigenDeStock`. Hasta que lo hagan, sus
// movimientos quedan como SIN_ORIGEN. Eso NO vuelve dudosa la cantidad: el
// trigger la capturó igual. Lo que falta es la causa, y eso es una pregunta
// distinta —el verificador las informa por separado—.
//
// Tampoco se fija acá la lista de orígenes válidos. Se va a escribir cuando se
// migren los escritores, sacándola de los que existen, y no adivinándola hoy.

import { TZ_AR } from "@/lib/fechas/formatearFechaHora";

/** La zona con la que la base calcula el día argentino de cada movimiento. */
export const ZONA_DEL_LIBRO = TZ_AR;

/** Las configuraciones de PostgreSQL que lee el trigger. */
export const CONFIG_ORIGEN = "erpazul.stock_origen";
export const CONFIG_ORIGEN_REF = "erpazul.stock_origen_ref";

/** Lo que el trigger escribe cuando nadie declaró un origen. */
export const SIN_ORIGEN = "SIN_ORIGEN";

/** El origen de las filas del punto cero. */
export const ORIGEN_ACTIVACION = "ACTIVACION_DEL_LIBRO";

export const TIPO_MOVIMIENTO = Object.freeze({
  ESTADO_INICIAL: "ESTADO_INICIAL",
  ALTA: "ALTA",
  CAMBIO: "CAMBIO",
  BAJA: "BAJA",
});

/**
 * Los triggers sin los cuales el libro deja de ser confiable. El verificador se
 * pone rojo si falta uno o si está deshabilitado.
 */
export const TRIGGERS_OBLIGATORIOS = Object.freeze([
  { tabla: "StockLocal", nombre: "StockLocal_libro" },
  { tabla: "ProductoBase", nombre: "ProductoBase_libro_reinterpretacion" },
  { tabla: "Local", nombre: "Local_libro_reinterpretacion" },
  { tabla: "MovimientoStock", nombre: "MovimientoStock_inmutable" },
  { tabla: "ReinterpretacionDeStock", nombre: "ReinterpretacionDeStock_inmutable" },
]);

/**
 * Los campos que cambian QUÉ SIGNIFICA `StockLocal.cantidad` sin cambiar el
 * número. Relevados en la auditoría de la etapa 1.c.2 leyendo
 * `lib/conversiones/stock.js` (`esFiambreFijo`) y quién escribe cada uno. Qué
 * combinación reinterpreta de verdad lo sigue decidiendo `esFiambreFijo`: la
 * base solo deja constancia de que el campo cambió.
 */
export const CAMPOS_QUE_REINTERPRETAN = Object.freeze({
  ProductoBase: Object.freeze([
    "unidad_medida",
    "modoVentaDeposito",
    "pesoReferenciaKg",
    "modoCompraProveedor",
    "pesoEsFijo",
  ]),
  Local: Object.freeze(["es_deposito"]),
});

const RESERVADOS = new Set([SIN_ORIGEN, ORIGEN_ACTIVACION]);
const FORMA_DEL_ORIGEN = /^[A-Z][A-Z0-9_]{1,63}$/;

/**
 * Un origen es un identificador en MAYÚSCULAS, y no uno de los que escribe el
 * propio libro. Devuelve el motivo del rechazo, o null si sirve.
 */
export function motivoDeOrigenInvalido(origen) {
  if (typeof origen !== "string" || !FORMA_DEL_ORIGEN.test(origen)) {
    return `El origen de stock tiene que ser un identificador en mayúsculas (A-Z, 0-9, _): recibí ${JSON.stringify(origen)}`;
  }
  if (RESERVADOS.has(origen)) {
    return `"${origen}" lo escribe el propio libro y no se declara`;
  }
  return null;
}

/**
 * Le dice al trigger del libro por qué va a cambiar el stock en ESTA transacción.
 *
 * Tiene que llamarse con el cliente de la transacción —el `tx` de
 * `prisma.$transaction(async (tx) => …)`— y ANTES de escribir `StockLocal`. La
 * configuración es local a la transacción (`set_config(…, true)`): muere con
 * ella, así que no pasa a la próxima que use la misma conexión del pool.
 *
 * Con el cliente raíz no serviría de nada: cada sentencia sería su propia
 * transacción y la configuración moriría antes de la escritura. Por eso se
 * rechaza en vez de dejar pasar un origen que nunca llega.
 *
 * Declarar de nuevo dentro de la misma transacción reemplaza lo anterior, y una
 * referencia que no se pasa se borra: no se hereda la de la declaración previa.
 *
 * @param {object} tx  el cliente de la transacción interactiva de Prisma
 * @param {{ origen: string, referencia?: string|number|null }} declaracion
 */
export async function declararOrigenDeStock(tx, { origen, referencia = null } = {}) {
  if (!tx || typeof tx.$queryRaw !== "function") {
    throw new Error("declararOrigenDeStock necesita el cliente de la transacción");
  }
  if (typeof tx.$transaction === "function") {
    throw new Error(
      "declararOrigenDeStock se llamó con el cliente raíz: tiene que ser el `tx` de prisma.$transaction, o el origen se pierde antes de escribir"
    );
  }
  const motivo = motivoDeOrigenInvalido(origen);
  if (motivo) throw new Error(motivo);

  const ref = referencia === null || referencia === undefined ? "" : String(referencia);
  await tx.$queryRaw`
    SELECT set_config(${CONFIG_ORIGEN}, ${origen}, true),
           set_config(${CONFIG_ORIGEN_REF}, ${ref}, true)
  `;
}

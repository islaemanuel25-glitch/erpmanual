// CUÁNTAS UNIDADES TRAE LA CAJA, DICHO POR UNA PERSONA (Emanuel, 2026-10-24).
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// ALICANTE PIMENTÓN 25G: el renglón de Dab dice "$ 800,45" —la unidad— y el
// producto cuesta hoy $ 19.680 —la caja—. El catálogo no dice cuántas trae la
// caja y el papel tampoco, así que no se podía armar ninguna lectura: la tarjeta
// quedaba sin cuenta y con "—". Ahora pregunta "¿Cuántas trae la caja?" y con ese
// número arma la cuenta ($ 800,45 × 24 = $ 19.210,80).
//
// ── DÓNDE SE GUARDA, Y DÓNDE NO ───────────────────────────────────────────
//
// En la LECTURA RECORDADA de ese producto con ese proveedor
// (`LecturaProductoProveedor`), la misma memoria que ya guarda "este precio se
// lee por caja" para las próximas listas. NO en la ficha del producto: el
// `factor_pack` lo usan ventas y stock, y una respuesta sobre cómo cotiza UN
// proveedor no puede cambiar cómo se vende el producto.
//
// La clave es `CAJA_DE_<n>` y no `PACK_<n>`: dice de dónde salió el número. Una
// `PACK_<n>` sale del catálogo o del archivo; ésta, de una persona, y por eso
// solo se ofrece cuando ninguno de los dos dice nada (`lecturasDeFila`).
//
// ── QUIÉN LA LEE ──────────────────────────────────────────────────────────
//
// Todos los que arman lecturas o escriben costos, con el producto que reciben
// (`conLaCajaRecordada`): la conciliación (vía `costoDeLaFila`), la revisión,
// `confirmar` y `aplicar`. Si faltara en uno, una fila confirmada con la caja de
// 24 se podría confirmar y no aplicar —el defecto que `aplicacion.js` ya tiene
// contado dos veces—.
//
// Puro, salvo `cargarLecturasRecordadas`, que recibe el cliente.

import { round2 } from "./calculoCosto.js";
import { CANTIDAD_MAX } from "./confirmarPresentacion.js";

export const PREFIJO_CAJA = "CAJA_DE_";

/** La clave de la lectura "la caja trae n". */
export function claveDeLaCaja(n) {
  return `${PREFIJO_CAJA}${Number(n)}`;
}

/** ¿Es una cantidad de caja que se puede guardar? Entera, de 2 a CANTIDAD_MAX. */
export function cantidadDeCajaValida(n) {
  const v = Number(n);
  return Number.isInteger(v) && v >= 2 && v <= CANTIDAD_MAX;
}

/**
 * La cantidad de la caja que dijo una persona, si la lectura recordada es ésa.
 * Una recordada de otra clase —"es el precio de la caja", "PACK_12"— no dice
 * cuántas trae la caja, y no se convierte en una.
 */
export function cantidadDeLaCaja(lecturaRecordada) {
  const clave = String(lecturaRecordada?.clave ?? "");
  if (!clave.startsWith(PREFIJO_CAJA)) return null;
  const n = Number(lecturaRecordada?.multiplicador);
  return cantidadDeCajaValida(n) ? n : null;
}

/** El producto, con la cantidad de la caja recordada puesta (o igual si no hay). */
export function conLaCajaRecordada(base, lecturaRecordada) {
  if (!base) return base;
  const n = cantidadDeLaCaja(lecturaRecordada);
  return n === null ? base : { ...base, cantidadDeLaCaja: n };
}

/** La lectura que arma la caja recordada, con la forma de las demás. */
export function lecturaDeLaCaja({ precio, n }) {
  return {
    clave: claveDeLaCaja(n),
    multiplicador: Number(n),
    costoNuevo: round2(precio * Number(n)),
    origenCantidad: "la cantidad que dijiste",
    detalle: `El archivo cotiza la unidad y la caja trae ${n}, como dijiste. El costo es el precio por ${n}.`,
  };
}

/**
 * Las lecturas recordadas de estos productos con este proveedor.
 *
 * @param db  el cliente de Prisma (o una transacción)
 * @returns Map productoBaseId → `{ clave, multiplicador, cantidad }`
 */
export async function cargarLecturasRecordadas(db, { grupoId, proveedorId, productoBaseIds = [] }) {
  const ids = [...new Set(productoBaseIds.filter((x) => Number.isInteger(Number(x))).map(Number))];
  if (!proveedorId || ids.length === 0) return new Map();
  const filas = await db.lecturaProductoProveedor.findMany({
    where: { grupoId, proveedorId, productoBaseId: { in: ids } },
    select: { productoBaseId: true, clave: true, multiplicador: true, cantidad: true },
  });
  return new Map(filas.map((r) => [r.productoBaseId, r]));
}

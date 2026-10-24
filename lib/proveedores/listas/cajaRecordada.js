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
// (`conLoRecordado`): la conciliación (vía `costoDeLaFila`), la revisión,
// `confirmar` y `aplicar`. Si faltara en uno, una fila confirmada con la caja de
// 24 se podría confirmar y no aplicar —el defecto que `aplicacion.js` ya tiene
// contado dos veces—.
//
// ── Y CUÁNTOS KILOS TRAE LA PIEZA (GRANIX, 2026-10-24) ────────────────────
//
// La misma pregunta para un producto que guarda el costo POR KILO: GRANIX
// BOCADITO CHOC. BLANCO 2KG cuesta $ 6.405 el kilo y Dab lo cotiza por pieza de
// 2 kg ("$ 22.105,73 · por 2"). Sin los kilos de la pieza no hay forma honesta
// de pasar ese precio a kilo, y el motor bloqueaba el producto entero. La
// respuesta va en la misma memoria —`LecturaProductoProveedor.kilosPorPieza`—,
// nunca en `ProductoBase.pesoReferenciaKg`: el peso de referencia es de stock
// y del depósito, y es un promedio.
//
// Con los kilos se arman las lecturas pasadas a kilo (`lecturasPorKilo`): el
// precio de una pieza y, si la lista dice cuántas piezas trae el bulto, el del
// bulto. Se eligen igual que las demás, con el rango.
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

/**
 * El producto, con lo que una persona contestó para este proveedor puesto: la
 * cantidad de la caja (`cantidadDeLaCaja`) y los kilos de la pieza
 * (`kilosPorPieza`). Igual si no contestó nada.
 */
export function conLoRecordado(base, lecturaRecordada) {
  if (!base) return base;
  const n = cantidadDeLaCaja(lecturaRecordada);
  const kilos = kilosDeLaPieza(lecturaRecordada);
  if (n === null && kilos === null) return base;
  return {
    ...base,
    ...(n === null ? {} : { cantidadDeLaCaja: n }),
    ...(kilos === null ? {} : { kilosPorPieza: kilos }),
  };
}

// ── LOS KILOS DE LA PIEZA ─────────────────────────────────────────────────

/** Hasta cuánto puede pesar una pieza. Mil kilos ya no es una pieza. */
export const KILOS_MAX = 1000;

/** La clave que deja la respuesta "la pieza trae N kilos", antes de elegir lectura. */
export const CLAVE_KILOS_POR_PIEZA = "KILOS_POR_PIEZA";

/** Las dos lecturas pasadas a kilo. */
export const CLAVE_KILO = Object.freeze({
  PIEZA: "KILO_POR_PIEZA",
  BULTO: "KILO_POR_BULTO",
});

/**
 * ¿Son unos kilos de pieza que se pueden guardar? Positivos, hasta `KILOS_MAX`,
 * con hasta tres decimales —el gramo, que es lo que guarda la columna—.
 */
export function kilosValidos(k) {
  const v = Number(k);
  if (!Number.isFinite(v) || v <= 0 || v > KILOS_MAX) return false;
  return Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6;
}

/** Los kilos de la pieza que dijo una persona, o null. Viene como Decimal de la base. */
export function kilosDeLaPieza(lecturaRecordada) {
  const k = lecturaRecordada?.kilosPorPieza;
  if (k === null || k === undefined) return null;
  const v = Number(k);
  return kilosValidos(v) ? v : null;
}

/** "2 kg", "2,5 kg": los kilos con coma y sin ceros de más. */
export function textoKilos(k) {
  return `${Number(k).toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg`;
}

/**
 * LAS LECTURAS DE UN PRODUCTO QUE GUARDA EL COSTO POR KILO.
 *
 * El precio de la lista se DIVIDE por los kilos que cubre: los de una pieza, o
 * los del bulto —piezas × kilos de la pieza—, a precisión completa y redondeado
 * al final, como las demás lecturas. `divisorKg` viaja en la lectura porque es
 * lo que `confirmar` guarda en la fila y lo que `aplicar` vuelve a buscar: con
 * `multiplicador` no alcanza, porque acá el precio no se multiplica.
 *
 * Sin kilos válidos no hay ninguna: la pieza no se compara contra el kilo.
 *
 * @param precio          el precio base del costo (`precioBaseDelCosto`)
 * @param kilos           los kilos de la pieza
 * @param piezasPorBulto  las unidades por bulto que trae el archivo, o null
 */
export function lecturasPorKilo({ precio, kilos, piezasPorBulto = null }) {
  const p = Number(precio);
  if (!Number.isFinite(p) || p <= 0 || !kilosValidos(kilos)) return [];
  const k = Number(kilos);
  const lecturas = [
    {
      clave: CLAVE_KILO.PIEZA,
      multiplicador: 1,
      // El precio que se divide, con recargo e impuesto si los hay: es el de la
      // izquierda de la cuenta, así "÷ 2 kg = …" cierra.
      precioBase: p,
      divisorKg: k,
      kilosPorPieza: k,
      piezas: null,
      costoNuevo: round2(p / k),
      origenCantidad: "los kilos que dijiste",
      detalle: `El archivo cotiza una pieza de ${textoKilos(k)}. El costo es el precio dividido ${textoKilos(k)}.`,
    },
  ];
  const n = Number(piezasPorBulto);
  if (Number.isInteger(n) && n > 1 && n <= CANTIDAD_MAX) {
    const divisor = Math.round(n * k * 1000) / 1000;
    lecturas.push({
      clave: CLAVE_KILO.BULTO,
      multiplicador: 1,
      precioBase: p,
      divisorKg: divisor,
      kilosPorPieza: k,
      piezas: n,
      costoNuevo: round2(p / (n * k)),
      origenCantidad: "las piezas del bulto del archivo y los kilos que dijiste",
      detalle: `El archivo cotiza el bulto de ${n} piezas de ${textoKilos(k)}. El costo es el precio dividido ${textoKilos(divisor)}.`,
    });
  }
  return lecturas;
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
 * @returns Map productoBaseId → `{ clave, multiplicador, cantidad, kilosPorPieza }`
 */
export async function cargarLecturasRecordadas(db, { grupoId, proveedorId, productoBaseIds = [] }) {
  const ids = [...new Set(productoBaseIds.filter((x) => Number.isInteger(Number(x))).map(Number))];
  if (!proveedorId || ids.length === 0) return new Map();
  const filas = await db.lecturaProductoProveedor.findMany({
    where: { grupoId, proveedorId, productoBaseId: { in: ids } },
    select: { productoBaseId: true, clave: true, multiplicador: true, cantidad: true, kilosPorPieza: true },
  });
  return new Map(filas.map((r) => [r.productoBaseId, r]));
}

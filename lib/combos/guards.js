// lib/combos/guards.js
//
// Guard central reutilizable para proteger los combos en endpoints existentes.
// Un combo es un ProductoBase con es_combo=true y SIN StockLocal propio; no debe
// crearse por el alta de productos normal, ni promoverse a depósito, ni recibir
// StockLocal desde endpoints genéricos de stock.
//
// Devuelve/lanza errores con `.status` (mismo patrón que lib/combos/errores.js).

import { errCombo } from "./errores.js";

// True si el objeto ProductoBase (o { es_combo }) es un combo.
export function esComboBase(base) {
  return !!(base && (base.es_combo === true || base.esCombo === true));
}

// Lanza 400 si el payload pide crear/convertir un combo por un endpoint que no
// corresponde. `accion` describe el endpoint para el mensaje.
export function assertNoCrearCombo(flagEsCombo, accion = "esta operación") {
  if (flagEsCombo === true) {
    throw errCombo(
      `Los combos no se crean ni editan desde ${accion}. Usá el módulo de combos (/api/combos).`,
      400
    );
  }
}

// Lanza 400 si un ProductoBase ya existente es un combo (para promover, ajustar
// stock, etc.). `accion` describe la operación bloqueada.
export function assertBaseNoEsCombo(base, accion = "esta operación") {
  if (esComboBase(base)) {
    throw errCombo(`No se puede ${accion} sobre un combo: es un producto sin stock físico.`, 400);
  }
}

// Consulta si un ProductoLocal corresponde a un combo (para guards en endpoints
// que reciben productoLocalId). `db` = prisma o tx.
export async function productoLocalEsCombo(db, productoLocalId) {
  const id = Number(productoLocalId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const pl = await db.productoLocal.findUnique({
    where: { id },
    select: { base: { select: { es_combo: true } } },
  });
  return esComboBase(pl?.base);
}

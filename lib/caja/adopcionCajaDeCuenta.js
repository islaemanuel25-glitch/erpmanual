// lib/caja/adopcionCajaDeCuenta.js
//
// LA ADOPCIÓN, del lado del servidor. La regla —qué caja se adopta— es pura y
// vive en `cajaDeCuentaAAdoptar` (lib/caja/cierreRelevo.js). Acá solo se lee y
// se marca.
//
// Ocurre SOLA, cuando una cuenta de dueño o Admin usa el POS sin PIN: no hay un
// script que recorra filas. Una caja vieja de esa cuenta pasa a llevar
// `operaLaCuenta = true` y desde ahí es su caja de cuenta, con todas sus
// ventas, sin cerrar nada. Quien llama ya comprobó el rol
// (`puedeOperarSinOperador`).

import prisma from "@/lib/prisma";
import { cajaDeCuentaAAdoptar } from "./cierreRelevo";

/**
 * Adopta, si corresponde, la caja de cuenta vieja de `usuarioId` en `localId`.
 *
 * @returns {Promise<number|null>} el id de la caja adoptada, o null.
 */
export async function adoptarCajaDeCuentaVieja({ localId, usuarioId }, db = prisma) {
  const local = Number(localId);
  const cuenta = Number(usuarioId);
  if (!Number.isInteger(local) || local <= 0 || !Number.isInteger(cuenta) || cuenta <= 0) return null;

  const cajas = await db.turno.findMany({
    where: { localId: local, vendedorId: cuenta, operadorId: null, cierre: null, anuladoEn: null },
    select: { id: true, apertura: true, vendedorId: true, operadorId: true, operaLaCuenta: true, cierre: true, anuladoEn: true },
  });
  const elegida = cajaDeCuentaAAdoptar(cajas, { usuarioId: cuenta });
  if (!elegida) return null;

  // El WHERE repite la regla: si entre la lectura y acá la caja cambió —se
  // cerró, otro pedido ya la adoptó— no se escribe nada. Dos pedidos
  // simultáneos eligen la misma, la más reciente, así que no quedan dos.
  const { count } = await db.turno.updateMany({
    where: {
      id: elegida.id,
      localId: local,
      vendedorId: cuenta,
      operadorId: null,
      cierre: null,
      anuladoEn: null,
      OR: [{ operaLaCuenta: null }, { operaLaCuenta: false }],
    },
    data: { operaLaCuenta: true },
  });
  return count === 1 ? elegida.id : null;
}

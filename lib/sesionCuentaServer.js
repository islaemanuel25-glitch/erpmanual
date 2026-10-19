// lib/sesionCuentaServer.js
//
// La sesión de la cuenta contra la base. Lo llama `proxy.js` en cada pedido que
// trae la cookie de la cuenta; la regla pura vive en `lib/sesionCuenta.js`.
//
// Tres salidas:
//
//   · SEGUIR: no hay token, la firma no vale (eso ya lo rechaza cada ruta, como
//     siempre), o vale y la foto está al día.
//   · CORTAR: el usuario no existe, está inactivo, o se le cambió la contraseña
//     después de emitida la sesión. El proxy saca la cookie del pedido —la ruta
//     ve "sin sesión" y contesta 401 como siempre— y la borra del navegador.
//   · RENOVAR: la sesión vale pero la foto (permisos, rol, local) cambió en la
//     base, o es un token de antes de esta regla, con `exp`. Se firma otro con
//     el mismo `emitidoEn`: renovar no rejuvenece la sesión frente a una
//     invalidación.

import { verificarToken, firmarTokenDeSesion } from "@/lib/auth";
import { emitidoEnDelToken } from "@/lib/operador-sesion";
import { SELECT_USUARIO_DE_SESION, payloadDeSesion, fotoDesactualizada, sesionDeCuentaVigente } from "@/lib/sesionCuenta";

export const ACCION_SESION = Object.freeze({ SEGUIR: "SEGUIR", CORTAR: "CORTAR", RENOVAR: "RENOVAR" });

/**
 * @returns {Promise<{accion:"SEGUIR"} | {accion:"CORTAR"} | {accion:"RENOVAR", token:string}>}
 */
export async function revisarSesionDeCuenta(db, token) {
  if (!token) return { accion: ACCION_SESION.SEGUIR };
  const data = verificarToken(token);
  const id = Number(data?.id);
  // Un token de otro tipo —PIN, voucher, llave de corte— no es una sesión de
  // cuenta y nunca se renueva como si lo fuera.
  if (!data || data._tipo != null || !Number.isInteger(id) || id <= 0) return { accion: ACCION_SESION.SEGUIR };

  const usuario = await db.usuario.findUnique({ where: { id }, select: SELECT_USUARIO_DE_SESION });
  if (!sesionDeCuentaVigente(usuario, data)) return { accion: ACCION_SESION.CORTAR };

  const actual = payloadDeSesion(usuario);
  if (data.exp == null && !fotoDesactualizada(data, actual)) return { accion: ACCION_SESION.SEGUIR };
  return {
    accion: ACCION_SESION.RENOVAR,
    token: firmarTokenDeSesion(actual, { emitidoEn: emitidoEnDelToken(data) ?? Date.now() }),
  };
}

// lib/caja/llaveDeCorte.js
//
// LA LLAVE DEL CORTE: con qué prueba el operador de una caja, al confirmar o
// cancelar un cierre o un retiro, que es él quien lo pide.
//
// El conteo va por token y en otra pestaña, a propósito: mientras el saliente
// cuenta, el relevo hace PIN en el mismo navegador y la cookie del operador
// pasa a ser la suya. Por eso la pantalla del conteo no puede pedir el PIN
// activo. Pero el token solo tampoco alcanza: cualquiera que usara la cuenta
// confirmaba la caja de otro.
//
// La llave es una cookie httpOnly firmada que se entrega al tomar el corte, con
// el `path` del corte, así que el navegador la manda únicamente a las rutas de
// ESE token. Dice qué corte es y de qué operador; la regla que la lee es
// `puedeResolverCorte` (lib/caja/cierreRelevo.js), que es pura.

import { firmarToken, verificarToken, getCookieValue } from "@/lib/auth";
import { getOperadorActivoDelLocal, puedeOperarSinOperador } from "@/lib/operador";
import { puedeResolverCorte, ERROR_CORTE_DE_OTRO_OPERADOR } from "./cierreRelevo";
import { adoptarCajaDeCuentaVieja } from "./adopcionCajaDeCuenta";

const TIPO_LLAVE = "llave_corte";
// Igual que el PIN (lib/operador.js): si la llave venció, el operador vuelve a
// hacer PIN y su cookie de operador lo identifica.
const LLAVE_MAX_AGE = 60 * 60 * 8;

const RUTA = { cierre: "cierres", retiro: "retiros" };
const NOMBRE = { cierre: "erpazul_llave_cierre", retiro: "erpazul_llave_retiro" };

function tipoValido(tipo) {
  if (!RUTA[tipo]) throw new Error(`llaveDeCorte: tipo desconocido ${tipo}`);
  return tipo;
}

/**
 * Pone la llave del corte en la respuesta de `iniciar`. Solo se entrega a quien
 * tomó el corte como dueño de la caja: el operador con su PIN, o la cuenta del
 * dueño o Admin sobre la caja de su cuenta (`cuentaId`). Un cierre forzado o
 * un retiro intervenido no la llevan: quien los toma no es el dueño de la caja.
 */
export function entregarLlaveDeCorte(res, { tipo, token, operadorId = null, cuentaId = null }) {
  tipoValido(tipo);
  const llave = firmarToken({
    _tipo: TIPO_LLAVE,
    tipo,
    token: String(token),
    operadorId: operadorId == null ? null : Number(operadorId),
    cuentaId: cuentaId == null ? null : Number(cuentaId),
  });
  res.cookies.set(NOMBRE[tipo], llave, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/pos-ventas/${RUTA[tipo]}/${token}`,
    maxAge: LLAVE_MAX_AGE,
  });
  return res;
}

const idOnull = (v) => {
  const n = Number(v);
  return v != null && Number.isInteger(n) && n > 0 ? n : null;
};

/** Lo que dice la llave de ESTE corte: el operador o la cuenta dueña. */
export function llaveDelCorte(req, { tipo, token }) {
  tipoValido(tipo);
  const nada = { operadorId: null, cuentaId: null };
  const crudo = getCookieValue(req, NOMBRE[tipo]);
  if (!crudo) return nada;
  const data = verificarToken(crudo);
  if (!data || data._tipo !== TIPO_LLAVE || data.tipo !== tipo) return nada;
  if (String(data.token) !== String(token)) return nada;
  return { operadorId: idOnull(data.operadorId), cuentaId: idOnull(data.cuentaId) };
}

/**
 * ¿Quien pide puede confirmar o cancelar este corte? Junta las pruebas de
 * identidad que hay en la request y se las pasa a `puedeResolverCorte`.
 *
 * @returns {Promise<{ ok:true } | { ok:false, status:number, error:string }>}
 */
export async function autorizarResolucionDeCorte(req, { session, localId, turno, tipo, token, forzado, accion }) {
  const pin = await getOperadorActivoDelLocal(req, localId);
  const llave = llaveDelCorte(req, { tipo, token });
  // Un corte de una caja vieja del dueño o Admin, tomado antes del despliegue:
  // si quien pide es esa misma cuenta, sin PIN, la caja se adopta igual que al
  // entrar al POS, y el corte lo termina ella.
  if (!pin && puedeOperarSinOperador(session, { localId }) && turno?.operadorId == null && turno?.operaLaCuenta !== true) {
    const adoptada = await adoptarCajaDeCuentaVieja({ localId, usuarioId: session?.id });
    if (adoptada != null && adoptada === turno.id) turno = { ...turno, operaLaCuenta: true };
  }
  const ok = puedeResolverCorte(turno, {
    operadorDelPin: pin?.operadorId ?? null,
    operadorDeLaLlave: llave.operadorId,
    cuentaDeLaLlave: llave.cuentaId,
    usuarioId: session?.id ?? null,
    // Un cierre forzado o un retiro intervenido: tomados por un Admin o el
    // dueño sobre la caja de otro, los termina quien puede forzar.
    forzado: forzado === true,
    puedeForzar: puedeOperarSinOperador(session, { localId }),
    accion,
  });
  return ok ? { ok: true } : { ok: false, status: 403, error: ERROR_CORTE_DE_OTRO_OPERADOR };
}

import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { firmarToken, verificarToken, verificarTokenIgnorandoVencimiento, getCookieValue } from "@/lib/auth";
import { seedAuditoria } from "@/lib/auditoria/contexto";
import { puedeOperarSinOperador } from "@/lib/operador-exencion";
import { getExigirOperador } from "@/lib/config/local";
import { adoptarCajaDeCuentaVieja } from "@/lib/caja/adopcionCajaDeCuenta";
import { emitidoEnDelToken, sesionDeOperadorVigente } from "@/lib/operador-sesion";

// Re-export para compatibilidad: la regla vive en el módulo puro
// lib/operador-exencion.js (testeable, sin imports de servidor).
export { puedeOperarSinOperador };

const OPERADOR_COOKIE = "erpazul_operador_activo";
const OPERADOR_VOUCHER_TIPO = "operador_voucher";
// LA SESIÓN DE PIN NO VENCE POR RELOJ. Dura hasta que el operador sale
// (`/api/operador/logout` borra la cookie) o hasta que se cierra su caja
// (`invalidarSesionDeOperador`). Con 8 horas, un turno largo pedía el PIN a mitad
// de la caja. Lo que decide si vale es el servidor —operador activo, del local,
// emitido después de `sesionInvalidadaEn`—, no el vencimiento: por eso el token
// se firma sin `exp` y la cookie dura lo máximo que guarda un navegador (400 días).
const OPERADOR_MAX_AGE = 60 * 60 * 24 * 400;

const isProd = process.env.NODE_ENV === "production";

export const OperadorCookie = {
  nombre: OPERADOR_COOKIE,
  opciones: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: OPERADOR_MAX_AGE,
  },
};

/**
 * Firma un token de operador activo (separado del JWT principal).
 */
export function firmarTokenOperador(payload) {
  // `emitidoEn` en milisegundos: la sesión vale solo si se emitió DESPUÉS del
  // último cierre de caja del operador (`sesionDeOperadorVigente`). El `iat`
  // está en segundos, y un PIN puesto en el mismo segundo del cierre se
  // confundiría con uno de antes.
  //
  // Sin `expiresIn`, y por eso no pasa por `firmarToken`: ése es el del JWT
  // principal del usuario, que sigue con sus 8 horas. Misma clave, otro tipo.
  return jwt.sign({ ...payload, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET);
}

/**
 * CERRAR LA CAJA CIERRA LA SESIÓN DE PIN DE SU OPERADOR, en todos los
 * dispositivos: desde `ahora` no vale ningún token emitido antes. Va adentro de
 * la transacción del cierre, así no hay caja cerrada con sesión viva. Una caja
 * de cuenta (sin operador) no tiene sesión que cerrar.
 */
export async function invalidarSesionDeOperador(tx, operadorId, ahora = new Date()) {
  const id = Number(operadorId);
  if (!Number.isInteger(id) || id <= 0) return;
  await tx.operadorLocal.updateMany({ where: { id }, data: { sesionInvalidadaEn: ahora } });
}

/**
 * Borra la cookie de PIN en la respuesta del cierre, si es la del operador de
 * la caja que se cerró: el navegador que cerró queda sin operador aunque la
 * señal entre pestañas no llegue. Si en ese navegador está identificado OTRO
 * operador —un relevo—, su sesión no se toca.
 */
export function limpiarCookieDeOperadorCerrado(req, res, operadorId) {
  const op = getOperadorActivo(req);
  if (op?.operadorId == null || Number(op.operadorId) !== Number(operadorId)) return;
  res.cookies.set(OperadorCookie.nombre, "", { ...OperadorCookie.opciones, maxAge: 0 });
}

/**
 * Obtiene el operador activo desde la cookie de la request.
 * Retorna { operadorId, nombre, localId } o null.
 */
export function getOperadorActivo(req) {
  const token = getCookieValue(req, OPERADOR_COOKIE);
  if (!token) return null;

  const data = verificarToken(token);
  if (!data || data._tipo !== "operador") return null;

  // Auditoría: sembramos la identidad operativa para el interceptor de Prisma.
  seedAuditoria({
    operadorId: data.operadorId ?? null,
    operadorNombre: data.nombre ?? null,
    localId: data.localId ?? null,
  });

  return {
    operadorId: data.operadorId ?? null,
    nombre: data.nombre ?? null,
    localId: data.localId ?? null,
    emitidoEn: emitidoEnDelToken(data),
  };
}

/**
 * ¿La sesión de PIN de la cookie sigue valiendo en el servidor? La firma no
 * alcanza: el cierre de la caja la invalida (`invalidarSesionDeOperador`).
 */
export async function sesionDeOperadorSigueVigente(op) {
  const operadorId = Number(op?.operadorId);
  if (!Number.isInteger(operadorId) || operadorId <= 0) return false;
  const fila = await prisma.operadorLocal.findUnique({
    where: { id: operadorId },
    select: { sesionInvalidadaEn: true },
  });
  return sesionDeOperadorVigente({ emitidoEn: op.emitidoEn, sesionInvalidadaEn: fila?.sesionInvalidadaEn ?? null });
}

/**
 * El operador activo, VALIDADO contra el local de la operación.
 *
 * La cookie dice quién hizo PIN y en qué local; firmada, no se puede fabricar,
 * pero sola no alcanza para decidir de quién es una caja:
 *
 *   · se firmó para UN local. Llevada a otro —un Admin que cambia de
 *     contexto— identificaría a alguien que no se identificó acá;
 *   · no vence por reloj. Un operador desactivado después del PIN seguiría
 *     operando mientras la cookie viva;
 *   · y sobrevivía al cierre de su caja: con la cookie viva se abría una caja
 *     NUEVA a su nombre sin que nadie pusiera el PIN (la #951).
 *
 * Se exige lo mismo que exige `/api/operador/login` al firmarla: que el local de
 * la cookie sea el de la operación, que el operador sea de ese local
 * (`OperadorLocal.localId`) y que siga `activo`. Si algo no se cumple, es como si no
 * hubiera operador: quien lo pide decide si eso es un 428 o una caja de cuenta.
 *
 * El `localId` DEBE ser el ya autorizado por el scope del endpoint.
 *
 * @returns {Promise<{ operadorId:number, nombre:string|null, localId:number } | null>}
 */
export async function getOperadorActivoDelLocal(req, localId) {
  const op = getOperadorActivo(req);
  const operadorId = Number(op?.operadorId);
  if (!Number.isInteger(operadorId) || operadorId <= 0) return null;
  const local = Number(localId);
  if (!Number.isInteger(local) || local <= 0) return null;
  if (Number(op.localId) !== local) return null;

  const operador = await prisma.operadorLocal.findUnique({
    where: { id: operadorId },
    select: { activo: true, localId: true, sesionInvalidadaEn: true },
  });
  if (operador?.activo !== true || operador.localId !== local) return null;
  // Y que la sesión sea POSTERIOR al último cierre de su caja: cerrar la caja
  // cierra la sesión en todos los dispositivos. Un token de antes del cierre
  // es como no tener operador: quien lo pide contesta 428 y el POS pide el PIN.
  if (!sesionDeOperadorVigente({ emitidoEn: op.emitidoEn, sesionInvalidadaEn: operador.sesionInvalidadaEn })) return null;

  return { operadorId, nombre: op.nombre ?? null, localId: local };
}

/**
 * Exige operador activo Y válido en el local de la operación.
 * Retorna { ok, operador } o { ok: false, error, status }.
 */
export async function requireOperador(req, { localId } = {}) {
  const operador = await getOperadorActivoDelLocal(req, localId);
  if (!operador || !operador.operadorId) {
    return {
      ok: false,
      status: 428,
      error: "Se requiere un operador activo para esta acción.",
      needsOperador: true,
    };
  }
  return { ok: true, operador };
}

/**
 * Firma un VOUCHER de operador: prueba infalsificable de que este operador
 * estuvo activo en este local. Se entrega al cliente (login / me) para que lo
 * adjunte a las ventas que encola offline. Tipo distinto al token de la cookie:
 * NO sirve como sesión de operador (getOperadorActivo lo rechaza), así que su
 * exposición a JS es de bajo riesgo.
 */
export function firmarVoucherOperador({ operadorId, localId }) {
  return firmarToken({ operadorId, localId, _tipo: OPERADOR_VOUCHER_TIPO });
}

/**
 * Verifica un voucher de operador IGNORANDO el vencimiento. Retorna el
 * operadorId solo si la firma es válida, el tipo coincide y el localId coincide
 * con el de la venta. Si no, null (la venta se persiste sin operador antes que
 * perderse). Un cliente sin AUTH_SECRET no puede fabricar un voucher válido:
 * por eso no puede atribuir una venta offline a un operador que no autenticó.
 */
export function verificarVoucherOperador(voucher, localId) {
  if (!voucher) return null;
  const data = verificarTokenIgnorandoVencimiento(voucher);
  if (!data || data._tipo !== OPERADOR_VOUCHER_TIPO) return null;
  if (Number(data.localId) !== Number(localId)) return null;
  const id = Number(data.operadorId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Exige operador activo SALVO que el usuario esté exento (Admin, o DUEÑO_LOCAL en
 * SU local). Para el exento el operador es opcional: opera sin operario y la
 * operación queda con operadorId = null (mismo patrón que el Admin histórico).
 * Para el resto (CAJERO/ENCARGADO), sin operario activo → rechazo 428.
 *
 * IMPORTANTE: el `localId` que se pasa acá DEBE ser el local YA resuelto y
 * autorizado por el scope del endpoint (resolveScope/resolveLocalAndGrupo), nunca
 * el crudo del body/query. Así el bypass de DUEÑO_LOCAL solo aplica en su local.
 *
 * @param {Request} req
 * @param {{ esAdmin?: boolean, esDuenoLocal?: boolean, localId?: number|null }} session
 * @param {{ localId?: number|null }} ctx - local autorizado de la operación
 * @returns {{ ok:true, operadorId:number|null }}
 *        | {{ ok:false, status:number, error:string, needsOperador:true }}
 */
export async function requireOperadorSalvoDueno(req, session, { localId } = {}) {
  if (puedeOperarSinOperador(session, { localId })) {
    const op = await getOperadorActivoDelLocal(req, localId);
    return { ok: true, operadorId: op?.operadorId ?? null };
  }
  const r = await requireOperador(req, { localId });
  if (!r.ok) return r;
  return { ok: true, operadorId: r.operador.operadorId };
}

/**
 * Igual que requireOperadorSalvoDueno pero además respeta el flag POR LOCAL
 * `exigirOperador` (ConfiguracionLocal). Orden de exención:
 *   1. Rol: Admin, o DUEÑO_LOCAL en SU local (puedeOperarSinOperador) → opcional.
 *   2. Config del local: si la ubicación desactivó el operario obligatorio
 *      (`exigirOperador === false`) → opcional para TODOS (incluido CAJERO).
 *   3. Si no, se exige operario activo (428 si no hay).
 *
 * Es async (lee la config del local). El `localId` DEBE ser el ya autorizado por
 * el scope del endpoint (resolveScope/resolveLocalAndGrupo), nunca el crudo del
 * request: así la exención por config solo aplica a la ubicación autorizada.
 *
 * @param {Request} req
 * @param {{ esAdmin?: boolean, esDuenoLocal?: boolean, localId?: number|null }} session
 * @param {{ localId?: number|null }} ctx - local autorizado de la operación
 * @returns {Promise<{ ok:true, operadorId:number|null }
 *        | { ok:false, status:number, error:string, needsOperador:true }>}
 */
export async function requireOperadorSegunConfig(req, session, { localId } = {}) {
  if (puedeOperarSinOperador(session, { localId })) {
    const op = await getOperadorActivoDelLocal(req, localId);
    return { ok: true, operadorId: op?.operadorId ?? null };
  }
  // Fail-closed: sin localId autorizado, getExigirOperador devuelve true.
  const exigir = await getExigirOperador(localId);
  if (exigir === false) {
    const op = await getOperadorActivoDelLocal(req, localId);
    return { ok: true, operadorId: op?.operadorId ?? null };
  }
  const r = await requireOperador(req, { localId });
  if (!r.ok) return r;
  return { ok: true, operadorId: r.operador.operadorId };
}

/**
 * La puerta de la CAJA: quién es el operador de la caja que se va a usar.
 *
 *   · Con un PIN validado en el local, ese operador. Siempre manda el PIN: si
 *     alguien se identifica en la cuenta del dueño, opera SU caja.
 *   · Sin PIN, SOLO el dueño del local en su local o el Admin
 *     (`puedeOperarSinOperador`): su cuenta hace de operador
 *     (`cuentaOpera: true`), y su caja es solo de esa cuenta.
 *   · Cualquier otra cuenta —cajero, encargado, y también en un local con
 *     `exigirOperador = false`— sin PIN no tiene caja: 428.
 *
 * Una caja es de UNA persona, y la diferencia de efectivo es suya y no se
 * compensa con la de nadie. Antes, una cuenta compartida sin PIN abría una caja
 * sin operador y todos la compartían: en Mini unidas, las cajas 836 a 872 con
 * la cuenta de Estefi, y con esa misma cuenta se cerró la 881 de Belén con un
 * retiro de $46.900 adentro. La configuración del local ya no exime a nadie.
 *
 * La exención de `requireOperadorSegunConfig` sigue valiendo para lo que no es
 * una caja (pedidos entre locales, por ejemplo).
 *
 * @returns {Promise<{ ok:true, operadorId:number|null, cuentaOpera:boolean }
 *        | { ok:false, status:number, error:string, needsOperador:true }>}
 */
export async function requireOperadorDeCaja(req, session, { localId } = {}) {
  const r = await requireOperador(req, { localId });
  if (r.ok) return { ok: true, operadorId: r.operador.operadorId, cuentaOpera: false };
  if (puedeOperarSinOperador(session, { localId })) {
    // La caja vieja que ESTA cuenta abrió sin operador antes del despliegue
    // pasa a ser su caja de cuenta, y sigue vendiendo en ella. Ver
    // `cajaDeCuentaAAdoptar`.
    await adoptarCajaDeCuentaVieja({ localId, usuarioId: session?.id });
    return { ok: true, operadorId: null, cuentaOpera: true };
  }
  return { ...r, error: "Para usar una caja tenés que identificarte con tu PIN." };
}

/**
 * Resuelve contexto completo para auditoría:
 * - usuario autenticado (acceso)
 * - operador activo (identidad operativa)
 * - local activo
 * Retorna un objeto plano listo para persistir en logs.
 */
export function resolveContextoAuditoria(req, session, extra = {}) {
  const operador = getOperadorActivo(req);
  return {
    usuarioId: session?.id ?? null,
    operadorId: operador?.operadorId ?? null,
    operadorNombre: operador?.nombre ?? null,
    localId: session?.localId ?? extra.localId ?? operador?.localId ?? null,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

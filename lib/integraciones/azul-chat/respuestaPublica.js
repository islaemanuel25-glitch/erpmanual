// lib/integraciones/azul-chat/respuestaPublica.js
//
// LO QUE SALE POR HTTP. Los códigos de la puerta son DETALLADOS a propósito
// —sirven para los candados y para el log— y no todos se le pueden decir a
// quien llama. Esta pieza los traduce a un juego PÚBLICO, chico y estable.
//
// ── LO QUE NO SE DISTINGUE DESDE AFUERA, Y POR QUÉ ─────────────────────────
//
//   · Firma mala, marca vencida, marca mal escrita, aplicación desconocida:
//     todo es 401 SOLICITUD_NO_AUTENTICADA. A quien no tiene el secreto no se
//     le dice en qué falló.
//   · Sin secreto, secreto corto, secreto igual a AUTH_SECRET: 503
//     INTEGRACION_NO_DISPONIBLE. Se dice que está apagada, no por qué.
//   · Token de delegación inexistente, mal escrito o de un vínculo revocado, y
//     usuario inexistente: todo es 403 VINCULO_NO_VALIDO. La ruta no sirve
//     para enumerar usuarios ni vínculos. Para Azul Chat significan lo mismo:
//     la persona tiene que volver a autorizar desde el ERP.
//   · En el CANJE, código inexistente, mal escrito, vencido, ya usado, de un
//     vínculo revocado, o de una persona inactiva o inexistente: todo es 403
//     CODIGO_NO_VALIDO, con el mismo texto. Quien prueba códigos no aprende
//     cuál de las cosas falló — ni si el código existió alguna vez.
//   · Inactivo, sin permiso, fuera de alcance, grupo o local manipulado: 403
//     NO_AUTORIZADO. Ya hay un vínculo válido de esa persona: es lo mismo que
//     el ERP le diría a ella, sin el detalle.
//   · Un error al calcular: 500 ERROR_AL_CALCULAR con una REFERENCIA al azar,
//     que es la misma que queda en el log junto al motivo real. Ni mensaje de
//     Prisma, ni SQL, ni stack.
//
// Lo que SÍ se dice tal cual: el período inválido (ayuda a corregir el pedido
// y no revela nada del ERP), la capacidad que no está en el catálogo, y el
// cupo agotado con cuándo reintentar.
//
// Un código interno que no está en esta tabla sale como 500: falla cerrado.

import crypto from "node:crypto";

export const PUBLICOS = Object.freeze({
  SOLICITUD_NO_AUTENTICADA: { status: 401, error: "La solicitud no está autenticada." },
  INTEGRACION_NO_DISPONIBLE: { status: 503, error: "La integración no está disponible." },
  SOLICITUD_INVALIDA: { status: 400, error: "La solicitud no tiene la forma esperada." },
  PERIODO_INVALIDO: { status: 400, error: null },
  PERIODO_DEMASIADO_LARGO: { status: 400, error: null },
  CAPACIDAD_NO_DISPONIBLE: { status: 403, error: "La capacidad pedida no está disponible." },
  VINCULO_NO_VALIDO: { status: 403, error: "El usuario no tiene un vínculo válido con esta aplicación." },
  CODIGO_NO_VALIDO: { status: 403, error: "El código no es válido o ya no se puede usar. Generá uno nuevo desde el ERP." },
  NO_AUTORIZADO: { status: 403, error: "El usuario no está autorizado para esta consulta." },
  LIMITE_EXCEDIDO: { status: 429, error: "Demasiadas consultas en poco tiempo." },
  ERROR_AL_CALCULAR: { status: 500, error: "No se pudo calcular la consulta. Reintentá más tarde." },
  // Los tres de la capa HTTP, que no pasan por la puerta.
  TIPO_DE_CONTENIDO_INVALIDO: { status: 415, error: "El cuerpo tiene que ser application/json." },
  CUERPO_DEMASIADO_GRANDE: { status: 413, error: "El cuerpo es demasiado grande." },
});

/** Código interno de la puerta → código público. */
export const TRADUCCION = Object.freeze({
  APLICACION_DESCONOCIDA: "SOLICITUD_NO_AUTENTICADA",
  MARCA_INVALIDA: "SOLICITUD_NO_AUTENTICADA",
  MARCA_VENCIDA: "SOLICITUD_NO_AUTENTICADA",
  FIRMA_INVALIDA: "SOLICITUD_NO_AUTENTICADA",
  INTEGRACION_DESHABILITADA: "INTEGRACION_NO_DISPONIBLE",
  SECRETO_DEBIL: "INTEGRACION_NO_DISPONIBLE",
  SECRETO_COMPARTIDO: "INTEGRACION_NO_DISPONIBLE",
  CUERPO_INVALIDO: "SOLICITUD_INVALIDA",
  PEDIDO_INVALIDO: "SOLICITUD_INVALIDA",
  PERIODO_INVALIDO: "PERIODO_INVALIDO",
  PERIODO_DEMASIADO_LARGO: "PERIODO_DEMASIADO_LARGO",
  CAPACIDAD_FUERA_DE_CATALOGO: "CAPACIDAD_NO_DISPONIBLE",
  DELEGACION_INEXISTENTE: "VINCULO_NO_VALIDO",
  VINCULO_REVOCADO: "VINCULO_NO_VALIDO",
  USUARIO_INEXISTENTE: "VINCULO_NO_VALIDO",
  CANJE_CODIGO_INEXISTENTE: "CODIGO_NO_VALIDO",
  CANJE_CODIGO_VENCIDO: "CODIGO_NO_VALIDO",
  CANJE_CODIGO_USADO: "CODIGO_NO_VALIDO",
  CANJE_VINCULO_REVOCADO: "CODIGO_NO_VALIDO",
  CANJE_USUARIO_NO_HABILITADO: "CODIGO_NO_VALIDO",
  USUARIO_INACTIVO: "NO_AUTORIZADO",
  SIN_PERMISO: "NO_AUTORIZADO",
  FUERA_DE_ALCANCE: "NO_AUTORIZADO",
  GRUPO_LOCAL_INCONSISTENTE: "NO_AUTORIZADO",
  LOCAL_SIN_GRUPO: "NO_AUTORIZADO",
  LIMITE_EXCEDIDO: "LIMITE_EXCEDIDO",
  CAPACIDAD_SIN_EJECUTOR: "ERROR_AL_CALCULAR",
  ERROR_AL_CALCULAR: "ERROR_AL_CALCULAR",
});

/** Las cabeceras de toda respuesta de esta frontera. Sin CORS: es de servidor a servidor. */
export const CABECERAS_RESPUESTA = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});

/**
 * Un código público, con su estado y su texto fijo.
 *
 * @param {string} codigo uno de PUBLICOS.
 * @param {{error?:string, referencia?:string, reintentarEnSegundos?:number}} [extra]
 */
export function rechazoPublico(codigo, extra = {}) {
  const p = PUBLICOS[codigo] ?? PUBLICOS.ERROR_AL_CALCULAR;
  const publico = PUBLICOS[codigo] ? codigo : "ERROR_AL_CALCULAR";
  const cuerpo = { ok: false, codigo: publico, error: p.error ?? extra.error ?? PUBLICOS.SOLICITUD_INVALIDA.error };
  const cabeceras = { ...CABECERAS_RESPUESTA };
  if (extra.referencia) cuerpo.referencia = extra.referencia;
  if (publico === "LIMITE_EXCEDIDO" && Number.isFinite(extra.reintentarEnSegundos)) {
    cuerpo.reintentarEnSegundos = extra.reintentarEnSegundos;
    cabeceras["Retry-After"] = String(extra.reintentarEnSegundos);
  }
  return { status: p.status, cuerpo, cabeceras };
}

/**
 * El resultado de `atenderSolicitud`, traducido.
 *
 * @param {{status:number, cuerpo:object}} resultado
 * @returns {{status:number, cuerpo:object, cabeceras:object, interno:string|null, referencia:string|null}}
 */
export function aRespuestaPublica(resultado) {
  if (resultado?.status === 200 && resultado.cuerpo?.ok === true) {
    return { status: 200, cuerpo: { ok: true, datos: resultado.cuerpo.datos }, cabeceras: { ...CABECERAS_RESPUESTA }, interno: null, referencia: null };
  }
  const interno = typeof resultado?.cuerpo?.codigo === "string" ? resultado.cuerpo.codigo : null;
  const publico = interno && Object.prototype.hasOwnProperty.call(TRADUCCION, interno) ? TRADUCCION[interno] : "ERROR_AL_CALCULAR";
  // La referencia solo cuando hubo un error nuestro: es lo que une la respuesta
  // con su renglón del log.
  const referencia = publico === "ERROR_AL_CALCULAR" ? crypto.randomUUID() : null;
  const r = rechazoPublico(publico, {
    // El texto del período lo escribe `resolverPeriodo` y es seguro de mostrar.
    error: publico === "PERIODO_INVALIDO" || publico === "PERIODO_DEMASIADO_LARGO" ? resultado.cuerpo.error : undefined,
    referencia,
    reintentarEnSegundos: resultado?.cuerpo?.reintentarEnSegundos,
  });
  return { ...r, interno, referencia };
}

// lib/compras-proveedor/comprobante/lector/cadena.js
//
// TITULAR Y RESPALDO, CON EL PASE EXPLÍCITO.
//
// ── POR QUÉ HAY DOS ────────────────────────────────────────────────────────
//
// Sale de la medición del 2026-08-11, no de una preferencia: Groq admite unas
// CUATRO IMÁGENES POR MINUTO —8000 tokens por minuto, 1805 por imagen—, así que
// un pedido con seis facturas se traba a mitad de camino. Gemini tiene mucho más
// margen. Con dos lectores, que uno se quede sin cuota deja de frenar la
// recepción.
//
// ── EL PASE ES EXPLÍCITO, NO "PROBAR CON TODOS" ────────────────────────────
//
// Solo se pasa al respaldo por CUOTA_AGOTADA o SERVICIO_CAIDO: los dos casos en
// que el titular no pudo INTENTAR. Y solo por esos.
//
// Lo que deliberadamente NO dispara el pase:
//
//   · RESPUESTA_ILEGIBLE — el titular contestó, pero mal. Eso es calidad de
//     lectura, no disponibilidad. Reintentar con otro convertiría "el modelo se
//     equivocó" en "probemos hasta que alguno diga algo", y el que dijera algo
//     ganaría por insistencia y no por acertar. La puerta lo atajaría igual,
//     pero el rastro quedaría contando una historia falsa.
//   · ARCHIVO_NO_SOPORTADO — es una diferencia de capacidad, no una falla.
//   · NO_CONFIGURADO del titular — si nadie lo configuró, no falló: falta
//     configurarlo, y taparlo con el respaldo haría que el titular quedara sin
//     usar sin que nadie se entere.
//
// ── QUEDA REGISTRADO CUÁL LEYÓ ─────────────────────────────────────────────
//
// `modeloLectura` guarda el nombre del modelo, y los dos son inconfundibles
// —`gemini-2.5-flash` contra `qwen/qwen3.6-27b`—, así que no hace falta una
// columna nueva para saber quién leyó cada comprobante. La cadena además informa
// `usoRespaldo` y `porQuePaso`, para poder contar cuántas veces el titular se
// quedó sin cuota sin tener que deducirlo.

import { elegirLector, MOTIVO_LECTURA } from "./contrato.js";

// ⚠️ EL PARÁMETRO ES `archivos`, EN PLURAL, Y NO ES UN DETALLE.
//
// Este eslabón quedó en `archivo` singular cuando los lectores pasaron a
// recibir varias fotos, el 2026-08-11. La ruta mandaba `archivos`, los lectores
// esperaban `archivos`, y el del medio los tiraba: el lector recibía una lista
// vacía y devolvía ARCHIVO_NO_SOPORTADO.
//
// Lo peor no fue que fallara, sino CÓMO: ARCHIVO_NO_SOPORTADO es de los motivos
// que a propósito NO pasan al respaldo, porque es capacidad y no
// disponibilidad. Así que la regla del pase funcionó perfecto sobre un motivo
// falso, y el respaldo nunca se intentó. La lectura no anduvo NI UNA VEZ, y el
// síntoma señalaba a la pieza equivocada.
//
// El candado que había probaba la cadena con lectores de mentira que aceptaban
// cualquier cosa, así que no podía ver el desajuste. Ahora hay uno que ejerce
// ruta → cadena → lector con la firma real.

/** Los únicos motivos que pasan al respaldo. */
export const MOTIVOS_QUE_PASAN = Object.freeze([
  MOTIVO_LECTURA.CUOTA_AGOTADA,
  MOTIVO_LECTURA.SERVICIO_CAIDO,
  // Tardar más de la cuenta es no haber podido contestar, igual que estar
  // caído: el titular no dio ninguna lectura, buena ni mala.
  MOTIVO_LECTURA.TARDO_DEMASIADO,
]);

export function correspondePasarAlRespaldo(motivo) {
  return MOTIVOS_QUE_PASAN.includes(motivo);
}

/**
 * Quiénes son el titular y el respaldo, según la configuración.
 *
 * Sin respaldo configurado la cadena tiene un solo eslabón y se comporta
 * exactamente como antes. No hay respaldo por defecto: elegir en silencio un
 * segundo proveedor sería mandarle datos a un servicio que nadie eligió.
 */
export function armarCadena({
  titular = process.env.COMPROBANTE_LECTOR,
  respaldo = process.env.COMPROBANTE_LECTOR_RESPALDO,
  env = process.env,
} = {}) {
  const t = elegirLector({ nombre: titular, env });
  const nombreRespaldo = String(respaldo ?? "").trim();

  // El respaldo se resuelve ahora, no cuando haga falta: si está mal
  // configurado, es mejor saberlo antes que descubrirlo justo cuando el titular
  // se cayó, que es el peor momento para enterarse.
  const r = nombreRespaldo ? elegirLector({ nombre: nombreRespaldo, env }) : null;

  return {
    titular: t,
    respaldo: r,
    // Que el mismo lector sea titular y respaldo no es un respaldo: si se quedó
    // sin cuota, se va a quedar sin cuota otra vez.
    respaldoInutil:
      !!r?.ok && !!t?.ok && r.lector.nombre === t.lector.nombre,
  };
}

/**
 * Lee con el titular y, si corresponde, con el respaldo.
 *
 * Devuelve SIEMPRE de dónde salió la lectura y por qué se pasó, aunque haya
 * salido del titular: sin eso, contar cuántas veces hubo que usar el respaldo
 * obligaría a deducirlo del nombre del modelo.
 */
export async function leerConCadena({ cadena, archivos, receta, proveedorNombre = null } = {}) {
  const { titular, respaldo, respaldoInutil } = cadena || {};

  if (!titular?.ok) {
    // El titular ni siquiera está disponible. NO se pasa al respaldo: no falló,
    // falta configurarlo, y taparlo lo dejaría sin usar en silencio.
    return {
      ok: false,
      motivo: titular?.motivo ?? MOTIVO_LECTURA.SIN_LECTOR,
      queHacer: titular?.queHacer ?? null,
      usoRespaldo: false,
      porQuePaso: null,
    };
  }

  const primero = await titular.lector.leer({ archivos, receta, proveedorNombre });
  if (primero.ok) {
    return { ...primero, usoRespaldo: false, porQuePaso: null, lector: titular.lector.nombre };
  }

  if (!correspondePasarAlRespaldo(primero.motivo)) {
    return { ...primero, usoRespaldo: false, porQuePaso: null, lector: titular.lector.nombre };
  }
  if (!respaldo?.ok || respaldoInutil) {
    // Hay motivo para pasar, pero no hay a quién. Se devuelve el fallo del
    // titular con su motivo: el respaldo ausente no cambia lo que pasó.
    return {
      ...primero,
      usoRespaldo: false,
      porQuePaso: null,
      lector: titular.lector.nombre,
      respaldoDisponible: false,
    };
  }

  const segundo = await respaldo.lector.leer({ archivos, receta, proveedorNombre });
  return {
    ...segundo,
    usoRespaldo: true,
    // Se guarda POR QUÉ se pasó, no solo que se pasó: "el titular se quedó sin
    // cuota" y "el titular estaba caído" se arreglan distinto.
    porQuePaso: primero.motivo,
    lector: respaldo.lector.nombre,
  };
}

// lib/version/motorVersion.js
//
// Motor del guard de versión: toda la POLÍTICA (cuándo consultar, cuándo
// bloquear, cómo evitar dobles submits) vive acá, sin React y sin `fetch`
// propio. El hook solo conecta este motor a la UI.
//
// Está separado del hook para que las reglas que importan se puedan probar de
// verdad: el piso de 60 s del chequeo por visibilidad, que el chequeo previo a
// guardar lo IGNORE, y que un deploy ocurrido segundos después del último
// chequeo se detecte igual al apretar Guardar.
//
// Las dos modalidades NO son la misma función con un flag, a propósito:
//
//   chequearPorVisibilidad()  — oportunista. Barato, con piso de 60 s. Su único
//                               objetivo es avisar temprano. Puede no consultar.
//   chequearAntesDeGuardar()  — obligatorio. SIEMPRE consulta, sin excepción.
//                               Es la última barrera antes de escribir.
//
// El piso del primero nunca debilita al segundo: son contadores distintos y el
// segundo no lee el estado del primero para decidir si consulta.

import {
  compararBuild,
  permiteGuardar,
  guardActivo,
  DISTINTA,
  INDETERMINADO,
} from "./compararBuild.js";

/** Piso entre chequeos oportunistas. Evita consultar en cada cambio de pestaña. */
export const PISO_VISIBILIDAD_MS = 60_000;

/**
 * @param {object}   args
 * @param {string}   args.buildCliente        NEXT_PUBLIC_BUILD_ID
 * @param {Function} args.obtenerBuildServidor  () => Promise<string>
 * @param {Function} [args.ahora]             inyectable para tests
 * @param {number}   [args.pisoMs]
 * @param {Function} [args.onFalloRed]        se llama con el error; NO bloquea
 */
export function crearMotorVersion({
  buildCliente,
  obtenerBuildServidor,
  ahora = () => Date.now(),
  pisoMs = PISO_VISIBILIDAD_MS,
  onFalloRed = () => {},
} = {}) {
  let ultimoChequeoMs = null;
  let consultaEnCurso = false;

  const activo = () => guardActivo(buildCliente);

  const respuesta = (resultado, extra = {}) => ({
    resultado,
    permiteGuardar: permiteGuardar(resultado),
    consulto: false,
    motivo: null,
    ...extra,
  });

  async function consultarServidor() {
    let buildServidor;
    try {
      buildServidor = await obtenerBuildServidor();
    } catch (error) {
      // Fail open explícito: el endpoint no respondió, así que no se sabe nada.
      // Se registra para poder investigarlo, pero el usuario guarda igual.
      onFalloRed(error);
      return respuesta(INDETERMINADO, { consulto: true, motivo: "fallo-red" });
    }
    const resultado = compararBuild(buildCliente, buildServidor);
    return respuesta(resultado, { consulto: true, motivo: null, buildServidor });
  }

  return {
    activo,
    /** Solo para tests/diagnóstico. */
    ultimoChequeo: () => ultimoChequeoMs,
    consultando: () => consultaEnCurso,

    /**
     * Chequeo OPORTUNISTA (volver a la pestaña). Puede no consultar.
     * Nunca decide un guardado por sí solo: su salida solo enciende el aviso.
     */
    async chequearPorVisibilidad() {
      if (!activo()) {
        return respuesta(INDETERMINADO, { motivo: "guard-inactivo" });
      }
      const t = ahora();
      if (ultimoChequeoMs !== null && t - ultimoChequeoMs < pisoMs) {
        return respuesta(INDETERMINADO, { motivo: "piso-visibilidad" });
      }
      ultimoChequeoMs = t;
      return consultarServidor();
    },

    /**
     * Chequeo OBLIGATORIO previo a guardar. Consulta SIEMPRE: no mira el piso,
     * no reutiliza el resultado anterior y no se saltea por un chequeo reciente.
     *
     * Si ya hay una consulta en curso devuelve `permiteGuardar: false` con
     * motivo `consulta-en-curso`: dos clics rápidos producen un solo submit.
     */
    async chequearAntesDeGuardar() {
      if (!activo()) {
        // Sin build id (desarrollo) el guard está inactivo y no estorba.
        return respuesta(INDETERMINADO, { motivo: "guard-inactivo" });
      }
      if (consultaEnCurso) {
        return {
          resultado: INDETERMINADO,
          permiteGuardar: false,
          consulto: false,
          motivo: "consulta-en-curso",
        };
      }
      consultaEnCurso = true;
      try {
        const r = await consultarServidor();
        // El chequeo fresco también refresca el piso del oportunista: acabamos
        // de preguntar, no hace falta repetirlo al volver a la pestaña.
        ultimoChequeoMs = ahora();
        return r;
      } finally {
        consultaEnCurso = false;
      }
    },
  };
}

export { DISTINTA, INDETERMINADO };

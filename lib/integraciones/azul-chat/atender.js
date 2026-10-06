// lib/integraciones/azul-chat/atender.js
//
// LA ÚNICA PUERTA DE CONSULTA DE AZUL CHAT AL ERP. Seis pasos, en este orden, y
// cada uno en su pieza:
//
//   1. la APLICACIÓN se autentica con su firma      → autenticacionAplicacion.js
//   2. el cuerpo tiene EXACTAMENTE la forma esperada → acá
//   3. la CAPACIDAD está en el catálogo cerrado      → capacidades.js
//   4. el TOKEN DE DELEGACIÓN es de un vínculo
//      vigente de esta aplicación, y dice en
//      nombre de quién se pregunta                   → autorizacion.js
//   5. esa persona, HOY, tiene permiso y alcance     → autorizacion.js
//   6. se ejecuta la capacidad con el alcance AUTORIZADO, no con el pedido
//
// La ruta HTTP (`app/api/integraciones/azul-chat/consultar`) le pasa las
// cabeceras y el cuerpo crudo, y traduce el resultado a la respuesta pública.
//
// ── LO QUE ESTA PUERTA NO MIRA ─────────────────────────────────────────────
//
// Cookies, `Authorization`, contexto operativo, grupo activo. Si la solicitud
// trae una cookie de sesión del ERP —válida o fabricada— no cambia nada: ni
// autentica a la aplicación ni amplía el alcance del humano.
//
// ── EL CUERPO ──────────────────────────────────────────────────────────────
//
//   {
//     "capacidad":  "ventas_resumen",
//     "delegacion": { "token": "del1_…" },
//     "alcance":    { "grupoId": 1, "localId": 3 },
//     "parametros": { "periodo": { "tipo": "hoy" } }
//   }
//
// `alcance` va solo en las capacidades sobre un local (`pideLocal`). En las
// demás —`mi_alcance`— NO puede ir: el alcance lo decide el ERP.
//
// Una clave de más, en cualquier nivel, rechaza la solicitud. Es lo que hace
// imposible colar un `endpoint`, un `sql`, un `where`, un `include` — o un
// `usuarioId` para hablar en nombre de otro con el token de alguien: no hay
// dónde ponerlos.

import { autenticarAplicacion } from "./autenticacionAplicacion.js";
import { capacidadDelCatalogo } from "./capacidades.js";
import { autorizarIntegracion } from "./autorizacion.js";
import { hashTokenDelegacion } from "../vinculos/codigoVinculo.js";

/** Un cuerpo más grande que esto no es una consulta de V1. */
export const MAX_BYTES_CUERPO = 4096;

const CLAVES_CUERPO = ["capacidad", "delegacion", "alcance", "parametros"];
const CLAVES_DELEGACION = ["token"];
const CLAVES_ALCANCE = ["grupoId", "localId"];

const esObjetoPlano = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const soloEstas = (obj, claves) => Object.keys(obj).every((k) => claves.includes(k));

const responder = (status, cuerpo) => ({ status, cuerpo });
const fallar = ({ status, codigo, error }) => responder(status, { ok: false, codigo, error });
const invalido = (error) => fallar({ status: 400, codigo: "PEDIDO_INVALIDO", error });

// UTF-8 ESTRICTO y sin tocar el BOM. Con `fatal`, una secuencia inválida es un
// error en vez de un U+FFFD silencioso: dos cuerpos distintos en bytes nunca se
// leen como el mismo texto. Con `ignoreBOM`, un BOM queda en el texto —y
// JSON.parse lo rechaza— en vez de desaparecer sin avisar.
const decodificador = () => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * El cuerpo crudo → un OBJETO JSON canónico, o un rechazo. Lo usan las dos
 * puertas de Azul Chat: la consulta (acá) y el canje (vinculos/canje.js).
 *
 * ── EL CUERPO TIENE QUE SER JSON CANÓNICO ──────────────────────────────────
 *
 * Se exige que `JSON.stringify(JSON.parse(texto)) === texto`: sin espacios, sin
 * claves repetidas, sin escapes innecesarios, con los números como los escribe
 * JavaScript. Es lo que produce `JSON.stringify(objeto)` del lado de Azul Chat,
 * así que no le pide nada raro, y cierra de raíz la diferencia entre parsers:
 *
 *   {"delegacion":{"token":"del1_A","token":"del1_B"}}
 *
 * JSON.parse se queda con el último y otro parser con el primero. La firma cubre
 * los bytes, pero si quien firma y quien ejecuta leen distinto, se firma una
 * cosa y se ejecuta otra. Con la regla canónica, ese cuerpo no se lee: al
 * re-serializarlo sale con UNA clave y no coincide.
 *
 * @param {Uint8Array|string} cuerpo
 * @returns {{datos: Record<string, unknown>} | {error: {status:number, cuerpo:object}}}
 */
export function leerCuerpoCanonico(cuerpo) {
  const bytes = typeof cuerpo === "string" ? Buffer.from(cuerpo, "utf8") : cuerpo;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return { error: invalido("El cuerpo está vacío.") };
  }
  if (bytes.byteLength > MAX_BYTES_CUERPO) {
    return { error: invalido(`El cuerpo supera ${MAX_BYTES_CUERPO} bytes.`) };
  }
  let texto;
  try {
    texto = decodificador().decode(bytes);
  } catch {
    return { error: invalido("El cuerpo no es UTF-8 válido.") };
  }
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { error: invalido("El cuerpo no es JSON.") };
  }
  if (JSON.stringify(datos) !== texto) {
    return { error: invalido("El cuerpo tiene que ser JSON canónico: sin espacios, sin claves repetidas, tal como lo escribe JSON.stringify.") };
  }
  if (!esObjetoPlano(datos)) return { error: invalido("El cuerpo tiene que ser un objeto.") };
  return { datos };
}

/**
 * Paso 2: el cuerpo crudo → un pedido con la forma exacta, o un rechazo.
 *
 * Que `alcance` esté o no se decide después, cuando se sabe la capacidad; acá
 * solo se exige que, si está, tenga la forma.
 *
 * @param {Uint8Array|string} cuerpo
 */
export function leerPedido(cuerpo) {
  const leido = leerCuerpoCanonico(cuerpo);
  if (leido.error) return leido;
  const datos = leido.datos;
  if (!soloEstas(datos, CLAVES_CUERPO)) {
    return { error: invalido(`El cuerpo solo acepta ${CLAVES_CUERPO.join(", ")}.`) };
  }
  const { capacidad, delegacion, alcance, parametros } = datos;
  if (!esObjetoPlano(delegacion) || !soloEstas(delegacion, CLAVES_DELEGACION)) {
    return { error: invalido("La delegación solo acepta token.") };
  }
  const traeAlcance = alcance !== undefined;
  if (traeAlcance && (!esObjetoPlano(alcance) || !soloEstas(alcance, CLAVES_ALCANCE))) {
    return { error: invalido("El alcance solo acepta grupoId y localId.") };
  }
  if (!esObjetoPlano(parametros)) {
    return { error: invalido("Faltan los parámetros de la capacidad.") };
  }
  return {
    pedido: {
      capacidad,
      token: delegacion.token,
      ...(traeAlcance ? { grupoId: alcance.grupoId, localId: alcance.localId } : {}),
    },
    traeAlcance,
    parametros,
  };
}

/**
 * Atiende una solicitud de Azul Chat.
 *
 * @param {object} solicitud
 * @param {Headers|object} solicitud.headers
 * @param {Uint8Array|string} solicitud.cuerpo el cuerpo crudo, en bytes tal como llegó.
 * @param {object} deps
 * @param {object} deps.cargador  ver `autorizarIntegracion`.
 * @param {Record<string, Function>} deps.ejecutores  uno por capacidad del catálogo.
 * @param {{consumir:Function}} [deps.limitador]  ver `limitador.js`; sin él, no se limita.
 * @param {object} [deps.entorno=process.env]
 * @param {number} [deps.ahora=Date.now()]
 * @returns {Promise<{status:number, cuerpo:object}>}
 */
export async function atenderSolicitud({ headers, cuerpo }, { cargador, ejecutores, limitador = null, entorno = process.env, ahora = Date.now() }) {
  // 1. La aplicación, antes de leer una sola clave del cuerpo.
  const app = autenticarAplicacion({ headers, cuerpo, entorno, ahora });
  if (!app.ok) return fallar(app);

  // 2. La forma.
  const leido = leerPedido(cuerpo);
  if (leido.error) return leido.error;
  const { pedido, traeAlcance, parametros } = leido;

  // 3. La capacidad, y que sus parámetros y su alcance sean los declarados.
  const capacidad = capacidadDelCatalogo(pedido.capacidad);
  if (!capacidad) {
    return fallar({ status: 403, codigo: "CAPACIDAD_FUERA_DE_CATALOGO", error: "La capacidad pedida no está habilitada para la integración." });
  }
  if (!soloEstas(parametros, capacidad.parametros)) {
    return invalido(
      capacidad.parametros.length
        ? `${pedido.capacidad} solo acepta los parámetros ${capacidad.parametros.join(", ")}.`
        : `${pedido.capacidad} no acepta parámetros.`
    );
  }
  if (capacidad.pideLocal && !traeAlcance) {
    return invalido(`${pedido.capacidad} es sobre un local: necesita alcance con grupoId y localId.`);
  }
  if (!capacidad.pideLocal && traeAlcance) {
    return invalido(`${pedido.capacidad} no acepta alcance: lo decide el ERP con el alcance actual de la persona.`);
  }

  // El cupo, ANTES de tocar la base: una aplicación autenticada que se
  // desboca no puede convertir cada pedido en consultas. La clave es la
  // delegación —el hash del token, que se calcula sin la base—: una por
  // persona, porque cada persona tiene a lo sumo un vínculo vigente y cada
  // vínculo a lo sumo una delegación.
  if (limitador) {
    const cupo = limitador.consumir({ aplicacion: app.aplicacion, clave: `del:${hashTokenDelegacion(String(pedido.token))}` }, ahora);
    if (!cupo.ok) {
      return responder(429, {
        ok: false,
        codigo: "LIMITE_EXCEDIDO",
        error: "Demasiadas consultas en poco tiempo.",
        reintentarEnSegundos: cupo.reintentarEnSegundos,
      });
    }
  }

  // 4 y 5. La delegación de ESTA aplicación y la persona, contra el ERP de ahora.
  const autz = await autorizarIntegracion(pedido, cargador, { aplicacionVinculo: app.vinculo });
  if (!autz.ok) return fallar(autz);

  // 6. La capacidad, con el alcance que se AUTORIZÓ.
  const ejecutar = Object.prototype.hasOwnProperty.call(ejecutores, pedido.capacidad)
    ? ejecutores[pedido.capacidad]
    : null;
  if (typeof ejecutar !== "function") {
    return fallar({ status: 501, codigo: "CAPACIDAD_SIN_EJECUTOR", error: `${pedido.capacidad} está en el catálogo pero no tiene ejecutor.` });
  }
  try {
    const r = await ejecutar(autz.autorizacion, parametros, { ahora });
    if (!r.ok) return fallar(r);
    return responder(200, { ok: true, datos: r.datos });
  } catch (e) {
    // Se registra el motivo, nunca las cabeceras ni el cuerpo.
    console.error(`[azul-chat] ${pedido.capacidad} falló:`, e?.message || e);
    return fallar({ status: 500, codigo: "ERROR_AL_CALCULAR", error: `No se pudo calcular ${pedido.capacidad}: ${e?.message || "error desconocido"}.` });
  }
}

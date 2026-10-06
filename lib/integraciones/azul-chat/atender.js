// lib/integraciones/azul-chat/atender.js
//
// LA ÚNICA PUERTA DE AZUL CHAT AL ERP. Seis pasos, en este orden, y cada uno
// en su pieza:
//
//   1. la APLICACIÓN se autentica con su firma      → autenticacionAplicacion.js
//   2. el cuerpo tiene EXACTAMENTE la forma esperada → acá
//   3. la CAPACIDAD está en el catálogo cerrado      → capacidades.js
//   4. la DELEGACIÓN nombra a un humano del ERP que
//      AUTORIZÓ a esta aplicación (su vínculo)       → autorizacion.js
//   5. ese humano, HOY, tiene permiso y alcance      → autorizacion.js
//   6. se ejecuta la capacidad con el alcance AUTORIZADO, no con el pedido
//
// Todavía no hay una ruta HTTP que llame a esto: esta tanda deja la frontera
// escrita y probada sin abrirla. Cuando exista, la ruta le pasa las cabeceras y
// el cuerpo crudo, y devuelve `status` y `cuerpo` tal cual.
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
//     "delegacion": { "usuarioId": 12, "vinculo": "vin1_…" },
//     "alcance":    { "grupoId": 1, "localId": 3 },
//     "parametros": { "periodo": { "tipo": "hoy" } }
//   }
//
// Una clave de más, en cualquier nivel, rechaza la solicitud. Es lo que hace
// imposible colar un `endpoint`, un `sql`, un `where` o un `include`: no hay
// dónde ponerlos.

import { autenticarAplicacion } from "./autenticacionAplicacion.js";
import { capacidadDelCatalogo } from "./capacidades.js";
import { autorizarIntegracion } from "./autorizacion.js";

/** Un cuerpo más grande que esto no es una consulta de V1. */
export const MAX_BYTES_CUERPO = 4096;

const CLAVES_CUERPO = ["capacidad", "delegacion", "alcance", "parametros"];
// El `usuarioId` solo no alcanza: va con el código del vínculo que esa persona
// creó en el ERP. Ver lib/integraciones/vinculos/codigoVinculo.js.
const CLAVES_DELEGACION = ["usuarioId", "vinculo"];
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
 * Paso 2: el cuerpo crudo → un pedido con la forma exacta, o un rechazo.
 *
 * ── EL CUERPO TIENE QUE SER JSON CANÓNICO ──────────────────────────────────
 *
 * Se exige que `JSON.stringify(JSON.parse(texto)) === texto`: sin espacios, sin
 * claves repetidas, sin escapes innecesarios, con los números como los escribe
 * JavaScript. Es lo que produce `JSON.stringify(objeto)` del lado de Azul Chat,
 * así que no le pide nada raro, y cierra de raíz la diferencia entre parsers:
 *
 *   {"delegacion":{"usuarioId":7,"usuarioId":9}}
 *
 * JSON.parse se queda con el último y otro parser con el primero. La firma cubre
 * los bytes, pero si quien firma y quien ejecuta leen distinto, se firma una
 * cosa y se ejecuta otra. Con la regla canónica, ese cuerpo no se lee: al
 * re-serializarlo sale con UNA clave y no coincide.
 *
 * @param {Uint8Array|string} cuerpo
 */
export function leerPedido(cuerpo) {
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
  if (!esObjetoPlano(datos) || !soloEstas(datos, CLAVES_CUERPO)) {
    return { error: invalido(`El cuerpo solo acepta ${CLAVES_CUERPO.join(", ")}.`) };
  }
  const { capacidad, delegacion, alcance, parametros } = datos;
  if (!esObjetoPlano(delegacion) || !soloEstas(delegacion, CLAVES_DELEGACION)) {
    return { error: invalido("La delegación solo acepta usuarioId y vinculo.") };
  }
  if (!esObjetoPlano(alcance) || !soloEstas(alcance, CLAVES_ALCANCE)) {
    return { error: invalido("El alcance solo acepta grupoId y localId.") };
  }
  if (!esObjetoPlano(parametros)) {
    return { error: invalido("Faltan los parámetros de la capacidad.") };
  }
  return {
    pedido: {
      capacidad,
      usuarioId: delegacion.usuarioId,
      vinculo: delegacion.vinculo,
      grupoId: alcance.grupoId,
      localId: alcance.localId,
    },
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
  const { pedido, parametros } = leido;

  // 3. La capacidad, y que sus parámetros sean los declarados.
  const capacidad = capacidadDelCatalogo(pedido.capacidad);
  if (!capacidad) {
    return fallar({ status: 403, codigo: "CAPACIDAD_FUERA_DE_CATALOGO", error: "La capacidad pedida no está habilitada para la integración." });
  }
  if (!soloEstas(parametros, capacidad.parametros)) {
    return invalido(`${pedido.capacidad} solo acepta los parámetros ${capacidad.parametros.join(", ")}.`);
  }

  // El cupo, ANTES de tocar la base: una aplicación autenticada que se
  // desboca no puede convertir cada pedido en consultas.
  if (limitador) {
    const cupo = limitador.consumir({ aplicacion: app.aplicacion, usuarioId: pedido.usuarioId }, ahora);
    if (!cupo.ok) {
      return responder(429, {
        ok: false,
        codigo: "LIMITE_EXCEDIDO",
        error: "Demasiadas consultas en poco tiempo.",
        reintentarEnSegundos: cupo.reintentarEnSegundos,
      });
    }
  }

  // 4 y 5. El vínculo de ESTA aplicación y el humano, contra el ERP de ahora.
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

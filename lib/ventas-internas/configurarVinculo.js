// lib/ventas-internas/configurarVinculo.js
//
// Helpers PUROS para CONFIGURAR el vínculo Cliente → Local interno
// (Cliente.localVinculadoId). Son la regla de negocio de la etapa de
// configuración: normalizar el payload, decidir qué locales son elegibles y armar
// las opciones del selector.
//
// No consultan Prisma ni dependen de Next: las rutas resuelven los datos y estos
// helpers deciden. Así la regla se testea aislada y no se duplica entre crear y
// editar.
//
// OJO con la distinción que sostiene todo esto:
//   Cliente.localId          → local PROPIETARIO de la ficha (ámbito de la agenda)
//   Cliente.localVinculadoId → local INTERNO que el cliente representa
// Son campos distintos y NO tienen que coincidir. `localId` no participa de esta
// decisión en ningún punto.
//
// Distinto de lib/ventas-internas/vinculo.js, que evalúa si una OPERACIÓN de venta
// califica como interna. Este módulo solo configura el dato.

/** Códigos de error estables de la configuración del vínculo. */
export const ERRORES = {
  ID_INVALIDO: "LOCAL_VINCULADO_INVALIDO",
  NO_ENCONTRADO: "LOCAL_VINCULADO_NO_ENCONTRADO",
  INACTIVO: "LOCAL_VINCULADO_INACTIVO",
  ES_DEPOSITO: "LOCAL_VINCULADO_ES_DEPOSITO",
  YA_VINCULADO: "LOCAL_VINCULADO_YA_TOMADO",
};

/** Motivos por los que un local no aparece como elegible en el selector. */
export const MOTIVOS = {
  ES_DEPOSITO: "ES_DEPOSITO",
  INACTIVO: "INACTIVO",
  TOMADO: "TOMADO_POR_OTRO_CLIENTE",
};

const esIdValido = (v) => Number.isInteger(v) && v > 0;

/**
 * Normaliza `localVinculadoId` del body de crear/editar.
 *
 * Semántica de UPDATE PARCIAL, indispensable para que una pantalla o un import que
 * no conocen el campo no lo borren por omisión:
 *   campo ausente          → { presente: false }            → conservar el actual
 *   null                   → { presente: true, valor: null } → desvincular
 *   entero > 0 (o su string) → { presente: true, valor: n }  → vincular
 *   cualquier otra cosa    → { presente: true, error }       → rechazar
 *
 * Se rechazan explícitamente 0, negativos, decimales, booleanos, objetos, arrays y
 * strings no numéricos. El string vacío se trata como desvincular, porque es lo que
 * manda un `<select>` con la opción "Ningún local interno".
 *
 * @param {object} body
 * @returns {{ presente: boolean, valor?: number|null, error?: string }}
 */
export function normalizarLocalVinculadoId(body) {
  if (!body || typeof body !== "object") return { presente: false };
  if (!Object.prototype.hasOwnProperty.call(body, "localVinculadoId")) {
    return { presente: false };
  }

  const raw = body.localVinculadoId;

  if (raw === null) return { presente: true, valor: null };
  // "" = opción "Ningún local interno" de un select.
  if (raw === "") return { presente: true, valor: null };

  if (typeof raw === "number") {
    return esIdValido(raw)
      ? { presente: true, valor: raw }
      : { presente: true, error: ERRORES.ID_INVALIDO };
  }

  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return { presente: true, valor: null };
    // Solo dígitos: descarta "1.5", "1e3", "abc", " 1 2 ".
    if (!/^\d+$/.test(t)) return { presente: true, error: ERRORES.ID_INVALIDO };
    const n = Number(t);
    return esIdValido(n)
      ? { presente: true, valor: n }
      : { presente: true, error: ERRORES.ID_INVALIDO };
  }

  // undefined explícito, booleanos, objetos, arrays…
  return { presente: true, error: ERRORES.ID_INVALIDO };
}

/**
 * ¿Se puede vincular este local a este cliente?
 *
 * Reglas (el llamador ya garantizó que el local es del grupo correcto: si no lo
 * encuentra dentro del grupo, no debe llegar acá):
 *   · un depósito nunca es destino: es quien despacha, no quien recibe;
 *   · un local inactivo no se puede vincular DE NUEVO, pero un vínculo preexistente
 *     con un local que quedó inactivo se conserva (y se puede desvincular);
 *   · el local no puede estar tomado por OTRO cliente (unicidad);
 *   · guardar de nuevo el vínculo que el cliente ya tiene siempre es válido.
 *
 * @param {object}  args
 * @param {object|null} args.local            { id, activo, es_deposito | esDeposito }
 * @param {number|null} args.clienteVinculadoId  cliente que hoy ocupa ese local (o null)
 * @param {number|null} args.vinculoActualDelCliente  localVinculadoId actual del cliente
 * @param {number|null} args.clienteIdActual  id del cliente que se está editando
 * @returns {{ ok: true } | { ok: false, error: string, motivo?: string }}
 */
export function puedeVincularLocal({
  local = null,
  clienteVinculadoId = null,
  vinculoActualDelCliente = null,
  clienteIdActual = null,
} = {}) {
  if (!local || !esIdValido(Number(local.id))) {
    return { ok: false, error: ERRORES.NO_ENCONTRADO };
  }

  // Se llama `idLocal` a propósito, no `localId`: en este módulo `localId` es el
  // campo del CLIENTE (local propietario de la ficha), que acá no participa.
  const idLocal = Number(local.id);
  // Es el mismo vínculo que el cliente ya tenía: se puede reguardar sin revalidar
  // actividad (mismo criterio que listaPrecioId en clientes/editar).
  const esElMismoQueTenia =
    vinculoActualDelCliente != null && Number(vinculoActualDelCliente) === idLocal;

  const esDeposito = local.es_deposito === true || local.esDeposito === true;
  if (esDeposito) {
    return { ok: false, error: ERRORES.ES_DEPOSITO, motivo: MOTIVOS.ES_DEPOSITO };
  }

  if (local.activo !== true && !esElMismoQueTenia) {
    return { ok: false, error: ERRORES.INACTIVO, motivo: MOTIVOS.INACTIVO };
  }

  const ocupadoPorOtro =
    clienteVinculadoId != null &&
    (clienteIdActual == null || Number(clienteVinculadoId) !== Number(clienteIdActual));
  if (ocupadoPorOtro) {
    return { ok: false, error: ERRORES.YA_VINCULADO, motivo: MOTIVOS.TOMADO };
  }

  return { ok: true };
}

/**
 * Arma las opciones del selector "Local interno vinculado".
 *
 * Siempre incluye el vínculo ACTUAL del cliente aunque el local esté inactivo o no
 * venga en la lista de elegibles: si no, el usuario no podría verlo ni quitarlo.
 * Los locales tomados por otro cliente se devuelven deshabilitados en vez de
 * ocultarse, para que se entienda por qué no se pueden elegir.
 *
 * @param {object} args
 * @param {Array<object>} args.locales  [{ id, nombre, activo, esDeposito, clienteVinculadoId, clienteVinculadoNombre }]
 * @param {number|null}   args.vinculoActual  localVinculadoId del cliente en edición
 * @param {object|null}   args.localActual    datos del local actual, si no viene en `locales`
 * @param {number|null}   args.clienteIdActual
 * @returns {Array<{ id: number, nombre: string, etiqueta: string, deshabilitada: boolean, motivo: string|null, esActual: boolean }>}
 */
export function construirOpcionesVinculo({
  locales = [],
  vinculoActual = null,
  localActual = null,
  clienteIdActual = null,
} = {}) {
  // Se descartan las entradas basura ANTES de cualquier lectura de `.id`.
  const lista = (Array.isArray(locales) ? locales : []).filter(
    (l) => l && esIdValido(Number(l.id))
  );

  // El vínculo actual siempre tiene que estar presente.
  const yaEsta = lista.some((l) => Number(l.id) === Number(vinculoActual));
  if (vinculoActual != null && !yaEsta && localActual && esIdValido(Number(localActual.id))) {
    lista.push(localActual);
  }

  const opciones = lista
    .map((l) => {
      const id = Number(l.id);
      const esActual = vinculoActual != null && id === Number(vinculoActual);
      const permiso = puedeVincularLocal({
        local: l,
        clienteVinculadoId: l.clienteVinculadoId ?? null,
        vinculoActualDelCliente: vinculoActual,
        clienteIdActual,
      });

      let etiqueta = l.nombre || `Local ${id}`;
      if (l.activo !== true) etiqueta += " (inactivo)";
      if (permiso.motivo === MOTIVOS.TOMADO) {
        etiqueta += l.clienteVinculadoNombre
          ? ` — ya vinculado a ${l.clienteVinculadoNombre}`
          : " — ya vinculado a otro cliente";
      }

      return {
        id,
        nombre: l.nombre || `Local ${id}`,
        etiqueta,
        // La opción actual nunca se deshabilita: hay que poder verla y quitarla.
        deshabilitada: esActual ? false : !permiso.ok,
        motivo: esActual ? null : permiso.motivo ?? null,
        esActual,
      };
    });

  opciones.sort((a, b) => {
    if (a.esActual !== b.esActual) return a.esActual ? -1 : 1;
    if (a.deshabilitada !== b.deshabilitada) return a.deshabilitada ? 1 : -1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  return opciones;
}

/** Mensaje para el usuario a partir del código de error. */
export function mensajeError(codigo, { nombreLocal = null, nombreCliente = null } = {}) {
  switch (codigo) {
    case ERRORES.ID_INVALIDO:
      return "Local interno inválido.";
    case ERRORES.NO_ENCONTRADO:
      return "El local interno no existe o no pertenece a este grupo.";
    case ERRORES.INACTIVO:
      return nombreLocal
        ? `El local “${nombreLocal}” está inactivo y no se puede vincular.`
        : "El local interno está inactivo y no se puede vincular.";
    case ERRORES.ES_DEPOSITO:
      return "No se puede vincular un depósito: el depósito es el que despacha, no el que recibe.";
    case ERRORES.YA_VINCULADO:
      return nombreCliente
        ? `Este local ya está vinculado al cliente “${nombreCliente}”.`
        : "Este local ya está vinculado a otro cliente.";
    default:
      return "No se pudo configurar el local interno vinculado.";
  }
}

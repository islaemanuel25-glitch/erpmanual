// lib/pos-ventas/sincronizacionOffline.js
//
// EL ÚNICO MOTOR QUE SINCRONIZA LA COLA OFFLINE DEL POS.
//
// Lo llaman la reconexión, el montaje de la pantalla, el PIN recién validado,
// la vuelta al primer plano, el botón "Procesar cola" y el cierre de caja. Es el
// mismo para todos: no hay un segundo camino que mande ventas al servidor.
//
// ── EL ORDEN, VENTA POR VENTA ──────────────────────────────────────────────
//
// De a una, en el orden en que se cobraron, y solo las del local activo:
//
// 1. REGISTRAR (`/cobros-offline/registrar`). Primero el servidor se entera de
//    que el cobro existe y guarda su contenido; después se intenta la venta.
//    La respuesta trae el estado del cobro en el servidor, y ESE estado decide:
//      · SINCRONIZADA o DESCARTADA → se saca de la cola. Es lo único que saca.
//      · REQUIERE_REVISION → queda en la cola, marcada, y NO se reintenta.
//      · RECHAZADO (el registro no la aceptó) → queda, marcada, y no se reintenta.
//      · PENDIENTE → paso 2.
// 2. LA VENTA (`/pos-ventas/crear`), con el MISMO `clientTxnId`, el turno donde
//    se cobró (`turnoDeReplay`), `origenOffline` y el voucher. Sin red: se corta
//    y queda todo como estaba. 428 (no hay PIN): se corta y se pide el PIN del
//    operador que la cobró. La venta de otro operador no se manda: espera a su
//    dueño, sin mudarse de caja ni de operador (DEC-0012).
// 3. CUALQUIER OTRA RESPUESTA DE LA VENTA se confirma registrando otra vez: la
//    venta pudo haberse escrito aunque la respuesta se perdiera, o el rechazo
//    pudo haber mandado el cobro a revisión. El estado del servidor vuelve a
//    decidir como en el paso 1.
//
// Por eso la venta solo se pide cuando el servidor dice, en ese momento, que el
// cobro está PENDIENTE; y solo sale de la cola cuando dice que está resuelto. El
// estado local (`sync`) sirve para mostrar y para no reintentar lo rechazado;
// nunca para decidir que algo se vendió.
//
// ── UNA SOLA SINCRONIZACIÓN A LA VEZ ───────────────────────────────────────
//
// Una bandera en memoria para esta pestaña y un candado entre pestañas
// (`candadoEntrePestanas`, Web Locks con `ifAvailable`). La segunda llamada no
// espera: vuelve con OCUPADA y no manda nada.
//
// Este archivo no toca `localStorage` ni `fetch`: recibe la cola y la API por
// parámetro, así se prueba entero sin navegador.

import { turnoDeReplay } from "@/lib/pos-ventas/replayOffline";

/** Lo que la cola local sabe de una venta (campo `sync` del ítem). */
export const ESTADO_LOCAL = Object.freeze({
  /** El servidor la tiene PENDIENTE: se reintenta en la próxima sincronización. */
  PENDIENTE: "PENDIENTE",
  /** Espera el PIN del operador que la cobró. */
  ESPERA_OPERADOR: "ESPERA_OPERADOR",
  /** El servidor la tiene en revisión: no se reintenta. */
  REVISION: "REVISION",
  /** El registro no la aceptó: no se reintenta. */
  RECHAZADA: "RECHAZADA",
});

/** Cómo terminó una sincronización. */
export const RESULTADO_SINCRONIZACION = Object.freeze({
  /** Se recorrió toda la cola. Puede quedar algo esperando o en revisión. */
  COMPLETA: "COMPLETA",
  /** Se cortó la red: lo que faltaba sigue en la cola, intacto. */
  SIN_RED: "SIN_RED",
  /** Se frenó para pedir un PIN. Sigue sola cuando el PIN se valida. */
  ESPERA_PIN: "ESPERA_PIN",
  /** El servidor respondió algo que no se puede interpretar: se frenó. */
  ERROR: "ERROR",
  /** La cola no se pudo leer: no se mandó nada. */
  COLA_ILEGIBLE: "COLA_ILEGIBLE",
  /** Ya había otra sincronización en curso: esta no hizo nada. */
  OCUPADA: "OCUPADA",
});

/** Los estados de `CobroOffline` (lib/pos-ventas/cobroOffline.js). */
const SERVIDOR = Object.freeze({
  PENDIENTE: "PENDIENTE",
  REQUIERE_REVISION: "REQUIERE_REVISION",
  SINCRONIZADA: "SINCRONIZADA",
  DESCARTADA: "DESCARTADA",
});
const REGISTRO_RECHAZADO = "RECHAZADO";

/** El 409 de las rutas de cierre cuando la caja tiene cobros offline sin resolver. */
export const CODIGO_COBROS_OFFLINE_PENDIENTES = "COBROS_OFFLINE_PENDIENTES";

export const MENSAJE_CIERRE_CON_PENDIENTES_SERVIDOR =
  "Esta caja tiene ventas sin conexión que todavía no se sincronizaron. Sincronizalas desde el POS donde se cobraron antes de cerrar.";

/** El nombre del Web Lock de la sincronización. */
export const NOMBRE_CANDADO_SINCRONIZACION = "erpazul-pos-sincronizacion-offline";

const idDe = (item) => (item && typeof item === "object" && typeof item.clientVentaId === "string" && item.clientVentaId ? item.clientVentaId : null);

/** Un ítem que la cola no puede identificar: no se manda ni se borra. */
export function itemIlegible(item) {
  return idDe(item) === null;
}

/** ¿Esta venta todavía tiene que llegar al servidor como venta? */
export function necesitaReplay(item) {
  if (itemIlegible(item)) return false;
  const estado = item.sync?.estado;
  return estado !== ESTADO_LOCAL.REVISION && estado !== ESTADO_LOCAL.RECHAZADA;
}

/**
 * Las ventas de la cola que impiden cerrar ESA caja: del local y del turno,
 * todavía sin resolver. Las que están en revisión o rechazadas ya no dependen de
 * este equipo —el servidor tiene su evidencia o el encargado las mira— y no
 * bloquean.
 */
export function pendientesQueBloqueanCierre(items, { localId, turnoId }) {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item) =>
      necesitaReplay(item) &&
      Number(item.localId) === Number(localId) &&
      Number(item.turnoId) === Number(turnoId)
  );
}

/**
 * El pedido a `/api/pos-ventas/crear` para una venta de la cola. Es el mismo
 * cuerpo que armaba `procesarCola`, con el turno de `turnoDeReplay`: nada se
 * recalcula —precios, descuentos y líneas son los del cobro— y el id es el de
 * la cola, el mismo en cada reintento.
 */
export function cuerpoDeReplay(item, turnoId) {
  return {
    clientTxnId: item.clientVentaId,
    localId: item.localId,
    clienteId: item.clienteId,
    turnoId,
    formaPago: item.formaPago,
    esFiado: item.formaPago === "fiado",
    descuento: item.descuento,
    descuentoPorPuntos: item.descuentoPorPuntos,
    puntosCanje: 0,
    origenOffline: true,
    operadorVoucher: item.operadorVoucher ?? null,
    items: item.items,
  };
}

/** Plural simple para los avisos: "1 venta" / "3 ventas". */
const ventas = (n) => `${n} venta${n === 1 ? "" : "s"}`;

/** Qué hacer cuando la caja no se puede cerrar por la cola de este equipo. */
export const MOTIVO_CIERRE_BLOQUEADO = Object.freeze({
  COLA_ILEGIBLE: "COLA_ILEGIBLE",
  SIN_CONEXION: "SIN_CONEXION",
  SIN_SINCRONIZAR: "SIN_SINCRONIZAR",
});

/**
 * ¿La cola de ESTE equipo deja cerrar la caja `turnoId`? Puro: lo usan el POS
 * antes de abrir el cierre y la pantalla del cierre antes de tomar el corte.
 *
 * Una cola que no se pudo leer no deja cerrar: podría tener ventas de esta caja.
 * Una cola ilegible que ya se apartó a salvo sí deja —no hay forma de saber de
 * qué caja eran y no se puede trabar el equipo para siempre—, y el aviso queda
 * en la pantalla del POS.
 *
 * @param {{ ok: boolean, items?: object[] }} leida  lo que devolvió `leerCola`
 * @returns {{ permitido: true } | { permitido: false, motivo: string, cantidad: number, mensaje: string }}
 */
export function verificarCierreConCola(leida, { localId, turnoId, sinConexion = false }) {
  if (!leida?.ok) {
    return {
      permitido: false,
      motivo: MOTIVO_CIERRE_BLOQUEADO.COLA_ILEGIBLE,
      cantidad: 0,
      mensaje:
        "No se puede cerrar desde este equipo: sus ventas sin conexión no se pueden leer y podría haber alguna de esta caja. Avisá al encargado.",
    };
  }
  const bloqueantes = pendientesQueBloqueanCierre(leida.items, { localId, turnoId });
  if (bloqueantes.length === 0) return { permitido: true };
  const cantidad = bloqueantes.length;
  if (sinConexion) {
    return {
      permitido: false,
      motivo: MOTIVO_CIERRE_BLOQUEADO.SIN_CONEXION,
      cantidad,
      mensaje: `No se puede cerrar la caja sin conexión: tiene ${ventas(cantidad)} guardada${cantidad === 1 ? "" : "s"} en este equipo que todavía no llegó${cantidad === 1 ? "" : "aron"} al sistema. Se sincronizan solas al volver la red.`,
    };
  }
  const esperanPin = bloqueantes.filter((i) => i.sync?.estado === ESTADO_LOCAL.ESPERA_OPERADOR);
  const nombre = esperanPin.find((i) => i.operadorNombre)?.operadorNombre;
  return {
    permitido: false,
    motivo: MOTIVO_CIERRE_BLOQUEADO.SIN_SINCRONIZAR,
    cantidad,
    mensaje:
      `No se puede cerrar la caja: tiene ${ventas(cantidad)} sin conexión que todavía no se sincronizó` +
      (cantidad === 1 ? "" : "aron") +
      (esperanPin.length > 0
        ? `. Hace falta el PIN de ${nombre ?? "quien las cobró"} para sincronizarlas.`
        : ". Revisalas en Pendientes."),
  };
}

/**
 * Qué decir de UNA venta de la cola en la lista de Pendientes, y si se puede
 * quitar de este equipo. Solo se quita una que el servidor ya tiene en
 * revisión: su evidencia queda allá. Una que no llegó no se quita nunca.
 *
 * @returns {{ texto: string, detalle: string|null, tono: "neutral"|"warning"|"danger", puedeQuitar: boolean }}
 */
export function estadoParaMostrar(item, localId) {
  if (itemIlegible(item)) {
    return { texto: "No se puede leer esta venta. Avisá al encargado.", detalle: null, tono: "danger", puedeQuitar: false };
  }
  if (Number(item.localId) !== Number(localId)) {
    return { texto: "Es de otro local: se sincroniza al entrar a ese local.", detalle: null, tono: "neutral", puedeQuitar: false };
  }
  const sync = item.sync ?? {};
  const detalle = sync.mensaje ?? null;
  switch (sync.estado) {
    case ESTADO_LOCAL.ESPERA_OPERADOR:
      return { texto: `Espera el PIN de ${item.operadorNombre ?? "quien la cobró"}.`, detalle: null, tono: "warning", puedeQuitar: false };
    case ESTADO_LOCAL.REVISION:
      return { texto: "En revisión: el encargado la resuelve en el sistema.", detalle, tono: "danger", puedeQuitar: true };
    case ESTADO_LOCAL.RECHAZADA:
      return { texto: "No se pudo registrar. Avisá al encargado.", detalle: detalle ?? sync.codigo ?? null, tono: "danger", puedeQuitar: false };
    case ESTADO_LOCAL.PENDIENTE:
      return { texto: "Todavía no entró: se reintenta sola.", detalle, tono: "warning", puedeQuitar: false };
    default:
      return { texto: "Guardada en este equipo: se sincroniza sola.", detalle: null, tono: "neutral", puedeQuitar: false };
  }
}

/**
 * El aviso para el cajero después de una sincronización, o null si no hay nada
 * que decir. Un solo texto por resultado: lo usan la reconexión, el botón y el
 * cierre.
 */
export function mensajeDeSincronizacion(r) {
  if (!r) return null;
  switch (r.resultado) {
    case RESULTADO_SINCRONIZACION.OCUPADA:
      return null;
    case RESULTADO_SINCRONIZACION.SIN_RED:
      return { tono: "error", texto: "Sin conexión: las ventas siguen guardadas en este equipo y se sincronizan solas al volver la red." };
    case RESULTADO_SINCRONIZACION.ESPERA_PIN:
      return {
        tono: "error",
        texto: `Para sincronizar las ventas sin conexión hace falta el PIN de ${r.operadorRequerido?.nombre ?? "quien las cobró"}.`,
      };
    case RESULTADO_SINCRONIZACION.COLA_ILEGIBLE:
      return { tono: "error", texto: "Las ventas sin conexión de este equipo no se pueden leer. No se borró nada: avisá al encargado." };
    case RESULTADO_SINCRONIZACION.ERROR:
      return {
        tono: "error",
        texto: `No se pudieron sincronizar las ventas sin conexión${r.mensaje ? `: ${r.mensaje}` : ""}. Siguen guardadas en este equipo.`,
      };
    default: {
      const partes = [];
      if (r.sincronizadas > 0) partes.push(`${ventas(r.sincronizadas)} sin conexión sincronizada${r.sincronizadas === 1 ? "" : "s"}.`);
      if (r.enRevision > 0) partes.push(`${ventas(r.enRevision)} en revisión: avisá al encargado.`);
      if (r.rechazadas > 0) partes.push(`${ventas(r.rechazadas)} no se pudo registrar: avisá al encargado.`);
      if (r.esperanOperador > 0) partes.push(`${ventas(r.esperanOperador)} espera${r.esperanOperador === 1 ? "" : "n"} el PIN de quien la${r.esperanOperador === 1 ? "" : "s"} cobró.`);
      if (r.pendientes > 0) partes.push(`${ventas(r.pendientes)} todavía no entró: se reintenta sola.`);
      if (partes.length === 0) return null;
      const hayProblema = r.enRevision + r.rechazadas + r.esperanOperador + r.pendientes > 0;
      return { tono: hayProblema ? "error" : "exito", texto: partes.join(" ") };
    }
  }
}

let enCurso = false;

/**
 * Un candado entre pestañas con Web Locks: si otra pestaña lo tiene, no espera
 * y devuelve OCUPADA. Sin Web Locks corre igual —queda la bandera en memoria—.
 */
export function candadoEntrePestanas(nombre = NOMBRE_CANDADO_SINCRONIZACION) {
  return async (fn) => {
    const locks = globalThis.navigator?.locks;
    if (!locks || typeof locks.request !== "function") return fn();
    return locks.request(nombre, { ifAvailable: true }, (lock) =>
      lock ? fn() : { resultado: RESULTADO_SINCRONIZACION.OCUPADA }
    );
  };
}

/**
 * Sincroniza la cola.
 *
 * @param {{
 *   cola: { leer: () => ({ ok: true, items: object[] } | { ok: false }),
 *           marcar: (id: string, sync: object) => Promise<{ ok: boolean }>|{ ok: boolean },
 *           quitar: (id: string) => Promise<{ ok: boolean }>|{ ok: boolean } },
 *   api: { registrar: (item: object) => Promise<Respuesta>, crear: (cuerpo: object) => Promise<Respuesta> },
 *   localId: number,
 *   operadorActivoId: number|null,
 *   candado?: (fn: Function) => Promise<object>,
 *   ahora?: () => number,
 *   textoDeRechazo?: (data: object) => string|null,
 * }} deps  Respuesta: `{ red: false }` o `{ red: true, status, data }`.
 */
export async function sincronizarCola(deps) {
  if (enCurso) return { resultado: RESULTADO_SINCRONIZACION.OCUPADA };
  enCurso = true;
  try {
    const candado = deps.candado ?? ((fn) => fn());
    return await candado(() => recorrer(deps));
  } finally {
    enCurso = false;
  }
}

/**
 * El texto de un rechazo de `crear` se guarda en la cola y se muestra en
 * Pendientes. Lo decide quien llama (`textoDeRechazo`): la pantalla lo pasa por
 * `mensajeErrorVenta` con su `mostrarStockPos`, porque el de stock dice cuánto
 * hay y un local que oculta el stock no lo puede mostrar por acá. Sin esa
 * función no se guarda texto: solo el código.
 */
const sinTexto = () => null;

async function recorrer({ cola, api, localId, operadorActivoId, ahora = () => Date.now(), textoDeRechazo = sinTexto }) {
  const resumen = {
    resultado: RESULTADO_SINCRONIZACION.COMPLETA,
    sincronizadas: 0,
    enRevision: 0,
    rechazadas: 0,
    pendientes: 0,
    esperanOperador: 0,
    // Ventas que el servidor escribió dejando stock negativo (carga inicial). Se
    // avisa solo si el local muestra stock: lo decide la pantalla.
    conStockNegativo: 0,
    operadorRequerido: null,
    mensaje: null,
  };
  const corte = (resultado, extra = {}) => Object.assign(resumen, { resultado }, extra);

  const leida = cola.leer();
  if (!leida.ok) return corte(RESULTADO_SINCRONIZACION.COLA_ILEGIBLE);

  const marcar = async (item, estado, { codigo = null, mensaje = null } = {}) => {
    const anterior = item.sync ?? {};
    await cola.marcar(item.clientVentaId, {
      estado,
      codigo,
      mensaje,
      intentos: (Number(anterior.intentos) || 0) + 1,
      ultimoIntentoEn: ahora(),
    });
  };

  const registrar = async (item) => {
    const r = await api.registrar(item);
    if (!r?.red) return { corte: RESULTADO_SINCRONIZACION.SIN_RED };
    const fila = r.data?.resultados?.[0];
    if (r.status !== 200 || !r.data?.ok || !fila || fila.clientTxnId !== item.clientVentaId) {
      return { corte: RESULTADO_SINCRONIZACION.ERROR, mensaje: r.data?.error ?? null };
    }
    return { fila };
  };

  /** Aplica lo que dice el servidor. Devuelve true si la venta sigue PENDIENTE allá. */
  const aplicar = async (item, fila, rechazoVenta = null) => {
    if (fila.resultado === REGISTRO_RECHAZADO) {
      await marcar(item, ESTADO_LOCAL.RECHAZADA, { codigo: fila.codigo ?? null, mensaje: fila.error ?? null });
      resumen.rechazadas += 1;
      return false;
    }
    if (fila.estado === SERVIDOR.SINCRONIZADA || fila.estado === SERVIDOR.DESCARTADA) {
      await cola.quitar(item.clientVentaId);
      if (fila.estado === SERVIDOR.SINCRONIZADA) resumen.sincronizadas += 1;
      return false;
    }
    if (fila.estado === SERVIDOR.REQUIERE_REVISION) {
      // Se cuenta solo la que RECIÉN pasa a revisión: la que ya estaba se mira
      // en cada sincronización (por si la descartaron) y no tiene que volver a
      // avisar cada vez.
      if (item.sync?.estado !== ESTADO_LOCAL.REVISION) {
        await marcar(item, ESTADO_LOCAL.REVISION, rechazoVenta ?? {});
        resumen.enRevision += 1;
      }
      return false;
    }
    if (fila.estado === SERVIDOR.PENDIENTE) return true;
    return null;
  };

  for (const item of leida.items) {
    const id = idDe(item);
    if (!id || Number(item.localId) !== Number(localId)) continue;
    if (item.sync?.estado === ESTADO_LOCAL.RECHAZADA) continue;

    // 1. Registrar. También las que están en revisión: así se entera la cola de
    //    que el encargado la descartó. A esas nunca se les pide la venta.
    const reg = await registrar(item);
    if (reg.corte) return corte(reg.corte, { mensaje: reg.mensaje ?? null });
    const sigue = await aplicar(item, reg.fila);
    if (sigue === null) return corte(RESULTADO_SINCRONIZACION.ERROR);
    if (!sigue) continue;

    // 2. La venta, en la caja donde se cobró y por quien la cobró.
    const destino = turnoDeReplay(item);
    if (destino.frenada) {
      // El registro ya la manda a revisión sin turno; esto es por las dudas.
      await marcar(item, ESTADO_LOCAL.REVISION, { mensaje: destino.motivo });
      resumen.enRevision += 1;
      continue;
    }
    const duenoId = item.operadorId == null ? null : Number(item.operadorId);
    const requerido = { operadorId: duenoId, nombre: item.operadorNombre ?? null };
    if (duenoId !== null && duenoId !== operadorActivoId) {
      const yaEsperaba = item.sync?.estado === ESTADO_LOCAL.ESPERA_OPERADOR;
      if (!yaEsperaba) await marcar(item, ESTADO_LOCAL.ESPERA_OPERADOR);
      if (operadorActivoId == null) {
        return corte(RESULTADO_SINCRONIZACION.ESPERA_PIN, { operadorRequerido: requerido });
      }
      if (!yaEsperaba) resumen.esperanOperador += 1;
      continue;
    }

    const venta = await api.crear(cuerpoDeReplay(item, destino.turnoId));
    if (!venta?.red) return corte(RESULTADO_SINCRONIZACION.SIN_RED);
    if (venta.status === 428) {
      await marcar(item, ESTADO_LOCAL.ESPERA_OPERADOR);
      return corte(RESULTADO_SINCRONIZACION.ESPERA_PIN, { operadorRequerido: requerido });
    }

    // 3. Lo que haya respondido, el estado lo dice el servidor.
    const rechazoVenta = venta.data?.ok
      ? null
      : { codigo: venta.data?.code ?? null, mensaje: textoDeRechazo(venta.data ?? {}) ?? null };
    if (venta.data?.ok && venta.data?.allowNegativeStockUsed) resumen.conStockNegativo += 1;
    const confirmacion = await registrar(item);
    if (confirmacion.corte) return corte(confirmacion.corte, { mensaje: confirmacion.mensaje ?? null });
    const pendiente = await aplicar(item, confirmacion.fila, rechazoVenta);
    if (pendiente === null) return corte(RESULTADO_SINCRONIZACION.ERROR);
    if (pendiente) {
      await marcar(item, ESTADO_LOCAL.PENDIENTE, rechazoVenta ?? {});
      resumen.pendientes += 1;
    }
  }
  return resumen;
}

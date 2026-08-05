// PROCESOS DE CAJA PENDIENTES — vocabulario y forma única.
//
// EL DEFECTO QUE ESTO CIERRA
//
// La exclusión mutua entre el retiro y el cierre funcionaba bien en el servidor:
// con un retiro en preparación, iniciar un cierre devolvía 409 y no se creaba
// nada. Pero la pantalla no mostraba ese 409 desde adentro del modal, así que el
// cajero apretaba "Separar cambio, iniciar cierre y liberar POS" y no pasaba
// nada visible. Sin cartel, sin explicación y sin salida: parecía un botón roto.
// Pasó en producción el 2026-08-04 en mini el 7, con el retiro del turno 198 a
// medio contar.
//
// LA REGLA
//
// Ningún proceso de caja pendiente puede quedar oculto. Si existe, hay que
// nombrarlo, mostrarlo, dejar continuarlo y —cuando se pueda deshacer sin tocar
// plata— dejar cancelarlo.
//
// POR QUÉ UN MÓDULO Y NO TEXTOS SUELTOS
//
// El aviso aparece en cuatro lugares: al entrar a iniciar un retiro, al entrar a
// iniciar un cierre, y al recibir el 409 de cada uno. Con los textos repetidos,
// arreglar uno dejaba los otros tres diciendo otra cosa. Es puro: lo importan
// tanto las rutas del servidor como las pantallas.

/** Los dos procesos que congelan un corte sobre el mismo turno. */
export const TIPO_PROCESO = { RETIRO: "RETIRO", CIERRE: "CIERRE" };

export const TITULO_PROCESO = {
  RETIRO: "Retiro de recaudación pendiente",
  CIERRE: "Cierre de caja pendiente",
};

export const TEXTO_PROCESO = {
  RETIRO:
    "Ya separaste el cambio e iniciaste un retiro. Antes de comenzar otro retiro o cerrar el turno, tenés que terminar o cancelar el proceso pendiente.",
  CIERRE:
    "Este turno ya tiene un cierre iniciado. Continuá ese cierre antes de intentar comenzar otro proceso.",
};

export const ACCION_CONTINUAR = {
  RETIRO: "Continuar retiro",
  CIERRE: "Continuar cierre",
};

export const ACCION_CANCELAR = {
  RETIRO: "Cancelar retiro",
  CIERRE: "Cancelar cierre",
};

export const ACCION_VOLVER = "Volver al POS";

/** Lo que se pregunta antes de deshacer. Dice qué NO va a pasar, que es lo que
 *  el cajero necesita saber para animarse a apretar. */
export const CONFIRMAR_CANCELAR = {
  RETIRO:
    "Vas a cancelar este retiro. No se registrará ninguna salida de dinero y la caja seguirá abierta.",
  CIERRE:
    "Vas a cancelar este cierre. No se registrará ningún arqueo, el cambio separado vuelve a la caja y el turno sigue abierto.",
};

export const EXITO_CANCELAR = {
  RETIRO: "Retiro cancelado. La caja sigue operativa.",
  CIERRE: "Cierre cancelado. La caja sigue operativa.",
};

/** Por qué un cierre ya no se puede deshacer: el sobre salió del cajón. */
export const CAMBIO_YA_TOMADO =
  "El cambio ya fue tomado por el siguiente operador. Este cierre debe terminarse.";

/** Motivo que se graba cuando la cancelación sale de este aviso. Los endpoints
 *  de cancelación exigen uno: es la autoría de la marcha atrás. */
export const MOTIVO_CANCELADO_DESDE_AVISO =
  "Cancelado desde el aviso de proceso pendiente, antes de contar.";

// ── Quién puede deshacerse ─────────────────────────────────────────────────

/**
 * Un cierre solo se cancela mientras su cambio siga en el cajón.
 *
 * Desde que el cambio se separa antes del corte, el sobre existe desde el primer
 * instante, así que encontrarlo no alcanza para negar la cancelación: lo que
 * bloquea es que otro operador ya lo haya tomado. El criterio es exactamente el
 * mismo que aplica el endpoint de cancelación —DISPONIBLE y sin turno destino—;
 * acá se replica para poder DECIRLO antes de que el cajero apriete, en vez de
 * dejarlo descubrir el 409.
 */
export function puedeCancelarCierre(sobre) {
  if (!sobre) return false;
  return sobre.estado === "DISPONIBLE" && sobre.turnoDestinoId == null;
}

/** Un retiro nunca publicó sobre ni movió plata: siempre se puede deshacer
 *  mientras no esté confirmado. */
export function puedeCancelarRetiro(retiro) {
  return !!retiro && retiro.estado === "PREPARANDO";
}

// ── La forma única del proceso pendiente ───────────────────────────────────
//
// Estos serializadores son lo que viaja en los 409 y en `turnos/actual`. Se
// mantienen ACOTADOS a propósito: token, tipo, si se puede cancelar y las cifras
// que el cartel muestra. Nada del otro local, nada de otro turno, ningún dato
// que el cajero no esté viendo ya en su propia pantalla.

/** @param retiro fila de RetiroPreparacion (Decimal o número, da igual). */
export function procesoPendienteDeRetiro(retiro, { operadorNombre = null } = {}) {
  if (!retiro?.token) return null;
  return {
    tipo: TIPO_PROCESO.RETIRO,
    token: retiro.token,
    puedeCancelar: puedeCancelarRetiro(retiro),
    corteEn: retiro.corteEn ?? null,
    totalCambio: retiro.totalCambio == null ? null : Number(retiro.totalCambio),
    efectivoRetiradoEsperado:
      retiro.efectivoRetiradoEsperado == null ? null : Number(retiro.efectivoRetiradoEsperado),
    operadorNombre,
    motivoNoCancelable: null,
  };
}

/**
 * @param cierre fila de CierrePreparacion.
 * @param sobre  su CambioPendiente, o null si el cierre es del flujo anterior
 *               —los cortes tomados antes del 2026-08-05 publicaban el sobre
 *               recién al confirmar, así que no tienen ninguno todavía—.
 */
export function procesoPendienteDeCierre(cierre, sobre, { operadorNombre = null } = {}) {
  if (!cierre?.token) return null;
  // Sin sobre no hay nada tomado y la cancelación sigue siendo reversible: el
  // endpoint de cancelación acepta ese caso. Con sobre, manda su estado.
  const cancelable = sobre ? puedeCancelarCierre(sobre) : true;
  return {
    tipo: TIPO_PROCESO.CIERRE,
    token: cierre.token,
    puedeCancelar: cancelable,
    corteEn: cierre.corteEn ?? null,
    totalCambio: cierre.totalCambio == null ? null : Number(cierre.totalCambio),
    efectivoRetiradoEsperado:
      cierre.efectivoRetiradoEsperado == null ? null : Number(cierre.efectivoRetiradoEsperado),
    operadorNombre,
    motivoNoCancelable: cancelable ? null : CAMBIO_YA_TOMADO,
  };
}

// ── Navegación ─────────────────────────────────────────────────────────────

/**
 * A dónde lleva "Continuar". Se navega POR TOKEN y nunca se inicia otro proceso:
 * el token es el que ya existe, y la pantalla de destino recupera sola el
 * borrador del conteo si lo hay.
 */
export function rutaProceso(tipo, token, enPestanaNueva = false) {
  if (!token) return null;
  const base =
    tipo === TIPO_PROCESO.RETIRO
      ? `/modulos/pos-ventas/retiros/${encodeURIComponent(token)}`
      : `/modulos/pos-ventas/cierres/${encodeURIComponent(token)}`;
  return enPestanaNueva ? `${base}?pestana=nueva` : base;
}

/** El endpoint que deshace cada proceso. */
export function rutaCancelar(tipo, token) {
  if (!token) return null;
  return tipo === TIPO_PROCESO.RETIRO
    ? `/api/pos-ventas/retiros/${encodeURIComponent(token)}/cancelar`
    : `/api/pos-ventas/cierres/${encodeURIComponent(token)}/cancelar`;
}

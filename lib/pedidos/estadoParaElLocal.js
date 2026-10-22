// lib/pedidos/estadoParaElLocal.js
//
// EL ESTADO DE UN PEDIDO EN PALABRAS DEL LOCAL.
//
// Un pedido al depósito tiene dos estados guardados que el local no tiene por
// qué conocer: el del pedido (`PosTransferencia.estado`: Borrador, Preparando,
// Solicitado, Enviando, Enviado, Cancelado) y, cuando salió, el de su
// transferencia (`Transferencia.estado`: Pendiente, Enviada, Recibiendo,
// Confirmando, Recibida, Cancelando, Cancelada). Más el criterio de
// "empezado" (`depositoEmpezo`, `lib/pedidos/bloqueoDelPedido.js`), que no es
// un estado. Esta función los lee juntos y dice UNA palabra. Es la única
// traducción: la usan la entrada de Pedidos, el historial y el detalle de un
// pedido (Emanuel, 2026-10-22).
//
// La lista que pidió Emanuel:
//   Borrador → "Borrador"; Solicitado sin empezar → "Enviado"; empezado por
//   el depósito → "Preparando"; despachado con la transferencia en camino →
//   "En camino"; transferencia recibida → "Recibido"; cancelado → "Cancelado".
//
// LOS QUE NO ENTRABAN EN LA LISTA, y cómo se dicen:
//   · el pedido en "Preparando" (estado guardado; `set-cantidad` lo trata
//     como un borrador) ........................... "Borrador";
//   · el pedido en "Enviando" (dura lo que la transacción del despacho) ...
//     "Preparando": el depósito ya lo empezó;
//   · la transferencia "Pendiente", "Recibiendo" o "Confirmando" (salió y
//     todavía no se terminó de recibir) .......... "En camino";
//   · la transferencia "Cancelando" o "Cancelada" (el despacho se anuló) ..
//     "Cancelado";
//   · despachado sin transferencia (pedidos viejos) ..... "En camino";
//   · cualquier otro valor ........................ el valor tal cual, para que
//     se vea y no se disfrace de otro.

import { ESTADO_PEDIDO } from "./estados.js";

export const ESTADO_LOCAL = Object.freeze({
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  PREPARANDO: "Preparando",
  EN_CAMINO: "En camino",
  RECIBIDO: "Recibido",
  CANCELADO: "Cancelado",
});

/**
 * @param {{ estado: string, depositoEmpezo?: boolean, transferenciaEstado?: string|null }} pedido
 * @returns {string} una de ESTADO_LOCAL, o el estado tal cual si no se conoce.
 */
export function estadoParaElLocal({ estado, depositoEmpezo = false, transferenciaEstado = null }) {
  switch (estado) {
    case ESTADO_PEDIDO.BORRADOR:
    case ESTADO_PEDIDO.PREPARANDO:
      return ESTADO_LOCAL.BORRADOR;
    case ESTADO_PEDIDO.SOLICITADO:
      return depositoEmpezo ? ESTADO_LOCAL.PREPARANDO : ESTADO_LOCAL.ENVIADO;
    case ESTADO_PEDIDO.ENVIANDO:
      return ESTADO_LOCAL.PREPARANDO;
    case ESTADO_PEDIDO.CANCELADO:
      return ESTADO_LOCAL.CANCELADO;
    case ESTADO_PEDIDO.ENVIADO:
      if (transferenciaEstado === "Recibida") return ESTADO_LOCAL.RECIBIDO;
      if (transferenciaEstado === "Cancelada" || transferenciaEstado === "Cancelando") return ESTADO_LOCAL.CANCELADO;
      return ESTADO_LOCAL.EN_CAMINO;
    default:
      return estado;
  }
}

/** Los que se manejan en la entrada de Pedidos, no en el detalle. */
export const SE_MANEJA_EN_LA_ENTRADA = Object.freeze([ESTADO_LOCAL.BORRADOR, ESTADO_LOCAL.ENVIADO, ESTADO_LOCAL.PREPARANDO]);

/** El color del SunmiPill de cada estado. */
export const COLOR_DEL_ESTADO = Object.freeze({
  [ESTADO_LOCAL.BORRADOR]: "slate",
  [ESTADO_LOCAL.ENVIADO]: "cyan",
  [ESTADO_LOCAL.PREPARANDO]: "amber",
  [ESTADO_LOCAL.EN_CAMINO]: "cyan",
  [ESTADO_LOCAL.RECIBIDO]: "green",
  [ESTADO_LOCAL.CANCELADO]: "slate",
});

// ── EL FILTRO DEL HISTORIAL ───────────────────────────────────────────────

export const FILTRO_HISTORIAL = Object.freeze({
  TODOS: "todos",
  EN_CURSO: "enCurso",
  RECIBIDOS: "recibidos",
  CANCELADOS: "cancelados",
});

export const OPCIONES_FILTRO_HISTORIAL = Object.freeze([
  { clave: FILTRO_HISTORIAL.TODOS, texto: "Todos" },
  { clave: FILTRO_HISTORIAL.EN_CURSO, texto: "En curso" },
  { clave: FILTRO_HISTORIAL.RECIBIDOS, texto: "Recibidos" },
  { clave: FILTRO_HISTORIAL.CANCELADOS, texto: "Cancelados" },
]);

/** "En curso" junta Borrador, Enviado, Preparando y En camino. */
const EN_CURSO = new Set([ESTADO_LOCAL.BORRADOR, ESTADO_LOCAL.ENVIADO, ESTADO_LOCAL.PREPARANDO, ESTADO_LOCAL.EN_CAMINO]);

/** Si un estado del local pasa el filtro del historial. */
export function pasaFiltroHistorial(estadoLocal, filtro) {
  switch (filtro) {
    case FILTRO_HISTORIAL.EN_CURSO:
      return EN_CURSO.has(estadoLocal);
    case FILTRO_HISTORIAL.RECIBIDOS:
      return estadoLocal === ESTADO_LOCAL.RECIBIDO;
    case FILTRO_HISTORIAL.CANCELADOS:
      return estadoLocal === ESTADO_LOCAL.CANCELADO;
    default:
      return true;
  }
}

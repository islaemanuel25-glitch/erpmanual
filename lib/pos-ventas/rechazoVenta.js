// lib/pos-ventas/rechazoVenta.js
//
// POR QUÉ `crear` NO ESCRIBIÓ UNA VENTA, CON UN CÓDIGO ESTABLE, Y QUÉ HACER CON
// EL COBRO OFFLINE QUE LA PEDÍA.
//
// Los rechazos de `/api/pos-ventas/crear` se distinguían por el texto del
// mensaje, que es para el cajero y puede cambiar. Para decidir qué pasa con un
// cobro offline que no pudo sincronizarse hace falta un dato que no cambie: el
// `code` de la respuesta. Agregarlo no cambia ni el status ni el mensaje.
//
// ── LA CLASIFICACIÓN ───────────────────────────────────────────────────────
//
// Dos preguntas, en orden, las dos sobre datos y ninguna sobre textos:
//
//   1. ¿La caja ORIGINAL del cobro puede todavía recibir la venta? Es la única
//      caja donde esa venta puede escribirse (DEC-0012): si cerró, está en
//      corte, se anuló o es de otro día, reintentar el mismo cobro no puede
//      funcionar nunca. → REVISIÓN.
//   2. Si puede, ¿el rechazo es del CONTENIDO del cobro (stock, lista, combo,
//      producto, cliente, turno equivocado)? Reintentar lo mismo da lo mismo.
//      → REVISIÓN.
//
// Todo lo demás —red, candado, concurrencia, sesión, falta el PIN, el PIN es de
// otro operador mientras la caja del dueño sigue abierta, o un rechazo sin
// código— queda PENDIENTE: puede funcionar en un reintento legítimo, sin que
// nadie cambie nada. Ante la duda, PENDIENTE: no saca al cobro del camino
// normal, y el intento queda anotado.
//
// REVISIÓN no impide que la venta se cree después (REQUIERE_REVISION →
// SINCRONIZADA es una transición válida): solo dice que reintentar el mismo
// cobro, tal cual, no alcanza.

import { estadoDelTurno, esCajaPropia, ESTADO_TURNO } from "@/lib/caja/cierreRelevo";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { CODIGO_RECHAZO_REGISTRO, CODIGO_COBRO_OFFLINE_DESCARTADO } from "@/lib/pos-ventas/cobroOffline";

/** Los códigos que `crear` agrega a sus rechazos. */
export const CODIGO_RECHAZO_VENTA = Object.freeze({
  /** El pedido no trae turno. */
  TURNO_REQUERIDO: "TURNO_REQUERIDO",
  /** El turno no existe o no es de este local (no se distingue: no se informa otro local). */
  TURNO_INVALIDO: "TURNO_INVALIDO",
  /** El turno es de este local pero es la caja de otro. Su estado no se informa. */
  TURNO_AJENO: "TURNO_AJENO",
  /** La caja propia ya cerró. */
  TURNO_CERRADO: "TURNO_CERRADO",
  /** La caja propia fue anulada. */
  TURNO_ANULADO: "TURNO_ANULADO",
  /** La caja propia tomó el corte de cierre. */
  TURNO_EN_CORTE: "TURNO_EN_CORTE",
  /** La caja propia se abrió un día anterior. */
  TURNO_DE_OTRO_DIA: "TURNO_DE_OTRO_DIA",
  /** El ítem declara una lista de precios que ya no es la que corresponde. */
  LISTA_PRECIOS_CAMBIADA: "LISTA_PRECIOS_CAMBIADA",
  /** El local exige cliente y la venta no lo trae. */
  CLIENTE_REQUERIDO: "CLIENTE_REQUERIDO",
  /** No alcanza el stock y el local no vende en negativo. */
  STOCK_INSUFICIENTE: "STOCK_INSUFICIENTE",
  /** Un combo o un componente no se puede vender. */
  COMBO_INVALIDO: "COMBO_INVALIDO",
  /** El producto no está en este local. */
  PRODUCTO_NO_EN_LOCAL: "PRODUCTO_NO_EN_LOCAL",
  /** El id del cobro ya es de una venta de otro local. Es el mismo código que el registro. */
  ID_DE_OTRO_LOCAL: CODIGO_RECHAZO_REGISTRO.ID_DE_OTRO_LOCAL,
});

/** El código de por qué un turno no sirvió para vender, con la identidad que lo pidió. */
export function codigoDeTurnoRechazado(turno, { localId, usuarioId, operadorId }) {
  if (!turno || turno.localId !== localId) return CODIGO_RECHAZO_VENTA.TURNO_INVALIDO;
  // La caja de otro primero: su estado —cerrada, en corte— no se le informa a
  // quien no es su dueño.
  if (!esCajaPropia(turno, { usuarioId, operadorId })) return CODIGO_RECHAZO_VENTA.TURNO_AJENO;
  return CODIGO_DE_ESTADO[estadoDelTurno(turno)] ?? CODIGO_RECHAZO_VENTA.TURNO_INVALIDO;
}

const CODIGO_DE_ESTADO = Object.freeze({
  [ESTADO_TURNO.CERRADO]: CODIGO_RECHAZO_VENTA.TURNO_CERRADO,
  [ESTADO_TURNO.ANULADO]: CODIGO_RECHAZO_VENTA.TURNO_ANULADO,
  [ESTADO_TURNO.CIERRE_EN_PREPARACION]: CODIGO_RECHAZO_VENTA.TURNO_EN_CORTE,
});

/**
 * ¿La caja original de un cobro puede todavía recibir su venta? La misma regla
 * que aplica `crear`: del local, operativa (ni cerrada, ni en corte, ni
 * anulada) y abierta hoy. No mira de quién es: eso lo decide el PIN de quien
 * sincroniza.
 *
 * @returns {{ operativa: true } | { operativa: false, motivo: string }}
 */
export function estadoDeCajaOriginal(turno, { localId, hoyAR }) {
  if (!turno || turno.localId !== localId) return { operativa: false, motivo: CODIGO_RECHAZO_VENTA.TURNO_INVALIDO };
  const deEstado = CODIGO_DE_ESTADO[estadoDelTurno(turno)];
  if (deEstado) return { operativa: false, motivo: deEstado };
  if (fechaArgentinaISO(turno.apertura) !== hoyAR) return { operativa: false, motivo: CODIGO_RECHAZO_VENTA.TURNO_DE_OTRO_DIA };
  return { operativa: true };
}

/**
 * Los rechazos del CONTENIDO del cobro: reintentarlo tal cual da lo mismo.
 * Un turno ajeno NO está acá: si la caja del dueño sigue operativa, el dueño
 * todavía puede sincronizarla con su PIN.
 */
const PERMANENTES = new Set([
  CODIGO_RECHAZO_VENTA.TURNO_REQUERIDO,
  CODIGO_RECHAZO_VENTA.TURNO_INVALIDO,
  CODIGO_RECHAZO_VENTA.TURNO_CERRADO,
  CODIGO_RECHAZO_VENTA.TURNO_ANULADO,
  CODIGO_RECHAZO_VENTA.TURNO_EN_CORTE,
  CODIGO_RECHAZO_VENTA.TURNO_DE_OTRO_DIA,
  CODIGO_RECHAZO_VENTA.LISTA_PRECIOS_CAMBIADA,
  CODIGO_RECHAZO_VENTA.CLIENTE_REQUERIDO,
  CODIGO_RECHAZO_VENTA.STOCK_INSUFICIENTE,
  CODIGO_RECHAZO_VENTA.COMBO_INVALIDO,
  CODIGO_RECHAZO_VENTA.PRODUCTO_NO_EN_LOCAL,
  CODIGO_RECHAZO_VENTA.ID_DE_OTRO_LOCAL,
]);

/** Qué pasa con el cobro después de un rechazo. */
export const DESTINO_RECHAZO = Object.freeze({
  /** Sigue PENDIENTE: un reintento legítimo puede funcionar. */
  REINTENTAR: "REINTENTAR",
  /** Pasa a REQUIERE_REVISION: reintentarlo tal cual no puede funcionar. */
  REVISAR: "REVISAR",
  /** No se toca: el cobro ya fue descartado. */
  NINGUNO: "NINGUNO",
});

/**
 * @param {{ codigo: string|null, cajaOriginal: { operativa: boolean, motivo?: string } }} rechazo
 * @returns {{ destino: string, motivo?: string }}
 */
export function clasificarRechazo({ codigo, cajaOriginal }) {
  if (codigo === CODIGO_COBRO_OFFLINE_DESCARTADO) return { destino: DESTINO_RECHAZO.NINGUNO };
  if (!cajaOriginal?.operativa) return { destino: DESTINO_RECHAZO.REVISAR, motivo: cajaOriginal?.motivo ?? CODIGO_RECHAZO_VENTA.TURNO_INVALIDO };
  if (codigo && PERMANENTES.has(codigo)) return { destino: DESTINO_RECHAZO.REVISAR, motivo: codigo };
  return { destino: DESTINO_RECHAZO.REINTENTAR };
}

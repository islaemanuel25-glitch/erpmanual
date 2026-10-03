// lib/pos-ventas/cobroOffline.js
//
// EL COBRO OFFLINE COMO SE GUARDA EN EL SERVIDOR: saneado, validado y con hash.
//
// Un cobro hecho sin conexión vive en la cola del navegador
// (app/modulos/pos-ventas/helpers/offlineQueue.js). Cuando vuelve la red, el
// POS lo registra en el servidor (`CobroOffline`) antes de intentar la venta.
// Lo que se guarda es EVIDENCIA declarada por el dispositivo, no una venta.
//
// Acá vive la parte pura: qué se guarda de cada cobro (lista blanca), qué topes
// tiene un pedido, y el hash con que se reconoce el mismo contenido. La parte
// que escribe en la base está en lib/pos-ventas/cobroOfflineServidor.js.
//
// ── LISTA BLANCA, NO LISTA NEGRA ───────────────────────────────────────────
//
// Se copia solo lo conocido; todo lo demás se tira. Así un campo nuevo de la
// cola no se persiste por accidente, y un token metido en el cobro —el
// `operadorVoucher` es un token firmado que no vence— nunca llega a la base.
// El voucher se verifica ANTES de sanear y se guarda solo el resultado
// (`operadorVerificadoId`); ver cobroOfflineServidor.js.
//
// Los campos de la línea son exactamente los que arma `itemCrearPayload`
// (lib/pos-ventas/payloadVenta.js), que es lo que la cola guarda y lo que
// `/api/pos-ventas/crear` recibe.

import { createHash } from "node:crypto";
import { jsonCanonico } from "@/lib/pos-ventas/intentoCobro";

export const ESTADO_COBRO_OFFLINE = Object.freeze({
  PENDIENTE: "PENDIENTE",
  REQUIERE_REVISION: "REQUIERE_REVISION",
  SINCRONIZADA: "SINCRONIZADA",
  DESCARTADA: "DESCARTADA",
});

/** Lo que pasó con cada cobro del pedido de registro. */
export const RESULTADO_REGISTRO = Object.freeze({
  /** Fila nueva. */
  CREADO: "CREADO",
  /** Ya estaba, con el mismo contenido, en el mismo local. */
  YA_REGISTRADO: "YA_REGISTRADO",
  /** La venta con ese id ya existía en su caja: quedó SINCRONIZADA. */
  RECONCILIADO: "RECONCILIADO",
  /** No se registró; ver `codigo`. */
  RECHAZADO: "RECHAZADO",
});

export const CODIGO_RECHAZO_REGISTRO = Object.freeze({
  /** El id ya es de otro local (un cobro o una venta). No se dice nada más. */
  ID_DE_OTRO_LOCAL: "ID_DE_OTRO_LOCAL",
  /** El id ya está registrado con otro contenido: el original no se toca. */
  CONTENIDO_DISTINTO: "CONTENIDO_DISTINTO",
  /** El cobro declara otro local que el de la sesión que lo registra. */
  LOCAL_DECLARADO_DISTINTO: "LOCAL_DECLARADO_DISTINTO",
  /** No cumple la forma de un cobro de la cola. */
  INVALIDO: "INVALIDO",
});

/** Por qué un cobro nace en REQUIERE_REVISION. */
export const MOTIVO_REVISION = Object.freeze({
  /** Cobro de antes de la caja por operador: no trae turno. */
  SIN_TURNO: "SIN_TURNO",
  /** El turno declarado no existe o es de otro local. */
  TURNO_AJENO: "TURNO_AJENO",
  /** Ya hay una venta con ese id, del mismo local, en otra caja. */
  ID_EN_OTRA_VENTA: "ID_EN_OTRA_VENTA",
});

/** El código con que `crear` rechaza una venta cuyo cobro offline se descartó. */
export const CODIGO_COBRO_OFFLINE_DESCARTADO = "COBRO_OFFLINE_DESCARTADO";

export const LIMITES_REGISTRO = Object.freeze({
  cobrosPorPedido: 50,
  lineasPorCobro: 500,
  bytesPorPedido: 512 * 1024,
  largoTexto: 200,
  largoId: 100,
});

/** Los campos del cobro que se guardan. Todo lo demás se tira. */
export const CAMPOS_COBRO = Object.freeze([
  "clientVentaId",
  "createdAt",
  "localId",
  "userId",
  "operadorId",
  "turnoId",
  "formaPago",
  "subtotal",
  "descuento",
  "descuentoPorPuntos",
  "total",
  "clienteId",
]);

/** Los campos de cada línea: los de `itemCrearPayload`. */
export const CAMPOS_LINEA = Object.freeze([
  "productoBaseId",
  "nombre",
  "precio",
  "cantidad",
  "precioCosto",
  "modoVentaLinea",
  "listaPrecioId",
  "tipoPrecioAplicado",
  "margenAplicado",
  "esServicio",
  "importeBaseServicio",
  "subtotalFijado",
]);

/**
 * Solo valores simples: un objeto o un arreglo metido en un campo simple no se
 * guarda —sería una forma de colar datos por fuera de la lista blanca—. Los
 * textos se recortan.
 */
function valorSimple(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return valor.slice(0, LIMITES_REGISTRO.largoTexto);
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "boolean") return valor;
  return null;
}

function copiar(origen, campos) {
  const destino = {};
  for (const campo of campos) destino[campo] = valorSimple(origen?.[campo]);
  return destino;
}

/**
 * El cobro de la cola, saneado por lista blanca y validado.
 *
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
export function sanearCobro(cobro) {
  if (!cobro || typeof cobro !== "object" || Array.isArray(cobro)) {
    return { ok: false, error: "El cobro no es un objeto." };
  }
  const id = cobro.clientVentaId;
  if (typeof id !== "string" || id.trim() === "" || id.length > LIMITES_REGISTRO.largoId) {
    return { ok: false, error: "El cobro no trae un clientVentaId válido." };
  }
  if (!Array.isArray(cobro.items) || cobro.items.length === 0) {
    return { ok: false, error: "El cobro no trae líneas." };
  }
  if (cobro.items.length > LIMITES_REGISTRO.lineasPorCobro) {
    return { ok: false, error: `El cobro trae más de ${LIMITES_REGISTRO.lineasPorCobro} líneas.` };
  }
  if (cobro.items.some((linea) => !linea || typeof linea !== "object" || Array.isArray(linea))) {
    return { ok: false, error: "Una línea del cobro no es un objeto." };
  }
  const total = Number(cobro.total);
  if (!Number.isFinite(total) || total < 0) {
    return { ok: false, error: "El cobro no trae un total válido." };
  }
  if (typeof cobro.formaPago !== "string" || cobro.formaPago.trim() === "") {
    return { ok: false, error: "El cobro no trae forma de pago." };
  }

  const payload = copiar(cobro, CAMPOS_COBRO);
  payload.items = cobro.items.map((linea) => copiar(linea, CAMPOS_LINEA));
  return { ok: true, payload };
}

/** SHA-256 de la forma canónica del payload YA saneado. */
export function hashDePayload(payload) {
  return createHash("sha256").update(jsonCanonico(payload)).digest("hex");
}

/** Un id positivo, o null. */
export function idPositivo(valor) {
  const n = Number(valor);
  return valor !== null && valor !== undefined && Number.isInteger(n) && n > 0 ? n : null;
}

const DESDE = Date.UTC(2020, 0, 1);
const UN_DIA = 24 * 60 * 60 * 1000;

/**
 * Una hora declarada por el dispositivo, como evidencia. Fuera de un rango
 * creíble —antes de 2020 o más de un día en el futuro del servidor— no se
 * guarda en la columna (queda solo en el payload).
 */
export function horaDeDispositivo(ms, ahora = Date.now()) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < DESDE || n > ahora + UN_DIA) return null;
  return new Date(n);
}

/** El total declarado, como texto con dos decimales para el Decimal(12,2). */
export function totalDeclarado(payload) {
  return Number(payload.total).toFixed(2);
}

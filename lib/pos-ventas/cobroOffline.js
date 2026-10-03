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

// ── LO QUE LA BASE PUEDE GUARDAR ───────────────────────────────────────────
//
// Un valor que la columna no puede guardar no puede llegar a Prisma: falla la
// consulta y con ella el pedido entero, incluidos los cobros vecinos, y cada
// reintento vuelve a fallar igual. Se rechaza ese cobro como INVALIDO.

/** El mayor `Int` de PostgreSQL (int4), que es el tipo de los ids de la tabla. */
export const MAXIMO_INT32 = 2_147_483_647;

/**
 * `totalDeclarado` es `Decimal(12, 2)` en prisma/schema.prisma: 12 dígitos en
 * total y 2 decimales, así que a lo sumo 10 enteros; el máximo es
 * 9999999999.99. PostgreSQL redondea a la escala ANTES de mirar la precisión,
 * así que lo que se compara es el texto ya redondeado, que es el que se guarda.
 */
export const DECIMAL_TOTAL = Object.freeze({ precision: 12, escala: 2 });
const TOTAL_GUARDABLE = new RegExp(
  `^\\d{1,${DECIMAL_TOTAL.precision - DECIMAL_TOTAL.escala}}\\.\\d{${DECIMAL_TOTAL.escala}}$`
);

/**
 * Los campos del cobro que son ids. Cada uno viene vacío (null o ausente) o es
 * un id que `idPositivo` acepta; cualquier otra cosa hace INVALIDO el cobro.
 */
const CAMPOS_ID = Object.freeze(["localId", "userId", "operadorId", "turnoId", "clienteId"]);

/**
 * Un texto que PostgreSQL puede guardar tal cual: sin NUL —ni `text` ni `jsonb`
 * lo admiten— y UTF-16 bien formado —un surrogate suelto no tiene UTF-8—.
 * Si no, el cobro es INVALIDO: no se reemplaza ni se borra nada para que entre.
 */
export function textoPersistible(texto) {
  return typeof texto === "string" && !texto.includes("\u0000") && texto.isWellFormed();
}

/** El primer campo de `origen` cuyo texto no se puede guardar, o undefined. */
function campoConTextoNoPersistible(origen, campos) {
  return campos.find((campo) => typeof origen?.[campo] === "string" && !textoPersistible(origen[campo]));
}

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
 * textos se recortan, sin partir un par surrogate: un corte en el medio de un
 * emoji dejaría un surrogate suelto que PostgreSQL no puede guardar.
 */
function recortar(texto) {
  if (texto.length <= LIMITES_REGISTRO.largoTexto) return texto;
  const corte = texto.slice(0, LIMITES_REGISTRO.largoTexto);
  return /[\uD800-\uDBFF]$/.test(corte) ? corte.slice(0, -1) : corte;
}

function valorSimple(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return recortar(valor);
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
  const idInvalido = CAMPOS_ID.find((campo) => cobro[campo] != null && idPositivo(cobro[campo]) === null);
  if (idInvalido) {
    return { ok: false, error: `El cobro trae un ${idInvalido} que no es un id.` };
  }
  // Se mira el texto ORIGINAL, antes de recortarlo: un NUL más allá del recorte
  // también hace inválido el cobro, en vez de desaparecer en silencio.
  const textoMalo =
    campoConTextoNoPersistible(cobro, CAMPOS_COBRO) ??
    cobro.items.map((linea) => campoConTextoNoPersistible(linea, CAMPOS_LINEA)).find(Boolean);
  if (textoMalo) {
    return { ok: false, error: `El cobro trae en ${textoMalo} un texto que no se puede guardar.` };
  }

  const payload = copiar(cobro, CAMPOS_COBRO);
  payload.items = cobro.items.map((linea) => copiar(linea, CAMPOS_LINEA));
  if (totalDeclarado(payload) === null) {
    return { ok: false, error: "El cobro trae un total que no entra en la columna." };
  }
  return { ok: true, payload };
}

/** SHA-256 de la forma canónica del payload YA saneado. */
export function hashDePayload(payload) {
  return createHash("sha256").update(jsonCanonico(payload)).digest("hex");
}

const ENTERO_DECIMAL_POSITIVO = /^[1-9]\d*$/;

/**
 * Un id declarado: un número entero o un texto en decimal llano, entre 1 y el
 * máximo del int4; si no, null. No pasa por `Number()` antes de mirar el tipo,
 * porque convierte `true` en 1, "0x7fffffff" en 2147483647 y "1e3" en 1000.
 */
export function idPositivo(valor) {
  let n;
  if (typeof valor === "number") n = valor;
  else if (typeof valor === "string" && ENTERO_DECIMAL_POSITIVO.test(valor)) n = Number(valor);
  else return null;
  return Number.isSafeInteger(n) && n >= 1 && n <= MAXIMO_INT32 ? n : null;
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

/**
 * El total declarado, como el texto que se guarda en el Decimal(12,2), o null
 * si no entra: negativo, no finito, o con más enteros que los que la columna
 * admite una vez redondeado a la escala. Nunca se recorta para que entre.
 */
export function totalDeclarado(payload) {
  const n = Number(payload?.total);
  if (!Number.isFinite(n) || n < 0) return null;
  const texto = n.toFixed(DECIMAL_TOTAL.escala);
  return TOTAL_GUARDABLE.test(texto) ? texto : null;
}

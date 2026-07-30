// lib/ventas-internas/integracionVenta.js
//
// Piezas PURAS de la integración POS Venta → Transferencia (etapa 4). El route de
// pos-ventas/crear es monolítico; todo lo que se pueda decidir sin base vive acá
// para poder testearlo en aislamiento y para no repetir la regla en cada ruta.
//
// No importa Prisma ni Next: recibe datos ya resueltos y devuelve decisiones.
//
// Distinto de:
//   · vinculo.js              → ¿esta operación califica como venta interna?
//   · configurarVinculo.js    → configurar Cliente.localVinculadoId desde la UI
//   · mapearVentaATransferencia.js → consumo físico → items de transferencia
// Este módulo une esas piezas con las respuestas HTTP y los bloqueos temporales.

import { CODIGOS } from "./vinculo.js";

/**
 * Códigos que significan "esta venta NO es interna" y son perfectamente normales:
 * una venta sin cliente, o con un cliente externo, sigue funcionando como siempre.
 */
export const CODIGOS_SIN_VINCULO = [
  CODIGOS.CLIENTE_AUSENTE,
  CODIGOS.CLIENTE_SIN_LOCAL_VINCULADO,
];

export function esSinVinculo(codigo) {
  return CODIGOS_SIN_VINCULO.includes(codigo);
}

/**
 * Respuesta HTTP para un vínculo DECLARADO pero estructuralmente inválido.
 *
 * Estos casos NO degradan a venta común a propósito: el cliente representa a un
 * local interno, así que dejar pasar la venta sin transferencia generaría deuda
 * por mercadería que nunca sale del depósito. Es preferible rechazar y que alguien
 * corrija la configuración.
 *
 * @param {string} codigo  uno de los códigos de vinculo.js
 * @returns {{ status: number, error: string, code: string }|null}
 *   null si el código no es un fallo estructural (o sea: no corresponde rechazar).
 */
export function respuestaVinculoInvalido(codigo, { nombreLocal = null } = {}) {
  const destino = nombreLocal ? `“${nombreLocal}”` : "vinculado";

  switch (codigo) {
    // 403 — permiso.
    case CODIGOS.SIN_PERMISO_TRANSFERENCIA:
      return {
        status: 403,
        code: codigo,
        error: "No tenés permiso para generar la transferencia de esta venta.",
      };

    // 409 — conflicto estructural entre grupos: los datos existen pero no se
    // corresponden entre sí, y no es algo que el cajero pueda arreglar.
    case CODIGOS.ORIGEN_FUERA_DEL_GRUPO:
      return {
        status: 409,
        code: codigo,
        error: "El depósito desde el que vendés no pertenece a este grupo.",
      };
    case CODIGOS.DESTINO_FUERA_DEL_GRUPO:
      return {
        status: 409,
        code: codigo,
        error: `El local interno ${destino} no pertenece al mismo grupo.`,
      };

    // 400 — configuración inválida.
    case CODIGOS.ORIGEN_NO_ES_DEPOSITO:
      return {
        status: 400,
        code: codigo,
        error:
          "Este cliente representa a un local interno, pero la venta no se realiza desde un depósito.",
      };
    case CODIGOS.DESTINO_INACTIVO:
      return {
        status: 400,
        code: codigo,
        error: `El local interno ${destino} está inactivo.`,
      };
    case CODIGOS.ORIGEN_Y_DESTINO_IGUALES:
      return {
        status: 400,
        code: codigo,
        error: "El local interno vinculado es el mismo depósito que vende.",
      };
    case CODIGOS.DESTINO_AUSENTE:
      return {
        status: 400,
        code: codigo,
        error: "El local interno vinculado a este cliente no existe.",
      };
    case CODIGOS.ORIGEN_AUSENTE:
      return {
        status: 400,
        code: codigo,
        error: "No se pudo resolver el local desde el que se vende.",
      };

    default:
      // VENTA_INTERNA_VALIDA, CLIENTE_AUSENTE y CLIENTE_SIN_LOCAL_VINCULADO no
      // son rechazos.
      return null;
  }
}

/**
 * Índice productoLocalId → fila de ProductoLocal (con `.base`), que es lo que
 * crearTransferencia necesita para crear el ProductoLocal del destino y congelar
 * `precioCosto`.
 *
 * Se arma desde UNA consulta consolidada; nunca una por ítem.
 *
 * @param {Array<object>} productosLocales  filas con { id, ..., base }
 * @returns {Map<number, object>}
 */
export function construirSnapshots(productosLocales = []) {
  const mapa = new Map();
  for (const pl of productosLocales || []) {
    if (!pl || !Number.isInteger(Number(pl.id))) continue;
    mapa.set(Number(pl.id), pl);
  }
  return mapa;
}

/** IDs de ProductoLocal del origen que hay que cargar para los snapshots. */
export function idsParaSnapshots(consumoFisicoConsolidado = []) {
  const ids = new Set();
  for (const c of consumoFisicoConsolidado || []) {
    const id = Number(c?.productoLocalId);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

// ── Bloqueos temporales ───────────────────────────────────────────────────────
//
// La etapa 4 activa la creación de transferencias desde ventas, pero todavía NO
// implementa la sincronización inversa. Sin estos bloqueos, dos flujos existentes
// producirían inconsistencias reales:
//
//   · cancelar transferencia hace `cantidad += enviado`. Como la venta ya hizo el
//     `cantidad -=` (la transferencia usa SOLO_TRANSITO), cancelar devolvería
//     mercadería que la venta sigue cobrando: stock inventado + deuda viva.
//   · corregir una venta revierte y reaplica su consumo sin saber nada de la
//     transferencia, que quedaría enviada por cantidades que ya no existen.
//
// Bloquear es preferible a permitir la inconsistencia.

export const COD_CANCELAR_BLOQUEADA = "TRANSFERENCIA_DE_VENTA_NO_CANCELABLE";
export const COD_CORRECCION_BLOQUEADA = "VENTA_CON_TRANSFERENCIA_VINCULADA";

/**
 * ¿Se puede cancelar esta transferencia? Una generada desde una venta, no.
 * @param {object|null} transferencia  se lee `ventaId`
 * @returns {{ status: number, error: string, code: string }|null}
 */
export function bloqueoCancelacion(transferencia) {
  const ventaId = transferencia?.ventaId;
  if (ventaId == null) return null;
  return {
    status: 409,
    code: COD_CANCELAR_BLOQUEADA,
    error:
      "Esta transferencia fue generada desde una venta. Para revertirla, corregí o anulá la venta vinculada.",
  };
}

/**
 * ¿Se puede corregir esta venta? Si tiene transferencia vinculada, todavía no
 * —en ningún estado—: ni Enviada, ni Recibiendo, ni Recibida.
 *
 * Se bloquea también en "Recibida" a propósito: la mercadería ya está en el otro
 * local, así que corregir la venta dejaría el stock del destino sin respaldo.
 *
 * @param {object|null} venta  se lee `transferencia` ({ id, estado } o null)
 * @returns {{ status: number, error: string, code: string }|null}
 */
export function bloqueoCorreccion(venta) {
  const t = venta?.transferencia;
  if (!t) return null;
  const estado = t.estado ? ` (estado: ${t.estado})` : "";
  return {
    status: 409,
    code: COD_CORRECCION_BLOQUEADA,
    error:
      `Esta venta tiene una transferencia vinculada${estado}. ` +
      "La corrección sincronizada todavía no está disponible.",
  };
}

/**
 * Reintento con `clientTxnId` de una venta que YA existe.
 *
 * Si esa venta es interna y movió mercadería física, tiene que tener su
 * transferencia. Si no la tiene, es una venta huérfana y devolver "ok, duplicada"
 * ocultaría una venta interna sin transferencia.
 *
 * NO se repara automáticamente. La reconstrucción es técnicamente posible desde
 * VentaDetalle.cantidadStock + VentaDetalleComponente.cantidad, pero una huérfana
 * solo puede venir de una venta anterior a esta etapa —cuya mercadería ya se
 * entregó hace tiempo— o de una corrupción. Crear hoy una transferencia "Enviada"
 * por eso marcaría en viaje algo que ya llegó. Requiere intervención humana.
 *
 * @param {object} args
 * @param {boolean} args.esInterna       la venta existente es de un cliente interno
 * @param {boolean} args.tieneFisico     tiene al menos una línea con consumo físico
 * @param {boolean} args.tieneTransferencia
 * @returns {{ status: number, error: string, code: string }|null}
 */
export function bloqueoReintentoHuerfana({
  esInterna = false,
  tieneFisico = false,
  tieneTransferencia = false,
} = {}) {
  if (!esInterna || !tieneFisico || tieneTransferencia) return null;
  return {
    status: 409,
    code: "VENTA_INTERNA_SIN_TRANSFERENCIA",
    error:
      "Esta venta es para un local interno y movió mercadería, pero no tiene la transferencia asociada. " +
      "Requiere revisión manual: no se genera automáticamente para no marcar en viaje mercadería ya entregada.",
  };
}

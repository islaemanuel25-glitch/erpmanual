// lib/caja/retiroRelevo.js
//
// RETIRO DE RECAUDACIÓN CON CORTE CONGELADO: las reglas, sin base y sin HTTP.
//
// EL PROBLEMA QUE RESUELVE
//
// El retiro no tenía corte. El efectivo esperado se recalculaba en cada lectura
// y otra vez, definitivamente, dentro de la transacción que confirmaba. Como
// contar un cajón lleva veinte minutos y el POS sigue vendiendo, el esperado
// crecía mientras el cajero contaba: al confirmar se comparaba un conteo de las
// 19:00 contra un esperado de las 19:20, y aparecía un faltante por plata que
// entró después de que el cajero cerrara la pila.
//
// EL ORDEN FÍSICO CORRECTO
//
//   1. se separa el cambio que queda para seguir vendiendo y se cuenta;
//   2. se toma el corte: quedan congelados el esperado, la frontera por id y el
//      cambio, y se calcula el retiro esperado;
//   3. el POS SIGUE OPERANDO — a diferencia del cierre, acá el turno no se
//      congela: la caja vende con el cambio separado;
//   4. se cuenta ÚNICAMENTE el dinero retirado;
//   5. se compara contra el retiro esperado congelado.
//
// EN QUÉ SE DIFERENCIA DEL CIERRE
//
// El cierre congela el turno y publica un sobre para el operador que releva.
// El retiro no hace ninguna de las dos cosas: el mismo turno sigue vivo, el
// cambio se queda en el mismo cajón y las ventas posteriores se acumulan encima.
// Por eso son dos tablas y dos módulos, aunque la mecánica del congelamiento sea
// la misma.
//
// Este archivo es PURO: se prueba sin levantar nada.

import { aCentavos, desdeCentavos, calcularDiferencia } from "./efectivoEsperado.js";
import { calcularRetiroEsperado, unirDesgloses } from "./cierreRelevo.js";

// ── Estados ────────────────────────────────────────────────────────────────

/**
 * Tres estados, no cuatro.
 *
 * El cierre tiene además VENCIDO porque su corte congela el turno y alguien
 * tiene que ir a destrabarlo. Un retiro abandonado no traba nada —la caja sigue
 * vendiendo con el cambio separado— así que no necesita una marca de atraso.
 */
export const ESTADO_RETIRO = {
  PREPARANDO: "PREPARANDO",
  CONFIRMADO: "CONFIRMADO",
  CANCELADO: "CANCELADO",
};

/** ¿Se puede confirmar esta preparación? */
export function retiroConfirmable(retiro) {
  return retiro?.estado === ESTADO_RETIRO.PREPARANDO;
}

/** ¿Se puede cancelar? Sólo antes de confirmar: después ya movió plata. */
export function retiroCancelable(retiro) {
  return retiro?.estado === ESTADO_RETIRO.PREPARANDO;
}

// ── Identidad ──────────────────────────────────────────────────────────────

/**
 * Clave de idempotencia del retiro.
 *
 * A DIFERENCIA DEL CIERRE, NO se deriva del turnoId. El cierre puede hacerlo
 * porque un turno se cierra una sola vez; una caja, en cambio, hace varios
 * retiros en la misma jornada y todos son legítimos. Si la clave fuera
 * `retiro-<turnoId>`, el segundo retiro del día chocaría contra la
 * @@unique([turnoId, idempotencyKey]) de ArqueoCaja y sería imposible.
 *
 * Se genera una vez, al tomar el corte, y se conserva hasta la confirmación: dos
 * confirmaciones de la MISMA preparación colapsan en una sola fila, que es
 * exactamente lo que se busca.
 */
export function claveIdempotenciaRetiro(preparacionId) {
  return `retiro-prep-${preparacionId}`;
}

/** Motivo del CajaMovimiento del retiro, legible por un humano. */
export function motivoRetiroPreparacion(preparacionId) {
  return `Retiro de recaudación #${preparacionId}`;
}

// ── Aritmética ─────────────────────────────────────────────────────────────

/**
 * El retiro esperado del corte. Es la MISMA fórmula que usa el cierre y por eso
 * se reexporta en vez de reescribirse: dos definiciones de "cuánto tendría que
 * salir del cajón" que se desincronizan es exactamente el tipo de bug que este
 * proyecto viene arrastrando en la caja.
 */
export { calcularRetiroEsperado, unirDesgloses };

/**
 * Lo que se deriva de contar únicamente el dinero retirado.
 *
 *     diferencia      = retiro contado − retiro esperado congelado
 *     total del cajón = retiro contado + cambio separado
 *
 * El total del cajón se deriva y no se cuenta: es lo que había en la caja al
 * momento del corte, y es el número que se sigue guardando en
 * `ArqueoCaja.efectivoContado` para que esa columna no cambie de significado
 * entre los registros viejos y los nuevos.
 */
export function calcularRetiroDesdeConteo({
  totalRetiroContado,
  totalCambio,
  efectivoRetiradoEsperado,
} = {}) {
  const retiro = aCentavos(totalRetiroContado);
  const cambio = aCentavos(totalCambio);

  if (!Number.isFinite(retiro) || retiro < 0) {
    return { valido: false, error: "El retiro contado no es un importe válido." };
  }
  if (!Number.isFinite(cambio) || cambio < 0) {
    return { valido: false, error: "El cambio separado no es un importe válido." };
  }

  return {
    valido: true,
    error: null,
    totalRetiroContado: desdeCentavos(retiro),
    totalCambio: desdeCentavos(cambio),
    totalCajonDerivado: desdeCentavos(retiro + cambio),
    diferencia: calcularDiferencia(desdeCentavos(retiro), efectivoRetiradoEsperado),
  };
}

/**
 * ¿Hubo actividad después del corte?
 *
 * Se compara por ID, igual que la frontera. Es SOLO INFORMATIVO: sirve para
 * decirle al cajero "entraron ventas, no forman parte de este retiro" y nada
 * más. No pide reconfirmar, no cambia ningún número y no bloquea la
 * confirmación — todo lo contrario del comportamiento anterior, donde detectar
 * movimiento hacía adoptar un esperado nuevo.
 */
export function actividadPosterior({
  ultimaVentaId,
  ultimoMovimientoId,
  ultimaVentaActualId,
  ultimoMovimientoActualId,
} = {}) {
  const ventas =
    ultimaVentaActualId != null && (ultimaVentaId == null || ultimaVentaActualId > ultimaVentaId);
  const movimientos =
    ultimoMovimientoActualId != null &&
    (ultimoMovimientoId == null || ultimoMovimientoActualId > ultimoMovimientoId);
  return { hay: ventas || movimientos, ventas, movimientos };
}

export const AVISO_ACTIVIDAD_POSTERIOR =
  "Hubo operaciones después del corte. No forman parte de este retiro.";

// ── Textos ─────────────────────────────────────────────────────────────────

export const TITULO_PREPARAR_RETIRO = "Preparar retiro de recaudación";
export const TITULO_RETIRO = "Retiro de recaudación";

export const AYUDA_CAMBIO_RETIRO =
  "Separá primero el cambio que quedará disponible para seguir vendiendo. Después del corte contarás únicamente el dinero retirado.";

export const AVISO_CONTAR_SOLO_RETIRO =
  "Contá únicamente el dinero que retiraste. El cambio ya quedó separado y no forma parte de este conteo.";

export const ACCION_INICIAR_RETIRO = "Separar cambio e iniciar retiro";

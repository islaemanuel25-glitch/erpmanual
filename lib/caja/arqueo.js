// lib/caja/arqueo.js
//
// POLÍTICA de los arqueos parciales de caja: cuándo vence la alerta, cuánta
// demora acumula, si una postergación necesita autorización.
//
// Pura y sin fechas implícitas: el "ahora" y la configuración se inyectan, así
// que el vencimiento se puede probar sin esperar dos horas ni tocar el reloj.
//
// ANCLAJE AL TURNO, no al calendario. La próxima alerta se calcula desde el
// último arqueo del MISMO turno, o desde la apertura si todavía no hubo
// ninguno. Nunca desde una hora fija del día: un turno que abre 08:00 con
// intervalo de 120 min alerta 10:00; si el arqueo se hace 10:13, la siguiente
// es 12:13, no 12:00. Por eso un turno que cruza la medianoche sigue
// funcionando sin ninguna regla de día contable.

export const TIPO_PARCIAL = "PARCIAL";
export const TIPO_FINAL = "FINAL";

/** Defaults de la configuración por local. `activo: false` para no alterar producción. */
export const CONFIG_ARQUEO_DEFAULT = {
  arqueoCajaActivo: false,
  intervaloArqueoMinutos: 120,
  toleranciaPostergacionMinutos: 15,
  postergacionCajeroMinutos: 10,
  requiereAutorizacionPostergacion: true,
};

const MS_MINUTO = 60_000;

function aFecha(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isFinite(d.getTime()) ? d : null;
}

function aEnteroPositivo(valor, porDefecto) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.floor(n);
}

/**
 * Normaliza la configuración de arqueo de un local. Un valor ausente o
 * inservible cae al default en vez de romper: la alerta es una ayuda operativa,
 * no puede tumbar el POS por un cero mal cargado.
 */
export function normalizarConfig(config = {}) {
  return {
    arqueoCajaActivo: config?.arqueoCajaActivo === true,
    intervaloArqueoMinutos: aEnteroPositivo(
      config?.intervaloArqueoMinutos,
      CONFIG_ARQUEO_DEFAULT.intervaloArqueoMinutos
    ),
    toleranciaPostergacionMinutos: aEnteroPositivo(
      config?.toleranciaPostergacionMinutos,
      CONFIG_ARQUEO_DEFAULT.toleranciaPostergacionMinutos
    ),
    postergacionCajeroMinutos: aEnteroPositivo(
      config?.postergacionCajeroMinutos,
      CONFIG_ARQUEO_DEFAULT.postergacionCajeroMinutos
    ),
    requiereAutorizacionPostergacion: config?.requiereAutorizacionPostergacion !== false,
  };
}

/**
 * Momento base del que se cuenta el próximo intervalo: el último arqueo del
 * turno, o la apertura si todavía no hubo ninguno.
 */
export function baseDelIntervalo({ apertura, ultimoArqueoEn = null } = {}) {
  return aFecha(ultimoArqueoEn) || aFecha(apertura);
}

/**
 * Cuándo vence la próxima alerta, sin considerar postergaciones.
 * Devuelve null si no hay base (turno inexistente).
 */
export function proximaAlerta({ apertura, ultimoArqueoEn = null, intervaloMinutos } = {}) {
  const base = baseDelIntervalo({ apertura, ultimoArqueoEn });
  if (!base) return null;
  const minutos = aEnteroPositivo(intervaloMinutos, CONFIG_ARQUEO_DEFAULT.intervaloArqueoMinutos);
  return new Date(base.getTime() + minutos * MS_MINUTO);
}

/**
 * Estado completo de la alerta para un turno.
 *
 * No hay alerta si: el turno está cerrado, la función está desactivada en ese
 * local, o el intervalo todavía no venció.
 *
 * @param {object} args
 * @param {Date|string} args.ahora
 * @param {object|null} args.turno  { apertura, cierre }
 * @param {Date|string|null} args.ultimoArqueoEn
 * @param {Date|string|null} args.postergadoHasta  vencimiento de la última postergación vigente
 * @param {number} args.cantidadPostergaciones
 * @param {object} args.config
 */
export function estadoArqueo({
  ahora,
  turno = null,
  ultimoArqueoEn = null,
  postergadoHasta = null,
  cantidadPostergaciones = 0,
  config = {},
} = {}) {
  const cfg = normalizarConfig(config);
  const t = aFecha(ahora) || new Date(0);

  const base = {
    activo: cfg.arqueoCajaActivo,
    cajaAbierta: false,
    proximaAlerta: null,
    minutosRestantes: null,
    vencido: false,
    minutosDemora: 0,
    cantidadPostergaciones: Math.max(0, Number(cantidadPostergaciones) || 0),
    puedePostergar: false,
    requiereAutorizacion: false,
    config: cfg,
  };

  // Caja cerrada o inexistente: nunca se alerta.
  if (!turno || aFecha(turno.cierre)) return base;
  base.cajaAbierta = true;

  // Función desactivada en este local: el botón manual sigue disponible, pero
  // no hay alerta ni vencimiento.
  if (!cfg.arqueoCajaActivo) return base;

  const programada = proximaAlerta({
    apertura: turno.apertura,
    ultimoArqueoEn,
    intervaloMinutos: cfg.intervaloArqueoMinutos,
  });
  if (!programada) return base;

  // Una postergación vigente corre la alerta hacia adelante, nunca hacia atrás:
  // postergar no puede adelantar un vencimiento ya programado.
  const postergada = aFecha(postergadoHasta);
  const efectiva =
    postergada && postergada.getTime() > programada.getTime() ? postergada : programada;

  const deltaMs = t.getTime() - efectiva.getTime();
  const vencido = deltaMs >= 0;
  const minutosDemora = vencido ? Math.floor(deltaMs / MS_MINUTO) : 0;

  return {
    ...base,
    proximaAlerta: efectiva,
    alertaProgramadaPara: programada,
    minutosRestantes: vencido ? 0 : Math.ceil(-deltaMs / MS_MINUTO),
    vencido,
    minutosDemora,
    // Solo se ofrece postergar una alerta ya vencida: postergar algo que no
    // venció no significa nada.
    puedePostergar: vencido,
    // Pasada la tolerancia, la postergación deja de estar en manos del cajero.
    requiereAutorizacion:
      vencido && cfg.requiereAutorizacionPostergacion && minutosDemora > cfg.toleranciaPostergacionMinutos,
  };
}

/**
 * Hasta cuándo corre una postergación pedida ahora.
 * Se cuenta desde AHORA, no desde el vencimiento original: si no, postergar 10
 * minutos una alerta vencida hace 30 no correría nada.
 */
export function vencimientoPostergacion({ ahora, config = {} } = {}) {
  const cfg = normalizarConfig(config);
  const t = aFecha(ahora) || new Date(0);
  return new Date(t.getTime() + cfg.postergacionCajeroMinutos * MS_MINUTO);
}

/**
 * Métricas del historial de arqueos de un turno.
 *
 * NO existe "diferencia acumulada": sumar las diferencias de cada corte cuenta
 * el mismo faltante una vez por arqueo posterior. Un faltante de $1.000
 * detectado a las 10:47 sigue faltando a las 12:25 y a las 14:03; sumarlos
 * daría $3.000 de un faltante que siempre fue de $1.000.
 */
export function resumenHistorial(arqueos = []) {
  const parciales = arqueos.filter((a) => a?.tipo !== TIPO_FINAL);
  const final = arqueos.find((a) => a?.tipo === TIPO_FINAL) || null;

  let maxAbs = 0;
  let maximaDiferencia = 0;
  let conDiferencia = 0;

  for (const a of arqueos) {
    const d = Number(a?.diferencia) || 0;
    if (Math.round(d * 100) !== 0) conDiferencia += 1;
    if (Math.abs(d) > maxAbs) {
      maxAbs = Math.abs(d);
      maximaDiferencia = d;
    }
  }

  return {
    cantidad: arqueos.length,
    cantidadParciales: parciales.length,
    tieneFinal: !!final,
    diferenciaFinal: final ? Number(final.diferencia) || 0 : null,
    // La diferencia más grande detectada, con su signo. No es una suma.
    maximaDiferencia,
    cantidadConDiferencia: conDiferencia,
  };
}

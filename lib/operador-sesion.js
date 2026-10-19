// lib/operador-sesion.js
//
// ¿SIGUE VALIENDO ESTA SESIÓN DE PIN? Puro, sin imports de servidor: lo usa
// `lib/operador.js` y lo prueban los candados sin base.
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// La sesión de PIN es una cookie firmada que vive 8 horas. Cerrar la caja no la
// invalidaba en el servidor: solo la borraba la pestaña del POS si le llegaba
// la señal del cierre. Con la cookie viva, `requireOperadorDeCaja` abría una
// caja NUEVA a nombre del operador sin que nadie pusiera el PIN. La #951 de
// Mini unidas se abrió a las 00:06 a nombre de Belen, vendió de 00:06 a 00:12
// y no volvió a vender hasta las 08:32.
//
// ── LA REGLA (Emanuel, 2026-10-19) ─────────────────────────────────────────
//
// Cerrar una caja cierra la sesión de PIN de su operador en TODOS los
// dispositivos: el cierre escribe `OperadorLocal.sesionInvalidadaEn` y desde
// ese instante no vale ningún token emitido antes. Para abrir otra caja hay que
// poner el PIN de nuevo. Mientras la caja sigue abierta no cambia nada.
//
// El voucher de las ventas offline NO pasa por acá: prueba que el operador
// estuvo activo, no que lo siga estando, y una venta encolada antes del cierre
// se sigue atribuyendo a quien la cobró.

/**
 * El instante en que se emitió el token, en milisegundos. Los tokens de antes
 * de esta regla no traen `emitidoEn` y se toma su `iat`, que está en segundos.
 */
export function emitidoEnDelToken(data) {
  const ms = Number(data?.emitidoEn);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const iat = Number(data?.iat);
  return Number.isFinite(iat) && iat > 0 ? iat * 1000 : null;
}

/**
 * ¿La sesión emitida en `emitidoEn` sigue valiendo para un operador cuya
 * sesión se invalidó en `sesionInvalidadaEn`? Vale si nunca se invalidó, o si
 * se emitió DESPUÉS. Sin instante de emisión conocido, no vale: falla cerrada.
 */
export function sesionDeOperadorVigente({ emitidoEn, sesionInvalidadaEn }) {
  if (sesionInvalidadaEn == null) return true;
  const corte = new Date(sesionInvalidadaEn).getTime();
  if (!Number.isFinite(corte)) return true;
  if (emitidoEn == null || !Number.isFinite(Number(emitidoEn))) return false;
  return Number(emitidoEn) > corte;
}

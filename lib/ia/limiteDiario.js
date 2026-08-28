// EL TOPE DIARIO DE CONSULTAS A LA IA, DECIDIDO EN UN SOLO LUGAR.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// El plan es de VEINTE consultas por día. No es una estimación: sale del cuerpo
// del 429 que devolvió la API, con `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
// y valor 20.
//
// Veinte alcanzan para trabajar —una importación normal usa una— y no alcanzan
// para nada más. El 2026-08-27 una tanda de mediciones se comió dieciséis de las
// veinte del día, y el importador quedó inservible hasta la medianoche del huso
// de California. Ése es el defecto que esto cierra: que probar, reintentar y
// diagnosticar gasten la cuota real sin que nadie lleve la cuenta.
//
// ── LO QUE SE REUSA, Y LO QUE SE AGREGA ───────────────────────────────────
//
// La ventana del día ya estaba resuelta en
// `lib/compras-proveedor/comprobante/lector/cuota.js`, con el detalle difícil: la
// cuota repone en la medianoche del huso del PROVEEDOR y no en la nuestra, y eso
// se calcula con `Intl` para que no se rompa dos veces por año con el horario de
// verano. Eso se importa, no se vuelve a escribir.
//
// Lo que se agrega es lo que faltaba: **decidir ANTES de llamar**, y hacerlo
// para todos los módulos y no solo para comprobantes.

import { comienzoDelDiaDeCuota, HUSO_POR_DEFECTO } from "@/lib/compras-proveedor/comprobante/lector/cuota";

/** El default. Se puede subir por variable de entorno sin tocar código. */
export const LIMITE_DIARIO_POR_DEFECTO = 20;

/** Lo que se informa cuando no queda cuota. NO es un error del archivo. */
export const MOTIVO_LIMITE = "LIMITE_DIARIO";

export const TEXTO_LIMITE =
  "Se alcanzó el límite diario de consultas de IA. Vas a poder volver a usarla cuando se renueve la cuota. " +
  "Mientras tanto el archivo se puede cargar a mano.";

/**
 * El límite configurado.
 *
 * Un valor inválido —vacío, cero, texto, negativo— cae al default en vez de
 * apagar el control. Un tope de cero dejaría la IA inutilizable sin que nadie
 * entienda por qué, y un tope enorme por un error de tipeo la dejaría sin
 * control: las dos formas de equivocarse se resuelven volviendo al número que
 * sabemos que es verdad.
 */
export function limiteDiario(env = process.env) {
  const crudo = Number(env?.IA_LIMITE_DIARIO);
  if (!Number.isFinite(crudo) || crudo <= 0) return LIMITE_DIARIO_POR_DEFECTO;
  return Math.floor(crudo);
}

/** Desde cuándo se cuenta el día de la cuota. */
export function desdeCuandoSeCuenta(ahora = new Date(), env = process.env) {
  const huso = env?.IA_CUOTA_HUSO || env?.COMPROBANTE_CUOTA_HUSO || HUSO_POR_DEFECTO;
  return { desde: comienzoDelDiaDeCuota(ahora, huso), huso };
}

/**
 * ¿SE PUEDE HACER UNA CONSULTA MÁS?
 *
 * Puro a propósito: lo que cuenta filas está en el adaptador, y esto solo
 * decide. Así se puede ejercer el límite sin base de datos.
 */
export function hayCuota({ usadasHoy = 0, limite = LIMITE_DIARIO_POR_DEFECTO } = {}) {
  const usadas = Number(usadasHoy) || 0;
  return {
    puede: usadas < limite,
    usadas,
    limite,
    quedan: Math.max(0, limite - usadas),
  };
}

/** El texto del contador para la pantalla. Se arma acá para decirlo igual en todas. */
export function textoDeConsumo({ usadas = 0, limite = LIMITE_DIARIO_POR_DEFECTO } = {}) {
  return `IA utilizada hoy: ${usadas} de ${limite}`;
}

/** El aviso previo. Se dice ANTES, no después de haber gastado. */
export const TEXTO_VA_A_CONSUMIR = "Esta acción utilizará 1 consulta de IA.";

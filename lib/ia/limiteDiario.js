// EL TOPE DIARIO DE CONSULTAS A LA IA, DECIDIDO EN UN SOLO LUGAR.
//
// ── POR QUÉ EXISTE, Y QUÉ DEJÓ DE SER ─────────────────────────────────────
//
// NACIÓ COMO EL TOPE DEL PLAN GRATIS. Eran veinte consultas por día, y no era
// una estimación: salía del cuerpo del 429 de la API, con
// `GenerateRequestsPerDayPerProjectPerModel-FreeTier` y valor 20. El 2026-08-27
// una tanda de mediciones se comió dieciséis de esas veinte y el importador
// quedó inservible hasta la medianoche del huso de California.
//
// EL 2026-09-21 EL PROYECTO PASÓ A PAGO —Nivel 1, prepago con saldo— y ese tope
// dejó de ser la regla de Google. Pero el número siguió en el código, y esa
// misma tarde cortó una lectura de una factura real diciendo "se agotó la cuota
// gratuita del día" sin llamar a Google: medido, el contador de filas no se
// movió y la API contestaba 200 al mismo tiempo.
//
// ── QUÉ ES AHORA: UN TOPE DE GASTO, Y POR ESO NO SE SACA ──────────────────
//
// Con plan pago, una lectura que se dispara en bucle —un reintento automático
// mal hecho, una pantalla que llama dos veces— ya no se frena sola contra un
// límite gratuito: gasta plata de verdad, y el que se entera es el resumen de
// la tarjeta. El tope se queda como CUIDADO DEL GASTO, no como copia de la
// regla del proveedor.
//
// Y por eso el número cambia de significado: doscientas por día no es "lo que
// Google deja" sino "más que esto es un error nuestro". Medido contra el uso
// real: el día más pesado de esta semana —el 2026-09-21, con dos facturas
// reales, cinco pedidos de prueba y una jornada entera de reintentos por el
// servicio caído— llegó a 20. Doscientas son diez veces eso; un bucle las pasa
// en minutos.
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

/**
 * El default. Se puede cambiar por `IA_LIMITE_DIARIO` sin tocar código.
 *
 * DOSCIENTAS, y es un tope de gasto propio: ver arriba. No sale de ninguna regla
 * de Google —con plan pago no hay tope de consultas, hay saldo— sino de cuánto
 * uso normal hay: el día más cargado de esta semana fueron 20.
 */
export const LIMITE_DIARIO_POR_DEFECTO = 200;

/** Lo que se informa cuando no queda cuota. NO es un error del archivo. */
export const MOTIVO_LIMITE = "LIMITE_DIARIO";

/**
 * EL TEXTO NO PUEDE DECIR "CUOTA GRATUITA": ESTE TOPE ES NUESTRO.
 *
 * Decirlo confundía dos cosas que se arreglan distinto —esperar a mañana, o
 * subir el tope— y además afirmaba algo falso desde que el proyecto es pago.
 */
export const TEXTO_LIMITE =
  "Se llegó al tope diario de lecturas que tiene el sistema para cuidar el gasto. " +
  "El comprobante quedó subido. Se puede cargar a mano, o pedir que suban el tope.";

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

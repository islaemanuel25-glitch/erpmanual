// lib/finanzas/periodoFinanciero.js
//
// EL PERÍODO DE FINANZAS, Y POR QUÉ NO ES EL DE TRANSFERENCIAS.
//
// ── LA DISTINCIÓN, QUE ES DE NEGOCIO Y NO DE CÓDIGO ──────────────────────
//
// El período de Transferencias sale de `AcuerdoDepositoLocal.diaDeCorte`: es el
// día en que ESE local y el depósito acordaron cortar la cuenta de mercadería.
// Dos locales pueden tener cortes distintos, y eso es correcto allá — la semana
// que se paga es la que se acordó pagar.
//
// Acá la pregunta es otra: qué pasó económicamente en el negocio. Eso no depende
// de ningún acuerdo comercial, y hacerlo depender tendría una consecuencia mala
// de verdad: la semana financiera de un local cambiaría el día que alguien le
// mueve el corte de pago, y un reporte de "la semana pasada" pasaría a cubrir
// otros días sin que nada avise.
//
// Por eso Finanzas fija su corte: **domingo**. Está escrito una vez, acá.
//
// ── LO QUE ESTE MÓDULO NO HACE ES ARITMÉTICA ─────────────────────────────
//
// No hay una sola cuenta de calendario escrita acá. Todo delega en
// `lib/transferencias/periodoDePago.js`, que ya resuelve el corte de semana, el
// largo distinto de cada mes y los años bisiestos, y que es PURO —no toca Prisma
// y no lee `AcuerdoDepositoLocal`—. Pasarle un `diaDeCorte` fijo no lo acopla a
// Transferencias: el acoplamiento sería leer el acuerdo, y acá no se lee.
//
// Escribir "restar 7 días" o "restar 30 días" habría sido la alternativa, y es
// falsa para el mes. Ya está anotado allá.
//
// El precedente de reusar esas primitivas con el corte por defecto sin tocar
// nada de Transferencias es `app/modulos/compras-proveedor/recepcion/page.jsx`,
// que hace lo mismo desde otra pantalla.

import { UNIDADES, rangoDesplazado } from "@/lib/transferencias/periodoDePago";
import { descripcionDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";

/**
 * EL CORTE DE LA SEMANA FINANCIERA: domingo.
 *
 * 0 en la numeración de `Date.getUTCDay()`, que es la que usa `periodoDePago`.
 * Una semana financiera va de domingo 00:00:00 a sábado 23:59:59.999 en hora
 * argentina; las dos puntas que devuelve `rangoDelPeriodo` son las fechas ISO
 * inclusivas, y el borde horario lo pone quien arma la consulta.
 *
 * Es una CONSTANTE y no un parámetro a propósito. El día que Finanzas tenga que
 * cortar en otro día, ese día se cambia acá y cambia en todos lados a la vez.
 */
export const CORTE_SEMANAL_FINANCIERO = 0;

/** Las tres unidades que Finanzas sabe calcular hoy. Son las de `periodoDePago`. */
export const UNIDADES_FINANCIERAS = UNIDADES;

/**
 * "OTRO" — el rango elegido a mano.
 *
 * ESTÁ DECLARADO Y NO IMPLEMENTADO, Y ESA ES LA DECISIÓN. El chip se dibuja
 * apagado y esta constante existe para que la pantalla pueda nombrarlo sin
 * escribir la cadena suelta.
 *
 * ── POR QUÉ NO CAE A SEMANA ──────────────────────────────────────────────
 *
 * Porque un chip que se ve elegido y muestra otro período es peor que un chip
 * apagado: el número de arriba sería el de la semana y el rótulo diría lo que el
 * usuario pidió. Transferencias tiene exactamente esa caída —`useCuentaDeLocal`
 * traduce OTRO a SEMANA antes de consultar— y acá no se copia.
 *
 * Se habilita cuando haya un selector de rango conectado de punta a punta:
 * calendario en la pantalla, `desde`/`hasta` en la URL y en el endpoint. Hoy el
 * endpoint de Finanzas no los acepta, así que habilitar el chip sería prometer
 * algo que no existe.
 */
export const CLAVE_OTRO_FINANZAS = "OTRO";

/**
 * ¿Es una unidad que Finanzas sabe calcular?
 *
 * "OTRO" devuelve `false` a propósito: se reconoce como chip y no como unidad.
 */
export function esUnidadFinanciera(valor) {
  return Object.prototype.hasOwnProperty.call(UNIDADES, String(valor || ""));
}

/**
 * La unidad que se va a usar para calcular, con la de fábrica cuando lo pedido
 * no sirve.
 *
 * NO traduce "OTRO" a "SEMANA" en silencio: lo descarta igual que a cualquier
 * cadena inválida, y la pantalla ya impide elegirlo. Si algún día llega por una
 * URL escrita a mano, cae en SEMANA como cualquier basura — que es distinto de
 * ofrecer el chip y desviarlo.
 */
export function unidadFinanciera(valor) {
  return esUnidadFinanciera(valor) ? String(valor) : UNIDADES.SEMANA;
}

/**
 * EL PERÍODO QUE SE ABRE POR DEFECTO: el EN CURSO, no el anterior.
 *
 * Transferencias abre en `-1` porque su pregunta es cuánto hay que cobrar, y eso
 * se contesta con el período TERMINADO. La pregunta de Finanzas es cómo viene el
 * negocio, y ésa se contesta con el período que está corriendo. Son dos defaults
 * distintos porque son dos preguntas distintas, no por descuido.
 */
export const DESPLAZAMIENTO_POR_DEFECTO = 0;

/**
 * Un tope, para que una URL escrita a mano no pida diez mil períodos atrás.
 * El mismo criterio y el mismo número que el tablero de Transferencias.
 */
export const DESPLAZAMIENTO_MINIMO = -120;

/**
 * El desplazamiento válido: entero, nunca positivo, nunca más allá del tope.
 *
 * ── HACIA ADELANTE SE CORTA EN 0, Y SE CORTA EN EL SERVIDOR ──────────────
 *
 * Un período futuro no tiene ventas por definición, así que la pantalla
 * mostraría siempre cero y quien la mira no tendría cómo saber si es que no hubo
 * movimiento o que se pasó de largo. Apagar la flecha no alcanza: la flecha es
 * una sugerencia y la URL se puede escribir a mano.
 */
export function desplazamientoFinanciero(valor) {
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n)) return DESPLAZAMIENTO_POR_DEFECTO;
  return Math.max(DESPLAZAMIENTO_MINIMO, Math.min(0, n));
}

/**
 * EL RANGO DEL PERÍODO FINANCIERO, en fechas ISO inclusivas.
 *
 * @param {object} args
 * @param {"DIA"|"SEMANA"|"MES"} [args.unidad]
 * @param {number} [args.desplazamiento]  0 = en curso, -1 = el anterior.
 * @param {string} [args.hoy]             ISO `YYYY-MM-DD`; por defecto, hoy en Argentina.
 * @returns {{desde: string, hasta: string}}
 */
export function rangoFinanciero({ unidad, desplazamiento = DESPLAZAMIENTO_POR_DEFECTO, hoy } = {}) {
  return rangoDesplazado({
    unidad: unidadFinanciera(unidad),
    diaDeCorte: CORTE_SEMANAL_FINANCIERO,
    hoy,
    desplazamiento: desplazamientoFinanciero(desplazamiento),
  });
}

/**
 * Cómo se llama el período que se está mirando, con su título y su subtítulo.
 *
 * Sale del MISMO módulo que los de Transferencias, así que un mes se escribe
 * igual en las dos pantallas. Se calcula en el servidor y viaja armado: quien
 * sabe qué período se consultó es el que lo consultó.
 *
 * `rotuloDelImporte` viene de allá —"Para cobrar" / "Va acumulado"— y Finanzas
 * NO lo usa: son rótulos de una cuenta a cobrar y acá no se cobra nada. La
 * pantalla nombra sus propias métricas.
 */
export function descripcionFinanciera({
  unidad,
  desplazamiento = DESPLAZAMIENTO_POR_DEFECTO,
  hoy,
} = {}) {
  return descripcionDelPeriodo({
    unidad: unidadFinanciera(unidad),
    diaDeCorte: CORTE_SEMANAL_FINANCIERO,
    hoy,
    desplazamiento: desplazamientoFinanciero(desplazamiento),
  });
}

/**
 * ¿Se puede avanzar al período siguiente?
 *
 * Solo si no se está ya en el en curso. Se pregunta por el DESPLAZAMIENTO y no
 * por el rango porque acá no hay rangos elegidos a mano: con las tres unidades
 * calculadas, 0 es el en curso por definición.
 */
export function puedeAvanzar(desplazamiento) {
  return desplazamientoFinanciero(desplazamiento) < 0;
}

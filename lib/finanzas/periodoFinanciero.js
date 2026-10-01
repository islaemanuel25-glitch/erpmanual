// lib/finanzas/periodoFinanciero.js
//
// EL PERÍODO DE FINANZAS: DÍA, SEMANA OPERATIVA Y MES.
//
// ── LA SEMANA NO SE DEFINE ACÁ ────────────────────────────────────────────
//
// La semana de Finanzas es la SEMANA OPERATIVA de la ubicación consultada, la
// misma que usa Transferencias: `lib/semanaOperativa/semanaOperativa.js`, que la
// resuelve desde `SemanaOperativaVigencia` con su historia —cambios de corte y
// semana larga incluidos—. Un local que corta miércoles ve de miércoles a
// martes, y la semana de la transición mide lo que mide allá, de 8 a 13 días.
//
// Antes Finanzas fijaba su propio domingo, con el argumento de que la semana de
// Transferencias salía de un acuerdo de pago que podía moverse. Ese acuerdo ya
// no decide nada: la Semana Operativa tiene historia y sus cambios solo rigen
// hacia adelante, así que una semana pasada no cambia de días. Tener dos
// semanas para el mismo local era tener dos respuestas a la misma pregunta.
//
// Una ubicación SIN CONFIGURAR recibe el domingo de siempre, y ese domingo lo
// pone la fuente canónica con `sinConfigurar: true`, no este módulo. Quien
// muestra el período tiene que decirlo: no es una semana configurada en domingo.
//
// ── LO QUE ESTE MÓDULO NO HACE ES ARITMÉTICA ─────────────────────────────
//
// No hay una sola cuenta de calendario escrita acá. La semana la contesta
// `rangoSemanalDeUbicacion`; el día, el mes, el paso de un período al anterior y
// los años bisiestos, `lib/transferencias/periodoDePago.js`, que es PURO.
// Escribir "restar 7 días" o "restar 30 días" habría sido la alternativa, y es
// falsa para el mes y para la semana larga.

import { UNIDADES, rangoDesplazado } from "@/lib/transferencias/periodoDePago";
import { descripcionDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";
import { rangoSemanalDeUbicacion } from "@/lib/semanaOperativa/semanaOperativa";

/**
 * EL DOMINGO DEL CALENDARIO DE PAGOS, y de nada más.
 *
 * El tablero de Finanzas ya NO lo usa: su semana es la de la ubicación. Queda
 * porque `calendarioDePagos.js` todavía agrupa los vencimientos a proveedores
 * en semanas de domingo a sábado. Ese contrato es otro —puede abarcar varios
 * locales, cada uno con su semana— y se migra en su propia tanda.
 */
export const CORTE_SEMANAL_FINANCIERO = 0;

/** Las tres unidades que Finanzas sabe calcular hoy. Son las de `periodoDePago`. */
export const UNIDADES_FINANCIERAS = UNIDADES;

/**
 * LA UNIDAD CON LA QUE ABRE FINANZAS, DEFINIDA UNA SOLA VEZ.
 *
 * Es DÍA: la pregunta de Finanzas es cómo viene el negocio hoy, y la primera
 * respuesta útil es la del día en curso. Lo comparten las cuatro pantallas
 * —Resumen, Pagos a proveedores, Gastos y Pago a depósito—, así que el default
 * vive acá y no copiado en cada parser y cada serializador: cambiarlo en un solo
 * lugar los mueve a todos, y `unidadFinanciera`, `parseContextoFinanzas` y los
 * tres serializadores lo leen de acá. Antes era SEMANA escrito cuatro veces.
 */
export const UNIDAD_FINANCIERA_POR_DEFECTO = UNIDADES.DIA;

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
 * URL escrita a mano, cae en el default —DÍA— como cualquier basura, que es
 * distinto de ofrecer el chip y desviarlo.
 */
export function unidadFinanciera(valor) {
  return esUnidadFinanciera(valor) ? String(valor) : UNIDAD_FINANCIERA_POR_DEFECTO;
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
 * La semana de la ubicación como pregunta "¿qué semana contiene esta fecha?",
 * solo para SEMANA. DIA y MES no dependen de ninguna configuración.
 */
function semanaDeLaUbicacion(unidad, vigencias) {
  return unidad === UNIDADES.SEMANA ? rangoSemanalDeUbicacion(vigencias || []) : null;
}

/**
 * EL RANGO DEL PERÍODO FINANCIERO, en fechas ISO inclusivas.
 *
 * Caminar hacia atrás le pregunta a cada fecha qué semana regía ese día: si la
 * ubicación cambió de corte, las semanas de antes del cambio son las de antes.
 *
 * @param {object} args
 * @param {"DIA"|"SEMANA"|"MES"} [args.unidad]
 * @param {number} [args.desplazamiento]  0 = en curso, -1 = el anterior.
 * @param {string} [args.hoy]             ISO `YYYY-MM-DD`; por defecto, hoy en Argentina.
 * @param {Array}  [args.vigencias]       las de la ubicación consultada, de
 *                                        `vigenciasDeUbicaciones`. Sin ellas, la
 *                                        semana es la de una ubicación sin configurar.
 * @returns {{desde: string, hasta: string}}
 */
export function rangoFinanciero({ unidad, desplazamiento = DESPLAZAMIENTO_POR_DEFECTO, hoy, vigencias = [] } = {}) {
  const u = unidadFinanciera(unidad);
  return rangoDesplazado({
    unidad: u,
    hoy,
    desplazamiento: desplazamientoFinanciero(desplazamiento),
    rangoDeFecha: semanaDeLaUbicacion(u, vigencias),
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
  vigencias = [],
} = {}) {
  const u = unidadFinanciera(unidad);
  return descripcionDelPeriodo({
    unidad: u,
    hoy,
    desplazamiento: desplazamientoFinanciero(desplazamiento),
    rangoDeFecha: semanaDeLaUbicacion(u, vigencias),
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

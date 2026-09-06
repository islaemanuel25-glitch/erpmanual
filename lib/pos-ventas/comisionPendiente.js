// ============================================================
// lib/pos-ventas/comisionPendiente.js
//
// ¿LA PLATA DE ESTA VENTA ESTÁ CERRADA, O FALTA UN DATO?
//
// ── POR QUÉ ESTO EXISTE COMO UN SOLO LUGAR ─────────────────────────────────
//
// Una comisión SIN CONFIGURAR no es una comisión de 0 %. Pero en la base los
// importes derivados —`VentaPago.comision`, `VentaPago.neto`,
// `Venta.comisionBancaria`, `Venta.netoRecibido`, `Venta.gananciaNeta`— son
// columnas numéricas y no nulables, así que un dato desconocido se guarda como
// un cero ESTRUCTURAL. Ese cero es un hueco, no una medición.
//
// Lo que distingue el hueco del cero medido es `Venta.comisionPendiente`. Y esa
// bandera la lee mucha gente: reportes, auditoría, tickets, cierres, el
// dashboard. Repartir un `if (venta.comisionPendiente)` por veinte archivos
// garantiza que el número veintiuno se muestre como cerrado.
//
// Por eso la interpretación vive acá y se consume; los consumidores preguntan,
// no deciden.
//
// ── LO QUE ESTE MÓDULO NO HACE ─────────────────────────────────────────────
//
// No recalcula nada ni corrige ventas viejas. `comisionPendiente` es un
// SNAPSHOT de lo que se sabía al vender: si mañana alguien configura la comisión
// del grupo, las ventas de ayer siguen marcadas como pendientes, porque la plata
// que se cobró ese día se cobró sin ese dato. Corregirlas es un flujo explícito
// de conciliación y no un efecto secundario de tocar una configuración.
//
// Y no toca el efectivo esperado de la caja. Está medido: ese cálculo es
// `inicial + efectivo + ingresos − retiros` y la comisión no participa. Un dato
// de comisión que falta no descuadra un arqueo.
// ============================================================

/** Lo que se muestra en lugar de un número que no se conoce. */
export const TEXTO_PENDIENTE = "Pendiente de configurar";

/** Lo que se le dice a quien mira un total que dejó ventas afuera. */
export const TEXTO_PARCIAL = "Parcial: hay ventas con comisión sin configurar";

/**
 * ¿ESTA VENTA TIENE SU PLATA CERRADA?
 *
 * Es la única pregunta que los consumidores tienen que hacerse.
 *
 * ── FALLA CERRADO, Y ES LA DECISIÓN MÁS IMPORTANTE DEL MÓDULO ─────────────
 *
 * Solo devuelve `true` con un `false` EXPLÍCITO. Un objeto sin el campo no es
 * una venta exacta: es una consulta que no lo trajo.
 *
 * Después de la migración toda fila de `Venta` tiene el booleano —las
 * históricas en `false`, las nuevas en lo que corresponda—, así que un
 * `undefined` no puede venir de la base: viene de un `select` incompleto. Si
 * eso se tratara como exacto, cualquier consulta futura que se olvide del campo
 * presentaría placeholders como mediciones y nadie se enteraría.
 *
 * Fallar cerrado obliga a las consultas financieras a traer la bandera. Es un
 * poco más molesto de escribir y es la única forma de que la omisión no mienta.
 *
 * @param {{ comisionPendiente?: boolean|null }} venta
 * @returns {boolean}
 */
export function comisionEsExacta(venta) {
  return venta?.comisionPendiente === false;
}

/**
 * ¿ALGUNO DE ESTOS TENDERS SE COBRÓ SIN SABER SU COMISIÓN?
 *
 * Es la decisión del momento de VENDER, y por eso mira los tenders y no la
 * venta: un tender que cobra comisión y llega con `comisionPct` en `null` es
 * justamente el caso "el medio cobra comisión pero nadie la configuró".
 *
 * El efectivo no entra: su `comisionPct` es `null` porque no cobra comisión, que
 * es un dato conocido y no un hueco. Por eso hace falta saber QUÉ medios cobran,
 * y se recibe como parámetro en vez de importarlo — así esta pieza no depende de
 * la tabla de medios y se puede ejercer sola.
 *
 * @param {Array<{medio:string, comisionPct:number|null}>} tenders
 * @param {string[]} mediosQueCobranComision
 * @returns {boolean}
 */
export function hayComisionPendiente(tenders = [], mediosQueCobranComision = []) {
  return tenders.some(
    (t) => mediosQueCobranComision.includes(t?.medio) && (t?.comisionPct == null)
  );
}

/**
 * El importe, o el aviso de que todavía no es un importe.
 *
 * @param {number} valor
 * @param {boolean} exacta
 * @param {(n:number)=>string} formatear  Cómo se escribe la plata en ese lugar.
 * @returns {string}
 */
export function importeOPendiente(valor, exacta, formatear) {
  return exacta ? formatear(Number(valor) || 0) : TEXTO_PENDIENTE;
}

/**
 * EL MARGEN DE UNA VENTA, O NADA.
 *
 * `null` cuando no se puede afirmar: o la venta tiene comisión pendiente —y
 * entonces la ganancia neta es un placeholder—, o el neto es cero y la división
 * no significa nada.
 *
 * Devolver un número acá sería el peor caso de todos: un margen calculado sobre
 * una comisión de cero inventada sale MÁS ALTO que el real, así que un ticket
 * que habría que mirar aparecería como sano. El control que existe para
 * encontrar problemas se apagaría solo justo donde falta un dato.
 *
 * @returns {number|null}
 */
export function margenDeVenta(venta) {
  if (!comisionEsExacta(venta)) return null;
  const neto = Number(venta?.netoRecibido) || 0;
  if (neto === 0) return null;
  return ((Number(venta?.gananciaNeta) || 0) / neto) * 100;
}

/**
 * UN TOTAL DE VARIAS VENTAS, DICIENDO SI ESTÁ COMPLETO.
 *
 * Suma lo que hay —los importes existen y sirven para tener una idea— pero
 * devuelve además cuántas ventas aportaron un hueco. Quien lo muestre tiene que
 * rotularlo como parcial; para eso está `parcial`.
 *
 * No se saltean las ventas pendientes: sacarlas del total daría un número más
 * chico y igual de falso, y encima sin avisar.
 *
 * @param {Array} ventas
 * @returns {{ pendientes:number, total:number, parcial:boolean }}
 */
export function resumirExactitud(ventas = []) {
  const pendientes = ventas.filter((v) => !comisionEsExacta(v)).length;
  return estadoFinanciero({ pendientes, total: ventas.length });
}

/**
 * EL ESTADO DE UN AGREGADO, ARMADO DESDE DOS NÚMEROS.
 *
 * Existe para las rutas que no traen las filas y cuentan con la base —un
 * `count` con `comisionPendiente: true` sale mucho más barato que traer miles
 * de ventas—. Devuelve exactamente la misma forma que `resumirExactitud`, así
 * que las pantallas leen una sola estructura sin saber de dónde salió.
 *
 * @param {{pendientes:number, total?:number}} args
 * @returns {{ exacto:boolean, pendientes:number, total:number, parcial:boolean }}
 */
export function estadoFinanciero({ pendientes = 0, total = 0 } = {}) {
  const n = Number(pendientes) || 0;
  return { exacto: n === 0, pendientes: n, total: Number(total) || 0, parcial: n > 0 };
}

/**
 * QUÉ SIGNIFICA CADA TOTAL CUANDO EL CONJUNTO ESTÁ INCOMPLETO.
 *
 * No alcanza con decir "parcial": los tres totales fallan de manera DISTINTA y
 * quien los mira necesita saber en qué dirección.
 *
 *   · La comisión suma solo las conocidas, así que el total real es MAYOR.
 *   · El neto y la ganancia descontaron de menos, así que están SOBREESTIMADOS.
 *
 * Rotularlos a todos igual —"parcial"— dejaría a alguien creyendo que la
 * ganancia podría ser mayor, cuando solo puede ser menor.
 */
export const ROTULO_AGREGADO = {
  comision: "Comisiones conocidas (faltan las de las ventas sin configurar)",
  neto: "Neto parcial: puede ser menor",
  ganancia: "Ganancia parcial: puede ser menor",
  margen: "Margen pendiente",
};

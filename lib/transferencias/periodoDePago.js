// lib/transferencias/periodoDePago.js
//
// EN QUÉ PERÍODO CAE UNA TRANSFERENCIA, Y DÓNDE EMPIEZA ESE PERÍODO.
//
// ── LA REGLA DE NEGOCIO ───────────────────────────────────────────────────
//
// Cada local es independiente —su contabilidad, su mercadería, su ganancia— y le
// paga al depósito por PERÍODO, normalmente semanal. Todas las transferencias a
// un mismo local dentro del período se pagan juntas. Así que la unidad de trabajo
// no es la transferencia: es **local + período**.
//
// ── DÓNDE CORTA LA SEMANA NO ES UNA CONSTANTE ────────────────────────────
//
// Hasta el 2026-09-13 el único corte del repo era el lunes, escrito a mano dentro
// de `SunmiDateRangePicker` —`getFirstDayOfWeekMonday`— para dibujar el
// calendario. Eso está bien para un calendario y no alcanza para esto: acá la
// semana va de domingo a sábado, puede cambiar, y puede ser **distinta por local**
// porque es un acuerdo entre ese local y el depósito.
//
// Por eso `diaDeCorte` es un argumento y no un valor de este módulo. Quién lo
// guarda es `AcuerdoDepositoLocal`; quién lo usa, la pantalla.
//
// ── Y POR ESO "ESTA SEMANA" NO ES UN RANGO, SON VARIOS ───────────────────
//
// Si el depósito corta domingo con un local y lunes con otro, "esta semana" es un
// rango distinto para cada uno. La pantalla del depósito no puede mostrar un solo
// rango arriba: cada bloque muestra el suyo. Este módulo devuelve el rango DE UNA
// relación, y se llama una vez por local.
//
// ── LO QUE ESTE MÓDULO NO DECIDE ─────────────────────────────────────────
//
// No decide qué pasa cuando no hay acuerdo cargado. Eso es una decisión de
// producto —hoy: caer al domingo y decirlo— y vive en quien llama, que es el que
// puede marcar la relación como SIN CONFIGURAR en la pantalla. Acá un
// `diaDeCorte` inválido es un error de programa, no un caso de negocio.

import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

/**
 * Los siete días, con el número que se guarda en `AcuerdoDepositoLocal`.
 *
 * El número es el de `Date.getUTCDay()` —0 domingo … 6 sábado—, que es el mismo
 * que usa JavaScript en todos lados. Elegir otro habría obligado a traducir en
 * cada borde, y una traducción que se olvida en un borde corre la semana entera.
 */
export const DIAS = Object.freeze([
  { valor: 0, nombre: "Domingo" },
  { valor: 1, nombre: "Lunes" },
  { valor: 2, nombre: "Martes" },
  { valor: 3, nombre: "Miércoles" },
  { valor: 4, nombre: "Jueves" },
  { valor: 5, nombre: "Viernes" },
  { valor: 6, nombre: "Sábado" },
]);

/**
 * EL DÍA AL QUE SE CAE CUANDO LA RELACIÓN NO TIENE ACUERDO.
 *
 * No es un default de la base —la tabla no tiene ninguno, a propósito— sino lo
 * que la pantalla muestra para poder mostrar ALGO, junto con la marca de "sin
 * configurar". Las dos cosas van juntas: sin la marca, este domingo se leería
 * como una decisión que nadie tomó.
 */
export const DIA_DE_CORTE_POR_DEFECTO = 0;

export const UNIDADES = Object.freeze({ DIA: "DIA", SEMANA: "SEMANA", MES: "MES" });

/** ¿Es un día de corte que esta tabla admite? 0 a 6, entero. */
export function esDiaDeCorteValido(v) {
  return Number.isInteger(v) && v >= 0 && v <= 6;
}

/** El nombre del día, para la pantalla de configuración. */
export function nombreDelDia(valor) {
  const d = DIAS.find((x) => x.valor === valor);
  return d ? d.nombre : "—";
}

/**
 * "Dom", "Mié" — las tres letras de los chips de la pantalla de corte.
 *
 * Sale de `DIAS` y no de una segunda lista escrita en el componente: son los
 * mismos siete días y con dos listas, el día que alguien corrija un acento en
 * una, la otra queda distinta. Los acentos importan acá: "Mié" y "Sáb" los
 * llevan y "Mie"/"Sab" se leen como un descuido.
 */
export function abreviaturaDelDia(valor) {
  const d = DIAS.find((x) => x.valor === valor);
  return d ? d.nombre.slice(0, 3) : "—";
}

/**
 * Suma días a una fecha ISO `YYYY-MM-DD` sin pasar por husos.
 *
 * ── POR QUÉ NO SE USA `new Date(iso)` Y `setDate` ────────────────────────
 *
 * Porque `new Date("2026-09-13")` es medianoche UTC, y en Argentina eso es el día
 * ANTERIOR a las 21. Sumar días sobre ese objeto y volver a formatear corre la
 * fecha un día en la mitad de los casos, y el síntoma sería una semana que
 * empieza el sábado para algunos locales y el domingo para otros — imposible de
 * reproducir mirando el código.
 *
 * Acá la aritmética se hace en UTC puro sobre una fecha que YA es la argentina, y
 * se vuelve a formatear en UTC. El huso se aplicó una sola vez, al obtener el
 * día de hoy.
 */
function sumarDias(iso, dias) {
  const [a, m, d] = String(iso).split("-").map(Number);
  const t = Date.UTC(a, m - 1, d) + dias * 86400000;
  const f = new Date(t);
  const mm = String(f.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(f.getUTCDate()).padStart(2, "0");
  return `${f.getUTCFullYear()}-${mm}-${dd}`;
}

/** Qué día de la semana es una fecha ISO argentina. 0 domingo … 6 sábado. */
export function diaDeLaSemana(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * EL RANGO DEL PERÍODO EN CURSO PARA UNA RELACIÓN.
 *
 * @param {object} args
 * @param {"DIA"|"SEMANA"|"MES"} args.unidad
 * @param {number} args.diaDeCorte   0–6. Solo lo mira `SEMANA`.
 * @param {string} [args.hoy]        ISO `YYYY-MM-DD`. Por defecto, hoy en Argentina.
 * @returns {{desde: string, hasta: string}} las dos puntas INCLUSIVAS, en ISO.
 *
 * El `hasta` es inclusivo y no el día siguiente: es lo que la pantalla escribe
 * —"13/09 al 19/09"— y lo que `inicioDiaArgentina` / `finDiaArgentina` esperan
 * para armar la consulta. Devolver un fin exclusivo obligaría a restar un día en
 * cada llamador y alcanzaría con que uno se olvide para perder un día de ventas.
 */
export function rangoDelPeriodo({ unidad = UNIDADES.SEMANA, diaDeCorte = DIA_DE_CORTE_POR_DEFECTO, hoy } = {}) {
  const base = hoy || hoyArgentinaISO();

  if (unidad === UNIDADES.DIA) return { desde: base, hasta: base };

  if (unidad === UNIDADES.MES) {
    const [a, m] = base.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` };
  }

  // SEMANA. Cuántos días hay que retroceder para llegar al día de corte: la resta
  // en módulo 7 evita el `if` de "si todavía no pasó, restá una semana", que es
  // donde este cálculo se escribe mal.
  const corte = esDiaDeCorteValido(diaDeCorte) ? diaDeCorte : DIA_DE_CORTE_POR_DEFECTO;
  const atras = (diaDeLaSemana(base) - corte + 7) % 7;
  const desde = sumarDias(base, -atras);
  return { desde, hasta: sumarDias(desde, 6) };
}

/**
 * El rango en texto, como lo escribe la pantalla debajo de los chips.
 *
 * Sale de las mismas dos puntas, así que no puede decir un rango distinto del que
 * se consultó — que es el defecto que tendría escribirlo en el componente.
 */
export function rotuloDelRango({ desde, hasta } = {}) {
  if (!desde || !hasta) return "—";
  const corto = (iso) => {
    const [, m, d] = String(iso).split("-");
    return `${d}/${m}`;
  };
  if (desde === hasta) return corto(desde);
  return `${corto(desde)} al ${corto(hasta)}`;
}

/**
 * ¿Esta fecha cae en el período? Para decidir qué transferencias entran.
 *
 * Se compara en ISO y no con `Date`: dos cadenas `YYYY-MM-DD` se ordenan
 * lexicográficamente igual que las fechas que representan, y así la comparación
 * no vuelve a pasar por un huso que ya se aplicó.
 */
export function caeEnElPeriodo(fecha, { desde, hasta } = {}) {
  if (!fecha || !desde || !hasta) return false;
  const iso = typeof fecha === "string" && fecha.length === 10 ? fecha : fechaArgentinaISO(fecha);
  return iso >= desde && iso <= hasta;
}
